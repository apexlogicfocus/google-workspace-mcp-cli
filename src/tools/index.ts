/**
 * The curated tool surface.
 *
 * The CLI exposes roughly 400 methods. This is 38, chosen because they are what
 * an assistant actually reaches for. `workspace_raw` covers everything else, so
 * curation costs nothing in capability.
 *
 * Writes that cannot be undone take `confirm: true`. Writes that can be undone
 * do not, because asking for confirmation on everything teaches the model to
 * pass it reflexively, and then it passes it on the delete too.
 */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { gws, allowedServices, isReadOnly } from "../gws.js"

const READ = { readOnlyHint: true, openWorldHint: true }
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: true }

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
})

const CONFIRM = z.boolean().default(false)
  .describe("This cannot be undone. Set true to proceed.")

function guard(service: string, destructive = false) {
  const allow = allowedServices()
  if (allow && !allow.has(service)) {
    throw new Error(
      `The ${service} service is disabled on this server. It was started with GWS_SERVICES=${[...allow].join(",")}.`,
    )
  }
  if (destructive && isReadOnly()) {
    throw new Error("This server is read-only (GWS_READ_ONLY=1). Restart without it to allow writes.")
  }
}

export function registerTools(server: McpServer) {
  const allow = allowedServices()
  const on = (s: string) => !allow || allow.has(s)

  // ── Gmail ───────────────────────────────────────────────────────────────
  if (on("gmail")) {
    server.registerTool("gmail_search", {
      description: "Search the mailbox with Gmail's own query syntax (from:, to:, subject:, has:attachment, newer_than:7d, is:unread). Returns message ids and snippets; use gmail_get_message for a full body.",
      inputSchema: { q: z.string().describe('e.g. "from:sarah newer_than:30d has:attachment"'), max: z.number().int().min(1).max(500).default(25) },
      annotations: READ,
    }, async ({ q, max }) => {
      guard("gmail")
      return json(await gws({ service: "gmail", path: ["users", "messages", "list"], params: { userId: "me", q, maxResults: max } }))
    })

    server.registerTool("gmail_get_message", {
      description: "One message in full, including the body and headers.",
      inputSchema: { id: z.string(), format: z.enum(["full", "metadata", "minimal"]).default("full") },
      annotations: READ,
    }, async ({ id, format }) => {
      guard("gmail")
      return json(await gws({ service: "gmail", path: ["users", "messages", "get"], params: { userId: "me", id, format } }))
    })

    server.registerTool("gmail_get_thread", {
      description: "A whole conversation in order. Prefer this over fetching messages one by one when you need context.",
      inputSchema: { id: z.string() },
      annotations: READ,
    }, async ({ id }) => {
      guard("gmail")
      return json(await gws({ service: "gmail", path: ["users", "threads", "get"], params: { userId: "me", id, format: "full" } }))
    })

    server.registerTool("gmail_create_draft", {
      description: "Write a draft. It is NOT sent: it appears in Drafts for a person to review. This is the safe way to have an agent write email.",
      inputSchema: {
        to: z.string().describe("Comma separated"),
        subject: z.string(),
        body: z.string(),
        cc: z.string().optional(),
        bcc: z.string().optional(),
      },
      annotations: WRITE,
    }, async ({ to, subject, body, cc, bcc }) => {
      guard("gmail", true)
      // A header containing CR or LF lets a caller inject extra headers, so it
      // is rejected rather than escaped.
      for (const [k, v] of Object.entries({ to, subject, cc, bcc })) {
        if (v && /[\r\n]/.test(v)) throw new Error(`The ${k} field cannot contain a line break.`)
      }
      const lines = [`To: ${to}`]
      if (cc) lines.push(`Cc: ${cc}`)
      if (bcc) lines.push(`Bcc: ${bcc}`)
      lines.push(`Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", body)
      const raw = Buffer.from(lines.join("\r\n")).toString("base64url")
      return json(await gws({ service: "gmail", path: ["users", "drafts", "create"], params: { userId: "me" }, body: { message: { raw } } }))
    })

    server.registerTool("gmail_send_draft", {
      description: "Send a draft that already exists. Separate from creating one on purpose: an agent drafts, a person sends. Cannot be undone.",
      inputSchema: { draftId: z.string(), confirm: CONFIRM },
      annotations: DESTRUCTIVE,
    }, async ({ draftId, confirm }) => {
      guard("gmail", true)
      if (!confirm) throw new Error("Sending email cannot be undone. Set confirm: true to send.")
      return json(await gws({ service: "gmail", path: ["users", "drafts", "send"], params: { userId: "me" }, body: { id: draftId } }))
    })

    server.registerTool("gmail_modify_labels", {
      description: "Add or remove labels on a message. Use this to archive (remove INBOX), mark read (remove UNREAD) or triage.",
      inputSchema: { id: z.string(), add: z.array(z.string()).default([]), remove: z.array(z.string()).default([]) },
      annotations: WRITE,
    }, async ({ id, add, remove }) => {
      guard("gmail", true)
      return json(await gws({ service: "gmail", path: ["users", "messages", "modify"], params: { userId: "me", id }, body: { addLabelIds: add, removeLabelIds: remove } }))
    })

    server.registerTool("gmail_list_labels", {
      description: "Every label with its id. Label ids are needed by gmail_modify_labels and are not the same as their display names.",
      inputSchema: {},
      annotations: READ,
    }, async () => {
      guard("gmail")
      return json(await gws({ service: "gmail", path: ["users", "labels", "list"], params: { userId: "me" } }))
    })
  }

  // ── Drive ───────────────────────────────────────────────────────────────
  if (on("drive")) {
    server.registerTool("drive_search", {
      description: "Find files with Drive query syntax (name contains 'x', mimeType='application/pdf', modifiedTime > '2026-01-01'). Returns id, name, type and link.",
      inputSchema: { q: z.string().optional(), max: z.number().int().min(1).max(1000).default(25), orderBy: z.string().optional().describe("e.g. modifiedTime desc") },
      annotations: READ,
    }, async ({ q, max, orderBy }) => {
      guard("drive")
      return json(await gws({ service: "drive", path: ["files", "list"], params: { q, pageSize: max, orderBy, fields: "files(id,name,mimeType,modifiedTime,webViewLink,owners(emailAddress)),nextPageToken" } }))
    })

    server.registerTool("drive_get_file", {
      description: "Metadata for one file: name, type, size, owners, sharing and link.",
      inputSchema: { fileId: z.string() },
      annotations: READ,
    }, async ({ fileId }) => {
      guard("drive")
      return json(await gws({ service: "drive", path: ["files", "get"], params: { fileId, fields: "*" } }))
    })

    server.registerTool("drive_export", {
      description: "Read the CONTENT of a Google Doc, Sheet or Slide as text. drive_get_file returns metadata only, so this is the one to use when you need what is inside.",
      inputSchema: { fileId: z.string(), mimeType: z.string().default("text/plain").describe("text/plain, text/markdown, text/csv or application/pdf") },
      annotations: READ,
    }, async ({ fileId, mimeType }) => {
      guard("drive")
      return json(await gws({ service: "drive", path: ["files", "export"], params: { fileId, mimeType } }))
    })

    server.registerTool("drive_create_folder", {
      description: "Create a folder, optionally inside another.",
      inputSchema: { name: z.string(), parentId: z.string().optional() },
      annotations: WRITE,
    }, async ({ name, parentId }) => {
      guard("drive", true)
      return json(await gws({ service: "drive", path: ["files", "create"], body: { name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) } }))
    })

    server.registerTool("drive_share", {
      description: "Grant someone access to a file. Sharing is visible to the other person immediately, so check the address before calling.",
      inputSchema: { fileId: z.string(), email: z.string(), role: z.enum(["reader", "commenter", "writer"]).default("reader") },
      annotations: WRITE,
    }, async ({ fileId, email, role }) => {
      guard("drive", true)
      return json(await gws({ service: "drive", path: ["permissions", "create"], params: { fileId }, body: { type: "user", role, emailAddress: email } }))
    })

    server.registerTool("drive_trash", {
      description: "Move a file to the trash. Recoverable for 30 days, unlike a permanent delete, which this tool deliberately does not do.",
      inputSchema: { fileId: z.string(), confirm: CONFIRM },
      annotations: DESTRUCTIVE,
    }, async ({ fileId, confirm }) => {
      guard("drive", true)
      if (!confirm) throw new Error("This moves the file to the trash. Set confirm: true to proceed.")
      return json(await gws({ service: "drive", path: ["files", "update"], params: { fileId }, body: { trashed: true } }))
    })
  }

  // ── Sheets ──────────────────────────────────────────────────────────────
  if (on("sheets")) {
    server.registerTool("sheets_read", {
      description: "Read a cell range, e.g. 'Sheet1!A1:D50'. Returns rows as arrays.",
      inputSchema: { spreadsheetId: z.string(), range: z.string() },
      annotations: READ,
    }, async ({ spreadsheetId, range }) => {
      guard("sheets")
      return json(await gws({ service: "sheets", path: ["spreadsheets", "values", "get"], params: { spreadsheetId, range } }))
    })

    server.registerTool("sheets_write", {
      description: "Overwrite a range with new values. Existing cells in that range are replaced.",
      inputSchema: { spreadsheetId: z.string(), range: z.string(), values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))) },
      annotations: WRITE,
    }, async ({ spreadsheetId, range, values }) => {
      guard("sheets", true)
      return json(await gws({ service: "sheets", path: ["spreadsheets", "values", "update"], params: { spreadsheetId, range, valueInputOption: "USER_ENTERED" }, body: { values } }))
    })

    server.registerTool("sheets_append", {
      description: "Add rows to the end of a sheet without touching what is there. Prefer this over sheets_write when adding data.",
      inputSchema: { spreadsheetId: z.string(), range: z.string(), values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))) },
      annotations: WRITE,
    }, async ({ spreadsheetId, range, values }) => {
      guard("sheets", true)
      return json(await gws({ service: "sheets", path: ["spreadsheets", "values", "append"], params: { spreadsheetId, range, valueInputOption: "USER_ENTERED" }, body: { values } }))
    })

    server.registerTool("sheets_get", {
      description: "Spreadsheet structure: every sheet name, id, and dimensions. Read this before a range query so the sheet name is right.",
      inputSchema: { spreadsheetId: z.string() },
      annotations: READ,
    }, async ({ spreadsheetId }) => {
      guard("sheets")
      return json(await gws({ service: "sheets", path: ["spreadsheets", "get"], params: { spreadsheetId } }))
    })

    server.registerTool("sheets_create", {
      description: "Create a new spreadsheet and return its id.",
      inputSchema: { title: z.string() },
      annotations: WRITE,
    }, async ({ title }) => {
      guard("sheets", true)
      return json(await gws({ service: "sheets", path: ["spreadsheets", "create"], body: { properties: { title } } }))
    })
  }
  // ── Docs ────────────────────────────────────────────────────────────────
  if (on("docs")) {
    server.registerTool("docs_get", {
      description: "Read a Google Doc's full structured content. For plain prose, drive_export with text/markdown is usually easier to work with.",
      inputSchema: { documentId: z.string() },
      annotations: READ,
    }, async ({ documentId }) => {
      guard("docs")
      return json(await gws({ service: "docs", path: ["documents", "get"], params: { documentId } }))
    })

    server.registerTool("docs_create", {
      description: "Create a new Google Doc with a title, and optionally an opening body of text.",
      inputSchema: { title: z.string(), text: z.string().optional() },
      annotations: WRITE,
    }, async ({ title, text }) => {
      guard("docs", true)
      const doc = await gws({ service: "docs", path: ["documents", "create"], body: { title } }) as { documentId?: string }
      if (text && doc.documentId) {
        await gws({ service: "docs", path: ["documents", "batchUpdate"], params: { documentId: doc.documentId },
          body: { requests: [{ insertText: { location: { index: 1 }, text } }] } })
      }
      return json(doc)
    })

    server.registerTool("docs_append", {
      description: "Add text to the end of a Doc without touching what is already there.",
      inputSchema: { documentId: z.string(), text: z.string() },
      annotations: WRITE,
    }, async ({ documentId, text }) => {
      guard("docs", true)
      return json(await gws({ service: "docs", path: ["documents", "batchUpdate"], params: { documentId },
        body: { requests: [{ insertText: { endOfSegmentLocation: {}, text } }] } }))
    })
  }

  // ── Calendar ────────────────────────────────────────────────────────────
  if (on("calendar")) {
    server.registerTool("calendar_list_events", {
      description: "Events in a window. Times are RFC3339, e.g. 2026-09-01T00:00:00Z. Defaults to the primary calendar.",
      inputSchema: {
        timeMin: z.string().describe("RFC3339"), timeMax: z.string().describe("RFC3339"),
        calendarId: z.string().default("primary"), max: z.number().int().min(1).max(250).default(50),
        q: z.string().optional().describe("Free text search across the events"),
      },
      annotations: READ,
    }, async ({ timeMin, timeMax, calendarId, max, q }) => {
      guard("calendar")
      return json(await gws({ service: "calendar", path: ["events", "list"],
        params: { calendarId, timeMin, timeMax, maxResults: max, singleEvents: true, orderBy: "startTime", q } }))
    })

    server.registerTool("calendar_create_event", {
      description: "Create an event. Adding attendees emails them immediately, so confirm the list before calling with any.",
      inputSchema: {
        summary: z.string(), start: z.string().describe("RFC3339"), end: z.string().describe("RFC3339"),
        calendarId: z.string().default("primary"), description: z.string().optional(),
        location: z.string().optional(), attendees: z.array(z.string()).optional(),
      },
      annotations: WRITE,
    }, async ({ summary, start, end, calendarId, description, location, attendees }) => {
      guard("calendar", true)
      return json(await gws({ service: "calendar", path: ["events", "insert"], params: { calendarId },
        body: { summary, description, location, start: { dateTime: start }, end: { dateTime: end },
          ...(attendees ? { attendees: attendees.map((email) => ({ email })) } : {}) } }))
    })

    server.registerTool("calendar_update_event", {
      description: "Change an existing event. Only the fields you pass are altered.",
      inputSchema: {
        eventId: z.string(), calendarId: z.string().default("primary"),
        summary: z.string().optional(), start: z.string().optional(), end: z.string().optional(),
        description: z.string().optional(), location: z.string().optional(),
      },
      annotations: WRITE,
    }, async ({ eventId, calendarId, summary, start, end, description, location }) => {
      guard("calendar", true)
      const body: Record<string, unknown> = {}
      if (summary) body.summary = summary
      if (description) body.description = description
      if (location) body.location = location
      if (start) body.start = { dateTime: start }
      if (end) body.end = { dateTime: end }
      return json(await gws({ service: "calendar", path: ["events", "patch"], params: { calendarId, eventId }, body }))
    })

    server.registerTool("calendar_delete_event", {
      description: "Delete an event. Attendees are notified that it was cancelled, and it cannot be undone.",
      inputSchema: { eventId: z.string(), calendarId: z.string().default("primary"), confirm: CONFIRM },
      annotations: DESTRUCTIVE,
    }, async ({ eventId, calendarId, confirm }) => {
      guard("calendar", true)
      if (!confirm) throw new Error("Deleting an event notifies attendees and cannot be undone. Set confirm: true.")
      return json(await gws({ service: "calendar", path: ["events", "delete"], params: { calendarId, eventId } }))
    })

    server.registerTool("calendar_list_calendars", {
      description: "Every calendar this account can see, with its id. Needed before working on anything other than primary.",
      inputSchema: {},
      annotations: READ,
    }, async () => {
      guard("calendar")
      return json(await gws({ service: "calendar", path: ["calendarList", "list"] }))
    })
  }

  // ── Tasks ───────────────────────────────────────────────────────────────
  if (on("tasks")) {
    server.registerTool("tasks_lists", {
      description: "Every task list with its id.",
      inputSchema: {},
      annotations: READ,
    }, async () => {
      guard("tasks")
      return json(await gws({ service: "tasks", path: ["tasklists", "list"] }))
    })

    server.registerTool("tasks_list", {
      description: "Tasks in a list. Completed ones are hidden unless you ask for them.",
      inputSchema: { tasklist: z.string(), showCompleted: z.boolean().default(false), max: z.number().int().min(1).max(100).default(100) },
      annotations: READ,
    }, async ({ tasklist, showCompleted, max }) => {
      guard("tasks")
      return json(await gws({ service: "tasks", path: ["tasks", "list"], params: { tasklist, showCompleted, maxResults: max } }))
    })

    server.registerTool("tasks_create", {
      description: "Add a task. `due` is RFC3339 and Google ignores the time part, only the date.",
      inputSchema: { tasklist: z.string(), title: z.string(), notes: z.string().optional(), due: z.string().optional() },
      annotations: WRITE,
    }, async ({ tasklist, title, notes, due }) => {
      guard("tasks", true)
      return json(await gws({ service: "tasks", path: ["tasks", "insert"], params: { tasklist }, body: { title, notes, due } }))
    })

    server.registerTool("tasks_complete", {
      description: "Mark a task done.",
      inputSchema: { tasklist: z.string(), task: z.string() },
      annotations: WRITE,
    }, async ({ tasklist, task }) => {
      guard("tasks", true)
      return json(await gws({ service: "tasks", path: ["tasks", "patch"], params: { tasklist, task }, body: { status: "completed" } }))
    })
  }

  // ── Slides, Forms, Contacts ─────────────────────────────────────────────
  if (on("slides")) {
    server.registerTool("slides_get", {
      description: "A presentation's structure and the text on every slide.",
      inputSchema: { presentationId: z.string() },
      annotations: READ,
    }, async ({ presentationId }) => {
      guard("slides")
      return json(await gws({ service: "slides", path: ["presentations", "get"], params: { presentationId } }))
    })

    server.registerTool("slides_create", {
      description: "Create an empty presentation and return its id.",
      inputSchema: { title: z.string() },
      annotations: WRITE,
    }, async ({ title }) => {
      guard("slides", true)
      return json(await gws({ service: "slides", path: ["presentations", "create"], body: { title } }))
    })
  }

  if (on("forms")) {
    server.registerTool("forms_get", {
      description: "A form's questions and settings.",
      inputSchema: { formId: z.string() },
      annotations: READ,
    }, async ({ formId }) => {
      guard("forms")
      return json(await gws({ service: "forms", path: ["forms", "get"], params: { formId } }))
    })

    server.registerTool("forms_responses", {
      description: "Every response to a form.",
      inputSchema: { formId: z.string() },
      annotations: READ,
    }, async ({ formId }) => {
      guard("forms")
      return json(await gws({ service: "forms", path: ["forms", "responses", "list"], params: { formId } }))
    })
  }

  if (on("people")) {
    server.registerTool("contacts_search", {
      description: "Search your own contacts by name, email or company.",
      inputSchema: { query: z.string(), max: z.number().int().min(1).max(30).default(20) },
      annotations: READ,
    }, async ({ query, max }) => {
      guard("people")
      return json(await gws({ service: "people", path: ["people", "searchContacts"],
        params: { query, pageSize: max, readMask: "names,emailAddresses,organizations,phoneNumbers" } }))
    })

    server.registerTool("contacts_list", {
      description: "All your contacts, paged.",
      inputSchema: { max: z.number().int().min(1).max(1000).default(200) },
      annotations: READ,
    }, async ({ max }) => {
      guard("people")
      return json(await gws({ service: "people", path: ["people", "connections", "list"],
        params: { resourceName: "people/me", pageSize: max, personFields: "names,emailAddresses,organizations" } }))
    })
  }

  // ── The escape hatch ────────────────────────────────────────────────────
  server.registerTool("workspace_raw", {
    description:
      "Call any Google Workspace API method the curated tools do not cover. The CLI is generated from Google's discovery service, so this reaches roughly 400 methods across drive, gmail, sheets, docs, slides, calendar, tasks, people, chat, forms, keep, meet, script and admin-reports. Use workspace_schema first to learn the exact shape.",
    inputSchema: {
      service: z.string().describe("e.g. drive, gmail, sheets, calendar, script"),
      path: z.array(z.string()).min(1).describe('Resource and method, e.g. ["files","list"] or ["users","messages","list"]'),
      params: z.record(z.string(), z.unknown()).optional().describe("Query parameters"),
      body: z.record(z.string(), z.unknown()).optional().describe("Request body for POST/PATCH/PUT"),
      pageAll: z.boolean().default(false).describe("Follow pagination. Off by default because it multiplies API cost."),
      confirm: z.boolean().default(false).describe("Required when the method is a delete."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async ({ service, path, params, body, pageAll, confirm }) => {
    const destructive = path.some((p) => /^(delete|remove|trash|clear)$/i.test(p))
    guard(service, destructive || !!body)
    if (destructive && !confirm) {
      throw new Error(`${service} ${path.join(" ")} looks like a delete. Set confirm: true if that is intended.`)
    }
    return json(await gws({ service, path, params, body, pageAll }))
  })

  server.registerTool("workspace_schema", {
    description: "The exact parameters and request body a method expects, straight from Google's discovery service. Read this before workspace_raw rather than guessing field names.",
    inputSchema: { method: z.string().describe('Dotted, e.g. "drive.files.list" or "gmail.users.messages.send"') },
    annotations: READ,
  }, async ({ method }) => {
    return json(await gws({ service: "schema", path: [method] }))
  })

  return server
}
