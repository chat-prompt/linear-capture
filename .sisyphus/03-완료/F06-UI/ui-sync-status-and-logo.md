# UI Improvements: Sync Status Display & Linear Logo

## TL;DR

> **Quick Summary**: Fix data sync status to show actual last sync time (not always "Ready to sync") and update Linear logo to match official branding across all UI contexts.
> 
> **Deliverables**:
> - `getSyncStatus()` returns `lastSync` timestamps from `sync_cursors` table
> - Data structure wrapped in `sources` to match UI expectations
> - Linear logo in settings.html matches index.html (official circular logo)
> 
> **Estimated Effort**: Short (2-3 hours)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 3 (sync) | Task 2 (logo, independent)

---

## Context

### Original Request
User wants to improve two UI/UX issues:
1. Data sync status in Settings > 데이터 동기화 is not intuitive - always shows "동기화 준비 완료" after app restart even if sync was done previously
2. Linear logo needs to be updated to match the proper official logo (as seen in a previous PR)

### Interview Summary
**Key Discussions**:
- User observed that app restart resets sync status display
- Previous commit `e959921` introduced correct Linear logo in index.html but not in settings.html

**Research Findings**:
- **Root Cause #1**: `getSyncStatus()` doesn't query `sync_cursors` table where `last_synced_at` is actually stored
- **Root Cause #2 (Metis discovery)**: Data structure mismatch - UI expects `.sources.slack.lastSync` but service returns `.slack.documentCount`
- **Logo Issue**: settings.html uses wrong arrow-style SVG, index.html has correct circular checkmark logo

### Metis Review
**Identified Gaps** (addressed):
- Data structure mismatch between service and UI (`.sources` wrapper missing)
- Need to JOIN `sync_cursors` table to get `last_synced_at`
- Logo viewBox needs scaling from 100x100 to 24x24
- Edge case: fresh install with no sync_cursors rows

---

## Work Objectives

### Core Objective
Make sync status display accurately reflect actual sync history, and unify Linear branding across the app.

### Concrete Deliverables
- Modified `src/services/local-search.ts` - `getSyncStatus()` method
- Modified `src/renderer/settings.html` - Linear logo SVG (lines 675-678)

### Definition of Done
- [ ] App restart preserves and displays last sync time correctly
- [ ] Settings shows "5m ago", "2h ago" etc. for synced sources
- [ ] Linear logo in settings matches the one in Related Context section
- [ ] Fresh install shows "동기화 준비 완료" appropriately (no regression)

### Must Have
- Query `sync_cursors.last_synced_at` and return as epoch milliseconds
- Wrap return structure in `{ sources: {...} }` to match UI contract
- Replace Linear SVG with official circular logo
- Handle null/undefined cases (no sync_cursors row exists)

### Must NOT Have (Guardrails)
- ❌ Do NOT add sync progress indicators
- ❌ Do NOT implement real-time sync status updates  
- ❌ Do NOT add "synced X items" to persistent display (only show relative time)
- ❌ Do NOT change error handling behavior
- ❌ Do NOT update any other icons while editing settings.html
- ❌ Do NOT refactor entire getSyncStatus() - surgical change only
- ❌ Do NOT change SyncStatus TypeScript interface shape (it already has lastSync property)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (TypeScript compiler, Electron app)
- **Automated tests**: None (no test framework for renderer/UI in this project)
- **Framework**: N/A
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

### Agent-Executed QA Scenarios (MANDATORY)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **TypeScript changes** | Bash (npm run build) | Compile success, no errors |
| **Electron app UI** | Bash (npm run pack:clean) | App launches, manual-free verification via logs |
| **Database queries** | Bash (sqlite inspection) | Query returns expected structure |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Fix getSyncStatus() data layer
└── Task 2: Update Linear logo in settings.html

Wave 2 (After Wave 1):
└── Task 3: Integration test - verify sync status persists across restart

Critical Path: Task 1 → Task 3
Parallel Speedup: Task 2 runs independently
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3 | 2 |
| 2 | None | None | 1 |
| 3 | 1 | None | None (final verification) |

---

## TODOs

- [ ] 1. Fix getSyncStatus() to return lastSync timestamps with correct structure

  **What to do**:
  1. Modify `getSyncStatus()` in `src/services/local-search.ts`
  2. Change query to JOIN `sync_cursors` table:
     ```sql
     SELECT d.source_type, COUNT(*) as count, sc.last_synced_at
     FROM documents d
     LEFT JOIN sync_cursors sc ON d.source_type = sc.source_type
     GROUP BY d.source_type, sc.last_synced_at
     ```
  3. Wrap return value in `{ sources: {...} }` structure
  4. Convert `last_synced_at` (TIMESTAMPTZ) to epoch milliseconds
  5. Handle case where `sync_cursors` row doesn't exist (return undefined for lastSync)

  **Must NOT do**:
  - Do NOT change the `SyncStatus` TypeScript interface
  - Do NOT touch sync adapter logic
  - Do NOT add new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Surgical change to single method, clear specification
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commit after change

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `src/services/local-search.ts:92-117` - Current `getSyncStatus()` implementation
  - `src/services/local-search.ts:44-50` - `SyncStatus` interface definition
  - `src/services/database.ts:159` - `sync_cursors` table schema
  - `src/renderer/settings.html:1524` - UI access pattern `syncStatus?.sources?.slack?.lastSync`
  - `src/renderer/settings.html:1496-1508` - `formatLastSync()` expects epoch number

  **Acceptance Criteria**:

  **Build Verification:**
  - [ ] `npm run build` completes without TypeScript errors
  - [ ] No new linter warnings related to changes

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: getSyncStatus returns correct structure with lastSync
    Tool: Bash (node inspection)
    Preconditions: App has been synced at least once for any source
    Steps:
      1. Build: npm run build
      2. Check TypeScript compiles: exit code 0
      3. Grep for structure: grep -n "sources:" src/services/local-search.ts
      4. Assert: "sources" wrapper exists in return statement
    Expected Result: Build succeeds, sources wrapper found
    Evidence: Build output captured

  Scenario: Handle fresh install (no sync_cursors rows)
    Tool: Bash (code review)
    Preconditions: Code change complete
    Steps:
      1. Grep for null handling: grep -A5 "last_synced_at" src/services/local-search.ts
      2. Assert: Code handles undefined/null case with optional chaining or default
    Expected Result: Null-safe code pattern found
    Evidence: Grep output captured
  ```

  **Commit**: YES
  - Message: `fix(sync): return lastSync from sync_cursors in getSyncStatus`
  - Files: `src/services/local-search.ts`
  - Pre-commit: `npm run build`

---

- [ ] 2. Update Linear logo to official logo in BOTH settings.html AND index.html

  **What to do**:
  
  **Official Linear Logo SVG** (from Simple Icons - https://simpleicons.org):
  ```svg
  <svg viewBox="0 0 24 24" fill="#5E6AD2">
    <path d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z"/>
  </svg>
  ```

  **File 1: settings.html (lines 686-689)**
  - Replace current arrow-style SVG with official logo
  - Keep `class="sync-source-icon"` attribute

  **File 2: index.html (line 3784)**
  - Replace current circle+checkmark SVG with official logo
  - Keep `class="source-icon"` wrapper span

  **Must NOT do**:
  - Do NOT change any other SVG icons (Slack, Notion, Gmail)
  - Do NOT modify CSS styling
  - Do NOT change HTML structure

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple SVG replacement, two files
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/renderer/settings.html:686-689` - Current wrong Linear logo (arrow style)
  - `src/renderer/index.html:3784` - Current wrong Linear logo (circle+checkmark)
  - Simple Icons Linear: https://simpleicons.org/?q=linear
  - Linear Brand: https://linear.app/brand

  **Acceptance Criteria**:

  **Code Verification:**
  - [ ] Both files have the official Linear logo SVG path
  - [ ] Fill color is `#5E6AD2` (Linear brand purple)
  - [ ] SVG path starts with "M2.886 4.18A11.982"

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: settings.html has official Linear logo
    Tool: Bash (grep)
    Preconditions: settings.html modified
    Steps:
      1. grep "M2.886 4.18" src/renderer/settings.html
      2. Assert: Official logo path found
      3. grep "5E6AD2" src/renderer/settings.html | grep -c "Linear"
      4. Assert: Linear brand color used
    Expected Result: Official logo path found with correct color
    Evidence: Grep output saved

  Scenario: index.html has official Linear logo
    Tool: Bash (grep)
    Preconditions: index.html modified
    Steps:
      1. grep "M2.886 4.18" src/renderer/index.html
      2. Assert: Official logo path found
    Expected Result: Official logo path found
    Evidence: Grep output saved

  Scenario: Other icons unchanged
    Tool: Bash (git diff)
    Preconditions: Only Linear logos modified
    Steps:
      1. git diff --stat src/renderer/settings.html src/renderer/index.html
      2. Assert: Only 2 files changed
    Expected Result: Diff shows changes only in Linear-related lines
    Evidence: Diff output captured
  ```

  **Commit**: YES
  - Message: `fix(ui): update Linear logo to official brand icon in settings and context`
  - Files: `src/renderer/settings.html`, `src/renderer/index.html`
  - Pre-commit: None (HTML files)

---

- [ ] 3. Integration verification - sync status persists across app restart

  **What to do**:
  1. Build the app: `npm run build`
  2. Package and run: `npm run pack:clean`
  3. Verify sync status display works correctly
  4. Create feature branch and push

  **Must NOT do**:
  - Do NOT modify any code in this task (verification only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Build + verify only, no code changes
  - **Skills**: [`git-master`]
    - `git-master`: For branch creation and push

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2)
  - **Blocks**: None (final task)
  - **Blocked By**: Task 1

  **References**:
  - `CLAUDE.md` - Build commands: `npm run build`, `npm run pack:clean`
  - `src/renderer/settings.html:1510-1567` - `loadSyncStatus()` function

  **Acceptance Criteria**:

  **Build Verification:**
  - [ ] `npm run build` exits with code 0
  - [ ] No TypeScript compilation errors

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: App builds successfully with changes
    Tool: Bash
    Preconditions: Tasks 1 and 2 completed
    Steps:
      1. npm run build 2>&1
      2. Assert: Exit code 0
      3. Assert: No "error TS" in output
    Expected Result: Clean build
    Evidence: Build output captured to .sisyphus/evidence/task-3-build.log

  Scenario: TypeScript types are satisfied
    Tool: Bash (tsc)
    Preconditions: Code changes complete
    Steps:
      1. npx tsc --noEmit 2>&1
      2. Assert: Exit code 0
      3. Assert: No type errors
    Expected Result: Type check passes
    Evidence: TSC output captured
  ```

  **Commit**: NO (verification task, commits done in Task 1 & 2)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(sync): return lastSync from sync_cursors in getSyncStatus` | `src/services/local-search.ts` | `npm run build` |
| 2 | `fix(ui): update Linear logo to official circular design in settings` | `src/renderer/settings.html` | grep for circle element |
| 1+2 combined | `feat(ui): improve sync status display and update Linear logo` | Both files | `npm run build` |

---

## Success Criteria

### Verification Commands
```bash
# Build verification
npm run build  # Expected: Exit 0, no errors

# Logo verification  
grep -c "<circle" src/renderer/settings.html  # Expected: 1 (Linear logo)

# Structure verification
grep "sources:" src/services/local-search.ts  # Expected: found in getSyncStatus
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build passes without errors
- [ ] Linear logo shows circular design with checkmark
- [ ] getSyncStatus returns `{ sources: { slack: { lastSync: number } } }` structure
