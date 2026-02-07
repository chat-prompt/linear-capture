# Related Context 검색 성능 개선 계획

## TL;DR

> **Quick Summary**: 제목 텍스트를 그대로 검색할 때 결과가 잘 안 나오는 문제 해결. Linear `issueSearch` API를 활용하여 직접 검색 추가.
> 
> **Deliverables**:
> - LinearService에 `searchIssues()` 메서드 추가
> - `context.getRelated` IPC 핸들러에 Linear 검색 통합
> - 쿼리 전처리 (키워드 추출)
> 
> **Estimated Effort**: Medium (1-2시간)
> **Parallel Execution**: NO - 순차 의존성 있음 (1 → 2 → 3)

---

## Context

### 현재 문제
- AI 분석이 생성한 제목 텍스트를 그대로 검색 쿼리로 사용하면 검색 결과가 잘 안 나옴
- 예: "사용자 인증 오류 수정" → 관련 이슈 못 찾음

### 현재 구현
`context.getRelated` IPC 핸들러 (`src/main/index.ts:1137`):
1. Slack 키워드 검색 (`slackService.searchMessages`)
2. AI 추천 (`getAiRecommendations`)
3. Slack semantic 검색 (`semanticSearchService.search`)
4. Notion semantic 검색 (`semanticSearchService.search`)

**Linear 이슈 직접 검색이 없음** - 이것이 핵심 문제

### 기존 아키텍처 참고
- **Context Adapter 패턴** 존재: `src/services/context-adapters/`
  - `slack-adapter.ts` 구현됨
  - `notion`, `gmail`은 "not implemented" 상태
- **Debounce 패턴**: `src/renderer/index.html:3307`에 custom `debounce()` 함수 존재

### Linear API 조사 결과
Linear SDK에 `issueSearch` 메서드가 존재함:

```typescript
// @linear/sdk 사용법
const results = await this.client.issueSearch({
  query: "검색어",
  first: 20,
  orderBy: LinearDocument.PaginationOrderBy.UpdatedAt,
});
```

**GraphQL Query**:
```graphql
query IssueSearch($query: String!, $first: Int!) {
  issueSearch(query: $query, first: $first, orderBy: updatedAt) {
    nodes {
      id, identifier, title, description, url, createdAt
    }
  }
}
```

---

## TODOs

- [ ] 1. LinearService에 searchIssues() 메서드 추가

  **What to do**:
  - `src/services/linear-client.ts`에 `searchIssues()` 메서드 구현
  - Linear SDK의 `this.client.issueSearch()` 사용

  **Must NOT do**:
  - 새 파일 생성하지 않음 (기존 LinearService에 추가)
  - GraphQL raw query 사용하지 않음 (SDK 메서드 사용)

  **References**:
  - `src/services/linear-client.ts:88-130` - `createIssue()` 패턴 참고 (try-catch, 에러 처리)
  - `src/services/linear-client.ts:246-280` - `getCycles()` 패턴 참고 (SDK 호출 → 변환)

  **구현 예시**:
  ```typescript
  export interface IssueSearchResult {
    id: string;
    identifier: string;
    title: string;
    description?: string;
    url: string;
    createdAt: string;
  }

  /**
   * Search issues by query string using Linear's issueSearch API
   */
  async searchIssues(query: string, limit: number = 20): Promise<IssueSearchResult[]> {
    try {
      const results = await this.client.issueSearch({
        query,
        first: limit,
      });
      
      return results.nodes.map(issue => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description?.substring(0, 200),
        url: issue.url,
        createdAt: issue.createdAt?.toISOString() || '',
      }));
    } catch (error) {
      console.error('Failed to search issues:', error);
      return [];
    }
  }
  ```

  **Acceptance Criteria**:
  - [ ] `npm run build` 성공 (TypeScript 컴파일 에러 없음)
  - [ ] `IssueSearchResult` 인터페이스가 export 됨

  **Commit**: YES
  - Message: `feat(linear): add searchIssues method to LinearService`
  - Files: `src/services/linear-client.ts`

---

- [ ] 2. context.getRelated에 Linear 검색 추가

  **What to do**:
  - `src/main/index.ts`의 `context.getRelated` 핸들러 수정
  - 기존 4개 검색 소스에 Linear 검색 추가 (5번째)
  - `Promise.allSettled` 배열에 Linear 검색 추가

  **Must NOT do**:
  - 기존 검색 소스(Slack, AI, Notion) 제거하지 않음
  - 별도 IPC 핸들러 만들지 않음 (기존 핸들러에 통합)

  **References**:
  - `src/main/index.ts:1137-1212` - `context.getRelated` 핸들러 전체
  - `src/main/index.ts:1148-1162` - Slack 검색 패턴 (결과 변환 형식)
  - `src/main/index.ts:1164-1175` - AI 추천 패턴

  **구현 위치**: `Promise.allSettled([...])` 배열에 5번째 항목 추가

  ```typescript
  // src/main/index.ts:1146 부근, Promise.allSettled 배열에 추가
  (async () => {
    const linearService = createLinearServiceFromEnv();
    if (!linearService) return [];
    const issues = await linearService.searchIssues(query, Math.floor(limit / 3));
    return issues.map(issue => ({
      id: `linear-${issue.id}`,
      source: 'linear' as const,
      title: `${issue.identifier} ${issue.title}`,
      snippet: issue.description || '',
      url: issue.url,
      timestamp: issue.createdAt,
      raw: issue
    }));
  })(),
  ```

  **수정 필요 위치**:
  - `src/main/index.ts:1216-1217` - debug names 배열에 'linear' 추가

  **Acceptance Criteria**:
  - [ ] `npm run build` 성공
  - [ ] `npm run pack:clean` 후 앱 실행
  - [ ] DevTools Console에서 `context.getRelated` 호출 시 `linear: N results` 로그 확인

  **Commit**: YES
  - Message: `feat(context): integrate Linear issue search into getRelated`
  - Files: `src/main/index.ts`

---

- [ ] 3. 쿼리 전처리 함수 추가 (선택적 개선)

  **What to do**:
  - 긴 제목에서 핵심 키워드만 추출하는 헬퍼 함수 추가
  - 간단한 접근법: 앞 3-4 단어만 사용, 또는 불용어 제거

  **Must NOT do**:
  - 복잡한 형태소 분석 라이브러리 사용하지 않음 (의존성 증가)
  - 완벽한 키워드 추출 시도하지 않음 (단순하게)

  **구현 예시** (src/main/index.ts 또는 별도 유틸):
  ```typescript
  function extractKeywords(query: string): string {
    // 간단한 접근법: 앞 4단어만 사용
    const words = query.split(/\s+/).slice(0, 4);
    
    // 한글 조사 간단 제거 (완벽하지 않아도 됨)
    const cleaned = words.map(w => 
      w.replace(/[을를이가은는의에서으로]$/, '')
    );
    
    return cleaned.filter(w => w.length >= 2).join(' ');
  }
  ```

  **적용 위치**: Linear 검색 호출 전에 쿼리 전처리
  ```typescript
  const searchQuery = extractKeywords(query);
  const issues = await linearService.searchIssues(searchQuery, limit);
  ```

  **Acceptance Criteria**:
  - [ ] "사용자 인증 오류 수정" → "사용자 인증 오류" 또는 유사하게 단축됨
  - [ ] 영어 쿼리도 정상 작동

  **Commit**: YES
  - Message: `feat(context): add query preprocessing for better search results`
  - Files: `src/main/index.ts`

---

## Verification Strategy

### 테스트 방법 (Manual)

```bash
# 1. 빌드 및 앱 실행
npm run pack:clean

# 2. DevTools 열기 (View > Toggle Developer Tools)

# 3. 앱에서 스크린샷 캡처 후 AI 분석 실행

# 4. Console에서 검색 결과 확인
# - "linear: N results" 로그가 출력되어야 함
# - N > 0 이면 Linear 검색 성공
```

### 테스트 케이스

| 입력 쿼리 | 예상 결과 |
|----------|----------|
| "사용자 인증 오류" | Linear 이슈 1개 이상 반환 |
| "auth error" | Linear 이슈 1개 이상 반환 |
| "버그 수정" | Linear 이슈 반환 (있으면) |

---

## Success Criteria

- [ ] Linear 이슈가 Related Context 검색 결과에 포함됨
- [ ] DevTools에서 `linear: N results` 로그 확인 (N >= 0)
- [ ] 검색 응답 시간 2초 이내 (기존과 동일)
- [ ] 기존 Slack/Notion 검색 기능 정상 동작 (regression 없음)

---

## Notes

### 향후 개선 가능 (이번 스코프 아님)
- LinearAdapter를 Context Adapter 패턴으로 구현 (`src/services/context-adapters/linear-adapter.ts`)
- 검색 결과 캐싱
- 더 정교한 쿼리 전처리 (형태소 분석)

### 참고 파일 요약
| 파일 | 역할 |
|------|------|
| `src/services/linear-client.ts` | LinearService 클래스 (여기에 searchIssues 추가) |
| `src/main/index.ts:1137` | context.getRelated IPC 핸들러 |
| `src/renderer/index.html:3971` | 프론트엔드에서 IPC 호출하는 부분 |
