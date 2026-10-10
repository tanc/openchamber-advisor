# openchamber-advisor

An [OpenChamber](https://openchamber.dev) extension: a rail panel that shows the
notes the [opencode-advisor](https://github.com/tanc/opencode-advisor) plugin
delivered for the session you have open.

OpenChamber never renders plugin-injected synthetics in the chat timeline, so
advisor notes were previously visible only as native notifications. This panel
is the rendered surface: the plugin appends every delivered note to
`~/.cache/opencode-advisor/notes/<claimKey(directory)>.jsonl` (one JSONL line,
pruned to the last 300), and the panel reads that directory through the
extension `filesystem` grant and filters on the live session id.

## Install

Settings → Extensions → Add → folder → select this directory
(folder installs run from the folder, so edits plus a rebuild are picked up on
reload). Grant the requested filesystem paths — they are read-only.

## What it shows

- Notes for the open session, newest first, with severity chip, time, and the
  advisor instance that produced them.
- A banner when the opencode-advisor plugin is missing or disabled (checked
  against `~/.config/opencode/opencode.json`).
- "No notes yet" states — including the `NOT_FOUND` case: the per-project
  notes file exists only after the first delivered note.

## Files

| file | owns |
| --- | --- |
| `package.json` | the `openchamber` manifest (panel `advisor-notes`, `files` capability, filesystem globs) |
| `panel/index.html` | the panel page and styles |
| `panel/main.ts` | the panel source — list, filter, render |
| `panel/main.js` | the bundled IIFE the iframe runs (`bunx openchamber-guest-bundle panel/main.ts panel/main.js`) |

Rebuild after editing `main.ts`:

```bash
bunx openchamber-guest-bundle panel/main.ts panel/main.js
```
