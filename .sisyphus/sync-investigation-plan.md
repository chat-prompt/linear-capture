# Sync Investigation Plan

## Goal
- Identify current sync limits/criteria for Linear, Gmail, Notion
- Explain Notion low page count despite full workspace selection
- Produce safe expansion options with impact analysis

## Scope
- Linear: issues + comments pagination and limits
- Gmail: batch limits, date-based sync behavior
- Notion: OAuth scope, local DB vs API path, result limits

## Hypotheses
- Linear: `first: 100` cap without pagination
- Gmail: `BATCH_SIZE * MAX_BATCHES` hard cap
- Notion: OAuth sharing or local DB path reduces available pages

## Investigation Steps
1. Capture main-process sync logs after pressing Sync Now for each source
2. Read `sync:get-status` for source documentCount/lastSync
3. Verify Notion path selection (local DB available vs API search)
4. Confirm Linear SDK pagination support and current usage
5. Confirm Gmail batch constants and effective cap
6. Assess performance/embedding cost impact for larger sync
7. Draft expansion options per source
8. Define validation checklist (count increase, errors, time)

## Outputs
- Source-by-source current limits and actual sync criteria
- Notion access/limit root cause summary
- Expansion proposal with expected impact
- Verification checklist
