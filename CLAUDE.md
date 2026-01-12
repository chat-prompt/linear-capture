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
3. R2에 이미지 자동 업로드 + Gemini Vision OCR 분석 (병렬)
4. 이슈 생성 폼 표시 (AI가 제목/설명 자동 채움)
5. 필요시 수정 후 "Create Issue" 클릭 → Linear 이슈 생성
6. 이슈 URL 클립보드 복사 + macOS 알림

## 이슈 생성 폼 필드

| 필드 | 필수 | 설명 |
|------|------|------|
| Title | ✅ | 이슈 제목 |
| Description | | 이슈 설명 (마크다운 지원) |
| Team | ✅ | 팀 선택 (Status, Cycle 드롭다운 연동) |
| Project | | 프로젝트 선택 |
| Status | | 워크플로우 상태 (팀별 필터링) |
| Priority | | 우선순위 (Urgent/High/Medium/Low) |
| Assignee | | 담당자 지정 |
| Estimate | | 포인트 추정 (1/2/3/5/8) |
| Cycle | | 스프린트/사이클 (팀별 필터링) |

## 주요 IPC 채널

| 채널 | 방향 | 설명 |
|------|------|------|
| `capture-ready` | main→renderer | 캡처 완료 후 데이터 전달 (filePath, imageUrl, teams, projects, users, states, cycles, suggestedTitle, suggestedDescription) |
| `create-issue` | renderer→main | 이슈 생성 요청 (title, description, teamId, projectId, stateId, priority, assigneeId, estimate, cycleId) |
| `cancel` | renderer→main | 취소 요청 |

## Gemini Vision OCR 기능

**모델**: `gemini-2.5-flash-lite` (가장 빠르고 안정적)

캡처된 스크린샷을 Gemini Vision API로 분석하여 이슈 제목과 설명을 자동 생성합니다.

### 동작 방식
1. 캡처 완료 후 R2 업로드와 Gemini 분석 병렬 실행
2. 이미지를 base64로 인코딩하여 Gemini API에 전송
3. JSON 형식으로 제목/설명 응답 파싱
4. 폼에 자동 채움 (사용자가 수정 가능)

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

## 개발 명령어

```bash
npm run build    # TypeScript 컴파일 + assets 복사
npm run dev      # 빌드 후 즉시 실행
npm run clean    # dist 폴더 삭제
```
