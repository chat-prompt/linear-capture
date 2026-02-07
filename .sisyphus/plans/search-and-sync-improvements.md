# 검색 품질 및 Gmail 동기화 성능 개선

## TL;DR

> **Quick Summary**: Gmail 동기화 속도 개선 + Linear "cto" 같은 메타데이터 검색 지원
> 
> **Deliverables**:
> - Gmail 배치 임베딩으로 동기화 속도 **10배** 개선 (8초 → 0.8초/배치)
> - 검색 시 metadata 필드 포함 (담당자, 프로젝트, 라벨)
> 
> **Estimated Effort**: Short (1시간) - **embedBatch() 이미 구현됨!**
> **Parallel Execution**: YES - 2 waves

## ⚠️ 중요 발견

**`embedBatch()` 메서드가 이미 `embedding-service.ts`에 구현되어 있습니다!** (라인 69-121)

Gmail sync에서 사용하지 않고 있을 뿐입니다. 따라서 **Phase 2-1은 SKIP**.

---

## Context

### 문제 1: Gmail 동기화 느림

**현재 상황:**
- 이메일 1개당 1회 OpenAI API 호출 (임베딩 생성)
- 40개 × 25배치 = 최대 1000회 API 호출
- 각 API 호출당 ~200-500ms → 총 3-8분 소요

**병목 분석:**
```
이메일 40개 배치 처리 시간:
- 40 × 임베딩 API (200ms) = 8초
- 40 × DB 저장 (10ms) = 0.4초
- 배치 딜레이 = 0.5초
→ 배치당 약 9초, 25배치면 3.75분
```

### 문제 2: Linear 검색 누락

**현재 검색 범위:**
- `title` - 이슈 제목
- `content` - 이슈 설명

**검색 누락 필드:**
- `metadata.assigneeName` - 담당자 이름
- `metadata.projectName` - 프로젝트 이름  
- `metadata.labels` - 라벨
- `metadata.teamName` - 팀 이름

**예시:** "cto" 검색 시
- Linear 이슈 담당자가 "CTO 김경호"이면 → 현재: 못 찾음
- 프로젝트가 "CTO Office"이면 → 현재: 못 찾음

---

## TODOs

### Phase 1: 검색 개선 (metadata 포함)

- [ ] 1-1. likeSearch()에 metadata 검색 추가

  **What to do**:
  
  `src/services/local-search.ts`의 `likeSearch()` 수정:
  
  ```typescript
  private async likeSearch(query: string, limit: number, source?: string): Promise<SearchResult[]> {
    const db = this.dbService.getDb();
    
    // metadata 필드도 검색에 포함
    const conditions = [`(
      content ILIKE $1 
      OR title ILIKE $1
      OR metadata->>'assigneeName' ILIKE $1
      OR metadata->>'projectName' ILIKE $1
      OR metadata->>'teamName' ILIKE $1
      OR metadata::text ILIKE $1
    )`];
    // ...
  }
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Acceptance Criteria**:
  - [ ] "cto" 검색 시 Linear 이슈 중 담당자/프로젝트에 "cto" 있으면 표시
  - [ ] 기존 title/content 검색 품질 유지

  **Commit**: YES
  - Message: `feat(search): include metadata fields in LIKE search`
  - Files: `src/services/local-search.ts`

---

- [ ] 1-2. Linear sync 시 content에 메타데이터 포함 (선택적 개선)

  **What to do**:
  
  Linear 이슈 동기화 시 `content`에 담당자/프로젝트 정보 추가:
  
  `src/services/sync-adapters/linear-sync.ts`의 `syncIssue()` 수정:
  
  ```typescript
  private async syncIssue(issue: Issue): Promise<void> {
    // 메타데이터를 content에 포함 (검색 가능하도록)
    const assigneeName = (await issue.assignee)?.name || '';
    const projectName = (await issue.project)?.name || '';
    const teamName = (await issue.team)?.name || '';
    const labels = (await issue.labels())?.nodes.map(l => l.name).join(', ') || '';
    
    const content = [
      issue.description || '',
      `담당자: ${assigneeName}`,
      `프로젝트: ${projectName}`,
      `팀: ${teamName}`,
      `라벨: ${labels}`,
    ].filter(Boolean).join('\n');
    
    // ... 기존 로직
  }
  ```

  **장점**: FTS(Full-Text Search)에서도 검색 가능
  **단점**: 기존 데이터 re-sync 필요

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Acceptance Criteria**:
  - [ ] 새로 동기화되는 Linear 이슈에 담당자/프로젝트 정보 포함
  - [ ] "cto" 검색 시 FTS에서도 검색됨

  **Commit**: YES
  - Message: `feat(sync): include metadata in Linear issue content for better search`
  - Files: `src/services/sync-adapters/linear-sync.ts`

---

### Phase 2: Gmail 동기화 성능 개선

- [ ] 2-1. 배치 임베딩 구현

  **What to do**:
  
  OpenAI Embeddings API는 배치 입력 지원 (최대 2048 texts):
  
  `src/services/embedding-service.ts`에 `embedBatch()` 추가:
  
  ```typescript
  /**
   * Batch embedding - process multiple texts in one API call
   * OpenAI supports up to 2048 texts per request
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (texts.length === 1) return [await this.embed(texts[0])];
    
    // 토큰 제한으로 청크 분할 (안전하게 10개씩)
    const CHUNK_SIZE = 10;
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunk = texts.slice(i, i + CHUNK_SIZE);
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunk,
      });
      results.push(...response.data.map(d => d.embedding));
    }
    
    return results;
  }
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Acceptance Criteria**:
  - [ ] `embedBatch()` 메서드 존재
  - [ ] 10개 텍스트를 1회 API 호출로 임베딩

  **Commit**: YES
  - Message: `feat(embedding): add batch embedding support`
  - Files: `src/services/embedding-service.ts`

---

- [ ] 2-2. Gmail sync에서 배치 임베딩 사용

  **What to do**:
  
  `src/services/sync-adapters/gmail-sync.ts` 수정:
  
  ```typescript
  // Before: 이메일 하나씩 처리
  for (const email of searchResult.messages) {
    await this.syncEmail(email);  // 내부에서 embed() 호출
  }
  
  // After: 배치로 묶어서 처리
  const emails = searchResult.messages;
  const texts = emails.map(e => this.preprocessor.preprocess(
    `${e.subject || ''}\n${e.snippet || ''}`
  ));
  
  // 배치 임베딩 (1회 API 호출로 40개 처리)
  const embeddings = await this.embeddingService.embedBatch(texts);
  
  // DB 저장 (병렬 처리)
  await Promise.all(emails.map((email, i) => 
    this.syncEmailWithEmbedding(email, embeddings[i])
  ));
  ```

  **예상 개선 효과:**
  - Before: 40개 × 200ms = 8초/배치
  - After: 4회 × 200ms = 0.8초/배치
  - **10배 빠름!**

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Acceptance Criteria**:
  - [ ] Gmail 동기화 시 배치 임베딩 사용
  - [ ] 40개 이메일 동기화 시간 < 2초 (이전 ~8초)

  **Commit**: YES
  - Message: `perf(gmail): use batch embedding for faster sync`
  - Files: `src/services/sync-adapters/gmail-sync.ts`

---

## Execution Strategy

```
Phase 1 (검색 개선):
├── 1-1: likeSearch metadata 추가 (30분)
└── 1-2: Linear sync content 개선 (30분)
    ↓
Phase 2 (Gmail 성능):
├── 2-1: embedBatch() 구현 (30분)
└── 2-2: Gmail sync 적용 (1시간)
```

**병렬 실행 가능**: Phase 1과 Phase 2는 독립적

---

## Success Criteria

### 검색 품질
- [ ] "cto" 검색 시 Linear 이슈에서 담당자/프로젝트 "cto" 포함 결과 표시
- [ ] 기존 검색 품질 (title, content) 유지

### Gmail 성능
- [ ] 40개 이메일 배치 처리 시간: ~8초 → ~2초
- [ ] 전체 동기화 시간: ~4분 → ~1분 (75% 개선)

---

## 참고: 현재 브랜치

이 작업은 `feature/local-sync-integration` 브랜치에서 진행 중입니다.
(bash 명령 실행 불가로 직접 확인 못 함 - `/start-work` 시 확인 필요)
