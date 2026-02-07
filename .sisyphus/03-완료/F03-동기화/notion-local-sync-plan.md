# Notion Local DB Sync Issue Plan

## Goal
- Identify why Notion sync shows only 6 pages despite large local cache.
- Confirm whether sync uses local DB or API fallback.
- Provide a safe fix path that improves observability first, then behavior.

## Current Facts
- Local Notion cache exists and is large (pages ~21k on this machine).
- App sync uses NotionService.searchPages('', 100) in NotionSyncAdapter.
- NotionService prefers local DB when available; falls back to API on error or empty.
- API returns only pages shared with the integration, often far fewer.
- UI now exposes local DB availability via new IPC: notion-local-status.

## Hypotheses
1) Local DB read fails in packaged app (permissions, sql.js path, file access).
2) Local DB read succeeds but returns zero pages due to user filter or parsing issues.
3) API path is used (fallback) and only returns shared pages.

## Investigation Steps
1) Verify local DB status in Settings UI (Local DB: available/unavailable/error).
2) Capture Notion sync logs around local initialization and search source.
3) Check if NotionService.searchPages returns source=local or source=api.
4) Confirm Full Disk Access for the packaged app and dev environment.

## Fix Options (Ordered)
### Option A: Observability First (Recommended)
- Keep current behavior but log and surface the search source.
- Add: last search source, last local init error string.

### Option B: Local-First With API Fallback Threshold
- If local returns < N results, automatically call API and merge.
- Ensure metadata marks source to keep debugging clarity.

### Option C: Sync Uses API Regardless of Local DB
- Keep local DB for search UI only; sync always pulls via API.
- Ensures sync count matches integration share scope.

## Risks
- API fallback may increase rate usage and latency.
- Local DB read requires permissions; error handling must remain safe.
- Mixing sources can create duplicates if IDs overlap (must dedupe by page id).

## Validation Checklist
- Local DB status in Settings matches actual behavior.
- Notion sync count increases when local is available.
- API-only mode shows count matching integration share scope.
- No crashes or timeouts with large local cache.

## Proposed Next Action
- Observe local DB status in Settings for a real run.
- If status is error/unavailable, fix access path first.
- If status is available but sync count remains low, add search source logging and API fallback threshold.
