# 슬랙 포맷 파서 디버깅

## TL;DR

> **Quick Summary**: DM 채널 title의 유저 ID(`#U07B2GLQQER`)가 사용자 이름으로 변환되지 않는 버그 수정
> 
> **Deliverables**:
> - resolve() 함수에 title 형태 유저 ID 변환 추가
> - semantic-search.ts에서 title도 resolve() 처리
> - 디버그 로깅으로 실제 데이터 흐름 확인
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - sequential (디버깅 후 수정)
> **Critical Path**: 로깅 추가 → 실제 데이터 확인 → 수정 적용

---

## Context

### Original Request
슬랙 메시지가 앱에서 여전히 변환 안 되는 문제 디버깅

### 문제 분석 결과

**앱 출력:**
```
#U07B2GLQQER
김태현 commented on 최소한으로 보는 것 좋습니다!
```

**기대값:**
```
#채널이름 또는 @김태현 (DM인 경우)
김태현 commented on EDU-5710 의견 요청...
```

### 원인 분석

| 위치 | 문제 | 영향 |
|------|------|------|
| `semantic-search.ts:133` | title이 resolve() 미적용 | DM 채널 title `#U...` 변환 안 됨 |
| `slack-user-cache.ts:62` | 정규식 `<@...>` 형태만 지원 | title의 `#U...` 형태 매칭 안 됨 |
| `slack-sync.ts:103` | DM 채널 name이 유저 ID | `#${channel.name}` → `#U07B2GLQQER` |

---

## Work Objectives

### Core Objective
DM 채널 title의 유저 ID를 사용자 이름으로 변환

### Concrete Deliverables
- resolve() 함수에 DM title 형태 지원 추가
- semantic-search.ts에서 title도 resolve() 처리
- 실제 데이터 확인용 디버그 로깅

### Definition of Done
- [ ] 앱에서 `#U07B2GLQQER` 대신 `@김태현` 또는 `#채널명` 표시
- [ ] 콘솔에 resolve 로그 정상 출력 확인

### Must NOT Have (Guardrails)
- 기존 정규식 동작 변경하지 않기 (기존 테스트 통과 유지)
- 일반 채널 (`#general`) 형태 잘못 변환하지 않기

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (기존 테스트 43개 있음)
- **User wants tests**: Manual verification first, then TDD
- **QA approach**: 디버그 로깅 → 실제 데이터 확인 → 수정 → 테스트

---

## TODOs

### Phase 1: 디버깅 (데이터 흐름 확인)

- [ ] 1. resolve() 함수에 디버그 로깅 추가

  **What to do**:
  - `resolve()` 함수 시작에 `console.log('[resolve] input:', text)` 추가
  - 반환 전에 `console.log('[resolve] output:', result)` 추가
  
  **Why**: 실제 어떤 데이터가 들어오는지 확인 필요

  **References**:
  - `src/services/slack-user-cache.ts:56-89` - resolve() 함수

  **Acceptance Criteria**:
  - [ ] `npm run pack:clean` 후 개발자 도구 콘솔에서 로그 확인
  - [ ] 입력값 형태 파악: `<@U...>` vs `#U...` vs 기타

---

- [ ] 2. semantic-search.ts 변환 호출 로깅 확인

  **What to do**:
  - `convertHybridResults()`에서 `slackUserCache.isLoaded()` 상태 로깅
  - title과 content 원본값 로깅
  
  **References**:
  - `src/services/semantic-search.ts:116-145` - convertHybridResults()

  **Acceptance Criteria**:
  - [ ] `isLoaded()` 상태 확인 (true/false)
  - [ ] title/content 원본 형태 확인

---

### Phase 2: 수정 (원인에 따라)

- [ ] 3. title에도 resolve() 적용

  **What to do**:
  - `convertHybridResults()`에서 title도 resolve() 호출
  
  **References**:
  - `src/services/semantic-search.ts:130-137` - 결과 매핑 부분

  **Acceptance Criteria**:
  ```typescript
  // Before
  return {
    title: r.title || '',
    content,
    ...
  };
  
  // After
  return {
    title: r.source === 'slack' ? slackUserCache.resolve(r.title || '') : (r.title || ''),
    content,
    ...
  };
  ```

---

- [ ] 4. resolve()에 DM title 형태 지원 추가

  **What to do**:
  - DM 채널 title `#U...` 형태를 `@사용자명`으로 변환하는 정규식 추가
  - 일반 채널 `#general` 형태는 변환하지 않도록 주의
  
  **References**:
  - `src/services/slack-user-cache.ts:56-89` - resolve() 함수

  **Acceptance Criteria**:
  ```typescript
  // 추가할 정규식 (기존 정규식 아래에)
  // 5. DM 채널 title (# + 유저ID) → @유저명
  if (this.loaded && this.userMap.size > 0) {
    result = result.replace(/^#([A-Z][A-Z0-9]+)$/, (match, userId) => {
      const displayName = this.userMap.get(userId);
      return displayName ? `@${displayName}` : match;
    });
  }
  ```
  
  **주의**: 
  - `^#([A-Z][A-Z0-9]+)$` - 전체 문자열이 `#`+유저ID인 경우만 (DM title)
  - 일반 채널명 (`#general`)은 매칭 안 됨 (소문자 포함)

---

- [ ] 5. 기존 테스트 통과 확인

  **What to do**:
  - `npm test` 실행하여 기존 43개 테스트 모두 통과 확인
  
  **Acceptance Criteria**:
  - [ ] `npm test` → 43 tests passed

---

- [ ] 6. 실제 앱에서 동작 확인

  **What to do**:
  - `npm run pack:clean` 실행
  - AI 추천에서 슬랙 메시지 표시 확인
  
  **Acceptance Criteria**:
  - [ ] DM 채널 title: `@김태현` 형태로 표시
  - [ ] 일반 채널 title: `#general` 형태 유지
  - [ ] content의 유저 멘션: `@사용자명` 형태로 표시

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1-2 | `debug(slack): add resolve logging` | slack-user-cache.ts, semantic-search.ts |
| 3-4 | `fix(slack): resolve user ID in DM channel title` | slack-user-cache.ts, semantic-search.ts |
| 5-6 | (verify only, no commit) | - |

---

## Success Criteria

### Final Checklist
- [ ] DM 채널 title `#U...` → `@사용자명` 변환됨
- [ ] 일반 채널 title `#general` 유지됨
- [ ] content의 `<@U...>` → `@사용자명` 변환됨
- [ ] 기존 테스트 43개 통과
- [ ] 실제 앱에서 정상 표시 확인
