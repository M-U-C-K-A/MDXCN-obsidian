/*
 * Visual check page: every component, from its template, light and dark.
 *   npm run preview  →  http://localhost:4317
 */

import { parse as parseYaml } from "yaml"
import { App, Component } from "./obsidian-shim"
import { setYamlParser } from "../src/parse/document"
import { GROUPS, SPECS, findSpec } from "../src/registry"
import { renderSource } from "../src/render"
import { templateBlock, type TemplateSyntax } from "../src/serialize"
import { DEFAULT_SETTINGS, bodyClasses, cssVariables, type MdxcnSettings } from "../src/settings"

setYamlParser((text) => parseYaml(text))

const params = new URLSearchParams(location.search)
const settings: MdxcnSettings = { ...DEFAULT_SETTINGS }
if (params.get("accent")) settings.accent = params.get("accent") as MdxcnSettings["accent"]
if (params.get("palette")) settings.palette = params.get("palette") as MdxcnSettings["palette"]
document.body.setCssProps(cssVariables(settings))
document.body.addClasses(bodyClasses(settings))
if (params.get("theme") === "dark") document.body.classList.replace("theme-light", "theme-dark")

const syntax = (params.get("syntax") ?? "comark") as TemplateSyntax
const only = params.get("only")
const root = document.getElementById("root")!
const component = new Component()
const host = { app: new App() as never, component: component as never, sourcePath: "", settings }

const custom = params.get("src")
if (custom) {
  renderSource(root.createDiv({ cls: "block-language-mdx" }), custom, host, params.get("hint") ?? undefined)
} else {
  let group = ""
  for (const spec of SPECS) {
    if (only && !only.split(",").some((name) => findSpec(name)?.slug === spec.slug)) continue
    if (spec.group !== group) {
      group = spec.group
      root.createEl("h2", { text: GROUPS[spec.group] })
    }
    const section = root.createDiv({ cls: "case" })
    section.createEl("h3", { text: `${spec.name} · ${spec.slug}` })
    const block = templateBlock(spec, syntax)
    const lines = block.split("\n")
    const hint = lines[0]?.replace(/^`{3,}mdx\s*/, "").trim() || undefined
    renderSource(section.createDiv({ cls: "block-language-mdx" }), lines.slice(1, -1).join("\n"), host, hint)
    if (params.has("source")) section.createEl("pre", { cls: "source", text: block })
  }
}

if (params.has("picker")) {
  void import("../src/ui/picker").then(({ ComponentPicker }) => {
    new ComponentPicker(new App() as never, {
      settings,
      sourcePath: "",
      initial: params.get("picker") ?? "",
      onChoose: (spec, chosen) => console.log("chose", spec.slug, chosen),
    }).open()
  })
}
