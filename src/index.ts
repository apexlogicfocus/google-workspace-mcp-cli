#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { buildServer, serverState, VERSION } from "./server.js"
import { startHttp } from "./transport/http.js"
import { gws, GWS_BIN, GwsError } from "./gws.js"
import { isCliCommand, runCli, toolNames } from "./cli.js"

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const val = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }

const HELP = `\
google-workspace-mcp ${VERSION}

  google-workspace-mcp                 run over stdio (Claude Code, Desktop, Cursor)
  google-workspace-mcp --http          run over HTTP (claude.ai, remote clients)
  google-workspace-mcp doctor          check the setup and say what is wrong
  google-workspace-cli                 every tool as a shell command
  google-workspace-cli <command> --help  what one command takes

Flags
  --http                 serve streamable HTTP instead of stdio
  --host <addr>          HTTP bind address, default 127.0.0.1
  --port <n>             HTTP port, default 8787

Environment
  GWS_BIN                path to the gws binary, if not on PATH
  GWS_MCP_TOKEN          bearer token, REQUIRED for --http
  GWS_READ_ONLY=1        refuse every write
  GWS_SERVICES           limit to these services, e.g. drive,gmail,calendar

Authentication is the gws CLI's, not this server's. Run \`gws auth login\` once
on this machine. This process never sees or stores a Google credential.`

async function doctor() {
  const state = serverState()
  console.log(`google-workspace-mcp ${state.version}`)
  console.log(`gws binary:  ${GWS_BIN}`)
  console.log(`read-only:   ${state.readOnly}`)
  console.log(`services:    ${Array.isArray(state.services) ? state.services.join(", ") : state.services}`)
  console.log()

  try {
    const status = (await gws({ service: "auth", path: ["status"] })) as Record<string, unknown>
    const method = status.auth_method
    if (!method || method === "none") {
      console.log("Auth: NOT CONFIGURED")
      console.log("  Run `gws auth login` on this machine. On a headless server, set")
      console.log("  GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file first so the credential")
      console.log("  lands in the config directory rather than an OS keyring.")
      process.exitCode = 1
      return
    }
    console.log(`Auth: OK (${method})`)
    console.log(`  storage: ${status.storage}  keyring: ${status.keyring_backend}`)
  } catch (e) {
    const err = e as GwsError
    console.log(`Auth: FAIL`)
    console.log(`  ${err.message}`)
    process.exitCode = 1
    return
  }

  try {
    await gws({ service: "drive", path: ["files", "list"], params: { pageSize: 1, fields: "files(id)" } })
    console.log("Drive:  OK, a live API call succeeded")
  } catch (e) {
    console.log(`Drive:  FAIL. ${(e as Error).message}`)
    process.exitCode = 1
  }

  if (process.env.GWS_MCP_TOKEN) console.log("HTTP:   bearer token is set")
  else console.log("HTTP:   no GWS_MCP_TOKEN, so --http will refuse to start")
}

/** Invoked as the CLI binary rather than the server one. */
function invokedAsCli(): boolean {
  const name = (process.argv[1] ?? "").split("/").pop() ?? ""
  return name.startsWith("google-workspace-cli")
}

async function main() {
  // The CLI: every tool as a command, from the same server an MCP app talks
  // to. Checked first so `<tool> --help` reaches the tool.
  const command = argv[0]
  const cli =
    command !== undefined && !command.startsWith("-") && command !== "doctor"
      ? invokedAsCli() || isCliCommand(argv, await toolNames())
      : invokedAsCli() && argv.length === 0
  if (cli) {
    process.exitCode = await runCli(argv.length ? argv : ["tools"])
    return
  }

  if (has("--help") || has("-h")) { console.log(HELP); return }
  if (has("--version")) { console.log(VERSION); return }
  if (argv[0] === "doctor") { await doctor(); return }

  if (has("--http")) {
    const host = val("--host") || "127.0.0.1"
    const port = Number(val("--port") || 8787)
    const { url } = await startHttp(host, port)
    console.error(`google-workspace-mcp listening on ${url}`)
    return
  }

  await buildServer().connect(new StdioServerTransport())
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
