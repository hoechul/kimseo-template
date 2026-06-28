# 메모 기능 공통 규칙

프로젝트관리와 고객관리는 **동일한 구조의 메모 기능**을 공유한다. 한쪽을 수정하면 다른 쪽도 반드시 동일하게 수정한다. 코드는 독립적으로 중복 관리되지만(의도적 duplication), 기능·UX·데이터 스키마는 항상 대칭이어야 한다.

## 대응 파일

| 역할 | 프로젝트관리 | 고객관리 |
|---|---|---|
| 메모 다이얼로그 | `src/components/project-note-dialog.tsx` | `src/components/customer-note-dialog.tsx` |
| 상세 페이지 | `src/app/dashboard/projects/[id]/page.tsx` | `src/app/dashboard/customers/[id]/page.tsx` |
| 마이그레이션 | `supabase/migrations/20260309113000_project_notes.sql` | `supabase/migrations/20260422170000_customer_notes.sql` |
| Storage 버킷 | `project-note-images` | `customer-note-images` |
| 타입 | `src/lib/types.ts` (`ProjectNote`) | `src/lib/types.ts` (`CustomerNote`) |

## 공통 데이터 스키마

두 테이블은 FK 컬럼명(`project_id` / `customer_id`)만 다르고 나머지는 동일해야 한다.

- `id` (uuid, PK)
- `{project|customer}_id` (uuid, FK, ON DELETE CASCADE)
- `title` (text, nullable)
- `content` (text, nullable, sanitized HTML)
- `link_url` (text, nullable)
- `author_employee_id` (uuid, nullable)
- `author_name` (text, required)
- `created_at`, `updated_at` (timestamptz, `updated_at` 자동 갱신 트리거)

## 수정 체크리스트

메모 관련 변경 시 **아래 모두** 확인한다.

- [ ] `project-note-dialog.tsx` 와 `customer-note-dialog.tsx` 양쪽 반영
- [ ] 상세 페이지 두 곳의 `handleAddNote` / `handleEditNote` / `handleSaveNote` / `handleDeleteNote` / `refreshNotes` 동작 동기화
- [ ] DB 스키마 변경 시 두 테이블 모두에 마이그레이션 추가 + `supabase db push` 적용
- [ ] 타입(`ProjectNote`, `CustomerNote`) 양쪽 동기화
- [ ] Storage 버킷 정책 변경 시 두 버킷 모두 반영
- [ ] `sendLog()` 로그 포맷(CREATE/UPDATE/DELETE) 양쪽 동일하게 유지
- [ ] 커밋 메시지에 "프로젝트/고객관리 메모 ..." 형식으로 공통 변경임을 명시

## 의도적으로 다른 점 (예외)

- FK 컬럼명: `project_id` vs `customer_id`
- Storage 버킷명: `project-note-images` vs `customer-note-images`
- 테이블명: `project_notes` vs `customer_notes`

이 외 차이가 발생하면 버그로 간주하고 동기화한다.
