# Learnings & Conventions

This file accumulates discovered patterns, conventions, and best practices during implementation.

---

## Task 1: OAuth Token Storage (2026-01-29)

### Cloudflare KV Setup
- Create namespace: `wrangler kv namespace create "NAME"`
- Returns ID to add to `wrangler.toml` under `[[kv_namespaces]]`
- KV is simple key-value, perfect for `{device_id}:{service}` → encrypted tokens

### AES-256-GCM Encryption in Workers
- Web Crypto API available in Workers runtime
- Key format: 64-char hex string (256 bits) stored as secret
- IV must be 12 bytes (96 bits) for GCM mode
- Ciphertext format: `IV (12 bytes) || ciphertext` encoded as hex

### Secrets Management
- Use `wrangler secret put NAME` to set secrets
- Generate encryption key: `openssl rand -hex 32`
- Secrets not visible in dashboard, only accessible at runtime

### Endpoint Design Pattern
- Followed existing Worker routing (path-based switch)
- Updated CORS to allow GET/DELETE methods
- Consistent response format: `{success: boolean, data?: T, error?: string}`

### Device ID in Electron
- `crypto.randomUUID()` generates UUID v4
- Stored in electron-store, persists across app restarts
- Lazy initialization pattern: generate on first call

---

## Task 2: Slack OAuth Integration (2026-01-29)

### Slack OAuth Critical: User Token vs Bot Token
- `search:read` scope ONLY works with User Tokens (xoxp-)
- Bot Tokens (xoxb-) cannot access search.messages API
- Use `user_scope` parameter in authorize URL (not `scope`)
- Token response: access token is in `authed_user.access_token` for user tokens

### OAuth Flow with Deep Links
- Register protocol: `app.setAsDefaultProtocolClient('linear-capture')`
- electron-builder config: add `protocols` array with scheme
- Handle `app.on('open-url', callback)` for macOS
- Handle `app.on('second-instance', callback)` for Windows (URL in argv)
- State parameter: encode device_id in base64 JSON for callback correlation

### Worker Endpoints Pattern
- GET `/slack/auth` - Generate OAuth URL with state containing device_id
- POST `/slack/callback` - Exchange code, store token with `storeTokens()`
- GET `/slack/channels` - Requires stored token, returns filtered channels
- GET `/slack/status` - Check connection status without API call
- DELETE `/slack/disconnect` - Remove stored tokens

### Settings UI IPC Pattern
- Main process: `ipcMain.handle('slack-connect', async () => {...})`
- Renderer: `await ipcRenderer.invoke('slack-connect')`
- Events from main: `settingsWindow.webContents.send('slack-connected', data)`
- Renderer listens: `ipcRenderer.on('slack-connected', callback)`

### Slack API Response Handling
- Check `response.ok` boolean first
- Token revocation: handle `token_revoked`, `invalid_auth` errors
- Channels: filter by `is_member` to only show accessible channels

### Protocol Handler Config (electron-builder)
```json
"protocols": [
  { "name": "Linear Capture", "schemes": ["linear-capture"] }
]
```
