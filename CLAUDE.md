# Linear Capture

macOS/Windows 화면 캡처 → Linear 이슈 자동 생성 Electron 앱 (v1.2.10)

## 핵심 규칙

- **테스트는 반드시 `npm run pack:clean`** (`npm start` 금지 - 캡처 권한 문제)
- **UI 텍스트 수정 후 반드시 `npm run translate` 실행**
- Claude Code 환경: `ELECTRON_RUN_AS_NODE=1` → start 스크립트에 `unset` 포함

## .env (필수)
```
LINEAR_API_TOKEN=lin_api_xxxxx
DEFAULT_TEAM_ID=e108ae14-a354-4c09-86ac-6c1186bc6132
```

## 아키텍처
- Electron App → Cloudflare Worker (`linear-capture-ai`) for AI 분석 + R2 업로드
- PGlite DB (벡터검색+FTS) + Notion 로컬캐시 (sql.js) + OpenAI 임베딩
- Linear API (이슈 생성) + Slack/Gmail API (OAuth)
- AI API 키는 Worker에서 관리, 앱에 불필요. 로컬 검색용 OpenAI key만 앱 Settings에서 설정

## 프로젝트 구조
```
src/
├── main/
│   ├── index.ts, preload.ts, window-manager.ts, state.ts
│   ├── capture-session.ts, hotkey.ts, tray.ts, oauth-handlers.ts, i18n.ts
│   └── ipc-handlers/    # 9개 도메인별 핸들러 파일
├── renderer/
│   ├── index.html(270줄), settings.html(235줄), onboarding.html
│   ├── scripts/         # main/(8), settings/(11), shared/(3) 모듈
│   └── styles/          # CSS 5파일
├── services/
│   ├── sync-adapters/   # base + 4개 소스 어댑터
│   ├── context-adapters/ # 4개 소스 포맷터
│   ├── notion/          # 로컬 캐시 파서 4파일
│   ├── config.ts, database.ts, local-search.ts, search-service.ts
│   ├── ai-analyzer.ts, embedding-client.ts, reranker.ts
│   └── *-client.ts      # Linear, Slack, Gmail, Notion API
└── types/
```

## 개발 명령어
```bash
npm run pack:clean   # ⭐ 클린 빌드+실행 (유일한 테스트 방법)
npm run build        # TypeScript 컴파일
npm run dist:mac     # DMG 패키징 (서명+공증 - 배포용)
npm run translate    # i18n 자동 번역
npm run validate:i18n # i18n 검증
npx vitest run       # 전체 테스트 1회 실행
```

## i18n
- `locales/en/translation.json`이 기준 → `npm run translate`로 ko, de, fr, es 자동 생성
- 기존 번역 유지, `{{variable}}` 보존

## 배포
```bash
npm version patch && npm run dist:mac
git push origin master --tags
gh release create vX.X.X "release/Linear Capture-X.X.X-universal.dmg" \
  "release/Linear Capture-X.X.X-universal-mac.zip" "release/latest-mac.yml" \
  --title "vX.X.X" --notes "변경사항"
```
- Apple Developer ID 서명+공증 (Geniefy Inc.)
- `latest-mac.yml`: GitHub가 공백→`.` 치환하므로 `Linear.Capture-X.X.X` 형식 사용

## Worker (linear-capture-ai)
- URL: `https://linear-capture-ai.ny-4f1.workers.dev`
- `POST /analyze` AI 분석 | `POST /upload` R2 업로드
- Secrets: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | R2: `linear-captures` 버킷

## 권한 참고
- macOS TCC: 앱이 `screencapture` 호출해야 권한 목록 등록됨
- 권한 리셋: `tccutil reset ScreenCapture com.gpters.linear-capture`
- 온보딩 리셋: `rm -rf ~/Library/Application\ Support/linear-capture`
- 프로젝트-팀 불일치 시 자동 전환 로직 있음 (`onSelect` 콜백)
