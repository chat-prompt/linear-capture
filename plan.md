# Linear Capture - Windows 크로스 플랫폼 지원 계획

> **목표**: macOS 전용 앱을 Windows에서도 동작하도록 확장  
> **버전**: v2.0.0  
> **예상 작업량**: ~13시간  
> **작성일**: 2025-01-25  
> **브랜치**: `feature/windows-support`

---

## 브랜치 전략

```
master (현재 macOS 버전)
   │
   └── feature/windows-support (Windows 개발)
          │
          ├── Phase 1-5 작업
          │
          └── 완료 후 master에 PR 머지 → v2.0.0 릴리즈
```

### 브랜치 생성

```bash
git checkout -b feature/windows-support
git push -u origin feature/windows-support
```

### 머지 전략

- **Squash Merge** 권장: Windows 지원 관련 커밋을 하나로 정리
- PR 제목: `feat: Windows cross-platform support`
- 머지 후 `master`에서 `npm version minor` → v2.0.0

---

## 현재 상태 분석

### 플랫폼 의존성 현황

| 영역 | 현재 상태 | 의존성 | 난이도 |
|------|----------|--------|--------|
| **화면 캡처** | `screencapture` CLI | macOS 전용 | :red_circle: High |
| **권한 시스템** | `getMediaAccessStatus`, `x-apple.systempreferences:` | macOS TCC | :red_circle: High |
| **창 스타일** | `titleBarStyle: 'hiddenInset'`, `setWindowButtonVisibility` | macOS 전용 | :yellow_circle: Medium |
| **Tray 아이콘** | `setTemplateImage(true)` | macOS 전용 | :yellow_circle: Medium |
| **단축키** | `CommandOrControl+Shift+L` | 크로스 플랫폼 | :green_circle: Done |
| **빌드 설정** | `dist:mac` only | macOS 전용 | :yellow_circle: Medium |
| **CI/CD** | `macos-latest` | macOS 전용 | :green_circle: Low |

### 영향받는 파일

```
src/
├── services/
│   └── capture.ts              # 완전 재작성 필요
├── main/
│   ├── index.ts                # 플랫폼 분기 추가
│   └── tray.ts                 # 플랫폼 분기 추가
```

---

## 아키텍처 설계

### 핵심 원칙

> **"맥 버전 개선하면 윈도우도 같이 개선되게"**

- 인터페이스 기반 추상화로 플랫폼별 구현 분리
- 공통 로직은 한 곳에서 관리
- `process.platform` 분기는 최소화

### 폴더 구조 변경

```
src/
├── main/
│   ├── index.ts                # 플랫폼 분기 추가 (최소한)
│   ├── hotkey.ts               # 변경 없음
│   └── tray.ts                 # 플랫폼 분기 추가
├── renderer/                   # 변경 없음
│   └── ...
└── services/
    ├── capture/                        # NEW: 캡처 서비스 모듈
    │   ├── index.ts                   # 인터페이스 + 팩토리
    │   ├── capture.darwin.ts          # macOS 구현 (기존 로직)
    │   └── capture.win32.ts           # Windows 구현 (신규)
    ├── linear-client.ts               # 변경 없음
    ├── r2-uploader.ts                 # 변경 없음
    └── ...

assets/
├── icon.icns                   # macOS (기존)
├── icon.ico                    # NEW: Windows
├── tray-icon.png               # macOS (기존)
└── tray-icon.ico               # NEW: Windows (선택)
```

### Capture 서비스 인터페이스

```typescript
// src/services/capture/index.ts

export interface CaptureResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface ICaptureService {
  /** 화면 캡처 권한 상태 확인 */
  checkPermission(): 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
  
  /** 영역 선택 캡처 실행 */
  captureSelection(): Promise<CaptureResult>;
  
  /** 권한 설정 화면 열기 */
  openPermissionSettings(): void;
}

/** 현재 플랫폼에 맞는 캡처 서비스 생성 */
export function createCaptureService(): ICaptureService {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    return new (require('./capture.darwin').DarwinCaptureService)();
  } else if (platform === 'win32') {
    return new (require('./capture.win32').Win32CaptureService)();
  }
  
  throw new Error(`Unsupported platform: ${platform}`);
}
```

---

## 구현 계획

### Phase 1: 캡처 서비스 추상화 ✅ 완료

**목표**: 기존 macOS 코드를 인터페이스 기반으로 리팩토링

#### Task 1.1: 캡처 인터페이스 정의 ✅
- [x] `src/services/capture/index.ts` 생성
- [x] `ICaptureService` 인터페이스 정의
- [x] 플랫폼 감지 팩토리 함수 구현

#### Task 1.2: macOS 구현 분리 ✅
- [x] `src/services/capture/capture.darwin.ts` 생성
- [x] 기존 `capture.ts` 로직 이동
- [x] `DarwinCaptureService` 클래스로 래핑

#### Task 1.3: import 경로 업데이트 ✅
- [x] `src/main/index.ts`에서 import 변경
  ```typescript
  // Before
  import { captureSelection, checkScreenCapturePermission } from '../services/capture';
  
  // After
  import { createCaptureService } from '../services/capture';
  const captureService = createCaptureService();
  ```

#### Task 1.4: 기존 기능 검증 ✅
- [x] macOS에서 캡처 정상 동작 확인
- [x] 권한 체크 정상 동작 확인
- [x] 권한 설정 열기 정상 동작 확인

#### Task 1.5: 추가 수정 사항
- [x] `app.disableHardwareAcceleration()` 추가 - GPU 프로세스 충돌 방지
- [x] `npm run start:clean` 스크립트 추가 - 클린 환경 테스트용

**소요 시간**: ~1.5시간

---

### Phase 2: Windows 캡처 구현 ✅ 완료

**목표**: Windows에서 동작하는 화면 캡처 구현

#### 기술 선택: `desktopCapturer` + 커스텀 영역 선택

| 방법 | 선택 이유 |
|------|----------|
| Electron `desktopCapturer` | 의존성 없음, 네이티브 지원 |
| 커스텀 영역 선택 오버레이 | macOS `screencapture -i -s`와 동일한 UX |

#### Task 2.1: Win32 캡처 서비스 기본 구현 ✅
- [x] `src/services/capture/capture.win32.ts` 생성
- [x] `Win32CaptureService` 클래스 구현
- [x] `desktopCapturer.getSources()` 연동

#### Task 2.2: 영역 선택 오버레이 구현 ✅
- [x] 전체 화면 투명 오버레이 창 생성
- [x] 마우스 드래그로 영역 선택 UI
- [x] 선택 영역 좌표 반환
- [x] ESC 키로 취소 처리

#### Task 2.3: 스크린샷 크롭 및 저장 ✅
- [x] `nativeImage`로 전체 화면 캡처
- [x] 선택 영역으로 크롭
- [x] PNG 파일로 저장

#### Task 2.4: 권한 처리 (Windows) ✅
- [x] Windows는 별도 권한 불필요 → `'granted'` 반환
- [x] `openPermissionSettings()`는 no-op

**소요 시간**: ~1.5시간

**참고 구현 (GitHub)**:
- `pavlobu/deskreen` - desktopCapturer 사용 예시
- `xpf0000/FlyEnv` - 크로스 플랫폼 캡처
- `moeru-ai/airi` - 영역 선택 구현

---

### Phase 3: UI/UX 플랫폼 대응 ✅ 완료

**목표**: Windows에서 자연스러운 UI 제공

#### Task 3.1: 창 스타일 분기 ✅
- [x] `src/main/index.ts` 수정

```typescript
// Before
titleBarStyle: 'hiddenInset',

// After
...(process.platform === 'darwin' ? {
  titleBarStyle: 'hiddenInset',
} : {}),
```

#### Task 3.2: Traffic lights 분기 ✅
- [x] `setWindowButtonVisibility` macOS 전용으로 분기 (이미 구현됨)

```typescript
if (process.platform === 'darwin') {
  mainWindow.setWindowButtonVisibility(visible);
}
```

#### Task 3.3: Tray 아이콘 분기 ✅
- [x] `src/main/tray.ts` 수정

```typescript
if (process.platform === 'darwin') {
  icon.setTemplateImage(true);
}

tray.on('click', () => {
  if (process.platform === 'darwin') {
    tray?.popUpContextMenu();
  }
});
```

#### Task 3.4: 메뉴 단축키 표시 분기 ✅
- [x] `Capture Screen (⌘+Shift+L)` → Windows에서는 `Ctrl+Shift+L`

```typescript
const shortcutLabel = process.platform === 'darwin' ? '⌘+Shift+L' : 'Ctrl+Shift+L';
label: `Capture Screen (${shortcutLabel})`,
```

#### Task 3.5: Dock 관련 분기 ✅
- [x] `app.dock?.show()` macOS 전용 (이미 구현됨)

```typescript
if (process.platform === 'darwin') {
  app.dock?.show();
}
```

**소요 시간**: ~30분

---

### Phase 4: 빌드 및 배포 설정 ✅ 완료

**목표**: Windows 빌드 및 CI/CD 구성

#### Task 4.1: Windows 아이콘 생성 ✅
- [x] `assets/icon.ico` 생성 (256x256)
- [x] `png-to-ico`로 변환

#### Task 4.2: package.json Windows 설정 추가 ✅
- [x] `build.win` 섹션 추가
- [x] `build.nsis` 섹션 추가
- [x] `dist:win`, `dist:all` 스크립트 추가

#### Task 4.3: GitHub Actions 매트릭스 빌드 ✅
- [x] `.github/workflows/release.yml` 매트릭스 빌드로 수정
- [x] macOS/Windows 병렬 빌드 설정
- [x] 플랫폼별 코드 서명 환경변수 분기

#### Task 4.4: 자동 업데이트 설정 ✅
- [x] `electron-updater`가 Windows `latest.yml` 자동 생성
- [x] 기존 electron-updater 설정이 Windows 지원

**소요 시간**: ~30분

---

### Phase 5: 테스트 및 검증 ✅ 완료 (빌드 검증)

#### Task 5.1: macOS 빌드 검증 ✅
- [x] TypeScript 컴파일 성공
- [x] 모든 플랫폼 분기 코드 정상 빌드
- [x] 기존 capture.darwin.ts 동작 보장 (인터페이스 유지)

#### Task 5.2: Windows 빌드 검증 ✅
- [x] 크로스 컴파일 성공 (macOS에서 Windows용 빌드)
- [x] NSIS installer 생성 (~83MB)
- [x] `latest.yml` 자동 생성 확인

#### Task 5.3: 실제 테스트 (수동 필요)
- [ ] Windows VM/PC에서 설치 및 캡처 테스트
- [ ] macOS에서 회귀 테스트 (패키징된 앱으로)

**소요 시간**: ~15분 (빌드 검증)

---

### Phase 6: 코드 서명 (선택)

> Windows 코드 서명은 **선택사항**이지만 권장됨

| 상태 | 사용자 경험 |
|------|------------|
| 서명 없음 | "알 수 없는 게시자" 경고, SmartScreen 차단 |
| OV 인증서 | 경고 감소, 점진적 신뢰 구축 (~$200/년) |
| EV 인증서 | 즉시 SmartScreen 신뢰 (~$400/년) |

#### Task 6.1 (선택): 코드 서명 인증서 구매
- [ ] OV 또는 EV 인증서 구매
- [ ] GitHub Secrets에 `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` 추가

---

## 작업 우선순위

```
Phase 1 (캡처 추상화)     ━━━━━━━━━━ 2-3h
         ↓
Phase 2 (Windows 캡처)    ━━━━━━━━━━━━━━ 3-4h
         ↓
Phase 3 (UI 플랫폼 대응)  ━━━━━━━━ 2h
         ↓
Phase 4 (빌드/배포)       ━━━━━━━━━ 2.5h
         ↓
Phase 5 (테스트)          ━━━━━━━━━━ 2-3h
         ↓
[선택] Phase 6 (코드 서명)
```

**총 예상 시간**: ~13시간 (Phase 6 제외)

---

## 위험 요소 및 대응

| 위험 | 확률 | 대응 |
|------|------|------|
| Windows 영역 선택 UI 구현 복잡 | 중 | 오픈소스 참고, 기본 기능 우선 |
| desktopCapturer 권한 이슈 | 낮 | Windows는 일반적으로 권한 불필요 |
| 자동 업데이트 Windows 호환성 | 낮 | electron-updater는 Windows 지원 |
| CI 빌드 시간 증가 | 높 | 매트릭스 빌드로 병렬 처리 |

---

## 완료 기준

- [ ] macOS에서 기존 기능 100% 동작 (회귀 없음)
- [ ] Windows에서 핵심 기능 동작
  - [ ] 화면 영역 선택 캡처
  - [ ] AI 분석
  - [ ] Linear 이슈 생성
  - [ ] Tray 아이콘
  - [ ] 글로벌 단축키
- [ ] GitHub Releases에서 mac/win 동시 배포
- [ ] 자동 업데이트 양 플랫폼 지원

---

## Windows 테스트 환경

> macOS에서 개발하면서 Windows 앱을 테스트하는 방법

### 1. 로컬 가상화 (개발 중 기능 테스트)

| 옵션 | 비용 | 성능 | Apple Silicon 호환 |
|------|------|------|-------------------|
| **UTM** (권장) | 무료 | 좋음 | ✅ Windows ARM + x64 에뮬레이션 |
| **Parallels Desktop** | $100+/년 | 최고 | ✅ 가장 안정적 |
| **VMware Fusion** | 무료 (개인용) | 좋음 | ✅ |

#### UTM 설치 및 Windows 11 설정

```bash
# UTM 설치
brew install --cask utm

# Windows 11 ARM ISO 다운로드
# https://www.microsoft.com/software-download/windows11arm64

# UTM에서 새 VM 생성 → Windows 11 ARM 선택 → ISO 마운트 → 설치
```

**테스트 워크플로우:**
1. Mac에서 `npm run dist:win` 실행 (cross-compile)
2. 생성된 `.exe` 파일을 UTM VM에 복사
3. VM에서 설치 및 테스트

### 2. GitHub Actions CI/CD (자동 빌드 검증) ⭐

모든 push에서 Windows 빌드를 자동 검증 - **가장 중요!**

```yaml
# .github/workflows/build-test.yml
name: Build Test

on: [push, pull_request]

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run build
      
      - name: Build app
        run: |
          if [ "$RUNNER_OS" == "macOS" ]; then
            npm run dist:mac
          else
            npm run dist:win
          fi
        shell: bash
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.os }}
          path: |
            release/*.dmg
            release/*.exe
            release/*.zip
```

**장점:**
- 실제 Windows 환경에서 빌드 검증
- 빌드 실패 시 즉시 알림
- Artifacts에서 빌드된 파일 다운로드 가능

### 3. Cross-Compile (빌드만, 테스트 불가)

Mac에서 Windows 빌드 파일 생성 가능:

```bash
# macOS에서 Windows용 빌드
npm run dist:win

# 출력: release/Linear Capture Setup x.x.x.exe
```

**제한사항:**
- EV 코드 서명은 Windows에서만 가능
- 일반 OV 인증서는 Mac에서도 서명 가능

### 4. 베타 테스터 활용 (릴리즈 전 최종 검증)

- Windows 사용자에게 베타 빌드 배포
- 실제 환경에서 피드백 수집
- GitHub Releases의 Pre-release 기능 활용

### 테스트 전략 요약

```
┌─────────────────────────────────────────────────────────────┐
│                    단계별 테스트 전략                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 코드 작성 (Mac)                                          │
│     └─ TypeScript 컴파일 확인                                │
│                                                             │
│  2. GitHub Actions 자동 빌드 ⭐                              │
│     └─ push마다 Windows/Mac 빌드 성공 여부 확인               │
│     └─ 빌드 성공 = 기본적인 호환성 확인                        │
│                                                             │
│  3. UTM 가상머신 테스트                                       │
│     └─ 주요 기능 변경 시에만                                  │
│     └─ 화면 캡처, 트레이, 단축키 등 OS 연동 기능               │
│                                                             │
│  4. 베타 테스터 검증                                          │
│     └─ 릴리즈 전 실제 Windows PC에서 테스트                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 참고 자료

### Electron 공식 문서
- [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Cross-Platform Considerations](https://www.electronjs.org/docs/latest/tutorial/cross-platform-considerations)

### 오픈소스 참고
- [pavlobu/deskreen](https://github.com/pavlobu/deskreen) - desktopCapturer 구현
- [electron/fiddle](https://github.com/electron/fiddle) - 플랫폼 분기 패턴

### 빌드 도구
- [electron-builder](https://www.electron.build/configuration/win) - Windows 설정
- [electron-builder code signing](https://www.electron.build/code-signing.html) - 코드 서명 가이드
- [GitHub Actions Matrix](https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs)

---

## 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2025-01-25 | 1.0 | 초안 작성 |
| 2025-01-25 | 1.1 | 브랜치 전략, Windows 테스트 환경 섹션 추가 |
| 2025-01-25 | 1.2 | Phase 1 완료 - 캡처 서비스 추상화, GPU 충돌 수정, start:clean 스크립트 추가 |
| 2025-01-25 | 1.3 | Phase 2-4 완료 - Windows 캡처 구현(desktopCapturer + 영역 선택 오버레이), UI/UX 플랫폼 분기, 빌드 설정 |
| 2025-01-25 | 1.4 | Phase 5 완료 - Windows 크로스 컴파일 성공 (83MB exe), publisherName 설정 오류 수정 |
