
## [2026-02-03T17:30] NotionSyncAdapter Issues

### Potential Problems
1. **Pagination**: Current implementation only fetches first 100 pages - need to handle `hasMore` and `nextCursor` for large workspaces
2. **Rate limiting**: No exponential backoff for Notion API calls - should add retry logic
3. **Batch embedding**: Syncing pages one-by-one is slow - could batch embed multiple pages
4. **Memory usage**: Loading all pages into memory before filtering - could stream/paginate
5. **Deleted pages**: No handling for pages deleted from Notion - should add soft delete logic

### Future Improvements
- Add pagination support for workspaces with >100 pages
- Implement batch embedding for better performance
- Add exponential backoff for API failures
- Stream pages instead of loading all into memory
- Handle deleted pages (soft delete in local DB)


## Task 3b: SlackSyncAdapter Issues (2026-02-03)

### Worker API Dependency

**Issue**: SlackSyncAdapter requires new Worker endpoint that doesn't exist yet

**Details**:
- Endpoint: `GET /slack/history`
- Parameters: `device_id`, `channel`, `oldest` (optional)
- Response: `{ success, messages: [{ ts, text, user, username, thread_ts, replies: [...] }], has_more, error }`

**Impact**: SlackSyncAdapter will fail at runtime until Worker is updated

**Resolution**: Need to implement Worker endpoint in linear-capture-ai project

### Thread Reply Fetching

**Consideration**: Slack API requires separate call to fetch thread replies

**Current Approach**: Assume Worker endpoint returns thread replies nested in parent message

**Alternative**: Could make separate Worker calls for each thread, but this would be slower

**Decision**: Rely on Worker to fetch threads in single call (more efficient)

### Rate Limiting

**Potential Issue**: Slack API has rate limits (Tier 3: 50+ requests/minute)

**Current Mitigation**: None - relies on Worker to handle rate limiting

**Future Enhancement**: Could add retry logic with exponential backoff in SlackSyncAdapter

### Pagination

**Current Limitation**: No pagination support in `fetchChannelHistory()`

**Impact**: Only fetches first page of messages (typically 100 messages)

**Future Enhancement**: Add `has_more` handling and cursor-based pagination

