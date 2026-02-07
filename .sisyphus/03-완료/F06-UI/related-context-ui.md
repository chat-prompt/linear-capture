# Related Context UI 통합

## TL;DR

> **Quick Summary**: 3개의 분리된 컨텍스트 검색 UI를 하나의 통합된 "Related Context" 패널로 개선. 검색창 = 필터 개념으로 자동 추천/검색 구분 제거.
> 
> **Deliverables**:
> - 새 `#relatedContextSection` UI 컴포넌트
> - 통합 IPC `context.getRelated` 핸들러
> - Title-검색창 연동 로직
> - 기존 3개 섹션 제거
> 
> **Estimated Effort**: Medium (1-2일)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
Linear Capture 앱의 UI가 혼란스러움:
- 컨텍스트 검색 영역 (Context Search)
- 제목의 추천 영역 (AI Recommendations)  
- Semantic Title 영역 (Semantic Search)

세 영역의 역할이 불명확하고, AI Recommendations는 결과가 안 나오는 경우가 많음.

### Interview Summary
**Key Discussions**:
- Oracle 자문: 하나의 "Related Context" 패널로 통합 권고
- "자동 추천 vs 검색" 구분이 사용자에게 인지 부하를 줌
- 검색창 = 필터 개념으로 재정의하여 통합

**Research Findings**:
- `#contextSection`: Slack/Notion/Gmail 수동 검색 (line 1237-1331)
- `#aiRecommendSection`: Title 기반 자동 추천, 300ms debounce, 3자 이상 (line 1337-1355)
- `#semanticSearchSection`: Description 아래, blur 시 자동 또는 수동 (line 1364-1397)
- IPC 3개 분리: `slack-search`, `ai-recommend`, `context-semantic-search`

### Metis Review
**Identified Gaps** (addressed):
- `context-semantic-search`는 `source` 파라미터 필요 → 여러 소스 병렬 호출 필요
- 기존 IPC 파라미터 불일치 (`text` vs `query`) → orchestration에서 변환
- i18n 텍스트 추가 시 `npm run translate` 필수

---

## Work Objectives

### Core Objective
3개의 분리된 컨텍스트 검색 UI를 하나의 직관적인 "Related Context" 패널로 통합하여 사용자 경험 개선

### Concrete Deliverables
- `src/main/index.ts`: 새 IPC 핸들러 `context.getRelated`
- `src/renderer/index.html`: 새 `#relatedContextSection` UI
- `src/renderer/related-context.css`: 스타일 (선택적, 인라인 가능)
- 기존 섹션 (`#contextSection`, `#aiRecommendSection`, `#semanticSearchSection`) 제거

### Definition of Done
- [ ] Title 입력 시 검색창에 자동 복사되고 검색 실행
- [ ] 검색어 수정 시 재검색
- [ ] 🔄 버튼 클릭 시 Title로 초기화
- [ ] Slack, Notion, AI 추천 결과가 통합 표시
- [ ] 결과 선택 후 Description에 삽입 가능
- [ ] 빈 결과 시 적절한 empty state 표시
- [ ] `npm run pack:clean`으로 테스트 통과

### Must Have
- Title-검색창 양방향 연동
- 3개 서비스 병렬 호출 (Promise.all)
- 결과 카드 UI (소스 뱃지, 스니펫, 시간)
- 체크박스 다중 선택 + Insert to Description

### Must NOT Have (Guardrails)
- ❌ 기존 `slack-search`, `ai-recommend`, `context-semantic-search` 내부 수정
- ❌ 새로운 외부 소스 추가
- ❌ 복잡한 랭킹/스코어링 로직
- ❌ 이슈 생성 플로우 변경
- ❌ `npm start`로 테스트 (권한 문제)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (빌드 + 수동 테스트)
- **User wants tests**: Manual-only
- **QA approach**: `npm run pack:clean` + DevTools 검증

### Automated Verification (Agent-Executable)

각 Task 완료 후:
```bash
# 빌드 확인
npm run build
# Assert: Exit code 0

# 앱 테스트
npm run pack:clean
# Assert: 앱이 정상 실행됨
```

**DevTools 검증** (using playwright skill if available, or manual):
1. Title 필드에 "Test Bug" 입력
2. Related Context 섹션의 검색창 확인 → "Test Bug" 표시되어야 함
3. Console 탭에서 IPC 호출 확인
4. 🔄 버튼 클릭 → 검색창이 Title 값으로 리셋

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Backend - 통합 IPC 핸들러 생성
└── Task 2: Frontend - HTML/CSS 구조 생성

Wave 2 (After Wave 1):
└── Task 3: Frontend - Title-검색창 연동 JS 로직

Wave 3 (After Wave 2):
└── Task 4: Cleanup - 기존 섹션 제거

Wave 4 (After Wave 3):
└── Task 5: i18n + 최종 테스트
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3 | 2 |
| 2 | None | 3 | 1 |
| 3 | 1, 2 | 4 | None |
| 4 | 3 | 5 | None |
| 5 | 4 | None | None |

---

## TODOs

- [ ] 1. Backend: 통합 IPC 핸들러 `context.getRelated` 생성

  **What to do**:
  1. `src/main/index.ts`에 새 IPC 핸들러 추가
  2. 기존 3개 서비스를 병렬 호출 (Promise.allSettled)
  3. 결과를 통합된 형식으로 정규화
  4. 에러 처리: 일부 서비스 실패해도 부분 결과 반환

  **구현 코드**:
  ```typescript
  ipcMain.handle('context.getRelated', async (_event, { query, limit = 20 }) => {
    const debug: string[] = [];
    debug.push(`query="${query}", limit=${limit}`);
    
    if (!query || query.length < 3) {
      return { success: true, results: [], _debug: [...debug, 'query too short'] };
    }
    
    try {
      // 병렬 호출
      const [slackResult, aiResult, semanticSlackResult, semanticNotionResult] = 
        await Promise.allSettled([
          // Slack 검색
          (async () => {
            const slackService = getSlackService();
            if (!slackService?.isConnected()) return [];
            const result = await slackService.searchMessages(query, Math.floor(limit / 3));
            return (result.messages || []).map(m => ({
              id: `slack-${m.ts}`,
              source: 'slack' as const,
              title: `#${m.channel?.name || 'unknown'}`,
              snippet: m.text?.substring(0, 200) || '',
              url: m.permalink,
              timestamp: m.timestamp,
              raw: m
            }));
          })(),
          
          // AI 추천
          (async () => {
            const result = await getAiRecommendations(query, Math.floor(limit / 3));
            return (result.recommendations || []).map(r => ({
              id: `ai-${r.id}`,
              source: r.source as 'slack' | 'notion' | 'gmail' | 'linear',
              title: r.title,
              snippet: r.snippet?.substring(0, 200) || '',
              url: r.url,
              timestamp: r.timestamp,
              confidence: r.score,
              raw: r
            }));
          })(),
          
          // Semantic Search - Slack
          (async () => {
            const adapter = getAdapter('slack');
            if (!await adapter.isConnected()) return [];
            const items = await adapter.fetchItems(query);
            if (items.length === 0) return [];
            const searchService = getSemanticSearchService();
            const results = await searchService.search(query, items);
            return results.slice(0, Math.floor(limit / 3)).map(r => ({
              id: `semantic-slack-${r.id}`,
              source: 'slack' as const,
              title: r.title,
              snippet: r.content?.substring(0, 200) || '',
              url: r.url,
              timestamp: r.timestamp,
              confidence: r.score,
              raw: r
            }));
          })(),
          
          // Semantic Search - Notion
          (async () => {
            const adapter = getAdapter('notion');
            if (!await adapter.isConnected()) return [];
            const items = await adapter.fetchItems(query);
            if (items.length === 0) return [];
            const searchService = getSemanticSearchService();
            const results = await searchService.search(query, items);
            return results.slice(0, Math.floor(limit / 3)).map(r => ({
              id: `semantic-notion-${r.id}`,
              source: 'notion' as const,
              title: r.title,
              snippet: r.content?.substring(0, 200) || '',
              url: r.url,
              timestamp: r.timestamp,
              confidence: r.score,
              raw: r
            }));
          })()
        ]);
      
      // 결과 병합
      const results: RelatedItem[] = [];
      
      [slackResult, aiResult, semanticSlackResult, semanticNotionResult].forEach((r, i) => {
        const names = ['slack', 'ai', 'semantic-slack', 'semantic-notion'];
        if (r.status === 'fulfilled') {
          results.push(...r.value);
          debug.push(`${names[i]}: ${r.value.length} results`);
        } else {
          debug.push(`${names[i]}: ERROR - ${r.reason}`);
        }
      });
      
      // 중복 제거 (URL 기준)
      const seen = new Set<string>();
      const deduplicated = results.filter(r => {
        if (!r.url) return true;
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
      
      debug.push(`total: ${deduplicated.length} (deduped from ${results.length})`);
      
      return { 
        success: true, 
        results: deduplicated.slice(0, limit),
        _debug: debug 
      };
    } catch (error) {
      debug.push(`ERROR: ${String(error)}`);
      return { success: false, error: String(error), results: [], _debug: debug };
    }
  });
  ```

  **Must NOT do**:
  - 기존 `slack-search`, `ai-recommend`, `context-semantic-search` 핸들러 수정
  - 새로운 외부 API 호출 추가

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `src/main/index.ts:1090-1123` - 기존 `context-semantic-search` 핸들러 패턴
  - `src/services/ai-recommend.ts` - `getAiRecommendations` 함수
  - `src/services/context-search/slack-adapter.ts` - Slack adapter 패턴
  - `src/services/semantic-search.ts` - Semantic search 서비스

  **Acceptance Criteria**:
  ```bash
  npm run build
  # Assert: Exit code 0, no TypeScript errors
  ```

  **Commit**: YES
  - Message: `feat(context): add unified context.getRelated IPC handler`
  - Files: `src/main/index.ts`

---

- [ ] 2. Frontend: HTML/CSS 구조 생성

  **What to do**:
  1. `src/renderer/index.html`에 새 `#relatedContextSection` 추가
  2. Description 필드 아래, 기존 `#semanticSearchSection` 위치에 배치
  3. 스타일은 기존 semantic-search.css 패턴 재사용

  **HTML 구조**:
  ```html
  <!-- Related Context Section (replaces contextSection, aiRecommendSection, semanticSearchSection) -->
  <div id="relatedContextSection" class="related-context-section">
    <div class="related-context-header" id="relatedContextHeader">
      <div class="related-context-header-left">
        <span class="related-context-header-icon">🔗</span>
        <span class="related-context-header-title" data-i18n="relatedContext.title">Related Context</span>
        <span class="related-context-header-badge" id="relatedContextBadge" style="display: none;">0</span>
      </div>
      <span class="related-context-header-toggle">▼</span>
    </div>
    <div class="related-context-body">
      <!-- Search Row -->
      <div class="related-context-search-row">
        <input type="text" 
               class="related-context-search-input" 
               id="relatedContextSearchInput" 
               data-i18n-placeholder="relatedContext.searchPlaceholder"
               placeholder="Search related context...">
        <button type="button" 
                class="related-context-refresh-btn" 
                id="relatedContextRefreshBtn" 
                title="Reset to title">
          🔄
        </button>
      </div>
      
      <!-- Status Hint -->
      <div class="related-context-status" id="relatedContextStatus">
        <span>💡</span>
        <span data-i18n="relatedContext.hint">Edit search to refine results</span>
      </div>
      
      <!-- Loading -->
      <div id="relatedContextLoading" class="related-context-loading" style="display: none;">
        <div class="spinner"></div>
        <span data-i18n="relatedContext.searching">Searching Slack, Notion...</span>
      </div>
      
      <!-- Results -->
      <div id="relatedContextResults" class="related-context-results"></div>
      
      <!-- Empty State -->
      <div id="relatedContextEmpty" class="related-context-empty" style="display: none;">
        <span>🤷</span>
        <span data-i18n="relatedContext.noResults">No results found. Try different keywords.</span>
      </div>
      
      <!-- Actions -->
      <div class="related-context-actions" id="relatedContextActions" style="display: none;">
        <span class="related-context-selected-count" id="relatedContextSelectedCount">0 selected</span>
        <button type="button" class="related-context-insert-btn" id="relatedContextInsertBtn" disabled>
          <span>📎</span>
          <span data-i18n="relatedContext.insertToDescription">Insert to Description</span>
        </button>
      </div>
    </div>
  </div>
  ```

  **CSS (인라인 또는 semantic-search.css 확장)**:
  ```css
  /* Related Context Section */
  .related-context-section {
    margin-bottom: 16px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
    background: white;
  }
  
  .related-context-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: #f8f9fa;
    cursor: pointer;
    user-select: none;
  }
  
  .related-context-header:hover {
    background: #f0f1f3;
  }
  
  .related-context-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .related-context-header-icon {
    font-size: 16px;
  }
  
  .related-context-header-title {
    font-size: 13px;
    font-weight: 500;
    color: #333;
  }
  
  .related-context-header-badge {
    background: #5e6ad2;
    color: white;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 10px;
  }
  
  .related-context-header-toggle {
    font-size: 12px;
    color: #666;
    transition: transform 0.2s;
  }
  
  .related-context-section.expanded .related-context-header-toggle {
    transform: rotate(180deg);
  }
  
  .related-context-body {
    display: none;
    padding: 12px;
    border-top: 1px solid #e0e0e0;
  }
  
  .related-context-section.expanded .related-context-body {
    display: block;
  }
  
  .related-context-search-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  
  .related-context-search-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 13px;
  }
  
  .related-context-search-input:focus {
    outline: none;
    border-color: #5e6ad2;
  }
  
  .related-context-refresh-btn {
    padding: 8px 12px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }
  
  .related-context-refresh-btn:hover {
    background: #e8e8e8;
  }
  
  .related-context-refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .related-context-status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: #f0f7ff;
    border-radius: 6px;
    font-size: 12px;
    color: #1a73e8;
    margin-bottom: 12px;
  }
  
  .related-context-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px;
    color: #666;
    font-size: 13px;
  }
  
  .related-context-results {
    max-height: 250px;
    overflow-y: auto;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    margin-bottom: 12px;
  }
  
  .related-context-result-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    transition: background 0.15s;
  }
  
  .related-context-result-item:last-child {
    border-bottom: none;
  }
  
  .related-context-result-item:hover {
    background: #f8f9fa;
  }
  
  .related-context-result-item.selected {
    background: #e8e9f3;
  }
  
  .related-context-result-checkbox {
    margin-top: 2px;
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
  
  .related-context-result-content {
    flex: 1;
    min-width: 0;
  }
  
  .related-context-result-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #888;
    margin-bottom: 4px;
  }
  
  .related-context-result-source {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
  }
  
  .related-context-result-source.slack {
    background: #4a154b;
    color: white;
  }
  
  .related-context-result-source.notion {
    background: #000;
    color: white;
  }
  
  .related-context-result-source.gmail {
    background: #ea4335;
    color: white;
  }
  
  .related-context-result-source.linear {
    background: #5e6ad2;
    color: white;
  }
  
  .related-context-result-source.ai {
    background: #10b981;
    color: white;
  }
  
  .related-context-result-title {
    font-size: 13px;
    font-weight: 500;
    color: #333;
    margin-bottom: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .related-context-result-snippet {
    font-size: 12px;
    color: #666;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  
  .related-context-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px;
    color: #888;
    font-size: 13px;
  }
  
  .related-context-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 8px;
    border-top: 1px solid #eee;
  }
  
  .related-context-selected-count {
    font-size: 12px;
    color: #666;
  }
  
  .related-context-insert-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: #5e6ad2;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
  }
  
  .related-context-insert-btn:hover {
    background: #4c5abd;
  }
  
  .related-context-insert-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  ```

  **Must NOT do**:
  - 기존 섹션 제거 (Task 4에서 수행)
  - JS 로직 구현 (Task 3에서 수행)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `src/renderer/index.html:1364-1397` - 기존 `#semanticSearchSection` 구조
  - `src/renderer/semantic-search.css` - 기존 스타일 패턴
  - `src/renderer/index.html:758-1051` - 기존 context-section 스타일

  **Acceptance Criteria**:
  ```bash
  npm run build
  # Assert: Exit code 0
  
  npm run pack:clean
  # Assert: 앱 실행 시 Related Context 섹션이 보임
  # Assert: 접기/펼치기 동작함
  ```

  **Commit**: YES
  - Message: `feat(ui): add Related Context section HTML/CSS structure`
  - Files: `src/renderer/index.html`

---

- [ ] 3. Frontend: Title-검색창 연동 JS 로직

  **What to do**:
  1. Title input과 검색창 양방향 연동
  2. debounce 300ms, 최소 3자
  3. 🔄 버튼으로 Title 값으로 리셋
  4. `context.getRelated` IPC 호출
  5. 결과 렌더링 및 선택 로직
  6. Insert to Description 기능

  **JS 로직** (index.html 내 `<script>` 섹션에 추가):
  ```javascript
  // ==================== Related Context Section ====================
  const relatedContextSection = document.getElementById('relatedContextSection');
  const relatedContextHeader = document.getElementById('relatedContextHeader');
  const relatedContextSearchInput = document.getElementById('relatedContextSearchInput');
  const relatedContextRefreshBtn = document.getElementById('relatedContextRefreshBtn');
  const relatedContextLoading = document.getElementById('relatedContextLoading');
  const relatedContextResults = document.getElementById('relatedContextResults');
  const relatedContextEmpty = document.getElementById('relatedContextEmpty');
  const relatedContextActions = document.getElementById('relatedContextActions');
  const relatedContextSelectedCount = document.getElementById('relatedContextSelectedCount');
  const relatedContextInsertBtn = document.getElementById('relatedContextInsertBtn');
  const relatedContextBadge = document.getElementById('relatedContextBadge');
  const relatedContextStatus = document.getElementById('relatedContextStatus');

  let relatedContextSelectedItems = [];
  let userModifiedSearch = false;
  let relatedContextDebounceTimer = null;
  let lastRelatedQuery = '';

  // Toggle section
  relatedContextHeader.addEventListener('click', () => {
    relatedContextSection.classList.toggle('expanded');
  });

  // Title → Search sync
  titleInput.addEventListener('input', () => {
    if (!userModifiedSearch) {
      relatedContextSearchInput.value = titleInput.value;
    }
    triggerRelatedSearch();
  });

  titleInput.addEventListener('blur', () => {
    if (!userModifiedSearch && titleInput.value.trim()) {
      relatedContextSearchInput.value = titleInput.value;
      triggerRelatedSearch();
    }
  });

  // Search input change
  relatedContextSearchInput.addEventListener('input', () => {
    userModifiedSearch = true;
    triggerRelatedSearch();
  });

  // Refresh button - reset to title
  relatedContextRefreshBtn.addEventListener('click', () => {
    relatedContextSearchInput.value = titleInput.value;
    userModifiedSearch = false;
    triggerRelatedSearch();
  });

  // Debounced search trigger
  function triggerRelatedSearch() {
    clearTimeout(relatedContextDebounceTimer);
    relatedContextDebounceTimer = setTimeout(() => {
      const query = relatedContextSearchInput.value.trim();
      if (query === lastRelatedQuery) return; // Skip if same query
      lastRelatedQuery = query;
      performRelatedSearch(query);
    }, 300);
  }

  // Perform search
  async function performRelatedSearch(query) {
    if (!query || query.length < 3) {
      relatedContextResults.innerHTML = '';
      relatedContextLoading.style.display = 'none';
      relatedContextEmpty.style.display = 'none';
      relatedContextStatus.innerHTML = '<span>💡</span><span>' + await t('relatedContext.enterQuery') + '</span>';
      return;
    }

    // Show loading
    relatedContextLoading.style.display = 'flex';
    relatedContextResults.style.display = 'none';
    relatedContextEmpty.style.display = 'none';
    relatedContextStatus.innerHTML = '<span>🔍</span><span>Searching for "' + escapeHtml(query.substring(0, 30)) + '"...</span>';

    try {
      const result = await ipcRenderer.invoke('context.getRelated', { query, limit: 20 });
      
      relatedContextLoading.style.display = 'none';
      
      if (!result.success) {
        console.error('Related context error:', result.error);
        relatedContextEmpty.style.display = 'flex';
        return;
      }

      if (!result.results || result.results.length === 0) {
        relatedContextEmpty.style.display = 'flex';
        relatedContextStatus.innerHTML = '<span>🤷</span><span>' + await t('relatedContext.noResultsHint') + '</span>';
        return;
      }

      renderRelatedResults(result.results);
      relatedContextStatus.innerHTML = '<span>✨</span><span>' + result.results.length + ' results · Edit to refine</span>';
    } catch (error) {
      console.error('Related context error:', error);
      relatedContextLoading.style.display = 'none';
      relatedContextEmpty.style.display = 'flex';
    }
  }

  // Render results
  function renderRelatedResults(items) {
    relatedContextResults.innerHTML = '';
    
    items.forEach(item => {
      const isSelected = relatedContextSelectedItems.some(s => s.id === item.id);
      const div = document.createElement('div');
      div.className = 'related-context-result-item' + (isSelected ? ' selected' : '');
      div.dataset.id = item.id;

      const sourceClass = item.source || 'ai';
      const sourceLabel = {
        'slack': '💬 Slack',
        'notion': '📝 Notion',
        'gmail': '📧 Gmail',
        'linear': '🔵 Linear',
        'ai': '✨ AI'
      }[sourceClass] || sourceClass;

      const timeStr = item.timestamp 
        ? new Date(item.timestamp).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';

      div.innerHTML = `
        <input type="checkbox" class="related-context-result-checkbox" ${isSelected ? 'checked' : ''}>
        <div class="related-context-result-content">
          <div class="related-context-result-meta">
            <span class="related-context-result-source ${sourceClass}">${sourceLabel}</span>
            ${timeStr ? `<span>${timeStr}</span>` : ''}
            ${item.confidence ? `<span>${Math.round(item.confidence * 100)}%</span>` : ''}
          </div>
          <div class="related-context-result-title">${escapeHtml(item.title || '')}</div>
          <div class="related-context-result-snippet">${escapeHtml(item.snippet || '')}</div>
        </div>
      `;

      div.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return;
        toggleRelatedItem(item, div);
      });

      const checkbox = div.querySelector('.related-context-result-checkbox');
      checkbox.addEventListener('change', () => {
        toggleRelatedItem(item, div);
      });

      relatedContextResults.appendChild(div);
    });

    relatedContextResults.style.display = 'block';
    updateRelatedContextActions();
  }

  // Toggle item selection
  function toggleRelatedItem(item, element) {
    const idx = relatedContextSelectedItems.findIndex(s => s.id === item.id);
    const checkbox = element.querySelector('.related-context-result-checkbox');

    if (idx === -1) {
      relatedContextSelectedItems.push(item);
      element.classList.add('selected');
      checkbox.checked = true;
    } else {
      relatedContextSelectedItems.splice(idx, 1);
      element.classList.remove('selected');
      checkbox.checked = false;
    }

    updateRelatedContextActions();
  }

  // Update actions visibility
  async function updateRelatedContextActions() {
    const count = relatedContextSelectedItems.length;
    if (count > 0) {
      relatedContextActions.style.display = 'flex';
      relatedContextSelectedCount.textContent = await t('relatedContext.selected', { count });
      relatedContextInsertBtn.disabled = false;
      relatedContextBadge.textContent = count;
      relatedContextBadge.style.display = 'inline';
    } else {
      relatedContextActions.style.display = 'none';
      relatedContextInsertBtn.disabled = true;
      relatedContextBadge.style.display = 'none';
    }
  }

  // Insert to description
  relatedContextInsertBtn.addEventListener('click', () => {
    if (relatedContextSelectedItems.length === 0) return;

    let contextText = '\n\n---\n## Related Context\n\n';
    
    relatedContextSelectedItems.forEach(item => {
      const sourceLabel = {
        'slack': 'Slack',
        'notion': 'Notion',
        'gmail': 'Gmail',
        'linear': 'Linear',
        'ai': 'Recommendation'
      }[item.source] || item.source;

      contextText += `### ${sourceLabel}: ${item.title}\n`;
      if (item.snippet) {
        contextText += `> ${item.snippet.replace(/\n/g, '\n> ')}\n`;
      }
      if (item.url) {
        contextText += `[View](${item.url})\n`;
      }
      contextText += '\n';
    });

    descInput.value = (descInput.value + contextText).trim();
    
    // Clear selection
    relatedContextSelectedItems = [];
    updateRelatedContextActions();
    
    // Update UI
    document.querySelectorAll('.related-context-result-item.selected').forEach(el => {
      el.classList.remove('selected');
      el.querySelector('.related-context-result-checkbox').checked = false;
    });
  });

  // Auto-expand when results exist
  function autoExpandRelatedContext() {
    if (relatedContextResults.children.length > 0) {
      relatedContextSection.classList.add('expanded');
    }
  }
  ```

  **Must NOT do**:
  - 기존 섹션 로직 수정 (Task 4에서 제거)
  - 이슈 생성 플로우 변경

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1, Task 2

  **References**:
  - `src/renderer/index.html:3401-3500` - 기존 AI recommend 로직 패턴
  - `src/renderer/index.html:3150-3250` - 기존 semantic search 로직
  - `src/renderer/index.html:2900-3000` - 기존 결과 렌더링 패턴

  **Acceptance Criteria**:
  ```bash
  npm run pack:clean
  # DevTools에서 확인:
  # 1. Title에 "Test Bug" 입력
  # 2. Related Context 검색창에 "Test Bug" 표시 확인
  # 3. Console에서 IPC 호출 확인
  # 4. 결과 표시 확인
  # 5. 🔄 버튼 클릭 → 검색창 리셋 확인
  # 6. 항목 선택 → Insert 버튼 활성화 확인
  ```

  **Commit**: YES
  - Message: `feat(ui): implement Related Context title-search sync and selection`
  - Files: `src/renderer/index.html`

---

- [ ] 4. Cleanup: 기존 섹션 제거

  **What to do**:
  1. `lsp_find_references`로 기존 섹션 ID 사용처 확인
  2. 기존 3개 섹션 HTML 제거: `#contextSection`, `#aiRecommendSection`, `#semanticSearchSection`
  3. 관련 CSS 제거 (선택적 - 사용 안 되면 제거)
  4. 관련 JS 변수/함수 제거
  5. 기존 IPC 핸들러는 유지 (다른 곳에서 사용할 수 있음)

  **제거할 요소**:
  - HTML:
    - `#contextSection` (line 1237-1331)
    - `#aiRecommendSection` (line 1337-1355)
    - `#semanticSearchSection` (line 1364-1397)
  - CSS:
    - `.context-section` 관련 스타일
    - `.ai-recommend-section` 관련 스타일
    - `semantic-search.css` (필요시 유지)
  - JS:
    - `contextSection`, `contextHeader` 등 관련 변수
    - `aiRecommendSection`, `aiRecommendHeader` 등 관련 변수
    - `semanticSearchSection` 관련 변수/함수
    - 관련 이벤트 리스너

  **Must NOT do**:
  - 기존 IPC 핸들러 (`slack-search`, `ai-recommend`, `context-semantic-search`) 제거
  - 다른 기능에 영향을 주는 코드 제거

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `src/renderer/index.html:1237-1331` - `#contextSection`
  - `src/renderer/index.html:1337-1355` - `#aiRecommendSection`
  - `src/renderer/index.html:1364-1397` - `#semanticSearchSection`
  - `src/renderer/semantic-search.css` - semantic search 스타일

  **Acceptance Criteria**:
  ```bash
  npm run build
  # Assert: Exit code 0
  
  npm run pack:clean
  # Assert: 기존 3개 섹션이 보이지 않음
  # Assert: Related Context 섹션만 보임
  # Assert: 앱 기능 정상 동작
  ```

  **Commit**: YES
  - Message: `refactor(ui): remove legacy context search sections`
  - Files: `src/renderer/index.html`, `src/renderer/semantic-search.css` (if modified)

---

- [ ] 5. i18n + 최종 테스트

  **What to do**:
  1. `locales/en/translation.json`에 새 키 추가
  2. `npm run translate` 실행
  3. `npm run validate:i18n` 실행
  4. `npm run pack:clean`으로 전체 기능 테스트

  **추가할 i18n 키**:
  ```json
  {
    "relatedContext": {
      "title": "Related Context",
      "searchPlaceholder": "Search related context...",
      "hint": "Edit search to refine results",
      "searching": "Searching Slack, Notion...",
      "noResults": "No results found. Try different keywords.",
      "noResultsHint": "Try different keywords or check connections",
      "enterQuery": "Enter a title or search term",
      "insertToDescription": "Insert to Description",
      "selected": "{{count}} selected"
    }
  }
  ```

  **Must NOT do**:
  - 기존 i18n 키 수정
  - 수동으로 다른 언어 파일 편집 (자동 번역 사용)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:
  - `locales/en/translation.json` - 영어 기준 파일
  - `scripts/translate.ts` - 자동 번역 스크립트
  - `CLAUDE.md` - i18n 워크플로우 설명

  **Acceptance Criteria**:
  ```bash
  npm run translate
  # Assert: Exit code 0
  
  npm run validate:i18n
  # Assert: 누락/중복 키 없음
  
  npm run pack:clean
  # 전체 기능 테스트:
  # 1. Title 입력 → 검색창 연동 확인
  # 2. 검색 결과 표시 확인
  # 3. 선택 → Insert 동작 확인
  # 4. 다국어 전환 시 UI 텍스트 변경 확인
  ```

  **Commit**: YES
  - Message: `feat(i18n): add Related Context translations`
  - Files: `locales/en/translation.json`, `locales/ko/translation.json`, etc.

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `feat(context): add unified context.getRelated IPC handler` | `src/main/index.ts` |
| 2 | `feat(ui): add Related Context section HTML/CSS structure` | `src/renderer/index.html` |
| 3 | `feat(ui): implement Related Context title-search sync and selection` | `src/renderer/index.html` |
| 4 | `refactor(ui): remove legacy context search sections` | `src/renderer/index.html`, `src/renderer/semantic-search.css` |
| 5 | `feat(i18n): add Related Context translations` | `locales/**/*.json` |

---

## Success Criteria

### Final Verification
```bash
npm run pack:clean
```

**DevTools 검증 체크리스트**:
- [ ] Title "Test Bug" 입력 → 검색창에 "Test Bug" 표시
- [ ] 300ms 후 IPC 호출 확인 (Console)
- [ ] Slack, Notion 결과 통합 표시
- [ ] 🔄 버튼 클릭 → Title 값으로 리셋
- [ ] 검색어 수정 → 재검색 동작
- [ ] 항목 체크박스 선택 → 선택 카운트 업데이트
- [ ] "Insert to Description" 클릭 → Description에 추가
- [ ] 빈 결과 → Empty state 메시지 표시

### Final Checklist
- [ ] 새 Related Context 섹션 정상 동작
- [ ] 기존 3개 섹션 완전 제거
- [ ] 이슈 생성 플로우 정상 동작
- [ ] i18n 번역 완료 (5개 언어)
- [ ] 콘솔 에러 없음
