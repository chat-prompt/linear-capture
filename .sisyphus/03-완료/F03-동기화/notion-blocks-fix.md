# Notion 본문 가져오기 수정

## TL;DR

> **Quick Summary**: Notion 페이지의 중첩된 블록과 페이지네이션을 처리하여 실제 본문 내용을 가져올 수 있도록 Worker의 `blocks.ts`를 재작성
> 
> **Deliverables**:
> - `blocks.ts` 재작성 (재귀 + 페이지네이션 + Rate Limit 처리)
> - 테스트 페이지로 검증
> 
> **Estimated Effort**: Medium (2-3시간)
> **Parallel Execution**: NO - 순차적
> **Critical Path**: 페이지네이션 → 재귀 → Rate Limit → 테스트

---

## Context

### Original Request
Notion 연동까지는 성공했는데 계속 본문을 못 가져옴 - `success: true`이지만 content가 비어있음

### Interview Summary
**Key Discussions**:
- 재귀 깊이: 3레벨로 제한
- Rate Limit: 재시도 + Retry-After 대기
- 콘텐츠 길이: 2000자 유지
- 예산 소진 시: 부분 결과 반환 + truncated: true

**Research Findings**:
- Notion API `blocks.children.list`는 1레벨 자식만 반환
- `has_children: true`인 블록은 재귀 호출 필요
- Rate limit: 평균 3 req/sec, 429 시 Retry-After 헤더 확인
- Cloudflare Worker 서브리퀘스트 한도: 50개/요청

### Metis Review
**Identified Gaps** (addressed):
- 서브리퀘스트 예산 관리 → 최대 40개 API 호출로 제한
- 순환 참조 방지 → 방문한 block ID 추적
- 부분 결과 처리 → truncated 플래그로 표시

---

## Work Objectives

### Core Objective
Notion 페이지의 모든 텍스트 콘텐츠를 중첩 구조와 상관없이 올바르게 가져오기

### Concrete Deliverables
- `/Users/wine_ny/side-project/linear_project/linear-capture-worker/src/notion/blocks.ts` 수정

### Definition of Done
- [ ] 테스트 페이지 `17e9981dde4080708657eb90fa800062`에서 content가 비어있지 않음
- [ ] Worker 배포 후 정상 동작

### Must Have
- 페이지네이션 처리 (`has_more` + `next_cursor`)
- 재귀적 블록 가져오기 (depth 3까지)
- Rate Limit 429 재시도 (최대 3회)
- 서브리퀘스트 예산 관리 (40개 제한)
- 순환 참조 방지

### Must NOT Have (Guardrails)
- 응답 스키마 변경 금지 (`success`, `pageId`, `content`, `blockCount`, `truncated` 유지)
- 이미지/파일/임베드 등 비텍스트 블록 처리 금지
- 캐싱 기능 추가 금지
- `handleNotionBlocks` 함수 시그니처 변경 금지
- depth를 query param으로 받지 않음 (하드코딩 3)
- oauth.ts 등 다른 파일 수정 금지

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (Worker 프로젝트에 테스트 없음)
- **User wants tests**: Manual-only
- **Framework**: none

### Automated Verification (curl 명령어)

각 TODO 완료 후 아래 명령어로 검증:

```bash
# 테스트 페이지 ID
TEST_PAGE_ID="17e9981dde4080708657eb90fa800062"
DEVICE_ID="test-device"

# 기본 검증: content가 비어있지 않음
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/blocks?device_id=${DEVICE_ID}&page_id=${TEST_PAGE_ID}" | jq '.content | length > 0'
# Assert: true

# 응답 스키마 검증
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/blocks?device_id=${DEVICE_ID}&page_id=${TEST_PAGE_ID}" | jq 'keys'
# Assert: ["blockCount", "content", "pageId", "success", "truncated"]
```

---

## Execution Strategy

### Sequential Execution (의존성 있음)

```
Task 1: 페이지네이션 추가
    ↓
Task 2: 재귀 블록 가져오기 + 예산 관리
    ↓
Task 3: Rate Limit 재시도 로직
    ↓
Task 4: Worker 배포 및 검증
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | None | 2 |
| 2 | 1 | 3 |
| 3 | 2 | 4 |
| 4 | 3 | None |

---

## TODOs

- [ ] 1. 페이지네이션 추가

  **What to do**:
  - `fetchAllBlocks()` 헬퍼 함수 생성
  - `has_more`와 `next_cursor`를 체크하여 모든 블록 가져오기
  - 최대 100개씩 가져오는 루프 구현

  **Must NOT do**:
  - 재귀는 이 단계에서 구현하지 않음 (다음 태스크)
  - 기존 응답 스키마 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일, 명확한 로직 추가
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `blocks.ts:131-168` - 현재 단일 fetch 로직 (이 부분을 루프로 변경)
  - `blocks.ts:44-49` - `NotionBlocksResponse` 인터페이스 (has_more, next_cursor 이미 정의됨)

  **Acceptance Criteria**:
  ```bash
  # 페이지네이션이 동작하는지 확인 (100개 이상 블록이 있는 페이지 필요)
  # 일단 기본 동작 확인
  curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/blocks?device_id=test&page_id=17e9981dde4080708657eb90fa800062" | jq '.success'
  # Assert: true
  ```

  **Commit**: YES
  - Message: `feat(notion): add pagination for blocks.children.list`
  - Files: `src/notion/blocks.ts`

---

- [ ] 2. 재귀 블록 가져오기 + 예산 관리

  **What to do**:
  - `fetchBlocksRecursively()` 함수 구현
  - `has_children: true`인 블록의 하위 블록 재귀 호출
  - depth 파라미터로 최대 3레벨 제한
  - 서브리퀘스트 카운터 추가 (최대 40개)
  - 방문한 block ID Set으로 순환 참조 방지
  - 예산 소진 시 즉시 중단하고 `truncated: true` 반환

  **Must NOT do**:
  - depth를 외부에서 받지 않음 (하드코딩)
  - 40개 초과 API 호출 금지
  - 비텍스트 블록(image, file, embed) 처리 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 재귀 로직과 예산 관리가 복잡함
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `blocks.ts:57-97` - `extractBlockText()` 함수 (재사용)
  - `blocks.ts:11-23` - `TEXT_BLOCK_TYPES` 배열 (toggle, callout 등 has_children 가능한 타입)
  - Notion API 문서: `has_children` 필드는 각 block 객체에 포함됨

  **Acceptance Criteria**:
  ```bash
  # 테스트 페이지에서 중첩 콘텐츠가 포함되는지 확인
  curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/blocks?device_id=test&page_id=17e9981dde4080708657eb90fa800062" | jq '.content | length'
  # Assert: > 0 (비어있지 않음)
  
  # blockCount가 이전보다 증가했는지 확인
  curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/blocks?device_id=test&page_id=17e9981dde4080708657eb90fa800062" | jq '.blockCount'
  # Assert: > 0
  ```

  **Commit**: YES
  - Message: `feat(notion): add recursive block fetching with budget limit`
  - Files: `src/notion/blocks.ts`

---

- [ ] 3. Rate Limit 재시도 로직

  **What to do**:
  - 429 응답 시 `Retry-After` 헤더 확인
  - 지수 백오프로 최대 3회 재시도
  - 재시도 실패 시 부분 결과 반환 (에러 아님)

  **Must NOT do**:
  - 429 외의 에러에 재시도 금지 (401, 404 등은 즉시 실패)
  - 무한 재시도 금지 (최대 3회)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단순한 재시도 로직 추가
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `blocks.ts:141-166` - 현재 에러 처리 로직 (여기에 429 처리 추가)
  - Notion API: 429 응답 시 `Retry-After` 헤더 (초 단위)

  **Acceptance Criteria**:
  ```bash
  # Rate limit 상황을 직접 테스트하기 어려우므로 코드 리뷰로 확인
  # 기본 동작이 깨지지 않았는지 확인
  curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/blocks?device_id=test&page_id=17e9981dde4080708657eb90fa800062" | jq '.success'
  # Assert: true
  ```

  **Commit**: YES
  - Message: `feat(notion): add rate limit retry with exponential backoff`
  - Files: `src/notion/blocks.ts`

---

- [ ] 4. Worker 배포 및 최종 검증

  **What to do**:
  - `wrangler deploy` 실행
  - 테스트 페이지로 최종 검증
  - 응답 스키마 검증

  **Must NOT do**:
  - 배포 실패 시 강제 배포 금지
  - 프로덕션 환경에서 디버그 로그 남기지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 배포 명령어 실행
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Final)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:
  - Worker 프로젝트 위치: `/Users/wine_ny/side-project/linear_project/linear-capture-worker`
  - 배포 명령어: `wrangler deploy` 또는 `npm run deploy`

  **Acceptance Criteria**:
  ```bash
  # 배포 후 최종 검증
  curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/blocks?device_id=test&page_id=17e9981dde4080708657eb90fa800062" | jq '.'
  # Assert: success=true, content 비어있지 않음
  
  # 응답 스키마 검증
  curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/blocks?device_id=test&page_id=17e9981dde4080708657eb90fa800062" | jq 'keys | sort'
  # Assert: ["blockCount", "content", "pageId", "success", "truncated"]
  ```

  **Commit**: NO (배포만)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(notion): add pagination for blocks.children.list` | blocks.ts | 로컬 테스트 |
| 2 | `feat(notion): add recursive block fetching with budget limit` | blocks.ts | 로컬 테스트 |
| 3 | `feat(notion): add rate limit retry with exponential backoff` | blocks.ts | 로컬 테스트 |
| 4 | (배포만) | - | curl 검증 |

---

## Success Criteria

### Verification Commands
```bash
# 최종 검증
TEST_PAGE_ID="17e9981dde4080708657eb90fa800062"

curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/blocks?device_id=test&page_id=${TEST_PAGE_ID}" | jq '{
  success: .success,
  hasContent: (.content | length > 0),
  blockCount: .blockCount,
  truncated: .truncated
}'

# Expected:
# {
#   "success": true,
#   "hasContent": true,
#   "blockCount": > 0,
#   "truncated": false (or true if large page)
# }
```

### Final Checklist
- [ ] content가 비어있지 않음
- [ ] 응답 스키마 변경 없음
- [ ] 중첩 블록 내용이 포함됨
- [ ] Worker 배포 성공
