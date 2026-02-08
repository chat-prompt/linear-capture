# Linear Capture - 개발 로그

Claude Code와 함께 진행한 macOS 스크린샷 캡처 → Linear 이슈 자동 생성 앱 개발 작업 기록입니다.

---

## 2026-01-12 (Day 1)

### 1. Linear Capture 초기 버전 구현

```
macOS용 스크린샷 캡처 → Linear 이슈 자동 생성 앱을 만들고 싶어
```

**Claude 작업:**
- Electron 기반 macOS 앱 초기 구조 생성
- `src/main/index.ts` - Electron 메인 프로세스, IPC 핸들러, 캡처 플로우
- `src/main/hotkey.ts` - ⌘+Shift+L 전역 단축키 등록
- `src/main/tray.ts` - 메뉴바 아이콘 생성
- `src/services/capture.ts` - macOS screencapture CLI 래퍼
- `src/services/r2-uploader.ts` - Cloudflare R2 이미지 업로드
- `src/services/linear-client.ts` - Linear SDK 클라이언트
- `src/renderer/index.html` - 이슈 생성 폼 UI
- TypeScript 설정 및 빌드 스크립트 구성

---

### 2. 이슈 생성 폼 추가 필드 구현

```
팀, 프로젝트, 상태, 우선순위, 담당자, 포인트, 사이클까지 선택할 수 있게 해줘
```

**Claude 작업:**
- 이슈 생성 폼에 8개 필드 추가 (Title, Description, Team, Project, Status, Priority, Assignee, Estimate, Cycle)
- Linear API로 팀/프로젝트/사용자/워크플로우/사이클 데이터 조회
- 팀 선택 시 Status, Cycle 드롭다운 동적 필터링
- `src/renderer/index.html` - 폼 UI 확장 및 연동 로직

---

### 3. Gemini Vision API 기반 AI 자동 분석 기능

```
스크린샷을 AI로 분석해서 이슈 제목, 설명, 프로젝트, 담당자까지 자동으로 채워주면 좋겠어
```

**Claude 작업:**
- Gemini Vision API 통합 (`gemini-2.5-flash-lite` 모델)
- `src/services/gemini-analyzer.ts` - 스크린샷 OCR 및 메타데이터 추천
- 프로젝트 목록(이름+설명), 담당자 목록을 컨텍스트로 제공
- AI가 자동으로 추천:
  - 이슈 제목 (접두어 포함)
  - 마크다운 형식 설명 (## 이슈 / ## 상세 내용 / ## To Do 템플릿)
  - 관련 프로젝트 선택
  - 담당자 매칭
  - 우선순위 (1=긴급, 2=버그, 3=일반, 4=개선)
  - 작업 포인트 (1/2/3/5/8)

---

### 4. AI 분석 성능 최적화 (병렬 처리)

```
R2 업로드하고 AI 분석하는 게 순차적이라 느린데, 병렬로 처리하면 1-2초 빨라질 것 같아
```

**Claude 작업:**
- R2 업로드 + AI 분석 `Promise.all`로 병렬 실행
- `src/main/index.ts` - 캡처 플로우 리팩토링
- 기존: 캡처 → R2 업로드 → AI 분석 (순차)
- 개선: 캡처 → [R2 업로드 || AI 분석] (병렬)
- ~1-2초 성능 개선

---

### 5. AI 모델 선택 UI 추가

```
사용자가 UI에서 Haiku랑 Gemini 중에 선택할 수 있게 해줘
```

**Claude 작업:**
- `src/renderer/index.html` - AI 모델 드롭다운 추가 (Haiku 4.5 / Gemini Flash)
- "Re-analyze" 버튼으로 모델 변경 후 재분석 기능
- `src/services/anthropic-analyzer.ts` - Claude Haiku 4.5 분석기 추가
- Anthropic 우선 → Gemini fallback 전략

---

## 2026-01-13 (Day 2)

### 6. macOS 앱 배포 설정 및 UX 개선

```
DMG로 패키징해서 배포하고 싶어. 그리고 온보딩 화면도 필요해
```

**Claude 작업:**
- electron-builder 설정 추가 (`package.json`)
- DMG 빌드 스크립트 (`npm run dist:mac`)
- Universal binary (Intel + Apple Silicon)
- 온보딩 화면 구현 (`src/renderer/onboarding.html`)
- 화면 녹화 권한 안내 및 자동 설정 열기
- 첫 실행 감지 로직 (electron-store)

---

### 7. AI 폴백 및 권한 처리 개선

```
AI 분석 실패하면 빈 폼으로 진행하게 해줘. 그리고 권한 팝업이 안 뜨는 경우 대비해야 해
```

**Claude 작업:**
- AI 분석 실패 시 빈 폼으로 graceful degradation
- TCC(Transparency, Consent, and Control) 권한 체크
- `systemPreferences.getMediaAccessStatus('screen')` 활용
- 권한 거부 시 설정 열기 안내
- `tccutil reset ScreenCapture` 명령어 문서화

---

## 2026-01-14 (Day 3)

### 8. DMG 패키징 후 핫키 작동 문제 해결

```
개발 모드에서는 핫키가 잘 작동하는데, DMG로 설치하면 앱이 실행이 안 돼
```

**Claude 작업:**
- DMG 패키징 문제 원인 분석 및 해결
- **원인 1**: 네이티브 모듈 (`mac-screen-capture-permissions`) 번들링 실패
  - 해결: Electron 내장 API (`systemPreferences`) 사용
- **원인 2**: `fs.writeFileSync`로 crash 로그 쓰기 권한 문제
  - 해결: `app.getPath('userData')` 사용
- **원인 3**: Hardened Runtime + Ad-hoc 서명 충돌
  - 해결: `hardenedRuntime: false` 설정
- **원인 4**: Gatekeeper 차단
  - 해결: Finder 우클릭 → "Open" 안내
- `package.json` - DMG 빌드 설정 최적화
- CLAUDE.md - 재현 방지 체크리스트 문서화

---

### 9. Settings 기능 구현 시도 및 롤백

```
멤버별로 Linear API 토큰을 설정할 수 있게 Settings 기능을 만들어줘
```

**Claude 작업:**
- Phase 1-6 구현 계획 수립
  - Phase 1: `settings-store.ts` - electron-store 기반 토큰 저장소
  - Phase 2: `settings.html` - 토큰 입력/검증 UI
  - Phase 3: IPC 핸들러 추가
  - Phase 4: Tray 메뉴 Settings 항목 추가
  - Phase 5: 메인 UI Settings 버튼
  - Phase 6: Linear Client 토큰 로직 수정
- **문제 발생**: DMG 패키징 후 앱이 실행되지 않음
- **롤백**: 기능 제거 후 안정 버전(`96275bc`)으로 복구
- CLAUDE.md - Settings 기능 구현 계획 문서화

---

## 2026-01-15 (Day 4)

### 10. Settings 기능 단계별 재구현

```
이번엔 한 단계씩 DMG 테스트하면서 조심히 구현하자
```

**Claude 작업:**

#### Phase 1: Settings Store
- `src/services/settings-store.ts` - 토큰 저장/조회 기능
- encryption 없이 평문 저장 (DMG 안정성 우선)
- `.env` fallback 지원

#### Phase 2: Settings UI
- `src/renderer/settings.html` - 토큰 입력 폼
- Validate 버튼 → Linear viewer API로 토큰 검증
- Save/Clear 버튼

#### Phase 3: IPC 핸들러
- `src/main/index.ts` - Settings 윈도우 관리
- `validate-token`, `save-settings`, `get-settings` 핸들러

#### Phase 4: Tray 메뉴
- `src/main/tray.ts` - Settings 메뉴 항목 추가
- 트레이 아이콘 문제 해결:
  - 유효한 PNG 아이콘 생성 (16x16, 32x32 L 모양)
  - `package.json` files에 `assets/**/*` 추가
  - `app.getAppPath()`로 asar 내부 경로 접근
  - Template Image 설정으로 light/dark 모드 대응

#### Phase 5: 메인 UI Settings 버튼
- `src/renderer/index.html` - 우측 상단 톱니바퀴 버튼
- 고정 헤더로 스크롤 시에도 상단 고정
- 깔끔한 아이콘 버튼 스타일

---

### 11. Onboarding 개선 및 버전 1.1.0 릴리스

```
Settings 완성했으니 온보딩도 개선하고 버전 올리자
```

**Claude 작업:**
- 온보딩 화면에서 캡처 트리거하여 앱이 권한 리스트에 등록되도록 개선
- `package.json` - 버전 1.1.0으로 업데이트
- `feature/settings` 브랜치 master로 머지
- CHANGELOG.md 작성

---

### 12. AI 제목 생성 개선 (내부 협업용)

```
팀 내부용으로 쓰는 거라 제목이 너무 정중하게 나와. 더 캐주얼하게 바꿔줘
```

**Claude 작업:**
- `src/services/gemini-analyzer.ts`, `src/services/anthropic-analyzer.ts` - 프롬프트 수정
- 기존: "정중하고 공손한 톤"
- 개선: "팀 내부 협업용, 간결하고 직관적인 톤"
- 예시: "로그인 - 소셜로그인 세션 만료 오류 수정" 형식
- 버전 1.1.1 릴리스

---

## 2026-01-19 (Day 5)

### 13. 멀티 이미지 캡처 및 UX 개선

```
한 번에 여러 장 캡처해서 이슈에 첨부할 수 있으면 좋겠어
```

**Claude 작업:**
- 갤러리 형태의 멀티 이미지 UI 구현 (최대 10장)
- `+ 추가` 버튼으로 추가 캡처, `×` 버튼으로 개별 삭제
- 이미지 클릭 시 모달로 확대 보기
- 이미지 확대 모달 열릴 때 macOS 신호등(닫기/최소화/최대화) 버튼 숨김 처리
- Linear 이슈 description에 모든 이미지 마크다운으로 첨부

---

### 14. 자동 업데이트 기능 추가

```
새 버전 나오면 자동으로 알려주고 업데이트할 수 있게 해줘
```

**Claude 작업:**
- `electron-updater` 패키지 추가
- `src/services/auto-updater.ts` - GitHub Releases 기반 업데이트 체크
- Settings 화면에 버전 표시 및 "업데이트 확인" 버튼 추가
- 업데이트 다운로드 완료 시 재시작 안내 다이얼로그
- **주의**: Ad-hoc 서명이라 자동 설치는 불가 → 다운로드 후 수동 설치 필요
- TCC 권한 리셋 필요 안내 메시지 추가

---

### 15. Cloudflare Worker로 API 키 보안 강화

```
앱에 API 키가 하드코딩되어 있는데, 보안상 Worker로 옮기자
```

**Claude 작업:**
- `linear-capture-ai` Cloudflare Worker 생성
- AI 분석 (Anthropic, Gemini) API 호출을 Worker에서 처리
- R2 이미지 업로드도 Worker 통해 처리
- 앱에는 Worker URL만 남기고 모든 API 키 제거
- Worker Secrets로 안전하게 API 키 관리

---

### 16. 앱 시작 시 메인 창 자동 표시

```
앱 실행하면 바로 메인 창 보여주고, 캡처 가이드도 알려줘
```

**Claude 작업:**
- 앱 시작 시 메인 창 자동 표시 (기존: 트레이만 표시)
- 단축키 가이드 텍스트 추가 ("⌘+Shift+L로 캡처")
- 이미지 없을 때 "캡처하기" 버튼 표시
- 첫 사용자도 바로 사용법 파악 가능

---

### 17. 라벨 지원 및 커스텀 단축키 설정

```
이슈에 라벨도 붙일 수 있게 해줘. 그리고 단축키도 바꿀 수 있으면 좋겠어
```

**Claude 작업:**
- Linear 라벨 멀티 선택 UI 구현 (칩 형태)
- 팀별 라벨 + 워크스페이스 라벨 검색 및 선택
- Settings에 Capture Hotkey 섹션 추가
- 키보드 조합 녹화 방식으로 단축키 변경
- Reset 버튼으로 기본값(⌘+Shift+L) 복원
- 버전 1.2.3 릴리스

---

### 18. 단축키 변경 시 메인 UI 가이드 동적 업데이트

```
단축키가 변경되면 메인 UI의 가이드 텍스트도 바뀌어야할 것 같아
```

**Claude 작업:**
- 메인 UI 단축키 힌트 텍스트 동적 업데이트
- Settings에서 단축키 저장 시 메인 윈도우에 IPC 이벤트 전송
- Settings 모달 크기 증가 (400×420 → 480×630)
- 버전 1.2.4 릴리스

---

## 2026-01-29 (Day 6)

> **배경**: Linear 이슈를 생성할 때 Slack 대화나 Notion 문서 등 관련 맥락이 함께 링크되면, 나중에 이슈를 봤을 때 "왜 이 작업을 했지?"라는 맥락을 잃지 않게 된다. Linear가 진정한 SSOT(Single Source of Truth)가 되도록, 캡처 시점에 관련 문서를 검색해서 함께 첨부하는 기능을 구현했다.

### 19. Slack OAuth 연동 및 검색 기능

```
이슈 생성할 때 Slack 메시지를 검색해서 컨텍스트로 첨부할 수 있게 해줘
```

**OpenCode 작업:**
- Cloudflare Worker에 Slack OAuth 엔드포인트 추가
  - `GET /slack/auth` - OAuth 시작
  - `POST /slack/callback` - 토큰 교환
  - `GET /slack/channels` - 채널 목록
  - `GET /slack/status` - 연결 상태 확인
  - `DELETE /slack/disconnect` - 연결 해제
  - `GET /slack/search` - 메시지 검색
  - `GET /slack/oauth-redirect` - HTTPS → deep link 리다이렉트
- `src/services/slack-client.ts` - Slack OAuth + 검색 서비스
- `src/renderer/settings.html` - Slack 연결 섹션 추가
- `src/main/index.ts` - deep link 핸들러 및 IPC 추가
- **UI**: Context Search 섹션 (접이식) 추가, Slack 탭에서 메시지 검색 및 선택 가능

---

### 20. Notion OAuth 연동 및 검색 기능

```
Notion 페이지도 검색해서 이슈에 링크 첨부할 수 있으면 좋겠어
```

**OpenCode 작업:**
- Cloudflare Worker에 Notion OAuth 엔드포인트 추가
  - `GET /notion/auth` - OAuth 시작
  - `POST /notion/callback` - 토큰 교환
  - `GET /notion/status` - 연결 상태 확인
  - `DELETE /notion/disconnect` - 연결 해제
  - `GET /notion/search` - 페이지 검색
  - `GET /notion/oauth-redirect` - HTTPS → deep link 리다이렉트
- `src/services/notion-client.ts` - Notion OAuth + 검색 서비스
- `src/renderer/settings.html` - Notion 연결 섹션 추가
- **UI**: Notion 탭 활성화, 페이지 검색 및 선택 기능

---

### 21. Notion 페이지 본문 콘텐츠 추출

```
Notion 페이지 제목만 보여주지 말고 본문 내용도 Context에 포함해줘
```

**OpenCode 작업:**
- Cloudflare Worker에 `GET /notion/blocks` 엔드포인트 추가
  - 페이지 블록 조회 (`GET /v1/blocks/{page_id}/children`)
  - 텍스트 블록만 필터링 (paragraph, heading, list, quote, code 등)
  - 최대 2000자로 truncate
- `src/services/notion-client.ts` - `getPageContent()` 메서드 추가
- `src/main/index.ts` - `notion-get-content` IPC 핸들러 추가
- **UI**: 페이지 선택 시 본문 로딩 및 Context 섹션에 표시

---

### 22. Context 통합 및 이슈 생성 연동

```
선택한 Slack 메시지랑 Notion 페이지가 이슈 설명에 자동으로 들어가게 해줘
```

**OpenCode 작업:**
- `buildContextSection()` 함수로 마크다운 형식 Context 생성
- form submit 시 Description에 자동 추가
- **출력 형식**:
  ```markdown
  ## Related Context

  ### Slack Messages
  **#channel** - @user (2026-01-29)
  > 메시지 내용...
  [View in Slack](link)

  ### Notion Pages
  📄 **페이지 제목** (2026-01-29)
  페이지 본문 내용...
  [View in Notion](link)
  ```
- 선택 개수 배지 표시, 체크박스로 선택/해제

---

## 2026-01-30 (Day 7)

> **배경**: 다양한 사용자층을 지원하기 위해 앱의 다국어(i18n) 지원이 필요했다. 팀 멤버 중 영어권 사용자와 독일, 프랑스, 스페인어권 사용자가 있어 5개 언어를 지원하기로 결정. 또한 Gmail 연동 작업과 병렬로 진행하기 위해 Git Worktree를 활용했다.

### 23. Git Worktree로 병렬 작업 환경 구축

> **배경**: 개발자 지인 황인준님이 BKAMP 프로젝트에서 Docker + Git Worktree로 병렬 작업하는 스킬을 공유해줬다. 여러 브랜치를 동시에 띄워놓고 비교하며 개발하는 방식이 인상적이어서, 내 Electron 프로젝트에도 적용해보기로 했다.

```
현재 작업하고 있는 linear-capture를 다양한 기능을 병렬 작업하고 싶은데 가능할까?
1. 하나는 지메일 연동해서 불러오는거
2. 하나는 다국어 처리
```

**시지프스 작업:**
- Git Worktree 개념 설명 및 환경 구축
  - 메인: `linear-capture/` [master]
  - 워크트리 1: `linear-capture-worktrees/gmail-integration/` [feature/gmail-integration]
  - 워크트리 2: `linear-capture-worktrees/i18n/` [feature/i18n]
- 충돌 방지 전략 수립
  - `.sisyphus/plans/` 브랜치별 하위 폴더 분리
  - 소스 코드는 기능별로 다른 파일 수정
  - CLAUDE.md는 master에서만 수정
- `~/.claude/skills/git-worktree/` 스킬 파일 범용화 (Docker → 일반 프로젝트)
  - 황인준님의 BKAMP Docker 특화 스킬 → 범용 Git Worktree 가이드로 변환
  - Docker 포트 매핑, OAuth 설정 등 Docker 특화 내용 제거
  - Electron, 웹앱, Docker 등 다양한 프로젝트 타입 예시 추가
  - 폴더명도 `bkamp-worktree` → `git-worktree`로 변경하여 범용성 강조
- **작업 방식**: 터미널 3개 열어서 각각 `opencode` 실행
  - 터미널 1: master 브랜치 (메인)
  - 터미널 2: gmail-integration worktree
  - 터미널 3: i18n worktree
- 각 OpenCode 세션이 독립적으로 작업, Git 저장소는 공유
- **결과**: i18n 기능 완성 후 master로 머지 → **충돌 없이 깔끔하게 머지됨**
  - 사전에 충돌 방지 전략을 세운 덕분
  - Gmail 연동은 계속 진행 중, 나중에 머지해도 충돌 없을 것으로 예상

---

### 23-1. Electron 앱 병렬 실행 문제 발견 및 해결 계획

```
수동 확인을 위해서 띄워줄래?
근데 내가 지금 병렬 작업을 하고 있는데 git worktree로 여러개 앱을 실행해서 확인해도 되는지 모르겠네?
```

**시지프스 작업:**
- **문제 발견**: macOS에서 동일한 Bundle ID(`com.gpters.linear-capture`)를 가진 앱은 **1개만 실행** 가능
  - 다른 worktree에서 빌드한 앱을 열어도 기존 앱이 활성화될 뿐 새 인스턴스 안 뜸
  - Docker와 달리 Electron은 완전 격리가 안 됨
- **Docker vs Electron 격리 비교**:
  | 항목 | Docker | Electron |
  |------|--------|----------|
  | 파일시스템 | 컨테이너별 격리 | 호스트 공유 |
  | 네트워크 | 포트 매핑 분리 | 동일 포트 충돌 |
  | 앱 ID | 없음 | Bundle ID 충돌 |
- **해결책 계획 수립** (`parallel-worktree-dev.md`):
  - 브랜치별로 Bundle ID 다르게 자동 생성
  - `scripts/get-dev-app-id.js` - git branch 자동 감지
  - `electron-builder.dev.js` - 동적 appId 설정
  - `npm run pack:dev` - 개발 테스트용 빌드 스크립트
- **설계 결정**:
  - master/main은 suffix 없이 원래 Bundle ID 유지
  - feature 브랜치는 `-{브랜치명}` suffix 자동 추가
  - 기존 스크립트(pack, dist:mac)는 수정 안 함 → merge 충돌 방지

---

### 24. i18next 베스트 프랙티스 조사

```
i18next + Electron 조합의 베스트 프랙티스 찾아줘
```

**시지프스 (Librarian) 작업:**
- Main/Renderer 프로세스 간 번역 동기화 패턴 조사
  - 별도 i18next 인스턴스 생성 → IPC로 언어 변경 동기화
- macOS/Windows 시스템 언어 감지 (`app.getLocale()`)
- electron-store + i18next 연동 주의점
  - Renderer에서 fs 접근 불가 → 인메모리 리소스 사용
  - IPC 래퍼로 설정 저장소 접근
- 네임스페이스 구조 설계 (~150개 문자열)
  - `common.json` (30개) - 공통
  - `capture.json` (40개) - 캡처 기능
  - `settings.json` (35개) - 설정 화면
  - `errors.json` (25개) - 에러 메시지
  - `validation.json` (20개) - 폼 검증

---

### 25. i18n 기본 구조 구현

```
다국어 지원 구현해줘. 한국어랑 영어부터 시작하고, 독일어/프랑스어/스페인어도 추가해줘
```

**시지프스 작업:**
- `src/main/i18n.ts` - 메인 프로세스 i18n 초기화
  - `app.getLocale()`로 시스템 언어 감지
  - electron-store에 언어 설정 저장
- `src/locales/` - 번역 파일 구조
  - `en.json`, `ko.json`, `de.json`, `fr.json`, `es.json`
- `src/services/settings-store.ts` - 언어 설정 추가
- `src/renderer/settings.html` - 언어 선택 드롭다운
- `src/renderer/index.html` - 캡처 창 번역
- `src/renderer/onboarding.html` - 온보딩 화면 번역
- 메인 프로세스 다이얼로그/알림 번역
- **5개 언어 지원**: 한국어, 영어, 독일어, 프랑스어, 스페인어

---

### 26. Worker i18n 템플릿 구현

```
AI 분석 결과도 선택된 언어로 나오게 해줘
```

**시지프스 작업:**
- `linear-capture-worker/src/prompts/templates/` 생성
  - `index.ts` - 템플릿 인터페이스 및 `getTemplates(language)` 함수
  - `ko.ts`, `en.ts`, `de.ts`, `fr.ts`, `es.ts` - 언어별 프롬프트 템플릿
- `src/prompts/issue-prompt.ts` 리팩토링
  - 하드코딩된 한국어 → `getTemplates()` 호출로 변경
  - 제목 규칙, 설명 템플릿, 컨텍스트 섹션 전체 번역
- `npx wrangler deploy` - Worker 배포 완료

---

## 2026-01-31 (Day 8)

### 27. 언어 변경 이벤트 버그 수정

```
Settings에서 언어 바꿔도 캡처 창에 반영이 안 되는데?
```

**시지프스 작업:**
- **문제 분석**: `language-changed` 이벤트는 전송되지만 렌더러에서 수신 안 됨
- **원인 발견**: `capture-ready` 콜백에 `async` 키워드 누락
  - `await t('common.none')` 사용 → SyntaxError 발생
  - 스크립트 전체 파싱 실패 → 이벤트 리스너 미등록
- **해결**: `ipcRenderer.on('capture-ready', (event, data) => {` → `async (event, data) => {`
- `src/main/i18n.ts` 경로 수정: `process.resourcesPath` → `app.getAppPath()`
- 언어 변경 시 동적 요소 갱신 함수 호출 추가
  - `loadSlackStatus()`, `loadNotionStatus()`, `loadGmailStatus()`
  - `renderGallery()`, `updateShortcutHint()`, `updateSlackUI()`, `updateNotionUI()`

---

### 28. 설정 창 UI 개선

```
설정 창이 너무 작아. 독일어로 바꾸니까 버튼이 삐져나오기도 해
```

**시지프스 작업:**
- 설정 창 크기 확대: 480×630 → **540×800**
- Slack/Notion/Gmail 통합 섹션 컴팩트 디자인
  - 세로 나열 → 가로 한 줄로 변경
  - 실제 SVG 로고 적용 (이모지 대체)
  - "Integrations" 그룹 헤더 추가
- 버튼 색상 통일 (Linear purple: `#5E6AD2`)
- Linear API 토큰 섹션 개선
  - 닫기 버튼 삭제
  - 검증 전: `검증` = 보라색, `저장` = 회색 (disabled)
  - 검증 후: `검증` = 회색, `저장` = 보라색
- i18n 키 추가: `settings.integrations` (5개 언어)

---

### 29. 이슈 생성 성공 화면 개선

```
이슈 생성 성공 화면에서 '컨택스트 검색' 섹션은 안 보여야해
```

**시지프스 작업:**
- `showSuccess()` 함수에서 `contextSection.classList.add('hidden')` 추가
- 성공 화면에서 불필요한 UI 요소 숨김 처리

---

## 2026-02-01 (Day 9)

### 30. Notion 풀텍스트 검색 구현

```
Notion 검색이 제목만 검색되는데, 본문 내용으로도 검색할 수 있으면 좋겠어
```

**시지프스 작업:**
- **기술 조사**: notion-mcp-fast 레포 분석
  - Notion.app 로컬 SQLite 캐시 활용 (`~/Library/Application Support/Notion/notion.db`)
  - 본문 내용까지 인덱싱되어 있음
- `sql.js` 패키지 설치 (WASM 기반 - 네이티브 빌드 불필요)
- `src/services/notion-local-reader.ts` 구현
  - 로컬 DB 경로 탐지 (macOS, Windows)
  - 제목 + 본문 풀텍스트 검색
  - 본문 매치 시 스니펫 추출
- `src/services/notion-client.ts` 수정
  - 하이브리드 검색: 로컬 우선 → API fallback
  - `searchPages()` 함수에 `searchMethod` 반환 추가
- **UI 배지 표시**:
  - "본문 검색" (녹색) - 로컬 DB 검색 결과
  - "제목 검색" (주황색) - API 검색 결과
- **ASAR 패키징 이슈 해결**:
  - `sql.js`를 `dependencies`에 추가
  - `asarUnpack: ["**/sql.js/**"]` 설정으로 WASM 파일 추출
  - `locateFile` 경로 수정 (`app.asar.unpacked` 처리)

---

## 2026-02-07 (Day 10)

> **배경**: Linear Capture가 v1.2.10까지 기능을 빠르게 쌓아왔지만, 코드베이스가 21,265줄로 비대해졌다. index.html 3,247줄, settings.html 2,483줄짜리 모놀리스, 중복 코드 18건, IPC 에러 처리율 22% 등 기술 부채가 누적된 상태. Gmail 동기화에서 "806개만 싱크되는" 치명적 버그까지 발견되어, 버그 수정 + 대규모 리팩토링을 하루 만에 진행했다.

### 31. Gmail Sync 806 버그 수정

```
Gmail 동기화가 806개에서 멈추는 버그 수정해줘. Worker + Client 양쪽 다 문제야.
```

**Claude Code 작업:**
- **3가지 버그가 겹쳐있던 복합 이슈 분석**:
  1. Worker: Gmail API `nextPageToken` 무시 → 첫 페이지 ID만 반환
  2. Client: RFC 2822 날짜 STRING 비교 (`"Fri, 30 Jan" < "Wed, 28 Jan"` → 알파벳순!) → 커서 무한루프
  3. Client: `messages.length < BATCH_SIZE` 조기 종료 → 더 많은 이메일이 있어도 루프 탈출
- Worker: `nextPageToken` 루프로 전체 ID 수집
- Client: `new Date(email.date).getTime()` 타임스탬프 비교로 전환
- Client: `=== 0` 종료 조건만 사용 + stuck cursor 감지 추가
- **결과**: 806개 → 4,200+ 이메일 정상 동기화

---

### 32. 대규모 리팩토링 Phase 1~6.1 + 3.1~3.2

```
리팩토링 6개 Phase 전부 실행해줘.
Phase 1: 레거시 제거, Phase 2: 중복 제거, Phase 3: 파일 분할,
Phase 4: 타입 강화, Phase 5: 로깅/에러, Phase 6: 보안/테스트
```

**Claude Code 작업:**

#### Phase 1: 레거시 제거
- sql.js 기반 검색 스택 제거 (PGlite로 통합 완료 상태)
- 데드 코드 정리

#### Phase 2: 중복 제거
- `BaseSyncAdapter` 추출 → 4개 어댑터(Notion/Slack/Gmail/Linear) 공통 로직 상속
- AI Analyzer 통합: `anthropic-analyzer.ts` + `gemini-analyzer.ts` (95% 동일) → `ai-analyzer.ts` 단일 파일
- Worker URL 하드코딩 12파일 26곳 → `config.ts` 1곳
- Gmail `sync()/syncIncremental()` 80% 동일 → `paginatedSync()` 공통화
- Slack `syncMessage/syncThreadReply` 70% 동일 → `upsertSlackContent()` 공통화

#### Phase 3: 파일 분할 + esbuild 도입
- `index.html` 3,247줄 → 271줄 HTML + CSS 4파일 + JS 8모듈
- `settings.html` 2,483줄 → 236줄 HTML + CSS 1파일 + JS 11모듈
- esbuild IIFE 번들러 도입 (12ms 빌드)
- `ipc-handlers.ts` 894줄 → 9개 도메인별 파일로 분리
- `notion-local-reader.ts` 805줄 → facade + 4모듈
- `local-search.ts` 517줄 → facade + orchestrator + service

#### Phase 4: 타입 강화
- `src/main/types.ts` 중복 삭제, Document.source_type에 `'gmail'` 추가
- IPC 타입맵 미등록 채널 등록

#### Phase 5: 로깅/에러 처리
- 10개 서비스 `console.*` → `logger.*` 전환 (193→~50개)
- OAuth 미처리 Promise 3개 → `async/await + try/catch/finally`
- IPC 핸들러 에러 처리 22% → 45%

#### Phase 6: 보안 + 테스트
- **Electron 보안 강화**: `contextIsolation: true`, `nodeIntegration: false` 전체 적용
- `preload.ts` 생성: 화이트리스트 기반 IPC 브릿지 (52채널)
- 렌더러 `require('electron')` → `window.electronAPI` 전환

---

### 33. Phase 5.3 + 6.2: Claude Code Agents Team으로 마무리

```
CTO팀 구성해서 에이전트들에게 잘 시켜서 이 업무 해줘.
- Phase 5.3: IPC 에러 처리 보완 (나머지 핸들러)
- Phase 6.2: 테스트 실패 14건 수정
```

**Claude Code (Team/Agents 기능) 작업:**
- **팀 구성**: TeamCreate로 `refactor-phase-5-6` 팀 생성
  - team-lead (CTO): 태스크 생성, 의존성 설정, 최종 검증
  - ipc-engineer: IPC 에러 처리 전담
  - test-engineer: 테스트 수정 전담
- **병렬 작업**: 두 에이전트가 동시에 독립 파일 수정
  - ipc-engineer: 4개 파일, 16개 핸들러에 try/catch 추가
  - test-engineer: 3개 테스트 파일 mock 업데이트 (14건 실패 → 0건)
- **직렬 검증**: 둘 다 완료 후 team-lead가 통합 검증
  - `npx vitest run` → 160/160 통과
  - `npm run build` → TypeScript + esbuild 성공
  - REFACTORING.md 업데이트 + 커밋/푸시
- **결과**:
  - IPC 에러 처리: 45% → 81% (39/48)
  - 테스트: 148/162 (91%) → 160/160 (100%)

---

### Day 10 최종 결과

| 지표 | Before (아침) | After (저녁) | 변화 |
|------|-------------|-------------|------|
| 코드 라인 (.ts) | 21,265줄 | ~9,500줄 | **-55%** |
| 400줄+ 파일 | 9개 | 4개 | -56% |
| 레거시/중복 | 18건 | 0건 | -100% |
| IPC 에러 처리 | 22% | 81% | +59%p |
| 테스트 | 148/162 (91%) | 160/160 (100%) | 전체 통과 |
| Gmail 동기화 | 806개 한계 | 4,200+ 정상 | 해결 |
| contextIsolation | 미적용 | 전체 적용 | 보안 강화 |
| HTML 모놀리스 | 5,730줄 (2파일) | 507줄 + 모듈 분할 | -91% |

---

## 커밋 히스토리

| 날짜 | 커밋 | 설명 |
|------|------|------|
| 01/12 | `c4e1cd8` | feat: Linear Capture 초기 버전 + IPC 버그 수정 |
| 01/12 | `30f749d` | feat: 이슈 생성 폼에 추가 필드 구현 |
| 01/12 | `9080cb5` | feat: Gemini Vision API를 활용한 OCR 기반 자동 이슈 생성 기능 추가 |
| 01/12 | `ede06e0` | docs: CLAUDE.md에 Gemini Vision OCR 기능 문서 추가 |
| 01/12 | `be6f336` | feat: Linear 이슈 description 마크다운 템플릿 적용 |
| 01/12 | `b90f0ac` | feat: AI 기반 메타데이터 자동 추천 (프로젝트, 담당자, 우선순위, 포인트) |
| 01/12 | `d88e4b6` | feat: AI 분석 개선 및 UI/UX 향상 |
| 01/13 | `03900d7` | feat: add parallel processing and AI model selection UI |
| 01/13 | `37892bc` | feat: macOS 앱 배포 설정 및 UX 개선 |
| 01/13 | `2e34ed9` | feat: 온보딩 화면 및 권한 처리, AI 폴백 개선 |
| 01/14 | `96275bc` | Add CodeRabbit auto-review workflow |
| 01/14 | `8f15f98` | feat: User settings and DMG hotkey fix (#2) |
| 01/14 | `a7237a2` | revert: Remove settings features that broke DMG packaging |
| 01/15 | `445d993` | docs: Add Settings feature implementation plan |
| 01/15 | `57591ec` | feat(settings): Add settings-store.ts for token storage |
| 01/15 | `bf03965` | feat(settings): Add settings.html UI for token management |
| 01/15 | `6426301` | feat(settings): Add IPC handlers and Settings window management |
| 01/15 | `27261d4` | feat(settings): Complete Phase 4 - Add Settings menu to tray |
| 01/15 | `fe07f75` | feat(settings): Complete Phase 5 - Add Settings button to main UI |
| 01/15 | `3651ef5` | feat(settings): Improve Settings UI and permission handling |
| 01/15 | `3aefd12` | fix(onboarding): Trigger capture on onboarding show to register app in permission list |
| 01/15 | `1048d01` | Merge feature/settings: Add Settings UI and personal token management |
| 01/15 | `ab6a3f1` | chore: Bump version to 1.1.0 |
| 01/15 | `943e7ee` | fix(ai): Improve title generation for internal collaboration |
| 01/15 | `027d205` | docs: Add CHANGELOG.md for v1.1.1 |
| 01/19 | `0b7d145` | feat(multi-image): Phase 7 버그 수정 및 UX 개선 |
| 01/19 | `39f88c0` | feat(ui): Hide macOS traffic lights when image modal opens |
| 01/19 | `84ead4c` | feat(auto-update): Add electron-updater for automatic app updates |
| 01/19 | `92a9184` | feat(auto-update): Add TCC permission warning on update restart |
| 01/19 | `d34437d` | feat: Use Cloudflare Worker for AI analysis (API key security) |
| 01/19 | `e17424a` | fix: Use Worker for R2 uploads, fix update check double-dialog |
| 01/19 | `dfbc58c` | feat(ui): Show main window on startup with capture guide |
| 01/19 | `6437471` | feat: Add label support and custom hotkey settings |
| 01/19 | `c698a87` | chore: Bump version to 1.2.3 |
| 01/19 | `ca7cfe2` | feat(ui): Dynamic hotkey hint and larger settings modal |
| 01/19 | `c419b4d` | chore: Bump version to 1.2.4 |
| 01/21 | `47911ca` | feat(slack): add Slack OAuth flow and settings UI |
| 01/21 | `18368d0` | feat(app): add device_id generation for OAuth |
| 01/30 | `0e185f2` | feat(i18n): add language settings to settings-store |
| 01/30 | `7379b81` | feat(i18n): apply i18n to main process dialogs and notifications |
| 01/30 | `4dc7b8b` | feat(i18n): apply translations to settings.html |
| 01/30 | `7ff1820` | feat(i18n): apply translations to onboarding.html |
| 01/30 | `7a1cb64` | feat(i18n): apply translations to index.html |
| 01/30 | `0d83088` | feat(i18n): add translate IPC handler for renderer process |
| 01/30 | `3afe23a` | feat(i18n): add autoTranslate and fix hardcoded Korean |
| 01/30 | `3a9f6af` | feat(i18n): pass language to AI analyzer for localized output |
| 01/30 | `7c37321` | feat(i18n): 다국어(영어/한국어) 지원 추가 (#4) |
| 01/30 | `6b50f67` | feat(i18n): add German, French, Spanish translations |
| 01/30 | `3fcf451` | feat(i18n): add de/fr/es to supported languages |
| 01/31 | `c632dc7` | fix(i18n): update dynamic UI elements on language change |
| 01/31 | `c3ae22e` | fix(i18n): keep Linear section in English, fix language toggle |
| 01/31 | `12822d9` | Merge branch 'feature/i18n' into master |
| 01/31 | `799b424` | feat(settings): improve UI with compact integrations (#5) |
| 02/01 | `bec2f5e` | feat(notion): add full-text search via local SQLite cache (#6) |
| 02/07 | `07fb52f` | fix(gmail-sync): resolve three critical sync pagination bugs |
| 02/07 | `c7fd8db` | refactor(phase-1): remove legacy sql.js search stack and dead code |
| 02/07 | `db6c3ed` | refactor(phase-2): consolidate duplicate code across sync adapters and services |
| 02/07 | `cc2820b` | refactor(phase-2.5-3.5): consolidate sync logic and modularize handlers/services |
| 02/07 | `3afb633` | refactor(phase-4-5): type safety and error handling improvements |
| 02/07 | `08a336f` | refactor(phase-5-6): complete security hardening and service improvements |
| 02/07 | `4121e1b` | docs: update REFACTORING.md with Phase 5.1 + 6.1 completion |
| 02/07 | `c16b2a4` | refactor(phase-3.1-3.2): HTML monolith split with esbuild bundler introduction |
| 02/07 | `7c42b03` | refactor(phase-5.3-6.2): IPC error handling enhancement & test fixes |

---

## 기술 스택

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Framework**: Electron 34.1.1, TypeScript 5.7.2
- **AI**: Google Gemini 2.5 Flash Lite, Anthropic Claude Haiku 4.5
- **Storage**: Cloudflare R2 (이미지), electron-store (설정)
- **API**: Linear SDK (@linear/sdk), Google Generative AI
- **Build**: electron-builder (DMG), esbuild
- **Platform**: macOS (Universal binary - Intel + Apple Silicon)

---

## 주요 기능

1. **전역 핫키 캡처** (커스텀 단축키 지원)
   - 기본: ⌘+Shift+L (Settings에서 변경 가능)
   - macOS screencapture CLI 활용
   - 메뉴바 트레이 아이콘 제공

2. **멀티 이미지 캡처**
   - 최대 10장까지 캡처 후 한 번에 이슈 생성
   - 갤러리 UI로 미리보기, 추가, 삭제
   - 클릭 시 모달로 확대 보기

3. **AI 기반 이슈 정보 자동 생성**
   - Gemini Vision API / Claude Haiku 4.5 선택 가능
   - 스크린샷 OCR로 제목, 설명, 프로젝트, 담당자, 우선순위, 포인트 추천
   - Cloudflare Worker 통해 API 호출 (보안 강화)

4. **이미지 업로드 및 Linear 이슈 생성**
   - Cloudflare R2 자동 업로드 (Worker 경유)
   - Linear API 연동 (팀, 프로젝트, 상태, 우선순위, 담당자, 포인트, 사이클, 라벨)
   - 이슈 URL 클립보드 복사 + macOS 알림

5. **Settings 관리**
   - 개인 Linear API 토큰 저장
   - 커스텀 캡처 단축키 설정
   - 버전 정보 및 업데이트 확인

6. **자동 업데이트**
   - GitHub Releases 기반 업데이트 체크
   - 새 버전 다운로드 및 설치 안내
   - TCC 권한 리셋 필요 시 안내

7. **Slack/Notion Context 통합**
   - Slack OAuth 연결 및 메시지 검색
   - Notion OAuth 연결 및 페이지 검색
   - 선택한 메시지/페이지를 이슈 설명에 자동 포함
   - 페이지 본문 콘텐츠 추출 (최대 2000자)

8. **macOS 네이티브 앱 배포**
   - DMG 패키징 (Universal binary)
   - Ad-hoc 서명 지원
   - Gatekeeper 우회 안내

9. **다국어 지원 (i18n)**
   - 5개 언어: 한국어, 영어, 독일어, 프랑스어, 스페인어
   - 시스템 언어 자동 감지
   - Settings에서 언어 변경 가능
   - AI 분석 결과도 선택 언어로 출력

10. **Notion 풀텍스트 검색**
    - 로컬 SQLite 캐시 활용 (Notion.app 설치 시)
    - 제목 + 본문 내용 검색
    - API 검색 fallback 지원
