# Main Process

## 개요

Electron 메인 프로세스. 앱 라이프사이클, 윈도우 관리, IPC, 시스템 통합 담당.

## 파일별 역할

| 파일 | 역할 |
|------|------|
| index.ts | 앱 엔트리포인트, 라이프사이클 (ready, quit), 동기화 스케줄러 (5분) |
| ipc-handlers.ts | 렌더러↔메인 IPC 핸들러 등록 (40+ 핸들러) |
| window-manager.ts | BrowserWindow 생성 (메인, 설정, 온보딩), 권한 알림 |
| capture-session.ts | 캡처 세션 관리, 이미지 갤러리, 분석 결과 처리 |
| hotkey.ts | 글로벌 단축키 등록/해제 (기본 ⌘+Shift+L) |
| tray.ts | 메뉴바 트레이 아이콘 + 컨텍스트 메뉴 |
| oauth-handlers.ts | Deep link 콜백 처리 (Slack, Gmail, Notion OAuth) |
| i18n.ts | i18next 초기화, 언어 변경, 번역 함수 (t) |
| state.ts | AppState 싱글톤 (윈도우, 캐시, 서비스 인스턴스) |
| types.ts | CaptureSession, OAuthCallback 등 공통 타입 |

## IPC 핸들러 구조

`ipc-handlers.ts`의 `registerIpcHandlers()`에서 모든 핸들러 등록.
카테고리별 그룹:

### Linear 데이터

- get-teams, get-projects, get-users, get-states, get-cycles, get-labels
- create-issue: 이슈 생성 → Linear API + R2 업로드
- reload-linear-data: 캐시 갱신

### 캡처

- start-capture: captureSession 시작
- add-capture: 갤러리에 이미지 추가
- cleanup-session: 세션 정리

### AI 분석

- analyze-images: Worker API로 분석 요청
- get-ai-recommendations: 컨텍스트 기반 추천

### 동기화

- sync-status: 소스별 동기화 상태
- sync-source: 특정 소스 동기화 실행
- search-context: 하이브리드 검색

### 설정

- get/set 설정값 (토큰, 언어, 단축키 등)
- Slack/Gmail/Notion OAuth 시작/상태

## OAuth Deep Link 플로우

1. 렌더러에서 OAuth 시작 → 브라우저 열림
2. 사용자 인증 완료 → `linear-capture://{provider}/callback?code=xxx` 리다이렉트
3. macOS가 deep link를 앱에 전달 → `index.ts`의 `open-url` 이벤트
4. `oauth-handlers.ts`의 `handleDeepLink(url)` 호출
5. URL 파싱 → code/state 추출 → 해당 서비스의 `handleCallback()` 호출
6. 성공 시 settingsWindow에 IPC로 결과 전송 + 자동 동기화 트리거

지원 프로바이더: Slack, Gmail, Notion (각각 `parsed.hostname`으로 분기)

## AppState 구조

`state.ts`의 싱글톤 상태:

- **윈도우**: mainWindow, onboardingWindow, settingsWindow
- **Linear 캐시**: teams, projects, users, states, cycles, labels
- **서비스**: geminiAnalyzer, anthropicAnalyzer, slackService, notionService, gmailService, captureService
- **OAuth 대기**: pendingSlackCallback, pendingNotionCallback, pendingGmailCallback

## 앱 라이프사이클

`index.ts`의 주요 흐름:

1. `app.ready` → `initI18n` → 서비스 초기화 → DB 초기화 → 트레이 생성
2. 온보딩 필요시 → onboarding 윈도우, 아니면 → hotkey 등록
3. 5분 간격 동기화 스케줄러 시작
4. `app.quit` → DB 종료, Notion reader 정리, 단축키 해제
