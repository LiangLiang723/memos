import { create } from "@bufbuild/protobuf";
import { FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";
import { getAttachmentThumbnailUrl, getAttachmentType, getAttachmentUrl } from "@/utils/attachment";
import MemoContent from "../MemoContent";
import { MemoViewContext, type MemoViewContextValue } from "../MemoView/MemoViewContext";

interface MemoPreviewProps {
  content: string;
  attachments: Attachment[];
  compact?: boolean;
  className?: string;
}

const STUB_CONTEXT: MemoViewContextValue = {
  memo: create(MemoSchema),
  creator: undefined,
  currentUser: undefined,
  parentPage: "/",
  isArchived: false,
  readonly: true,
  showNSFWContent: false,
  nsfw: false,
};

const AttachmentThumbnails = ({ attachments }: { attachments: Attachment[] }) => {
  const images: Attachment[] = [];
  const videos: Attachment[] = [];
  const others: Attachment[] = [];
  for (const a of attachments) {
    const attachmentType = getAttachmentType(a);
    if (attachmentType === "image/*") {
      images.push(a);
    } else if (attachmentType === "video/*") {
      videos.push(a);
    } else {
      others.push(a);
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {images.map((a) => (
        <img
          key={a.name}
          src={getAttachmentThumbnailUrl(a)}
          alt={a.filename}
          className="w-10 h-10 rounded border border-border object-cover bg-muted/40"
          loading="lazy"
          onError={(event) => {
            const target = event.target as HTMLImageElement;
            if (target.src.includes("?thumbnail=true")) {
              target.src = getAttachmentUrl(a);
            }
          }}
        />
      ))}
      {videos.map((a) => (
        <div key={a.name} className="relative w-10 h-10 rounded border border-border overflow-hidden bg-muted/40">
          <video src={getAttachmentUrl(a)} className="w-full h-full object-cover" preload="metadata" muted playsInline />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
            <div className="w-5 h-5 rounded-full bg-black/55 border border-white/45 flex items-center justify-center">
              <div className="ml-0.5 w-0 h-0 border-y-[4px] border-y-transparent border-l-[6px] border-l-white" />
            </div>
          </div>
        </div>
      ))}
      {others.map((a) => (
        <div key={a.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <FileIcon className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[80px]">{a.filename}</span>
        </div>
      ))}
    </div>
  );
};

const MemoPreview = ({ content, attachments, compact = true, className }: MemoPreviewProps) => {
  const hasContent = content.trim().length > 0;
  const hasAttachments = attachments.length > 0;

  if (!hasContent && !hasAttachments) {
    return null;
  }

  return (
    <MemoViewContext.Provider value={STUB_CONTEXT}>
      <div className={cn("flex flex-col gap-1 pointer-events-none", className)}>
        {hasContent && <MemoContent content={content} compact={compact} />}
        {hasAttachments && <AttachmentThumbnails attachments={attachments} />}
      </div>
    </MemoViewContext.Provider>
  );
};

export default MemoPreview;
