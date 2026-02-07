# Learnings - User Hint Feature

## Conventions & Patterns

(Subagents will append findings here)

## Vitest Setup (Task 1)

### Configuration
- **vitest.config.ts**: Minimal config with `globals: true` for `describe/it/expect` without imports
- **Environment**: Set to `node` (suitable for Electron app testing)
- **Test pattern**: `src/**/*.test.ts` and `src/**/*.test.tsx`

### TDD RED-GREEN Pattern
1. **RED phase**: Created failing test `expect(true).toBe(false)` → `npm test` → FAIL ✓
2. **GREEN phase**: Fixed to `expect(true).toBe(true)` → `npm test` → PASS ✓
3. **Pattern verified**: TDD workflow established for future test development

### Key Learnings
- Vitest runs with `npm test` script (added to package.json)
- Test discovery automatic via glob patterns
- Output shows clear PASS/FAIL with assertion details
- Ready for unit testing services (capture, linear-client, etc.)

### Next Steps
- Add tests for capture service (platform-specific implementations)
- Add tests for Linear client wrapper
- Add tests for R2 uploader service

## Task 2: Worker Types - instruction Field (2025-01-27)

### Implementation Pattern
- **TDD RED-GREEN workflow**: Created failing test first, then added fields
- **Optional field pattern**: Used `instruction?: string` (optional) matching existing field style
- **Two locations**: Added to both `PromptContext` (prompts/types.ts) and `AnalysisRequest` (index.ts)

### Files Modified
1. `linear-capture-worker/src/prompts/types.ts` - Added `instruction?: string` to PromptContext
2. `linear-capture-worker/src/index.ts` - Added `instruction?: string` to AnalysisRequest
3. `src/__tests__/worker-types.test.ts` - Created 4 tests verifying instruction field

### Test Results
- ✅ RED phase: Test file created with failing assertions
- ✅ GREEN phase: All 4 tests pass after adding fields
- ✅ TypeScript: `npx tsc --noEmit` succeeds (no compilation errors)
- ✅ Full test suite: `npm test` → 5 passed (4 new + 1 existing)

### Key Learnings
- Test file location: Must be in main project `src/__tests__/` (not worker directory)
- Vitest discovers tests via glob pattern: `src/**/*.test.ts`
- Optional fields use `?:` syntax, consistent with existing `projects?` and `users?` fields
- Type-only changes don't require runtime logic modifications

### Next Steps
- Task 3: Update prompt builders to use instruction field
- Task 4: Integrate instruction into AI analysis flow

## Task 3: Worker Prompt - instruction Field (2025-01-27)

### Implementation Pattern
- **TDD RED-GREEN workflow**: Created test file with logic pattern assertions, then implemented buildImagePrompt changes
- **Conditional section pattern**: Created `buildInstructionSection()` helper function following `buildContextSection()` pattern
- **Instruction passing**: Updated `analyzeWithGemini()` and `analyzeWithHaiku()` to merge instruction into context

### Files Modified
1. `linear-capture-worker/src/prompts/issue-prompt.ts`:
   - Added `buildInstructionSection()` function (lines 58-61)
   - Modified `buildImagePrompt()` to include instruction section (lines 113-122)
2. `linear-capture-worker/src/index.ts`:
   - Updated `analyzeWithGemini()` to merge instruction into context (lines 223-230)
   - Updated `analyzeWithHaiku()` to merge instruction into context (lines 271-278)
3. `src/__tests__/worker-prompt.test.ts` - Created 4 tests verifying instruction inclusion logic

### Test Results
- ✅ RED phase: Test file created with 4 assertions about instruction section
- ✅ GREEN phase: All 4 tests pass after implementation
- ✅ TypeScript: `npx tsc --noEmit` succeeds (no compilation errors)
- ✅ Full test suite: `npm test` → 9 passed (4 new + 5 existing)

### Manual Verification
- ✅ Worker started locally: `npm run dev` → Ready on http://localhost:8787
- ✅ Prompt with instruction: `buildImagePrompt(1, { instruction: "테스트 힌트" })` includes "## 사용자 요청" section
- ✅ Prompt without instruction: `buildImagePrompt(1, {})` does NOT include "## 사용자 요청" section
- ✅ Empty instruction handling: `buildInstructionSection("")` returns empty string (no section added)

### Key Learnings
- **Instruction merging pattern**: When instruction is separate from context, merge it before passing to prompt builder
  ```typescript
  const contextWithInstruction = context ? { ...context, instruction } : { instruction };
  const prompt = buildImagePrompt(images.length, contextWithInstruction);
  ```
- **Conditional section pattern**: Check for both undefined and empty string to avoid adding empty sections
  ```typescript
  if (!instruction || instruction.trim() === '') return '';
  ```
- **Prompt structure**: Instruction section appears after initial request but before title rules for better AI focus
- **Backward compatibility**: Empty/undefined instruction doesn't change prompt structure (no regression)

### Next Steps
- Task 4: Deploy Worker with instruction support
- Task 5: Update app services to pass instruction through analyzer

## Task 7: App UI - Hint Textarea (2025-01-27)

### Implementation Pattern
- **UI Component**: Added `<textarea>` for user hints below image gallery
- **Event Handling**: Updated `reanalyzeBtn` click handler to read textarea value
- **State Management**: Reset textarea value in `capture-ready` handler (new capture session)
- **IPC Communication**: Passed `instruction` parameter in `reanalyze` IPC call

### Files Modified
1. `src/renderer/index.html`:
   - Added textarea HTML (lines 786-788)
   - Updated `capture-ready` handler to reset `userHint` (line 1630)
   - Updated `reanalyzeBtn` handler to read and pass `instruction` (lines 1827-1842)

### Verification
- **Build**: `npm run build` passed successfully
- **Code Review**: Verified HTML structure and JS logic for instruction passing
- **Logic Check**:
  - Textarea exists with ID `userHint`
  - Value is trimmed before sending
  - Empty value is sent as `undefined` (consistent with worker logic)
  - Textarea is cleared on new capture

### Key Learnings
- **Inline Styles**: Used inline styles for quick UI iteration in `index.html` (consistent with existing code)
- **IPC Parameter Passing**: IPC `invoke` arguments must match the main process handler signature (updated in Task 6)
- **State Reset**: Important to clear user input fields when starting a fresh session to avoid stale data
