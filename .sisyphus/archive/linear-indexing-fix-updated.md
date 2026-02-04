# Linear 인덱싱 문제 해결 (수정본)

> **NOTE**: 이 파일을 worktree의 `.sisyphus/plans/linear-indexing-fix.md`에 복사하세요.
> ```bash
> cp .sisyphus/plans/linear-indexing-fix-updated.md \
>    ../linear-capture-worktrees/worker-indexing/.sisyphus/plans/linear-indexing-fix.md
> ```

---

## TL;DR

> **Quick Summary**: Linear 인덱싱이 `Invalid JSON body` 에러로 실패 → 앱에서 Linear 이슈 데이터를 가져와 Worker에 전달하도록 수정
> 
> **Deliverables**:
> - `src/services/linear-client.ts` - `getRecentIssues()` 메서드 추가
> - `src/services/worker-indexing.ts` - Linear 전용 인덱싱 로직 추가
> 
> **Estimated Effort**: Quick (30분)
> **Parallel Execution**: NO - sequential

---

## Context

### 문제 상황
- Gmail, Notion, Slack 인덱싱: ✅ 정상 작동
- Linear 인덱싱: ❌ `Invalid JSON body` 에러

### 원인 분석

**Worker 엔드포인트별 동작 방식:**

| 소스 | Worker 동작 | 앱에서 보내는 것 |
|------|-------------|-----------------|
| Gmail | Worker가 저장된 OAuth 토큰으로 Gmail API 호출 | `POST /index/gmail?device_id=xxx` (body 없음) |
| Slack | Worker가 저장된 OAuth 토큰으로 Slack API 호출 | `POST /index/slack?device_id=xxx` (body 없음) |
| Notion | Worker가 저장된 OAuth 토큰으로 Notion API 호출 | `POST /index/notion?device_id=xxx` (body 없음) |
| **Linear** | **앱에서 issues 배열을 body로 전달해야 함** | 현재 body 없음 ❌ |

**이유**: Gmail/Slack/Notion은 OAuth 토큰이 Worker에 저장됨. Linear는 앱에서 토큰 관리 → Worker에 토큰 없음 → 앱이 데이터를 보내야 함.

### Worker가 기대하는 Linear 요청 형식

```typescript
// POST /index/linear?device_id=xxx
// Content-Type: application/json
{
  "device_id": "xxx",
  "issues": [
    {
      "id": "issue-uuid",
      "identifier": "PROD-123",
      "title": "이슈 제목",
      "description": "이슈 설명",
      "url": "https://linear.app/team/issue/PROD-123",
      "state": { "name": "In Progress" },
      "updatedAt": "2025-02-03T12:00:00Z"
    }
  ]
}
```

---

## Work Objectives

### Core Objective
Linear 인덱싱 시 앱에서 이슈 데이터를 가져와 Worker에 전달하여 AI 추천에 Linear 이슈가 표시되도록 함

### Concrete Deliverables
- `src/services/linear-client.ts` 수정 - `getRecentIssues()` 메서드 추가
- `src/services/worker-indexing.ts` 수정 - Linear 전용 인덱싱 로직 추가

### Definition of Done
- [ ] `getRecentIssues()` 메서드가 Linear 이슈 배열 반환
- [ ] `indexToWorker('linear')` 호출 시 Linear API에서 이슈 fetch
- [ ] 가져온 이슈를 Worker 요청 body에 포함
- [ ] Worker 응답 `{ success: true, indexed: N }` 확인

### Must Have
- Linear API에서 최근 이슈 가져오기 (최대 100개)
- Worker 요청에 issues 배열 포함
- 에러 처리 (토큰 없음, API 실패 등)

### Must NOT Have
- Worker 코드 수정
- Linear OAuth 흐름 변경
- 새로운 UI 추가

---

## TODOs

- [ ] 1. linear-client.ts - getRecentIssues() 메서드 추가

  **What to do**:
  - `LinearService` 클래스에 `getRecentIssues(limit: number)` 메서드 추가
  - Linear SDK의 `this.client.issues()` API 사용하여 최근 이슈 조회
  - Worker가 기대하는 형식으로 매핑:
    ```typescript
    interface LinearIssueForIndex {
      id: string;
      identifier: string;  // "PROD-123"
      title: string;
      description: string | null;
      url: string;
      state: { name: string };
      updatedAt: string;  // ISO 8601
    }
    ```

  **Must NOT do**:
  - 기존 메서드 변경
  - 새로운 의존성 추가

  **References**:
  
  **Pattern References**:
  - `src/services/linear-client.ts:141-156` - `getTeams()` 메서드 패턴 참조
  - `src/services/linear-client.ts:252-286` - `getCycles()` 메서드 (async 루프 패턴)
  
  **API References**:
  - Linear SDK: `this.client.issues({ first: N, orderBy: PaginationOrderBy.UpdatedAt })`
  - 문서: https://developers.linear.app/docs/sdk/getting-started

  **Acceptance Criteria**:
  - [ ] `npm run build` 성공
  - [ ] `getRecentIssues(100)` 호출 시 이슈 배열 반환

  **Commit**: NO (다음 TODO와 함께 커밋)

---

- [ ] 2. worker-indexing.ts - Linear 전용 인덱싱 로직 추가

  **What to do**:
  - `indexToWorker('linear')` 함수 내에서 Linear 소스 분기 처리
  - `createLinearServiceFromEnv()`로 LinearService 인스턴스 생성
  - `getRecentIssues(100)`으로 이슈 목록 fetch
  - Worker 요청 body에 `device_id`와 `issues` 포함

  **Must NOT do**:
  - 다른 소스(gmail, notion, slack) 로직 변경
  - Worker 코드 수정

  **References**:
  
  **Pattern References**:
  - `src/services/linear-client.ts:324-334` - `createLinearServiceFromEnv()` 함수
  - `src/services/worker-indexing.ts:13-35` - 현재 indexToWorker 구현
  
  **API References**:
  - Worker endpoint: `POST /index/linear?device_id={deviceId}`
  - Request body: `{ device_id, issues: LinearIssueForIndex[] }`

  **Acceptance Criteria**:
  - [ ] `npm run build` 성공
  - [ ] 앱에서 Linear 인덱싱 시 콘솔에 `[Worker Indexing] linear indexed successfully: N items` 출력

  **Commit**: YES
  - Message: `fix(indexing): send Linear issues data to Worker for indexing`
  - Files: `src/services/linear-client.ts`, `src/services/worker-indexing.ts`

---

## Implementation Notes

### 구현 방향

```typescript
// worker-indexing.ts 수정안

import { createLinearServiceFromEnv } from './linear-client';

export async function indexToWorker(source: IndexSource): Promise<IndexResult> {
  const deviceId = getDeviceId();
  
  // Linear는 이슈 데이터를 body로 전달해야 함
  if (source === 'linear') {
    return indexLinearToWorker(deviceId);
  }
  
  // 다른 소스는 기존 로직 유지 (body 없이 POST)
  // ...
}

async function indexLinearToWorker(deviceId: string): Promise<IndexResult> {
  const linear = createLinearServiceFromEnv();
  if (!linear) {
    return { success: false, error: 'Linear not configured' };
  }
  
  // 최근 이슈 가져오기
  const issues = await linear.getRecentIssues(100);
  
  const response = await fetch(`${WORKER_URL}/index/linear?device_id=${deviceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, issues }),
  });
  
  return await response.json();
}
```

### getRecentIssues() 구현

```typescript
// linear-client.ts에 추가

export interface LinearIssueForIndex {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  state: { name: string };
  updatedAt: string;
}

// LinearService 클래스 내부에 추가
async getRecentIssues(limit: number = 100): Promise<LinearIssueForIndex[]> {
  try {
    const issues = await this.client.issues({
      first: limit,
      orderBy: LinearDocument.PaginationOrderBy.UpdatedAt,
    });
    
    const result: LinearIssueForIndex[] = [];
    for (const issue of issues.nodes) {
      const state = await issue.state;
      result.push({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description || null,
        url: issue.url,
        state: { name: state?.name || 'Unknown' },
        updatedAt: issue.updatedAt.toISOString(),
      });
    }
    return result;
  } catch (error) {
    console.error('Failed to fetch recent issues:', error);
    return [];
  }
}
```

---

## Success Criteria

### Verification Commands
```bash
# 빌드 확인
npm run build

# 앱 실행 후 콘솔에서 확인
# [Worker Indexing] linear indexed successfully: N items
```

### Final Checklist
- [ ] `getRecentIssues()` 메서드 추가됨
- [ ] Linear 인덱싱 시 Worker에 issues 배열 전달
- [ ] Worker 응답 success: true 확인
- [ ] 기존 Gmail/Notion/Slack 인덱싱 영향 없음
