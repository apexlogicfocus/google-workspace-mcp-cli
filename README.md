<div align="center">
  <img src="https://cdn.navid.media/connectors/google-workspace-icon.png" alt="Google Workspace" width="88">
</div>

# Google Workspace MCP

[![npm](https://img.shields.io/npm/v/@thenavidm%2Fgoogle-workspace-mcp?color=orange&label=npm)](https://www.npmjs.com/package/@thenavidm/google-workspace-mcp)
[![Licence](https://img.shields.io/badge/licence-MIT-green)](./LICENSE)
[![YouTube](https://img.shields.io/badge/YouTube-@thenavidm-red?logo=youtube&logoColor=white)](https://youtube.com/@thenavidm?sub_confirmation=1)
[![X](https://img.shields.io/badge/X-@thenavidm-black?logo=x)](https://x.com/thenavidm)

Google Workspace MCP server for Claude Code and AI agents. Gmail, Drive, Sheets, Docs, Slides, Calendar, Tasks, Forms and Contacts through the official Workspace CLI, so your credential never leaves your machine.

One connection covers Gmail, Drive, Sheets, Docs, Slides, Calendar, Tasks, Forms and Contacts.

It wraps Google's own Workspace CLI, so your credential is created by you and stays on your machine.

That also sidesteps the security assessment a third-party OAuth app needs for mailbox and Drive access.

Built on Google's own Workspace CLI, so this server never handles your Google credentials.

[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)
[![YouTube](https://img.shields.io/badge/YouTube-@thenavidm-red?logo=youtube&logoColor=white)](https://youtube.com/@thenavidm?sub_confirmation=1)
[![X](https://img.shields.io/badge/X-@thenavidm-black?logo=x)](https://x.com/thenavidm)

Built by [Navid Moazzez](https://navid.me).

```
You: what did I agree to with the agency, and is it in the calendar?

Claude: Searching your mail, then your calendar.

  Thread with hello@agency.com, 14 August
  You agreed to a 6 week pilot starting 1 September, £4k, with a
  review call at the halfway point.

  Calendar: the kickoff is there for 1 September.
  The halfway review is not. That would be 22 September.

  Want me to draft the invite?
```

## Contents

| | Section | |
|---|---|---|
| 1 | [What you can ask it](#1-what-you-can-ask-it-) | Real prompts, not features |
| 2 | [Quick install](#2-quick-install-) | Node, one command |
| 3 | [Setup](#3-setup-) | Sign in once |
| 4 | [Connect your client](#4-connect-your-client-) | Every client, copy and paste |
| 5 | [Check it worked](#5-check-it-worked-) | `doctor` |
| 6 | [Tools](#6-tools-) | All 38 |
| 7 | [Running it on a server](#7-running-it-on-a-server-) | For claude.ai |
| 8 | [Safety](#8-safety-) | What it will not do |
| 9 | [Troubleshooting](#9-troubleshooting-) | When something breaks |
| 10 | [FAQ](#10-faq-) | Start here if you are new |

---

## 1. What you can ask it 💬

- What did I agree to with the agency, and is it in the calendar?
- Summarise every unread email from this week and tell me which need a reply.
- Draft replies to the three that matter. Do not send them.
- Find the pricing spreadsheet and tell me what changed since March.
- Pull every response to the onboarding form into a new sheet.
- Who did I email about the launch, and did they reply?
- Build a doc from the notes in that folder.
- What is on my calendar next week that I could move?

The first one is the point. It reads mail and calendar together, which no single Google product does for you.

---

## 2. Quick install ⚡

Node 20 or newer. Nothing else.

```bash
npx -y @thenavidm/google-workspace-mcp --version
```

That is the whole install. `npx` fetches it on demand, so there is nothing to update later.

You also need Google's Workspace CLI, which is what actually talks to Google:

```bash
# macOS
brew install googleworkspace/tap/gws

# or download a binary
# https://github.com/googleworkspace/cli/releases
```

---

## 3. Setup 🔑

One command, once.

```bash
gws auth login
```

A browser opens, you approve, and you are done. The credential belongs to the CLI, not to this server.

Limit what it can touch while you are there:

```bash
gws auth login --services drive,gmail,calendar
gws auth login --readonly
```

### You will see an "unverified app" warning

That is expected and it is not a problem. Google shows it for any OAuth app it has not reviewed, and reviewing an app that only you use is not worth the process. Click **Advanced**, then **Go to (your app)**.

If you would rather not see it, `gws auth setup` walks you through creating your own Google Cloud project, and then the app is yours.

### Revoking

```bash
gws auth logout
```

Or remove access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

---

## 4. Connect your client 🔌

### Claude Code

```bash
claude mcp add google-workspace -- npx -y @thenavidm/google-workspace-mcp@latest
```

`--scope user` makes it available in every project rather than the current one.

### Claude Desktop

| Platform | Config path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["-y", "@thenavidm/google-workspace-mcp@latest"]
    }
  }
}
```

> **Tip**
> Claude Desktop does not inherit your shell PATH, so it may not find `npx` or `gws`. If it fails, use absolute paths from `which npx` and `which gws`, and set `GWS_BIN` to the second one.

Quit Claude Desktop completely and reopen it.

### claude.ai on the web

claude.ai runs connectors from Anthropic's cloud, not from your machine, so it cannot launch a local command. It needs this server running somewhere with a public HTTPS address. See [section 7](#7-running-it-on-a-server-).

### Cursor

`.cursor/mcp.json`

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["-y", "@thenavidm/google-workspace-mcp@latest"]
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`, same shape as Cursor.

### VS Code

`.vscode/mcp.json`. The key is `servers`, not `mcpServers`.

```json
{
  "servers": {
    "google-workspace": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@thenavidm/google-workspace-mcp@latest"]
    }
  }
}
```

### Codex CLI

`~/.codex/config.toml`

```toml
[mcp_servers.google-workspace]
command = "npx"
args = ["-y", "@thenavidm/google-workspace-mcp@latest"]
```

### Everything else

Any stdio MCP client takes the same two things: the command `npx` and those arguments.

---

## 5. Check it worked 🩺

```bash
npx -y @thenavidm/google-workspace-mcp doctor
```

It checks the CLI is present, that you are authenticated, and makes one live API call. If every line is fine, restart your client and ask it `what is on my calendar today`.

---

## 6. Tools 🛠️

38 tools. The named ones cover what an assistant reaches for; `workspace_raw` covers the rest.

### Gmail

| Tool | Does |
|---|---|
| `gmail_search` | search with Gmail's own query syntax |
| `gmail_get_message` | one message in full |
| `gmail_get_thread` | a whole conversation in order |
| `gmail_create_draft` | write a draft, never sends |
| `gmail_send_draft` | send an existing draft, needs `confirm` |
| `gmail_modify_labels` | archive, mark read, triage |
| `gmail_list_labels` | label ids, which differ from their names |

### Drive

| Tool | Does |
|---|---|
| `drive_search` | find files with Drive query syntax |
| `drive_get_file` | metadata, sharing, link |
| `drive_export` | the **content** of a Doc, Sheet or Slide as text |
| `drive_create_folder` | |
| `drive_share` | grant someone access |
| `drive_trash` | to the trash, recoverable, needs `confirm` |

### Sheets, Docs, Slides

`sheets_read` · `sheets_write` · `sheets_append` · `sheets_get` · `sheets_create`
`docs_get` · `docs_create` · `docs_append`
`slides_get` · `slides_create`

### Calendar and Tasks

`calendar_list_events` · `calendar_create_event` · `calendar_update_event` · `calendar_delete_event` · `calendar_list_calendars`
`tasks_lists` · `tasks_list` · `tasks_create` · `tasks_complete`

### Forms and Contacts

`forms_get` · `forms_responses` · `contacts_search` · `contacts_list`

### Everything else

| Tool | Does |
|---|---|
| `workspace_schema` | the exact shape a method expects, from Google's discovery service |
| `workspace_raw` | call any of the ~400 methods the tools above do not cover |

Read the schema before using `workspace_raw`, rather than guessing field names.

---

## 7. Running it on a server 🖥️

Needed for claude.ai, and useful if you want it always on.

```bash
curl -fsSL https://raw.githubusercontent.com/navidmoazzez/google-workspace-mcp/main/deploy/install.sh | sudo bash
```

That creates a dedicated user, installs the `gws` binary with its checksum verified, generates a bearer token, and runs a systemd service bound to `127.0.0.1:8787`. Nothing is exposed to the internet by the script: put it behind your existing reverse proxy, which is where TLS belongs.

Then authenticate as the service user. The script prints the exact command.

Docker instead:

```bash
docker build -t google-workspace-mcp .
docker run -d --name gws-mcp -p 127.0.0.1:8787:8787 \
  -e GWS_MCP_TOKEN="$(openssl rand -hex 32)" \
  -v ~/.config/gws:/home/node/.config/gws \
  google-workspace-mcp
```

The config mount must be read-write: `gws` stores its encryption key and cached discovery documents there, not just a token.

> **Note**
> On macOS the credential lives in the OS keyring, so copying `~/.config/gws` to a Linux box does not work. Set `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file` and authenticate on the server itself.

---

## 8. Safety 🛡️

**Email is drafted, never sent silently.** `gmail_create_draft` writes to Drafts and stops. Sending is a separate tool needing `confirm: true`, because a sent email cannot be recalled.

**Nothing is deleted permanently.** `drive_trash` is recoverable for 30 days. There is no hard-delete tool.

**Turn writes off, or narrow the surface:**

```bash
GWS_READ_ONLY=1                  # refuse every write
GWS_SERVICES=drive,calendar      # nothing else is even registered
```

`GWS_SERVICES` removes the other tools from the list rather than failing when called. A model cannot reach for a tool it cannot see.

**Prompt injection.** Anything read from a mailbox or a shared document was written by someone else and can contain text shaped like an instruction. The server tells the model to treat it as data. That helps and is not a guarantee: for an agent working unattended on other people's content, `GWS_READ_ONLY=1` is the real defence.

Full detail in [SECURITY.md](./SECURITY.md).

---

## 9. Troubleshooting 🔧

Run `doctor` first. It answers most of it.

| Symptom | Cause |
|---|---|
| "The `gws` CLI was not found" | not installed, or not on the PATH your client uses. Set `GWS_BIN` to its full path |
| "Not authenticated" | run `gws auth login` on the machine running the server |
| Works in the terminal, not in Claude Desktop | Desktop does not inherit your shell PATH. Use absolute paths |
| "unverified app" warning | expected. Advanced, then Go to. See [section 3](#3-setup-) |
| A tool says the service is disabled | `GWS_SERVICES` is set and does not include it |
| `--http` refuses to start | `GWS_MCP_TOKEN` is not set. That is deliberate |
| claude.ai cannot see it | it needs a public HTTPS URL, see [section 7](#7-running-it-on-a-server-) |

---

## 10. FAQ ❓

<details>
<summary><b>What is an MCP server?</b></summary>

An MCP server is a standard way to give an AI assistant real access to a tool, so it can act rather than guess. You install it once, your assistant gains a set of tools, and the same server works in Claude, Cursor, ChatGPT and anything else that speaks MCP.

Without one, an assistant can only talk about your email. With one, it can read it.

</details>

<details>
<summary><b>What is Google Workspace?</b></summary>

Google's suite of work apps: Gmail, Drive, Docs, Sheets, Slides, Calendar, Tasks, Forms and Contacts. If you use a Gmail address, you already have it.

</details>

<details>
<summary><b>Do I need to be technical to use this?</b></summary>

You need to be comfortable running two commands in a terminal: one to install, one to sign in. After that it is all conversation with your assistant.

If a terminal is unfamiliar, the Claude Desktop path in [section 4](#4-connect-your-client-) is the shortest route.

</details>

<details>
<summary><b>Is my data sent anywhere? Who can see it?</b></summary>

Your Google data goes from Google to the machine running this server, and from there to whichever AI client you connected. It does not pass through any server of ours, because there isn't one.

The exception is deliberate and worth understanding: whatever your assistant reads, it sends to its own model provider, the same as anything else you paste into a chat.

</details>

<details>
<summary><b>What can it do that I cannot do in the app already?</b></summary>

Work across apps in one step. Gmail cannot search your Drive, and Calendar cannot read your mail. An assistant with this server does both in a single question, and it can act on the answer: draft the reply, create the event, update the sheet.

</details>

<details>
<summary><b>Can it delete something by accident?</b></summary>

It can trash a Drive file and delete a calendar event, and both need `confirm: true` set deliberately. Trashed files are recoverable for 30 days. There is no permanent-delete tool.

It cannot send an email by accident: drafting and sending are separate tools, and sending needs confirmation.

If you want none of that, run it with `GWS_READ_ONLY=1`.

</details>

<details>
<summary><b>Does it cost anything?</b></summary>

It costs nothing. The server is free and open source, Google's CLI is free, and the Workspace APIs are free at any volume a person generates.

</details>

<details>
<summary><b>Does it work with ChatGPT, Cursor and claude.ai, or only Claude?</b></summary>

It works with any MCP client. Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex CLI and Gemini CLI all run it locally.

claude.ai is the exception: it connects from Anthropic's cloud rather than your machine, so it needs the server running somewhere with a public HTTPS address. See [section 7](#7-running-it-on-a-server-).

</details>

<details>
<summary><b>Can I connect more than one Google account?</b></summary>

One account per server. The `gws` CLI holds a single login.

For a second account, run a second copy with `GOOGLE_WORKSPACE_CLI_CONFIG_DIR` pointing somewhere else, and add it to your client under a different name.

</details>

<details>
<summary><b>What happens when my token expires?</b></summary>

It refreshes itself. The CLI holds a refresh token and renews access silently, so you sign in once.

If you ever do need to sign in again, `doctor` says so plainly rather than failing with a permissions error.

</details>

---

## Questions

Run into a problem or have a question? [Open an issue](https://github.com/navidmoazzez/google-workspace-mcp/issues) and I will help.

## About the author

Navid Moazzez is a leading AI business strategist, and the host of the AI Creator Summit, watched by 100,000+ creators. He helps creators and founders master AI and build their own AI Operating System (AI OS) to automate their business and life. This Google Workspace MCP server is one piece of that system.

**Links**

- Personal website: [navid.me](https://navid.me)
- Navid Media: [navid.media](https://navid.media)
- YouTube: [@thenavidm](https://youtube.com/@thenavidm?sub_confirmation=1) and [@thenavidai](https://youtube.com/@thenavidai?sub_confirmation=1)
- X: [@thenavidm](https://x.com/thenavidm)
- Instagram: [@thenavidm](https://instagram.com/thenavidm)
- LinkedIn: [thenavidm](https://linkedin.com/in/thenavidm)

## Dependencies

| Library | Licence | What it does |
|---|---|---|
| [Google Workspace CLI](https://github.com/googleworkspace/cli) | Apache-2.0 | Talks to Google, and owns the credential |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | MIT | The MCP server, stdio and streamable HTTP |
| [express](https://github.com/expressjs/express) | MIT | The HTTP transport |
| [zod](https://github.com/colinhacks/zod) | MIT | Tool argument schemas |

## License

[MIT](./LICENSE). Free to use, modify, and share.

Not affiliated with, endorsed by, or sponsored by Google LLC. Google Workspace, Gmail, Google Drive, Google Docs, Google Sheets, Google Slides, Google Calendar, Google Tasks, Google Forms and Google Contacts are trademarks of Google LLC. This project wraps the official Google Workspace CLI and holds no credentials of its own.

---

© 2026 NM Media. Made with ❤️ by [Navid Moazzez](https://navid.me).
