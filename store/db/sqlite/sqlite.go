package sqlite

import (
	"context"
	"database/sql"
	"time"

	"github.com/pkg/errors"

	// Note: modernc.org/sqlite driver is imported in functions.go where
	// RegisterScalarFunction is used. No blank import needed here.

	"github.com/usememos/memos/internal/profile"
	"github.com/usememos/memos/store"
)

type DB struct {
	db      *sql.DB
	profile *profile.Profile
}

// NewDB opens a database specified by its database driver name and a
// driver-specific data source name, usually consisting of at least a
// database name and connection information.
func NewDB(profile *profile.Profile) (store.Driver, error) {
	// Ensure a DSN is set before attempting to open the database.
	if profile.DSN == "" {
		return nil, errors.New("dsn required")
	}

	if err := ensureUnicodeLowerRegistered(); err != nil {
		return nil, errors.Wrap(err, "failed to register sqlite unicode lower function")
	}

	// Connect to the database with some sane settings:
	// - No shared-cache: it's obsolete; WAL journal mode is a better solution.
	// - No foreign key constraints: it's currently disabled by default, but it's a
	// good practice to be explicit and prevent future surprises on SQLite upgrades.
	// - Journal mode set to WAL: it's the recommended journal mode for most applications
	// as it prevents locking issues.
	// - synchronous=NORMAL: safe with WAL mode (data is durable after each WAL write),
	// significantly faster than the default FULL mode.
	// - cache_size=-32000: 32 MB page cache per connection, reduces repeated disk reads.
	// - temp_store=MEMORY: keep temporary tables/indexes in RAM rather than in temp files.
	// - mmap_size=268435456: 256 MB memory-mapped I/O window; speeds up large-blob reads
	// (the OS maps DB pages directly, bypassing the usual read() syscall overhead).
	// Safe on 64-bit systems; SQLite's documentation recommends enabling it on WAL databases.
	//
	// Notes:
	// - When using the `modernc.org/sqlite` driver, each pragma must be prefixed with `_pragma=`.
	//
	// References:
	// - https://pkg.go.dev/modernc.org/sqlite#Driver.Open
	// - https://www.sqlite.org/sharedcache.html
	// - https://www.sqlite.org/pragma.html
	sqliteDB, err := sql.Open("sqlite", profile.DSN+
		"?_pragma=foreign_keys(0)"+
		"&_pragma=busy_timeout(10000)"+
		"&_pragma=journal_mode(WAL)"+
		"&_pragma=synchronous(NORMAL)"+
		"&_pragma=cache_size(-32000)"+
		"&_pragma=temp_store(MEMORY)"+
		"&_pragma=mmap_size(268435456)")
	if err != nil {
		return nil, errors.Wrapf(err, "failed to open db with dsn: %s", profile.DSN)
	}

	// SQLite supports multiple concurrent readers with WAL mode, but only one writer at a
	// time. Keeping the pool modest prevents connection storms and reduces lock contention.
	// busy_timeout handles transient write conflicts without returning an error immediately.
	sqliteDB.SetMaxOpenConns(16)
	sqliteDB.SetMaxIdleConns(4)
	sqliteDB.SetConnMaxLifetime(time.Hour)
	sqliteDB.SetConnMaxIdleTime(10 * time.Minute)

	driver := DB{db: sqliteDB, profile: profile}

	return &driver, nil
}

func (d *DB) GetDB() *sql.DB {
	return d.db
}

func (d *DB) Close() error {
	return d.db.Close()
}

func (d *DB) IsInitialized(ctx context.Context) (bool, error) {
	// Check if the database is initialized by checking if the memo table exists.
	var exists bool
	err := d.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='memo')").Scan(&exists)
	if err != nil {
		return false, errors.Wrap(err, "failed to check if database is initialized")
	}
	return exists, nil
}
