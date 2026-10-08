/*
 * The official fenced ASCII frame. A port of mdxcn's knap `frame.ts`: the
 * same widths, the same dashes, the same `[ TITLE ]` caption. Pasted into a
 * README it looks the same as on mdxcn.dev.
 */

export const MIN_INNER = 48

/** Display width: wide glyphs (CJK, emoji) count as two. */
export function widthOf(text: string) {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    width += code >= 0x1100 && isWide(code) ? 2 : 1
  }
  return width
}

function isWide(code: number) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  )
}

export function padEnd(text: string, size: number) {
  const extra = size - widthOf(text)
  if (extra > 0) return text + " ".repeat(extra)
  return extra === 0 ? text : [...text].slice(0, size).join("")
}

export function padStart(text: string, size: number) {
  const extra = size - widthOf(text)
  if (extra > 0) return " ".repeat(extra) + text
  return extra === 0 ? text : [...text].slice(-size).join("")
}

export function dash(count: number) {
  return "-".repeat(Math.max(0, count))
}

export function col(text: string, size: number, align: "left" | "right" = "left") {
  return align === "right" ? padStart(text, size) : padEnd(text, size)
}

export function colWidth(values: string[]) {
  return Math.max(0, ...values.map(widthOf))
}

export function fillTrack(filled: number, total: number, on = "=", off = "-") {
  const count = Math.min(total, Math.max(0, filled))
  return on.repeat(count) + off.repeat(total - count)
}

export function wrapText(text: string, width = 56): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (current && widthOf(next) > width) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

export function frameAscii(title: string | undefined, lines: string[], minInner = MIN_INNER) {
  const caption = title?.trim() ? `[ ${title.trim().toUpperCase()} ]` : ""
  const contentWidth = Math.max(0, ...lines.map(widthOf))
  const inner = Math.max(minInner, contentWidth, caption ? widthOf(caption) + 4 : 0)
  const span = inner + 2
  const empty = `| ${" ".repeat(inner)} |`
  const body = lines.map((line) => `| ${padEnd(line, inner)} |`)
  let top = `+${dash(span)}+`
  if (caption) {
    const label = ` ${caption} `
    const leftover = Math.max(0, span - widthOf(label))
    const left = Math.floor(leftover / 2)
    top = `+${dash(left)}${label}${dash(leftover - left)}+`
  }
  return [top, empty, ...body, empty, `+${dash(span)}+`].join("\n")
}

export function fence(ascii: string, lang = "") {
  return `\`\`\`${lang}\n${ascii}\n\`\`\``
}

/* ---- reading a frame back ------------------------------------------- */

const TOP = /^\s*\+(-*)(?:\s*\[\s*(.*?)\s*\]\s*(-*))?\+\s*$/
const BOTTOM = /^\s*\+-+\+\s*$/

export interface ReadFrame {
  title?: string
  lines: string[]
  framed: boolean
}

/** Strip the frame. Tolerant of ragged right edges and missing padding. */
export function readFrame(source: string): ReadFrame {
  const all = source.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")
  while (all.length > 0 && all[0]?.trim() === "") all.shift()
  while (all.length > 0 && all[all.length - 1]?.trim() === "") all.pop()

  const top = all[0]?.match(TOP)
  if (!top) {
    return { lines: all.map((line) => line.replace(/\s+$/, "")), framed: false }
  }

  const title = top[2] != null && top[2] !== "" ? top[2] : undefined
  const bottomAt = all.length > 1 && BOTTOM.test(all[all.length - 1] ?? "") ? all.length - 1 : all.length
  const inner = all.slice(1, bottomAt).map((line) => {
    let text = line.replace(/\s+$/, "")
    const lead = text.match(/^\s*\|\s?/)
    if (lead) text = text.slice(lead[0].length)
    text = text.replace(/\s?\|$/, "")
    return text.replace(/\s+$/, "")
  })

  while (inner.length > 0 && inner[0]?.trim() === "") inner.shift()
  while (inner.length > 0 && inner[inner.length - 1]?.trim() === "") inner.pop()

  return { title, lines: inner.map((line) => (line.trim() === "" ? "" : line)), framed: true }
}

/** Split a source holding several frames (blank lines or prose between). */
export function splitFrames(source: string): { frame: string; before: string }[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const out: { frame: string; before: string }[] = []
  let before: string[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ""
    if (TOP.test(line)) {
      const start = index
      index += 1
      while (index < lines.length && !BOTTOM.test(lines[index] ?? "")) {
        if (TOP.test(lines[index] ?? "") && index > start) break
        index += 1
      }
      const end = Math.min(index, lines.length - 1)
      out.push({ frame: lines.slice(start, end + 1).join("\n"), before: before.join("\n") })
      before = []
      index = end + 1
      continue
    }
    before.push(line)
    index += 1
  }
  if (before.join("").trim() && out.length > 0) out.push({ frame: "", before: before.join("\n") })
  return out
}

export function isTopLine(line: string) {
  return TOP.test(line)
}

/** Does this text look like an mdxcn frame? Used for untagged fences. */
export function looksLikeFrame(source: string) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim() !== "")
  if (lines.length < 2) return false
  const first = lines[0] ?? ""
  const last = lines[lines.length - 1] ?? ""
  if (!TOP.test(first) || !BOTTOM.test(last)) return false
  if (/\[\s*.+?\s*\]/.test(first)) return true
  // Untitled frames (Quote) must be a full box: every inner line is walled.
  return lines.slice(1, -1).every((line) => /^\s*\|/.test(line))
}
