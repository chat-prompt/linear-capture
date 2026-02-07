# Gmail 토큰 지속성 개선

## TL;DR

> **Quick Summary**: Gmail OAuth 토큰이 앱 재실행 시 사라지는 문제 수정. KV 저장소의 TTL 로직이 refresh_token이 있는 서비스를 고려하지 않아 발생.
> 
> **Deliverables**:
> - Worker의 token-storage.ts 수정 (TTL 로직 개선)
> - Gmail 재연결 없이 토큰 유지 확인
> 
> **Estimated Effort**: Quick (30분 이내)
> **Parallel Execution**: NO - 단일 파일 수정
> **Critical Path**: Worker 수정 → 배포 → 앱 테스트

---

## Context

### Original Request
슬랙, 노션은 앱을 다시 실행해도 연결이 유지되는데 Gmail만 재연결이 필요한 문제 해결

### 문제 분석 결과

**근본 원인**: `linear-capture-worker/src/oauth/token-storage.ts`의 KV TTL 설정 로직

```typescript
// 현재 문제가 있는 코드 (93-99줄)
const expirationTtl = tokens.expires_at 
  ? Math.max(tokens.expires_at - Math.floor(Date.now() / 1000), 60)
  : undefined;

await env.OAUTH_TOKENS.put(key, encrypted, {
  expirationTtl: expirationTtl ? Math.min(expirationTtl, 365 * 24 * 60 * 60) : undefined,
});
```

| 서비스 | expires_at | refresh_token | KV TTL | 결과 |
|--------|-----------|---------------|--------|------|
| Slack | 없음 | 없음 | 영구 | OK |
| Notion | 없음 | 없음 | 영구 | OK |
| Gmail | 1시간 | **있음** | 1시간 | **KV 삭제됨!** |

**Gmail 동작 흐름:**
1. OAuth 연결 → `access_token` (1시간) + `refresh_token` (영구) 저장
2. KV에 `expirationTtl: 3600초`로 저장
3. 1시간 후 **KV 키 자체가 삭제** (refresh_token 포함)
4. 앱 재시작 → 토큰 없음 → 재연결 요청

**올바른 동작:**
- `refresh_token`이 있으면 KV를 영구 보관
- `access_token` 만료 시 `refresh_token`으로 갱신

---

## Work Objectives

### Core Objective
refresh_token이 있는 OAuth 서비스(Gmail)의 토큰이 KV에서 자동 삭제되지 않도록 TTL 로직 수정

### Concrete Deliverables
- `linear-capture-worker/src/oauth/token-storage.ts` 수정
- Worker 배포 (wrangler deploy)

### Definition of Done
- [ ] Gmail 연결 후 1시간 이상 경과해도 토큰이 KV에 유지됨
- [ ] 앱 재시작 시 Gmail 연결 상태가 "연결됨"으로 표시
- [ ] Slack/Notion 기존 동작 영향 없음

### Must Have
- refresh_token이 있는 경우 KV TTL을 설정하지 않음 (영구 보관)
- 기존 Slack/Notion 동작에 영향 없음

### Must NOT Have (Guardrails)
- refresh_token이 없는 서비스의 TTL 동작 변경 금지
- 보안 관련 로직(암호화) 변경 금지
- 다른 OAuth 엔드포인트 수정 금지

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (Worker 프로젝트에 테스트 없음)
- **User wants tests**: Manual-only
- **Framework**: none

### Manual Verification Procedure

**Step 1: Worker 배포 후 KV 확인**
```bash
# Worker 디렉토리에서
cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
wrangler deploy

# KV에서 Gmail 토큰 확인 (device_id 필요)
wrangler kv:key get --namespace-id=<OAUTH_TOKENS_ID> "<device_id>:gmail"
```

**Step 2: 앱에서 Gmail 재연결 테스트**
1. 앱에서 Gmail 연결 해제 후 재연결
2. 1시간 이상 대기 (또는 시스템 시간 변경)
3. 앱 완전 종료 후 재실행
4. Settings에서 Gmail 연결 상태 확인 → "연결됨" 표시되어야 함

**Step 3: Slack/Notion 기존 동작 확인**
- 각각 연결 상태가 여전히 유지되는지 확인

---

## TODOs

- [ ] 1. token-storage.ts TTL 로직 수정

  **What to do**:
  - `storeTokens()` 함수에서 `expirationTtl` 계산 로직 수정
  - `refresh_token`이 있으면 TTL을 설정하지 않음 (영구 보관)
  - `refresh_token`이 없고 `expires_at`이 있으면 기존 로직 유지

  **변경 내용**:
  ```typescript
  // Before (문제 있는 코드)
  const expirationTtl = tokens.expires_at 
    ? Math.max(tokens.expires_at - Math.floor(Date.now() / 1000), 60)
    : undefined;

  // After (수정된 코드)
  // refresh_token이 있으면 영구 보관 (토큰 갱신이 가능하므로)
  // refresh_token이 없고 expires_at이 있으면 해당 시간에 만료
  const expirationTtl = tokens.refresh_token 
    ? undefined  // 영구 보관 - refresh_token으로 갱신 가능
    : tokens.expires_at 
      ? Math.max(tokens.expires_at - Math.floor(Date.now() / 1000), 60)
      : undefined;
  ```

  **Must NOT do**:
  - 암호화 로직 변경
  - 다른 함수 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일, 3줄 미만 수정
  - **Skills**: []
    - 필요 없음 - 간단한 조건문 수정

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `linear-capture-worker/src/oauth/token-storage.ts:93-99` - 수정 대상 코드
  - `linear-capture-worker/src/gmail/oauth.ts:184-195` - Gmail이 refresh_token을 저장하는 방식 참조

  **Acceptance Criteria**:
  - [ ] `storeTokens()` 함수에서 refresh_token 존재 시 expirationTtl이 undefined로 설정됨
  - [ ] 코드 변경이 93-99줄 범위 내에서만 이루어짐
  
  ```bash
  # Agent 검증: 수정된 코드에 refresh_token 체크 로직이 있는지 확인
  grep -n "refresh_token" linear-capture-worker/src/oauth/token-storage.ts
  # Expected: 새로 추가된 라인에서 refresh_token 체크 로직 표시
  ```

  **Commit**: YES
  - Message: `fix(worker): preserve KV tokens when refresh_token exists`
  - Files: `src/oauth/token-storage.ts`
  - Pre-commit: N/A

---

- [ ] 2. Worker 배포

  **What to do**:
  - wrangler deploy 실행
  - 배포 성공 확인

  **Must NOT do**:
  - 다른 설정 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `linear-capture-worker/wrangler.toml` - Worker 설정

  **Acceptance Criteria**:
  ```bash
  # Worker 디렉토리에서 실행
  cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
  wrangler deploy
  # Expected: "Your worker has deployed successfully." 메시지
  ```

  **Commit**: NO (배포만)

---

- [ ] 3. 수동 테스트 및 검증

  **What to do**:
  - 앱에서 Gmail 연결 테스트
  - 앱 재시작 후 연결 유지 확인
  - Slack/Notion 영향 없음 확인

  **Recommended Agent Profile**:
  - **Category**: N/A (수동 테스트)

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] Gmail 연결 후 앱 재시작 → 연결 상태 유지됨
  - [ ] Slack 연결 상태 유지됨
  - [ ] Notion 연결 상태 유지됨

  **Commit**: NO

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(worker): preserve KV tokens when refresh_token exists` | src/oauth/token-storage.ts | N/A |

---

## Success Criteria

### Verification Commands
```bash
# Worker 배포 확인
wrangler deploy
# Expected: "Your worker has deployed successfully."

# 수정된 코드 확인
grep -A5 "expirationTtl" linear-capture-worker/src/oauth/token-storage.ts
# Expected: refresh_token 체크 로직이 포함된 코드
```

### Final Checklist
- [ ] Gmail 토큰이 KV에서 1시간 후에도 유지됨
- [ ] 앱 재시작 시 Gmail "연결됨" 상태 유지
- [ ] Slack/Notion 기존 동작 영향 없음
- [ ] Worker 배포 성공
