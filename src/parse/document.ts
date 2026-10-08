/*
 * One ```mdx block → a list of figures. Four ways in, all official mdxcn
 * syntaxes plus one shortcut:
 *
 *   ASCII    the fenced frame from mdxcn.dev (`+--- [ TITLE ] ---+`)
 *   MDX      `<GraphGantt title="LAUNCH">…markdown children…</GraphGantt>`
 *   Comark   `::graph-gantt{title="LAUNCH"} … ::` with optional YAML props
 *   Short    ```mdx gantt — the info string names the graph, the body is the
 *            markdown children (optional `---` YAML on top)
 */

import { isTopLine, splitFrames } from "../ascii"
import { findSpec, ITEM_TAGS } from "../registry"
import type { AnySpec } from "../types"
import { detectAscii, detectLines } from "./ascii-detect"
import { isObject, str, words } from "./inline"
import { matchBrace, parseAttributes } from "./literal"

export type Syntax = "ascii" | "mdx" | "comark" | "short" | "markdown"

export type DocNode =
  | { kind: "graph"; spec: AnySpec; props: Record<string, unknown>; body: string; syntax: Syntax }
  | { kind: "row"; cols: number; children: DocNode[] }
  | { kind: "markdown"; text: string }
  | { kind: "error"; message: string; source: string }

export type YamlParser = (text: string) => unknown

let yamlParser: YamlParser = simpleYaml

/** Obsidian injects its own `parseYaml`; tests use the small reader below. */
export function setYamlParser(parser: YamlParser) {
  yamlParser = parser
}

export interface ParseOptions {
  /** Second word of the info string: ```mdx gantt. */
  hint?: string
}

export function parseDocument(raw: string, options: ParseOptions = {}): DocNode[] {
  const source = unwrapFence(raw.replace(/\r\n?/g, "\n"))
  const trimmed = source.trim()
  if (!trimmed) {
    const spec = findSpec(options.hint)
    return spec ? [{ kind: "graph", spec, props: {}, body: spec.template.body, syntax: "short" }] : []
  }

  if (/^<[A-Z]/.test(trimmed)) return parseJsx(source)
  if (/^:{2,}[A-Za-z]/.test(trimmed)) return parseComark(source)
  if (isTopLine(trimmed.split("\n")[0] ?? "")) return parseAsciiDoc(source, options.hint)

  const spec = findSpec(options.hint)
  if (spec) {
    const { props, body } = frontmatter(source)
    return [{ kind: "graph", spec, props, body, syntax: "short" }]
  }

  // No frame, no tag: maybe the inside of a frame was pasted on its own.
  if (/[█░▒▓●○├└│▾▁▂▃▄▅▆▇]|\[[ x]\]\s{2}|\[[=\-|]{4,}\]/.test(trimmed)) {
    const found = detectLines(source.split("\n"))
    const detected = findSpec(found.slug)
    if (detected && found.slug !== "frame" && found.slug !== "graph-spec") {
      return [{ kind: "graph", spec: detected, props: found.props, body: "", syntax: "ascii" }]
    }
  }

  const { props, body } = frontmatter(source)
  return [{ kind: "graph", spec: findSpec("frame")!, props, body, syntax: "markdown" }]
}

/** A pasted ``` fence inside the block (as in the mdxcn docs) is unwrapped. */
function unwrapFence(source: string) {
  const lines = source.split("\n")
  const first = lines.findIndex((line) => line.trim() !== "")
  let last = lines.length - 1
  while (last > first && lines[last]?.trim() === "") last -= 1
  if (first >= 0 && last > first && /^(`{3,}|~{3,})\s*(text|txt|ascii|md|markdown)?\s*$/.test(lines[first]?.trim() ?? "") && /^(`{3,}|~{3,})$/.test(lines[last]?.trim() ?? "")) {
    return lines.slice(first + 1, last).join("\n")
  }
  return source
}

/* ---- ASCII ----------------------------------------------------------- */

function parseAsciiDoc(source: string, hint?: string): DocNode[] {
  const nodes: DocNode[] = []
  for (const part of splitFrames(source)) {
    if (part.before.trim()) nodes.push({ kind: "markdown", text: part.before.trim() })
    if (!part.frame) continue
    const found = detectAscii(part.frame, hint)
    const spec = findSpec(found.slug)
    if (spec) nodes.push({ kind: "graph", spec, props: found.props, body: str(found.props.__body), syntax: "ascii" })
  }
  return nodes
}

/* ---- YAML frontmatter ------------------------------------------------- */

export function frontmatter(source: string): { props: Record<string, unknown>; body: string } {
  const match = source.match(/^\s*---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)
  if (!match) return { props: {}, body: source.replace(/^\n+/, "").replace(/\s+$/, "") }
  let props: Record<string, unknown> = {}
  try {
    const parsed = yamlParser(match[1] ?? "")
    if (isObject(parsed)) props = parsed
  } catch {
    props = {}
  }
  return { props, body: source.slice(match[0].length).replace(/^\n+/, "").replace(/\s+$/, "") }
}

/* ---- Comark ---------------------------------------------------------- */

const OPEN = /^\s*(:{2,})([A-Za-z][\w-]*)\s*(\{.*\})?\s*(.*)$/
const CLOSE = /^\s*:{2,}\s*$/

function parseComark(source: string): DocNode[] {
  const lines = source.split("\n")
  const nodes: DocNode[] = []
  let loose: string[] = []
  let index = 0

  const flush = () => {
    if (loose.join("").trim()) nodes.push({ kind: "markdown", text: loose.join("\n").trim() })
    loose = []
  }

  while (index < lines.length) {
    const line = lines[index] ?? ""
    const open = line.match(OPEN)
    if (!open) {
      loose.push(line)
      index += 1
      continue
    }
    flush()
    const inner: string[] = []
    let depth = 1
    index += 1
    while (index < lines.length) {
      const current = lines[index] ?? ""
      if (OPEN.test(current)) depth += 1
      else if (CLOSE.test(current)) {
        depth -= 1
        if (depth === 0) {
          index += 1
          break
        }
      }
      inner.push(current)
      index += 1
    }
    nodes.push(comarkNode(open[2] ?? "", open[3], open[4] ?? "", inner.join("\n")))
  }
  flush()
  return nodes
}

function comarkNode(name: string, attrs: string | undefined, rest: string, inner: string): DocNode {
  const attributes = attrs ? parseAttributes(attrs.slice(1, -1)) : {}
  if (/^(graph-)?row$|^grid$|^columns$/i.test(name)) {
    return { kind: "row", cols: Number(attributes.cols ?? 2) || 2, children: parseComark(inner) }
  }
  const spec = findSpec(name)
  if (!spec) return { kind: "error", message: `Unknown component "${name}"`, source: inner }
  const { props, body } = frontmatter(inner)
  const merged: Record<string, unknown> = { ...attributes, ...props }
  if (rest.trim() && merged.title == null) merged.title = rest.trim()
  return { kind: "graph", spec, props: merged, body, syntax: "comark" }
}

/* ---- MDX / JSX --------------------------------------------------------- */

interface Element {
  name: string
  attrs: Record<string, unknown>
  children: string
  start: number
  end: number
}

/** Read the element whose `<` is at `start`. */
function readElement(source: string, start: number): Element | null {
  const name = source.slice(start + 1).match(/^[A-Za-z][\w.]*/)?.[0]
  if (!name) return null
  let index = start + 1 + name.length
  let quote: string | null = null
  let attrEnd = -1
  let selfClosing = false
  while (index < source.length) {
    const char = source[index]
    if (quote) {
      if (char === quote) quote = null
      index += 1
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      index += 1
      continue
    }
    if (char === "{") {
      index = matchBrace(source, index) + 1
      continue
    }
    if (char === "/" && source[index + 1] === ">") {
      attrEnd = index
      selfClosing = true
      index += 2
      break
    }
    if (char === ">") {
      attrEnd = index
      index += 1
      break
    }
    index += 1
  }
  if (attrEnd < 0) return null
  const attrs = parseAttributes(source.slice(start + 1 + name.length, attrEnd))
  if (selfClosing) return { name, attrs, children: "", start, end: index }

  // Find the matching close tag, counting nested opens of the same name.
  const openRe = new RegExp(`<${name.replace(".", "\\.")}(?=[\\s/>])`, "g")
  const closeRe = new RegExp(`</${name.replace(".", "\\.")}\\s*>`, "g")
  let depth = 1
  let cursor = index
  while (depth > 0) {
    openRe.lastIndex = cursor
    closeRe.lastIndex = cursor
    const nextOpen = openRe.exec(source)
    const nextClose = closeRe.exec(source)
    if (!nextClose) return { name, attrs, children: source.slice(index), start, end: source.length }
    if (nextOpen && nextOpen.index < nextClose.index) {
      const inner = readElement(source, nextOpen.index)
      if (inner && inner.children === "" && source.slice(nextOpen.index, inner.end).endsWith("/>")) {
        cursor = inner.end
        continue
      }
      depth += 1
      cursor = nextOpen.index + 1
      continue
    }
    depth -= 1
    if (depth === 0) return { name, attrs, children: source.slice(index, nextClose.index), start, end: nextClose.index + nextClose[0].length }
    cursor = nextClose.index + nextClose[0].length
  }
  return null
}

function parseJsx(source: string): DocNode[] {
  const nodes: DocNode[] = []
  let index = 0
  let text = ""
  const flush = () => {
    if (text.trim()) nodes.push({ kind: "markdown", text: text.trim() })
    text = ""
  }
  while (index < source.length) {
    const at = source.slice(index).search(/<[A-Z]/)
    if (at < 0) {
      text += source.slice(index)
      break
    }
    text += source.slice(index, index + at)
    const element = readElement(source, index + at)
    if (!element) {
      text += source.slice(index + at, index + at + 1)
      index += at + 1
      continue
    }
    flush()
    nodes.push(jsxNode(element))
    index = element.end
  }
  flush()
  return nodes
}

function dedent(text: string) {
  const lines = text.replace(/^\n+/, "").replace(/\s+$/, "").split("\n")
  const indents = lines.filter((line) => line.trim()).map((line) => line.length - line.trimStart().length)
  const common = indents.length > 0 ? Math.min(...indents) : 0
  return lines.map((line) => line.slice(common)).join("\n")
}

function jsxNode(element: Element): DocNode {
  if (/^(GraphRow|Row|Grid|Columns)$/.test(element.name)) {
    return { kind: "row", cols: Number(element.attrs.cols ?? 2) || 2, children: parseJsx(element.children) }
  }
  const spec = findSpec(element.name)
  if (!spec) return { kind: "error", message: `Unknown component <${element.name}>`, source: element.children }
  const { items, body } = extractItems(element.children, spec.items ?? {})
  return { kind: "graph", spec, props: { ...element.attrs, ...items }, body: dedent(body), syntax: "mdx" }
}

/* Item tags (`<Span>`, `<Stat />`, `<Row>`) become data-form props. */

const NESTED: Record<string, string> = { Segment: "segments", Node: "children", Row: "rows", Cell: "cells", Task: "items" }

function itemObject(element: Element): unknown {
  const { items, body } = extractItems(element.children, NESTED)
  const text = dedent(body).trim()
  if (element.name === "Cell") return text
  const out: Record<string, unknown> = { ...element.attrs, ...items }
  if (text) out.children = text
  if (Array.isArray(out.rows)) out.rows = out.rows.map((row) => (isObject(row) ? (Array.isArray(row.cells) ? row.cells : words(str(row.children).replace(/\|/g, " "))) : row))
  if (element.name === "Node" && Array.isArray(items.children)) {
    out.children = items.children
    if (text) out.label = out.label ?? text
  }
  return out
}

function extractItems(source: string, map: Record<string, string>): { items: Record<string, unknown[]>; body: string } {
  const items: Record<string, unknown[]> = {}
  let body = ""
  let index = 0
  while (index < source.length) {
    const at = source.slice(index).search(/<[A-Z]/)
    if (at < 0) {
      body += source.slice(index)
      break
    }
    const start = index + at
    const name = source.slice(start + 1).match(/^[A-Za-z][\w.]*/)?.[0] ?? ""
    const key = map[name] ?? (ITEM_TAGS.has(name) ? name.toLowerCase() : undefined)
    const element = key ? readElement(source, start) : null
    if (!key || !element) {
      body += source.slice(index, start + 1)
      index = start + 1
      continue
    }
    body += source.slice(index, start)
    ;(items[key] ??= []).push(itemObject(element))
    index = element.end
  }
  return { items, body }
}

/* ---- a small YAML reader for tests (Obsidian uses its own) ---------- */

function simpleYaml(text: string): unknown {
  const out: Record<string, unknown> = {}
  for (const line of text.split("\n")) {
    const match = line.match(/^([\w-]+):\s*(.*)$/)
    if (!match) continue
    const value = (match[2] ?? "").trim()
    if (/^\[.*\]$/.test(value)) {
      out[match[1]!] = value
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
        .map((part) => (/^-?\d+(\.\d+)?$/.test(part) ? Number(part) : part))
    } else if (/^-?\d+(\.\d+)?$/.test(value)) out[match[1]!] = Number(value)
    else if (value === "true" || value === "false") out[match[1]!] = value === "true"
    else out[match[1]!] = value.replace(/^["']|["']$/g, "")
  }
  return out
}
