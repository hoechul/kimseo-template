import { google } from "googleapis";

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function getDrive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

export async function createFolder(name: string, parentId: string) {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });
  return res.data;
}

export async function listFiles(folderId: string) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, iconLink, thumbnailLink)",
    orderBy: "modifiedTime desc",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files ?? [];
}

export async function uploadFile(
  folderId: string,
  fileName: string,
  mimeType: string,
  body: Buffer
) {
  const drive = getDrive();
  const { Readable } = await import("stream");
  const stream = Readable.from(body);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, name, mimeType, size, webViewLink, webContentLink",
    supportsAllDrives: true,
  });
  return res.data;
}

export async function renameFile(fileId: string, newName: string) {
  const drive = getDrive();
  const res = await drive.files.update({
    fileId,
    requestBody: { name: newName },
    fields: "id, name",
    supportsAllDrives: true,
  });
  return res.data;
}

export async function moveFile(fileId: string, fromFolderId: string, toFolderId: string) {
  const drive = getDrive();
  const res = await drive.files.update({
    fileId,
    addParents: toFolderId,
    removeParents: fromFolderId,
    fields: "id, name",
    supportsAllDrives: true,
  });
  return res.data;
}

export async function updateFileContent(
  fileId: string,
  mimeType: string,
  body: Buffer
) {
  const drive = getDrive();
  const { Readable } = await import("stream");
  const stream = Readable.from(body);

  const res = await drive.files.update({
    fileId,
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, name, mimeType, size, webViewLink, webContentLink",
    supportsAllDrives: true,
  });
  return res.data;
}

export async function deleteFile(fileId: string) {
  const drive = getDrive();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

/**
 * Google Drive resumable upload 세션을 생성하고 upload URI를 반환한다.
 * 클라이언트가 이 URI로 직접 파일을 PUT 하면 Vercel body 제한을 우회할 수 있다.
 */
export async function createResumableUploadSession(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileSize: number
) {
  const auth = getAuth();
  const token = await auth.authorize();

  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(fileSize),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resumable upload session 생성 실패: ${res.status} ${text}`);
  }

  const uploadUrl = res.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("Google Drive가 upload URI를 반환하지 않았습니다.");
  }

  return uploadUrl;
}
