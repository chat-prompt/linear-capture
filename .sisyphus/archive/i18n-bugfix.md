# i18n 버그 수정 계획

## TL;DR

> **Quick Summary**: 프로덕션 환경에서 번역 파일 경로 오류 및 언어 변경 시 UI 즉시 갱신 안 되는 문제 수정
> 
> **Deliverables**:
> - locales 경로 수정으로 프로덕션에서 다국어 작동
> - 언어 변경 시 모든 창에서 즉시 UI 갱신
> - capture-ready 콜백 async 누락으로 인한 스크립트 파싱 에러 수정
> 
> **Estimated Effort**: Short (30분)
> **Parallel Execution**: NO - sequential
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### 발견된 문제

**문제 1: 설정은 영어인데 메인 UI는 한국어**
- 원인: 프로덕션 빌드에서 `locales/` 경로가 잘못됨
- `process.resourcesPath/locales`를 찾지만, 실제로는 `app.asar/locales/`에 있음
- 결과: 번역 파일 로드 실패 → fallback 언어 사용

**문제 2: 언어 변경해도 바로 안 바뀜**
- 원인: `translatePage()` 호출은 되지만 일부 동적 요소가 갱신 안 됨
- 특히 JavaScript로 생성된 텍스트 (버튼, 상태 메시지 등)

### 현재 구현 상태
- i18n 인프라: ✅ 완료
- 번역 파일: ✅ en/ko 모두 있음
- IPC 핸들러: ✅ 작동
- 경로 설정: ❌ 프로덕션에서 오류

---

## Work Objectives

### Core Objective
프로덕션 환경에서 다국어 기능이 정상 작동하도록 수정

### Concrete Deliverables
- `src/main/i18n.ts`: locales 경로 수정
- `src/renderer/*.html`: 언어 변경 시 동적 요소 갱신 로직 추가

### Definition of Done
- [ ] `npm run pack` 후 앱 실행
- [ ] Settings에서 English → 한국어 변경
- [ ] 모든 창(Settings, Main)이 즉시 한국어로 변경됨
- [ ] 앱 재시작해도 선택한 언어 유지됨

### Must NOT Have (Guardrails)
- 기존 i18n 구조 변경하지 않음
- 새로운 번역 키 추가하지 않음
- CSS/스타일 수정하지 않음

---

## TODOs

### Task 1: locales 경로 수정

**What to do**:
- `src/main/i18n.ts`에서 프로덕션 경로를 `app.getAppPath()`로 변경

**현재 코드**:
```typescript
const localesPath = isDev
  ? path.join(__dirname, '../../locales')
  : path.join(process.resourcesPath!, 'locales');  // ❌ 잘못됨
```

**수정 코드**:
```typescript
const localesPath = isDev
  ? path.join(__dirname, '../../locales')
  : path.join(app.getAppPath(), 'locales');  // ✅ asar 내부 경로
```

**References**:
- `src/main/i18n.ts:19-22` - 현재 경로 설정 코드
- Electron docs: `app.getAppPath()` vs `process.resourcesPath`

**Acceptance Criteria**:
- [ ] 코드 수정 완료
- [ ] `npm run build` 성공

---

### Task 2: 언어 변경 시 동적 요소 갱신

**What to do**:
- 각 HTML 파일의 `language-changed` 리스너에서 동적 요소도 갱신하도록 수정

**파일별 수정 내용**:

#### 2-1. `src/renderer/settings.html`
```javascript
ipcRenderer.on('language-changed', async () => {
  await translatePage();
  // 동적 요소 갱신
  await loadSlackStatus();
  await loadNotionStatus();
  await loadGmailStatus();
});
```

#### 2-2. `src/renderer/index.html`
```javascript
ipcRenderer.on('language-changed', async () => {
  await translatePage();
  // 동적 요소 갱신
  await renderGallery();
  await updateShortcutHint();
  if (slackConnectedStatus) await updateSlackUI({ connected: true });
  if (notionConnectedStatus) await updateNotionUI({ connected: true });
});
```

#### 2-3. `src/renderer/onboarding.html`
```javascript
ipcRenderer.on('language-changed', async () => {
  await translatePage();
  // 단계별 텍스트 갱신 (현재 단계에 맞게)
});
```

**References**:
- `src/renderer/settings.html:752` - 현재 language-changed 리스너
- `src/renderer/index.html:1286` - 현재 language-changed 리스너
- `src/renderer/onboarding.html:344` - 현재 language-changed 리스너

**Acceptance Criteria**:
- [ ] 세 파일 모두 수정 완료
- [ ] `npm run build` 성공

---

### Task 3: capture-ready 콜백 async 누락 수정 (Critical Bug)

**문제 발견 경위**:
- 언어 변경 이벤트가 메인 프로세스에서 캡처 창으로 전송되는 것 확인됨
- 그러나 캡처 창 콘솔에서 `language-changed` 리스너 로그가 안 뜸
- 콘솔에서 `Uncaught SyntaxError: Unexpected identifier 't'` 발견 (라인 1939)

**근본 원인**:
- `ipcRenderer.on('capture-ready', (event, data) => {` 콜백에 `async` 키워드 누락
- 내부에서 `await t('common.none')` 사용 → JavaScript 파싱 에러
- **스크립트 전체가 실행 안 됨** → 모든 이벤트 리스너 미등록

**수정 코드**:
```javascript
// 변경 전 (라인 1889)
ipcRenderer.on('capture-ready', (event, data) => {

// 변경 후
ipcRenderer.on('capture-ready', async (event, data) => {
```

**References**:
- `src/renderer/index.html:1889` - capture-ready 콜백 정의
- `src/renderer/index.html:1939` - await t() 사용 위치

**Acceptance Criteria**:
- [ ] `async` 키워드 추가
- [ ] 캡처 창 콘솔에서 SyntaxError 사라짐
- [ ] `[index.html] Script loading...` 로그 정상 출력

---

### Task 4: 디버깅 로그 제거

**What to do**:
디버깅 중 추가된 console.log 제거

**제거할 로그**:
1. `src/main/index.ts` - `[i18n] Broadcasting...`, `[i18n] Sending to window...`
2. `src/renderer/index.html` - `[index.html] Script loading...`, `[index.html] Registering...`, `[i18n] language-changed...`

**Acceptance Criteria**:
- [ ] 불필요한 디버깅 로그 제거
- [ ] 기능에 필요한 로그만 유지

---

### Task 5: 빌드 및 테스트

**What to do**:
1. `npm run build` - 컴파일
2. `npm run pack` - 앱 패키징
3. 앱 실행 후 수동 테스트

**Test Scenario**:
```
1. 앱 실행 (처음이면 온보딩 표시)
2. 메뉴바 > Settings 열기
3. Language 드롭다운에서 "한국어" 선택
4. 확인: Settings 창이 즉시 한국어로 변경
5. Settings 닫기
6. 단축키로 캡처 창 열기
7. 확인: 캡처 창도 한국어로 표시
8. Language를 "English"로 변경
9. 확인: 모든 창이 영어로 즉시 변경
10. 앱 종료 후 재시작
11. 확인: 마지막 선택한 언어(English) 유지
```

**Acceptance Criteria**:
- [ ] 위 시나리오 모두 통과
- [ ] 콘솔에 에러 없음

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `fix(i18n): correct locales path for production build` | `src/main/i18n.ts` |
| 2 | `fix(i18n): refresh dynamic elements on language change` | `src/renderer/*.html` |
| 3 | `fix(i18n): add async to capture-ready callback` | `src/renderer/index.html` |
| 4 | `chore: remove debugging logs` | `src/main/index.ts`, `src/renderer/index.html` |
| 5 | (테스트만, 커밋 없음) | - |

---

## Success Criteria

### Verification Commands
```bash
npm run build  # 빌드 성공
npm run pack   # 패키징 성공
```

### Final Checklist
- [ ] 프로덕션에서 locales 로드됨
- [ ] 언어 변경 시 모든 UI 즉시 갱신
- [ ] 선택한 언어가 재시작 후에도 유지
- [ ] 기존 테스트 37개 모두 통과
