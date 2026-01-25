# Linear Capture

macOS 화면 캡처 → Linear 이슈 자동 생성 앱 (v1.2.6)

## 실행 방법

```bash
cd linear-capture
npm install
npm start
```

**참고**: Claude Code 환경에서는 `ELECTRON_RUN_AS_NODE=1`이 설정되어 있어 `package.json`의 start 스크립트에 `unset ELECTRON_RUN_AS_NODE`가 포함되어 있음.

## 아키텍처

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│  Electron App   │────▶│  Cloudflare Worker (linear-capture-ai) │
│  (Linear Capture)│     │  - AI 분석 (Haiku/Gemini)           │
└─────────────────┘     │  - R2 이미지 업로드                  │
        │               └─────────────────────────────────────┘
        │
        ▼
┌─────────────────┐
│  Linear API     │
│  (이슈 생성)     │
└─────────────────┘
```

**핵심**: API 키(Anthropic, Gemini, R2)는 모두 Worker에서 관리. 앱에는 Linear API 토큰만 필요.

## 프로젝트 구조

```
linear-capture/
├── src/
│   ├── main/
│   │   ├── index.ts          # 메인 프로세스, IPC 핸들러
│   │   ├── hotkey.ts         # ⌘+Shift+L 글로벌 단축키
│   │   └── tray.ts           # 메뉴바 아이콘
│   ├── renderer/
│   │   ├── index.html        # 이슈 생성 폼 UI
│   │   └── settings.html     # 설정 UI
│   └── services/
│       ├── capture.ts        # macOS screencapture 호출
│       ├── r2-uploader.ts    # Worker 통해 R2 업로드
│       ├── anthropic-analyzer.ts  # Worker 통해 AI 분석
│       ├── linear-client.ts  # Linear SDK 래퍼
│       └── auto-updater.ts   # 자동 업데이트
├── .env                      # LINEAR_API_TOKEN만 필요
└── package.json
```

## 설정 (.env)

```env
LINEAR_API_TOKEN=lin_api_xxxxx
DEFAULT_TEAM_ID=e108ae14-a354-4c09-86ac-6c1186bc6132
```

**참고**: R2/Gemini/Anthropic API 키는 Worker에서 관리되므로 앱에는 불필요.

## 사용자 흐름

1. `⌘+Shift+L` 또는 메뉴바 아이콘 클릭
2. 화면 영역 드래그 선택
3. 갤러리에 이미지 추가 (최대 10장)
4. "분석 시작" 버튼으로 AI 분석
5. 필요시 수정 후 "Create Issue" 클릭
6. 성공 화면에서 "Linear에서 보기" 또는 "닫기"

## 개발 명령어

```bash
npm run start        # 빌드 후 실행
npm run build        # TypeScript 컴파일
npm run dist:mac     # DMG 패키징
npm run reinstall    # 완전 클린 재설치 (권한 리셋 포함)
```

## 배포 (코드 서명 + 공증)

앱은 **Apple Developer ID로 서명 및 공증**되어 배포됩니다 (Geniefy Inc. 팀 계정).

### 환경 설정 (1회성)

`~/.zshrc`에 Apple API Key 환경변수가 설정되어 있음:
```bash
export APPLE_API_KEY="/Users/wine_ny/side-project/linear_project/linear-capture/AuthKey_2AW98DM4X7.p8"
export APPLE_API_KEY_ID="2AW98DM4X7"
export APPLE_API_ISSUER="9094d5c9-acd0-40fa-b7d6-4567c644afa7"
```

### 배포 절차

```bash
# 1. 코드 수정 후 버전 업
npm version patch  # or minor, major

# 2. 빌드 (서명 + 공증 자동 실행)
npm run dist:mac

# 3. 태그 푸시 + GitHub Release
git push origin master --tags
gh release create vX.X.X \
  "release/Linear Capture-X.X.X-universal.dmg" \
  "release/Linear Capture-X.X.X-universal-mac.zip" \
  "release/latest-mac.yml" \
  --title "vX.X.X" --notes "변경사항"
```

### ⚠️ 자동 업데이트 주의사항 (중요!)

GitHub는 파일 업로드 시 **파일명의 공백을 `.`으로 치환**합니다:
- 로컬: `Linear Capture-1.2.5-universal-mac.zip`
- GitHub: `Linear.Capture-1.2.5-universal-mac.zip`

**`latest-mac.yml` 작성 시 반드시 GitHub에 업로드된 실제 파일명(점 포함)을 사용해야 합니다!**

```yaml
# ❌ 잘못된 예 (자동 업데이트 실패)
files:
  - url: Linear Capture-1.2.5-universal-mac.zip

# ✅ 올바른 예
files:
  - url: Linear.Capture-1.2.5-universal-mac.zip
```

**확인 방법:**
```bash
# GitHub에 업로드된 실제 파일명 확인
gh release view vX.X.X --repo chat-prompt/linear-capture
```

### 인증서/키 파일 (민감정보 - .gitignore에 포함됨)
- `AuthKey_2AW98DM4X7.p8` - App Store Connect API Key (Issuer: 9094d5c9-acd0-40fa-b7d6-4567c644afa7)
- `2601-cert.p12` - Developer ID Application 인증서 (Geniefy Inc.)

### 서명 확인
```bash
# 서명 확인
codesign -dv "release/mac-universal/Linear Capture.app"

# 공증 확인 (accepted = 성공)
spctl --assess --type execute -v "release/mac-universal/Linear Capture.app"
```

### 인증서 재설치 (다른 Mac에서 빌드 시)
```bash
# 1. Developer ID G2 중간 인증서 설치 (필수)
curl -s -o /tmp/DeveloperIDG2CA.cer "https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer"
security add-certificates /tmp/DeveloperIDG2CA.cer

# 2. p12 인증서 설치
security import 2601-cert.p12 -k ~/Library/Keychains/login.keychain-db -P "비밀번호" -T /usr/bin/codesign -T /usr/bin/security -A

# 3. 설치 확인
security find-identity -v -p codesigning
# "Developer ID Application: Geniefy Inc. (6CU3UP6D4N)" 표시되면 성공
```

## Worker (linear-capture-ai)

**URL**: `https://linear-capture-ai.ny-4f1.workers.dev`

**엔드포인트**:
- `POST /` or `/analyze` - AI 분석 (Haiku 또는 Gemini)
- `POST /upload` - R2 이미지 업로드

**Secrets** (wrangler secret):
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`

**R2 바인딩**: `linear-captures` 버킷

## 권한 문제 해결

### macOS 화면 녹화 권한 동작 원리

macOS TCC(Transparency, Consent, and Control) 시스템의 핵심:
- **앱이 실제로 `screencapture`를 호출해야** 권한 목록에 등록됨
- 단순히 권한 상태 조회(`getMediaAccessStatus`)만으로는 등록 안 됨

### v1.2.6 권한 로직 개선 (2025-01)

**문제**: 재설치 후 "권한 설정" 버튼 눌러도 앱이 권한 목록에 안 뜸

**해결**:
1. `showPermissionNotification()`에서 "권한 설정" 버튼 클릭 시 `captureSelection()` 먼저 호출
2. `handleCapture()`에서 권한 없어도 캡처 시도 → macOS가 앱을 권한 목록에 등록
3. debounce 추가: 단축키 중복 입력 시 1회만 실행

```typescript
// src/main/index.ts - showPermissionNotification()
if (result.response === 0) {
  // 먼저 캡처 시도 → macOS가 앱을 권한 목록에 등록
  await captureSelection();
  // 그 다음 시스템 환경설정 열기
  openScreenCaptureSettings();
}
```

### 테스트 방법 (권한 완전 초기화)

```bash
# 1. TCC 권한 리셋
tccutil reset ScreenCapture com.gpters.linear-capture

# 2. 앱 데이터 삭제
rm -rf ~/Library/Application\ Support/linear-capture

# 3. 패키징된 앱으로 테스트 (개발 모드는 Electron으로 인식됨)
npm run dist:mac
open "release/mac-universal/Linear Capture.app"

# 4. 확인: 시스템 환경설정 > 개인 정보 보호 > 화면 및 시스템 오디오 녹음
#    → "Linear Capture"가 목록에 표시되어야 함
```

**주의**: `npm run start` (개발 모드)는 "Electron"으로 인식되어 권한 테스트에 부적합. 반드시 패키징된 `.app`으로 테스트.

## 프로젝트-팀 불일치 문제 (v1.2.6 개선)

### 문제
Product 팀으로 이슈 생성 시 Education 팀 프로젝트가 선택되면 에러:
```
Project not in same team as issue - The provided project is not associated with the issue's team
```

### 해결 (2025-01)

1. **프로젝트 선택 시 팀 자동 변경**: `onSelect` 콜백에서 `project.teamIds` 확인 후 팀 자동 전환
2. **제출 전 최종 검증**: 프로젝트-팀 불일치 시 에러 메시지 표시하고 제출 차단
3. **디버그 로깅 추가**: 개발자 도구 콘솔에서 `project.teamIds` 값 확인 가능

```javascript
// src/renderer/index.html - onSelect 콜백
onSelect: (value, label, project) => {
  console.log('Project selected:', { value, label, project });
  console.log('Project teamIds:', project?.teamIds);
  // ...팀 자동 변경 로직
}
```

### 테스트 방법

1. 개발자 도구 열기 (View > Toggle Developer Tools)
2. Education 팀 선택 후 Product 팀 프로젝트 선택
3. 콘솔에서 `Project teamIds:` 로그 확인
4. 팀이 자동으로 Product로 변경되는지 확인

## 자동 업데이트

- GitHub Releases에서 `latest-mac.yml` 확인
- **현재 상태**: Developer ID 서명 + 공증 완료 → 자동 업데이트 가능
- **주의**: v1.1.x 이하 버전은 자동 업데이트 미지원 → 수동 재설치 필요

### 사용자 문제 해결 (앱 재설치)

앱이 이상 동작하거나 업데이트 후 문제 발생 시:
```bash
# 1. 기존 앱 삭제
rm -rf /Applications/Linear\ Capture.app

# 2. 캐시 삭제
rm -rf ~/Library/Application\ Support/linear-capture
rm -rf ~/Library/Caches/linear-capture*

# 3. GitHub Releases에서 최신 DMG 다운로드 후 재설치
```
