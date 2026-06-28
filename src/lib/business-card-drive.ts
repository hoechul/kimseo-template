import { deleteFile, uploadFile } from "@/lib/google-drive";

// 명함관리 Drive 폴더 ID. 비우면 GOOGLE_DRIVE_ROOT_FOLDER_ID 로 폴백. (설정: docs/GOOGLE_DRIVE_SETUP.md)
export const BUSINESS_CARD_DRIVE_FOLDER_ID =
  process.env.BUSINESS_CARD_DRIVE_FOLDER_ID ?? process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? "";

function toBuffer(base64Data: string) {
  return Buffer.from(base64Data, "base64");
}

export async function uploadBusinessCardImage(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
}) {
  return uploadFile(
    BUSINESS_CARD_DRIVE_FOLDER_ID,
    params.fileName,
    params.mimeType,
    toBuffer(params.base64Data)
  );
}

export async function deleteBusinessCardImage(fileId: string | null | undefined) {
  if (!fileId) {
    return;
  }

  await deleteFile(fileId);
}
