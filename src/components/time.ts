/*
 * Live clocks: Timer (elapsed since, time ago, local clock) and Countdown.
 * They tick every second while the note is open.
 */

import { cx, div, el, rise, sr } from "../dom"
import { T, tone } from "../glyphs"
import { flat, optStr, splitDash } from "../parse/inline"
import { sourceOf } from "../parse/md"
import type { Common, Spec } from "../types"
import { base } from "./shared"

export function parseInstant(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN
  const text = String(value ?? "").trim()
  if (!text) return Number.NaN
  if (/^\d{10,13}$/.test(text)) return Number(text.length === 10 ? Number(text) * 1000 : text)
  // `2026-08-27 08:00` → ISO with a T so every engine reads it as local time.
  const normalized = text.replace(/^(\d{4}-\d{2}-\d{2})[ ](\d{1,2}:\d{2})/, "$1T$2")
  return Date.parse(normalized)
}

const pad2 = (value: number) => String(Math.trunc(value)).padStart(2, "0")

export function formatHms(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400)
  const clock = `${pad2((total % 86400) / 3600)}:${pad2((total % 3600) / 60)}:${pad2(total % 60)}`
  return days > 0 ? `${days}d ${clock}` : clock
}

export function formatAgo(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatClock(ms: number) {
  const date = new Date(ms)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function writtenInstant(blocks: Parameters<Spec["read"]>[0]["blocks"], body: string) {
  return splitDash(flat(blocks.length > 0 ? sourceOf(blocks) : body))
}

/* ---- Timer ------------------------------------------------------------ */

type TimerKind = "elapsed" | "ago" | "clock"
interface TimerData extends Common {
  kind: TimerKind
  at?: string
  caption?: string
}

export const timer: Spec<TimerData> = {
  slug: "graph-timer",
  tag: "GraphTimer",
  name: "Timer",
  aliases: ["timer", "graph-timer", "elapsed", "since", "clock", "stopwatch", "incident"],
  group: "time",
  summary: "Uptime, time since the last deploy or incident, or a clock in the corner.",
  notFor: "Time left until a date is Countdown. A static number is Stat.",
  read({ props, blocks, body }) {
    const written = writtenInstant(blocks, body)
    const raw = optStr(props.kind)
    const kind: TimerKind = raw === "ago" || raw === "clock" ? raw : written.label.toLowerCase() === "clock" || written.label.toLowerCase() === "now" ? "clock" : "elapsed"
    return {
      ...base(props, "timer"),
      kind,
      at: optStr(props.at) ?? (written.label || undefined),
      caption: optStr(props.caption) ?? (written.rest || undefined),
    }
  },
  render(d, ctx) {
    const box = rise(div(ctx.body, "mdxcn-stack-2"))
    const value = el(box, "p", cx("mdxcn-big mdxcn-num", tone(ctx.palette, "primary")))
    if (d.caption) el(box, "p", T.muted, d.caption)
    const spoken = sr(ctx.body, "")
    const origin = d.at == null ? Number.NaN : parseInstant(d.at)
    ctx.every(1000, () => {
      const now = ctx.now()
      let text = d.kind === "ago" ? "0s ago" : "00:00:00"
      if (d.kind === "clock") text = formatClock(now)
      else if (Number.isFinite(origin)) text = d.kind === "ago" ? formatAgo(Math.max(0, now - origin)) : formatHms(Math.max(0, now - origin))
      value.setText(text)
      spoken.setText(d.kind === "clock" ? `local time ${text}` : d.kind === "ago" ? text : `elapsed ${text}`)
    })
  },
  ascii(d) {
    const at = d.kind === "clock" ? "clock" : (d.at ?? "")
    return [d.caption ? `${at} — ${d.caption}` : at]
  },
  template: { title: "INCIDENT", body: "2026-08-27T08:00:00Z — api" },
}

/* ---- Countdown -------------------------------------------------------- */

interface CountdownData extends Common {
  to?: string
  done: string
  caption?: string
}

export const countdown: Spec<CountdownData> = {
  slug: "graph-countdown",
  tag: "GraphCountdown",
  name: "Countdown",
  aliases: ["countdown", "graph-countdown", "until", "deadline", "freeze", "launch-timer"],
  group: "time",
  summary: "A freeze, a launch, or a window that closes.",
  notFor: "Elapsed time since a start is Timer.",
  read({ props, blocks, body }) {
    const written = writtenInstant(blocks, body)
    return {
      ...base(props, "countdown"),
      to: optStr(props.to) ?? (written.label || undefined),
      done: optStr(props.done) ?? "done",
      caption: optStr(props.caption) ?? (written.rest || undefined),
    }
  },
  render(d, ctx) {
    const box = rise(div(ctx.body, "mdxcn-stack-2"))
    const value = el(box, "p", "mdxcn-big mdxcn-num")
    if (d.caption) el(box, "p", T.muted, d.caption)
    const spoken = sr(ctx.body, "")
    const target = d.to ? parseInstant(d.to) : Number.NaN
    ctx.every(1000, () => {
      const remaining = Number.isFinite(target) ? target - ctx.now() : null
      const finished = remaining != null && remaining <= 0
      const text = remaining == null ? "00:00:00" : finished ? d.done : formatHms(remaining)
      value.setText(text)
      value.toggleClass(T.muted, finished)
      value.toggleClass(tone(ctx.palette, "primary"), !finished)
      spoken.setText(finished ? d.done : `remaining ${text}`)
    })
  },
  ascii(d) {
    return [d.caption ? `${d.to ?? ""} — ${d.caption}` : (d.to ?? "")]
  },
  template: { title: "FREEZE", props: { done: "open" }, body: "2027-01-01T00:00:00Z — until launch" },
}

export const TIME = [timer, countdown]
