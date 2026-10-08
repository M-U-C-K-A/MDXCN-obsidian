/*
 * Hairline-style figures for the README: isometric line drawings in a single
 * 1px stroke, rounded solids drawn as a silhouette and one crease, plates
 * filled with the page colour, one bright stroke (the mdxcn accent), and no
 * words inside the drawing.
 *
 *   node docs/svg/hairline.mjs   →   docs/assets/quickstart-*.svg, picker-*.svg
 *
 * The visual language follows @lucasmarkes/hairline; the geometry below is
 * written for these static files (no pointer, a short ambient loop instead).
 */

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets")
mkdirSync(OUT, { recursive: true })

/* ---- palette: hairline's four strokes + the accent as the bright one ---- */

const THEMES = {
  light: { ground: "#ffffff", hi: "#005fc6", edge: "#a4a4ac", mid: "#c3c3c9", lo: "#e0e0e4" },
  dark: { ground: "#0d1117", hi: "#69a1e8", edge: "#6b6f79", mid: "#474a54", lo: "#30333b" },
}

const EASE = "0.32 0.72 0 1"
const r2 = (n) => Math.round(n * 100) / 100

/* ---- camera: azimuth 45°, k = 0.5 (the 2:1 view) ---------------------- */

function camera(S) {
  const c = Math.cos(Math.PI / 4)
  const s = Math.sin(Math.PI / 4)
  const k = 0.5
  const zf = Math.sqrt(1 - k * k)
  const cam = { ox: 0, oy: 0 }
  cam.P = (x, y, z = 0) => [r2(cam.ox + S * (x * c - y * s)), r2(cam.oy + S * ((x * s + y * c) * k - z * zf))]
  cam.front = (q) => q.nu * s + q.nv * c >= -1e-6
  cam.fit = (points, cx, cy) => {
    cam.ox = 0
    cam.oy = 0
    const xs = points.map((p) => cam.P(...p))
    const minX = Math.min(...xs.map((p) => p[0]))
    const maxX = Math.max(...xs.map((p) => p[0]))
    const minY = Math.min(...xs.map((p) => p[1]))
    const maxY = Math.max(...xs.map((p) => p[1]))
    cam.ox = cx - (minX + maxX) / 2
    cam.oy = cy - (minY + maxY) / 2
  }
  return cam
}

/** A rounded rectangle as a ring of samples with outward normals. */
function rrect(u0, v0, u1, v1, r, n = 4) {
  r = Math.max(0, Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2))
  const out = []
  for (const [cu, cv, a0] of [
    [u1 - r, v1 - r, 0],
    [u0 + r, v1 - r, 90],
    [u0 + r, v0 + r, 180],
    [u1 - r, v0 + r, 270],
  ]) {
    for (let i = 0; i <= n; i += 1) {
      const a = ((a0 + (90 * i) / n) * Math.PI) / 180
      out.push({ u: cu + r * Math.cos(a), v: cv + r * Math.sin(a), nu: Math.cos(a), nv: Math.sin(a) })
    }
  }
  return out
}

/** The ring split into its camera-facing run and the rest, both in ring order. */
function split(cam, ring) {
  const n = ring.length
  let start = 0
  for (let i = 0; i < n; i += 1) {
    if (cam.front(ring[i]) && !cam.front(ring[(i + n - 1) % n])) {
      start = i
      break
    }
  }
  const order = Array.from({ length: n }, (_, i) => ring[(start + i) % n])
  const cut = order.findIndex((q) => !cam.front(q))
  return { front: order.slice(0, cut), back: order.slice(cut) }
}

const pathOf = (pts, close = true) => `M${pts.map((p) => `${p[0]} ${p[1]}`).join("L")}${close ? "Z" : ""}`

/**
 * A rounded solid from z0 to z1: its silhouette (front arc at the base, back
 * arc at the top) and its crease (the inner ring's front arc on top). The
 * point count does not depend on the height, so heights can be animated.
 */
function solid(cam, ring, inner, z0, z1) {
  const { front, back } = split(cam, ring)
  const sil = [
    ...front.map((q) => cam.P(q.u, q.v, z0)),
    cam.P(front[front.length - 1].u, front[front.length - 1].v, z1),
    ...back.map((q) => cam.P(q.u, q.v, z1)),
    cam.P(front[0].u, front[0].v, z1),
  ]
  const crease = inner ? split(cam, inner).front.map((q) => cam.P(q.u, q.v, z1)) : []
  return { sil: pathOf(sil), crease: crease.length > 1 ? pathOf(crease, false) : "" }
}

const ringPath = (cam, ring, z) => pathOf(ring.map((q) => cam.P(q.u, q.v, z)))
const line = (cam, a, b) => `M${cam.P(...a).join(" ")}L${cam.P(...b).join(" ")}`

/* ---- svg ---------------------------------------------------------------- */

function document(width, height, title, theme, body) {
  const t = THEMES[theme]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">
  <title>${title}</title>
  <style>
    path, ellipse, rect { fill: ${t.ground}; stroke: ${t.mid}; stroke-width: 1; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
    .sil { stroke: ${t.edge}; }
    .hi { stroke: ${t.hi}; }
    .lo { stroke: ${t.lo}; }
    .nf { fill: none; }
    .dash { fill: none; stroke: ${t.edge}; stroke-dasharray: 1.5 4; }
    .dash.lo { stroke: ${t.lo}; }
    .dot { stroke: none; fill: ${t.hi}; }
    .dot.m { fill: ${t.edge}; }
    .dot.off { fill: ${t.lo}; }
  </style>
  ${body}
</svg>
`
}

const el = (d, cls = "") => (d ? `<path d="${d}"${cls ? ` class="${cls}"` : ""}/>` : "")

/** A bar that rises from flat to its height, staggered, on a loop. */
function risingBar(cam, ring, inner, z0, h, cls, { delay, cycle, hold }) {
  const flat = solid(cam, ring, inner, z0, z0 + 0.01)
  const up = solid(cam, ring, inner, z0, z0 + h)
  // rest is the risen pose: it holds, sinks, waits, rises again.
  const t = (ms) => r2(ms / cycle)
  const keyTimes = `0;${t(hold)};${t(hold + 700)};${t(hold + 1300)};${t(hold + 2000)};1`
  const anim = (from, to) =>
    `<animate attributeName="d" values="${to};${to};${from};${from};${to};${to}" keyTimes="${keyTimes}" calcMode="spline" keySplines="0 0 1 1;${EASE};0 0 1 1;${EASE};0 0 1 1" dur="${cycle}ms" begin="${delay}ms" repeatCount="indefinite"/>`
  return `<path d="${up.sil}" class="${cls}">${anim(flat.sil, up.sil)}</path>${up.crease ? `<path d="${up.crease}" class="${cls === "hi" ? "hi" : "lo"} nf">${anim(flat.crease, up.crease)}</path>` : ""}`
}

/* ---- the gantt, shared by both figures -------------------------------- */

const ROWS = [
  { start: 0, end: 8, done: 8 },
  { start: 5, end: 18, done: 7, live: true },
  { start: 13, end: 22, done: 2 },
  { start: 20, end: 24, done: 0 },
]

/**
 * The rendered gantt on a plate's top at height z: label stubs, tracks, the
 * remaining part as a flat dashed outline, the done part as a rising solid.
 */
function gantt(cam, { x0, x1, y0, pitch, z, h, cycle, hold, offset = 0, accent = true, labels = true, playhead = true, ticks = true }) {
  const cols = 24
  const trackX0 = labels ? x0 + 26 : x0
  const cw = (x1 - trackX0) / cols
  const thick = pitch * 0.42
  const parts = []
  const bars = []
  if (playhead) {
    const px = trackX0 + 13.5 * cw
    parts.push(`<ellipse cx="${cam.P(px, y0 - pitch * 0.85, z)[0]}" cy="${cam.P(px, y0 - pitch * 0.85, z)[1]}" rx="2.2" ry="1.1" class="dot m"/>`)
  }
  ROWS.forEach((row, i) => {
    const y = y0 + i * pitch
    if (labels) parts.push(el(line(cam, [x0, y, z], [x0 + 14 - (i % 2) * 4, y, z]), row.live && accent ? "sil" : "lo"))
    parts.push(el(line(cam, [trackX0, y, z], [x1, y, z]), "lo"))
    const doneEnd = trackX0 + (row.start + row.done) * cw
    if (row.end > row.start + row.done) {
      parts.push(el(ringPath(cam, rrect(doneEnd + 0.4, y - thick / 2, trackX0 + row.end * cw, y + thick / 2, 1.2), z), "dash"))
    }
    if (row.done > 0) {
      const ring = rrect(trackX0 + row.start * cw, y - thick / 2, doneEnd, y + thick / 2, 1.6)
      const inner = rrect(trackX0 + row.start * cw + 0.7, y - thick / 2 + 0.7, doneEnd - 0.7, y + thick / 2 - 0.7, 1)
      bars.push({ ring, inner, depth: trackX0 + row.start * cw + y, live: row.live, index: i })
    }
  })
  if (ticks) {
    const ty = y0 + ROWS.length * pitch - pitch * 0.25
    for (let q = 0; q < 4; q += 1) {
      const p = cam.P(trackX0 + (q / 3) * (cols * cw - cw) + cw / 2, ty, z)
      parts.push(`<ellipse cx="${p[0]}" cy="${p[1]}" rx="1.6" ry="0.8" class="dot off"/>`)
    }
  }
  bars.sort((a, b) => a.depth - b.depth)
  for (const bar of bars) {
    parts.push(risingBar(cam, bar.ring, bar.inner, z, h, bar.live && accent ? "hi" : "sil", { delay: offset + bar.index * 45, cycle, hold }))
  }
  return parts.join("")
}

/** The mdxcn frame on a top face: dashed border, + corners, a title tab. */
function frameOn(cam, { x0, y0, x1, y1, z }) {
  const parts = [el(ringPath(cam, rrect(x0, y0, x1, y1, 0.5), z), "dash")]
  const arm = 2.4
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ]) {
    parts.push(el(`${line(cam, [x - arm, y, z], [x + arm, y, z])}${line(cam, [x, y - arm, z], [x, y + arm, z])}`, "sil nf"))
  }
  const mid = (x0 + x1) / 2
  parts.push(el(ringPath(cam, rrect(mid - 14, y0 - 2.6, mid + 14, y0 + 2.6, 2.6), z), "sil"))
  return parts.join("")
}

/** A plate (a slab with a silhouette and one crease) at z0..z1. */
function plate(cam, x0, y0, x1, y1, r, b, z0, z1, cls = "sil") {
  const s = solid(cam, rrect(x0, y0, x1, y1, r), rrect(x0 + b, y0 + b, x1 - b, y1 - b, Math.max(0.3, r - b)), z0, z1)
  return el(s.sil, cls) + el(s.crease, "lo nf")
}

/* ---- 1. quick start: the pasted fence, and the figure it becomes ------- */

function quickstart(theme) {
  const W = 1000
  const H = 340
  const cam = camera(2.3)
  // The note: a thin sheet. The figure: a thicker plate beside it.
  const note = { x0: 0, y0: 0, x1: 132, y1: 168 }
  const fig = { x0: 166, y0: -88, x1: 316, y1: 22, z: 7 }
  cam.fit(
    [
      [note.x0, note.y0, 0],
      [note.x1, note.y1, 0],
      [note.x0, note.y1, 0],
      [fig.x1, fig.y0, fig.z + 14],
      [fig.x0, fig.y1, 0],
      [fig.x1, fig.y1, 0],
    ],
    W / 2,
    H / 2
  )
  const parts = []

  // the note sheet
  parts.push(plate(cam, note.x0, note.y0, note.x1, note.y1, 7, 1.4, 0, 2.4))
  const z = 2.4
  for (const [y, len] of [
    [10, 84],
    [17, 62],
  ]) {
    parts.push(el(line(cam, [10, y, z], [10 + len, y, z]), "lo"))
  }
  // the code fence: a block with ``` marks, and the drawing inside it
  parts.push(el(ringPath(cam, rrect(8, 26, 124, 160, 4), z), "lo"))
  for (const y of [32, 154]) {
    for (let i = 0; i < 3; i += 1) parts.push(el(line(cam, [14 + i * 3, y, z], [15.4 + i * 3, y, z]), "sil"))
  }
  parts.push(frameOn(cam, { x0: 16, y0: 44, x1: 116, y1: 144, z }))
  const cols = 24
  const cx0 = 40
  const cw = (110 - cx0) / cols
  ROWS.forEach((row, i) => {
    const y = 62 + i * 15
    parts.push(el(line(cam, [22, y, z], [33 - (i % 2) * 3, y, z]), row.live ? "sil" : "lo"))
    for (let c = 0; c < cols; c += 1) {
      const inBar = c >= row.start && c < row.end
      const filled = inBar && c < row.start + row.done
      const p = cam.P(cx0 + c * cw + cw / 2, y, z)
      if (!inBar) {
        parts.push(el(line(cam, [cx0 + c * cw + 0.6, y, z], [cx0 + c * cw + cw - 0.6, y, z]), "lo"))
        continue
      }
      parts.push(`<ellipse cx="${p[0]}" cy="${p[1]}" rx="2.7" ry="1.7" class="dot ${filled ? "m" : "off"}"/>`)
    }
  })

  // the figure: a plate, the mdxcn frame on it, the gantt rising from it
  parts.push(plate(cam, fig.x0, fig.y0, fig.x1, fig.y1, 7, 1.6, 0, fig.z))
  parts.push(frameOn(cam, { x0: fig.x0 + 8, y0: fig.y0 + 8, x1: fig.x1 - 8, y1: fig.y1 - 8, z: fig.z }))
  parts.push(gantt(cam, { x0: fig.x0 + 16, x1: fig.x1 - 14, y0: fig.y0 + 30, pitch: 17, z: fig.z, h: 8, cycle: 7000, hold: 3800 }))

  return document(W, H, "Paste the mdxcn ASCII fence in a note; Obsidian draws the figure", theme, parts.join("\n  "))
}

/* ---- 2. the picker: search, a list, a live preview ---------------------- */

function picker(theme) {
  const W = 900
  const H = 400
  const cam = camera(2.3)
  const m = { x0: 0, y0: 0, x1: 250, y1: 168, z: 7 }
  cam.fit(
    [
      [m.x0, m.y0, m.z + 10],
      [m.x1, m.y0, m.z],
      [m.x0, m.y1, 0],
      [m.x1, m.y1, 0],
    ],
    W / 2,
    H / 2
  )
  const parts = []
  parts.push(plate(cam, m.x0, m.y0, m.x1, m.y1, 8, 1.8, 0, m.z))
  const z = m.z

  // the search field, a caret, and the four syntax tabs
  parts.push(el(ringPath(cam, rrect(12, 12, 166, 26, 7), z), "sil"))
  parts.push(el(line(cam, [22, 19, z], [40, 19, z]), "lo"))
  for (let i = 0; i < 4; i += 1) {
    parts.push(el(ringPath(cam, rrect(176 + i * 16.5, 13, 189 + i * 16.5, 25, 5), z), i === 0 ? "sil" : "lo"))
  }

  // the list: the chosen row moves down, one step every 2.4s
  const steps = 4
  const stepMs = 2400
  const cycle = steps * stepMs
  const t = THEMES[theme]
  for (let i = 0; i < 6; i += 1) {
    const y0 = 36 + i * 21
    const ring = ringPath(cam, rrect(12, y0, 92, y0 + 15, 5), z)
    const values = Array.from({ length: steps + 1 }, (_, s) => (s % steps === i ? t.hi : t.lo)).join(";")
    const anim = i < steps ? `<animate attributeName="stroke" values="${values}" dur="${cycle}ms" calcMode="discrete" repeatCount="indefinite"/>` : ""
    parts.push(`<path d="${ring}" class="${i === 0 ? "hi" : "lo"}">${anim}</path>`)
    const dot = cam.P(20, y0 + 7.5, z)
    parts.push(`<ellipse cx="${dot[0]}" cy="${dot[1]}" rx="2.6" ry="1.3" class="dot m"/>`)
    parts.push(el(line(cam, [28, y0 + 7.5, z], [28 + 30 - (i % 3) * 7, y0 + 7.5, z]), "lo"))
  }

  // the live preview: a framed gantt that rises again at every new choice
  parts.push(frameOn(cam, { x0: 104, y0: 38, x1: 238, y1: 132, z }))
  // offset: the rise lands just after each change of choice
  const preview = gantt(cam, { x0: 112, x1: 230, y0: 60, pitch: 15, z, h: 6, cycle: stepMs, hold: stepMs - 2000, offset: -1650, accent: false })
  parts.push(preview)

  // the source under it, and the insert button
  for (const [y, len] of [
    [142, 70],
    [149, 48],
  ]) {
    parts.push(el(line(cam, [106, y, z], [106 + len, y, z]), "lo"))
  }
  parts.push(el(ringPath(cam, rrect(204, 140, 238, 156, 6), z), "sil"))

  return document(W, H, "The component picker: search, choose, see the live preview, insert", theme, parts.join("\n  "))
}

for (const theme of ["light", "dark"]) {
  for (const [name, draw] of [
    ["quickstart", quickstart],
    ["picker", picker],
  ]) {
    const content = draw(theme)
    writeFileSync(join(OUT, `${name}-${theme}.svg`), content)
    console.log(`docs/assets/${name}-${theme}.svg  ${(content.length / 1024).toFixed(1)} kB`)
  }
}
