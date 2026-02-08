# Services Layer

## 개요

비즈니스 로직 레이어. 동기화·검색·외부 API·AI 분석 기능을 담당한다.

## 파일 맵 (카테고리별)

### 동기화 (sync-adapters/)

| 파일 | 역할 |
|------|------|
| base-sync-adapter.ts | 공통 베이스 클래스 (커서, 상태, 해시) |
| notion-sync.ts | Notion 동기화 facade (API + 로컬) |
| notion-sync-api.ts | Notion API 동기화 로직 |
| notion-sync-local.ts | Notion 로컬 캐시 동기화 로직 |
| notion-sync-upsert.ts | Notion DB upsert 공통 로직 |
| slack-sync.ts | Slack 메시지/스레드 동기화 |
| gmail-sync.ts | Gmail 이메일 동기화 |
| linear-sync.ts | Linear 이슈 동기화 |

### 컨텍스트 어댑터 (context-adapters/)

| 파일 | 역할 |
|------|------|
| index.ts | 어댑터 레지스트리 (getAdapter, getAvailableAdapters) |
| notion-adapter.ts | Notion 검색 결과 포맷팅 |
| slack-adapter.ts | Slack 검색 결과 포맷팅 |
| gmail-adapter.ts | Gmail 검색 결과 포맷팅 |
| linear-adapter.ts | Linear 검색 결과 포맷팅 |

### 검색

| 파일 | 역할 |
|------|------|
| local-search.ts | facade (syncSource + search 라우팅) |
| sync-orchestrator.ts | 소스별 동기화 라우팅 |
| search-service.ts | semantic + FTS + like 검색 실행 |
| embedding-client.ts | Worker 기반 임베딩 서비스 (싱글톤) |
| reranker.ts | 검색 결과 재정렬 |
| recency-boost.ts | 최신성 가중치 적용 |

### Notion 로컬 캐시 (notion/)

| 파일 | 역할 |
|------|------|
| types.ts | Notion 관련 타입 정의 |
| notion-block-utils.ts | 블록 텍스트 수집 유틸 |
| notion-page-parser.ts | 페이지 데이터 추출/변환 |
| notion-search.ts | 제목/내용 검색 |

### 외부 API 클라이언트

| 파일 | 역할 |
|------|------|
| notion-client.ts | Notion API 클라이언트 |
| notion-local-reader.ts | Notion 로컬 SQLite 캐시 리더 (facade) |
| slack-client.ts | Slack Web API + OAuth |
| slack-user-cache.ts | Slack 사용자 정보 캐시 |
| gmail-client.ts | Gmail API + OAuth |
| linear-client.ts | Linear GraphQL SDK 래퍼 |
| linear-local-cache.ts | Linear 데이터 로컬 캐시 |
| linear-uploader.ts | 이미지 → Linear 첨부 |

### AI 분석

| 파일 | 역할 |
|------|------|
| ai-analyzer.ts | 통합 AI 분석기 (Gemini/Anthropic, model 파라미터로 분기) |
| ai-recommend.ts | AI 추천 오케스트레이터 |
| r2-uploader.ts | Cloudflare R2 이미지 업로드 |

### 기반

| 파일 | 역할 |
|------|------|
| config.ts | 공유 상수 (WORKER_BASE_URL) |
| database.ts | PGlite (PostgreSQL WASM) + pgvector |
| text-preprocessor.ts | 텍스트 정규화/청킹 |
| settings-store.ts | electron-store 래퍼 |
| analytics.ts | 사용 추적 (Mixpanel) |
| auto-updater.ts | electron-updater 래퍼 |
| utils/logger.ts | 구조화 로깅 유틸 |

## 핵심 패턴

### Sync Adapter 패턴

모든 SyncAdapter는 `BaseSyncAdapter`를 상속:

- `getLastSyncCursor()` / `updateSyncCursor()` — 커서 관리
- `updateSyncStatus()` — 동기화 상태
- `calculateContentHash()` — 변경 감지
- 증분 동기화: `content_hash`로 변경 감지, 커서 기반 페이지네이션
- 배치 임베딩: `embedBatch()`로 일괄 처리

### Context Adapter 패턴

검색 결과를 소스별로 포맷팅하는 어댑터:

- ContextAdapter 인터페이스: `formatResult()`, `getSourceLabel()`
- 레지스트리: `context-adapters/index.ts`의 `getAdapter(source)`
- 새 소스 추가 시: 어댑터 파일 생성 → `index.ts`에 등록

### 검색 파이프라인

`local-search.ts` → `search-service.ts`가 실행:

1. 쿼리 → `embedding-client`로 벡터 생성
2. PGlite에서 벡터 검색 + FTS 검색 병렬 실행
3. RRF(k=60)로 결과 합산
4. `reranker`로 재정렬 → `recency-boost` 적용

## 새 서비스 추가 가이드

### 새 동기화 소스 추가

1. `sync-adapters/`에 `{source}-sync.ts` 생성 (BaseSyncAdapter 상속)
2. `sync-orchestrator.ts`의 `syncSource()`에 소스 등록
3. `context-adapters/`에 어댑터 파일 생성
4. `context-adapters/index.ts`의 switch문에 추가

### 새 AI 분석기 추가

1. `ai-analyzer.ts`에 새 model 분기 추가
2. `ipc-handlers/analysis-handlers.ts`에서 연결
