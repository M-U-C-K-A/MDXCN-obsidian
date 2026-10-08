/*
 * Diagrams: Flow, Tree, Timeline, Gantt, Check, Board, Calendar.
 */

import { col, colWidth, dash as dashRule, wrapText } from "../ascii"
import { cx, div, el, hidden, rise, rule, ruleY, span, sr, track, vars } from "../dom"
import { DIM, T, clamp01, isMono, seriesDim, tone, trackMarks } from "../glyphs"
import {
  bool,
  flat,
  fraction,
  hasBold,
  hasItalic,
  isObject,
  numberOf,
  numbers,
  optStr,
  plain,
  splitDash,
  splitLabel,
  str,
  tokenize,
  words,
  type InlineToken,
} from "../parse/inline"
import { allOf, headingSections, itemSource, listItems, toMarkdown, type ListItem } from "../parse/md"
import type { Common, Spec } from "../types"
import { base, entries, entryText, stateOf } from "./shared"

/* ---- Flow ------------------------------------------------------------- */

type FlowTone = "default" | "accent" | "muted"
interface FlowNode {
  label: string
  tone: FlowTone
  stretch?: boolean
}
interface FlowData extends Common {
  rows: { nodes: FlowNode[] }[]
}

const ARROW = /\s*(?:→|->|—>|=>|⟶)\s*/

function nodesOf(tokens: InlineToken[]): FlowNode[] {
  const nodes: FlowNode[] = []
  for (const token of tokens) {
    if (token.kind === "text") {
      for (const part of token.text.split(ARROW)) {
        const label = part.trim()
        if (label) nodes.push({ label, tone: "default" })
      }
      continue
    }
    if (token.kind === "strong" || token.kind === "em") {
      const label = plain(token.children.map((child) => (child.kind === "text" || child.kind === "code" ? child.text : "")).join("")).trim()
      if (label) nodes.push({ label, tone: token.kind === "strong" ? "accent" : "muted" })
      continue
    }
    if (token.kind === "code") nodes.push({ label: token.text, tone: "default" })
    else if (token.kind === "wikilink") nodes.push({ label: token.alias ?? token.target, tone: "default" })
    else if ("children" in token) nodes.push(...nodesOf(token.children))
  }
  return nodes
}

function flowTone(value: unknown): FlowTone {
  return value === "accent" ? "accent" : value === "muted" ? "muted" : "default"
}

export const flow: Spec<FlowData> = {
  slug: "graph-flow",
  tag: "GraphFlow",
  name: "Flow",
  aliases: ["flow", "graph-flow", "pipeline", "path", "arrows"],
  group: "diagram",
  summary: "A pipeline, a request path, or walking through a change.",
  notFor: "A dated list is Timeline. A schedule with start and end is Gantt.",
  items: { Path: "rows" },
  read({ props, blocks, body }) {
    const data = entries(props.rows)
    let rows: FlowData["rows"]
    if (data.length > 0) {
      rows = data.map((row) =>
        Array.isArray(row.nodes)
          ? { nodes: entries(row.nodes).map((node) => ({ label: entryText(node, "label"), tone: flowTone(node.tone), stretch: bool(node.stretch) })) }
          : { nodes: nodesOf(tokenize(str(row.children))) }
      )
    } else {
      const items = listItems(blocks)
      const paragraphs = allOf(blocks, "p")
      const lines = items.length > 0 ? items.map((item) => item.head) : paragraphs.length > 0 ? paragraphs.flatMap((paragraph) => paragraph.text.split("\n")) : body.split("\n")
      rows = lines.filter((line) => line.trim()).map((line) => ({ nodes: nodesOf(tokenize(line)) }))
    }
    return { ...base(props, "flow"), rows }
  },
  render(d, ctx) {
    const tones: Record<FlowTone, string> = { default: T.fg, accent: tone(ctx.palette, "primary"), muted: tone(ctx.palette, "secondary") }
    const wrap = div(ctx.body, "mdxcn-stack-7")
    d.rows.forEach((row, rowIndex) => {
      const line = rise(div(wrap, "mdxcn-flow"), rowIndex, 80)
      row.nodes.forEach((node, index) => {
        const cell = div(line, cx("mdxcn-flow-node", node.stretch && "is-stretch"))
        if (index > 0) {
          const arrow = hidden(div(cell, cx("mdxcn-flow-arrow", node.tone === "accent" ? T.accent : T.frame, node.stretch && "is-stretch")))
          if (node.stretch) span(arrow, "mdxcn-flow-dash")
          else span(arrow, undefined, "- - -")
          span(arrow, "mdxcn-flow-head", "▶")
        }
        span(cell, cx("mdxcn-nowrap", tones[node.tone]), node.label)
      })
    })
  },
  ascii(d) {
    return d.rows.length > 0 ? d.rows.map((row) => row.nodes.map((node) => node.label).join(" → ")) : [""]
  },
  template: {
    title: "OPTIMISTIC UI",
    body: "- tap → server → update\n- tap → **update** → *server syncs*",
  },
}

/* ---- Tree ------------------------------------------------------------- */

interface TreeNode {
  label: string
  meta?: string
  accent?: boolean
  children?: TreeNode[]
}
interface TreeData extends Common {
  nodes: TreeNode[]
}

function treeFromItems(items: ListItem[]): TreeNode[] {
  return items.map((item) => {
    const kids = treeFromItems(item.lists.flatMap((list) => list.items))
    const text = flat(itemSource(item))
    const [name, extra] = text.split(/\s+[—–]\s+/)
    return { label: name || text, meta: extra, accent: hasBold(item.head), children: kids.length > 0 ? kids : undefined }
  })
}

function treeFromData(value: unknown): TreeNode[] {
  return entries(value).map((node) => {
    const kids = treeFromData(Array.isArray(node.children) ? node.children : node.nodes)
    return { label: entryText(node, "label"), meta: optStr(node.meta), accent: bool(node.accent), children: kids.length > 0 ? kids : undefined }
  })
}

function flattenTree(nodes: TreeNode[], prefix = "", isRoot = true): { branch: string; label: string; meta?: string; accent?: boolean }[] {
  const single = isRoot && nodes.length === 1
  return nodes.flatMap((node, index) => {
    const last = index === nodes.length - 1
    const branch = single ? "" : prefix + (last ? "└─ " : "├─ ")
    const childPrefix = single ? "" : prefix + (last ? "   " : "│  ")
    return [{ branch, label: node.label, meta: node.meta, accent: node.accent }, ...(node.children ? flattenTree(node.children, childPrefix, false) : [])]
  })
}

export const tree: Spec<TreeData> = {
  slug: "graph-tree",
  tag: "GraphTree",
  name: "Tree",
  aliases: ["tree", "graph-tree", "files", "folders", "hierarchy", "org"],
  group: "diagram",
  summary: "Nested files or an org chart.",
  notFor: "A timeline or a table.",
  items: { Node: "nodes" },
  read({ props, blocks }) {
    const data = treeFromData(props.nodes)
    return { ...base(props, "tree"), nodes: data.length > 0 ? data : treeFromItems(listItems(blocks)) }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-scroll-x")
    const rows = flattenTree(d.nodes)
    const anyAccent = rows.some((row) => row.accent)
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-tree")
    rows.forEach((row, index) => {
      const line = rise(el(list, "li", cx("mdxcn-tree-row", anyAccent && !row.accent && DIM)), index, 30)
      const name = span(line, "mdxcn-nowrap")
      hidden(span(name, T.frame, row.branch))
      span(name, row.accent ? T.accent : T.fg, row.label)
      span(line, cx(T.muted, "mdxcn-num"), row.meta ?? "")
    })
    sr(ctx.body, `Tree with ${rows.length} nodes`)
  },
  ascii(d) {
    const rows = flattenTree(d.nodes)
    const left = colWidth(rows.map((row) => `${row.branch}${row.label}`))
    const hasMeta = rows.some((row) => row.meta)
    return rows.map((row) => (hasMeta ? `${col(`${row.branch}${row.label}`, left)}  ${row.meta ?? ""}`.trimEnd() : `${row.branch}${row.label}`))
  },
  template: {
    title: "REGISTRY",
    body: "- registry/default\n  - graph-frame\n    - graph-frame.tsx — ui\n    - graph-motion.ts — lib\n  - graph-tree\n    - **graph-tree.tsx** — ui",
  },
}

/* ---- Timeline --------------------------------------------------------- */

type State = "done" | "now" | "next"
interface TimelineData extends Common {
  events: { date: string; label: string; state: State; note?: string }[]
}

function markState(source: string): State {
  if (hasBold(source)) return "now"
  if (hasItalic(source)) return "next"
  return "done"
}

export const timeline: Spec<TimelineData> = {
  slug: "graph-timeline",
  tag: "GraphTimeline",
  name: "Timeline",
  aliases: ["timeline", "graph-timeline", "history", "milestones", "log"],
  group: "diagram",
  summary: "Steps in order, with one marked as current.",
  notFor: "A punch list is Check. A schedule with start and end is Gantt.",
  items: { Event: "events" },
  read({ props, blocks }) {
    const data = entries(props.events)
    const events =
      data.length > 0
        ? data.map((entry) => ({ date: str(entry.date), label: entryText(entry, "label"), state: stateOf(entry.state) ?? "done", note: optStr(entry.note) }))
        : listItems(blocks).map((item) => {
            const text = flat(item.head)
            const { label: date, rest } = splitLabel(text)
            const { label, rest: aside } = splitDash(rest || date)
            return {
              date: rest ? date : "",
              label,
              state: markState(item.head),
              note: item.body.length > 0 ? toMarkdown(item.body) : aside || undefined,
            }
          })
    return { ...base(props, "timeline"), events }
  },
  render(d, ctx) {
    const list = el(ctx.body, "ol", "mdxcn-list mdxcn-timeline")
    d.events.forEach((event, index) => {
      const live = event.state === "now"
      const next = event.state === "next"
      const item = rise(el(list, "li"), index)
      const row = div(item, "mdxcn-timeline-row")
      const stateTone = live ? tone(ctx.palette, "primary") : next ? tone(ctx.palette, "secondary") : T.fg
      hidden(span(row, cx("mdxcn-glyph mdxcn-dot", stateTone), next ? "○" : "●"))
      span(row, cx("mdxcn-num", next ? tone(ctx.palette, "secondary") : T.fg), event.date)
      const main = span(row, "mdxcn-stack-1")
      span(main, stateTone, event.label)
      if (event.note) ctx.prose(main, event.note, T.muted)
      if (index < d.events.length - 1) hidden(div(item, cx("mdxcn-timeline-link", T.frame), "│"))
    })
  },
  ascii(d) {
    const dates = colWidth(d.events.map((event) => event.date))
    const indent = " ".repeat(3 + dates + 2)
    const lines: string[] = []
    d.events.forEach((event, index) => {
      const last = index === d.events.length - 1
      lines.push(`${event.state === "next" ? "○" : "●"}  ${col(event.date, dates)}  ${event.label}`)
      if (event.note) wrapText(plain(event.note), 48).forEach((line) => lines.push(`${last ? " " : "│"}${indent.slice(1)}${line}`))
      if (!last) lines.push("│")
    })
    return lines
  },
  template: {
    title: "SHIPPED",
    body: "- Mar 12: CLI copies the files\n- **Mar 18: Docs, live previews**\n- *Apr 02: Registry listed*",
  },
}

/* ---- Gantt ------------------------------------------------------------ */

interface GanttItem {
  label: string
  start: number
  end: number
  complete?: number
  accent?: boolean
}
interface GanttData extends Common {
  items: GanttItem[]
  ticks?: string[]
  columns: number
  stage?: string
  progress?: number
}

function ganttCells(item: GanttItem, columns: number) {
  const start = Math.round(clamp01(item.start) * columns)
  const end = Math.max(start + 1, Math.round(clamp01(item.end) * columns))
  const done = Math.round(clamp01(item.complete ?? 1) * (end - start))
  return Array.from({ length: columns }, (_, index) => {
    const inBar = index >= start && index < end
    const filled = inBar && index < start + done
    return filled ? "fill" : inBar ? "rest" : "empty"
  })
}

export const gantt: Spec<GanttData> = {
  slug: "graph-gantt",
  tag: "GraphGantt",
  name: "Gantt",
  aliases: ["gantt", "graph-gantt", "roadmap-bars", "schedule", "plan"],
  group: "diagram",
  summary: "Work that overlaps on a shared calendar.",
  notFor: "A dated log is Timeline.",
  keywords: ["planning", "project", "quarters"],
  items: { Span: "items" },
  read({ props, blocks }) {
    const data = entries(props.items)
    const raw =
      data.length > 0
        ? data.map((entry) => ({
            label: entryText(entry, "label"),
            start: numberOf(entry.start),
            end: numberOf(entry.end),
            complete: entry.complete == null ? undefined : fraction(entry.complete),
            accent: bool(entry.accent),
          }))
        : listItems(blocks).map((item) => {
            const text = flat(itemSource(item))
            const { label, rest } = splitLabel(text)
            const source = rest || text
            const nums = source.match(/\d*\.?\d+%?/g) ?? []
            return {
              label: rest ? label : text.replace(/\d*\.?\d+%?/g, " ").replace(/\s+/g, " ").trim(),
              start: fraction(nums[0] ?? 0),
              end: fraction(nums[1] ?? nums[0] ?? 0),
              complete: nums[2] == null ? undefined : fraction(nums[2]),
              accent: hasBold(item.head),
            }
          })
    // Plain units (weeks, sprints): scale to 0–1 by the last end or `total`.
    const total = props.total != null ? numberOf(props.total) : Math.max(0, ...raw.map((item) => item.end))
    const scale = total > 1 ? total : 1
    const items = raw.map((item) => ({ ...item, start: item.start / scale, end: item.end / scale, complete: item.complete != null && item.complete > 1 ? item.complete / 100 : item.complete }))
    const ticks = props.ticks == null ? undefined : words(props.ticks)
    const progress = props.progress == null ? undefined : fraction(props.progress) > 1 ? fraction(props.progress) / scale : fraction(props.progress)
    return { ...base(props, "gantt"), items, ticks, columns: Math.max(4, numberOf(props.columns, 24)), stage: optStr(props.stage), progress }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-4")
    const marks = trackMarks(d.glyphs)
    const playhead = d.progress == null ? null : Math.round(clamp01(d.progress) * (d.columns - 1))
    if (playhead != null) {
      const head = div(ctx.body, "mdxcn-label-track")
      span(head)
      track(head, Array.from({ length: d.columns }, (_, index) => ({ glyph: "▾", cls: index === playhead ? tone(ctx.palette, "primary") : T.clear, fill: false })))
    }
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-2")
    d.items.forEach((item, index) => {
      const focused = d.stage ? item.label === d.stage : Boolean(item.accent)
      const dim = Boolean(d.stage) && !focused
      const row = rise(el(list, "li", cx("mdxcn-label-track", seriesDim(ctx.palette, !dim))), index)
      row.setAttr(
        "aria-label",
        `${item.label} from ${Math.round(item.start * 100)}% to ${Math.round(item.end * 100)}%${item.complete != null ? `, ${Math.round(item.complete * 100)}% complete` : ""}`
      )
      span(row, cx("mdxcn-truncate", focused ? tone(ctx.palette, "primary") : T.fg), item.label)
      track(
        row,
        ganttCells(item, d.columns).map((state) => ({
          glyph: state === "fill" ? marks.fill : state === "rest" ? marks.rest : marks.empty,
          cls: state === "fill" ? (focused ? tone(ctx.palette, "primary") : T.fg) : state === "rest" ? tone(ctx.palette, "secondary") : tone(ctx.palette, "empty"),
        }))
      )
    })
    if (d.ticks && d.ticks.length > 0) {
      const axis = div(ctx.body, "mdxcn-label-track")
      span(axis)
      const labels = div(axis, cx("mdxcn-split", T.muted))
      d.ticks.forEach((tick) => span(labels, undefined, tick))
    }
  },
  ascii(d) {
    const labels = colWidth(d.items.map((item) => item.label))
    const lines: string[] = []
    if (d.progress != null) {
      const playhead = Math.round(clamp01(d.progress) * (d.columns - 1))
      lines.push(`${col("", labels)}  ${Array.from({ length: d.columns }, (_, index) => (index === playhead ? "▾" : " ")).join("")}`.trimEnd())
    }
    for (const item of d.items) {
      lines.push(`${col(item.label, labels)}  ${ganttCells(item, d.columns).map((state) => (state === "fill" ? "█" : state === "rest" ? "░" : "-")).join("")}`)
    }
    if (d.ticks && d.ticks.length > 0) {
      const axis = Array.from({ length: d.columns }, () => " ")
      d.ticks.forEach((tick, index) => {
        const slot = d.ticks!.length === 1 ? 0 : Math.round((index / (d.ticks!.length - 1)) * (d.columns - tick.length))
        const at = Math.max(0, Math.min(d.columns - tick.length, slot))
        for (let char = 0; char < tick.length; char += 1) axis[at + char] = tick[char] ?? " "
      })
      lines.push(`${col("", labels)}  ${axis.join("")}`.trimEnd())
    }
    return lines
  },
  template: {
    title: "LAUNCH",
    props: { progress: 0.58, ticks: ["q1", "q2", "q3", "q4"] },
    body: "- design: 0 0.35\n- **build: 0.2 0.75 0.55**\n- docs: 0.55 0.9 0.2\n- ship: 0.85 1 0",
  },
}

/* ---- Check ------------------------------------------------------------ */

interface CheckItem {
  label: string
  done: boolean
  note?: string
  items?: CheckItem[]
}
interface CheckData extends Common {
  items: CheckItem[]
}

function checksOf(items: ListItem[]): CheckItem[] {
  return items.map((item) => {
    const text = flat(itemSource(item))
    const marked = /^\s*\[x\]/i.test(text)
    const { label, rest } = splitDash(text.replace(/^\s*\[[xX ]\]\s*/, ""))
    const nested = checksOf(item.lists.flatMap((list) => list.items))
    return { label, done: item.task === true || marked, note: rest || undefined, items: nested.length > 0 ? nested : undefined }
  })
}

function checksFromData(value: unknown): CheckItem[] {
  return entries(value).map((entry) => {
    const nested = checksFromData(entry.items)
    return { label: entryText(entry, "label"), done: bool(entry.done), note: optStr(entry.note), items: nested.length > 0 ? nested : undefined }
  })
}

function flattenChecks(items: CheckItem[], depth = 0): { item: CheckItem; depth: number }[] {
  return items.flatMap((item) => [{ item, depth }, ...flattenChecks(item.items ?? [], depth + 1)])
}

export const check: Spec<CheckData> = {
  slug: "graph-check",
  tag: "GraphCheck",
  name: "Check",
  aliases: ["check", "graph-check", "checklist", "todo", "tasks"],
  group: "diagram",
  summary: "A punch list. Done is [x], the rest stay [ ].",
  notFor: "Dated steps are Timeline.",
  items: { Task: "items" },
  read({ props, blocks }) {
    const data = checksFromData(props.items)
    return { ...base(props, "check"), items: data.length > 0 ? data : checksOf(listItems(blocks)) }
  },
  render(d, ctx) {
    const draw = (parent: HTMLElement, item: CheckItem, index: number | null) => {
      const row = el(parent, "li", "mdxcn-check")
      if (index != null) rise(row, index)
      hidden(span(row, item.done ? tone(ctx.palette, "primary") : T.muted, item.done ? "[x]" : "[ ]"))
      const main = span(row, "mdxcn-stack-1")
      span(main, item.done ? T.fg : T.muted, item.label)
      if (item.note) span(main, T.muted, item.note)
      if (item.items?.length) {
        const nested = el(main, "ul", "mdxcn-list mdxcn-stack-2 mdxcn-check-nested")
        item.items.forEach((child) => draw(nested, child, null))
      }
    }
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-2")
    d.items.forEach((item, index) => draw(list, item, index))
    const flatList = flattenChecks(d.items)
    sr(ctx.body, `${flatList.filter((entry) => entry.item.done).length} of ${flatList.length} done`)
  },
  ascii(d) {
    const flatList = flattenChecks(d.items)
    const labels = colWidth(flatList.map(({ item, depth }) => " ".repeat(depth * 5) + item.label))
    return flatList.map(({ item, depth }) => {
      const pad = " ".repeat(depth * 5)
      return `${pad}${item.done ? "[x]" : "[ ]"}  ${col(item.label, labels - pad.length)}${item.note ? `  ${item.note}` : ""}`.trimEnd()
    })
  },
  template: {
    title: "LAUNCH",
    body: "- [x] freeze tokens\n- [x] ship registry json\n- [ ] write the postmortem — still open",
  },
}

/* ---- Board ------------------------------------------------------------ */

interface BoardItem {
  label: string
  note?: string
  state: State
}
interface BoardData extends Common {
  columns: { title: string; items: BoardItem[] }[]
}

export const board: Spec<BoardData> = {
  slug: "graph-board",
  tag: "GraphBoard",
  name: "Board",
  aliases: ["board", "graph-board", "kanban", "roadmap", "sprint"],
  group: "diagram",
  summary: "A roadmap or a sprint: now, next, later, or todo, doing, done.",
  notFor: "One list of done boxes is Check. Dated events are Timeline.",
  read({ props, blocks }) {
    const data = entries(props.columns)
    const columns =
      data.length > 0
        ? data.map((column) => ({
            title: str(column.title),
            items: (Array.isArray(column.items) ? column.items : words(column.items)).map((entry) =>
              isObject(entry)
                ? { label: entryText(entry, "label"), note: optStr(entry.note), state: stateOf(entry.state) ?? "done" }
                : { label: str(entry), state: "done" as State }
            ),
          }))
        : headingSections(blocks).map((section) => ({
            title: flat(section.title),
            items: listItems(section.blocks).map((item) => {
              const source = itemSource(item)
              const { label, rest } = splitDash(flat(source))
              return { label, note: rest || undefined, state: markState(source) }
            }),
          }))
    return { ...base(props, "board"), columns: columns.slice(0, 4) }
  },
  render(d, ctx) {
    const grid = div(ctx.body, "mdxcn-board")
    vars(grid, { "--cols": Math.max(1, d.columns.length) })
    d.columns.forEach((column, columnIndex) => {
      if (columnIndex > 0) {
        const divider = hidden(div(grid, "mdxcn-board-divider"))
        rule(divider, "is-narrow")
        ruleY(divider, "is-wide")
      }
      const section = rise(el(grid, "section", "mdxcn-stack-3 mdxcn-board-col"), columnIndex)
      section.setAttr("aria-label", column.title)
      const head = el(section, "p", cx("mdxcn-split", T.muted))
      span(head, "mdxcn-truncate", column.title)
      span(head, "mdxcn-num", String(column.items.length))
      const list = el(section, "ul", "mdxcn-list mdxcn-stack-2")
      column.items.forEach((item) => {
        const row = el(list, "li", "mdxcn-board-item")
        hidden(span(row, item.state === "now" ? tone(ctx.palette, "primary") : T.frame, "-"))
        const main = span(row, "mdxcn-stack-1")
        span(main, cx("mdxcn-pretty", item.state === "now" ? tone(ctx.palette, "primary") : item.state === "next" ? tone(ctx.palette, "secondary") : T.fg), item.label)
        if (item.note) span(main, T.muted, item.note)
      })
    })
    const total = d.columns.reduce((sum, column) => sum + column.items.length, 0)
    sr(ctx.body, `${d.columns.map((column) => `${column.title}: ${column.items.length}`).join(", ")}. ${total} items.`)
  },
  ascii(d) {
    const shaped = d.columns.map((column) => {
      const head = `${column.title}  ${column.items.length}`
      const lines = column.items.flatMap((item) => [
        ...wrapText(item.label, 20).map((line, index) => (index === 0 ? `${item.state === "now" ? "●" : "-"} ${line}` : `  ${line}`)),
        ...(item.note ? wrapText(item.note, 20).map((line) => `  ${line}`) : []),
      ])
      return { head, lines, width: Math.max(colWidth([head, ...lines]), 12) }
    })
    const height = Math.max(0, ...shaped.map((column) => column.lines.length))
    const join = (cells: string[]) => cells.join(" | ").trimEnd()
    return [
      join(shaped.map((column) => col(column.head, column.width))),
      join(shaped.map((column) => dashRule(column.width))),
      ...Array.from({ length: height }, (_, row) => join(shaped.map((column) => col(column.lines[row] ?? "", column.width)))),
    ]
  },
  template: {
    title: "ROADMAP",
    body: "### Now\n- **Children for every graph**\n- Comark parity\n\n### Next\n- Board\n- Score\n\n### Later\n- *Figma kit*",
  },
}

/* ---- Calendar --------------------------------------------------------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS_SUN = ["S", "M", "T", "W", "T", "F", "S"]
const WEEKDAYS_MON = ["M", "T", "W", "T", "F", "S", "S"]

interface CalendarData extends Common {
  year: number
  month: number
  weekStartsOn: 0 | 1
  marks: { day: number; accent: boolean; label?: string }[]
  today?: number
}

function calendarWeeks(d: CalendarData) {
  const monthIndex = d.month - 1
  const days = new Date(Date.UTC(d.year, monthIndex + 1, 0)).getUTCDate()
  const pad = (new Date(Date.UTC(d.year, monthIndex, 1)).getUTCDay() - d.weekStartsOn + 7) % 7
  const trailing = (7 - ((pad + days) % 7)) % 7
  const grid: (number | null)[] = [...Array.from({ length: pad }, () => null), ...Array.from({ length: days }, (_, index) => index + 1), ...Array.from({ length: trailing }, () => null)]
  const weeks: (number | null)[][] = []
  for (let index = 0; index < grid.length; index += 7) weeks.push(grid.slice(index, index + 7))
  return weeks
}

function monthOf(value: unknown): number | undefined {
  if (value == null) return undefined
  const number = numberOf(value, Number.NaN)
  if (Number.isFinite(number)) return Math.min(12, Math.max(1, Math.round(number)))
  const name = str(value).toLowerCase().slice(0, 3)
  const index = MONTHS.findIndex((month) => month.toLowerCase().startsWith(name))
  return index >= 0 ? index + 1 : undefined
}

export const calendar: Spec<CalendarData> = {
  slug: "graph-calendar",
  tag: "GraphCalendar",
  name: "Calendar",
  aliases: ["calendar", "graph-calendar", "month", "agenda"],
  group: "time",
  summary: "One month with a few days marked.",
  notFor: "A year of activity is Activity.",
  read({ props, blocks }) {
    const now = new Date()
    const listed = listItems(blocks).flatMap((item) => {
      const source = itemSource(item)
      const { label, rest } = splitLabel(flat(source))
      const day = Number.parseInt(label, 10)
      if (!Number.isFinite(day)) return []
      return [{ day, accent: true, label: rest || undefined, today: hasBold(source) }]
    })
    const given = props.marks
    const marks =
      typeof given === "string" || typeof given === "number"
        ? numbers(given).map((day) => ({ day, accent: true }))
        : Array.isArray(given)
          ? given.map((mark) => (isObject(mark) ? { day: numberOf(mark.day), accent: mark.accent == null ? true : bool(mark.accent), label: optStr(mark.label) } : { day: numberOf(mark), accent: true }))
          : listed
    const year = props.year == null ? now.getFullYear() : numberOf(props.year, now.getFullYear())
    const month = monthOf(props.month) ?? now.getMonth() + 1
    const todayProp = props.today
    const today =
      todayProp === "auto" || todayProp === true
        ? year === now.getFullYear() && month === now.getMonth() + 1
          ? now.getDate()
          : undefined
        : todayProp != null
          ? numberOf(todayProp)
          : listed.find((mark) => mark.today)?.day
    return {
      ...base(props),
      title: optStr(props.title) ?? `${MONTHS[month - 1]} ${year}`,
      year,
      month,
      weekStartsOn: props.weekStartsOn == null ? 1 : numberOf(props.weekStartsOn) === 0 ? 0 : 1,
      marks,
      today,
    }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-3")
    const highlighted = new Map(d.marks.map((mark) => [mark.day, mark.accent]))
    const head = div(ctx.body, "mdxcn-calendar")
    ;(d.weekStartsOn === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN).forEach((label) => span(head, cx("mdxcn-calendar-day", T.muted), label))
    const weeks = div(ctx.body, "mdxcn-stack-1")
    calendarWeeks(d).forEach((week, index) => {
      const row = rise(div(weeks, "mdxcn-calendar"), index, 40)
      for (const day of week) {
        const accent = day != null && highlighted.get(day) === true
        const isToday = day != null && d.today === day
        span(
          row,
          cx(
            "mdxcn-calendar-day mdxcn-num",
            day == null && T.clear,
            day != null && !accent && !isToday && T.fg,
            accent && tone(ctx.palette, "primary"),
            isToday && !accent && tone(ctx.palette, isMono(ctx.palette) ? "primary" : "secondary")
          ),
          day == null ? " " : isToday ? `[${day}]` : String(day)
        )
      }
    })
    const notes = d.marks.filter((mark) => mark.label).sort((a, b) => a.day - b.day)
    if (notes.length > 0) {
      rule(ctx.body, "mdxcn-mt-2")
      const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-2")
      notes.forEach((mark, index) => {
        const row = rise(el(list, "li", "mdxcn-calendar-note"), index)
        span(row, cx("is-right mdxcn-num", mark.accent === false ? T.fg : tone(ctx.palette, "primary")), mark.day === d.today ? `[${mark.day}]` : String(mark.day))
        span(row, T.fg, mark.label ?? "")
      })
    }
    sr(ctx.body, `${MONTHS[d.month - 1]} ${d.year}${d.today ? `, today ${d.today}` : ""}`)
  },
  ascii(d) {
    const highlighted = new Map(d.marks.map((mark) => [mark.day, mark.accent]))
    const cell = (text: string) => col(text, 4, "right")
    const lines = [(d.weekStartsOn === 1 ? WEEKDAYS_MON : WEEKDAYS_SUN).map(cell).join(" ").trimEnd()]
    for (const week of calendarWeeks(d)) {
      lines.push(
        week
          .map((day) => {
            if (day == null) return cell("")
            if (d.today === day) return cell(`[${day}]`)
            return cell(highlighted.get(day) ? `*${day}` : String(day))
          })
          .join(" ")
          .trimEnd()
      )
    }
    const notes = d.marks.filter((mark) => mark.label).sort((a, b) => a.day - b.day)
    if (notes.length > 0) {
      lines.push("")
      for (const mark of notes) lines.push(`${cell(mark.day === d.today ? `[${mark.day}]` : String(mark.day))}  ${mark.label}`)
    }
    return lines
  },
  template: {
    title: "SHIP WEEK",
    props: { year: 2026, month: 3 },
    body: "- 12: launch\n- **18: today**\n- 27: retro",
  },
}

export const DIAGRAMS = [flow, tree, timeline, gantt, check, board, calendar]
