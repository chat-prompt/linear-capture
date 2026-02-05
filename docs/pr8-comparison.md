# PR #8 vs Master 버전 비교 분석

> **PR #8**: `feat: Auto Sync Scheduler & Search Channel Filtering`  
> **Author**: primadonna-gpters  
> **Branch**: `feature/local-search-architecture`  
> **분석일**: 2025-02-04

---

## 요약

| 항목 | Master (현재) | PR #8 |
|------|--------------|-------|
| **검색 아키텍처** | 실시간 API + Slack만 로컬 | 전체 로컬 동기화 |
| **동기화 소스** | Slack만 로컬 저장 | Slack + Notion + Linear |
| **Auto Sync** | ❌ | ✅ (5분~24시간 주기) |
| **채널 필터링** | ❌ | ✅ |
| **DB** | sql.js (SQLite) | PGlite + pgvector |
| **임베딩 생성** | Worker API | OpenAI API 직접 |

---

## 아키텍처 비교

### Master 버전: 이중 구조

```
┌─────────────────────────────────────────────────────────────┐
│  1. Context Adapters (실시간 API 호출)                        │
│     - LinearAdapter.fetchItems(query) → Linear API 호출      │
│     - SlackAdapter.fetchItems(query) → Slack API 호출        │
│     - NotionAdapter.fetchItems(query) → Notion API 호출      │
│     - GmailAdapter.fetchItems(query) → Gmail API 호출        │
│     → 검색할 때마다 API 호출, 로컬 저장 안 함                   │
└─────────────────────────────────────────────────────────────┘
                              +
┌─────────────────────────────────────────────────────────────┐
│  2. SlackSync + LocalVectorStore (로컬 동기화)                │
│     - SlackSync: Slack 메시지 → 로컬 DB 저장                  │
│     - LocalVectorStore: sql.js 기반 벡터 저장소               │
│     - HybridSearch: FTS + Vector 검색                        │
│     - EmbeddingClient: Worker API로 임베딩 생성               │
│     → Slack만 로컬 동기화, 나머지는 실시간                     │
└─────────────────────────────────────────────────────────────┘
```

**소스별 동작:**

| 소스 | 실시간 API | 로컬 동기화 | 비고 |
|------|-----------|-----------|------|
| Linear | ✅ | ❌ | 검색 시 매번 API 호출 |
| Slack | ✅ | ✅ | 둘 다 지원 |
| Notion | ✅ | ❌ | 검색 시 매번 API 호출 |
| Gmail | ✅ | ❌ | 검색 시 매번 API 호출 |

---

### PR #8 버전: 통합 로컬 구조

```
┌─────────────────────────────────────────────────────────────┐
│  sync-adapters (로컬 동기화 통합)                             │
│     - SlackSyncAdapter: Slack → 로컬 DB                      │
│     - NotionSyncAdapter: Notion → 로컬 DB                    │
│     - LinearSyncAdapter: Linear → 로컬 DB                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  DatabaseService (PGlite + pgvector)                        │
│     - PostgreSQL 기반 로컬 DB                                │
│     - pgvector 확장으로 벡터 검색                             │
│     - Full-Text Search 내장                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  LocalSearchService (Hybrid Search + RRF)                   │
│     - Semantic Search: pgvector cosine similarity           │
│     - Keyword Search: PostgreSQL FTS                        │
│     - RRF (Reciprocal Rank Fusion): 결과 병합               │
└─────────────────────────────────────────────────────────────┘
                              +
┌─────────────────────────────────────────────────────────────┐
│  Auto Sync Scheduler                                        │
│     - 5분 / 15분 / 30분 / 1시간 / 6시간 / 24시간 주기         │
│     - 연결된 모든 소스 자동 동기화                             │
└─────────────────────────────────────────────────────────────┘
```

**소스별 동작:**

| 소스 | 로컬 동기화 | Auto Sync | 채널 필터링 |
|------|-----------|-----------|------------|
| Linear | ✅ | ✅ | - |
| Slack | ✅ | ✅ | ✅ |
| Notion | ✅ | ✅ | - |
| Gmail | ❓ | ❓ | - |

---

## 주요 변경사항

### 1. Auto Sync Scheduler

연결된 소스를 사용자 설정 주기로 자동 동기화.

**설정 옵션**: Off, 5분, 15분, 30분, 1시간, 6시간, 24시간

**구현 파일:**
- `src/services/settings-store.ts`: `SyncInterval` 타입, getter/setter
- `src/main/index.ts`: `runAutoSync()`, `startSyncScheduler()`, `stopSyncScheduler()`
- `src/renderer/settings.html`: Auto Sync 드롭다운 UI

### 2. Search Channel Filtering

Slack 검색 시 선택한 채널만 결과에 포함.

**동작:**
- 채널 선택됨 → 해당 채널 메시지만 검색
- 채널 미선택 → Slack 결과 전체 제외

**구현 파일:**
- `src/services/local-search.ts`: `semanticSearch()`, `keywordSearch()`에 필터링 로직
- `src/services/sync-adapters/slack-sync.ts`: 채널별 `sourceId` 포함

### 3. Database 업그레이드

| 항목 | Master | PR #8 |
|------|--------|-------|
| DB 엔진 | sql.js (SQLite) | PGlite (PostgreSQL) |
| 벡터 검색 | 직접 구현 (cosine similarity) | pgvector 확장 |
| FTS | SQLite FTS5 | PostgreSQL tsvector |

### 4. 임베딩 생성 방식 변경

| 항목 | Master | PR #8 |
|------|--------|-------|
| 생성 위치 | Worker API 호출 | 앱에서 OpenAI API 직접 |
| API 키 관리 | Worker에서 관리 | 사용자가 입력 |
| 의존성 | Worker 서버 필요 | 독립 실행 가능 |

---

## 파일 변경 요약

### 새로 추가된 파일

```
src/services/
├── database.ts              # PGlite + pgvector DB 서비스
├── embedding-service.ts     # OpenAI 임베딩 서비스
├── local-search.ts          # 하이브리드 검색 서비스
├── text-preprocessor.ts     # 텍스트 전처리
└── sync-adapters/
    ├── slack-sync.ts        # Slack 동기화 어댑터
    ├── notion-sync.ts       # Notion 동기화 어댑터
    └── linear-sync.ts       # Linear 동기화 어댑터
```

### 수정된 파일

```
src/main/index.ts            # Auto Sync 스케줄러, IPC 핸들러 추가
src/renderer/settings.html   # Auto Sync UI, 채널 필터링 UI
src/services/semantic-search.ts  # LocalSearchService로 위임
src/services/settings-store.ts   # SyncInterval 설정 추가
locales/*/translation.json   # i18n 키 추가 (5개 언어)
```

### 삭제된 파일

```
.sisyphus/plans/*.md         # 계획 파일들 (gitignore 처리)
```

---

## 장단점 비교

### PR #8 장점

| 장점 | 설명 |
|------|------|
| **Worker 의존성 제거** | 네트워크 없어도 검색 가능, Worker 비용 절감 |
| **Auto Sync** | 수동 동기화 불필요, 항상 최신 상태 |
| **통합 로컬 검색** | Linear, Notion도 로컬에서 빠르게 검색 |
| **채널 필터링** | 원하는 Slack 채널만 검색 |
| **강력한 DB** | pgvector로 더 정확한 벡터 검색 |
| **RRF 하이브리드** | Semantic + Keyword 결과 최적 병합 |

### PR #8 단점/주의점

| 단점 | 설명 |
|------|------|
| **초기 동기화 느림** | 5분+ (모든 데이터 + 임베딩 생성) |
| **OpenAI API 키 필요** | 사용자가 직접 입력해야 함 |
| **로컬 용량 증가** | 모든 데이터 + 임베딩 저장 |
| **빌드 에러** | `src/main/index.ts:1187` 수정 필요 |

---

## 초기 동기화 성능 분석

### 🐢 초기 동기화가 느린 핵심 원인

#### 1. 메시지마다 개별 API 호출 (가장 큰 병목)

```typescript
// slack-sync.ts:390
private async syncMessage(...) {
  // ...
  const embedding = await this.embeddingService.embed(preprocessedText);  // ⚠️ 메시지 1개당 1번 API 호출!
  // ...
}
```

**문제:**
- 메시지 1,000개 = **OpenAI API 1,000번 호출**
- 각 호출 ~100-300ms
- 스레드 답변도 개별 호출

**시간 계산:**
```
메시지 1,000개 × 200ms = 200초 (3.3분)
+ 스레드 답변 500개 × 200ms = 100초 (1.6분)
= 약 5분
```

#### 2. 배치 함수가 있는데 사용하지 않음

```typescript
// embedding-service.ts:69
async embedBatch(texts: string[]): Promise<number[][]> {  // ✅ 배치 함수 존재!
  // 최대 2048개까지 한 번에 처리 가능
}
```

**하지만 slack-sync.ts에서는:**
```typescript
// 개별 호출만 사용 중
const embedding = await this.embeddingService.embed(preprocessedText);  // ❌ 단일 호출
```

#### 3. 메시지 순차 처리

```typescript
// slack-sync.ts:284
for (const message of historyResult.messages) {  // 순차 처리
  await this.syncMessage(message, channel);      // 하나씩 기다림
  
  for (const reply of message.replies) {         // 답변도 순차
    await this.syncThreadReply(reply, ...);
  }
}
```

### 📊 병목 시각화

```
현재 방식 (순차 + 개별 호출):
┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
│msg1│→│msg2│→│msg3│→│msg4│→│... │  = 5분+
└────┘ └────┘ └────┘ └────┘ └────┘
 API    API    API    API    API
 호출   호출   호출   호출   호출

최적화 방식 (배치):
┌─────────────────────────────────┐
│  msg1, msg2, msg3, ... msg100   │  = 수십 초
└─────────────────────────────────┘
          1번 API 호출
```

### 💡 최적화 방안

| 방안 | 예상 개선 | 난이도 | 설명 |
|------|----------|--------|------|
| **배치 임베딩 사용** | 10~20배 빨라짐 | 중간 | 메시지 수집 → 한 번에 임베딩 → DB 저장 |
| **병렬 처리 추가** | 2~3배 빨라짐 | 쉬움 | Promise.all로 N개씩 동시 처리 |
| **증분 동기화 기본값** | 초기 이후 빠름 | 이미 구현됨 | lastCursor 이후만 처리 |

**핵심**: `embedBatch()` 사용 시 1,000번 호출 → 10번 호출로 줄어들어서 **5분 → 30초** 가능!

---

## 의존성 변경

```diff
dependencies:
+ "@electric-sql/pglite": "^0.2.0"   # PostgreSQL 로컬 DB
+ "openai": "^6.17.0"                # OpenAI API (임베딩)
+ "tiktoken": "^1.0.22"              # 토큰 계산
  "sql.js": "^1.13.0"                # 유지 (호환성)
```

---

## 마이그레이션 고려사항

### Master → PR #8 전환 시

1. **OpenAI API 키 설정 필요**
   - Settings에서 OpenAI API Key 입력
   - 임베딩 생성에 사용

2. **초기 동기화 시간**
   - 첫 실행 시 모든 데이터 동기화
   - 채널/페이지 수에 따라 5분+ 소요

3. **기존 로컬 데이터**
   - sql.js DB → PGlite DB 마이그레이션 필요 여부 확인
   - 또는 처음부터 새로 동기화

4. **Gmail 지원**
   - PR #8에서 Gmail sync-adapter 없음
   - 실시간 API 호출로 유지되는지 확인 필요

---

## 빌드 에러 및 누락 사항 (머지 전 수정 필요)

PR #8 브랜치에서 TypeScript 빌드 시 다음 에러들이 발생합니다.

### 1. 누락된 파일

| 파일 | 상태 | 설명 |
|------|------|------|
| `src/services/text-preprocessor.ts` | ❌ 누락 | slack-sync.ts에서 import하지만 파일 없음 |

### 2. settings-store.ts 누락된 export

`src/services/settings-store.ts`에서 다음 함수/타입들이 export되지 않음:

```typescript
// 누락된 export 목록
export type SyncInterval = ...;
export function getOpenaiApiKey(): string | null;
export function setOpenaiApiKey(key: string): void;
export function getSyncInterval(): SyncInterval;
export function setSyncInterval(interval: SyncInterval): void;
export function getSyncIntervalMs(): number;
export function getSelectedSlackChannels(): SlackChannel[];
export function setSelectedSlackChannels(channels: SlackChannel[]): void;
```

### 3. sync-adapters 모듈 인식 오류

```
Cannot find module '../services/sync-adapters/notion-sync'
Cannot find module '../services/sync-adapters/slack-sync'
Cannot find module '../services/sync-adapters/linear-sync'
```

파일은 존재하지만 TypeScript가 모듈로 인식하지 못함. `tsconfig.json` 또는 파일 구조 확인 필요.

### 4. index.ts 함수 호출 인자 불일치

```
src/main/index.ts(1188,65): error TS2554: Expected 2-3 arguments, but got 4.
```

### 전체 에러 목록

```
src/main/index.ts
├── [32:3]  Module has no exported member 'setOpenaiApiKey'
├── [33:3]  Module has no exported member 'getSyncIntervalMs'
├── [34:3]  Module has no exported member 'setSyncInterval'
├── [35:3]  Module has no exported member 'getSyncInterval'
├── [37:3]  Module has no exported member 'SyncInterval'
├── [49:41] Cannot find module '../services/sync-adapters/notion-sync'
├── [50:40] Cannot find module '../services/sync-adapters/slack-sync'
├── [51:41] Cannot find module '../services/sync-adapters/linear-sync'
├── [1046:13] Property 'getSelectedSlackChannels' does not exist
├── [1051:13] Property 'setSelectedSlackChannels' does not exist
├── [1188:65] Expected 2-3 arguments, but got 4
└── [1279:17] Property 'getSelectedSlackChannels' does not exist

src/services/sync-adapters/slack-sync.ts
├── [15:40] Cannot find module '../text-preprocessor'
├── [19:39] Cannot find module '../text-preprocessor'
└── [21:23] Module has no exported member 'getSelectedSlackChannels'

src/services/embedding-service.ts
└── [16:34] Property 'getOpenaiApiKey' does not exist
```

### 수정 방향

1. **text-preprocessor.ts 파일 추가** 또는 import 경로 수정
2. **settings-store.ts에 누락된 함수들 export 추가**
3. **sync-adapters 모듈 경로 확인** (상대 경로 또는 tsconfig paths)
4. **index.ts:1188 함수 호출 인자 수정**

---

## 결론

PR #8은 **검색 아키텍처를 전면 개편**한 버전:

- **실시간 API 호출 → 로컬 동기화** (Linear, Notion 포함)
- **수동 → Auto Sync** (주기적 자동 갱신)
- **sql.js → PGlite + pgvector** (더 강력한 검색)

**트레이드오프**: Worker 의존성 제거 대신 사용자가 OpenAI API 키 직접 관리

**추천**: 기능적으로 더 발전된 버전이므로, OpenAI API 키 입력 UX를 수용할 수 있다면 PR #8 채택 권장. 단, 초기 동기화 성능 최적화(배치 임베딩)를 추가로 적용하면 더욱 좋음.
