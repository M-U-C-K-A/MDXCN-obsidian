/*
 * Content blocks: prose in a frame. Callout, Quote, Steps, Terminal,
 * Changelog, Annotate, Decision, Chat, Env, Endpoint, Keys, Faq, and the bare
 * Frame. Each reads the same Markdown children as its mdxcn twin.
 */

import { col, colWidth, wrapText } from "../ascii"
import { cx, div, el, hidden, rise, rule, span, sr } from "../dom"
import { T, tone } from "../glyphs"
import {
  bool,
  flat,
  hasBold,
  hasItalic,
  optStr,
  plain,
  splitDash,
  splitLabel,
  str,
  tokenize,
} from "../parse/inline"
import { allOf, firstOf, itemSource, listItems, toMarkdown, type Block } from "../parse/md"
import type { Common, Spec } from "../types"
import { base, entries, entryText } from "./shared"

/* ---- Callout ---------------------------------------------------------- */

type CalloutType = "note" | "tip" | "warning" | "danger"

const CALLOUT_ALIAS: Record<string, CalloutType> = {
  note: "note",
  info: "note",
  abstract: "note",
  summary: "note",
  todo: "note",
  question: "note",
  quote: "note",
  example: "note",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "tip",
  check: "tip",
  done: "tip",
  warning: "warning",
  caution: "danger",
  attention: "warning",
  danger: "danger",
  error: "danger",
  failure: "danger",
  fail: "danger",
  bug: "danger",
}

const CALLOUT_GLYPH: Record<CalloutType, string> = { note: "i", tip: "+", warning: "!", danger: "×" }

interface CalloutData extends Common {
  type: CalloutType
  body: string
}

export const callout: Spec<CalloutData> = {
  slug: "callout",
  tag: "Callout",
  name: "Callout",
  aliases: ["callout", "note", "tip", "warning", "danger", "admonition"],
  group: "content",
  summary: "An aside the reader should not skip: a caveat, a tip, a breaking change.",
  notFor: "A quote is Quote. A list of steps is Steps.",
  keywords: ["alert", "info", "caveat"],
  read({ props, body }) {
    const raw = optStr(props.type)?.toLowerCase() ?? "note"
    const type = CALLOUT_ALIAS[raw] ?? "note"
    return { ...base(props), title: optStr(props.title) ?? raw, type, body: str(props.body, body).trim() }
  },
  render(d, ctx) {
    ctx.figure.setAttr("role", "note")
    ctx.body.addClass("mdxcn-pad-tight")
    const row = rise(div(ctx.body, "mdxcn-glyph-row"))
    const glyphTone = d.type === "note" ? T.muted : d.type === "danger" ? T.danger : T.accent
    hidden(span(row, cx("mdxcn-glyph", glyphTone), CALLOUT_GLYPH[d.type]))
    ctx.prose(row, d.body, T.fg)
  },
  ascii(d) {
    const glyph = CALLOUT_GLYPH[d.type]
    const lines = d.body.split(/\n/).flatMap((line) => wrapText(line, 56))
    return lines.length === 0 ? [glyph] : lines.map((line, index) => (index === 0 ? `${glyph}  ${line}` : `   ${line}`))
  },
  template: {
    props: { type: "warning" },
    body: "The CLI copies files into `registry/default`. Edit the source — there is nothing to update later.",
  },
}

/* ---- Quote ------------------------------------------------------------ */

interface QuoteData extends Common {
  by?: string
  source?: string
  body: string
}

export const quote: Spec<QuoteData> = {
  slug: "quote",
  tag: "Quote",
  name: "Quote",
  aliases: ["quote", "blockquote", "citation"],
  group: "content",
  summary: "One sentence someone else said, with a name under it.",
  notFor: "Your own caveat is Callout.",
  read({ props, body }) {
    let text = str(props.body, body).trim()
    let by = optStr(props.by)
    let source = optStr(props.source)
    // `> … \n> — Name, Where`: the em-dash line is the citation.
    const cite = text.match(/\n\s*[—–]\s*(.+)$/)
    if (cite && !by && !source) {
      const [name, ...where] = (cite[1] ?? "").split(",")
      by = name?.trim() || undefined
      source = where.join(",").trim() || undefined
      text = text.slice(0, cite.index).trim()
    }
    return { ...base(props), by, source, body: text.replace(/^>\s?/gm, "") }
  },
  render(d, ctx) {
    const quoteEl = rise(el(ctx.body, "blockquote", "mdxcn-quote"))
    const row = div(quoteEl, "mdxcn-glyph-row")
    hidden(span(row, cx("mdxcn-glyph mdxcn-quote-mark", T.accent), "“"))
    ctx.prose(row, d.body, cx(T.fg, "mdxcn-quote-text"))
    if (d.by || d.source) {
      rule(quoteEl)
      const foot = el(quoteEl, "footer", "mdxcn-glyph-row")
      hidden(span(foot, "mdxcn-glyph", "—"))
      const who = span(foot, "mdxcn-cite")
      if (d.by) el(who, "cite", T.fg, d.by)
      if (d.source) span(who, T.muted, d.source)
    }
  },
  ascii(d) {
    const wrapped = wrapText(plain(d.body).replace(/\s+/g, " ").trim(), 54)
    const lines = wrapped.length === 0 ? ["“"] : wrapped.map((line, index) => (index === 0 ? `“  ${line}` : `   ${line}`))
    if (d.by || d.source) lines.push("", `—  ${[d.by, d.source].filter(Boolean).join("  ")}`)
    return lines
  },
  template: {
    props: { by: "Paul Graham", source: "Taste for Makers" },
    body: "A thousand barely audible voices all singing in tune.",
  },
}

/* ---- Steps ------------------------------------------------------------ */

type StepState = "done" | "now" | "next"
interface Step {
  title: string
  body?: string
  state: StepState
}
interface StepsData extends Common {
  steps: Step[]
}

function stepState(value: unknown, source = ""): StepState {
  const text = optStr(value)
  if (text === "now" || text === "next" || text === "done") return text
  if (hasBold(source)) return "now"
  if (hasItalic(source)) return "next"
  return "done"
}

export const steps: Spec<StepsData> = {
  slug: "steps",
  tag: "Steps",
  name: "Steps",
  aliases: ["steps", "procedure", "howto"],
  group: "content",
  summary: "A procedure (install, migrate, release) with one step marked now.",
  notFor: "Dated events are Timeline. A punch list with done boxes is Check.",
  items: { Step: "steps" },
  read({ props, blocks }) {
    const data = entries(props.steps)
    const steps: Step[] =
      data.length > 0
        ? data.map((entry) => ({
            title: entryText(entry, "title", "label"),
            body: optStr(entry.body) ?? (entry.title ? optStr(entry.children) : undefined),
            state: stepState(entry.state),
          }))
        : listItems(blocks).map((item) => {
            const loose = item.body.length > 0
            const head = item.head
            if (loose) {
              return { title: flat(head), body: toMarkdown(item.body), state: stepState(undefined, head) }
            }
            const { label, rest } = splitDash(flat(head))
            return { title: label, body: rest || undefined, state: stepState(undefined, head) }
          })
    return { ...base(props), steps }
  },
  render(d, ctx) {
    const list = el(ctx.body, "ol", "mdxcn-list mdxcn-steps")
    d.steps.forEach((step, index) => {
      const item = rise(el(list, "li", "mdxcn-step"), index, 60)
      const row = div(item, "mdxcn-step-row")
      const live = step.state === "now"
      const next = step.state === "next"
      hidden(span(row, cx("mdxcn-num", live ? T.accent : next ? T.frame : T.muted), String(index + 1).padStart(Math.max(2, String(d.steps.length).length), "0")))
      const main = div(row, "mdxcn-stack-2")
      if (step.title) div(main, cx("mdxcn-pretty", live ? T.accent : next ? T.muted : T.fg), step.title)
      if (step.body) ctx.prose(main, step.body, next ? T.muted : T.soft)
      if (index < d.steps.length - 1) hidden(div(item, "mdxcn-step-link", "│"))
    })
  },
  title: (d) => d.title,
  ascii(d) {
    const lines: string[] = []
    d.steps.forEach((step, index) => {
      const head = wrapText(step.title, 54)
      lines.push(`${index + 1}  ${head[0] ?? ""}`)
      head.slice(1).forEach((line) => lines.push(`   ${line}`))
      if (step.body) wrapText(plain(step.body), 54).forEach((line) => lines.push(`   ${line}`))
      if (index < d.steps.length - 1) lines.push("│")
    })
    return lines
  },
  template: {
    title: "INSTALL",
    body: "1. Copy the source\n\n   Run the shadcn CLI.\n\n2. **Register it**\n\n   Add it to the components map.\n\n3. *Write*\n\n   Use it between paragraphs.",
  },
}

/* ---- Terminal --------------------------------------------------------- */

type TermLine = { kind: "command" | "comment" | "ok" | "output"; text: string }
interface TerminalData extends Common {
  prompt: string
  lines: TermLine[]
}

function termLines(source: string, prompt: string): TermLine[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  while (lines.length > 0 && lines[0]?.trim() === "") lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop()
  return lines.map((raw) => {
    const text = raw.replace(/\s+$/, "")
    if (text.startsWith(`${prompt} `) || text === prompt) return { kind: "command", text: text.slice(prompt.length).trimStart() }
    if (text.startsWith("#")) return { kind: "comment", text }
    if (/^[✓✔√]/.test(text)) return { kind: "ok", text }
    return { kind: "output", text }
  })
}

export const terminal: Spec<TerminalData> = {
  slug: "terminal",
  tag: "Terminal",
  name: "Terminal",
  aliases: ["terminal", "shell", "console", "cli"],
  group: "content",
  summary: "A command and what it printed.",
  notFor: "Source code is a fenced code block. A file tree is Tree.",
  read({ props, blocks, body }) {
    const prompt = optStr(props.prompt) ?? "$"
    const code = firstOf(blocks, "code")
    const given = Array.isArray(props.lines) ? props.lines.map(String).join("\n") : undefined
    const source = given ?? (code ? code.text : str(props.body, body))
    return { ...base(props, "shell"), prompt, lines: termLines(source, prompt) }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-scroll-x")
    const pre = el(ctx.body, "pre", "mdxcn-pre mdxcn-term")
    d.lines.forEach((line, index) => {
      const lineTone =
        line.kind === "command" ? T.fg : line.kind === "ok" ? T.accent : T.muted
      const code = rise(el(pre, "code", cx("mdxcn-term-line", lineTone)), index, 40)
      hidden(span(code, cx("mdxcn-glyph", line.kind === "command" ? T.accent : T.clear), line.kind === "command" ? d.prompt : " "))
      span(code, undefined, line.text || " ")
    })
  },
  ascii(d) {
    return d.lines.length > 0 ? d.lines.map((line) => (line.kind === "command" ? `${d.prompt} ${line.text}` : line.text)) : [""]
  },
  template: {
    title: "SHELL",
    body: "```\n$ pnpm dlx shadcn@latest add @mdxcn/all\n✓ 51 files written\n```",
  },
}

/* ---- Changelog -------------------------------------------------------- */

type ChangeType = "add" | "change" | "fix" | "remove"
const CHANGE_GLYPH: Record<ChangeType, string> = { add: "+", change: "~", fix: "*", remove: "-" }
const CHANGE_LABEL: Record<ChangeType, string> = { add: "added", change: "changed", fix: "fixed", remove: "removed" }

function changeType(token: string): ChangeType | undefined {
  const key = token.trim().toLowerCase()
  if (["add", "added", "+", "new"].includes(key)) return "add"
  if (["change", "changed", "~", "update", "updated"].includes(key)) return "change"
  if (["fix", "fixed", "*"].includes(key)) return "fix"
  if (["remove", "removed", "-", "delete", "deleted"].includes(key)) return "remove"
  return undefined
}

interface ChangelogData extends Common {
  version: string
  date?: string
  heading?: string
  items: { type: ChangeType; text: string }[]
}

export const changelog: Spec<ChangelogData> = {
  slug: "changelog",
  tag: "Changelog",
  name: "Changelog",
  aliases: ["changelog", "release", "changes"],
  group: "content",
  summary: "One release: what was added, changed, fixed, removed.",
  notFor: "Bundle or headcount deltas with numbers are Diff.",
  items: { Change: "items" },
  read({ props, blocks }) {
    const data = entries(props.items)
    const items =
      data.length > 0
        ? data.map((entry) => ({ type: changeType(str(entry.type)) ?? "change", text: entryText(entry, "text", "label") }))
        : listItems(blocks).map((item) => {
            const source = itemSource(item)
            const { label, rest } = splitLabel(source)
            const type = changeType(plain(label))
            return { type: type ?? "change", text: type ? rest : source }
          })
    const version = str(props.version)
    return { ...base(props), heading: optStr(props.title), title: optStr(props.title) ?? (version || "changelog"), version, date: optStr(props.date), items }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-4")
    if (d.date || d.heading) {
      const head = div(ctx.body, "mdxcn-split")
      span(head, cx(T.fg, "mdxcn-num"), d.heading ? d.version : "")
      if (d.date) span(head, cx(T.muted, "mdxcn-num"), d.date)
      rule(ctx.body)
    }
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-2")
    d.items.forEach((item, index) => {
      const row = rise(el(list, "li", "mdxcn-change"), index)
      const itemTone = item.type === "add" ? tone(ctx.palette, "primary") : item.type === "remove" ? tone(ctx.palette, "secondary") : T.fg
      hidden(span(row, cx("mdxcn-glyph", itemTone), CHANGE_GLYPH[item.type]))
      span(row, cx(T.muted, "mdxcn-change-kind"), CHANGE_LABEL[item.type])
      ctx.prose(row, item.text, item.type === "remove" ? T.muted : T.fg)
    })
  },
  ascii(d) {
    const kinds = colWidth(d.items.map((item) => CHANGE_LABEL[item.type]))
    const drawn: string[] = []
    if (d.version || d.date) drawn.push([d.version, d.date].filter(Boolean).join("  "), "")
    for (const item of d.items) {
      const wrapped = wrapText(plain(item.text), 48)
      drawn.push(`${CHANGE_GLYPH[item.type]}  ${col(CHANGE_LABEL[item.type], kinds)}  ${wrapped[0] ?? ""}`)
      wrapped.slice(1).forEach((line) => drawn.push(`      ${" ".repeat(kinds)}${line}`))
    }
    return drawn
  },
  template: {
    props: { version: "1.3.0", date: "Oct 02" },
    body: "- added: Board, Score, Chat, Env, Endpoint, Keys, FAQ\n- changed: Every graph reads Markdown children\n- fixed: Overridden tags in mdx-components",
  },
}

/* ---- Annotate --------------------------------------------------------- */

const MARKER = /\s*(?:\/\/|#|--|;|%|\/\*|<!--|\{\/\*)\s*\((\d{1,2})\)\s*(?:\*\/\}|\*\/|-->)?\s*$/

interface AnnotateData extends Common {
  lines: { text: string; mark?: number }[]
  notes: string[]
}

export const annotate: Spec<AnnotateData> = {
  slug: "annotate",
  tag: "Annotate",
  name: "Annotate",
  aliases: ["annotate", "annotated", "code-notes"],
  group: "content",
  summary: "A code sample where a few lines need explaining.",
  notFor: "A shell session is Terminal. Code with nothing to explain is a plain fence.",
  read({ props, blocks }) {
    const code = firstOf(blocks, "code")
    const source = optStr(props.code) ?? code?.text ?? ""
    const given = Array.isArray(props.lines) ? entries(props.lines) : []
    const lines =
      given.length > 0
        ? given.map((line) => ({ text: str(line.text), mark: line.mark == null ? undefined : Number(line.mark) }))
        : source
            .replace(/\r\n?/g, "\n")
            .replace(/\n+$/, "")
            .split("\n")
            .map((line) => {
              const match = line.match(MARKER)
              if (!match || match.index == null) return { text: line }
              return { text: line.slice(0, match.index), mark: Number(match[1]) }
            })
    const givenNotes = Array.isArray(props.notes) ? props.notes.map((note) => str(note)) : undefined
    const notes = givenNotes ?? listItems(blocks).map((item) => (item.body.length > 0 ? `${item.head}\n\n${toMarkdown(item.body)}` : item.head))
    return { ...base(props), title: optStr(props.title) ?? (code?.lang || "code"), lines, notes }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-5")
    const marked = new Set(d.lines.flatMap((line) => (line.mark ? [line.mark] : [])))
    const width = Math.max(1, ...[...marked, d.notes.length].map((n) => String(n).length))
    const tag = (index: number) => `[${String(index).padStart(width, " ")}]`
    const accent = tone(ctx.palette, "primary")
    const wrap = rise(div(ctx.body, "mdxcn-scroll-x"))
    const pre = el(wrap, "pre", "mdxcn-pre")
    for (const line of d.lines) {
      const code = el(pre, "code", cx("mdxcn-annotate-line", line.mark ? T.fg : T.muted))
      hidden(span(code, cx("mdxcn-num", line.mark ? accent : T.clear), line.mark ? tag(line.mark) : " "))
      span(code, undefined, line.text || " ")
    }
    if (d.notes.length > 0) {
      rule(ctx.body)
      const list = el(ctx.body, "ol", "mdxcn-list mdxcn-stack-3")
      d.notes.forEach((note, index) => {
        const row = rise(el(list, "li", "mdxcn-annotate-note"), index)
        hidden(span(row, cx("mdxcn-num", marked.has(index + 1) ? accent : T.muted), tag(index + 1)))
        ctx.prose(row, note, T.fg)
      })
    }
  },
  ascii(d) {
    const width = String(Math.max(1, d.notes.length, ...d.lines.map((line) => line.mark ?? 0))).length
    const tag = (index: number) => `[${String(index).padStart(width, " ")}]`
    const blank = " ".repeat(width + 2)
    const drawn = d.lines.map((line) => `${line.mark ? tag(line.mark) : blank}  ${line.text}`.trimEnd())
    if (d.notes.length > 0) {
      drawn.push("")
      d.notes.forEach((note, index) => {
        wrapText(plain(note), 52).forEach((line, at) => drawn.push(`${at === 0 ? tag(index + 1) : blank}  ${line}`))
      })
    }
    return drawn
  },
  template: {
    title: "retry.py",
    body: "```python\ndef fetch(url, times=3):  # (1)\n    for attempt in range(times):\n        try:\n            return get(url)\n        except TimeoutError:  # (2)\n            sleep(2 ** attempt)\n```\n\n1. Three tries.\n2. Only timeouts retry.",
  },
}

/* ---- Decision --------------------------------------------------------- */

type OptionState = "chosen" | "open" | "rejected"
const OPTION_GLYPH: Record<OptionState, string> = { chosen: "●", open: "○", rejected: "×" }

interface DecisionData extends Common {
  status?: string
  date?: string
  options: { label: string; reason?: string; state: OptionState }[]
  after: string
}

function optionState(value: unknown): OptionState | undefined {
  const text = optStr(value)
  return text === "chosen" || text === "open" || text === "rejected" ? text : undefined
}

export const decision: Spec<DecisionData> = {
  slug: "decision",
  tag: "Decision",
  name: "Decision",
  aliases: ["decision", "adr", "tradeoff"],
  group: "content",
  summary: "An ADR or a tradeoff: what you picked, what you didn't, and why.",
  notFor: "Features across plans are Compare. Ratings are Score.",
  read({ props, blocks }) {
    const data = entries(props.options)
    const options =
      data.length > 0
        ? data.map((entry) => ({ label: entryText(entry, "label"), reason: optStr(entry.reason), state: optionState(entry.state) ?? "open" }))
        : listItems(blocks).map((item) => {
            const source = itemSource(item)
            const { label, rest } = splitDash(flat(source))
            const chosen = hasBold(source)
            const rejected = !chosen && hasItalic(source)
            return { label, reason: rest || undefined, state: (chosen ? "chosen" : rejected ? "rejected" : "open") as OptionState }
          })
    const after = optStr(props.body) ?? toMarkdown(blocks.filter((block) => block.type !== "list"))
    return { ...base(props, "decision"), status: optStr(props.status), date: optStr(props.date), options, after }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-4")
    if (d.status || d.date) {
      const head = div(ctx.body, "mdxcn-split")
      span(head, T.fg, d.status ?? "")
      if (d.date) span(head, cx(T.muted, "mdxcn-num"), d.date)
      rule(ctx.body)
    }
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-2")
    d.options.forEach((option, index) => {
      const optionTone = option.state === "chosen" ? tone(ctx.palette, "primary") : option.state === "rejected" ? tone(ctx.palette, "secondary") : T.fg
      const row = rise(el(list, "li", "mdxcn-decision"), index)
      hidden(span(row, cx("mdxcn-glyph", option.state === "open" ? T.muted : optionTone), OPTION_GLYPH[option.state]))
      span(row, optionTone, option.label)
      if (option.reason) span(row, cx(T.muted, "mdxcn-decision-reason"), option.reason)
    })
    if (d.after.trim()) {
      rule(ctx.body)
      ctx.prose(rise(div(ctx.body)), d.after, T.soft)
    }
    const chosen = d.options.find((option) => option.state === "chosen")
    if (chosen) sr(ctx.body, `Chose ${chosen.label} over ${d.options.length - 1} other options.`)
  },
  ascii(d) {
    const labels = colWidth(d.options.map((option) => option.label))
    const drawn: string[] = []
    if (d.status || d.date) drawn.push([d.status, d.date].filter(Boolean).join("  "), "")
    for (const option of d.options) {
      drawn.push(`${OPTION_GLYPH[option.state]}  ${col(option.label, labels)}${option.reason ? `  ${option.reason}` : ""}`.trimEnd())
    }
    if (d.after.trim()) {
      drawn.push("")
      d.after.split(/\n+/).forEach((paragraph) => drawn.push(...wrapText(plain(paragraph), 56)))
    }
    return drawn
  },
  template: {
    title: "DATABASE",
    props: { status: "accepted", date: "Mar 12" },
    body: "- **Postgres** — we already run it\n- *Mongo* — no joins we trust\n- SQLite — fine until the second writer\n\nRevisit if writes pass 2k a second.",
  },
}

/* ---- Chat ------------------------------------------------------------- */

const SPEAKER = /^\s*([^:\n]{1,24}):\s*/

interface ChatData extends Common {
  you?: string
  prompt: string
  turns: { by: string; text: string; aside: boolean }[]
}

export const chat: Spec<ChatData> = {
  slug: "chat",
  tag: "Chat",
  name: "Chat",
  aliases: ["chat", "conversation", "dialog", "session"],
  group: "content",
  summary: "An agent session, a support thread, or an interview excerpt.",
  notFor: "One line someone said is Quote. Commands and output are Terminal.",
  read({ props, blocks }) {
    const data = entries(props.turns)
    const turns =
      data.length > 0
        ? data.map((entry) => ({ by: str(entry.by), text: entryText(entry, "text"), aside: bool(entry.aside) }))
        : listItems(blocks).flatMap((item) => {
            const match = item.head.match(SPEAKER)
            if (!match) return []
            const rest = item.head.slice(match[0].length)
            const tokens = tokenize(rest).filter((token) => !(token.kind === "text" && token.text.trim() === ""))
            const aside = item.body.length === 0 && tokens.length === 1 && tokens[0]?.kind === "em"
            const text = item.body.length > 0 ? `${rest}\n\n${toMarkdown(item.body)}` : rest
            return [{ by: plain(match[1] ?? "").trim(), text, aside }]
          })
    return { ...base(props, "chat"), you: optStr(props.you), prompt: optStr(props.prompt) ?? ">", turns }
  },
  render(d, ctx) {
    const asker = (d.you ?? d.turns[0]?.by ?? "").toLowerCase()
    const list = el(ctx.body, "ol", "mdxcn-list mdxcn-chat")
    d.turns.forEach((turn, index) => {
      const mine = turn.by.toLowerCase() === asker
      const same = index > 0 && d.turns[index - 1]?.by === turn.by
      const row = rise(el(list, "li", cx("mdxcn-chat-turn", index > 0 && (same ? "is-same" : "is-new"))), index, 60)
      hidden(span(row, cx("mdxcn-glyph", mine && !same ? tone(ctx.palette, "primary") : T.clear), mine && !same ? d.prompt : " "))
      const who = span(row, cx("mdxcn-truncate", T.muted, same && "mdxcn-chat-same"))
      if (same) sr(who, turn.by)
      else who.setText(turn.by)
      ctx.prose(row, turn.text, turn.aside ? T.muted : T.fg)
    })
  },
  ascii(d) {
    const asker = (d.you ?? d.turns[0]?.by ?? "").toLowerCase()
    const names = colWidth(d.turns.map((turn) => turn.by))
    const drawn: string[] = []
    d.turns.forEach((turn, index) => {
      const same = index > 0 && d.turns[index - 1]?.by === turn.by
      if (index > 0 && !same) drawn.push("")
      const mine = turn.by.toLowerCase() === asker
      const mark = mine && !same ? d.prompt : " ".repeat(d.prompt.length)
      const name = same ? "" : turn.by
      wrapText(plain(turn.text), 44).forEach((line, at) =>
        drawn.push(at === 0 ? `${mark}  ${col(name, names)}  ${line}` : `${" ".repeat(d.prompt.length)}  ${" ".repeat(names)}  ${line}`)
      )
    })
    return drawn
  },
  template: {
    title: "SESSION",
    body: "- you: which graph shows a rollback?\n- agent: Timeline. Bold the rollback row.\n- you: and on GitHub?\n- agent: Paste the fenced ASCII.",
  },
}

/* ---- Env -------------------------------------------------------------- */

const REQUIRED = /\(?\brequired\b\)?[.:]?/i

interface EnvVar {
  name: string
  value?: string
  note?: string
  required: boolean
}
interface EnvData extends Common {
  vars: EnvVar[]
}

function envFromFence(source: string): EnvVar[] {
  const vars: EnvVar[] = []
  let notes: string[] = []
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim()
    if (line === "") {
      notes = []
      continue
    }
    if (line.startsWith("#")) {
      notes.push(line.replace(/^#+\s*/, ""))
      continue
    }
    const match = line.match(/^(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*)$/)
    if (!match) continue
    const [value = "", inline = ""] = (match[2] ?? "").split(/\s+#\s*/)
    const all = [...notes, inline].filter(Boolean)
    const required = all.some((note) => REQUIRED.test(note))
    const note = all
      .map((entry) => entry.replace(REQUIRED, "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ")
    vars.push({ name: match[1] ?? "", value: value.trim().replace(/^(['"])([\s\S]*)\1$/, "$2"), note: note || undefined, required })
    notes = []
  }
  return vars
}

export const env: Spec<EnvData> = {
  slug: "env",
  tag: "Env",
  name: "Env",
  aliases: ["env", "dotenv", ".env", "variables"],
  group: "content",
  summary: "The variables a project needs, which are required, and what they do.",
  notFor: "Label/value rows that are not variables are Spec.",
  read({ props, blocks, body }) {
    const data = entries(props.vars)
    let vars: EnvVar[]
    if (data.length > 0) {
      vars = data.map((entry) => ({ name: str(entry.name), value: optStr(entry.value), note: optStr(entry.note), required: bool(entry.required) }))
    } else {
      const code = firstOf(blocks, "code")
      const listed = listItems(blocks).map((item) => {
        const source = itemSource(item)
        const { label, rest } = splitLabel(flat(source))
        const { label: value, rest: note } = splitDash(rest)
        return { name: label, value, note: note || undefined, required: hasBold(source) }
      })
      vars = code ? envFromFence(code.text) : listed.length > 0 ? listed : envFromFence(body)
    }
    return { ...base(props, ".env"), vars }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-4")
    const accent = tone(ctx.palette, "primary")
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-3")
    d.vars.forEach((entry, index) => {
      const row = rise(el(list, "li", "mdxcn-env"), index, 40)
      hidden(span(row, cx("mdxcn-glyph", entry.required ? accent : T.clear), entry.required ? "*" : " "))
      const name = span(row, cx("mdxcn-truncate", T.fg), entry.name)
      if (entry.required) sr(name, " (required)")
      span(row, cx("mdxcn-env-value", entry.value ? T.muted : T.frame), entry.value || "—")
      if (entry.note) span(row, cx("mdxcn-env-note", T.muted), entry.note)
    })
    if (d.vars.some((entry) => entry.required)) {
      const legend = hidden(el(ctx.body, "p", T.muted))
      span(legend, accent, "*")
      legend.appendText(" required")
    }
  },
  ascii(d) {
    const names = colWidth(d.vars.map((entry) => entry.name))
    const spaced = d.vars.some((entry) => entry.note)
    const drawn: string[] = []
    d.vars.forEach((entry, index) => {
      if (spaced && index > 0) drawn.push("")
      drawn.push(`${entry.required ? "*" : " "}  ${col(entry.name, names)}  ${entry.value || "—"}`)
      if (entry.note) wrapText(entry.note, 52).forEach((line) => drawn.push(`   ${line}`))
    })
    if (d.vars.some((entry) => entry.required)) drawn.push("", "* required")
    return drawn
  },
  template: {
    body: "```bash\n# Postgres connection string. Required.\nDATABASE_URL=postgres://localhost:5432/app\n\n# Leave empty to turn analytics off\nANALYTICS_ID=\n```",
  },
}

/* ---- Endpoint --------------------------------------------------------- */

const ROUTE = /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|QUERY)\s+(\S+)\s*$/i

interface EndpointData extends Common {
  method: string
  path: string
  about: string
  params: { name: string; type?: string; description?: string; required: boolean }[]
  blocks: { label?: string; code: string }[]
}

export const endpoint: Spec<EndpointData> = {
  slug: "endpoint",
  tag: "Endpoint",
  name: "Endpoint",
  aliases: ["endpoint", "api", "route"],
  group: "content",
  summary: "One API route: method, path, params, a response.",
  notFor: "Many routes in one place are Sheet. A shell session is Terminal.",
  read({ props, blocks }) {
    const paragraphs = allOf(blocks, "p")
    const route = paragraphs.map((paragraph) => flat(paragraph.text).match(ROUTE)).find(Boolean)
    const table = firstOf(blocks, "table")
    const dataParams = entries(props.params)
    const params =
      dataParams.length > 0
        ? dataParams.map((entry) => ({ name: str(entry.name), type: optStr(entry.type), description: optStr(entry.description), required: bool(entry.required) }))
        : (table?.rows ?? []).map((row) => ({
            name: flat(row[0] ?? ""),
            type: flat(row[1] ?? "") || undefined,
            description: row[2] || undefined,
            required: hasBold(row[0] ?? ""),
          }))
    const dataBlocks = entries(props.blocks)
    const codeBlocks =
      dataBlocks.length > 0
        ? dataBlocks.map((entry) => ({ label: optStr(entry.label), code: str(entry.code) }))
        : allOf(blocks, "code").map((code) => ({
            label: /^\s*(\$ |curl\b)/.test(code.text) ? "request" : code.lang || undefined,
            code: code.text.replace(/\n$/, ""),
          }))
    return {
      ...base(props, "endpoint"),
      method: (optStr(props.method) ?? route?.[1] ?? "GET").toUpperCase(),
      path: optStr(props.path) ?? route?.[2] ?? "/",
      about: optStr(props.about) ?? paragraphs.filter((paragraph) => !ROUTE.test(flat(paragraph.text))).map((paragraph) => paragraph.text).join("\n\n"),
      params,
      blocks: codeBlocks,
    }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-4")
    const accent = tone(ctx.palette, "primary")
    const head = rise(div(ctx.body, "mdxcn-stack-3"))
    const line = el(head, "p", "mdxcn-route")
    span(line, accent, d.method)
    span(line, cx(T.fg, "mdxcn-break"), d.path)
    if (d.about.trim()) ctx.prose(head, d.about, T.muted)
    if (d.params.length > 0) {
      rule(ctx.body)
      const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-2")
      d.params.forEach((param, index) => {
        const row = rise(el(list, "li", "mdxcn-param"), index, 40)
        hidden(span(row, cx("mdxcn-glyph", param.required ? accent : T.clear), param.required ? "*" : " "))
        const name = span(row, cx("mdxcn-truncate", T.fg), param.name)
        if (param.required) sr(name, " (required)")
        span(row, cx("mdxcn-truncate", T.muted), param.type ?? "")
        if (param.description) ctx.prose(span(row, "mdxcn-param-about"), param.description, T.soft)
      })
      if (d.params.some((param) => param.required)) {
        const legend = hidden(el(ctx.body, "p", T.muted))
        span(legend, accent, "*")
        legend.appendText(" required")
      }
    }
    d.blocks.forEach((block, index) => {
      const wrap = rise(div(ctx.body, "mdxcn-stack-3"), index + 1)
      rule(wrap)
      if (block.label) el(wrap, "p", T.muted, block.label)
      const scroll = div(wrap, "mdxcn-scroll-x")
      el(el(scroll, "pre", cx("mdxcn-pre", T.soft)), "code", undefined, block.code)
    })
  },
  ascii(d) {
    const drawn = [`${d.method.toUpperCase()}  ${d.path}`]
    if (d.about.trim()) drawn.push(...wrapText(plain(d.about), 56))
    if (d.params.length > 0) {
      const names = colWidth(d.params.map((param) => param.name))
      const types = colWidth(d.params.map((param) => param.type ?? ""))
      drawn.push("")
      for (const param of d.params) {
        drawn.push(`${param.required ? "*" : " "}  ${col(param.name, names)}  ${col(param.type ?? "", types)}  ${plain(param.description ?? "")}`.trimEnd())
      }
    }
    for (const block of d.blocks) {
      drawn.push("")
      if (block.label) drawn.push(block.label)
      drawn.push(...block.code.split("\n"))
    }
    return drawn
  },
  template: {
    body: "GET /api/v1/components/:slug\n\nOne component from the catalog.\n\n| Param | Type | |\n| --- | --- | --- |\n| **slug** | string | Registry slug |",
  },
}

/* ---- Keys ------------------------------------------------------------- */

const MODIFIERS = new Set(["⌘", "⌥", "⇧", "⌃", "⎋", "↵", "⌫", "⇥"])

function chordsOf(keys: string): string[][] {
  return keys
    .split(/\s+then\s+/i)
    .map((chord) =>
      chord
        .split(/\s*\+\s*|\s+/)
        .filter(Boolean)
        .flatMap((token) => {
          const glyphs = [...token]
          const lead = glyphs.findIndex((glyph) => !MODIFIERS.has(glyph))
          if (lead <= 0) return lead === -1 ? glyphs : [token]
          return [...glyphs.slice(0, lead), glyphs.slice(lead).join("")]
        })
    )
    .filter((chord) => chord.length > 0)
}

interface KeysData extends Common {
  bindings: { keys: string; action: string; accent: boolean }[]
}

export const keys: Spec<KeysData> = {
  slug: "keys",
  tag: "Keys",
  name: "Keys",
  aliases: ["keys", "shortcuts", "keyboard", "hotkeys"],
  group: "content",
  summary: "Keyboard shortcuts, a cheat sheet, or a key combo in a tutorial.",
  notFor: "Label/value rows are Spec.",
  read({ props, blocks }) {
    const data = entries(props.bindings)
    const bindings =
      data.length > 0
        ? data.map((entry) => ({ keys: str(entry.keys), action: entryText(entry, "action"), accent: bool(entry.accent) }))
        : listItems(blocks).map((item) => {
            const source = itemSource(item)
            const { label, rest } = splitLabel(flat(source))
            return { keys: label, action: rest, accent: hasBold(source) }
          })
    return { ...base(props, "keys"), bindings }
  },
  render(d, ctx) {
    const list = el(ctx.body, "dl", "mdxcn-stack-3")
    d.bindings.forEach((binding, index) => {
      const bindingTone = binding.accent ? tone(ctx.palette, "primary") : T.fg
      const row = rise(div(list, "mdxcn-keys"), index, 40)
      const dt = el(row, "dt", "mdxcn-chords")
      sr(dt, binding.keys)
      chordsOf(binding.keys).forEach((chord, chordIndex) => {
        const group = hidden(span(dt, "mdxcn-chord"))
        if (chordIndex > 0) span(group, T.muted, "then")
        const caps = span(group, "mdxcn-caps")
        for (const key of chord) {
          const cap = span(caps, "mdxcn-cap")
          span(cap, T.frame, "[")
          span(cap, bindingTone, key)
          span(cap, T.frame, "]")
        }
      })
      el(row, "dd", bindingTone, binding.action)
    })
  },
  ascii(d) {
    const caps = d.bindings.map((binding) =>
      chordsOf(binding.keys)
        .map((chord) => chord.map((key) => `[${key}]`).join(""))
        .join(" then ")
    )
    const width = colWidth(caps)
    return d.bindings.map((binding, index) => `${col(caps[index] ?? "", width)}  ${binding.action}`)
  },
  template: {
    title: "SHORTCUTS",
    body: "- **⌘K: search the docs**\n- Ctrl+Shift+P: command palette\n- g then d: go to docs",
  },
}

/* ---- Faq -------------------------------------------------------------- */

interface FaqData extends Common {
  entries: { question: string; answer?: string; accent: boolean }[]
}

export const faq: Spec<FaqData> = {
  slug: "faq",
  tag: "Faq",
  name: "FAQ",
  aliases: ["faq", "questions", "qa"],
  group: "content",
  summary: "Questions people keep asking, with the answer under each.",
  notFor: "A procedure is Steps. One caveat is Callout.",
  read({ props, blocks }) {
    const data = entries(props.entries)
    if (data.length > 0) {
      return {
        ...base(props, "faq"),
        entries: data.map((entry) => ({ question: str(entry.question), answer: optStr(entry.answer) ?? optStr(entry.children), accent: bool(entry.accent) })),
      }
    }
    const out: { question: string; answer: Block[]; accent: boolean }[] = []
    for (const block of blocks) {
      if (block.type === "heading") {
        out.push({ question: flat(block.text), answer: [], accent: hasBold(block.text) })
        continue
      }
      out[out.length - 1]?.answer.push(block)
    }
    return {
      ...base(props, "faq"),
      entries: out.map((entry) => ({ question: entry.question, answer: entry.answer.length > 0 ? toMarkdown(entry.answer) : undefined, accent: entry.accent })),
    }
  },
  render(d, ctx) {
    const list = el(ctx.body, "ol", "mdxcn-list mdxcn-stack-4")
    d.entries.forEach((entry, index) => {
      const entryTone = entry.accent ? tone(ctx.palette, "primary") : T.fg
      const item = rise(el(list, "li", "mdxcn-stack-4"), index, 60)
      if (index > 0) rule(item)
      const row = div(item, "mdxcn-faq")
      hidden(span(row, cx("mdxcn-glyph", entry.accent ? entryTone : T.muted), "?"))
      el(row, "p", cx("mdxcn-pretty", entryTone), entry.question)
      if (entry.answer) ctx.prose(row, entry.answer, cx(T.soft, "mdxcn-faq-answer"))
    })
  },
  ascii(d) {
    const drawn: string[] = []
    d.entries.forEach((entry, index) => {
      if (index > 0) drawn.push("")
      wrapText(entry.question, 54).forEach((line, at) => drawn.push(`${at === 0 ? "?" : " "}  ${line}`))
      if (entry.answer) {
        entry.answer
          .split(/\n+/)
          .flatMap((paragraph) => wrapText(plain(paragraph), 54))
          .forEach((line) => drawn.push(`   ${line}`))
      }
    })
    return drawn
  },
  template: {
    body: "### Is this an npm package?\n\nNo. The CLI copies the source.\n\n### Does it need MDX?\n\nNo. Comark reads blocks from plain `.md`.",
  },
}

/* ---- Frame (any Markdown, framed) ----------------------------------- */

interface FrameData extends Common {
  body: string
  /** Raw lines drawn as-is (an ASCII frame nothing else recognised). */
  lines?: string[]
}

export const frame: Spec<FrameData> = {
  slug: "frame",
  tag: "Graph",
  name: "Frame",
  aliases: ["frame", "graph", "box", "card"],
  group: "layout",
  summary: "Any Markdown in the dashed frame, with a [ TITLE ].",
  notFor: "Structured data: pick the graph that reads it.",
  read({ props, body }) {
    const lines = Array.isArray(props.lines) ? props.lines.map(String) : undefined
    return { ...base(props), body: str(props.body, body), lines }
  },
  render(d, ctx) {
    if (d.lines) {
      ctx.body.addClass("mdxcn-scroll-x")
      const pre = el(ctx.body, "pre", cx("mdxcn-pre", T.fg))
      d.lines.forEach((line, index) => rise(el(pre, "code", "mdxcn-line", line || " "), index, 20))
      return
    }
    ctx.prose(rise(div(ctx.body)), d.body, T.fg)
  },
  ascii(d) {
    if (d.lines) return d.lines
    return d.body.split(/\n/).flatMap((line) => (line.trim() ? wrapText(plain(line), 56) : [""]))
  },
  template: {
    title: "NOTE TO SELF",
    body: "Anything in Markdown — **bold**, `code`, [[links]], lists — inside the frame.",
  },
}

export const CONTENT = [callout, quote, steps, terminal, changelog, annotate, decision, chat, env, endpoint, keys, faq, frame]
