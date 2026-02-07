# Linear Capture

화면을 캡처하고 AI 분석으로 Linear 이슈를 즉시 생성하는 macOS 앱

## 기능

- **⌘+Shift+L**: 화면 영역을 선택해서 캡처
- **다중 이미지**: 최대 10장의 스크린샷을 하나의 이슈에 첨부
- **AI 분석**: Claude Haiku / Gemini Flash가 스크린샷을 분석하여 제목/설명/담당자/우선순위 자동 추천
- **AI 컨텍스트 검색**: Notion, Slack, Gmail, Linear 데이터를 로컬 검색하여 관련 컨텍스트 자동 추천
- **자동 업로드**: 캡처 이미지가 Cloudflare R2에 자동 업로드
- **Linear 이슈 생성**: 팀, 프로젝트, 사이클 선택 후 이슈 생성
- **Notion 동기화**: 로컬 캐시(21k+ 페이지) 또는 API를 통한 배치 동기화
- **Slack/Gmail 연동**: OAuth 기반 메시지/이메일 동기화
- **다국어 지원**: 영어, 한국어, 독일어, 프랑스어, 스페인어
- **자동 업데이트**: 새 버전 알림 및 업데이트 (Settings에서 확인)

## 설치

### GitHub Releases에서 다운로드

1. [Releases](https://github.com/chat-prompt/linear-capture/releases) 페이지에서 최신 DMG 다운로드
2. DMG 마운트 후 Applications 폴더로 드래그
3. **중요**: Finder에서 앱 우클릭 → "열기" 선택 (Gatekeeper 우회)

### 개발 환경

```bash
git clone https://github.com/chat-prompt/linear-capture.git
cd linear-capture
npm install
npm start
```

## 설정

### Linear API Token

1. [Linear](https://linear.app) → Settings → API → Personal API keys
2. "New API Key" 클릭
3. `.env` 파일 생성:

```env
LINEAR_API_TOKEN=lin_api_xxxxx
DEFAULT_TEAM_ID=your-team-id  # 선택사항
```

### OpenAI API Key (로컬 검색용)

Settings → General에서 OpenAI API Key를 입력하면 로컬 임베딩 검색이 활성화됩니다.

### Slack / Gmail 연동

Settings → Integrations에서 OAuth 연결로 동기화를 활성화합니다.

**참고**: AI 분석용 API 키(Anthropic, Gemini)는 서버에서 관리되므로 별도 설정 불필요.

## 사용법

1. 메뉴바에 L 아이콘이 나타납니다
2. `⌘+Shift+L`을 눌러 캡처 (또는 아이콘 클릭)
3. 화면 영역을 드래그로 선택
4. "분석 시작" 버튼으로 AI 분석 실행
5. 필요시 내용 수정 후 "Create Issue" 클릭
6. 이슈 URL이 자동으로 클립보드에 복사됨

## 트러블슈팅

### 화면 녹화 권한

처음 실행 시 macOS에서 화면 녹화 권한을 요청합니다.
시스템 환경설정 → 개인 정보 보호 및 보안 → 화면 녹화에서 허용.

### 캡처가 안 되는 경우

```bash
# TCC 권한 리셋
tccutil reset ScreenCapture com.gpters.linear-capture

# 앱 재시작 후 다시 권한 허용
```

### 업데이트 후 권한 오류

앱 업데이트 후 화면 캡처가 안 되면 위의 TCC 리셋 명령어 실행.

## 기술 스택

- **App**: Electron + TypeScript
- **AI 분석**: Claude Haiku 4.5 / Gemini Flash (Cloudflare Worker)
- **Local DB**: PGlite (PostgreSQL in WASM) + pgvector
- **검색**: 벡터 + FTS 하이브리드 검색 (RRF)
- **임베딩**: OpenAI text-embedding-3-small
- **Notion 캐시**: sql.js (로컬 SQLite 직접 읽기)
- **스토리지**: Cloudflare R2
- **API**: Linear GraphQL, Slack Web API, Gmail API
- **다국어**: i18next (en, ko, de, fr, es)

## License

MIT
