/**
 * The gws layer. Every tool goes through here.
 *
 * Google publishes a Workspace CLI that already handles auth, discovery and
 * every service. Wrapping it rather than calling the REST APIs directly means
 * this server never sees or stores a Google credential: the CLI holds it, and
 * we shell out.
 *
 * Two things this buys that matter. The credential stays in one place a user
 * can inspect and revoke with `gws auth logout`. And the CLI is generated from
 * Google's own discovery service, so a new API method works here the day it
 * ships without a release from us.
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)

/* The CLI is dynamically generated from Google's discovery service, which means
   roughly 400 callable methods. That whole surface is not a tool list: a model
   picking from 400 picks badly, and the list is re-sent on every turn. So the
   tools in src/tools are a curated subset, and `workspace_raw` below is the
   escape hatch for the rest. */
export const GWS_BIN = process.env.GWS_BIN?.trim() || "gws"

export class GwsError extends Error {
  constructor(message: string, readonly code: number, readonly stderr: string) {
    super(message)
  }
}

/** Exit codes the CLI documents. Mapping them turns a number into an action. */
function explain(code: number, stderr: string): string {
  const tail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400)
  switch (code) {
    case 2:
      return `Not authenticated. Run \`gws auth login\` on the machine running this server, then try again. ${tail}`
    case 3:
      return `The CLI rejected the arguments. This is usually a malformed params or body JSON. ${tail}`
    case 4:
      return `Could not fetch the API schema from Google. Check network access from this machine. ${tail}`
    case 1:
      return `Google returned an error. ${tail}`
    default:
      return tail || `gws exited with code ${code}`
  }
}

export type GwsArgs = {
  service: string
  /** e.g. ["files","list"] or ["users","messages","list"] */
  path: string[]
  params?: unknown
  body?: unknown
  /** Follow pagination and return every page. Off by default: it multiplies cost. */
  pageAll?: boolean
  pageLimit?: number
}

/**
 * One CLI call. Arguments are passed as an array, never through a shell, so a
 * quote or a semicolon in a subject line cannot become a command.
 */
export async function gws({ service, path, params, body, pageAll, pageLimit }: GwsArgs): Promise<unknown> {
  const args = [service, ...path]
  if (params !== undefined) args.push("--params", JSON.stringify(params))
  if (body !== undefined) args.push("--json", JSON.stringify(body))
  if (pageAll) {
    args.push("--page-all")
    if (pageLimit) args.push("--page-limit", String(pageLimit))
  }

  try {
    const { stdout } = await run(GWS_BIN, args, {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 120_000,
      env: process.env,
    })
    const text = stdout.trim()
    if (!text) return { ok: true }
    // --page-all emits NDJSON, one object per page. Everything else is one blob.
    if (pageAll && text.includes("\n")) {
      return text.split("\n").filter(Boolean).map((line) => JSON.parse(line))
    }
    try {
      return JSON.parse(text)
    } catch {
      return { raw: text }
    }
  } catch (e) {
    const err = e as { code?: number; stderr?: string; message?: string }
    const code = typeof err.code === "number" ? err.code : 5
    if (err.message?.includes("ENOENT")) {
      throw new GwsError(
        `The \`gws\` CLI was not found. Install it from https://github.com/googleworkspace/cli, or set GWS_BIN to its full path.`,
        127, "",
      )
    }
    throw new GwsError(explain(code, err.stderr || err.message || ""), code, err.stderr || "")
  }
}

/** Which services this server is allowed to touch at all. */
export function allowedServices(): Set<string> | null {
  const raw = process.env.GWS_SERVICES?.trim()
  if (!raw) return null
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))
}

export function isReadOnly(): boolean {
  return process.env.GWS_READ_ONLY === "1"
}
