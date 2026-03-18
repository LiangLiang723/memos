import { useRef } from "react";
import type { LocalFile } from "../types/attachment";

export const useFileUpload = (onFilesSelected: (localFiles: LocalFile[]) => void) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectingFlagRef = useRef(false);
  const imagesOnlyRef = useRef(false);

  const isImageFile = (file: File): boolean => {
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      return true;
    }
    return /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|tiff|tif|webp|mp4|webm|mov|mkv)$/i.test(file.name);
  };

  const handleFileInputChange = (event?: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event?.target?.files ?? fileInputRef.current?.files;
    const files = Array.from(fileList || []).filter((file) => (imagesOnlyRef.current ? isImageFile(file) : true));
    if (files.length === 0 || selectingFlagRef.current) return;
    selectingFlagRef.current = true;
    const localFiles: LocalFile[] = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    onFilesSelected(localFiles);
    selectingFlagRef.current = false;
    imagesOnlyRef.current = false;
    // Optionally clear input value to allow re-selecting the same file
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUploadClick = (options?: { imagesOnly?: boolean }) => {
    imagesOnlyRef.current = Boolean(options?.imagesOnly);
    if (fileInputRef.current) {
      if (options?.imagesOnly) {
        fileInputRef.current.accept = "image/*";
      } else {
        fileInputRef.current.accept = "*";
      }
      fileInputRef.current.click();
    }
  };

  return {
    fileInputRef,
    selectingFlag: selectingFlagRef.current,
    handleFileInputChange,
    handleUploadClick,
  };
};
