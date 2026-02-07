# Architectural Decisions

This file records key architectural choices and their rationales.

---

## [2026-01-29] Initial Decisions

### OAuth Token Storage
- **Decision**: Store tokens in Cloudflare Worker using device_id as key
- **Rationale**: Centralizes token management, enables multi-device sync potential
- **Alternative Rejected**: Local electron-store (isolated per device)

### OAuth Flow
- **Decision**: System browser + deep link callback
- **Rationale**: Better UX, standard pattern, avoids security risks of embedded browser
- **Alternative Rejected**: Electron popup window

### Slack Search Scope
- **Decision**: User-selected specific channels only
- **Rationale**: Reduces noise, respects user preferences
- **Alternative Rejected**: All channels (too broad)

### Notion Search Scope
- **Decision**: Entire workspace
- **Rationale**: Notion pages are already permission-controlled
- **Alternative Rejected**: Specific pages only (too restrictive)

---
