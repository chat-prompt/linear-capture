# Draft: Worker 인덱싱 호출 추가

## Requirements (confirmed)
- Gmail, Notion, Linear 모두 Worker `/index/*` 엔드포인트 호출 추가
- AI 추천 (`/ai/recommend`)에서 모든 소스가 검색되도록

## 현재 상황
- Worker에 `/index/gmail`, `/index/notion`, `/index/slack`, `/index/linear` 엔드포인트 존재
- 앱에서 이 엔드포인트를 호출하는 코드 없음
- Slack만 로컬 sync (`syncSlack()`)가 있고, Worker 인덱싱은 미호출
- AI 추천에서 일부 소스가 누락됨

## 기술적 결정
- 인덱싱 호출 시점: ?
- 재동기화 주기: ?
- 에러 처리 방식: ?

## Open Questions
- OAuth 완료 후 자동 인덱싱? 
- 주기적 재인덱싱 필요?
- 앱 시작 시 인덱싱?

## Scope Boundaries
- INCLUDE: Gmail, Notion, Linear 인덱싱 호출 추가
- EXCLUDE: ?
