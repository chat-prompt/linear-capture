# Draft: 로컬 벡터 검색 구현

## Requirements (confirmed)
- **저장소**: SQLite (sql.js WASM) + Float32Array BLOB
- **임베딩 API**: OpenAI 또는 Gemini (로컬 모델 불필요)
- **검색 방식**: 브루트포스 코사인 유사도 + FTS5 하이브리드
- **대상 데이터**: Slack, Notion, Gmail, Linear (로컬 캐시)
- **목표 규모**: 5K-20K 문서

## Technical Decisions
- **sql.js 재사용**: 이미 Notion 로컬 DB 읽기에 사용 중
- **임베딩 저장**: Float32Array → BLOB 변환
- **하이브리드 검색**: FTS5 키워드 + 코사인 유사도 RRF 결합
- **캐싱**: 임베딩은 로컬 DB에 영구 저장 (재계산 방지)

## Research Findings
- **벤치마크**: 100K 768-dim vectors에서 sqlite-vec는 부적합, LanceDB 우수
- **현재 규모**: 20K 이하에서 브루트포스 100-200ms 충분
- **LanceDB**: 50K+ 도달 시 마이그레이션 옵션

## Architecture
```
src/services/
├── local-vector-store.ts     # SQLite DB + 임베딩 CRUD
├── embedding-client.ts       # OpenAI/Gemini API 래퍼
├── hybrid-search.ts          # FTS5 + 벡터 검색 결합
└── context-sync.ts           # 소스별 동기화 (Slack, Notion, etc.)
```

## Scope Boundaries
- INCLUDE: 임베딩 저장/검색, 하이브리드 검색, 캐싱
- EXCLUDE: Worker 수정, 기존 Worker 검색 제거 (fallback 유지)

## Confirmed Decisions
- [x] 임베딩 API: OpenAI text-embedding-3-small (Worker 경유)
- [x] 임베딩 차원: 1536 (기본, 최고 품질)
- [x] 동기화 트리거: 앱 시작 시
- [x] 테스트: TDD (vitest - package.json에 이미 설정됨)
- [x] Phase 1 데이터 소스: Slack 메시지 (SlackAdapter 재사용)
- [x] API 위치: Worker 경유 (기존 아키텍처 일관성)

## Metis Guardrails
- MUST: 기존 SemanticSearchService 인터페이스 유지
- MUST: FTS5 가용성 sql.js에서 확인
- MUST: 에러 핸들링 체인 (로컬 → FTS → 빈 결과)
- MUST NOT: Phase 1에서 UI 변경
- MUST NOT: 동시에 여러 소스 인덱싱

## Test Strategy Decision
- **Infrastructure exists**: NO → 설정 필요
- **User wants tests**: YES (TDD)
- **Framework**: bun test
- **QA approach**: 단위 테스트 + 수동 검증
