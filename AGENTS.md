# Working on google-workspace-mcp

For agents editing this repository. Users read the README.

## What this is

An MCP server that wraps Google's own Workspace CLI rather than calling the REST
APIs. That choice is the whole design: the CLI owns authentication, so this
server never handles a Google credential, and it is generated from Google's
discovery service, so a new API method works here without a release from us.

## Non-negotiables

**Every tool goes through `gws()` in `src/gws.ts`.** Arguments are passed as an
array, never through a shell. A subject line containing a semicolon must not be
able to become a command.

**Email is drafted, not sent.** `gmail_create_draft` writes to Drafts and stops.
Do not add a tool that composes and sends in one call, however convenient.

**`confirm: true` only on what cannot be undone.** Sending email, deleting a
calendar event, trashing a file. Not on labels, not on writes that can be
edited back. Requiring confirmation everywhere teaches the model to pass it
reflexively, and then it passes it on the delete too.

**No permanent delete.** `drive_trash` sets `trashed: true`. If someone asks for
a hard delete, they can use `workspace_raw` and mean it.

**`guard()` first, before any work.** It enforces `GWS_SERVICES` and
`GWS_READ_ONLY`.

## The tool surface is curated on purpose

The CLI reaches roughly 400 methods. This server exposes 38. That is not an
oversight: a model choosing from 400 tools chooses badly, and the whole list is
re-sent on every turn. `workspace_raw` plus `workspace_schema` cover the rest,
so curation costs nothing in capability.

Before adding a tool, ask whether it is something an assistant reaches for
often. If not, it belongs behind `workspace_raw`.

## Testing

```bash
npm run build
npm test
node dist/index.js doctor
```

`doctor` makes a live API call, so it needs a real login. The unit tests do not.

To test the tool list end to end, run the server over stdio and call
`tools/list`. It should return 38.

## Writing

No em dashes. Short paragraphs. Comments explain why, not what. Tool
descriptions are read by a model that cannot see the code, so they state what
the tool reaches, what it costs, and what will surprise the caller.
