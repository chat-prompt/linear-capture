#!/bin/bash

# Linear Capture 클린 설치 스크립트
# 기존 버전 완전 삭제 후 새 버전 설치를 위한 초기화

set -e

echo "============================================"
echo "  Linear Capture 클린 설치 스크립트"
echo "============================================"
echo ""

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# 5. 완료 메시지
echo ""
echo "============================================"
echo -e "${GREEN}✅ 클린업 완료!${NC}"
echo "============================================"
echo ""
echo "다음 단계:"
echo "  1. DMG 파일을 더블클릭하여 마운트"
echo "  2. Linear Capture를 Applications 폴더로 드래그"
echo "  3. Finder에서 앱 우클릭 → '열기' 선택"
echo "  4. 화면 녹화 권한 요청 시 '허용' 클릭"
echo ""
echo -e "${YELLOW}💡 팁: 설정(Settings)에서 Linear API 토큰을 다시 입력하세요${NC}"
echo ""
