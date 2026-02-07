# 슬랙 메시지 포맷 파서 개선

## TL;DR

> **Quick Summary**: AI 추천에서 슬랙 메시지가 표시될 때 raw 포맷(`<url|text>`, `<#C123|name>` 등)이 사람이 읽기 쉬운 형태로 변환되도록 `slack-user-cache.ts`의 `resolve()` 함수를 확장한다.
> 
> **Deliverables**:
> - `src/services/slack-user-cache.ts`의 `resolve()` 함수 확장
> - 단위 테스트 추가
> 
> **Estimated Effort**: Quick (~30분)
> **Parallel Execution**: NO - 단일 파일 수정
> **Critical Path**: 구현 → 테스트 → 검증

---

## Context

### Original Request
AI 추천에서 슬랙 메시지 중 Linear가 포함된 것이 `#U07B2GLQQER` 같은 raw ID로 표시됨. Linear 이슈 URL이나 채널 멘션 등이 변환되지 않고 그대로 보이는 문제.

### Interview Summary
**Key Discussions**:
- 문제 원인: Linear 슬랙 앱이 코멘트 알림을 보낼 때 URL이 `<url|텍스트>` 형식으로 저장됨
- 변환 범위: 전체 슬랙 포맷 처리 (사용자 멘션, 채널 멘션, 링크, 특수 멘션)
- 출력 형식: **마크다운 링크** (`[텍스트](url)`)

### Metis Review
**Identified Gaps** (addressed):
- 채널 API 호출 필요 여부 → **이름 포함된 포맷만 처리** (API 호출 없음)
- 에러 핸들링 → **이름 없으면 원본 유지**
- 기존 로직 보호 → **`<@USER_ID>` 로직 수정 금지**

---

## Work Objectives

### Core Objective
`slack-user-cache.ts`의 `resolve()` 함수를 확장하여 다양한 슬랙 메시지 포맷을 사람이 읽기 쉬운 형태로 변환한다.

### Concrete Deliverables
- `src/services/slack-user-cache.ts` 수정
- `src/services/__tests__/slack-user-cache.test.ts` 추가 (또는 기존 테스트 확장)

### Definition of Done
- [ ] `npm run build` 성공
- [ ] `npm run test` 통과
- [ ] `npm run pack:clean` 후 AI 추천에서 슬랙 메시지가 정상 변환됨

### Must Have
- 링크 포맷 변환: `<url|텍스트>` → `[텍스트](url)`
- 채널 멘션 변환: `<#C123|general>` → `#general`
- 특수 멘션 변환: `<!here>` → `@here`
- 기존 사용자 멘션 유지: `<@U123>` → `@이름`

### Must NOT Have (Guardrails)
- ❌ 기존 `<@USER_ID>` 변환 **동작** 변경 (결과는 동일해야 함 - 함수 구조 변경은 허용)
- ❌ Worker API 새 endpoint 추가
- ❌ 비동기 API 호출 추가 (채널 이름 조회 등)
- ❌ 이모지 변환 (`:smile:` → 😄)
- ❌ 이름 없는 포맷의 API 조회 (원본 유지)

### ⚠️ CRITICAL: 함수 구조 변경 필요
현재 `resolve()` 함수는 `userMap`이 로드되지 않으면 즉시 원본을 반환합니다(57-59줄).
이 구조를 유지하면 새로운 포맷 변환이 실행되지 않습니다.

**변경 전** (현재):
```typescript
if (!this.loaded || this.userMap.size === 0) {
  return text;  // 조기 반환 - 새 변환 실행 안 됨
}
```

**변경 후** (필요):
```typescript
let result = text;
// 사용자 멘션은 userMap 있을 때만
if (this.loaded && this.userMap.size > 0) {
  result = result.replace(/<@([A-Z0-9]+)>/g, ...);
}
// 새로운 변환들은 항상 실행
result = result.replace(...);  // 채널, 특수 멘션, 링크
return result;
```

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **User wants tests**: YES (Tests-after)
- **Framework**: vitest

### Automated Verification

**Unit Tests** (vitest):
```bash
npm run test -- src/services/__tests__/slack-user-cache.test.ts
# Assert: All tests pass
```

**Build Verification**:
```bash
npm run build
# Assert: Exit code 0, no TypeScript errors
```

**Manual Verification** (via pack:clean):
```bash
npm run pack:clean
# 1. 앱 실행 후 이슈 생성 화면 열기
# 2. 제목 입력하여 AI 추천 트리거
# 3. Slack 메시지 중 Linear URL 포함된 것 확인
# 4. [텍스트](url) 형식으로 표시되는지 확인
```

---

## Execution Strategy

### Single Wave (Sequential)

```
Task 1: resolve() 함수 확장
    ↓
Task 2: 테스트 작성 및 검증
```

---

## TODOs

- [ ] 1. `resolve()` 함수 확장 - 슬랙 포맷 파서 추가

  **What to do**:
  - `src/services/slack-user-cache.ts`의 `resolve()` 함수 구조 변경 (⚠️ CRITICAL)
  - **Step 1**: 조기 반환 로직 제거 (`if (!this.loaded...) return text;`)
  - **Step 2**: `let result = text;` 변수 도입
  - **Step 3**: 사용자 멘션은 `if (this.loaded && this.userMap.size > 0)` 조건 내에서 처리
  - **Step 4**: 새로운 변환들은 조건 외부에서 항상 실행
  - 변환 순서: 사용자 멘션(조건부) → 채널 멘션 → 특수 멘션 → 링크

  **변환 규칙**:
  ```typescript
  // 1. 사용자 멘션 (기존 유지)
  // <@U123> → @이름 (userMap에서 조회)
  
  // 2. 채널 멘션 (NEW)
  // <#C123|channel-name> → #channel-name
  // <#C123> → <#C123> (이름 없으면 원본 유지)
  
  // 3. 특수 멘션 (NEW)
  // <!here> → @here
  // <!channel> → @channel
  // <!everyone> → @everyone
  // <!subteam^...> → @team (또는 원본 유지)
  
  // 4. 링크 (NEW)
  // <https://...|텍스트> → [텍스트](https://...)
  // <https://...> → https://... (URL만 추출)
  ```

  **Must NOT do**:
  - 기존 `<@USER_ID>` 변환 로직 수정
  - 새로운 API 호출 추가
  - 함수 시그니처 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일, 명확한 로직, ~30줄 코드 추가
  - **Skills**: [`git-master`]
    - `git-master`: 작업 완료 후 커밋 필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  
  **Pattern References**:
  - `src/services/slack-user-cache.ts:56-76` - 기존 `resolve()` 함수 구현. 여기에 추가 정규식 패턴 적용
  - `src/services/slack-user-cache.ts:62` - 기존 regex 패턴 `/<@([A-Z0-9]+)>/g`. 이 패턴 스타일 따르기

  **Usage References**:
  - `src/services/semantic-search.ts:122-128` - `resolve()` 호출 위치. 슬랙 소스일 때만 호출됨

  **External References**:
  - Slack message formatting: https://api.slack.com/reference/surfaces/formatting#retrieving-messages

  **Acceptance Criteria**:
  
  **Unit Tests** (Task 2에서 검증):
  - [ ] `<#C123|general>` → `#general`
  - [ ] `<#C123>` → `<#C123>` (원본 유지)
  - [ ] `<!here>` → `@here`
  - [ ] `<!channel>` → `@channel`
  - [ ] `<!everyone>` → `@everyone`
  - [ ] `<https://linear.app/...|EDU-5710>` → `[EDU-5710](https://linear.app/...)`
  - [ ] `<https://example.com>` → `https://example.com`
  - [ ] 복합: `<@U123> in <#C456|dev>` → `@이름 in #dev`

  **Build Verification**:
  ```bash
  npm run build
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(slack): extend resolve() to parse channel mentions and links`
  - Files: `src/services/slack-user-cache.ts`
  - Pre-commit: `npm run build`

---

- [ ] 2. 테스트 작성 및 최종 검증

  **What to do**:
  - `src/services/__tests__/slack-user-cache.test.ts` 파일 생성 (또는 기존 파일 확장)
  - 위 Acceptance Criteria의 모든 케이스에 대한 테스트 작성
  - 엣지 케이스 테스트 추가

  **테스트 케이스**:
  ```typescript
  describe('SlackUserCache.resolve', () => {
    // 채널 멘션
    it('converts channel mention with name', () => {
      expect(resolve('<#C123|general>')).toBe('#general');
    });
    
    it('preserves channel mention without name', () => {
      expect(resolve('<#C123>')).toBe('<#C123>');
    });
    
    // 특수 멘션
    it('converts special mentions', () => {
      expect(resolve('<!here>')).toBe('@here');
      expect(resolve('<!channel>')).toBe('@channel');
      expect(resolve('<!everyone>')).toBe('@everyone');
    });
    
    // 링크
    it('converts link with display text to markdown', () => {
      expect(resolve('<https://linear.app/issue|EDU-5710>')).toBe('[EDU-5710](https://linear.app/issue)');
    });
    
    it('extracts URL from link without display text', () => {
      expect(resolve('<https://example.com>')).toBe('https://example.com');
    });
    
    // 복합
    it('handles multiple formats in one message', () => {
      // 사용자 멘션은 userMap이 필요하므로 별도 테스트
      expect(resolve('Check <#C123|dev> and <!here>')).toBe('Check #dev and @here');
    });
    
    // 엣지 케이스
    it('handles empty display text', () => {
      expect(resolve('<#C123|>')).toBe('<#C123|>'); // 원본 유지
    });
  });
  ```

  **Must NOT do**:
  - 기존 테스트 삭제
  - 실제 Slack API 호출하는 테스트

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 테스트 파일 작성, 명확한 패턴
  - **Skills**: [`git-master`]
    - `git-master`: 테스트 추가 후 커밋

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  
  **Pattern References**:
  - `src/services/__tests__/local-vector-store.test.ts` - 기존 테스트 파일 구조 참고
  - `vitest.config.ts` - vitest 설정

  **Acceptance Criteria**:
  
  **Automated Verification**:
  ```bash
  npm run test -- src/services/__tests__/slack-user-cache.test.ts
  # Assert: All tests pass
  ```

  **Manual Verification** (pack:clean):
  ```bash
  npm run pack:clean
  # 1. 앱 실행
  # 2. 캡처 후 이슈 생성 화면에서 제목 입력
  # 3. AI 추천 섹션에서 Slack 메시지 확인
  # 4. Linear URL이 [텍스트](url) 형식으로 표시되는지 확인
  ```

  **Evidence to Capture**:
  - [ ] 테스트 실행 결과 스크린샷
  - [ ] AI 추천에서 변환된 슬랙 메시지 스크린샷

  **Commit**: YES
  - Message: `test(slack): add tests for extended resolve() function`
  - Files: `src/services/__tests__/slack-user-cache.test.ts`
  - Pre-commit: `npm run test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(slack): extend resolve() to parse channel mentions and links` | `slack-user-cache.ts` | `npm run build` |
| 2 | `test(slack): add tests for extended resolve() function` | `slack-user-cache.test.ts` | `npm run test` |

---

## Success Criteria

### Verification Commands
```bash
npm run build        # Expected: Exit code 0
npm run test         # Expected: All tests pass
npm run pack:clean   # Expected: App runs, AI recommendations show formatted Slack messages
```

### Final Checklist
- [ ] 링크 `<url|텍스트>` → `[텍스트](url)` 변환됨
- [ ] 채널 `<#C123|name>` → `#name` 변환됨
- [ ] 특수 멘션 `<!here>` 등 변환됨
- [ ] 기존 사용자 멘션 여전히 작동
- [ ] 이름 없는 포맷은 원본 유지
- [ ] 빌드 성공, 테스트 통과
