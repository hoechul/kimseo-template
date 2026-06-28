# 김비서 템플릿 (Yun Secretary Template)

자연어로 사내 업무를 다루는 **AI 비서형 업무관리 시스템**의 학습용 템플릿입니다.
클래스101 「클로드코드 4주 과정」 수강생이 클론해서 로컬에서 실행하고,
각자 본인 시스템으로 발전시키도록 만들어졌습니다.

> **시작하기 (처음이라면):** 아래 한 줄로 코드를 내려받은 뒤, 그 폴더를
> **Claude Code 로 열고 "초기 설정 도와줘"** 라고 말하면 처음부터 끝까지 같이 설치해 줍니다.
> (또는 `/setup` 입력) · 직접 하려면 → **[SETUP.md](./SETUP.md)**.
>
> ```bash
> git clone https://github.com/hoechul/kimseo-template.git my-secretary
> cd my-secretary
> ```

## 기술 스택

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Supabase** (Postgres + Auth + RLS)
- **Tailwind CSS v4** + shadcn/ui + Pretendard

## 포함된 기능 (메뉴)

고객관리 · 프로젝트관리 · 할일관리 · 일정관리 · 미팅관리 · 명함관리 · 자료실 ·
견적관리 · 매출관리 · 입금관리 · 매입관리 · 카드사용내역 · 영업이익분석 ·
재직증명서 · 법인카드 · 직원관리 · 시스템설정

## 빠른 시작

```bash
npm install
supabase login                  # 브라우저 인증 (대시보드 키 복사 불필요)
supabase projects create "kim-secretary" --org-id <org> --db-password <pw> --region ap-northeast-2
cp .env.example .env.local
supabase projects api-keys --project-ref <ref>   # anon/service_role 키를 .env.local 에 기입
supabase link --project-ref <ref> && supabase db push   # 테이블 생성
npm run setup:admin             # 기본 관리자 계정 생성 → admin / jadong!
npm run dev                     # http://localhost:3000  (admin / jadong! 로 로그인)
```

> 로그인 후 **사이드바 하단 '내 이름' → 마이페이지**에서 비밀번호를 꼭 바꾸세요.

자세한 내용은 **[SETUP.md](./SETUP.md)** 참고.

## 선택(심화) 연동

키가 없어도 앱은 동작합니다. 필요할 때 **[시스템설정]** 화면 또는 `.env.local` 에서 켜세요.

| 기능 | 필요한 키 |
|------|-----------|
| 명함 OCR / 입금 AI매칭 / AI견적 | Google Gemini |
| 세금계산서 발행 | Bolta |
| Slack 알림 | Slack Bot |
| 메일/캘린더/드라이브 | Google (기본 비활성) |

## 참고

학습용 템플릿입니다. 회사 정보(상호·대표자·사업자번호·계좌 등)는 비어 있으니
본인 정보로 채워 사용하세요. 자세한 규약은 [CLAUDE.md](./CLAUDE.md) 참고.
