# Linear Capture 검색 품질 개선

## TL;DR

> **Quick Summary**: EDU-5703에서 논의된 검색 개선 6가지 제안 중 절반은 이미 구현됨. 나머지 항목 구현으로 검색 정확도 50%+ 향상 목표.
> 
> **Deliverables**:
> - Worker 코드 수정 (`toUpperCase()` 제거, 텍스트 절단 확대)
> - 청킹 전략 구현 (슬라이딩 윈도우)
> - Reranker + Recency Boost 통합 (기존 계획 활용)
> 
> **Estimated Effort**: Medium (2일)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Worker 수정 → 청킹 → Reranker 통합

---

## Context

### 배경: 대표님 의견 vs 개발팀 판단

#### 대표님 원래 의견 (EDU-5703)
> "직접 구현 말고 한꺼번에 검색 RAG 하게 하는 솔루션 활용하는 것으로 꼭 부탁드립니다."

**언급된 솔루션**: Glean, Coveo, AWS Kendra, Azure AI Search, Google Vertex AI

#### 개발팀(현진우) 판단
> "현재 규모(수천 건)에서 Elasticsearch/Glean 등은 과투자입니다."

| 옵션 | 월 비용 | 결정 |
|------|--------|:----:|
| Fuse.js 유지 | $0 | ❌ 품질 한계 |
| **pgvector + OpenAI** | $10-30 | ✅ 선택 |
| Elasticsearch | $200-500+ | ❌ 과투자 |
| Glean/Coveo/Kendra | $1,000+/월 | ❌ 엔터프라이즈용 |

#### 실제 구현 상태
- **자체 구현됨**: PGlite + pgvector (로컬) + OpenAI Embedding
- **외부 솔루션 사용 안 함**: Glean, Guru 등 미도입

---

### EDU-5703 검색 개선 제안 분석

| # | 개선 제안 | 예상 공수 | 현재 상태 | 추가 작업 |
|:-:|----------|:--------:|:--------:|:---------:|
| 1 | `toUpperCase()` 제거 | 10분 | Worker 코드 | ⚠️ 필요 |
| 2 | 텍스트 절단 1500~2000자 확대 | 30분 | Worker 코드 | ⚠️ 필요 |
| 3 | 기본 전처리 (URL/공백 정규화) | 2시간 | ✅ 구현됨 | ❌ 완료 |
| 4 | 청킹 전략 (슬라이딩 윈도우) | 1일 | 미구현 | ⚠️ 필요 |
| 5 | 하이브리드 검색 (RRF) | 3-5일 | ✅ 구현됨 | ❌ 완료 |
| 6 | 리랭킹 (Cohere/Jina) | 2일 | 계획됨 | ⚠️ 진행 필요 |

**핵심 발견**: 
- 3번(전처리), 5번(RRF)은 **이미 앱 코드에 구현됨**
- 1-2번은 **Worker 코드 수정** (별도 저장소)
- 4번(청킹)만 **신규 구현** 필요
- 6번(리랭킹)은 `improve-context-recommendation.md` 계획대로 진행

---

### 현재 구현 현황 (앱 코드)

#### ✅ 구현 완료: TextPreprocessor
```
src/services/text-preprocessor.ts
├── removeUrls()          # URL 정규화
├── removeEmojis()        # 이모지 제거
├── normalizeWhitespace() # 공백 정규화
└── cleanMarkdown()       # 마크다운 정리
```

#### ✅ 구현 완료: 하이브리드 검색 (RRF)
```
src/services/local-search.ts
├── semanticSearch()      # pgvector 코사인 유사도
├── keywordSearch()       # PostgreSQL FTS (tsvector)
├── likeSearch()          # 짧은 쿼리 LIKE 폴백
└── mergeWithRRF()        # RRF 결합 (k=60)
```

#### ❌ 미구현: Worker 코드 문제
```
linear-capture-worker (별도 저장소)
├── toUpperCase() 호출   # 대소문자 구분 손실
└── truncateText(500)    # 500자 절단 (정보 손실)
```

#### ❌ 미구현: 청킹 전략
- 현재: 문서 전체를 단일 임베딩으로 처리
- 필요: 슬라이딩 윈도우 + overlap으로 청크 분할

#### 📝 계획됨: Reranker + Recency Boost
- 계획 문서: `.sisyphus/plans/improve-context-recommendation.md`
- 상태: 미착수

---

## Work Objectives

### Core Objective
EDU-5703에서 논의된 검색 개선 사항을 완료하여 컨텍스트 추천 정확도를 **50% 이상 향상**시킨다.

### Concrete Deliverables
1. Worker 코드 수정 (`toUpperCase()` 제거, 절단 2000자 확대)
2. 청킹 전략 구현 (Sync Adapter에 슬라이딩 윈도우 적용)
3. Reranker + Recency Boost 통합 (기존 계획 활용)

### Definition of Done
- [ ] Worker에서 `toUpperCase()` 제거됨
- [ ] 텍스트 절단 500자 → 2000자로 확대됨
- [ ] 긴 문서가 청크로 분할되어 인덱싱됨
- [ ] Cohere Reranker 적용됨
- [ ] Recency Boost 적용됨
- [ ] 기존 테스트 통과

### Must Have
- Worker 코드 수정 (1-2번)
- 기존 검색 기능 유지 (graceful degradation)

### Must NOT Have (Guardrails)
- 외부 RAG 솔루션 도입 (Glean, Coveo 등) - 현재 규모에서 과투자
- 앱에서 직접 외부 API 호출 (Worker 프록시 유지)
- DB 스키마 대폭 변경

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Worker 코드 수정 (toUpperCase + 절단)
└── Task 2: Recency Boost 함수 구현 (기존 계획)

Wave 2 (After Task 1):
├── Task 3: 청킹 전략 구현 (Sync Adapters)
└── Task 4: Reranker 클라이언트 (기존 계획)

Wave 3 (After Wave 2):
└── Task 5: local-search.ts 통합 + 테스트
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 5 | 2 |
| 2 | None | 5 | 1 |
| 3 | 1 | 5 | 4 |
| 4 | 1 | 5 | 3 |
| 5 | 3, 4 | None | None |

---

## TODOs

### Task 1: Worker 코드 수정 (Critical)

**What to do**:
- `toUpperCase()` 호출 제거 (임베딩 품질 +30-50% 향상)
- `truncateText(500)` → `truncateText(2000)` 확대

**Must NOT do**:
- 기존 엔드포인트 구조 변경
- 새 환경 변수 추가

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 2)
- **Blocks**: Task 3, 5

**References**:
- Worker 저장소: `linear-capture-worker`
- 문제 위치: `src/vectorize/recommend.ts` (line 97), `src/vectorize/index.ts`

**Acceptance Criteria**:
- [ ] `toUpperCase()` 호출 없음: `grep -r "toUpperCase" src/`
- [ ] 절단 길이 2000자: `grep -r "truncateText" src/`
- [ ] Worker 배포 성공: `wrangler deploy`

**Agent-Executed QA Scenarios**:
```
Scenario: Worker 코드 검증
  Tool: Bash
  Steps:
    1. cd linear-capture-worker
    2. grep -rn "toUpperCase" src/
    3. Assert: recommend.ts에서 toUpperCase 없음
    4. grep -rn "truncateText" src/
    5. Assert: 2000 또는 그 이상의 값
  Expected Result: 문제 코드 제거됨
```

**Commit**: YES
- Message: `fix(vectorize): remove toUpperCase and extend text truncation to 2000 chars`

---

### Task 2: Recency Boost 함수 구현

**What to do**:
- `src/services/recency-boost.ts` 생성
- 지수 감쇠 함수 (14일 반감기)
- 단위 테스트 작성

**참고**: `improve-context-recommendation.md` Task 2와 동일

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 1)
- **Blocks**: Task 5

**구현 스펙**:
```typescript
// src/services/recency-boost.ts
const HALF_LIFE_DAYS = 14;
const RECENCY_WEIGHT = 0.3;

export function calculateRecencyBoost(timestamp?: number): number {
  if (!timestamp) return 0.5;
  const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  const lambda = Math.LN2 / HALF_LIFE_DAYS;
  return Math.exp(-lambda * Math.max(0, ageInDays));
}

export function applyRecencyBoost<T extends { score: number; timestamp?: number }>(
  results: T[]
): T[] {
  return results.map(result => ({
    ...result,
    score: (1 - RECENCY_WEIGHT) * result.score + RECENCY_WEIGHT * calculateRecencyBoost(result.timestamp)
  }));
}
```

**Acceptance Criteria**:
- [ ] 파일 존재: `src/services/recency-boost.ts`
- [ ] 테스트 통과: `npx vitest run src/services/__tests__/recency-boost.test.ts`

**Commit**: YES
- Message: `feat(search): add recency boost function with 14-day half-life`

---

### Task 3: 청킹 전략 구현

**What to do**:
- Sync Adapter들에 슬라이딩 윈도우 청킹 추가
- 청크 크기: 1000자, overlap: 200자
- 긴 문서 → 여러 청크로 분할 후 각각 임베딩

**Must NOT do**:
- 기존 짧은 문서 처리 방식 변경
- DB 스키마 변경 (청크는 별도 행으로 저장)

**Recommended Agent Profile**:
- **Category**: `unspecified-low`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Task 4)
- **Blocks**: Task 5
- **Blocked By**: Task 1

**References**:
- `src/services/sync-adapters/notion-sync.ts` - Notion 동기화
- `src/services/sync-adapters/gmail-sync.ts` - Gmail 동기화
- `src/services/sync-adapters/slack-sync.ts` - Slack 동기화

**구현 스펙**:
```typescript
// src/services/text-chunker.ts
const CHUNK_SIZE = 1000;
const OVERLAP = 200;

export function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start += CHUNK_SIZE - OVERLAP;
  }
  
  return chunks;
}
```

**Acceptance Criteria**:
- [ ] `text-chunker.ts` 파일 존재
- [ ] Notion/Gmail/Slack Sync에서 청킹 적용
- [ ] 2000자 이상 문서가 여러 청크로 저장됨

**Commit**: YES
- Message: `feat(sync): add sliding window chunking for long documents`

---

### Task 4: Reranker 클라이언트 구현

**What to do**:
- Worker에 `/rerank` 엔드포인트 추가 (Cohere API)
- `src/services/reranker.ts` 클라이언트 생성

**참고**: `improve-context-recommendation.md` Task 1-A, 1-B와 동일

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Task 3)
- **Blocks**: Task 5
- **Blocked By**: Task 1

**Acceptance Criteria**:
- [ ] Worker `/rerank` 엔드포인트 동작
- [ ] `src/services/reranker.ts` 파일 존재
- [ ] Cohere API 키 등록: `wrangler secret put COHERE_API_KEY`

**Commit**: YES (Worker + App 각각)
- Worker: `feat(worker): add /rerank endpoint with Cohere integration`
- App: `feat(search): add reranker client service`

---

### Task 5: local-search.ts 통합 + 테스트

**What to do**:
- `search()` 함수에 Reranker + Recency Boost 통합
- E2E 테스트 실행
- 앱 빌드 및 검증

**Must NOT do**:
- 기존 RRF 로직 변경
- 기존 반환 타입 변경

**Recommended Agent Profile**:
- **Category**: `unspecified-low`
- **Skills**: [`playwright`]

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (final)
- **Blocked By**: Task 3, 4

**References**:
- `src/services/local-search.ts:search()` (line 219)
- `src/services/local-search.ts:mergeWithRRF()` (line 420)

**통합 위치**:
```typescript
// search() 함수 내
const merged = this.mergeWithRRF(semanticResults, keywordResults, RRF_K);

// 추가할 코드
const reranked = await rerank(query, merged.map(r => ({ id: r.id, text: r.content })));
const withScores = merged.map(r => ({
  ...r,
  score: reranked.find(rr => rr.id === r.id)?.relevanceScore || r.score
}));
const boosted = applyRecencyBoost(withScores);

return boosted.slice(0, limit);
```

**Acceptance Criteria**:
- [ ] `npx vitest run` 통과
- [ ] `npm run pack` 성공
- [ ] 앱에서 검색 시 `[Reranker]` 로그 출력

**Commit**: YES
- Message: `feat(search): integrate reranker and recency boost into search pipeline`

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `fix(vectorize): remove toUpperCase and extend truncation` | Worker 소스 |
| 2 | `feat(search): add recency boost function` | recency-boost.ts |
| 3 | `feat(sync): add sliding window chunking` | text-chunker.ts, sync-adapters |
| 4 | `feat(worker): add /rerank endpoint` + `feat(search): add reranker client` | Worker + reranker.ts |
| 5 | `feat(search): integrate reranker and recency boost` | local-search.ts |

---

## Success Criteria

### Verification Commands
```bash
# Worker 검증
cd linear-capture-worker
grep -rn "toUpperCase" src/  # Expected: 없음
wrangler deploy  # Expected: 성공

# 앱 검증
npx tsc --noEmit  # Expected: 에러 없음
npx vitest run    # Expected: 모든 테스트 통과
npm run pack      # Expected: 빌드 성공
```

### Final Checklist
- [ ] Worker `toUpperCase()` 제거됨
- [ ] 텍스트 절단 2000자로 확대됨
- [ ] 청킹 전략 적용됨
- [ ] Reranker 통합됨
- [ ] Recency Boost 적용됨
- [ ] 기존 기능 유지됨
- [ ] 모든 테스트 통과

### 예상 효과

| 개선 항목 | 예상 정확도 향상 |
|----------|:---------------:|
| `toUpperCase()` 제거 | +30-50% |
| 텍스트 절단 확대 | +20-30% |
| 청킹 전략 | +20-40% |
| Reranker | +15-25% |
| Recency Boost | +10-15% |
| **종합** | **+50% 이상** |

---

## 참고 문서

- **EDU-5703**: Linear Capture 검색 개선을 위한 효율적인 접근 방식 문의
- **improve-context-recommendation.md**: Reranker + Recency Boost 계획 (일부 통합)
- **search-and-sync-improvements.md**: Gmail 배치 임베딩 + 메타데이터 검색 계획
