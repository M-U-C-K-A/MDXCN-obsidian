/*
 * Charts drawn with characters: Bars, Rank, Cells, Meter, Spark, Stack,
 * Funnel, Plot, Waffle, Waterfall, Slope, Bullet, Score, Heatmap, Activity,
 * Uptime.
 */

import { col, colWidth, dash, fillTrack } from "../ascii"
import { cx, div, el, fill, hidden, rise, rule, span, sr, track, vars, type Tick } from "../dom"
import {
  DIM,
  GLYPH_SETS,
  SPARK,
  STACK,
  T,
  clamp01,
  intensityGlyph,
  intensityLevel,
  intensityTone,
  isMono,
  resolveGlyphs,
  seriesDim,
  seriesTone,
  tone,
  trackMarks,
} from "../glyphs"
import {
  bool,
  firstToken,
  flat,
  formatNumber,
  fraction,
  hasBold,
  isObject,
  numberOf,
  numbers,
  optStr,
  runs,
  splitDash,
  splitLabel,
  str,
  words,
} from "../parse/inline"
import { itemSource, listItems, sourceOf, type Block } from "../parse/md"
import type { Common, RenderContext, Spec } from "../types"
import { labeledTable } from "./data"
import { base, entries, entryText } from "./shared"

/** Numbers written as children: `2 3 5 — caption` or `- Mon: 4` rows. */
function seriesOf(blocks: Block[], body: string) {
  const items = listItems(blocks)
  if (items.length > 0) {
    const rows = items.map((item) => {
      const { label, rest } = splitLabel(flat(itemSource(item)))
      return rest ? { label, value: numberOf(rest, Number.NaN) } : { label: "", value: numberOf(label, Number.NaN) }
    })
    const kept = rows.filter((row) => Number.isFinite(row.value))
    return { data: kept.map((row) => row.value), labels: kept.some((row) => row.label) ? kept.map((row) => row.label) : [], caption: undefined }
  }
  const text = (blocks.length > 0 ? sourceOf(blocks) : body).replace(/\s+/g, " ").trim()
  const { label, rest } = splitDash(text)
  return { data: numbers(label), labels: [] as string[], caption: rest ? flat(rest) : undefined }
}

/** Leading token as a value and the caption after an optional dash. */
function valueAndCaption(blocks: Block[], body: string) {
  const written = firstToken(flat(blocks.length > 0 ? sourceOf(blocks) : body))
  return { token: written.token, caption: written.rest.replace(/^[—–-]\s*/, "") || undefined }
}

function labelRow(parent: HTMLElement, cls: string, index: number) {
  return rise(el(parent, "li", cls), index)
}

/* ---- Bars ------------------------------------------------------------- */

interface Series {
  label: string
  values: number[]
  size?: "sm" | "lg"
}
interface BarsData extends Common {
  from: Series
  to: Series
  processor?: string
}

function seriesProp(value: unknown): Series | undefined {
  if (!isObject(value)) return undefined
  return { label: str(value.label), values: numbers(value.values ?? value.children), size: value.size === "lg" ? "lg" : value.size === "sm" ? "sm" : undefined }
}

function miniBars(values: number[], height: number, glyph = "█") {
  const max = Math.max(...values, 1)
  return Array.from({ length: height }, (_, row) =>
    values.map((value) => (height - 1 - row <= Math.round((value / max) * (height - 1)) ? glyph : " ")).join(" ")
  )
}

export const bars: Spec<BarsData> = {
  slug: "graph-bars",
  tag: "GraphBars",
  name: "Bars",
  aliases: ["bars", "graph-bars", "histogram", "before-after"],
  group: "chart",
  summary: "A before and after, or any two small histograms.",
  notFor: "A ranked list is Rank.",
  items: { Series: "__series" },
  read({ props, blocks }) {
    const listed: Series[] = listItems(blocks).map((item) => {
      const source = itemSource(item)
      const { label, rest } = splitLabel(flat(source))
      return { label: label || flat(source), values: numbers(rest), size: hasBold(source) ? "lg" : undefined }
    })
    const tagged = entries(props.__series).map((entry) => seriesProp(entry)!).filter(Boolean)
    const series = listed.length > 0 ? listed : tagged
    const empty: Series = { label: "", values: [] }
    return { ...base(props, "bars"), from: seriesProp(props.from) ?? series[0] ?? empty, to: seriesProp(props.to) ?? series[1] ?? empty, processor: optStr(props.processor) }
  },
  render(d, ctx) {
    const marks = trackMarks(d.glyphs)
    const wrap = div(ctx.body, "mdxcn-bars")
    const draw = (series: Series, accent: boolean, delay: number) => {
      const box = div(wrap, "mdxcn-bars-side")
      const height = series.size === "lg" ? 8 : 5
      const max = Math.max(...series.values, 1)
      const cols = hidden(div(box, "mdxcn-bars-cols"))
      series.values.forEach((value, index) => {
        const column = span(cols, "mdxcn-bars-col")
        const level = Math.round((value / max) * (height - 1))
        for (let row = 0; row < height; row += 1) {
          const on = height - 1 - row <= level
          const cell = span(column, cx("mdxcn-bars-cell", on ? (accent ? tone(ctx.palette, "primary") : tone(ctx.palette, "secondary")) : T.clear), on ? marks.fill : " ")
          if (on) {
            cell.addClass("mdxcn-fill")
            vars(cell, { "--d": `${delay + Math.min(index * 30, 280)}ms` })
          }
        }
      })
      el(box, "p", accent ? T.fg : tone(ctx.palette, "secondary"), series.label)
    }
    draw(d.from, false, 40)
    const arrow = hidden(div(wrap, cx("mdxcn-bars-arrow", T.muted)))
    span(arrow, cx("mdxcn-arrow", T.frame), "- - -▶")
    if (d.processor) {
      span(arrow, undefined, d.processor)
      span(arrow, cx("mdxcn-arrow", T.frame), "- - -▶")
    }
    draw(d.to, true, 160)
  },
  ascii(d) {
    const fromHeight = d.from.size === "lg" ? 8 : 5
    const toHeight = d.to.size === "lg" ? 8 : 5
    const left = miniBars(d.from.values, fromHeight)
    const right = miniBars(d.to.values, toHeight)
    const leftW = colWidth([...left, d.from.label])
    const rightW = colWidth([...right, d.to.label])
    const height = Math.max(fromHeight, toHeight)
    const arrow = d.processor ? `--> ${d.processor} -->` : "-->"
    const lines: string[] = []
    for (let row = 0; row < height; row += 1) {
      const fromRow = left[row - (height - fromHeight)] ?? col("", leftW)
      const toRow = right[row - (height - toHeight)] ?? col("", rightW)
      const mid = row === height - 1 ? arrow : " ".repeat(arrow.length)
      lines.push(`${col(fromRow, leftW)}  ${mid}  ${col(toRow, rightW)}`.trimEnd())
    }
    lines.push(`${col(d.from.label, leftW)}  ${" ".repeat(arrow.length)}  ${col(d.to.label, rightW)}`.trimEnd())
    return lines
  },
  template: {
    title: "THROUGHPUT",
    body: "- before: 2 4 3 5 2\n- **after: 3 5 6 8 7**",
  },
}

/* ---- Rank ------------------------------------------------------------- */

interface RankData extends Common {
  items: { label: string; value: number; display?: string }[]
  max?: number
  ticks: number
}

function showValue(item: { value: number; display?: string }) {
  return item.display ?? formatNumber(item.value)
}

export const rank: Spec<RankData> = {
  slug: "graph-rank",
  tag: "GraphRank",
  name: "Rank",
  aliases: ["rank", "graph-rank", "ranking", "leaderboard", "top"],
  group: "chart",
  summary: "Traffic, coverage, or anything you'd sort highest first.",
  notFor: "Two histograms side by side is Bars. A table of numbers is Table.",
  items: { Rank: "items" },
  read({ props, blocks }) {
    const data = entries(props.items)
    const items =
      data.length > 0
        ? data.map((entry) => ({ label: entryText(entry, "label"), value: numberOf(entry.value), display: optStr(entry.display) }))
        : listItems(blocks).map((item) => {
            const { token, rest } = firstToken(flat(itemSource(item)))
            return { display: token, value: numberOf(token), label: rest }
          })
    return { ...base(props, "rank"), items, max: props.max == null ? undefined : numberOf(props.max), ticks: numberOf(props.ticks, 20) }
  },
  render(d, ctx) {
    const peak = d.max ?? Math.max(...d.items.map((item) => item.value), 1)
    const marks = trackMarks(d.glyphs, { empty: "-", rest: "=", fill: "=" })
    const list = el(ctx.body, "ol", "mdxcn-list mdxcn-stack-2")
    d.items.forEach((item, index) => {
      const row = labelRow(list, "mdxcn-meter-row", index)
      row.setAttr("aria-label", `${item.label} ${showValue(item)}`)
      span(row, cx("mdxcn-truncate", T.fg), item.label)
      bracketTrack(row, d.ticks, (cell) => {
        const on = cell < Math.min(d.ticks, Math.round((Math.max(item.value, 0) / peak) * d.ticks))
        return { glyph: on ? marks.fill : marks.empty, cls: on ? tone(ctx.palette, "primary") : T.frame }
      })
      span(row, cx("is-right mdxcn-num", T.muted), showValue(item))
    })
  },
  ascii(d) {
    const peak = d.max ?? Math.max(...d.items.map((item) => item.value), 1)
    const labels = colWidth(d.items.map((item) => item.label))
    const values = d.items.map(showValue)
    const valueWidth = colWidth(values)
    return d.items.map((item, index) => {
      const filled = Math.min(d.ticks, Math.round((Math.max(item.value, 0) / peak) * d.ticks))
      return `${col(item.label, labels)}  [${fillTrack(filled, d.ticks)}]  ${col(values[index] ?? "", valueWidth, "right")}`
    })
  },
  template: {
    title: "ROUTES",
    body: "- 12,400 /docs\n- 4,100 /install\n- 860 /plot\n- 420 /rank",
  },
}

function bracketTrack(parent: HTMLElement, ticks: number, cell: (index: number) => Tick) {
  const box = span(parent, "mdxcn-bracket")
  hidden(span(box, T.frame, "["))
  track(box, Array.from({ length: ticks }, (_, index) => cell(index)))
  hidden(span(box, T.frame, "]"))
  return box
}

/* ---- Cells ------------------------------------------------------------ */

interface CellsData extends Common {
  items: { label: string; cells: number[][] }[]
}

function cellRows(text: string): number[][] {
  const parse = (line: string) =>
    line
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
      .filter((value) => Number.isFinite(value))
  const source = text.trim()
  const parts = source.includes("/") ? source.split("/") : source.split("\n")
  return parts.map(parse).filter((row) => row.length > 0)
}

export const cells: Spec<CellsData> = {
  slug: "graph-cells",
  tag: "GraphCells",
  name: "Cells",
  aliases: ["cells", "graph-cells", "grid", "pixels"],
  group: "chart",
  summary: "A small grid of filled and empty cells.",
  notFor: "A share of a hundred cells is Waffle. A year of days is Activity.",
  items: { Grid: "items" },
  read({ props, blocks }) {
    const data = entries(props.items)
    const items =
      data.length > 0
        ? data.map((entry) => ({
            label: str(entry.label),
            cells: Array.isArray(entry.cells) ? entry.cells.map((row) => numbers(row)) : cellRows(str(entry.children)),
          }))
        : listItems(blocks).map((item) => {
            const nested = item.lists.flatMap((list) => list.items.map((sub) => flat(sub.head)))
            const { label, rest } = splitLabel(flat(item.head))
            return { label: rest ? label : flat(item.head), cells: rest ? cellRows(rest) : cellRows(nested.join("\n")) }
          })
    return { ...base(props, "cells"), items }
  },
  render(d, ctx) {
    const marks = trackMarks(d.glyphs, { empty: "·", rest: "░", fill: "█" })
    const wrap = div(ctx.body, "mdxcn-cells")
    d.items.forEach((item, itemIndex) => {
      const box = div(wrap, "mdxcn-stack-3 mdxcn-cells-item")
      const grid = hidden(div(box, "mdxcn-cells-grid"))
      item.cells.forEach((row, rowIndex) => {
        const line = div(grid, "mdxcn-cells-row")
        row.forEach((value, cellIndex) => {
          const on = value === 1
          const cell = span(line, cx("mdxcn-cell", on ? (isMono(ctx.palette) ? T.accent : seriesTone(ctx.palette, itemIndex)) : T.frame), on ? marks.fill : marks.empty)
          fill(cell, itemIndex * 8 + rowIndex * 5 + cellIndex)
        })
      })
      el(box, "p", isMono(ctx.palette) ? T.muted : seriesTone(ctx.palette, itemIndex), item.label)
    })
  },
  ascii(d) {
    const grids = d.items.map((item) => {
      const body = item.cells.map((row) => row.map((cell) => (cell === 1 ? "█" : "·")).join(" "))
      const width = colWidth([...body, item.label])
      return { lines: [...body, col(item.label, width)], width }
    })
    const height = Math.max(0, ...grids.map((grid) => grid.lines.length))
    return Array.from({ length: height }, (_, row) => grids.map((grid) => col(grid.lines[row] ?? "", grid.width)).join("   ").trimEnd())
  },
  template: {
    title: "TWO WAYS TO LEARN",
    body: "- fragments: 1 0 1 0 0 / 0 1 0 1 0 / 1 0 0 0 1\n- a system: 1 1 1 1 1 / 1 1 1 1 1 / 1 1 1 1 1",
  },
}

/* ---- Meter ------------------------------------------------------------ */

interface MeterData extends Common {
  value: number
  ticks: number
  caption?: string
}

export const meter: Spec<MeterData> = {
  slug: "graph-meter",
  tag: "GraphMeter",
  name: "Meter",
  aliases: ["meter", "graph-meter", "progress", "gauge", "percent"],
  group: "chart",
  summary: "One value between 0 and 1, shown as a fill.",
  notFor: "Actual versus a target is Bullet. Parts of a whole is Stack.",
  read({ props, blocks, body }) {
    const written = valueAndCaption(blocks, body)
    return {
      ...base(props, "meter"),
      value: fraction(props.value ?? written.token),
      ticks: numberOf(props.ticks, 14),
      caption: optStr(props.caption) ?? (props.value == null ? written.caption : undefined),
    }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-4")
    const value = clamp01(d.value)
    const filled = Math.round(value * d.ticks)
    const marks = trackMarks(d.glyphs, { empty: "-", rest: "=", fill: "=" })
    const line = el(ctx.body, "p", "mdxcn-meter mdxcn-num")
    bracketTrack(line, d.ticks, (index) => ({ glyph: index < filled ? marks.fill : marks.empty, cls: index < filled ? tone(ctx.palette, "primary") : T.frame }))
    span(line, cx("mdxcn-meter-pct", tone(ctx.palette, "primary")), `${Math.round(value * 100)}%`)
    if (d.caption) el(ctx.body, "p", T.muted, d.caption)
    sr(ctx.body, `${Math.round(value * 100)} percent${d.caption ? ` ${d.caption}` : ""}`)
  },
  ascii(d) {
    const value = clamp01(d.value)
    const lines = [`[${fillTrack(Math.round(value * d.ticks), d.ticks)}]  ${Math.round(value * 100)}%`]
    if (d.caption) lines.push(d.caption)
    return lines
  },
  template: { title: "SHIPPED", body: "67% — characters, not a progress bar" },
}

/* ---- Spark ------------------------------------------------------------ */

interface SparkData extends Common {
  data: number[]
  caption?: string
}

function sparkGlyphs(data: number[], glyphs?: Common["glyphs"]) {
  const set = glyphs == null ? SPARK : resolveGlyphs(glyphs)
  const max = Math.max(...data, 1)
  return data.map((value) => set[Math.round((value / max) * (set.length - 1))] ?? set[0] ?? "▁")
}

function sparkRow(parent: HTMLElement, data: number[], ctx: RenderContext, glyphs: Common["glyphs"], align: "center" | "start") {
  const row = hidden(span(parent, cx("mdxcn-spark", align === "start" && "is-start")))
  const points = sparkGlyphs(data, glyphs)
  points.forEach((glyph, index) => {
    const live = index === points.length - 1
    fill(span(row, cx(live ? tone(ctx.palette, "primary") : tone(ctx.palette, "secondary"), !live && isMono(ctx.palette) && DIM), glyph), index)
  })
  return row
}

export const spark: Spec<SparkData> = {
  slug: "graph-spark",
  tag: "GraphSpark",
  name: "Spark",
  aliases: ["spark", "graph-spark", "sparkline", "trend"],
  group: "chart",
  summary: "A handful of numbers when you don't need an axis.",
  notFor: "If you need a y-scale, use Plot.",
  read({ props, blocks, body }) {
    const written = seriesOf(blocks, body)
    return {
      ...base(props, "spark"),
      data: props.data == null ? written.data : numbers(props.data),
      caption: optStr(props.caption) ?? (props.data == null ? written.caption : undefined),
    }
  },
  render(d, ctx) {
    ctx.body.addClasses(["mdxcn-stack-4", "is-center"])
    sparkRow(ctx.body, d.data, ctx, d.glyphs, "center")
    if (d.caption) el(ctx.body, "p", T.muted, d.caption)
    sr(ctx.body, `Sparkline with ${d.data.length} points${d.caption ? `. ${d.caption}` : ""}`)
  },
  ascii(d) {
    const lines = [sparkGlyphs(d.data).join("")]
    if (d.caption) lines.push(d.caption)
    return lines
  },
  template: { title: "LATENCY", body: "2 3 4 3 6 5 8 7 9 6 10 8 — last point is the accent" },
}

/* ---- Stack ------------------------------------------------------------ */

interface StackData extends Common {
  rows: { label: string; segments: { label: string; value: number }[] }[]
  accent?: string
  ticks: number
}

function paintRow(segments: { label: string; value: number }[], ticks: number, glyphs: readonly string[], legend: string[]) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1
  let left = ticks
  return segments.map((segment, index) => {
    const raw = Math.round((segment.value / total) * ticks)
    const count = index === segments.length - 1 ? Math.max(0, left) : Math.min(Math.max(0, raw), left)
    left -= count
    const at = legend.indexOf(segment.label)
    return { label: segment.label, glyph: glyphs[(at >= 0 ? at : index) % glyphs.length] ?? "█", count, at }
  })
}

export const stack: Spec<StackData> = {
  slug: "graph-stack",
  tag: "GraphStack",
  name: "Stack",
  aliases: ["stack", "graph-stack", "stacked", "breakdown", "parts"],
  group: "chart",
  summary: "Parts of a whole on one track.",
  notFor: "There is no pie chart. Use Waffle if you want a share of cells.",
  items: { Bar: "rows" },
  read({ props, blocks }) {
    const data = entries(props.rows)
    const rows =
      data.length > 0
        ? data.map((row) => ({
            label: str(row.label),
            segments: Array.isArray(row.segments)
              ? entries(row.segments).map((segment) => ({ label: entryText(segment, "label"), value: numberOf(segment.value) }))
              : segmentsFromText(str(row.children)),
          }))
        : listItems(blocks).map((item) => {
            const { label, rest } = splitLabel(flat(itemSource(item)))
            return { label, segments: segmentsFromText(rest) }
          })
    return { ...base(props, "stack"), rows, accent: optStr(props.accent), ticks: numberOf(props.ticks, 24) }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-6")
    const set = d.glyphs == null ? STACK : resolveGlyphs(d.glyphs)
    const legend = legendOf(d.rows)
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-3")
    d.rows.forEach((row, index) => {
      const line = labelRow(list, "mdxcn-label-track", index)
      line.setAttr("aria-label", `${row.label}: ${row.segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")}`)
      span(line, cx("mdxcn-truncate", T.fg), row.label)
      const painted = paintRow(row.segments, d.ticks, set, legend)
      const ticks: Tick[] = painted.flatMap((piece, pieceIndex) => {
        const highlighted = d.accent ? piece.label === d.accent : pieceIndex === 0
        return Array.from({ length: piece.count }, () => ({
          glyph: piece.glyph,
          cls: cx(seriesTone(ctx.palette, piece.at), seriesDim(ctx.palette, isMono(ctx.palette) ? highlighted : true)),
        }))
      })
      track(line, ticks)
    })
    const keys = el(ctx.body, "ul", "mdxcn-list mdxcn-legend")
    legend.forEach((label, index) => {
      const highlighted = isMono(ctx.palette) ? (d.accent ? label === d.accent : index === 0) : true
      const item = el(keys, "li", cx("mdxcn-legend-item", seriesDim(ctx.palette, highlighted)))
      hidden(span(item, seriesTone(ctx.palette, index), set[index % set.length] ?? "█"))
      span(item, highlighted ? T.fg : T.muted, label)
    })
  },
  ascii(d) {
    const labels = colWidth(d.rows.map((row) => row.label))
    const legend = legendOf(d.rows)
    const painted = d.rows.map((row) => `${col(row.label, labels)}  ${paintRow(row.segments, d.ticks, STACK, legend).map((piece) => piece.glyph.repeat(piece.count)).join("")}`)
    const key = legend.map((label, index) => `${STACK[index % STACK.length] ?? "█"} ${label}`).join("  ")
    return [...painted, "", key]
  },
  template: {
    title: "BUNDLE",
    body: "- marketing: 48 js, 22 css, 30 images\n- docs: 28 js, 18 css, 54 images",
  },
}

function segmentsFromText(text: string) {
  // `48 js, 22 css, 30 images`: a number (commas allowed inside) then a word.
  return [...text.matchAll(/(\d[\d,.]*?)\s+([^\s,;]+)/g)].map((part) => ({ label: part[2] ?? "", value: numberOf(part[1]) }))
}

function legendOf(rows: StackData["rows"]) {
  const legend: string[] = []
  for (const row of rows) for (const segment of row.segments) if (!legend.includes(segment.label)) legend.push(segment.label)
  return legend
}

/* ---- Funnel ----------------------------------------------------------- */

interface FunnelData extends Common {
  steps: { label: string; value: number; display?: string }[]
  ticks: number
  stage?: string
}

export const funnel: Spec<FunnelData> = {
  slug: "graph-funnel",
  tag: "GraphFunnel",
  name: "Funnel",
  aliases: ["funnel", "graph-funnel", "conversion", "dropoff"],
  group: "chart",
  summary: "Steps that get narrower as people drop off.",
  notFor: "A ranked list is Rank. A process diagram is Flow.",
  items: { Stage: "steps" },
  read({ props, blocks }) {
    const data = entries(props.steps)
    const steps =
      data.length > 0
        ? data.map((entry) => ({ label: entryText(entry, "label"), value: numberOf(entry.value), display: optStr(entry.display) }))
        : listItems(blocks).map((item) => {
            const { token, rest } = firstToken(flat(itemSource(item)))
            return { display: token, value: numberOf(token), label: rest }
          })
    return { ...base(props, "funnel"), steps, ticks: numberOf(props.ticks, 20), stage: optStr(props.stage) }
  },
  render(d, ctx) {
    const max = Math.max(...d.steps.map((step) => step.value), 1)
    const head = d.steps[0]?.value || 1
    const marks = trackMarks(d.glyphs)
    const list = el(ctx.body, "ol", "mdxcn-list mdxcn-stack-3")
    d.steps.forEach((step, index) => {
      const width = Math.max(1, Math.round((step.value / max) * d.ticks))
      const focused = Boolean(d.stage) && step.label === d.stage
      const dim = Boolean(d.stage) && !focused
      const row = labelRow(list, cx("mdxcn-funnel-row", seriesDim(ctx.palette, !dim)), index)
      span(row, cx("mdxcn-truncate", T.fg), step.label)
      track(
        row,
        Array.from({ length: d.ticks }, (_, cell) => ({
          glyph: cell < width ? marks.fill : marks.empty,
          cls: cell < width ? (isMono(ctx.palette) ? T.accent : seriesTone(ctx.palette, index)) : T.frame,
        }))
      )
      span(row, cx("is-right mdxcn-num", T.fg), step.display ?? step.value.toLocaleString())
      span(row, cx("is-right mdxcn-num", T.muted), index === 0 ? "" : `${Math.round((step.value / head) * 100)}%`)
    })
  },
  ascii(d) {
    const max = Math.max(...d.steps.map((step) => step.value), 1)
    const head = d.steps[0]?.value || 1
    const labels = colWidth(d.steps.map((step) => step.label))
    const amounts = d.steps.map((step) => step.display ?? step.value.toLocaleString())
    const amountWidth = colWidth(amounts)
    return d.steps.map((step, index) => {
      const width = Math.max(1, Math.round((step.value / max) * d.ticks))
      const share = index === 0 ? "" : `  ${col(`${Math.round((step.value / head) * 100)}%`, 4, "right")}`
      return `${col(step.label, labels)}  ${fillTrack(width, d.ticks, "█", "-")}  ${col(amounts[index] ?? "", amountWidth, "right")}${share}`
    })
  },
  template: { title: "INSTALL", body: "- 12,400 docs\n- 4,100 copy\n- 860 ship" },
}

/* ---- Plot ------------------------------------------------------------- */

interface PlotData extends Common {
  data: number[]
  labels?: string[]
  height: number
  variant: "line" | "area"
  progress: number
}

function formatTick(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export const plot: Spec<PlotData> = {
  slug: "graph-plot",
  tag: "GraphPlot",
  name: "Plot",
  aliases: ["plot", "graph-plot", "chart", "line", "area"],
  group: "chart",
  summary: "A series that needs a y-scale.",
  notFor: "A handful of points with no axis is Spark.",
  read({ props, blocks, body }) {
    const written = seriesOf(blocks, body)
    const labels = props.labels != null ? words(props.labels) : written.labels.length > 0 ? written.labels : undefined
    return {
      ...base(props, "plot"),
      data: props.data == null ? written.data : numbers(props.data),
      labels,
      height: Math.max(2, Math.min(24, numberOf(props.height, 7))),
      variant: props.variant === "line" ? "line" : "area",
      progress: props.progress == null ? 1 : fraction(props.progress, 1),
    }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-3")
    const marks = trackMarks(d.glyphs)
    const max = Math.max(...d.data, 0)
    const min = Math.min(0, ...d.data)
    const range = max - min || 1
    const revealed = Math.round(clamp01(d.progress) * d.data.length)
    const lastLive = Math.max(0, revealed - 1)
    const wrap = div(ctx.body, "mdxcn-plot")
    vars(wrap, { "--rows": d.height })
    const axis = div(wrap, cx("mdxcn-plot-axis mdxcn-num", T.muted))
    span(axis, undefined, formatTick(max))
    span(axis, undefined, formatTick(min))
    const area = hidden(div(wrap, "mdxcn-plot-area"))
    d.data.forEach((value, column) => {
      const level = Math.round(((value - min) / range) * (d.height - 1))
      const live = column === lastLive && column < revealed
      const shown = column < revealed
      const col = span(area, "mdxcn-plot-col")
      for (let row = 0; row < d.height; row += 1) {
        const fromBottom = d.height - 1 - row
        const cap = shown && fromBottom === level
        const body = shown && d.variant === "area" && fromBottom < level
        const glyph = cap ? marks.fill : body ? marks.rest : " "
        const cell = span(col, cx("mdxcn-plot-cell", cap ? (live ? tone(ctx.palette, "primary") : T.fg) : body ? tone(ctx.palette, "secondary") : T.clear), glyph)
        if (glyph !== " ") fill(cell, column)
      }
    })
    const start = d.labels?.[0]
    const end = d.labels?.[d.labels.length - 1]
    if (start || end) {
      const ruleRow = div(ctx.body, "mdxcn-plot-foot")
      span(ruleRow, "mdxcn-plot-gutter mdxcn-num", formatTick(max))
      rule(ruleRow)
      const labels = div(ctx.body, "mdxcn-plot-foot")
      span(labels, "mdxcn-plot-gutter mdxcn-num", formatTick(max))
      const ends = div(labels, cx("mdxcn-split", T.muted))
      span(ends, undefined, start ?? "")
      if (end && end !== start) span(ends, undefined, end)
    }
    sr(ctx.body, `${d.variant} plot, ${d.data.length} points, min ${formatTick(min)}, max ${formatTick(max)}`)
  },
  ascii(d) {
    const max = Math.max(...d.data, 0)
    const min = Math.min(0, ...d.data)
    const range = max - min || 1
    const top = formatTick(max)
    const bottom = formatTick(min)
    const gutter = Math.max(top.length, bottom.length)
    const lines: string[] = []
    for (let row = 0; row < d.height; row += 1) {
      const fromBottom = d.height - 1 - row
      const cells = d.data.map((value) => {
        const level = Math.round(((value - min) / range) * (d.height - 1))
        return fromBottom === level ? "█" : d.variant === "area" && fromBottom < level ? "░" : " "
      })
      const label = row === 0 ? top : row === d.height - 1 ? bottom : ""
      lines.push(`${col(label, gutter, "right")} | ${cells.join("")}`.trimEnd())
    }
    const start = d.labels?.[0]
    const end = d.labels?.[d.labels.length - 1]
    if (start || end) {
      lines.push(`${" ".repeat(gutter)} +-${dash(d.data.length)}`)
      const span = Math.max(d.data.length, (start?.length ?? 0) + (end?.length ?? 0) + 1)
      const ends = end && end !== start ? `${start ?? ""}${" ".repeat(Math.max(1, span - (start?.length ?? 0) - end.length))}${end}` : start ?? ""
      lines.push(`${" ".repeat(gutter)}   ${ends}`)
    }
    return lines
  },
  template: { title: "P95", props: { labels: ["jan", "dec"] }, body: "2 3 3 5 4 7 6 8 5 9 7 6" },
}

/* ---- Waffle ----------------------------------------------------------- */

interface WaffleData extends Common {
  value: number
  cells: number
  columns: number
  caption?: string
}

export const waffle: Spec<WaffleData> = {
  slug: "graph-waffle",
  tag: "GraphWaffle",
  name: "Waffle",
  aliases: ["waffle", "graph-waffle", "share", "coverage"],
  group: "chart",
  summary: "A share shown as a grid of about a hundred cells.",
  notFor: "Labeled parts of a whole is Stack.",
  read({ props, blocks, body }) {
    const written = valueAndCaption(blocks, body)
    return {
      ...base(props, "waffle"),
      value: fraction(props.value ?? written.token),
      cells: Math.max(1, numberOf(props.cells, 100)),
      columns: Math.max(1, numberOf(props.columns, 10)),
      caption: optStr(props.caption) ?? (props.value == null ? written.caption : undefined),
    }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-4")
    const value = clamp01(d.value)
    const filled = Math.round(value * d.cells)
    const marks = trackMarks(d.glyphs, { empty: "░", rest: "░", fill: "█" })
    const grid = hidden(div(ctx.body, "mdxcn-waffle"))
    vars(grid, { "--cols": d.columns })
    for (let index = 0; index < Math.ceil(d.cells / d.columns) * d.columns; index += 1) {
      if (index >= d.cells) {
        span(grid, T.clear, " ")
        continue
      }
      const on = index < filled
      const cell = span(grid, on ? tone(ctx.palette, "primary") : T.frame, on ? marks.fill : marks.empty)
      cell.addClass("mdxcn-fill")
      vars(cell, { "--d": `${Math.min(index * 6, 600)}ms` })
    }
    el(ctx.body, "p", cx("mdxcn-num", tone(ctx.palette, "primary")), `${Math.round(value * 100)}%`)
    if (d.caption) el(ctx.body, "p", T.muted, d.caption)
  },
  ascii(d) {
    const value = clamp01(d.value)
    const filled = Math.round(value * d.cells)
    const lines: string[] = []
    for (let row = 0; row < Math.ceil(d.cells / d.columns); row += 1) {
      const glyphs: string[] = []
      for (let column = 0; column < d.columns; column += 1) {
        const index = row * d.columns + column
        glyphs.push(index >= d.cells ? " " : index < filled ? "█" : "░")
      }
      lines.push(glyphs.join(" ").trimEnd())
    }
    lines.push(`${Math.round(value * 100)}%`)
    if (d.caption) lines.push(d.caption)
    return lines
  },
  template: { title: "COVERAGE", body: "73% — 73 of 100 tests green" },
}

/* ---- Waterfall -------------------------------------------------------- */

type Kind = "start" | "in" | "out" | "end"
interface WaterfallData extends Common {
  items: { label: string; value: number; display?: string; kind?: Kind }[]
  ticks: number
}

function kindOf(value: unknown): Kind | undefined {
  const text = optStr(value)
  return text === "start" || text === "in" || text === "out" || text === "end" ? text : undefined
}

function waterfallSegments(d: WaterfallData) {
  const segments: (WaterfallData["items"][number] & { kind: Kind; from: number; to: number })[] = []
  let run = 0
  d.items.forEach((entry, index) => {
    const kind = entry.kind ?? (index === 0 ? "start" : index === d.items.length - 1 ? "end" : entry.value >= 0 ? "in" : "out")
    const magnitude = Math.abs(entry.value)
    if (kind === "start") {
      segments.push({ ...entry, kind, from: 0, to: entry.value })
      run = entry.value
    } else if (kind === "in") {
      segments.push({ ...entry, kind, from: run, to: run + magnitude })
      run += magnitude
    } else if (kind === "out") {
      segments.push({ ...entry, kind, from: run - magnitude, to: run })
      run -= magnitude
    } else {
      segments.push({ ...entry, kind, from: 0, to: entry.value })
      run = entry.value
    }
  })
  const low = Math.min(0, ...segments.map((segment) => Math.min(segment.from, segment.to)))
  const high = Math.max(1, ...segments.map((segment) => Math.max(segment.from, segment.to)))
  const span = high - low || 1
  const column = (value: number) => Math.round(((value - low) / span) * d.ticks)
  return segments.map((segment) => {
    const start = Math.min(column(segment.from), column(segment.to))
    const end = Math.max(column(segment.from), column(segment.to), start + 1)
    return { ...segment, start, end }
  })
}

function waterfallValue(item: { value: number; display?: string }, kind: Kind) {
  if (item.display) return item.display
  const absolute = Math.abs(item.value).toLocaleString("en-US")
  if (kind === "in") return `+${absolute}`
  if (kind === "out") return `−${absolute}`
  return item.value.toLocaleString("en-US")
}

export const waterfall: Spec<WaterfallData> = {
  slug: "graph-waterfall",
  tag: "GraphWaterfall",
  name: "Waterfall",
  aliases: ["waterfall", "graph-waterfall", "bridge", "margin"],
  group: "chart",
  summary: "A running total as floating bars.",
  notFor: "Parts of a whole is Stack.",
  items: { Delta: "items" },
  read({ props, blocks }) {
    const data = entries(props.items)
    const items =
      data.length > 0
        ? data.map((entry) => ({ label: entryText(entry, "label"), value: numberOf(entry.value), display: optStr(entry.display), kind: kindOf(entry.kind) }))
        : listItems(blocks).map((item) => {
            const text = flat(itemSource(item))
            const { label, rest } = splitLabel(text)
            const raw = rest || text
            const match = raw.match(/([+\-−]?[\d,]+(?:\.\d+)?)\s*$/)
            return { label: rest ? label : text.replace(match?.[0] ?? "", "").trim(), value: numberOf(match?.[1] ?? rest), display: undefined, kind: undefined }
          })
    return { ...base(props, "waterfall"), items, ticks: numberOf(props.ticks, 24) }
  },
  render(d, ctx) {
    const marks = trackMarks(d.glyphs)
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-2")
    waterfallSegments(d).forEach((segment, index) => {
      const item = el(list, "li", "mdxcn-stack-2")
      if (segment.kind === "end" && index > 0) rule(item)
      const row = rise(div(item, "mdxcn-waterfall-row"), index)
      span(row, cx("mdxcn-truncate", T.fg), segment.label)
      const fillTone = segment.kind === "out" ? tone(ctx.palette, "secondary") : segment.kind === "start" ? T.fg : tone(ctx.palette, "primary")
      track(
        row,
        Array.from({ length: d.ticks }, (_, cell) => {
          const on = cell >= segment.start && cell < segment.end
          return { glyph: on ? marks.fill : marks.empty, cls: on ? fillTone : tone(ctx.palette, "empty") }
        })
      )
      span(
        row,
        cx("is-right mdxcn-num", segment.kind === "out" && tone(ctx.palette, "secondary"), segment.kind === "end" && tone(ctx.palette, "primary"), (segment.kind === "start" || segment.kind === "in") && T.fg),
        waterfallValue(segment, segment.kind)
      )
    })
  },
  ascii(d) {
    const segments = waterfallSegments(d)
    const labels = colWidth(segments.map((segment) => segment.label))
    const amounts = segments.map((segment) => waterfallValue(segment, segment.kind))
    const amountWidth = colWidth(amounts)
    const lines: string[] = []
    segments.forEach((segment, index) => {
      const bar = Array.from({ length: d.ticks }, (_, cell) => (cell >= segment.start && cell < segment.end ? "█" : "-")).join("")
      if (segment.kind === "end" && index > 0) lines.push(dash(labels + 2 + d.ticks + 2 + amountWidth))
      lines.push(`${col(segment.label, labels)}  ${bar}  ${col(amounts[index] ?? "", amountWidth, "right")}`)
    })
    return lines
  },
  template: { title: "MARGIN", body: "- Revenue: 48\n- Refunds: -6\n- Hosting: -4\n- Profit: 38" },
}

/* ---- Slope ------------------------------------------------------------ */

interface SlopeData extends Common {
  fromLabel: string
  toLabel: string
  items: { label: string; from: number; to: number }[]
}

export const slope: Spec<SlopeData> = {
  slug: "graph-slope",
  tag: "GraphSlope",
  name: "Slope",
  aliases: ["slope", "graph-slope", "before-after-numbers"],
  group: "chart",
  summary: "A before and after number on each row.",
  notFor: "Two bar groups is Bars. A ranked list is Rank.",
  items: { Slope: "items" },
  read({ props, blocks }) {
    const data = entries(props.items)
    const items =
      data.length > 0
        ? data.map((entry) => ({ label: entryText(entry, "label"), from: numberOf(entry.from), to: numberOf(entry.to) }))
        : listItems(blocks).map((item) => {
            const { label, rest } = splitLabel(flat(itemSource(item)))
            const [from, to] = rest.split(/\s*(?:→|->|—>|=>)\s*/)
            return { label, from: numberOf(from), to: numberOf(to) }
          })
    return { ...base(props, "slope"), fromLabel: str(props.fromLabel ?? props.from), toLabel: str(props.toLabel ?? props.to), items }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-3")
    const head = div(ctx.body, "mdxcn-slope")
    span(head)
    span(head, cx("is-right", T.muted), d.fromLabel)
    span(head)
    span(head, cx("is-right", T.muted), d.toLabel)
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-2")
    d.items.forEach((item, index) => {
      const up = item.to > item.from
      const down = item.to < item.from
      const row = labelRow(list, "mdxcn-slope", index)
      row.setAttr("aria-label", `${item.label} from ${formatNumber(item.from)} to ${formatNumber(item.to)}`)
      span(row, cx("mdxcn-truncate", T.fg), item.label)
      span(row, cx("is-right mdxcn-num", T.muted), formatNumber(item.from))
      hidden(span(row, cx("is-center", up ? tone(ctx.palette, "primary") : down ? tone(ctx.palette, "secondary") : tone(ctx.palette, "empty")), up || down ? "→" : "–"))
      span(row, cx("is-right mdxcn-num", up ? tone(ctx.palette, "primary") : down ? tone(ctx.palette, "secondary") : T.fg), formatNumber(item.to))
    })
  },
  ascii(d) {
    const labels = colWidth(d.items.map((item) => item.label))
    const froms = colWidth([d.fromLabel, ...d.items.map((item) => formatNumber(item.from))])
    const tos = colWidth([d.toLabel, ...d.items.map((item) => formatNumber(item.to))])
    const header = `${col("", labels)}  ${col(d.fromLabel, froms, "right")}  ${col("", 1)}  ${col(d.toLabel, tos, "right")}`
    return [
      header,
      ...d.items.map((item) => `${col(item.label, labels)}  ${col(formatNumber(item.from), froms, "right")}  ${item.to === item.from ? "–" : "→"}  ${col(formatNumber(item.to), tos, "right")}`),
    ]
  },
  template: { title: "TRAFFIC", props: { fromLabel: "2025", toLabel: "2026" }, body: "- docs: 8,200 → 12,400\n- copy: 5,100 → 4,100\n- ship: 640 → 860" },
}

/* ---- Bullet ----------------------------------------------------------- */

interface BulletData extends Common {
  items: { label: string; value: number; target?: number; max?: number; display?: string }[]
  ticks: number
}

function bulletText(item: BulletData["items"][number]) {
  if (item.display) return item.display
  return item.target == null ? formatNumber(item.value) : `${formatNumber(item.value)} / ${formatNumber(item.target)}`
}

function bulletGeometry(item: BulletData["items"][number], ticks: number) {
  const peak = item.max ?? Math.max(item.value, item.target ?? 0, 1)
  const filled = Math.min(ticks, Math.round((Math.max(item.value, 0) / peak) * ticks))
  const mark = item.target == null ? null : Math.min(ticks - 1, Math.max(0, Math.round((Math.max(item.target, 0) / peak) * ticks)))
  return { filled, mark }
}

export const bullet: Spec<BulletData> = {
  slug: "graph-bullet",
  tag: "GraphBullet",
  name: "Bullet",
  aliases: ["bullet", "graph-bullet", "target", "budget", "goal"],
  group: "chart",
  summary: "A number with a goal sitting on the same track.",
  notFor: "A single fill from 0 to 1 is Meter.",
  items: { Target: "items" },
  read({ props, blocks }) {
    const data = entries(props.items)
    const items =
      data.length > 0
        ? data.map((entry) => ({
            label: entryText(entry, "label"),
            value: numberOf(entry.value),
            target: entry.target == null ? undefined : numberOf(entry.target),
            max: entry.max == null ? undefined : numberOf(entry.max),
            display: optStr(entry.display),
          }))
        : listItems(blocks).map((item) => {
            const { label, rest } = splitLabel(flat(itemSource(item)))
            const [value, restMax] = rest.split(/\s*\/\s*/)
            const [target, max] = (restMax ?? "").split(/\s+of\s+/i)
            return { label, value: numberOf(value), target: target ? numberOf(target) : undefined, max: max ? numberOf(max) : undefined }
          })
    return { ...base(props, "bullet"), items, ticks: numberOf(props.ticks, 20) }
  },
  render(d, ctx) {
    const marks = trackMarks(d.glyphs, { empty: "-", rest: "=", fill: "=" })
    const list = el(ctx.body, "ul", "mdxcn-list mdxcn-stack-2")
    d.items.forEach((item, index) => {
      const { filled, mark } = bulletGeometry(item, d.ticks)
      const row = labelRow(list, "mdxcn-meter-row", index)
      row.setAttr("aria-label", `${item.label} ${bulletText(item)}`)
      span(row, cx("mdxcn-truncate", T.fg), item.label)
      bracketTrack(row, d.ticks, (cell) => {
        const isMark = mark != null && cell === mark
        const isFill = cell < filled
        return {
          glyph: isMark ? "|" : isFill ? marks.fill : marks.empty,
          cls: isMark ? tone(ctx.palette, "secondary") : isFill ? (mark != null && cell > mark ? tone(ctx.palette, "secondary") : tone(ctx.palette, "primary")) : T.frame,
        }
      })
      span(row, cx("is-right mdxcn-num", T.muted), bulletText(item))
    })
  },
  ascii(d) {
    const labels = colWidth(d.items.map((item) => item.label))
    const values = d.items.map(bulletText)
    const valueWidth = colWidth(values)
    return d.items.map((item, index) => {
      const { filled, mark } = bulletGeometry(item, d.ticks)
      const cells = Array.from({ length: d.ticks }, (_, cell) => (mark != null && cell === mark ? "|" : cell < filled ? "=" : "-")).join("")
      return `${col(item.label, labels)}  [${cells}]  ${col(values[index] ?? "", valueWidth, "right")}`
    })
  },
  template: { title: "BUDGET", body: "- Design: 42 / 40\n- Motion: 18 / 24\n- Docs: 9 / 12" },
}

/* ---- Score ------------------------------------------------------------ */

interface ScoreData extends Common {
  items: { label: string; value: number; max?: number; accent: boolean }[]
  max?: number
}

function scoreFormat(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export const score: Spec<ScoreData> = {
  slug: "graph-score",
  tag: "GraphScore",
  name: "Score",
  aliases: ["score", "graph-score", "rating", "review", "stars"],
  group: "chart",
  summary: "A review, an eval, or a vendor pick scored out of five.",
  notFor: "Actual versus a target is Bullet. A ranked list of numbers is Rank.",
  read({ props, blocks }) {
    const data = entries(props.items)
    const items =
      data.length > 0
        ? data.map((entry) => ({ label: entryText(entry, "label"), value: numberOf(entry.value), max: entry.max == null ? undefined : numberOf(entry.max), accent: bool(entry.accent) }))
        : listItems(blocks).map((item) => {
            const source = itemSource(item)
            const { label, rest } = splitLabel(flat(source))
            const [value = "", out] = rest.split("/")
            return { label, value: numberOf(value), max: out ? numberOf(out) : undefined, accent: hasBold(source) }
          })
    return { ...base(props, "score"), items, max: props.max == null ? undefined : numberOf(props.max) }
  },
  render(d, ctx) {
    const fallback = d.max ?? d.items.find((item) => item.max)?.max ?? 5
    const marks = trackMarks(d.glyphs, { empty: "○", rest: "◐", fill: "●" })
    const anyAccent = d.items.some((item) => item.accent)
    const list = el(ctx.body, "ol", "mdxcn-list mdxcn-stack-2")
    d.items.forEach((item, index) => {
      const max = Math.max(1, Math.round(item.max ?? fallback))
      const value = Math.min(max, Math.max(0, item.value))
      const full = Math.floor(value)
      const half = value - full >= 0.5
      const lit = !anyAccent || item.accent
      const row = labelRow(list, "mdxcn-score", index)
      row.setAttr("aria-label", `${item.label} ${scoreFormat(value)} of ${max}`)
      span(row, cx("mdxcn-truncate", item.accent ? tone(ctx.palette, "primary") : T.fg), item.label)
      track(
        row,
        Array.from({ length: max }, (_, dot) => {
          const on = dot < full
          const partial = !on && half && dot === full
          return { glyph: on ? marks.fill : partial ? marks.rest : marks.empty, cls: on || partial ? (lit ? tone(ctx.palette, "primary") : tone(ctx.palette, "secondary")) : T.frame }
        }),
        "is-start"
      )
      span(row, cx("is-right mdxcn-num", T.muted), `${scoreFormat(value)}/${max}`)
    })
  },
  ascii(d) {
    const fallback = d.max ?? d.items.find((item) => item.max)?.max ?? 5
    const labels = colWidth(d.items.map((item) => item.label))
    return d.items.map((item) => {
      const out = Math.max(1, Math.round(item.max ?? fallback))
      const value = Math.min(out, Math.max(0, item.value))
      const full = Math.floor(value)
      const half = value - full >= 0.5 ? 1 : 0
      return `${col(item.label, labels)}  ${"●".repeat(full)}${"◐".repeat(half)}${"○".repeat(out - full - half)}  ${scoreFormat(value)}/${out}`
    })
  },
  template: { title: "REVIEW", body: "- Performance: 4/5\n- Accessibility: 5/5\n- **Docs: 2.5/5**" },
}

/* ---- Heatmap ---------------------------------------------------------- */

interface HeatmapData extends Common {
  columns: string[]
  rows: { label: string; values: number[] }[]
  max?: number
  legend: boolean
  caption?: string
}

function intensityScale(parent: HTMLElement, glyphs: readonly string[], palette: Common["palette"]) {
  const scale = el(parent, "p", cx("mdxcn-scale", T.muted))
  span(scale, undefined, "Less")
  const set = hidden(span(scale, "mdxcn-scale-glyphs"))
  glyphs.forEach((glyph, index) => span(set, intensityTone(Math.round((index / Math.max(glyphs.length - 1, 1)) * 4), palette), glyph))
  span(scale, undefined, "More")
}

export const heatmap: Spec<HeatmapData> = {
  slug: "graph-heatmap",
  tag: "GraphHeatmap",
  name: "Heatmap",
  aliases: ["heatmap", "graph-heatmap", "intensity", "hours"],
  group: "chart",
  summary: "A labeled grid of intensities.",
  notFor: "Exact numbers on both axes are Matrix. A contribution calendar is Activity.",
  items: { Row: "__rows" },
  read({ props, blocks }) {
    const markdown = labeledTable(blocks)
    const tagged = entries(props.__rows)
    const rows = Array.isArray(props.rows)
      ? entries(props.rows).map((row) => ({ label: str(row.label), values: numbers(row.values) }))
      : tagged.length > 0
        ? tagged.map((row) => ({ label: str(row.label), values: numbers(str(row.children)) }))
        : (markdown?.rows ?? []).map((row) => ({ label: row.label, values: numbers(row.values.join(" ")) }))
    return {
      ...base(props, "heatmap"),
      columns: props.columns != null ? words(props.columns) : (markdown?.columns ?? []),
      rows,
      max: props.max == null ? undefined : numberOf(props.max),
      legend: bool(props.legend, true),
      caption: optStr(props.caption),
    }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-4")
    const peak = d.max ?? Math.max(0, ...d.rows.flatMap((row) => row.values))
    const set = resolveGlyphs(d.glyphs)
    const grid = div(ctx.body, "mdxcn-heatmap")
    vars(grid, { "--cols": Math.max(d.columns.length, 1) })
    const head = div(grid, "mdxcn-heat-row")
    span(head)
    d.columns.forEach((column) => span(head, cx("mdxcn-truncate is-center", T.muted), column))
    const list = el(grid, "ul", "mdxcn-list mdxcn-stack-1")
    d.rows.forEach((row, index) => {
      const line = labelRow(list, "mdxcn-heat-row", index)
      line.setAttr("aria-label", `${row.label}: ${d.columns.map((column, at) => `${column} ${row.values[at] ?? 0}`).join(", ")}`)
      span(line, cx("mdxcn-truncate", T.fg), row.label)
      d.columns.forEach((_, at) => {
        const level = intensityLevel(row.values[at] ?? 0, peak)
        hidden(span(line, cx("is-center mdxcn-heat-cell", intensityTone(level, ctx.palette)), intensityGlyph(level, set)))
      })
    })
    if (d.legend || d.caption) {
      const foot = div(ctx.body, "mdxcn-split is-wrap")
      if (d.caption) el(foot, "p", T.muted, d.caption)
      else span(foot)
      if (d.legend) intensityScale(foot, set, ctx.palette)
    }
  },
  ascii(d) {
    const peak = d.max ?? Math.max(0, ...d.rows.flatMap((row) => row.values))
    const labels = colWidth(d.rows.map((row) => row.label))
    const width = Math.max(1, colWidth(d.columns))
    const lines = [`${col("", labels)}  ${d.columns.map((column) => col(column, width)).join(" ")}`.trimEnd()]
    for (const row of d.rows) {
      lines.push(`${col(row.label, labels)}  ${d.columns.map((_, at) => col(intensityGlyph(intensityLevel(row.values[at] ?? 0, peak)), width)).join(" ")}`.trimEnd())
    }
    if (d.legend || d.caption) lines.push("", [d.caption, d.legend ? `Less ${GLYPH_SETS.shade.join("")} More` : ""].filter(Boolean).join("  "))
    return lines
  },
  template: {
    title: "DEPLOYS",
    props: { palette: "duo" },
    body: "| | 0 | 4 | 8 | 12 | 16 | 20 |\n| --- | --- | --- | --- | --- | --- | --- |\n| Mon | 0 | 1 | 4 | 8 | 6 | 1 |\n| Tue | 0 | 0 | 5 | 9 | 4 | 2 |\n| Wed | 1 | 0 | 6 | 12 | 5 | 1 |\n| Thu | 0 | 2 | 4 | 7 | 8 | 3 |\n| Fri | 0 | 1 | 3 | 5 | 2 | 0 |",
  },
}

/* ---- Activity --------------------------------------------------------- */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAY_MS = 86_400_000

interface ActivityData extends Common {
  days: { date: string; count: number }[]
  weekStartsOn: 0 | 1
  max?: number
  legend: boolean
  caption?: string | false
}

function parseUTC(iso: string) {
  const [year = 1970, month = 1, day = 1] = iso.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

function toISO(utc: number) {
  return new Date(utc).toISOString().slice(0, 10)
}

function buildWeeks(days: ActivityData["days"], weekStartsOn: 0 | 1) {
  if (days.length === 0) return [] as { date: string; count: number; inRange: boolean }[][]
  const counts = new Map<string, number>()
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const day of days) {
    const time = parseUTC(day.date)
    counts.set(day.date, (counts.get(day.date) ?? 0) + day.count)
    min = Math.min(min, time)
    max = Math.max(max, time)
  }
  const lead = (new Date(min).getUTCDay() - weekStartsOn + 7) % 7
  const trail = (weekStartsOn + 6 - new Date(max).getUTCDay() + 7) % 7
  const weeks: { date: string; count: number; inRange: boolean }[][] = []
  let week: { date: string; count: number; inRange: boolean }[] = []
  for (let time = min - lead * DAY_MS; time <= max + trail * DAY_MS; time += DAY_MS) {
    const date = toISO(time)
    const inRange = time >= min && time <= max
    week.push({ date, count: inRange ? (counts.get(date) ?? 0) : 0, inRange })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  return weeks
}

function monthLabels(weeks: ReturnType<typeof buildWeeks>) {
  return weeks.map((week) => {
    const start = week.find((cell) => cell.inRange && new Date(parseUTC(cell.date)).getUTCDate() === 1)
    return start ? (MONTHS_SHORT[new Date(parseUTC(start.date)).getUTCMonth()] ?? "") : ""
  })
}

function activityDays(blocks: Block[], body: string) {
  const items = listItems(blocks)
  const rows = items.length > 0 ? items.map((item) => item.raw.trim()) : (blocks.length > 0 ? sourceOf(blocks) : body).split("\n")
  return rows.flatMap((row) => {
    const { label, rest } = splitLabel(row.trim())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return []
    const start = parseUTC(label)
    return runs(rest)
      .map(Number)
      .filter(Number.isFinite)
      .map((count, index) => ({ date: toISO(start + index * DAY_MS), count }))
  })
}

export const activity: Spec<ActivityData> = {
  slug: "graph-activity",
  tag: "GraphActivity",
  name: "Activity",
  aliases: ["activity", "graph-activity", "contributions", "github"],
  group: "chart",
  summary: "Daily counts over months, like a contribution grid.",
  notFor: "One month of marks is Calendar. Up or down days is Uptime.",
  read({ props, blocks, body }) {
    const data = entries(props.days)
    const days = data.length > 0 ? data.map((entry) => ({ date: str(entry.date), count: numberOf(entry.count) })) : activityDays(blocks, body)
    const caption = props.caption === false || props.caption === "false" ? false : optStr(props.caption)
    return {
      ...base(props, "activity"),
      days,
      weekStartsOn: numberOf(props.weekStartsOn, 0) === 1 ? 1 : 0,
      max: props.max == null ? undefined : numberOf(props.max),
      legend: bool(props.legend, true),
      caption,
    }
  },
  render(d, ctx) {
    ctx.body.addClass("mdxcn-stack-4")
    const weeks = buildWeeks(d.days, d.weekStartsOn)
    const months = monthLabels(weeks)
    const labels = d.weekStartsOn === 1 ? ["M", "", "W", "", "F", "", ""] : ["", "M", "", "W", "", "F", ""]
    const peak = d.max ?? Math.max(0, ...d.days.map((day) => day.count))
    const total = d.days.reduce((sum, day) => sum + day.count, 0)
    const set = resolveGlyphs(d.glyphs)
    const scroll = div(ctx.body, "mdxcn-scroll-x")
    const grid = div(scroll, "mdxcn-activity")
    vars(grid, { "--weeks": Math.max(weeks.length, 1) })
    const monthRow = div(grid, "mdxcn-activity-months")
    span(monthRow)
    months.forEach((month) => span(monthRow, T.muted, month))
    const body = div(grid, "mdxcn-activity-body")
    const dayCol = div(body, "mdxcn-activity-days")
    labels.forEach((label) => span(dayCol, T.muted, label || " "))
    weeks.forEach((week, weekIndex) => {
      const column = rise(div(body, "mdxcn-activity-week"), weekIndex, 10)
      for (const cell of week) {
        const level = cell.inRange ? intensityLevel(cell.count, peak) : 0
        const glyph = span(column, cell.inRange ? intensityTone(level, ctx.palette) : T.clear, cell.inRange ? intensityGlyph(level, set) : (set[0] ?? "·"))
        glyph.setAttr("title", `${cell.date}: ${cell.count}`)
      }
    })
    if (!(d.caption === false && !d.legend)) {
      const foot = div(ctx.body, cx("mdxcn-split is-wrap", d.caption === false && "is-end"))
      if (d.caption !== false) el(foot, "p", cx(T.muted, "mdxcn-num"), d.caption ?? `${total.toLocaleString("en-US")} contributions`)
      if (d.legend) intensityScale(foot, set, ctx.palette)
    }
    sr(ctx.body, `${total} contributions across ${d.days.length} days`)
  },
  ascii(d) {
    const weeks = buildWeeks(d.days, d.weekStartsOn)
    const months = monthLabels(weeks)
    const peak = d.max ?? Math.max(0, ...d.days.map((day) => day.count))
    const labels = d.weekStartsOn === 1 ? ["M", " ", "W", " ", "F", " ", " "] : [" ", "M", " ", "W", " ", "F", " "]
    const header = Array.from({ length: weeks.length + 6 }, () => " ")
    months.forEach((month, index) => {
      if (!month) return
      for (let at = 0; at < month.length; at += 1) header[index + at] = month[at] ?? " "
    })
    const lines = [`   ${header.join("").trimEnd()}`]
    for (let day = 0; day < 7; day += 1) {
      lines.push(`${labels[day]}  ${weeks.map((week) => (week[day]?.inRange ? intensityGlyph(intensityLevel(week[day]?.count ?? 0, peak)) : " ")).join("")}`.trimEnd())
    }
    const total = d.days.reduce((sum, day) => sum + day.count, 0)
    const first = d.days[0]?.date
    lines.push("", [d.caption === false ? "" : (d.caption ?? `${total.toLocaleString("en-US")} contributions`), first ? `from ${first}` : "", d.legend ? `Less ${GLYPH_SETS.shade.join("")} More` : ""].filter(Boolean).join("  "))
    return lines
  },
  template: {
    title: "SHIPPED",
    props: { weekStartsOn: 1, caption: "Jun – Aug" },
    body: "- 2026-06-01: 3 7 0 12 4 0 0 5 8 2 9 1 0 0 6 4 11 3 7 0 0 2 9 5 13 6 0 0 1 4 8 2 10 0 0 7 3 5 9 4 0 0 2 6 12 8 3 0 0 4 1 7 5 9 0 0 3 8 6 2 11 0 0 5 9 4 7 3 0 0 2 6 10 1 8 0 0 4 7 3 9 5 0 0 6 2 8 12 4 0 0",
  },
}

/* ---- Uptime ----------------------------------------------------------- */

type Status = "ok" | "degraded" | "down" | "empty"
const STATUSES = new Set<Status>(["ok", "degraded", "down", "empty"])

interface UptimeData extends Common {
  days: Status[]
  from?: string
  to?: string
  columns: number
}

function statusOf(token: string): Status | undefined {
  const key = token.toLowerCase()
  if (STATUSES.has(key as Status)) return key as Status
  if (key === "up" || key === "█") return "ok"
  if (key === "slow" || key === "▒") return "degraded"
  if (key === "·" || key === "x") return "down"
  if (key === "-") return "empty"
  return undefined
}

function uptimeMarks(glyphs?: Common["glyphs"]) {
  const set = resolveGlyphs(glyphs)
  const last = set.length - 1
  return { ok: set[last] ?? "█", degraded: set[Math.min(2, last)] ?? "▒", down: set[0] ?? "·", empty: "-" } as Record<Status, string>
}

function uptimePercent(days: Status[]) {
  const known = days.filter((day) => day !== "empty")
  return known.length === 0 ? 0 : Math.round((known.filter((day) => day === "ok").length / known.length) * 100)
}

export const uptime: Spec<UptimeData> = {
  slug: "graph-uptime",
  tag: "GraphUptime",
  name: "Uptime",
  aliases: ["uptime", "graph-uptime", "status", "sla"],
  group: "chart",
  summary: "A status per day, or the blast radius of an outage.",
  notFor: "A heatmap or an activity grid.",
  read({ props, blocks, body }) {
    const source = props.days ?? (blocks.length > 0 ? sourceOf(blocks) : body)
    const days = runs(Array.isArray(source) ? source.map(String) : str(source))
      .map(statusOf)
      .filter((day): day is Status => day != null)
    return { ...base(props, "uptime"), days, from: optStr(props.from), to: optStr(props.to), columns: Math.max(1, numberOf(props.columns, 30)) }
  },
  render(d, ctx) {
    ctx.body.addClasses(["mdxcn-stack-4", "is-center"])
    const marks = uptimeMarks(d.glyphs)
    const tones: Record<Status, string> = { ok: tone(ctx.palette, "primary"), degraded: tone(ctx.palette, "secondary"), down: tone(ctx.palette, "empty"), empty: tone(ctx.palette, "empty") }
    const wrap = div(ctx.body, "mdxcn-uptime")
    const grid = hidden(div(wrap, "mdxcn-stack-1"))
    for (let index = 0; index < d.days.length; index += d.columns) {
      const row = rise(span(grid, "mdxcn-uptime-row"), index / d.columns)
      d.days.slice(index, index + d.columns).forEach((day) => span(row, tones[day], marks[day]))
    }
    const meta = div(wrap, "mdxcn-split is-wrap")
    el(meta, "p", cx("mdxcn-num", tones.ok), `${uptimePercent(d.days)}%`)
    if (d.from || d.to) {
      const range = el(meta, "p", cx("mdxcn-row-3", T.muted))
      if (d.from) span(range, undefined, d.from)
      if (d.to) span(range, undefined, d.to)
    }
    const legend = el(ctx.body, "p", cx("mdxcn-legend", T.muted))
    for (const [status, label] of [
      ["ok", "up"],
      ["degraded", "slow"],
      ["down", "down"],
    ] as const) {
      const item = span(legend)
      span(item, tones[status], marks[status])
      item.appendText(` ${label}`)
    }
    sr(ctx.body, `${uptimePercent(d.days)} percent uptime over ${d.days.filter((day) => day !== "empty").length} days`)
  },
  ascii(d) {
    const mark = { ok: "█", degraded: "▒", down: "·", empty: "-" } as Record<Status, string>
    const rows: string[] = []
    for (let index = 0; index < d.days.length; index += d.columns) rows.push(d.days.slice(index, index + d.columns).map((day) => mark[day]).join(""))
    const range = [d.from, d.to].filter(Boolean).join("  ")
    return [...rows, range ? `${uptimePercent(d.days)}%  ${range}` : `${uptimePercent(d.days)}%`, "█ up  ▒ slow  · down"]
  },
  template: { title: "API", props: { from: "Jun 1", to: "Aug 29" }, body: "ok*18 degraded ok*22 down*2 ok*30 degraded ok*16" },
}

export const CHARTS = [bars, rank, cells, meter, spark, stack, funnel, plot, waffle, waterfall, slope, bullet, score, heatmap, activity, uptime]
