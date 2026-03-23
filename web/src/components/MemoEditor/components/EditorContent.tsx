import { XIcon, LoaderIcon } from "lucide-react";
import { forwardRef } from "react";
import Editor, { type EditorRefActions } from "../Editor";
import { useBlobUrls, useDragAndDrop } from "../hooks";
import { useEditorContext } from "../state";
import type { EditorContentProps } from "../types";
import type { LocalFile } from "../types/attachment";
import { toAttachmentItems } from "../types/attachment";

export const EditorContent = forwardRef<EditorRefActions, EditorContentProps>(({ placeholder }, ref) => {
  const { state, actions, dispatch } = useEditorContext();
  const { createBlobUrl } = useBlobUrls();

  const { dragHandlers } = useDragAndDrop((files: FileList) => {
    const localFiles: LocalFile[] = Array.from(files).map((file) => ({
      file,
      previewUrl: createBlobUrl(file),
    }));
    localFiles.forEach((localFile) => dispatch(actions.addLocalFile(localFile)));
  });

  const handleCompositionStart = () => {
    dispatch(actions.setComposing(true));
  };

  const handleCompositionEnd = () => {
    dispatch(actions.setComposing(false));
  };

  const handleContentChange = (content: string) => {
    dispatch(actions.updateContent(content));
  };

  const handlePaste = (event: React.ClipboardEvent<Element>) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const files: File[] = [];
    if (clipboard.items && clipboard.items.length > 0) {
      for (const item of Array.from(clipboard.items)) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    } else if (clipboard.files && clipboard.files.length > 0) {
      files.push(...Array.from(clipboard.files));
    }

    if (files.length === 0) return;

    const localFiles: LocalFile[] = files.map((file) => ({
      file,
      previewUrl: createBlobUrl(file),
    }));
    localFiles.forEach((localFile) => dispatch(actions.addLocalFile(localFile)));
    event.preventDefault();
  };

  return (
    <div className="w-full flex flex-col flex-1" {...dragHandlers}>
      <Editor
        ref={ref}
        className="memo-editor-content"
        initialContent={state.content}
        placeholder={placeholder || ""}
        isFocusMode={state.ui.isFocusMode}
        isInIME={state.ui.isComposing}
        onContentChange={handleContentChange}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
      {/* Inline media previews for editor uploads: placed after editor content */}
      {(() => {
        const items = toAttachmentItems(state.metadata.attachments, state.localFiles);
        const mediaItems = items.filter((it) => it.category === "image" || it.category === "video");
        if (mediaItems.length === 0) return null;

        const handleRemoveMedia = (id: string, isLocal: boolean) => {
          if (isLocal) {
            dispatch(actions.removeLocalFile(id));
            return;
          }
          dispatch(actions.removeAttachment(id));
        };

        return (
          <div className="mt-3 grid gap-2 grid-cols-3 lg:grid-cols-5">
            {mediaItems.map((media) => (
              <div key={media.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted/40">
                {media.category === "video" ? (
                  <video
                    src={media.sourceUrl + "#t=0.1"}
                    className="w-full h-full object-cover"
                    controls
                    preload="metadata"
                    playsInline
                    x5-video-player-type="h5"
                  />
                ) : (
                  <img src={media.thumbnailUrl} alt={media.filename} className="w-full h-full object-cover" />
                )}
                {media.isLocal && (
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center z-10 transition-opacity">
                    <LoaderIcon className="size-5 text-white animate-spin mb-1" />
                    <span className="text-white text-xs font-medium">{state.ui.uploadProgress > 0 ? `${state.ui.uploadProgress}%` : "等待..."}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveMedia(media.id, media.isLocal)}
                  className="absolute top-1 right-1 inline-flex items-center justify-center size-5 rounded-full bg-black/60 text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  aria-label={media.category === "video" ? "移除视频" : "移除图片"}
                  title={media.category === "video" ? "移除视频" : "移除图片"}
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
});

EditorContent.displayName = "EditorContent";
