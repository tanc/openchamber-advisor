/**
 * Advisor notes — an OpenChamber rail panel.
 *
 * Renders the notes the opencode-advisor plugin delivered for the session that
 * is open in the chat. The plugin appends one JSONL line per delivered note to
 * `~/.cache/opencode-advisor/notes/<claimKey(directory)>.jsonl`; this panel
 * lists that directory (no sha1 reproduction — a canonicalization mismatch
 * would silently render an empty panel) and filters on the live session id.
 *
 * Notes reach the panel through the declared `filesystem` glob; the plugin's
 * install state is checked against `~/.config/opencode/opencode.json`.
 * `readFile` NOT_FOUND means "no notes yet" — the file exists only after the
 * first delivered note.
 *
 * Why listDir on the granted root works: the host's matcher gives a pattern
 * ending in `/**` a `(?:/.*)?` tail, which matches the directory itself —
 * "a guest may list the root it was granted" (packages/web/server/lib/guests/files.js,
 * globToRegExp). `~` is expanded before matching, and both sides are
 * canonicalized identically.
 */
import { connectHost } from "@openchamber/sdk"

const host = connectHost()
const NOTES_DIR = "~/.cache/opencode-advisor/notes"
const GLOBAL_CFG = "~/.config/opencode/opencode.json"

const elSession = document.querySelector<HTMLSpanElement>("#session")!
const elState = document.querySelector<HTMLDivElement>("#state")!
const elList = document.querySelector<HTMLDivElement>("#list")!

interface Entry {
  t: number
  sessionID: string
  advisor: string
  severity: string
  note: string
  instance?: string
}

let sessionId: string | null = null
let sessionTitle = ""

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })

function banner(kind: "info" | "warn" | "err", html: string): void {
  elState.className = `state ${kind === "info" ? "" : kind}`
  elState.innerHTML = html
  elState.style.display = "block"
}

function clearBanner(): void {
  elState.style.display = "none"
}

async function pluginState(): Promise<{ installed: boolean; enabled: boolean; detail: string }> {
  try {
    const { content } = await host.readFile(GLOBAL_CFG)
    const cfg = JSON.parse(content) as {
      plugins?: Array<string | { package?: string; options?: { enabled?: boolean } }>
    }
    const found = (cfg.plugins ?? []).find((p) =>
      typeof p === "string" ? p.includes("opencode-advisor") : (p.package ?? "").includes("opencode-advisor"),
    )
    if (!found) return { installed: false, enabled: false, detail: "not in the global config" }
    if (typeof found === "object" && found.options?.enabled === false)
      return { installed: true, enabled: false, detail: "registered but disabled in config" }
    return { installed: true, enabled: true, detail: "enabled" }
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === "NOT_FOUND") return { installed: false, enabled: false, detail: "no global opencode.json" }
    return { installed: false, enabled: false, detail: `unreadable (${(err as Error).message})` }
  }
}

async function loadEntries(): Promise<Entry[]> {
  const list = await host.listDir(NOTES_DIR)
  const out: Entry[] = []
  for (const file of list.entries) {
    if (!file.name.endsWith(".jsonl")) continue
    try {
      const { content } = await host.readFile(`${NOTES_DIR}/${file.name}`)
      for (const line of content.split("\n")) {
        if (line.trim() === "") continue
        try {
          out.push(JSON.parse(line) as Entry)
        } catch {
          // A torn tail line from a concurrent append: skip it, keep the rest.
        }
      }
    } catch {
      // A file that vanished between listDir and readFile: skip it.
    }
  }
  return out.sort((a, b) => b.t - a.t)
}

function paint(entries: Entry[], all: number): void {
  const mine = sessionId ? entries.filter((e) => e.sessionID === sessionId) : []
  elSession.textContent = sessionTitle || sessionId || ""

  if (mine.length === 0) {
    const across = entries.length
    elList.innerHTML =
      `<div class="empty">No notes for this session${sessionId ? "" : " (open a session)"} yet.` +
      (across > 0 ? ` ${all} delivered across other sessions on this machine.</div>` : "</div>")
    return
  }
  elList.innerHTML = mine
    .map(
      (e) =>
        `<div class="note"><div class="meta">` +
        `<span class="sev ${esc(e.severity)}">${esc(e.severity)}</span>` +
        `<span class="when">${fmtTime(e.t)}</span>` +
        `<span class="advisor">${esc(e.advisor)}${e.instance ? ` · ${esc(e.instance)}` : ""}</span>` +
        `</div><div class="text">${esc(e.note)}</div></div>`,
    )
    .join("")
}

let refreshing = false
async function refresh(): Promise<void> {
  if (refreshing) return
  refreshing = true
  try {
    const plugin = await pluginState()
    if (!plugin.installed) {
      banner(
        "warn",
        `The <b>opencode-advisor</b> plugin is ${esc(plugin.detail)}. ` +
          "Install it from <code>~/.config/opencode/opencode.json</code> — this panel reads the notes it delivers.",
      )
      elList.innerHTML = ""
      return
    }
    if (!plugin.enabled) {
      banner("warn", `The advisor plugin is <b>disabled</b> (${esc(plugin.detail)}). Run <code>/advisor on</code> in a session.`)
    } else {
      clearBanner()
    }
    let entries: Entry[]
    try {
      entries = await loadEntries()
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === "NOT_FOUND" || code === "NO_DIRECTORY") {
        banner(
          "warn",
          "No notes directory yet — the advisor writes one line per delivered note once it runs. " +
            "If the plugin is enabled and sessions have run, check that the server that reviews is the same one this app drives.",
        )
        elList.innerHTML = ""
        return
      }
      throw err
    }
    paint(entries, entries.length)
  } catch (err) {
    banner("err", `Panel error: ${esc((err as Error).message)}`)
  } finally {
    refreshing = false
  }
}

host.onSession((session) => {
  sessionId = session?.id ?? null
  sessionTitle = session?.title ?? ""
  void refresh()
})

host.onReady(async (context) => {
  sessionId = context.session?.id ?? null
  sessionTitle = context.session?.title ?? ""
  void refresh()
  setInterval(() => void refresh(), 3000)
})
