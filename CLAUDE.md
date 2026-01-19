# Linear Capture

macOS 화면 캡처 → Linear 이슈 자동 생성 앱 (v1.2.1)

## 실행 방법

```bash
cd linear-capture
npm install
npm start
```

**참고**: Claude Code 환경에서는 `ELECTRON_RUN_AS_NODE=1`이 설정되어 있어 `package.json`의 start 스크립트에 `unset ELECTRON_RUN_AS_NODE`가 포함되어 있음.

## 아키텍처

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│  Electron App   │────▶│  Cloudflare Worker (linear-capture-ai) │
│  (Linear Capture)│     │  - AI 분석 (Haiku/Gemini)           │
└─────────────────┘     │  - R2 이미지 업로드                  │
        │               └─────────────────────────────────────┘
        │
        ▼
┌─────────────────┐
│  Linear API     │
│  (이슈 생성)     │
└─────────────────┘
```

**핵심**: API 키(Anthropic, Gemini, R2)는 모두 Worker에서 관리. 앱에는 Linear API 토큰만 필요.

## 프로젝트 구조

```
linear-capture/
├── src/
│   ├── main/
│   │   ├── index.ts          # 메인 프로세스, IPC 핸들러
│   │   ├── hotkey.ts         # ⌘+Shift+L 글로벌 단축키
│   │   └── tray.ts           # 메뉴바 아이콘
│   ├── renderer/
│   │   ├── index.html        # 이슈 생성 폼 UI
│   │   └── settings.html     # 설정 UI
│   └── services/
│       ├── capture.ts        # macOS screencapture 호출
│       ├── r2-uploader.ts    # Worker 통해 R2 업로드
│       ├── anthropic-analyzer.ts  # Worker 통해 AI 분석
│       ├── linear-client.ts  # Linear SDK 래퍼
│       └── auto-updater.ts   # 자동 업데이트
├── .env                      # LINEAR_API_TOKEN만 필요
└── package.json
```

## 설정 (.env)

```env
LINEAR_API_TOKEN=lin_api_xxxxx
DEFAULT_TEAM_ID=e108ae14-a354-4c09-86ac-6c1186bc6132
```

**참고**: R2/Gemini/Anthropic API 키는 Worker에서 관리되므로 앱에는 불필요.

## 사용자 흐름

1. `⌘+Shift+L` 또는 메뉴바 아이콘 클릭
2. 화면 영역 드래그 선택
3. 갤러리에 이미지 추가 (최대 10장)
4. "분석 시작" 버튼으로 AI 분석
5. 필요시 수정 후 "Create Issue" 클릭
6. 성공 화면에서 "Linear에서 보기" 또는 "닫기"

## 개발 명령어

```bash
npm run start        # 빌드 후 실행
npm run build        # TypeScript 컴파일
npm run dist:mac     # DMG 패키징
npm run reinstall    # 완전 클린 재설치 (권한 리셋 포함)
```

## 배포

```bash
# 버전 업 + 태그 푸시 → GitHub Actions 자동 빌드
npm version patch
git push origin master --tags
# Draft 릴리즈 → Publish 필요
gh release edit vX.X.X --repo chat-prompt/linear-capture --draft=false
```

## Worker (linear-capture-ai)

**URL**: `https://linear-capture-ai.ny-4f1.workers.dev`

**엔드포인트**:
- `POST /` or `/analyze` - AI 분석 (Haiku 또는 Gemini)
- `POST /upload` - R2 이미지 업로드

**Secrets** (wrangler secret):
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`

**R2 바인딩**: `linear-captures` 버킷

## 권한 문제 해결

```bash
# TCC 권한 리셋 (화면 녹화 권한 문제 시)
tccutil reset ScreenCapture com.gpters.linear-capture

# 앱 재시작 후 Finder에서 우클릭 → 열기
```

## 자동 업데이트

- GitHub Releases에서 `latest-mac.yml` 확인
- **제한**: Ad-hoc 서명으로 자동 설치 불가 (Gatekeeper 차단)
- **현재 동작**: 업데이트 감지 → 다운로드 → 설치 실패 → 수동 설치 필요
- **해결책**: Apple Developer 인증서로 서명 필요

## Ad-hoc 서명 주의사항

- `hardenedRuntime: false` 유지
- 네이티브 모듈 사용 금지
- 최초 실행 시 Finder에서 우클릭 → "열기"
- 업데이트 후 TCC 권한 리셋 필요할 수 있음
