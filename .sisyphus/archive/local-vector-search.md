# 로컬 벡터 검색 구현 (Phase 1: Slack)

## TL;DR

> **Quick Summary**: 검색은 로컬에서, 임베딩 생성은 Worker 경유 (OpenAI). SQLite 브루트포스 + FTS4 하이브리드.
> 
> **Deliverables**:
> - Worker `/embeddings` 엔드포인트 추가 (OpenAI text-embedding-3-small)
> - 로컬 SQLite 벡터 저장소 (sql.js 재사용)
> - FTS4 + 코사인 유사도 하이브리드 검색 (FTS5 미지원으로 FTS4 사용)
> - Slack 동기화 (앱 시작 + OAuth 완료 시)
> 
> **Estimated Effort**: Medium (4-6시간)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 0 → Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
LanceDB vs SQLite 브루트포스 비교 후 Phase 1으로 SQLite 선택. Worker Hybrid 아키텍처로 결정:
- **임베딩 생성**: Worker `/embeddings` 경유 (OpenAI 고품질)
- **벡터 저장/검색**: 로컬 SQLite (오프라인 검색 가능)

### Interview Summary
**Key Discussions**:
- 100K vectors 벤치마크: sqlite-vec 부적합, LanceDB 우수
- 현재 규모 5K-20K에서 SQLite 브루트포스 충분 (100-200ms)
- Phase 1: Slack → Phase 1.5: Notion, Linear → Phase 2: LanceDB (필요시)
- Worker Hybrid vs 완전 로컬 비교 → Hybrid 선택 (품질 + 구현 단순성)

**Research Findings**:
- sql.js WASM 이미 사용 중 (`src/services/notion-local-reader.ts:153-206`)
- vitest 설정됨 (`package.json:14`)
- SlackAdapter.fetchItems()는 빈 쿼리 시 빈 배열 반환 → **별도 동기화 메서드 필요**

### Metis Review
**Identified Gaps** (addressed):
- 데이터 소스 미결정 → Slack 선택
- OpenAI API 위치 미결정 → Worker 경유 (기존 bge-m3와 별도 운영)
- FTS5 가용성 확인 필요 → **Task 0 완료: FTS5 미지원 확인, FTS4 사용 결정**
- SemanticSearchService 인터페이스 유지 → Task 5에서 통합
- **SlackAdapter 버그** → 별도 `syncRecentMessages()` 구현
- **ContextSource 타입 누락** → 'linear' 추가
- **동기화 트리거 누락** → OAuth 완료 시 동기화 추가
- **다중 워크스페이스 충돌** → workspace_id 컬럼 추가

---

## Work Objectives

### Core Objective
Slack 메시지를 로컬 SQLite에 임베딩과 함께 저장하고, FTS4 + 벡터 검색 하이브리드로 검색. 
임베딩 생성은 Worker 경유(OpenAI), 검색은 완전 로컬.

### Concrete Deliverables
- `src/services/local-vector-store.ts` - SQLite 벡터 저장소
- `src/services/embedding-client.ts` - Worker 임베딩 API 클라이언트
- `src/services/hybrid-search.ts` - FTS4 + 코사인 유사도 결합
- `src/services/slack-sync.ts` - Slack 메시지 동기화 (새 파일)
- Worker `/embeddings` 엔드포인트

### Definition of Done
- [ ] 앱 시작 시 Slack 메시지 동기화 (1K 메시지 < 2분)
- [ ] OAuth 완료 시 해당 소스 동기화 트리거
- [ ] 시맨틱 검색 응답 < 200ms (5K 벡터)
- [ ] FTS4 fallback 동작 (임베딩 없을 때)
- [ ] 기존 SemanticSearchService 인터페이스 유지
- [ ] 다중 워크스페이스 충돌 없음

### Must Have
- Float32Array BLOB 저장 (1536차원)
- content hash 중복 제거
- workspace_id로 다중 워크스페이스 분리
- 레이트 리밋 핸들링 (exponential backoff)
- 에러 시 graceful degradation

### Must NOT Have (Guardrails)
- UI 변경 (Phase 1은 백엔드만)
- 다른 소스 동시 인덱싱 (Slack만)
- 기존 SlackAdapter.fetchItems() 수정 (새 메서드 추가)
- 기존 Worker Vectorize 인덱스와 혼용 (별도 운영)
- LanceDB 또는 다른 벡터 DB

---

## Architecture Decision Record

### Worker Hybrid vs 완전 로컬

| 기준 | Worker Hybrid (선택) | 완전 로컬 |
|------|---------------------|-----------|
| 임베딩 품질 | OpenAI (1536차원, 최고) | MiniLM (384차원, 좋음) |
| 앱 크기 | 변화 없음 | +22MB |
| 인덱싱 속도 | 빠름 (API) | 느림 (CPU) |
| 오프라인 지원 | 검색만 | 인덱싱+검색 |
| 구현 복잡도 | 중간 | 높음 |

**결정 근거**: 빠른 MVP + 고품질 임베딩이 우선. 나중에 완전 로컬로 마이그레이션 가능.

### 기존 Worker Vectorize와의 관계

| 항목 | 기존 Vectorize | 새 로컬 검색 |
|------|---------------|-------------|
| 모델 | Cloudflare AI bge-m3 | OpenAI text-embedding-3-small |
| 저장소 | Cloudflare Vectorize | 로컬 SQLite |
| 용도 | /ai/recommend (proactive) | 검색 (reactive) |

**별도 운영**: 서로 다른 임베딩 모델이므로 벡터 혼용 불가. 완전히 독립적으로 운영.

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest in `package.json:14`)
- **User wants tests**: YES (TDD)
- **Framework**: vitest
- **QA approach**: 단위 테스트 + 패키징 후 수동 검증

### TDD Workflow
각 TODO는 RED-GREEN-REFACTOR:
1. **RED**: 테스트 먼저 작성 → 실패 확인
2. **GREEN**: 최소 구현 → 테스트 통과
3. **REFACTOR**: 정리

### Manual Verification
```bash
# 앱 빌드 및 실행 (패키징 후 테스트 필수)
npm run pack:clean

# DevTools Console에서 확인
# - 동기화 로그: "[SlackSync] Synced N items from workspace X"
# - 검색 로그: "[HybridSearch] Query: X, Results: Y, Duration: Zms"
```

### FTS4 패키징 테스트 (COMPLETED)
```bash
# Task 0에서 FTS5 미지원 확인, FTS4 사용 결정
# Main 프로세스에서 notion-local-reader.ts와 동일한 locateFile 패턴으로 동작 확인
# Renderer(DevTools)에서는 WASM 경로 문제로 테스트 불가 - 이는 예상된 동작
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 0: 테스트 인프라 확인 + FTS4 가용성 검증 ✅
└── Task 1: Worker /embeddings 엔드포인트

Wave 2 (After Wave 1):
├── Task 2: LocalVectorStore 구현
├── Task 3: EmbeddingClient 구현
└── Task 3.5: SlackSync 구현 (새 Task)

Wave 3 (After Wave 2):
├── Task 4: HybridSearch 구현
└── Task 5: SemanticSearchService 통합 + 동기화 트리거

Critical Path: 0 → 1 → 2 → 3 → 3.5 → 4 → 5
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | 2, 3, 3.5, 4 | 1 |
| 1 | None | 3 | 0 |
| 2 | 0 | 4, 5 | 3, 3.5 |
| 3 | 0, 1 | 3.5, 4 | 2 |
| 3.5 | 3 | 5 | 2 |
| 4 | 2, 3 | 5 | None |
| 5 | 3.5, 4 | None | None (final) |

---

## TODOs

### Task 0: 테스트 인프라 확인 및 FTS 가용성 검증 ✅ COMPLETED

- [x] 0. 테스트 인프라 확인 및 FTS 가용성 검증

  **완료 결과**:
  - vitest 설정 확인 ✅ (56 tests passed)
  - sql.js FTS 지원 테스트: **FTS5 미지원, FTS4 사용 결정** ✅
  - ContextSource 타입에 'linear' 추가 ✅
  - FTS4 테스트 파일 작성 (`src/services/__tests__/fts4.test.ts`) ✅
  - context-adapters/index.ts에 default case 추가 (빌드 에러 수정) ✅

  **FTS 가용성 확인 결과**:
  ```
  SQLite compile options:
  - ENABLE_FTS3 ✅
  
  FTS3: AVAILABLE ✅
  FTS4: AVAILABLE ✅
  FTS5: NOT AVAILABLE ❌ (no such module)
  ```

  **결정**: FTS5 대신 FTS4 사용. FTS4는 FTS3의 개선 버전으로 키워드 검색에 충분함.
  RRF(Reciprocal Rank Fusion)로 결과 결합 시 bm25() 내장 함수 불필요.

  **생성/수정된 파일**:
  - `src/services/__tests__/fts4.test.ts` (신규) - 6 tests passed
  - `src/types/context-search.ts` (수정) - 'linear' 추가
  - `src/services/context-adapters/index.ts` (수정) - default case 추가

  **Commit**: PENDING
  - Message: `test: verify FTS4 availability and add 'linear' to ContextSource`

---

### Task 1: Worker /embeddings 엔드포인트 추가 ✅ COMPLETED

- [x] 1. Worker `/embeddings` 엔드포인트 추가

  **완료 결과**:
  - `linear-capture-worker/src/embeddings-openai.ts` 생성 (112 lines)
  - `linear-capture-worker/src/index.ts` 수정 (route + Env 타입)
  - OpenAI text-embedding-3-small 호출 (1536차원)
  - 배치 처리 (최대 100개), 입력 검증
  - wrangler deploy 완료, 수동 테스트 통과 ✅

  **테스트 결과**:
  ```bash
  curl -X POST https://linear-capture-ai.ny-4f1.workers.dev/embeddings \
    -H "Content-Type: application/json" -d '{"texts": ["test"]}' | jq '.embeddings[0] | length'
  # 결과: 1536 ✅
  ```

---

### Task 1.5: Worker /slack/history 엔드포인트 추가 ✅ COMPLETED

- [x] 1.5. Worker `/slack/history` 엔드포인트 추가

  **완료 결과**:
  - `linear-capture-worker/src/slack/history.ts` 생성 (129 lines)
  - `linear-capture-worker/src/index.ts` 수정 (route 추가)
  - conversations.history API 호출
  - wrangler deploy 완료

  **✅ 해결됨: Slack OAuth 스코프** (2025-02-03):
  - **증상**: `/slack/channels` 호출 시 `missing_scope` 에러
  - **원인**: private channel 접근에 `groups:read`, `groups:history` 스코프 필요
  - **해결**: Worker OAuth 스코프에 `groups:read`, `groups:history` 추가 후 재연결
  - **최종 스코프**: `['search:read', 'channels:read', 'channels:history', 'groups:read', 'groups:history', 'users:read']`
  - **테스트 결과**: 24개 채널 조회 성공 ✅

---

### [LEGACY] Task 1: Worker /embeddings 엔드포인트 추가

  **What to do**:
  - `linear-capture-worker`에 `/embeddings` POST 엔드포인트 추가
  - OpenAI text-embedding-3-small 호출 (1536차원)
  - 배치 처리 지원 (최대 100개)
  - 레이트 리밋 핸들링
  - OPENAI_API_KEY는 Worker secret으로 관리

  **Must NOT do**:
  - 기존 Worker 엔드포인트 변경
  - 임베딩 캐싱 (클라이언트에서 처리)
  - 기존 bge-m3 Vectorize와 혼용

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - 기존 Worker 패턴 따름

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 0)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `linear-capture-worker/src/index.ts:1-100` - 메인 라우터
  - `linear-capture-worker/src/vectorize/embeddings.ts` - 기존 임베딩 패턴 (bge-m3, 참고용)
  - OpenAI Embeddings API: https://platform.openai.com/docs/guides/embeddings

  **구현 예시**:
  ```typescript
  // linear-capture-worker/src/embeddings-openai.ts (새 파일)
  
  interface EmbeddingRequest {
    texts: string[];  // 최대 100개
  }
  
  interface EmbeddingResponse {
    embeddings: number[][];  // 1536차원 벡터 배열
    model: string;
    usage: { prompt_tokens: number; total_tokens: number };
  }
  
  export async function handleEmbeddings(
    request: Request,
    env: { OPENAI_API_KEY: string },
    corsHeaders: Record<string, string>
  ): Promise<Response> {
    const body: EmbeddingRequest = await request.json();
    
    if (!body.texts || body.texts.length === 0) {
      return new Response(JSON.stringify({ error: 'texts required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (body.texts.length > 100) {
      return new Response(JSON.stringify({ error: 'max 100 texts' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: body.texts
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      return new Response(JSON.stringify({ error }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const data = await response.json();
    const embeddings = data.data.map((d: any) => d.embedding);
    
    return new Response(JSON.stringify({
      embeddings,
      model: data.model,
      usage: data.usage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  ```

  **Acceptance Criteria**:
  ```bash
  # Worker 로컬 테스트
  cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
  npx wrangler dev
  
  # 임베딩 테스트
  curl -X POST http://localhost:8787/embeddings \
    -H "Content-Type: application/json" \
    -d '{"texts": ["hello world", "test message"]}' \
    | jq '.embeddings | length'
  # Expected: 2
  
  # 차원 확인
  curl -X POST http://localhost:8787/embeddings \
    -H "Content-Type: application/json" \
    -d '{"texts": ["test"]}' \
    | jq '.embeddings[0] | length'
  # Expected: 1536
  
  # 에러 핸들링
  curl -X POST http://localhost:8787/embeddings \
    -H "Content-Type: application/json" \
    -d '{"texts": []}'
  # Expected: 400 error
  ```

  **Worker Secret 설정**:
  ```bash
  # OPENAI_API_KEY 추가
  npx wrangler secret put OPENAI_API_KEY
  ```

  **Commit**: YES
  - Message: `feat(worker): add /embeddings endpoint for OpenAI text-embedding-3-small`
  - Files: `linear-capture-worker/src/embeddings-openai.ts`, `linear-capture-worker/src/index.ts`

---

### Task 2: LocalVectorStore 구현 ✅ COMPLETED

- [x] 2. LocalVectorStore 구현 (SQLite + Float32Array)

  **완료 결과**:
  - `src/services/local-vector-store.ts` 생성 (~400 lines)
  - `src/services/__tests__/local-vector-store.test.ts` 생성
  - 11/11 테스트 통과 ✅
  - FTS4 가상 테이블, Float32Array BLOB 저장, workspace_id 분리 구현

---

### [LEGACY] Task 2: LocalVectorStore 구현

  **What to do**:
  - `src/services/local-vector-store.ts` 생성
  - sql.js로 SQLite DB 생성/관리
  - Float32Array를 BLOB으로 저장 (1536 dims × 4 bytes = 6KB/벡터)
  - FTS4 가상 테이블 생성
  - content hash 기반 중복 제거
  - **workspace_id로 다중 워크스페이스 분리**

  **Must NOT do**:
  - 기존 NotionLocalReader 수정
  - 새 sql.js 인스턴스 (WASM 로딩 패턴 재사용)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
    - sql.js 패턴 따름

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3, 3.5)
  - **Blocks**: Task 4, 5
  - **Blocked By**: Task 0

  **References**:
  - `src/services/notion-local-reader.ts:153-206` - sql.js 초기화 패턴
  - `src/services/notion-local-reader.ts:178-193` - WASM 로딩 (app.asar.unpacked 경로)

  **스키마**:
  ```sql
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,           -- 'slack' | 'notion' | 'gmail' | 'linear'
    workspace_id TEXT NOT NULL,     -- 다중 워크스페이스 지원
    content_hash TEXT,              -- SHA256 for dedup
    content TEXT NOT NULL,
    title TEXT,
    url TEXT,
    timestamp INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(source, workspace_id, content_hash)
  );
  
  CREATE TABLE IF NOT EXISTS embeddings (
    doc_id TEXT PRIMARY KEY REFERENCES documents(id),
    vector BLOB NOT NULL,           -- Float32Array as BLOB (1536 × 4 = 6KB)
    model_id TEXT DEFAULT 'openai-3-small',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  
  CREATE TABLE IF NOT EXISTS sync_cursors (
    source TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    channel_id TEXT,                -- Slack 채널별 커서
    cursor_value TEXT,              -- last_ts 또는 historyId
    last_sync INTEGER,
    PRIMARY KEY (source, workspace_id, channel_id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source);
  CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_documents_timestamp ON documents(timestamp DESC);
  
  -- FTS4 for keyword search (FTS5 미지원으로 FTS4 사용)
  CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts4(
    content, title, 
    content='documents'
  );
  
  -- FTS4 동기화 트리거
  CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(docid, content, title) 
    VALUES (new.rowid, new.content, new.title);
  END;
  
  CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
    DELETE FROM documents_fts WHERE docid = old.rowid;
  END;
  ```

  **인터페이스**:
  ```typescript
  import type { ContextSource } from '../types/context-search';
  
  interface VectorDocument {
    id: string;
    source: ContextSource;
    workspaceId: string;
    content: string;
    title?: string;
    url?: string;
    timestamp?: number;
    contentHash?: string;
  }
  
  interface VectorItem extends VectorDocument {
    embedding: Float32Array;  // 1536 dims
  }
  
  interface SearchResult extends VectorDocument {
    score: number;
  }
  
  class LocalVectorStore {
    private db: Database | null = null;
    private dbPath: string;
    
    constructor(dbName = 'vector-store.db');
    
    async initialize(): Promise<boolean>;
    
    // 문서 + 임베딩 저장 (upsert)
    async upsert(items: VectorItem[]): Promise<number>;
    
    // 벡터 검색 (코사인 유사도)
    async vectorSearch(
      embedding: Float32Array, 
      options?: { source?: ContextSource; workspaceId?: string; limit?: number }
    ): Promise<SearchResult[]>;
    
    // FTS4 키워드 검색
    async ftsSearch(
      query: string,
      options?: { source?: ContextSource; workspaceId?: string; limit?: number }
    ): Promise<SearchResult[]>;
    
    // 동기화 커서 관리
    async getSyncCursor(source: ContextSource, workspaceId: string, channelId?: string): Promise<string | null>;
    async setSyncCursor(source: ContextSource, workspaceId: string, channelId: string | null, cursor: string): Promise<void>;
    
    // 정리
    async deleteBySource(source: ContextSource, workspaceId?: string): Promise<number>;
    async getStats(): Promise<{ totalDocs: number; bySource: Record<string, number> }>;
    close(): void;
  }
  
  // 코사인 유사도 계산 (정규화된 벡터 가정)
  function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;  // 정규화된 벡터면 dot product = cosine similarity
  }
  ```

  **Acceptance Criteria**:
  ```typescript
  // 테스트 파일: src/services/__tests__/local-vector-store.test.ts
  
  describe('LocalVectorStore', () => {
    it('should initialize SQLite database with FTS4', async () => {
      const store = new LocalVectorStore();
      expect(await store.initialize()).toBe(true);
    });
    
    it('should upsert items with embeddings', async () => {
      const embedding = new Float32Array(1536).fill(0.1);
      const items = [{ 
        id: '1', 
        source: 'slack' as const, 
        workspaceId: 'T123',
        content: 'test message',
        embedding 
      }];
      const count = await store.upsert(items);
      expect(count).toBe(1);
    });
    
    it('should deduplicate by content hash', async () => {
      // 같은 content로 2번 upsert → 1개만 저장
    });
    
    it('should separate by workspace_id', async () => {
      // 같은 채널 ID라도 다른 워크스페이스면 별도 저장
    });
    
    it('should search by cosine similarity', async () => {
      // embedding 저장 후 유사 벡터로 검색
    });
    
    it('should FTS search by keyword', async () => {
      // content에 "error" 포함된 항목 검색
    });
    
    it('should manage sync cursors', async () => {
      await store.setSyncCursor('slack', 'T123', 'C456', '1234567890.123456');
      const cursor = await store.getSyncCursor('slack', 'T123', 'C456');
      expect(cursor).toBe('1234567890.123456');
    });
  });
  ```

  **Commit**: YES
  - Message: `feat: implement LocalVectorStore with SQLite, FTS4, and workspace separation`
  - Files: `src/services/local-vector-store.ts`, `src/services/__tests__/local-vector-store.test.ts`

---

### Task 3: EmbeddingClient 구현 ✅ COMPLETED

- [x] 3. EmbeddingClient 구현 (Worker API 호출)

  **완료 결과**:
  - `src/services/embedding-client.ts` 생성 (87 lines)
  - `src/services/__tests__/embedding-client.test.ts` 생성
  - 5/5 테스트 통과 ✅
  - 배치 처리 (100개씩), exponential backoff, graceful degradation 구현

---

### [LEGACY] Task 3: EmbeddingClient 구현

  **What to do**:
  - `src/services/embedding-client.ts` 생성
  - Worker `/embeddings` 엔드포인트 호출
  - 배치 처리 (100개씩)
  - 레이트 리밋 시 exponential backoff
  - 에러 시 graceful degradation (빈 배열 반환)

  **Must NOT do**:
  - OpenAI 직접 호출 (Worker 경유)
  - 임베딩 캐싱 (LocalVectorStore에서 처리)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - fetch 패턴 따름

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 2, 3.5)
  - **Blocks**: Task 3.5, 4
  - **Blocked By**: Task 0, 1

  **References**:
  - `src/services/semantic-search.ts:40-58` - Worker fetch 패턴
  - `src/services/r2-uploader.ts:50-70` - retry 패턴

  **구현**:
  ```typescript
  const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';
  
  interface EmbeddingResponse {
    embeddings: number[][];
    model: string;
    usage: { prompt_tokens: number; total_tokens: number };
  }
  
  export class EmbeddingClient {
    private maxRetries = 3;
    private batchSize = 100;
    private baseDelay = 1000;
    
    private async sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      
      const results: Float32Array[] = [];
      
      // 배치 처리
      for (let i = 0; i < texts.length; i += this.batchSize) {
        const batch = texts.slice(i, i + this.batchSize);
        const batchResult = await this.embedBatch(batch);
        results.push(...batchResult);
      }
      
      return results;
    }
    
    private async embedBatch(texts: string[]): Promise<Float32Array[]> {
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = this.baseDelay * Math.pow(2, attempt - 1);
            await this.sleep(delay);
          }
          
          const response = await fetch(`${WORKER_URL}/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts })
          });
          
          if (response.status === 429) {
            console.warn('[EmbeddingClient] Rate limited, retrying...');
            continue;
          }
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const data = await response.json() as EmbeddingResponse;
          return data.embeddings.map(e => new Float32Array(e));
          
        } catch (error) {
          console.error(`[EmbeddingClient] Attempt ${attempt + 1} failed:`, error);
          if (attempt === this.maxRetries - 1) {
            console.error('[EmbeddingClient] All retries failed, returning empty');
            return texts.map(() => new Float32Array(0));
          }
        }
      }
      
      return texts.map(() => new Float32Array(0));
    }
    
    async embedSingle(text: string): Promise<Float32Array> {
      const results = await this.embed([text]);
      return results[0] || new Float32Array(0);
    }
  }
  ```

  **Acceptance Criteria**:
  ```typescript
  // 테스트: src/services/__tests__/embedding-client.test.ts
  
  describe('EmbeddingClient', () => {
    it('should return 1536-dim embeddings', async () => {
      const client = new EmbeddingClient();
      const embeddings = await client.embed(['test']);
      expect(embeddings[0].length).toBe(1536);
    });
    
    it('should batch large inputs', async () => {
      const texts = Array(150).fill('test');
      const embeddings = await client.embed(texts);
      expect(embeddings.length).toBe(150);
    });
    
    it('should handle rate limit with backoff', async () => {
      // Mock 429 → retry → success
    });
    
    it('should return empty arrays on failure (graceful degradation)', async () => {
      // Mock persistent failure
      const embeddings = await client.embed(['test']);
      expect(embeddings[0].length).toBe(0);
    });
  });
  ```

  **Commit**: YES
  - Message: `feat: implement EmbeddingClient with batch processing and exponential backoff`
  - Files: `src/services/embedding-client.ts`, `src/services/__tests__/embedding-client.test.ts`

---

### Task 3.5: SlackSync 구현 ✅ COMPLETED

- [x] 3.5. SlackSync 구현 (Slack 메시지 동기화)

  **완료 결과**:
  - `src/services/slack-sync.ts` 생성 (159 lines)
  - `src/services/__tests__/slack-sync.test.ts` 생성
  - 3/3 테스트 통과 ✅
  - Worker `/slack/history` 호출, 채널별 증분 동기화, 커서 관리 구현

  **✅ 해결됨: Slack OAuth 스코프** (Task 1.5와 동일):
  - Worker에 `groups:read`, `groups:history` 스코프 추가됨
  - 사용자 Slack 재연결 후 정상 동작 확인 ✅

---

### [LEGACY] Task 3.5: SlackSync 구현 (새 Task)

  **What to do**:
  - `src/services/slack-sync.ts` 생성
  - Slack API `conversations.list` + `conversations.history` 사용
  - 채널별 증분 동기화 (last_ts 커서 사용)
  - 임베딩 생성 및 LocalVectorStore 저장
  - 레이트 리밋 핸들링

  **Must NOT do**:
  - 기존 SlackAdapter 수정
  - 전체 히스토리 가져오기 (최근 N일만)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
    - Slack API 호출

  **Parallelization**:
  - **Can Run In Parallel**: YES (부분적으로)
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `src/services/slack-client.ts:76-95` - startOAuthFlow (OAuth 시작)
  - `src/services/slack-client.ts:149-161` - getChannels 조회 패턴
  - `src/services/slack-client.ts:119-147` - getConnectionStatus (workspace.id 사용)
  - Slack API: https://api.slack.com/methods/conversations.history

  **구현**:
  ```typescript
  import { createSlackService } from './slack-client';
  import { LocalVectorStore } from './local-vector-store';
  import { EmbeddingClient } from './embedding-client';
  
  interface SlackSyncOptions {
    maxChannels?: number;      // 기본 50
    maxMessagesPerChannel?: number;  // 기본 100
    retentionDays?: number;    // 기본 90
  }
  
  export class SlackSync {
    private slackService = createSlackService();
    private embeddingClient = new EmbeddingClient();
    
    constructor(private vectorStore: LocalVectorStore) {}
    
    async sync(options: SlackSyncOptions = {}): Promise<{
      synced: number;
      channels: number;
      workspaceId: string;
    }> {
      const status = await this.slackService.getConnectionStatus();
      if (!status.connected || !status.workspace?.id) {
        console.log('[SlackSync] Not connected');
        return { synced: 0, channels: 0, workspaceId: '' };
      }
      
      const workspaceId = status.workspace.id;
      const { maxChannels = 50, maxMessagesPerChannel = 100 } = options;
      
      // 1. 채널 목록 조회
      const channelsResult = await this.slackService.getChannels();
      if (!channelsResult.success || !channelsResult.channels) {
        console.error('[SlackSync] Failed to get channels');
        return { synced: 0, channels: 0, workspaceId };
      }
      
      const channels = channelsResult.channels.slice(0, maxChannels);
      let totalSynced = 0;
      
      // 2. 채널별 메시지 동기화
      for (const channel of channels) {
        const cursor = await this.vectorStore.getSyncCursor('slack', workspaceId, channel.id);
        
        try {
          const messages = await this.fetchChannelHistory(
            channel.id, 
            cursor,
            maxMessagesPerChannel
          );
          
          if (messages.length === 0) continue;
          
          // 3. 임베딩 생성
          const texts = messages.map(m => m.text);
          const embeddings = await this.embeddingClient.embed(texts);
          
          // 4. 저장
          const items = messages.map((msg, i) => ({
            id: `slack:${workspaceId}:${channel.id}:${msg.ts}`,
            source: 'slack' as const,
            workspaceId,
            content: msg.text,
            title: `#${channel.name} - ${msg.username || msg.user}`,
            url: msg.permalink,
            timestamp: parseFloat(msg.ts) * 1000,
            embedding: embeddings[i]
          }));
          
          const count = await this.vectorStore.upsert(items);
          totalSynced += count;
          
          // 5. 커서 업데이트
          const latestTs = messages[0]?.ts;
          if (latestTs) {
            await this.vectorStore.setSyncCursor('slack', workspaceId, channel.id, latestTs);
          }
          
          console.log(`[SlackSync] Channel #${channel.name}: ${count} messages`);
          
        } catch (error) {
          console.error(`[SlackSync] Channel #${channel.name} failed:`, error);
        }
      }
      
      return { synced: totalSynced, channels: channels.length, workspaceId };
    }
    
    private async fetchChannelHistory(
      channelId: string, 
      oldestTs: string | null,
      limit: number
    ): Promise<SlackMessage[]> {
      // Worker 경유 또는 직접 API 호출
      // conversations.history 사용
      // oldest 파라미터로 증분 동기화
    }
  }
  ```

  **Acceptance Criteria**:
  ```typescript
  // 테스트: src/services/__tests__/slack-sync.test.ts
  
  describe('SlackSync', () => {
    it('should sync messages from connected workspace', async () => {
      const store = new LocalVectorStore();
      await store.initialize();
      
      const sync = new SlackSync(store);
      const result = await sync.sync({ maxChannels: 2, maxMessagesPerChannel: 10 });
      
      expect(result.synced).toBeGreaterThan(0);
      expect(result.workspaceId).toBeTruthy();
    });
    
    it('should use cursor for incremental sync', async () => {
      // 첫 동기화 후 커서 저장
      // 두 번째 동기화는 새 메시지만
    });
    
    it('should handle rate limits gracefully', async () => {
      // 429 응답 시 백오프 후 재시도
    });
  });
  ```

  **Commit**: YES
  - Message: `feat: implement SlackSync for incremental message synchronization`
  - Files: `src/services/slack-sync.ts`, `src/services/__tests__/slack-sync.test.ts`

---

### Task 4: HybridSearch 구현 ✅ COMPLETED

- [x] 4. HybridSearch 구현 (FTS4 + 벡터 RRF 결합)

  **완료 결과**:
  - `src/services/hybrid-search.ts` 생성 (165 lines)
  - `src/services/__tests__/hybrid-search.test.ts` 생성
  - 8/8 테스트 통과 ✅
  - RRF (Reciprocal Rank Fusion) 알고리즘 구현
  - FTS4 fallback (임베딩 실패 시) 구현
  - FTS 쿼리 escape 처리 (malformed query 방지)

---

### [LEGACY] Task 4: HybridSearch 구현

- [x] 4. HybridSearch 구현 (FTS4 + 벡터 RRF 결합)

  **What to do**:
  - `src/services/hybrid-search.ts` 생성
  - FTS4 키워드 검색 + 벡터 코사인 유사도 검색
  - RRF (Reciprocal Rank Fusion)로 결과 결합
  - 임베딩 없으면 FTS4 fallback

  **Must NOT do**:
  - 복잡한 가중치 튜닝 (기본 RRF k=60)
  - 검색 결과 캐싱

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
    - 검색 알고리즘 구현

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 2, 3

  **References**:
  - `src/services/local-vector-store.ts` - vectorSearch, ftsSearch 메서드
  - RRF 논문: Cormack et al., "Reciprocal Rank Fusion"
  - RRF 공식: `score(d) = Σ 1/(k + rank(d))` where k=60

  **구현**:
  ```typescript
  import type { ContextSource } from '../types/context-search';
  import { LocalVectorStore, SearchResult } from './local-vector-store';
  import { EmbeddingClient } from './embedding-client';
  
  interface HybridSearchOptions {
    source?: ContextSource;
    workspaceId?: string;
    limit?: number;
  }
  
  export class HybridSearch {
    constructor(
      private vectorStore: LocalVectorStore,
      private embeddingClient: EmbeddingClient
    ) {}
    
    async search(query: string, options: HybridSearchOptions = {}): Promise<SearchResult[]> {
      const { limit = 10 } = options;
      const startTime = Date.now();
      
      // 1. 쿼리 임베딩 생성
      let queryEmbedding: Float32Array;
      try {
        queryEmbedding = await this.embeddingClient.embedSingle(query);
      } catch (error) {
        console.warn('[HybridSearch] Embedding failed, falling back to FTS only');
        return this.ftsOnlySearch(query, options);
      }
      
      // 임베딩 생성 실패 시 FTS만
      if (queryEmbedding.length === 0) {
        return this.ftsOnlySearch(query, options);
      }
      
      // 2. 병렬로 두 검색 수행
      const [vectorResults, ftsResults] = await Promise.all([
        this.vectorStore.vectorSearch(queryEmbedding, { ...options, limit: limit * 2 }),
        this.vectorStore.ftsSearch(query, { ...options, limit: limit * 2 })
      ]);
      
      // 3. RRF로 결합
      const combined = this.reciprocalRankFusion(vectorResults, ftsResults, limit);
      
      const duration = Date.now() - startTime;
      console.log(`[HybridSearch] Query: "${query}", Results: ${combined.length}, Duration: ${duration}ms`);
      
      return combined;
    }
    
    private async ftsOnlySearch(query: string, options: HybridSearchOptions): Promise<SearchResult[]> {
      const { limit = 10 } = options;
      return this.vectorStore.ftsSearch(query, { ...options, limit });
    }
    
    private reciprocalRankFusion(
      vectorResults: SearchResult[],
      ftsResults: SearchResult[],
      limit: number,
      k = 60
    ): SearchResult[] {
      const scores = new Map<string, { score: number; item: SearchResult }>();
      
      // 벡터 검색 결과 점수
      vectorResults.forEach((item, rank) => {
        const existing = scores.get(item.id);
        const rrfScore = 1 / (k + rank + 1);
        scores.set(item.id, {
          score: (existing?.score || 0) + rrfScore,
          item
        });
      });
      
      // FTS 결과 점수
      ftsResults.forEach((item, rank) => {
        const existing = scores.get(item.id);
        const rrfScore = 1 / (k + rank + 1);
        scores.set(item.id, {
          score: (existing?.score || 0) + rrfScore,
          item: existing?.item || item  // 벡터 결과 우선
        });
      });
      
      // 점수순 정렬 후 limit 적용
      return [...scores.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ item, score }) => ({ ...item, score }));
    }
  }
  ```

  **Acceptance Criteria**:
  ```typescript
  // 테스트: src/services/__tests__/hybrid-search.test.ts
  
  describe('HybridSearch', () => {
    it('should combine vector and FTS results with RRF', async () => {
      // 준비: 몇 개 항목 저장
      // 검색: "authentication error"
      // 검증: 벡터 매치 + 키워드 매치 모두 포함
    });
    
    it('should fallback to FTS when embedding fails', async () => {
      // Mock 임베딩 실패
      // 검색 여전히 동작 (FTS만)
    });
    
    it('should return results under 200ms for 5K vectors', async () => {
      // 5K 항목 저장 후 검색 시간 측정
      expect(duration).toBeLessThan(200);
    });
    
    it('should filter by source', async () => {
      // source: 'slack' 옵션으로 Slack만 검색
    });
  });
  ```

  **Commit**: YES
  - Message: `feat: implement HybridSearch with RRF fusion and FTS fallback`
  - Files: `src/services/hybrid-search.ts`, `src/services/__tests__/hybrid-search.test.ts`

---

### Task 5: SemanticSearchService 통합

- [ ] 5. SemanticSearchService 통합 및 동기화 트리거

  **What to do**:
  - SemanticSearchService 인터페이스 유지하며 로컬 검색으로 교체
  - **앱 시작 시** Slack 동기화
  - **OAuth 완료 시** 해당 소스 동기화 트리거
  - 기존 Worker 검색을 fallback으로 유지

  **Must NOT do**:
  - 기존 SemanticSearchService 인터페이스 변경
  - UI 코드 수정
  - 다른 소스 동기화 (Slack만, Phase 1)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
    - 통합 작업

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final)
  - **Blocks**: None
  - **Blocked By**: Task 3.5, 4

  **References**:
  - `src/services/semantic-search.ts` - 기존 인터페이스 (전체 파일, 70줄)
  - `src/main/index.ts:567-610` - app.whenReady() 앱 시작 로직
  - `src/main/index.ts:91-102` - Slack OAuth 콜백 처리 (동기화 트리거 위치)

  **구현 - SemanticSearchService 수정**:
  ```typescript
  // src/services/semantic-search.ts
  
  import type { ContextItem, SearchResult } from '../types/context-search';
  import { LocalVectorStore } from './local-vector-store';
  import { EmbeddingClient } from './embedding-client';
  import { HybridSearch } from './hybrid-search';
  import { SlackSync } from './slack-sync';
  
  const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';
  
  export class SemanticSearchService {
    private maxRetries = 2;
    private baseDelay = 1000;
    
    // 로컬 검색 컴포넌트
    private localVectorStore?: LocalVectorStore;
    private hybridSearch?: HybridSearch;
    private slackSync?: SlackSync;
    private initialized = false;
    
    private async sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 로컬 검색 인프라 초기화
     */
    async initialize(): Promise<boolean> {
      if (this.initialized) return true;
      
      try {
        console.log('[SemanticSearch] Initializing local vector store...');
        
        this.localVectorStore = new LocalVectorStore();
        const success = await this.localVectorStore.initialize();
        
        if (!success) {
          console.error('[SemanticSearch] Failed to initialize vector store');
          return false;
        }
        
        const embeddingClient = new EmbeddingClient();
        this.hybridSearch = new HybridSearch(this.localVectorStore, embeddingClient);
        this.slackSync = new SlackSync(this.localVectorStore);
        
        this.initialized = true;
        console.log('[SemanticSearch] Local search initialized');
        return true;
        
      } catch (error) {
        console.error('[SemanticSearch] Initialization failed:', error);
        return false;
      }
    }
    
    /**
     * Slack 동기화 실행
     */
    async syncSlack(): Promise<number> {
      if (!this.slackSync) {
        console.warn('[SemanticSearch] Not initialized, skipping sync');
        return 0;
      }
      
      console.log('[SemanticSearch] Starting Slack sync...');
      const result = await this.slackSync.sync();
      console.log(`[SemanticSearch] Slack sync complete: ${result.synced} messages from ${result.channels} channels`);
      
      return result.synced;
    }
    
    /**
     * 검색 (기존 인터페이스 유지)
     * @param items - 하위 호환성을 위해 유지, 로컬 검색에서는 무시됨
     */
    async search(query: string, items: ContextItem[], limit = 5): Promise<SearchResult[]> {
      if (!query) return [];
      
      // 로컬 검색 시도
      if (this.hybridSearch) {
        try {
          const results = await this.hybridSearch.search(query, { limit });
          if (results.length > 0) {
            return results;
          }
        } catch (error) {
          console.error('[SemanticSearch] Local search failed:', error);
        }
      }
      
      // 로컬 결과 없거나 실패 시 Worker fallback
      if (items.length > 0) {
        return this.callWorker(query, items, limit);
      }
      
      return [];
    }
    
    private async callWorker(query: string, items: ContextItem[], limit: number): Promise<SearchResult[]> {
      // 기존 Worker 호출 로직 유지
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            await this.sleep(this.baseDelay * Math.pow(2, attempt - 1));
          }
          
          const response = await fetch(`${WORKER_URL}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, items, limit }),
          });
          
          if (!response.ok) {
            throw new Error(`Worker error: ${response.status}`);
          }
          
          const result = await response.json() as { success: boolean; results?: SearchResult[] };
          return result.results || [];
          
        } catch (error) {
          console.error(`[SemanticSearch] Worker attempt ${attempt + 1} failed:`, error);
        }
      }
      
      return [];
    }
  }
  
  // Singleton
  let searchService: SemanticSearchService | null = null;
  
  export function getSemanticSearchService(): SemanticSearchService {
    if (!searchService) {
      searchService = new SemanticSearchService();
    }
    return searchService;
  }
  ```

  **구현 - 앱 시작 시 동기화**:
  ```typescript
  // src/main/index.ts 수정
  
  import { getSemanticSearchService } from '../services/semantic-search';
  
  app.whenReady().then(async () => {
    // ... 기존 초기화 ...
    
    // 로컬 검색 초기화 및 Slack 동기화 (백그라운드)
    const searchService = getSemanticSearchService();
    
    searchService.initialize().then(async (success) => {
      if (!success) {
        console.error('[Main] Failed to initialize local search');
        return;
      }
      
      // 앱 시작 시 동기화
      searchService.syncSlack().catch(error => {
        console.error('[Main] Slack sync failed:', error);
      });
    });
  });
  ```

  **구현 - OAuth 완료 시 동기화**:
  ```typescript
  // src/services/slack-client.ts 수정 (또는 IPC 핸들러)
  
  // OAuth 콜백 성공 후 동기화 트리거
  async function onSlackOAuthComplete(): Promise<void> {
    const searchService = getSemanticSearchService();
    
    // 초기화 확인 (이미 되어있으면 바로 반환)
    await searchService.initialize();
    
    // 동기화 실행
    console.log('[SlackClient] OAuth complete, triggering sync...');
    searchService.syncSlack().catch(error => {
      console.error('[SlackClient] Post-OAuth sync failed:', error);
    });
  }
  ```

  **Acceptance Criteria**:
  ```bash
  # 앱 빌드 및 실행
  npm run pack:clean
  
  # 앱 시작 후 로그 확인 (터미널에서 실행)
  ./release/mac-arm64/Linear\ Capture.app/Contents/MacOS/Linear\ Capture
  
  # Expected logs (순서대로):
  # [SemanticSearch] Initializing local vector store...
  # [SemanticSearch] Local search initialized
  # [SemanticSearch] Starting Slack sync...
  # [SlackSync] Channel #general: 45 messages
  # [SlackSync] Channel #random: 23 messages
  # [SemanticSearch] Slack sync complete: 68 messages from 2 channels
  
  # DevTools Console에서 검색 테스트:
  # 1. 캡처 실행
  # 2. AI 분석 시 Related Context 표시 확인
  # 3. 로그: "[HybridSearch] Query: X, Results: Y, Duration: Zms"
  
  # Network 탭에서 /search 요청 없음 확인 (로컬 처리)
  ```

  **OAuth 후 동기화 테스트**:
  ```bash
  # 1. 앱 시작 (Slack 미연결 상태)
  # 2. Settings에서 Slack 연결
  # 3. OAuth 완료 후 로그 확인:
  # [SlackClient] OAuth complete, triggering sync...
  # [SemanticSearch] Starting Slack sync...
  ```

  **Commit**: YES
  - Message: `feat: integrate local vector search with sync triggers on app start and OAuth complete`
  - Files: `src/services/semantic-search.ts`, `src/main/index.ts`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 0 | `test: verify FTS4 availability, add 'linear' to ContextSource` | fts4.test.ts, context-search.ts, context-adapters/index.ts | npm test ✅ |
| 1 | `feat(worker): add /embeddings endpoint` | worker/* | curl test |
| 2 | `feat: implement LocalVectorStore` | local-vector-store.ts | npm test |
| 3 | `feat: implement EmbeddingClient` | embedding-client.ts | npm test |
| 3.5 | `feat: implement SlackSync` | slack-sync.ts | npm test |
| 4 | `feat: implement HybridSearch with RRF` | hybrid-search.ts | npm test |
| 5 | `feat: integrate local vector search` | semantic-search.ts, index.ts | npm run pack:clean |

---

## Success Criteria

### Verification Commands
```bash
# 1. 모든 테스트 통과
npm test
# Expected: All tests pass

# 2. 앱 빌드 성공
npm run pack:clean
# Expected: 앱 정상 실행

# 3. 동기화 로그 확인
# [SemanticSearch] Slack sync complete: N messages (N > 0)

# 4. 검색 동작 확인
# DevTools → Network → /search 요청 없음 (로컬 처리)

# 5. 검색 성능 확인
# [HybridSearch] Duration: Xms (X < 200)
```

### Final Checklist
- [ ] ContextSource 타입에 'linear' 추가됨
- [x] FTS4 가용성 확인됨 (FTS5 미지원, FTS4 사용)
- [ ] 테스트 커버리지: LocalVectorStore, EmbeddingClient, SlackSync, HybridSearch
- [ ] 앱 시작 시 Slack 동기화 동작
- [ ] OAuth 완료 시 동기화 트리거 동작
- [ ] 다중 워크스페이스 분리 동작 (workspace_id)
- [ ] 검색 응답 < 200ms (5K 벡터)
- [ ] FTS fallback 동작 (임베딩 실패 시)
- [ ] 기존 SemanticSearchService 인터페이스 유지
- [ ] Worker fallback 동작 (로컬 결과 없을 시)

---

## Risk Mitigation

| 리스크 | 영향도 | 완화 방안 | 담당 Task |
|--------|--------|-----------|-----------|
| FTS5 미지원 | HIGH | **완화됨**: FTS4 사용으로 대체. sql.js 기본 빌드에 FTS4 포함 확인 | Task 0 ✅ |
| Slack API 레이트 리밋 | MEDIUM | exponential backoff + 채널별 쿼터 | Task 3.5 |
| 임베딩 API 장애 | MEDIUM | FTS fallback + Worker fallback | Task 4, 5 |
| 다중 워크스페이스 충돌 | MEDIUM | workspace_id 컬럼 추가 | Task 2 |
| 메모리 사용량 증가 | LOW | 90일 보존 정책 (Phase 1.5에서) | - |

---

## Notes

### Phase 1.5 (다음 단계)
- Notion 동기화 추가 (NotionLocalReader 패턴 활용)
- Linear 이슈 동기화 추가 (LinearService.searchIssues 활용)
- 보존 정책 UI (90일 기본, 사용자 설정 가능)
- 주기적 동기화 (10-30분마다, 유휴 시)

### Phase 2 (필요시)
- 50K+ 도달 시 LanceDB 마이그레이션 검토
- 동일 임베딩 데이터 재사용 가능
- 완전 로컬 임베딩 (transformers.js) 검토

### 완전 로컬로 전환 시 (Future)
- transformers.js + MiniLM 모델 번들
- Worker /embeddings 호출 제거
- 오프라인 인덱싱 가능
