/**
 * Google Drive resumable upload을 통해 파일을 업로드한다.
 * Vercel serverless 함수의 body 크기 제한(4.5MB)을 우회하기 위해
 * 서버에서 upload session URI만 발급받고, 실제 파일은 클라이언트에서
 * Google Drive로 직접 전송한다.
 */
export async function uploadFileToDrive(folderId: string, file: File) {
  // 1) 서버에서 resumable upload session URI 발급
  const sessionRes = await fetch("/api/drive/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folderId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    }),
  });

  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => null);
    throw new Error(err?.error ?? `${file.name} 업로드 세션 생성 실패`);
  }

  const { uploadUrl } = (await sessionRes.json()) as { uploadUrl: string };

  // 2) 클라이언트에서 Google Drive로 직접 업로드 (Vercel 우회)
  // Content-Length는 브라우저가 body에서 자동 계산하므로 설정 불필요
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    throw new Error(`${file.name} 업로드 실패: ${uploadRes.status} ${text}`);
  }

  // 상태가 2xx이면 Google이 파일을 받은 것. 응답 본문 파싱에 실패하더라도
  // (모바일/프록시 환경에서 간헐적으로 발생) 업로드는 성공한 것으로 처리한다.
  return uploadRes.json().catch(() => ({}));
}
