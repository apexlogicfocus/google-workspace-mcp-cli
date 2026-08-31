/**
 * Streamable HTTP, so this reaches claude.ai and any other remote client.
 *
 * claude.ai connects from Anthropic's cloud, not from the user's machine, so a
 * stdio server is invisible to it. That is the whole reason this transport
 * exists: run the process on a box with a public HTTPS address and claude.ai
 * can use it.
 *
 * Which is also why it requires a bearer token. This process holds a credential
 * with full access to a Google account, so an open port would hand that to
 * anyone who found it.
 */

import express from "express"
import { randomUUID } from "node:crypto"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { buildServer, serverState } from "../server.js"

export async function startHttp(host: string, port: number) {
  const token = (process.env.GWS_MCP_TOKEN || "").trim()
  if (!token) {
    throw new Error(
      "GWS_MCP_TOKEN is not set. HTTP mode exposes a Google account over the network, so it refuses to start without a bearer token. Generate one with: openssl rand -hex 32",
    )
  }

  const app = express()
  app.use(express.json({ limit: "16mb" }))

  /* Sessions are held in memory. A restart drops them and clients reconnect,
     which is the right trade for a single-tenant server: persisting them would
     mean persisting a session store for no gain. */
  const sessions = new Map<string, StreamableHTTPServerTransport>()

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ...serverState(), sessions: sessions.size })
  })

  app.all("/mcp", async (req, res) => {
    const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim()
    // Length-independent compare is overkill here, but a plain === leaks length
    // through timing and costs nothing to avoid.
    if (auth.length !== token.length || !timingSafeEqual(auth, token)) {
      res.status(401).json({ error: "unauthorized" })
      return
    }

    const sid = req.headers["mcp-session-id"] as string | undefined
    let transport = sid ? sessions.get(sid) : undefined

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => { sessions.set(id, transport!) },
      })
      transport.onclose = () => {
        if (transport!.sessionId) sessions.delete(transport!.sessionId)
      }
      await buildServer().connect(transport)
    }

    await transport.handleRequest(req, res, req.body)
  })

  await new Promise<void>((resolve) => { app.listen(port, host, () => resolve()) })
  return { url: `http://${host}:${port}/mcp` }
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
