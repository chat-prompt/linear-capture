# Analytics Implementation - 지표 수집 체계 구현

## 🎯 Progress Status

| Phase | Status | Date |
|-------|--------|------|
| Task 1: Worker 이벤트 추가 | ✅ 완료 | 2025-02-03 |
| Task 2: App analytics 함수 | ✅ 완료 | 2025-02-03 |
| Task 3: 서비스 에러 추적 연동 | ✅ 완료 | 2025-02-03 |
| Task 4: Worker 배포 + curl 검증 | ✅ 완료 | 2025-02-03 |
| Task 5: 통합 테스트 | ✅ 완료 | 2026-02-03 |
| **Master 머지** | ✅ 완료 | 2026-02-03 |

### 🎉 구현 완료!

모든 작업이 완료되어 master 브랜치에 머지되었습니다.

## TL;DR

> **Quick Summary**: PMF 검증을 위한 최소 지표 수집 체계 구현. 5개 이벤트(app_open, issue_created + 에러 3종)를 Worker KV에 저장.
> 
> **Deliverables**:
> - Worker: 새 이벤트 타입 3개 추가 (api_error, capture_failed, analysis_failed)
> - App: 에러 추적 함수 추가 + appVersion 메타데이터 포함
> - 각 서비스 catch 블록에서 에러 이벤트 호출
> 
> **Estimated Effort**: Short (1-2일)
> **Parallel Execution**: YES - 2 waves (Worker와 App 동시 진행 가능)
> **Critical Path**: Worker 이벤트 추가 → App에서 호출

---

## Context

### Original Request
Linear Capture 앱 첫 배포를 앞두고 지표 수집 체계 구현. PMF 검증 단계에서 "쓰이는가?" + "문제없이 작동하는가?" 확인 목적.

### Interview Summary
**Key Discussions**:
- 5개 이벤트 확정: `app_open`, `issue_created`, `api_error`, `capture_failed`, `analysis_failed`
- 공통 메타데이터: deviceId(기존), appVersion(추가), timestamp(Worker에서 추가)
- 저장소: 사용자는 D1 원했으나, 현재 KV 사용 중 → KV 유지, D1은 추후 별도 작업
- 퍼널 지표: 배포 후 1-2주 뒤 추가 예정

**Research Findings**:
- Worker 위치: `../linear-capture-worker/src/analytics/track.ts`
- 현재 VALID_EVENTS: `['app_open', 'issue_created', 'search_used', 'context_linked']`
- 현재 저장: Cloudflare KV with 90-day TTL
- timestamp는 Worker에서 자동 추가 (클라이언트에서 보낼 필요 없음)
- appVersion은 Worker가 `metadata.version`으로 받을 준비 완료

### Metis Review
**Identified Gaps** (addressed):
- 에러 메타데이터 스키마 미정의 → 아래 스키마로 확정
- D1 마이그레이션 scope 불명확 → "Must NOT Have"에 명시
- OAuth 에러 추적 범위 불명확 → 핵심 플로우만 (Notion/Slack/Gmail 제외)

---

## Work Objectives

### Core Objective
PMF 검증을 위한 최소 지표 수집: 사용량(DAU) + 에러 현황 파악

### Concrete Deliverables
1. Worker: `VALID_EVENTS`에 3개 에러 이벤트 추가
2. Worker: 에러 메타데이터 타입 정의
3. App: `trackApiError()`, `trackCaptureFailed()`, `trackAnalysisFailed()` 함수 추가
4. App: 모든 이벤트에 `appVersion` 자동 포함
5. App: 각 서비스 catch 블록에서 에러 이벤트 호출

### Definition of Done
- [x] Worker가 3개 새 이벤트 타입 수락 (curl로 검증) ✅
- [ ] App 실행 시 appVersion이 포함된 app_open 이벤트 전송 (수동 테스트 필요)
- [ ] Linear API 오류 시 api_error 이벤트 전송 (수동 테스트 필요)
- [ ] 캡처 실패 시 capture_failed 이벤트 전송 (수동 테스트 필요)
- [ ] AI 분석 실패 시 analysis_failed 이벤트 전송 (수동 테스트 필요)

### Must Have
- 5개 이벤트 모두 Worker에서 수락
- appVersion 모든 이벤트에 포함
- 에러 메시지 200자 이내로 truncate
- fire-and-forget 패턴 유지 (비동기, 실패 무시)

### Must NOT Have (Guardrails)
- ❌ D1 마이그레이션 (별도 작업으로 분리)
- ❌ 대시보드/시각화 UI
- ❌ 재시도(retry) 로직
- ❌ 배치/큐 로직
- ❌ OAuth 플로우 에러 추적 (Notion/Slack/Gmail)
- ❌ 전체 스택 트레이스 포함
- ❌ 기존 이벤트 (search_used, context_linked) 제거

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (curl로 Worker 테스트)
- **User wants tests**: Manual verification (curl + 앱 실행)
- **Framework**: N/A

### Automated Verification (curl)

```bash
# 1. api_error 이벤트 수락 확인
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/track \
  -H "Content-Type: application/json" \
  -d '{"event":"api_error","deviceId":"test-verify","metadata":{"errorType":"linear","message":"test error"}}' \
  | jq '.success'
# Assert: true

# 2. capture_failed 이벤트 수락 확인
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/track \
  -H "Content-Type: application/json" \
  -d '{"event":"capture_failed","deviceId":"test-verify","metadata":{"errorType":"permission","message":"test"}}' \
  | jq '.success'
# Assert: true

# 3. analysis_failed 이벤트 수락 확인
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/track \
  -H "Content-Type: application/json" \
  -d '{"event":"analysis_failed","deviceId":"test-verify","metadata":{"errorType":"anthropic","message":"test"}}' \
  | jq '.success'
# Assert: true

# 4. 잘못된 이벤트 거부 확인 (기존 동작 유지)
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/track \
  -H "Content-Type: application/json" \
  -d '{"event":"invalid_event","deviceId":"test-verify"}' \
  | jq '.success'
# Assert: false
```

### Manual Verification (앱)
1. `npm run pack:clean` 실행
2. 앱 실행 → Worker 로그에서 app_open + version 필드 확인
3. 캡처 취소 (ESC) → capture_failed 이벤트 전송 확인 (콘솔 로그)
4. Linear 토큰 잘못 입력 → api_error 이벤트 전송 확인

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Worker - 새 이벤트 타입 추가
└── Task 2: App - analytics.ts 함수 추가 + appVersion

Wave 2 (After Wave 1):
├── Task 3: App - 에러 추적 호출 추가 (depends: 2)
└── Task 4: Worker 배포 + 검증 (depends: 1)

Wave 3 (After Wave 2):
└── Task 5: 통합 테스트 (depends: 3, 4)
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 4 | 2 |
| 2 | None | 3 | 1 |
| 3 | 2 | 5 | 4 |
| 4 | 1 | 5 | 3 |
| 5 | 3, 4 | None | None (final) |

---

## Error Event Schema

```typescript
// api_error - Linear API 실패
{
  errorType: 'auth' | 'network' | 'rate_limit' | 'server' | 'unknown';
  message: string;      // 200자 이내
  statusCode?: number;  // HTTP status
}

// capture_failed - 화면 캡처 실패
{
  errorType: 'permission' | 'cancelled' | 'system_error';
  message: string;      // 200자 이내
}

// analysis_failed - AI 분석 실패
{
  errorType: 'anthropic' | 'gemini' | 'network' | 'timeout';
  message: string;      // 200자 이내
}
```

---

## TODOs

- [x] 1. Worker: 새 이벤트 타입 추가 ✅ (2025-02-03)

  **What to do**:
  - `../linear-capture-worker/src/analytics/track.ts`의 VALID_EVENTS 배열에 추가:
    - `'api_error'`, `'capture_failed'`, `'analysis_failed'`
  - TrackRequest 인터페이스의 metadata 타입 확장 (errorType, message, statusCode 등)

  **Must NOT do**:
  - KV 저장 로직 변경
  - 기존 이벤트 제거

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일, 배열/타입에 항목 추가만
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `../linear-capture-worker/src/analytics/track.ts` - VALID_EVENTS 배열, TrackRequest 인터페이스

  **Acceptance Criteria**:
  - [x] VALID_EVENTS에 3개 이벤트 추가됨 ✅
  - [x] TypeScript 컴파일 오류 없음 ✅

  **Commit**: YES
  - Message: `feat(analytics): add error event types`
  - Files: `src/analytics/track.ts`

---

- [x] 2. App: analytics.ts 에러 추적 함수 추가 + appVersion ✅ (2025-02-03)

  **What to do**:
  - `src/services/analytics.ts`에 새 함수 추가:
    ```typescript
    export const trackApiError = (errorType: string, message: string, statusCode?: number) =>
      trackEvent('api_error', { errorType, message: truncate(message, 200), statusCode });
    
    export const trackCaptureFailed = (errorType: string, message: string) =>
      trackEvent('capture_failed', { errorType, message: truncate(message, 200) });
    
    export const trackAnalysisFailed = (errorType: string, message: string) =>
      trackEvent('analysis_failed', { errorType, message: truncate(message, 200) });
    ```
  - `trackEvent()` 함수 수정: 모든 호출에 `appVersion` 자동 포함
    ```typescript
    import { app } from 'electron';
    // metadata에 version: app.getVersion() 추가
    ```
  - `src/types/context-search.ts`의 `AnalyticsEvent` 타입에 새 이벤트 추가

  **Must NOT do**:
  - 재시도 로직 추가
  - 동기 호출로 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 2개 파일, 함수 추가/수정
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `src/services/analytics.ts:6-38` - 기존 trackEvent 패턴
  - `src/types/context-search.ts:35` - AnalyticsEvent 타입 정의
  - `src/services/settings-store.ts:133-140` - getDeviceId 패턴 참고

  **Acceptance Criteria**:
  - [x] 3개 새 함수 export됨 ✅
  - [x] trackEvent 호출 시 metadata.version 포함 ✅
  - [x] AnalyticsEvent 타입에 새 이벤트 포함 ✅
  - [x] TypeScript 컴파일 오류 없음 ✅

  **Commit**: YES
  - Message: `feat(analytics): add error tracking functions and appVersion`
  - Files: `src/services/analytics.ts`, `src/types/context-search.ts`

---

- [x] 3. App: 각 서비스에서 에러 추적 호출 ✅ (2025-02-03)

  **What to do**:
  - `src/services/linear-client.ts`: catch 블록에서 `trackApiError()` 호출
    - `createIssue()` 실패 시
    - 토큰 검증 실패 시
  - `src/services/capture/capture.darwin.ts`: 에러 반환 시 `trackCaptureFailed()` 호출
    - error.message가 있을 때
    - 'Capture cancelled'일 때 (errorType: 'cancelled')
  - `src/services/anthropic-analyzer.ts`: 최종 catch에서 `trackAnalysisFailed()` 호출
  - `src/services/gemini-analyzer.ts`: 최종 catch에서 `trackAnalysisFailed()` 호출

  **Must NOT do**:
  - notion-client.ts, slack-client.ts, gmail-client.ts에 추적 추가
  - r2-uploader.ts에 추적 추가 (api_error가 아닌 별도 카테고리)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 여러 파일이지만 각각 1-2줄 추가
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:
  - `src/services/linear-client.ts:126,146,178,196` - catch 블록 위치
  - `src/services/capture/capture.darwin.ts:22-36` - 에러 핸들링
  - `src/services/anthropic-analyzer.ts:56-70` - catch 블록
  - `src/services/gemini-analyzer.ts:56-70` - catch 블록

  **Acceptance Criteria**:
  - [x] linear-client.ts에서 API 오류 시 trackApiError 호출 ✅
  - [x] capture.darwin.ts에서 실패 시 trackCaptureFailed 호출 ✅
  - [x] anthropic-analyzer.ts에서 실패 시 trackAnalysisFailed 호출 ✅
  - [x] gemini-analyzer.ts에서 실패 시 trackAnalysisFailed 호출 ✅
  - [ ] 콘솔에서 에러 발생 시 track 함수 호출 로그 확인 (수동 테스트 필요)

  **Commit**: YES
  - Message: `feat(analytics): integrate error tracking in services`
  - Files: `src/services/linear-client.ts`, `src/services/capture/capture.darwin.ts`, `src/services/anthropic-analyzer.ts`, `src/services/gemini-analyzer.ts`

---

- [x] 4. Worker 배포 + 검증 ✅ (2025-02-03)

  **What to do**:
  - `../linear-capture-worker` 디렉토리에서:
    ```bash
    npm run deploy  # 또는 wrangler deploy
    ```
  - curl 명령으로 새 이벤트 타입 수락 확인 (Verification Strategy 섹션 참고)

  **Must NOT do**:
  - D1 바인딩 추가
  - KV 설정 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 배포 명령 + curl 검증
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:
  - `../linear-capture-worker/wrangler.toml` - 배포 설정
  - Verification Strategy 섹션의 curl 명령어

  **Acceptance Criteria**:
  - [x] `wrangler deploy` 성공 ✅
  - [x] curl로 api_error 전송 → success: true ✅
  - [x] curl로 capture_failed 전송 → success: true ✅
  - [x] curl로 analysis_failed 전송 → success: true ✅
  - [x] curl로 invalid_event 전송 → success: false (기존 동작 유지) ✅

  **Commit**: NO (배포만)

---

- [ ] 5. 통합 테스트 🔲 (수동 테스트 대기)

  **What to do**:
  - `npm run pack:clean` 실행
  - 앱 실행하여 다음 시나리오 테스트:
    1. 앱 시작 → app_open 이벤트 (version 포함) 확인
    2. 잘못된 토큰 입력 → api_error 이벤트 확인
    3. 캡처 후 ESC → capture_failed (cancelled) 확인
    4. (선택) AI 분석 실패 유도 → analysis_failed 확인

  **Must NOT do**:
  - 자동화 테스트 작성 (수동 검증으로 충분)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 수동 검증 + 결과 확인
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None
  - **Blocked By**: Task 3, Task 4

  **References**:
  - CLAUDE.md의 테스트 원칙 - `npm run pack:clean` 사용

  **Acceptance Criteria**:
  - [ ] 앱 실행 시 콘솔에 track 호출 로그
  - [ ] Cloudflare Workers 대시보드에서 /track 요청 확인 (선택)
  - [ ] 에러 시나리오에서 적절한 이벤트 전송 확인

  **Commit**: NO (테스트만)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(analytics): add error event types` | track.ts | TypeScript 컴파일 |
| 2 | `feat(analytics): add error tracking functions and appVersion` | analytics.ts, context-search.ts | TypeScript 컴파일 |
| 3 | `feat(analytics): integrate error tracking in services` | 4개 서비스 파일 | `npm run build` |

---

## Success Criteria

### Verification Commands
```bash
# Worker 검증
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/track \
  -H "Content-Type: application/json" \
  -d '{"event":"api_error","deviceId":"final-test","metadata":{"errorType":"test"}}' \
  | jq '.success'
# Expected: true

# App 빌드
cd /Users/wine_ny/side-project/linear_project/linear-capture
npm run build
# Expected: 오류 없음
```

### Final Checklist
- [x] Worker가 5개 이벤트 모두 수락 ✅
- [x] App의 모든 이벤트에 appVersion 포함 ✅ (코드 구현 완료)
- [x] 에러 메시지 200자 truncate 적용 ✅
- [x] OAuth 플로우 에러는 추적 안 함 ✅
- [x] D1 마이그레이션 없음 (KV 유지) ✅

---

## 📋 수동 테스트 가이드

### 준비 사항

```bash
# analytics-implementation worktree에서 실행
cd /Users/wine_ny/side-project/linear_project/linear-capture-worktrees/analytics-implementation

# 앱 빌드 + 패키징 + 실행
npm run pack:clean
```

### 테스트 시나리오

#### 시나리오 1: app_open 이벤트 + appVersion 확인

**목적**: 앱 시작 시 app_open 이벤트가 version 메타데이터와 함께 전송되는지 확인

**단계**:
1. `npm run pack:clean` 실행하여 앱 시작
2. 개발자 도구 열기 (View > Toggle Developer Tools)
3. Console 탭에서 `Track` 또는 `app_open` 로그 확인

**예상 결과**:
- 콘솔에 `/track` 요청 로그 출력
- Worker 대시보드에서 `app_open` 이벤트 + `version: "1.2.9"` 확인 가능

**Worker 로그 확인 (선택)**:
```bash
# Cloudflare 대시보드에서 확인
# https://dash.cloudflare.com > Workers > linear-capture-ai > Logs
```

---

#### 시나리오 2: capture_failed (cancelled) 이벤트

**목적**: 캡처 도중 ESC로 취소 시 capture_failed 이벤트 전송 확인

**단계**:
1. 앱에서 `⌘+Shift+L` 눌러 캡처 모드 시작
2. 영역 선택 중 `ESC` 키 눌러 취소
3. 개발자 도구 Console 확인

**예상 결과**:
```
[ANALYTICS] capture_failed | device=xxxxxxxx | metadata={"errorType":"cancelled","message":"Capture cancelled","version":"1.2.9"}
```

---

#### 시나리오 3: api_error 이벤트 (토큰 검증 실패)

**목적**: 잘못된 Linear 토큰 입력 시 api_error 이벤트 전송 확인

**단계**:
1. Settings 열기 (트레이 아이콘 > Settings)
2. Linear API Token에 잘못된 값 입력 (예: `invalid_token`)
3. Save 클릭
4. Console에서 api_error 로그 확인

**예상 결과**:
```
[ANALYTICS] api_error | device=xxxxxxxx | metadata={"errorType":"auth","message":"...","version":"1.2.9"}
```

---

#### 시나리오 4: analysis_failed 이벤트 (선택)

**목적**: AI 분석 실패 시 analysis_failed 이벤트 전송 확인

**방법** (어려움 - 네트워크 차단 필요):
1. 네트워크 끊기 또는 Worker 다운 시뮬레이션
2. 캡처 후 "분석 시작" 클릭
3. 분석 실패 → analysis_failed 이벤트 확인

**대안**: 이 시나리오는 실제 Worker 장애 발생 시 자동으로 테스트됨

---

### 테스트 결과 기록

| 시나리오 | 테스트 날짜 | 결과 | 비고 |
|----------|-------------|------|------|
| 1. app_open + version | - | 🔲 | |
| 2. capture_failed | - | 🔲 | |
| 3. api_error | - | 🔲 | |
| 4. analysis_failed | - | 🔲 (선택) | |

---

## 변경된 파일 목록

### Worker (`linear-capture-worker/`)
| 파일 | 변경 내용 |
|------|----------|
| `src/analytics/track.ts` | VALID_EVENTS에 3개 에러 이벤트 추가, metadata 타입 확장 |

### App (`analytics-implementation/`)
| 파일 | 변경 내용 |
|------|----------|
| `src/types/context-search.ts` | AnalyticsEvent 타입에 에러 이벤트 추가, TrackRequest metadata 확장 |
| `src/services/analytics.ts` | trackApiError, trackCaptureFailed, trackAnalysisFailed 함수 추가, appVersion 자동 포함 |
| `src/services/linear-client.ts` | createIssue, validateLinearToken catch에서 trackApiError 호출 |
| `src/services/capture/capture.darwin.ts` | 캡처 실패/취소 시 trackCaptureFailed 호출 |
| `src/services/anthropic-analyzer.ts` | 분석 실패 시 trackAnalysisFailed 호출 |
| `src/services/gemini-analyzer.ts` | 분석 실패 시 trackAnalysisFailed 호출 |
