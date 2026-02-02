# Notion 페이지 본문 가져오기 구현 계획

## 개요

현재 Notion 검색은 페이지 제목만 표시합니다. 선택한 페이지의 본문 내용을 Context에 포함하도록 개선합니다.

## Notion API 구조

| API | 엔드포인트 | 용도 |
|-----|-----------|------|
| Search | `POST /v1/search` | 페이지 검색 (**제목만** - API 한계) |
| Blocks | `GET /v1/blocks/{page_id}/children` | 페이지 본문 블록 조회 |

> **API 한계**: Notion Search API는 페이지 제목만 검색합니다. 본문 내용으로 검색하려면 별도 검색 인덱스 구축이 필요합니다.

## 지원할 블록 타입

| 블록 타입 | 설명 | 텍스트 추출 |
|----------|------|------------|
| `paragraph` | 일반 텍스트 | `rich_text[].plain_text` |
| `heading_1/2/3` | 제목 | `rich_text[].plain_text` |
| `bulleted_list_item` | 불릿 리스트 | `rich_text[].plain_text` |
| `numbered_list_item` | 번호 리스트 | `rich_text[].plain_text` |
| `to_do` | 체크박스 | `rich_text[].plain_text` + `checked` |
| `quote` | 인용문 | `rich_text[].plain_text` |
| `callout` | 콜아웃 | `rich_text[].plain_text` |
| `code` | 코드 블록 | `rich_text[].plain_text` + `language` |
| `toggle` | 토글 | `rich_text[].plain_text` |

**제외**: `image`, `video`, `file`, `embed`, `bookmark`, `divider`, `table_of_contents`, `breadcrumb`

## 구현 범위

### Phase 1: Worker 엔드포인트 ✅

**파일**: `linear-capture-worker/src/notion/blocks.ts`

```typescript
// GET /notion/blocks?device_id=xxx&page_id=xxx
export async function handleNotionBlocks(
  request: Request,
  env: NotionEnv,
  corsHeaders: Record<string, string>
): Promise<Response>
```

**로직**:
1. `getValidNotionToken()`으로 토큰 획득
2. `GET /v1/blocks/{page_id}/children` 호출
3. 텍스트 블록만 필터링 + plain_text 추출
4. 최대 2000자로 truncate (Context 크기 제한)

**응답 형식**:
```json
{
  "success": true,
  "pageId": "xxx",
  "content": "추출된 텍스트 내용...",
  "blockCount": 15,
  "truncated": false
}
```

### Phase 2: Worker 라우팅 ✅

**파일**: `linear-capture-worker/src/index.ts`

```typescript
if (path === '/notion/blocks' && request.method === 'GET') {
  return await handleNotionBlocks(request, env as NotionEnv, corsHeaders);
}
```

### Phase 3: App 서비스 메서드 ✅

**파일**: `linear-capture/src/services/notion-client.ts`

```typescript
export interface NotionPageContent {
  success: boolean;
  pageId?: string;
  content?: string;
  blockCount?: number;
  truncated?: boolean;
  error?: string;
}

async getPageContent(pageId: string): Promise<NotionPageContent>
```

### Phase 4: App IPC 핸들러 ✅

**파일**: `linear-capture/src/main/index.ts`

```typescript
ipcMain.handle('notion-get-content', async (_event, { pageId }: { pageId: string }) => {
  if (!notionService) {
    return { success: false, error: 'Notion service not initialized' };
  }
  return await notionService.getPageContent(pageId);
});
```

### Phase 5: 프론트엔드 로직 ✅

**파일**: `linear-capture/src/renderer/index.html`

**변경 사항**:
1. `selectedNotionPages` 구조 확장: `{ ...page, content?: string }`
2. 페이지 선택 시 본문 로딩 (lazy load)
3. `buildContextSection()` 수정: 본문 포함

**로딩 전략**:
- 페이지 선택 시점에 본문 가져오기 (선택 해제 시 캐시 유지)

**Context 출력 형식**:
```markdown
### Notion Pages

#### 📄 페이지 제목 (2024년 1월 29일)

페이지 본문 내용이 여기에 표시됩니다.
최대 2000자까지 표시되며, 초과 시 truncate됩니다.

[View in Notion](https://notion.so/xxx)

---
```

## 제약 사항

| 항목 | 제한 |
|------|------|
| 본문 최대 길이 | 2000자/페이지 |
| 중첩 블록 | 1레벨만 (children 재귀 호출 안함) |
| Rate Limit | 분당 3 burst (Notion API) |

## 작업 순서

1. [x] Worker: `blocks.ts` 생성 + 텍스트 추출 로직
2. [x] Worker: `index.ts`에 라우트 추가
3. [x] Worker: 배포 + 테스트
4. [x] App: `notion-client.ts`에 `getPageContent()` 추가
5. [x] App: `index.ts`에 IPC 핸들러 추가
6. [x] App: `index.html` 프론트엔드 로직 수정
7. [x] E2E 테스트

---

## Phase 2: 본문 검색 (미구현 - 향후 계획)

### 배경

Notion Search API (`POST /v1/search`)는 **페이지 제목만 검색**합니다. 본문 내용으로 검색하려면 별도 구현이 필요합니다.

### 구현 방법 비교

| 방법 | 설명 | 장점 | 단점 |
|------|------|------|------|
| **검색 인덱스 구축** | Algolia/Meilisearch에 본문 인덱싱 | 빠름, 퍼지 검색 | 인프라 필요, 동기화 복잡 |
| **실시간 본문 검색** | 검색 시 최근 페이지 본문 fetch → 클라이언트 필터링 | 간단, 항상 최신 | 느림, API 호출 많음 |

### 검색 인덱스 방식 (권장)

```
[주기적 동기화]
1. POST /v1/search로 최근 수정 페이지 조회 (last_edited_time 필터)
2. 각 페이지 본문 추출 (GET /v1/blocks/{page_id}/children)
3. Algolia/Meilisearch에 인덱싱

[검색 시]
1. 검색 엔진에 쿼리
2. 결과 페이지 ID로 Notion 페이지 정보 조회
```

### 실시간 방식 (간단)

```
[검색 시]
1. POST /v1/search로 최근 페이지 20개 조회 (query 없이)
2. 각 페이지 본문 fetch (병렬)
3. 클라이언트에서 제목+본문 키워드 매칭
4. 매칭 결과 표시
```

### 예상 작업량

| 방식 | 예상 시간 |
|------|----------|
| 실시간 본문 검색 | 2-3시간 |
| 검색 인덱스 (Algolia) | 1-2일 |
