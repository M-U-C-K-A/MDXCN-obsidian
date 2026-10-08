import type { Glyphs, Palette } from "./types"

export const GLYPH_SETS = {
  shade: ["·", "░", "▒", "▓", "█"],
  ascii: [".", "-", "=", "#", "@"],
  hash: [".", ":", "+", "#", "█"],
  bar: ["▁", "▂", "▃", "▅", "█"],
} as const

export const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const
export const STACK = ["█", "▓", "▒", "░", "#", "=", "+", "-"] as const

export const DIM = "is-dim"

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function resolveGlyphs(glyphs?: Glyphs | string): readonly string[] {
  if (glyphs == null || glyphs === "") return GLYPH_SETS.shade
  if (typeof glyphs === "string") {
    if (glyphs in GLYPH_SETS) return GLYPH_SETS[glyphs as keyof typeof GLYPH_SETS]
    const custom = [...glyphs.replace(/[\s,]+/g, "")]
    return custom.length > 0 ? custom : GLYPH_SETS.shade
  }
  return glyphs.length > 0 ? glyphs : GLYPH_SETS.shade
}

export function trackMarks(
  glyphs?: Glyphs | string,
  fallback: { empty: string; rest: string; fill: string } = { empty: "-", rest: "░", fill: "█" }
) {
  if (glyphs == null || glyphs === "") return fallback
  const set = resolveGlyphs(glyphs)
  const last = set.length - 1
  return {
    empty: set[0] ?? fallback.empty,
    rest: set[Math.min(1, last)] ?? fallback.rest,
    fill: set[last] ?? fallback.fill,
  }
}

export function intensityLevel(value: number, max: number) {
  if (value <= 0 || max <= 0) return 0
  return Math.max(1, Math.round(clamp01(value / max) * 4))
}

export function intensityGlyph(level: number, glyphs: readonly string[] = GLYPH_SETS.shade) {
  if (glyphs.length === 0) return "·"
  const clamped = Math.min(4, Math.max(0, Math.round(level)))
  const index = Math.round((clamped / 4) * (glyphs.length - 1))
  return glyphs[index] ?? glyphs[0] ?? "·"
}

/* ---- tones: the CSS classes standing in for mdxcn's text-* utilities ---- */

export const T = {
  accent: "t-accent",
  accent2: "t-accent-2",
  accent3: "t-accent-3",
  fg: "t-fg",
  soft: "t-soft",
  muted: "t-muted",
  frame: "t-frame",
  clear: "t-clear",
  danger: "t-danger",
} as const

export function isMono(palette?: Palette) {
  return palette == null || palette === "mono"
}

export function tone(palette: Palette | undefined, role: "primary" | "secondary" | "idle" | "empty") {
  if (role === "empty") return T.frame
  if (role === "idle") return T.muted
  if (role === "primary") return T.accent
  return isMono(palette) ? T.muted : T.accent2
}

const SERIES = [T.accent, T.accent2, T.accent3] as const

export function seriesTone(palette: Palette | undefined, index: number) {
  if (isMono(palette)) return index === 0 ? T.accent : T.fg
  const count = palette === "duo" ? 2 : 3
  return SERIES[index % count] ?? T.accent
}

/** mdxcn dims the series that is not highlighted, mono palette only. */
export function seriesDim(palette: Palette | undefined, highlighted: boolean) {
  return !isMono(palette) || highlighted ? "" : DIM
}

export function intensityTone(level: number, palette: Palette = "mono") {
  const index = Math.min(4, Math.max(0, Math.round(level)))
  if (index <= 0) return T.frame
  if (palette === "mono") {
    if (index <= 2) return T.muted
    if (index === 3) return T.fg
    return T.accent
  }
  if (palette === "multi") {
    if (index === 1) return T.accent2
    if (index <= 3) return T.accent3
    return T.accent
  }
  return index <= 2 ? T.accent2 : T.accent
}
