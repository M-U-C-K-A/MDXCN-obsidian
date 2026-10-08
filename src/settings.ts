import type { Palette } from "./types"
import type { TemplateSyntax } from "./serialize"

export interface AccentPreset {
  name: string
  light: string
  dark: string
}

/** mdxcn's own accents (oklch in the registry), as hex. */
export const PRESETS: Record<string, AccentPreset> = {
  blue: { name: "mdxcn blue", light: "#005fc6", dark: "#69a1e8" },
  amber: { name: "Amber", light: "#ae6800", dark: "#e8a95c" },
  green: { name: "Green", light: "#007852", dark: "#75cca7" },
  teal: { name: "Teal", light: "#007980", dark: "#6ac9ce" },
  red: { name: "Red", light: "#c92f33", dark: "#f07f77" },
  orange: { name: "Orange", light: "#d95800", dark: "#f7945a" },
  purple: { name: "Purple", light: "#773ac1", dark: "#b28fef" },
  pink: { name: "Pink", light: "#ca358b", dark: "#ee8dbd" },
}

export type AccentMode = keyof typeof PRESETS | "obsidian" | "custom"

export interface MdxcnSettings {
  /** Preset, the theme's accent, or custom colors. */
  accent: AccentMode
  accentLight: string
  accentDark: string
  accent2Light: string
  accent2Dark: string
  accent3Light: string
  accent3Dark: string
  /** Default palette when a block does not set one. */
  palette: Palette
  animations: boolean
  /** Corner mark. mdxcn uses `+`. */
  corner: string
  frameStyle: "dotted" | "dashed" | "solid" | "none"
  /** CSS font-family; empty uses Obsidian's monospace font. */
  font: string
  /** Text size in the frame, in percent of the note's text. */
  fontSize: number
  /** Render ``` blocks with no language when they hold an mdxcn frame. */
  renderUntagged: boolean
  /** Copy / convert buttons on hover. */
  toolbar: boolean
  templateSyntax: TemplateSyntax
  /** One "Insert X" command per component (also in slash commands). */
  componentCommands: boolean
  /** Typed at the start of a line to open the component suggester. */
  suggestTrigger: string
  /** Seen the welcome notice. */
  welcomed: boolean
}

export const DEFAULT_SETTINGS: MdxcnSettings = {
  accent: "blue",
  accentLight: PRESETS.blue!.light,
  accentDark: PRESETS.blue!.dark,
  accent2Light: PRESETS.amber!.light,
  accent2Dark: PRESETS.amber!.dark,
  accent3Light: PRESETS.green!.light,
  accent3Dark: PRESETS.green!.dark,
  palette: "mono",
  animations: true,
  corner: "+",
  frameStyle: "dotted",
  font: "",
  fontSize: 87.5,
  renderUntagged: true,
  toolbar: true,
  templateSyntax: "comark",
  componentCommands: true,
  suggestTrigger: "::",
  welcomed: false,
}

/** The CSS variables a setting set maps to. */
export function cssVariables(settings: MdxcnSettings): Record<string, string> {
  const preset = PRESETS[settings.accent]
  const light = settings.accent === "obsidian" ? "var(--text-accent)" : (preset?.light ?? settings.accentLight)
  const dark = settings.accent === "obsidian" ? "var(--text-accent)" : (preset?.dark ?? settings.accentDark)
  return {
    "--mdxcn-accent-light": light,
    "--mdxcn-accent-dark": dark,
    "--mdxcn-accent-2-light": settings.accent2Light,
    "--mdxcn-accent-2-dark": settings.accent2Dark,
    "--mdxcn-accent-3-light": settings.accent3Light,
    "--mdxcn-accent-3-dark": settings.accent3Dark,
    "--mdxcn-font": settings.font.trim() || "var(--font-monospace)",
    "--mdxcn-size": `${Math.max(60, Math.min(140, settings.fontSize))}%`,
    "--mdxcn-corner": JSON.stringify(settings.corner),
  }
}

/** Body classes for the settings that only change CSS. */
export function bodyClasses(settings: MdxcnSettings): string[] {
  return [
    `mdxcn-frame-${settings.frameStyle}`,
    ...(settings.animations ? [] : ["mdxcn-static"]),
    ...(settings.toolbar ? [] : ["mdxcn-no-toolbar"]),
  ]
}
