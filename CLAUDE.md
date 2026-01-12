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

## 개발 명령어

```bash
npm run build    # TypeScript 컴파일 + assets 복사
npm run dev      # 빌드 후 즉시 실행
npm run clean    # dist 폴더 삭제
```
