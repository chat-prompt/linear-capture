# Linear Capture 리팩토링 계획서

> 2026-02-07 | 코드베이스 정밀 분석 기반 | 추측 없이 코드 근거만 사용

## 분석 요약

| 항목 | 수치 |
|------|------|
| 총 소스 파일 | 75개 |
| 총 코드 라인 | 21,265줄 |
| 200줄 초과 파일 | 15개 (분석 대상 9개 전부 초과) |
| Critical 이슈 | 8개 |
| High 이슈 | 14개 |
| Medium 이슈 | 16개 |

---

## Phase 1: 레거시 제거 & 데드코드 정리

> 목표: 불필요한 코드 ~2,000줄 제거, 이중 인프라 해소
> 위험도: 낮음 (기능에 영향 없는 삭제)

### 1.1 레거시 sql.js 검색 스택 제거 [Critical]

**현황**: PGlite(신규) + sql.js(레거시) 두 개의 검색 인프라가 동시 존재
- `semantic-search.ts` (236줄) — PGlite → sql.js → Worker 폴백 체인
- `hybrid-search.ts` (177줄) — sql.js 기반 FTS4 검색
- `local-vector-store.ts` (441줄) — sql.js 기반 벡터 스토어 (브루트포스 cosine)
- `slack-sync.ts` (153줄, 최상위) — sql.js용 레거시 Slack 동기화

**문제**: 저장소 이중화(~5GB), 메모리 내 전체 스캔, 유지보수 비용
**조치**: 4개 파일 삭제, `semantic-search.ts`의 폴백 체인을 `local-search.ts` 직접 호출로 교체
**절감**: ~1,007줄 삭제

### 1.2 레거시 임베딩 서비스 제거 [High]

**현황**: 두 개의 임베딩 경로 존재
- `embedding-client.ts` (89줄) — Worker 프록시 (활성, 로컬 API 키 불필요)
- `embedding-service.ts` (161줄) — 직접 OpenAI API (레거시, 로컬 API 키 필요)

**조치**: `embedding-service.ts` 삭제, 참조 제거
**절감**: ~161줄 삭제

### 1.3 index.html 데드코드 제거 [Critical]

**현황**: `index.html`의 레거시 컨텍스트 검색 블록 (~731줄)이 DOM 요소(`contextSection_legacy`)가 삭제되어 도달 불가능
**파일**: `src/renderer/index.html:2689-3420`
**조치**: 해당 블록 전체 삭제, 중복된 `escapeHtml()`/`capitalizeFirst()` 정리
**절감**: ~731줄 삭제

### 1.4 디버그 코드 & 데드 메서드 정리 [Medium]

| 위치 | 내용 |
|------|------|
| `ipc-handlers.ts:581, 628` | `_debug: []` 배열 (프로덕션 응답에 포함) |
| `local-search.ts:75-76` | `reinitializeEmbedding()` 빈 메서드 |
| `gmail-sync.ts:465-525` | `syncEmail()` — `processBatchWithEmbedding`으로 대체됨 |

**절감**: ~80줄 삭제

### Phase 1 합계: ~1,979줄 삭제, 파일 4개 제거

### Phase 1 실행 결과 (2026-02-07 완료)

| 항목 | 계획 | 실제 |
|------|------|------|
| 삭제 줄 수 | ~1,979줄 | **2,786줄** (테스트 포함) |
| 삭제 프로덕션 파일 | 4개 | **5개** (embedding-service.ts 포함) |
| 삭제 테스트 파일 | - | **4개** (fts4, hybrid-search, local-vector-store, slack-sync) |
| 빌드 상태 | - | **성공** (tsc + copy-assets) |
| 테스트 회귀 | 0 | **0** (기존 14건 실패는 변경 전과 동일) |

**삭제된 프로덕션 파일**:
- `semantic-search.ts` (236줄) — IPC 핸들러를 `local-search.ts` 기반으로 교체
- `hybrid-search.ts` (177줄) — sql.js FTS4 검색
- `local-vector-store.ts` (441줄) — sql.js 벡터 스토어
- `slack-sync.ts` (153줄, 최상위) — sql.js용 레거시 Slack 동기화
- `embedding-service.ts` (161줄) — 직접 OpenAI API 호출 (레거시)

**수정된 파일**:
- `ipc-handlers.ts` — `context-semantic-search` 핸들러를 `local-search` 기반으로 교체, `_debug` 배열 제거
- `index.html` — 레거시 컨텍스트 검색 블록 731줄 삭제, 연결 상태 변수 이동
- `local-search.ts` — 빈 `reinitializeEmbedding()` 메서드 제거
- `gmail-sync.ts` — 데드 `syncEmail()` 메서드 제거 (61줄)
- `ipc-channels.ts` — `_debug` 타입 필드 제거

---

## Phase 2: DRY 원칙 적용 & 중복 제거

> 목표: 반복 코드 추출, 공유 인프라 구축
> 위험도: 중간 (리팩토링, 기능 동일 유지)

### 2.1 Sync Adapter 베이스 클래스 추출 [Critical]

**현황**: 4개 sync adapter에 동일 메서드 4개가 복사-붙여넣기
| 중복 메서드 | 파일 |
|------------|------|
| `getLastSyncCursor()` | notion-sync, slack-sync, gmail-sync, linear-sync |
| `updateSyncCursor()` | 〃 |
| `updateSyncStatus()` | 〃 |
| `calculateContentHash()` | 〃 |

**조치**: `BaseSyncAdapter` 추상 클래스 생성
```
src/services/sync-adapters/
├── base-sync-adapter.ts  (NEW ~80줄)
├── slack-sync.ts   (extends BaseSyncAdapter)
├── notion-sync.ts  (extends BaseSyncAdapter)
├── gmail-sync.ts   (extends BaseSyncAdapter)
└── linear-sync.ts  (extends BaseSyncAdapter)
```
**절감**: ~400줄 중복 제거

### 2.2 AI Analyzer 통합 [High]

**현황**: `anthropic-analyzer.ts` (120줄)와 `gemini-analyzer.ts` (122줄)가 95% 동일
**조치**: `ai-analyzer.ts`로 통합, `model` 파라미터로 분기
**절감**: ~100줄 삭제

### 2.3 Worker URL 상수 추출 [High]

**현황**: `https://linear-capture-ai.kangjun-f0f.workers.dev`가 10+ 파일에 하드코딩
**파일**: slack-client, gmail-client, notion-client, embedding-client, semantic-search, reranker, ai-recommend, anthropic-analyzer, gemini-analyzer, r2-uploader, analytics, slack-sync(2곳)
**조치**: `src/services/config.ts`에 `WORKER_BASE_URL` 상수 정의, 전 파일 교체

### 2.4 Slack 채널 필터 중복 제거 [High]

**현황**: `local-search.ts`에서 동일한 Slack 채널 필터링 로직이 3곳에 복사
- `semanticSearch()` (286-298행)
- `ftsSearch()` (354-367행)
- `likeSearch()` (410-423행)

**조치**: `buildSlackChannelFilter()` 유틸 함수로 추출

### 2.5 Slack Sync 메시지/스레드 로직 통합 [High]

**현황**: `sync-adapters/slack-sync.ts`에서 `syncMessage()` (373-442)와 `syncThreadReply()` (447-518)가 70% 동일
**조치**: 공통 `upsertSlackContent()` 메서드로 추출

### 2.6 Gmail sync/syncIncremental 통합 [High]

**현황**: `gmail-sync.ts`에서 `sync()` (125-233)와 `syncIncremental()` (235-358)가 80% 구조 동일
**조치**: 공통 페이지네이션 루프를 추출, 초기 커서 로직만 분기

### 2.7 IPC 핸들러 결과 매핑 통합 [Medium]

**현황**: `ipc-handlers.ts:656-691` — slack/notion/linear/gmail 결과를 동일 패턴으로 `.map()` 4회 반복
**조치**: 소스별 필드 매핑 테이블 + 공통 `mapContextResult()` 함수

### Phase 2 합계: ~600줄 절감, 코드 일관성 대폭 향상

### Phase 2 실행 결과 (2026-02-07 진행중)

| 항목 | 상태 | 내용 |
|------|------|------|
| 2.1 BaseSyncAdapter | **완료** | `base-sync-adapter.ts` 생성, 4개 어댑터 상속 적용, ~250줄 중복 제거 |
| 2.2 AI Analyzer 통합 | **완료** | `ai-analyzer.ts` 생성, model 파라미터로 분기, 기존 파일은 잔류(삭제 가능) |
| 2.3 Worker URL 상수 | **완료** | `config.ts` 생성, 12개 파일 26곳 `WORKER_BASE_URL`로 교체 |
| 2.4 Slack 채널 필터 | **완료** | `applySlackChannelFilter()` 메서드 추출, 3곳 중복 제거 |
| 2.5 Slack sync 통합 | 미착수 | syncMessage()/syncThreadReply() 70% 중복 |
| 2.6 Gmail sync 통합 | 미착수 | sync()/syncIncremental() 80% 구조 동일 |
| 2.7 IPC 결과 매핑 | **완료** | 4개 `.map()` 블록을 `for-of` 루프로 통합, Linear timestamp 버그 수정 |

**빌드**: `tsc --noEmit` 통과
**추가 발견**: Linear fallback 경로에서 `timestamp` 누락 버그 → 수정 완료

**남은 작업** (2.5, 2.6):
- 리스크가 높은 리팩토링 (동기화 로직 변경)
- Phase 3과 병행 또는 별도 세션에서 진행 권장

---

## Phase 3: 대형 파일 분할 (구조 개선)

> 목표: 200줄 가이드라인에 맞춰 파일 분할
> 위험도: 중간 (파일 이동, import 경로 변경)

### 3.1 index.html 분할 [Critical]

**현황**: 3,978줄 (Phase 1에서 ~731줄 제거 후에도 ~3,247줄)

**분할 계획**:
```
src/renderer/
├── index.html              (~200줄, HTML 구조만)
├── styles/
│   ├── main.css            (~800줄, 메인 화면 스타일)
│   └── components.css      (~400줄, 드롭다운/모달 스타일)
├── scripts/
│   ├── app.ts              (~150줄, 초기화 + 이벤트 바인딩)
│   ├── issue-form.ts       (~200줄, 이슈 생성 폼 로직)
│   ├── image-gallery.ts    (~150줄, 캡처 이미지 관리)
│   ├── searchable-dropdown.ts (~150줄, 재사용 드롭다운 컴포넌트)
│   ├── context-search.ts   (~170줄, 시맨틱 검색 UI)
│   └── utils.ts            (~50줄, escapeHtml, capitalizeFirst 등)
```

### 3.2 settings.html 분할 [Critical]

**현황**: 2,481줄

**분할 계획**:
```
src/renderer/
├── settings.html           (~200줄, HTML 구조만)
├── styles/
│   └── settings.css        (~500줄)
├── scripts/
│   ├── settings-app.ts     (~150줄, 초기화)
│   ├── settings-general.ts (~150줄, 일반 설정)
│   ├── settings-integrations.ts (~200줄, OAuth 연동)
│   └── settings-sync.ts    (~150줄, 동기화 관리)
```

### 3.3 ipc-handlers.ts 분할 [Critical]

**현황**: 894줄, `registerIpcHandlers()` 단일 함수가 792줄

**분할 계획**:
```
src/main/ipc-handlers/
├── index.ts                (~50줄, 핸들러 등록 진입점)
├── linear-handlers.ts      (~100줄, 팀/프로젝트/사이클/라벨)
├── capture-handlers.ts     (~80줄, 캡처 세션)
├── analysis-handlers.ts    (~60줄, AI 분석)
├── sync-handlers.ts        (~100줄, 동기화)
├── search-handlers.ts      (~180줄, 컨텍스트 검색 + 시맨틱)
├── settings-handlers.ts    (~80줄, 설정 CRUD)
└── oauth-handlers.ts       (~60줄, OAuth 콜백)
```

### 3.4 notion-local-reader.ts 분할 [High]

**현황**: 805줄, 3개 책임 혼재

**분할 계획**:
```
src/services/notion/
├── notion-local-reader.ts  (~150줄, SQLite 연결 관리)
├── notion-page-parser.ts   (~200줄, 페이지 데이터 추출/변환)
├── notion-search.ts        (~150줄, 제목/내용 검색)
└── notion-block-utils.ts   (~100줄, 블록 텍스트 수집)
```

### 3.5 local-search.ts 분할 [Medium]

**현황**: 540줄, 4개 책임 (동기화 오케스트레이션 + 3가지 검색)

**분할 계획**:
```
src/services/
├── sync-orchestrator.ts    (~100줄, syncSource 라우팅)
├── search-service.ts       (~200줄, semantic + FTS + like 검색)
└── search-utils.ts         (~50줄, Slack 채널 필터 등)
```

### Phase 3 합계: 파일 20+ 개로 분할, 평균 파일 크기 ~150줄

---

## Phase 4: 타입 안전성 & 아키텍처 개선

> 목표: 타입 시스템 강화, 보안 개선
> 위험도: 높음 (동작 변경 가능, 단계적 진행)

### 4.1 타입 중복 해소 [High]

**현황**: `src/main/types.ts`가 `src/types/capture.ts`의 완전 복제본
- `main/types.ts`는 `gemini-analyzer`에서 `AnalysisResult` 임포트
- `types/capture.ts`는 `types/shared`에서 임포트
- 두 경로가 동일 타입으로 우연히 해결되지만 divergence 위험

**조치**: `src/main/types.ts` 삭제, 모든 import를 `src/types/capture.ts`로 통일

### 4.2 Document.source_type에 'gmail' 추가 [Medium]

**현황**: `database.ts:17` — `source_type: 'notion' | 'slack' | 'linear'` (gmail 누락)
**조치**: `| 'gmail'` 추가

### 4.3 IPC 타입맵 컴파일 타임 강제 [Medium]

**현황**: `IpcInvokeChannelMap`이 정의되어 있지만 `ipc-handlers.ts`에서 사용하지 않음. 핸들러가 인라인으로 타입을 재선언.
**조치**: 타입 유틸리티 함수 `typedHandle<C extends keyof IpcInvokeChannelMap>()` 래퍼 생성

### 4.4 미등록 IPC 채널 등록 [Low]

**현황**: `sync:delete-source` 핸들러가 존재하지만 `IpcInvokeChannelMap`에 미등록
**조치**: 타입맵에 채널 추가

### 4.5 싱글턴 네이밍 일관성 [Low]

**현황**: `getXxx()` / `createXxx()` / 모듈 레벨 인스턴스 혼용
| 현재 | 문제 |
|------|------|
| `createSlackService()` | 실제로는 캐시된 싱글턴 반환 |
| `createGmailService()` | 〃 |
| `createNotionService()` | 〃 |
| `slackUserCache` (직접 export) | 패턴 불일치 |

**조치**: 모두 `getXxxService()` 패턴으로 통일

---

## Phase 5: 로깅 & 에러 처리 표준화

> 목표: 프로덕션 로그 품질 향상, 에러 처리 일관성
> 위험도: 낮음

### 5.1 console.* → logger.* 전환 [High]

**현황**: 193개 `console.*` 호출이 프로덕션 로그 억제 우회
**대상 파일** (11개):
- `local-search.ts` (23회)
- `gmail-sync.ts` (36회)
- `database.ts` (8회)
- `semantic-search.ts` (19회)
- 기타 7개 파일

**조치**: 모든 `console.log/warn/error`를 `logger.debug/warn/error`로 교체

### 5.2 OAuth 콜백 미처리 Promise [Medium]

**현황**: `oauth-handlers.ts:28, 71, 114` — `.then()` 체인에 `.catch()` 없음
**조치**: 각 콜백에 `.catch()` 추가 또는 `async/await` + `try/catch`로 전환

### 5.3 IPC 핸들러 에러 처리 표준화 [Medium]

**현황**: 일부 핸들러는 try/catch, 일부는 bare handler, 반환 형식 불일치
**조치**: 공통 `wrapHandler()` 래퍼 — 자동 try/catch + 표준 `{ success, data, error }` 반환

---

## Phase 6: 보안 & 테스트 (장기)

> 목표: Electron 보안 강화, 테스트 커버리지 확대
> 위험도: 높음 (대규모 변경)

### 6.1 Preload 스크립트 도입 [High]

**현황**: 모든 윈도우에서 `nodeIntegration: true` + `contextIsolation: false`
- `window-manager.ts:42-43, 78-79, 110-111`
- 렌더러가 직접 `require('electron')` 사용
- preload 스크립트 없음

**조치** (단계적):
1. `preload.ts` 생성 — `contextBridge.exposeInMainWorld('electronAPI', { ... })`
2. 렌더러를 `window.electronAPI.xxx()` 패턴으로 전환
3. `contextIsolation: true`, `nodeIntegration: false`로 변경
4. 기존 inline `ipcRenderer` 호출 전부 교체

**주의**: 렌더러의 모든 IPC 호출 패턴이 변경되므로 Phase 3 (파일 분할) 이후 진행 권장

### 6.2 테스트 커버리지 확대 [Medium]

**미테스트 핵심 파일**:
| 파일 | 줄 수 | 중요도 |
|------|-------|--------|
| `local-search.ts` | 540 | 메인 검색 오케스트레이터 |
| `database.ts` | 258 | PGlite 핵심 서비스 |
| `linear-client.ts` | 386 | Linear API 래퍼 |
| `notion-local-reader.ts` | 805 | Notion 캐시 리더 |
| `settings-store.ts` | 214 | 설정 저장소 |

**조치**: Phase 2-3 완료 후 분할된 모듈 단위로 테스트 추가

### 6.3 Linear Client N+1 쿼리 개선 [Low]

**현황**: `linear-client.ts`에서 `getProjects()`, `getWorkflowStates()`, `getCycles()`가 N+1 API 호출
**조치**: GraphQL 쿼리에 관계 필드 포함으로 일괄 조회

---

## 실행 순서 요약

```
Phase 1 (레거시 제거)     → 위험 낮음, 즉시 시작 가능
  ↓
Phase 2 (중복 제거)       → Phase 1 완료 후 진행
  ↓
Phase 3 (파일 분할)       → Phase 2 완료 후 진행 (가장 큰 구조 변경)
  ↓
Phase 4 (타입 강화)       → Phase 3과 병행 가능
  ↓
Phase 5 (로깅/에러)       → 언제든 독립적으로 진행 가능
  ↓
Phase 6 (보안/테스트)     → Phase 3 완료 후 진행 권장
```

## 예상 효과

| 지표 | Before | After |
|------|--------|-------|
| 총 코드 라인 | 21,265 | ~17,000 (-20%) |
| 200줄 초과 파일 | 15개 | 2-3개 |
| 레거시 이중 인프라 | 3개 (검색, 임베딩, Slack sync) | 0개 |
| 중복 코드 블록 | 15+ | 0 |
| 프로덕션 미억제 console 호출 | 193개 | 0개 |
| 테스트 없는 핵심 서비스 | 5개 | 0개 (Phase 6 후) |
