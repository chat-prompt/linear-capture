# Notion/Gmail AI 추천 검색 통합

## TL;DR

> **Quick Summary**: Notion과 Gmail을 AI 자동 추천 검색에 통합. 기존 SlackAdapter 패턴을 따라 NotionAdapter, GmailAdapter를 구현하고, context-search 핸들러에 연결된 서비스만 동적 분배하는 로직 추가.
> 
> **Deliverables**:
> - `src/services/context-adapters/notion-adapter.ts` (신규)
> - `src/services/context-adapters/gmail-adapter.ts` (신규)
> - `src/services/context-adapters/index.ts` (수정)
> - `src/main/index.ts` context-search 핸들러 (수정)
> - `src/__tests__/context-adapters.test.ts` (신규)
> 
> **Estimated Effort**: Short (~2시간)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1, 2 (병렬) → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
> notion/gmail도 ai 추천에 걸리도록 계획을 세워줄래?

### Interview Summary
**Key Discussions**:
- 우선순위: 둘 다 같이 구현
- 결과 비중: 연결된 서비스만 동적 분배 (연결 안 된 서비스는 제외하고 나머지끼리 비중 나눔)

**Research Findings**:
- SlackAdapter: 43줄, ContextAdapter 인터페이스 구현
- NotionService: `searchPages()` 메서드 있음, `getConnectionStatus()` 있음
- GmailService: `searchEmails()` 메서드 있음, `getConnectionStatus()` 있음
- 기존 handler가 이미 `semantic-notion`을 호출하려 하지만 adapter 미구현으로 에러 발생 (무시됨)
- Gmail은 handler에 아예 없음

### Metis Review
**Identified Gaps** (addressed):
- Gmail URL 포맷: `https://mail.google.com/mail/u/0/#inbox/${msg.id}` 사용
- Notion content 매핑: `page.matchContext || page.title` 사용
- Timestamp 파싱: `new Date().getTime()` 사용

---

## Work Objectives

### Core Objective
Notion과 Gmail을 AI 자동 추천 검색에 통합하여, 캡처 시점에 관련 문서/이메일이 자동으로 추천되도록 함.

### Concrete Deliverables
- `src/services/context-adapters/notion-adapter.ts` (~45줄)
- `src/services/context-adapters/gmail-adapter.ts` (~45줄)
- `src/services/context-adapters/index.ts` 수정
- `src/main/index.ts` context-search 핸들러 수정
- `src/__tests__/context-adapters.test.ts` 테스트

### Definition of Done
- [ ] `npm run test` 통과
- [ ] Notion 연결 시 AI 추천에 Notion 결과 표시
- [ ] Gmail 연결 시 AI 추천에 Gmail 결과 표시
- [ ] 연결 안 된 서비스는 에러 없이 스킵

### Must Have
- SlackAdapter와 동일한 인터페이스 (`isConnected()`, `fetchItems()`)
- 에러 시 빈 배열 반환 (throw 금지)
- Gmail URL 형식: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`

### Must NOT Have (Guardrails)
- `ContextAdapter` 인터페이스 수정 금지
- `SlackAdapter` 기존 동작 변경 금지
- 페이지네이션 로직 추가 금지 (단일 페이지, limit 파라미터 준수)
- 전체 이메일/페이지 본문 fetch 금지 (snippet만 사용)
- UI 변경 금지 (백엔드 adapter만)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **User wants tests**: Tests-after (구현 후 테스트)
- **Framework**: vitest

### Tests-After Strategy

구현 완료 후 Task 5에서 테스트 작성:

**Rationale:**
- Adapter 패턴이 이미 `SlackAdapter`에서 검증됨
- 동일한 인터페이스 구현이므로 구현 후 테스트가 효율적
- Task 1-4 완료 후 Task 5에서 일괄 테스트 작성

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: NotionAdapter 구현
└── Task 2: GmailAdapter 구현

Wave 2 (After Wave 1):
└── Task 3: context-adapters/index.ts 수정

Wave 3 (After Wave 2):
└── Task 4: context-search 핸들러 수정

Wave 4 (After Wave 3):
└── Task 5: 통합 테스트 작성

Critical Path: Task 1,2 (병렬) → Task 3 → Task 4 → Task 5
Parallel Speedup: ~30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3 | 2 |
| 2 | None | 3 | 1 |
| 3 | 1, 2 | 4 | None |
| 4 | 3 | 5 | None |
| 5 | 4 | None | None |

---

## TODOs

- [ ] 1. NotionAdapter 구현

  **What to do**:
  - `src/services/context-adapters/notion-adapter.ts` 생성
  - `ContextAdapter` 인터페이스 구현
  - `createNotionService()` 사용
  - `NotionPage` → `ContextItem` 매핑

  **Must NOT do**:
  - `getPageContent()` 호출 금지 (느림)
  - 페이지네이션 로직 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일 생성, SlackAdapter 패턴 복사
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 메시지 작성

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `src/services/context-adapters/slack-adapter.ts:1-43` - 전체 파일이 패턴. `isConnected()`, `fetchItems()`, `toContextItem()` 구조 그대로 따름

  **API/Type References**:
  - `src/types/context-search.ts:29-33` - `ContextAdapter` 인터페이스 정의
  - `src/types/context-search.ts:3-11` - `ContextItem` 타입 정의
  - `src/services/notion-client.ts:40-51` - `NotionPage` 타입 (input)
  - `src/services/notion-client.ts:239-244` - `createNotionService()` 팩토리

  **Data Mapping Spec**:
  ```typescript
  // NotionAdapter.toContextItem(page: NotionPage): ContextItem
  {
    id: page.id,
    content: page.matchContext || page.title,
    title: page.title,
    url: page.url,
    source: 'notion',
    timestamp: new Date(page.lastEditedTime).getTime(),
    metadata: { isContentMatch: page.isContentMatch || false }
  }
  ```

  **Acceptance Criteria**:

  - [ ] 파일 생성: `src/services/context-adapters/notion-adapter.ts`
  - [ ] `npm run test -- src/__tests__/context-adapters.test.ts` → NotionAdapter 테스트 PASS

  **Automated Verification**:
  ```bash
  # 파일 존재 확인
  test -f src/services/context-adapters/notion-adapter.ts && echo "✅ File exists"
  
  # export 확인
  grep -q "export class NotionAdapter" src/services/context-adapters/notion-adapter.ts && echo "✅ Class exported"
  
  # 인터페이스 구현 확인
  grep -q "implements ContextAdapter" src/services/context-adapters/notion-adapter.ts && echo "✅ Interface implemented"
  ```

  **Commit**: YES
  - Message: `feat(context): add NotionAdapter for AI recommendations`
  - Files: `src/services/context-adapters/notion-adapter.ts`

---

- [ ] 2. GmailAdapter 구현

  **What to do**:
  - `src/services/context-adapters/gmail-adapter.ts` 생성
  - `ContextAdapter` 인터페이스 구현
  - `createGmailService()` 사용
  - `GmailMessage` → `ContextItem` 매핑
  - Gmail URL 생성: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`

  **Must NOT do**:
  - 이메일 전체 본문 fetch 금지
  - 페이지네이션 로직 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일 생성, SlackAdapter 패턴 복사
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/services/context-adapters/slack-adapter.ts:1-43` - 전체 파일이 패턴

  **API/Type References**:
  - `src/types/context-search.ts:29-33` - `ContextAdapter` 인터페이스
  - `src/types/context-search.ts:3-11` - `ContextItem` 타입
  - `src/services/gmail-client.ts:24-34` - `GmailMessage` 타입 (input)
  - `src/services/gmail-client.ts:156-161` - `createGmailService()` 팩토리

  **Data Mapping Spec**:
  ```typescript
  // GmailAdapter.toContextItem(msg: GmailMessage): ContextItem
  {
    id: msg.id,
    content: msg.snippet,
    title: msg.subject,
    url: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
    source: 'gmail',
    timestamp: new Date(msg.date).getTime(),
    metadata: { 
      from: msg.from.email, 
      fromName: msg.from.name,
      threadId: msg.threadId 
    }
  }
  ```

  **Acceptance Criteria**:

  - [ ] 파일 생성: `src/services/context-adapters/gmail-adapter.ts`
  - [ ] `npm run test -- src/__tests__/context-adapters.test.ts` → GmailAdapter 테스트 PASS

  **Automated Verification**:
  ```bash
  # 파일 존재 확인
  test -f src/services/context-adapters/gmail-adapter.ts && echo "✅ File exists"
  
  # Gmail URL 패턴 확인
  grep -q "mail.google.com/mail/u/0/#inbox" src/services/context-adapters/gmail-adapter.ts && echo "✅ Gmail URL pattern"
  ```

  **Commit**: YES
  - Message: `feat(context): add GmailAdapter for AI recommendations`
  - Files: `src/services/context-adapters/gmail-adapter.ts`

---

- [ ] 3. context-adapters/index.ts 수정

  **What to do**:
  - `NotionAdapter`, `GmailAdapter` import 추가
  - `getAdapter()` switch 문에 케이스 추가
  - `getAvailableAdapters()` 반환값에 `'notion'`, `'gmail'` 추가

  **Must NOT do**:
  - Slack 관련 코드 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 파일 소규모 수정
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1, Task 2

  **References**:

  **Pattern References**:
  - `src/services/context-adapters/index.ts:1-28` - 현재 파일 전체. switch 문 패턴 따름

  **Acceptance Criteria**:

  - [ ] `getAdapter('notion')` 호출 시 에러 없이 `NotionAdapter` 인스턴스 반환
  - [ ] `getAdapter('gmail')` 호출 시 에러 없이 `GmailAdapter` 인스턴스 반환
  - [ ] `getAvailableAdapters()` 반환값: `['slack', 'notion', 'gmail']`
  - [ ] 기존 "notion adapter not implemented yet" 에러 해소됨

  **Automated Verification**:
  ```bash
  # Notion adapter 등록 확인
  grep -q "NotionAdapter" src/services/context-adapters/index.ts && echo "✅ NotionAdapter imported"
  
  # Gmail adapter 등록 확인
  grep -q "GmailAdapter" src/services/context-adapters/index.ts && echo "✅ GmailAdapter imported"
  
  # getAvailableAdapters 확인
  grep -q "'notion'" src/services/context-adapters/index.ts && echo "✅ notion in available"
  grep -q "'gmail'" src/services/context-adapters/index.ts && echo "✅ gmail in available"
  
  # 에러 throw 제거 확인
  ! grep -q "throw new Error.*notion.*not implemented" src/services/context-adapters/index.ts && echo "✅ No more throw for notion"
  ! grep -q "throw new Error.*gmail.*not implemented" src/services/context-adapters/index.ts && echo "✅ No more throw for gmail"
  ```

  **Commit**: YES
  - Message: `feat(context): register Notion and Gmail adapters`
  - Files: `src/services/context-adapters/index.ts`

---

- [ ] 4. context-search 핸들러 수정 (동적 분배)

  **What to do**:
  - `src/main/index.ts` 의 `context.getRelated` 핸들러 수정 (line ~1140)
  - Gmail 검색 병렬 태스크 추가 (semantic-gmail)
  - 연결된 서비스만 동적으로 limit 분배하는 로직 추가

  **Must NOT do**:
  - 기존 slack, ai, semantic-slack, semantic-notion 로직 구조 변경 금지
  - Promise.allSettled 패턴 유지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 기존 핸들러 수정, 로직 추가
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/main/index.ts:1146-1212` - 현재 context.getRelated 핸들러. Promise.allSettled 패턴
  - `src/services/gmail-client.ts:156-161` - `createGmailService()` import 필요

  **구현 가이드 (Step-by-Step)**:

  **Step 1: 상단에 Gmail import 추가** (파일 상단 import 영역)
  ```typescript
  import { createGmailService } from './services/gmail-client';
  ```

  **Step 2: 핸들러 시작 부분에 서비스 인스턴스 생성** (기존 slackService, notionService 근처)
  ```typescript
  const gmailService = createGmailService();
  ```

  **Step 3: Promise.allSettled 이전에 동적 분배 로직 추가**
  ```typescript
  // === 동적 분배: 연결된 서비스만 limit 나눔 ===
  const [slackConnected, notionConnected, gmailConnected] = await Promise.all([
    slackService?.getConnectionStatus().then(s => s.connected).catch(() => false) ?? false,
    notionService?.getConnectionStatus().then(s => s.connected).catch(() => false) ?? false,
    gmailService?.getConnectionStatus().then(s => s.connected).catch(() => false) ?? false,
  ]);
  
  // 연결된 서비스 수 + AI(항상 포함)
  const connectedServices = [slackConnected, notionConnected, gmailConnected].filter(Boolean).length;
  const totalSources = connectedServices + 1; // +1 for AI
  const perSourceLimit = Math.max(3, Math.floor(limit / totalSources));
  
  debug.push(`connected: slack=${slackConnected}, notion=${notionConnected}, gmail=${gmailConnected}, perSourceLimit=${perSourceLimit}`);
  ```

  **Step 4: 기존 Promise.allSettled 배열에 semantic-gmail 태스크 추가**
  ```typescript
  // 기존 배열 끝에 추가:
  (async () => {
    if (!gmailConnected) return [];
    const adapter = getAdapter('gmail');
    const items = await adapter.fetchItems(query);
    if (items.length === 0) return [];
    const searchService = getSemanticSearchService();
    const results = await searchService.search(query, items);
    return results.slice(0, perSourceLimit).map(r => ({
      id: `semantic-gmail-${r.id}`,
      source: 'gmail' as const,
      title: r.title,
      snippet: r.content?.substring(0, 200) || '',
      url: r.url,
      confidence: r.score,
      raw: r
    }));
  })()
  ```

  **Step 5: 결과 처리 배열에 semantic-gmail 추가**
  ```typescript
  // 기존: const names = ['slack', 'ai', 'semantic-slack', 'semantic-notion'];
  // 수정:
  const names = ['slack', 'ai', 'semantic-slack', 'semantic-notion', 'semantic-gmail'];
  ```

  **Step 6: 기존 태스크들의 limit도 perSourceLimit 사용하도록 수정**
  ```typescript
  // 기존: Math.floor(limit / 3)
  // 수정: perSourceLimit
  ```

  **Acceptance Criteria**:

  - [ ] Gmail 연결 시 AI 추천 결과에 Gmail 포함
  - [ ] Notion만 연결 시 Notion 결과가 전체의 약 50% (AI 50%)
  - [ ] 3개 모두 연결 시 각각 약 25%씩 분배
  - [ ] 연결 안 된 서비스는 에러 없이 스킵
  - [ ] debug 로그에 연결 상태 및 perSourceLimit 표시

  **Automated Verification**:
  ```bash
  # Gmail import 확인
  grep -q "createGmailService" src/main/index.ts && echo "✅ Gmail service imported"
  
  # 동적 분배 로직 확인
  grep -q "connectedServices\|perSourceLimit" src/main/index.ts && echo "✅ Dynamic distribution logic"
  
  # semantic-gmail 태스크 확인
  grep -q "semantic-gmail" src/main/index.ts && echo "✅ semantic-gmail task added"
  
  # 빌드 확인
  npm run build && echo "✅ Build succeeds"
  ```

  **Commit**: YES
  - Message: `feat(context): add Gmail to AI recommendations with dynamic distribution`
  - Files: `src/main/index.ts`

---

- [ ] 5. 통합 테스트 작성

  **What to do**:
  - `src/__tests__/context-adapters.test.ts` 생성
  - NotionAdapter 단위 테스트
  - GmailAdapter 단위 테스트
  - 매핑 로직 테스트

  **Must NOT do**:
  - 실제 API 호출 테스트 (mock 사용)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 테스트 파일 작성, 패턴 명확
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 4, final)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:

  **Test References**:
  - `src/__tests__/example.test.ts` - vitest 테스트 패턴

  **Test Cases**:
  ```typescript
  describe('NotionAdapter', () => {
    it('returns empty array when not connected');
    it('returns ContextItem[] when connected and has results');
    it('maps NotionPage fields correctly');
    it('uses matchContext for content when available');
    it('falls back to title when matchContext is undefined');
  });

  describe('GmailAdapter', () => {
    it('returns empty array when not connected');
    it('returns ContextItem[] when connected and has results');
    it('generates correct Gmail URL format');
    it('maps GmailMessage fields correctly');
  });
  ```

  **Acceptance Criteria**:

  - [ ] `npm run test -- src/__tests__/context-adapters.test.ts` → 모든 테스트 PASS
  - [ ] 테스트 커버리지: NotionAdapter, GmailAdapter의 모든 public 메서드

  **Automated Verification**:
  ```bash
  # 테스트 실행
  npm run test -- src/__tests__/context-adapters.test.ts --reporter=verbose
  
  # 예상 결과: 모든 테스트 통과
  ```

  **Commit**: YES
  - Message: `test(context): add unit tests for Notion and Gmail adapters`
  - Files: `src/__tests__/context-adapters.test.ts`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(context): add NotionAdapter for AI recommendations` | notion-adapter.ts | grep check |
| 2 | `feat(context): add GmailAdapter for AI recommendations` | gmail-adapter.ts | grep check |
| 3 | `feat(context): register Notion and Gmail adapters` | index.ts | grep check |
| 4 | `feat(context): add Gmail to AI recommendations with dynamic distribution` | main/index.ts | grep check |
| 5 | `test(context): add unit tests for Notion and Gmail adapters` | context-adapters.test.ts | npm test |

---

## Success Criteria

### Verification Commands
```bash
# 전체 테스트 실행
npm run test

# context-adapters 테스트만
npm run test -- src/__tests__/context-adapters.test.ts

# 앱 빌드 확인
npm run build

# 타입 체크
npx tsc --noEmit
```

### Final Checklist
- [ ] All "Must Have" present
  - [ ] NotionAdapter implements ContextAdapter
  - [ ] GmailAdapter implements ContextAdapter
  - [ ] Gmail URL format correct
  - [ ] Empty array on error (no throw)
  - [ ] Dynamic limit distribution based on connected services
- [ ] All "Must NOT Have" absent
  - [ ] ContextAdapter interface unchanged
  - [ ] SlackAdapter unchanged
  - [ ] No pagination logic
  - [ ] No full content fetch
- [ ] All tests pass
- [ ] `npm run build` succeeds
- [ ] No "adapter not implemented" errors in console

### Manual Verification (최종 확인)
앱 실행 후 개발자 도구 콘솔에서:
1. `context.getRelated` 호출 시 에러 없음 확인
2. 연결된 서비스에 따라 결과 비율 변경 확인
3. Gmail 연결 시 `semantic-gmail: N results` 로그 표시 확인
