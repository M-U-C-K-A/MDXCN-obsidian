/*
 * Regenerates the component catalog in README.md (between the
 * `<!-- catalog:start -->` / `<!-- catalog:end -->` markers) from the registry.
 *   npm run docs
 */

import { readFileSync, writeFileSync } from "fs"
import { GROUPS, SPECS } from "../src/registry"
import type { Group } from "../src/types"

const README = new URL("../../README.md", import.meta.url)

function cell(text: string) {
  return text.replace(/\|/g, "\\|").replace(/\n/g, "<br>")
}

/** The first meaningful line of the template, as a code span. */
function example(body: string) {
  const line = body.split("\n").find((entry) => entry.trim() && !/^```/.test(entry.trim()) && !/^\|?\s*-{3}/.test(entry)) ?? ""
  const text = line.trim().length > 60 ? `${line.trim().slice(0, 57)}…` : line.trim()
  const ticks = text.includes("`") ? "``" : "`"
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : ""
  return `${ticks}${pad}${text.replace(/\|/g, "\\|")}${pad}${ticks}`
}

const order: Group[] = ["content", "data", "chart", "diagram", "time", "layout"]
const sections = order.map((group) => {
  const specs = SPECS.filter((spec) => spec.group === group)
  const rows = specs.map((spec) => `| **${spec.name}** | \`::${spec.slug}\` · \`${spec.tag}\` | ${cell(spec.summary)} | ${example(spec.template.body)} |`)
  return [
    `<details${group === "diagram" || group === "time" ? " open" : ""}>`,
    `<summary><b>${GROUPS[group]}</b> · ${specs.length}</summary>`,
    "",
    "| Component | Names | Use it for | Markdown children (start) |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "</details>",
  ].join("\n")
})

const block = `<!-- catalog:start -->\n${sections.join("\n\n")}\n<!-- catalog:end -->`
const readme = readFileSync(README, "utf8")
const next = readme.replace(/<!-- catalog:start -->[\s\S]*<!-- catalog:end -->/, block)
writeFileSync(README, next)
console.log(`README catalog: ${SPECS.length} components`)
