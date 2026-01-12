# Linear Capture

화면을 캡처하고 Linear 이슈를 즉시 생성하는 macOS 앱

## 기능

- **⌘+Shift+L**: 화면 영역을 선택해서 캡처
- **자동 업로드**: 캡처 이미지가 Cloudflare R2에 자동 업로드
- **Linear 이슈 생성**: 제목, 설명, 팀, 프로젝트 선택 후 이슈 생성
- **클립보드 복사**: 생성된 이슈 URL이 자동으로 클립보드에 복사

## Quick Start

### 1. Clone & Install

```bash
git clone <repository-url>
cd linear-capture
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your API tokens
```

### 3. Run

```bash
npm start
```

### 4. Use

- 메뉴바에 아이콘이 나타납니다
- `⌘+Shift+L`을 눌러 캡처
- 영역을 선택하면 이슈 생성 창이 열립니다
- 제목과 팀을 선택하고 "Create Issue" 클릭

## Configuration

### Linear API Token

1. [Linear](https://linear.app) → Settings → API → Personal API keys
2. "New API Key" 클릭
3. 토큰을 `.env`의 `LINEAR_API_TOKEN`에 입력

### Cloudflare R2

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → R2
2. 버킷 생성 (예: `linear-captures`)
3. Settings → R2 API Tokens → Create API Token
   - 권한: Object Read & Write
4. 버킷을 Public으로 설정하거나 Custom Domain 연결
5. `.env`에 정보 입력:

```env
R2_ACCOUNT_ID=your-account-id      # Cloudflare Account ID
R2_ACCESS_KEY_ID=your-access-key   # R2 API Token의 Access Key ID
R2_SECRET_ACCESS_KEY=your-secret   # R2 API Token의 Secret Access Key
R2_BUCKET_NAME=linear-captures     # 생성한 버킷 이름
R2_PUBLIC_URL=https://...          # 버킷의 Public URL 또는 Custom Domain
```

### Default Team (Optional)

`.env`에 기본 팀 ID를 설정하면 매번 선택하지 않아도 됩니다:

```env
DEFAULT_TEAM_ID=e108ae14-a354-4c09-86ac-6c1186bc6132
```

## Development

```bash
# Build and run
npm start

# Watch mode (manual restart required)
npm run dev
```

## Troubleshooting

### "Screen Recording" 권한 요청

처음 실행 시 macOS에서 화면 녹화 권한을 요청합니다.
System Preferences → Privacy & Security → Screen Recording에서 허용해주세요.

### 캡처가 안 되는 경우

1. 권한 확인 후 앱 재시작
2. 터미널에서 수동 테스트: `screencapture -i test.png`

### R2 업로드 실패

1. `.env` 파일의 R2 설정 확인
2. API Token 권한이 "Object Read & Write"인지 확인
3. 버킷 이름이 정확한지 확인

## License

MIT
