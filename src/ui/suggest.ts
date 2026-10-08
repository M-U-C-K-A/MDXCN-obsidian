/*
 * Type `::` (configurable) at the start of a line, then a name: `::gan` →
 * Gantt. The whole block is inserted (fence included unless the cursor is
 * already inside an ```mdx block).
 */

import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile, prepareFuzzySearch } from "obsidian"
import { span } from "../dom"
import { GROUPS, SPECS } from "../registry"
import type { MdxcnSettings } from "../settings"
import type { AnySpec } from "../types"

export interface SuggestHost {
  settings: MdxcnSettings
  insert(editor: Editor, spec: AnySpec, from: EditorPosition, to: EditorPosition): void
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export class ComponentSuggest extends EditorSuggest<AnySpec> {
  constructor(
    app: import("obsidian").App,
    private host: SuggestHost
  ) {
    super(app)
    this.limit = 12
    this.setInstructions([
      { command: "↑↓", purpose: "choose" },
      { command: "↵", purpose: "insert the template" },
      { command: "esc", purpose: "dismiss" },
    ])
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    const trigger = this.host.settings.suggestTrigger
    if (!trigger) return null
    const before = editor.getLine(cursor.line).slice(0, cursor.ch)
    const match = before.match(new RegExp(`^(\\s*)${escape(trigger)}([\\w-]*)$`))
    if (!match) return null
    return {
      start: { line: cursor.line, ch: (match[1] ?? "").length },
      end: cursor,
      query: match[2] ?? "",
    }
  }

  getSuggestions(context: EditorSuggestContext): AnySpec[] {
    const query = context.query.trim()
    if (!query) return SPECS
    const fuzzy = prepareFuzzySearch(query)
    return SPECS.map((spec) => ({
      spec,
      score: Math.max(
        (fuzzy(spec.name)?.score ?? -Infinity) + 2,
        ...spec.aliases.map((alias) => (fuzzy(alias)?.score ?? -Infinity) + 1),
        fuzzy(`${(spec.keywords ?? []).join(" ")} ${spec.summary}`)?.score ?? -Infinity
      ),
    }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.spec)
  }

  renderSuggestion(spec: AnySpec, el: HTMLElement) {
    el.addClass("mdxcn-suggestion")
    const head = el.createDiv("mdxcn-suggestion-head")
    span(head, "mdxcn-suggestion-name", spec.name)
    span(head, "mdxcn-suggestion-group", GROUPS[spec.group])
    el.createDiv({ cls: "mdxcn-suggestion-summary", text: spec.summary })
  }

  selectSuggestion(spec: AnySpec) {
    const context = this.context
    if (!context) return
    this.host.insert(context.editor, spec, context.start, context.end)
    this.close()
  }
}
