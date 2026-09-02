# Google Workspace MCP changelog

| Component | Version | Last Updated |
|-----------|---------|--------------|
| google-workspace-mcp | 0.1.0 | 2026-08-31 |

---

## 0.1.0

First release.

### What it does

38 tools across Gmail, Drive, Docs, Sheets, Slides, Calendar, Tasks, Forms and
Contacts, over stdio and streamable HTTP.

### Why it wraps Google's CLI

Reading a mailbox needs `gmail.modify` and full Drive needs `drive`. Google
classes both as restricted, so any OAuth app declaring them faces an annual
third-party security assessment and a 100-user cap until it passes.

Google's Workspace CLI already handles authentication. Wrapping it means this
server never holds a Google credential, and the user's own login carries the
scopes.

### Notable

- 38 curated tools rather than the CLI's ~400 methods, plus `workspace_raw` and
  `workspace_schema` for everything else
- Email is drafted, never sent silently. Sending is a separate confirmed tool
- No permanent delete. `drive_trash` is recoverable for 30 days
- `GWS_READ_ONLY=1` and `GWS_SERVICES=` narrow the surface, removing tools from
  the list rather than failing when called
- `--http` refuses to start without a bearer token
- Arguments reach the CLI as an array, never a shell. Email headers reject CR/LF
- `deploy/install.sh` for systemd, and a Dockerfile pinned to a digest with the
  gws binary checksum-verified

### Verified at build time

- MCP TypeScript SDK 1.30.0, zod 4.5.4, Node 22
- Google Workspace CLI v0.22.5
- The CLI ships no OAuth client of its own, so a login uses yours. An unverified
  app in production still works: you click past one warning screen
- `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file` avoids the OS keyring, which is
  what makes headless servers work
