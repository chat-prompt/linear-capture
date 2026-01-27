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
