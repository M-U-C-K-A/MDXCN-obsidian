/*
 * The component picker: search on the left, a live preview and the exact
 * block that will be inserted on the right. Enter inserts.
 */

import { App, Component, Modal, prepareFuzzySearch, setIcon } from "obsidian"
import { cx, div, el, span } from "../dom"
import { GROUPS, SPECS } from "../registry"
import { renderGraph } from "../render"
import { templateBlock, type TemplateSyntax } from "../serialize"
import type { MdxcnSettings } from "../settings"
import type { AnySpec } from "../types"

const SYNTAXES: { id: TemplateSyntax; label: string; hint: string }[] = [
  { id: "comark", label: "Comark", hint: "::graph-* block, YAML props + Markdown children" },
  { id: "mdx", label: "MDX", hint: "<GraphX> tag with Markdown children" },
  { id: "short", label: "Short", hint: "```mdx gantt — the info string names the graph" },
  { id: "ascii", label: "ASCII", hint: "The official fenced drawing, ready for GitHub" },
]

export interface PickerOptions {
  settings: MdxcnSettings
  sourcePath: string
  initial?: string
  onChoose: (spec: AnySpec, syntax: TemplateSyntax) => void
  onSyntax?: (syntax: TemplateSyntax) => void
}

export class ComponentPicker extends Modal {
  private query = ""
  private syntax: TemplateSyntax
  private results: AnySpec[] = SPECS
  private selected = 0
  private listEl!: HTMLElement
  private previewEl!: HTMLElement
  private sourceEl!: HTMLElement
  private preview: Component | null = null

  constructor(
    app: App,
    private options: PickerOptions
  ) {
    super(app)
    this.syntax = options.settings.templateSyntax
    this.query = options.initial ?? ""
  }

  onOpen() {
    this.modalEl.addClass("mdxcn-picker-modal")
    this.titleEl.setText("Insert an mdxcn component")
    const root = div(this.contentEl, "mdxcn-picker")

    const head = div(root, "mdxcn-picker-head")
    const search = el(head, "input", "mdxcn-picker-search")
    search.type = "search"
    search.placeholder = "Gantt, timeline, countdown, table…"
    search.value = this.query
    search.addEventListener("input", () => {
      this.query = search.value
      this.filter()
    })
    search.addEventListener("keydown", (event) => this.onKey(event))

    const tabs = div(head, "mdxcn-picker-syntax")
    for (const option of SYNTAXES) {
      const button = el(tabs, "button", cx("mdxcn-picker-tab", option.id === this.syntax && "is-active"), option.label)
      button.setAttr("aria-label", option.hint)
      button.addEventListener("click", () => {
        this.syntax = option.id
        tabs.querySelectorAll(".mdxcn-picker-tab").forEach((tab) => tab.removeClass("is-active"))
        button.addClass("is-active")
        this.options.onSyntax?.(option.id)
        this.showPreview()
        search.focus()
      })
    }

    const main = div(root, "mdxcn-picker-main")
    this.listEl = div(main, "mdxcn-picker-list")
    const side = div(main, "mdxcn-picker-side")
    this.previewEl = div(side, "mdxcn-picker-preview")
    const foot = div(side, "mdxcn-picker-foot")
    this.sourceEl = el(foot, "pre", "mdxcn-picker-source")
    const actions = div(foot, "mdxcn-picker-actions")
    span(actions, "mdxcn-picker-keys", "↑↓ choose · ⏎ insert · esc close")
    const insert = el(actions, "button", "mod-cta", "Insert")
    insert.addEventListener("click", () => this.choose())

    this.filter()
    window.setTimeout(() => search.focus(), 0)
  }

  onClose() {
    this.preview?.unload()
    this.contentEl.empty()
  }

  private onKey(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      this.selected = (this.selected + step + this.results.length) % Math.max(1, this.results.length)
      this.highlight()
    } else if (event.key === "Enter") {
      event.preventDefault()
      this.choose()
    } else if (event.key === "Tab") {
      event.preventDefault()
      const at = SYNTAXES.findIndex((option) => option.id === this.syntax)
      const next = SYNTAXES[(at + (event.shiftKey ? -1 : 1) + SYNTAXES.length) % SYNTAXES.length]!
      ;(this.contentEl.querySelectorAll(".mdxcn-picker-tab")[SYNTAXES.indexOf(next)] as HTMLElement | undefined)?.click()
    }
  }

  private filter() {
    const query = this.query.trim()
    if (!query) {
      this.results = SPECS
    } else {
      const fuzzy = prepareFuzzySearch(query)
      this.results = SPECS.map((spec) => {
        const name = fuzzy(spec.name)?.score
        const alias = Math.max(...spec.aliases.map((alias) => fuzzy(alias)?.score ?? -Infinity))
        const extra = fuzzy([...(spec.keywords ?? []), spec.summary].join(" "))?.score
        const score = Math.max(name != null ? name + 2 : -Infinity, Number.isFinite(alias) ? alias + 1 : -Infinity, extra ?? -Infinity)
        return { spec, score }
      })
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.spec)
    }
    this.selected = 0
    this.renderList()
  }

  private renderList() {
    this.listEl.empty()
    if (this.results.length === 0) {
      div(this.listEl, "mdxcn-picker-empty", "No component matches.")
      this.showPreview()
      return
    }
    let group = ""
    this.results.forEach((spec, index) => {
      if (!this.query.trim() && spec.group !== group) {
        group = spec.group
        div(this.listEl, "mdxcn-picker-group", GROUPS[spec.group])
      }
      const row = div(this.listEl, "mdxcn-picker-item")
      row.dataset.index = String(index)
      const icon = span(row, "mdxcn-picker-icon")
      setIcon(icon, ICONS[spec.group] ?? "square")
      const text = div(row, "mdxcn-picker-text")
      span(text, "mdxcn-picker-name", spec.name)
      span(text, "mdxcn-picker-summary", spec.summary)
      row.addEventListener("mouseenter", () => {
        this.selected = index
        this.highlight(false)
      })
      row.addEventListener("click", () => {
        this.selected = index
        this.choose()
      })
    })
    this.highlight()
  }

  private highlight(scroll = true) {
    this.listEl.querySelectorAll(".mdxcn-picker-item").forEach((row) => {
      const active = Number((row as HTMLElement).dataset.index) === this.selected
      row.toggleClass("is-selected", active)
      if (active && scroll) row.scrollIntoView({ block: "nearest" })
    })
    this.showPreview()
  }

  private showPreview() {
    this.preview?.unload()
    this.preview = new Component()
    this.preview.load()
    this.previewEl.empty()
    this.sourceEl.empty()
    const spec = this.results[this.selected]
    if (!spec) return
    const { title, props = {}, body } = spec.template
    renderGraph(this.previewEl, spec, { ...(title ? { title } : {}), ...props }, body, {
      app: this.app,
      component: this.preview,
      sourcePath: this.options.sourcePath,
      settings: this.options.settings,
      noToolbar: true,
    })
    this.sourceEl.setText(templateBlock(spec, this.syntax))
  }

  private choose() {
    const spec = this.results[this.selected]
    if (!spec) return
    this.close()
    this.options.onChoose(spec, this.syntax)
  }
}

const ICONS: Record<string, string> = {
  content: "align-left",
  data: "table",
  chart: "bar-chart-2",
  diagram: "git-fork",
  time: "timer",
  layout: "square",
}
