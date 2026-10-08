/*
 * Inline Markdown helpers. mdxcn reads most labels as plain text (React's
 * `textOf`) and checks for marks (`hasHost(strong)`) to pick a state. Here the
 * children arrive as raw Markdown, so the same questions are asked of strings.
 */

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: InlineToken[] }
  | { kind: "em"; children: InlineToken[] }
  | { kind: "del"; children: InlineToken[] }
  | { kind: "link"; href: string; children: InlineToken[] }
  | { kind: "wikilink"; target: string; alias?: string }

/** Tokenize one line (or a short paragraph) of inline Markdown. */
export function tokenize(source: string): InlineToken[] {
  const out: InlineToken[] = []
  let text = ""
  let index = 0

  const flush = () => {
    if (text) {
      out.push({ kind: "text", text })
      text = ""
    }
  }

  while (index < source.length) {
    const rest = source.slice(index)
    const char = source[index]

    if (char === "\\" && index + 1 < source.length && /[\\`*_~[\]()#+\-.!|>]/.test(source[index + 1] ?? "")) {
      text += source[index + 1]
      index += 2
      continue
    }

    if (char === "`") {
      const fence = rest.match(/^(`+)([\s\S]*?[^`])\1(?!`)/)
      if (fence) {
        flush()
        out.push({ kind: "code", text: (fence[2] ?? "").replace(/^ (.*) $/, "$1") })
        index += fence[0].length
        continue
      }
    }

    if (rest.startsWith("[[")) {
      const wiki = rest.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
      if (wiki) {
        flush()
        out.push({ kind: "wikilink", target: (wiki[1] ?? "").trim(), alias: wiki[2]?.trim() })
        index += wiki[0].length
        continue
      }
    }

    if (char === "[") {
      const link = rest.match(/^\[((?:[^\]\\]|\\.)*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/)
      if (link) {
        flush()
        out.push({ kind: "link", href: link[2] ?? "", children: tokenize(link[1] ?? "") })
        index += link[0].length
        continue
      }
    }

    if (rest.startsWith("~~")) {
      const del = rest.match(/^~~(?=\S)([\s\S]*?\S)~~/)
      if (del) {
        flush()
        out.push({ kind: "del", children: tokenize(del[1] ?? "") })
        index += del[0].length
        continue
      }
    }

    if (rest.startsWith("**") || rest.startsWith("__")) {
      const mark = rest.slice(0, 2)
      const re = mark === "**" ? /^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/ : /^__(?=\S)([\s\S]*?\S)__(?!\w)/
      const strong = rest.match(re)
      if (strong && (mark === "**" || !/\w/.test(source[index - 1] ?? ""))) {
        flush()
        out.push({ kind: "strong", children: tokenize(strong[1] ?? "") })
        index += strong[0].length
        continue
      }
    }

    if (char === "*" || char === "_") {
      const re = char === "*" ? /^\*(?=[^\s*])((?:\*\*[^*]+\*\*|[^*])*?[^\s*])\*(?!\*)/ : /^_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/
      const em = rest.match(re)
      const before = source[index - 1] ?? ""
      // `ok*40` is a run, not emphasis: a `*` glued to a word on the left with
      // digits after it stays text.
      const glued = /\w/.test(before) && (char === "_" || /^\*\d/.test(rest))
      if (em && !glued) {
        flush()
        out.push({ kind: "em", children: tokenize(em[1] ?? "") })
        index += em[0].length
        continue
      }
    }

    text += char
    index += 1
  }

  flush()
  return out
}

function tokensText(tokens: InlineToken[]): string {
  return tokens
    .map((token) => {
      switch (token.kind) {
        case "text":
        case "code":
          return token.text
        case "wikilink":
          return token.alias ?? token.target
        default:
          return tokensText(token.children)
      }
    })
    .join("")
}

/** Visible text: marks removed. `**a** \`b\`` → `a b`. */
export function plain(source: string): string {
  return tokensText(tokenize(source))
}

/** Plain text with whitespace collapsed. */
export function flat(source: string): string {
  return plain(source).replace(/\s+/g, " ").trim()
}

function has(tokens: InlineToken[], kind: InlineToken["kind"]): boolean {
  return tokens.some((token) => {
    if (token.kind === kind) return true
    if ("children" in token) return has(token.children, kind)
    return false
  })
}

export function hasBold(source: string) {
  return has(tokenize(source), "strong")
}

export function hasItalic(source: string) {
  return has(tokenize(source), "em")
}

export function hasCode(source: string) {
  return has(tokenize(source), "code")
}

export function hasDel(source: string) {
  return has(tokenize(source), "del")
}

/** Rich enough to deserve inline rendering rather than plain text. */
export function isRich(source: string) {
  const tokens = tokenize(source)
  return tokens.some((token) => token.kind !== "text")
}

/** `Mar 18: Docs, live` → { label: "Mar 18", rest: "Docs, live" }. */
export function splitLabel(text: string): { label: string; rest: string } {
  const match = text.match(/^(.+?):\s+([\s\S]+)$/)
  if (!match) return { label: text, rest: "" }
  return { label: (match[1] ?? text).trim(), rest: (match[2] ?? "").trim() }
}

/** `graph-tree.tsx — ui` → { label, rest } on an em or en dash. */
export function splitDash(text: string): { label: string; rest: string } {
  const parts = text.split(/\s+[—–]\s+/)
  if (parts.length < 2) return { label: text, rest: "" }
  return {
    label: (parts[0] ?? text).trim(),
    rest: parts.slice(1).join(" — ").trim(),
  }
}

/** First word and the rest: `12,400 docs`. */
export function firstToken(text: string): { token: string; rest: string } {
  const match = text.match(/^(\S+)\s*([\s\S]*)$/)
  if (!match) return { token: text, rest: "" }
  return { token: match[1] ?? text, rest: match[2] ?? "" }
}

/** `ok*40` → forty `ok`s. Any token list in the grammar can use a run. */
export function runs(value: readonly string[] | string | undefined | null): string[] {
  const tokens =
    value == null ? [] : typeof value === "string" ? value.split(/[\s,]+/).filter(Boolean) : [...value].map(String)
  const out: string[] = []
  for (const token of tokens) {
    const match = token.match(/^(.+?)[*×](\d{1,4})$/)
    if (!match) {
      out.push(token)
      continue
    }
    const count = Math.min(5000, Number(match[2]))
    for (let index = 0; index < count; index += 1) out.push(match[1] ?? token)
  }
  return out
}

/** `[2, 3]`, `"2 3"`, `"2, 3"`, `"0*2 4"` → numbers. */
export function numbers(value: unknown): number[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.map((entry) => numberOf(entry, Number.NaN)).filter(Number.isFinite)
  if (typeof value === "number") return Number.isFinite(value) ? [value] : []
  return runs(String(value))
    .map((entry) => Number(entry.replace(/,(?=\d{3}\b)/g, "")))
    .filter((entry) => Number.isFinite(entry))
}

/** `["ok", "down"]` or `"ok down"` → list of words. */
export function words(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) return value.map(String)
  return String(value).split(/[\s,]+/).filter(Boolean)
}

/** `0.67`, `"0.67"`, `"67%"` → 0.67. */
export function fraction(value: unknown, fallback = 0): number {
  if (value == null) return fallback
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback
  const text = String(value).trim()
  const parsed = Number.parseFloat(text)
  if (!Number.isFinite(parsed)) return fallback
  return text.endsWith("%") ? parsed / 100 : parsed
}

/** `42`, `"12,400"`, `"100%"`, `"−6"` → number. */
export function numberOf(value: unknown, fallback = 0): number {
  if (value == null) return fallback
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback
  if (typeof value === "boolean") return value ? 1 : 0
  const parsed = Number.parseFloat(String(value).replace(/,/g, "").replace(/^−/, "-").replace(/^\+/, ""))
  return Number.isFinite(parsed) ? parsed : fallback
}

export function bool(value: unknown, fallback = false): boolean {
  if (value == null) return fallback
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  const text = String(value).trim().toLowerCase()
  if (["true", "yes", "1", "on"].includes(text)) return true
  if (["false", "no", "0", "off"].includes(text)) return false
  return fallback
}

export function str(value: unknown, fallback = ""): string {
  if (value == null) return fallback
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return fallback
}

export function optStr(value: unknown): string | undefined {
  if (value == null || value === "") return undefined
  return str(value)
}

export function list<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  return []
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function formatNumber(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  })
}
