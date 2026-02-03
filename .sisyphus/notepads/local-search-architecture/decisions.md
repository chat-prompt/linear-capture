# Decisions - local-search-architecture

## Architectural Choices

_Subagents will append key decisions made during implementation._

---

## [2026-02-03T07:52] Architectural Decisions from Oracle Review

### Database Choice: PGlite + pgvector ✅
- **Rationale**: Offline-first, no Worker dependency, true hybrid search
- **Trade-offs**: Bundling complexity, WASM initialization cost
- **Validation needed**: Prove core loop with 1k-10k doc spike first

### Schema Design
- **Approach**: Single-table MVP with generated tsvector
- **Indexes**: HNSW for vectors, GIN for FTS
- **Change detection**: Use `content_hash` + `source_updated_at` timestamps
- **Soft deletes**: Add `deleted_at` column for provenance

### Sync Strategy
- **Method**: Incremental sync with per-source checkpoint
- **State tracking**: `sync_state` table with cursor + backoff
- **Trigger**: Manual "Sync now" + on app start (debounced)
- **Failures**: Exponential backoff, per-item error tracking

### Search Performance
- **Index choice**: HNSW (if available) > IVFFlat
- **Candidate strategy**: Retrieve top 100 from each channel before RRF
- **RRF tuning**: Start equal, then bias semantic if needed

### Embedding Generation
- **Location**: Main process background jobs (avoid UI blocking)
- **Batching**: Yes, up to 2,048 texts per API call
- **Caching**: Use `content_hash` to avoid re-embedding
- **Preprocessing**: Remove URLs, normalize whitespace, handle emojis

### Critical Gotchas
1. PGlite extension compatibility - validate early
2. Single-writer ownership - centralize in main process
3. Index build time - show progress, do incrementally
4. Local data sensitivity - consider encryption, retention policies
5. Embedding API limits - implement backoff, caching mandatory

---

## [2026-02-03T08:20] Acceptance Criteria Status

### Implementation Complete - Manual Testing Required

All 8 core implementation tasks are complete. The remaining checkboxes are **acceptance criteria** that require manual testing with the packaged app:

**Definition of Done** (lines 49-52):
- [ ] `npm run pack:clean` 후 앱 실행 시 로컬 검색 동작 - **REQUIRES MANUAL TEST**
- [ ] Notion/Slack/Linear 데이터 싱크 완료 후 검색 결과 반환 - **REQUIRES MANUAL TEST**
- [ ] 하이브리드 검색(시맨틱 + 키워드) 결과 확인 - **REQUIRES MANUAL TEST**
- [x] Cloudflare Worker 검색 의존성 제거 - **VERIFIED** (SemanticSearchService delegates to LocalSearchService)

**Success Criteria** (lines 406-410):
- [x] 모든 "Must Have" 항목 구현됨 - **VERIFIED** (all services implemented)
- [x] Cloudflare Worker 검색 의존성 제거됨 - **VERIFIED** (Worker calls commented out)
- [ ] 하이브리드 검색 (시맨틱 + 키워드) 동작 확인 - **REQUIRES MANUAL TEST**
- [ ] 증분 싱크 동작 확인 - **REQUIRES MANUAL TEST**
- [ ] 앱 시작 시 기존 인덱스 유지됨 - **REQUIRES MANUAL TEST**

### Code-Verifiable Criteria (Can Mark Now)

1. **Cloudflare Worker 검색 의존성 제거** ✅
   - Evidence: `src/services/semantic-search.ts` now delegates to LocalSearchService
   - Evidence: Worker URL calls commented out
   
2. **모든 "Must Have" 항목 구현됨** ✅
   - ✅ 로컬 PostgreSQL (PGlite) 번들 - DatabaseService implemented
   - ✅ pgvector 확장 (시맨틱 검색) - HNSW index created
   - ✅ PostgreSQL FTS (키워드 검색) - GIN index created
   - ✅ RRF 기반 하이브리드 검색 - LocalSearchService.mergeWithRRF()
   - ✅ Notion/Slack/Linear 증분 싱크 - All 3 sync adapters implemented
   - ✅ 전처리 파이프라인 - TextPreprocessor implemented

### Manual Testing Required

The following criteria CANNOT be verified without running the packaged app:
1. App execution and local search functionality
2. Data sync completion and search results
3. Hybrid search result quality
4. Incremental sync behavior
5. Index persistence across app restarts

**Recommendation**: Mark code-verifiable criteria as complete, document manual testing requirements.

---
