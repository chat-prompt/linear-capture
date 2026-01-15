#!/bin/bash

# Linear Capture 빠른 재설치 스크립트
# 빌드 없이 기존 DMG로 재설치 (권한 리셋 포함)

set -e

echo "🧹 Linear Capture 빠른 재설치 시작..."
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

# 5. DMG 설치 (빌드 스킵)
echo "5️⃣ DMG 마운트 및 설치 중..."
cd "$(dirname "$0")/.."
DMG_PATH="release/Linear Capture-1.1.1-universal.dmg"

if [ ! -f "$DMG_PATH" ]; then
    echo "❌ DMG 파일을 찾을 수 없습니다: $DMG_PATH"
    echo "💡 전체 재설치 스크립트를 실행하세요: ./scripts/clean-reinstall.sh"
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

# 6. 앱 실행
echo "6️⃣ 앱 실행 중..."
open /Applications/Linear\ Capture.app

echo ""
echo "🎉 빠른 재설치 완료!"
echo ""
echo "📌 다음 단계:"
echo "   1. ⌘+Shift+L로 캡처 시도"
echo "   2. 화면 녹화 권한 팝업이 뜨면 '허용' 클릭"
echo "   3. 시스템 환경설정에서 권한 확인"
echo ""
