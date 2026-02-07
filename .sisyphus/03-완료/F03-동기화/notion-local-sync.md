# Notion Local DB Sync Observability

## TL;DR

> **Quick Summary**: Add logging and UI indicators to diagnose why Notion sync returns only 6 pages instead of 21k from local cache. Observability first, no behavior changes.
> 
> **Deliverables**:
> - Sync logs show search source (`local` or `api`) and page count
> - Settings UI displays last sync source
> - Unified logging (replace `console.log` with `logger`)
> 
> **Estimated Effort**: Quick (1-2 hours)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 3

---

## Context

### Original Request
Fix Notion sync showing only 6 pages despite large local cache (~21k pages). User needs to understand whether sync uses local DB or falls back to API.

### Interview Summary
**Key Discussions**:
- Original analysis in `.sisyphus/notion-local-sync-plan.md` identified 3 hypotheses
- Option A (Observability First) selected as recommended approach
- No behavior changes - just add visibility into current behavior

**Research Findings**:
- `NotionService.searchPages()` already returns `source: 'local' | 'api'` but sync doesn't log it
- `NotionSyncAdapter.sync()` uses `console.log` instead of `logger` (inconsistent)
- Settings UI shows local DB status but not last search source
- Silent fallback: local returning 0 pages falls through to API without logging

### Metis Review
**Identified Gaps** (addressed):
- BUG: Local returning 0 pages (even if successful) silently falls back to API
- Inconsistent logging: `notion-sync.ts` uses `console.log`, others use `logger`
- Missing: Last search source in Settings UI

**Guardrails Set**:
- DO NOT change sync behavior (local-first vs API fallback logic)
- DO NOT add retry mechanisms or new API calls
- DO NOT modify SQL queries in notion-local-reader.ts
- ONLY add logging and status text updates

---

## Work Objectives

### Core Objective
Add observability to Notion sync to diagnose local DB vs API fallback behavior.

### Concrete Deliverables
1. Sync logs include: `[NotionSync] Found N pages (source: local|api)`
2. Settings UI shows: "Last sync: local" or "Last sync: api (fallback)"
3. Logger unified across notion-sync.ts

### Definition of Done
- [ ] `grep "NotionSync.*source:" ~/Library/Logs/linear-capture/*.log` returns results
- [ ] Settings > Sync > Notion shows last sync source text

### Must Have
- Search source logged during sync
- Last sync source visible in Settings UI
- Consistent use of `logger` module

### Must NOT Have (Guardrails)
- Changes to local-first vs API fallback logic
- New API calls or retry mechanisms
- SQL query modifications
- Complex UI components (only text updates)
- Cached sync source in settings store (just display it)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> All criteria verifiable by running commands or tools.

### Test Decision
- **Infrastructure exists**: YES (bun test exists)
- **Automated tests**: NO (observability changes don't need unit tests)
- **Framework**: bun test (if needed)

### Agent-Executed QA Scenarios (MANDATORY)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Log output** | Bash (grep) | Check log files for expected format |
| **Settings UI** | Playwright | Navigate, read status text |
| **Build success** | Bash (npm) | Run pack:clean, verify no errors |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Add search source logging to NotionSyncAdapter
└── Task 2: Unify logging (console.log → logger)

Wave 2 (After Wave 1):
└── Task 3: Update Settings UI to show last sync source
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3 | 2 |
| 2 | None | None | 1 |
| 3 | 1 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | delegate_task(category="quick", load_skills=[]) |
| 2 | 3 | delegate_task(category="quick", load_skills=["frontend-ui-ux"]) |

---

## TODOs

- [ ] 1. Add search source logging AND propagate source to SyncResult

  **What to do**:
  
  **Part A: Add source to SyncResult interface (line 22-28)**
  - Add `source?: 'local' | 'api'` field to `SyncResult` interface
  
  **Part B: Capture source in sync() method (after line 59)**
  - After `searchResult = await this.notionService.searchPages()`:
    ```typescript
    result.source = searchResult.source;
    logger.log(`[NotionSync] Found ${searchResult.pages.length} pages (source: ${searchResult.source || 'unknown'})`);
    ```
  
  **Part C: Capture source in syncIncremental() method (after line 125)**
  - Same pattern as Part B
  
  **Part D: Add warning when local returns 0**
  - If `searchResult.source === 'api'` and local was attempted, log warning
  
  **Part E: Update IPC handler to return source**
  - File: `src/main/ipc-handlers.ts:831-835`
  - Add `source: result.source` to the return object

  **Must NOT do**:
  - Change the searchPages() call parameters
  - Modify fallback logic
  - Add retry mechanisms

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple 3-line code addition, no architectural changes
  - **Skills**: `[]`
    - No special skills needed for basic TypeScript editing
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/services/notion-client.ts:177` - Logging pattern: `logger.log('[Notion] Local search returned...')`
  - `src/services/notion-client.ts:182-183` - How source is returned in searchResult

  **API/Type References**:
  - `src/services/notion-client.ts:54-63` - `NotionSearchResult` interface with `source` field
  - `src/services/utils/logger.ts` - Logger module interface

  **Target Files**:
  - `src/services/sync-adapters/notion-sync.ts:22-28` - `SyncResult` interface (add source field)
  - `src/services/sync-adapters/notion-sync.ts:47-65` - `sync()` method (add logging + capture source)
  - `src/services/sync-adapters/notion-sync.ts:108-137` - `syncIncremental()` method (same)
  - `src/main/ipc-handlers.ts:831-835` - IPC return object (add source field)

  **WHY Each Reference Matters**:
  - `notion-client.ts:177` shows exact logging format to follow for consistency
  - `NotionSearchResult.source` is the field to capture and propagate
  - `ipc-handlers.ts` must pass source to Settings UI

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Sync logs include search source
    Tool: Bash
    Preconditions: App built with npm run pack:clean
    Steps:
      1. Open app and trigger Notion sync (via Settings > Sync > Notion > Sync button)
      2. Wait 10 seconds for sync to complete
      3. Read log file: cat ~/Library/Logs/linear-capture/main.log | tail -50
      4. Assert: Output contains "[NotionSync] Found" AND "source:"
    Expected Result: Log line shows page count and source (local or api)
    Evidence: Terminal output captured

  Scenario: Fallback is logged when local returns 0
    Tool: Bash  
    Preconditions: Local DB unavailable (or returns empty)
    Steps:
      1. Trigger sync
      2. grep "NotionSync.*fallback\|NotionSync.*source: api" ~/Library/Logs/linear-capture/main.log
      3. Assert: At least one match found
    Expected Result: Fallback to API is explicitly logged
    Evidence: Grep output captured

  Scenario: SyncResult interface has source field
    Tool: Bash (grep)
    Steps:
      1. grep "source.*local.*api" src/services/sync-adapters/notion-sync.ts
      2. Assert: Match found in SyncResult interface
    Expected Result: SyncResult includes source field
    Evidence: Grep output
  
  Scenario: IPC handler returns source field
    Tool: Bash (grep)
    Steps:
      1. grep "source:" src/main/ipc-handlers.ts | grep -A5 "sync:trigger"
      2. Assert: source field in return object
    Expected Result: ipc-handlers.ts returns result.source
    Evidence: Grep output
  ```

  **Commit**: YES
  - Message: `feat(notion): add search source logging and propagate to IPC`
  - Files: `src/services/sync-adapters/notion-sync.ts`, `src/main/ipc-handlers.ts`
  - Pre-commit: `npm run build`

---

- [ ] 2. Unify logging in notion-sync.ts (console.log → logger)

  **What to do**:
  - Add import: `import { logger } from '../utils/logger';`
  - Replace all `console.log('[NotionSync]` → `logger.log('[NotionSync]`
  - Replace all `console.error('[NotionSync]` → `logger.error('[NotionSync]`

  **Must NOT do**:
  - Change log message content (except format)
  - Remove any existing logs
  - Add new log statements (that's Task 1)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Find-and-replace operation, no logic changes
  - **Skills**: `[]`
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not git operation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/services/notion-client.ts:9` - Import statement: `import { logger } from './utils/logger';`
  - `src/services/notion-local-reader.ts:16` - Same import pattern

  **Target File**:
  - `src/services/sync-adapters/notion-sync.ts` - Full file, all console.log/console.error calls

  **Tool Recommendation**:
  - Use `ast_grep_replace` for safe replacement:
    ```
    pattern: console.log($MSG)
    rewrite: logger.log($MSG)
    lang: typescript
    paths: ["src/services/sync-adapters/notion-sync.ts"]
    ```

  **WHY Each Reference Matters**:
  - Import path differs based on file location (`../utils/logger` from sync-adapters/)
  - Existing files show consistent pattern

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: No console.log remains in notion-sync.ts
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep "console\\.log" src/services/sync-adapters/notion-sync.ts
      2. Assert: Exit code is 1 (no matches)
    Expected Result: No console.log calls in file
    Evidence: Grep exit code

  Scenario: Logger import exists
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep "import.*logger.*from" src/services/sync-adapters/notion-sync.ts
      2. Assert: Exit code is 0 (match found)
    Expected Result: Logger import statement present
    Evidence: Grep output

  Scenario: Build succeeds after changes
    Tool: Bash
    Steps:
      1. npm run build
      2. Assert: Exit code is 0
    Expected Result: TypeScript compiles without errors
    Evidence: Build output
  ```

  **Commit**: YES (group with Task 1)
  - Message: `refactor(notion): unify logging to use logger module`
  - Files: `src/services/sync-adapters/notion-sync.ts`
  - Pre-commit: `npm run build`

---

- [ ] 3. Update Settings UI to show last sync source

  **What to do**:
  - In `settings.html`, after sync completes, display the source
  - Update `syncNotionMeta` text to include last sync source
  - Format: "Local DB: available (last sync: local)" or "Local DB: available (last sync: api)"
  - Store last sync source in memory (no persistent storage needed)

  **Must NOT do**:
  - Add new IPC channels
  - Store sync source in settings store
  - Add complex UI components
  - Change existing status logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple text update in existing UI element
  - **Skills**: `["frontend-ui-ux"]`
    - `frontend-ui-ux`: For consistent UI text formatting
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for implementation, only QA

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: None (final task)
  - **Blocked By**: Task 1 (needs sync to return source)

  **References**:

  **Pattern References**:
  - `src/renderer/settings.html:1521-1538` - Existing local DB status display logic
  - `src/renderer/settings.html:1567` - How lastSync is retrieved from syncStatus

  **API References**:
  - `src/main/ipc-handlers.ts:485-489` - `notion-search` IPC returns `NotionSearchResult` with `source`

  **Target File**:
  - `src/renderer/settings.html:1630-1640` - `triggerSync()` function, capture result.source

  **i18n Keys to Add** (in `locales/en/translation.json`):
  - `sync.notionLastSyncLocal`: "Last sync: local"
  - `sync.notionLastSyncApi`: "Last sync: api (fallback)"

  **WHY Each Reference Matters**:
  - Line 1521-1538 shows how to update `syncNotionMeta` text
  - Line 1567 shows pattern for accessing sync metadata
  - Need to run `npm run translate` after adding i18n keys

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Settings shows last sync source after sync
    Tool: Playwright (playwright skill)
    Preconditions: App running with npm run pack:clean, Notion connected
    Steps:
      1. Navigate to: linear-capture://settings (or use Electron remote debugging)
      2. Wait for: #syncNotionRow visible (timeout: 10s)
      3. Click: #syncNotionBtn (trigger sync)
      4. Wait for: sync completion (button re-enabled, timeout: 30s)
      5. Read: #syncNotionMeta text content
      6. Assert: Text contains "last sync:" OR "Last sync:"
      7. Screenshot: .sisyphus/evidence/task-3-settings-sync-source.png
    Expected Result: Meta text includes sync source indicator
    Evidence: .sisyphus/evidence/task-3-settings-sync-source.png

  Scenario: i18n keys exist for sync source
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep "notionLastSync" locales/en/translation.json
      2. Assert: Exit code is 0 (keys found)
    Expected Result: Translation keys for local and api sources exist
    Evidence: Grep output
  ```

  **Commit**: YES
  - Message: `feat(ui): show last sync source in Notion settings`
  - Files: `src/renderer/settings.html`, `locales/en/translation.json`
  - Pre-commit: `npm run translate && npm run build`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1+2 | `feat(notion): add search source logging and propagate to IPC` | `notion-sync.ts`, `ipc-handlers.ts` | `npm run build` |
| 3 | `feat(ui): show last sync source in Notion settings` | `settings.html`, `locales/*/translation.json` | `npm run translate && npm run build` |

---

## Success Criteria

### Verification Commands
```bash
# After Task 1+2: Check logs include source
npm run pack:clean
# (trigger sync manually)
grep "NotionSync.*source:" ~/Library/Logs/linear-capture/main.log

# After Task 2: No console.log in sync file
grep "console\.log" src/services/sync-adapters/notion-sync.ts
# Expected: No output (exit code 1)

# After Task 3: i18n keys exist
grep "notionLastSync" locales/en/translation.json
# Expected: 2 matches
```

### Final Checklist
- [ ] Sync logs show `(source: local)` or `(source: api)`
- [ ] No `console.log` in `notion-sync.ts` (all use `logger`)
- [ ] Settings UI shows last sync source after sync operation
- [ ] All builds pass (`npm run build`)
- [ ] i18n translated (`npm run translate`)
