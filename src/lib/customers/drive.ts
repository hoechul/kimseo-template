// 고객관리 전용 Google Drive 루트 폴더 ID (이 폴더 아래에 고객별 서브 폴더를 생성).
// 비워두면 서버가 GOOGLE_DRIVE_ROOT_FOLDER_ID 로 폴백한다. (설정: docs/GOOGLE_DRIVE_SETUP.md)
export const CUSTOMERS_DRIVE_ROOT_FOLDER_ID =
  process.env.NEXT_PUBLIC_CUSTOMERS_DRIVE_FOLDER_ID ?? "";
