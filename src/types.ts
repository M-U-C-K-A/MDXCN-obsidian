import type { Block } from "./parse/md"

export type Palette = "mono" | "duo" | "multi"
export type GlyphSetName = "shade" | "ascii" | "hash" | "bar"
export type Glyphs = GlyphSetName | readonly string[]

export type Group = "content" | "data" | "chart" | "diagram" | "time" | "layout"

/** Props every frame takes. */
export interface Common {
  title?: string
  corner?: string
  palette?: Palette
  glyphs?: Glyphs
}

/** What a component reads: explicit props plus Markdown children. */
export interface Input {
  props: Record<string, unknown>
  blocks: Block[]
  body: string
}

/** Everything a renderer may need from the host. */
export interface RenderContext {
  /** The frame body. */
  body: HTMLElement
  /** The whole figure. */
  figure: HTMLElement
  palette: Palette
  /** Render Markdown prose (Obsidian's renderer) into `parent`. */
  prose(parent: HTMLElement, markdown: string, cls?: string): HTMLElement
  /** Render one line of inline Markdown into `parent`. */
  inline(parent: HTMLElement, markdown: string): void
  /** Run `tick` now and every `ms` while the block is on screen. */
  every(ms: number, tick: () => void): void
  /** Current time (overridable in previews). */
  now(): number
}

export interface Template {
  /** Frame title for the template. */
  title?: string
  /** Extra props, written as YAML / JSX attributes. */
  props?: Record<string, unknown>
  /** Markdown children. */
  body: string
}

export interface Spec<D extends Common = Common> {
  /** Registry slug: `graph-gantt`, `callout`. */
  slug: string
  /** JSX tag: `GraphGantt`. */
  tag: string
  /** Display name: `Gantt`. */
  name: string
  /** Short names accepted anywhere a component is named. */
  aliases: string[]
  group: Group
  /** When to use it (one line, from the mdxcn chooser). */
  summary: string
  /** Not for… */
  notFor?: string
  /** Keywords for the picker search. */
  keywords?: string[]
  /** Item tags accepted as JSX children (`<Span>` …) and the prop they fill. */
  items?: Record<string, string>
  /** Read props + children into the data the renderer draws. */
  read(input: Input): D
  /** Draw `data` into `ctx.body`. */
  render(data: D, ctx: RenderContext): void
  /** The official fenced ASCII body lines (frame added by the caller). */
  ascii?(data: D): string[]
  /** Frame title for the ASCII and the figure. Defaults to `data.title`. */
  title?(data: D): string | undefined
  /** Props to write back when converting to YAML / JSX. Defaults to data. */
  toProps?(data: D): Record<string, unknown>
  template: Template
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySpec = Spec<any>
