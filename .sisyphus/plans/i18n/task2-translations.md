# Task 2: Translation Files Content

This document contains the complete translation content for Task 2 of the i18n plan.

## File: `locales/en/translation.json`

```json
{
  "app": {
    "name": "Linear Capture",
    "ready": "Linear Capture ready! Press {{hotkey}} to capture."
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "close": "Close",
    "delete": "Delete",
    "validate": "Validate",
    "reset": "Reset",
    "connect": "Connect",
    "disconnect": "Disconnect",
    "search": "Search",
    "none": "None",
    "default": "Default",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success",
    "confirm": "Confirm",
    "ok": "OK",
    "later": "Later",
    "download": "Download",
    "next": "Next",
    "previous": "Previous",
    "start": "Start",
    "settings": "Settings",
    "status": "Status",
    "user": "User",
    "version": "Version"
  },
  "capture": {
    "title": "Create Linear Issue",
    "shortcutHint": "Press {{hotkey}} to capture (max {{max}} images)",
    "captureButton": "Capture",
    "addMore": "Add ({{current}}/{{max}})",
    "maxImagesReached": "Maximum Images",
    "maxImagesMessage": "You can only attach up to {{max}} images.",
    "analysisStart": "Start Analysis",
    "analyzing": "AI is analyzing the screenshot...",
    "analysisFailed": "Analysis failed",
    "reanalyze": "Re-analyze",
    "noResults": "No results found"
  },
  "form": {
    "title": "Title",
    "titleRequired": "Title *",
    "titlePlaceholder": "Target - Specific content (e.g., Login - Fix session expiry error)",
    "description": "Description",
    "descriptionPlaceholder": "Optional description...",
    "team": "Team",
    "teamRequired": "Team *",
    "teamPlaceholder": "Select team...",
    "project": "Project",
    "projectPlaceholder": "Search projects...",
    "status": "Status",
    "priority": "Priority",
    "priorityNone": "No priority",
    "priorityUrgent": "🔴 Urgent",
    "priorityHigh": "🟠 High",
    "priorityMedium": "🟡 Medium",
    "priorityLow": "🟢 Low",
    "assignee": "Assignee",
    "assigneePlaceholder": "Search assignees...",
    "unassigned": "Unassigned",
    "estimate": "Estimate",
    "cycle": "Cycle",
    "labels": "Labels",
    "labelsPlaceholder": "Search labels...",
    "labelsAdd": "+ Add labels...",
    "createIssue": "Create Issue",
    "creating": "Creating issue...",
    "userHintPlaceholder": "(Optional) Write what the AI should focus on when creating the Linear issue",
    "aiModel": "AI Model"
  },
  "context": {
    "title": "Context Search",
    "slack": "Slack",
    "notion": "Notion",
    "gmail": "Gmail",
    "slackPlaceholder": "Search Slack messages...",
    "notionPlaceholder": "Search Notion pages...",
    "notConnected": "Not connected to {{service}}",
    "connectButton": "Connect {{service}}",
    "searching": "Searching...",
    "selected": "{{count}} selected"
  },
  "success": {
    "title": "Issue created!",
    "viewInLinear": "View in Linear",
    "urlCopied": "URL copied to clipboard"
  },
  "settings": {
    "title": "Settings",
    "linearToken": "Linear API Token",
    "tokenPlaceholder": "lin_api_xxxxxxxxxxxxx",
    "tokenHint": "Get from Linear Settings > API > Personal API keys",
    "enterToken": "Enter your token",
    "validating": "Validating...",
    "connected": "Connected",
    "connectionFailed": "Connection failed",
    "invalidToken": "Invalid token",
    "saved": "Saved!",
    "saving": "Saving...",
    "saveFailed": "Save failed",
    "deleteConfirm": "Delete the token?",
    "deleteError": "Error occurred while deleting",
    "checkUpdate": "Check for Updates",
    "checking": "Checking...",
    "updateCheckFailed": "Update check failed",
    "language": "Language",
    "languageHint": "Select app display language"
  },
  "hotkey": {
    "title": "Capture Hotkey",
    "placeholder": "Click to record...",
    "hint": "Click and press new key combination",
    "saved": "Hotkey saved!",
    "resetSuccess": "Reset to default!",
    "resetFailed": "Failed to reset",
    "saveFailed": "Failed to save hotkey",
    "invalidEmpty": "Hotkey cannot be empty",
    "invalidNoModifier": "Hotkey must include at least one modifier and a key",
    "invalidModifier": "Hotkey must include a modifier (Cmd/Ctrl/Alt/Shift)",
    "invalidKey": "Invalid key: {{key}}",
    "reserved": "This shortcut is reserved by the system",
    "pressKeys": "Press keys...",
    "pressModifier": "Press modifier + key (e.g., ⌘+Shift+L)",
    "needModifier": "Please include a modifier key (⌘, ⌃, ⌥, or ⇧)",
    "invalidKeyType": "Invalid key. Use letters, numbers, or function keys.",
    "updated": "Hotkey updated successfully",
    "registerFailed": "Failed to register hotkey. It may be in use by another application."
  },
  "slack": {
    "title": "Slack",
    "notConnected": "Not connected",
    "connectedTo": "{{workspace}} connected",
    "connecting": "Connecting...",
    "disconnecting": "Disconnecting...",
    "connectFailed": "Failed to start OAuth flow",
    "disconnectFailed": "Failed to disconnect"
  },
  "notion": {
    "title": "Notion",
    "notConnected": "Not connected",
    "connectedTo": "{{workspace}} connected",
    "connecting": "Connecting...",
    "disconnecting": "Disconnecting...",
    "connectFailed": "Failed to start OAuth flow",
    "disconnectFailed": "Failed to disconnect"
  },
  "gmail": {
    "title": "Gmail",
    "notConnected": "Not connected",
    "connectedTo": "{{email}} connected",
    "connecting": "Connecting...",
    "disconnecting": "Disconnecting...",
    "connectFailed": "Failed to start OAuth flow",
    "disconnectFailed": "Failed to disconnect"
  },
  "onboarding": {
    "step": "{{current}}/{{total}}",
    "step1Title": "Linear Capture",
    "shortcutDescription": "Use the shortcut to capture your screen and instantly create a Linear issue",
    "permissionWarning": "Screen recording permission required",
    "permissionButton": "Permission Settings",
    "step2Title": "Linear API Token",
    "tokenDescription": "Get from Linear Settings > API > Personal API keys",
    "validationSuccess": "Connection successful!",
    "validationError": "Invalid token"
  },
  "dialogs": {
    "permissionTitle": "Linear Capture",
    "permissionMessage": "Screen recording permission required",
    "permissionDetail": "Click Permission Settings to attempt capture and open System Preferences.\nWhen the app appears in the list, enable it.",
    "permissionButton": "Permission Settings",
    "tokenWarning": "Linear API token not set",
    "tokenWarningButton": "Set up"
  },
  "update": {
    "checkTitle": "Update Check",
    "noReleases": "No released versions yet",
    "noReleasesDetail": "Current version: {{version}}\n\nNew updates will be available here when released.",
    "checkFailed": "Unable to check for updates",
    "checkFailedDetail": "Please check your network connection and try again.",
    "upToDateTitle": "No Updates Available",
    "upToDateMessage": "You're up to date!",
    "upToDateDetail": "Linear Capture {{version}} is the latest version.",
    "availableTitle": "Update Available",
    "availableMessage": "A new version of Linear Capture is available!",
    "availableDetail": "Current version: {{current}}\nNew version: {{new}}\n\nWould you like to download it now?",
    "downloadingTitle": "Downloading Update",
    "downloadingMessage": "Downloading update in the background...",
    "downloadingDetail": "You can continue using the app. We'll notify you when the download is complete.",
    "downloadFailed": "Download Failed",
    "downloadFailedDetail": "Failed to download the update. Please try again later.",
    "readyTitle": "Update Ready",
    "readyMessage": "Version {{version}} download complete",
    "readyDetail": "The update will be installed when you restart the app.\n\n⚠️ If the hotkey (⌘+Shift+L) doesn't work after restart:\nGo to System Preferences → Privacy & Security → Screen Recording\nand re-enable Linear Capture.",
    "restartNow": "Restart Now"
  },
  "errors": {
    "linearNotConfigured": "Linear not configured",
    "r2NotConfigured": "R2 not configured",
    "allUploadsFailed": "All image uploads failed",
    "validationError": "Error occurred during validation",
    "saveError": "Error occurred while saving",
    "tokenRequired": "Please enter the token"
  }
}
```

---

## File: `locales/ko/translation.json`

```json
{
  "app": {
    "name": "Linear Capture",
    "ready": "Linear Capture 준비 완료! {{hotkey}} 키로 캡처하세요."
  },
  "common": {
    "save": "저장",
    "cancel": "취소",
    "close": "닫기",
    "delete": "삭제",
    "validate": "검증",
    "reset": "초기화",
    "connect": "연결",
    "disconnect": "연결 해제",
    "search": "검색",
    "none": "없음",
    "default": "기본",
    "loading": "로딩 중...",
    "error": "오류",
    "success": "성공",
    "confirm": "확인",
    "ok": "확인",
    "later": "나중에",
    "download": "다운로드",
    "next": "다음",
    "previous": "이전",
    "start": "시작",
    "settings": "설정",
    "status": "상태",
    "user": "사용자",
    "version": "버전"
  },
  "capture": {
    "title": "Linear 이슈 생성",
    "shortcutHint": "{{hotkey}} 로 캡처 (최대 {{max}}장)",
    "captureButton": "캡처하기",
    "addMore": "추가 ({{current}}/{{max}})",
    "maxImagesReached": "최대 이미지 수",
    "maxImagesMessage": "최대 {{max}}장까지만 첨부할 수 있습니다.",
    "analysisStart": "분석 시작",
    "analyzing": "AI가 스크린샷을 분석 중...",
    "analysisFailed": "분석 실패",
    "reanalyze": "다시 분석",
    "noResults": "검색 결과가 없습니다"
  },
  "form": {
    "title": "제목",
    "titleRequired": "제목 *",
    "titlePlaceholder": "대상 - 구체적 내용 (예: 로그인 - 세션 만료 오류 수정)",
    "description": "설명",
    "descriptionPlaceholder": "선택 사항...",
    "team": "팀",
    "teamRequired": "팀 *",
    "teamPlaceholder": "팀 선택...",
    "project": "프로젝트",
    "projectPlaceholder": "프로젝트 검색...",
    "status": "상태",
    "priority": "우선순위",
    "priorityNone": "우선순위 없음",
    "priorityUrgent": "🔴 긴급",
    "priorityHigh": "🟠 높음",
    "priorityMedium": "🟡 보통",
    "priorityLow": "🟢 낮음",
    "assignee": "담당자",
    "assigneePlaceholder": "담당자 검색...",
    "unassigned": "미배정",
    "estimate": "추정치",
    "cycle": "사이클",
    "labels": "라벨",
    "labelsPlaceholder": "라벨 검색...",
    "labelsAdd": "+ 라벨 추가...",
    "createIssue": "이슈 생성",
    "creating": "이슈 생성 중...",
    "userHintPlaceholder": "(옵션) 리니어 이슈 생성 시 가장 집중해야할 내용이 있다면 작성해주세요",
    "aiModel": "AI 모델"
  },
  "context": {
    "title": "컨텍스트 검색",
    "slack": "Slack",
    "notion": "Notion",
    "gmail": "Gmail",
    "slackPlaceholder": "Slack 메시지 검색...",
    "notionPlaceholder": "Notion 페이지 검색...",
    "notConnected": "{{service}}에 연결되지 않았습니다",
    "connectButton": "{{service}} 연결하기",
    "searching": "검색 중...",
    "selected": "{{count}}개 선택됨"
  },
  "success": {
    "title": "이슈가 생성되었습니다!",
    "viewInLinear": "Linear에서 보기",
    "urlCopied": "URL이 클립보드에 복사되었습니다"
  },
  "settings": {
    "title": "설정",
    "linearToken": "Linear API 토큰",
    "tokenPlaceholder": "lin_api_xxxxxxxxxxxxx",
    "tokenHint": "Linear Settings > API > Personal API keys에서 발급",
    "enterToken": "토큰을 입력하세요",
    "validating": "검증 중...",
    "connected": "연결됨",
    "connectionFailed": "연결 실패",
    "invalidToken": "유효하지 않은 토큰입니다",
    "saved": "저장됨!",
    "saving": "저장 중...",
    "saveFailed": "저장에 실패했습니다",
    "deleteConfirm": "토큰을 삭제하시겠습니까?",
    "deleteError": "삭제 중 오류가 발생했습니다",
    "checkUpdate": "업데이트 확인",
    "checking": "확인 중...",
    "updateCheckFailed": "업데이트 확인에 실패했습니다",
    "language": "언어",
    "languageHint": "앱 표시 언어 선택"
  },
  "hotkey": {
    "title": "캡처 단축키",
    "placeholder": "클릭하여 입력...",
    "hint": "클릭 후 새 키 조합을 누르세요",
    "saved": "단축키 저장됨!",
    "resetSuccess": "기본값으로 초기화됨!",
    "resetFailed": "초기화 실패",
    "saveFailed": "단축키 저장 실패",
    "invalidEmpty": "단축키는 비워둘 수 없습니다",
    "invalidNoModifier": "단축키는 최소 하나의 수정자 키와 일반 키를 포함해야 합니다",
    "invalidModifier": "단축키는 수정자 키(Cmd/Ctrl/Alt/Shift)를 포함해야 합니다",
    "invalidKey": "유효하지 않은 키: {{key}}",
    "reserved": "이 단축키는 시스템에서 예약되어 있습니다",
    "pressKeys": "키를 누르세요...",
    "pressModifier": "수정자 + 키를 누르세요 (예: ⌘+Shift+L)",
    "needModifier": "수정자 키(⌘, ⌃, ⌥, 또는 ⇧)를 포함해주세요",
    "invalidKeyType": "유효하지 않은 키입니다. 문자, 숫자 또는 기능 키를 사용하세요.",
    "updated": "단축키가 성공적으로 업데이트되었습니다",
    "registerFailed": "단축키 등록에 실패했습니다. 다른 애플리케이션에서 사용 중일 수 있습니다."
  },
  "slack": {
    "title": "Slack",
    "notConnected": "연결 안됨",
    "connectedTo": "{{workspace}} 연결됨",
    "connecting": "연결 중...",
    "disconnecting": "연결 해제 중...",
    "connectFailed": "OAuth 흐름 시작 실패",
    "disconnectFailed": "연결 해제 실패"
  },
  "notion": {
    "title": "Notion",
    "notConnected": "연결 안됨",
    "connectedTo": "{{workspace}} 연결됨",
    "connecting": "연결 중...",
    "disconnecting": "연결 해제 중...",
    "connectFailed": "OAuth 흐름 시작 실패",
    "disconnectFailed": "연결 해제 실패"
  },
  "gmail": {
    "title": "Gmail",
    "notConnected": "연결 안됨",
    "connectedTo": "{{email}} 연결됨",
    "connecting": "연결 중...",
    "disconnecting": "연결 해제 중...",
    "connectFailed": "OAuth 흐름 시작 실패",
    "disconnectFailed": "연결 해제 실패"
  },
  "onboarding": {
    "step": "{{current}}/{{total}}",
    "step1Title": "Linear Capture",
    "shortcutDescription": "단축키로 화면을 캡처하고 바로 Linear 이슈를 생성하세요",
    "permissionWarning": "화면 녹화 권한이 필요합니다",
    "permissionButton": "권한 설정",
    "step2Title": "Linear API 토큰",
    "tokenDescription": "Linear Settings > API > Personal API keys에서 발급",
    "validationSuccess": "연결 성공!",
    "validationError": "유효하지 않은 토큰입니다"
  },
  "dialogs": {
    "permissionTitle": "Linear Capture",
    "permissionMessage": "화면 녹화 권한이 필요합니다",
    "permissionDetail": "권한 설정을 누르면 캡처가 시도되고, 시스템 환경설정이 열립니다.\n앱이 목록에 표시되면 체크해주세요.",
    "permissionButton": "권한 설정",
    "tokenWarning": "Linear API 토큰이 설정되지 않았습니다",
    "tokenWarningButton": "설정하기"
  },
  "update": {
    "checkTitle": "업데이트 확인",
    "noReleases": "아직 배포된 버전이 없습니다",
    "noReleasesDetail": "현재 버전: {{version}}\n\n새 버전이 배포되면 여기서 업데이트할 수 있습니다.",
    "checkFailed": "업데이트를 확인할 수 없습니다",
    "checkFailedDetail": "네트워크 연결을 확인하고 다시 시도해주세요.",
    "upToDateTitle": "업데이트 없음",
    "upToDateMessage": "최신 버전입니다!",
    "upToDateDetail": "Linear Capture {{version}}이(가) 최신 버전입니다.",
    "availableTitle": "업데이트 가능",
    "availableMessage": "새로운 버전의 Linear Capture를 사용할 수 있습니다!",
    "availableDetail": "현재 버전: {{current}}\n새 버전: {{new}}\n\n지금 다운로드하시겠습니까?",
    "downloadingTitle": "업데이트 다운로드 중",
    "downloadingMessage": "백그라운드에서 업데이트를 다운로드 중입니다...",
    "downloadingDetail": "앱을 계속 사용할 수 있습니다. 다운로드가 완료되면 알려드립니다.",
    "downloadFailed": "다운로드 실패",
    "downloadFailedDetail": "업데이트 다운로드에 실패했습니다. 나중에 다시 시도해주세요.",
    "readyTitle": "업데이트 준비 완료",
    "readyMessage": "버전 {{version}} 다운로드 완료",
    "readyDetail": "앱을 재시작하면 업데이트가 설치됩니다.\n\n⚠️ 재시작 후 핫키(⌘+Shift+L)가 작동하지 않으면:\n시스템 환경설정 → 개인 정보 보호 및 보안 → 화면 녹화에서\nLinear Capture를 다시 활성화해주세요.",
    "restartNow": "지금 재시작"
  },
  "errors": {
    "linearNotConfigured": "Linear가 설정되지 않았습니다",
    "r2NotConfigured": "R2가 설정되지 않았습니다",
    "allUploadsFailed": "모든 이미지 업로드 실패",
    "validationError": "검증 중 오류가 발생했습니다",
    "saveError": "저장 중 오류가 발생했습니다",
    "tokenRequired": "토큰을 입력하세요"
  }
}
```

---

## Key Categories

| Category | Purpose | String Count |
|----------|---------|--------------|
| `app` | App-level strings | 2 |
| `common` | Reusable UI labels | 26 |
| `capture` | Main capture window | 11 |
| `form` | Issue form fields | 28 |
| `context` | Context search section | 10 |
| `success` | Success screen | 3 |
| `settings` | Settings page | 17 |
| `hotkey` | Hotkey settings | 16 |
| `slack` | Slack integration | 7 |
| `notion` | Notion integration | 7 |
| `gmail` | Gmail integration | 7 |
| `onboarding` | Onboarding flow | 9 |
| `dialogs` | System dialogs | 5 |
| `update` | Auto-updater | 17 |
| `errors` | Error messages | 6 |
| **Total** | | **~171 strings** |

## Verification

After creating the files, run:

```bash
# Check files exist
ls locales/en/translation.json locales/ko/translation.json

# Validate JSON
cat locales/en/translation.json | jq . > /dev/null && echo "EN: Valid JSON"
cat locales/ko/translation.json | jq . > /dev/null && echo "KO: Valid JSON"

# Count keys
echo "EN keys: $(cat locales/en/translation.json | jq 'keys | length')"
echo "KO keys: $(cat locales/ko/translation.json | jq 'keys | length')"

# Verify key match
bun -e "
const en = require('./locales/en/translation.json');
const ko = require('./locales/ko/translation.json');
const enKeys = JSON.stringify(Object.keys(en).sort());
const koKeys = JSON.stringify(Object.keys(ko).sort());
console.log('Keys match:', enKeys === koKeys);
"
```
