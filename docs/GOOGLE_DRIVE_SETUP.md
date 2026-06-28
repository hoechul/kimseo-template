# Google Drive 연동 가이드 (심화)

김비서는 **고객·프로젝트를 만들 때 구글 드라이브에 폴더를 자동으로 생성**하고, 명함·자료실 파일을
드라이브에 업로드할 수 있습니다. **기본은 꺼져 있고**, 아래를 설정하면 켜집니다.

> 막히면 이 문서를 **Claude Code 에게 보여주고** "여기 3단계에서 막혔어" 처럼 물어보세요.

연동에는 **구글 서비스 계정(Service Account)** 을 씁니다. 개인 구글 로그인이 아니라,
"앱 전용 로봇 계정"을 만들어 그 계정에게 내 드라이브 폴더를 공유하는 방식입니다.

전체 흐름: **① GCP 프로젝트 → ② Drive API 켜기 → ③ 서비스 계정·키 만들기 → ④ `.env.local` 입력 →
⑤ 드라이브 폴더를 서비스 계정에 공유 → ⑥ 켜고 확인**

---

## 1. Google Cloud 프로젝트 만들기

1. https://console.cloud.google.com 접속(구글 로그인).
2. 상단 프로젝트 선택 → **새 프로젝트** → 이름(예: `kim-secretary`) → 만들기.

## 2. Google Drive API 켜기

1. 좌측 메뉴 **API 및 서비스 → 라이브러리**.
2. `Google Drive API` 검색 → **사용 설정(Enable)**.

## 3. 서비스 계정 + 키(JSON) 만들기

1. **API 및 서비스 → 사용자 인증 정보(Credentials)** → **사용자 인증 정보 만들기 → 서비스 계정**.
2. 이름(예: `kim-secretary-drive`) 입력 → 만들기 → 역할은 비워도 됨 → 완료.
3. 만들어진 서비스 계정 클릭 → **키(KEYS)** 탭 → **키 추가 → 새 키 만들기 → JSON** → 다운로드.
4. 받은 JSON 파일을 열면 다음 두 값이 있습니다(곧 사용):
   - `client_email` → 예: `kim-secretary-drive@...iam.gserviceaccount.com`
   - `private_key` → `-----BEGIN PRIVATE KEY-----\n...` 로 시작하는 긴 문자열

## 4. `.env.local` 에 값 넣기

`.env.local` 을 열어 아래를 추가/수정합니다.

```
NEXT_PUBLIC_DRIVE_ENABLED=true
GOOGLE_SERVICE_ACCOUNT_EMAIL=<JSON의 client_email>
GOOGLE_PRIVATE_KEY="<JSON의 private_key 전체>"
GOOGLE_DRIVE_ROOT_FOLDER_ID=<5단계에서 만들 폴더 ID>
```

> ⚠️ `GOOGLE_PRIVATE_KEY` 는 **큰따옴표로 감싸고**, JSON 안의 `\n` 글자를 **그대로** 두세요(코드가 알아서 줄바꿈으로 바꿉니다).
> 예: `GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"`

## 5. 드라이브 폴더 만들고 서비스 계정에 공유 ★ 가장 중요

서비스 계정은 "남의 로봇 계정"이라, 내 드라이브 폴더를 **명시적으로 공유**해야 글을 쓸 수 있습니다.

1. https://drive.google.com 에서 폴더를 하나 만듭니다(예: `김비서`).
2. 그 폴더 우클릭 → **공유** → 3단계의 **서비스 계정 이메일**(`...iam.gserviceaccount.com`)을 추가 →
   권한을 **편집자(Editor)** 로 → 보내기.
3. 그 폴더를 열고 주소창의 `https://drive.google.com/drive/folders/`**`<이부분이 폴더 ID>`** 를 복사해
   `.env.local` 의 `GOOGLE_DRIVE_ROOT_FOLDER_ID` 에 넣습니다.

> 공유 없이 폴더 ID 만 넣으면 `폴더 생성 실패`가 납니다. 5-2(공유)를 꼭 하세요.
> 회사 공용 **공유 드라이브(Shared Drive)** 를 쓰면 서비스 계정을 그 드라이브 멤버로 추가하면 됩니다.

## 6. 켜고 확인

1. 개발 서버를 **재시작**합니다(`Ctrl+C` 후 `npm run dev`). 환경변수는 재시작해야 반영됩니다.
2. 고객 또는 프로젝트를 하나 새로 만들어 봅니다.
3. 구글 드라이브의 루트 폴더 안에 **방금 만든 이름의 폴더가 생기면 성공**입니다.
   상세 페이지의 파일 영역에서 업로드/조회도 됩니다.

---

## 폴더를 영역별로 나누고 싶다면 (선택)

기본은 고객·프로젝트·명함·자료실이 모두 `GOOGLE_DRIVE_ROOT_FOLDER_ID` 아래에 생성됩니다.
영역별로 다른 폴더에 넣고 싶으면 아래를 추가하세요(각각 5번처럼 서비스 계정에 공유 필요).

```
NEXT_PUBLIC_CUSTOMERS_DRIVE_FOLDER_ID=<고객용 폴더 ID>
BUSINESS_CARD_DRIVE_FOLDER_ID=<명함용 폴더 ID>
RESOURCE_LIBRARY_DRIVE_FOLDER_ID=<자료실용 폴더 ID>
```

## 자주 막히는 곳

- **"Drive 폴더 생성 실패"** → 5단계 폴더 공유(편집자)와 폴더 ID, 서비스 계정 이메일을 다시 확인.
- **`invalid_grant` / 인증 오류** → `GOOGLE_PRIVATE_KEY` 가 큰따옴표로 감싸졌는지, `\n` 이 그대로인지 확인.
- **켜도 반응 없음** → `NEXT_PUBLIC_DRIVE_ENABLED=true` 인지, 서버를 재시작했는지 확인.
- **Vercel 배포 시** → 같은 환경변수를 Vercel 프로젝트 설정에도 넣으세요(`GOOGLE_PRIVATE_KEY` 는 줄바꿈 주의).

> 연동을 끄려면 `NEXT_PUBLIC_DRIVE_ENABLED` 를 `false` 로 두거나 지우면 됩니다. 끄면 폴더 자동 생성을 건너뜁니다.
