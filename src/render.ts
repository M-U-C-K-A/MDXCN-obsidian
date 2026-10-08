/*
 * Turn parsed nodes into figures inside Obsidian.
 */

import { App, Component, Keymap, MarkdownRenderer, Menu, Notice, setIcon } from "obsidian"
import { cx, div, el, span } from "./dom"
import { tokenize, type InlineToken } from "./parse/inline"
import { parseBlocks } from "./parse/md"
import { parseDocument, type DocNode } from "./parse/document"
import { fenceFor, toAscii, toComark, toMdx } from "./serialize"
import type { MdxcnSettings } from "./settings"
import type { AnySpec, RenderContext } from "./types"

export interface Host {
  app: App
  /** Owns timers and Markdown children; unloaded with the block. */
  component: Component
  sourcePath: string
  settings: MdxcnSettings
  /** Replace the whole block's source (convert in place). */
  replaceSource?: (next: string) => void | Promise<void>
  /** Override the clock (previews). */
  now?: () => number
  /** Previews hide the copy / convert buttons. */
  noToolbar?: boolean
}

/** Render a block's source. Returns the nodes for callers that convert. */
export function renderSource(container: HTMLElement, source: string, host: Host, hint?: string): DocNode[] {
  container.addClass("mdxcn-root")
  let nodes: DocNode[]
  try {
    nodes = parseDocument(source, { hint })
  } catch (error) {
    renderError(container, `Could not read this block: ${(error as Error).message}`, source)
    return []
  }
  if (nodes.length === 0) {
    renderError(container, "Empty mdxcn block. Run “MDXCN: Insert component” to start from a template.", "")
    return nodes
  }
  // Convert-in-place rewrites the whole fence, so only offer it when the
  // fence holds a single figure.
  const nodeHost = nodes.length === 1 ? host : { ...host, replaceSource: undefined }
  for (const node of nodes) renderNode(container, node, nodeHost)
  return nodes
}

function renderNode(parent: HTMLElement, node: DocNode, host: Host) {
  switch (node.kind) {
    case "markdown": {
      const box = div(parent, "mdxcn-loose markdown-rendered")
      void MarkdownRenderer.render(host.app, node.text, box, host.sourcePath, host.component)
      return
    }
    case "error":
      renderError(parent, node.message, node.source)
      return
    case "row": {
      const row = div(parent, "mdxcn-row")
      row.setCssProps({ "--cols": String(Math.max(1, Math.min(4, node.cols))) })
      for (const child of node.children) renderNode(row, child, host)
      return
    }
    case "graph":
      try {
        renderGraph(parent, node.spec, node.props, node.body, host)
      } catch (error) {
        console.error("[mdxcn]", error)
        renderError(parent, `${node.spec.name}: ${(error as Error).message}`, node.body)
      }
  }
}

export function renderGraph(parent: HTMLElement, spec: AnySpec, props: Record<string, unknown>, body: string, host: Host): HTMLElement {
  const data = spec.read({ props, blocks: parseBlocks(body), body })
  const title = spec.title ? spec.title(data) : data.title
  const settings = host.settings

  const figure = el(parent, "figure", "mdxcn-graph")
  figure.setAttr("data-graph", spec.slug)
  if (title) {
    const caption = el(figure, "figcaption", "mdxcn-title")
    span(caption, "mdxcn-title-ink", `[ ${title} ]`)
    figure.setAttr("aria-label", title)
  }
  // The corner glyph comes from CSS (`--mdxcn-corner`), so the setting
  // applies live; a block's own `corner` prop overrides it here.
  if (data.corner != null) figure.setCssProps({ "--mdxcn-corner": JSON.stringify(data.corner) })
  for (const at of ["tl", "tr", "bl", "br"]) span(figure, `mdxcn-corner is-${at}`).setAttr("aria-hidden", "true")

  const bodyEl = div(figure, "mdxcn-body")
  const ctx: RenderContext = {
    body: bodyEl,
    figure,
    palette: data.palette ?? settings.palette,
    prose: (target, markdown, cls) => {
      const box = div(target, cx("mdxcn-prose", cls))
      void MarkdownRenderer.render(host.app, markdown, box, host.sourcePath, host.component)
      return box
    },
    inline: (target, markdown) => renderInline(target, markdown, host),
    every: (ms, tick) => {
      tick()
      host.component.registerInterval(window.setInterval(tick, ms))
    },
    now: host.now ?? (() => Date.now()),
  }
  spec.render(data, ctx)

  if (!host.noToolbar) toolbar(figure, spec, props, body, host)
  reveal(figure, host.component)
  return figure
}

/* ---- inline Markdown ------------------------------------------------- */

export function renderInline(target: HTMLElement, markdown: string, host: Host) {
  const walk = (parent: HTMLElement, tokens: InlineToken[]) => {
    for (const token of tokens) {
      switch (token.kind) {
        case "text":
          parent.appendText(token.text)
          break
        case "code":
          el(parent, "code", undefined, token.text)
          break
        case "strong":
          walk(el(parent, "strong"), token.children)
          break
        case "em":
          walk(el(parent, "em"), token.children)
          break
        case "del":
          walk(el(parent, "del"), token.children)
          break
        case "link": {
          const link = el(parent, "a", "external-link")
          link.href = token.href
          link.setAttr("target", "_blank")
          link.setAttr("rel", "noopener")
          walk(link, token.children)
          break
        }
        case "wikilink": {
          const link = el(parent, "a", "internal-link", token.alias ?? token.target)
          link.setAttr("data-href", token.target)
          link.setAttr("href", token.target)
          link.addEventListener("click", (event) => {
            event.preventDefault()
            void host.app.workspace.openLinkText(token.target, host.sourcePath, Keymap.isModEvent(event))
          })
          break
        }
      }
    }
  }
  walk(target, tokenize(markdown))
}

/* ---- motion ---------------------------------------------------------- */

/** mdxcn animates once, when the figure scrolls into view. */
function reveal(figure: HTMLElement, component: Component) {
  figure.addClass("is-pending")
  const show = () => {
    figure.removeClass("is-pending")
    figure.addClass("is-visible")
  }
  if (typeof IntersectionObserver === "undefined") {
    show()
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        show()
        observer.disconnect()
      }
    },
    { threshold: 0.15 }
  )
  observer.observe(figure)
  // Never leave a figure hidden (exports, background panes).
  const fallback = window.setTimeout(show, 1500)
  component.register(() => {
    observer.disconnect()
    window.clearTimeout(fallback)
  })
}

/* ---- toolbar --------------------------------------------------------- */

async function copy(text: string, label: string) {
  await navigator.clipboard.writeText(text)
  new Notice(`Copied ${label}`)
}

function toolbar(figure: HTMLElement, spec: AnySpec, props: Record<string, unknown>, body: string, host: Host) {
  const bar = div(figure, "mdxcn-toolbar")
  const ascii = () => {
    const text = toAscii(spec, props, body)
    const mark = fenceFor(text)
    return `${mark}\n${text}\n${mark}`
  }

  const copyButton = el(bar, "button", "mdxcn-tool clickable-icon")
  copyButton.setAttr("aria-label", "Copy as ASCII (GitHub, Notion, Linear…)")
  setIcon(copyButton, "copy")
  copyButton.addEventListener("click", (event) => {
    event.stopPropagation()
    void copy(ascii(), "ASCII")
  })

  const more = el(bar, "button", "mdxcn-tool clickable-icon")
  more.setAttr("aria-label", "More")
  setIcon(more, "more-horizontal")
  more.addEventListener("click", (event) => {
    event.stopPropagation()
    const menu = new Menu()
    menu.addItem((item) => item.setTitle("Copy as ASCII fence").setIcon("copy").onClick(() => void copy(ascii(), "ASCII")))
    menu.addItem((item) => item.setTitle("Copy as MDX").setIcon("code").onClick(() => void copy(toMdx(spec, props, body), "MDX")))
    menu.addItem((item) => item.setTitle("Copy as Comark").setIcon("file-code").onClick(() => void copy(toComark(spec, props, body), "Comark")))
    if (host.replaceSource) {
      menu.addSeparator()
      const replace = host.replaceSource
      menu.addItem((item) => item.setTitle("Convert block to ASCII").setIcon("type").onClick(() => void replace(toAscii(spec, props, body))))
      menu.addItem((item) => item.setTitle("Convert block to MDX").setIcon("code").onClick(() => void replace(toMdx(spec, props, body))))
      menu.addItem((item) => item.setTitle("Convert block to Comark").setIcon("file-code").onClick(() => void replace(toComark(spec, props, body))))
    }
    menu.showAtMouseEvent(event)
  })
}

/* ---- errors ---------------------------------------------------------- */

function renderError(parent: HTMLElement, message: string, source: string) {
  const figure = el(parent, "figure", "mdxcn-graph mdxcn-error")
  span(el(figure, "figcaption", "mdxcn-title"), "mdxcn-title-ink", "[ MDXCN ]")
  const body = div(figure, "mdxcn-body mdxcn-stack-3")
  el(body, "p", "t-danger", message)
  if (source.trim()) el(el(body, "pre", "mdxcn-pre t-muted"), "code", undefined, source)
}
