/*
 * Read an mdxcn ASCII frame back into a component and its props.
 *
 * The official fences are drawn by fixed rules (see `ascii.ts` and each
 * spec's `ascii()`), so each one has a fingerprint: Rank has `[====---]`,
 * Gantt rows end in a `█░-` track, Timeline has `●` and `│`, … The detectors
 * below run from the most specific to the most generic. Whatever is left is
 * drawn as-is inside the frame, so a paste never fails.
 */

import { readFrame } from "../ascii"
import { parseInstant } from "../components/time"
import { findSpec } from "../registry"
import { numberOf, words } from "./inline"

export interface Detected {
  slug: string
  props: Record<string, unknown>
}

type Lines = string[]

const SPARK = "▁▂▃▄▅▆▇█"
const SHADE = ["·", "░", "▒", "▓", "█"]

const nonEmpty = (lines: Lines) => lines.filter((line) => line.trim() !== "")
const splitCols = (line: string) => line.trim().split(/\s{2,}/)
const isRule = (line: string) => /^-{3,}$/.test(line.trim())

function blocksOf(lines: Lines): Lines[] {
  const out: Lines[] = []
  let current: Lines = []
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) out.push(current)
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) out.push(current)
  return out
}

/* ---- detectors ------------------------------------------------------- */

type Detector = (lines: Lines, title?: string) => Detected | null

const INSTANT = /^(clock|now|\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?)(?:\s+[—–-]\s+(.+))?$/i

const time: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  if (rows.length !== 1) return null
  const match = (rows[0] ?? "").trim().match(INSTANT)
  if (!match) return null
  const at = match[1] ?? ""
  const caption = match[2]?.trim()
  if (/^(clock|now)$/i.test(at)) return { slug: "graph-timer", props: { title, kind: "clock", caption } }
  const when = parseInstant(at)
  if (!Number.isFinite(when)) return null
  const hint = `${caption ?? ""} ${title ?? ""}`.toLowerCase()
  const countdown = /\b(until|till|before|left|countdown|deadline|freeze|launch|due|remaining)\b/.test(hint)
    ? true
    : /\b(since|ago|elapsed|uptime|incident|up for)\b/.test(hint)
      ? false
      : when > Date.now()
  return countdown
    ? { slug: "graph-countdown", props: { title, to: at, caption } }
    : { slug: "graph-timer", props: { title, at, caption } }
}

const keys: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const re = /^((?:\[[^\]]+\])+(?: then (?:\[[^\]]+\])+)*)\s{2,}(.+)$/
  if (rows.length === 0 || !rows.every((line) => re.test(line))) return null
  return {
    slug: "keys",
    props: {
      title,
      bindings: rows.map((line) => {
        const match = line.match(re)!
        const chords = (match[1] ?? "").split(" then ").map((chord) => [...chord.matchAll(/\[([^\]]+)\]/g)].map((cap) => cap[1]).join("+"))
        return { keys: chords.join(" then "), action: (match[2] ?? "").trim() }
      }),
    },
  }
}

const annotate: Detector = (lines, title) => {
  const tagRe = /^\[\s*(\d+)\]\s{2}/
  if (!lines.some((line) => tagRe.test(line))) return null
  const width = Math.max(...lines.map((line) => line.match(/^\[(\s*\d+)\]/)?.[1]?.length ?? 0))
  const prefix = width + 2 + 2
  const blocks = blocksOf(lines)
  const last = blocks[blocks.length - 1] ?? []
  const notesAreTagged = blocks.length > 1 && tagRe.test(last[0] ?? "") && last.every((line) => tagRe.test(line) || line.startsWith(" ".repeat(prefix)))
  const codeEnd = notesAreTagged ? lines.lastIndexOf(last[0] ?? "") : lines.length
  const code = lines.slice(0, codeEnd)
  while (code.length > 0 && code[code.length - 1]?.trim() === "") code.pop()
  if (!code.every((line) => line.trim() === "" || tagRe.test(line) || line.startsWith(" ".repeat(prefix)) || line.length <= prefix)) return null
  const notes: string[] = []
  if (notesAreTagged) {
    for (const line of last) {
      if (tagRe.test(line)) notes.push(line.slice(prefix).trim())
      else notes[notes.length - 1] = `${notes[notes.length - 1] ?? ""} ${line.trim()}`.trim()
    }
  }
  return {
    slug: "annotate",
    props: {
      title,
      lines: code.map((line) => {
        const tag = line.match(/^\[\s*(\d+)\]/)
        return { text: line.slice(prefix), mark: tag ? Number(tag[1]) : undefined }
      }),
      notes,
    },
  }
}

const check: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const re = /^(\s*)\[([ xX])\]\s{2}(.*)$/
  if (rows.length === 0 || !rows.every((line) => re.test(line))) return null
  type Item = { label: string; done: boolean; note?: string; items?: Item[] }
  const root: Item[] = []
  const stack: { depth: number; list: Item[] }[] = [{ depth: -1, list: root }]
  for (const line of rows) {
    const match = line.match(re)!
    const depth = Math.round((match[1] ?? "").length / 5)
    const [label = "", ...note] = splitCols(match[3] ?? "")
    const item: Item = { label, done: (match[2] ?? " ").toLowerCase() === "x", note: note.join("  ") || undefined }
    while (stack.length > 1 && (stack[stack.length - 1]?.depth ?? -1) >= depth) stack.pop()
    const parent = stack[stack.length - 1]!
    parent.list.push(item)
    item.items = []
    stack.push({ depth, list: item.items })
  }
  const prune = (items: Item[]): Item[] => items.map((item) => ({ ...item, items: item.items && item.items.length > 0 ? prune(item.items) : undefined }))
  return { slug: "graph-check", props: { title, items: prune(root) } }
}

const bracket = /^(.*?)\s{2,}\[([=\-|]+)\]\s{2,}(\S.*)$/

const rank: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  if (rows.length === 0 || !rows.every((line) => bracket.test(line))) return null
  if (rows.some((line) => (line.match(bracket)?.[2] ?? "").includes("|"))) {
    return {
      slug: "graph-bullet",
      props: {
        title,
        ticks: (rows[0]?.match(bracket)?.[2] ?? "").length,
        items: rows.map((line) => {
          const match = line.match(bracket)!
          const [value = "", target] = (match[3] ?? "").split(/\s*\/\s*/)
          return { label: (match[1] ?? "").trim(), value: numberOf(value), target: target == null ? undefined : numberOf(target) }
        }),
      },
    }
  }
  return {
    slug: "graph-rank",
    props: {
      title,
      ticks: (rows[0]?.match(bracket)?.[2] ?? "").length,
      items: rows.map((line) => {
        const match = line.match(bracket)!
        const display = (match[3] ?? "").trim()
        return { label: (match[1] ?? "").trim(), value: numberOf(display), display }
      }),
    },
  }
}

const meter: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const match = (rows[0] ?? "").trim().match(/^\[([=\-]+)\]\s+(\d+(?:\.\d+)?)%$/)
  if (!match || rows.length > 2) return null
  return { slug: "graph-meter", props: { title, value: numberOf(match[2]) / 100, ticks: (match[1] ?? "").length, caption: rows[1]?.trim() } }
}

const score: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const re = /^(.*?)\s{2,}([●◐○]+)\s{2,}([\d.]+)\/(\d+)$/
  if (rows.length === 0 || !rows.every((line) => re.test(line))) return null
  return {
    slug: "graph-score",
    props: {
      title,
      items: rows.map((line) => {
        const match = line.match(re)!
        return { label: (match[1] ?? "").trim(), value: numberOf(match[3]), max: numberOf(match[4]) }
      }),
    },
  }
}

const tree: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  if (!rows.some((line) => /[├└]─ /.test(line))) return null
  type Node = { label: string; meta?: string; children?: Node[] }
  const parsed = rows.map((line) => {
    const match = line.match(/^((?:│ {2}| {3})*)([├└]─ )?(.*)$/)!
    const depth = (match[1] ?? "").length / 3 + (match[2] ? 1 : 0)
    const [label = "", ...meta] = splitCols(match[3] ?? "")
    return { depth, label, meta: meta.join("  ") || undefined }
  })
  const singleRoot = (parsed[0]?.depth ?? 0) === 0 && parsed.slice(1).every((row) => row.depth > 0)
  const roots: Node[] = []
  const stack: { depth: number; node: Node }[] = []
  for (const row of parsed) {
    const depth = singleRoot ? row.depth : row.depth - 1
    const node: Node = { label: row.label, meta: row.meta }
    while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? 0) >= depth) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) (parent.node.children ??= []).push(node)
    else roots.push(node)
    stack.push({ depth, node })
  }
  return { slug: "graph-tree", props: { title, nodes: roots } }
}

const dotted: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const dot = /^([●○×])\s{2}(.*)$/
  const events = rows.filter((line) => dot.test(line))
  if (events.length === 0) return null
  const connectors = rows.some((line) => /^│\s*$/.test(line))
  const hasX = events.some((line) => line.startsWith("×"))

  if (!hasX && (connectors || events.length === 1) && rows.every((line) => dot.test(line) || /^[│ ]/.test(line))) {
    const items: { date: string; label: string; state: string; note?: string }[] = []
    for (const line of rows) {
      const match = line.match(dot)
      if (match) {
        const parts = (match[2] ?? "").match(/^(.*?)\s{2,}(.*)$/)
        items.push({ date: (parts?.[1] ?? "").trim(), label: (parts?.[2] ?? match[2] ?? "").trim(), state: match[1] === "○" ? "next" : "done" })
        continue
      }
      const note = line.replace(/^[│ ]/, "").trim()
      const last = items[items.length - 1]
      if (note && last) last.note = last.note ? `${last.note} ${note}` : note
    }
    const firstNext = items.findIndex((item) => item.state === "next")
    if (firstNext > 0) items[firstNext - 1]!.state = "now"
    return { slug: "graph-timeline", props: { title, events: items } }
  }

  // Decision: optional `status  date` line, options, then prose.
  const blocks = blocksOf(lines)
  let index = 0
  let status: string | undefined
  let date: string | undefined
  if (blocks[0] && !blocks[0].some((line) => dot.test(line))) {
    const [first = "", second] = splitCols(blocks[0][0] ?? "")
    status = first || undefined
    date = second
    index = 1
  }
  const optionBlock = blocks[index] ?? []
  if (!optionBlock.every((line) => dot.test(line))) return null
  const glyphState: Record<string, string> = { "●": "chosen", "○": "open", "×": "rejected" }
  const options = optionBlock.map((line) => {
    const match = line.match(dot)!
    const [label = "", ...reason] = splitCols(match[2] ?? "")
    return { label, reason: reason.join("  ") || undefined, state: glyphState[match[1] ?? "○"] }
  })
  const body = blocks
    .slice(index + 1)
    .map((block) => block.map((line) => line.trim()).join(" "))
    .join("\n\n")
  return { slug: "decision", props: { title, status, date, options, body: body || undefined } }
}

const steps: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const head = /^(\d+)\s{2}(\S.*)$/
  if (!head.test(rows[0] ?? "")) return null
  if (!rows.every((line) => head.test(line) || /^│\s*$/.test(line) || /^ {3}\S/.test(line))) return null
  const items: { title: string; body?: string }[] = []
  let bodyStarted = false
  for (const line of rows) {
    const match = line.match(head)
    if (match) {
      items.push({ title: (match[2] ?? "").trim() })
      bodyStarted = false
      continue
    }
    if (/^│/.test(line)) continue
    const last = items[items.length - 1]
    if (!last) continue
    // Wrapped title lines are indistinguishable from the body; the first
    // continuation is read as the body, which matches how Steps draws.
    last.body = bodyStarted ? `${last.body} ${line.trim()}` : line.trim()
    bodyStarted = true
  }
  return { slug: "steps", props: { title, steps: items } }
}

const faq: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  if (!/^\?\s{2}/.test(rows[0] ?? "")) return null
  const entries: { question: string; answer?: string }[] = []
  let inQuestion = false
  for (const line of lines) {
    if (line.trim() === "") {
      inQuestion = false
      continue
    }
    const question = line.match(/^\?\s{2}(.*)$/)
    if (question) {
      entries.push({ question: (question[1] ?? "").trim() })
      inQuestion = true
      continue
    }
    const last = entries[entries.length - 1]
    if (!last) return null
    // Continuation of a wrapped question has the same indent as the answer;
    // mdxcn wraps questions at 54, so a short previous line means an answer.
    if (inQuestion && last.answer == null && last.question.length >= 50) {
      last.question = `${last.question} ${line.trim()}`
      continue
    }
    inQuestion = false
    last.answer = last.answer ? `${last.answer} ${line.trim()}` : line.trim()
  }
  return { slug: "faq", props: { title, entries } }
}

const chat: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  if (!/^>\s{2}\S/.test(rows[0] ?? "")) return null
  if (!rows.every((line) => /^(>|\s)\s{2}/.test(line))) return null
  const turns: { by: string; text: string }[] = []
  let speaker = ""
  for (const line of lines) {
    if (line.trim() === "") continue
    const rest = line.slice(3)
    if (/^\S/.test(rest)) {
      const match = rest.match(/^(\S(?:.*?\S)?)\s{2,}(.*)$/)
      speaker = (match?.[1] ?? rest).trim()
      turns.push({ by: speaker, text: (match?.[2] ?? "").trim() })
    } else {
      const last = turns[turns.length - 1]
      if (last) last.text = `${last.text} ${rest.trim()}`.trim()
    }
  }
  return { slug: "chat", props: { title, you: turns[0]?.by, turns } }
}

const env: Detector = (lines, title) => {
  const rows = nonEmpty(lines).filter((line) => line.trim() !== "* required")
  const re = /^([* ])\s{2}([A-Za-z_][\w.]*)\s{2,}(.*)$/
  if (rows.length === 0 || !re.test(rows[0] ?? "")) return null
  if (!rows.every((line) => re.test(line) || /^ {3}\S/.test(line))) return null
  if (!rows.some((line) => /^[* ]\s{2}[A-Z_][A-Z0-9_]+\s/.test(line)) && !(title ?? "").toLowerCase().includes("env")) return null
  const vars: { name: string; value?: string; note?: string; required: boolean }[] = []
  for (const line of rows) {
    const match = line.match(re)
    if (match) {
      const value = (match[3] ?? "").trim()
      vars.push({ name: match[2] ?? "", value: value === "—" ? "" : value, required: match[1] === "*" })
      continue
    }
    const last = vars[vars.length - 1]
    if (last) last.note = last.note ? `${last.note} ${line.trim()}` : line.trim()
  }
  return { slug: "env", props: { title, vars } }
}

const endpoint: Detector = (lines, title) => {
  const blocks = blocksOf(lines)
  const route = (blocks[0]?.[0] ?? "").match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|QUERY)\s{2}(\S+)\s*$/)
  if (!route) return null
  const about = (blocks[0] ?? []).slice(1).map((line) => line.trim()).join(" ")
  const params: { name: string; type?: string; description?: string; required: boolean }[] = []
  const codeBlocks: { label?: string; code: string }[] = []
  for (const block of blocks.slice(1)) {
    const paramRe = /^([* ])\s{2}(\S+)(?:\s{2,}(\S+))?(?:\s{2,}(.*))?$/
    if (params.length === 0 && codeBlocks.length === 0 && block.every((line) => paramRe.test(line))) {
      for (const line of block) {
        const match = line.match(paramRe)!
        params.push({ name: match[2] ?? "", type: match[3], description: match[4]?.trim(), required: match[1] === "*" })
      }
      continue
    }
    const [first = "", ...rest] = block
    const labelled = rest.length > 0 && /^(request|response|json|bash|sh|http|ts|js|example|\w+)$/i.test(first.trim())
    codeBlocks.push(labelled ? { label: first.trim(), code: rest.join("\n") } : { code: block.join("\n") })
  }
  return { slug: "endpoint", props: { title, method: route[1], path: route[2], about: about || undefined, params, blocks: codeBlocks } }
}

const changelog: Detector = (lines, title) => {
  const re = /^([+~*\-])\s{2}(added|changed|fixed|removed)\s+(.*)$/
  const rows = nonEmpty(lines)
  const first = rows.findIndex((line) => re.test(line))
  if (first < 0 || first > 1) return null
  let version: string | undefined
  let date: string | undefined
  if (first === 1) {
    const [head = "", second] = splitCols(rows[0] ?? "")
    version = head
    date = second
  }
  const types: Record<string, string> = { added: "add", changed: "change", fixed: "fix", removed: "remove" }
  const items: { type: string; text: string }[] = []
  for (const line of rows.slice(first)) {
    const match = line.match(re)
    if (match) {
      items.push({ type: types[match[2] ?? "changed"] ?? "change", text: (match[3] ?? "").trim() })
      continue
    }
    if (!/^\s+\S/.test(line)) return null
    const last = items[items.length - 1]
    if (last) last.text = `${last.text} ${line.trim()}`
  }
  return { slug: "changelog", props: { title: version ? (title && title.toLowerCase() !== version.toLowerCase() ? title : undefined) : undefined, version: version ?? title ?? "", date, items } }
}

const callout: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const match = (rows[0] ?? "").match(/^([i+!×x])\s{2}(.*)$/)
  if (!match) return null
  if (!rows.slice(1).every((line) => /^ {3}/.test(line))) return null
  const glyphType: Record<string, string> = { i: "note", "+": "tip", "!": "warning", "×": "danger", x: "danger" }
  const type = glyphType[match[1] ?? "i"] ?? "note"
  const body = [match[2] ?? "", ...rows.slice(1).map((line) => line.trim())].join(" ").trim()
  const custom = title && title.toLowerCase() !== type ? title : undefined
  return { slug: "callout", props: { type: custom && findCalloutType(custom) ? findCalloutType(custom) : type, title: custom, body } }
}

function findCalloutType(title: string) {
  const key = title.toLowerCase()
  return ["note", "tip", "warning", "danger", "info", "important", "caution", "success", "error"].includes(key) ? key : undefined
}

const quote: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  if (!/^“\s{2}/.test(rows[0] ?? "")) return null
  const textLines: string[] = []
  let by: string | undefined
  let source: string | undefined
  for (const line of rows) {
    const cite = line.match(/^—\s{2}(.*)$/)
    if (cite) {
      const [name = "", ...where] = splitCols(cite[1] ?? "")
      by = name || undefined
      source = where.join("  ") || undefined
      continue
    }
    textLines.push(line.replace(/^“\s{2}/, "").trim())
  }
  return { slug: "quote", props: { title, by, source, body: textLines.join(" ") } }
}

const terminal: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const named = /^(shell|terminal|console|bash|zsh|sh|cli|output)$/i.test(title ?? "")
  if (!named && !/^\$\s/.test(rows[0] ?? "")) return null
  return { slug: "terminal", props: { title, body: lines.join("\n") } }
}

/* ---- tracks ---------------------------------------------------------- */

const ganttRow = /^(.*?)\s{2,}([█░\-]{4,})$/

const gantt: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const tracks = rows.filter((line) => ganttRow.test(line) && /[█░]/.test(line.match(ganttRow)?.[2] ?? ""))
  if (tracks.length === 0) return null
  const columns = (tracks[0]?.match(ganttRow)?.[2] ?? "").length
  const offset = (tracks[0] ?? "").length - columns
  let progress: number | undefined
  let ticks: string[] | undefined
  for (const line of rows) {
    if (tracks.includes(line)) continue
    if (/^\s*▾\s*$/.test(line)) {
      progress = Math.max(0, line.indexOf("▾") - offset) / Math.max(1, columns - 1)
      continue
    }
    if (line.length > offset && line.slice(0, offset).trim() === "" && rows.indexOf(line) === rows.length - 1) {
      ticks = words(line.trim())
      continue
    }
    return null
  }
  const items = tracks.map((line) => {
    const match = line.match(ganttRow)!
    const track = match[2] ?? ""
    const first = track.search(/[^-]/)
    const last = track.length - [...track].reverse().join("").search(/[^-]/)
    const filled = [...track].filter((char) => char === "█").length
    const span = Math.max(1, last - first)
    return {
      label: (match[1] ?? "").trim(),
      start: first / columns,
      end: last / columns,
      complete: filled >= span ? undefined : filled / span,
    }
  })
  return { slug: "graph-gantt", props: { title, columns, progress, ticks, items } }
}

const stack: Detector = (lines, title) => {
  const blocks = blocksOf(lines)
  if (blocks.length < 2) return null
  const legendLine = blocks[blocks.length - 1]?.join(" ") ?? ""
  const legend = [...legendLine.matchAll(/(\S) (\S+)/g)].map((match) => ({ glyph: match[1] ?? "", label: match[2] ?? "" }))
  if (legend.length === 0 || !/^(\S \S+)(\s{2}\S \S+)*$/.test(legendLine.trim())) return null
  const rowRe = /^(.*?)\s{2,}([█▓▒░#=+\-]+)$/
  const rows = blocks.slice(0, -1).flat()
  if (!rows.every((line) => rowRe.test(line))) return null
  const ticks = (rows[0]?.match(rowRe)?.[2] ?? "").length
  return {
    slug: "graph-stack",
    props: {
      title,
      ticks,
      rows: rows.map((line) => {
        const match = line.match(rowRe)!
        const track = [...(match[2] ?? "")]
        return {
          label: (match[1] ?? "").trim(),
          segments: legend.map((key) => ({ label: key.label, value: track.filter((char) => char === key.glyph).length })),
        }
      }),
    },
  }
}

const barRow = /^(.*?)\s{2,}([█\-]+)\s{2,}([+−\-]?[$€£]?[\d.,]+\S*)(?:\s{2,}(\d+%))?$/

const waterfallOrFunnel: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const bars = rows.filter((line) => barRow.test(line))
  if (bars.length === 0 || bars.length + rows.filter(isRule).length !== rows.length) return null
  const tracks = bars.map((line) => line.match(barRow)![2] ?? "")
  const floating = tracks.some((track) => track.startsWith("-")) || rows.some(isRule)
  const ticks = (tracks[0] ?? "").length
  if (floating) {
    return {
      slug: "graph-waterfall",
      props: {
        title,
        ticks,
        items: bars.map((line) => {
          const match = line.match(barRow)!
          return { label: (match[1] ?? "").trim(), value: numberOf((match[3] ?? "").replace(/^−/, "-")) }
        }),
      },
    }
  }
  return {
    slug: "graph-funnel",
    props: {
      title,
      ticks,
      steps: bars.map((line) => {
        const match = line.match(barRow)!
        return { label: (match[1] ?? "").trim(), value: numberOf(match[3]), display: match[3] }
      }),
    },
  }
}

const uptime: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const grid = rows.filter((line) => /^[█▒·\-]+$/.test(line.trim()))
  if (grid.length === 0) return null
  const meta = rows.find((line) => /^\d+%/.test(line.trim()))
  const legend = rows.find((line) => /█ up/.test(line))
  if (!meta || grid.length + 1 + (legend ? 1 : 0) !== rows.length) return null
  const map: Record<string, string> = { "█": "ok", "▒": "degraded", "·": "down", "-": "empty" }
  const [, from, to] = splitCols(meta)
  return {
    slug: "graph-uptime",
    props: { title, from, to, columns: (grid[0] ?? "").trim().length, days: grid.flatMap((line) => [...line.trim()].map((char) => map[char] ?? "empty")) },
  }
}

const waffle: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const grid = rows.filter((line) => /^[█░](?: [█░ ])*$/.test(line.trimEnd()))
  const pct = rows.find((line) => /^\d+(?:\.\d+)?%$/.test(line.trim()))
  if (grid.length < 2 || !pct) return null
  const cells = grid.reduce((sum, line) => sum + (line.match(/[█░]/g)?.length ?? 0), 0)
  const caption = rows.slice(rows.indexOf(pct) + 1).join(" ").trim() || undefined
  return {
    slug: "graph-waffle",
    props: { title, value: numberOf(pct) / 100, cells, columns: (grid[0]?.match(/[█░]/g) ?? []).length, caption },
  }
}

const cellsGrid: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  if (rows.length < 2) return null
  const grid = rows.slice(0, -1)
  if (!grid.every((line) => /^[█·](?: [█·])*(?: {3}[█·](?: [█·])*)*$/.test(line.trimEnd()))) return null
  const labelLine = rows[rows.length - 1] ?? ""
  const groups = [...(grid[0] ?? "").matchAll(/[█·](?: [█·])*/g)].map((match) => ({ start: match.index ?? 0, width: match[0].length }))
  return {
    slug: "graph-cells",
    props: {
      title,
      items: groups.map((group, index) => {
        const end = groups[index + 1]?.start ?? labelLine.length
        return {
          label: labelLine.slice(group.start, end).trim(),
          cells: grid.map((line) =>
            line
              .slice(group.start, group.start + group.width)
              .split(" ")
              .filter(Boolean)
              .map((char) => (char === "█" ? 1 : 0))
          ),
        }
      }),
    },
  }
}

const bars: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const arrowLine = rows.find((line) => /-->/.test(line))
  if (!arrowLine || rows.length < 3) return null
  const chart = rows.slice(0, -1)
  if (!chart.every((line) => /^[█ ]*(?:-->.*-->|-->)?[█ ]*$/.test(line))) return null
  const arrow = arrowLine.match(/-->(?:\s+(.*?)\s+-->)?/)!
  const arrowStart = arrow.index ?? 0
  const arrowEnd = arrowStart + arrow[0].length
  const labels = rows[rows.length - 1] ?? ""
  const side = (from: number, to: number) => {
    const columns = new Map<number, number>()
    for (const line of chart) {
      for (let at = from; at < Math.min(to, line.length); at += 1) {
        if (line[at] === "█") columns.set(at, (columns.get(at) ?? 0) + 1)
        else if (!columns.has(at) && line[at] === " ") continue
      }
    }
    const keys = [...columns.keys()].sort((a, b) => a - b)
    const height = Math.max(0, ...columns.values())
    return { values: keys.map((key) => Math.max(0, (columns.get(key) ?? 1) - 1)), height }
  }
  const left = side(0, arrowStart)
  const right = side(arrowEnd, Infinity)
  const rightStart = Math.min(...chart.map((line) => line.slice(arrowEnd).search(/█/)).filter((at) => at >= 0).map((at) => at + arrowEnd))
  return {
    slug: "graph-bars",
    props: {
      title,
      processor: arrow[1]?.trim() || undefined,
      from: { label: labels.slice(0, arrowStart).trim(), values: left.values, size: left.height > 5 ? "lg" : undefined },
      to: { label: labels.slice(Number.isFinite(rightStart) ? rightStart : arrowEnd).trim(), values: right.values, size: right.height > 5 ? "lg" : undefined },
    },
  }
}

const spark: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const sparkRe = new RegExp(`^[${SPARK}]+$`)
  if (rows.length >= 3 && sparkRe.test((rows[2] ?? "").trim()) && rows.length === 3) {
    const [label = "", hint] = splitCols(rows[1] ?? "")
    return {
      slug: "graph-kpi",
      props: { title, value: rows[0]?.trim(), label, hint, data: [...(rows[2] ?? "").trim()].map((char) => SPARK.indexOf(char)) },
    }
  }
  if (!sparkRe.test((rows[0] ?? "").trim()) || rows.length > 2) return null
  return { slug: "graph-spark", props: { title, data: [...(rows[0] ?? "").trim()].map((char) => SPARK.indexOf(char)), caption: rows[1]?.trim() } }
}

/* ---- tables ---------------------------------------------------------- */

const tableRule = /^-+(?:-\+-+)+$/
const boardRule = /^-+(?: \| -+)+$/

function cellsOfLine(line: string) {
  return line.split(" | ")
}

/** Left or right per column: a short cell padded on the left is right-aligned. */
function alignFromCells(rows: string[][], widths: number[]) {
  const count = Math.max(0, ...rows.map((row) => row.length))
  return Array.from({ length: count }, (_, index) => {
    let right = 0
    let left = 0
    for (const row of rows) {
      const cell = row[index] ?? ""
      const text = cell.trim()
      if (!text || text.length >= (widths[index] ?? 0)) continue
      if (/^\s/.test(cell)) right += 1
      else left += 1
    }
    return right > left ? "right" : left > right ? "left" : index === 0 ? "left" : "right"
  })
}

const board: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  if (!boardRule.test((rows[1] ?? "").trim())) return null
  const heads = cellsOfLine(rows[0] ?? "")
  const widths = (rows[1] ?? "").split(" | ").map((part) => part.length)
  const columns = heads.map((head) => {
    const match = head.trim().match(/^(.*?)\s{2}(\d+)$/)
    return { title: (match?.[1] ?? head).trim(), items: [] as { label: string; state?: string; note?: string }[] }
  })
  for (const line of rows.slice(2)) {
    let at = 0
    widths.forEach((width, index) => {
      const cell = line.slice(at, at + width)
      at += width + 3
      const text = cell.trimEnd()
      if (!text.trim()) return
      const column = columns[index]
      if (!column) return
      const item = text.match(/^([●-]) (.*)$/)
      if (item) column.items.push({ label: (item[2] ?? "").trim(), state: item[1] === "●" ? "now" : undefined })
      else {
        const last = column.items[column.items.length - 1]
        if (last) last.label = `${last.label} ${text.trim()}`
      }
    })
  }
  return { slug: "graph-board", props: { title, columns } }
}

const tables: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const ruleAt = rows.findIndex((line) => tableRule.test(line.trim()))
  if (ruleAt < 0) return null

  // Invoice: parties / meta blocks before the grid, totals after.
  if (/^FROM\b|^BILL TO\b|^\s*Description\s*\|/.test(rows[0] ?? "") || /^Description\s+\|/.test(rows[ruleAt - 1] ?? "")) {
    return invoice(lines, title)
  }

  const header = cellsOfLine(rows[ruleAt - 1] ?? "")
  const after = rows.slice(ruleAt + 1)
  const body: string[][] = []
  const sections: { title: string; rows: string[][] }[] = []
  let footer: string[] | undefined
  let current: { title: string; rows: string[][] } | null = null
  let sawSection = false
  for (let index = 0; index < after.length; index += 1) {
    const line = after[index] ?? ""
    if (tableRule.test(line.trim())) {
      const next = after[index + 1]
      if (next != null && !next.includes(" | ")) continue // section break
      if (next != null && index + 2 === after.length) {
        footer = cellsOfLine(next)
        index += 1
      }
      continue
    }
    if (!line.includes(" | ")) {
      sawSection = true
      current = { title: line.trim(), rows: [] }
      sections.push(current)
      continue
    }
    const cells = cellsOfLine(line)
    if (current) current.rows.push(cells)
    else body.push(cells)
  }

  const all = [header, ...body, ...sections.flatMap((section) => section.rows), ...(footer ? [footer] : [])]
  const widths = (rows[ruleAt] ?? "").trim().split("-+-").map((part) => part.length)
  const align = alignFromCells(all.slice(1), widths)
  const trim = (row: string[]) => row.map((cell) => cell.trim())

  if (sawSection) {
    return {
      slug: "graph-sheet",
      props: { title, headers: trim(header), align, sections: sections.map((section) => ({ title: section.title, rows: section.rows.map(trim) })), footer: footer && trim(footer) },
    }
  }

  const labeled = (header[0] ?? "").trim() === ""
  if (labeled) {
    const values = body.flatMap((row) => trim(row).slice(1))
    if (values.every((value) => /^-?[\d.,]+%?$/.test(value) || value === "")) {
      return {
        slug: "graph-matrix",
        props: { title, columns: trim(header).slice(1), rows: body.map((row) => ({ label: (row[0] ?? "").trim(), values: trim(row).slice(1).map((value) => (/^-?[\d.,]+$/.test(value) ? numberOf(value) : value)) })) },
      }
    }
    return {
      slug: "graph-compare",
      props: {
        title,
        columns: trim(header).slice(1),
        rows: body.map((row) => ({ label: (row[0] ?? "").trim(), values: trim(row).slice(1).map((value) => (value === "✓" ? true : value === "–" ? false : value)) })),
      },
    }
  }

  return { slug: "graph-table", props: { title, headers: trim(header), rows: body.map(trim), footer: footer && trim(footer), align } }
}

function invoice(lines: Lines, title?: string): Detected | null {
  const blocks = blocksOf(lines)
  let from: { name: string; lines: string[] } | undefined
  let to: { name: string; lines: string[] } | undefined
  let meta: { label: string; value: string }[] | undefined
  let index = 0
  const first = blocks[0] ?? []
  if (/^(FROM|BILL TO)\b/.test(first[0] ?? "")) {
    const split = (first[0] ?? "").search(/BILL TO/)
    const column = (line: string, left: boolean) => (split > 0 ? (left ? line.slice(0, split) : line.slice(split)) : left ? line : "").trim()
    const fromLines = first.map((line) => column(line, true)).filter(Boolean)
    const toLines = first.map((line) => column(line, false)).filter(Boolean)
    if (fromLines[0] === "FROM") from = { name: fromLines[1] ?? "", lines: fromLines.slice(2) }
    if (toLines[0] === "BILL TO") to = { name: toLines[1] ?? "", lines: toLines.slice(2) }
    index = 1
  }
  const metaBlock = blocks[index] ?? []
  if (metaBlock.length === 2 && !metaBlock[0]?.includes(" | ")) {
    const starts = [...(metaBlock[0] ?? "").matchAll(/\S+(?: \S+)*/g)].map((match) => match.index ?? 0)
    meta = starts.map((start, at) => {
      const end = starts[at + 1]
      return { label: (metaBlock[0] ?? "").slice(start, end).trim(), value: (metaBlock[1] ?? "").slice(start, end).trim() }
    })
    index += 1
  }
  const rest = blocks.slice(index).flat()
  const ruleAt = rest.findIndex((line) => tableRule.test(line.trim()))
  if (ruleAt < 1) return null
  const header = cellsOfLine(rest[ruleAt - 1] ?? "").map((cell) => cell.trim().toLowerCase())
  const items: { description: string; qty?: string; rate?: string; amount: string }[] = []
  const totals: { label: string; value: string }[] = []
  let note: string | undefined
  let inTotals = false
  for (const line of rest.slice(ruleAt + 1)) {
    if (tableRule.test(line.trim())) {
      inTotals = true
      continue
    }
    if (!inTotals && line.includes(" | ")) {
      const cells = cellsOfLine(line).map((cell) => cell.trim())
      const at = (name: string) => header.indexOf(name)
      items.push({
        description: cells[0] ?? "",
        qty: at("qty") >= 0 ? cells[at("qty")] : undefined,
        rate: at("rate") >= 0 ? cells[at("rate")] : undefined,
        amount: cells[at("amount") >= 0 ? at("amount") : cells.length - 1] ?? "",
      })
      continue
    }
    const total = line.trim().match(/^(.*?)\s{2,}(\S+)$/)
    if (inTotals && total && /^\s/.test(line)) {
      totals.push({ label: (total[1] ?? "").trim(), value: total[2] ?? "" })
      continue
    }
    note = note ? `${note} ${line.trim()}` : line.trim()
  }
  return { slug: "graph-invoice", props: { title, from, to, meta, items, totals, note } }
}

const slope: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const re = /^(.*?)\s{2,}(-?[\d.,]+)\s{2}([→–])\s{2}\s*(-?[\d.,]+)$/
  const body = rows.slice(1)
  if (body.length === 0 || !body.every((line) => re.test(line))) return null
  const [fromLabel = "", toLabel = ""] = splitCols(rows[0] ?? "")
  return {
    slug: "graph-slope",
    props: {
      title,
      fromLabel,
      toLabel,
      items: body.map((line) => {
        const match = line.match(re)!
        return { label: (match[1] ?? "").trim(), from: numberOf(match[2]), to: numberOf(match[4]) }
      }),
    },
  }
}

const diff: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const re = /^([+\- ]) (\S.*?)(?:\s{2,}(\S.*))?$/
  if (rows.length === 0 || !rows.every((line) => isRule(line) || re.test(line))) return null
  if (!rows.some((line) => /^[+\-] \S/.test(line) && !isRule(line)) && !rows.some(isRule)) return null
  const ruleAt = rows.findIndex(isRule)
  const sign = (char: string) => (char === "+" ? "add" : char === "-" ? "remove" : "keep")
  const toRow = (line: string) => {
    const match = line.match(re)!
    return { label: (match[2] ?? "").trim(), value: (match[3] ?? "").trim(), sign: sign(match[1] ?? " ") }
  }
  const body = (ruleAt >= 0 ? rows.slice(0, ruleAt) : rows).map(toRow)
  const footer = ruleAt >= 0 && rows[ruleAt + 1] ? toRow(rows[ruleAt + 1]!) : undefined
  return { slug: "graph-diff", props: { title, rows: body, footer } }
}

const flow: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  if (rows.length === 0 || !rows.every((line) => /\S\s*(→|->|=>)\s*\S/.test(line))) return null
  if (rows.some((line) => /\d\s{2}→\s{2}/.test(line))) return null
  return {
    slug: "graph-flow",
    props: { title, rows: rows.map((line) => ({ nodes: line.split(/\s*(?:→|->|=>)\s*/).map((label) => ({ label: label.trim() })) })) },
  }
}

const calendar: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const head = (rows[0] ?? "").trim().split(/\s+/)
  if (head.length !== 7 || !head.every((letter) => /^[SMTWF]$/.test(letter))) return null
  const weekStartsOn = head[0] === "M" ? 1 : 0
  const marks: { day: number; label?: string; accent?: boolean }[] = []
  let today: number | undefined
  const notesStart = rows.findIndex((line, index) => index > 0 && /^\s*\[?\*?\d{1,2}\]?\s{2,}\S/.test(line) && !/\d\s+\d/.test(line.trim()))
  const grid = rows.slice(1, notesStart > 0 ? notesStart : undefined)
  for (const line of grid) {
    for (const token of line.trim().split(/\s+/)) {
      const value = token.match(/^(\[)?(\*)?(\d{1,2})\]?$/)
      if (!value) continue
      const day = Number(value[3])
      if (value[1]) today = day
      if (value[2]) marks.push({ day })
    }
  }
  if (notesStart > 0) {
    for (const line of rows.slice(notesStart)) {
      const note = line.trim().match(/^\[?\*?(\d{1,2})\]?\s{2,}(.*)$/)
      if (!note) continue
      const day = Number(note[1])
      const existing = marks.find((mark) => mark.day === day)
      if (existing) existing.label = note[2]
      else marks.push({ day, label: note[2] })
    }
  }
  const named = (title ?? "").match(/^([A-Za-z]+)\s+(\d{4})$/)
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
  const month = named ? months.indexOf((named[1] ?? "").slice(0, 3).toLowerCase()) + 1 : undefined
  return {
    slug: "graph-calendar",
    props: { title: named ? undefined : title, year: named ? Number(named[2]) : undefined, month: month && month > 0 ? month : undefined, weekStartsOn, marks, today },
  }
}

const heatmap: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const legendAt = rows.findIndex((line) => /Less .+ More/.test(line))
  const grid = rows.slice(1, legendAt >= 0 ? legendAt : undefined)
  const shade = new RegExp(`^(\\S.*?)\\s{2,}([${SHADE.join("")}](?:\\s+[${SHADE.join("")}])*)\\s*$`)
  if (grid.length === 0 || !grid.every((line) => shade.test(line))) return null
  if (rows.some((line) => /^[MWF ]\s{2}/.test(line)) && rows.some((line) => /from \d{4}-/.test(line))) return null
  const columns = (rows[0] ?? "").trim().split(/\s+/)
  const legend = legendAt >= 0 ? rows[legendAt] ?? "" : ""
  const caption = legend.replace(/\s*Less .+ More\s*/, "").trim() || undefined
  return {
    slug: "graph-heatmap",
    props: {
      title,
      columns,
      caption,
      max: 4,
      rows: grid.map((line) => {
        const match = line.match(shade)!
        return { label: (match[1] ?? "").trim(), values: (match[2] ?? "").split(/\s+/).map((glyph) => Math.max(0, SHADE.indexOf(glyph))) }
      }),
    },
  }
}

const activity: Detector = (lines, title) => {
  const fromLine = lines.find((line) => /from (\d{4}-\d{2}-\d{2})/.test(line))
  const dayRows = lines.filter((line) => /^[MWF ] {2}[·░▒▓█ ]+$/.test(line))
  if (!fromLine || dayRows.length < 3) return null
  const from = fromLine.match(/from (\d{4}-\d{2}-\d{2})/)?.[1] ?? ""
  const grid = lines.filter((line) => /^[MWF ] {2}/.test(line) && !/^\s+[A-Z][a-z]{2}/.test(line)).slice(0, 7)
  const weeks = Math.max(...grid.map((line) => line.length - 3))
  const start = Date.parse(`${from}T00:00:00Z`)
  const days: { date: string; count: number }[] = []
  const firstCol = grid.map((line) => line[3]).findIndex((char) => char != null && char !== " ")
  for (let week = 0; week < weeks; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const glyph = grid[day]?.[3 + week]
      if (glyph == null || glyph === " ") continue
      const offset = week * 7 + day - Math.max(0, firstCol)
      days.push({ date: new Date(start + offset * 86_400_000).toISOString().slice(0, 10), count: Math.max(0, SHADE.indexOf(glyph)) })
    }
  }
  const caption = fromLine.split(/\s{2,}/)[0]?.trim()
  return { slug: "graph-activity", props: { title, days, max: 4, weekStartsOn: grid[0]?.startsWith("M") ? 1 : 0, caption: caption && !caption.startsWith("from") ? caption : undefined } }
}

const plot: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const chart = rows.filter((line) => /^\s*-?[\d.]*\s\|\s?/.test(line))
  if (chart.length < 2) return null
  const gutter = (chart[0] ?? "").indexOf("|")
  const height = chart.length
  const width = Math.max(...chart.map((line) => line.length - gutter - 2))
  const top = numberOf((chart[0] ?? "").slice(0, gutter))
  const bottom = numberOf((chart[height - 1] ?? "").slice(0, gutter))
  const data = Array.from({ length: width }, (_, column) => {
    for (let row = 0; row < height; row += 1) {
      if ((chart[row] ?? "")[gutter + 2 + column] === "█") {
        const level = height - 1 - row
        return bottom + (level / Math.max(1, height - 1)) * (top - bottom)
      }
    }
    return bottom
  })
  const labelLine = rows[rows.length - 1] ?? ""
  const labels = chart.includes(labelLine) ? undefined : splitCols(labelLine).filter((label) => !/^\+-/.test(label))
  return { slug: "graph-plot", props: { title, height, data: data.map((value) => Math.round(value * 10) / 10), labels: labels && labels.length > 0 ? labels : undefined } }
}

const stat: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  if (rows.length < 2 || rows.length > 3) return null
  const starts = [...(rows[0] ?? "").matchAll(/\S+(?: \S+)?/g)].map((match) => match.index ?? 0)
  if (starts.length === 0 || !/\d/.test(rows[0] ?? "")) return null
  if (!rows.every((line) => line.split(/\s{3,}/).length <= starts.length)) return null
  const cell = (line: string, at: number) => line.slice(starts[at], starts[at + 1]).trim()
  return {
    slug: "graph-stat",
    props: {
      title,
      items: starts.map((_, at) => ({ value: cell(rows[0] ?? "", at), label: cell(rows[1] ?? "", at), hint: rows[2] ? cell(rows[2], at) || undefined : undefined })),
    },
  }
}

const spec: Detector = (lines, title) => {
  const rows = nonEmpty(lines)
  const re = /^(\S.*?)\s{2,}(\S.*)$/
  if (rows.length === 0 || !re.test(rows[0] ?? "")) return null
  const column = (rows[0] ?? "").search(/\s{2,}\S/) + ((rows[0] ?? "").slice((rows[0] ?? "").search(/\s{2,}\S/)).match(/^\s+/)?.[0].length ?? 0)
  const out: { label: string; value: string; note?: string }[] = []
  for (const line of rows) {
    const match = line.match(re)
    if (match && !line.startsWith(" ")) {
      out.push({ label: (match[1] ?? "").trim(), value: (match[2] ?? "").trim() })
      continue
    }
    if (line.startsWith(" ".repeat(Math.max(1, column - 1))) && out.length > 0) {
      const last = out[out.length - 1]!
      last.note = last.note ? `${last.note} ${line.trim()}` : line.trim()
      continue
    }
    return null
  }
  return { slug: "graph-spec", props: { title, rows: out } }
}

/* ---- entry ----------------------------------------------------------- */

const DETECTORS: Detector[] = [
  time,
  check,
  keys,
  annotate,
  rank,
  meter,
  score,
  tree,
  changelog,
  dotted,
  steps,
  faq,
  chat,
  env,
  endpoint,
  callout,
  quote,
  terminal,
  uptime,
  waffle,
  cellsGrid,
  bars,
  stack,
  gantt,
  waterfallOrFunnel,
  spark,
  board,
  tables,
  slope,
  diff,
  calendar,
  activity,
  heatmap,
  plot,
  flow,
  stat,
  spec,
]

const TITLE_HINTS: Record<string, string> = {
  shell: "terminal",
  terminal: "terminal",
  ".env": "env",
  env: "env",
  faq: "faq",
  endpoint: "endpoint",
  keys: "keys",
  shortcuts: "keys",
  chat: "chat",
  decision: "decision",
  changelog: "changelog",
  steps: "steps",
  code: "annotate",
}

/** Lines → component. `hint` forces a type (from ```mdx gantt). */
export function detectLines(lines: Lines, title?: string, hint?: string): Detected {
  if (hint) {
    const forced = findSpec(hint)
    if (forced) {
      for (const detector of DETECTORS) {
        const found = detector(lines, title)
        if (found && found.slug === forced.slug) return found
      }
      return { slug: forced.slug, props: { title, body: lines.join("\n") } }
    }
  }
  for (const detector of DETECTORS) {
    try {
      const found = detector(lines, title)
      if (found) return clean(found)
    } catch {
      // A detector that trips over odd input just passes.
    }
  }
  const named = TITLE_HINTS[(title ?? "").toLowerCase()]
  if (named) return { slug: named, props: { title, body: lines.join("\n") } }
  return { slug: "frame", props: { title, lines } }
}

/** A whole frame (with borders) → component. */
export function detectAscii(source: string, hint?: string): Detected {
  const { title, lines } = readFrame(source)
  return detectLines(lines, title, hint)
}

function clean(found: Detected): Detected {
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(found.props)) if (value !== undefined) props[key] = value
  return { slug: found.slug, props }
}
