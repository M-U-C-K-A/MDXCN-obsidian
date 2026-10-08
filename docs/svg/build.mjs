/*
 * Isometric, animated SVG illustrations for the README.
 *   node docs/svg/build.mjs   →   docs/assets/<name>-light.svg, <name>-dark.svg
 *
 * Transparent background: the README picks the light or dark file with
 * <picture> + prefers-color-scheme, so each one sits on GitHub's own page.
 * No dependencies. Animations are CSS keyframes (floating) and SMIL (fills,
 * ticking digits, pulses), both of which run when GitHub shows an SVG.
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets")
mkdirSync(OUT, { recursive: true })

/* ---- palettes --------------------------------------------------------- */

/** Each accent: [ink on the tile, lit side face, shaded side face]. */
const THEMES = {
  dark: {
    ink: "#0e1426",
    card: "#0f1529",
    line: "#8ea2d8",
    text: "#e7ecfb",
    muted: "#8b96b8",
    tagline: "#c7d0ea",
    grid: "#9fb0e0",
    gridOpacity: 0.09,
    shadow: "#000000",
    shadowScale: 1,
    glowScale: 0.75,
    note: ["#151c36", "#7254d8", "#4b37a8"],
    neutral: ["#24304f", "#1a2340"],
    blue: ["#69a1e8", "#2f6fd1", "#1d4f9e"],
    amber: ["#e8a95c", "#b9761f", "#8a5612"],
    green: ["#75cca7", "#2f9a6f", "#1f7352"],
    pink: ["#ee8dbd", "#c24f8a", "#94336a"],
    purple: ["#a68af9", "#7254d8", "#4b37a8"],
    teal: ["#6ac9ce", "#2a9aa0", "#1d7276"],
    red: "#f07f77",
    orange: "#f7945a",
  },
  light: {
    ink: "#ffffff",
    card: "#fbfcff",
    line: "#8390b4",
    text: "#1c2333",
    muted: "#5d6885",
    tagline: "#3d4660",
    grid: "#3a4670",
    gridOpacity: 0.08,
    shadow: "#1c2340",
    shadowScale: 0.4,
    glowScale: 0.4,
    note: ["#f7f4ff", "#b9a0fb", "#8a68ef"],
    neutral: ["#dfe4f0", "#c5ccdd"],
    blue: ["#005fc6", "#6aa4ec", "#2f6fd1"],
    amber: ["#ae6800", "#f0b46a", "#c98425"],
    green: ["#007852", "#7dd4ae", "#2f9a6f"],
    pink: ["#ca358b", "#f19cc6", "#c94f8c"],
    purple: ["#773ac1", "#b9a0fb", "#8a68ef"],
    teal: ["#007980", "#7fd2d6", "#2a9aa0"],
    red: "#c92f33",
    orange: "#d95800",
  },
}

// The drawing functions read these; `useTheme` swaps them before each build.
let THEME, INK, CARD, LINE, TEXT, MUTED, TAGLINE
let BLUE, BLUE_D, BLUE_L, AMBER, AMBER_D, AMBER_L, GREEN, GREEN_D, GREEN_L
let PINK, PINK_D, PINK_L, PURPLE, PURPLE_D, PURPLE_L, TEAL, TEAL_D, TEAL_L

function useTheme(name) {
  THEME = THEMES[name]
  ;({ ink: INK, card: CARD, line: LINE, text: TEXT, muted: MUTED, tagline: TAGLINE } = THEME)
  ;[BLUE, BLUE_D, BLUE_L] = THEME.blue
  ;[AMBER, AMBER_D, AMBER_L] = THEME.amber
  ;[GREEN, GREEN_D, GREEN_L] = THEME.green
  ;[PINK, PINK_D, PINK_L] = THEME.pink
  ;[PURPLE, PURPLE_D, PURPLE_L] = THEME.purple
  ;[TEAL, TEAL_D, TEAL_L] = THEME.teal
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
const SANS = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

/* ---- isometric helpers ------------------------------------------------ */

const C = Math.cos(Math.PI / 6)
const S = 0.5
const r = (n) => Math.round(n * 100) / 100

/** Screen point of iso (x right-down, y left-down, z up). */
function P(o, x, y, z = 0) {
  return [r(o[0] + (x - y) * C), r(o[1] + (x + y) * S - z)]
}

const pts = (list) => list.map((p) => p.join(",")).join(" ")

/** Matrix mapping local (u, v) on the plane at (x0, y0, z) to the screen. */
function plane(o, x0, y0, z) {
  const [ex, ey] = P(o, x0, y0, z)
  return `matrix(${r(C)} ${S} ${r(-C)} ${S} ${ex} ${ey})`
}

/** A slab: top face at height z, `t` thick. Returns SVG for the sides + top. */
function slab(o, { x, y, z, w, h, t }, { top, right, left, stroke = "none", strokeOpacity = 1, dash = "" }) {
  const a = P(o, x, y, z)
  const b = P(o, x + w, y, z)
  const c = P(o, x + w, y + h, z)
  const d = P(o, x, y + h, z)
  const b2 = P(o, x + w, y, z - t)
  const c2 = P(o, x + w, y + h, z - t)
  const d2 = P(o, x, y + h, z - t)
  return [
    `<polygon points="${pts([b, c, c2, b2])}" fill="${right}"/>`,
    `<polygon points="${pts([d, c, c2, d2])}" fill="${left}"/>`,
    `<polygon points="${pts([a, b, c, d])}" fill="${top}" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="1.2" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linejoin="round"/>`,
  ].join("")
}

/** Soft shadow under a slab, on the plane at height `ground`. */
function shadow(o, { x, y, w, h }, ground, id, opacity = 0.45) {
  const a = P(o, x, y, ground)
  const b = P(o, x + w, y, ground)
  const c = P(o, x + w, y + h, ground)
  const d = P(o, x, y + h, ground)
  return `<polygon points="${pts([a, b, c, d])}" fill="${THEME.shadow}" opacity="${r(opacity * THEME.shadowScale)}" filter="url(#${id})"/>`
}

/** The mdxcn frame drawn flat in (u, v): dotted border, + corners, [ TITLE ]. */
function frame(w, h, title, { color = LINE, accent = BLUE, bg = INK, anim = "" } = {}) {
  const corner = (x, y) =>
    `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" fill="${bg}"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${color}" opacity=".7">+</text>`
  const titleWidth = title ? title.length * 7.4 + 30 : 0
  return [
    `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-opacity=".55" stroke-width="1" stroke-dasharray="2 5"/>`,
    corner(0, 0),
    corner(w, 0),
    corner(0, h),
    corner(w, h),
    title
      ? `<rect x="${r(w / 2 - titleWidth / 2)}" y="-7" width="${r(titleWidth)}" height="14" fill="${bg}"/><text x="${w / 2}" y="4" text-anchor="middle" font-family="${MONO}" font-size="11.5" letter-spacing=".6" fill="${accent}">[ ${title} ]${anim}</text>`
      : "",
  ].join("")
}

const defs = (width, height, extra = "") => `
  <defs>
    <radialGradient id="glowBlue" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${BLUE}" stop-opacity="${r(0.38 * THEME.glowScale)}"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowPurple" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${PURPLE}" stop-opacity="${r(0.32 * THEME.glowScale)}"/>
      <stop offset="1" stop-color="${PURPLE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowPink" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${PINK}" stop-opacity="${r(0.26 * THEME.glowScale)}"/>
      <stop offset="1" stop-color="${PINK}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="fadeGrad" cx=".5" cy=".5" r=".5">
      <stop offset=".35" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="url(#fadeGrad)"/>
    </mask>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="softer" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    ${extra}
  </defs>`

const baseStyle = (extra = "") => `
  <style>
    .float { animation: float 6s ease-in-out infinite; }
    .float.d1 { animation-delay: -1.5s; }
    .float.d2 { animation-delay: -3s; }
    .float.d3 { animation-delay: -4.5s; }
    .breathe { animation: breathe 6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
    .breathe.d1 { animation-delay: -1.5s; }
    .breathe.d2 { animation-delay: -3s; }
    .breathe.d3 { animation-delay: -4.5s; }
    .twinkle { animation: twinkle 4s ease-in-out infinite; }
    .drift { animation: drift 14s linear infinite; }
    @keyframes float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-12px) } }
    @keyframes breathe { 0%, 100% { opacity: .5; transform: scale(1) } 50% { opacity: .3; transform: scale(.9) } }
    @keyframes twinkle { 0%, 100% { opacity: .15 } 50% { opacity: .8 } }
    @keyframes drift { from { transform: translateY(0) } to { transform: translateY(-640px) } }
    ${extra}
    @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
  </style>`

/** Faint isometric grid over the whole canvas. */
function isoGrid(width, height, step = 36, opacity = 0.05) {
  const lines = []
  const span = width + height * 2
  for (let i = -span; i < span; i += step) {
    lines.push(`<line x1="${i}" y1="0" x2="${r(i + height / Math.tan(Math.PI / 6))}" y2="${height}"/>`)
    lines.push(`<line x1="${i}" y1="0" x2="${r(i - height / Math.tan(Math.PI / 6))}" y2="${height}"/>`)
  }
  return `<g mask="url(#fade)"><g stroke="${THEME.grid}" stroke-opacity="${THEME.gridOpacity}" stroke-width="1">${lines.join("")}</g></g>`
}

/** Rising glyph particles. */
function particles(width, height, count, seed = 1, avoid = null) {
  let s = seed
  const rand = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  const glyphs = ["█", "░", "▒", "+", "·", "▾", "●", "│"]
  const colors = [BLUE, PURPLE, PINK, AMBER, GREEN, TEAL]
  const out = []
  for (let i = 0; i < count; i += 1) {
    let x = r(rand() * width)
    const y = r(rand() * height + height * 0.2)
    if (avoid && x > avoid[0] && x < avoid[1]) x = r(avoid[1] + rand() * (width - avoid[1]))
    const dur = r(10 + rand() * 14)
    const delay = r(-rand() * dur)
    out.push(
      `<g class="drift" style="animation-duration:${dur}s;animation-delay:${delay}s"><text x="${x}" y="${y + 640}" font-family="${MONO}" font-size="${r(9 + rand() * 7)}" fill="${colors[i % colors.length]}" class="twinkle" style="animation-delay:${r(-rand() * 4)}s">${glyphs[i % glyphs.length]}</text></g>`
    )
  }
  return out.join("")
}

function svg(width, height, body, { title, extraDefs = "", extraStyle = "" } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">
  <title>${title}</title>${defs(width, height, extraDefs)}${baseStyle(extraStyle)}
  ${body}
</svg>
`
}

/* ---- tile contents (drawn flat, then projected) ---------------------- */

/** Gantt rows whose cells light up in sequence, looping. */
function ganttContent(w, h, accent, dur = 6, anim = "") {
  const rows = [
    { label: "design", start: 0, end: 8, done: 8 },
    { label: "build", start: 5, end: 18, done: 7, live: true },
    { label: "docs", start: 13, end: 22, done: 2 },
    { label: "ship", start: 20, end: 24, done: 0 },
  ]
  const cols = 24
  const x0 = 78
  const cw = (w - x0 - 18) / cols
  const out = [frame(w, h, "LAUNCH", { accent, anim })]
  const top = 34
  const gap = (h - top - 34) / (rows.length - 1)
  // playhead
  const head = x0 + 13.5 * cw
  out.push(`<text x="${r(head)}" y="${top - 12}" font-family="${MONO}" font-size="9" text-anchor="middle" fill="${accent}">▾${anim}</text>`)
  rows.forEach((row, ri) => {
    const y = top + ri * gap
    out.push(`<text x="16" y="${r(y + 4)}" font-family="${MONO}" font-size="11" fill="${row.live ? accent : TEXT}">${row.label}${row.live ? anim : ""}</text>`)
    for (let c = 0; c < cols; c += 1) {
      const x = r(x0 + c * cw)
      const inBar = c >= row.start && c < row.end
      const filled = inBar && c < row.start + row.done
      if (!inBar) {
        out.push(`<rect x="${x + 1}" y="${r(y)}" width="${r(cw - 3)}" height="1.4" fill="${LINE}" opacity=".35"/>`)
        continue
      }
      const color = filled ? (row.live ? accent : TEXT) : LINE
      const base = filled ? 1 : 0.35
      const begin = r(((c - row.start) / cols) * dur * 0.5 + ri * 0.25)
      out.push(
        `<rect x="${x + 1}" y="${r(y - 5)}" width="${r(cw - 3)}" height="10" rx="1" fill="${color}" opacity="${base}"><animate attributeName="opacity" values="0;${base};${base};0" keyTimes="0;.12;.9;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>${filled && row.live ? anim : ""}</rect>`
      )
    }
  })
  const axis = top + (rows.length - 1) * gap + 24
  ;["q1", "q2", "q3", "q4"].forEach((tick, i) => {
    out.push(`<text x="${r(x0 + (i / 3) * (cols * cw - 12))}" y="${r(axis)}" font-family="${MONO}" font-size="10" fill="${MUTED}">${tick}</text>`)
  })
  return out.join("")
}

/** A ticking elapsed timer: `42d 02:38:3X`, the last digit changes every second. */
function timerContent(w, h, accent, prefix = "42d 02:38:3", caption = "api", title = "INCIDENT") {
  const out = [frame(w, h, title, { accent })]
  out.push(`<text x="20" y="${r(h / 2 + 8)}" font-family="${MONO}" font-size="22" fill="${accent}">${prefix}</text>`)
  const digitX = 20 + prefix.length * 13.24
  for (let d = 0; d < 10; d += 1) {
    const values = Array.from({ length: 10 }, (_, i) => (i === d ? 1 : 0)).join(";")
    out.push(
      `<text x="${r(digitX)}" y="${r(h / 2 + 8)}" font-family="${MONO}" font-size="22" fill="${accent}" opacity="0">${d}<animate attributeName="opacity" values="${values}" dur="10s" calcMode="discrete" repeatCount="indefinite"/></text>`
    )
  }
  out.push(`<text x="20" y="${r(h / 2 + 30)}" font-family="${MONO}" font-size="11" fill="${MUTED}">${caption}</text>`)
  return out.join("")
}

/** Rank bars `[=====-----]` that grow, looping. */
function rankContent(w, h, accent) {
  const rows = [
    ["/docs", 1, "12,400"],
    ["/install", 0.34, "4,100"],
    ["/plot", 0.08, "860"],
  ]
  const out = [frame(w, h, "ROUTES", { accent })]
  const ticks = 14
  const x0 = 78
  const tw = (w - x0 - 70) / ticks
  rows.forEach(([label, value, shown], ri) => {
    const y = 36 + ri * 24
    out.push(`<text x="16" y="${y + 4}" font-family="${MONO}" font-size="10.5" fill="${TEXT}">${label}</text>`)
    out.push(`<text x="${x0 - 8}" y="${y + 4}" font-family="${MONO}" font-size="10.5" fill="${LINE}" opacity=".6">[</text>`)
    const filled = Math.max(1, Math.round(value * ticks))
    for (let t = 0; t < ticks; t += 1) {
      const x = r(x0 + t * tw)
      if (t < filled) {
        out.push(
          `<text x="${x}" y="${y + 4}" font-family="${MONO}" font-size="10.5" fill="${accent}" opacity="0">=<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.9;1" dur="5s" begin="${r(t * 0.08 + ri * 0.3)}s" repeatCount="indefinite"/></text>`
        )
      } else {
        out.push(`<text x="${x}" y="${y + 4}" font-family="${MONO}" font-size="10.5" fill="${LINE}" opacity=".35">-</text>`)
      }
    }
    out.push(`<text x="${r(x0 + ticks * tw)}" y="${y + 4}" font-family="${MONO}" font-size="10.5" fill="${LINE}" opacity=".6">]</text>`)
    out.push(`<text x="${w - 14}" y="${y + 4}" font-family="${MONO}" font-size="10.5" fill="${MUTED}" text-anchor="end">${shown}</text>`)
  })
  return out.join("")
}

/** Sparkline columns that rise and fall. */
function sparkContent(w, h, accent, title = "LATENCY") {
  const data = [2, 3, 4, 3, 6, 5, 8, 7, 9, 6, 10, 8, 11]
  const out = [frame(w, h, title, { accent })]
  const max = Math.max(...data)
  const cw = (w - 40) / data.length
  data.forEach((value, i) => {
    const full = (value / max) * (h - 56)
    const x = r(20 + i * cw)
    const live = i === data.length - 1
    out.push(
      `<rect x="${x}" y="${r(h - 22 - full)}" width="${r(cw - 4)}" height="${r(full)}" fill="${live ? accent : LINE}" opacity="${live ? 1 : 0.45}"><animate attributeName="height" values="0;${r(full)};${r(full)};0" keyTimes="0;.15;.85;1" dur="5s" begin="${r(i * 0.06)}s" repeatCount="indefinite"/><animate attributeName="y" values="${h - 22};${r(h - 22 - full)};${r(h - 22 - full)};${h - 22}" keyTimes="0;.15;.85;1" dur="5s" begin="${r(i * 0.06)}s" repeatCount="indefinite"/></rect>`
    )
  })
  return out.join("")
}

/** Timeline dots with a moving "now". */
function timelineContent(w, h, accent) {
  const events = [
    ["14:02", "p95 crossed 800ms"],
    ["14:11", "rolled back the flag"],
    ["14:40", "write the postmortem"],
  ]
  const out = [frame(w, h, "NIGHT", { accent })]
  events.forEach(([date, label], i) => {
    const y = 34 + i * 28
    const values = [0, 1, 2].map((k) => (k === i ? accent : i < k ? TEXT : MUTED))
    out.push(`<text x="18" y="${y + 4}" font-family="${MONO}" font-size="11" fill="${TEXT}">${i === 2 ? "○" : "●"}<animate attributeName="fill" values="${values.join(";")}" dur="6s" calcMode="discrete" repeatCount="indefinite"/></text>`)
    out.push(`<text x="38" y="${y + 4}" font-family="${MONO}" font-size="11" fill="${TEXT}">${date}</text>`)
    out.push(`<text x="92" y="${y + 4}" font-family="${MONO}" font-size="11" fill="${TEXT}">${label}<animate attributeName="fill" values="${values.join(";")}" dur="6s" calcMode="discrete" repeatCount="indefinite"/></text>`)
    if (i < events.length - 1) out.push(`<text x="20" y="${y + 18}" font-family="${MONO}" font-size="10" fill="${LINE}" opacity=".5">│</text>`)
  })
  return out.join("")
}

/** A projected, floating tile with its shadow. */
function tile(o, box, content, colors, { float = "", ground = 0 } = {}) {
  const { x, y, z, w, h, t = 10 } = box
  return `
    <g class="breathe ${float.replace("float", "").trim()}">${shadow(o, { x: x + 6, y: y + 10, w, h }, ground, "soft", 0.55)}</g>
    <g class="${float}">
      ${slab(o, { x, y, z, w, h, t }, { top: INK, right: colors.right, left: colors.left })}
      <g transform="${plane(o, x, y, z)}">
        <rect width="${w}" height="${h}" fill="${INK}"/>
        ${content(w, h, colors.accent)}
      </g>
      <polygon points="${pts([P(o, x, y, z), P(o, x + w, y, z), P(o, x + w, y + h, z), P(o, x, y + h, z)])}" fill="none" stroke="${colors.accent}" stroke-opacity=".25"/>
    </g>`
}

/* ---- 1. hero --------------------------------------------------------- */

function hero() {
  const W = 1280
  const H = 640
  const o = [930, 150]
  const body = `
    ${isoGrid(W, H)}
    <ellipse cx="960" cy="320" rx="300" ry="290" fill="url(#glowBlue)"/>
    <ellipse cx="300" cy="470" rx="280" ry="160" fill="url(#glowPurple)"/>
    <ellipse cx="760" cy="110" rx="200" ry="100" fill="url(#glowPink)"/>
    ${particles(W, H, 30, 7, [40, 600])}

    <!-- the note: an Obsidian slab -->
    ${shadow(o, { x: 0, y: 40, w: 330, h: 300 }, -30, "softer", 0.6)}
    ${slab(o, { x: 0, y: 40, z: 0, w: 330, h: 300, t: 22 }, { top: THEME.note[0], right: THEME.note[1], left: THEME.note[2] })}
    <g transform="${plane(o, 0, 40, 0)}">
      <rect x="18" y="18" width="294" height="264" fill="none" stroke="${PURPLE}" stroke-opacity=".35" stroke-dasharray="2 6"/>
      ${Array.from({ length: 9 }, (_, i) => `<rect x="36" y="${44 + i * 24}" width="${[200, 160, 230, 120, 210, 180, 90, 200, 140][i]}" height="5" rx="2.5" fill="${PURPLE}" opacity=".18"/>`).join("")}
    </g>

    ${tile(o, { x: 128, y: 250, z: 40, w: 205, h: 94, t: 8 }, rankContent, { accent: AMBER, right: AMBER_D, left: AMBER_L }, { float: "float d2", ground: 0 })}
    ${tile(o, { x: 22, y: 64, z: 74, w: 290, h: 150, t: 9 }, ganttContent, { accent: BLUE, right: BLUE_D, left: BLUE_L }, { float: "float", ground: 0 })}
    ${tile(o, { x: -80, y: 262, z: 215, w: 200, h: 92, t: 8 }, timerContent, { accent: PINK, right: PINK_D, left: PINK_L }, { float: "float d1", ground: 0 })}

    <!-- left: words -->
    <g font-family="${SANS}">
      <text x="72" y="168" font-family="${MONO}" font-size="15" letter-spacing="4" fill="${BLUE}">OBSIDIAN PLUGIN</text>
      <text x="68" y="262" font-size="104" font-weight="800" fill="${TEXT}" letter-spacing="-3">MDXCN</text>
      <text x="72" y="318" font-size="27" fill="${TAGLINE}">mdxcn.dev's framed text figures,</text>
      <text x="72" y="354" font-size="27" fill="${TAGLINE}">native in your notes.</text>
    </g>
    <g font-family="${MONO}" font-size="14">
      ${[
        ["46 components", BLUE],
        ["ASCII", AMBER],
        ["MDX", GREEN],
        ["Comark", PINK],
      ]
        .map(([label, color], i, all) => {
          const x = 72 + all.slice(0, i).reduce((sum, [l]) => sum + l.length * 8.6 + 44, 0)
          const w = label.length * 8.6 + 30
          return `<g transform="translate(${r(x)} 404)"><rect width="${r(w)}" height="34" rx="6" fill="${color}" fill-opacity=".08" stroke="${color}" stroke-opacity=".7" stroke-dasharray="2 4"/><text x="15" y="22" fill="${color}">${label}</text></g>`
        })
        .join("")}
    </g>
    <g font-family="${MONO}" font-size="14" fill="${MUTED}">
      <text x="72" y="492">\`\`\`mdx</text>
      <text x="72" y="516">+--- [ LAUNCH ] ---+   <tspan fill="${BLUE}">→ renders</tspan></text>
      <text x="72" y="540">\`\`\`</text>
    </g>`
  return svg(W, H, body, { title: "MDXCN for Obsidian — mdxcn.dev's framed text figures, native in your notes" })
}

/* ---- 2. pipeline: paste ASCII → figure -------------------------------- */

function pipeline() {
  const W = 1280
  const H = 440
  const left = [262, 92]
  const right = [940, 96]
  const ascii = [
    "+---------- [ LAUNCH ] ----------+",
    "|                                |",
    "| design  ████████------------   |",
    "| build   ---███████░░░░░------  |",
    "| docs    -----------██░░░░░--   |",
    "| ship    ----------------████   |",
    "|         q1    q2    q3    q4   |",
    "|                                |",
    "+--------------------------------+",
  ]
  const asciiText = (w, h) =>
    [
      `<text x="14" y="18" font-family="${MONO}" font-size="10" fill="${MUTED}">\`\`\`mdx</text>`,
      ...ascii.map((line, i) => {
        const begin = r(i * 0.18 - 1.5)
        return `<text x="14" y="${36 + i * 13}" font-family="${MONO}" font-size="10" fill="${i === 0 || i === ascii.length - 1 ? AMBER : TEXT}" opacity="0" xml:space="preserve">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.06;.92;1" dur="7s" begin="${begin}s" repeatCount="indefinite"/></text>`
      }),
      `<text x="14" y="${36 + ascii.length * 13 + 4}" font-family="${MONO}" font-size="10" fill="${MUTED}">\`\`\`</text>`,
    ].join("")

  const body = `
    ${isoGrid(W, H, 34, 0.045)}
    <ellipse cx="300" cy="260" rx="280" ry="170" fill="url(#glowPurple)"/>
    <ellipse cx="980" cy="240" rx="280" ry="190" fill="url(#glowBlue)"/>
    ${particles(W, H, 18, 3)}

    ${tile(left, { x: 0, y: 0, z: 40, w: 290, h: 190, t: 12 }, (w, h) => `<rect width="${w}" height="${h}" fill="${CARD}"/>${asciiText(w, h)}`, { accent: AMBER, right: AMBER_D, left: AMBER_L }, { float: "float", ground: -20 })}
    ${tile(right, { x: 0, y: 0, z: 40, w: 310, h: 160, t: 12 }, ganttContent, { accent: BLUE, right: BLUE_D, left: BLUE_L }, { float: "float d2", ground: -20 })}

    <!-- the beam -->
    <g>
      <path d="M 470 262 C 560 222, 650 222, 742 254" fill="none" stroke="${LINE}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="3 7"/>
      <circle r="5" fill="${BLUE}" filter="url(#glow)"><animateMotion dur="2.4s" repeatCount="indefinite" path="M 470 262 C 560 222, 650 222, 742 254"/></circle>
      <circle r="3" fill="${AMBER}" filter="url(#glow)"><animateMotion dur="2.4s" begin="-1.2s" repeatCount="indefinite" path="M 470 262 C 560 222, 650 222, 742 254"/></circle>
      <text x="606" y="210" text-anchor="middle" font-family="${MONO}" font-size="13" fill="${TEXT}">MDXCN</text>
      <text x="606" y="288" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${MUTED}">detect · parse · render</text>
    </g>

    <g font-family="${MONO}" font-size="13">
      <text x="262" y="402" text-anchor="middle" fill="${AMBER}">paste the official ASCII</text>
      <text x="960" y="402" text-anchor="middle" fill="${BLUE}">get the live figure</text>
    </g>`
  return svg(W, H, body, { title: "Paste the official mdxcn ASCII, get the live figure" })
}

/* ---- 3. syntaxes: four ways in -------------------------------------- */

function syntaxes() {
  const W = 1280
  const H = 470
  const cards = [
    { label: "ASCII", color: AMBER, dark: AMBER_D, deep: AMBER_L, lines: ["+--- [ NIGHT ] ---+", "| ●  14:02  p95    |", "| │                |", "| ●  14:11  rollback|", "+------------------+"] },
    { label: "MDX", color: GREEN, dark: GREEN_D, deep: GREEN_L, lines: ['<GraphTimeline', '  title="NIGHT">', "- 14:02: p95", "- **14:11: rollback**", "</GraphTimeline>"] },
    { label: "Comark", color: PINK, dark: PINK_D, deep: PINK_L, lines: ["::graph-timeline", "---", "title: NIGHT", "---", "- **14:11: rollback**"] },
    { label: "Short", color: TEAL, dark: TEAL_D, deep: TEAL_L, lines: ["```mdx timeline", "- 14:02: p95", "- **14:11: rollback**", "```", ""] },
  ]
  const parts = []
  cards.forEach((card, i) => {
    const o = [170 + i * 150, 120 + i * 40]
    const content = (w, h) =>
      [
        `<rect width="${w}" height="${h}" fill="${CARD}"/>`,
        `<text x="12" y="16" font-family="${MONO}" font-size="9" letter-spacing="1" fill="${card.color}">${card.label.toUpperCase()}</text>`,
        ...card.lines.map((line, k) => `<text x="12" y="${34 + k * 14}" font-family="${MONO}" font-size="9.5" fill="${TEXT}" xml:space="preserve">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`),
      ].join("")
    parts.push(tile(o, { x: 0, y: 0, z: 30, w: 170, h: 110, t: 8 }, content, { accent: card.color, right: card.dark, left: card.deep }, { float: `float d${i % 4}`, ground: -10 }))
  })
  const target = [1020, 200]
  const merge = cards
    .map((card, i) => {
      // From each card's right corner to the figure's left corner.
      const from = [317 + i * 150, 175 + i * 40]
      const path = `M ${from[0]} ${from[1]} C ${from[0] + 120} ${from[1] + 70}, 820 290, 912 220`
      return `<path d="${path}" fill="none" stroke="${card.color}" stroke-opacity=".3" stroke-width="1.6" stroke-dasharray="3 6"/><circle r="4" fill="${card.color}" filter="url(#glow)"><animateMotion dur="3s" begin="${-i * 0.75}s" repeatCount="indefinite" path="${path}"/></circle>`
    })
    .join("")
  const body = `
    ${isoGrid(W, H, 34, 0.045)}
    <ellipse cx="420" cy="300" rx="400" ry="160" fill="url(#glowPurple)"/>
    <ellipse cx="1040" cy="280" rx="220" ry="180" fill="url(#glowBlue)"/>
    ${particles(W, H, 16, 11)}
    ${merge}
    ${parts.join("")}
    ${tile(target, { x: 0, y: 0, z: 46, w: 250, h: 120, t: 12 }, timelineContent, { accent: BLUE, right: BLUE_D, left: BLUE_L }, { float: "float d1", ground: -20 })}
    <g font-family="${MONO}" font-size="13">
      <text x="430" y="436" text-anchor="middle" fill="${MUTED}">four ways to write it — all official mdxcn syntaxes</text>
      <text x="1080" y="436" text-anchor="middle" fill="${BLUE}">one figure</text>
    </g>`
  return svg(W, H, body, { title: "ASCII, MDX, Comark or the short form: one figure" })
}

/* ---- 4. catalog: the component families as cubes --------------------- */

function catalog() {
  const W = 1280
  const H = 600
  const groups = [
    { name: "Content", count: 12, color: PURPLE, dark: PURPLE_D, deep: PURPLE_L, glyph: "≡", items: "callout · quote · steps · faq" },
    { name: "Data", count: 9, color: GREEN, dark: GREEN_D, deep: GREEN_L, glyph: "▤", items: "table · sheet · invoice · kpi" },
    { name: "Charts", count: 16, color: AMBER, dark: AMBER_D, deep: AMBER_L, glyph: "▆", items: "rank · funnel · plot · heatmap" },
    { name: "Diagrams", count: 6, color: BLUE, dark: BLUE_D, deep: BLUE_L, glyph: "├", items: "gantt · flow · tree · board" },
    { name: "Time", count: 3, color: PINK, dark: PINK_D, deep: PINK_L, glyph: "◷", items: "timer · countdown · calendar" },
    { name: "Frame", count: 1, color: TEAL, dark: TEAL_D, deep: TEAL_L, glyph: "+", items: "any Markdown, framed" },
  ]
  const cubes = groups
    .map((group, i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      const o = [170 + col * 390, 150 + row * 230]
      const size = 92
      const height = 30 + group.count * 4
      const top = (w, h) =>
        [
          `<rect width="${w}" height="${h}" fill="${group.color}" fill-opacity=".14"/>`,
          `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${group.color}" stroke-opacity=".7" stroke-dasharray="2 4"/>`,
          `<text x="${w / 2}" y="${h / 2 + 12}" text-anchor="middle" font-family="${MONO}" font-size="34" fill="${group.color}">${group.glyph}</text>`,
        ].join("")
      return `
        <g class="breathe d${i % 4}">${shadow(o, { x: 8, y: 14, w: size, h: size }, 0, "soft", 0.6)}</g>
        <g class="float d${i % 4}">
          ${slab(o, { x: 0, y: 0, z: height, w: size, h: size, t: height }, { top: INK, right: group.dark, left: group.deep })}
          <g transform="${plane(o, 0, 0, height)}">${top(size, size)}</g>
          <g font-family="${MONO}">
            <text x="${o[0] + 104}" y="${o[1] + 40}" font-size="22" fill="${TEXT}" font-family="${SANS}" font-weight="700">${group.name}</text>
            <text x="${o[0] + 104}" y="${o[1] + 66}" font-size="13" fill="${group.color}">${group.count} component${group.count > 1 ? "s" : ""}</text>
            <text x="${o[0] + 104}" y="${o[1] + 88}" font-size="11" fill="${MUTED}">${group.items}</text>
          </g>
        </g>`
    })
    .join("")
  const body = `
    ${isoGrid(W, H, 34, 0.04)}
    <ellipse cx="640" cy="300" rx="560" ry="280" fill="url(#glowBlue)" opacity=".7"/>
    ${particles(W, H, 20, 5)}
    ${cubes}`
  return svg(W, H, body, { title: "47 components in six families" })
}

/* ---- 5. accent: the contrast color setting --------------------------- */

function accent() {
  const W = 1280
  const H = 420
  const presets = [BLUE, AMBER, GREEN, TEAL, THEME.red, THEME.orange, PURPLE, PINK]
  const dur = 16
  const cycle = [...presets, presets[0]]
  const fillAnim = `<animate attributeName="fill" values="${cycle.join(";")}" dur="${dur}s" calcMode="discrete" repeatCount="indefinite"/>`
  const o = [740, 96]
  const swatches = presets
    .map((color, i) => {
      const x = 120 + i * 58
      const on = cycle.map((_, k) => (k % presets.length === i ? 1 : 0.28)).join(";")
      const ring = cycle.map((_, k) => (k % presets.length === i ? 1 : 0)).join(";")
      return `<circle cx="${x}" cy="252" r="17" fill="${color}"><animate attributeName="opacity" values="${on}" dur="${dur}s" calcMode="discrete" repeatCount="indefinite"/></circle><circle cx="${x}" cy="252" r="23" fill="none" stroke="${TEXT}" stroke-width="2" opacity="0"><animate attributeName="opacity" values="${ring}" dur="${dur}s" calcMode="discrete" repeatCount="indefinite"/></circle>`
    })
    .join("")
  const body = `
    ${isoGrid(W, H, 34, 0.045)}
    <radialGradient id="glowAccent" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${BLUE}" stop-opacity="${r(0.42 * THEME.glowScale)}"><animate attributeName="stop-color" values="${cycle.join(";")}" dur="${dur}s" calcMode="discrete" repeatCount="indefinite"/></stop><stop offset="1" stop-color="${BLUE}" stop-opacity="0"/></radialGradient>
    <ellipse cx="920" cy="240" rx="330" ry="170" fill="url(#glowAccent)"/>
    ${particles(W, H, 12, 9, [60, 640])}
    <g font-family="${SANS}">
      <text x="96" y="122" font-family="${MONO}" font-size="14" letter-spacing="3" fill="${MUTED}">SETTINGS → CONTRAST COLOR</text>
      <text x="94" y="182" font-size="44" font-weight="800" fill="${TEXT}">Your accent, everywhere.</text>
    </g>
    ${swatches}
    <text x="96" y="320" font-family="${MONO}" font-size="13" fill="${MUTED}">presets · Obsidian accent · custom light &amp; dark · mono / duo / multi palettes</text>
    ${tile(o, { x: 0, y: 0, z: 40, w: 290, h: 150, t: 10 }, (w, h) => ganttContent(w, h, BLUE, 8, fillAnim), { accent: BLUE, right: THEME.neutral[0], left: THEME.neutral[1] }, { float: "float", ground: -16 })}`
  return svg(W, H, body, { title: "Pick the contrast color in the settings" })
}

/* ---- 6. divider: a dashed rule with + corners ------------------------ */

function divider() {
  const W = 1280
  const H = 28
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="divider">
  <style>.run { animation: run 2.4s linear infinite } @keyframes run { to { stroke-dashoffset: -14 } } @media (prefers-reduced-motion: reduce) { .run { animation: none } }</style>
  <line class="run" x1="24" y1="14" x2="${W - 24}" y2="14" stroke="${LINE}" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="2 5"/>
  <text x="12" y="19" font-family="${MONO}" font-size="16" fill="${LINE}" opacity=".7">+</text>
  <text x="${W - 22}" y="19" font-family="${MONO}" font-size="16" fill="${LINE}" opacity=".7">+</text>
</svg>
`
}

// Drop the single-theme files from earlier builds.
for (const name of readdirSync(OUT)) if (/^(hero|pipeline|syntaxes|catalog|accent|divider)\.svg$/.test(name)) unlinkSync(join(OUT, name))

for (const theme of ["light", "dark"]) {
  useTheme(theme)
  const files = { hero: hero(), pipeline: pipeline(), syntaxes: syntaxes(), catalog: catalog(), accent: accent(), divider: divider() }
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(OUT, `${name}-${theme}.svg`), content)
    console.log(`docs/assets/${name}-${theme}.svg  ${(content.length / 1024).toFixed(1)} kB`)
  }
}
