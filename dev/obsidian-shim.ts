/*
 * Just enough of Obsidian's API to render figures in a plain browser page
 * (dev/preview.html). Not shipped.
 */

import { tokenize, type InlineToken } from "../src/parse/inline"
import { parseBlocks, type Block } from "../src/parse/md"

type Info = { cls?: string | string[]; text?: string; attr?: Record<string, string> }

function apply(el: HTMLElement, info?: Info | string) {
  if (typeof info === "string") {
    el.className = info
    return el
  }
  if (!info) return el
  if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls
  if (info.text != null) el.textContent = info.text
  if (info.attr) for (const [key, value] of Object.entries(info.attr)) el.setAttribute(key, value)
  return el
}

const proto = HTMLElement.prototype as unknown as Record<string, unknown>
proto.createEl = function (this: HTMLElement, tag: string, info?: Info) {
  return this.appendChild(apply(document.createElement(tag), info))
}
proto.createDiv = function (this: HTMLElement, info?: Info) {
  return this.appendChild(apply(document.createElement("div"), info))
}
proto.createSpan = function (this: HTMLElement, info?: Info) {
  return this.appendChild(apply(document.createElement("span"), info))
}
proto.setText = function (this: HTMLElement, text: string) {
  this.textContent = text
}
proto.appendText = function (this: HTMLElement, text: string) {
  this.appendChild(document.createTextNode(text))
}
// Like Obsidian: a class name with a space throws.
proto.addClass = function (this: HTMLElement, ...names: string[]) {
  this.classList.add(...names)
}
proto.addClasses = function (this: HTMLElement, names: string[]) {
  this.classList.add(...names)
}
proto.removeClass = function (this: HTMLElement, ...names: string[]) {
  this.classList.remove(...names)
}
proto.removeClasses = function (this: HTMLElement, names: string[]) {
  this.classList.remove(...names)
}
proto.toggleClass = function (this: HTMLElement, name: string, on: boolean) {
  this.classList.toggle(name, on)
}
proto.setAttr = function (this: HTMLElement, key: string, value: string) {
  this.setAttribute(key, value)
}
proto.empty = function (this: HTMLElement) {
  this.replaceChildren()
}
proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
  for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value)
}
;(window as unknown as Record<string, unknown>).createDiv = (info?: Info) => apply(document.createElement("div"), info)

export class Component {
  private cleanups: (() => void)[] = []
  load() {}
  unload() {
    for (const cleanup of this.cleanups.splice(0)) cleanup()
  }
  register(fn: () => void) {
    this.cleanups.push(fn)
  }
  registerInterval(id: number) {
    this.cleanups.push(() => window.clearInterval(id))
    return id
  }
  addChild<T>(child: T) {
    return child
  }
}

export class MarkdownRenderChild extends Component {
  constructor(public containerEl: HTMLElement) {
    super()
  }
}

export class App {
  workspace = { openLinkText: async () => {} }
}

export const Keymap = { isModEvent: () => false }

export class Notice {
  constructor(message: string) {
    console.log("[notice]", message)
  }
}

export class Menu {
  addItem() {
    return this
  }
  addSeparator() {
    return this
  }
  showAtMouseEvent() {}
}

export function setIcon(el: HTMLElement, name: string) {
  if (!["copy", "more-horizontal"].includes(name)) { el.textContent = "◇"; return }
  el.textContent = name === "copy" ? "⧉" : "⋯"
}

function inline(parent: HTMLElement, tokens: InlineToken[]) {
  for (const token of tokens) {
    if (token.kind === "text") parent.append(token.text)
    else if (token.kind === "code") parent.createEl("code", { text: token.text })
    else if (token.kind === "wikilink") parent.createEl("a", { cls: "internal-link", text: token.alias ?? token.target })
    else if (token.kind === "link") inline(parent.createEl("a"), token.children)
    else inline(parent.createEl(token.kind === "strong" ? "strong" : token.kind === "em" ? "em" : "del"), token.children)
  }
}

function blocks(parent: HTMLElement, list: Block[]) {
  for (const block of list) {
    if (block.type === "p") inline(parent.createEl("p"), tokenize(block.text))
    else if (block.type === "heading") inline(parent.createEl(`h${block.level}` as "h3"), tokenize(block.text))
    else if (block.type === "code") parent.createEl("pre").createEl("code", { text: block.text })
    else if (block.type === "list") {
      const listEl = parent.createEl(block.ordered ? "ol" : "ul")
      for (const item of block.items) blocks(listEl.createEl("li"), item.blocks)
    } else if (block.type === "quote") blocks(parent.createEl("blockquote"), block.blocks)
  }
}

export const MarkdownRenderer = {
  async render(_app: App, markdown: string, el: HTMLElement) {
    blocks(el, parseBlocks(markdown))
  },
}

export function prepareFuzzySearch(query: string) {
  const needle = query.toLowerCase()
  return (text: string) => (text.toLowerCase().includes(needle) ? { score: -text.length } : null)
}

export function parseYaml() {
  return {}
}

export class Modal {
  modalEl: HTMLElement
  titleEl: HTMLElement
  contentEl: HTMLElement
  private containerEl: HTMLElement
  constructor(public app: App) {
    this.containerEl = document.createElement("div")
    this.containerEl.className = "modal-container"
    this.modalEl = this.containerEl.createDiv({ cls: "modal" })
    this.titleEl = this.modalEl.createDiv({ cls: "modal-title" })
    this.contentEl = this.modalEl.createDiv({ cls: "modal-content" })
  }
  open() {
    document.body.appendChild(this.containerEl)
    ;(this as unknown as { onOpen(): void }).onOpen()
  }
  close() {
    this.containerEl.remove()
    ;(this as unknown as { onClose(): void }).onClose()
  }
}
