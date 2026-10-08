/*
 * Write a figure back out: the official fenced ASCII (for GitHub, Linear,
 * Notion…), an MDX tag, or a Comark block. Also builds the templates.
 */

import { frameAscii } from "./ascii"
import { isObject } from "./parse/inline"
import { parseBlocks } from "./parse/md"
import type { AnySpec } from "./types"

export type TemplateSyntax = "comark" | "mdx" | "ascii" | "short"

/* ---- YAML (port of mdxcn's knap yaml.ts) ------------------------------ */

function isScalar(value: unknown) {
  return value == null || ["string", "number", "boolean"].includes(typeof value)
}

function yamlString(value: string) {
  if (value === "") return '""'
  if (/^[A-Za-z_][A-Za-z0-9_ -]*[A-Za-z0-9_]$|^[A-Za-z_]$/.test(value) && !/^(true|false|null|yes|no|on|off)$/i.test(value) && !/\s{2}/.test(value)) return value
  return JSON.stringify(value)
}

function yamlScalar(value: unknown): string {
  if (value == null) return "null"
  if (typeof value === "boolean" || typeof value === "number") return String(value)
  if (typeof value === "string") return yamlString(value)
  return JSON.stringify(value)
}

function flowMap(value: Record<string, unknown>) {
  const parts = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => `${key}: ${yamlScalar(item)}`)
  return `{ ${parts.join(", ")} }`
}

function yamlValue(value: unknown, indent: number): string {
  const pad = " ".repeat(indent)
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    if (value.every(isScalar)) return `[${value.map(yamlScalar).join(", ")}]`
    if (value.every((item) => isObject(item) && Object.values(item).every(isScalar))) {
      return value.map((item) => `\n${pad}- ${flowMap(item as Record<string, unknown>)}`).join("")
    }
    return value
      .map((item) => {
        if (isObject(item)) {
          const lines = yamlObject(item, indent + 2).split("\n")
          const rest = lines.slice(1).join("\n")
          return `\n${pad}- ${lines[0]?.trimStart() ?? ""}${rest ? `\n${rest}` : ""}`
        }
        if (Array.isArray(item)) return `\n${pad}- ${yamlValue(item, indent + 2)}`
        return `\n${pad}- ${yamlScalar(item)}`
      })
      .join("")
  }
  if (isObject(value)) return `\n${yamlObject(value, indent)}`
  return yamlScalar(value)
}

function yamlObject(value: Record<string, unknown>, indent: number) {
  const pad = " ".repeat(indent)
  const lines: string[] = []
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    const rendered = yamlValue(item, indent + 2)
    lines.push(rendered.startsWith("\n") ? `${pad}${key}:${rendered}` : `${pad}${key}: ${rendered}`)
  }
  return lines.join("\n")
}

export function toYaml(value: Record<string, unknown>) {
  return yamlObject(value, 0)
}

/* ---- props hygiene --------------------------------------------------- */

/** Internal keys (`__rows`, `__body`) never leave the plugin. */
function publicProps(props: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("__") || value === undefined) continue
    out[key] = value
  }
  return out
}

/* ---- outputs --------------------------------------------------------- */

export function toAscii(spec: AnySpec, props: Record<string, unknown>, body: string): string {
  const data = spec.read({ props, blocks: parseBlocks(body), body })
  const title = spec.title ? spec.title(data) : data.title
  if (!spec.ascii) return frameAscii(title, body.split("\n"))
  return frameAscii(title ?? (spec.slug === "steps" ? "steps" : undefined), spec.ascii(data))
}

export function toComark(spec: AnySpec, props: Record<string, unknown>, body: string): string {
  const clean = publicProps(props)
  const { body: dataBody, ...rest } = clean
  const text = (body || (typeof dataBody === "string" ? dataBody : "")).trim()
  const yaml = toYaml(rest).trimEnd()
  const head = yaml ? `::${spec.slug}\n---\n${yaml}\n---` : `::${spec.slug}`
  return text ? `${head}\n${text}\n::` : `${head}\n::`
}

function jsxValue(value: unknown) {
  if (typeof value === "string" && !value.includes('"') && !value.includes("\n")) return `"${value}"`
  return `{${JSON.stringify(value)}}`
}

export function toMdx(spec: AnySpec, props: Record<string, unknown>, body: string): string {
  const clean = publicProps(props)
  const { body: dataBody, ...rest } = clean
  const text = (body || (typeof dataBody === "string" ? dataBody : "")).trim()
  const attrs = Object.entries(rest)
    .map(([key, value]) => (value === true ? key : `${key}=${jsxValue(value)}`))
    .join(" ")
  const open = attrs ? `<${spec.tag} ${attrs}` : `<${spec.tag}`
  return text ? `${open}>\n\n${text}\n\n</${spec.tag}>` : `${open} />`
}

/** A fence longer than any backtick fence inside `text` (``` → ````). */
export function fenceFor(text: string, char = "`") {
  let longest = 0
  for (const match of text.matchAll(char === "`" ? /^\s*(`{3,})/gm : /^\s*(~{3,})/gm)) longest = Math.max(longest, match[1]?.length ?? 0)
  return char.repeat(Math.max(3, longest + 1))
}

/** Wrap a block body in an ```mdx fence that its own fences cannot close. */
export function fenced(inner: string, info = "mdx") {
  const fence = fenceFor(inner)
  return `${fence}${info}\n${inner}\n${fence}`
}

/** The fenced block to drop in a note. */
export function templateBlock(spec: AnySpec, syntax: TemplateSyntax): string {
  const { title, props = {}, body } = spec.template
  const all = { ...(title ? { title } : {}), ...props }
  switch (syntax) {
    case "ascii":
      return fenced(toAscii(spec, all, body))
    case "mdx":
      return fenced(toMdx(spec, all, body))
    case "short": {
      const yaml = toYaml(all).trimEnd()
      const short = spec.aliases[0] ?? spec.slug
      return fenced(`${yaml ? `---\n${yaml}\n---\n` : ""}${body}`, `mdx ${short}`)
    }
    default:
      return fenced(toComark(spec, all, body))
  }
}

/** Same, without the fence (when the cursor already sits in an mdx block). */
export function templateInner(spec: AnySpec, syntax: TemplateSyntax): string {
  const block = templateBlock(spec, syntax === "short" ? "comark" : syntax)
  return block.split("\n").slice(1, -1).join("\n")
}
