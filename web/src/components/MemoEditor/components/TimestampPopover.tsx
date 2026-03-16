import * as exifr from "exifr";
import { type FC, useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAttachmentUrl } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";
import { useEditorContext } from "../state";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDisplayDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDateTimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseDateTimeLocal(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseExifDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}

function extractExifShotTime(exifData: Record<string, unknown> | null): Date | undefined {
  return (
    parseExifDate(exifData?.DateTimeOriginal) ??
    parseExifDate(exifData?.CreateDate) ??
    parseExifDate(exifData?.DateTimeDigitized) ??
    parseExifDate(exifData?.ModifyDate)
  );
}

const TimestampInput: FC<{
  label: string;
  date: Date | undefined;
  onChange: (date: Date) => void;
}> = ({ label, date, onChange }) => {
  const initialValue = useRef(date ? formatDateTimeLocal(date) : "");
  const [value, setValue] = useState(initialValue.current);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const next = date ? formatDateTimeLocal(date) : "";
    setValue(next);
    setInvalid(false);
  }, [date]);

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {value !== initialValue.current && <span className="text-primary ml-0.5">*</span>}
      </label>
      <input
        type="datetime-local"
        step={1}
        className="block w-full rounded-md border border-border bg-background px-2 py-1 text-sm data-[invalid=true]:border-destructive"
        data-invalid={invalid}
        value={value}
        onChange={(e) => {
          const nextValue = e.target.value;
          setValue(nextValue);
          const parsed = parseDateTimeLocal(nextValue);
          if (parsed) {
            setInvalid(false);
            onChange(parsed);
          } else {
            setInvalid(true);
          }
        }}
      />
    </div>
  );
};

export const TimestampPopover: FC = () => {
  const t = useTranslate();
  const { state, actions, dispatch } = useEditorContext();
  const { createTime, updateTime } = state.timestamps;
  const defaultTimeRef = useRef(new Date());
  const [firstImageShotTime, setFirstImageShotTime] = useState<Date | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const resolveFirstImageShotTime = async () => {
      const imageFiles = state.localFiles.filter((localFile) => localFile.file.type.startsWith("image/"));

      for (const localFile of imageFiles) {
        try {
          const exifData = (await exifr.parse(localFile.file, { tiff: true })) as Record<string, unknown> | null;
          const shotTime = extractExifShotTime(exifData);

          if (shotTime) {
            if (!cancelled) {
              setFirstImageShotTime(shotTime);
            }
            return;
          }
        } catch {
          // Ignore EXIF parsing errors and continue scanning next image.
        }
      }

      const imageAttachments = state.metadata.attachments.filter((attachment) => attachment.type.startsWith("image/"));
      for (const attachment of imageAttachments) {
        try {
          const response = await fetch(getAttachmentUrl(attachment), { credentials: "include" });
          if (!response.ok) {
            continue;
          }
          const blob = await response.blob();
          const exifData = (await exifr.parse(blob, { tiff: true })) as Record<string, unknown> | null;
          const shotTime = extractExifShotTime(exifData);

          if (shotTime) {
            if (!cancelled) {
              setFirstImageShotTime(shotTime);
            }
            return;
          }
        } catch {
          // Ignore EXIF parsing errors and continue scanning next image attachment.
        }
      }

      if (!cancelled) {
        setFirstImageShotTime(undefined);
      }
    };

    void resolveFirstImageShotTime();

    return () => {
      cancelled = true;
    };
  }, [state.localFiles, state.metadata.attachments]);

  useEffect(() => {
    if (createTime) return;
    const now = defaultTimeRef.current;
    dispatch(actions.setTimestamps({ createTime: now, updateTime: updateTime ?? now }));
  }, [createTime, updateTime, actions, dispatch]);

  const effectiveCreateTime = createTime ?? defaultTimeRef.current;

  return (
    <div className="w-auto inline-flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-auto text-sm text-muted-foreground text-left hover:text-foreground transition-colors cursor-pointer"
          >
            {formatDisplayDate(effectiveCreateTime)}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2 pt-1 space-y-1">
          <TimestampInput
            label={t("common.created-at")}
            date={createTime}
            onChange={(d) => dispatch(actions.setTimestamps({ createTime: d }))}
          />
          <TimestampInput
            label={t("common.last-updated-at")}
            date={updateTime}
            onChange={(d) => dispatch(actions.setTimestamps({ updateTime: d }))}
          />
        </PopoverContent>
      </Popover>

      {firstImageShotTime && (
        <button
          type="button"
          className="text-xs text-primary hover:underline cursor-pointer"
          onClick={() => dispatch(actions.setTimestamps({ createTime: firstImageShotTime }))}
          title={formatDisplayDate(firstImageShotTime)}
        >
          {t("editor.use-first-photo-shot-time")}
        </button>
      )}
    </div>
  );
};
