#!/bin/bash

# Linear Capture 완전 클린 재설치 스크립트
# 권한 문제 해결 포함

set -e

echo "🧹 Linear Capture 완전 클린 재설치 시작..."
echo ""

# 1. 앱 종료
echo "1️⃣ 실행 중인 앱 종료..."
pkill -f "Linear Capture" 2>/dev/null || true
sleep 1

# 2. 앱 파일 삭제
echo "2️⃣ 앱 파일 삭제..."
rm -rf "/Applications/Linear Capture.app"
rm -rf ~/Library/Application\ Support/linear-capture
rm -rf ~/Library/Caches/com.gpters.linear-capture
rm -f ~/Library/Preferences/com.gpters.linear-capture.plist

# 3. TCC 권한 리셋 (화면 녹화 권한)
echo "3️⃣ 화면 녹화 권한 리셋..."
tccutil reset ScreenCapture com.gpters.linear-capture 2>/dev/null || true

# 4. TCC 권한 리셋 (접근성 권한 - 핫키 관련)
echo "4️⃣ 접근성 권한 리셋..."
tccutil reset Accessibility com.gpters.linear-capture 2>/dev/null || true

echo ""
echo "✅ 클린 완료!"
echo ""

# 5. DMG 빌드
echo "5️⃣ DMG 빌드 중..."
cd "$(dirname "$0")/.."
npm run dist:mac

echo ""
echo "✅ DMG 빌드 완료!"
echo ""

# 6. DMG 설치
echo "6️⃣ DMG 마운트 및 설치 중..."
DMG_PATH="release/Linear Capture-1.1.1-universal.dmg"

if [ ! -f "$DMG_PATH" ]; then
    echo "❌ DMG 파일을 찾을 수 없습니다: $DMG_PATH"
    exit 1
fi

hdiutil attach "$DMG_PATH"
sleep 2

cp -R "/Volumes/Linear Capture/Linear Capture.app" /Applications/
sleep 1

hdiutil detach "/Volumes/Linear Capture"

echo ""
echo "✅ 설치 완료!"
echo ""

# 7. 앱 정보 확인
echo "📋 앱 정보:"
echo "   번들 ID: $(defaults read "/Applications/Linear Capture.app/Contents/Info.plist" CFBundleIdentifier)"
echo "   버전: $(defaults read "/Applications/Linear Capture.app/Contents/Info.plist" CFBundleShortVersionString)"
echo ""

# 8. 안내 메시지
echo "🎉 완전 클린 재설치 완료!"
echo ""
echo "📌 다음 단계:"
echo "   1. Finder에서 Applications 폴더를 열어주세요"
echo "   2. 'Linear Capture' 앱을 우클릭 → '열기' 선택 (Gatekeeper 우회)"
echo "   3. ⌘+Shift+L로 캡처 시도"
echo "   4. 화면 녹화 권한 팝업이 뜨면 '허용' 클릭"
echo "   5. 시스템 환경설정 → 보안 및 개인 정보 보호 → 화면 녹화에서 Linear Capture 체크"
echo ""
echo "⚠️ 권한 문제가 계속되면 다음 명령어로 수동 리셋:"
echo "   tccutil reset ScreenCapture"
echo "   tccutil reset Accessibility"
echo ""
