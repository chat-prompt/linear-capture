# Related Context Search Refactoring Plan

## TL;DR

> **Quick Summary**: `context.getRelated` 검색 로직을 리팩토링하여 소스별 균등 배분, 중복 검색 제거, Linear SDK 검색 추가, Notion 로컬 캐시 우선 적용
> 
> **Deliverables**:
> - Slack 중복 검색 제거 (API 1회만)
> - Linear SDK `issueSearch` 추가
> - Notion 로컬 캐시(notion-local-reader) 우선, API 폴백
> - 소스별 균등 quota 적용
> - 점수 기반 최종 정렬
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 4 → Task 5

---

## Context

### Original Request
관련 컨텍스트 추천에서 Slack이 압도적으로 많고 Gmail, Notion, Linear가 적은 문제 개선

### 현재 문제점 분석

**1. Slack 3중 검색**
```
slackResult          → Slack API 직접
semanticSlackResult  → Slack API + 시맨틱 재정렬
aiResult             → Worker 추천 (Slack 포함)
```
→ 같은 API를 2번 호출 + Worker에서도 Slack 검색

**2. Notion/Gmail은 시맨틱만**
- `semanticNotionResult`: Notion API → 시맨틱 재정렬
- `semanticGmailResult`: Gmail API → 시맨틱 재정렬
- 로컬 Notion 캐시(`notion-local-reader.ts`)가 있는데 미사용

**3. Linear 검색 없음**
- Linear SDK에 `issueSearch`, `searchIssues` API 존재
- 현재 코드에서 Linear 검색 로직 없음

**4. 정렬/균등 배분 없음**
- 순서대로 push → slice(0, 20)
- 앞쪽 소스(Slack)가 대부분 차지

### Research Findings

**Linear SDK 검색 API** (검증됨 - linear/linear 공식 레포):
```typescript
// @linear/sdk의 searchIssues 메서드 (공식 API)
const result = await client.searchIssues("search term");
// 반환: IssueSearchPayload
// 이슈 목록 접근: result.nodes (Issue[])

// 실제 사용 예시 (martinsione/linear-remote-mcp):
const issues = await client.searchIssues(args.query);
const issueList = issues.nodes;
```

**기존 notion-local-reader.ts**:
- `searchPages(query, limit)`: 제목 + 본문 검색
- `isNotionDbAvailable()`: 로컬 DB 존재 여부 확인 (export 함수)
- `getNotionLocalReader()`: 싱글톤 인스턴스 반환 (export 함수)
- 본문 검색 시 `matchContext` (스니펫) 제공
- 반환 타입: `LocalSearchResult { success, pages: LocalNotionPage[], source }`

---

## Work Objectives

### Core Objective
관련 컨텍스트 검색에서 소스별 균등한 결과 배분 및 검색 품질 향상

### Concrete Deliverables
1. `src/services/linear-client.ts` - `searchIssues()` 메서드 추가
2. `src/services/context-adapters/linear-adapter.ts` - 새 파일 생성
3. `src/services/context-adapters/notion-adapter.ts` - 로컬 캐시 우선 로직
4. `src/main/index.ts` - `context.getRelated` 핸들러 리팩토링

### Definition of Done
- [ ] `npm run build` 성공
- [ ] Linear 검색 결과가 관련 컨텍스트에 표시됨
- [ ] Notion 로컬 앱 사용자: 본문 내용까지 검색됨
- [ ] 각 소스별 최대 5개씩 균등 배분

### Must Have
- 소스별 quota (기본 5개)
- Linear SDK 검색 통합
- Notion 로컬 캐시 우선 + API 폴백
- 점수 기반 정렬

### Must NOT Have (Guardrails)
- Slack API 2중 호출 유지 ❌
- 시맨틱 재정렬 없이 결과 그대로 사용 (성능 우선)
- Worker 인덱싱 의존 (현재 인덱싱 안 됨)
- 100개 이상 결과 fetch

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after (기존 테스트 패턴 따름)
- **Framework**: vitest

### Agent-Executed QA Scenarios (MANDATORY)

**Task 완료 후 통합 테스트:**

```
Scenario: 빌드 성공 확인
  Tool: Bash
  Preconditions: None
  Steps:
    1. npm run build
    2. echo $? (exit code 확인)
  Expected Result: exit code 0
  Evidence: 빌드 로그

Scenario: Linear Adapter 등록 확인
  Tool: Bash
  Preconditions: 빌드 완료
  Steps:
    1. grep -n "case 'linear'" src/services/context-adapters/index.ts
    2. grep -n "LinearAdapter" src/services/context-adapters/index.ts
  Expected Result: 
    - case 'linear': 존재
    - LinearAdapter import 및 인스턴스화 존재
  Evidence: grep 출력

Scenario: Notion 로컬 캐시 로직 확인
  Tool: Bash
  Preconditions: 빌드 완료
  Steps:
    1. grep -n "isNotionDbAvailable" src/services/context-adapters/notion-adapter.ts
    2. grep -n "getNotionLocalReader" src/services/context-adapters/notion-adapter.ts
  Expected Result: 
    - isNotionDbAvailable() 조건문 존재
    - getNotionLocalReader() 호출 존재
  Evidence: grep 출력

Scenario: 시맨틱 중복 제거 확인
  Tool: Bash
  Preconditions: 빌드 완료
  Steps:
    1. grep -c "semanticSlackResult" src/main/index.ts
    2. grep -c "semanticNotionResult" src/main/index.ts
    3. grep -c "semanticGmailResult" src/main/index.ts
  Expected Result: 모두 0 (시맨틱 검색 변수 제거됨)
  Evidence: grep 카운트

Scenario: Quota 상수 확인
  Tool: Bash
  Preconditions: 빌드 완료
  Steps:
    1. grep -n "QUOTA_PER_SOURCE\|perSourceLimit" src/main/index.ts
  Expected Result: 소스별 제한 로직 존재
  Evidence: grep 출력
```

**앱 실행 후 수동 검증 (DevTools Console):**

```
Scenario: IPC context.getRelated 검증
  Tool: DevTools Console (수동)
  Preconditions: npm run pack:clean 완료, 앱 실행됨, DevTools 열기
  Steps:
    1. Console에서 실행:
       window.electronAPI.invoke('context.getRelated', { query: '테스트', limit: 20 })
         .then(r => {
           console.log('Total:', r.results?.length);
           const bySource = r.results?.reduce((a, i) => ({ ...a, [i.source]: (a[i.source]||0)+1 }), {});
           console.log('By source:', bySource);
           console.log('Debug:', r._debug);
         });
    2. 결과 확인
  Expected Result:
    - results 배열 존재
    - 각 소스별 ≤5개 (연결된 소스에 한해)
    - _debug에 linearResult 관련 로그 존재
  Evidence: Console 스크린샷 (.sisyphus/evidence/ipc-test.png)
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Linear SDK searchIssues 추가
├── Task 2: Notion Adapter 로컬 캐시 우선 로직
└── Task 3: Linear Adapter 생성

Wave 2 (After Wave 1):
└── Task 4: context.getRelated 리팩토링

Wave 3 (After Wave 2):
└── Task 5: 테스트 및 검증

Critical Path: Task 1 → Task 4 → Task 5
Parallel Speedup: ~40% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4 | 2 |
| 2 | None | 4 | 1, 3 |
| 3 | 1 | 4 | 2 |
| 4 | 1, 2, 3 | 5 | None |
| 5 | 4 | None | None (final) |

---

## TODOs

- [ ] 1. Linear SDK에 searchIssues 래퍼 메서드 추가

  **What to do**:
  - `src/services/linear-client.ts`의 `LinearService` 클래스에 `searchIssues(query, limit)` 메서드 추가
  - `@linear/sdk`의 `client.searchIssues(term)` 메서드 사용 (공식 API)
  - 반환: `IssueSearchPayload` → `.nodes`로 이슈 배열 접근
  
  **구현 예시**:
  ```typescript
  /**
   * Search issues by text query
   */
  async searchIssues(query: string, limit: number = 10): Promise<{
    success: boolean;
    issues: Array<{ id: string; identifier: string; title: string; url: string; description?: string }>;
  }> {
    try {
      const result = await this.client.searchIssues(query);
      const issues = result.nodes.slice(0, limit).map(issue => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        description: issue.description || undefined,
      }));
      return { success: true, issues };
    } catch (error) {
      console.error('Failed to search issues:', error);
      return { success: false, issues: [] };
    }
  }
  ```

  **Must NOT do**:
  - 복잡한 필터 옵션 추가 (단순 텍스트 검색만)
  - GraphQL 직접 쿼리 (SDK 메서드 사용)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 메시지 작성

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 3, 4
  - **Blocked By**: None

  **References**:
  - `src/services/linear-client.ts:79-136` - 기존 LinearService 클래스, createIssue 메서드 패턴 참고
  - **Linear SDK 공식 API**: `client.searchIssues(term: string)` → `IssueSearchPayload`
  - 검증 소스: `github.com/linear/linear/packages/sdk/src/_tests/_generated.test.ts:4826`
  - `src/types/context-search.ts:ContextItem` - Adapter에서 변환할 타입

  **Acceptance Criteria**:
  - [ ] `LinearService.searchIssues(query, limit)` 메서드 존재
  - [ ] `this.client.searchIssues(query)` 호출
  - [ ] 반환 타입: `Promise<{ success: boolean, issues: Array<...> }>`
  - [ ] `npm run build` 성공

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: searchIssues 메서드 빌드 확인
    Tool: Bash
    Steps:
      1. npm run build
      2. grep -n "async searchIssues" src/services/linear-client.ts
      3. grep -n "this.client.searchIssues" src/services/linear-client.ts
    Expected Result: 
      - 빌드 성공 (exit 0)
      - "async searchIssues" 메서드 정의 존재
      - "this.client.searchIssues" 호출 존재
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `feat(linear): add searchIssues method for issue text search`
  - Files: `src/services/linear-client.ts`

---

- [ ] 2. Notion Adapter에 로컬 캐시 우선 로직 추가

  **What to do**:
  - `src/services/context-adapters/notion-adapter.ts` 수정
  - **import 추가** (현재 누락됨):
    ```typescript
    import { isNotionDbAvailable, getNotionLocalReader, type LocalNotionPage } from '../notion-local-reader';
    ```
  - `fetchItems` 메서드 수정:
    1. `isNotionDbAvailable()` 체크 (동기 함수)
    2. 로컬 DB 있으면 `getNotionLocalReader().searchPages(query, limit)` 사용
    3. 없으면 기존 `this.notionService.searchPages()` (API 폴백)
  - 로컬 검색 결과를 `ContextItem`으로 변환하는 헬퍼 메서드 추가
  
  **구현 예시**:
  ```typescript
  async fetchItems(query?: string, limit = 20): Promise<ContextItem[]> {
    if (!query) return [];

    // 로컬 캐시 우선
    if (isNotionDbAvailable()) {
      const localReader = getNotionLocalReader();
      const localResult = await localReader.searchPages(query, limit);
      if (localResult.success && localResult.pages.length > 0) {
        console.log('[NotionAdapter] Using local cache');
        return localResult.pages.map(page => this.localPageToContextItem(page));
      }
    }

    // API 폴백
    const result = await this.notionService.searchPages(query, limit);
    if (!result.success || !result.pages) return [];
    return result.pages.map(page => this.toContextItem(page));
  }

  private localPageToContextItem(page: LocalNotionPage): ContextItem {
    return {
      id: page.id,
      content: page.matchContext || page.title,
      title: page.title,
      url: page.url,
      source: 'notion',
      timestamp: new Date(page.lastEditedTime).getTime(),
      metadata: { isContentMatch: page.isContentMatch || false, source: 'local' },
    };
  }
  ```

  **Must NOT do**:
  - 로컬과 API 결과 병합 (둘 중 하나만)
  - API 호출 시 로컬 재시도

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `src/services/context-adapters/notion-adapter.ts:1-41` - 현재 구현 (notion-client만 사용 중)
  - `src/services/notion-local-reader.ts:66-76` - `isNotionDbAvailable()` 함수 (동기, export)
  - `src/services/notion-local-reader.ts:536-541` - `getNotionLocalReader()` 싱글톤 (export)
  - `src/services/notion-local-reader.ts:213-263` - `searchPages(query, limit)` 메서드
  - `src/services/notion-local-reader.ts:17-28` - `LocalNotionPage` 인터페이스 (matchContext, isContentMatch 포함)

  **Acceptance Criteria**:
  - [ ] `import { isNotionDbAvailable, getNotionLocalReader } from '../notion-local-reader'` 추가됨
  - [ ] `fetchItems` 메서드에서 `isNotionDbAvailable()` 조건 분기
  - [ ] 로컬 DB 있으면 `getNotionLocalReader().searchPages()` 호출
  - [ ] 없으면 기존 `this.notionService.searchPages()` 호출 (폴백)
  - [ ] `npm run build` 성공

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: 로컬 캐시 import 및 조건문 확인
    Tool: Bash
    Steps:
      1. npm run build
      2. grep -n "isNotionDbAvailable" src/services/context-adapters/notion-adapter.ts
      3. grep -n "getNotionLocalReader" src/services/context-adapters/notion-adapter.ts
      4. grep -n "notion-local-reader" src/services/context-adapters/notion-adapter.ts
    Expected Result: 
      - 빌드 성공 (exit 0)
      - isNotionDbAvailable 호출 존재
      - getNotionLocalReader import 및 호출 존재
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `feat(notion): prioritize local cache over API for full-text search`
  - Files: `src/services/context-adapters/notion-adapter.ts`

---

- [ ] 3. Linear Adapter 생성

  **What to do**:
  - `src/services/context-adapters/linear-adapter.ts` 새 파일 생성
  - `ContextAdapter` 인터페이스 구현
  - `fetchItems(query, limit)`: Task 1의 `searchIssues` 사용
  - `src/services/context-adapters/index.ts`에 등록

  **Must NOT do**:
  - 복잡한 필터 로직
  - 캐싱 (Linear는 항상 실시간)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:
  - `src/services/context-adapters/slack-adapter.ts` - 패턴 참고
  - `src/services/context-adapters/index.ts` - 등록 위치
  - `src/types/context-search.ts:ContextAdapter` - 인터페이스
  - `src/services/linear-client.ts:searchIssues` - Task 1에서 추가

  **Acceptance Criteria**:
  - [ ] `LinearAdapter` 클래스 생성
  - [ ] `ContextAdapter` 인터페이스 구현
  - [ ] `index.ts`에서 `getAdapter('linear')` 동작
  - [ ] `npm run build` 성공

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Linear Adapter 등록 확인
    Tool: Bash
    Steps:
      1. npm run build
      2. grep "linear" src/services/context-adapters/index.ts
    Expected Result: case 'linear': return new LinearAdapter() 존재
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `feat(context): add LinearAdapter for issue search`
  - Files: `src/services/context-adapters/linear-adapter.ts`, `src/services/context-adapters/index.ts`

---

- [ ] 4. context.getRelated 핸들러 리팩토링

  **What to do**:
  - `src/main/index.ts`의 `context.getRelated` 핸들러 수정 (line 1148-1287)
  - **변경 사항**:
    1. Slack 중복 검색 제거: `slackResult` + `semanticSlackResult` → `slackResult`만 유지
    2. `semanticNotionResult`, `semanticGmailResult` 제거 (Adapter의 fetchItems만 사용)
    3. `aiResult` 제거 (Worker 인덱싱 미완성)
    4. Linear 검색 추가: `linearConnected` 체크 + `getAdapter('linear').fetchItems()`
    5. 소스별 quota 적용 (기존 `perSourceLimit` 유지 또는 `QUOTA_PER_SOURCE = 5` 상수화)

  **새 로직 구조**:
  ```typescript
  const QUOTA_PER_SOURCE = 5;
  
  // Linear 연결 상태 체크 추가
  const linearService = createLinearServiceFromEnv();
  const linearConnected = !!linearService;  // 토큰 존재 여부로 판단
  
  const [slackResult, notionResult, gmailResult, linearResult] = await Promise.allSettled([
    // Slack: 직접 API만 (시맨틱 제거)
    slackConnected ? (async () => {
      const result = await slackService.searchMessages(query, undefined, QUOTA_PER_SOURCE);
      return (result.messages || []).map(m => ({
        id: `slack-${m.ts}`,
        source: 'slack' as const,
        title: `#${m.channel?.name || 'unknown'}`,
        snippet: m.text?.substring(0, 200) || '',
        url: m.permalink,
        timestamp: m.timestamp,
      }));
    })() : Promise.resolve([]),
    
    // Notion: Adapter 사용 (로컬 캐시 우선 로직 포함)
    notionConnected ? getAdapter('notion').fetchItems(query, QUOTA_PER_SOURCE) : Promise.resolve([]),
    
    // Gmail: Adapter 사용
    gmailConnected ? getAdapter('gmail').fetchItems(query, QUOTA_PER_SOURCE) : Promise.resolve([]),
    
    // Linear: 새로 추가
    linearConnected ? getAdapter('linear').fetchItems(query, QUOTA_PER_SOURCE) : Promise.resolve([]),
  ]);
  
  // 결과 병합 후 score/confidence 정렬
  const results: any[] = [];
  [slackResult, notionResult, gmailResult, linearResult].forEach((r, i) => {
    const names = ['slack', 'notion', 'gmail', 'linear'];
    if (r.status === 'fulfilled') {
      results.push(...r.value.map(item => ({ ...item, source: names[i] })));
      debug.push(`${names[i]}: ${r.value.length} results`);
    }
  });
  
  // 중복 제거 + 정렬
  const seen = new Set<string>();
  const deduplicated = results.filter(r => {
    if (!r.url) return true;
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
  
  const sorted = deduplicated.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  ```

  **제거할 코드**:
  - `semanticSlackResult` 관련 전체 (line ~1201-1217)
  - `semanticNotionResult` 관련 전체 (line ~1219-1235)
  - `semanticGmailResult` 관련 전체 (line ~1237-1253)
  - `aiResult` 관련 전체 (line ~1188-1199)
  - `getSemanticSearchService()` 호출

  **Must NOT do**:
  - 시맨틱 재정렬 유지 (성능 우선, 제거)
  - AI 추천 호출 유지 (Worker 미완성, 제거)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - 핵심 로직 변경으로 신중한 작업 필요
    - 기존 코드 대폭 수정

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `src/main/index.ts:1148-1287` - 현재 context.getRelated 핸들러
  - `src/main/index.ts:1172-1254` - 제거 대상: Promise.allSettled 내 시맨틱/AI 검색
  - `src/services/context-adapters/index.ts:8-29` - getAdapter 팩토리 (linear case 추가됨)
  - `src/services/linear-client.ts:324-334` - createLinearServiceFromEnv() (연결 체크용)

  **Acceptance Criteria**:
  - [ ] `semanticSlackResult`, `semanticNotionResult`, `semanticGmailResult` 변수 제거됨
  - [ ] `aiResult` 변수 제거됨
  - [ ] `linearResult` 추가됨
  - [ ] 각 소스별 `QUOTA_PER_SOURCE` 또는 동적 limit 적용
  - [ ] `getSemanticSearchService()` 호출 제거됨
  - [ ] `npm run build` 성공

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: 시맨틱 검색 제거 확인
    Tool: Bash
    Steps:
      1. npm run build
      2. grep -c "semanticSlackResult" src/main/index.ts
      3. grep -c "semanticNotionResult" src/main/index.ts
      4. grep -c "semanticGmailResult" src/main/index.ts
      5. grep -c "getSemanticSearchService" src/main/index.ts
    Expected Result: 모두 0
    Evidence: grep 카운트

  Scenario: AI 추천 제거 확인
    Tool: Bash
    Steps:
      1. grep -c "aiResult" src/main/index.ts
      2. grep -c "getAiRecommendations" src/main/index.ts
    Expected Result: 0 또는 크게 감소
    Evidence: grep 카운트

  Scenario: Linear 검색 추가 확인
    Tool: Bash
    Steps:
      1. grep -n "linearResult" src/main/index.ts
      2. grep -n "getAdapter.*linear" src/main/index.ts
    Expected Result: linearResult 변수 및 getAdapter('linear') 호출 존재
    Evidence: grep 출력

  Scenario: 소스 균등 배분 확인
    Tool: Bash
    Steps:
      1. grep -n "QUOTA_PER_SOURCE\|perSourceLimit" src/main/index.ts
    Expected Result: 상수 또는 limit 변수 존재
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `refactor(context): remove semantic search, add Linear, enforce per-source quota`
  - Files: `src/main/index.ts`

---

- [ ] 5. 통합 테스트 및 검증

  **What to do**:
  - `npm run pack:clean`으로 앱 빌드
  - 실제 앱에서 검색 테스트
  - 각 소스별 결과 확인
  - **DevTools Console에서 IPC 직접 호출로 검증** (Electron 앱)

  **Must NOT do**:
  - `npm start` 사용 (권한 문제)
  - 단위 테스트만으로 종료

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - Electron 앱은 Playwright 직접 사용 불가, DevTools Console 검증 필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:
  - `CLAUDE.md:테스트 원칙` - pack:clean 필수 사용
  - `package.json:scripts` - 빌드 명령어
  - `src/renderer/index.html` - preload에서 ipcRenderer 노출

  **Acceptance Criteria**:
  - [ ] `npm run pack:clean` 성공
  - [ ] 앱 실행 후 캡처 윈도우 열림
  - [ ] 검색 시 Linear 소스 결과 표시
  - [ ] 검색 시 Notion 결과 표시 (로컬 또는 API)
  - [ ] Slack 결과가 전체의 50% 이하

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: 빌드 및 앱 실행 확인
    Tool: Bash
    Preconditions: None
    Steps:
      1. npm run pack:clean
      2. 앱이 자동 실행됨 (pack:clean에 포함)
      3. ps aux | grep -i "Linear Capture" | grep -v grep
    Expected Result:
      - 빌드 성공 (exit 0)
      - "Linear Capture" 프로세스 존재
    Evidence: ps 출력

  Scenario: IPC 핸들러 검증 (콘솔에서 직접 호출)
    Tool: Bash + Manual (DevTools Console)
    Preconditions: 앱 실행됨, DevTools 열기 (View > Toggle Developer Tools)
    Steps:
      1. DevTools Console에서 다음 실행:
         ```javascript
         // context.getRelated IPC 호출
         window.electronAPI.invoke('context.getRelated', { query: '테스트', limit: 20 })
           .then(r => console.log(JSON.stringify(r, null, 2)))
         ```
      2. 결과 JSON 확인
      3. 소스별 카운트 확인:
         ```javascript
         const r = await window.electronAPI.invoke('context.getRelated', { query: '테스트', limit: 20 });
         const bySource = r.results.reduce((acc, item) => {
           acc[item.source] = (acc[item.source] || 0) + 1;
           return acc;
         }, {});
         console.log('By source:', bySource);
         ```
    Expected Result:
      - results 배열에 source='linear' 아이템 존재 (Linear 연결 시)
      - 각 소스별 ≤5개
      - _debug 배열에 "linearResult" 관련 로그 존재
    Evidence: Console 출력 스크린샷 (.sisyphus/evidence/ipc-test-results.png)

  Scenario: Linear 검색 결과 유무 확인
    Tool: Bash
    Preconditions: 빌드 완료
    Steps:
      1. 앱 메인 프로세스 로그 확인 (터미널에서)
      2. 검색 실행 후 "linearResult" 또는 "linear:" 로그 확인
    Expected Result: Linear 검색 시도 로그 존재
    Evidence: 터미널 로그

  Scenario: Notion 로컬 캐시 사용 확인
    Tool: Bash
    Preconditions: Notion.app 설치됨, 로컬 DB 존재
    Steps:
      1. ls -la ~/Library/Application\ Support/Notion/notion.db
      2. 앱 콘솔에서 "[NotionAdapter] Using local cache" 또는 "[NotionLocalReader]" 로그 확인
    Expected Result: 
      - notion.db 파일 존재
      - 로컬 캐시 사용 로그 표시 (로컬 DB 있는 경우)
    Evidence: 콘솔 로그
  ```

  **Commit**: NO (테스트만)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(linear): add searchIssues method for issue text search` | `src/services/linear-client.ts` | `npm run build && grep "async searchIssues" src/services/linear-client.ts` |
| 2 | `feat(notion): prioritize local cache over API for full-text search` | `src/services/context-adapters/notion-adapter.ts` | `npm run build && grep "isNotionDbAvailable" src/services/context-adapters/notion-adapter.ts` |
| 3 | `feat(context): add LinearAdapter for issue search` | `src/services/context-adapters/linear-adapter.ts`, `src/services/context-adapters/index.ts` | `npm run build && grep "linear" src/services/context-adapters/index.ts` |
| 4 | `refactor(context): remove semantic search, add Linear, enforce per-source quota` | `src/main/index.ts` | `npm run build && grep -c "semanticSlackResult" src/main/index.ts` (expect 0) |

---

## Success Criteria

### Verification Commands
```bash
# 빌드 확인
npm run build

# 앱 테스트
npm run pack:clean

# Linear Adapter 등록 확인
grep -n "linear" src/services/context-adapters/index.ts

# Notion 로컬 캐시 로직 확인
grep -n "isNotionDbAvailable" src/services/context-adapters/notion-adapter.ts

# 시맨틱 중복 제거 확인
grep -c "semanticSlackResult" src/main/index.ts  # Expected: 0
```

### Final Checklist
- [ ] Slack 검색 1회만 (중복 제거됨)
- [ ] Linear 검색 결과 표시됨
- [ ] Notion 로컬 캐시 우선 사용됨
- [ ] 소스별 최대 5개 quota 적용됨
- [ ] 점수 기반 정렬됨
- [ ] 빌드 성공
- [ ] 앱 정상 동작

---

## Notes

### 검증된 API 정보 (2025-02-04)

**Linear SDK `searchIssues`**:
- 검증 소스: `github.com/linear/linear/packages/sdk/src/_tests/_generated.test.ts:4826`
- API: `client.searchIssues(term: string)` → `IssueSearchPayload`
- 이슈 목록: `result.nodes` (Issue[])
- 참고 구현: `github.com/martinsione/linear-remote-mcp/src/mcp/tools/issue.ts:105`

**Notion Local Reader**:
- DB 경로: `~/Library/Application Support/Notion/notion.db` (macOS)
- 검증 함수: `isNotionDbAvailable()` - 동기, boolean 반환
- 싱글톤: `getNotionLocalReader()` - `NotionLocalReader` 인스턴스
- 검색 메서드: `searchPages(query, limit)` → `LocalSearchResult`

### 향후 개선 가능 사항 (이번 스코프 외)
- Worker 인덱싱 파이프라인 구축 (벡터 검색 품질 향상)
- Gmail 로컬 캐시 (IMAP 또는 로컬 클라이언트)
- 점수 정규화 (서로 다른 소스의 점수 체계 통일)
- Linear 검색에 팀/프로젝트 필터 추가

### 계획서 개선 이력
- **v1.1 (2025-02-04)**: Linear SDK API 검증 (`searchIssues`), Notion Adapter 참조 수정 (import 명시), QA 시나리오 구체화 (Electron DevTools Console 검증)
