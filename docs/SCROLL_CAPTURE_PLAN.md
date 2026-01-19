# Scroll Capture 기능 구현 계획

> CleanShot X 스타일의 스크롤 캡처 기능 추가

## 개요

### 목표
- 브라우저, 카톡, 네이티브 앱 등 모든 앱에서 스크롤 캡처 지원
- 사용자가 수동으로 스크롤하면서 여러 프레임 캡처
- 자동 이미지 스티칭으로 하나의 긴 이미지 생성

### 단축키
- 기존 단일 캡처: `⌘+Shift+L`
- 스크롤 캡처 (신규): `⌘+Shift+Option+L`

---

## 핵심 제약사항

| 제약 | 이유 | 해결책 |
|------|------|--------|
| 네이티브 모듈 금지 | DMG 패키징 실패 원인 | Jimp (Pure JS) 사용 |
| 각 Phase 후 DMG 테스트 필수 | 패키징 문제 조기 발견 | 체크리스트 적용 |
| Accessibility 권한 회피 | 복잡한 권한 관리 | 수동 스크롤 방식 |

---

## 사용자 플로우

```
1. ⌘+Shift+Option+L 입력
   ↓
2. 전체 화면 오버레이 표시
   ↓
3. 드래그로 캡처 영역 선택
   ↓
4. "Start" 버튼 클릭
   ↓
5. 사용자가 스크롤하면서 "Capture" 버튼으로 프레임 캡처
   ↓
6. "Done" 버튼 클릭
   ↓
7. 자동 이미지 스티칭
   ↓
8. R2 업로드 + AI 분석
   ↓
9. 이슈 생성 폼 표시
```

---

## 기술 스택

### 이미지 처리
- **Jimp**: Pure JavaScript 이미지 라이브러리
- 네이티브 바인딩 없음 → DMG 패키징 안전
- `blit` / `composite` 메서드로 이미지 합성

### 캡처 방식
- macOS `screencapture -R{x},{y},{w},{h}` 명령어로 특정 영역 캡처
- Electron `exec`로 CLI 호출 (기존 방식 확장)

### 오버랩 감지 알고리즘
```
이미지 A 하단 N픽셀 vs 이미지 B 상단 N픽셀 비교
→ Mean Squared Error (MSE) 최소 위치 찾기
→ 중복 영역 제거 후 합치기
```

---

## Phase 1: Jimp 통합 검증

### 목표
Jimp가 DMG 패키징에서 문제없이 동작하는지 확인

### 작업
1. `package.json`에 jimp 추가
   ```json
   "dependencies": {
     "jimp": "^1.6.0"
   }
   ```
2. `src/services/image-stitcher.ts` 생성 - 기본 세로 합치기
3. 테스트용 IPC 핸들러로 2-3개 이미지 합치기 테스트

### 검증 체크리스트
- [ ] `npm run dist:mac` 성공
- [ ] DMG 앱 실행 정상
- [ ] 기존 캡처 기능 정상

### 예상 시간: 2-3시간

---

## Phase 2: 다중 프레임 캡처 서비스

### 목표
연속 스크린샷을 캡처하고 임시 저장

### 작업
1. `src/services/scroll-capture.ts` 생성
   ```typescript
   export interface ScrollCaptureSession {
     frames: string[];      // 임시 파일 경로 배열
     captureArea: { x: number; y: number; width: number; height: number };
     startTime: number;
     isActive: boolean;
   }

   export class ScrollCaptureService {
     async startSession(area: CaptureArea): Promise<void>;
     async captureFrame(): Promise<string>;  // 프레임 경로 반환
     async endSession(): Promise<string[]>;  // 모든 프레임 경로 반환
     async cancelSession(): Promise<void>;   // 임시 파일 정리
   }
   ```

2. `screencapture -R` 명령어로 특정 영역 캡처
   ```bash
   screencapture -R{x},{y},{width},{height} -x "{filePath}"
   ```

### 검증 체크리스트
- [ ] 연속 캡처 동작
- [ ] DMG 빌드 성공
- [ ] 취소 시 임시 파일 정리

### 예상 시간: 3-4시간

---

## Phase 3: 스크롤 오버레이 UI

### 목표
영역 선택 + 캡처 컨트롤 UI

### 작업
1. `src/renderer/scroll-overlay.html` 생성
   - 투명 배경, 전체 화면
   - CSS로 드래그 영역 선택 구현
   - 컨트롤 바: Start | Capture Frame | Done | Cancel
   - 프레임 카운터 표시

2. `src/main/index.ts` 수정
   - 스크롤 오버레이 윈도우 관리
   - IPC 핸들러 추가

### UI 레이아웃
```
┌─────────────────────────────────────────────┐
│                                             │
│     ┌─────────────────────────┐             │
│     │                         │             │
│     │    선택된 캡처 영역     │             │
│     │                         │             │
│     │                         │             │
│     └─────────────────────────┘             │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ Start │ Capture (3) │ Done │ Cancel │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### IPC 채널
| 채널 | 방향 | 용도 |
|------|------|------|
| `scroll-start` | main→renderer | 오버레이 초기화 |
| `scroll-area-selected` | renderer→main | 영역 선택 완료 |
| `scroll-capture-frame` | renderer→main | 프레임 캡처 요청 |
| `scroll-frame-captured` | main→renderer | 캡처 완료 알림 |
| `scroll-done` | renderer→main | 완료 |
| `scroll-cancel` | renderer→main | 취소 |

### 검증 체크리스트
- [ ] 오버레이 표시/숨김
- [ ] 영역 선택 동작
- [ ] 프레임 캡처 버튼 동작
- [ ] 프레임 카운터 업데이트

### 예상 시간: 4-5시간

---

## Phase 4: 오버랩 감지 및 스마트 스티칭

### 목표
프레임 간 중복 영역 감지 후 자연스럽게 합치기

### 알고리즘

#### 1. 오버랩 감지
```typescript
async function findOverlap(
  imgA: Jimp,
  imgB: Jimp,
  maxOverlap: number = 200  // 최대 검색 범위
): Promise<number> {
  const width = imgA.width;
  let bestOverlap = 0;
  let bestScore = Infinity;

  for (let overlap = 10; overlap <= maxOverlap; overlap += 5) {
    // imgA 하단 overlap 픽셀 vs imgB 상단 overlap 픽셀 비교
    const score = compareRegions(imgA, imgB, overlap);
    if (score < bestScore) {
      bestScore = score;
      bestOverlap = overlap;
    }
  }
  return bestOverlap;
}
```

#### 2. 영역 비교 (MSE)
```typescript
function compareRegions(imgA: Jimp, imgB: Jimp, overlap: number): number {
  let totalDiff = 0;
  const heightA = imgA.height;

  for (let y = 0; y < overlap; y++) {
    for (let x = 0; x < imgA.width; x++) {
      const pixelA = imgA.getPixelColor(x, heightA - overlap + y);
      const pixelB = imgB.getPixelColor(x, y);
      totalDiff += Math.abs(pixelA - pixelB);
    }
  }
  return totalDiff / (overlap * imgA.width);
}
```

#### 3. 스마트 스티칭
```typescript
async function stitchWithOverlapDetection(
  imagePaths: string[],
  outputPath: string
): Promise<StitchResult> {
  const images = await Promise.all(imagePaths.map(p => Jimp.read(p)));

  // 오버랩 계산
  const overlaps: number[] = [];
  for (let i = 0; i < images.length - 1; i++) {
    overlaps.push(await findOverlap(images[i], images[i + 1]));
  }

  // 전체 높이 계산
  const totalHeight = images.reduce((sum, img, i) => {
    return sum + img.height - (overlaps[i] || 0);
  }, 0);

  // 캔버스 생성 및 합성
  const result = new Jimp(images[0].width, totalHeight);
  let currentY = 0;
  for (let i = 0; i < images.length; i++) {
    const cropY = i > 0 ? overlaps[i - 1] : 0;
    const cropped = images[i].clone().crop(0, cropY, images[i].width, images[i].height - cropY);
    result.blit(cropped, 0, currentY);
    currentY += cropped.height;
  }

  await result.writeAsync(outputPath);
  return { success: true, outputPath };
}
```

### 검증 체크리스트
- [ ] 브라우저 콘텐츠 스티칭 정상
- [ ] 네이티브 앱 스티칭 정상
- [ ] 이음새 눈에 안 띔
- [ ] 10+ 프레임 메모리 사용 적정

### 예상 시간: 5-6시간

---

## Phase 5: 기존 플로우 통합

### 목표
스크롤 캡처 → 업로드 → AI 분석 → 이슈 생성

### 작업
1. 핫키 추가 (`src/main/hotkey.ts`)
   ```typescript
   const SCROLL_SHORTCUT = 'CommandOrControl+Shift+Option+L';

   export function registerScrollHotkey(callback: () => void): boolean {
     return globalShortcut.register(SCROLL_SHORTCUT, callback);
   }
   ```

2. 트레이 메뉴 수정 (`src/main/tray.ts`)
   ```typescript
   { label: 'Scroll Capture (⌘+Shift+Option+L)', click: callbacks.onScrollCapture },
   ```

3. 메인 프로세스 통합 (`src/main/index.ts`)
   ```typescript
   async function handleScrollCapture(): Promise<void> {
     // 1. 오버레이 윈도우 표시
     createScrollOverlayWindow();

     // 2. 사용자 캡처 완료 대기 (IPC)

     // 3. 이미지 스티칭
     const stitchedPath = await stitchWithOverlapDetection(framePaths, outputPath);

     // 4. R2 업로드 + AI 분석 (기존 로직 재사용)
     const [uploadResult, analysisResult] = await Promise.all([
       r2.upload(stitchedPath),
       analyzeImage(stitchedPath, projects, users),
     ]);

     // 5. 이슈 생성 폼 표시
     showMainWindow(uploadResult, analysisResult);
   }
   ```

### 검증 체크리스트
- [ ] 전체 플로우 정상 동작
- [ ] 핫키 동작
- [ ] 트레이 메뉴 동작
- [ ] AI 분석이 긴 이미지도 처리

### 예상 시간: 3-4시간

---

## Phase 6 (선택): 자동 스크롤

### 목표
AppleScript로 자동 스크롤 + 캡처

### 작업
1. `osascript`로 스크롤 명령 실행
   ```typescript
   async function autoScroll(pixels: number): Promise<void> {
     await exec(`osascript -e 'tell application "System Events" to scroll down by ${pixels}'`);
   }
   ```

2. 자동 캡처 루프
   ```typescript
   async function autoCapture(): Promise<void> {
     while (isActive) {
       await captureFrame();
       await autoScroll(captureHeight * 0.8);  // 80% 스크롤
       await sleep(300);  // 렌더링 대기

       // 종료 감지: 연속 프레임 유사도 높으면 중단
       if (await isSimilarToLast(lastFrame, currentFrame)) {
         break;
       }
     }
   }
   ```

### 주의사항
- Accessibility 권한 필요 (시스템 환경설정)
- 앱마다 동작 다를 수 있음
- 수동 모드를 기본으로 유지

### 예상 시간: 4-5시간

---

## 파일 변경 요약

| 파일 | 작업 | Phase |
|------|------|-------|
| `package.json` | jimp 추가 | 1 |
| `src/services/image-stitcher.ts` | 새로 생성 | 1, 4 |
| `src/services/scroll-capture.ts` | 새로 생성 | 2 |
| `src/renderer/scroll-overlay.html` | 새로 생성 | 3 |
| `src/main/index.ts` | 오버레이 관리, IPC, 통합 | 3, 5 |
| `src/main/hotkey.ts` | 스크롤 핫키 추가 | 5 |
| `src/main/tray.ts` | 메뉴 항목 추가 | 5 |

---

## 타임라인

| Phase | 내용 | 예상 시간 | 누적 |
|-------|------|----------|------|
| 1 | Jimp 통합 검증 | 2-3시간 | 2-3시간 |
| 2 | 다중 프레임 캡처 | 3-4시간 | 5-7시간 |
| 3 | 스크롤 오버레이 UI | 4-5시간 | 9-12시간 |
| 4 | 오버랩 감지 스티칭 | 5-6시간 | 14-18시간 |
| 5 | 기존 플로우 통합 | 3-4시간 | 17-22시간 |
| 6 | 자동 스크롤 (선택) | 4-5시간 | 21-27시간 |

---

## DMG 테스트 체크리스트

각 Phase 완료 후 실행:

```bash
# 1. DMG 빌드
npm run dist:mac

# 2. 기존 앱 삭제
rm -rf /Applications/Linear\ Capture.app
rm -rf ~/Library/Application\ Support/linear-capture

# 3. DMG 마운트 및 설치
hdiutil attach release/Linear\ Capture-*.dmg
cp -R /Volumes/Linear\ Capture*/Linear\ Capture.app /Applications/
hdiutil detach /Volumes/Linear\ Capture*

# 4. Finder에서 우클릭 → 열기로 실행

# 5. 테스트
# - 기존 캡처 (⌘+Shift+L) 정상 작동
# - 스크롤 캡처 (⌘+Shift+Option+L) 정상 작동
```

---

## 참고 자료

- [Jimp - npm](https://www.npmjs.com/package/jimp) - Pure JS 이미지 처리
- [CleanShot X Scrolling Screenshots](https://scottwillsey.com/cleanshotx-scrolling-screenshots/) - UX 참고
- [ScrollSnap - GitHub](https://github.com/Brkgng/ScrollSnap) - 오픈소스 스크롤 캡처 앱
- [Processing Images with Sharp](https://blog.logrocket.com/processing-images-sharp-node-js/) - 이미지 처리 참고
