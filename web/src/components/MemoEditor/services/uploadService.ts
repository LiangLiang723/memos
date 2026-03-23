import { create, toBinary, fromBinary } from "@bufbuild/protobuf";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { AttachmentSchema, CreateAttachmentRequestSchema } from "@/types/proto/api/v1/attachment_service_pb";
import type { LocalFile } from "../types/attachment";
import { getRequestToken, refreshAndGetAccessToken } from "@/connect";
import { redirectOnAuthFailure } from "@/utils/auth-redirect";

export const uploadService = {
  async uploadFiles(localFiles: LocalFile[], onProgress?: (progress: number) => void): Promise<Attachment[]> {
    if (localFiles.length === 0) return [];

    const attachments: Attachment[] = [];

    const totalSize = localFiles.reduce((acc, { file }) => acc + file.size, 0);
    let uploadedSize = 0;

    for (const { file } of localFiles) {
      const buffer = new Uint8Array(await file.arrayBuffer());
      
      const reqMessage = create(CreateAttachmentRequestSchema, {
        attachment: create(AttachmentSchema, {
          filename: file.name,
          size: BigInt(file.size),
          type: file.type,
          content: buffer,
        }),
      });
      const reqBytes = toBinary(CreateAttachmentRequestSchema, reqMessage);

      const sendXhr = (token: string | null, isRetry = false): Promise<Attachment> => {
        return new Promise<Attachment>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.withCredentials = true;
          xhr.open("POST", `${window.location.origin}/memos.api.v1.AttachmentService/CreateAttachment`);
          xhr.setRequestHeader("Content-Type", "application/proto");
          xhr.setRequestHeader("Connect-Protocol-Version", "1");
          
          if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }
          if (isRetry) {
            xhr.setRequestHeader("X-Retry", "true");
          }

          xhr.responseType = "arraybuffer";

          if (onProgress) {
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const currentFileProgress = e.loaded;
                onProgress(Math.round(((uploadedSize + currentFileProgress) / totalSize) * 100));
              }
            };
          }

          xhr.onload = async () => {
            if (xhr.status === 401 && !isRetry) {
              try {
                const newToken = await refreshAndGetAccessToken();
                const retryResp = await sendXhr(newToken, true);
                resolve(retryResp);
              } catch (err) {
                redirectOnAuthFailure();
                reject(err);
              }
              return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const resBytes = new Uint8Array(xhr.response);
                const attachmentMessage = fromBinary(AttachmentSchema, resBytes);
                resolve(attachmentMessage);
              } catch (err) {
                reject(err);
              }
            } else {
              let errMsg = `Upload failed with status ${xhr.status}`;
              try {
                 const errText = new TextDecoder().decode(xhr.response);
                 const errJson = JSON.parse(errText);
                 if (errJson.message) errMsg = errJson.message;
              } catch (e) {
                // ignore
              }
              reject(new Error(errMsg));
            }
          };

          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.send(reqBytes);
        });
      };

      const initialToken = await getRequestToken();
      const attachment = await sendXhr(initialToken);

      attachments.push(attachment);

      uploadedSize += file.size;
      onProgress?.(Math.round((uploadedSize / totalSize) * 100));
    }

    return attachments;
  },
};
