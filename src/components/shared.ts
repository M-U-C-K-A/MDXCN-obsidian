import { flat, isObject, optStr, str } from "../parse/inline"
import type { Common, Glyphs, Palette } from "../types"

export function paletteOf(value: unknown): Palette | undefined {
  const text = optStr(value)?.toLowerCase()
  return text === "mono" || text === "duo" || text === "multi" ? text : undefined
}

/** Title, corner, palette, glyphs: the props every graph takes. */
export function base(props: Record<string, unknown>, fallbackTitle?: string): Common {
  const glyphs = props.glyphs
  return {
    title: optStr(props.title) ?? fallbackTitle,
    corner: optStr(props.corner),
    palette: paletteOf(props.palette),
    glyphs: Array.isArray(glyphs) ? glyphs.map(String) : (optStr(glyphs) as Glyphs | undefined),
  }
}

/** A data-form entry may be a string, or an object with `children` text. */
export function entryText(entry: unknown, ...keys: string[]): string {
  if (entry == null) return ""
  if (!isObject(entry)) return str(entry)
  for (const key of keys) {
    const value = entry[key]
    if (value != null && value !== "") return str(value)
  }
  return flat(str(entry.children))
}

export function entries(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => (isObject(entry) ? entry : { label: str(entry), children: str(entry) }))
}

/** `state` words accepted across the library. */
export function stateOf(value: unknown): "done" | "now" | "next" | undefined {
  const text = optStr(value)?.toLowerCase()
  if (text === "done" || text === "now" || text === "next") return text
  return undefined
}
