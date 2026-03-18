import { PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { getAttachmentThumbnailUrl, getAttachmentType, getAttachmentUrl } from "@/utils/attachment";

interface AttachmentCardProps {
  attachment: Attachment;
  onClick?: () => void;
  className?: string;
}

const AttachmentCard = ({ attachment, onClick, className }: AttachmentCardProps) => {
  const attachmentType = getAttachmentType(attachment);
  const sourceUrl = getAttachmentUrl(attachment);
  const thumbnailUrl = getAttachmentThumbnailUrl(attachment);

  if (attachmentType === "image/*") {
    return (
      <img
        src={thumbnailUrl}
        alt={attachment.filename}
        className={cn("w-full h-full object-cover rounded-lg cursor-pointer", className)}
        onClick={onClick}
        loading="lazy"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (target.src.includes("?thumbnail=true")) {
            target.src = sourceUrl;
          }
        }}
      />
    );
  }

  if (attachmentType === "video/*") {
    return (
      <div className={cn("relative w-full h-full rounded-lg overflow-hidden", className)} onClick={onClick}>
        <video src={sourceUrl} className="w-full h-full object-cover" preload="metadata" muted playsInline />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="w-11 h-11 rounded-full bg-black/60 text-white border border-white/45 flex items-center justify-center">
            <PlayIcon className="w-5 h-5 ml-0.5" />
          </div>
        </div>
      </div>
    );
  }

  if (attachmentType === "audio/*") {
    return <audio src={sourceUrl} className={cn("w-full rounded-lg", className)} controls preload="metadata" />;
  }

  return null;
};

export default AttachmentCard;
