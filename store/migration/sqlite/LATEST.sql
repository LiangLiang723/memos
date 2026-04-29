-- system_setting
CREATE TABLE system_setting (
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE(name)
);

-- user
CREATE TABLE user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'USER',
  email TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);

-- user_setting
CREATE TABLE user_setting (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(user_id, key)
);

-- memo
CREATE TABLE memo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  row_status TEXT NOT NULL CHECK (row_status IN ('NORMAL', 'ARCHIVED')) DEFAULT 'NORMAL',
  content TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('PUBLIC', 'PROTECTED', 'PRIVATE')) DEFAULT 'PRIVATE',
  pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)) DEFAULT 0,
  payload TEXT NOT NULL DEFAULT '{}'
);

-- memo_relation
CREATE TABLE memo_relation (
  memo_id INTEGER NOT NULL,
  related_memo_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  UNIQUE(memo_id, related_memo_id, type)
);

-- attachment
CREATE TABLE attachment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  filename TEXT NOT NULL DEFAULT '',
  blob BLOB DEFAULT NULL,
  type TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  memo_id INTEGER,
  storage_type TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}'
);

-- activity
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  type TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')) DEFAULT 'INFO',
  payload TEXT NOT NULL DEFAULT '{}'
);

-- idp
CREATE TABLE idp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  identifier_filter TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}'
);

-- inbox
CREATE TABLE inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '{}'
);

-- reaction
CREATE TABLE reaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  creator_id INTEGER NOT NULL,
  content_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  UNIQUE(creator_id, content_id, reaction_type)
);

-- Performance indexes
-- memo: cover the most common query patterns (list by user, filter by status/visibility, sort by time)
CREATE INDEX IF NOT EXISTS `idx_memo_creator_id`  ON `memo` (`creator_id`);
CREATE INDEX IF NOT EXISTS `idx_memo_row_status`  ON `memo` (`row_status`);
CREATE INDEX IF NOT EXISTS `idx_memo_created_ts`  ON `memo` (`created_ts` DESC);
CREATE INDEX IF NOT EXISTS `idx_memo_updated_ts`  ON `memo` (`updated_ts` DESC);
CREATE INDEX IF NOT EXISTS `idx_memo_visibility`  ON `memo` (`visibility`);
-- composite: single-user timeline (the hot path for private memo feeds)
CREATE INDEX IF NOT EXISTS `idx_memo_creator_status_ts` ON `memo` (`creator_id`, `row_status`, `created_ts` DESC);

-- memo_relation: referenced in every ListMemos JOIN
CREATE INDEX IF NOT EXISTS `idx_memo_relation_memo_id`         ON `memo_relation` (`memo_id`);
CREATE INDEX IF NOT EXISTS `idx_memo_relation_related_memo_id` ON `memo_relation` (`related_memo_id`);

-- attachment
CREATE INDEX IF NOT EXISTS `idx_attachment_creator_id` ON `attachment` (`creator_id`);
CREATE INDEX IF NOT EXISTS `idx_attachment_memo_id`    ON `attachment` (`memo_id`);

-- activity: used by the activity-calendar heatmap
CREATE INDEX IF NOT EXISTS `idx_activity_creator_id` ON `activity` (`creator_id`);
CREATE INDEX IF NOT EXISTS `idx_activity_created_ts` ON `activity` (`created_ts`);

-- reaction: looked up by content_id on every memo detail page
CREATE INDEX IF NOT EXISTS `idx_reaction_content_id`  ON `reaction` (`content_id`);
CREATE INDEX IF NOT EXISTS `idx_reaction_creator_id`  ON `reaction` (`creator_id`);

-- inbox
CREATE INDEX IF NOT EXISTS `idx_inbox_receiver_id` ON `inbox` (`receiver_id`);
CREATE INDEX IF NOT EXISTS `idx_inbox_sender_id`   ON `inbox` (`sender_id`);
