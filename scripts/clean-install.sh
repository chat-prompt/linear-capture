#!/bin/bash

# Linear Capture 클린 설치 스크립트
# 기존 버전 완전 삭제 후 최신 버전 자동 설치

set -e

echo "============================================"
echo "  Linear Capture 클린 설치 스크립트"
echo "============================================"
echo ""

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# GitHub 저장소 정보
REPO="chat-prompt/linear-capture"
DOWNLOAD_DIR="/tmp/linear-capture-install"

# 1. 실행 중인 앱 종료
echo "1️⃣  실행 중인 Linear Capture 종료..."
if pgrep -x "Linear Capture" > /dev/null; then
    pkill -x "Linear Capture" 2>/dev/null || true
    sleep 1
    echo -e "   ${GREEN}✓ 앱 종료됨${NC}"
else
    echo -e "   ${YELLOW}• 실행 중인 앱 없음${NC}"
fi

# 2. 기존 앱 삭제
echo ""
echo "2️⃣  기존 앱 삭제..."
if [ -d "/Applications/Linear Capture.app" ]; then
    rm -rf "/Applications/Linear Capture.app"
    echo -e "   ${GREEN}✓ /Applications/Linear Capture.app 삭제됨${NC}"
else
    echo -e "   ${YELLOW}• 설치된 앱 없음${NC}"
fi

# 3. 앱 데이터 삭제
echo ""
echo "3️⃣  앱 데이터 삭제..."
rm -rf ~/Library/Application\ Support/linear-capture 2>/dev/null && \
    echo -e "   ${GREEN}✓ Application Support 삭제됨${NC}" || \
    echo -e "   ${YELLOW}• Application Support 없음${NC}"

rm -rf ~/Library/Caches/linear-capture* 2>/dev/null && \
    echo -e "   ${GREEN}✓ 캐시 삭제됨${NC}" || \
    echo -e "   ${YELLOW}• 캐시 없음${NC}"

rm -rf ~/Library/Preferences/com.gpters.linear-capture.plist 2>/dev/null && \
    echo -e "   ${GREEN}✓ Preferences 삭제됨${NC}" || \
    echo -e "   ${YELLOW}• Preferences 없음${NC}"

rm -rf ~/Library/Saved\ Application\ State/com.gpters.linear-capture.savedState 2>/dev/null && \
    echo -e "   ${GREEN}✓ Saved State 삭제됨${NC}" || \
    echo -e "   ${YELLOW}• Saved State 없음${NC}"

# 4. TCC 권한 리셋 (화면 녹화 권한)
echo ""
echo "4️⃣  화면 녹화 권한 초기화..."
tccutil reset ScreenCapture com.gpters.linear-capture 2>/dev/null && \
    echo -e "   ${GREEN}✓ 화면 녹화 권한 리셋됨${NC}" || \
    echo -e "   ${YELLOW}• 권한 리셋 스킵 (권한 없었음)${NC}"

# 5. 최신 버전 다운로드
echo ""
echo "5️⃣  최신 버전 다운로드 중..."
mkdir -p "$DOWNLOAD_DIR"
cd "$DOWNLOAD_DIR"

# GitHub API로 최신 릴리즈 DMG URL 가져오기
LATEST_DMG_URL=$(curl -sL "https://api.github.com/repos/${REPO}/releases/latest" | \
    grep "browser_download_url.*universal\.dmg\"" | \
    head -1 | \
    cut -d '"' -f 4)

if [ -z "$LATEST_DMG_URL" ]; then
    echo -e "   ${RED}✗ 다운로드 URL을 찾을 수 없습니다${NC}"
    echo "   GitHub Releases를 확인하세요: https://github.com/${REPO}/releases"
    exit 1
fi

VERSION=$(echo "$LATEST_DMG_URL" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo -e "   ${BLUE}버전: v${VERSION}${NC}"

DMG_FILE="LinearCapture-${VERSION}.dmg"
echo "   다운로드: $LATEST_DMG_URL"
curl -sL "$LATEST_DMG_URL" -o "$DMG_FILE"
echo -e "   ${GREEN}✓ 다운로드 완료${NC}"

# 6. DMG 마운트 및 설치
echo ""
echo "6️⃣  앱 설치 중..."

# 기존 Linear Capture 볼륨 언마운트
for vol in /Volumes/Linear\ Capture*; do
    [ -d "$vol" ] && hdiutil detach "$vol" -quiet 2>/dev/null || true
done

# 마운트
echo "   DMG 마운트 중..."
hdiutil attach "$DMG_FILE" -nobrowse -quiet

# 마운트된 볼륨 찾기 (Linear Capture로 시작하는 볼륨)
MOUNT_POINT=""
for vol in /Volumes/Linear\ Capture*; do
    if [ -d "$vol/Linear Capture.app" ]; then
        MOUNT_POINT="$vol"
        break
    fi
done

if [ -z "$MOUNT_POINT" ]; then
    echo -e "   ${RED}✗ DMG 마운트 실패${NC}"
    echo "   디버그: /Volumes 내용:"
    ls -la /Volumes/ | grep -i linear || echo "   (Linear 볼륨 없음)"
    exit 1
fi

echo "   마운트: $MOUNT_POINT"

cp -R "$MOUNT_POINT/Linear Capture.app" /Applications/
echo -e "   ${GREEN}✓ /Applications에 설치됨${NC}"

# 7. 정리
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
rm -rf "$DOWNLOAD_DIR"
echo -e "   ${GREEN}✓ 임시 파일 정리됨${NC}"

# 8. 완료 메시지
echo ""
echo "============================================"
echo -e "${GREEN}✅ Linear Capture v${VERSION} 설치 완료!${NC}"
echo "============================================"
echo ""
echo "다음 단계:"
echo "  1. Finder → Applications에서 Linear Capture 우클릭 → '열기'"
echo "  2. 화면 녹화 권한 요청 시 '허용' 클릭"
echo "  3. 설정(Settings)에서 Linear API 토큰 입력"
echo ""
echo -e "${BLUE}💡 단축키: ⌘+Shift+L 로 화면 캡처${NC}"
echo ""

# 앱 자동 실행
echo "7️⃣  앱 실행 중..."
open "/Applications/Linear Capture.app"
echo -e "   ${GREEN}✓ 앱 실행됨${NC}"
