# Linear Capture 검색 Rerank 버그 수정 계획

## TL;DR

> **Quick Summary**: Rerank + Recency Boost 통합에서 발견된 버그 수정 (topN 불일치 + fallback 개선) + 커밋/PR
> 
> **Deliverables**:
> - `local-search.ts` topN 파라미터 수정
> - `reranker.ts` fallback 로직 개선
> - 전체 변경사항 커밋 + PR 생성
> 
> **Estimated Effort**: Quick (30분)
> **Branch**: `feature/search-recency-enhancement`
> **Worktree**: `/Users/wine_ny/side-project/linear_project/linear-capture-worktrees/search-recency-enhancement`
> **Worker URL**: `https://linear-capture-ai.kangjun-f0f.workers.dev` (올바름 - 전체 프로젝트에서 사용 중)

---

## 발견된 버그

### Bug 1: topN 불일치 (Critical)

**파일**: `local-search.ts` Line 453

**문제**:
```typescript
// 현재 코드 (버그)
const reranked = await rerank(query, documents);  // topN 기본값 20
```

30개 문서를 전달하지만 Cohere에서 20개만 반환됨.
나머지 10개는 `scoreMap.get(result.id) ?? result.score`로 원래 점수 유지.
→ Cohere 점수(0-1)와 원래 점수(cosine similarity 또는 RRF 기반)가 섞여서 정렬 왜곡.

**수정**:
```typescript
const reranked = await rerank(query, documents, documents.length);
```

---

### Bug 2: Fallback 점수 인플레이션 (Medium)

**파일**: `reranker.ts` Lines 51-59

**문제**:
```typescript
function gracefulFallback(documents) {
  return documents.map((doc, i) => ({
    id: doc.id,
    relevanceScore: 1 - i / Math.max(documents.length, 1),  // 첫번째 = 1.0!
  }));
}
```

Rerank 실패 시 첫 번째 문서가 1.0 점수를 받음.
→ Recency Boost의 weighted average에서 관련성 점수가 비정상적으로 높아짐.
→ 원본 순서가 결과를 지배함 (recency 효과 무력화).

**수정**: fallback 시 원본 점수를 그대로 유지하도록 null 반환.

---

### (참고) 추후 개선 사항

| 이슈 | 설명 | 결정 |
|------|------|------|
| 점수 스케일 민감도 | Cohere vs Cosine 분포 차이 | 추후 별도 이슈 |
| 상위 30개 제한 | 31위 이하 고관련 문서 누락 | 현재 유지 (성능) |

---

## TODOs

### Task 1: topN 파라미터 수정

**What to do**:
- `local-search.ts` Line 453에서 `documents.length` 전달

**파일**: `src/services/local-search.ts`

**수정 내용**:
```typescript
// Line 453 변경
// Before:
const reranked = await rerank(query, documents);

// After:
const reranked = await rerank(query, documents, documents.length);
```

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Acceptance Criteria**:
- [ ] `grep -n "documents.length" src/services/local-search.ts` → 매칭
- [ ] `npx tsc --noEmit` → 에러 없음

---

### Task 2: Fallback 로직 개선

**What to do**:
- `applyRerank`에서 rerank 실패 시 원본 결과를 그대로 반환하도록 변경
- `gracefulFallback`은 빈 배열 반환으로 변경

**파일**: `src/services/reranker.ts`, `src/services/local-search.ts`

**수정 전략**: 두 가지 접근법 중 하나 선택:

**접근 A (권장)**: reranker에서 fallback 시 빈 배열 반환 → local-search에서 처리
```typescript
// reranker.ts - gracefulFallback
function gracefulFallback(): RerankResult[] {
  console.log('[Reranker] Using fallback (returning empty → original scores preserved)');
  return [];  // 빈 배열 → applyRerank에서 원본 score 유지
}
```

```typescript
// local-search.ts - applyRerank (기존 로직이 이미 처리)
// scoreMap.get(result.id) ?? result.score  ← 빈 map이면 모든 result.score 유지
```

**접근 B**: reranker fallback에서 중립 점수 부여
```typescript
function gracefulFallback(documents) {
  return documents.map((doc) => ({
    id: doc.id,
    relevanceScore: 0.5,
  }));
}
```

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**Acceptance Criteria**:
- [ ] Rerank 실패 시 원본 점수 유지됨 (1.0 인플레이션 없음)
- [ ] `npx tsc --noEmit` → 에러 없음

---

### Task 3: 테스트 + 빌드 확인

**What to do**:
- vitest 테스트 실행
- TypeScript 컴파일 확인

**Commands**:
```bash
cd /Users/wine_ny/side-project/linear_project/linear-capture-worktrees/search-recency-enhancement
npx vitest run
npx tsc --noEmit
```

**Acceptance Criteria**:
- [ ] 모든 테스트 통과
- [ ] TypeScript 컴파일 에러 없음

---

### Task 4: 수동 테스트 (앱 재빌드)

**What to do**:
- 앱 데이터 삭제 후 재동기화 (기존 벡터가 toUpperCase+500자로 인덱싱됨)
- 검색 테스트
- DevTools 콘솔에서 `[Reranker]` 로그 확인

**Commands**:
```bash
rm -rf ~/Library/Application\ Support/linear-capture
npm run pack:clean

# 앱에서:
# 1. 설정 → 각 소스 동기화
# 2. 검색 테스트
# 3. DevTools (Cmd+Option+I) 콘솔에서 로그 확인
```

**Expected Logs**:
```
[Reranker] Reranking 30 documents
[Reranker] Success: 30 results    ← 20이 아닌 30
```

**Acceptance Criteria**:
- [ ] `[Reranker] Success: 30 results` 로그 확인
- [ ] 검색 결과 순서가 자연스러움
- [ ] Slack 최신 메시지가 상위 노출

---

### Task 5: 커밋 및 PR 생성

**What to do**:
- 전체 변경사항 (recency-boost.ts, reranker.ts, local-search.ts 통합 + 버그 수정) 커밋
- GitHub PR 생성

**Commands**:
```bash
cd /Users/wine_ny/side-project/linear_project/linear-capture-worktrees/search-recency-enhancement

git add -A
git commit -m "feat(search): add Cohere reranking + source-specific recency boost

- Add recency-boost.ts with exponential decay per source
  (Slack 7d/60%, Gmail 14d/50%, Linear 14d/40%, Notion 30d/20%)
- Add reranker.ts client calling Worker /rerank endpoint
- Integrate into search pipeline: RRF → Rerank → Recency Boost → Sort
- Fix topN mismatch: pass documents.length instead of default 20
- Fix fallback scoring to preserve original scores on rerank failure"

git push -u origin feature/search-recency-enhancement

gh pr create \
  --title "feat(search): Cohere reranking + recency boost" \
  --body "$(cat <<'EOF'
## Summary
- Add Cohere reranking via Worker `/rerank` endpoint (rerank-v3.5)
- Add source-specific recency boost with exponential decay
  - Slack: 60% recency weight, 7-day half-life
  - Gmail: 50% recency weight, 14-day half-life
  - Linear: 40% recency weight, 14-day half-life
  - Notion: 20% recency weight, 30-day half-life
- Fix topN mismatch bug (30 docs sent, only 20 returned → now dynamic)
- Fix fallback scoring (was inflating to 1.0 → now preserves original)

## New Files
- `src/services/reranker.ts` - Worker /rerank client with graceful fallback
- `src/services/recency-boost.ts` - Source-specific exponential decay
- `src/services/__tests__/recency-boost.test.ts` - 20 unit tests

## Modified Files
- `src/services/local-search.ts` - Pipeline integration (RRF → Rerank → Recency → Sort)

## Testing
- [x] 20 unit tests pass (`npx vitest run`)
- [x] TypeScript compiles (`npx tsc --noEmit`)
- [ ] Manual app testing (search + DevTools logs)

## Notes
- Worker already deployed with `/rerank` endpoint + `toUpperCase()` removed + 2000char truncation
- Requires app data deletion + re-sync after update (old vectors indexed with toUpperCase+500char)
- `rm -rf ~/Library/Application\ Support/linear-capture` then re-sync in Settings
EOF
)"
```

**Acceptance Criteria**:
- [ ] 커밋 성공
- [ ] 푸시 성공
- [ ] PR URL 반환됨

---

### Task 6: Worktree 정리 (PR 머지 후)

**What to do**:
- PR 머지 확인 후 worktree 삭제

**Commands**:
```bash
cd /Users/wine_ny/side-project/linear_project/linear-capture
git worktree remove ../linear-capture-worktrees/search-recency-enhancement
git worktree prune
```

**Acceptance Criteria**:
- [ ] Worktree 삭제됨
- [ ] `git worktree list`에서 제거 확인

---

## Execution Order

```
Task 1 + Task 2 (병렬 - 코드 수정)
         ↓
       Task 3 (테스트 + 빌드)
         ↓
       Task 4 (수동 테스트)
         ↓
       Task 5 (커밋 + PR)
         ↓
       Task 6 (정리 - PR 머지 후)
```

---

## Success Criteria

### Verification Commands
```bash
# 컴파일
npx tsc --noEmit  # Expected: 에러 없음

# 테스트
npx vitest run  # Expected: 모든 테스트 통과

# Rerank 테스트
curl -X POST https://linear-capture-ai.kangjun-f0f.workers.dev/rerank \
  -H "Content-Type: application/json" \
  -d '{"query":"test","documents":[{"id":"1","text":"doc1"},{"id":"2","text":"doc2"}],"topN":2}'
# Expected: {"success":true,"results":[...]}
```

### Final Checklist
- [ ] topN이 documents.length로 전달됨
- [ ] Fallback 점수가 원본 유지 (1.0 인플레이션 없음)
- [ ] Worker URL: `kangjun-f0f` (올바름 - 변경 불필요)
- [ ] 모든 테스트 통과
- [ ] 앱 빌드 성공
- [ ] PR 생성됨

---

## 관련 파일

| 파일 | 수정 내용 |
|------|----------|
| `src/services/local-search.ts:453` | topN → `documents.length` 전달 |
| `src/services/reranker.ts:51-59` | Fallback 점수 로직 개선 |

---

## 기존 계획과의 관계

이 계획은 **search-recency-enhancement.md** 완료 후 발견된 버그 수정입니다.
기존 Task 0-6 완료 상태에서 추가 수정 + 커밋/PR 생성을 진행합니다.
