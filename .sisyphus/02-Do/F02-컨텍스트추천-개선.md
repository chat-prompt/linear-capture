# 컨텍스트 추천 정확도 개선

## TL;DR

> **Quick Summary**: 컨텍스트 추천 검색 결과의 정확도와 관련성을 개선하기 위해 Cohere Rerank와 Recency Boost를 추가합니다.
> 
> **Deliverables**:
> - Worker `/rerank` 엔드포인트 추가
> - Cohere Reranker 클라이언트 (Worker 호출)
> - Recency Boost 로직 추가
> - local-search.ts 파이프라인 개선
> 
> **Estimated Effort**: Medium (4-6시간)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1-A → Task 1-B → Task 3 → Task 4

---

## Context

### Original Request
- 컨텍스트 추천 결과의 정확도와 관련성이 너무 떨어짐
- 기존 검색/임베딩 패키지를 활용하여 빠르고 효율적으로 개선하고 싶음

### 현재 시스템 분석
**검색 파이프라인**:
1. Query → TextPreprocessor → Embedding (OpenAI text-embedding-3-small)
2. Hybrid Search = Vector Search (pgvector) + FTS (tsvector)
3. RRF Fusion (k=60)
4. 소스별 5개 quota → UI

**발견된 문제점**:
- Reranker 없음 (Bi-encoder만 사용) → 의미적 정밀도 낮음
- Recency 가중치 없음 → 오래된 문서가 최신 문서와 동등 취급
- RRF k값 고정 → 데이터셋에 맞는 튜닝 없음

### Research Findings
- **Cohere Rerank**: Cross-encoder 기반, +20~33% 정확도 향상
- **Jina Reranker**: 대안, 다국어 지원 우수
- **Recency Boost**: 지수 감쇠 함수로 최신성 반영

### 설계 결정 사항
- **API 키 관리**: Worker 프록시 방식 (기존 Anthropic/Gemini 패턴과 일관)
- **Reranker 시점**: RRF 후 Top N에 대해 Rerank
- **hybrid-search.ts**: 현재 사용되지 않음 - 테스트 후 정리 (별도 이슈)

---

## Work Objectives

### Core Objective
검색 파이프라인에 Reranker와 Recency Boost를 추가하여 컨텍스트 추천 정확도를 20% 이상 개선한다.

### Concrete Deliverables
- Worker `/rerank` 엔드포인트 (linear-capture-ai)
- `src/services/reranker.ts` - Worker 호출 클라이언트
- `src/services/recency-boost.ts` - Recency Boost 함수
- `src/services/local-search.ts` - 파이프라인 통합

### Definition of Done
- [ ] Worker `/rerank` 엔드포인트 응답 성공
- [ ] 검색 결과에 Rerank + Recency Boost 적용됨
- [ ] 기존 테스트 통과
- [ ] 앱에서 컨텍스트 추천 동작 확인

### Must Have
- Cohere Rerank 통합 (Worker 프록시)
- Recency Boost (14일 반감기)
- 기존 검색 기능 유지 (graceful degradation)

### Must NOT Have (Guardrails)
- 기존 hybrid-search.ts 구조 대폭 변경
- 새로운 DB 스키마 추가
- 앱에서 직접 Cohere API 호출 (보안 위험)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> 모든 검증은 에이전트가 직접 수행합니다.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: YES (Tests-after)
- **Framework**: vitest

### Agent-Executed QA Scenarios (MANDATORY)

모든 Task에 Bash 또는 curl을 통한 검증 시나리오가 포함됩니다.

---

## Git Worktree Setup

### 브랜치 전략
```
main
  └── feature/improve-context-recommendation (worktree)
```

### Worktree 생성 명령어
```bash
# 메인 저장소에서 실행
cd /Users/wine_ny/side-project/linear_project/linear-capture

# 새 브랜치와 함께 워크트리 생성
git worktree add -b feature/improve-context-recommendation \
  ../linear-capture-worktrees/improve-context-recommendation

# 워크트리로 이동
cd ../linear-capture-worktrees/improve-context-recommendation

# 의존성 설치
npm install
```

### 작업 완료 후 정리
```bash
# 메인으로 이동
cd /Users/wine_ny/side-project/linear_project/linear-capture

# PR 생성 후 머지
git merge feature/improve-context-recommendation

# 워크트리 삭제
git worktree remove ../linear-capture-worktrees/improve-context-recommendation
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1-A: Worker /rerank 엔드포인트 추가
└── Task 2: Recency Boost 함수 구현

Wave 2 (After Task 1-A):
└── Task 1-B: reranker.ts 클라이언트 생성

Wave 3 (After Wave 1, 2):
├── Task 3: local-search.ts에 통합
└── Task 4: 테스트 및 검증
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | All | None |
| 1-A | 0 | 1-B, 3 | 2 |
| 1-B | 1-A | 3 | None |
| 2 | 0 | 3 | 1-A |
| 3 | 1-B, 2 | 4 | None |
| 4 | 3 | 5 | None |
| 5 | 4 | None | None |

---

## TODOs

- [ ] 0. Git Worktree 설정

  **What to do**:
  - 새 브랜치 `feature/improve-context-recommendation` 생성
  - Worktree 생성: `../linear-capture-worktrees/improve-context-recommendation`
  - npm install 실행

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (먼저 실행)
  - **Blocks**: All other tasks

  **Acceptance Criteria**:
  - [ ] `git worktree list`에서 새 워크트리 확인
  - [ ] 워크트리 디렉토리에서 `npm install` 성공

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Worktree 생성 확인
    Tool: Bash
    Steps:
      1. git worktree list
      2. Assert: "improve-context-recommendation" 포함
      3. ls ../linear-capture-worktrees/improve-context-recommendation/package.json
      4. Assert: 파일 존재
    Expected Result: Worktree 정상 생성
    Evidence: 터미널 출력 캡처
  ```

  **Commit**: NO (설정 단계)

---

- [ ] 1-A. Worker `/rerank` 엔드포인트 추가

  **What to do**:
  - Worker (linear-capture-ai)에 `/rerank` POST 엔드포인트 추가
  - Cohere Rerank API 호출 구현
  - Worker Secret에 `COHERE_API_KEY` 추가

  **Must NOT do**:
  - 기존 `/analyze`, `/upload` 엔드포인트 수정
  - 앱에서 직접 Cohere 호출

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 1-B, Task 3
  - **Blocked By**: Task 0

  **References**:
  - Worker URL: `https://linear-capture-ai.ny-4f1.workers.dev`
  - Cohere Rerank API: https://docs.cohere.com/reference/rerank
  - 기존 Worker 패턴: `/analyze` 엔드포인트 참고

  **Worker 엔드포인트 스펙**:
  ```typescript
  // POST /rerank
  interface RerankRequest {
    query: string;
    documents: Array<{ id: string; text: string }>;
    topN?: number; // default: 20
  }

  interface RerankResponse {
    results: Array<{ 
      id: string; 
      relevanceScore: number;
      index: number;
    }>;
  }
  ```

  **Acceptance Criteria**:
  - [ ] Worker에 `/rerank` 엔드포인트 추가됨
  - [ ] `wrangler secret put COHERE_API_KEY` 실행됨
  - [ ] curl 테스트 성공: `curl -X POST https://linear-capture-ai.ny-4f1.workers.dev/rerank`

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Worker /rerank 엔드포인트 테스트
    Tool: Bash (curl)
    Preconditions: Worker 배포 완료
    Steps:
      1. curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/rerank \
           -H "Content-Type: application/json" \
           -d '{"query":"test query","documents":[{"id":"1","text":"test doc"}],"topN":5}'
      2. Assert: HTTP 200 응답
      3. Assert: response.results 배열 존재
    Expected Result: Rerank 결과 반환
    Evidence: curl 응답 캡처
  ```

  **Commit**: YES
  - Message: `feat(worker): add /rerank endpoint with Cohere integration`
  - Files: Worker 소스 파일

---

- [ ] 1-B. Reranker 클라이언트 생성

  **What to do**:
  - `src/services/reranker.ts` 파일 생성
  - Worker `/rerank` 엔드포인트 호출 함수 구현
  - 에러 핸들링 및 fallback 로직 (실패 시 원본 순서 유지)

  **Must NOT do**:
  - Cohere SDK 직접 설치/사용
  - API 키를 앱에 저장

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 1-A)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1-A

  **References**:
  - `src/services/r2-uploader.ts` - Worker 호출 패턴 참고
  - `src/services/anthropic-analyzer.ts` - Worker 호출 패턴 참고

  **구현 스펙**:
  ```typescript
  // src/services/reranker.ts
  const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';

  export interface RerankResult {
    id: string;
    relevanceScore: number;
  }

  export async function rerank(
    query: string, 
    documents: Array<{ id: string; text: string }>,
    topN = 20
  ): Promise<RerankResult[]> {
    try {
      const response = await fetch(`${WORKER_URL}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, documents, topN })
      });

      if (!response.ok) {
        console.warn('[Reranker] Worker returned error, using original order');
        return documents.map((doc, i) => ({ 
          id: doc.id, 
          relevanceScore: 1 - (i / documents.length) 
        }));
      }

      const data = await response.json();
      return data.results;
    } catch (error) {
      console.error('[Reranker] Failed:', error);
      // Graceful degradation: return original order
      return documents.map((doc, i) => ({ 
        id: doc.id, 
        relevanceScore: 1 - (i / documents.length) 
      }));
    }
  }
  ```

  **Acceptance Criteria**:
  - [ ] `src/services/reranker.ts` 파일 존재
  - [ ] rerank 함수 export됨
  - [ ] TypeScript 컴파일 에러 없음: `npx tsc --noEmit`

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Reranker 모듈 컴파일 테스트
    Tool: Bash
    Preconditions: 파일 생성 완료
    Steps:
      1. npx tsc --noEmit
      2. Assert: exit code 0
      3. grep -n "export async function rerank" src/services/reranker.ts
      4. Assert: 매칭 결과 있음
    Expected Result: 컴파일 성공, rerank 함수 존재
    Evidence: 터미널 출력 캡처
  ```

  **Commit**: YES
  - Message: `feat(search): add reranker client service`
  - Files: `src/services/reranker.ts`

---

- [ ] 2. Recency Boost 함수 구현

  **What to do**:
  - `src/services/recency-boost.ts` 파일 생성
  - 지수 감쇠 함수 구현 (14일 반감기)
  - 단위 테스트 작성

  **Must NOT do**:
  - 기존 score 계산 로직 직접 수정
  - 복잡한 시간 기반 로직 추가

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1-A)
  - **Blocks**: Task 3
  - **Blocked By**: Task 0

  **References**:
  - `src/services/local-search.ts:mergeWithRRF()` - 현재 점수 계산 로직 (440번 줄)
  - `src/types/context-search.ts:SearchResult` - timestamp 필드 확인

  **구현 스펙**:
  ```typescript
  // src/services/recency-boost.ts
  const HALF_LIFE_DAYS = 14;
  const RECENCY_WEIGHT = 0.3; // 30% recency, 70% relevance

  /**
   * 지수 감쇠 함수: score = e^(-λt)
   * λ = ln(2) / half_life
   * 14일 후 ~50%, 28일 후 ~25%
   */
  export function calculateRecencyBoost(timestamp?: number): number {
    if (!timestamp) return 0.5; // 타임스탬프 없으면 중간값

    const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
    const lambda = Math.LN2 / HALF_LIFE_DAYS;
    return Math.exp(-lambda * Math.max(0, ageInDays));
  }

  export function applyRecencyBoost<T extends { score: number; timestamp?: number }>(
    results: T[]
  ): T[] {
    return results.map(result => {
      const recencyScore = calculateRecencyBoost(result.timestamp);
      const boostedScore = (1 - RECENCY_WEIGHT) * result.score + RECENCY_WEIGHT * recencyScore;
      return { ...result, score: boostedScore };
    });
  }
  ```

  **Acceptance Criteria**:
  - [ ] `src/services/recency-boost.ts` 파일 존재
  - [ ] applyRecencyBoost 함수 export됨
  - [ ] 단위 테스트 통과

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Recency Boost 계산 검증
    Tool: Bash
    Preconditions: 파일 및 테스트 생성 완료
    Steps:
      1. npx vitest run src/services/__tests__/recency-boost.test.ts
      2. Assert: 모든 테스트 통과
    Expected Result: 14일 전 문서 ~50%, 28일 전 ~25% boost
    Evidence: 테스트 출력 캡처
  ```

  **Commit**: YES
  - Message: `feat(search): add recency boost function`
  - Files: `src/services/recency-boost.ts`, `src/services/__tests__/recency-boost.test.ts`

---

- [ ] 3. local-search.ts에 Reranker + Recency 통합

  **What to do**:
  - `search()` 함수에서 RRF 결과에 Reranker 적용
  - Reranker 결과에 Recency Boost 적용
  - 에러 발생 시 기존 결과 그대로 반환 (graceful degradation)

  **Must NOT do**:
  - 기존 semanticSearch/keywordSearch 로직 변경
  - RRF 상수 (k=60) 변경
  - 기존 반환 타입 변경

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1-B, Task 2

  **References**:
  - `src/services/local-search.ts:search()` - 메인 검색 함수 (242번 줄)
  - `src/services/local-search.ts:mergeWithRRF()` - RRF 병합 함수 (440번 줄)
  - `src/services/reranker.ts` - Task 1-B에서 생성
  - `src/services/recency-boost.ts` - Task 2에서 생성

  **통합 위치** (search 함수 내):
  ```typescript
  // 기존 코드
  const merged = this.mergeWithRRF(semanticResults, keywordResults, RRF_K);

  // 추가할 코드
  const reranked = await this.applyRerank(query, merged);
  const boosted = applyRecencyBoost(reranked);

  return boosted.slice(0, limit);
  ```

  **Acceptance Criteria**:
  - [ ] search() 함수에서 rerank 호출 코드 존재
  - [ ] search() 함수에서 recency boost 호출 코드 존재
  - [ ] 기존 테스트 통과: `npx vitest run`
  - [ ] `[Reranker]` 로그 출력 확인

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 통합 검색 파이프라인 테스트
    Tool: Bash
    Preconditions: Task 1-B, 2 완료
    Steps:
      1. npx vitest run src/services/__tests__/local-search.test.ts
      2. Assert: 모든 테스트 통과
      3. grep -n "rerank" src/services/local-search.ts
      4. Assert: rerank 호출 코드 존재
      5. grep -n "applyRecencyBoost" src/services/local-search.ts
      6. Assert: recency boost 호출 코드 존재
    Expected Result: 기존 테스트 통과 + 통합 코드 확인
    Evidence: 테스트 출력 캡처
  ```

  **Commit**: YES
  - Message: `feat(search): integrate reranker and recency boost into search pipeline`
  - Files: `src/services/local-search.ts`

---

- [ ] 4. E2E 테스트 및 검증

  **What to do**:
  - 앱 빌드: `npm run pack`
  - 앱 실행 후 컨텍스트 추천 기능 테스트
  - 콘솔 로그로 rerank 호출 확인

  **Must NOT do**:
  - 프로덕션 환경에서 테스트
  - 실제 사용자 데이터로 테스트

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `package.json:scripts.pack` - 빌드 명령어
  - CLAUDE.md - `npm run pack:clean` 권장

  **Acceptance Criteria**:
  - [ ] `npm run pack` 성공
  - [ ] 앱 실행 시 에러 없음
  - [ ] 검색 시 콘솔에 `[Reranker]` 로그 출력

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: 앱 빌드 테스트
    Tool: Bash
    Preconditions: Task 3 완료
    Steps:
      1. npm run pack
      2. Assert: exit code 0
      3. ls -la release/mac-arm64/
      4. Assert: "Linear Capture.app" 존재
    Expected Result: 앱 빌드 성공
    Evidence: 빌드 출력 및 파일 목록 캡처

  Scenario: 앱 실행 및 로그 확인
    Tool: Bash
    Preconditions: 앱 빌드 완료
    Steps:
      1. open 'release/mac-arm64/Linear Capture.app' --args --enable-logging
      2. 잠시 대기 후 로그 확인
      3. grep "[Reranker]" ~/Library/Logs/linear-capture/*.log || echo "Check DevTools console"
    Expected Result: Reranker 관련 로그 출력
    Evidence: 로그 캡처
  ```

  **Commit**: NO (테스트 단계)

---

- [ ] 5. PR 생성 및 메인 브랜치 머지

  **What to do**:
  - 변경사항 push
  - PR 생성
  - 워크트리 정리

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None
  - **Blocked By**: Task 4

  **Acceptance Criteria**:
  - [ ] PR 생성됨
  - [ ] 워크트리 삭제됨

  **Commit**: NO (PR 단계)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1-A | `feat(worker): add /rerank endpoint with Cohere integration` | Worker 소스 | curl 테스트 |
| 1-B | `feat(search): add reranker client service` | reranker.ts | tsc --noEmit |
| 2 | `feat(search): add recency boost function` | recency-boost.ts, test | vitest run |
| 3 | `feat(search): integrate reranker and recency boost` | local-search.ts | vitest run |

---

## Success Criteria

### Verification Commands
```bash
# TypeScript 컴파일
npx tsc --noEmit  # Expected: 에러 없음

# 테스트 실행
npx vitest run  # Expected: 모든 테스트 통과

# 앱 빌드
npm run pack  # Expected: 빌드 성공

# Worker 테스트
curl -X POST https://linear-capture-ai.ny-4f1.workers.dev/rerank \
  -H "Content-Type: application/json" \
  -d '{"query":"test","documents":[{"id":"1","text":"test"}]}'
# Expected: JSON 응답
```

### Final Checklist
- [ ] Worker /rerank 엔드포인트 동작
- [ ] Cohere Reranker 통합됨
- [ ] Recency Boost 적용됨
- [ ] 기존 기능 유지됨
- [ ] 모든 테스트 통과
- [ ] 앱 빌드 성공

---

## Environment Variables

### Worker Secret 추가 (wrangler)
```bash
wrangler secret put COHERE_API_KEY
# 값: jvTGZkrve07Kq0CPsVgzve6SFDt4TXdiEWmzkJyC
```

### 앱 .env (변경 없음)
앱에서는 Cohere API 키를 직접 사용하지 않음 (Worker 프록시 방식)

---

## Worker 저장소 정보

Worker 코드 위치 확인 필요:
- Worker URL: `https://linear-capture-ai.ny-4f1.workers.dev`
- 저장소: 별도 확인 필요 (Task 1-A 시작 시)
