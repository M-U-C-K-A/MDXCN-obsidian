/*
 * JS-ish literal reading for JSX attribute expressions: `{0.58}`,
 * `{["q1", "q2"]}`, `{{ label: 'x', value: 2, }}`, `{true}`.
 */

export function parseLiteral(source: string): unknown {
  const text = source.trim()
  if (text === "") return undefined
  if (text === "true") return true
  if (text === "false") return false
  if (text === "null" || text === "undefined") return undefined
  if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) return Number(text)
  const date = text.match(/^new Date\(\s*(['"`])(.*)\1\s*\)$/)
  if (date) return date[2]
  try {
    return JSON.parse(text)
  } catch {
    // fall through to the relaxed reader
  }
  try {
    return JSON.parse(relax(text))
  } catch {
    const string = text.match(/^(['"`])([\s\S]*)\1$/)
    return string ? string[2] : text
  }
}

/** Single quotes → double, bare keys quoted, trailing commas dropped. */
function relax(text: string): string {
  let out = ""
  let index = 0
  while (index < text.length) {
    const char = text[index]!
    if (char === "'" || char === "`" || char === '"') {
      let end = index + 1
      let value = ""
      while (end < text.length && text[end] !== char) {
        if (text[end] === "\\" && end + 1 < text.length) {
          value += text[end + 1] === char ? char : `\\${text[end + 1]}`
          end += 2
          continue
        }
        value += text[end]
        end += 1
      }
      out += JSON.stringify(value.replace(/\\(?!["\\/bfnrtu])/g, ""))
      index = end + 1
      continue
    }
    if (/[A-Za-z_$]/.test(char)) {
      const word = text.slice(index).match(/^[A-Za-z_$][\w$]*/)?.[0] ?? char
      const rest = text.slice(index + word.length)
      if (/^\s*:/.test(rest)) out += JSON.stringify(word)
      else if (word === "undefined") out += "null"
      else out += word
      index += word.length
      continue
    }
    if (char === ",") {
      const rest = text.slice(index + 1)
      if (/^\s*[\]}]/.test(rest)) {
        index += 1
        continue
      }
    }
    out += char
    index += 1
  }
  return out
}

/** A JSX attribute list: `title="LAUNCH" progress={0.58} legend`. */
export function parseAttributes(source: string): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  let index = 0
  const text = source
  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index]!)) index += 1
    if (index >= text.length) break
    const name = text.slice(index).match(/^[A-Za-z_:@#.][\w:.\-]*/)?.[0]
    if (!name) {
      index += 1
      continue
    }
    index += name.length
    while (index < text.length && /\s/.test(text[index]!)) index += 1
    if (text[index] !== "=") {
      props[clean(name)] = true
      continue
    }
    index += 1
    while (index < text.length && /\s/.test(text[index]!)) index += 1
    const open = text[index]
    if (open === '"' || open === "'") {
      const end = text.indexOf(open, index + 1)
      const raw = text.slice(index + 1, end < 0 ? undefined : end)
      props[clean(name)] = name.startsWith(":") ? parseLiteral(raw) : raw
      index = end < 0 ? text.length : end + 1
      continue
    }
    if (open === "{") {
      const end = matchBrace(text, index)
      props[clean(name)] = parseLiteral(text.slice(index + 1, end))
      index = end + 1
      continue
    }
    const bare = text.slice(index).match(/^[^\s}]+/)?.[0] ?? ""
    props[clean(name)] = parseLiteral(bare)
    index += bare.length
  }
  return props
}

function clean(name: string) {
  return name.replace(/^:/, "")
}

/** Index of the brace that closes the one at `start`, strings respected. */
export function matchBrace(text: string, start: number): number {
  let depth = 0
  let quote: string | null = null
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (char === "\\") index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === "`") quote = char
    else if (char === "{" || char === "[") depth += 1
    else if (char === "}" || char === "]") {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return text.length
}
