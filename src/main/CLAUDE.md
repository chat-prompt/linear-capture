# Main Process

## 개요

Electron 메인 프로세스. 앱 라이프사이클, 윈도우 관리, IPC, 시스템 통합 담당.

## 파일별 역할

| 파일 | 역할 |
|------|------|
| index.ts | 앱 엔트리포인트, 라이프사이클 (ready, quit), 동기화 스케줄러 (5분) |
| preload.ts | 화이트리스트 기반 IPC 브릿지 (contextBridge) |
| window-manager.ts | BrowserWindow 생성 (메인, 설정, 온보딩), contextIsolation 적용 |
| capture-session.ts | 캡처 세션 관리, 이미지 갤러리, 분석 결과 처리 |
| hotkey.ts | 글로벌 단축키 등록/해제 (기본 Cmd+Shift+L) |
| tray.ts | 메뉴바 트레이 아이콘 + 컨텍스트 메뉴 |
| oauth-handlers.ts | Deep link 콜백 처리 (Slack, Gmail, Notion OAuth) |
| i18n.ts | i18next 초기화, 언어 변경, 번역 함수 (t) |
| state.ts | AppState 싱글톤 (윈도우, 캐시, 서비스 인스턴스) |

## IPC 핸들러 구조 (ipc-handlers/)

도메인별 9개 파일로 분할:

| 파일 | 핸들러 |
|------|--------|
| index.ts | 핸들러 등록 진입점 |
| linear-handlers.ts | 팀/프로젝트/사이클/라벨/이슈 생성 |
| capture-handlers.ts | 캡처 세션 관리 |
| analysis-handlers.ts | AI 분석 + 추천 |
| sync-handlers.ts | 동기화 상태/트리거/커서 리셋 |
| search-handlers.ts | 컨텍스트 검색 + 시맨틱 검색 |
| settings-handlers.ts | 설정 CRUD, 언어, 단축키 |
| oauth-handlers.ts | Slack/Notion/Gmail OAuth + 검색 API |
| onboarding-handlers.ts | 온보딩 완료 처리 |

## 보안 아키텍처

- `contextIsolation: true` + `nodeIntegration: false` (3개 윈도우)
- `preload.ts`가 화이트리스트 기반 IPC 브릿지 제공
  - INVOKE_CHANNELS (37개): ipcRenderer.invoke
  - SEND_CHANNELS (3개): ipcRenderer.send
  - ON_CHANNELS (13개): ipcRenderer.on
- 렌더러는 `window.electronAPI` 통해서만 IPC 접근

## OAuth Deep Link 플로우

1. 렌더러에서 OAuth 시작 → 브라우저 열림
2. 사용자 인증 완료 → `linear-capture://{provider}/callback?code=xxx` 리다이렉트
3. macOS가 deep link를 앱에 전달 → `index.ts`의 `open-url` 이벤트
4. `oauth-handlers.ts`의 `handleDeepLink(url)` 호출
5. URL 파싱 → code/state 추출 → 해당 서비스의 `handleCallback()` 호출
6. 성공 시 settingsWindow에 IPC로 결과 전송 + 자동 동기화 트리거

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
