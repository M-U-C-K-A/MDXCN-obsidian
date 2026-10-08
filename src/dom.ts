/*
 * DOM helpers for the renderers. Plain elements and CSS classes, no inline
 * styles: dynamic values travel as CSS variables (`--i`, `--cols`) so themes
 * and snippets can override everything.
 */

export function div(parent: HTMLElement, cls?: string, text?: string): HTMLDivElement {
  return parent.createDiv({ cls: cls || undefined, text })
}

export function span(parent: HTMLElement, cls?: string, text?: string): HTMLSpanElement {
  return parent.createSpan({ cls: cls || undefined, text })
}

export function el<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  cls?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  return parent.createEl(tag, { cls: cls || undefined, text })
}

/** Join class names, skipping empties. */
export function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(" ")
}

export function vars(target: HTMLElement, props: Record<string, string | number>) {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(props)) out[key] = String(value)
  target.setCssProps(out)
}

/** Enter with mdxcn's fade-up, staggered by `index`. */
export function rise<T extends HTMLElement>(target: T, index = 0, step?: number): T {
  target.addClass("mdxcn-rise")
  vars(target, { "--i": index })
  if (step != null) vars(target, { "--step": `${step}ms` })
  return target
}

/** Fill-in for a single glyph, delayed per index (capped like mdxcn). */
export function fill<T extends HTMLElement>(target: T, index = 0, step = 30): T {
  target.addClass("mdxcn-fill")
  vars(target, { "--d": `${Math.min(index * step, 280)}ms` })
  return target
}

export function rule(parent: HTMLElement, cls?: string) {
  return div(parent, cx("mdxcn-rule", cls))
}

export function ruleY(parent: HTMLElement, cls?: string) {
  return div(parent, cx("mdxcn-rule-y", cls))
}

export type Tick = { glyph: string; cls?: string; fill?: boolean }

/** A row of equal-width glyph cells (mdxcn's GraphTrack / GraphTick). */
export function track(parent: HTMLElement, ticks: Tick[], cls?: string, animate = true) {
  const row = span(parent, cx("mdxcn-track", cls))
  row.setAttr("aria-hidden", "true")
  ticks.forEach((tick, index) => {
    const cell = span(row, cx("mdxcn-tick", tick.cls), tick.glyph)
    if (animate && tick.fill !== false) fill(cell, index)
  })
  return row
}

/** A screen-reader only label. */
export function sr(parent: HTMLElement, text: string) {
  return span(parent, "mdxcn-sr", text)
}

export function hidden<T extends HTMLElement>(target: T): T {
  target.setAttr("aria-hidden", "true")
  return target
}
