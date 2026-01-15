# Linear Capture

macOS 화면 캡처 → Cloudflare R2 업로드 → Linear 이슈 자동 생성 앱

## 실행 방법

```bash
cd linear-capture
npm install
npm start
```

**중요**: Claude Code 환경에서 실행 시 `ELECTRON_RUN_AS_NODE=1` 환경변수가 설정되어 있으면 Electron이 Node.js 모드로 실행됨. `package.json`의 start 스크립트에 `unset ELECTRON_RUN_AS_NODE`가 포함되어 있음.

## 프로젝트 구조

```
linear-capture/
├── src/
│   ├── main/
│   │   ├── index.ts      # Electron 메인 프로세스, IPC 핸들러
│   │   ├── hotkey.ts     # ⌘+Shift+L 글로벌 단축키
│   │   └── tray.ts       # 메뉴바 아이콘
│   ├── renderer/
│   │   └── index.html    # 이슈 생성 폼 UI
│   └── services/
│       ├── capture.ts         # macOS screencapture 호출
│       ├── r2-uploader.ts     # Cloudflare R2 업로드
│       ├── linear-client.ts   # Linear SDK 래퍼
│       └── gemini-analyzer.ts # Gemini Vision API OCR 분석
├── .env                  # API 키 설정 (git ignored)
├── .env.example          # 설정 템플릿
└── package.json
```

## 설정 (.env)

```env
LINEAR_API_TOKEN=lin_api_xxxxx
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=linear-captures
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
GEMINI_API_KEY=AIzaSyXXXXX  # Gemini Vision API 키 (선택)
DEFAULT_TEAM_ID=e108ae14-a354-4c09-86ac-6c1186bc6132
```

## 사용자 흐름

1. `⌘+Shift+L` 또는 메뉴바 아이콘 클릭
2. 화면 영역 드래그 선택
3. R2에 이미지 자동 업로드 + Gemini Vision AI 분석 (병렬)
4. 이슈 생성 폼 표시 (AI가 제목/설명/프로젝트/담당자/우선순위/포인트 자동 채움)
5. 필요시 수정 후 "Create Issue" 클릭 → Linear 이슈 생성
6. 이슈 URL 클립보드 복사 + macOS 알림

## 이슈 생성 폼 필드

| 필드 | 필수 | AI 자동 | 설명 |
|------|------|--------|------|
| Title | ✅ | ✅ | 이슈 제목 |
| Description | | ✅ | 이슈 설명 (마크다운 지원) |
| Team | ✅ | | 팀 선택 (Status, Cycle 드롭다운 연동) |
| Project | | ✅ | 프로젝트 선택 (planned/started만 표시) |
| Status | | | 워크플로우 상태 (팀별 필터링) |
| Priority | | ✅ | 우선순위 (Urgent/High/Medium/Low) |
| Assignee | | ✅ | 담당자 지정 |
| Estimate | | ✅ | 포인트 추정 (1/2/3/5/8) |
| Cycle | | | 스프린트/사이클 (팀별 필터링) |

## 주요 IPC 채널

| 채널 | 방향 | 설명 |
|------|------|------|
| `capture-ready` | main→renderer | 캡처 완료 후 데이터 전달 (filePath, imageUrl, teams, projects, users, states, cycles, suggestedTitle, suggestedDescription, suggestedProjectId, suggestedAssigneeId, suggestedPriority, suggestedEstimate) |
| `create-issue` | renderer→main | 이슈 생성 요청 (title, description, teamId, projectId, stateId, priority, assigneeId, estimate, cycleId) |
| `cancel` | renderer→main | 취소 요청 |

## Gemini Vision AI 분석 기능

**모델**: `gemini-2.5-flash-lite` (가장 빠르고 안정적)

캡처된 스크린샷을 Gemini Vision API로 분석하여 이슈 정보를 자동 생성합니다.

### AI 자동 추천 항목
| 항목 | 설명 | 추론 기준 |
|------|------|----------|
| **제목** | 이슈 제목 (접두어 포함) | 스크린샷 내용 분석 |
| **설명** | 마크다운 형식 설명 | 스크린샷 텍스트 추출 |
| **프로젝트** | 관련 프로젝트 자동 선택 | 프로젝트 이름/설명과 스크린샷 내용 매칭 |
| **담당자** | 담당자 자동 선택 | 스크린샷에 언급된 이름 매칭 |
| **우선순위** | 1(긴급)~4(낮음) | 에러/장애=1, 버그=2, 일반=3, 개선=4 |
| **포인트** | 1/2/3/5/8 | 작업 복잡도 추정 |

### 동작 방식
1. 캡처 완료 후 R2 업로드와 Gemini 분석 병렬 실행
2. 이미지를 base64로 인코딩하여 Gemini API에 전송
3. 프로젝트 목록(이름+설명), 담당자 목록을 컨텍스트로 제공
4. JSON 형식으로 제목/설명/메타데이터 응답 파싱
5. 폼에 자동 채움 (사용자가 수정 가능)

### 프로젝트 필터링
- `planned` 또는 `started` 상태의 프로젝트만 조회
- 프로젝트 설명(description)도 AI에 제공하여 매칭 정확도 향상

### 이슈 설명 템플릿

Gemini가 생성하는 description은 마크다운 형식으로 구조화됩니다:

```markdown
## 이슈
(핵심 문제나 요청 사항 1-2문장)

## 상세 내용
(구체적인 내용, 중요 텍스트 인용)

## To Do
- [ ] 조치 사항 1
- [ ] 조치 사항 2
```

### 분석 실패 시
- 빈 폼으로 진행 (수동 입력 가능)
- 콘솔에 에러 로그 출력
- 앱 동작에는 영향 없음

### 테스트 스크립트
```bash
node test-gemini.js        # 모델 목록 및 기본 테스트
node test-gemini-vision.js # 실제 이미지 분석 테스트
```

### Gemini 모델 선택 가이드
| 모델 | 속도 | 안정성 | 권장 |
|------|------|--------|------|
| `gemini-2.5-flash-lite` | ~2초 | ✅ | 🎯 현재 사용 |
| `gemini-3-flash-preview` | ~9초 | ✅ | 백업용 |
| `gemini-2.5-flash` | - | ❌ 503 과부하 | 비권장 |

## 알려진 이슈

- AWS SDK v3 Node.js 18 지원 종료 경고 (2026년 1월)
- CoreText 폰트 경고 (무시 가능)
- Electron에서 `-webkit-app-region: drag` 사용 시 입력 요소에 명시적으로 `no-drag` 필요

---

## ⚠️ DMG 패키징 핫키 문제 해결 기록 (2025-01-15)

### 문제 현상

| 실행 방식 | 전역 핫키 (⌘+Shift+L) | 캡처 |
|----------|----------------------|------|
| `npm run start` (개발 모드) | ✅ 작동 | ✅ 작동 |
| DMG 설치 후 실행 (8f15f98) | ❌ 앱 실행 안 됨 | ❌ |
| DMG 설치 후 실행 (96275bc) | ✅ 작동 | ✅ 작동 |

### 작동하는 버전

**커밋**: `96275bc` (2025-01-14 첫 머지 버전)

**핵심 설정** (`package.json`):
```json
"mac": {
  "category": "public.app-category.productivity",
  "icon": "assets/icon.icns",
  "target": [{ "target": "dmg", "arch": ["universal"] }],
  "hardenedRuntime": false,
  "gatekeeperAssess": false
}
```

### 실패한 버전에서 추가하려던 기능들 (8f15f98)

#### 1. 화면 녹화 권한 서비스 (`src/services/permission.ts`)
```typescript
// 목적: 화면 녹화 권한 상태 확인 및 안내
import { systemPreferences, shell } from 'electron';

export function checkScreenCapturePermission(): 'granted' | 'denied' | 'not-determined' {
  const status = systemPreferences.getMediaAccessStatus('screen');
  return status;
}

export function openScreenCaptureSettings(): void {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
}
```

#### 2. 사용자 설정 저장소 (`src/services/settings-store.ts`)
```typescript
// 목적: 사용자 설정 (기본 팀, 기본 프로젝트 등) 영구 저장
import Store from 'electron-store';

interface Settings {
  defaultTeamId: string;
  defaultProjectId: string;
  aiModel: 'haiku' | 'gemini';
}

const store = new Store<Settings>({
  defaults: {
    defaultTeamId: '',
    defaultProjectId: '',
    aiModel: 'haiku'
  }
});
```

#### 3. 설정 UI (`src/renderer/settings.html`)
- 기본 팀/프로젝트 선택
- AI 모델 선택 (Haiku vs Gemini)
- 단축키 커스터마이징

#### 4. 네이티브 모듈 (`mac-screen-capture-permissions`)
```json
// package.json에 추가됨
"dependencies": {
  "mac-screen-capture-permissions": "^2.0.0"
}
```

#### 5. 복잡한 로깅 시스템
```typescript
// crash 로그 파일 저장
import * as fs from 'fs';
import * as path from 'path';

const crashLogPath = path.join(app.getPath('userData'), 'crash.log');
fs.writeFileSync(crashLogPath, `Crash at ${new Date().toISOString()}\n`);
```

### 실패 원인 분석

#### 원인 1: 네이티브 모듈 패키징 실패
`mac-screen-capture-permissions`는 C++ 네이티브 바인딩을 사용하는 모듈로, electron-builder가 올바르게 번들링하지 못함.

**증상**: 앱 실행 시 `MODULE_NOT_FOUND` 에러 (하지만 에러 표시 없이 silent crash)

**해결**: Electron 내장 API 사용
```typescript
// ❌ 네이티브 모듈
import { hasScreenCapturePermission } from 'mac-screen-capture-permissions';

// ✅ Electron 내장 API
import { systemPreferences } from 'electron';
const status = systemPreferences.getMediaAccessStatus('screen');
```

#### 원인 2: 파일 시스템 접근 문제
패키징된 앱에서 `fs.writeFileSync`로 crash 로그를 쓰려 할 때, 앱 번들 내부에 쓰기 권한이 없음.

**증상**: 앱 시작 시점에 crash (JavaScript 실행 전)

**해결**: `app.getPath('userData')` 사용 또는 로깅 제거

#### 원인 3: Hardened Runtime + Ad-hoc 서명 충돌
```json
// ❌ 문제가 되는 설정
"mac": {
  "hardenedRuntime": true,
  "entitlements": "entitlements.mac.plist"
}
```

Ad-hoc 서명(Apple Developer 인증서 없이 빌드)과 `hardenedRuntime: true`가 함께 사용되면:
- macOS TCC(Transparency, Consent, and Control)가 권한을 엄격하게 검증
- 새 번들 ID(`com.gpters.linear-capture`)에 대한 Accessibility 권한이 없음
- 권한 프롬프트가 뜨기 전에 핫키 등록 시도 → 실패

**해결**: `hardenedRuntime: false` 유지 (Apple Developer 인증서 없이는)

#### 원인 4: Gatekeeper 차단
macOS Gatekeeper가 서명되지 않은 앱을 silent하게 차단.

**증상**: 앱 아이콘 클릭 → 아무 반응 없음 (에러 없음)

**해결**: Finder에서 앱 우클릭 → "Open" 선택 (최초 1회)

### 재현 방지 체크리스트

DMG 패키징 전 반드시 확인:

- [ ] **네이티브 모듈 사용 금지**: `package.json`에 네이티브 바인딩 모듈이 없는지 확인
- [ ] **Electron 내장 API 사용**: `systemPreferences`, `shell`, `dialog` 등 활용
- [ ] **hardenedRuntime: false 유지**: Apple Developer 인증서 획득 전까지
- [ ] **entitlements 설정 제거**: Ad-hoc 서명에서는 불필요
- [ ] **파일 쓰기 경로 검증**: `app.getPath('userData')` 사용
- [ ] **DMG 빌드 후 즉시 테스트**: 개발 모드에서 작동해도 DMG에서 실패할 수 있음
- [ ] **Finder 우클릭 열기**: 새 DMG 테스트 시 Gatekeeper 우회

### 안전한 기능 추가 순서

1. **단일 기능 추가**: 한 번에 하나의 기능만 추가
2. **DMG 빌드 테스트**: 각 기능 추가 후 `npm run dist:mac` 실행
3. **Finder에서 테스트**: 우클릭 → Open으로 실행
4. **핫키 + 캡처 확인**: 전역 단축키와 화면 캡처 모두 테스트
5. **문제 발생 시 롤백**: `git revert` 또는 해당 기능 코드 제거

### 권장 아키텍처

```
src/
├── main/
│   ├── index.ts      # 최소한의 메인 프로세스 코드
│   ├── hotkey.ts     # globalShortcut만 사용
│   └── tray.ts       # 메뉴바 아이콘
├── services/
│   ├── capture.ts    # screencapture CLI 호출 (네이티브 모듈 X)
│   └── ...           # 나머지 서비스들
└── renderer/
    └── index.html    # 단일 HTML 파일
```

**핵심 원칙**:
- 네이티브 모듈 대신 Electron API 또는 CLI 도구 사용
- 복잡한 로깅/설정 시스템은 DMG 안정화 후 점진적 추가
- 매 기능 추가마다 DMG 테스트 필수

## 개발 명령어

```bash
npm run build    # TypeScript 컴파일 + assets 복사
npm run dev      # 빌드 후 즉시 실행
npm run clean    # dist 폴더 삭제
npm run dist:mac # DMG 패키징
```

---

## 🔧 화면 녹화 권한 문제 해결 (TCC 리셋)

### 문제 현상
- 시스템 환경설정에서 화면 녹화 권한이 **켜져 있는데도**
- 캡처하면 **데스크탑 기본 배경만** 캡처됨
- 앱 삭제 후 재설치 시 자주 발생

### 원인
macOS TCC(Transparency, Consent, and Control) 데이터베이스에 이전 앱 권한 정보가 꼬여있음.
Ad-hoc 서명된 앱은 재설치 시 macOS가 동일 앱으로 인식하지 못할 수 있음.

### 해결 방법

**1단계: 권한 리셋 (터미널에서 실행)**
```bash
tccutil reset ScreenCapture com.gpters.linear-capture
```

**2단계: 앱 재시작**
1. Linear Capture 완전 종료 (메뉴바 아이콘도 종료)
2. 앱 다시 실행
3. `⌘+Shift+L` 눌러서 캡처 시도
4. 화면 녹화 권한 팝업이 새로 뜨면 허용

### 전체 화면 녹화 권한 리셋 (모든 앱)
```bash
tccutil reset ScreenCapture
```

### 완전 초기화 스크립트 (앱 삭제 + 재설치 시)
```bash
# 1. 앱 종료
pkill -f "Linear Capture"

# 2. 관련 파일 모두 삭제
rm -rf /Applications/Linear\ Capture.app
rm -rf ~/Library/Application\ Support/linear-capture
rm -rf ~/Library/Caches/com.gpters.linear-capture
rm -f ~/Library/Preferences/com.gpters.linear-capture.plist

# 3. TCC 권한 리셋
tccutil reset ScreenCapture com.gpters.linear-capture

# 4. DMG 재빌드 및 설치
cd /Users/wine_ny/side-project/linear_project/linear-capture
npm run dist:mac
hdiutil attach release/Linear\ Capture-1.0.0-universal.dmg
cp -R /Volumes/Linear\ Capture*/Linear\ Capture.app /Applications/
hdiutil detach /Volumes/Linear\ Capture*

# 5. Finder에서 우클릭 → 열기로 실행
```

### 권한 상태 확인 명령어
```bash
# 앱 번들 ID 확인
defaults read /Applications/Linear\ Capture.app/Contents/Info.plist CFBundleIdentifier

# 코드 서명 상태 확인
codesign -dv /Applications/Linear\ Capture.app
```

---

## 🚧 Settings 기능 구현 계획 (feature/settings 브랜치)

### 목표

1. **멤버별 Linear API 토큰 설정**: 공용 토큰 대신 개인 토큰으로 이슈 생성
2. **메인 UI Settings 버튼**: 이슈 생성 폼에서 Settings로 빠르게 이동

### 현재 상태 (2025-01-15)

| 항목 | 현재 | 목표 |
|------|------|------|
| 토큰 관리 | `.env` 파일에서만 로드 | electron-store로 저장, 런타임 변경 가능 |
| electron-store | `hasLaunched` 저장만 사용 | 토큰 + 설정 저장 |
| Tray 메뉴 | Capture + Quit | + Settings 메뉴 추가 |
| UI | 이슈 생성 폼만 | + Settings 버튼 + Settings 윈도우 |

### 설계 결정사항

- **Settings UI**: 별도 윈도우로 구현 (독립적 관리 용이)
- **토큰 저장**: 평문 저장 (DMG 패키징 안정성 우선, 로컬 파일이라 보안 위험 낮음)
- **네이티브 모듈**: 사용 금지 (DMG 실패 원인)

### Phase별 구현 계획

각 Phase 완료 후 반드시 DMG 빌드 테스트를 수행합니다.

#### Phase 1: Settings 저장소 (`settings-store.ts`)

**목적**: 토큰 저장/조회 기능

**파일**: `src/services/settings-store.ts` (새로 생성)

```typescript
import Store from 'electron-store';

interface Settings {
  linearApiToken?: string;
  defaultTeamId?: string;
}

// ⚠️ encryptionKey 사용 안 함 (DMG 패키징 문제 방지)
const store = new Store<Settings>({ name: 'settings' });

export function getLinearToken(): string | undefined {
  // 저장된 토큰 우선, 없으면 .env fallback
  return store.get('linearApiToken') || process.env.LINEAR_API_TOKEN;
}

export function setLinearToken(token: string): void {
  store.set('linearApiToken', token);
}

export function clearLinearToken(): void {
  store.delete('linearApiToken');
}
```

**검증**:
- `npm run start` → 콘솔에 에러 없음
- `npm run dist:mac` → DMG 설치 후 핫키 작동

---

#### Phase 2: Settings UI (`settings.html`)

**목적**: 토큰 입력/검증/저장 UI

**파일**: `src/renderer/settings.html` (새로 생성)

**기능**:
- Linear API Token 입력 필드 (password type)
- Validate 버튼 → Linear viewer API로 토큰 검증
- 검증 성공 시 사용자 이름/이메일 표시
- Save 버튼 → electron-store에 저장
- Clear 버튼 → 토큰 삭제

**디자인**: 기존 `index.html` 스타일 유지

**검증**:
- Settings 윈도우 열기/닫기
- 토큰 입력 → 검증 → 저장 플로우

---

#### Phase 3: IPC 핸들러 (`index.ts`)

**목적**: Settings 윈도우 관리 + 토큰 관련 IPC

**파일**: `src/main/index.ts` (수정)

**추가할 코드**:
```typescript
// Settings 윈도우 관리
let settingsWindow: BrowserWindow | null = null;

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 400,
    height: 350,
    resizable: false,
    // ... 기존 윈도우 패턴 따름
  });
  settingsWindow.loadFile('dist/renderer/settings.html');
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// IPC 핸들러
ipcMain.handle('validate-token', async (_, token: string) => {
  // LinearClient로 viewer API 호출하여 검증
});

ipcMain.handle('save-settings', async (_, data) => {
  // settings-store에 저장
});

ipcMain.handle('get-settings', async () => {
  // 현재 설정 반환
});

ipcMain.handle('open-settings', () => {
  createSettingsWindow();
});

ipcMain.handle('close-settings', () => {
  settingsWindow?.close();
});
```

**검증**:
- 트레이 메뉴에서 Settings 열기
- 토큰 저장 후 앱 재시작 → 토큰 유지 확인

---

#### Phase 4: Tray 메뉴 수정 (`tray.ts`) ✅ 완료

**목적**: Settings 메뉴 항목 추가 및 트레이 아이콘 수정

**파일**:
- `src/main/tray.ts` (수정)
- `assets/tray-icon.png` (새로 생성)
- `assets/tray-icon@2x.png` (새로 생성)
- `package.json` (수정)

**변경**:
```typescript
export interface TrayCallbacks {
  onCapture: () => void;
  onSettings: () => void;  // 추가
  onQuit: () => void;
}

const contextMenu = Menu.buildFromTemplate([
  { label: 'Capture Screen (⌘+Shift+L)', click: callbacks.onCapture },
  { type: 'separator' },
  { label: 'Settings...', click: callbacks.onSettings },  // 추가
  { type: 'separator' },
  { label: 'Quit', click: callbacks.onQuit },
]);
```

**트레이 아이콘 문제 및 해결**:

1. **문제**: 트레이 영역은 차지하지만 아이콘이 보이지 않음
   - **원인 1**: 기존 `tray-icon.png` (192바이트)가 손상됨
   - **원인 2**: `package.json` files에 `assets/**/*` 미포함 → DMG에 assets 없음
   - **원인 3**: `__dirname` 경로로는 asar 내부 파일 접근 불가

2. **해결**:
   - 유효한 PNG 아이콘 생성 (16x16, 32x32 픽셀 L 모양)
   - `package.json`에 `"assets/**/*"` 추가
   - `app.getAppPath()`로 asar 내부 경로 접근
   - Template Image 설정으로 light/dark 모드 자동 대응

3. **최종 코드** (`tray.ts`):
```typescript
const appPath = app.getAppPath();
const iconPath = path.join(appPath, 'assets/tray-icon.png');
const iconPath2x = path.join(appPath, 'assets/tray-icon@2x.png');

let icon = nativeImage.createFromPath(iconPath);
const icon2x = nativeImage.createFromPath(iconPath2x);
if (!icon2x.isEmpty()) {
  icon.addRepresentation({ scaleFactor: 2.0, buffer: icon2x.toPNG() });
}
icon.setTemplateImage(true);
```

**검증 완료**:
- ✅ 개발 모드: 트레이 아이콘 정상 표시
- ✅ DMG 설치 버전: 트레이 아이콘 정상 표시
- ✅ Settings 메뉴 클릭 → Settings 윈도우 열림
- ✅ 핫키 (⌘+Shift+L) 정상 작동

**커밋**: `27261d4` - feat(settings): Complete Phase 4

---

#### Phase 5: 메인 UI Settings 버튼 (`index.html`)

**목적**: 이슈 생성 폼에서 Settings로 빠르게 이동

**파일**: `src/renderer/index.html` (수정)

**추가**:
```html
<!-- 헤더에 Settings 버튼 추가 -->
<div class="header" style="display: flex; justify-content: space-between; align-items: center;">
  <h1>New Issue</h1>
  <button id="settingsBtn" class="icon-btn" title="Settings">⚙</button>
</div>
```

```javascript
document.getElementById('settingsBtn').addEventListener('click', () => {
  ipcRenderer.invoke('open-settings');
});
```

**검증**:
- 이슈 생성 폼에서 ⚙ 버튼 클릭
- Settings 윈도우 열림

---

#### Phase 6: Linear Client 수정 (`linear-client.ts`)

**목적**: 저장된 토큰 사용

**파일**: `src/services/linear-client.ts` (수정)

**변경**:
```typescript
// 기존
const apiToken = process.env.LINEAR_API_TOKEN;

// 변경
import { getLinearToken } from './settings-store';
const apiToken = getLinearToken();
```

**검증**:
- Settings에서 개인 토큰 저장
- 이슈 생성 → Linear에서 작성자 확인 (개인 계정으로 생성되었는지)

---

### DMG 테스트 체크리스트

각 Phase 완료 후:

```bash
# 1. DMG 빌드
npm run dist:mac

# 2. 기존 앱 삭제 (캐시 포함)
rm -rf /Applications/Linear\ Capture.app
rm -rf ~/Library/Application\ Support/linear-capture

# 3. DMG 마운트 및 설치
hdiutil attach release/Linear\ Capture-1.0.0-universal.dmg
cp -R /Volumes/Linear\ Capture*/Linear\ Capture.app /Applications/
hdiutil detach /Volumes/Linear\ Capture*

# 4. Finder에서 우클릭 → 열기
# 5. 테스트
#    - ⌘+Shift+L 핫키 작동
#    - 캡처 → 이슈 생성 정상
#    - (해당 Phase의 기능 테스트)
```

### 파일 변경 요약

| 파일 | 작업 | Phase |
|------|------|-------|
| `src/services/settings-store.ts` | 새로 생성 | 1 |
| `src/renderer/settings.html` | 새로 생성 | 2 |
| `src/main/index.ts` | IPC 핸들러 추가 | 3 |
| `src/main/tray.ts` | Settings 메뉴 추가 | 4 |
| `src/renderer/index.html` | Settings 버튼 추가 | 5 |
| `src/services/linear-client.ts` | 토큰 로직 수정 | 6 |

### 롤백 전략

문제 발생 시:
```bash
# 해당 Phase 커밋만 revert
git revert HEAD

# 또는 전체 롤백
git checkout master
```
