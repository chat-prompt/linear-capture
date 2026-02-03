# 로컬 PostgreSQL 기반 검색 아키텍처 전환

## Context

### Original Request
EDU-5703: Linear Capture 검색 개선을 위한 효율적인 접근 방식 문의

현재 Cloudflare Worker 기반 검색의 품질 문제:
- `toUpperCase()` 호출로 임베딩 품질 저하
- 텍스트 500자 절단으로 정보 손실
- 전처리 없음 (노이즈 포함)
- 순수 시맨틱 검색만 존재 (키워드 매칭 없음)

### 결정 사항
- Cloudflare Worker 의존성 제거
- 로컬 PostgreSQL (PGlite) 기반으로 전환
- 데이터는 사용자 로컬에서만 보관
- 모든 처리(임베딩 생성, 검색)를 로컬에서 수행

### 현재 아키텍처

```
Linear Capture (Electron)
    │
    ├── SemanticSearchService
    │   └── POST /search → Cloudflare Worker
    │       └── Vectorize (BGE-M3)
    │
    └── ContextAdapters
        └── SlackAdapter (구현됨)
        └── NotionAdapter (미구현)
```

---

## Work Objectives

### Core Objective
Cloudflare Worker 기반 검색을 로컬 PostgreSQL(PGlite + pgvector) 기반으로 전환하여 검색 품질을 개선하고, Notion/Slack/Linear 데이터의 로컬 인덱싱 및 싱크 기능을 구현한다.

### Concrete Deliverables
1. PGlite + pgvector 번들 및 데이터베이스 서비스
2. Notion/Slack/Linear 데이터 싱크 파이프라인
3. 전처리 + OpenAI 임베딩 생성 파이프라인
4. 하이브리드 검색 서비스 (pgvector + FTS → RRF)
5. 기존 SemanticSearchService 대체

### Definition of Done
- [ ] `npm run pack:clean` 후 앱 실행 시 로컬 검색 동작
- [ ] Notion/Slack/Linear 데이터 싱크 완료 후 검색 결과 반환
- [ ] 하이브리드 검색(시맨틱 + 키워드) 결과 확인
- [x] Cloudflare Worker 검색 의존성 제거

### Must Have
- 로컬 PostgreSQL (PGlite) 번들
- pgvector 확장 (시맨틱 검색)
- PostgreSQL FTS (키워드 검색)
- RRF 기반 하이브리드 검색
- Notion/Slack/Linear 증분 싱크
- 전처리 파이프라인 (URL/이모지/마크다운 정리)

### Must NOT Have (Guardrails)
- Cloudflare Worker 의존성 (임베딩, 검색 모두 로컬)
- 외부 서버로 사용자 데이터 전송
- 전체 재인덱싱 강제 (증분 싱크 필수)
- 동기식 싱크로 인한 UI 블로킹

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Linear Capture (Electron App)                                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Data Sync Layer                                            │ │
│  │  ├── NotionSyncAdapter  → Notion API (페이지/블록)          │ │
│  │  ├── SlackSyncAdapter   → Slack API (메시지/스레드)         │ │
│  │  └── LinearSyncAdapter  → Linear API (이슈/문서/코멘트)     │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Processing Pipeline                                        │ │
│  │  ├── TextPreprocessor (URL/이모지/마크다운 정리)            │ │
│  │  ├── Chunker (긴 문서 분할, 선택적)                         │ │
│  │  └── EmbeddingService (OpenAI text-embedding-3-small)       │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Local PostgreSQL (PGlite)                                  │ │
│  │  ├── documents (content, embedding vector, tsvector)        │ │
│  │  ├── sync_cursors (소스별 마지막 싱크 시점)                 │ │
│  │  └── sources (연결 정보)                                    │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  LocalSearchService                                         │ │
│  │  └── 하이브리드 검색 (pgvector 70% + FTS 30% → RRF)         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

```sql
-- PGlite + pgvector 확장
CREATE EXTENSION IF NOT EXISTS vector;

-- 문서 테이블
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,        -- 'notion' | 'slack' | 'linear'
  source_id TEXT NOT NULL,          -- 원본 ID
  parent_id TEXT,                   -- 부모 문서 ID (스레드, 코멘트 등)
  title TEXT,
  content TEXT NOT NULL,
  content_hash TEXT,                -- 변경 감지용
  embedding vector(1536),           -- OpenAI text-embedding-3-small
  tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', content), 'B')
  ) STORED,
  metadata JSONB,                   -- 소스별 추가 정보
  source_created_at TIMESTAMPTZ,    -- 원본 생성일
  source_updated_at TIMESTAMPTZ,    -- 원본 수정일
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(source_type, source_id)
);

-- 벡터 인덱스 (IVFFlat)
CREATE INDEX idx_documents_embedding ON documents 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- FTS 인덱스
CREATE INDEX idx_documents_tsv ON documents USING gin(tsv);

-- 소스별 조회 인덱스
CREATE INDEX idx_documents_source ON documents(source_type, source_updated_at);

-- 싱크 커서 테이블
CREATE TABLE sync_cursors (
  source_type TEXT PRIMARY KEY,
  cursor_value TEXT,              -- 마지막 싱크 시점/ID
  cursor_type TEXT,               -- 'timestamp' | 'id' | 'page_token'
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  items_synced INTEGER DEFAULT 0,
  status TEXT DEFAULT 'idle'      -- 'idle' | 'syncing' | 'error'
);

-- 소스 연결 정보 테이블
CREATE TABLE sources (
  source_type TEXT PRIMARY KEY,
  connected BOOLEAN DEFAULT FALSE,
  connection_info JSONB,          -- workspace 정보 등
  connected_at TIMESTAMPTZ
);
```

---

## Task Flow

```
Task 1 (PGlite 셋업)
    │
    ▼
Task 2 (전처리 + 임베딩 서비스)
    │
    ├─────────────────────────────┐
    ▼                             ▼
Task 3a (Notion 싱크)      Task 3b (Slack 싱크)
    │                             │
    ├─────────────────────────────┤
    ▼                             ▼
Task 3c (Linear 싱크)
    │
    ▼
Task 4 (하이브리드 검색 서비스)
    │
    ▼
Task 5 (기존 서비스 대체 + 통합)
    │
    ▼
Task 6 (UI 연동 + 싱크 상태 표시)
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 3a, 3b, 3c | 독립적인 데이터 소스 어댑터 |

| Task | Depends On | Reason |
|------|------------|--------|
| 2 | 1 | DB 서비스 필요 |
| 3a, 3b, 3c | 1, 2 | DB + 임베딩 서비스 필요 |
| 4 | 1 | DB 스키마 필요 |
| 5 | 3, 4 | 싱크 + 검색 서비스 필요 |
| 6 | 5 | 통합 완료 후 UI 연동 |

---

## TODOs

### Phase 1: 기반 구축

- [x] 1. PGlite + pgvector 번들 및 DatabaseService 구현

  **What to do**:
  - PGlite 패키지 설치 (`@electric-sql/pglite`)
  - pgvector 확장 로드
  - DatabaseService 클래스 구현 (싱글톤)
  - 스키마 마이그레이션 로직
  - 앱 시작 시 DB 초기화

  **Must NOT do**:
  - 외부 PostgreSQL 연결
  - 동기식 초기화로 앱 시작 블로킹

  **Parallelizable**: NO (기반 작업)

  **References**:
  - PGlite 공식 문서: https://pglite.dev/
  - pgvector 확장: https://github.com/pgvector/pgvector
  - `src/services/settings-store.ts` - Electron 데이터 저장 패턴 참고

  **Acceptance Criteria**:
  - [x] `npm install` 후 PGlite 패키지 설치 확인
  - [ ] 앱 시작 시 `~/Library/Application Support/linear-capture/local.db` 생성
  - [ ] `documents`, `sync_cursors`, `sources` 테이블 생성 확인
  - [ ] pgvector 확장 로드 확인

  **Commit**: YES
  - Message: `feat(db): add PGlite + pgvector local database service`
  - Files: `src/services/database.ts`, `package.json`

---

- [x] 2. 전처리 + EmbeddingService 구현

  **What to do**:
  - TextPreprocessor 클래스 구현
    - URL 정규화/제거
    - 이모지 제거
    - 중복 공백 정리
    - 마크다운 문법 정리 (선택적 보존)
  - EmbeddingService 클래스 구현
    - OpenAI API 호출 (text-embedding-3-small)
    - 배치 임베딩 지원 (최대 2048 토큰)
    - Rate limit 핸들링

  **Must NOT do**:
  - Cloudflare Worker 호출
  - `toUpperCase()` 적용
  - 500자 미만 텍스트 절단

  **Parallelizable**: NO (Task 1 의존)

  **References**:
  - OpenAI Embeddings API: https://platform.openai.com/docs/guides/embeddings
  - `src/services/anthropic-analyzer.ts` - API 호출 패턴 참고

  **Acceptance Criteria**:
  - [ ] 전처리 테스트 통과
  - [ ] 임베딩 생성 테스트 (1536 차원 벡터 반환)

  **Commit**: YES
  - Message: `feat(search): add text preprocessor and embedding service`
  - Files: `src/services/text-preprocessor.ts`, `src/services/embedding-service.ts`

---

### Phase 2: 데이터 싱크 파이프라인

- [x] 3a. NotionSyncAdapter 구현

  **What to do**:
  - 기존 `NotionService` 활용하여 페이지 목록 가져오기
  - 페이지 콘텐츠 추출 및 전처리
  - 증분 싱크 (last_edited_time 기반)
  - documents 테이블에 저장 + 임베딩 생성

  **Parallelizable**: YES (with 3b, 3c)

  **References**:
  - `src/services/notion-client.ts` - 기존 Notion 연동 코드
  - Notion API 문서: https://developers.notion.com/

  **Commit**: YES
  - Message: `feat(sync): add Notion sync adapter`
  - Files: `src/services/sync-adapters/notion-sync.ts`

---

- [x] 3b. SlackSyncAdapter 구현

  **What to do**:
  - 기존 `SlackAdapter` 확장
  - 채널 메시지 히스토리 가져오기
  - 스레드 답글 포함
  - 증분 싱크 (oldest timestamp 기반)

  **Parallelizable**: YES (with 3a, 3c)

  **References**:
  - `src/services/slack-client.ts` - 기존 Slack 연동
  - Slack API: https://api.slack.com/methods

  **Commit**: YES
  - Message: `feat(sync): add Slack sync adapter`
  - Files: `src/services/sync-adapters/slack-sync.ts`

---

- [x] 3c. LinearSyncAdapter 구현

  **What to do**:
  - 기존 `LinearClient` 활용
  - 이슈, 문서, 코멘트 가져오기
  - 증분 싱크 (updatedAt 기반)

  **Parallelizable**: YES (with 3a, 3b)

  **References**:
  - `src/services/linear-client.ts` - 기존 Linear 연동
  - Linear API: https://developers.linear.app/docs

  **Commit**: YES
  - Message: `feat(sync): add Linear sync adapter`
  - Files: `src/services/sync-adapters/linear-sync.ts`

---

### Phase 3: 검색 서비스

- [x] 4. LocalSearchService (하이브리드 검색) 구현

  **What to do**:
  - 시맨틱 검색 (pgvector cosine similarity)
  - 키워드 검색 (PostgreSQL FTS)
  - RRF (Reciprocal Rank Fusion) 결합
  - 기존 `SearchResult` 타입 호환

  **Must NOT do**:
  - 외부 Worker 호출
  - 순수 시맨틱만 사용

  **References**:
  - `src/services/semantic-search.ts` - 기존 검색 인터페이스
  - `src/types/context-search.ts` - 타입 정의

  **Commit**: YES
  - Message: `feat(search): add local hybrid search service (pgvector + FTS)`
  - Files: `src/services/local-search.ts`

---

### Phase 4: 통합

- [x] 5. 기존 서비스 대체 및 통합

  **What to do**:
  - `SemanticSearchService` → `LocalSearchService` 대체
  - `ContextAdapter.fetchItems` → DB 조회로 변경
  - 기존 Worker 검색 코드 제거/비활성화

  **Commit**: YES
  - Message: `refactor(search): replace Worker search with local search`
  - Files: `src/services/semantic-search.ts`, `src/services/context-adapters/index.ts`

---

- [x] 6. UI 연동 (싱크 상태 표시)

  **What to do**:
  - Settings 화면에 싱크 상태 표시
  - 수동 싱크 버튼 추가
  - 싱크 진행률 표시
  - 마지막 싱크 시간 표시

  **Commit**: YES
  - Message: `feat(ui): add sync status and manual sync button to settings`
  - Files: `src/renderer/settings.html`, `src/main/index.ts`

---

## 예상 일정

| Phase | 기간 | 비고 |
|-------|:----:|------|
| Phase 1: 기반 구축 | 3-4일 | PGlite + 임베딩 |
| Phase 2: 싱크 파이프라인 | 4-5일 | 병렬 작업 가능 |
| Phase 3: 검색 서비스 | 2-3일 | |
| Phase 4: 통합 | 2-3일 | |
| **Total** | **~2주** | |

---

## Success Criteria

### Final Checklist
- [x] 모든 "Must Have" 항목 구현됨
- [x] Cloudflare Worker 검색 의존성 제거됨
- [ ] 하이브리드 검색 (시맨틱 + 키워드) 동작 확인
- [ ] 증분 싱크 동작 확인
- [ ] 앱 시작 시 기존 인덱스 유지됨
