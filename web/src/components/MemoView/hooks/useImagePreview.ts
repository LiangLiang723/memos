import { useState } from "react";

export interface PreviewMediaItem {
  url: string;
  type: "image" | "video";
  mimeType?: string;
  thumbnailUrl?: string;
}

export interface ImagePreviewState {
  open: boolean;
  mediaItems: PreviewMediaItem[];
  index: number;
}

export interface UseImagePreviewReturn {
  previewState: ImagePreviewState;
  openPreview: (itemOrUrl: string | PreviewMediaItem, allItems?: PreviewMediaItem[]) => void;
  setPreviewOpen: (open: boolean) => void;
}

export const useImagePreview = (): UseImagePreviewReturn => {
  const [previewState, setPreviewState] = useState<ImagePreviewState>({ open: false, mediaItems: [], index: 0 });

  return {
    previewState,
    openPreview: (itemOrUrl: string | PreviewMediaItem, allItems?: PreviewMediaItem[]) => {
      const currentItem: PreviewMediaItem =
        typeof itemOrUrl === "string"
          ? {
              url: itemOrUrl,
              type: "image",
            }
          : itemOrUrl;

      const mediaItems = allItems && allItems.length > 0 ? allItems : [currentItem];
      const index = mediaItems.findIndex((item) => item.url === currentItem.url && item.type === currentItem.type);
      setPreviewState({ open: true, mediaItems, index: index >= 0 ? index : 0 });
    },
    setPreviewOpen: (open: boolean) => setPreviewState((prev) => ({ ...prev, open })),
  };
};
