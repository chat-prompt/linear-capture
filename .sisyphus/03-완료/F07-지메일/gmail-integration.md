# Gmail Integration for Linear Capture

## TL;DR

> **Quick Summary**: linear-capture 앱에 Gmail 연동 추가. Slack/Notion과 동일한 패턴으로 OAuth 인증 및 메일 검색 기능 구현.
> 
> **Deliverables**:
> - `src/services/gmail-client.ts` - Gmail 서비스 클라이언트
> - Worker `/gmail/*` 엔드포인트 - OAuth 및 검색 API
> - Settings UI Gmail 연결 섹션
> - IPC handlers 및 deep link handler
> 
> **Estimated Effort**: Medium (1-2일)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 0 (GCP) → Task 1 (Worker) → Task 2 (Client) → Task 3-5 (App)

---

## Context

### Original Request
Gmail 연동 추가. 이슈 생성 시 관련 메일을 검색해서 참조로 붙일 수 있도록.

### Interview Summary
**Key Discussions**:
- 메일 읽기/검색 기능만 필요 (readonly)
- 전체 메일함 대상
- Slack/Notion과 동일한 UX 패턴
- AI 추천 등 고급 기능은 추후

**Research Findings**:
- 기존 패턴: `{service}-client.ts` (약 200줄) + Worker OAuth module
- OAuth 토큰은 Worker에서 deviceId 기준으로 관리
- Deep link로 OAuth callback 처리 (`linear-capture://gmail/callback`)

### Metis Review
**Identified Gaps** (addressed):
- GCP 프로젝트 설정 필요 → Task 0으로 분리
- Gmail 토큰 1시간 만료 → refresh token 로직 필수
- Worker Env에 Google credentials 추가 필요

---

## Work Objectives

### Core Objective
Gmail OAuth 연동으로 메일 검색 기능 추가. 기존 Slack/Notion 패턴을 그대로 따름.

### Concrete Deliverables
- `src/services/gmail-client.ts` (신규)
- Worker Gmail 엔드포인트 (6개)
- `src/main/index.ts` 수정 (deep link + IPC)
- `src/renderer/settings.html` 수정 (Gmail 섹션)

### Definition of Done
- [x] Settings에서 Gmail 연결/해제 가능
- [x] 연결 후 메일 검색 API 호출 성공
- [x] 앱 재시작 후에도 연결 상태 유지

### Must Have
- GCP OAuth 2.0 credentials
- `gmail.readonly` 스코프
- Access token + Refresh token 저장
- 토큰 자동 갱신 (1시간 만료 대응)
- 검색 결과: id, subject, from, date, snippet

### Must NOT Have (Guardrails)
- ❌ 메일 작성/전송 기능
- ❌ 라벨 관리 UI
- ❌ 첨부파일 처리
- ❌ 메일 본문 전체 조회 (snippet만)
- ❌ Calendar/Drive 등 다른 Google API
- ❌ AI 기반 메일 추천 (추후)
- ❌ 이슈 생성 폼에 메일 선택 UI (추후)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (수동 테스트)
- **User wants tests**: Manual-only
- **Framework**: none

### Automated Verification

모든 검증은 curl 명령어 및 앱 동작 확인으로 수행.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (BLOCKER - Must Complete First):
└── Task 0: GCP 프로젝트 설정

Wave 1 (After Wave 0):
└── Task 1: Worker Gmail 엔드포인트 구현

Wave 2 (After Wave 1):
├── Task 2: gmail-client.ts 생성
├── Task 3: main/index.ts deep link handler
└── Task 4: main/index.ts IPC handlers

Wave 3 (After Wave 2):
└── Task 5: settings.html Gmail 섹션

Critical Path: Task 0 → Task 1 → Task 2 → Task 5
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | 1 | None |
| 1 | 0 | 2, 3, 4 | None |
| 2 | 1 | 5 | 3, 4 |
| 3 | 1 | 5 | 2, 4 |
| 4 | 1 | 5 | 2, 3 |
| 5 | 2, 3, 4 | None | None (final) |

---

## TODOs

- [x] 0. GCP 프로젝트 및 OAuth Credentials 설정

  **What to do**:
  1. Google Cloud Console에서 프로젝트 생성 (또는 기존 프로젝트 사용)
  2. Gmail API 활성화
  3. OAuth 동의 화면 설정 (External, 테스트 사용자 추가)
  4. OAuth 2.0 Client ID 생성 (웹 애플리케이션)
     - Authorized redirect URI: `https://linear-capture-ai.ny-4f1.workers.dev/gmail/oauth-redirect`
  5. Client ID, Client Secret을 Worker secrets로 등록

  **Must NOT do**:
  - 프로덕션 앱 검증 (테스트 모드로 충분)
  - 불필요한 스코프 추가

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 외부 콘솔 작업, 코드 변경 없음
  - **Skills**: [`git-master`]
    - `git-master`: Worker secrets 등록 시 wrangler 명령어 필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0 (single)
  - **Blocks**: Task 1
  - **Blocked By**: None

  **References**:
  - Google Cloud Console: https://console.cloud.google.com/
  - Gmail API 문서: https://developers.google.com/gmail/api/guides
  - 기존 Worker URL: `https://linear-capture-ai.ny-4f1.workers.dev`

  **Acceptance Criteria**:
  ```bash
  # Worker secrets 확인
  wrangler secret list
  # Assert: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 존재
  ```

  **Commit**: NO (외부 설정 작업)

---

- [x] 1. Worker Gmail OAuth 엔드포인트 구현

  **What to do**:
  1. Worker Env 인터페이스에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 추가
  2. `/gmail/auth` - OAuth URL 생성 (state에 deviceId 포함)
  3. `/gmail/oauth-redirect` - OAuth callback HTML (deep link redirect)
  4. `/gmail/callback` - code → token 교환, KV에 저장
  5. `/gmail/status` - 연결 상태 확인 (토큰 유효성 검증)
  6. `/gmail/disconnect` - 토큰 삭제
  7. `/gmail/search` - 메일 검색 (토큰 자동 갱신 포함)

  **Must NOT do**:
  - 기존 Slack/Notion 코드 수정
  - 메일 본문 전체 반환 (snippet만)
  - 불필요한 메타데이터 반환

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Worker 코드 작성, OAuth 플로우 복잡도
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (single)
  - **Blocks**: Task 2, 3, 4
  - **Blocked By**: Task 0

  **References**:

  **Pattern References** (기존 Worker 코드):
  - Worker 프로젝트 위치: `/Users/wine_ny/side-project/linear_project/linear-capture-worker/`
  - `src/index.ts:10-21` - Env 인터페이스 (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 추가 위치)
  - `src/slack/oauth.ts` - Slack OAuth 패턴 참고
  - `src/notion/oauth.ts` - Notion OAuth 패턴 참고
  - `src/slack/search.ts` - 검색 패턴 참고
  - `src/oauth/token-storage.ts` - 토큰 저장 유틸리티

  **API References**:
  - Google OAuth 2.0: https://developers.google.com/identity/protocols/oauth2/web-server
  - Gmail API search: https://developers.google.com/gmail/api/reference/rest/v1/users.messages/list
  - Gmail API message get: https://developers.google.com/gmail/api/reference/rest/v1/users.messages/get

  **Gmail OAuth 특이사항**:
  - Scope: `https://www.googleapis.com/auth/gmail.readonly`
  - Access token 만료: 1시간
  - Refresh token으로 갱신 필요 (`grant_type=refresh_token`)

  **Token Refresh 로직 (필수)**:
  ```typescript
  // 검색 전 토큰 만료 확인
  if (tokenData.expires_at < Date.now() + 5 * 60 * 1000) {
    // 5분 전이면 미리 갱신
    const newToken = await refreshAccessToken(tokenData.refresh_token);
    await saveToken(deviceId, newToken);
  }
  ```

  **Acceptance Criteria**:
  ```bash
  # 1. OAuth URL 생성 테스트
  curl -s "https://linear-capture-ai.ny-4f1.workers.dev/gmail/auth?device_id=test123" | jq '.auth_url'
  # Assert: URL contains accounts.google.com/o/oauth2

  # 2. Status 테스트 (연결 전)
  curl -s "https://linear-capture-ai.ny-4f1.workers.dev/gmail/status?device_id=test123" | jq '.connected'
  # Assert: false

  # 3. Search 테스트 (연결 후)
  curl -s "https://linear-capture-ai.ny-4f1.workers.dev/gmail/search?device_id=<connected_id>&query=test" | jq '.messages[0].subject'
  # Assert: Returns email subject string
  ```

  **Commit**: YES
  - Message: `feat(worker): add Gmail OAuth and search endpoints`
  - Files: Worker 프로젝트 파일들
  - Pre-commit: `wrangler deploy --dry-run`

---

- [x] 2. gmail-client.ts 서비스 클라이언트 생성

  **What to do**:
  1. `src/services/gmail-client.ts` 파일 생성
  2. `slack-client.ts` 패턴 그대로 복사 후 Gmail용으로 수정
  3. 인터페이스 정의:
     - `GmailConnectionStatus`
     - `GmailCallbackResult`
     - `GmailMessage`
     - `GmailSearchResult`
  4. `GmailService` 클래스 구현:
     - `startOAuthFlow()`
     - `handleCallback(code, state)`
     - `getConnectionStatus()`
     - `disconnect()`
     - `searchEmails(query, maxResults?)`
  5. `createGmailService()` 팩토리 함수

  **Must NOT do**:
  - Slack/Notion 클라이언트 수정
  - 앱 내 토큰 저장 (Worker에서 관리)
  - 메일 본문 전체 조회 메서드

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 패턴 복사 + 변수명 변경
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References** (그대로 따라할 코드):
  - `src/services/slack-client.ts:1-207` - 전체 구조, 클래스 패턴
  - `src/services/notion-client.ts:1-198` - 대안 참조
  - `src/services/settings-store.ts:getDeviceId()` - deviceId 가져오기

  **Type Reference**:
  ```typescript
  // GmailMessage 인터페이스 (Worker 응답 형태)
  interface GmailMessage {
    id: string;
    threadId: string;
    subject: string;
    from: { name: string; email: string };
    date: string;  // ISO format
    snippet: string;  // 첫 100자 정도
  }
  ```

  **Acceptance Criteria**:
  ```bash
  # TypeScript 컴파일 확인
  npx tsc --noEmit
  # Assert: No errors related to gmail-client.ts

  # 파일 존재 확인
  ls -la src/services/gmail-client.ts
  # Assert: File exists, ~200 lines
  ```

  **Commit**: YES (groups with 3, 4)
  - Message: `feat(gmail): add Gmail service client`
  - Files: `src/services/gmail-client.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [x] 3. main/index.ts에 Gmail deep link handler 추가

  **What to do**:
  1. `handleDeepLink()` 함수에 Gmail 케이스 추가 (line 62-136 참조)
  2. `linear-capture://gmail/callback` 처리
  3. `pendingGmailCallback` 변수 추가
  4. `gmailService.handleCallback()` 호출
  5. Settings 윈도우에 결과 전송 (`gmail-connected`, `gmail-oauth-error`)

  **Must NOT do**:
  - 기존 Slack/Notion deep link 로직 수정
  - 새 함수 분리 (기존 패턴 유지)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 패턴 복사 + 변수명 변경
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References** (그대로 따라할 코드):
  - `src/main/index.ts:68-98` - Slack deep link handler
  - `src/main/index.ts:101-132` - Notion deep link handler
  - `src/main/index.ts:179-180` - `pendingSlackCallback`, `pendingNotionCallback` 선언

  **구현 위치**:
  - Line 132 이후에 Gmail 케이스 추가
  - Line 180 이후에 `pendingGmailCallback` 선언

  **Acceptance Criteria**:
  ```bash
  # 컴파일 확인
  npx tsc --noEmit
  # Assert: No errors

  # Gmail 케이스 존재 확인
  grep -n "gmail" src/main/index.ts | head -5
  # Assert: Shows gmail callback handling code
  ```

  **Commit**: YES (groups with 2, 4)
  - Message: `feat(gmail): add deep link handler for OAuth callback`
  - Files: `src/main/index.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [x] 4. main/index.ts에 Gmail IPC handlers 추가

  **What to do**:
  1. `gmailService` 변수 선언 추가 (line 176 근처)
  2. `createGmailService()` import 추가
  3. IPC handlers 등록 (line 964 이후):
     - `gmail-connect` → `gmailService.startOAuthFlow()`
     - `gmail-disconnect` → `gmailService.disconnect()`
     - `gmail-status` → `gmailService.getConnectionStatus()`
     - `gmail-search` → `gmailService.searchEmails(query, maxResults)`

  **Must NOT do**:
  - 기존 Slack/Notion IPC handlers 수정
  - 새로운 IPC 패턴 도입

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 패턴 복사 + 변수명 변경
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References** (그대로 따라할 코드):
  - `src/main/index.ts:31-32` - Slack/Notion import
  - `src/main/index.ts:175-176` - slackService, notionService 선언
  - `src/main/index.ts:891-926` - Slack IPC handlers
  - `src/main/index.ts:928-964` - Notion IPC handlers

  **구현 위치**:
  - Import: line 32 이후
  - 변수 선언: line 176 이후
  - IPC handlers: line 964 이후

  **Acceptance Criteria**:
  ```bash
  # 컴파일 확인
  npx tsc --noEmit
  # Assert: No errors

  # IPC handler 등록 확인
  grep -c "gmail-" src/main/index.ts
  # Assert: >= 4 (connect, disconnect, status, search)
  ```

  **Commit**: YES (groups with 2, 3)
  - Message: `feat(gmail): add IPC handlers for Gmail integration`
  - Files: `src/main/index.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [x] 5. settings.html에 Gmail 연결 섹션 추가

  **What to do**:
  1. CSS 스타일 추가 (`.gmail-section`, `.gmail-status-box` 등)
  2. HTML 섹션 추가 (Notion 섹션 아래)
  3. JavaScript 로직 추가:
     - `updateGmailStatus()` 함수
     - Connect/Disconnect 버튼 이벤트
     - `gmail-connected`, `gmail-oauth-error` IPC 리스너

  **Must NOT do**:
  - 기존 Slack/Notion 섹션 수정
  - 새로운 UI 패턴 도입 (기존과 동일하게)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: HTML/CSS/JS 복사 + 변수명 변경
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: UI 일관성 확인

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References** (그대로 따라할 코드):
  - `src/renderer/settings.html:340-430` - Slack/Notion CSS 스타일
  - `src/renderer/settings.html:556-584` - Slack/Notion HTML 섹션
  - `src/renderer/settings.html:1019-1100` - Slack JavaScript 로직
  - `src/renderer/settings.html:1106-1186` - Notion JavaScript 로직

  **Gmail 브랜드 컬러**:
  - Primary: `#EA4335` (Google Red)
  - 또는 `#4285F4` (Google Blue)

  **구현 위치**:
  - CSS: line 430 이후 (Notion CSS 다음)
  - HTML: line 584 이후 (Notion 섹션 다음)
  - JavaScript: line 1186 이후 (Notion JS 다음)

  **Acceptance Criteria**:
  ```bash
  # 앱 빌드 및 실행
  npm run pack && open 'release/mac-arm64/Linear Capture.app'
  
  # Settings 화면에서 확인 (Playwright 또는 수동):
  # 1. Gmail 섹션 표시됨
  # 2. "연결 안됨" 상태 표시
  # 3. Connect 버튼 클릭 시 브라우저에서 Google OAuth 페이지 열림
  # 4. 인증 완료 후 앱으로 돌아오면 "xxx@gmail.com 연결됨" 표시
  # 5. Disconnect 버튼 클릭 시 "연결 안됨"으로 변경
  ```

  **Commit**: YES
  - Message: `feat(gmail): add Gmail connection UI to settings`
  - Files: `src/renderer/settings.html`
  - Pre-commit: `npm run build`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 0 | (외부 설정) | - | wrangler secret list |
| 1 | `feat(worker): add Gmail OAuth and search endpoints` | Worker files | curl 테스트 |
| 2, 3, 4 | `feat(gmail): add Gmail client and main process integration` | gmail-client.ts, main/index.ts | npx tsc --noEmit |
| 5 | `feat(gmail): add Gmail connection UI to settings` | settings.html | npm run build |

---

## Success Criteria

### Verification Commands
```bash
# 1. 앱 빌드
npm run pack

# 2. Worker 엔드포인트 확인
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/gmail/status?device_id=test" | jq '.connected'
# Expected: false

# 3. TypeScript 컴파일
npx tsc --noEmit
# Expected: No errors
```

### Final Checklist
- [x] Settings에서 Gmail Connect 버튼 동작
- [x] OAuth 인증 후 연결 상태 표시
- [x] 메일 검색 API 호출 성공
- [x] 토큰 자동 갱신 동작 (1시간 후)
- [x] Disconnect 후 상태 초기화
- [x] 앱 재시작 후 연결 상태 유지

---

## Completion Summary

**완료일**: 2025-01-30

### 배포 정보
- **버전**: v1.2.9
- **커밋**: `3f73742 feat: Gmail/Notion 통합 및 UI 개선 (v1.2.9)`
- **빌드**: `release/Linear Capture-1.2.9-universal.dmg` (177MB)

### 추가 작업 (정리)
- 디버그 console.log 15개 제거 (gmail-client.ts, settings.html, main/index.ts)
- Notion OAuth 클라이언트 추가 (`notion-client.ts`)
- Slack 채널 검색 기능 확장

### 미완료 (추후 작업)
- [ ] 이슈 생성 폼에 Gmail 검색/선택 UI 추가
- [ ] 선택한 메일을 이슈 description에 참조로 첨부
- [ ] AI 기반 관련 메일 자동 추천
