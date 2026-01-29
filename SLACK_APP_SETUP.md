# Slack App Setup Guide

Linear Capture에서 Slack 검색 기능을 사용하려면 Slack App을 생성해야 합니다.

## 1. Slack App 생성

1. [Slack API Apps](https://api.slack.com/apps) 페이지로 이동
2. **Create New App** 클릭
3. **From scratch** 선택
4. App Name: `Linear Capture` (또는 원하는 이름)
5. Workspace: 연결할 Slack 워크스페이스 선택
6. **Create App** 클릭

## 2. OAuth 스코프 설정

### User Token Scopes 설정 (중요!)

1. 좌측 메뉴에서 **OAuth & Permissions** 클릭
2. **User Token Scopes** 섹션으로 스크롤
3. **Add an OAuth Scope** 버튼으로 다음 스코프 추가:

| Scope | 설명 |
|-------|------|
| `search:read` | 메시지 검색 (필수) |
| `channels:read` | 채널 목록 조회 |
| `users:read` | 사용자 정보 조회 |

> ⚠️ **주의**: Bot Token Scopes가 아닌 **User Token Scopes**에 추가해야 합니다.
> `search:read`는 User Token에서만 사용 가능합니다.

## 3. Redirect URL 설정

1. **OAuth & Permissions** 페이지에서 **Redirect URLs** 섹션 찾기
2. **Add New Redirect URL** 클릭
3. 다음 URL 추가:
   ```
   linear-capture://slack/callback
   ```
4. **Save URLs** 클릭

## 4. 앱 설치

1. **OAuth & Permissions** 페이지 상단의 **Install to Workspace** 클릭
2. 권한 요청 화면에서 **Allow** 클릭
3. 설치 완료 후 **User OAuth Token**이 생성됨 (xoxp-로 시작)

## 5. Client ID/Secret 확인

Worker에 설정할 값들을 확인합니다:

1. 좌측 메뉴에서 **Basic Information** 클릭
2. **App Credentials** 섹션에서:
   - **Client ID**: `SLACK_CLIENT_ID`로 사용
   - **Client Secret**: `SLACK_CLIENT_SECRET`으로 사용

## 6. Worker Secrets 설정

Worker에 Slack credentials를 추가합니다:

```bash
cd linear-capture-worker

# Client ID 설정
wrangler secret put SLACK_CLIENT_ID
# → Client ID 입력

# Client Secret 설정  
wrangler secret put SLACK_CLIENT_SECRET
# → Client Secret 입력
```

## 7. Linear Capture 앱에서 연결

1. Linear Capture 앱 실행
2. Settings (⚙️) 클릭
3. **Slack** 섹션에서 **Connect** 버튼 클릭
4. 브라우저에서 Slack 로그인 후 권한 승인
5. 자동으로 앱으로 돌아와서 연결 완료

## 문제 해결

### "oauth_authorization_url_mismatch" 에러

Redirect URL이 정확히 일치해야 합니다:
- Slack App 설정: `linear-capture://slack/callback`
- 대소문자 주의

### "missing_scope" 에러

User Token Scopes에 필요한 스코프가 모두 추가되었는지 확인:
- `search:read`
- `channels:read`
- `users:read`

### 토큰이 만료된 경우

Slack User Token은 만료되지 않지만, 앱을 재설치하면 무효화됩니다.
Settings에서 **Disconnect** 후 다시 **Connect**하세요.

## 참고 자료

- [Slack OAuth 2.0 Documentation](https://api.slack.com/authentication/oauth-v2)
- [Slack User Token Scopes](https://api.slack.com/scopes)
