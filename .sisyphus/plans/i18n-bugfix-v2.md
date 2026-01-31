# i18n 버그 수정 계획 v2

## TL;DR

> **근본 원인**: `await`를 사용하는 함수/콜백에 `async` 키워드 누락
> 
> **영향**: JavaScript 파싱 에러로 캡처 창 스크립트 전체가 실행 안 됨
> 
> **수정 대상**: `src/renderer/index.html` - 2개 함수 수정
> 
> **예상 시간**: 5분

---

## 근본 원인 분석

### 문제 현상
- Settings에서 언어 변경 → Settings 창만 변경됨
- 캡처 창(메인 UI)은 언어 변경 안 됨

### 진단 결과
1. 캡처 창 DevTools 콘솔에서 **SyntaxError** 발견
2. `await is only valid in async functions` 에러
3. **스크립트 파싱 단계에서 실패** → 모든 이벤트 리스너 미등록
4. `language-changed` 이벤트 리스너도 등록 안 됨 → 언어 변경 불가

### 수정 완료된 항목 (이전 세션)
- [x] `capture-ready` 콜백에 `async` 추가 (라인 1885)
- [x] `ai-analysis-ready` 콜백에 `async` 추가 (라인 2018)

### 남은 수정 항목
| 라인 | 현재 코드 | 수정 코드 |
|------|-----------|-----------|
| 2469 | `function renderSlackResults(messages) {` | `async function renderSlackResults(messages) {` |
| 2522 | `function renderNotionResults(pages) {` | `async function renderNotionResults(pages) {` |

---

## 수정 명령어

```bash
cd /Users/wine_ny/side-project/linear_project/linear-capture-worktrees/i18n

# 1. renderSlackResults 수정
sed -i '' 's/function renderSlackResults(messages) {/async function renderSlackResults(messages) {/' src/renderer/index.html

# 2. renderNotionResults 수정
sed -i '' 's/function renderNotionResults(pages) {/async function renderNotionResults(pages) {/' src/renderer/index.html

# 3. 빌드 및 패키징
npm run build && npm run pack

# 4. 테스트
pkill -f "Linear Capture"
'/Users/wine_ny/side-project/linear_project/linear-capture-worktrees/i18n/release/mac-arm64/Linear Capture.app/Contents/MacOS/Linear Capture' 2>&1
```

---

## 검증 방법

### 1. 콘솔 에러 확인
캡처 창에서 `Cmd+Option+I` → Console 탭
- **성공**: 빨간 에러 없음
- **실패**: `SyntaxError: await is only valid...` 메시지

### 2. 언어 변경 테스트
1. Settings 열기 → Language: English 선택
2. 캡처 창 열기 (Cmd+Shift+L)
3. **성공**: 캡처 창 UI가 영어로 표시
4. **실패**: 여전히 한국어로 표시

### 3. 터미널 로그 확인
```
[i18n] t('capture.title') lang=en => 'Capture'
```
- `capture.title` 로그가 나오면 스크립트 정상 실행됨

---

## 추가 정리 작업 (선택)

디버그 로그 제거 (`src/main/i18n.ts`):
- 라인 45-48의 changeLanguage 로그
- 라인 43-46의 t() 함수 로그

`src/renderer/index.html` 라인 1265:
- `console.log('[index.html] Script loading...');` 제거

---

## 커밋 메시지

```
fix(i18n): add async to functions using await in renderer

- renderSlackResults: add async keyword
- renderNotionResults: add async keyword

This fixes SyntaxError that prevented capture window script from loading,
which blocked language change functionality.
```
