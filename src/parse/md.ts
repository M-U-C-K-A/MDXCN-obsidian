/*
 * A small block-level Markdown reader. It returns just enough structure for
 * the mdxcn grammar: paragraphs, headings, lists (nested, loose, tasks),
 * GFM tables, fences, quotes. Inline text stays raw so marks survive.
 */

export type Align = "left" | "right" | "center"

export type Paragraph = { type: "p"; text: string }
export type Heading = { type: "heading"; level: number; text: string }
export type CodeBlock = { type: "code"; lang: string; text: string }
export type Table = {
  type: "table"
  headers: string[]
  align: (Align | undefined)[]
  rows: string[][]
}
export type Quote = { type: "quote"; blocks: Block[]; text: string }
export type Rule = { type: "hr" }
export type List = { type: "list"; ordered: boolean; start: number; items: ListItem[] }

export type Block = Paragraph | Heading | CodeBlock | Table | Quote | Rule | List

export interface ListItem {
  /** First paragraph (tight item: the whole text), raw inline Markdown. */
  head: string
  /** Blocks after the head, nested lists excluded. */
  body: Block[]
  /** Nested lists. */
  lists: List[]
  /** Every block in the item. */
  blocks: Block[]
  /** `[x]` → true, `[ ]` → false, no box → null. */
  task: boolean | null
  /** The item source, de-indented. */
  raw: string
}

const FENCE = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)?.*$/
const HEADING = /^\s{0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^\s{0,3}>\s?/
const MARKER = /^(\s*)([-*+]|\d{1,9}[.)])(?:(\s+)(.*)|$)$/
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

function expandTabs(line: string) {
  return line.replace(/^\t+/, (tabs) => "    ".repeat(tabs.length))
}

function isBlank(line: string | undefined) {
  return line == null || line.trim() === ""
}

function indentOf(line: string) {
  return line.length - line.trimStart().length
}

type Marker = {
  indent: number
  marker: string
  ordered: boolean
  content: string
  offset: number
  number: number
}

function marker(line: string): Marker | null {
  if (RULE.test(line)) return null
  const match = line.match(MARKER)
  if (!match) return null
  const indent = (match[1] ?? "").length
  const mark = match[2] ?? "-"
  const spaces = (match[3] ?? "").length
  const content = match[4] ?? ""
  const ordered = /\d/.test(mark)
  const gap = spaces === 0 || spaces > 4 ? 1 : spaces
  return {
    indent,
    marker: mark,
    ordered,
    content: spaces > 4 ? " ".repeat(spaces - 1) + content : content,
    offset: indent + mark.length + gap,
    number: ordered ? Number.parseInt(mark, 10) : 0,
  }
}

function splitRow(line: string): string[] {
  let text = line.trim()
  if (text.startsWith("|")) text = text.slice(1)
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1)
  const cells: string[] = []
  let current = ""
  let code = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === "\\" && text[index + 1] === "|") {
      current += "|"
      index += 1
      continue
    }
    if (char === "`") code = !code
    if (char === "|" && !code) {
      cells.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function isTableStart(lines: string[], index: number) {
  const head = lines[index]
  const sep = lines[index + 1]
  if (head == null || sep == null) return false
  if (!head.includes("|")) return false
  if (!TABLE_SEP.test(sep) || !sep.includes("-")) return false
  return sep.includes("|") || head.trim().startsWith("|")
}

function startsBlock(lines: string[], index: number) {
  const line = lines[index] ?? ""
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    marker(line) != null ||
    isTableStart(lines, index)
  )
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n").map(expandTabs)
  return readBlocks(lines)
}

function readBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ""

    if (isBlank(line)) {
      index += 1
      continue
    }

    const fence = line.match(FENCE)
    if (fence) {
      const indent = (fence[1] ?? "").length
      const mark = fence[2] ?? "```"
      const body: string[] = []
      index += 1
      while (index < lines.length) {
        const current = lines[index] ?? ""
        const close = current.trim()
        if (close.startsWith(mark[0]!.repeat(mark.length)) && /^(`+|~+)$/.test(close) && close[0] === mark[0]) {
          index += 1
          break
        }
        body.push(current.slice(Math.min(indent, indentOf(current))))
        index += 1
      }
      blocks.push({ type: "code", lang: fence[3] ?? "", text: body.join("\n") })
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      blocks.push({ type: "heading", level: (heading[1] ?? "#").length, text: (heading[2] ?? "").trim() })
      index += 1
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ type: "hr" })
      index += 1
      continue
    }

    if (isTableStart(lines, index)) {
      const headers = splitRow(line)
      const align = splitRow(lines[index + 1] ?? "").map((cell): Align | undefined => {
        const left = cell.startsWith(":")
        const right = cell.endsWith(":")
        if (left && right) return "center"
        if (right) return "right"
        if (left) return "left"
        return undefined
      })
      const rows: string[][] = []
      index += 2
      while (index < lines.length && !isBlank(lines[index]) && (lines[index] ?? "").includes("|")) {
        rows.push(splitRow(lines[index] ?? ""))
        index += 1
      }
      blocks.push({ type: "table", headers, align, rows })
      continue
    }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (index < lines.length) {
        const current = lines[index] ?? ""
        if (QUOTE.test(current)) {
          inner.push(current.replace(QUOTE, ""))
        } else if (!isBlank(current) && inner.length > 0 && !isBlank(inner[inner.length - 1]) && !startsBlock(lines, index)) {
          inner.push(current)
        } else {
          break
        }
        index += 1
      }
      const text = inner.join("\n")
      blocks.push({ type: "quote", blocks: readBlocks(inner), text })
      continue
    }

    const first = marker(line)
    if (first) {
      const [list, next] = readList(lines, index, first)
      blocks.push(list)
      index = next
      continue
    }

    const para: string[] = []
    while (index < lines.length && !isBlank(lines[index])) {
      if (para.length > 0 && startsBlock(lines, index)) {
        // A numbered line only interrupts a paragraph when it starts at 1.
        const mark = marker(lines[index] ?? "")
        if (!(mark && mark.ordered && mark.number !== 1)) break
      }
      para.push((lines[index] ?? "").trim())
      index += 1
    }
    blocks.push({ type: "p", text: para.join("\n") })
  }

  return blocks
}

function readList(lines: string[], start: number, first: Marker): [List, number] {
  const items: ListItem[] = []
  let index = start

  while (index < lines.length) {
    const head = marker(lines[index] ?? "")
    if (!head || head.ordered !== first.ordered || head.indent > first.indent + 3 || head.indent < first.indent) {
      break
    }

    const content: string[] = [head.content]
    index += 1

    while (index < lines.length) {
      const line = lines[index] ?? ""

      if (isBlank(line)) {
        let ahead = index
        while (ahead < lines.length && isBlank(lines[ahead])) ahead += 1
        const next = lines[ahead]
        if (next != null && indentOf(next) >= head.offset) {
          for (let blank = index; blank < ahead; blank += 1) content.push("")
          index = ahead
          continue
        }
        break
      }

      const indent = indentOf(line)
      const nested = marker(line)
      if (indent >= head.offset || (nested && indent > head.indent)) {
        content.push(line.slice(Math.min(indent, head.offset)))
        index += 1
        continue
      }

      if (nested) break

      const previous = content[content.length - 1]
      if (!isBlank(previous) && !startsBlock(lines, index)) {
        content.push(line.trim())
        index += 1
        continue
      }

      break
    }

    items.push(makeItem(content))

    let ahead = index
    while (ahead < lines.length && isBlank(lines[ahead])) ahead += 1
    const sibling = ahead < lines.length ? marker(lines[ahead] ?? "") : null
    if (sibling && sibling.ordered === first.ordered && sibling.indent >= first.indent && sibling.indent <= first.indent + 3) {
      index = ahead
      continue
    }
    break
  }

  return [{ type: "list", ordered: first.ordered, start: first.number || 1, items }, index]
}

function makeItem(content: string[]): ListItem {
  const raw = content.join("\n").replace(/\s+$/, "")
  const blocks = readBlocks(content)
  let task: boolean | null = null
  const firstBlock = blocks[0]

  if (firstBlock?.type === "p") {
    const box = firstBlock.text.match(/^\[([ xX])\](?:\s+|$)/)
    if (box) {
      task = (box[1] ?? " ").toLowerCase() === "x"
      blocks[0] = { type: "p", text: firstBlock.text.slice(box[0].length) }
    }
  }

  const lead = blocks[0]
  const head = lead?.type === "p" ? lead.text : ""
  const rest = lead?.type === "p" ? blocks.slice(1) : blocks
  return {
    head,
    body: rest.filter((block) => block.type !== "list"),
    lists: blocks.filter((block): block is List => block.type === "list"),
    blocks,
    task,
    raw,
  }
}

/* ---- queries --------------------------------------------------------- */

/** Items of the top-level lists (all of them, in order). */
export function listItems(blocks: Block[]): ListItem[] {
  return blocks.filter((block): block is List => block.type === "list").flatMap((list) => list.items)
}

export function firstOf<T extends Block["type"]>(blocks: Block[], type: T): Extract<Block, { type: T }> | undefined {
  return blocks.find((block) => block.type === type) as Extract<Block, { type: T }> | undefined
}

export function allOf<T extends Block["type"]>(blocks: Block[], type: T): Extract<Block, { type: T }>[] {
  return blocks.filter((block) => block.type === type) as Extract<Block, { type: T }>[]
}

/** `### Title` followed by blocks — Sheet, Board. */
export function headingSections(blocks: Block[]): { title: string; blocks: Block[] }[] {
  const sections: { title: string; blocks: Block[] }[] = []
  for (const block of blocks) {
    if (block.type === "heading") {
      sections.push({ title: block.text, blocks: [] })
      continue
    }
    sections[sections.length - 1]?.blocks.push(block)
  }
  return sections
}

/** Serialize blocks back to Markdown (for prose bodies rendered by Obsidian). */
export function toMarkdown(blocks: Block[]): string {
  return blocks.map(blockMarkdown).join("\n\n")
}

function blockMarkdown(block: Block): string {
  switch (block.type) {
    case "p":
      return block.text
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`
    case "hr":
      return "---"
    case "code":
      return `\`\`\`${block.lang}\n${block.text}\n\`\`\``
    case "quote":
      return block.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
    case "table": {
      const sep = block.headers.map((_, index) => {
        const align = block.align[index]
        return align === "right" ? "---:" : align === "center" ? ":---:" : align === "left" ? ":---" : "---"
      })
      return [block.headers, sep, ...block.rows].map((row) => `| ${row.join(" | ")} |`).join("\n")
    }
    case "list":
      return block.items
        .map((item, index) => {
          const mark = block.ordered ? `${block.start + index}.` : "-"
          const pad = " ".repeat(mark.length + 1)
          const box = item.task == null ? "" : item.task ? "[x] " : "[ ] "
          const lines = `${box}${item.raw.replace(/^\[[ xX]\]\s+/, "")}`.split("\n")
          return lines.map((line, at) => (at === 0 ? `${mark} ${line}` : line ? pad + line : line)).join("\n")
        })
        .join("\n")
  }
}

/** All text of a block tree, marks kept (React's `sourceText`). */
export function sourceOf(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "p":
        case "heading":
          return block.text
        case "code":
          return block.text
        case "quote":
          return sourceOf(block.blocks)
        case "table":
          return [block.headers, ...block.rows].map((row) => row.join(" ")).join("\n")
        case "list":
          return block.items.map((item) => item.raw).join("\n")
        case "hr":
          return ""
      }
    })
    .join("\n")
}

/** Text of an item, nested lists ignored (React's `itemText`, marks kept). */
export function itemSource(item: ListItem): string {
  return [item.head, ...item.body.map((block) => (block.type === "p" ? block.text : ""))].filter(Boolean).join(" ")
}
