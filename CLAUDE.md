# 김비서 템플릿 — 프로젝트 안내 (Claude Code 용)

자연어로 사내 업무를 다루는 AI 비서형 업무관리 시스템(Next.js 16 + Supabase)의 학습용 템플릿입니다.
처음 클론한 사용자는 대부분 초보자입니다. 친절하게, 한 번에 한 단계씩 안내하세요.

---

## 🚀 초기 설정 도우미

**트리거:** 사용자가 "초기 설정 도와줘", "설치 도와줘", "설치해줘", "세팅 도와줘", "처음부터 같이 해줘",
"setup", 또는 **GitHub 주소만 주며 "설치해줘"** 라고 하면 **아래 절차를 순서대로 진행**한다.
(사람용 상세본: `SETUP.md`)

### 진행 원칙
- **한 번에 한 단계.** 각 단계를 실행/안내하고, 결과를 확인한 뒤 다음으로 넘어간다. 한꺼번에 쏟아내지 않는다.
- **OS 를 먼저 파악한다.** Windows 와 macOS 는 설치 명령이 다르다(`winget` vs Homebrew/설치파일, `copy` vs `cp`).
  현재 OS 를 확인하고 그에 맞는 명령만 안내한다. 모르면 사용자에게 묻는다.
- **OS 레벨 설치는 대화형일 수 있음을 인지한다.** git·Node 설치는 UAC(윈도우) 승인 클릭이나 설치 마법사(맥)가
  뜰 수 있어 **클로드코드가 100% 무인 자동화할 수 없다.** 이 구간은 명령을 `!` 로 띄워 주고, 사용자가
  팝업을 승인/완료하도록 또렷이 안내한 뒤 결과를 확인한다. 그 다음 단계(supabase CLI~)부터는 네가 자동 처리한다.
- **⚠️ 새로 설치한 명령은 현재 세션에서 바로 안 잡힌다(특히 Windows).** winget/npm 등으로 supabase CLI 를
  방금 깔면 **이미 떠 있는 터미널·Claude Code 세션은 PATH 가 갱신되지 않아** 같은 창에서 `! supabase ...` 하면
  `command not found`/`...은(는) 인식되지 않습니다` 가 난다. 이때 **재시작을 시키지 말고, 네가 직접 설치 경로를 찾아
  완성된 명령을 사용자에게 바로 제시한다.** 절차(전부 네가 한다 — 사용자에게 경로를 묻거나 조립시키지 않는다):
  1. 네가 `npm prefix -g` 를 실행해 prefix 를 알아낸다(npm 은 보통 같은 세션에서 동작한다).
  2. supabase 풀패스를 만든다 — **Windows:** `<prefix>\supabase.cmd`, **macOS/Linux:** `<prefix>/bin/supabase`.
  3. 네가 `"<풀패스>" --version` 으로 실제로 실행되는지 확인한다.
  4. 이후 **비대화형 supabase 명령(`projects list`/`api-keys`/`db push`/`link` 등)은 네가 그 풀패스로 직접 실행**한다.
     예: `"C:\Users\실제계정\AppData\Roaming\npm\supabase.cmd" projects list -o json` (경로는 실측값으로).
  - **단, `supabase login` 은 예외(아래 ⚠️ 참고) — 풀패스로 `!` 에 넣지 말 것.** 그건 브라우저가 안 열리고 토큰 모드로 빠진다.
  - (풀패스로도 안 되는 예외 상황에서만) VS Code/터미널 재시작 → `claude` 재실행 → "이어서 설치해줘" 를 폴백으로 안내한다.
- **⚠️ `supabase login` 은 반드시 사용자가 "새/일반 터미널"에서 직접 실행한다 — `!` 로 시키지 않는다.**
  `login` 은 브라우저를 여는 **대화형** 명령인데, Claude Code 의 `!`(비대화형/에이전트 환경)에서 실행하면 CLI 가 이를 감지해
  **브라우저 대신 "액세스 토큰을 입력하라"** 는 모드로 빠진다(초보자가 여기서 막힘). 그래서 로그인은 이렇게 안내한다:
  **"새 터미널(또는 cmd)을 열고 `supabase login` 을 직접 실행하세요 — 브라우저가 열려 인증됩니다."**
  (새 터미널은 PATH 도 갱신돼 있어 `supabase` 가 바로 잡힌다.) 인증이 끝나면 토큰이 저장되어, 이후 비대화형 명령은
  네가 같은 머신에서 풀패스로 이어서 처리할 수 있다.
- **그 밖의 대화형 입력**(DB 비밀번호 등)도 사용자가 직접 실행하게 한다. `! 명령어` 는 이 세션에서 실행되지만,
  **브라우저·대화형 프롬프트가 필요한 명령(특히 `login`)은 `!` 가 아니라 사용자의 실제 터미널**에서 돌려야 한다.
- **비밀키**는 사용자가 채팅에 붙여넣으면 네가 `.env.local` 에 적어준다. 키 값을 채팅에 도로 출력하지 않는다.
- **에러가 나면** 메시지를 그대로 읽고, 원인과 해결책을 한국어로 쉽게 설명한 뒤 다시 시도한다.
- 진행 상황을 짧게 요약해 사용자가 지금 어디쯤인지 알게 한다.

### 단계
> **핵심 방침:** 대시보드에서 키를 손으로 복사하게 하지 않는다. **supabase CLI 로 로그인→프로젝트 생성→키 조회까지
> 자동화**해서, 사용자는 브라우저 로그인과 DB 비밀번호 입력만 하면 되게 한다. 이것이 가장 빠른 설치 경로다.

0. **환경 부트스트랩 (필수 프로그램 확인·설치)** — 김비서 실행에 필요한 3가지: **git**(코드 받기),
   **Node.js 20.9 이상 + npm**(빌드·실행), **supabase CLI**(DB). 먼저 한 번에 점검한다:
   `git --version`, `node -v`, `npm -v`, `supabase --version`. 없는 것만 OS 에 맞춰 깐다.
   - **Windows** (대부분 `winget` 사용 가능):
     - git: `winget install --id Git.Git -e`
     - Node LTS: `winget install --id OpenJS.NodeJS.LTS -e`  ← Node 가 npm·supabase CLI 의 전제
     - (winget 자체가 없으면 https://nodejs.org LTS, https://git-scm.com 설치파일 안내)
   - **macOS**:
     - git: `git --version` 을 한 번 실행하면 Xcode Command Line Tools 설치창이 뜬다(또는 `xcode-select --install`).
     - Node LTS: Homebrew 가 있으면 `brew install node`, 없으면 https://nodejs.org LTS 설치파일 안내.
   - **supabase CLI** (git·Node 가 준비된 뒤): `npm install -g supabase` — **Windows/macOS 모두 동작**한다.
     (macOS 는 `brew install supabase/tap/supabase` 도 가능.) 이 흐름은 CLI 로 프로젝트 생성·키 조회까지
     자동화하므로 CLI 설치가 **필수**다.
   - git·Node 설치는 승인 팝업/마법사가 뜰 수 있다 → `!` 로 명령을 띄우고 사용자가 완료하게 한 뒤 버전을 재확인한다.
   - **설치 직후 `--version` 으로 인식되는지 꼭 확인한다.** Windows 에서 방금 깐 supabase 가 `command not found`/
     `인식되지 않습니다` 로 안 잡히면 PATH 미갱신 문제다 → **재시작 시키지 말고, 네가 `npm prefix -g` 로 경로를 찾아
     `<prefix>\supabase.cmd` 풀패스로 비대화형 명령(`--version`/`projects list` 등)을 직접 실행**한다(위 진행 원칙 ⚠️ 절차).
     단 **`login` 은 풀패스 `!` 로 하지 말고** 사용자가 새 터미널에서 `supabase login` 을 직접 실행하게 한다(브라우저 필요).
1. **코드 받기 (URL 만 받은 경우)** — 사용자가 폴더를 안 열고 GitHub 주소만 줬다면 먼저 클론한다:
   `git clone https://github.com/hoechul/kimseo-template.git my-secretary` 후 그 폴더로 이동한다.
   이미 이 폴더가 열려 있으면(= `package.json` 이 보이면) 이 단계는 건너뛴다. 이어서 `npm install` 을 실행한다.
2. **Supabase 로그인 (사용자가 새 터미널에서 직접)** — **`!` 로 시키지 말고**, 사용자에게
   **"새 터미널(또는 cmd)을 열어 `supabase login` 을 직접 실행"** 하라고 안내한다. 브라우저가 열려 인증하면
   토큰이 자동 저장된다(대시보드 접속·키 복사 불필요). ⚠️ `! supabase login`(비대화형)으로 하면 브라우저 대신
   토큰 입력 모드로 빠져 막히므로 쓰지 않는다. 인증 완료 후(네가 `supabase projects list` 풀패스 등으로 확인) 다음 단계로.
3. **프로젝트 준비** — 로그인 후 네가 직접 명령으로 처리한다. 두 갈래 중 하나:
   - **새로 만들기(기본):** **DB 비밀번호는 사용자에게 묻지 말고 네가 강력하게 생성한다.**
     `node -e "console.log(require('crypto').randomBytes(18).toString('hex'))"` 같은 방식으로 특수문자 없는
     안전한 값을 만들고, **이 비밀번호를 즉시 `.env.local` 의 `SUPABASE_DB_PASSWORD=` 에 저장**한다(채팅에 출력하지 않음).
     `supabase orgs list -o json` 으로 조직 ID 를 확인하고(여러 개면 사용자가 고르게 한다), 리전은 `ap-northeast-2`(서울)
     기본으로, **네가 직접** 생성한다(사용자에게 실행시키지 않는다):
     `supabase projects create "kim-secretary" --org-id <org> --db-password <생성한비밀번호> --region ap-northeast-2 -o json`
   - **기존 프로젝트 사용:** `supabase projects list -o json` 결과를 보여주고 쓸 프로젝트를 고르게 한다.
     (이 경우 DB 비밀번호는 네가 모르므로, `link` 단계에서 사용자에게 한 번 입력받아 `.env.local` 에 저장한다.)
   - 어느 쪽이든 결과에서 **project ref**(`<ref>`)를 확보한다. 새 프로젝트는 준비에 1~2분 걸릴 수 있어
     `ACTIVE_HEALTHY` 가 될 때까지 `supabase projects list -o json` 으로 상태를 확인한 뒤 다음으로 넘어간다.
4. **키 자동 조회 & `.env.local` 작성** — 네가 직접 처리한다(사용자가 키를 복사할 필요 없음):
   - `supabase projects api-keys --project-ref <ref> -o json` 으로 `anon` 과 `service_role` 키를 받는다.
   - `cp .env.example .env.local`(Windows cmd 면 `copy`) 후 다음을 채운다:
     `NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>`,
     `SUPABASE_SERVICE_ROLE_KEY=<service_role>`, 그리고 **`SUPABASE_DB_PASSWORD=<3단계에서 생성한 비밀번호>`**.
     `NEXT_PUBLIC_AUTH_EMAIL_DOMAIN` 은 기본값(example.com) 유지.
   - service_role·DB 비밀번호는 비밀값이므로 채팅에 값을 다시 출력하지 않는다(`.env.local` 에만 저장).
5. **연결 & DB 생성** — 비밀번호를 네가 갖고 있으므로 **사용자 개입 없이 네가 직접** 실행한다:
   - `supabase link --project-ref <ref> -p <SUPABASE_DB_PASSWORD>` (3·4단계에서 저장한 값을 그대로 사용).
   - 이어서 `supabase db push --yes` 를 실행한다(`--yes` 로 확인 프롬프트 자동 통과). 테이블/정책 51개가 생성된다.
   - (기존 프로젝트를 골랐고 비밀번호를 모르면) 이때만 사용자에게 한 번 입력받아 `.env.local` 에 저장한 뒤 진행한다.
   - `project not ready`/연결 오류면 프로젝트 준비(1~2분)를 기다렸다가, 또는 login/link 를 재확인 후 재시도한다.
6. **첫 관리자 생성** — 이 앱은 **회원가입 화면이 없다.** 로그인 계정은 이 단계로 만드는 관리자 1개로 시작한다.
   `npm run setup:admin` 만 실행하면 **고정 기본 계정 `admin` / `claudeai!`** 로 생성된다(외우기 쉬운 강의용 기본값).
   사용자에게 **ID `admin`, 비밀번호 `claudeai!`** 를 또렷하게 알린다. (직원 추가는 로그인 후 [직원관리] 화면에서.)
7. **실행 & 로그인** — `npm run dev` 를 백그라운드로 띄운다. 시작 시 `admin / claudeai!` 가 배너로 강조 출력된다.
   http://localhost:3000 에서 **이메일이 아니라 ID `admin` / 비밀번호 `claudeai!`** 로 로그인하라고 알린다.
   로그인 직후 **왼쪽 사이드바 맨 아래 '내 이름' 클릭 → 마이페이지(`/dashboard/my`)에서 비밀번호를 꼭 바꾸라고** 안내한다.
8. **완료** — 축하 인사와 함께, 회사정보·외부연동(Gemini/Bolta/Slack)은 **선택(심화)** 이며
   `SETUP.md` 6장 또는 [시스템설정] 화면에서 나중에 켤 수 있다고 알린다.

### 자주 나는 문제
- **`supabase` 가 방금 설치했는데 `command not found`/`인식되지 않습니다`(특히 Windows)** →
  현재 세션 PATH 미갱신 문제다. **재시작 시키지 말고 네가 경로를 찾아 비대화형 명령은 풀패스로 직접 실행:**
  `npm prefix -g` → `<prefix>\supabase.cmd`(Windows)/`<prefix>/bin/supabase`(mac) → `"<풀패스>" --version` 확인 →
  이후 `projects list`/`api-keys`/`db push` 등은 풀패스로 네가 실행. (단 `login` 은 풀패스 `!` 로 하지 말 것 — 아래 항목)
- **`supabase login` 했더니 브라우저 대신 "토큰을 입력하라"고 나옴** → `login` 을 비대화형(`!`/풀패스 `!`)에서 돌려서다.
  **사용자가 새 터미널(또는 cmd)을 열어 `supabase login` 을 직접 실행**하게 하면 브라우저가 열린다(새 터미널은 PATH 도 해결).
- `supabase projects create`/`api-keys` 가 인증 오류 → 사용자가 **새 터미널에서 `supabase login`** 을 먼저 했는지 확인.
- `supabase db push` 가 `project not ready`/연결 오류 → 새 프로젝트 준비(1~2분)를 기다린 뒤,
  `supabase link --project-ref <ref>` (DB 비밀번호) 를 재확인하고 재시도.
- `npm run build` 실패 → `.env.local` 의 Supabase 값(URL/anon/service_role)이 채워졌는지 확인 (빌드에 필요).
- `setup:admin` 이 비밀번호 길이 오류 → 비밀번호는 **6자 이상**이어야 한다(Supabase Auth 기본 정책).
- 로그인 안 됨 → ① 이메일이 아니라 **ID(`admin`)** 로 시도했는지 확인, ② `npm run setup:admin -- admin <새비밀번호>` 로 재설정.

---

## 포함 기능 (메뉴)

고객관리 · 프로젝트관리 · 할일관리 · 일정관리 · 미팅관리 · 명함관리 · 자료실 · 견적관리 ·
매출관리 · 입금관리 · 매입관리 · 카드사용내역 · 영업이익분석 · 재직증명서 · 법인카드 ·
직원관리 · 시스템설정

> 회사 정보(상호/대표자/사업자번호/계좌)는 비어 있다. 견적서·재직증명서를 쓰려면
> `src/lib/quotation-constants.ts`, `src/app/dashboard/certificates/page.tsx` 에서 값을 채운다.
> Google(메일/캘린더/드라이브)·세금계산서(Bolta)·Slack 코드는 기본 비활성이며 키를 넣으면 동작한다.

---

## Project Conventions

### Git Rules
- 커밋 메시지는 한국어로 작성한다. 화면명·기능명·변경 목적을 구체적으로 적는다.
  예: `프로젝트관리 일정 요일 표기 추가`, `고객관리 담당자 상세보기 추가`
- 작업이 끝나면 즉시 커밋한다. 미커밋 상태로 작업을 종료하지 않는다.
- push와 배포는 사용자가 명시적으로 요청할 때만 수행한다.
- 하나의 커밋에는 하나의 목적(기능, 버그 수정, 리팩터링)만 담는다.

### Supabase 마이그레이션
- 최초 설치는 위 "초기 설정 도우미" 또는 `SETUP.md` 를 따른다.
- 스키마를 바꾸면 `supabase/migrations/` 에 새 마이그레이션 파일을 만들고 `supabase db push` 로 적용한다.
- DB 스키마를 바꾸는 코드(컬럼 신규/삭제, 제약 변경 등)는 항상 마이그레이션 + 적용까지 한 사이클로 끝낸다.

### Font
- Pretendard만 사용한다. Geist, Inter 등 다른 폰트를 추가하지 않는다.

### UI Pattern: List -> Detail Page
- 목록 행 클릭 → 상세 페이지 이동. 목록에 수정/삭제 버튼 노출하지 않는다.
- 등록은 목록에서, 수정은 별도 편집 페이지(`/[id]/edit/page.tsx`)를 사용한다.
- 상세 페이지 브레드크럼: `{리소스명} / {항목명}`. 상단 헤더에 수정·삭제·주요 액션 배치.
- 삭제는 `confirm()` 이후 목록으로 이동한다.

### UI Pattern: StatCard 모바일
- 모바일: 라벨과 값만 표시. 아이콘·설명글은 `hidden md:flex` / `hidden md:block`으로 데스크톱 전용.
- 금액 StatCard는 `mobileValue` prop에 `formatAmountInMan()`으로 만 단위 표시.

### 메모 기능 공통 규칙
- 메모(추가/수정/삭제)는 프로젝트관리와 고객관리가 공유하는 기능이다. 한쪽을 수정하면 다른 쪽도 같이 수정한다.
- 상세 규칙은 `docs/MEMO_RULES.md` 참고.
