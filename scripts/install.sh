#!/bin/bash

# Linear Capture 자동 설치 스크립트
# 기존 설치 감지 시 자동으로 정리 후 설치

set -e

echo "🚀 Linear Capture 설치 시작..."
echo ""

cd "$(dirname "$0")/.."

# 기존 설치 확인 및 자동 정리
if [ -d "/Applications/Linear Capture.app" ]; then
    echo "⚠️  기존 Linear Capture가 설치되어 있습니다."
    echo "   자동으로 정리 후 새 버전을 설치합니다."
    echo ""

    # 1. 앱 종료
    echo "1️⃣ 실행 중인 앱 종료..."
    pkill -f "Linear Capture" 2>/dev/null || true
    sleep 1

    # 2. 앱 파일 삭제
    echo "2️⃣ 기존 앱 파일 삭제..."
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
    echo "✅ 기존 설치 정리 완료!"
    echo ""
else
    echo "ℹ️  신규 설치입니다."
    echo ""
fi

# DMG 파일 찾기
echo "5️⃣ DMG 파일 확인..."
DMG_PATH=$(ls -t release/Linear\ Capture-*-universal.dmg 2>/dev/null | head -1)

if [ -z "$DMG_PATH" ]; then
    echo "❌ DMG 파일이 없습니다. 먼저 빌드하세요."
    echo "   npm run dist:mac"
    exit 1
fi

echo "   DMG: $DMG_PATH"
echo ""

# DMG 마운트 및 설치
echo "6️⃣ DMG 마운트 및 설치 중..."
hdiutil attach "$DMG_PATH" -quiet
sleep 2

cp -R "/Volumes/Linear Capture/Linear Capture.app" /Applications/
sleep 1

hdiutil detach "/Volumes/Linear Capture" -quiet

echo ""
echo "✅ 설치 완료!"
echo ""

# 앱 정보 확인
echo "📋 앱 정보:"
echo "   번들 ID: $(defaults read "/Applications/Linear Capture.app/Contents/Info.plist" CFBundleIdentifier)"
echo "   버전: $(defaults read "/Applications/Linear Capture.app/Contents/Info.plist" CFBundleShortVersionString)"
echo ""

# 앱 실행
echo "7️⃣ 앱 실행 중..."
open /Applications/Linear\ Capture.app

echo ""
echo "🎉 Linear Capture 설치 완료!"
echo ""
echo "📌 사용법:"
echo "   • ⌘+Shift+L: 일반 캡처"
echo "   • ⌘+Shift+Option+L: 스크롤 캡처"
echo ""
echo "⚠️  처음 실행 시:"
echo "   1. Gatekeeper 경고가 뜨면 '열기' 클릭"
echo "   2. 화면 녹화 권한 팝업이 뜨면 '허용' 클릭"
echo ""
