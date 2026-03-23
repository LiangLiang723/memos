import { useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { memoKeys } from "@/hooks/useMemoQueries";
import { userKeys } from "@/hooks/useUserQueries";
import { handleError } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { getAttachmentUrl } from "@/utils/attachment";
import { convertVisibilityFromString } from "@/utils/memo";
import { MemoRelation_Type } from "@/types/proto/api/v1/memo_service_pb";
import { EditorContent, EditorMetadata, EditorToolbar, FocusModeExitButton, FocusModeOverlay, TimestampPopover } from "./components";
import { FOCUS_MODE_STYLES } from "./constants";
import type { EditorRefActions } from "./Editor";
import { useAutoSave, useFocusMode, useKeyboard, useMemoInit } from "./hooks";
import { cacheService, errorService, memoService, uploadService, validationService } from "./services";
import { EditorProvider, useEditorContext } from "./state";
import type { MemoEditorProps } from "./types";

const MemoEditor = (props: MemoEditorProps) => (
  <EditorProvider>
    <MemoEditorImpl {...props} />
  </EditorProvider>
);

const MemoEditorImpl: React.FC<MemoEditorProps> = ({
  className,
  cacheKey,
  memo,
  parentMemoName,
  autoFocus,
  placeholder,
  onConfirm,
  onCancel,
}) => {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const editorRef = useRef<EditorRefActions>(null);
  const { state, actions, dispatch } = useEditorContext();
  const { userGeneralSetting } = useAuth();

  const memoName = memo?.name;

  // Get default visibility from user settings
  const defaultVisibility = userGeneralSetting?.memoVisibility ? convertVisibilityFromString(userGeneralSetting.memoVisibility) : undefined;

  useMemoInit({ editorRef, memo, cacheKey, username: currentUser?.name ?? "", autoFocus, defaultVisibility });

  // Auto-save content to localStorage
  useAutoSave(state.content, currentUser?.name ?? "", cacheKey);

  // Focus mode management with body scroll lock
  useFocusMode(state.ui.isFocusMode);

  const handleToggleFocusMode = () => {
    dispatch(actions.toggleFocusMode());
  };

  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");

  useEffect(() => {
    (async () => {
      if (state.localFiles.length === 0 || state.ui.isLoading.uploading) return;

      dispatch(actions.setLoading("uploading", true));
      dispatch(actions.setUploadProgress(0));
      setUploadStatus("uploading");
      try {
        const attachments = await uploadService.uploadFiles(state.localFiles, (progress) => {
          dispatch(actions.setUploadProgress(progress));
        });

        // 预加载图片以防止从本地 Blob URL 切换到远程 URL 时闪烁
        await Promise.all(
          attachments
            .filter((a) => a.type.startsWith("image/"))
            .map((a) => {
              return new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve();
                img.src = getAttachmentUrl(a);
              });
            })
        );

        dispatch(actions.setMetadata({ attachments: [...state.metadata.attachments, ...attachments] }));
        setUploadStatus("success");
      } catch (error) {
        setUploadStatus("error");
        handleError(error, toast.error, {
          context: "Failed to upload files",
          fallbackMessage: errorService.getErrorMessage(error),
        });
      } finally {
        dispatch(actions.clearLocalFiles());
        dispatch(actions.setLoading("uploading", false));
        setTimeout(() => {
          setUploadStatus("idle");
          dispatch(actions.setUploadProgress(0));
        }, 1000);
      }
    })();
  }, [state.localFiles]);

  useKeyboard(editorRef, { onSave: handleSave });

  async function handleSave() {
    // Validate before saving
    const { valid, reason } = validationService.canSave(state);
    if (!valid) {
      toast.error(reason || "Cannot save");
      return;
    }

    dispatch(actions.setLoading("saving", true));

    try {
      const result = await memoService.save(state, { memoName, parentMemoName });

      if (!result.hasChanges) {
        toast.error(t("editor.no-changes-detected"));
        onCancel?.();
        return;
      }

      // Clear localStorage cache on successful save
      cacheService.clear(cacheService.key(currentUser?.name ?? "", cacheKey));

      // Invalidate React Query cache to refresh memo lists across the app
      const invalidationPromises = [
        queryClient.invalidateQueries({ queryKey: memoKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: userKeys.stats() }),
      ];

      // Ensure memo detail pages don't keep stale cached content after edits.
      if (memoName) {
        invalidationPromises.push(queryClient.invalidateQueries({ queryKey: memoKeys.detail(memoName) }));
      }

      // If this was a comment, also invalidate the comments query for the parent memo
      let activeParentMemoName = parentMemoName;
      if (!activeParentMemoName && memo?.relations?.length) {
        const commentRelation = memo.relations.find(
          (r) => r.type === MemoRelation_Type.COMMENT && r.memo?.name === memo.name,
        );
        if (commentRelation?.relatedMemo?.name) {
          activeParentMemoName = commentRelation.relatedMemo.name;
        }
      }
      if (activeParentMemoName) {
        invalidationPromises.push(queryClient.invalidateQueries({ queryKey: memoKeys.comments(activeParentMemoName) }));
      }

      await Promise.all(invalidationPromises);

      // Reset editor state to initial values
      dispatch(actions.reset());
      dispatch(actions.setMetadata({ location: undefined }));
      if (!memoName && defaultVisibility) {
        dispatch(actions.setMetadata({ visibility: defaultVisibility }));
      }

      // Notify parent component of successful save
      onConfirm?.(result.memoName);
    } catch (error) {
      handleError(error, toast.error, {
        context: "Failed to save memo",
        fallbackMessage: errorService.getErrorMessage(error),
      });
    } finally {
      dispatch(actions.setLoading("saving", false));
    }
  }

  return (
    <>
      <FocusModeOverlay isActive={state.ui.isFocusMode} onToggle={handleToggleFocusMode} />

      {/*
        Layout structure:
        - Uses justify-between to push content to top and bottom
        - In focus mode: becomes fixed with specific spacing, editor grows to fill space
        - In normal mode: stays relative with max-height constraint
      */}
      <div
        className={cn(
          "group relative w-full flex flex-col justify-between items-start bg-card px-4 pt-3 pb-1 rounded-xl border border-border/50 shadow-sm gap-2 focus-within:border-primary/70 focus-within:shadow-md transition-all duration-200",
          FOCUS_MODE_STYLES.transition,
          state.ui.isFocusMode && cn(FOCUS_MODE_STYLES.container.base, FOCUS_MODE_STYLES.container.spacing),
          className,
        )}
      >
        {/* Exit button is absolutely positioned in top-right corner when active */}
        <FocusModeExitButton isActive={state.ui.isFocusMode} onToggle={handleToggleFocusMode} title={t("editor.exit-focus-mode")} />

        {uploadStatus !== "idle" && (
          <div className="absolute top-0 left-0 w-full h-0.5 z-20 overflow-hidden rounded-t-xl">
            <div
              className={cn(
                "h-full transition-all duration-300",
                uploadStatus === "uploading" && "bg-primary",
                uploadStatus === "success" && "bg-green-500",
                uploadStatus === "error" && "bg-red-500",
              )}
              style={{ width: uploadStatus === "success" ? "100%" : `${state.ui.uploadProgress}%` }}
            ></div>
          </div>
        )}

        <div className="w-full -mb-1">
          <TimestampPopover />
        </div>

        {/* Editor content grows to fill available space in focus mode */}
        <EditorContent ref={editorRef} placeholder={placeholder} autoFocus={autoFocus} />

        {/* Metadata and toolbar grouped together at bottom */}
        <div className="w-full flex flex-col gap-2">
          <EditorMetadata memoName={memoName} />
          <EditorToolbar onSave={handleSave} onCancel={onCancel} memoName={memoName} />
        </div>
      </div>
    </>
  );
};

export default MemoEditor;
