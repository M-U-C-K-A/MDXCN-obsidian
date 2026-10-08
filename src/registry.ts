import { CHARTS } from "./components/charts"
import { CONTENT } from "./components/content"
import { DATA } from "./components/data"
import { DIAGRAMS } from "./components/diagrams"
import { TIME } from "./components/time"
import type { AnySpec, Group } from "./types"

export const SPECS: AnySpec[] = [...CONTENT, ...DATA, ...CHARTS, ...DIAGRAMS, ...TIME]

export const GROUPS: Record<Group, string> = {
  content: "Content",
  data: "Data",
  chart: "Charts",
  diagram: "Diagrams",
  time: "Time",
  layout: "Layout",
}

const LOOKUP = new Map<string, AnySpec>()
for (const spec of SPECS) {
  for (const key of [spec.slug, spec.tag, spec.name, ...spec.aliases]) {
    const normalized = normalize(key)
    if (!LOOKUP.has(normalized)) LOOKUP.set(normalized, spec)
  }
}

function normalize(name: string) {
  return name
    .trim()
    .replace(/^::+/, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
}

/** `gantt`, `graph-gantt`, `GraphGantt`, `Gantt` → the Gantt spec. */
export function findSpec(name: string | undefined | null): AnySpec | undefined {
  if (!name) return undefined
  const key = normalize(name)
  return LOOKUP.get(key) ?? LOOKUP.get(key.replace(/^graph-/, "")) ?? LOOKUP.get(`graph-${key}`)
}

export function specBySlug(slug: string): AnySpec | undefined {
  return SPECS.find((spec) => spec.slug === slug)
}

/** Every item tag any spec accepts (`Span`, `Stat`, `Row` …). */
export const ITEM_TAGS = new Set(SPECS.flatMap((spec) => Object.keys(spec.items ?? {})).concat(["Cell", "Segment", "Node", "Row", "Head", "Foot"]))
