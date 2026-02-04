# Fix AI Analysis Failure

## TL;DR

> **Quick Summary**: AI 분석이 `{success: false}`를 반환하는 버그 수정. 빈 배열 fallback 로직 오류와 디버깅 로그 부족이 원인.
> 
> **Deliverables**:
> - ipc-handlers.ts의 imagePaths fallback 로직 수정
> - 에러 정보를 renderer로 전달하도록 개선
> - 디버깅 로그 추가
> 
> **Estimated Effort**: Quick (30분 이내)
> **Parallel Execution**: NO - sequential
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
AI 분석 기능이 모듈 분할 후 실패함. 콘솔에 `AI analysis ready: {success: false}` 출력.

### Interview Summary
**Key Discussions**:
- 캡처 후 "분석 시작" 버튼 클릭 시 실패
- Worker URL은 정상 (405 응답 확인 - POST 필요)
- 모듈 분할 (index.ts → 6개 파일)로 인한 잠재적 상태 공유 문제 조사

### Root Cause Analysis
**발견된 버그들**:

1. **빈 배열 fallback 버그** (핵심 원인):
   ```typescript
   // ipc-handlers.ts:219
   const imagePaths = state.captureSession?.images.map(img => img.filePath) || [data.filePath];
   ```
   - JavaScript에서 빈 배열 `[]`은 truthy
   - `[] || [data.filePath]` → `[]` (fallback 작동 안 함!)
   - gemini-analyzer.ts:44에서 `imagePaths.length === 0`이면 `{success: false}` 반환

2. **에러 정보 누락**:
   - 분석 실패 시 `{success: false}`만 전달
   - 실제 에러 메시지가 renderer로 전달되지 않음

3. **순환 의존성** (경고):
   - `capture-session.ts` ↔ `window-manager.ts`
   - 동적 import로 완화됨, 즉시 조치 불필요

---

## Work Objectives

### Core Objective
AI 분석 기능이 정상적으로 스크린샷을 분석하고 결과를 반환하도록 수정

### Concrete Deliverables
- `src/main/ipc-handlers.ts` 수정 (imagePaths 로직 + 에러 전달)
- 디버깅 로그 추가

### Definition of Done
- [ ] `npm run pack:clean` 후 앱 실행
- [ ] 캡처 → "분석 시작" 클릭 → AI 분석 결과 정상 표시
- [ ] 에러 발생 시 콘솔에 상세 에러 메시지 출력

### Must Have
- imagePaths가 빈 배열일 때 fallback 정상 작동
- 분석 실패 시 에러 정보 전달

### Must NOT Have (Guardrails)
- 기존 정상 동작 로직 변경 금지
- 불필요한 리팩토링 금지

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (자동 테스트 없음)
- **User wants tests**: Manual-only
- **QA approach**: Manual verification

### Manual Verification Procedure
```bash
# 1. 빌드 및 실행
npm run pack:clean

# 2. 테스트 시나리오
# - 앱에서 Cmd+Shift+L로 캡처
# - 이미지 갤러리에 이미지 표시 확인
# - "분석 시작" 버튼 클릭
# - AI 분석 결과 (제목, 설명 등) 정상 표시 확인

# 3. 에러 케이스 (선택)
# - Worker를 일시적으로 offline으로 만들어 에러 로그 확인
```

---

## TODOs

- [ ] 1. Fix imagePaths fallback logic

  **What to do**:
  - `ipc-handlers.ts:218-220` 수정
  - 빈 배열 체크를 명시적으로 추가
  
  **Before**:
  ```typescript
  ipcMain.handle('reanalyze', async (_event, data: { filePath: string; model: string; instruction?: string }) => {
    const imagePaths = state.captureSession?.images.map(img => img.filePath) || [data.filePath];
    logger.log(`Re-analyzing ${imagePaths.length} image(s) with model: ${data.model}`);
  ```
  
  **After**:
  ```typescript
  ipcMain.handle('reanalyze', async (_event, data: { filePath: string; model: string; instruction?: string }) => {
    // Fix: empty array is truthy, so we need explicit length check
    const sessionImages = state.captureSession?.images.map(img => img.filePath);
    const imagePaths = (sessionImages && sessionImages.length > 0) ? sessionImages : [data.filePath];
    
    logger.log(`Re-analyzing ${imagePaths.length} image(s) with model: ${data.model}`);
    logger.log(`Session state: ${state.captureSession ? `${state.captureSession.images.length} images` : 'null'}`);
    logger.log(`Image paths: ${JSON.stringify(imagePaths)}`);
  ```

  **Must NOT do**:
  - 다른 로직 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **References**:
  - `src/main/ipc-handlers.ts:218-220` - 수정 대상 코드

  **Acceptance Criteria**:
  - [ ] imagePaths가 빈 배열이 아닌 경우 확인
  - [ ] fallback으로 data.filePath 사용 확인

  **Commit**: YES
  - Message: `fix(ipc): fix empty array fallback in reanalyze handler`
  - Files: `src/main/ipc-handlers.ts`

---

- [ ] 2. Add error details to ai-analysis-ready event

  **What to do**:
  - 분석 실패 시 에러 정보를 renderer로 전달
  - `ipc-handlers.ts:253-264` 수정

  **Before**:
  ```typescript
  if (analysisResult.success) {
    logger.log('Re-analysis successful:', analysisResult.title);
    state.mainWindow?.webContents.send('ai-analysis-ready', analysisResult);
  } else {
    state.mainWindow?.webContents.send('ai-analysis-ready', { success: false });
  }
  ```
  
  **After**:
  ```typescript
  if (analysisResult.success) {
    logger.log('Re-analysis successful:', analysisResult.title);
    state.mainWindow?.webContents.send('ai-analysis-ready', analysisResult);
  } else {
    logger.warn('Re-analysis failed:', analysisResult.error || 'Unknown error');
    state.mainWindow?.webContents.send('ai-analysis-ready', { 
      success: false, 
      error: analysisResult.error || 'Analysis failed' 
    });
  }
  ```

  **Also update catch block** (lines 261-264):
  ```typescript
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Re-analyze error:', errorMessage);
    state.mainWindow?.webContents.send('ai-analysis-ready', { 
      success: false, 
      error: errorMessage 
    });
    return { success: false, error: errorMessage };
  }
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **References**:
  - `src/main/ipc-handlers.ts:253-264` - 수정 대상

  **Acceptance Criteria**:
  - [ ] 분석 실패 시 에러 메시지 로깅 확인
  - [ ] renderer에서 에러 정보 수신 가능

  **Commit**: Groups with Task 1
  - Message: `fix(ipc): fix empty array fallback in reanalyze handler`

---

- [ ] 3. Test and verify

  **What to do**:
  - `npm run pack:clean` 실행
  - 앱에서 캡처 후 분석 테스트
  - 개발자 도구에서 로그 확인

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Acceptance Criteria**:
  - [ ] 캡처 후 "분석 시작" → AI 분석 결과 정상 표시
  - [ ] 콘솔에 `Re-analyzing X image(s)` 로그 확인
  - [ ] 콘솔에 `Session state: X images` 로그 확인

  **Commit**: NO (테스트만)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1+2 | `fix(ipc): fix empty array fallback in reanalyze handler` | ipc-handlers.ts | npm run pack:clean |

---

## Success Criteria

### Verification Commands
```bash
npm run pack:clean
# 앱에서 캡처 → 분석 시작 → 결과 확인
```

### Final Checklist
- [ ] AI 분석이 정상 작동
- [ ] 에러 발생 시 상세 정보 표시
- [ ] 기존 기능 정상 유지
