# 다중 스크린샷 첨부 기능 구현 계획

## 개요

복잡한 스크롤 캡처 UX를 제거하고, **다중 스크린샷 첨부** 기능으로 대체합니다.

### 변경 전/후 비교

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 스크롤 캡처 | `⌘+Shift+Option+L` | 제거 |
| 단일 캡처 | `⌘+Shift+L` → 1장 첨부 | `⌘+Shift+L` → 최대 10장 첨부 |
| UI | 단일 이미지 미리보기 | 갤러리 형태 (썸네일 + 추가/삭제) |
| AI 분석 | 단일 이미지 분석 | 모든 이미지 분석 후 통합 |

---

## Phase 1: 스크롤 캡처 제거 (Cleanup)

### 삭제할 파일
- `src/services/scroll-capture.ts`
- `src/services/image-stitcher.ts`
- `src/renderer/scroll-overlay.html`

### 수정할 파일

**`src/main/index.ts`**:
- 제거: `getScrollCaptureService`, `stitchWithOverlapDetection` import
- 제거: `scrollOverlayWindow` 변수
- 제거: `createScrollOverlayWindow()`, `handleScrollCapture()`, `processScrollCapture()`
- 제거: 스크롤 관련 IPC 핸들러 6개

**`src/main/hotkey.ts`**:
- 제거: `SCROLL_CAPTURE_SHORTCUT`, `registerScrollHotkey()`

**`src/main/tray.ts`**:
- 제거: `onScrollCapture` 콜백, 메뉴 항목

### 검증
- `npm run build` 성공
- `npm run dist:mac` → DMG 설치 후 핫키 작동

---

## Phase 2: 다중 이미지 상태 관리

### 새 상태 구조
```typescript
interface CapturedImage {
  filePath: string;
  uploadedUrl?: string;
}

let captureSession: {
  images: CapturedImage[];
  analysisResult?: AnalysisResult;
} | null = null;
```

### IPC 채널 추가
| 채널 | 방향 | 설명 |
|------|------|------|
| `add-capture` | renderer→main | 추가 캡처 요청 |
| `capture-added` | main→renderer | 새 이미지 추가됨 |
| `remove-capture` | renderer→main | 이미지 삭제 요청 |
| `capture-removed` | main→renderer | 이미지 삭제됨 |

### 수정할 파일

**`src/main/index.ts`**:
- 전역 변수: `capturedFilePath`, `uploadedImageUrl` → `captureSession` 객체
- `handleCapture()`: 세션 있으면 추가, 없으면 새 세션 생성
- 새 IPC 핸들러: `add-capture`, `remove-capture`
- `capture-ready` 이벤트: `images[]` 배열로 전달

---

## Phase 3: 갤러리 UI 구현

### UI 디자인
```
┌─────────────────────────────────────────────────┐
│ [📷1 ×] [📷2 ×] [📷3 ×] [+ Add (3/10)]         │
└─────────────────────────────────────────────────┘
```

### 수정할 파일

**`src/renderer/index.html`**:

1. HTML: `<img id="preview">` → `<div class="image-gallery" id="imageGallery">`

2. CSS:
   - `.image-gallery`: 가로 스크롤, flex 레이아웃
   - `.gallery-item`: 120×90px 썸네일 컨테이너
   - `.gallery-remove`: 우상단 삭제 버튼 (×)
   - `.gallery-add`: + 버튼 (점선 테두리)
   - `.gallery-index`: 좌하단 인덱스 번호

3. JavaScript:
   - `renderGallery()`: 이미지 배열 기반 UI 렌더링
   - `capture-ready` 수정: `images[]` 처리
   - `capture-added`, `capture-removed` 핸들러

---

## Phase 4: 다중 업로드 및 이슈 생성

### 수정할 파일

**`src/main/index.ts`** - `create-issue` 핸들러:
```typescript
// 모든 이미지 병렬 업로드
const uploadResults = await Promise.all(
  captureSession.images.map(img => r2.upload(img.filePath))
);
const imageUrls = uploadResults.filter(r => r.success).map(r => r.url);
```

**`src/services/linear-client.ts`**:
- `CreateIssueParams`에 `imageUrls?: string[]` 추가
- `createIssue()`: 모든 URL을 마크다운 이미지로 변환하여 description에 추가

### 마크다운 출력 예시
```markdown
![Screenshot 1](https://r2.example.com/image1.png)

![Screenshot 2](https://r2.example.com/image2.png)
```

---

## Phase 5: AI 분석 전략

### 결정: 모든 이미지 분석 후 통합

**방식**:
- 모든 이미지를 Gemini Vision에 한 번에 전송 (멀티 이미지 지원)
- 또는 순차 분석 후 결과 병합
- 이슈 생성 시 통합된 제목/설명 생성

### 구현
- `gemini-analyzer.ts` 수정: `analyzeImages(filePaths: string[])` 메서드 추가
- 프롬프트 수정: "아래 N개의 스크린샷을 종합하여..."
- 결과 병합: 가장 높은 우선순위, 통합된 설명

### 동작
- 이슈 생성 버튼 클릭 시 모든 이미지 분석
- 분석 중 로딩 상태 표시
- "Re-analyze" 버튼: 모든 이미지 재분석

---

## Phase 6: 에러 처리 및 폴리시

### 에러 처리
- 일부 업로드 실패 → 성공한 이미지만 포함, 경고 표시
- 폼 제출 중 비활성화 (중복 클릭 방지)

### UI 폴리시
- 업로드 진행 상태: "Uploading 2/3..."
- 윈도우 제목에 이미지 수: "Create Linear Issue (3 images)"
- 최대 10장 도달 시 + 버튼 숨김

### 키보드 단축키
- 폼 열린 상태에서 `⌘+Shift+L` → 추가 캡처 (글로벌 핫키 활용)

---

## 파일 변경 요약

| 파일 | 작업 |
|------|------|
| `src/services/scroll-capture.ts` | **삭제** |
| `src/services/image-stitcher.ts` | **삭제** |
| `src/renderer/scroll-overlay.html` | **삭제** |
| `src/main/index.ts` | 스크롤 제거 + 다중 이미지 로직 |
| `src/main/hotkey.ts` | 스크롤 핫키 제거 |
| `src/main/tray.ts` | 스크롤 메뉴 제거 |
| `src/renderer/index.html` | 갤러리 UI |
| `src/services/linear-client.ts` | 다중 URL 처리 |
| `src/services/gemini-analyzer.ts` | 다중 이미지 분석 지원 |

---

## 검증 계획

### 각 Phase 후 DMG 테스트
```bash
npm run build
npm run dist:mac
# DMG 설치 후:
# - ⌘+Shift+L 작동
# - 이슈 생성 정상
```

### 최종 테스트 시나리오
1. 첫 캡처 → 갤러리에 1장 표시
2. + 클릭 → 2장 추가
3. × 클릭 → 1장 삭제
4. Create Issue → Linear에 모든 이미지 첨부 확인
5. 취소 → 임시 파일 정리 확인
