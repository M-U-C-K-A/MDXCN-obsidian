/*
 * Data: Table, Sheet, Compare, Matrix, Invoice, Spec, Stat, KPI, Diff.
 */

import { col, colWidth, dash, wrapText } from "../ascii"
import { cx, div, el, hidden, rise, rule, span, sr, vars } from "../dom"
import { DIM, SPARK, T, isMono, resolveGlyphs, seriesTone, tone } from "../glyphs"
import {
  bool,
  firstToken,
  flat,
  formatNumber,
  hasBold,
  hasCode,
  hasDel,
  isObject,
  numbers,
  optStr,
  plain,
  splitDash,
  splitLabel,
  str,
  tokenize,
  words,
} from "../parse/inline"
import { allOf, firstOf, headingSections, itemSource, listItems, toMarkdown, type Block, type Table } from "../parse/md"
import type { Common, Spec } from "../types"
import { base, entries, entryText } from "./shared"

type Align = "left" | "right"

/* ---- shared table reading --------------------------------------------- */

function isTotalRow(row: string[]) {
  const first = (row[0] ?? "").trim()
  const tokens = tokenize(first).filter((token) => !(token.kind === "text" && token.text.trim() === ""))
  return (tokens.length === 1 && tokens[0]?.kind === "strong") || /^total$/i.test(plain(first).trim())
}

function readTable(table: Table | undefined) {
  if (!table) return null
  const rows = table.rows
  const last = rows[rows.length - 1]
  const footer = last && rows.length > 1 && isTotalRow(last) ? last : undefined
  const align = table.align.some(Boolean)
    ? table.headers.map((_, index): Align => {
        const value = table.align[index]
        return value === "right" ? "right" : value === "left" || value === "center" ? "left" : index === 0 ? "left" : "right"
      })
    : undefined
  return {
    headers: table.headers,
    rows: footer ? rows.slice(0, -1) : rows,
    footer,
    align,
  }
}

/** Cells from an array, `a | b` text, or words. */
function cellsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((cell) => (typeof cell === "boolean" ? (cell ? "✓" : "–") : str(cell)))
  const text = str(value).trim()
  if (!text) return []
  if (text.includes("|")) return text.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim())
  return words(text)
}

function alignOf(value: unknown): Align[] | undefined {
  if (value == null) return undefined
  const list = words(value).map((entry): Align => (entry === "right" ? "right" : "left"))
  return list.length > 0 ? list : undefined
}

function side(align: Align[] | undefined, index: number): Align {
  return align?.[index] ?? (index === 0 ? "left" : "right")
}

/** Labeled table: first column is the row label (Compare, Matrix, Heatmap). */
export function labeledTable(blocks: Block[]) {
  const table = readTable(firstOf(blocks, "table"))
  if (!table || table.headers.length < 2) return null
  return {
    columns: table.headers.slice(1).map((header) => flat(header)),
    rows: [...table.rows, ...(table.footer ? [table.footer] : [])].map((row) => ({
      label: flat(row[0] ?? ""),
      values: row.slice(1),
    })),
  }
}

/** Item-tag rows from JSX (`<Row label="Pos">41 3</Row>`). */
function taggedRows(value: unknown): { label: string; text: string; cells?: unknown }[] {
  return entries(value).map((entry) => ({ label: str(entry.label), text: flat(str(entry.children)), cells: entry.cells }))
}

/* ---- Table ------------------------------------------------------------ */

interface TableData extends Common {
  headers: string[]
  rows: string[][]
  footer?: string[]
  align?: Align[]
}

function renderGrid(
  ctx: Parameters<Spec["render"]>[1],
  headers: string[],
  sections: { title?: string; rows: string[][] }[],
  footer: string[] | undefined,
  align: Align[] | undefined
) {
  ctx.body.addClass("mdxcn-pad-table")
  const scroll = div(ctx.body, "mdxcn-scroll-x")
  const table = el(scroll, "table", "mdxcn-table")
  const head = el(table, "thead")
  const headRow = el(head, "tr")
  headers.forEach((header, index) => {
    const th = el(headRow, "th", cx(T.fg, side(align, index) === "right" ? "is-right" : "is-left", index > 0 && "has-rule"))
    ctx.inline(th, header)
  })
  const ruleCell = el(el(head, "tr", "mdxcn-rule-row"), "th")
  ruleCell.colSpan = Math.max(1, headers.length)
  rule(ruleCell)

  let rowIndex = 0
  sections.forEach((section, sectionIndex) => {
    const body = el(table, "tbody")
    if (section.title != null) {
      if (sectionIndex > 0) {
        const cell = el(el(body, "tr", "mdxcn-rule-row is-section"), "td")
        cell.colSpan = Math.max(1, headers.length)
        rule(cell)
      }
      const title = el(el(body, "tr"), "td", cx("mdxcn-section-title", T.muted))
      title.colSpan = Math.max(1, headers.length)
      ctx.inline(title, section.title)
    }
    for (const row of section.rows) {
      const tr = rise(el(body, "tr"), rowIndex, 40)
      rowIndex += 1
      row.forEach((cell, index) => {
        const right = side(align, index) === "right"
        const td = el(tr, "td", cx(right ? "is-right mdxcn-num" : "is-left", index > 0 && "has-rule"))
        ctx.inline(td, cell)
      })
    }
  })

  if (footer) {
    const foot = el(table, "tfoot")
    const cell = el(el(foot, "tr", "mdxcn-rule-row is-foot"), "td")
    cell.colSpan = Math.max(1, headers.length)
    rule(cell)
    const tr = el(foot, "tr")
    footer.forEach((value, index) => {
      const right = side(align, index) === "right"
      const td = el(tr, "td", cx("is-foot", right ? "is-right mdxcn-num" : "is-left", index > 0 && "has-rule"))
      ctx.inline(td, value)
    })
  }
}

function gridLines(headers: string[], rows: string[][], footer?: string[], align?: Align[]) {
  const all = [headers, ...rows, ...(footer ? [footer] : [])].map((row) => row.map((cell) => plain(cell)))
  const count = Math.max(1, ...all.map((row) => row.length))
  const widths = Array.from({ length: count }, (_, index) => colWidth(all.map((row) => row[index] ?? "")))
  const cells = (row: string[]) =>
    Array.from({ length: count }, (_, index) => col(plain(row[index] ?? ""), widths[index] ?? 0, side(align, index))).join(" | ")
  const ruleLine = () => widths.map((width) => dash(width)).join("-+-")
  const lines = [cells(headers), ruleLine(), ...rows.map(cells)]
  if (footer) lines.push(ruleLine(), cells(footer))
  return { lines, cells, ruleLine }
}

export const table: Spec<TableData> = {
  slug: "graph-table",
  tag: "GraphTable",
  name: "Table",
  aliases: ["table", "graph-table", "spreadsheet"],
  group: "data",
  summary: "Numbers that belong in a spreadsheet.",
  notFor: "Grouped sections are Sheet. Label/value rows are Spec.",
  items: { Head: "__head", Row: "__rows", Foot: "__foot" },
  read({ props, blocks }) {
    const markdown = readTable(firstOf(blocks, "table"))
    const head = entries(props.__head)[0]
    const tagged = entries(props.__rows).map((row) => cellsOf(row.cells ?? row.children))
    const foot = entries(props.__foot)[0]
    const headers = props.headers != null ? cellsOf(props.headers) : head ? cellsOf(head.cells ?? head.children) : (markdown?.headers ?? [])
    const rows = Array.isArray(props.rows)
      ? props.rows.map((row) => cellsOf(row))
      : tagged.length > 0
        ? tagged
        : (markdown?.rows ?? [])
    const footer = props.footer != null ? cellsOf(props.footer) : foot ? cellsOf(foot.cells ?? foot.children) : markdown?.footer
    return { ...base(props, "table"), headers, rows, footer, align: alignOf(props.align) ?? markdown?.align }
  },
  render(d, ctx) {
    renderGrid(ctx, d.headers, [{ rows: d.rows }], d.footer, d.align)
  },
  ascii(d) {
    return gridLines(d.headers, d.rows, d.footer, d.align).lines
  },
  template: {
    title: "WHAT THE RESEARCH COST",
    body: "| Agent | Tokens | Tool calls | Time |\n| --- | ---: | ---: | ---: |\n| Inks and paper | 115,207 | 120 | 16m |\n| Overprint and drift | 135,218 | 164 | 16m |\n| Naming the patterns | 186,716 | 112 | 18m |\n| **Total** | 437,141 | 396 | ~50m |",
  },
}

/* ---- Sheet ------------------------------------------------------------ */

interface SheetData extends Common {
  headers: string[]
  sections: { title: string; rows: string[][] }[]
  footer?: string[]
  align?: Align[]
}

export const sheet: Spec<SheetData> = {
  slug: "graph-sheet",
  tag: "GraphSheet",
  name: "Sheet",
  aliases: ["sheet", "graph-sheet", "rfc"],
  group: "data",
  summary: "A table with section titles, like an API, an RFC, or a spec with groups.",
  notFor: "A flat table is Table. Label/value rows are Spec.",
  items: { Section: "sections", Head: "__head", Foot: "__foot" },
  read({ props, blocks }) {
    const markdown = headingSections(blocks).map((section) => {
      const parsed = readTable(firstOf(section.blocks, "table"))
      return { title: flat(section.title), rows: [...(parsed?.rows ?? []), ...(parsed?.footer ? [parsed.footer] : [])], headers: parsed?.headers, align: parsed?.align }
    })
    const head = entries(props.__head)[0]
    const foot = entries(props.__foot)[0]
    const headers = props.headers != null ? cellsOf(props.headers) : head ? cellsOf(head.cells ?? head.children) : (markdown[0]?.headers ?? [])
    const sections = Array.isArray(props.sections)
      ? entries(props.sections).map((section) => ({
          title: str(section.title),
          rows: Array.isArray(section.rows)
            ? section.rows.map((row) => cellsOf(row))
            : str(section.children)
                .split("\n")
                .filter((line) => line.trim())
                .map((line) => cellsOf(line)),
        }))
      : markdown.map((section) => ({ title: section.title, rows: section.rows }))
    const footer = props.footer != null ? cellsOf(props.footer) : foot ? cellsOf(foot.cells ?? foot.children) : undefined
    return { ...base(props, "sheet"), headers, sections, footer, align: alignOf(props.align) ?? markdown[0]?.align }
  },
  render(d, ctx) {
    renderGrid(ctx, d.headers, d.sections, d.footer, d.align)
  },
  ascii(d) {
    const grid = gridLines(d.headers, d.sections.flatMap((section) => section.rows), d.footer, d.align)
    const lines = [grid.cells(d.headers), grid.ruleLine()]
    d.sections.forEach((section, index) => {
      if (index > 0) lines.push(grid.ruleLine())
      lines.push(plain(section.title))
      lines.push(...section.rows.map(grid.cells))
    })
    if (d.footer) lines.push(grid.ruleLine(), grid.cells(d.footer))
    return lines
  },
  template: {
    title: "RFC",
    body: "### Scope\n\n| Item | Owner | Status |\n| :-- | :-- | :-- |\n| CLI copies files | priya | done |\n| Docs previews | jon | now |\n\n### Out of scope\n\n| Item | Owner | Status |\n| :-- | :-- | :-- |\n| npm package | — | later |\n| Figma kit | — | later |",
  },
}

/* ---- Compare ---------------------------------------------------------- */

type CompareCell = string | boolean

function compareCell(token: unknown): CompareCell {
  if (typeof token === "boolean") return token
  const value = str(token).trim()
  const key = value.toLowerCase()
  if (key === "true" || key === "yes" || value === "✓" || value === "✔" || key === "x") return true
  if (key === "false" || key === "no" || value === "–" || value === "-" || value === "—" || value === "✗") return false
  return value
}

interface CompareData extends Common {
  columns: string[]
  rows: { label: string; values: CompareCell[] }[]
  accent?: string
}

export const compare: Spec<CompareData> = {
  slug: "graph-compare",
  tag: "GraphCompare",
  name: "Compare",
  aliases: ["compare", "graph-compare", "plans", "versus", "vs"],
  group: "data",
  summary: "Two options side by side.",
  notFor: "Exact numbers on both axes are Matrix. Numeric ranks are Rank.",
  items: { Col: "__cols", Row: "__rows" },
  read({ props, blocks }) {
    const markdown = labeledTable(blocks)
    const cols = entries(props.__cols).map((entry) => flat(str(entry.children)))
    const columns = props.columns != null ? words(props.columns) : cols.length > 0 ? cols : (markdown?.columns ?? [])
    const tagged = taggedRows(props.__rows)
    const rows = Array.isArray(props.rows)
      ? entries(props.rows).map((row) => ({ label: str(row.label), values: (Array.isArray(row.values) ? row.values : words(row.values)).map(compareCell) }))
      : tagged.length > 0
        ? tagged.map((row) => ({ label: row.label, values: words(row.text).map(compareCell) }))
        : (markdown?.rows ?? []).map((row) => ({ label: row.label, values: row.values.map((value) => compareCell(plain(value))) }))
    return { ...base(props, "compare"), columns, rows, accent: optStr(props.accent) }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-scroll-x")
    const mono = isMono(ctx.palette)
    const wrap = div(ctx.body, "mdxcn-compare mdxcn-stack-3")
    vars(wrap, { "--cols": Math.max(1, d.columns.length) })
    const head = div(wrap, "mdxcn-compare-row is-head")
    span(head)
    d.columns.forEach((column, index) => {
      const focused = Boolean(d.accent) && column === d.accent
      span(head, cx("is-right", mono ? (focused ? T.accent : T.muted) : seriesTone(ctx.palette, index)), column)
    })
    const list = el(wrap, "ul", "mdxcn-list mdxcn-stack-2")
    d.rows.forEach((row, rowIndex) => {
      const line = rise(el(list, "li", "mdxcn-compare-row"), rowIndex, 40)
      span(line, cx("mdxcn-truncate", T.fg), row.label)
      d.columns.forEach((column, index) => {
        const value = row.values[index]
        const focused = Boolean(d.accent) && column === d.accent
        const dim = Boolean(d.accent) && !focused
        const mark = typeof value === "boolean"
        const on = value === true
        const cls = cx(
          "is-right",
          !mark && "mdxcn-num",
          on && (mono ? (dim ? T.fg : T.accent) : seriesTone(ctx.palette, index)),
          mark && !on && T.frame,
          !mark && focused && T.fg,
          !mark && dim && T.muted,
          dim && !on && mono && DIM
        )
        const cell = span(line, cls)
        if (value == null) return
        if (typeof value === "boolean") cell.setText(value ? "✓" : "–")
        else ctx.inline(cell, value)
      })
    })
  },
  ascii(d) {
    const cell = (value: CompareCell) => (typeof value === "boolean" ? (value ? "✓" : "–") : plain(value))
    return gridLines(
      ["", ...d.columns],
      d.rows.map((row) => [row.label, ...row.values.map(cell)]),
      undefined,
      ["left", ...d.columns.map((): Align => "right")]
    ).lines
  },
  template: {
    title: "PLANS",
    body: "| | Solo | Studio |\n| --- | --- | --- |\n| Registry | yes | yes |\n| Accent picker | yes | yes |\n| Private source | no | yes |\n| Price | $0 | $24 |",
  },
}

/* ---- Matrix ----------------------------------------------------------- */

interface MatrixData extends Common {
  columns: string[]
  rows: { label: string; values: (number | string)[] }[]
  accent?: string
}

function matrixValues(value: unknown): (number | string)[] {
  const list = Array.isArray(value) ? value : words(value)
  return list.map((token) => {
    if (typeof token === "number") return token
    const parsed = Number(String(token).replace(/,/g, ""))
    return Number.isFinite(parsed) && String(token).trim() !== "" ? parsed : String(token)
  })
}

function formatCell(value: number | string | undefined) {
  if (value == null) return ""
  return typeof value === "number" ? formatNumber(value) : value
}

export const matrix: Spec<MatrixData> = {
  slug: "graph-matrix",
  tag: "GraphMatrix",
  name: "Matrix",
  aliases: ["matrix", "graph-matrix", "confusion"],
  group: "data",
  summary: "Both axes are labels and the cells are exact numbers.",
  notFor: "Intensities are Heatmap. Yes/no features are Compare.",
  items: { Row: "__rows" },
  read({ props, blocks }) {
    const markdown = labeledTable(blocks)
    const tagged = taggedRows(props.__rows)
    const rows = Array.isArray(props.rows)
      ? entries(props.rows).map((row) => ({ label: str(row.label), values: matrixValues(row.values) }))
      : tagged.length > 0
        ? tagged.map((row) => ({ label: row.label, values: matrixValues(row.text) }))
        : (markdown?.rows ?? []).map((row) => ({ label: row.label, values: matrixValues(row.values.map((value) => plain(value))) }))
    const columns = props.columns != null ? words(props.columns) : (markdown?.columns ?? [])
    return { ...base(props, "matrix"), columns, rows, accent: optStr(props.accent) }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-scroll-x")
    const wrap = div(ctx.body, "mdxcn-matrix")
    vars(wrap, { "--cols": Math.max(1, d.columns.length) })
    const head = div(wrap, "mdxcn-matrix-row is-head")
    span(head)
    d.columns.forEach((column) => span(head, cx("mdxcn-matrix-cell has-rule", T.muted), column))
    rule(wrap)
    const list = el(wrap, "ul", "mdxcn-list")
    d.rows.forEach((row, index) => {
      const live = Boolean(d.accent) && row.label === d.accent
      const dim = Boolean(d.accent) && !live
      const line = rise(el(list, "li", cx("mdxcn-matrix-row", dim && DIM)), index, 40)
      const rowTone = live ? tone(ctx.palette, "primary") : T.fg
      span(line, cx("mdxcn-matrix-label mdxcn-truncate", rowTone), row.label)
      d.columns.forEach((_, at) => span(line, cx("mdxcn-matrix-cell has-rule mdxcn-num", rowTone), formatCell(row.values[at])))
    })
    sr(ctx.body, `Matrix with ${d.rows.length} rows and ${d.columns.length} columns`)
  },
  ascii(d) {
    return gridLines(
      ["", ...d.columns],
      d.rows.map((row) => [row.label, ...d.columns.map((_, index) => formatCell(row.values[index]))]),
      undefined,
      ["left", ...d.columns.map((): Align => "right")]
    ).lines
  },
  template: {
    title: "DETECT",
    body: "| | Pos | Neg |\n| --- | --- | --- |\n| Pos | 41 | 3 |\n| Neg | 2 | 54 |",
  },
}

/* ---- Invoice ---------------------------------------------------------- */

interface Party {
  name: string
  lines?: string[]
}
interface InvoiceData extends Common {
  from?: Party
  to?: Party
  meta: { label: string; value: string }[]
  items: { description: string; qty?: string; rate?: string; amount: string }[]
  totals: { label: string; value: string; accent: boolean }[]
  note?: string
}

function partyOf(value: unknown): Party | undefined {
  if (value == null) return undefined
  if (typeof value === "string") {
    const [name, ...lines] = value
      .split(/\n|\s*,\s*(?=\S)/)
      .map((line) => line.trim())
      .filter(Boolean)
    return name ? { name, lines: lines.length > 0 ? lines : undefined } : undefined
  }
  if (isObject(value)) {
    const lines = Array.isArray(value.lines)
      ? value.lines.map(String)
      : str(value.children)
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
    const name = str(value.name)
    return name ? { name, lines: lines.length > 0 ? lines : undefined } : undefined
  }
  return undefined
}

function moneyLine(text: string): { label: string; value: string } | null {
  const match = text.match(/^(.*?)\s+([+\-−]?[$€£¥]?[\d,]+(?:\.\d+)?)\s*$/)
  if (!match) return null
  return { label: match[1]?.trim() ?? "", value: match[2] ?? "" }
}

export const invoice: Spec<InvoiceData> = {
  slug: "graph-invoice",
  tag: "GraphInvoice",
  name: "Invoice",
  aliases: ["invoice", "graph-invoice", "bill", "receipt", "quote-sheet"],
  group: "data",
  summary: "From, bill-to, line items, and totals.",
  notFor: "A generic table is Table.",
  items: { From: "from", To: "to", Meta: "meta", Item: "items", Total: "totals" },
  read({ props, blocks }) {
    const table = readTable(firstOf(blocks, "table"))
    const fromTable = () => {
      if (!table) return []
      const rows = [...table.rows, ...(table.footer ? [table.footer] : [])]
      const headers = table.headers.map((header) => plain(header).toLowerCase())
      const qtyAt = headers.findIndex((header) => /qty|quantity/.test(header))
      const rateAt = headers.findIndex((header) => /rate|price/.test(header))
      const amountAt = headers.findIndex((header) => /amount|total|sum/.test(header))
      return rows.map((row) => {
        const amountIndex = amountAt >= 0 ? amountAt : row.length - 1
        const qty = qtyAt >= 0 ? row[qtyAt] : row.length >= 4 ? row[1] : row.length === 3 && rateAt < 0 ? row[1] : undefined
        const rate = rateAt >= 0 ? row[rateAt] : row.length >= 4 ? row[2] : undefined
        return { description: plain(row[0] ?? ""), qty: qty ? plain(qty) : undefined, rate: rate ? plain(rate) : undefined, amount: plain(row[amountIndex] ?? "") }
      })
    }
    const dataItems = entries(props.items)
    const items =
      dataItems.length > 0
        ? dataItems.map((entry) => ({
            description: entryText(entry, "description", "label"),
            qty: optStr(entry.qty),
            rate: optStr(entry.rate),
            amount: str(entry.amount),
          }))
        : fromTable()
    const lines = allOf(blocks, "p").flatMap((paragraph) => paragraph.text.split("\n"))
    const paragraphTotals = lines.flatMap((line) => {
      const parsed = moneyLine(plain(line).trim())
      return parsed ? [{ ...parsed, accent: hasBold(line) }] : []
    })
    const dataTotals = entries(props.totals).map((entry) => ({ label: entryText(entry, "label"), value: str(entry.value), accent: bool(entry.accent) }))
    const dataMeta = entries(props.meta).map((entry) => ({ label: str(entry.label), value: entryText(entry, "value") }))
    const listedMeta = listItems(blocks)
      .map((item) => splitLabel(flat(itemSource(item))))
      .filter((entry) => entry.rest)
      .map((entry) => ({ label: entry.label, value: entry.rest }))
    return {
      ...base(props, "invoice"),
      from: partyOf(props.from),
      to: partyOf(props.to),
      meta: dataMeta.length > 0 ? dataMeta : listedMeta,
      items,
      totals: dataTotals.length > 0 ? dataTotals : paragraphTotals,
      note: optStr(props.note) ?? lines.map((line) => plain(line).trim()).find((text) => text && !moneyLine(text)),
    }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-8")
    if (d.from || d.to) {
      const parties = div(ctx.body, "mdxcn-invoice-parties")
      for (const [label, party] of [
        ["From", d.from],
        ["Bill to", d.to],
      ] as const) {
        if (!party) continue
        const box = div(parties, "mdxcn-stack-1")
        el(box, "p", cx("mdxcn-caps-label", T.muted), label)
        el(box, "p", T.fg, party.name)
        party.lines?.forEach((line) => el(box, "p", T.muted, line))
      }
    }
    if (d.meta.length > 0) {
      const dl = el(ctx.body, "dl", "mdxcn-invoice-meta")
      for (const entry of d.meta) {
        const item = div(dl, "mdxcn-stack-1")
        el(item, "dt", cx("mdxcn-caps-label", T.muted), entry.label)
        el(item, "dd", cx(T.fg, "mdxcn-num"), entry.value)
      }
    }
    const showQty = d.items.some((row) => row.qty != null)
    const showRate = d.items.some((row) => row.rate != null)
    const scroll = div(ctx.body, "mdxcn-scroll-x")
    const tableEl = el(scroll, "table", "mdxcn-table mdxcn-invoice-table")
    const head = el(el(tableEl, "thead"), "tr")
    el(head, "th", cx("is-left is-flush", T.muted), "Description")
    if (showQty) el(head, "th", cx("is-right", T.muted), "Qty")
    if (showRate) el(head, "th", cx("is-right", T.muted), "Rate")
    el(head, "th", cx("is-right is-flush", T.muted), "Amount")
    const ruleCell = el(el(tableEl.tHead!, "tr", "mdxcn-rule-row"), "th")
    ruleCell.colSpan = 2 + Number(showQty) + Number(showRate)
    rule(ruleCell)
    const body = el(tableEl, "tbody")
    d.items.forEach((row, index) => {
      const tr = rise(el(body, "tr"), index, 40)
      el(tr, "td", "is-left is-flush", row.description)
      if (showQty) el(tr, "td", "is-right mdxcn-num", row.qty ?? "")
      if (showRate) el(tr, "td", "is-right mdxcn-num", row.rate ?? "")
      el(tr, "td", "is-right is-flush mdxcn-num", row.amount)
    })
    if (d.totals.length > 0) {
      const box = div(ctx.body, "mdxcn-stack-3")
      rule(box)
      const dl = el(box, "dl", "mdxcn-invoice-totals")
      d.totals.forEach((entry, index) => {
        const line = rise(div(dl, "mdxcn-invoice-total"), index, 40)
        el(line, "dt", entry.accent ? T.fg : T.muted, entry.label)
        el(line, "dd", cx("is-right mdxcn-num", entry.accent ? T.accent : T.fg), entry.value)
      })
    }
    if (d.note) el(ctx.body, "p", cx("mdxcn-invoice-note", T.muted), d.note)
  },
  ascii(d) {
    const lines: string[] = []
    if (d.from || d.to) {
      const fromLines = d.from ? ["FROM", d.from.name, ...(d.from.lines ?? [])] : []
      const toLines = d.to ? ["BILL TO", d.to.name, ...(d.to.lines ?? [])] : []
      const leftW = colWidth(fromLines)
      const height = Math.max(fromLines.length, toLines.length)
      for (let index = 0; index < height; index += 1) lines.push(`${col(fromLines[index] ?? "", leftW)}    ${toLines[index] ?? ""}`.trimEnd())
      lines.push("")
    }
    if (d.meta.length > 0) {
      const widths = d.meta.map((entry) => Math.max(entry.label.length, entry.value.length))
      lines.push(d.meta.map((entry, index) => col(entry.label, widths[index] ?? 0)).join("  ").trimEnd())
      lines.push(d.meta.map((entry, index) => col(entry.value, widths[index] ?? 0)).join("  ").trimEnd())
      lines.push("")
    }
    const showQty = d.items.some((item) => item.qty != null)
    const showRate = d.items.some((item) => item.rate != null)
    const headers = ["Description", ...(showQty ? ["Qty"] : []), ...(showRate ? ["Rate"] : []), "Amount"]
    const grid = gridLines(
      headers,
      d.items.map((item) => [item.description, ...(showQty ? [item.qty ?? ""] : []), ...(showRate ? [item.rate ?? ""] : []), item.amount])
    )
    lines.push(...grid.lines)
    if (d.totals.length > 0) {
      const totalWidth = colWidth(d.totals.map((entry) => entry.label))
      const amountWidth = colWidth(d.totals.map((entry) => entry.value))
      const block = d.totals.map((entry) => `${col(entry.label, totalWidth)}  ${col(entry.value, amountWidth, "right")}`)
      const indent = Math.max(0, grid.cells(headers).length - (block[0]?.length ?? 0))
      lines.push(grid.ruleLine())
      for (const line of block) lines.push(`${" ".repeat(indent)}${line}`)
    }
    if (d.note) lines.push("", d.note)
    return lines
  },
  template: {
    title: "INVOICE 0041",
    props: {
      from: { name: "mdxcn", lines: ["kshv.me", "GSTIN 29AXXXXX1234Z5"] },
      to: { name: "Acme Studio", lines: ["14 Market Street", "San Francisco, CA"] },
    },
    body: "- No.: 0041\n- Issued: Mar 12, 2026\n- Due: Apr 11, 2026\n\n| Description | Qty | Rate | Amount |\n| --- | ---: | ---: | ---: |\n| Design system | 1 | 4,200 | 4,200 |\n| Motion pass | 1 | 1,800 | 1,800 |\n| Docs rewrite | 8h | 180 | 1,440 |\n\nSubtotal 7,440\n\nTax 0\n\n**Amount due 7,440**\n\nNet 30. Wire to the account on file.",
  },
}

/* ---- Spec ------------------------------------------------------------- */

interface SpecData extends Common {
  rows: { label: string; value: string; rich: boolean; accent: boolean; note?: string }[]
}

export const spec: Spec<SpecData> = {
  slug: "graph-spec",
  tag: "GraphSpec",
  name: "Spec",
  aliases: ["spec", "graph-spec", "specs", "properties", "details"],
  group: "data",
  summary: "Aligned label and value rows, like a spec sheet.",
  notFor: "Large headline numbers are Stat. A table with headers is Table.",
  items: { Field: "rows" },
  read({ props, blocks }) {
    const data = entries(props.rows)
    const rows =
      data.length > 0
        ? data.map((entry) => ({ label: str(entry.label), value: entryText(entry, "value"), rich: false, accent: bool(entry.accent), note: optStr(entry.note) }))
        : listItems(blocks).map((item) => {
            // `**Accent: x**` marks the whole row; unwrap before splitting.
            const head = item.head.trim().replace(/^\*\*([\s\S]+)\*\*$/, "$1").replace(/^__([\s\S]+)__$/, "$1")
            const match = head.match(/^\s*([^\n]+?):\s+([\s\S]*)$/)
            const label = match ? flat(match[1] ?? "") : flat(head)
            const value = match ? (match[2] ?? "").trim() : ""
            const rich = hasCode(value) || hasDel(value) || /\[.*\]\(.*\)|\[\[/.test(value)
            return {
              label,
              value: rich ? value : flat(value),
              rich,
              accent: hasBold(item.head),
              note: item.body.length > 0 ? toMarkdown(item.body) : undefined,
            }
          })
    return { ...base(props, "spec"), rows }
  },
  render(d, ctx) {
    const dl = el(ctx.body, "dl", "mdxcn-stack-3")
    d.rows.forEach((row, index) => {
      const line = rise(div(dl, "mdxcn-spec"), index, 40)
      el(line, "dt", T.muted, row.label)
      const dd = el(line, "dd", "mdxcn-stack-1")
      const value = span(dd, cx("mdxcn-num mdxcn-anywhere", row.accent ? T.accent : T.fg))
      if (row.rich) ctx.inline(value, row.value)
      else value.setText(row.value)
      if (row.note) ctx.prose(dd, row.note, T.muted)
    })
  },
  ascii(d) {
    const labels = colWidth(d.rows.map((row) => row.label))
    return d.rows.flatMap((row) => [
      `${col(row.label, labels)}  ${plain(row.value)}`,
      ...(row.note ? wrapText(plain(row.note), 48).map((line) => `${" ".repeat(labels + 2)}${line}`) : []),
    ])
  },
  template: {
    title: "TYPE",
    body: "- Family: Geist Mono\n- Size: 14 / 21\n- Tracking: +0.02em\n- Figures: tabular\n- **Accent: `--graph-accent`**",
  },
}

/* ---- Stat ------------------------------------------------------------- */

interface StatData extends Common {
  items: { value: string; label: string; hint?: string; accent: boolean }[]
}

export const stat: Spec<StatData> = {
  slug: "graph-stat",
  tag: "GraphStat",
  name: "Stat",
  aliases: ["stat", "graph-stat", "stats", "numbers", "metrics"],
  group: "data",
  summary: "Two to four large numbers, with no sparkline.",
  notFor: "One number with a trend is KPI. A live clock is Timer.",
  items: { Stat: "items" },
  read({ props, blocks }) {
    const data = entries(props.items)
    const items =
      data.length > 0
        ? data.map((entry) => ({ value: str(entry.value), label: entryText(entry, "label"), hint: optStr(entry.hint), accent: bool(entry.accent) }))
        : listItems(blocks).map((item) => {
            const source = itemSource(item)
            const { token, rest } = firstToken(flat(source))
            const { label, rest: hint } = splitDash(rest)
            return { value: token, label, hint: hint || undefined, accent: hasBold(source) }
          })
    return { ...base(props, "stat"), items }
  },
  render(d, ctx) {
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stat")
    vars(list, { "--cols": Math.min(Math.max(d.items.length, 1), 4) })
    d.items.forEach((entry, index) => {
      const item = rise(el(list, "li", "mdxcn-stack-2"), index, 60)
      el(item, "p", cx("mdxcn-big mdxcn-num", entry.accent ? T.accent : T.fg), entry.value)
      el(item, "p", T.muted, entry.label)
      if (entry.hint) el(item, "p", T.muted, entry.hint)
    })
  },
  ascii(d) {
    const widths = d.items.map((item) => Math.max(item.value.length, item.label.length, item.hint?.length ?? 0))
    const row = (pick: (item: StatData["items"][number]) => string) =>
      d.items.map((item, index) => col(pick(item), widths[index] ?? 0)).join("   ").trimEnd()
    const lines = [row((item) => item.value), row((item) => item.label)]
    if (d.items.some((item) => item.hint)) lines.push(row((item) => item.hint ?? ""))
    return lines
  },
  template: {
    title: "THIS WEEK",
    body: "- 12,400 docs\n- 4,100 copies\n- **860** shipped",
  },
}

/* ---- KPI -------------------------------------------------------------- */

interface KpiData extends Common {
  value: string
  label: string
  hint?: string
  data: number[]
}

function sparkPoints(data: number[], glyphs?: Common["glyphs"]) {
  const set = glyphs == null ? SPARK : resolveGlyphs(glyphs)
  const max = Math.max(...data, 1)
  return data.map((value) => set[Math.round((value / max) * (set.length - 1))] ?? set[0] ?? "▁")
}

export const kpi: Spec<KpiData> = {
  slug: "graph-kpi",
  tag: "GraphKpi",
  name: "KPI",
  aliases: ["kpi", "graph-kpi", "headline", "metric"],
  group: "data",
  summary: "One number is the headline and the rest is context.",
  notFor: "Several numbers with no trend is Stat.",
  read({ props, blocks, body }) {
    const lines = allOf(blocks, "p").length > 0
      ? allOf(blocks, "p").flatMap((paragraph) => paragraph.text.split("\n"))
      : body.split("\n")
    const clean = lines.map((line) => flat(line)).filter(Boolean)
    const [head = "", ...tail] = clean
    const { token, rest } = firstToken(head)
    const written = splitDash(rest)
    return {
      ...base(props, "kpi"),
      value: optStr(props.value) ?? token,
      label: optStr(props.label) ?? written.label,
      hint: optStr(props.hint) ?? (written.rest || undefined),
      data: numbers(props.data ?? tail.join(" ")),
    }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-4")
    const top = rise(div(ctx.body, "mdxcn-stack-2"))
    el(top, "p", cx("mdxcn-big mdxcn-num", tone(ctx.palette, "primary")), d.value)
    const meta = div(top, "mdxcn-row-3")
    el(meta, "p", T.muted, d.label)
    if (d.hint) el(meta, "p", cx(T.muted, "mdxcn-num"), d.hint)
    const points = sparkPoints(d.data, d.glyphs)
    if (points.length > 0) {
      const row = hidden(span(ctx.body, "mdxcn-spark is-start"))
      points.forEach((glyph, index) => {
        const live = index === points.length - 1
        const cell = span(row, cx("mdxcn-fill", live ? tone(ctx.palette, "primary") : tone(ctx.palette, "secondary"), !live && isMono(ctx.palette) && DIM), glyph)
        vars(cell, { "--d": `${Math.min(index * 30, 280)}ms` })
      })
    }
    sr(ctx.body, `${d.value} ${d.label}${d.hint ? `. ${d.hint}` : ""}`)
  },
  ascii(d) {
    return [d.value, d.hint ? `${d.label}  ${d.hint}` : d.label, sparkPoints(d.data).join("")]
  },
  template: {
    title: "READS",
    body: "12,400 this week — +18%\n\n4 5 5 6 8 7 9 8 11 10 12 14",
  },
}

/* ---- Diff ------------------------------------------------------------- */

type DiffSign = "add" | "remove" | "keep"
interface DiffRow {
  label: string
  value: string
  sign: DiffSign
  total?: boolean
}
interface DiffData extends Common {
  rows: DiffRow[]
  footer?: DiffRow
}

function signOf(value: string): DiffSign | undefined {
  const text = value.trim()
  if (/^\+/.test(text)) return "add"
  if (/^[−\-]/.test(text)) return "remove"
  return undefined
}

function signWord(value: unknown): DiffSign {
  const text = optStr(value)
  return text === "add" || text === "remove" ? text : "keep"
}

export const diff: Spec<DiffData> = {
  slug: "graph-diff",
  tag: "GraphDiff",
  name: "Diff",
  aliases: ["diff", "graph-diff", "delta", "changes-table"],
  group: "data",
  summary: "What was added, removed, or kept.",
  notFor: "A list of numeric before and after is Slope.",
  items: { Line: "rows" },
  read({ props, blocks }) {
    const data = entries(props.rows)
    let lines: DiffRow[]
    if (data.length > 0) {
      lines = data.map((entry) => ({ label: entryText(entry, "label"), value: str(entry.value), sign: signWord(entry.sign), total: bool(entry.total) }))
    } else {
      lines = listItems(blocks).flatMap((item): DiffRow[] => {
        const tokens = tokenize(item.head)
        const struck = tokens.findIndex((token) => token.kind === "del")
        if (struck >= 0) {
          const text = (list: typeof tokens) => plain(list.map((token) => (token.kind === "text" ? token.text : token.kind === "code" ? `\`${token.text}\`` : "")).join(""))
          const before = text(tokens.slice(0, struck))
          const del = tokens[struck]
          const removed = del && del.kind === "del" ? plain(del.children.map((token) => (token.kind === "text" ? token.text : "")).join("")) : ""
          const after = text(tokens.slice(struck + 1))
          const clean = (value: string) => value.replace(/\s+/g, " ").trim()
          const out: DiffRow[] = []
          if (clean(removed)) out.push({ label: clean(before + removed), value: "", sign: "remove" })
          if (clean(after)) out.push({ label: clean(before + after), value: "", sign: "add" })
          return out
        }
        const source = itemSource(item)
        const { label, rest } = splitLabel(flat(source))
        return [{ label, value: rest.replace(/^[+\-−]\s*/, "") || rest, sign: signOf(rest) ?? "keep", total: hasBold(source) }]
      })
    }
    const footerData = isObject(props.footer)
      ? { label: str(props.footer.label), value: str(props.footer.value), sign: signWord(props.footer.sign) }
      : undefined
    return {
      ...base(props, "diff"),
      rows: lines.filter((line) => !line.total),
      footer: footerData ?? lines.find((line) => line.total),
    }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-3")
    const line = (parent: HTMLElement, row: DiffRow, index: number) => {
      const rowTone = row.sign === "add" ? tone(ctx.palette, "primary") : row.sign === "remove" ? tone(ctx.palette, "secondary") : T.fg
      const box = rise(div(parent, "mdxcn-diff"), index, 40)
      hidden(span(box, cx("mdxcn-glyph", row.sign === "keep" ? T.frame : rowTone), row.sign === "add" ? "+" : row.sign === "remove" ? "-" : " "))
      span(box, rowTone, row.label)
      span(box, cx("is-right mdxcn-num", rowTone), row.value)
    }
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-2")
    d.rows.forEach((row, index) => line(el(list, "li"), row, index))
    if (d.footer) {
      rule(ctx.body)
      line(ctx.body, d.footer, d.rows.length)
    }
  },
  ascii(d) {
    const all = d.footer ? [...d.rows, d.footer] : d.rows
    const labels = colWidth(all.map((row) => row.label))
    const values = colWidth(all.map((row) => row.value))
    const line = (row: DiffRow) => `${row.sign === "add" ? "+" : row.sign === "remove" ? "-" : " "} ${col(row.label, labels)}  ${col(row.value, values, "right")}`
    const lines = d.rows.map(line)
    if (d.footer) lines.push(dash(2 + labels + 2 + values), line(d.footer))
    return lines
  },
  template: {
    title: "BUNDLE",
    body: "- vendor: 84 kb\n- app: +31 kb\n- sourcemaps: -12 kb\n- **shipped: 103 kb**",
  },
}

export const DATA = [table, sheet, compare, matrix, invoice, spec, stat, kpi, diff]
