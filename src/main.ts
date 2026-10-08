/*
 * MDXCN for Obsidian — mdxcn.dev's framed text figures, native.
 *
 *   ```mdx               paste the official ASCII, an MDX tag, or a Comark
 *   +--- [ LAUNCH ] ---+ block: it renders. Plain ``` fences holding a frame
 *   …                    render too (setting).
 *   ```
 */

import {
  Component,
  Editor,
  MarkdownRenderChild,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  normalizePath,
  parseYaml,
  type EditorPosition,
  type MarkdownPostProcessorContext,
} from "obsidian"
import type { Extension } from "@codemirror/state"
import { looksLikeFrame } from "./ascii"
import { untaggedFrames } from "./live/untagged"
import { parseDocument, setYamlParser, type DocNode } from "./parse/document"
import { GROUPS, SPECS } from "./registry"
import { renderSource, type Host } from "./render"
import { fenceFor, templateBlock, templateInner, toAscii, toComark, toMdx, type TemplateSyntax } from "./serialize"
import { DEFAULT_SETTINGS, bodyClasses, cssVariables, type MdxcnSettings } from "./settings"
import type { AnySpec } from "./types"
import { ComponentPicker } from "./ui/picker"
import { MdxcnSettingTab } from "./ui/settings-tab"
import { ComponentSuggest } from "./ui/suggest"

const LANGUAGES = ["mdx", "mdxcn", "MDX"]

type Target = "ascii" | "mdx" | "comark"

export default class MdxcnPlugin extends Plugin {
  settings: MdxcnSettings = { ...DEFAULT_SETTINGS }
  private editorExtensions: Extension[] = []
  private appliedClasses: string[] = []
  private componentCommandsAdded = false

  async onload() {
    await this.loadSettings()
    setYamlParser((text) => parseYaml(text))
    this.applyAppearance()

    for (const language of LANGUAGES) {
      this.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) => this.renderBlock(source, el, ctx))
    }
    this.registerMarkdownPostProcessor((el, ctx) => this.renderUntagged(el, ctx))

    this.editorExtensions.push(
      untaggedFrames({
        enabled: () => this.settings.renderUntagged,
        host: (component, sourcePath) => this.host(component, sourcePath),
      })
    )
    this.registerEditorExtension(this.editorExtensions)

    this.registerEditorSuggest(
      new ComponentSuggest(this.app, {
        settings: this.settings,
        insert: (editor, spec, from, to) => this.insert(editor, spec, this.settings.templateSyntax, from, to),
      })
    )

    this.addRibbonIcon("layout-template", "Insert an mdxcn component", () => this.openPicker())
    this.registerCommands()
    this.addSettingTab(new MdxcnSettingTab(this.app, this))

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        menu.addItem((item) =>
          item
            .setTitle("Insert mdxcn component…")
            .setIcon("layout-template")
            .setSection("insert")
            .onClick(() => this.openPicker(editor))
        )
        if (this.blockAt(editor)) {
          for (const target of ["ascii", "mdx", "comark"] as const) {
            menu.addItem((item) =>
              item
                .setTitle(`Convert mdxcn block to ${LABEL[target]}`)
                .setIcon("repeat")
                .setSection("mdxcn")
                .onClick(() => this.convertAtCursor(editor, target))
            )
          }
        }
      })
    )

    if (!this.settings.welcomed) {
      this.settings.welcomed = true
      await this.saveData(this.settings)
      new Notice("MDXCN is ready. Paste an mdxcn ASCII frame in a ```mdx block, or type :: at the start of a line to insert a component.", 9000)
    }
  }

  onunload() {
    document.body.removeClasses(this.appliedClasses)
    const empty: Record<string, string> = {}
    for (const key of Object.keys(cssVariables(this.settings))) empty[key] = ""
    document.body.setCssProps(empty)
  }

  /* ---- settings ------------------------------------------------------ */

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async save(options: { rerender?: boolean; commands?: boolean } = {}) {
    await this.saveData(this.settings)
    this.applyAppearance()
    if (options.commands && this.settings.componentCommands) this.registerComponentCommands()
    if (options.rerender) this.rerender()
  }

  private applyAppearance() {
    document.body.setCssProps(cssVariables(this.settings))
    document.body.removeClasses(this.appliedClasses)
    this.appliedClasses = bodyClasses(this.settings)
    document.body.addClasses(this.appliedClasses)
  }

  /** Re-render reading views and Live Preview widgets. */
  private rerender() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view
      if (view instanceof MarkdownView) view.previewMode.rerender(true)
    }
    this.app.workspace.updateOptions()
  }

  /* ---- rendering ----------------------------------------------------- */

  host(component: Component, sourcePath: string, replaceSource?: Host["replaceSource"]): Host {
    return { app: this.app, component, sourcePath, settings: this.settings, replaceSource }
  }

  private renderBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const child = new MarkdownRenderChild(el)
    ctx.addChild(child)
    const draw = (hint: string | undefined) => {
      const inner = child.addChild(new Component())
      renderSource(el, source, this.host(inner, ctx.sourcePath, (next) => this.replaceSection(el, ctx, next)), hint)
      return inner
    }
    const info = ctx.getSectionInfo(el)
    const first = draw(info ? infoHint(info.text.split("\n")[info.lineStart] ?? "") : undefined)

    // Live Preview attaches the element after this call; read the info string
    // (```mdx gantt) again once it is in the document.
    if (!info) {
      window.requestAnimationFrame(() => {
        const later = ctx.getSectionInfo(el)
        const hint = later ? infoHint(later.text.split("\n")[later.lineStart] ?? "") : undefined
        if (!hint) return
        child.removeChild(first)
        el.empty()
        draw(hint)
      })
    }
  }

  private renderUntagged(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    if (!this.settings.renderUntagged) return
    for (const code of Array.from(el.querySelectorAll("pre > code"))) {
      if (Array.from(code.classList).some((name) => name.startsWith("language-"))) continue
      const text = code.textContent ?? ""
      if (!looksLikeFrame(text)) continue
      const pre = code.parentElement
      if (!pre) continue
      const container = createDiv({ cls: "block-language-mdx" })
      pre.replaceWith(container)
      const child = new MarkdownRenderChild(container)
      ctx.addChild(child)
      renderSource(container, text, this.host(child, ctx.sourcePath, (next) => this.replaceSection(el, ctx, next)))
    }
  }

  /** Swap a fenced block's body in the file (convert in place). */
  private async replaceSection(el: HTMLElement, ctx: MarkdownPostProcessorContext, next: string) {
    const info = ctx.getSectionInfo(el)
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath)
    if (!info || !(file instanceof TFile)) {
      await navigator.clipboard.writeText(next)
      new Notice("Could not locate the block; the converted version is on the clipboard.")
      return
    }
    await this.app.vault.process(file, (data) => {
      const lines = data.split("\n")
      const fence = lines[info.lineStart] ?? "```"
      const indent = fence.match(/^\s*/)?.[0] ?? ""
      const mark = fenceFor(next)
      const replacement = [`${indent}${mark}mdx`, ...next.split("\n"), `${indent}${mark}`]
      lines.splice(info.lineStart, info.lineEnd - info.lineStart + 1, ...replacement)
      return lines.join("\n")
    })
  }

  /* ---- commands ------------------------------------------------------ */

  private registerCommands() {
    this.addCommand({
      id: "insert-component",
      name: "Insert component…",
      icon: "layout-template",
      editorCallback: (editor) => this.openPicker(editor),
    })

    for (const target of ["ascii", "mdx", "comark"] as const) {
      this.addCommand({
        id: `convert-to-${target}`,
        name: `Convert block under cursor to ${LABEL[target]}`,
        icon: "repeat",
        editorCheckCallback: (checking, editor) => {
          if (!this.blockAt(editor)) return false
          if (!checking) this.convertAtCursor(editor, target)
          return true
        },
      })
    }

    this.addCommand({
      id: "copy-as-ascii",
      name: "Copy block under cursor as ASCII (for GitHub, Notion, Linear)",
      icon: "copy",
      editorCheckCallback: (checking, editor) => {
        const block = this.blockAt(editor)
        if (!block) return false
        if (!checking) {
          const out = this.convertNodes(parseDocument(block.inner, { hint: block.hint }), "ascii")
          const mark = fenceFor(out)
          void navigator.clipboard.writeText(`${mark}\n${out}\n${mark}`).then(() => new Notice("Copied as ASCII"))
        }
        return true
      },
    })

    this.addCommand({
      id: "create-gallery",
      name: "Create a gallery note with every component",
      icon: "layout-grid",
      callback: () => void this.createGallery(),
    })

    if (this.settings.componentCommands) this.registerComponentCommands()
  }

  private registerComponentCommands() {
    if (this.componentCommandsAdded) return
    this.componentCommandsAdded = true
    for (const spec of SPECS) {
      this.addCommand({
        id: `insert-${spec.slug}`,
        name: `Insert ${spec.name}`,
        icon: ICONS[spec.group],
        editorCallback: (editor) => this.insert(editor, spec, this.settings.templateSyntax),
      })
    }
  }

  openPicker(editor?: Editor, initial?: string) {
    const target = editor ?? this.app.workspace.getActiveViewOfType(MarkdownView)?.editor
    if (!target) {
      new Notice("Open a note in editing mode to insert a component.")
      return
    }
    new ComponentPicker(this.app, {
      settings: this.settings,
      sourcePath: this.app.workspace.getActiveFile()?.path ?? "",
      initial,
      onChoose: (spec, syntax) => this.insert(target, spec, syntax),
    }).open()
  }

  /** Insert a template at the cursor (or over `from..to`, the `::name` typed). */
  insert(editor: Editor, spec: AnySpec, syntax: TemplateSyntax, from?: EditorPosition, to?: EditorPosition) {
    const start = from ?? editor.getCursor("from")
    const end = to ?? editor.getCursor("to")
    const fence = this.fenceAt(editor, start.line)
    const inside = fence?.mdx ?? false
    const text = inside ? templateInner(spec, syntax) : templateBlock(spec, syntax)
    const line = editor.getLine(start.line)
    const before = line.slice(0, start.ch).trim() !== "" ? "\n\n" : ""
    const after = line.slice(end.ch).trim() !== "" ? "\n\n" : "\n"
    const changes = [{ from: start, to: end, text: `${before}${text}${after}` }]
    // A template with its own ``` fence inside an ```mdx block: lengthen the
    // enclosing fence so the inner one cannot close it.
    if (fence && inside) {
      const open = editor.getLine(fence.start)
      const current = open.match(/^\s*(`{3,}|~{3,})/)?.[1] ?? "```"
      const needed = fenceFor(text)
      if (needed.length > current.length) {
        changes.push(
          { from: { line: fence.start, ch: 0 }, to: { line: fence.start, ch: open.length }, text: open.replace(current, needed) },
          { from: { line: fence.end, ch: 0 }, to: { line: fence.end, ch: editor.getLine(fence.end).length }, text: editor.getLine(fence.end).replace(current, needed) }
        )
      }
    }
    editor.transaction({ changes })
    const firstLine = start.line + (before ? 2 : 0) + 1
    editor.setCursor({ line: Math.min(firstLine, editor.lineCount() - 1), ch: 0 })
    editor.focus()
  }

  /* ---- blocks under the cursor --------------------------------------- */

  /** The fence enclosing `line`, if any. */
  private fenceAt(editor: Editor, line: number): { start: number; end: number; info: string; mdx: boolean } | null {
    let open: { start: number; mark: string; info: string } | null = null
    for (let index = 0; index < editor.lineCount(); index += 1) {
      const text = editor.getLine(index)
      if (!open) {
        const match = text.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/)
        if (match) open = { start: index, mark: match[1] ?? "```", info: (match[2] ?? "").trim() }
        else if (index > line) return null
        continue
      }
      const trimmed = text.trim()
      if (trimmed.startsWith(open.mark) && /^(`+|~+)$/.test(trimmed)) {
        if (line >= open.start && line <= index) {
          const lang = open.info.split(/\s+/)[0] ?? ""
          return { start: open.start, end: index, info: open.info, mdx: LANGUAGES.includes(lang) }
        }
        open = null
        if (index > line) return null
      }
    }
    return null
  }

  private blockAt(editor: Editor): { start: number; end: number; inner: string; hint?: string } | null {
    const fence = this.fenceAt(editor, editor.getCursor().line)
    if (!fence) return null
    const lines: string[] = []
    for (let index = fence.start + 1; index < fence.end; index += 1) lines.push(editor.getLine(index))
    const inner = lines.join("\n")
    if (!fence.mdx && !(fence.info === "" && looksLikeFrame(inner))) return null
    return { start: fence.start, end: fence.end, inner, hint: infoHint(`\`\`\`${fence.info}`) }
  }

  private convertNodes(nodes: DocNode[], target: Target): string {
    const parts: string[] = []
    const walk = (list: DocNode[]) => {
      for (const node of list) {
        if (node.kind === "graph") {
          parts.push(target === "ascii" ? toAscii(node.spec, node.props, node.body) : target === "mdx" ? toMdx(node.spec, node.props, node.body) : toComark(node.spec, node.props, node.body))
        } else if (node.kind === "row") {
          walk(node.children)
        } else if (node.kind === "markdown") {
          parts.push(node.text)
        }
      }
    }
    walk(nodes)
    return parts.join("\n\n")
  }

  private convertAtCursor(editor: Editor, target: Target) {
    const block = this.blockAt(editor)
    if (!block) {
      new Notice("Put the cursor inside an ```mdx block.")
      return
    }
    const out = this.convertNodes(parseDocument(block.inner, { hint: block.hint }), target)
    const mark = fenceFor(out)
    editor.replaceRange(`${mark}mdx\n${out}\n${mark}`, { line: block.start, ch: 0 }, { line: block.end, ch: editor.getLine(block.end).length })
    new Notice(`Converted to ${LABEL[target]}`)
  }

  /* ---- gallery ------------------------------------------------------- */

  private async createGallery() {
    const syntax = this.settings.templateSyntax
    const lines = [
      "# mdxcn gallery",
      "",
      `Every component, written in **${syntax}**. Edit any block: it re-renders. Hover a figure to copy it as ASCII for GitHub, Notion or Linear.`,
      "",
    ]
    let group = ""
    for (const spec of SPECS) {
      if (spec.group !== group) {
        group = spec.group
        lines.push(`## ${GROUPS[spec.group]}`, "")
      }
      lines.push(`### ${spec.name}`, "", `${spec.summary}${spec.notFor ? ` *${spec.notFor}*` : ""}`, "", templateBlock(spec, syntax), "")
    }
    let path = normalizePath("MDXCN Gallery.md")
    for (let index = 2; this.app.vault.getAbstractFileByPath(path); index += 1) path = normalizePath(`MDXCN Gallery ${index}.md`)
    const file = await this.app.vault.create(path, lines.join("\n"))
    await this.app.workspace.getLeaf(true).openFile(file)
  }
}

const LABEL: Record<Target, string> = { ascii: "ASCII", mdx: "MDX", comark: "Comark" }

const ICONS: Record<string, string> = {
  content: "align-left",
  data: "table",
  chart: "bar-chart-2",
  diagram: "git-fork",
  time: "timer",
  layout: "square",
}

/** ```mdx gantt → "gantt". */
function infoHint(fenceLine: string): string | undefined {
  const match = fenceLine.trim().match(/^(?:`{3,}|~{3,})\s*\S+\s+([\w-]+)/)
  return match?.[1]
}
