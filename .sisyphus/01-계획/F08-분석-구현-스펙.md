# Draft: Analytics Implementation

## Requirements (confirmed)

### 지표 수집 목표
- **PMF 검증 단계**: "쓰이는가?" + "문제없이 작동하는가?" 2가지 질문에 답
- 최소한의 지표로 시작, 필요시 추가

### 수집할 이벤트 (5개)
| 이벤트 | 용도 | 상태 |
|--------|------|------|
| `app_open` | DAU/MAU | 이미 구현됨 |
| `issue_created` | 핵심 전환 | 이미 구현됨 |
| `api_error` | API 오류 추적 | **신규** |
| `capture_failed` | 캡처 실패 추적 | **신규** |
| `analysis_failed` | AI 분석 실패 추적 | **신규** |

### 공통 메타데이터
- `deviceId` - 이미 구현됨 (settings-store.ts의 getDeviceId)
- `appVersion` - **추가 필요**
- `timestamp` - **추가 필요**

### 저장소
- **Cloudflare D1** (SQL)
- Worker `/track` 엔드포인트에서 D1에 저장

## Technical Decisions

### 에러 타입 분류
```typescript
// api_error
errorType: 'auth' | 'network' | 'rate_limit' | 'server' | 'unknown'
endpoint: 'linear' | 'worker' | 'r2'

// capture_failed
errorType: 'permission_denied' | 'user_cancelled' | 'system_error'

// analysis_failed
errorType: 'timeout' | 'rate_limit' | 'invalid_response' | 'network'
model: 'haiku' | 'gemini'
```

### 구현 위치 (예상)
- `api_error`: linear-client.ts, anthropic-analyzer.ts, r2-uploader.ts의 catch 블록
- `capture_failed`: capture.darwin.ts의 에러 핸들링
- `analysis_failed`: anthropic-analyzer.ts, gemini-analyzer.ts의 catch 블록

## Open Questions

- [ ] Worker `/track` 엔드포인트 현재 구현 상태 확인 필요
- [ ] D1 데이터베이스 이미 설정되어 있는지 확인 필요

## Scope Boundaries

### INCLUDE
- 앱 측: 새 이벤트 추가, appVersion/timestamp 메타데이터 추가
- Worker 측: D1 저장 로직 구현
- 타입 정의 업데이트

### EXCLUDE
- 퍼널 지표 (배포 후 1-2주 뒤)
- 대시보드 UI (SQL 쿼리로 조회)
- app_crash 이벤트 (선택 안 함)
