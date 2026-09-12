import { create } from "@bufbuild/protobuf";
import { isEqual } from "lodash-es";
import { Trash } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import AttachmentIcon from "@/components/AttachmentIcon";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { attachmentServiceClient, instanceServiceClient } from "@/connect";
import { useInstance } from "@/contexts/InstanceContext";
import { useDeleteAttachment } from "@/hooks/useAttachmentQueries";
import useDialog from "@/hooks/useDialog";
import { handleError } from "@/lib/error";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import {
  InstanceSetting_Key,
  InstanceSetting_StorageSetting,
  InstanceSetting_StorageSetting_S3Config,
  InstanceSetting_StorageSetting_S3ConfigSchema,
  InstanceSetting_StorageSetting_StorageType,
  InstanceSetting_StorageSettingSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import SettingRow from "./SettingRow";
import SettingSection from "./SettingSection";

const ATTACHMENT_MIGRATION_BATCH_SIZE = 10;

const StorageSection = () => {
  const t = useTranslate();
  const { storageSetting: originalSetting, updateSetting, fetchSetting } = useInstance();
  const [instanceStorageSetting, setInstanceStorageSetting] = useState<InstanceSetting_StorageSetting>(originalSetting);
  const [isMigratingAttachments, setIsMigratingAttachments] = useState(false);
  const [isVacuumingDatabase, setIsVacuumingDatabase] = useState(false);
  const deleteUnusedDialog = useDialog();
  const { mutateAsync: deleteAttachment } = useDeleteAttachment();
  const [unusedAttachments, setUnusedAttachments] = useState<Attachment[] | null>(null);
  const [isDeletingUnused, setIsDeletingUnused] = useState(false);

  useEffect(() => {
    setInstanceStorageSetting(originalSetting);
  }, [originalSetting]);

  const fetchUnusedAttachments = useCallback(async () => {
    try {
      let all: Attachment[] = [];
      let token = "";
      do {
        const resp = await attachmentServiceClient.listAttachments({ pageSize: 1000, pageToken: token, filter: "" });
        all = [...all, ...resp.attachments];
        token = resp.nextPageToken;
      } while (token);
      setUnusedAttachments(all.filter((a) => !a.memo));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchUnusedAttachments();
  }, [fetchUnusedAttachments]);

  const handleDeleteAllUnused = useCallback(async () => {
    setIsDeletingUnused(true);
    try {
      const unused = unusedAttachments ?? [];
      await Promise.all(unused.map((a) => deleteAttachment(a.name)));
      toast.success(t("resource.delete-all-unused-success"));
      await fetchUnusedAttachments();
    } catch (error: unknown) {
      handleError(error, toast.error, {
        context: "Delete unused attachments",
        fallbackMessage: t("resource.delete-all-unused-error"),
      });
    } finally {
      setIsDeletingUnused(false);
    }
  }, [deleteAttachment, fetchUnusedAttachments, unusedAttachments, t]);

  const allowSaveStorageSetting = useMemo(() => {
    if (instanceStorageSetting.uploadSizeLimitMb <= 0) {
      return false;
    }

    if (instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.LOCAL) {
      if (instanceStorageSetting.filepathTemplate.length === 0) {
        return false;
      }
    } else if (instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.S3) {
      if (
        instanceStorageSetting.s3Config?.accessKeyId.length === 0 ||
        instanceStorageSetting.s3Config?.accessKeySecret.length === 0 ||
        instanceStorageSetting.s3Config?.endpoint.length === 0 ||
        instanceStorageSetting.s3Config?.region.length === 0 ||
        instanceStorageSetting.s3Config?.bucket.length === 0
      ) {
        return false;
      }
    }
    return !isEqual(originalSetting, instanceStorageSetting);
  }, [instanceStorageSetting, originalSetting]);

  const handleMaxUploadSizeChanged = async (event: React.FocusEvent<HTMLInputElement>) => {
    let num = parseInt(event.target.value);
    if (Number.isNaN(num)) {
      num = 0;
    }
    const update = create(InstanceSetting_StorageSettingSchema, {
      ...instanceStorageSetting,
      uploadSizeLimitMb: BigInt(num),
    });
    setInstanceStorageSetting(update);
  };

  const handleFilepathTemplateChanged = async (event: React.FocusEvent<HTMLInputElement>) => {
    const update = create(InstanceSetting_StorageSettingSchema, {
      ...instanceStorageSetting,
      filepathTemplate: event.target.value,
    });
    setInstanceStorageSetting(update);
  };

  const handlePartialS3ConfigChanged = async (s3Config: Partial<InstanceSetting_StorageSetting_S3Config>) => {
    const existingS3Config = instanceStorageSetting.s3Config;
    const s3ConfigInit = {
      accessKeyId: existingS3Config?.accessKeyId ?? "",
      accessKeySecret: existingS3Config?.accessKeySecret ?? "",
      endpoint: existingS3Config?.endpoint ?? "",
      region: existingS3Config?.region ?? "",
      bucket: existingS3Config?.bucket ?? "",
      usePathStyle: existingS3Config?.usePathStyle ?? false,
      ...s3Config,
    };
    const update = create(InstanceSetting_StorageSettingSchema, {
      storageType: instanceStorageSetting.storageType,
      filepathTemplate: instanceStorageSetting.filepathTemplate,
      uploadSizeLimitMb: instanceStorageSetting.uploadSizeLimitMb,
      s3Config: create(InstanceSetting_StorageSetting_S3ConfigSchema, s3ConfigInit),
    });
    setInstanceStorageSetting(update);
  };

  const handleS3ConfigAccessKeyIdChanged = async (event: React.FocusEvent<HTMLInputElement>) => {
    handlePartialS3ConfigChanged({ accessKeyId: event.target.value });
  };

  const handleS3ConfigAccessKeySecretChanged = async (event: React.FocusEvent<HTMLInputElement>) => {
    handlePartialS3ConfigChanged({ accessKeySecret: event.target.value });
  };

  const handleS3ConfigEndpointChanged = async (event: React.FocusEvent<HTMLInputElement>) => {
    handlePartialS3ConfigChanged({ endpoint: event.target.value });
  };

  const handleS3ConfigRegionChanged = async (event: React.FocusEvent<HTMLInputElement>) => {
    handlePartialS3ConfigChanged({ region: event.target.value });
  };

  const handleS3ConfigBucketChanged = async (event: React.FocusEvent<HTMLInputElement>) => {
    handlePartialS3ConfigChanged({ bucket: event.target.value });
  };

  const handleS3ConfigUsePathStyleChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    handlePartialS3ConfigChanged({
      usePathStyle: event.target.checked,
    });
  };

  const handleStorageTypeChanged = async (storageType: InstanceSetting_StorageSetting_StorageType) => {
    const update = create(InstanceSetting_StorageSettingSchema, {
      ...instanceStorageSetting,
      storageType: storageType,
    });
    setInstanceStorageSetting(update);
  };

  const saveInstanceStorageSetting = async () => {
    try {
      await updateSetting(
        create(InstanceSettingSchema, {
          name: `instance/settings/${InstanceSetting_Key[InstanceSetting_Key.STORAGE]}`,
          value: {
            case: "storageSetting",
            value: instanceStorageSetting,
          },
        }),
      );
      await fetchSetting(InstanceSetting_Key.STORAGE);
      toast.success("Updated");
    } catch (error: unknown) {
      handleError(error, toast.error, {
        context: "Update storage settings",
      });
    }
  };

  const shouldShowAttachmentMigration =
    (originalSetting.storageType === InstanceSetting_StorageSetting_StorageType.DATABASE &&
      instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.LOCAL) ||
    (originalSetting.storageType === InstanceSetting_StorageSetting_StorageType.LOCAL &&
      (instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.DATABASE ||
        instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.LOCAL));

  const migrationDirection =
    originalSetting.storageType === InstanceSetting_StorageSetting_StorageType.DATABASE &&
    instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.LOCAL
      ? "database-to-local"
      : originalSetting.storageType === InstanceSetting_StorageSetting_StorageType.LOCAL &&
          instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.DATABASE
        ? "local-to-database"
        : "local-template";

  const canStartAttachmentMigration =
    migrationDirection === "local-template" ? instanceStorageSetting.filepathTemplate.length > 0 : allowSaveStorageSetting;

  const vacuumDatabase = async () => {
    try {
      setIsVacuumingDatabase(true);
      await instanceServiceClient.vacuumDatabase({});
      toast.success(t("setting.storage-section.vacuum-database-success"));
    } catch (error: unknown) {
      handleError(error, toast.error, { context: "Vacuum database" });
    } finally {
      setIsVacuumingDatabase(false);
    }
  };

  const migrateAttachments = async () => {
    let toastId: string | undefined;
    try {
      setIsMigratingAttachments(true);
      toastId = toast.loading(t("setting.storage-section.migrating-attachments"));
      if (!isEqual(originalSetting, instanceStorageSetting)) {
        await updateSetting(
          create(InstanceSettingSchema, {
            name: `instance/settings/${InstanceSetting_Key[InstanceSetting_Key.STORAGE]}`,
            value: {
              case: "storageSetting",
              value: instanceStorageSetting,
            },
          }),
        );
        await fetchSetting(InstanceSetting_Key.STORAGE);
      }

      let total = 0;
      let migrated = 0;
      let skipped = 0;
      let offset = 0;
      while (true) {
        const response =
          migrationDirection === "local-to-database"
            ? await instanceServiceClient.migrateLocalAttachmentsToDatabase({ batchSize: ATTACHMENT_MIGRATION_BATCH_SIZE })
            : migrationDirection === "local-template"
              ? await instanceServiceClient.migrateLocalAttachmentsToTemplate({
                  batchSize: ATTACHMENT_MIGRATION_BATCH_SIZE,
                  offset,
                })
              : await instanceServiceClient.migrateDatabaseAttachmentsToLocal({ batchSize: ATTACHMENT_MIGRATION_BATCH_SIZE });
        if (total === 0) {
          total = response.total;
        }
        migrated += response.migrated;
        skipped += response.skipped;
        toast.loading(
          t("setting.storage-section.migrate-attachments-progress", {
            migrated: migrated + skipped,
            total,
          }),
          { id: toastId },
        );
        if (migrationDirection === "local-template") {
          if (!("nextOffset" in response) || response.nextOffset < 0) {
            break;
          }
          offset = response.nextOffset;
        } else if (response.migrated === 0 || migrated >= total) {
          break;
        }
      }
      toast.success(
        t("setting.storage-section.migrate-attachments-success", {
          migrated,
          total,
        }),
        { id: toastId },
      );
    } catch (error: unknown) {
      handleError(error, (message) => toast.error(message, toastId ? { id: toastId } : undefined), {
        context: "Migrate attachments",
      });
    } finally {
      setIsMigratingAttachments(false);
    }
  };

  return (
    <SettingSection>
      <SettingGroup title={t("setting.storage-section.current-storage")}>
        <div className="w-full">
          <RadioGroup
            value={String(instanceStorageSetting.storageType)}
            onValueChange={(value) => {
              handleStorageTypeChanged(Number(value) as InstanceSetting_StorageSetting_StorageType);
            }}
            className="flex flex-row gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={String(InstanceSetting_StorageSetting_StorageType.DATABASE)} id="database" />
              <Label htmlFor="database">{t("setting.storage-section.type-database")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={String(InstanceSetting_StorageSetting_StorageType.LOCAL)} id="local" />
              <Label htmlFor="local">{t("setting.storage-section.type-local")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={String(InstanceSetting_StorageSetting_StorageType.S3)} id="s3" />
              <Label htmlFor="s3">S3</Label>
            </div>
          </RadioGroup>
        </div>

        <SettingRow label={t("setting.system-section.max-upload-size")} tooltip={t("setting.system-section.max-upload-size-hint")}>
          <Input
            className="w-24 font-mono"
            value={String(instanceStorageSetting.uploadSizeLimitMb)}
            onChange={handleMaxUploadSizeChanged}
          />
        </SettingRow>

        {instanceStorageSetting.storageType !== InstanceSetting_StorageSetting_StorageType.DATABASE && (
          <SettingRow label={t("setting.storage-section.filepath-template")}>
            <Input
              className="w-64"
              value={instanceStorageSetting.filepathTemplate}
              placeholder="assets/{timestamp}_{filename}"
              onChange={handleFilepathTemplateChanged}
            />
          </SettingRow>
        )}

        {shouldShowAttachmentMigration && (
          <SettingRow
            label={
              migrationDirection === "local-template"
                ? t("setting.storage-section.reorganize-attachments")
                : t("setting.storage-section.migrate-attachments")
            }
            description={
              migrationDirection === "local-to-database"
                ? t("setting.storage-section.migrate-attachments-to-database-description")
                : migrationDirection === "local-template"
                  ? t("setting.storage-section.reorganize-attachments-description")
                  : t("setting.storage-section.migrate-attachments-to-local-description")
            }
          >
            <Button variant="outline" disabled={!canStartAttachmentMigration || isMigratingAttachments} onClick={migrateAttachments}>
              {isMigratingAttachments
                ? t("setting.storage-section.migrating-attachments")
                : migrationDirection === "local-template"
                  ? t("setting.storage-section.reorganize-attachments")
                  : t("setting.storage-section.migrate-attachments")}
            </Button>
          </SettingRow>
        )}

        {originalSetting.storageType === InstanceSetting_StorageSetting_StorageType.LOCAL && (
          <SettingRow
            label={t("setting.storage-section.vacuum-database")}
            description={t("setting.storage-section.vacuum-database-description")}
          >
            <Button variant="outline" disabled={isVacuumingDatabase} onClick={vacuumDatabase}>
              {isVacuumingDatabase ? t("setting.storage-section.vacuuming-database") : t("setting.storage-section.vacuum-database")}
            </Button>
          </SettingRow>
        )}
      </SettingGroup>

      {instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.S3 && (
        <SettingGroup title="S3 Configuration" showSeparator>
          <SettingRow label="Access key id">
            <Input className="w-64" value={instanceStorageSetting.s3Config?.accessKeyId} onChange={handleS3ConfigAccessKeyIdChanged} />
          </SettingRow>

          <SettingRow label="Access key secret">
            <Input
              className="w-64"
              type="password"
              value={instanceStorageSetting.s3Config?.accessKeySecret}
              onChange={handleS3ConfigAccessKeySecretChanged}
            />
          </SettingRow>

          <SettingRow label="Endpoint">
            <Input className="w-64" value={instanceStorageSetting.s3Config?.endpoint} onChange={handleS3ConfigEndpointChanged} />
          </SettingRow>

          <SettingRow label="Region">
            <Input className="w-64" value={instanceStorageSetting.s3Config?.region} onChange={handleS3ConfigRegionChanged} />
          </SettingRow>

          <SettingRow label="Bucket">
            <Input className="w-64" value={instanceStorageSetting.s3Config?.bucket} onChange={handleS3ConfigBucketChanged} />
          </SettingRow>

          <SettingRow label="Use Path Style">
            <Switch
              checked={instanceStorageSetting.s3Config?.usePathStyle}
              onCheckedChange={(checked) =>
                handleS3ConfigUsePathStyleChanged({ target: { checked } } as React.ChangeEvent<HTMLInputElement> & {
                  target: { checked: boolean };
                })
              }
            />
          </SettingRow>
        </SettingGroup>
      )}

      <div className="w-full flex justify-end">
        <Button disabled={!allowSaveStorageSetting || isMigratingAttachments} onClick={saveInstanceStorageSetting}>
          {t("common.save")}
        </Button>
      </div>

      <SettingGroup title={t("resource.unused-resources")} showSeparator>
        <div className="w-full flex flex-col gap-3">
          <div className="w-full flex flex-row items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {unusedAttachments === null
                ? t("resource.fetching-data")
                : unusedAttachments.length === 0
                  ? t("resource.no-unused-resources")
                  : `${unusedAttachments.length} ${t("resource.unused-resources").toLowerCase()}`}
            </span>
            <Button
              variant="destructive"
              size="sm"
              disabled={isDeletingUnused || !unusedAttachments || unusedAttachments.length === 0}
              onClick={() => deleteUnusedDialog.open()}
            >
              <Trash className="w-4 h-4 mr-1" />
              {t("resource.delete-all-unused")}
            </Button>
          </div>
          {unusedAttachments && unusedAttachments.length > 0 && (
            <div className="w-full grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {unusedAttachments.map((attachment) => (
                <div key={attachment.name} className="w-full flex flex-col items-start gap-1">
                  <div className="w-full h-0 pb-[100%] relative overflow-hidden rounded-md border border-border/50 bg-muted/40">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <AttachmentIcon attachment={attachment} strokeWidth={0.5} />
                    </div>
                  </div>
                  <p className="w-full text-xs text-muted-foreground truncate px-0.5">{attachment.filename}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingGroup>

      <ConfirmDialog
        open={deleteUnusedDialog.isOpen}
        onOpenChange={deleteUnusedDialog.setOpen}
        title={t("resource.delete-all-unused-confirm")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleDeleteAllUnused}
        confirmVariant="destructive"
      />
    </SettingSection>
  );
};

export default StorageSection;
