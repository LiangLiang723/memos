package v1

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

const attachmentMigrationBatchSize = 10

// GetInstanceProfile returns the instance profile.
func (s *APIV1Service) GetInstanceProfile(ctx context.Context, _ *v1pb.GetInstanceProfileRequest) (*v1pb.InstanceProfile, error) {
	admin, err := s.GetInstanceAdmin(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get instance admin: %v", err)
	}

	instanceProfile := &v1pb.InstanceProfile{
		Version:     s.Profile.Version,
		Demo:        s.Profile.Demo,
		InstanceUrl: s.Profile.InstanceURL,
		Admin:       admin, // nil when not initialized
	}
	return instanceProfile, nil
}

func (s *APIV1Service) GetInstanceSetting(ctx context.Context, request *v1pb.GetInstanceSettingRequest) (*v1pb.InstanceSetting, error) {
	instanceSettingKeyString, err := ExtractInstanceSettingKeyFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid instance setting name: %v", err)
	}

	instanceSettingKey := storepb.InstanceSettingKey(storepb.InstanceSettingKey_value[instanceSettingKeyString])
	// Get instance setting from store with default value.
	switch instanceSettingKey {
	case storepb.InstanceSettingKey_BASIC:
		_, err = s.Store.GetInstanceBasicSetting(ctx)
	case storepb.InstanceSettingKey_GENERAL:
		_, err = s.Store.GetInstanceGeneralSetting(ctx)
	case storepb.InstanceSettingKey_MEMO_RELATED:
		_, err = s.Store.GetInstanceMemoRelatedSetting(ctx)
	case storepb.InstanceSettingKey_STORAGE:
		_, err = s.Store.GetInstanceStorageSetting(ctx)
	default:
		return nil, status.Errorf(codes.InvalidArgument, "unsupported instance setting key: %v", instanceSettingKey)
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get instance setting: %v", err)
	}

	instanceSetting, err := s.Store.GetInstanceSetting(ctx, &store.FindInstanceSetting{
		Name: instanceSettingKey.String(),
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get instance setting: %v", err)
	}
	if instanceSetting == nil {
		return nil, status.Errorf(codes.NotFound, "instance setting not found")
	}

	// For storage setting, only admin can get it.
	if instanceSetting.Key == storepb.InstanceSettingKey_STORAGE {
		user, err := s.fetchCurrentUser(ctx)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
		}
		if user == nil {
			return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
		}
		if user.Role != store.RoleAdmin {
			return nil, status.Errorf(codes.PermissionDenied, "permission denied")
		}
	}

	return convertInstanceSettingFromStore(instanceSetting), nil
}

func (s *APIV1Service) UpdateInstanceSetting(ctx context.Context, request *v1pb.UpdateInstanceSettingRequest) (*v1pb.InstanceSetting, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if user.Role != store.RoleAdmin {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}

	// TODO: Apply update_mask if specified
	_ = request.UpdateMask

	updateSetting := convertInstanceSettingToStore(request.Setting)
	instanceSetting, err := s.Store.UpsertInstanceSetting(ctx, updateSetting)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to upsert instance setting: %v", err)
	}

	return convertInstanceSettingFromStore(instanceSetting), nil
}

// MigrateDatabaseAttachmentsToLocal migrates database-backed image attachments to local storage.
func (s *APIV1Service) MigrateDatabaseAttachmentsToLocal(ctx context.Context, request *v1pb.MigrateDatabaseAttachmentsToLocalRequest) (*v1pb.MigrateDatabaseAttachmentsToLocalResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if user.Role != store.RoleAdmin {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}

	instanceStorageSetting, err := s.Store.GetInstanceStorageSetting(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get instance storage setting: %v", err)
	}
	if instanceStorageSetting.StorageType != storepb.InstanceStorageSetting_LOCAL {
		return nil, status.Errorf(codes.FailedPrecondition, "storage type must be local before migrating attachments")
	}
	if instanceStorageSetting.FilepathTemplate == "" {
		return nil, status.Errorf(codes.FailedPrecondition, "local filepath template is required")
	}

	databaseStorageType := storepb.AttachmentStorageType_ATTACHMENT_STORAGE_TYPE_UNSPECIFIED
	total, err := s.countAttachments(ctx, databaseStorageType)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to count database attachments: %v", err)
	}

	response := &v1pb.MigrateDatabaseAttachmentsToLocalResponse{
		Total: total,
	}
	limit := normalizeAttachmentMigrationBatchSize(request.BatchSize)
	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{
		GetBlob:     true,
		StorageType: &databaseStorageType,
		Limit:       &limit,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list database attachments: %v", err)
	}

	for _, attachment := range attachments {
		if len(attachment.Blob) == 0 {
			// Skip attachments with empty blobs rather than failing the whole batch.
			continue
		}
		if err := s.migrateDatabaseAttachmentToLocal(ctx, attachment, instanceStorageSetting.FilepathTemplate); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to migrate attachment %s: %v", attachment.UID, err)
		}
		response.Migrated++
	}
	response.Message = fmt.Sprintf("Migrated %d of %d database attachments to local storage.", response.Migrated, response.Total)
	return response, nil
}

// MigrateLocalAttachmentsToDatabase migrates local image attachments back to database storage.
func (s *APIV1Service) MigrateLocalAttachmentsToDatabase(ctx context.Context, request *v1pb.MigrateLocalAttachmentsToDatabaseRequest) (*v1pb.MigrateLocalAttachmentsToDatabaseResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if user.Role != store.RoleAdmin {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}

	instanceStorageSetting, err := s.Store.GetInstanceStorageSetting(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get instance storage setting: %v", err)
	}
	if instanceStorageSetting.StorageType != storepb.InstanceStorageSetting_DATABASE {
		return nil, status.Errorf(codes.FailedPrecondition, "storage type must be database before migrating attachments")
	}

	localStorageType := storepb.AttachmentStorageType_LOCAL
	total, err := s.countAttachments(ctx, localStorageType)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to count local attachments: %v", err)
	}

	response := &v1pb.MigrateLocalAttachmentsToDatabaseResponse{
		Total: total,
	}
	limit := normalizeAttachmentMigrationBatchSize(request.BatchSize)
	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{
		StorageType: &localStorageType,
		Limit:       &limit,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list local attachments: %v", err)
	}

	for _, attachment := range attachments {
		if attachment.Reference == "" {
			return nil, status.Errorf(codes.FailedPrecondition, "attachment %s has no local file reference to migrate", attachment.UID)
		}
		if err := s.migrateLocalAttachmentToDatabase(ctx, attachment); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to migrate attachment %s: %v", attachment.UID, err)
		}
		response.Migrated++
	}
	response.Message = fmt.Sprintf("Migrated %d of %d local attachments to database storage.", response.Migrated, response.Total)
	return response, nil
}

func normalizeAttachmentMigrationBatchSize(batchSize int32) int {
	if batchSize <= 0 {
		return attachmentMigrationBatchSize
	}
	if batchSize > 100 {
		return 100
	}
	return int(batchSize)
}

func (s *APIV1Service) countAttachments(ctx context.Context, storageType storepb.AttachmentStorageType) (int32, error) {
	total := int32(0)
	limit := 100
	offset := 0
	for {
		attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{
			StorageType: &storageType,
			Limit:       &limit,
			Offset:      &offset,
		})
		if err != nil {
			return 0, err
		}
		if len(attachments) == 0 {
			return total, nil
		}
		total += int32(len(attachments))
		if len(attachments) < limit {
			return total, nil
		}
		offset += len(attachments)
	}
}

func (s *APIV1Service) migrateDatabaseAttachmentToLocal(ctx context.Context, attachment *store.Attachment, filepathTemplate string) error {
	internalPath := buildMigrationAttachmentPath(filepathTemplate, attachment)

	osPath := filepath.FromSlash(internalPath)
	if !filepath.IsAbs(osPath) {
		osPath = filepath.Join(s.Profile.Data, osPath)
	}

	// If the target path already exists on disk (another attachment was already migrated
	// to this path because both have the same filename), generate a unique path using
	// a timestamp to prevent sharing a physical file between two records.
	// Sharing a file causes data loss: deleting either attachment would remove the shared
	// file, silently breaking the other attachment's reference.
	if _, err := os.Stat(osPath); err == nil {
		ext := filepath.Ext(attachment.Filename)
		base := strings.TrimSuffix(attachment.Filename, ext)
		uniqueFilename := base + "_" + time.Now().Format("20060102150405") + ext
		lastSlash := strings.LastIndex(internalPath, "/")
		if lastSlash >= 0 {
			internalPath = internalPath[:lastSlash+1] + uniqueFilename
		} else {
			internalPath = uniqueFilename
		}
		osPath = filepath.FromSlash(internalPath)
		if !filepath.IsAbs(osPath) {
			osPath = filepath.Join(s.Profile.Data, osPath)
		}
	}

	created, err := writeAttachmentBlobForMigration(osPath, attachment.Blob)
	if err != nil {
		return err
	}

	emptyBlob := []byte{}
	localStorageType := storepb.AttachmentStorageType_LOCAL
	emptyPayload := &storepb.AttachmentPayload{}
	now := time.Now().Unix()
	if err := s.Store.UpdateAttachment(ctx, &store.UpdateAttachment{
		ID:          attachment.ID,
		UpdatedTs:   &now,
		Blob:        &emptyBlob,
		StorageType: &localStorageType,
		Reference:   &internalPath,
		Payload:     emptyPayload,
	}); err != nil {
		if created {
			if removeErr := os.Remove(osPath); removeErr != nil && !os.IsNotExist(removeErr) {
				return errors.Wrapf(err, "failed to update attachment record and rollback local file: %v", removeErr)
			}
		}
		return errors.Wrap(err, "failed to update attachment record")
	}
	return nil
}

func buildMigrationAttachmentPath(filepathTemplate string, attachment *store.Attachment) string {
	internalPath := filepathTemplate
	if !strings.Contains(internalPath, "{filename}") {
		internalPath = filepath.Join(internalPath, "{filename}")
	}
	t := time.Unix(attachment.CreatedTs, 0)
	internalPath = fileKeyPattern.ReplaceAllStringFunc(internalPath, func(s string) string {
		switch s {
		case "{filename}":
			return attachment.Filename
		case "{timestamp}":
			return fmt.Sprintf("%d", t.Unix())
		case "{year}":
			return fmt.Sprintf("%d", t.Year())
		case "{month}":
			return fmt.Sprintf("%02d", t.Month())
		case "{day}":
			return fmt.Sprintf("%02d", t.Day())
		case "{hour}":
			return fmt.Sprintf("%02d", t.Hour())
		case "{minute}":
			return fmt.Sprintf("%02d", t.Minute())
		case "{second}":
			return fmt.Sprintf("%02d", t.Second())
		case "{uuid}":
			return attachment.UID
		default:
			return s
		}
	})
	return filepath.ToSlash(internalPath)
}

func (s *APIV1Service) migrateLocalAttachmentToDatabase(ctx context.Context, attachment *store.Attachment) error {
	osPath := filepath.FromSlash(attachment.Reference)
	if !filepath.IsAbs(osPath) {
		osPath = filepath.Join(s.Profile.Data, osPath)
	}
	blob, err := os.ReadFile(osPath)
	if err != nil {
		return describeLocalStorageError(err, "read local attachment file")
	}
	if len(blob) == 0 {
		return errors.Errorf("local attachment file is empty: %s", osPath)
	}

	emptyReference := ""
	databaseStorageType := storepb.AttachmentStorageType_ATTACHMENT_STORAGE_TYPE_UNSPECIFIED
	emptyPayload := &storepb.AttachmentPayload{}
	now := time.Now().Unix()
	if err := s.Store.UpdateAttachment(ctx, &store.UpdateAttachment{
		ID:          attachment.ID,
		UpdatedTs:   &now,
		Blob:        &blob,
		StorageType: &databaseStorageType,
		Reference:   &emptyReference,
		Payload:     emptyPayload,
	}); err != nil {
		return errors.Wrap(err, "failed to update attachment record")
	}

	if err := os.Remove(osPath); err != nil && !os.IsNotExist(err) {
		if rollbackErr := s.rollbackLocalAttachmentMigration(ctx, attachment); rollbackErr != nil {
			return errors.Wrapf(err, "failed to delete local file after database migration and rollback failed: %v", rollbackErr)
		}
		return describeLocalStorageError(err, "delete migrated local attachment file")
	}
	return nil
}

func (s *APIV1Service) rollbackLocalAttachmentMigration(ctx context.Context, attachment *store.Attachment) error {
	emptyBlob := []byte{}
	localStorageType := storepb.AttachmentStorageType_LOCAL
	emptyPayload := &storepb.AttachmentPayload{}
	now := time.Now().Unix()
	return s.Store.UpdateAttachment(ctx, &store.UpdateAttachment{
		ID:          attachment.ID,
		UpdatedTs:   &now,
		Blob:        &emptyBlob,
		StorageType: &localStorageType,
		Reference:   &attachment.Reference,
		Payload:     emptyPayload,
	})
}

func writeAttachmentBlobForMigration(path string, blob []byte) (bool, error) {
	if err := os.MkdirAll(filepath.Dir(path), os.ModePerm); err != nil {
		return false, describeLocalStorageError(err, "create target directory")
	}
	if existing, err := os.ReadFile(path); err == nil {
		if bytes.Equal(existing, blob) {
			return false, nil
		}
		return false, errors.Errorf("target file already exists with different content: %s", path)
	} else if !os.IsNotExist(err) {
		return false, describeLocalStorageError(err, "check target file")
	}

	tmpFile, err := os.CreateTemp(filepath.Dir(path), ".memos-migration-*")
	if err != nil {
		return false, describeLocalStorageError(err, "create temporary file")
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)
	if _, err := tmpFile.Write(blob); err != nil {
		_ = tmpFile.Close()
		return false, describeLocalStorageError(err, "write temporary file")
	}
	if err := tmpFile.Close(); err != nil {
		return false, describeLocalStorageError(err, "close temporary file")
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return false, describeLocalStorageError(err, "move temporary file into place")
	}
	return true, nil
}

func describeLocalStorageError(err error, operation string) error {
	if os.IsPermission(err) {
		return errors.Wrap(err, operation+" failed because the server does not have permission to write the local storage path")
	}
	if errors.Is(err, syscall.ENOSPC) {
		return errors.Wrap(err, operation+" failed because the disk is full")
	}
	return errors.Wrap(err, operation+" failed")
}

// VacuumDatabase reclaims unused SQLite disk space after attachment migration.
func (s *APIV1Service) VacuumDatabase(ctx context.Context, _ *v1pb.VacuumDatabaseRequest) (*v1pb.VacuumDatabaseResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if user.Role != store.RoleAdmin {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}
	if err := s.compactDatabaseAfterAttachmentMigration(ctx); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to vacuum database: %v", err)
	}
	return &v1pb.VacuumDatabaseResponse{
		Message: "Database vacuumed successfully.",
	}, nil
}

func (s *APIV1Service) compactDatabaseAfterAttachmentMigration(ctx context.Context) error {
	if s.Profile.Driver != "sqlite" {
		return nil
	}
	db := s.Store.GetDriver().GetDB()
	// Temporarily reduce the connection pool to a single connection so that
	// VACUUM can acquire exclusive access and the subsequent WAL checkpoint
	// can truncate the file. Restore the original limits afterwards.
	origMax := db.Stats().MaxOpenConnections
	db.SetMaxOpenConns(1)
	defer db.SetMaxOpenConns(origMax)
	if _, err := db.ExecContext(ctx, "VACUUM"); err != nil {
		return errors.Wrap(err, "failed to vacuum sqlite database")
	}
	if _, err := db.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		return errors.Wrap(err, "failed to truncate sqlite WAL")
	}
	return nil
}

func convertInstanceSettingFromStore(setting *storepb.InstanceSetting) *v1pb.InstanceSetting {
	instanceSetting := &v1pb.InstanceSetting{
		Name: fmt.Sprintf("instance/settings/%s", setting.Key.String()),
	}
	switch setting.Value.(type) {
	case *storepb.InstanceSetting_GeneralSetting:
		instanceSetting.Value = &v1pb.InstanceSetting_GeneralSetting_{
			GeneralSetting: convertInstanceGeneralSettingFromStore(setting.GetGeneralSetting()),
		}
	case *storepb.InstanceSetting_StorageSetting:
		instanceSetting.Value = &v1pb.InstanceSetting_StorageSetting_{
			StorageSetting: convertInstanceStorageSettingFromStore(setting.GetStorageSetting()),
		}
	case *storepb.InstanceSetting_MemoRelatedSetting:
		instanceSetting.Value = &v1pb.InstanceSetting_MemoRelatedSetting_{
			MemoRelatedSetting: convertInstanceMemoRelatedSettingFromStore(setting.GetMemoRelatedSetting()),
		}
	default:
		// Leave Value unset for unsupported setting variants.
	}
	return instanceSetting
}

func convertInstanceSettingToStore(setting *v1pb.InstanceSetting) *storepb.InstanceSetting {
	settingKeyString, _ := ExtractInstanceSettingKeyFromName(setting.Name)
	instanceSetting := &storepb.InstanceSetting{
		Key: storepb.InstanceSettingKey(storepb.InstanceSettingKey_value[settingKeyString]),
		Value: &storepb.InstanceSetting_GeneralSetting{
			GeneralSetting: convertInstanceGeneralSettingToStore(setting.GetGeneralSetting()),
		},
	}
	switch instanceSetting.Key {
	case storepb.InstanceSettingKey_GENERAL:
		instanceSetting.Value = &storepb.InstanceSetting_GeneralSetting{
			GeneralSetting: convertInstanceGeneralSettingToStore(setting.GetGeneralSetting()),
		}
	case storepb.InstanceSettingKey_STORAGE:
		instanceSetting.Value = &storepb.InstanceSetting_StorageSetting{
			StorageSetting: convertInstanceStorageSettingToStore(setting.GetStorageSetting()),
		}
	case storepb.InstanceSettingKey_MEMO_RELATED:
		instanceSetting.Value = &storepb.InstanceSetting_MemoRelatedSetting{
			MemoRelatedSetting: convertInstanceMemoRelatedSettingToStore(setting.GetMemoRelatedSetting()),
		}
	default:
		// Keep the default GeneralSetting value
	}
	return instanceSetting
}

func convertInstanceGeneralSettingFromStore(setting *storepb.InstanceGeneralSetting) *v1pb.InstanceSetting_GeneralSetting {
	if setting == nil {
		return nil
	}

	generalSetting := &v1pb.InstanceSetting_GeneralSetting{
		DisallowUserRegistration: setting.DisallowUserRegistration,
		DisallowPasswordAuth:     setting.DisallowPasswordAuth,
		AdditionalScript:         setting.AdditionalScript,
		AdditionalStyle:          setting.AdditionalStyle,
		WeekStartDayOffset:       setting.WeekStartDayOffset,
		DisallowChangeUsername:   setting.DisallowChangeUsername,
		DisallowChangeNickname:   setting.DisallowChangeNickname,
	}
	if setting.CustomProfile != nil {
		generalSetting.CustomProfile = &v1pb.InstanceSetting_GeneralSetting_CustomProfile{
			Title:       setting.CustomProfile.Title,
			Description: setting.CustomProfile.Description,
			LogoUrl:     setting.CustomProfile.LogoUrl,
		}
	}
	return generalSetting
}

func convertInstanceGeneralSettingToStore(setting *v1pb.InstanceSetting_GeneralSetting) *storepb.InstanceGeneralSetting {
	if setting == nil {
		return nil
	}
	generalSetting := &storepb.InstanceGeneralSetting{
		DisallowUserRegistration: setting.DisallowUserRegistration,
		DisallowPasswordAuth:     setting.DisallowPasswordAuth,
		AdditionalScript:         setting.AdditionalScript,
		AdditionalStyle:          setting.AdditionalStyle,
		WeekStartDayOffset:       setting.WeekStartDayOffset,
		DisallowChangeUsername:   setting.DisallowChangeUsername,
		DisallowChangeNickname:   setting.DisallowChangeNickname,
	}
	if setting.CustomProfile != nil {
		generalSetting.CustomProfile = &storepb.InstanceCustomProfile{
			Title:       setting.CustomProfile.Title,
			Description: setting.CustomProfile.Description,
			LogoUrl:     setting.CustomProfile.LogoUrl,
		}
	}
	return generalSetting
}

func convertInstanceStorageSettingFromStore(settingpb *storepb.InstanceStorageSetting) *v1pb.InstanceSetting_StorageSetting {
	if settingpb == nil {
		return nil
	}
	setting := &v1pb.InstanceSetting_StorageSetting{
		StorageType:       v1pb.InstanceSetting_StorageSetting_StorageType(settingpb.StorageType),
		FilepathTemplate:  settingpb.FilepathTemplate,
		UploadSizeLimitMb: settingpb.UploadSizeLimitMb,
	}
	if settingpb.S3Config != nil {
		setting.S3Config = &v1pb.InstanceSetting_StorageSetting_S3Config{
			AccessKeyId:     settingpb.S3Config.AccessKeyId,
			AccessKeySecret: settingpb.S3Config.AccessKeySecret,
			Endpoint:        settingpb.S3Config.Endpoint,
			Region:          settingpb.S3Config.Region,
			Bucket:          settingpb.S3Config.Bucket,
			UsePathStyle:    settingpb.S3Config.UsePathStyle,
		}
	}
	return setting
}

func convertInstanceStorageSettingToStore(setting *v1pb.InstanceSetting_StorageSetting) *storepb.InstanceStorageSetting {
	if setting == nil {
		return nil
	}
	settingpb := &storepb.InstanceStorageSetting{
		StorageType:       storepb.InstanceStorageSetting_StorageType(setting.StorageType),
		FilepathTemplate:  setting.FilepathTemplate,
		UploadSizeLimitMb: setting.UploadSizeLimitMb,
	}
	if setting.S3Config != nil {
		settingpb.S3Config = &storepb.StorageS3Config{
			AccessKeyId:     setting.S3Config.AccessKeyId,
			AccessKeySecret: setting.S3Config.AccessKeySecret,
			Endpoint:        setting.S3Config.Endpoint,
			Region:          setting.S3Config.Region,
			Bucket:          setting.S3Config.Bucket,
			UsePathStyle:    setting.S3Config.UsePathStyle,
		}
	}
	return settingpb
}

func convertInstanceMemoRelatedSettingFromStore(setting *storepb.InstanceMemoRelatedSetting) *v1pb.InstanceSetting_MemoRelatedSetting {
	if setting == nil {
		return nil
	}
	memoRelatedSetting := &v1pb.InstanceSetting_MemoRelatedSetting{
		DisallowPublicVisibility: setting.DisallowPublicVisibility,
		DisplayWithUpdateTime:    setting.DisplayWithUpdateTime,
		ContentLengthLimit:       setting.ContentLengthLimit,
		EnableDoubleClickEdit:    setting.EnableDoubleClickEdit,
		Reactions:                setting.Reactions,
	}
	if setting.MapSetting != nil {
		memoRelatedSetting.MapSetting = &v1pb.InstanceSetting_MemoRelatedSetting_MapSetting{
			Provider:        v1pb.InstanceSetting_MemoRelatedSetting_MapSetting_MapProvider(setting.MapSetting.Provider),
			AmapApiKey:      setting.MapSetting.AmapApiKey,
			AmapSecurityKey: setting.MapSetting.AmapSecurityKey,
		}
	}
	return memoRelatedSetting
}

func convertInstanceMemoRelatedSettingToStore(setting *v1pb.InstanceSetting_MemoRelatedSetting) *storepb.InstanceMemoRelatedSetting {
	if setting == nil {
		return nil
	}
	memoRelatedSetting := &storepb.InstanceMemoRelatedSetting{
		DisallowPublicVisibility: setting.DisallowPublicVisibility,
		DisplayWithUpdateTime:    setting.DisplayWithUpdateTime,
		ContentLengthLimit:       setting.ContentLengthLimit,
		EnableDoubleClickEdit:    setting.EnableDoubleClickEdit,
		Reactions:                setting.Reactions,
	}
	if setting.MapSetting != nil {
		memoRelatedSetting.MapSetting = &storepb.InstanceMapSetting{
			Provider:        storepb.MapProvider(setting.MapSetting.Provider),
			AmapApiKey:      setting.MapSetting.AmapApiKey,
			AmapSecurityKey: setting.MapSetting.AmapSecurityKey,
		}
	}
	return memoRelatedSetting
}

func (s *APIV1Service) GetInstanceAdmin(ctx context.Context) (*v1pb.User, error) {
	adminUserType := store.RoleAdmin
	user, err := s.Store.GetUser(ctx, &store.FindUser{
		Role: &adminUserType,
	})
	if err != nil {
		return nil, errors.Wrapf(err, "failed to find admin")
	}
	if user == nil {
		return nil, nil
	}

	return convertUserFromStore(user), nil
}
