# Worker URL Migration + Sync 최적화 수동 테스트 계획

## TL;DR

> **목적**: Worker URL 변경 및 동기화 최적화가 정상 적용되었는지 검증
> 
> **테스트 항목**:
> - Worker API 엔드포인트 동작
> - OAuth 연결 (Notion, Slack, Gmail)
> - Notion Sync 최적화 (로컬 캐시 + 배치 임베딩)
> - Gmail Sync 최적화 (retry 로직 + 배치 처리)
>
> **예상 소요 시간**: 15-20분

---

## 사전 준비

### 1. 앱 빌드 및 실행

```bash
cd /Users/wine_ny/side-project/linear_project/linear-capture
npm run pack:clean
```

### 2. 개발자 도구 열기

앱 실행 후: **View → Toggle Developer Tools** (또는 `Cmd+Option+I`)

---

## 테스트 1: Worker API 엔드포인트

### 1.1 Worker 기본 응답 확인

**터미널에서 실행:**
```bash
curl -s "https://linear-capture-ai.kangjun-f0f.workers.dev" | head -1
```

**예상 결과:** 응답 수신 (에러 아님)

### 1.2 Notion Auth 엔드포인트

```bash
curl -s "https://linear-capture-ai.kangjun-f0f.workers.dev/notion/auth?device_id=test&redirect_uri=https://test.com" | jq .
```

**예상 결과:**
```json
{
  "success": true,
  "auth_url": "https://api.notion.com/v1/oauth/authorize?..."
}
```

### 1.3 Gmail Auth 엔드포인트

```bash
curl -s "https://linear-capture-ai.kangjun-f0f.workers.dev/gmail/auth?device_id=test&redirect_uri=https://test.com" | jq .
```

**예상 결과:**
```json
{
  "success": true,
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

### 1.4 Slack Auth 엔드포인트

```bash
curl -s "https://linear-capture-ai.kangjun-f0f.workers.dev/slack/auth?device_id=test&redirect_uri=https://test.com" | jq .
```

**예상 결과:**
```json
{
  "success": true,
  "auth_url": "https://slack.com/oauth/v2/authorize?..."
}
```

---

## 테스트 2: OAuth 연결 상태

### 2.1 Settings 페이지 열기

1. 앱 메뉴바 아이콘 클릭
2. **Settings** 버튼 클릭

### 2.2 각 서비스 연결 상태 확인

| 서비스 | 확인 사항 | 예상 결과 |
|--------|----------|----------|
| **Notion** | 연결 상태 표시 | "Connected to [워크스페이스명]" |
| **Slack** | 연결 상태 표시 | "Connected to [워크스페이스명]" |
| **Gmail** | 연결 상태 표시 | "Connected as [이메일]" |

### 2.3 재연결 테스트 (선택)

연결이 안 되어 있다면:
1. "Connect" 버튼 클릭
2. OAuth 플로우 완료
3. 앱으로 리다이렉트 확인
4. 연결 상태 업데이트 확인

---

## 테스트 3: Notion Sync 최적화

### 3.1 동기화 트리거

**DevTools Console에서:**
```javascript
// 기존 커서 리셋 (전체 재동기화)
await window.electronAPI.invoke('sync:reset-cursor', 'notion')

// 동기화 시작
await window.electronAPI.invoke('sync:trigger', 'notion')
```

### 3.2 로그 확인

**Console에서 확인할 로그:**

```
[NotionSync] Starting incremental sync
[NotionSync] Using local reader (optimized batch sync)  ← 로컬 캐시 사용
[NotionSync] Local reader found X pages
[NotionSync] X pages to process (after cursor filter)
[NotionSync] Embedding batch 1/N (X pages)  ← 배치 임베딩
[NotionSync] Local sync complete: X synced, 0 failed in Xms
```

### 3.3 성능 확인

| 항목 | 기존 | 최적화 후 | 확인 방법 |
|------|------|----------|----------|
| 임베딩 방식 | 개별 API 호출 | 배치 (300개씩) | 로그에서 "Embedding batch" 확인 |
| 콘텐츠 조회 | Worker API | 로컬 캐시 | 로그에서 "Using local reader" 확인 |
| 처리 시간 | 느림 | 빠름 | 로그에서 "in Xms" 시간 확인 |

### 3.4 로컬 리더 미사용 시 (API Fallback)

Notion 앱이 설치되지 않은 경우:
```
[NotionSync] Local reader unavailable, using API fallback
```

---

## 테스트 4: Gmail Sync 최적화

### 4.1 동기화 트리거

**DevTools Console에서:**
```javascript
// 기존 커서 리셋
await window.electronAPI.invoke('sync:reset-cursor', 'gmail')

// 동기화 시작
await window.electronAPI.invoke('sync:trigger', 'gmail')
```

### 4.2 로그 확인

**Console에서 확인할 로그:**

```
[GmailSync] Starting incremental sync with batched requests
[GmailSync] Batch 1: "in:inbox after:YYYY/MM/DD"
[GmailSync] Batch 1: 100 emails  ← 배치 사이즈 100
[GmailSync] Generating embeddings for X emails in batch
[GmailSync] Incremental sync complete: X synced, 0 failed (N batches)
```

### 4.3 Retry 로직 테스트 (선택)

네트워크 불안정 시뮬레이션:
1. 네트워크 끊기
2. 동기화 시작
3. 로그에서 retry 확인:
   ```
   [GmailSync] Batch X: Attempt 1 failed (network error), retrying in 1000ms...
   [GmailSync] Batch X: Attempt 2 failed, retrying in 2000ms...
   ```

### 4.4 배치 설정 확인

| 항목 | 기존 값 | 최적화 값 |
|------|--------|----------|
| BATCH_SIZE | 40 | 100 |
| BATCH_DELAY_MS | 500 | 200 |
| MAX_BATCHES | 25 | 25 |
| 최대 이메일 수 | 1,000 | 2,500 |

---

## 테스트 5: 이슈 생성 E2E

### 5.1 캡처 및 분석

1. `Cmd+Shift+L`로 캡처
2. "분석 시작" 클릭
3. AI 분석 완료 확인

### 5.2 Worker 호출 확인

**DevTools Network 탭에서:**
- URL이 `kangjun-f0f.workers.dev`인지 확인
- 응답 성공 (200 OK) 확인

### 5.3 이슈 생성

1. 제목/설명 확인
2. "Create Issue" 클릭
3. Linear에서 이슈 확인

---

## 테스트 체크리스트

### Worker API
- [ ] Notion auth 엔드포인트 응답
- [ ] Gmail auth 엔드포인트 응답
- [ ] Slack auth 엔드포인트 응답

### OAuth 연결
- [ ] Notion 연결 상태 표시
- [ ] Gmail 연결 상태 표시
- [ ] Slack 연결 상태 표시

### Notion Sync
- [ ] 로컬 리더 사용 로그 확인
- [ ] 배치 임베딩 로그 확인
- [ ] 동기화 완료 (에러 없음)

### Gmail Sync
- [ ] 배치 사이즈 100 확인
- [ ] 배치 임베딩 로그 확인
- [ ] 동기화 완료 (에러 없음)

### E2E
- [ ] 캡처 동작
- [ ] AI 분석 동작 (Worker 호출)
- [ ] 이슈 생성 성공

---

## 문제 발생 시

### Worker 연결 실패
```bash
# Worker 상태 확인
curl -I "https://linear-capture-ai.kangjun-f0f.workers.dev"

# Secrets 확인 (Cloudflare Dashboard)
# Workers & Pages → linear-capture-ai → Settings → Variables
```

### OAuth 연결 실패
1. Cloudflare Dashboard에서 해당 서비스 secrets 확인
2. 각 OAuth provider 설정에서 redirect URI 확인
3. 앱 재시작 후 재시도

### Sync 실패
```javascript
// DevTools Console에서 에러 로그 확인
// 특히 "[NotionSync]", "[GmailSync]" 프리픽스 로그 확인
```

---

## 완료 기준

모든 체크리스트 항목이 통과하면 테스트 완료.

실패 항목이 있으면 해당 섹션의 "문제 발생 시" 가이드 참고.
