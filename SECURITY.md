# Security

## What this server can reach

With a default login it can read, create, update and delete across Gmail, Drive,
Docs, Sheets, Slides, Calendar, Tasks, Forms and Contacts, for whichever Google
account authenticated it. That is the blast radius, stated plainly, so you can
decide before installing rather than after.

Two limits are built in rather than assumed:

**Email is drafted, never sent silently.** `gmail_create_draft` writes to Drafts
and stops. Sending is a separate tool that requires `confirm: true`.

**Nothing is deleted permanently.** `drive_trash` moves a file to the trash,
recoverable for 30 days. There is no permanent-delete tool.

## Narrowing what it can do

```bash
GWS_READ_ONLY=1                      # refuse every write
GWS_SERVICES=drive,calendar          # nothing else is even registered
```

`GWS_SERVICES` removes the other tools from the list entirely rather than
failing when called. A model cannot reach for a tool it cannot see.

## Credentials

This server never sees or stores a Google credential. Authentication belongs to
Google's `gws` CLI, which holds the token and which you can revoke at any time
with `gws auth logout`.

On a headless server set `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file`, and the
credential is encrypted into the config directory instead of an OS keyring that
does not exist there.

## The HTTP transport

`--http` refuses to start without `GWS_MCP_TOKEN`, because the process holds
full access to a Google account and an open port would hand that to anyone who
found it. Bind it to loopback and put TLS in front. `deploy/install.sh` does
both.

## Command construction

Arguments reach the CLI as an array, never through a shell, so a quote or a
semicolon in a subject line cannot become a command. Email headers reject CR and
LF rather than escaping them, which closes header injection.

## Logging

Nothing is logged by default. There is no debug mode that prints request bodies,
because a mailbox body in a log file is the same leak as a mailbox body
anywhere else.

## Prompt injection

Everything read from a mailbox, a document or a calendar invitation was written
by someone else, and can contain text shaped like an instruction. The server
tells the model, in its instructions, to treat all of it as data.

Do not rely on that alone. For an agent working unattended on other people's
content, `GWS_READ_ONLY=1` is the real defence.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository. Please do not
open a public issue for a security problem.

Expect a reply within a week. Reporters are credited in the fix notes unless
they would rather not be.
