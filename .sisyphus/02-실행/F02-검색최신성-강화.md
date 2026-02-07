# Linear Capture 검색 품질 개선 + 소스별 Recency Boost

## 진행 상태 (2025-02-06 업데이트)

| Task | 상태 | 비고 |
|------|:----:|------|
| 0. Git Worktree 설정 | ✅ 완료 | `feature/search-recency-enhancement` 브랜치, worktree 생성 + npm install |
| 1. Worker 코드 수정 | ✅ 완료 | `toUpperCase()` 제거, `truncateText` 500→2000, **배포 완료** (Version: a05c6d17) |
| 2. Worker /rerank 엔드포인트 | ✅ 완료 | **이미 구현되어 있었음** — Cohere rerank-v3.5, curl 테스트 통과 |
| 3. Recency Boost 함수 | ⏳ 대기 | `src/services/recency-boost.ts` 생성 필요 |
| 4. Reranker 클라이언트 | ⏳ 대기 | `src/services/reranker.ts` 생성 필요 |
| 5. local-search 통합 | ⏳ 대기 | Task 3, 4 완료 후 진행 |
| 6. E2E 테스트 | ⏳ 대기 | 앱 빌드 + 수동 테스트 필요 |
| 7. PR 생성 | ⏳ 대기 | 모든 작업 완료 후 |

### 주요 발견사항
- Worker `/rerank` 엔드포인트와 `handleRerank()` 함수가 이미 `index.ts`에 구현되어 있음 (line 343-349, 718-788)
- `COHERE_API_KEY` secret도 이미 설정됨 — curl 테스트로 정상 동작 확인
- Worker URL: `https://linear-capture-ai.kangjun-f0f.workers.dev` (배포 시 표시되는 URL)
- 기존 벡터 재인덱싱 필요: incremental sync 방식이므로 앱 데이터 삭제 후 재동기화 필요 (Task 6에서 수행 예정)

---

## TL;DR

> **Quick Summary**: 기존 검색 파이프라인에 Cohere Reranker + 소스별 차등 Recency Boost를 추가하여 검색 정확도 50%+ 향상
> 
> **Deliverables**:
> - Worker `/rerank` 엔드포인트 (Cohere 연동) — ✅ 이미 존재
> - `src/services/reranker.ts` - Worker 호출 클라이언트
> - `src/services/recency-boost.ts` - 소스별 차등 Recency Boost
> - `src/services/local-search.ts` - 파이프라인 통합
> - Worker 코드 수정 (`toUpperCase()` 제거, 절단 2000자) — ✅ 배포 완료
> 
> **Estimated Effort**: Medium (2일)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Worktree 설정 → Worker 수정 → Reranker → Recency → 통합 → 테스트
> **Branch**: `feature/search-recency-enhancement`

---

## Context

### Original Request
- 검색 결과 정확도와 관련성 개선 필요
- 최신성(Recency)에 가중치를 더 주는 로직 필요
- 소스(Slack, Notion, Linear, Gmail)별로 다른 Recency 전략 적용

### 현재 시스템 분석

**검색 파이프라인 (현재)**:
```
Query → TextPreprocessor → Embedding (OpenAI)
     ↓
Hybrid Search = Semantic (pgvector) + FTS (tsvector)
     ↓
RRF Fusion (k=60)
     ↓
결과 반환 (최대 5개/소스)
```

**발견된 문제점**:
| 문제 | 영향 | 해결책 |
|------|------|--------|
| Reranker 없음 (Bi-encoder만) | 의미적 정밀도 낮음 | Cohere Rerank 추가 |
| Recency 가중치 없음 | 오래된 문서 = 최신 문서 | 지수 감쇠 함수 추가 |
| 소스별 동일 처리 | Slack/Notion 특성 무시 | 소스별 차등 적용 |
| Worker toUpperCase() | 임베딩 품질 저하 | 제거 |
| 텍스트 절단 500자 | 정보 손실 | 2000자로 확대 |

### Research Findings

**Recency Boost 업계 표준**:
- 지수 감쇠 (Exponential Decay): `score = e^(-λ × t)` where λ = ln(2) / half_life
- Typesense 버킷 기반: 관련성 버킷 내에서 최신순 정렬
- Elasticsearch function_score: gauss/exp decay 함수

**소스별 최적 전략**:
| 소스 | Recency 비중 | 반감기 | 근거 |
|------|:-----------:|:------:|------|
| Slack | 60% | 7일 | 대화는 최신성이 핵심 |
| Gmail | 50% | 14일 | 이메일은 중간 정도 최신성 |
| Linear | 40% | 14일 | 활성 이슈 우선, 관련성도 중요 |
| Notion | 20% | 30일 | 문서 품질이 최우선 |

**Reranker 효과**:
- Cohere Rerank: Cross-encoder 기반, +20-33% 정확도 향상
- 기존 Bi-encoder 한계 극복

---

## Work Objectives

### Core Objective
검색 파이프라인에 Reranker와 소스별 Recency Boost를 추가하여 컨텍스트 추천 정확도를 **50% 이상 개선**한다.

### Concrete Deliverables
1. Worker `/rerank` 엔드포인트 (Cohere API)
2. `src/services/reranker.ts` - Worker 호출 클라이언트
3. `src/services/recency-boost.ts` - 소스별 차등 Recency Boost
4. `src/services/local-search.ts` - 파이프라인 통합
5. Worker 코드 수정 (toUpperCase 제거, 절단 확대)

### Definition of Done
- [ ] Worker `/rerank` 엔드포인트 응답 성공
- [ ] 검색 결과에 Rerank + Recency Boost 적용됨
- [ ] Slack 메시지는 7일 반감기로 감쇠
- [ ] Notion 문서는 30일 반감기로 감쇠 (최소 가중치)
- [ ] 기존 테스트 통과
- [ ] 앱에서 컨텍스트 추천 동작 확인

### Must Have
- Cohere Rerank 통합 (Worker 프록시)
- 소스별 차등 Recency Boost
- 기존 검색 기능 유지 (graceful degradation)

### Must NOT Have (Guardrails)
- DB 스키마 변경
- 앱에서 직접 Cohere API 호출 (보안 위험)
- 외부 솔루션 마이그레이션 (이번 스코프 아님)
- 기존 RRF 로직 대폭 변경

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> 모든 검증은 에이전트가 직접 수행합니다.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: YES (Tests-after)
- **Framework**: vitest

### Agent-Executed QA Scenarios

모든 Task에 Bash 또는 curl을 통한 검증 시나리오가 포함됩니다.

---

## Git Worktree Setup

### 브랜치 전략

```
main
  └── feature/search-recency-enhancement (worktree)
```

### 디렉토리 구조

```
~/side-project/linear_project/
├── linear-capture/                              # 메인 (main)
│
└── linear-capture-worktrees/
    └── search-recency-enhancement/              # 이 작업용 워크트리
```

### Worktree 생성 명령어

```bash
# 메인 저장소에서 실행
cd /Users/wine_ny/side-project/linear_project/linear-capture

# 새 브랜치와 함께 워크트리 생성
git worktree add -b feature/search-recency-enhancement \
  ../linear-capture-worktrees/search-recency-enhancement

# 워크트리로 이동
cd ../linear-capture-worktrees/search-recency-enhancement

# 의존성 설치
npm install
```

### 작업 완료 후 정리

```bash
# 메인으로 이동
cd /Users/wine_ny/side-project/linear_project/linear-capture

# PR 생성 후 머지
git merge feature/search-recency-enhancement

# 워크트리 삭제
git worktree remove ../linear-capture-worktrees/search-recency-enhancement

# 정리
git worktree prune
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Setup):
└── Task 0: Git Worktree 설정

Wave 1 (After Setup):
├── Task 1: Worker 코드 수정 (toUpperCase + 절단)
├── Task 2: Worker /rerank 엔드포인트 추가
└── Task 3: Recency Boost 함수 구현 (소스별 차등)

Wave 2 (After Wave 1):
├── Task 4: Reranker 클라이언트 생성
└── Task 5: local-search.ts에 통합

Wave 3 (After Wave 2):
├── Task 6: E2E 테스트 및 검증
└── Task 7: PR 생성 및 워크트리 정리
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | 1, 2, 3 | None |
| 1 | 0 | 5 | 2, 3 |
| 2 | 0 | 4 | 1, 3 |
| 3 | 0 | 5 | 1, 2 |
| 4 | 2 | 5 | None |
| 5 | 1, 3, 4 | 6 | None |
| 6 | 5 | 7 | None |
| 7 | 6 | None | None |

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
  - Reason: 단순 코드 수정, 1시간 이내 완료
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 2, 3)
- **Blocks**: Task 5
- **Blocked By**: None

**References**:
- Worker 저장소: `linear-capture-worker` (별도 저장소)
- 문제 위치: `src/vectorize/recommend.ts`, `src/vectorize/index.ts`
- 기존 계획: `.sisyphus/plans/search-quality-improvement.md` Task 1 참고

**Acceptance Criteria**:
- [ ] `toUpperCase()` 호출 없음: `grep -rn "toUpperCase" src/`
- [ ] 절단 길이 2000자: `grep -rn "truncateText" src/`
- [ ] Worker 배포 성공: `wrangler deploy`

**Agent-Executed QA Scenarios**:

```
Scenario: Worker 코드 검증
  Tool: Bash
  Preconditions: linear-capture-worker 저장소 접근 가능
  Steps:
    1. cd linear-capture-worker
    2. grep -rn "toUpperCase" src/
    3. Assert: 결과 없음 (또는 recommend.ts에서 제거됨)
    4. grep -rn "truncateText" src/
    5. Assert: 2000 값 확인
    6. wrangler deploy --dry-run
    7. Assert: 배포 가능 상태
  Expected Result: 문제 코드 제거됨
  Evidence: 터미널 출력 캡처
```

**Commit**: YES
- Message: `fix(vectorize): remove toUpperCase and extend text truncation to 2000 chars`
- Files: Worker 소스 파일

---

### Task 2: Worker `/rerank` 엔드포인트 추가

**What to do**:
- Worker (linear-capture-ai)에 `/rerank` POST 엔드포인트 추가
- Cohere Rerank API 호출 구현
- Worker Secret에 `COHERE_API_KEY` 추가

**Must NOT do**:
- 기존 `/analyze`, `/upload` 엔드포인트 수정
- 앱에서 직접 Cohere 호출

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: API 엔드포인트 추가, 표준 패턴 따름
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 1, 3)
- **Blocks**: Task 4
- **Blocked By**: None

**References**:
- Worker URL: `https://linear-capture-ai.ny-4f1.workers.dev`
- Cohere Rerank API: https://docs.cohere.com/reference/rerank
- 기존 Worker 패턴: `/analyze` 엔드포인트 참고
- 기존 계획: `.sisyphus/plans/improve-context-recommendation.md` Task 1-A 참고

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
- [ ] curl 테스트 성공

**Agent-Executed QA Scenarios**:

```
Scenario: Worker /rerank 엔드포인트 테스트
  Tool: Bash (curl)
  Preconditions: Worker 배포 완료, COHERE_API_KEY 설정됨
  Steps:
    1. curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/rerank \
         -H "Content-Type: application/json" \
         -d '{"query":"test query","documents":[{"id":"1","text":"test doc"}],"topN":5}'
    2. Assert: HTTP 200 응답
    3. Assert: response.results 배열 존재
    4. Assert: results[0].relevanceScore 숫자값
  Expected Result: Rerank 결과 반환
  Evidence: curl 응답 JSON 캡처
```

**Commit**: YES
- Message: `feat(worker): add /rerank endpoint with Cohere integration`
- Files: Worker 소스 파일

---

### Task 3: 소스별 Recency Boost 함수 구현

**What to do**:
- `src/services/recency-boost.ts` 파일 생성
- 소스별 차등 지수 감쇠 함수 구현
- 단위 테스트 작성

**Must NOT do**:
- 기존 score 계산 로직 직접 수정
- 하드코딩된 상수 (설정 가능하게)

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 순수 함수 구현, 테스트 포함
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Task 1, 2)
- **Blocks**: Task 5
- **Blocked By**: None

**References**:
- `src/services/local-search.ts:mergeWithRRF()` - 현재 점수 계산 로직
- `src/types/context-search.ts:SearchResult` - timestamp, source 필드 확인
- 리서치 결과: 소스별 Recency 전략 (상단 Context 섹션)

**구현 스펙**:
```typescript
// src/services/recency-boost.ts

interface SourceRecencyConfig {
  halfLifeDays: number;
  weight: number;  // 0-1 (recency 비중)
}

// 소스별 Recency 설정
export const SOURCE_RECENCY_CONFIGS: Record<string, SourceRecencyConfig> = {
  slack: { halfLifeDays: 7, weight: 0.6 },   // Slack: 60% recency, 7일 반감기
  linear: { halfLifeDays: 14, weight: 0.4 }, // Linear: 40% recency, 14일 반감기
  notion: { halfLifeDays: 30, weight: 0.2 }, // Notion: 20% recency, 30일 반감기
  gmail: { halfLifeDays: 14, weight: 0.5 },  // Gmail: 50% recency, 14일 반감기
};

// 기본값 (알 수 없는 소스용)
const DEFAULT_CONFIG: SourceRecencyConfig = { halfLifeDays: 14, weight: 0.3 };

/**
 * 지수 감쇠 함수: score = e^(-λt)
 * λ = ln(2) / half_life
 * 
 * @param timestamp - 문서 생성 시간 (Unix timestamp ms)
 * @param source - 소스 타입 ('slack' | 'notion' | 'linear' | 'gmail')
 * @returns 0-1 사이의 recency score
 */
export function calculateRecencyScore(
  timestamp: number | undefined,
  source: string
): number {
  if (!timestamp) return 0.5; // 타임스탬프 없으면 중간값
  
  const config = SOURCE_RECENCY_CONFIGS[source] || DEFAULT_CONFIG;
  const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  const lambda = Math.LN2 / config.halfLifeDays;
  
  return Math.exp(-lambda * Math.max(0, ageInDays));
}

/**
 * Recency Boost 적용
 * finalScore = (1 - weight) * relevanceScore + weight * recencyScore
 */
export function applyRecencyBoost<T extends { 
  score: number; 
  timestamp?: number; 
  source: string;
}>(results: T[]): T[] {
  return results.map(result => {
    const config = SOURCE_RECENCY_CONFIGS[result.source] || DEFAULT_CONFIG;
    const recencyScore = calculateRecencyScore(result.timestamp, result.source);
    const boostedScore = (1 - config.weight) * result.score + config.weight * recencyScore;
    
    return { ...result, score: boostedScore };
  });
}

/**
 * Recency Score 미리보기 (디버깅용)
 */
export function getRecencyDecayPreview(source: string): Record<string, number> {
  const now = Date.now();
  const days = [0, 1, 7, 14, 30, 60, 90];
  
  return days.reduce((acc, d) => {
    const timestamp = now - d * 24 * 60 * 60 * 1000;
    acc[`${d}d`] = Math.round(calculateRecencyScore(timestamp, source) * 100) / 100;
    return acc;
  }, {} as Record<string, number>);
}
```

**예상 Recency Decay 값**:

| 기간 | Slack (7일) | Gmail (14일) | Linear (14일) | Notion (30일) |
|------|:-----------:|:------------:|:-------------:|:-------------:|
| 오늘 | 1.00 | 1.00 | 1.00 | 1.00 |
| 1일 | 0.91 | 0.95 | 0.95 | 0.98 |
| 7일 | 0.50 | 0.71 | 0.71 | 0.85 |
| 14일 | 0.25 | 0.50 | 0.50 | 0.72 |
| 30일 | 0.06 | 0.23 | 0.23 | 0.50 |
| 60일 | 0.004 | 0.05 | 0.05 | 0.25 |

**Acceptance Criteria**:
- [ ] `src/services/recency-boost.ts` 파일 존재
- [ ] `applyRecencyBoost` 함수 export됨
- [ ] 소스별 설정 상수 export됨
- [ ] 단위 테스트 통과: `npx vitest run src/services/__tests__/recency-boost.test.ts`

**Agent-Executed QA Scenarios**:

```
Scenario: Recency Boost 계산 검증
  Tool: Bash
  Preconditions: 파일 및 테스트 생성 완료
  Steps:
    1. npx vitest run src/services/__tests__/recency-boost.test.ts
    2. Assert: 모든 테스트 통과
    3. Assert: Slack 7일 전 문서 → ~50% score
    4. Assert: Notion 30일 전 문서 → ~50% score
    5. Assert: Slack 30일 전 문서 → ~6% score (Notion보다 훨씬 낮음)
  Expected Result: 소스별 차등 감쇠 정상 동작
  Evidence: 테스트 출력 캡처
```

**테스트 코드 예시**:
```typescript
// src/services/__tests__/recency-boost.test.ts
import { describe, it, expect } from 'vitest';
import { calculateRecencyScore, applyRecencyBoost, getRecencyDecayPreview } from '../recency-boost';

describe('recency-boost', () => {
  describe('calculateRecencyScore', () => {
    it('returns 1.0 for current timestamp', () => {
      expect(calculateRecencyScore(Date.now(), 'slack')).toBeCloseTo(1.0, 1);
    });

    it('returns ~0.5 for Slack at 7 days', () => {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      expect(calculateRecencyScore(sevenDaysAgo, 'slack')).toBeCloseTo(0.5, 1);
    });

    it('returns ~0.5 for Notion at 30 days', () => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      expect(calculateRecencyScore(thirtyDaysAgo, 'notion')).toBeCloseTo(0.5, 1);
    });

    it('Slack decays faster than Notion', () => {
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const slackScore = calculateRecencyScore(fourteenDaysAgo, 'slack');
      const notionScore = calculateRecencyScore(fourteenDaysAgo, 'notion');
      
      expect(slackScore).toBeLessThan(notionScore);
      expect(slackScore).toBeCloseTo(0.25, 1); // Slack 14일 = 25%
      expect(notionScore).toBeCloseTo(0.72, 1); // Notion 14일 = 72%
    });

    it('returns 0.5 for undefined timestamp', () => {
      expect(calculateRecencyScore(undefined, 'slack')).toBe(0.5);
    });
  });

  describe('applyRecencyBoost', () => {
    it('applies source-specific weights', () => {
      const now = Date.now();
      const results = [
        { id: '1', score: 0.8, timestamp: now, source: 'slack' },
        { id: '2', score: 0.8, timestamp: now, source: 'notion' },
      ];
      
      const boosted = applyRecencyBoost(results);
      
      // Slack: (1-0.6)*0.8 + 0.6*1.0 = 0.32 + 0.6 = 0.92
      expect(boosted[0].score).toBeCloseTo(0.92, 1);
      // Notion: (1-0.2)*0.8 + 0.2*1.0 = 0.64 + 0.2 = 0.84
      expect(boosted[1].score).toBeCloseTo(0.84, 1);
    });
  });
});
```

**Commit**: YES
- Message: `feat(search): add source-specific recency boost with configurable decay`
- Files: `src/services/recency-boost.ts`, `src/services/__tests__/recency-boost.test.ts`

---

### Task 4: Reranker 클라이언트 생성

**What to do**:
- `src/services/reranker.ts` 파일 생성
- Worker `/rerank` 엔드포인트 호출 함수 구현
- 에러 핸들링 및 fallback 로직 (실패 시 원본 순서 유지)

**Must NOT do**:
- Cohere SDK 직접 설치/사용
- API 키를 앱에 저장

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: API 클라이언트, 기존 패턴 따름
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2 (after Task 2)
- **Blocks**: Task 5
- **Blocked By**: Task 2

**References**:
- `src/services/r2-uploader.ts` - Worker 호출 패턴 참고
- `src/services/anthropic-analyzer.ts` - Worker 호출 패턴 참고
- 기존 계획: `.sisyphus/plans/improve-context-recommendation.md` Task 1-B 참고

**구현 스펙**:
```typescript
// src/services/reranker.ts
const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';

export interface RerankResult {
  id: string;
  relevanceScore: number;
}

/**
 * Worker를 통해 Cohere Rerank 호출
 * 
 * @param query - 검색 쿼리
 * @param documents - 재정렬할 문서들
 * @param topN - 반환할 상위 N개 (default: 20)
 * @returns 재정렬된 결과 (relevanceScore 포함)
 */
export async function rerank(
  query: string, 
  documents: Array<{ id: string; text: string }>,
  topN = 20
): Promise<RerankResult[]> {
  // 빈 입력 처리
  if (!documents.length) return [];
  if (!query.trim()) {
    console.warn('[Reranker] Empty query, returning original order');
    return documents.map((doc, i) => ({ 
      id: doc.id, 
      relevanceScore: 1 - (i / documents.length) 
    }));
  }

  try {
    console.log(`[Reranker] Reranking ${documents.length} documents`);
    
    const response = await fetch(`${WORKER_URL}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documents, topN })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Reranker] Worker error (${response.status}): ${errorText}`);
      return gracefulFallback(documents);
    }

    const data = await response.json() as { results: RerankResult[] };
    console.log(`[Reranker] Success: ${data.results.length} results`);
    
    return data.results;
  } catch (error) {
    console.error('[Reranker] Failed:', error);
    return gracefulFallback(documents);
  }
}

/**
 * Graceful degradation: 원본 순서 유지
 */
function gracefulFallback(
  documents: Array<{ id: string; text: string }>
): RerankResult[] {
  console.log('[Reranker] Using fallback (original order)');
  return documents.map((doc, i) => ({ 
    id: doc.id, 
    relevanceScore: 1 - (i / documents.length) 
  }));
}
```

**Acceptance Criteria**:
- [ ] `src/services/reranker.ts` 파일 존재
- [ ] `rerank` 함수 export됨
- [ ] TypeScript 컴파일 에러 없음: `npx tsc --noEmit`
- [ ] graceful fallback 동작 확인

**Agent-Executed QA Scenarios**:

```
Scenario: Reranker 모듈 컴파일 및 동작 테스트
  Tool: Bash
  Preconditions: 파일 생성 완료, Worker 배포 완료
  Steps:
    1. npx tsc --noEmit
    2. Assert: exit code 0
    3. grep -n "export async function rerank" src/services/reranker.ts
    4. Assert: 매칭 결과 있음
    5. grep -n "gracefulFallback" src/services/reranker.ts
    6. Assert: fallback 함수 존재
  Expected Result: 컴파일 성공, rerank 함수 및 fallback 존재
  Evidence: 터미널 출력 캡처
```

**Commit**: YES
- Message: `feat(search): add reranker client with graceful fallback`
- Files: `src/services/reranker.ts`

---

### Task 5: local-search.ts에 통합

**What to do**:
- `search()` 함수에서 RRF 결과에 Reranker 적용
- Reranker 결과에 Recency Boost 적용
- 소스 정보 전달 확인 (source 필드)
- 에러 발생 시 기존 결과 그대로 반환 (graceful degradation)

**Must NOT do**:
- 기존 semanticSearch/keywordSearch 로직 변경
- RRF 상수 (k=60) 변경
- 기존 반환 타입 변경

**Recommended Agent Profile**:
- **Category**: `unspecified-low`
  - Reason: 여러 모듈 통합, 중간 복잡도
- **Skills**: []

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 2 (sequential)
- **Blocks**: Task 6
- **Blocked By**: Task 1, 3, 4

**References**:
- `src/services/local-search.ts:search()` - 메인 검색 함수 (line 227)
- `src/services/local-search.ts:mergeWithRRF()` - RRF 병합 함수 (line 419)
- `src/services/local-search.ts:rowToSearchResult()` - source 필드 확인 (line 463)
- `src/services/reranker.ts` - Task 4에서 생성
- `src/services/recency-boost.ts` - Task 3에서 생성

**통합 위치** (search 함수 내):
```typescript
// 기존 코드 (line 250-252)
const merged = this.mergeWithRRF(semanticResults, keywordResults, RRF_K);
return merged.slice(0, limit);

// 변경 후
const merged = this.mergeWithRRF(semanticResults, keywordResults, RRF_K);

// Rerank 적용 (Top 30에 대해)
const reranked = await this.applyRerank(query, merged.slice(0, 30));

// Recency Boost 적용
const boosted = applyRecencyBoost(reranked);

// 최종 정렬 및 반환
const sorted = boosted.sort((a, b) => b.score - a.score);
return sorted.slice(0, limit);
```

**applyRerank 헬퍼 메서드**:
```typescript
// LocalSearchService 클래스 내 추가
private async applyRerank(
  query: string,
  results: SearchResult[]
): Promise<SearchResult[]> {
  try {
    const documents = results.map(r => ({
      id: r.id,
      text: `${r.title || ''} ${r.content}`.slice(0, 1000) // Cohere 입력 제한
    }));

    const reranked = await rerank(query, documents);
    
    // Rerank 결과로 score 업데이트
    const scoreMap = new Map(reranked.map(r => [r.id, r.relevanceScore]));
    
    return results.map(result => ({
      ...result,
      score: scoreMap.get(result.id) ?? result.score
    }));
  } catch (error) {
    console.error('[LocalSearch] Rerank failed, using original scores:', error);
    return results;
  }
}
```

**Acceptance Criteria**:
- [ ] `search()` 함수에서 rerank 호출 코드 존재
- [ ] `search()` 함수에서 applyRecencyBoost 호출 코드 존재
- [ ] source 필드가 SearchResult에 포함됨
- [ ] 기존 테스트 통과: `npx vitest run`
- [ ] `[Reranker]` 로그 출력 확인

**Agent-Executed QA Scenarios**:

```
Scenario: 통합 검색 파이프라인 테스트
  Tool: Bash
  Preconditions: Task 1, 3, 4 완료
  Steps:
    1. npx vitest run src/services/__tests__/local-search.test.ts
    2. Assert: 모든 테스트 통과
    3. grep -n "rerank" src/services/local-search.ts
    4. Assert: rerank 호출 코드 존재
    5. grep -n "applyRecencyBoost" src/services/local-search.ts
    6. Assert: recency boost 호출 코드 존재
    7. grep -n "source:" src/services/local-search.ts
    8. Assert: source 필드 반환 확인
  Expected Result: 기존 테스트 통과 + 통합 코드 확인
  Evidence: 테스트 출력 캡처

Scenario: 파이프라인 순서 검증
  Tool: Bash
  Preconditions: 통합 완료
  Steps:
    1. 검색 파이프라인 코드 확인
    2. Assert: RRF → Rerank → RecencyBoost → Sort 순서
  Expected Result: 올바른 파이프라인 순서
  Evidence: 코드 스니펫 캡처
```

**Commit**: YES
- Message: `feat(search): integrate reranker and source-specific recency boost`
- Files: `src/services/local-search.ts`

---

### Task 6: E2E 테스트 및 검증

**What to do**:
- 앱 빌드: `npm run pack`
- 앱 실행 후 컨텍스트 추천 기능 테스트
- 콘솔 로그로 rerank 호출 확인
- 소스별 다른 Recency 적용 확인

**Must NOT do**:
- 프로덕션 환경에서 테스트
- 실제 사용자 데이터로 테스트

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 빌드 및 수동 검증
- **Skills**: [`playwright`]
  - playwright: 앱 UI 자동화 테스트 가능

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (final)
- **Blocks**: None
- **Blocked By**: Task 5

**References**:
- `package.json:scripts.pack` - 빌드 명령어
- CLAUDE.md - `npm run pack:clean` 권장
- DevTools 콘솔 - 로그 확인

**Acceptance Criteria**:
- [ ] `npm run pack` 성공
- [ ] 앱 실행 시 에러 없음
- [ ] 검색 시 콘솔에 `[Reranker]` 로그 출력
- [ ] Slack 검색 결과에서 최신 메시지 상위 노출
- [ ] Notion 검색 결과에서 관련성 높은 문서 상위 노출 (최신성 영향 적음)

**Agent-Executed QA Scenarios**:

```
Scenario: 앱 빌드 테스트
  Tool: Bash
  Preconditions: Task 5 완료
  Steps:
    1. npm run pack:clean
    2. Assert: exit code 0
    3. ls -la release/mac-arm64/
    4. Assert: "Linear Capture.app" 존재
  Expected Result: 앱 빌드 성공
  Evidence: 빌드 출력 및 파일 목록 캡처

Scenario: 검색 파이프라인 로그 확인
  Tool: Bash
  Preconditions: 앱 빌드 완료
  Steps:
    1. open 'release/mac-arm64/Linear Capture.app'
    2. 앱에서 검색 수행
    3. DevTools 콘솔 확인
    4. Assert: "[Reranker] Reranking X documents" 로그 존재
    5. Assert: "[Reranker] Success: X results" 로그 존재
  Expected Result: Reranker 정상 동작
  Evidence: 콘솔 로그 스크린샷

Scenario: 소스별 Recency 차등 확인
  Tool: Playwright (playwright skill)
  Preconditions: 앱 실행 중, 동기화된 데이터 있음
  Steps:
    1. 검색 쿼리 입력 (예: "회의")
    2. Slack 결과 확인: 최신 메시지가 상위
    3. Notion 결과 확인: 관련성 높은 문서가 상위 (날짜 무관)
    4. 같은 관련성이면 Slack이 더 최신 결과 우선
  Expected Result: 소스별 다른 Recency 가중치 적용됨
  Evidence: 검색 결과 스크린샷
```

**Commit**: NO (테스트 단계)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(vectorize): remove toUpperCase and extend truncation` | Worker 소스 | grep + wrangler deploy |
| 2 | `feat(worker): add /rerank endpoint with Cohere integration` | Worker 소스 | curl 테스트 |
| 3 | `feat(search): add source-specific recency boost with configurable decay` | recency-boost.ts, test | vitest run |
| 4 | `feat(search): add reranker client with graceful fallback` | reranker.ts | tsc --noEmit |
| 5 | `feat(search): integrate reranker and source-specific recency boost` | local-search.ts | vitest run |

---

## Success Criteria

### Verification Commands
```bash
# TypeScript 컴파일
npx tsc --noEmit  # Expected: 에러 없음

# 단위 테스트
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
- [ ] Worker toUpperCase() 제거됨
- [ ] Worker 텍스트 절단 2000자로 확대됨
- [ ] Worker /rerank 엔드포인트 동작
- [ ] Cohere Reranker 통합됨
- [ ] 소스별 Recency Boost 적용됨
  - [ ] Slack: 60% recency, 7일 반감기
  - [ ] Gmail: 50% recency, 14일 반감기
  - [ ] Linear: 40% recency, 14일 반감기
  - [ ] Notion: 20% recency, 30일 반감기
- [ ] 기존 기능 유지됨 (graceful degradation)
- [ ] 모든 테스트 통과
- [ ] 앱 빌드 성공

### 예상 효과

| 개선 항목 | 예상 정확도 향상 |
|----------|:---------------:|
| toUpperCase() 제거 | +30-50% |
| 텍스트 절단 확대 | +20-30% |
| Cohere Reranker | +20-33% |
| 소스별 Recency Boost | +15-25% |
| **종합** | **+50% 이상** |

---

## Environment Variables

### Worker Secret 추가 (wrangler)
```bash
wrangler secret put COHERE_API_KEY
# 값: Cohere API 키 입력
```

### 앱 .env (변경 없음)
앱에서는 Cohere API 키를 직접 사용하지 않음 (Worker 프록시 방식)

---

## 참고 문서

| 자료 | 위치 |
|------|------|
| 기존 검색 개선 계획 | `.sisyphus/plans/search-quality-improvement.md` |
| 기존 Reranker 계획 | `.sisyphus/plans/improve-context-recommendation.md` |
| Linear 이슈 | https://linear.app/geniefy/issue/EDU-5838 |
| Cohere Rerank API | https://docs.cohere.com/reference/rerank |
| Elasticsearch Decay | https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-function-score-query.html |

---

## 기존 계획과의 관계

이 계획은 다음 기존 계획들을 **통합 및 확장**합니다:

1. **search-quality-improvement.md**
   - Task 1 (Worker 수정) → 이 계획 Task 1로 통합
   - Task 2 (RecencyBoost) → 이 계획 Task 3으로 **확장** (소스별 차등)

2. **improve-context-recommendation.md**
   - Task 1-A (Worker /rerank) → 이 계획 Task 2로 통합
   - Task 1-B (Reranker 클라이언트) → 이 계획 Task 4로 통합
   - Task 2 (Recency Boost) → 이 계획 Task 3으로 **확장**
   - Task 3 (통합) → 이 계획 Task 5로 통합

**이 계획 실행 후 위 두 계획은 완료 처리됩니다.**
