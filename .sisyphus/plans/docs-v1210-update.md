# v1.2.10 문서 업데이트

## TL;DR

> **Quick Summary**: Linear Capture v1.2.10 코드베이스에 맞게 README.md 기술 스택 업데이트, src/services/CLAUDE.md 및 src/main/CLAUDE.md 신규 생성, 전체 커밋.
> 
> **Deliverables**:
> - README.md 기술 스택 섹션 교체 (87-93행)
> - src/services/CLAUDE.md 신규 생성 (서비스 레이어 맵 + 패턴 가이드)
> - src/main/CLAUDE.md 신규 생성 (메인 프로세스 구조 + IPC/OAuth)
> - 4개 파일 단일 커밋
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1,2,3 (병렬) → Task 4 (커밋)

---

## Context

### Original Request
v1.2.10 현재 코드베이스 상태에 맞게 프로젝트 문서 전면 업데이트. 이전 세션에서 CLAUDE.md(root)와 README.md 기능/설정 섹션은 이미 수정 완료.

### Interview Summary
**Key Discussions**:
- CLAUDE.md(root): v1.2.10 반영 완료 (아키텍처, 프로젝트 구조, 설정, 명령어)
- README.md: 기능/설정 섹션 완료, 기술 스택만 미완성
- 새 CLAUDE.md 2개 필요: 루트에서 `(CLAUDE.md 참조)`로 가리키고 있지만 파일 없음
- 코드 변경 금지, 문서만 수정

**Research Findings**:
- `src/main/`: 10개 파일 (index.ts, ipc-handlers.ts, window-manager.ts, capture-session.ts, hotkey.ts, tray.ts, oauth-handlers.ts, i18n.ts, state.ts, types.ts)
- `src/services/`: 30+ 파일, sync-adapters/ 4개, context-adapters/ 5개, 검색 8개, 외부API 8개
- `state.ts`: AppState 인터페이스에 3개 윈도우 + 6개 캐시 + 5개 서비스 + 3개 OAuth 콜백
- `embedding-service.ts` vs `embedding-client.ts`: service는 직접 OpenAI, client는 래핑 버전
- `oauth-handlers.ts`: deep link URL 파싱 (linear-capture://slack/callback, gmail/callback)

### Metis Review
**Identified Gaps** (addressed):
- README 기술 스택 수정 범위를 87-93행으로 명확히 한정
- 커밋 시 `git add` 파일 4개만 명시 지정 (`.sisyphus/` 포함 방지)
- 새 CLAUDE.md가 루트 CLAUDE.md와 내용 중복하지 않도록 가드레일 설정
- 커밋 메시지 conventional commits 스타일 확인

---

## Work Objectives

### Core Objective
v1.2.10 코드베이스에 맞게 남은 문서(README 기술스택, 서비스/메인 CLAUDE.md)를 완성하고 모든 문서 변경을 하나의 커밋으로 기록.

### Concrete Deliverables
- `README.md` 기술 스택 섹션 교체 (5행 → 9행)
- `src/services/CLAUDE.md` 신규 파일 (80-150행)
- `src/main/CLAUDE.md` 신규 파일 (60-120행)
- `docs: update project documentation for v1.2.10` 커밋 (4개 파일)

### Definition of Done
- [ ] `grep "PGlite" README.md` → 매치 1개 이상
- [ ] `grep "pgvector" README.md` → 매치 1개 이상
- [ ] `test -f src/services/CLAUDE.md` → 존재
- [ ] `test -f src/main/CLAUDE.md` → 존재
- [ ] `git log -1 --name-only` → 정확히 4개 파일
- [ ] `git diff HEAD -- '*.ts' '*.js' '*.json' '*.html'` → 빈 출력

### Must Have
- README.md 기술 스택에 PGlite, pgvector, i18next, Slack/Gmail API 포함
- src/services/CLAUDE.md에 sync-adapters, context-adapters 패턴 설명
- src/main/CLAUDE.md에 IPC 구조, OAuth deep link 플로우 설명
- 모든 내용은 한국어로 작성

### Must NOT Have (Guardrails)
- ❌ README.md의 기술 스택 섹션(87-93행) 외 다른 부분 변경
- ❌ CLAUDE.md(root) 수정 (이미 완료됨)
- ❌ 코드 파일(.ts, .js, .json, .html) 변경
- ❌ `.sisyphus/` 파일을 커밋에 포함
- ❌ 루트 CLAUDE.md와 내용 중복 (아키텍처 도표, 테스트/배포 방법 등)
- ❌ 실제 코드에 없는 인터페이스/패턴을 임의로 기술
- ❌ electron-store, electron-updater 같은 일반 Electron 유틸을 기술 스택에 추가

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (문서 변경이라 테스트 불필요)

### Agent-Executed QA Scenarios (MANDATORY)

모든 Task에서 Agent가 직접 검증 명령어를 실행합니다.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - 병렬):
├── Task 1: README.md 기술 스택 업데이트
├── Task 2: src/services/CLAUDE.md 생성
└── Task 3: src/main/CLAUDE.md 생성

Wave 2 (After Wave 1):
└── Task 4: 4개 파일 커밋
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 4 | 2, 3 |
| 2 | None | 4 | 1, 3 |
| 3 | None | 4 | 1, 2 |
| 4 | 1, 2, 3 | None | None (final) |

---

## TODOs

- [ ] 1. README.md 기술 스택 섹션 업데이트

  **What to do**:
  - `README.md` 87-93행의 기술 스택 섹션을 아래 내용으로 **교체**:
  ```markdown
  ## 기술 스택

  - **App**: Electron + TypeScript
  - **AI 분석**: Claude Haiku 4.5 / Gemini Flash (Cloudflare Worker)
  - **Local DB**: PGlite (PostgreSQL in WASM) + pgvector
  - **검색**: 벡터 + FTS 하이브리드 검색 (RRF)
  - **임베딩**: OpenAI text-embedding-3-small
  - **Notion 캐시**: sql.js (로컬 SQLite 직접 읽기)
  - **스토리지**: Cloudflare R2
  - **API**: Linear GraphQL, Slack Web API, Gmail API
  - **다국어**: i18next (en, ko, de, fr, es)
  ```
  - 기존 5행(88-93) → 새 9행으로 교체
  - `## 기술 스택` 헤더와 `## License` 사이 내용만 변경

  **Must NOT do**:
  - README.md의 기술 스택 외 다른 섹션 변경 금지
  - 줄 번호 87 위(트러블슈팅)와 95 아래(License) 내용 건드리지 않기

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 시 필요

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `README.md:87-93` — 현재 기술 스택 섹션 (교체 대상)

  **API/Type References**:
  - `src/services/database.ts:1-14` — PGlite + pgvector import 확인
  - `src/services/embedding-service.ts:5` — `text-embedding-3-small` 모델명
  - `src/main/i18n.ts:7` — SUPPORTED_LANGUAGES 배열 (en, ko, de, fr, es)
  - `src/services/local-search.ts:1-10` — RRF 하이브리드 검색 설명 주석

  **WHY Each Reference Matters**:
  - `README.md:87-93`: 정확히 어디를 교체해야 하는지 위치 확인
  - `database.ts`: PGlite + pgvector가 실제 사용됨을 확인
  - `embedding-service.ts`: 임베딩 모델명이 `text-embedding-3-small`임을 확인
  - `i18n.ts`: 지원 언어 목록이 정확한지 확인
  - `local-search.ts`: RRF(Reciprocal Rank Fusion) 사용을 확인

  **Acceptance Criteria**:
  - [ ] `grep "PGlite" README.md` → 1개 이상 매치
  - [ ] `grep "pgvector" README.md` → 1개 이상 매치
  - [ ] `grep "i18next" README.md` → 1개 이상 매치
  - [ ] `grep "RRF" README.md` → 1개 이상 매치
  - [ ] `grep "Slack Web API" README.md` → 1개 이상 매치

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: README 기술 스택이 정확히 교체됨
    Tool: Bash
    Preconditions: README.md 파일 존재
    Steps:
      1. grep -c "PGlite" README.md → Assert: 1
      2. grep -c "pgvector" README.md → Assert: 1
      3. grep -c "text-embedding-3-small" README.md → Assert: 1
      4. grep -c "i18next" README.md → Assert: 1
      5. grep -c "Slack Web API, Gmail API" README.md → Assert: 1
      6. grep -c "Frontend" README.md → Assert: 0 (이전 표현 제거됨)
    Expected Result: 새 기술 스택 9개 항목 모두 존재, 이전 형식 제거됨

  Scenario: README 다른 섹션 무변경 확인
    Tool: Bash
    Preconditions: README.md 수정 후
    Steps:
      1. head -86 README.md | md5 비교 (수정 전/후 동일)
      2. tail -3 README.md → "MIT" 포함 확인
    Expected Result: 기술 스택 위/아래 섹션 변경 없음
  ```

  **Commit**: YES (groups with 2, 3, 4)

---

- [ ] 2. src/services/CLAUDE.md 생성

  **What to do**:
  - `src/services/CLAUDE.md` 신규 파일 생성 (80-150행)
  - 아래 구조로 작성 (한국어):

  ```
  # Services Layer

  ## 개요
  비즈니스 로직 레이어. 30+ 파일로 구성.

  ## 파일 맵 (카테고리별)

  ### 동기화 (sync-adapters/)
  - notion-sync.ts: Notion 페이지 동기화 (로컬캐시 우선, API 폴백)
  - slack-sync.ts: Slack 메시지 동기화
  - gmail-sync.ts: Gmail 이메일 동기화
  - linear-sync.ts: Linear 이슈 동기화

  ### 컨텍스트 어댑터 (context-adapters/)
  - index.ts: 어댑터 레지스트리 (getAdapter, getAvailableAdapters)
  - notion-adapter.ts, slack-adapter.ts, gmail-adapter.ts, linear-adapter.ts

  ### 검색
  - local-search.ts: 오케스트레이터 (동기화 + 검색 + RRF)
  - semantic-search.ts: 벡터 유사도 검색
  - hybrid-search.ts: 벡터 + FTS 결합
  - local-vector-store.ts: PGlite 벡터 스토어
  - embedding-service.ts: OpenAI 임베딩 (직접 API, 배치 지원)
  - embedding-client.ts: 임베딩 서비스 래퍼 (싱글톤)
  - reranker.ts: 검색 결과 재정렬
  - recency-boost.ts: 최신성 가중치

  ### 외부 API 클라이언트
  - notion-client.ts: Notion API
  - notion-local-reader.ts: Notion 로컬 SQLite 캐시 직접 읽기
  - slack-client.ts: Slack Web API + OAuth
  - slack-user-cache.ts: Slack 사용자 정보 캐시
  - gmail-client.ts: Gmail API + OAuth
  - linear-client.ts: Linear GraphQL SDK 래퍼
  - linear-local-cache.ts: Linear 데이터 로컬 캐시
  - linear-uploader.ts: 이미지 → Linear 첨부

  ### AI 분석
  - ai-recommend.ts: AI 추천 오케스트레이터
  - gemini-analyzer.ts: Gemini Flash 분석
  - anthropic-analyzer.ts: Claude Haiku 분석
  - r2-uploader.ts: Cloudflare R2 이미지 업로드

  ### 기반
  - database.ts: PGlite (PostgreSQL WASM) + pgvector
  - text-preprocessor.ts: 텍스트 정규화/청킹
  - settings-store.ts: electron-store 래퍼
  - analytics.ts: 사용 추적 (Mixpanel)
  - auto-updater.ts: electron-updater 래퍼

  ## 핵심 패턴

  ### Sync Adapter 패턴
  각 소스별 SyncAdapter 클래스가 동일 인터페이스 구현:
  - syncFromApi(): API에서 데이터 가져와 DB 저장 + 임베딩 생성
  - 증분 동기화: content_hash로 변경 감지, 커서 기반 페이지네이션
  - 배치 임베딩: embedBatch()로 300개 단위 일괄 처리
  참조: sync-adapters/notion-sync.ts의 NotionSyncAdapter

  ### Context Adapter 패턴
  검색 결과를 소스별로 포맷팅하는 어댑터:
  - ContextAdapter 인터페이스: formatResult(), getSourceLabel()
  - 레지스트리: context-adapters/index.ts의 getAdapter(source)
  - 새 소스 추가 시: 어댑터 파일 생성 → index.ts에 등록

  ### 검색 파이프라인
  local-search.ts가 전체 흐름 오케스트레이션:
  1. 쿼리 → embedding-client로 벡터 생성
  2. PGlite에서 벡터 검색 + FTS 검색 병렬 실행
  3. RRF(k=60)로 결과 합산
  4. reranker로 재정렬 → recency-boost 적용

  ## 새 서비스 추가 가이드

  ### 새 동기화 소스 추가
  1. sync-adapters/에 {source}-sync.ts 생성 (NotionSyncAdapter 패턴 참조)
  2. local-search.ts의 syncSource()에 소스 등록
  3. context-adapters/에 어댑터 파일 생성
  4. context-adapters/index.ts의 switch문에 추가

  ### 새 AI 분석기 추가
  1. {provider}-analyzer.ts 생성 (gemini-analyzer.ts 패턴 참조)
  2. ipc-handlers.ts에서 분석 핸들러에 연결
  ```

  **Must NOT do**:
  - 루트 CLAUDE.md에 이미 있는 프로젝트 구조, 아키텍처 도표 중복 금지
  - 테스트/빌드/배포 방법 기술 금지 (루트 CLAUDE.md 참조)
  - 존재하지 않는 인터페이스나 함수명 임의 기술 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/services/context-adapters/index.ts:1-37` — 어댑터 레지스트리 패턴 (getAdapter switch문, getAvailableAdapters 목록)
  - `src/services/sync-adapters/notion-sync.ts:1-40` — SyncAdapter 클래스 구조 (constructor, syncFromApi, 의존성)
  - `src/services/local-search.ts:1-60` — 검색 오케스트레이터 구조 (RRF_K=60, RETRIEVAL_LIMIT=100, SyncProgress 타입)
  - `src/services/hybrid-search.ts:1-40` — 하이브리드 검색 패턴 (벡터 실패 시 FTS 폴백)

  **API/Type References**:
  - `src/services/database.ts:15-37` — Document, SyncCursor 인터페이스
  - `src/types/context-search.ts` — ContextAdapter, ContextSource 타입 정의
  - `src/services/embedding-service.ts:5-8` — 임베딩 상수 (MODEL, MAX_TOKENS, MAX_BATCH_SIZE)

  **WHY Each Reference Matters**:
  - `context-adapters/index.ts`: "새 소스 추가 시" 가이드에서 실제 등록 방법 확인
  - `notion-sync.ts`: SyncAdapter 패턴 설명의 근거. 실제 클래스 구조 참조
  - `local-search.ts`: 검색 파이프라인 설명의 근거. RRF 상수, SyncProgress 타입 등
  - `database.ts`: Document/SyncCursor 인터페이스는 전체 데이터 모델의 핵심

  **Acceptance Criteria**:
  - [ ] `test -f src/services/CLAUDE.md` → 파일 존재
  - [ ] `wc -l src/services/CLAUDE.md` → 80-150행
  - [ ] `grep "sync-adapters" src/services/CLAUDE.md` → 매치
  - [ ] `grep "context-adapters" src/services/CLAUDE.md` → 매치
  - [ ] `grep "RRF" src/services/CLAUDE.md` → 매치
  - [ ] `grep "embedBatch" src/services/CLAUDE.md` → 매치

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: services CLAUDE.md 내용 검증
    Tool: Bash
    Preconditions: src/services/CLAUDE.md 생성 후
    Steps:
      1. test -f src/services/CLAUDE.md → Assert: exit 0
      2. wc -l < src/services/CLAUDE.md → Assert: 80-150
      3. grep -c "sync-adapters" src/services/CLAUDE.md → Assert: >= 2
      4. grep -c "context-adapters" src/services/CLAUDE.md → Assert: >= 2
      5. grep -c "RRF" src/services/CLAUDE.md → Assert: >= 1
      6. grep -c "embedBatch" src/services/CLAUDE.md → Assert: >= 1
      7. grep -c "새.*추가" src/services/CLAUDE.md → Assert: >= 1 (추가 가이드 존재)
    Expected Result: 파일 존재, 적절한 길이, 핵심 키워드 모두 포함

  Scenario: 루트 CLAUDE.md와 중복 없음 확인
    Tool: Bash
    Preconditions: src/services/CLAUDE.md 생성 후
    Steps:
      1. grep -c "npm run" src/services/CLAUDE.md → Assert: 0 (빌드 명령어 없음)
      2. grep -c "npm run pack" src/services/CLAUDE.md → Assert: 0
      3. grep -c "Worker" src/services/CLAUDE.md → Assert: 0 (Worker 설명 없음)
    Expected Result: 루트 CLAUDE.md 영역의 내용이 중복되지 않음
  ```

  **Commit**: YES (groups with 1, 3, 4)

---

- [ ] 3. src/main/CLAUDE.md 생성

  **What to do**:
  - `src/main/CLAUDE.md` 신규 파일 생성 (60-120행)
  - 아래 구조로 작성 (한국어):

  ```
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

  ipc-handlers.ts의 registerIpcHandlers()에서 모든 핸들러 등록.
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
  3. macOS가 deep link를 앱에 전달 → index.ts의 `open-url` 이벤트
  4. oauth-handlers.ts의 handleDeepLink(url) 호출
  5. URL 파싱 → code/state 추출 → 해당 서비스의 handleCallback() 호출
  6. 성공 시 settingsWindow에 IPC로 결과 전송 + 자동 동기화 트리거

  지원 프로바이더: Slack, Gmail, Notion (각각 parsed.hostname으로 분기)

  ## AppState 구조

  state.ts의 싱글톤 상태:
  - 윈도우: mainWindow, onboardingWindow, settingsWindow
  - Linear 캐시: teams, projects, users, states, cycles, labels
  - 서비스: geminiAnalyzer, anthropicAnalyzer, slackService, notionService, gmailService, captureService
  - OAuth 대기: pendingSlackCallback, pendingNotionCallback, pendingGmailCallback

  ## 앱 라이프사이클

  index.ts의 주요 흐름:
  1. app.ready → initI18n → 서비스 초기화 → DB 초기화 → 트레이 생성
  2. 온보딩 필요시 → onboarding 윈도우, 아니면 → hotkey 등록
  3. 5분 간격 동기화 스케줄러 시작
  4. app.quit → DB 종료, Notion reader 정리, 단축키 해제
  ```

  **Must NOT do**:
  - 40+ IPC 핸들러를 개별적으로 전부 나열하지 않기 (카테고리별 그룹만)
  - 루트 CLAUDE.md의 권한/배포/Worker 섹션 내용 중복 금지
  - 실제 코드에 없는 이벤트명이나 함수명 임의 기술 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/main/state.ts:1-67` — AppState 인터페이스 전체 (윈도우, 캐시, 서비스, OAuth 콜백)
  - `src/main/oauth-handlers.ts:1-40` — Deep link URL 파싱 패턴 (hostname 분기, code/state 추출)
  - `src/main/index.ts:1-50` — 앱 엔트리포인트 (import 구조, SYNC_INTERVAL_MS=5분, 싱글 인스턴스 잠금)

  **API/Type References**:
  - `src/main/ipc-handlers.ts:1-42` — import 목록으로 의존 서비스 확인
  - `src/main/types.ts` — CaptureSession, OAuthCallback, MAX_IMAGES 타입
  - `src/main/window-manager.ts:1-30` — 윈도우 생성 패턴, 권한 알림

  **WHY Each Reference Matters**:
  - `state.ts`: AppState 구조 설명의 근거. 모든 서비스 참조가 여기에 있음
  - `oauth-handlers.ts`: OAuth 플로우 설명의 근거. hostname 분기 로직이 핵심
  - `index.ts`: 앱 라이프사이클 설명의 근거. ready 이벤트 핸들러 흐름
  - `ipc-handlers.ts`: import 목록에서 핸들러 카테고리를 역추론

  **Acceptance Criteria**:
  - [ ] `test -f src/main/CLAUDE.md` → 파일 존재
  - [ ] `wc -l src/main/CLAUDE.md` → 60-120행
  - [ ] `grep "IPC" src/main/CLAUDE.md` → 매치
  - [ ] `grep "OAuth" src/main/CLAUDE.md` → 매치
  - [ ] `grep "deep link" src/main/CLAUDE.md` 또는 `grep "Deep Link" src/main/CLAUDE.md` → 매치
  - [ ] `grep "AppState" src/main/CLAUDE.md` → 매치

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: main CLAUDE.md 내용 검증
    Tool: Bash
    Preconditions: src/main/CLAUDE.md 생성 후
    Steps:
      1. test -f src/main/CLAUDE.md → Assert: exit 0
      2. wc -l < src/main/CLAUDE.md → Assert: 60-120
      3. grep -c "IPC" src/main/CLAUDE.md → Assert: >= 2
      4. grep -c "OAuth" src/main/CLAUDE.md → Assert: >= 2
      5. grep -ci "deep.link" src/main/CLAUDE.md → Assert: >= 1
      6. grep -c "AppState" src/main/CLAUDE.md → Assert: >= 1
      7. grep -c "index.ts" src/main/CLAUDE.md → Assert: >= 1
    Expected Result: 파일 존재, 적절한 길이, 핵심 키워드 모두 포함

  Scenario: 루트 CLAUDE.md와 중복 없음
    Tool: Bash
    Preconditions: src/main/CLAUDE.md 생성 후
    Steps:
      1. grep -c "npm run" src/main/CLAUDE.md → Assert: 0
      2. grep -c "dist:mac" src/main/CLAUDE.md → Assert: 0
      3. grep -c "코드 서명" src/main/CLAUDE.md → Assert: 0
    Expected Result: 빌드/배포 관련 내용 없음
  ```

  **Commit**: YES (groups with 1, 2, 4)

---

- [ ] 4. 문서 변경 커밋

  **What to do**:
  - **반드시 파일 4개만 명시적으로 `git add`**:
    ```bash
    git add CLAUDE.md README.md src/main/CLAUDE.md src/services/CLAUDE.md
    ```
  - 커밋 메시지: `docs: update project documentation for v1.2.10`
  - **절대 `git add .` 사용 금지** (`.sisyphus/` 포함 방지)

  **Must NOT do**:
  - `git add .` 또는 `git add -A` 사용 금지
  - `.sisyphus/` 파일 커밋에 포함 금지
  - .ts, .js, .json, .html 파일 커밋에 포함 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: git 커밋 작업

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (Sequential)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - 최근 커밋 스타일: `git log --oneline -5` — conventional commits (`fix()`, `feat()`, `perf()`, `docs:`)

  **Acceptance Criteria**:
  - [ ] `git log -1 --oneline` → `docs:` 프리픽스로 시작
  - [ ] `git log -1 --name-only` → 정확히 4개 파일 (CLAUDE.md, README.md, src/main/CLAUDE.md, src/services/CLAUDE.md)
  - [ ] `git diff HEAD -- '*.ts' '*.js' '*.json' '*.html'` → 빈 출력
  - [ ] `git log -1 --name-only | grep -c ".sisyphus"` → 0

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 커밋 정확성 검증
    Tool: Bash
    Preconditions: git add + commit 완료 후
    Steps:
      1. git log -1 --oneline → Assert: "docs:" 프리픽스
      2. git log -1 --name-only --format="" → Assert: 정확히 4줄
      3. git log -1 --name-only --format="" | sort → Assert:
         CLAUDE.md
         README.md
         src/main/CLAUDE.md
         src/services/CLAUDE.md
      4. git diff HEAD -- '*.ts' '*.js' '*.json' '*.html' | wc -l → Assert: 0
      5. git status --porcelain | grep -v "^\?\?" | grep -v ".sisyphus" → Assert: 빈 출력 (untracked 제외 clean)
    Expected Result: 커밋에 정확히 4개 문서 파일만 포함, 코드 파일 무변경
  ```

  **Commit**: 이 태스크 자체가 커밋
  - Message: `docs: update project documentation for v1.2.10`
  - Files: `CLAUDE.md`, `README.md`, `src/main/CLAUDE.md`, `src/services/CLAUDE.md`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 4 (all) | `docs: update project documentation for v1.2.10` | CLAUDE.md, README.md, src/main/CLAUDE.md, src/services/CLAUDE.md | `git log -1 --name-only` → 4 files |

---

## Success Criteria

### Verification Commands
```bash
# README 기술 스택 확인
grep "PGlite" README.md        # Expected: 1 match
grep "pgvector" README.md      # Expected: 1 match
grep "i18next" README.md       # Expected: 1 match

# 새 파일 존재 확인
test -f src/services/CLAUDE.md  # Expected: exit 0
test -f src/main/CLAUDE.md      # Expected: exit 0

# 커밋 확인
git log -1 --oneline            # Expected: docs: update...
git log -1 --name-only          # Expected: 4 files only

# 코드 무변경 확인
git diff HEAD -- '*.ts'         # Expected: empty
```

### Final Checklist
- [ ] README.md 기술 스택에 PGlite, pgvector, RRF, i18next, Slack/Gmail API 포함
- [ ] src/services/CLAUDE.md에 sync-adapters, context-adapters, 검색 파이프라인, 추가 가이드 포함
- [ ] src/main/CLAUDE.md에 파일 역할, IPC 구조, OAuth 플로우, AppState 포함
- [ ] 커밋에 정확히 4개 파일만 포함
- [ ] 코드 파일(.ts, .js, .json, .html) 무변경
- [ ] 모든 내용 한국어로 작성
