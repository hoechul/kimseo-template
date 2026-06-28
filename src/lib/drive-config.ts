// Google Drive 연동 on/off 플래그.
// 기본은 비활성(false) — 고객/프로젝트 생성 시 Drive 폴더 자동 생성을 건너뛴다.
// 연동하려면 .env.local 에 다음을 설정한다(자세한 절차: docs/GOOGLE_DRIVE_SETUP.md):
//   NEXT_PUBLIC_DRIVE_ENABLED=true
//   GOOGLE_SERVICE_ACCOUNT_EMAIL=...      (서비스 계정 이메일)
//   GOOGLE_PRIVATE_KEY=...                (서비스 계정 private key)
//   GOOGLE_DRIVE_ROOT_FOLDER_ID=...       (서비스 계정과 공유한 루트 폴더 ID)
export const DRIVE_ENABLED = process.env.NEXT_PUBLIC_DRIVE_ENABLED === "true";
