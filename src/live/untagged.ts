/*
 * Live Preview for plain ``` fences that hold an mdxcn frame. Obsidian only
 * hands code-block processors fences with a language, so untagged frames
 * (pasted straight from a README) get a widget here. Moving the cursor into
 * the fence shows the source again.
 */

import { EditorState, RangeSetBuilder, StateField, type Extension, type Text } from "@codemirror/state"
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view"
import { Component, editorInfoField, editorLivePreviewField } from "obsidian"
import { looksLikeFrame } from "../ascii"
import { renderSource, type Host } from "../render"

export interface LiveHost {
  host(component: Component, sourcePath: string): Host
  enabled(): boolean
}

const FENCE_OPEN = /^(\s{0,3})(`{3,}|~{3,})(.*)$/

interface Fence {
  from: number
  to: number
  inner: string
  innerFrom: number
}

/** Untagged fences in the document. */
function untaggedFences(doc: Text): Fence[] {
  const fences: Fence[] = []
  let line = 1
  while (line <= doc.lines) {
    const open = doc.line(line).text.match(FENCE_OPEN)
    if (!open) {
      line += 1
      continue
    }
    const mark = open[2] ?? "```"
    const info = (open[3] ?? "").trim()
    let end = line + 1
    while (end <= doc.lines) {
      const text = doc.line(end).text.trim()
      if (text.startsWith(mark[0]!.repeat(mark.length)) && /^(`+|~+)$/.test(text)) break
      end += 1
    }
    if (end > doc.lines) break
    if (!info && end > line + 1) {
      const innerFrom = doc.line(line + 1).from
      const innerTo = doc.line(end - 1).to
      fences.push({ from: doc.line(line).from, to: doc.line(end).to, inner: doc.sliceString(innerFrom, innerTo), innerFrom })
    }
    line = end + 1
  }
  return fences
}

class FrameWidget extends WidgetType {
  private component: Component | null = null

  constructor(
    private readonly source: string,
    private readonly editAt: number,
    private readonly sourcePath: string,
    private readonly live: LiveHost
  ) {
    super()
  }

  eq(other: FrameWidget) {
    return other.source === this.source && other.sourcePath === this.sourcePath
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = createDiv({ cls: "mdxcn-live cm-embed-block" })
    this.component = new Component()
    this.component.load()
    renderSource(wrap, this.source, this.live.host(this.component, this.sourcePath))
    const edit = wrap.createDiv({ cls: "mdxcn-live-edit edit-block-button", attr: { "aria-label": "Edit this block" } })
    edit.setText("</>")
    edit.addEventListener("mousedown", (event) => {
      event.preventDefault()
      view.dispatch({ selection: { anchor: this.editAt }, scrollIntoView: true })
      view.focus()
    })
    return wrap
  }

  destroy() {
    this.component?.unload()
    this.component = null
  }

  ignoreEvent(event: Event) {
    return event.type !== "mousedown"
  }

  get estimatedHeight() {
    return this.source.split("\n").length * 22
  }
}

function build(state: EditorState, live: LiveHost): DecorationSet {
  if (!live.enabled() || !state.field(editorLivePreviewField, false)) return Decoration.none
  const sourcePath = state.field(editorInfoField, false)?.file?.path ?? ""
  const builder = new RangeSetBuilder<Decoration>()
  const selection = state.selection.ranges
  for (const fence of untaggedFences(state.doc)) {
    if (!looksLikeFrame(fence.inner)) continue
    const touched = selection.some((range) => range.to >= fence.from && range.from <= fence.to)
    if (touched) continue
    builder.add(fence.from, fence.to, Decoration.replace({ widget: new FrameWidget(fence.inner, fence.innerFrom, sourcePath, live), block: true }))
  }
  return builder.finish()
}

export function untaggedFrames(live: LiveHost): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => build(state, live),
    update(value, transaction) {
      const modeChanged = transaction.startState.field(editorLivePreviewField, false) !== transaction.state.field(editorLivePreviewField, false)
      // `reconfigured`: Obsidian's updateOptions() after a settings change.
      if (transaction.docChanged || transaction.selection || modeChanged || transaction.reconfigured) return build(transaction.state, live)
      return value
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}
