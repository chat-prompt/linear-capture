# Linear 검색 디버깅 계획

## TL;DR

> **Quick Summary**: Linear issueSearch API 통합 후 0 results 문제 + 앱 초기화 에러 해결
> 
> **Deliverables**:
> - 디버그 로그 제거하여 앱 정상 실행
> - Linear API 검색 기능 동작 확인
> - 에러 처리 개선
> 
> **Estimated Effort**: Quick (30분-1시간)
> **Parallel Execution**: NO - 순차적 디버깅 필요
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
Linear issueSearch API를 `context.getRelated` 핸들러에 통합했으나:
1. `linear: 0 results` - 검색 결과 없음
2. 앱 실행 시 `Error: write EPIPE` / `Cannot create BrowserWindow before app is ready` 에러

### 현재 브랜치
```
feature/improve-context-search
```

### 변경된 파일
- `src/services/linear-client.ts:332-353` - `searchIssues()` 메서드 추가 (디버그 로그 포함)
- `src/main/index.ts:1137-1250` - `context.getRelated` 핸들러에 Linear 검색 통합

---

## Work Objectives

### Core Objective
Linear 검색이 실제로 결과를 반환하도록 수정하고, 앱이 에러 없이 실행되도록 함

### Concrete Deliverables
- 디버그 로그 제거된 `linear-client.ts`
- 디버그 로그 제거된 `index.ts`
- Linear API 검색 동작 확인

### Definition of Done
- [ ] `npm run pack:clean` 실행 시 에러 없이 앱 시작
- [ ] 이슈 생성 폼에서 연관 컨텍스트에 Linear 이슈 표시됨

### Must Have
- Linear API 토큰 유효성 확인
- issueSearch API 정상 호출
- 에러 발생 시 graceful degradation (빈 배열 반환)

### Must NOT Have (Guardrails)
- console.log 디버그 로그 남기지 않음 (production 코드)
- API 에러 시 앱 크래시 유발하지 않음
- 기존 Slack/Notion 검색 로직 변경하지 않음

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (단위 테스트 없음)
- **User wants tests**: NO (수동 검증)
- **QA approach**: Manual verification

### Manual Verification Procedures
1. **앱 실행 테스트**: `npm run pack:clean` → 에러 없이 시작 확인
2. **Linear 검색 테스트**: 이슈 생성 시 연관 컨텍스트에서 Linear 결과 확인
3. **API 직접 테스트**: 별도 스크립트로 issueSearch API 호출

---

## TODOs

- [ ] 1. 디버그 로그 제거

  **What to do**:
  - `src/services/linear-client.ts:334,339,350` 디버그 console.log 제거
  - `src/main/index.ts:1216,1225,1226,1228` 디버그 console.log 제거

  **Must NOT do**:
  - console.error (에러 로깅)는 유지
  - 기존 로직 변경하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - 단순 라인 삭제 작업으로 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **References**:
  - `src/services/linear-client.ts:334` - `console.log('[LinearService.searchIssues] Calling API...')`
  - `src/services/linear-client.ts:339` - `console.log('[LinearService.searchIssues] API returned...')`
  - `src/services/linear-client.ts:350` - `console.error('[LinearService.searchIssues] API error:')`  ← 이건 유지
  - `src/main/index.ts:1216` - `console.log('[LinearSearch] No linear service...')`
  - `src/main/index.ts:1225-1226` - `console.log('[LinearSearch] Original/Preprocessed query...')`
  - `src/main/index.ts:1228` - `console.log('[LinearSearch] Found N issues')`

  **Acceptance Criteria**:
  ```bash
  # Agent 실행:
  grep -c "console.log.*\[Linear" src/services/linear-client.ts src/main/index.ts
  # Expected: 0 (모든 디버그 로그 제거됨)
  
  grep -c "console.error" src/services/linear-client.ts
  # Expected: 1+ (에러 로깅은 유지)
  ```

  **Commit**: YES
  - Message: `chore: remove debug logs from linear search`
  - Files: `src/services/linear-client.ts`, `src/main/index.ts`

---

- [ ] 2. 앱 실행 테스트

  **What to do**:
  - `npm run pack:clean` 실행하여 앱 빌드 및 시작
  - 에러 없이 앱이 시작되는지 확인
  - 이슈 생성 폼 열어서 기본 기능 동작 확인

  **Must NOT do**:
  - 코드 수정 (이 단계에서는 검증만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - 빌드 및 실행 확인 작업

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `CLAUDE.md:테스트 원칙` - `npm run pack:clean` 사용 필수

  **Acceptance Criteria**:
  ```bash
  # Agent 실행:
  npm run pack:clean
  
  # Expected:
  # 1. 빌드 성공 (exit code 0)
  # 2. 앱이 자동 실행됨
  # 3. "Cannot create BrowserWindow" 에러 없음
  # 4. "Error: write EPIPE" 에러 없음
  ```

  **Commit**: NO

---

- [ ] 3. Linear API 직접 테스트

  **What to do**:
  - 별도 스크립트로 Linear issueSearch API 직접 호출
  - API가 실제로 결과를 반환하는지 확인
  - 결과가 0이면 원인 파악 (토큰 문제? 검색어 문제? 이슈 없음?)

  **Must NOT do**:
  - 앱 코드 수정 (진단 목적)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - API 테스트 스크립트 실행

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 4 (있을 경우)
  - **Blocked By**: Task 2

  **References**:
  - `src/services/linear-client.ts:332-353` - `searchIssues()` 구현
  - Linear SDK docs: https://developers.linear.app/docs/sdk/overview

  **Acceptance Criteria**:
  ```bash
  # Agent 실행 (프로젝트 루트에서):
  # 1. .env 파일에서 LINEAR_API_TOKEN 확인
  grep LINEAR_API_TOKEN .env
  # Expected: LINEAR_API_TOKEN=lin_api_xxxxx (값 존재)
  
  # 2. API 테스트 스크립트 실행
  npx ts-node -e "
  import { LinearClient } from '@linear/sdk';
  import * as dotenv from 'dotenv';
  dotenv.config();
  
  const client = new LinearClient({ apiKey: process.env.LINEAR_API_TOKEN });
  
  async function test() {
    try {
      // 먼저 토큰 유효성 확인
      const viewer = await client.viewer;
      console.log('Token valid. User:', viewer.name);
      
      // 검색 테스트
      const results = await client.issueSearch('test');
      console.log('Search results:', results.nodes.length);
      results.nodes.slice(0, 3).forEach(issue => {
        console.log('-', issue.identifier, issue.title);
      });
    } catch (e) {
      console.error('Error:', e);
    }
  }
  test();
  "
  
  # Expected:
  # - Token valid. User: [사용자명]
  # - Search results: N (N > 0 이면 성공, N = 0 이면 해당 워크스페이스에 'test' 관련 이슈 없음)
  ```

  **Commit**: NO

---

- [ ] 4. (조건부) 에러 원인에 따른 수정

  **What to do**:
  - Task 3 결과에 따라 수정 방향 결정:
    - **토큰 무효**: 사용자에게 토큰 재설정 안내
    - **검색어 문제**: `extractKeywords()` 로직 개선
    - **API 에러**: 에러 핸들링 개선
    - **결과 0개 (정상)**: 검색어와 매칭되는 이슈가 없는 것 → 수정 불필요

  **Must NOT do**:
  - Task 3 진행 전 미리 수정하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick` 또는 `unspecified-low`
  - **Skills**: []
    - 원인에 따라 다름

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None (최종)
  - **Blocked By**: Task 3

  **References**:
  - `src/main/index.ts:1219-1223` - `extractKeywords()` 함수
  - `src/services/linear-client.ts:349-352` - 에러 핸들링

  **Acceptance Criteria**:
  - Task 3 결과에 따라 동적으로 결정

  **Commit**: 수정이 있을 경우 YES
  - Message: `fix: [원인에 따라 결정]`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `chore: remove debug logs from linear search` | linear-client.ts, index.ts | grep 확인 |
| 4 | (조건부) `fix: ...` | 원인에 따라 결정 | npm run pack:clean |

---

## Success Criteria

### Verification Commands
```bash
# 1. 디버그 로그 제거 확인
grep -c "console.log.*\[Linear" src/services/linear-client.ts src/main/index.ts
# Expected: 0

# 2. 앱 정상 실행
npm run pack:clean
# Expected: 에러 없이 앱 시작

# 3. Linear 검색 동작 (DevTools Console에서)
# context.getRelated 호출 후 _debug 배열에 "linear: N results" (N >= 0)
```

### Final Checklist
- [ ] 디버그 로그 모두 제거됨
- [ ] 앱이 에러 없이 시작됨
- [ ] Linear API 호출이 에러 없이 실행됨
- [ ] 검색 결과가 있으면 UI에 표시됨

---

## Rollback

### 조건
- 수정 후에도 앱이 시작되지 않을 경우
- Linear 검색이 전체 앱 기능에 영향을 줄 경우

### 방법
```bash
git checkout master -- src/services/linear-client.ts src/main/index.ts
git branch -D feature/improve-context-search
```
