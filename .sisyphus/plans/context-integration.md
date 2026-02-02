# Linear Capture 맥락 통합 (Slack + Notion)

## TL;DR

> **Quick Summary**: Linear Capture 앱에 Slack/Notion 맥락 검색 기능을 추가하여 이슈 생성 시 관련 대화/문서를 첨부할 수 있게 함
> 
> **Deliverables**:
> - Slack OAuth 연동 + 메시지 검색 + 선택 UI
> - Notion OAuth 연동 + 페이지 검색 + 링크 첨부
> - Cloudflare Worker 확장 (OAuth 토큰 관리)
> - 설정 UI (채널 선택, 계정 연결 상태)
> 
> **Estimated Effort**: Large (6-8주)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (Worker 기반) → Task 2-3 (Slack) → Task 4-5 (Notion) → Task 6 (통합)

---

## Context

### Original Request
Linear 이슈 생성 시 Slack, Notion 등의 맥락을 함께 정리해서 자동으로 첨부. Glean과 유사하지만 "이슈 생성 보조"에 집중.

### Interview Summary
**Key Discussions**:
- 개발 경로: Danswer/Onyx 포크 X → 커넥터 코드만 참고해서 직접 구현 ✓
- UX: Linear Capture 플로우 확장 (단일 앱에서 완결)
- MVP: Slack(특정 채널) + Notion(전체 워크스페이스)
- 나중에: Gmail, AI 자동 추천

**Research Findings**:
- Slack: User Token 필요 (`search:read` 스코프), Bot Token으로는 검색 안 됨
- Notion: OAuth 간단, @notionhq/client SDK 사용
- 현재 앱: Electron + TypeScript, Cloudflare Worker로 AI/R2 처리

### Metis Review
**Identified Gaps** (addressed):
- OAuth Flow: 시스템 브라우저 + deep link 방식으로 결정
- Token 저장: Cloudflare Worker(서버)에 저장하되, 앱별 식별자 필요 → device_id 사용
- Token refresh: Notion 토큰 만료 처리 필요 → refresh token 로직 포함
- Rate limiting: Slack 20 req/min, Notion 3 req/sec → 앱에서 쓰로틀링 구현

---

## Work Objectives

### Core Objective
Linear Capture에서 스크린샷 캡처 후, Slack 메시지나 Notion 페이지를 검색해서 관련 맥락을 이슈 설명에 포함할 수 있게 함

### Concrete Deliverables
1. `src/services/slack-client.ts` - Slack OAuth + 검색 서비스
2. `src/services/notion-client.ts` - Notion OAuth + 검색 서비스
3. `src/services/context-manager.ts` - 통합 맥락 관리
4. Cloudflare Worker 확장 - OAuth 엔드포인트들
5. UI 확장 - 맥락 검색 섹션
6. 설정 UI 확장 - 연결된 계정 관리

### Definition of Done
- [ ] Slack OAuth 연결 → 특정 채널에서 메시지 검색 → 선택 → 이슈 설명에 포함
- [ ] Notion OAuth 연결 → 페이지 검색 → 선택 → 이슈에 링크 포함
- [ ] 연결된 계정 해제 가능
- [ ] 오프라인/에러 상태 graceful 처리

### Must Have
- OAuth 연동 (Slack User Token, Notion Integration)
- 키워드 검색
- 검색 결과 선택 및 이슈에 포함
- 연결 상태 표시 및 연결 해제

### Must NOT Have (Guardrails)
- ❌ AI 자동 맥락 추천 (Phase 1-2에서 제외)
- ❌ Gmail 연동 (나중에)
- ❌ 실시간 동기화/인덱싱 (Glean 스타일 X)
- ❌ 전체 채널 검색 (특정 채널만)
- ❌ Slack DM/스레드 검색 (채널 메시지만)
- ❌ Notion 데이터베이스 쿼리 (페이지 검색만)

---

## Global Testing Strategy

### 테스트 원칙
1. **각 Task 완료 후 반드시 테스트** - 다음 Task로 넘어가기 전 검증 필수
2. **자동화 가능한 것은 자동화** - curl, Playwright 사용
3. **OAuth는 수동 테스트 필수** - 실제 계정으로 E2E 테스트
4. **테스트 실패 시 진행 금지** - 모든 테스트 통과 후 다음 단계

### 테스트 유형
| 유형 | 도구 | 용도 |
|------|------|------|
| API 테스트 | curl + jq | Worker 엔드포인트 검증 |
| UI 테스트 | Playwright skill | 앱 UI 동작 검증 |
| 통합 테스트 | 수동 E2E | OAuth 플로우, 실제 서비스 연동 |
| 빌드 테스트 | npm scripts | 컴파일/패키징 성공 확인 |

### 테스트 환경 준비
```bash
# Worker 배포 확인
cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
wrangler whoami

# 앱 빌드 확인
cd /Users/wine_ny/side-project/linear_project/linear-capture
npm run build
npm run pack
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Cloudflare Worker OAuth 기반 구축

Wave 2 (After Task 1):
├── Task 2: Slack OAuth 연동 (Worker 의존)
├── Task 3: Slack 검색 UI (Worker 의존)
├── Task 4: Notion OAuth 연동 (Worker 의존)
└── Task 5: Notion 검색 UI (Worker 의존)

Wave 3 (After Wave 2):
└── Task 6: 통합 및 이슈 생성 연동

Critical Path: Task 1 → Task 2 → Task 3 → Task 6
Parallel Speedup: Task 2-3 (Slack) 와 Task 4-5 (Notion) 병렬 가능
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4, 5 | None (must be first) |
| 2 | 1 | 3, 6 | 4 |
| 3 | 1, 2 | 6 | 5 |
| 4 | 1 | 5, 6 | 2 |
| 5 | 1, 4 | 6 | 3 |
| 6 | 3, 5 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Dispatch |
|------|-------|---------------------|
| 1 | Task 1 | `delegate_task(category="unspecified-high", load_skills=[], ...)` |
| 2 | Task 2, 4 | 병렬로 `delegate_task` 2개 실행 |
| 2 | Task 3, 5 | 각각 2, 4 완료 후 실행 |
| 3 | Task 6 | 모든 Wave 2 완료 후 실행 |

---

## TODOs

### Task 1: Cloudflare Worker OAuth 기반 구축 ✅ COMPLETED

**What to do**:
1. Worker에 device_id 기반 토큰 저장 시스템 추가
   - KV 또는 D1 사용 (device_id → tokens 매핑)
   - 토큰 암호화 저장
2. 공통 OAuth 유틸리티 구현
   - `POST /oauth/token` - 토큰 저장
   - `GET /oauth/token` - 토큰 조회
   - `DELETE /oauth/token` - 토큰 삭제
3. Device ID 생성 및 관리 로직 (Electron 앱에서)

**Must NOT do**:
- Slack/Notion 특화 로직 (다음 태스크에서)
- 사용자 인증 시스템 (device_id만으로 충분)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: 백엔드 인프라 작업, 보안 고려 필요
- **Skills**: `[]`
  - 특별한 스킬 불필요, 일반 TypeScript/Cloudflare 작업

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 1 (단독)
- **Blocks**: Task 2, 3, 4, 5
- **Blocked By**: None (첫 번째 태스크)

**References**:

**Pattern References**:
- `linear-capture-ai/src/index.ts` - 현재 Worker 구조
- `src/services/settings-store.ts` - Electron에서 설정 저장 패턴

**API/Type References**:
- Cloudflare KV: https://developers.cloudflare.com/kv/
- Cloudflare D1: https://developers.cloudflare.com/d1/

**External References**:
- electron-store 암호화: https://github.com/sindresorhus/electron-store#encryptionkey

**WHY Each Reference Matters**:
- Worker 구조 참고해서 일관된 패턴 유지
- settings-store.ts에서 device_id 생성/저장 패턴 활용

---

#### 🧪 Task 1 테스트 계획

**1단계: 사전 조건 확인**
```bash
# Worker 프로젝트 상태 확인
cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
wrangler whoami
# Expected: 로그인된 계정 정보 표시

# KV namespace 확인
wrangler kv:namespace list
# Expected: OAUTH_TOKENS 네임스페이스 존재
```

**2단계: Worker 배포 확인**
```bash
# Worker 배포
wrangler deploy
# Expected: Successfully published 메시지

# Worker 상태 확인
curl -s https://linear-capture-ai.ny-4f1.workers.dev/ | head -20
# Expected: 응답 수신 (에러 아님)
```

**3단계: API 기능 테스트**
```bash
# 테스트 1: 토큰 저장
curl -X POST https://linear-capture-ai.ny-4f1.workers.dev/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"device_id":"test-device-001","service":"slack","tokens":{"access_token":"xoxp-test-token"}}' \
  | jq '.'
# Expected: {"success":true}

# 테스트 2: 토큰 조회
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/oauth/token?device_id=test-device-001&service=slack" \
  | jq '.tokens.access_token'
# Expected: "xoxp-test-token"

# 테스트 3: 토큰 삭제
curl -X DELETE "https://linear-capture-ai.ny-4f1.workers.dev/oauth/token?device_id=test-device-001&service=slack"
# Expected: {"success":true}

# 테스트 4: 삭제 후 조회 (없어야 함)
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/oauth/token?device_id=test-device-001&service=slack" \
  | jq '.success'
# Expected: false
```

**4단계: Electron 앱 통합 확인**
```bash
# 앱 빌드
cd /Users/wine_ny/side-project/linear_project/linear-capture
npm run build
# Expected: 에러 없이 컴파일 완료

# getDeviceId 함수 존재 확인
grep -n "getDeviceId" src/services/settings-store.ts
# Expected: export function getDeviceId 라인 표시
```

**테스트 통과 기준**:
- [ ] wrangler deploy 성공
- [ ] POST /oauth/token → success: true
- [ ] GET /oauth/token → tokens 반환
- [ ] DELETE /oauth/token → success: true
- [ ] npm run build 성공

**Commit**: YES
- Message: `feat(worker): add OAuth token storage system with device_id`
- Files: `linear-capture-ai/src/*`
- Pre-commit: Worker 배포 후 curl 테스트

---

### Task 2: Slack OAuth 연동 ✅ COMPLETED (2025-01-29)

**완료된 내용**:
1. ✅ Worker에 Slack OAuth 엔드포인트 추가
   - `GET /slack/auth` - OAuth 시작
   - `POST /slack/callback` - 토큰 교환 및 저장
   - `GET /slack/channels` - 채널 목록 조회
   - `GET /slack/status` - 연결 상태 확인
   - `DELETE /slack/disconnect` - 연결 해제
   - `GET /slack/search` - 메시지 검색
   - `GET /slack/oauth-redirect` - **HTTPS → deep link 리다이렉트 페이지** (Slack은 custom URL scheme 직접 불가)
2. ✅ Electron 앱에 Slack OAuth 플로우 구현
   - 시스템 브라우저로 OAuth 페이지 열기
   - HTTPS 리다이렉트 페이지 → Deep link로 콜백 처리
   - `src/services/slack-client.ts` 생성
3. ✅ 설정 UI에 Slack 연결 상태 표시
4. ✅ **테스트 완료**: GPTers 워크스페이스 연결 성공 (사용자: ny)

**주요 구현 사항**:
- Slack App Redirect URL: `https://linear-capture-ai.ny-4f1.workers.dev/slack/oauth-redirect`
- Worker가 Slack callback을 받아서 `linear-capture://slack/callback`으로 리다이렉트
- `crypto` import 추가로 `getDeviceId()` 에러 수정

**Must NOT do**:
- 검색 기능 (Task 3에서)
- Bot Token 사용 (User Token만)

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: OAuth 플로우는 보안 민감, 꼼꼼한 구현 필요
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Task 4)
- **Blocks**: Task 3, 6
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `src/services/linear-client.ts` - 서비스 클래스 패턴
- `src/main/index.ts:handleCapture()` - IPC 핸들러 패턴
- `src/renderer/settings.html` - 설정 UI 구조

**API/Type References**:
- Slack OAuth: https://api.slack.com/authentication/oauth-v2
- Slack conversations.list: https://api.slack.com/methods/conversations.list

**External References**:
- @slack/web-api: https://slack.dev/node-slack-sdk/web-api
- Electron deep links: https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app

**WHY Each Reference Matters**:
- linear-client.ts 패턴 따라서 slack-client.ts 구현
- settings.html 구조 확장해서 Slack 연결 상태 표시
- deep link는 OAuth 콜백 처리에 필수

---

#### 🧪 Task 2 테스트 계획

**1단계: 사전 조건 확인**
```bash
# Slack 앱 설정 확인
cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
wrangler secret list
# Expected: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET 존재

# Slack 앱이 없다면 생성 필요:
# 1. https://api.slack.com/apps 방문
# 2. Create New App → From scratch
# 3. OAuth & Permissions에서 User Token Scopes 추가: search:read, channels:read, users:read
# 4. Redirect URL 추가: linear-capture://slack/callback
```

**2단계: Worker 엔드포인트 테스트**
```bash
# Worker 재배포
cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
wrangler deploy

# 테스트 1: OAuth URL 생성
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/slack/auth?device_id=test-123&redirect_uri=linear-capture://slack/callback" \
  | jq '.auth_url'
# Expected: https://slack.com/oauth/v2/authorize?... URL 반환

# 테스트 2: 연결 상태 확인 (연결 전)
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/slack/status?device_id=test-123" \
  | jq '.connected'
# Expected: false

# 테스트 3: 잘못된 파라미터 에러 처리
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/slack/auth" \
  | jq '.error'
# Expected: "device_id is required"
```

**3단계: Electron 앱 빌드 및 파일 확인**
```bash
cd /Users/wine_ny/side-project/linear_project/linear-capture

# 빌드
npm run build
# Expected: 에러 없이 완료

# 파일 존재 확인
ls -la src/services/slack-client.ts
# Expected: 파일 존재

# Deep link 설정 확인
grep -n "linear-capture://" src/main/index.ts
# Expected: deep link 핸들러 코드 존재

# Settings UI에 Slack 섹션 확인
grep -n "slack" src/renderer/settings.html | head -5
# Expected: Slack 관련 HTML 요소 존재
```

**4단계: 실제 OAuth 플로우 테스트 (수동)**
```bash
# 앱 패키징
npm run pack

# 앱 실행
open 'release/mac-arm64/Linear Capture.app'
```

**수동 테스트 체크리스트**:
- [ ] Settings 열기 (메뉴바 아이콘 → Settings)
- [ ] Slack 섹션 표시 확인
- [ ] "Connect Slack" 버튼 클릭
- [ ] 시스템 브라우저에서 Slack OAuth 페이지 열림
- [ ] Slack 워크스페이스 선택 및 권한 허용
- [ ] 앱으로 리다이렉트 (linear-capture://slack/callback)
- [ ] Settings에 "Connected to [워크스페이스명]" 표시
- [ ] "Disconnect" 버튼 표시
- [ ] Disconnect 클릭 → 연결 해제 확인

**5단계: 채널 목록 조회 테스트 (연결 후)**
```bash
# 실제 device_id로 테스트 (앱에서 확인)
DEVICE_ID="실제-device-id"
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/slack/channels?device_id=$DEVICE_ID" \
  | jq '.channels | length'
# Expected: 0 이상의 숫자 (멤버인 채널 수)
```

**테스트 통과 기준**:
- [ ] Worker 배포 성공
- [ ] /slack/auth → auth_url 반환
- [ ] /slack/status → connected 상태 반환
- [ ] 앱 빌드 성공
- [ ] slack-client.ts 파일 존재
- [ ] Settings UI에 Slack 섹션 표시
- [ ] OAuth 플로우 완료 (수동)
- [ ] 연결 상태 표시 (수동)
- [ ] 연결 해제 동작 (수동)

**Commit**: YES
- Message: `feat(slack): add OAuth integration with system browser flow`
- Files: `src/services/slack-client.ts`, `src/main/index.ts`, `src/renderer/settings.html`, `linear-capture-ai/src/*`
- Pre-commit: Worker 배포 + 앱 빌드

---

### Task 3: Slack 검색 UI ✅ COMPLETED (2025-01-29)

**완료된 내용**:
1. ✅ Worker에 Slack 검색 엔드포인트 추가
   - `GET /slack/search` - 메시지 검색 (query params 방식)
   - 파라미터: device_id, query, channels (optional), count (optional)
2. ✅ Electron 앱에 Slack 검색 기능 추가
   - `src/services/slack-client.ts`에 `searchMessages()` 메서드 추가
   - `src/main/index.ts`에 `slack-search` IPC 핸들러 추가
3. ✅ UI에 Slack 검색 섹션 HTML/CSS 추가
   - Context Search 섹션 (접이식)
   - Slack/Notion 탭
   - 검색창 + 검색 버튼
   - 결과 리스트 영역
   - 연결 안됨 상태 UI
4. ✅ UI JavaScript 로직 추가
   - Context 섹션 토글 (접기/펼치기)
   - Slack 연결 상태 확인 및 UI 전환 (연결됨/안됨)
   - 검색 실행 및 결과 렌더링
   - 체크박스로 메시지 선택/해제
   - 선택 개수 표시 + 배지 업데이트
   - 이슈 생성 시 Context 섹션이 Description에 자동 추가됨

**주요 구현 사항**:
- `buildContextSection()` 함수로 Markdown 형식 컨텍스트 생성
- form submit 이벤트에서 capture phase로 description에 컨텍스트 추가
- 선택된 메시지는 `selectedSlackMessages[]` 배열로 관리

**Must NOT do**:
- AI 기반 자동 검색
- 스레드 펼침 (메시지 단위만)
- DM 검색

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
  - Reason: UI 구현이 핵심, 검색 결과 표시 UX 중요
- **Skills**: `["frontend-ui-ux"]`
  - frontend-ui-ux: 검색 UI, 결과 리스트, 선택 상태 등 UX 설계 필요

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Task 5, after Task 2)
- **Blocks**: Task 6
- **Blocked By**: Task 1, 2

**References**:

**Pattern References**:
- `src/renderer/index.html` - 기존 UI 구조 (갤러리, 폼)
- `src/renderer/index.html:addChatMessage()` - 메시지 렌더링 참고
- `src/main/index.ts:ipcMain.handle('reanalyze')` - IPC 패턴

**API/Type References**:
- Slack search.messages: https://api.slack.com/methods/search.messages
- 응답 구조: messages.matches[].text, .user, .ts, .channel.name

**External References**:
- Slack 검색 문법: https://slack.com/help/articles/202528808-Search-in-Slack

**WHY Each Reference Matters**:
- index.html 구조 따라서 검색 섹션 추가
- search.messages 응답 구조 이해해야 UI에 올바르게 표시

---

#### 🧪 Task 3 테스트 계획

**1단계: 사전 조건 확인**
```bash
# Task 2 완료 확인
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/slack/status?device_id=YOUR_DEVICE_ID" \
  | jq '.connected'
# Expected: true (Slack 연결되어 있어야 함)

# Slack에 테스트용 메시지 있는지 확인
# (실제 워크스페이스에 "bug" 또는 "test" 키워드 포함 메시지 필요)
```

**2단계: Worker 검색 엔드포인트 테스트**
```bash
# Worker 재배포
cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
wrangler deploy

# 테스트 1: 검색 API 기본 동작
DEVICE_ID="YOUR_DEVICE_ID"
curl -X POST "https://linear-capture-ai.ny-4f1.workers.dev/slack/search" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\",\"query\":\"test\"}" \
  | jq '.'
# Expected: {"success":true,"messages":[...],"total":N}

# 테스트 2: 채널 필터 적용
curl -X POST "https://linear-capture-ai.ny-4f1.workers.dev/slack/search" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\",\"query\":\"test\",\"channels\":[\"general\"]}" \
  | jq '.messages | length'
# Expected: 0 이상

# 테스트 3: 빈 쿼리 에러 처리
curl -X POST "https://linear-capture-ai.ny-4f1.workers.dev/slack/search" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\",\"query\":\"\"}" \
  | jq '.error'
# Expected: "query is required"

# 테스트 4: 미연결 상태 에러 처리
curl -X POST "https://linear-capture-ai.ny-4f1.workers.dev/slack/search" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"nonexistent-device","query":"test"}' \
  | jq '.error'
# Expected: "Not connected to Slack"
```

**3단계: Electron 앱 통합 테스트**
```bash
cd /Users/wine_ny/side-project/linear_project/linear-capture

# 빌드
npm run build
# Expected: 에러 없이 완료

# IPC 핸들러 존재 확인
grep -n "slack-search" src/main/index.ts
# Expected: ipcMain.handle('slack-search', ...) 존재

# SlackService에 searchMessages 메서드 확인
grep -n "searchMessages" src/services/slack-client.ts
# Expected: async searchMessages 메서드 존재
```

**4단계: UI 테스트 (Playwright 또는 수동)**

**자동화 테스트 (Playwright skill 사용)**:
```
1. 앱 실행 후 메인 화면으로 이동
2. Assert: "Context" 또는 "Slack" 섹션 visible
3. Fill: 검색 입력창에 "test"
4. Click: 검색 버튼
5. Wait: 검색 결과 로딩 완료 (spinner 사라짐)
6. Assert: 검색 결과 리스트 visible OR "No results" 메시지
7. If results exist:
   a. Click: 첫 번째 결과 체크박스
   b. Assert: 선택된 메시지 미리보기 영역에 표시
8. Screenshot: .sisyphus/evidence/task-3-slack-search.png
```

**수동 테스트 체크리스트**:
```bash
# 앱 패키징 및 실행
npm run pack
open 'release/mac-arm64/Linear Capture.app'
```

- [ ] 메인 화면에 Context/Slack 섹션 표시
- [ ] 검색창 표시
- [ ] 채널 필터 드롭다운 표시 (선택사항)
- [ ] 검색어 입력 후 검색 버튼 클릭
- [ ] 로딩 인디케이터 표시
- [ ] 검색 결과 목록 표시 (메시지 텍스트, 작성자, 시간)
- [ ] 각 결과에 체크박스 존재
- [ ] 체크박스 선택 시 선택된 메시지 미리보기 표시
- [ ] 여러 개 선택 가능
- [ ] 선택 해제 동작
- [ ] "No results" 상태 표시 (결과 없을 때)
- [ ] 에러 상태 표시 (네트워크 오류 등)

**5단계: 엣지 케이스 테스트**
```bash
# 테스트: Rate limiting (빠르게 20회 이상 요청)
for i in {1..25}; do
  curl -s -X POST "https://linear-capture-ai.ny-4f1.workers.dev/slack/search" \
    -H "Content-Type: application/json" \
    -d "{\"device_id\":\"$DEVICE_ID\",\"query\":\"test\"}" &
done
wait
# Expected: 일부 요청에서 rate limit 에러 또는 429 응답
```

**테스트 통과 기준**:
- [ ] Worker /slack/search 엔드포인트 동작
- [ ] 검색 결과 올바른 형식으로 반환
- [ ] 채널 필터 동작
- [ ] 에러 케이스 적절히 처리
- [ ] 앱 빌드 성공
- [ ] UI에 검색 섹션 표시
- [ ] 검색 → 결과 표시 플로우 동작
- [ ] 결과 선택 → 미리보기 표시 동작
- [ ] Rate limiting 동작 (선택사항)

**Commit**: YES
- Message: `feat(slack): add message search UI with channel filter`
- Files: `src/renderer/index.html`, `src/services/slack-client.ts`, `src/main/index.ts`, `linear-capture-ai/src/*`
- Pre-commit: 앱 빌드 + UI 스크린샷

---

### Task 4: Notion OAuth 연동

**What to do**:
1. Notion Integration 생성 가이드 문서화
   - https://www.notion.so/my-integrations 에서 생성
   - Capabilities: Read content
2. Worker에 Notion OAuth 엔드포인트 추가
   - `GET /notion/auth` - OAuth 시작
   - `POST /notion/callback` - 토큰 교환 및 저장
   - Refresh token 처리 로직
3. Electron 앱에 Notion OAuth 플로우 구현
   - 시스템 브라우저 + deep link 패턴 (Slack과 동일)
   - `src/services/notion-client.ts` 생성
4. 설정 UI에 Notion 연결 상태 표시

**Must NOT do**:
- 검색 기능 (Task 5에서)
- 데이터베이스 쿼리 기능

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: OAuth 플로우 구현
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Task 2)
- **Blocks**: Task 5, 6
- **Blocked By**: Task 1

**References**:

**Pattern References**:
- `src/services/slack-client.ts` (Task 2에서 생성) - OAuth 패턴 동일하게
- `src/renderer/settings.html` - Slack 연결 UI 옆에 Notion 추가

**API/Type References**:
- Notion OAuth: https://developers.notion.com/docs/authorization
- Token refresh: https://developers.notion.com/reference/create-a-token

**External References**:
- @notionhq/client: https://github.com/makenotion/notion-sdk-js

**WHY Each Reference Matters**:
- Slack OAuth 패턴 재사용하면 일관성 유지
- Notion은 token refresh 필요해서 별도 처리

---

#### 🧪 Task 4 테스트 계획

**1단계: 사전 조건 확인**
```bash
# Notion Integration 설정 확인
cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
wrangler secret list
# Expected: NOTION_CLIENT_ID, NOTION_CLIENT_SECRET 존재

# Notion Integration이 없다면 생성 필요:
# 1. https://www.notion.so/my-integrations 방문
# 2. New integration 클릭
# 3. Public integration 선택
# 4. Capabilities: Read content
# 5. OAuth Domain & URIs 설정: Redirect URI = linear-capture://notion/callback
```

**2단계: Worker 엔드포인트 테스트**
```bash
# Worker 재배포
cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
wrangler deploy

# 테스트 1: OAuth URL 생성
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/auth?device_id=test-123&redirect_uri=linear-capture://notion/callback" \
  | jq '.auth_url'
# Expected: https://api.notion.com/v1/oauth/authorize?... URL 반환

# 테스트 2: 연결 상태 확인 (연결 전)
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/status?device_id=test-123" \
  | jq '.connected'
# Expected: false

# 테스트 3: 에러 처리
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/auth" \
  | jq '.error'
# Expected: "device_id is required"
```

**3단계: Electron 앱 빌드 확인**
```bash
cd /Users/wine_ny/side-project/linear_project/linear-capture

# 빌드
npm run build
# Expected: 에러 없이 완료

# 파일 존재 확인
ls -la src/services/notion-client.ts
# Expected: 파일 존재

# Deep link 핸들러 확인
grep -n "notion/callback" src/main/index.ts
# Expected: notion deep link 핸들러 존재

# Settings UI에 Notion 섹션 확인
grep -n "notion" src/renderer/settings.html | head -5
# Expected: Notion 관련 HTML 요소 존재
```

**4단계: 실제 OAuth 플로우 테스트 (수동)**
```bash
# 앱 패키징
npm run pack

# 앱 실행
open 'release/mac-arm64/Linear Capture.app'
```

**수동 테스트 체크리스트**:
- [ ] Settings 열기
- [ ] Notion 섹션 표시 확인
- [ ] "Connect Notion" 버튼 클릭
- [ ] 시스템 브라우저에서 Notion OAuth 페이지 열림
- [ ] Notion 워크스페이스 선택
- [ ] 접근 권한 페이지 선택
- [ ] 권한 허용
- [ ] 앱으로 리다이렉트
- [ ] Settings에 "Connected to [워크스페이스명]" 표시
- [ ] "Disconnect" 버튼 표시
- [ ] Disconnect 클릭 → 연결 해제 확인

**5단계: Token Refresh 테스트 (장기)**
```
- Notion 토큰 만료 시 자동 갱신 확인 필요
- 실제 만료까지 시간이 걸리므로 수동 테스트 또는 mock 필요
```

**테스트 통과 기준**:
- [ ] Worker 배포 성공
- [ ] /notion/auth → auth_url 반환
- [ ] /notion/status → connected 상태 반환
- [ ] 앱 빌드 성공
- [ ] notion-client.ts 파일 존재
- [ ] Settings UI에 Notion 섹션 표시
- [ ] OAuth 플로우 완료 (수동)
- [ ] 연결 상태 표시 (수동)
- [ ] 연결 해제 동작 (수동)

**Commit**: YES
- Message: `feat(notion): add OAuth integration with token refresh`
- Files: `src/services/notion-client.ts`, `src/main/index.ts`, `src/renderer/settings.html`, `linear-capture-ai/src/*`
- Pre-commit: Worker 배포 + 앱 빌드

---

### Task 5: Notion 검색 UI

**What to do**:
1. Worker에 Notion 검색 프록시 추가
   - `POST /notion/search` - 페이지/DB 검색
   - Rate limiting 구현 (3 req/sec)
2. Electron 앱에 Notion 검색 기능 추가
   - `src/services/notion-client.ts`에 검색 메서드 추가
   - IPC 핸들러 추가
3. UI에 Notion 검색 섹션 추가
   - 검색창 (전체 워크스페이스 검색)
   - 검색 결과 리스트 (페이지 제목, 아이콘, 마지막 수정 시간)
   - 선택 체크박스
   - 선택된 페이지 링크 표시
4. 선택된 Notion 페이지 링크를 이슈에 포함하는 로직

**Must NOT do**:
- 데이터베이스 row 쿼리
- 페이지 본문 내용 가져오기 (제목/링크만)
- 특정 페이지 범위 제한

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
  - Reason: UI 구현, Slack 검색 UI와 일관된 UX
- **Skills**: `["frontend-ui-ux"]`

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Task 3, after Task 4)
- **Blocks**: Task 6
- **Blocked By**: Task 1, 4

**References**:

**Pattern References**:
- `src/renderer/index.html` - Task 3에서 추가한 Slack 검색 UI 옆에
- Slack 검색 UI 패턴 동일하게 Notion에 적용

**API/Type References**:
- Notion search: https://developers.notion.com/reference/post-search
- 응답 구조: results[].object, .id, .url, .properties.title

**WHY Each Reference Matters**:
- Slack UI 패턴 따라서 일관된 UX 제공
- Notion search API 응답 구조 이해 필요

---

#### 🧪 Task 5 테스트 계획

**1단계: 사전 조건 확인**
```bash
# Task 4 완료 확인
curl -s "https://linear-capture-ai.ny-4f1.workers.dev/notion/status?device_id=YOUR_DEVICE_ID" \
  | jq '.connected'
# Expected: true (Notion 연결되어 있어야 함)

# Notion에 테스트용 페이지 있는지 확인
# (검색할 수 있는 페이지가 Integration에 공유되어 있어야 함)
```

**2단계: Worker 검색 엔드포인트 테스트**
```bash
# Worker 재배포
cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
wrangler deploy

# 테스트 1: 검색 API 기본 동작
DEVICE_ID="YOUR_DEVICE_ID"
curl -X POST "https://linear-capture-ai.ny-4f1.workers.dev/notion/search" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\",\"query\":\"meeting\"}" \
  | jq '.'
# Expected: {"success":true,"results":[...],"total":N}

# 테스트 2: 빈 쿼리 (전체 목록)
curl -X POST "https://linear-capture-ai.ny-4f1.workers.dev/notion/search" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\",\"query\":\"\"}" \
  | jq '.results | length'
# Expected: 0 이상 (공유된 페이지 수)

# 테스트 3: 미연결 상태 에러
curl -X POST "https://linear-capture-ai.ny-4f1.workers.dev/notion/search" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"nonexistent","query":"test"}' \
  | jq '.error'
# Expected: "Not connected to Notion"
```

**3단계: Electron 앱 통합 테스트**
```bash
cd /Users/wine_ny/side-project/linear_project/linear-capture

# 빌드
npm run build
# Expected: 에러 없이 완료

# IPC 핸들러 확인
grep -n "notion-search" src/main/index.ts
# Expected: ipcMain.handle('notion-search', ...) 존재

# NotionService에 search 메서드 확인
grep -n "search" src/services/notion-client.ts
# Expected: search 관련 메서드 존재
```

**4단계: UI 테스트 (수동)**
```bash
# 앱 패키징 및 실행
npm run pack
open 'release/mac-arm64/Linear Capture.app'
```

**수동 테스트 체크리스트**:
- [ ] 메인 화면에 Context 섹션 내 Notion 탭 표시
- [ ] Notion 탭 클릭 시 검색창 표시
- [ ] 검색어 입력 후 검색
- [ ] 검색 결과 목록 표시 (페이지 제목, 아이콘)
- [ ] 각 결과에 체크박스 존재
- [ ] 체크박스 선택 시 선택된 페이지 미리보기
- [ ] 페이지 URL 링크 표시
- [ ] 여러 개 선택 가능
- [ ] "No results" 상태 (결과 없을 때)

**5단계: Rate Limiting 테스트**
```bash
# 빠르게 여러 요청 (3/sec 제한)
for i in {1..10}; do
  curl -s -X POST "https://linear-capture-ai.ny-4f1.workers.dev/notion/search" \
    -H "Content-Type: application/json" \
    -d "{\"device_id\":\"$DEVICE_ID\",\"query\":\"test\"}" &
done
wait
# Expected: 일부 요청에서 rate limit 처리
```

**테스트 통과 기준**:
- [ ] Worker /notion/search 엔드포인트 동작
- [ ] 검색 결과 올바른 형식 (title, url, icon)
- [ ] 에러 케이스 처리
- [ ] 앱 빌드 성공
- [ ] UI에 Notion 검색 섹션 표시
- [ ] 검색 → 결과 표시 플로우 동작
- [ ] 결과 선택 → 미리보기 표시 동작

**Commit**: YES
- Message: `feat(notion): add page search UI`
- Files: `src/renderer/index.html`, `src/services/notion-client.ts`, `src/main/index.ts`, `linear-capture-ai/src/*`
- Pre-commit: 앱 빌드 + UI 스크린샷

---

### Task 6: 통합 및 이슈 생성 연동

**What to do**:
1. `src/services/context-manager.ts` 생성
   - 선택된 Slack 메시지 + Notion 페이지 통합 관리
   - 이슈 설명에 포함할 마크다운 생성
2. 이슈 생성 플로우 수정
   - 선택된 맥락을 설명에 자동 추가
   - 형식: `## Related Context\n### Slack\n- [message](link)\n### Notion\n- [page](link)`
3. 맥락 미리보기 UI
   - 이슈 설명 미리보기에 맥락 포함 표시
4. 에러 처리 및 엣지 케이스
   - OAuth 만료 시 재연결 유도
   - 검색 실패 시 graceful degradation
   - 오프라인 시 맥락 섹션 비활성화

**Must NOT do**:
- 맥락 내용 전체 복사 (링크만)
- AI 요약

**Recommended Agent Profile**:
- **Category**: `unspecified-high`
  - Reason: 통합 로직, 에러 처리, 전체 플로우 완성
- **Skills**: `[]`

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Wave 3 (단독, 마지막)
- **Blocks**: None (최종 태스크)
- **Blocked By**: Task 3, 5

**References**:

**Pattern References**:
- `src/main/index.ts:create-issue` - 기존 이슈 생성 IPC
- `src/services/linear-client.ts:createIssue()` - 이슈 생성 로직
- `src/renderer/index.html:submitForm()` - 폼 제출 로직

**WHY Each Reference Matters**:
- 기존 이슈 생성 플로우에 맥락 포함 로직 추가
- 마크다운 형식 일관되게 생성

---

#### 🧪 Task 6 테스트 계획

**1단계: 사전 조건 확인**
```bash
# Task 3, 5 완료 확인
# Slack 검색 동작 확인
curl -X POST "https://linear-capture-ai.ny-4f1.workers.dev/slack/search" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\",\"query\":\"test\"}" \
  | jq '.success'
# Expected: true

# Notion 검색 동작 확인
curl -X POST "https://linear-capture-ai.ny-4f1.workers.dev/notion/search" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEVICE_ID\",\"query\":\"test\"}" \
  | jq '.success'
# Expected: true
```

**2단계: context-manager.ts 유닛 테스트**
```bash
cd /Users/wine_ny/side-project/linear_project/linear-capture

# 파일 존재 확인
ls -la src/services/context-manager.ts
# Expected: 파일 존재

# 마크다운 생성 함수 확인
grep -n "generateContextMarkdown" src/services/context-manager.ts
# Expected: 함수 존재

# 빌드
npm run build
# Expected: 에러 없이 완료
```

**3단계: 통합 플로우 E2E 테스트 (수동)**
```bash
# 앱 패키징 및 실행
npm run pack
open 'release/mac-arm64/Linear Capture.app'
```

**수동 테스트 체크리스트 - 전체 플로우**:

**Phase A: 캡처 + 컨텍스트 선택**
- [ ] ⌘+Shift+L로 스크린샷 캡처
- [ ] 캡처 이미지 갤러리에 표시
- [ ] Context 섹션 표시됨

**Phase B: Slack 컨텍스트 추가**
- [ ] Slack 탭 선택
- [ ] "bug" 검색
- [ ] 검색 결과 중 1-2개 선택
- [ ] 선택된 메시지 미리보기 표시

**Phase C: Notion 컨텍스트 추가**
- [ ] Notion 탭 선택
- [ ] "spec" 검색
- [ ] 검색 결과 중 1개 선택
- [ ] 선택된 페이지 미리보기 표시

**Phase D: 이슈 생성**
- [ ] Title 입력
- [ ] Description 미리보기에 "Related Context" 섹션 표시
- [ ] Slack 링크 목록 표시
- [ ] Notion 링크 목록 표시
- [ ] Team, Project 선택
- [ ] "Create Issue" 클릭
- [ ] 성공 화면 표시
- [ ] "View in Linear" 클릭 → Linear에서 이슈 열림

**Phase E: Linear에서 결과 확인**
- [ ] 이슈 설명에 "## Related Context" 섹션 존재
- [ ] "### Slack" 하위에 메시지 링크들
- [ ] "### Notion" 하위에 페이지 링크들
- [ ] 각 링크 클릭 시 원본으로 이동

**4단계: 엣지 케이스 테스트 (수동)**

**케이스 1: 컨텍스트 없이 이슈 생성**
- [ ] 컨텍스트 선택 안 함
- [ ] Create Issue
- [ ] 이슈 설명에 Related Context 섹션 없음 (또는 빈 상태)

**케이스 2: Slack만 선택**
- [ ] Slack 메시지만 선택, Notion 없음
- [ ] Create Issue
- [ ] Slack 링크만 포함, Notion 섹션 없음

**케이스 3: 연결 해제 상태**
- [ ] Settings에서 Slack/Notion 연결 해제
- [ ] 메인 화면에서 Context 섹션 비활성화 또는 "Connect" 유도 메시지

**케이스 4: 네트워크 오류**
- [ ] 인터넷 끊기
- [ ] 검색 시도
- [ ] 에러 메시지 표시 (앱 크래시 없음)

**케이스 5: 토큰 만료 (시뮬레이션)**
- [ ] Worker에서 토큰 수동 삭제
- [ ] 검색 시도
- [ ] "Session expired, please reconnect" 메시지
- [ ] Settings로 이동 유도

**5단계: 성능 테스트**
```bash
# 대량 컨텍스트 선택 (10개 이상)
# - Slack 메시지 5개 선택
# - Notion 페이지 5개 선택
# - Create Issue
# Expected: 2-3초 내 완료, UI 멈춤 없음
```

**테스트 통과 기준**:
- [ ] context-manager.ts 존재 및 빌드 성공
- [ ] 전체 E2E 플로우 동작 (캡처 → 컨텍스트 → 이슈 생성)
- [ ] Linear 이슈에 Related Context 섹션 포함
- [ ] 링크 클릭 시 원본 이동
- [ ] 컨텍스트 없이도 이슈 생성 가능
- [ ] 부분 컨텍스트 (Slack만/Notion만) 동작
- [ ] 연결 해제 상태 처리
- [ ] 네트워크 오류 graceful 처리
- [ ] 토큰 만료 처리

**Commit**: YES
- Message: `feat(context): integrate Slack/Notion context into issue creation`
- Files: `src/services/context-manager.ts`, `src/main/index.ts`, `src/renderer/index.html`, `src/services/linear-client.ts`
- Pre-commit: 앱 빌드 + 전체 플로우 테스트

---

## Commit Strategy

| After Task | Message | Key Files |
|------------|---------|-----------|
| 1 | `feat(worker): add OAuth token storage system` | Worker |
| 2 | `feat(slack): add OAuth integration` | slack-client.ts, settings |
| 3 | `feat(slack): add message search UI` | index.html, slack-client.ts |
| 4 | `feat(notion): add OAuth integration` | notion-client.ts, settings |
| 5 | `feat(notion): add page search UI` | index.html, notion-client.ts |
| 6 | `feat(context): integrate into issue creation` | context-manager.ts, linear-client.ts |

---

## Success Criteria

### Final Checklist
- [ ] Slack OAuth 연결 및 해제 가능
- [ ] Notion OAuth 연결 및 해제 가능
- [ ] Slack 메시지 검색 동작 (특정 채널)
- [ ] Notion 페이지 검색 동작 (전체 워크스페이스)
- [ ] 선택한 맥락이 이슈 설명에 포함됨
- [ ] 에러 상태 graceful 처리
- [ ] Rate limiting 동작 (Slack 20/min, Notion 3/sec)

### Manual E2E Test Scenario
1. 앱 실행 → 설정에서 Slack 연결
2. 설정에서 Notion 연결
3. 스크린샷 캡처
4. Slack에서 "bug" 검색 → 메시지 선택
5. Notion에서 "spec" 검색 → 페이지 선택
6. Create Issue
7. Linear에서 생성된 이슈 확인 → Related Context 섹션 확인

---

## 테스트 진행 현황

| Task | 구현 | API 테스트 | UI 테스트 | E2E 테스트 | 비고 |
|------|------|-----------|----------|-----------|------|
| 1 | ✅ | ✅ | N/A | N/A | Worker 배포 완료, curl 테스트 통과 |
| 2 | ✅ | ✅ | ✅ | ✅ | OAuth 플로우 완료! GPTers 워크스페이스 연결됨 |
| 3 | ✅ | ✅ | ✅ | ✅ | Context Search UI + JS 로직 완료 (2025-01-29) |
| 4 | ✅ | ✅ | ✅ | ✅ | Notion OAuth 완료! (2025-01-29) |
| 5 | ⬜ | ⬜ | ⬜ | ⬜ | Notion 검색 UI - 대기 |
| 6 | ⬜ | ⬜ | ⬜ | ⬜ | 통합 - Task 3만으로 기본 기능 동작 (Slack만) |

### Task 4 완료 사항 (2025-01-29)
- ✅ Notion Public Integration 생성 (Client ID: `2f7d872b-594c-809a-8c9f-0037d07f424e`)
- ✅ Worker: `src/notion/oauth.ts` 모듈 생성
  - `handleNotionAuth()` - OAuth 시작 URL 생성
  - `handleNotionCallback()` - 토큰 교환 (Basic Auth)
  - `handleNotionStatus()` - 연결 상태 확인
  - `handleNotionDisconnect()` - 연결 해제
  - `refreshNotionToken()` - 토큰 갱신 (refresh_token 지원)
  - `getValidNotionToken()` - 유효한 토큰 반환 (자동 갱신)
- ✅ Worker: `index.ts`에 Notion 라우트 추가
  - `GET /notion/auth`
  - `POST /notion/callback`
  - `GET /notion/status`
  - `DELETE /notion/disconnect`
  - `GET /notion/oauth-redirect` (deep link 리다이렉트)
- ✅ Worker: wrangler secrets 등록 (NOTION_CLIENT_ID, NOTION_CLIENT_SECRET)
- ✅ App: `src/services/notion-client.ts` 생성 (Slack 패턴 동일)
- ✅ App: `src/main/index.ts`에 Notion deep link 핸들러 + IPC 핸들러 추가
- ✅ App: `src/renderer/settings.html`에 Notion 연결 UI 섹션 추가
- ✅ E2E 테스트: Notion 워크스페이스 연결 성공

### Task 3 완료 사항 (2025-01-29)
- ✅ Worker: `GET /slack/search` 엔드포인트 구현 및 배포
- ✅ App: `slack-client.ts`에 `searchMessages()` 메서드 추가
- ✅ App: `main/index.ts`에 `slack-search` IPC 핸들러 추가
- ✅ App: `index.html`에 Context Search 섹션 HTML/CSS 추가
- ✅ App: `index.html`에 JavaScript 로직 추가 완료
  - Context 섹션 토글 (접기/펼치기)
  - Slack 연결 상태 확인 및 UI 전환
  - 검색 실행 및 결과 렌더링 (채널, 사용자, 시간, 메시지 텍스트)
  - 체크박스로 메시지 선택/해제
  - 선택 개수 표시 + 배지 업데이트
  - `buildContextSection()`: 이슈 생성 시 Description에 Context 섹션 자동 추가

### 다음 단계
- ✅ Task 4 완료: Notion OAuth 연동 완료
- ⏳ Task 5 대기: Notion 검색 UI 구현
  - Worker: `POST /notion/search` 엔드포인트 추가
  - App: `notion-client.ts`에 `searchPages()` 메서드 추가
  - App: `index.html`에 Notion 탭 활성화 + 검색 UI 추가
- ⏳ Task 6 대기: Slack + Notion 통합 Context 섹션

### 현재 사용 가능한 기능 (v1.2.8)
1. ⌘+Shift+L 캡처
2. Context Search 섹션에서 Slack 메시지 검색 + 선택
3. 이슈 생성 시 Description에 `## Context` 섹션 자동 추가
4. Settings에서 Slack/Notion 연결 관리
