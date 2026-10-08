/*
 * Round-trip tests against the official mdxcn.dev samples.
 *
 *   npm test
 *
 * 1. Every official ASCII fence is detected as the right component, and
 *    drawing it again gives back the same fence.
 * 2. Every official Comark block parses and draws the official fence.
 * 3. Every template renders to ASCII, Comark and MDX, and each re-parses to
 *    the same component.
 */

import { readFileSync } from "fs"
import { detectAscii } from "../src/parse/ascii-detect"
import { parse as parseYaml } from "yaml"
import { parseDocument, setYamlParser } from "../src/parse/document"
import { parseBlocks } from "../src/parse/md"
import { SPECS, findSpec } from "../src/registry"
import { templateBlock, toAscii } from "../src/serialize"

type Fixture = { ascii: { name: string; slug: string; ascii: string }[]; comark: { slug: string; source: string }[] }
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/official.json", import.meta.url), "utf8")) as Fixture

setYamlParser((text) => parseYaml(text))

let failures = 0
let passes = 0
const verbose = process.argv.includes("-v")

function fail(label: string, detail = "") {
  failures += 1
  console.log(`✗ ${label}${detail ? `\n${detail}` : ""}`)
}

function pass(label: string) {
  passes += 1
  if (verbose) console.log(`✓ ${label}`)
}

function diff(expected: string, actual: string) {
  const a = expected.split("\n")
  const b = actual.split("\n")
  const out: string[] = []
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) out.push(`   - ${a[index] ?? "∅"}\n   + ${b[index] ?? "∅"}`)
  }
  return out.slice(0, 8).join("\n")
}

/*
 * Known differences with the docs, on purpose:
 * - bars: the official drawing top-aligns the shorter series (an index bug in
 *   knap's asciiBars); this plugin bottom-aligns both.
 * - the Comark samples for diff, invoice and bars have broken YAML in
 *   llms.txt (`from:   name:` on one line); spec and uptime use other data
 *   than their ASCII sample.
 */
const ROUND_TRIP_SKIP = new Set(["bars"])
const COMARK_SKIP = new Set(["graph-diff", "graph-invoice", "graph-bars", "graph-spec", "graph-uptime"])

/* 1. ASCII → component → ASCII */
for (const sample of fixtures.ascii) {
  const found = detectAscii(sample.ascii)
  if (found.slug !== sample.slug) {
    fail(`detect ${sample.name}: got ${found.slug}, expected ${sample.slug}`, JSON.stringify(found.props).slice(0, 300))
    continue
  }
  const spec = findSpec(found.slug)!
  const again = toAscii(spec, found.props, "")
  if (again !== sample.ascii && !ROUND_TRIP_SKIP.has(sample.name)) fail(`round-trip ${sample.name}`, diff(sample.ascii, again))
  else pass(`ascii ${sample.name}`)
}

/* 2. Comark → ASCII */
const officialAscii = new Map(fixtures.ascii.map((sample) => [sample.slug, sample.ascii]))
for (const sample of fixtures.comark) {
  const nodes = parseDocument(sample.source)
  const node = nodes.find((entry) => entry.kind === "graph")
  if (!node || node.kind !== "graph") {
    fail(`comark ${sample.slug}: no graph`, JSON.stringify(nodes).slice(0, 300))
    continue
  }
  if (node.spec.slug !== sample.slug) {
    fail(`comark ${sample.slug}: parsed as ${node.spec.slug}`)
    continue
  }
  const expected = officialAscii.get(sample.slug)
  const drawn = toAscii(node.spec, node.props, node.body)
  if (expected && drawn !== expected && !COMARK_SKIP.has(sample.slug)) fail(`comark→ascii ${sample.slug}`, diff(expected, drawn))
  else pass(`comark ${sample.slug}`)
}

/* 3. Templates in every syntax */
for (const spec of SPECS) {
  for (const syntax of ["comark", "mdx", "ascii", "short"] as const) {
    const block = templateBlock(spec, syntax)
    const lines = block.split("\n")
    const hint = lines[0]?.replace(/^`{3,}mdx\s*/, "").trim() || undefined
    const inner = lines.slice(1, -1).join("\n")
    // The template must stay one fence in a note (inner ``` cannot close it).
    const outer = parseBlocks(block)
    if (outer.length !== 1 || outer[0]?.type !== "code") {
      fail(`template ${spec.slug} (${syntax}) is not a single fence`, block)
      continue
    }
    const nodes = parseDocument(inner, { hint })
    const node = nodes.find((entry) => entry.kind === "graph")
    if (!node || node.kind !== "graph" || node.spec.slug !== spec.slug) {
      fail(`template ${spec.slug} (${syntax}) parsed as ${node && node.kind === "graph" ? node.spec.slug : node?.kind}`, syntax === "ascii" ? inner : "")
      continue
    }
    try {
      toAscii(node.spec, node.props, node.body)
      pass(`template ${spec.slug} ${syntax}`)
    } catch (error) {
      fail(`template ${spec.slug} (${syntax}) throws`, String(error))
    }
  }
}

/* 4. The user's own example: a pasted fence inside the block. */
const user = "```\n+------------------- [ LAUNCH ] -------------------+\n|                                                  |\n| design  ████████----------------                 |\n| build   -----███████░░░░░░------                 |\n| docs    -------------██░░░░░░░--                 |\n| ship    --------------------████                 |\n|         q1     q2      q3     q4                 |\n|                                                  |\n+--------------------------------------------------+\n```"
const userNodes = parseDocument(user)
const userNode = userNodes[0]
if (userNode?.kind === "graph" && userNode.spec.slug === "graph-gantt") pass("user gantt")
else fail("user gantt", JSON.stringify(userNodes).slice(0, 300))

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures > 0 ? 1 : 0)
