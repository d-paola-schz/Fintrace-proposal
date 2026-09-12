import { useId, useState } from 'react'
import type { DayBalance, ScenarioResult } from '../types/contracts'
import { daysBetween, shortDate, usd, usdCompact } from '../lib/format'

const PLAN = '#2563eb'
const WHAT_IF = '#7c3aed'
const RESERVE = '#ad4318'

const SMALL = { w: 244, h: 118, head: 50, pad: { l: 12, r: 12, t: 6, b: 10 } }
const LARGE = { w: 568, h: 330, head: 84, pad: { l: 54, r: 18, t: 12, b: 26 } }

/**
 * The cash graph, as a corner widget instead of a band across the timeline.
 *
 * Drawn inside the timeline, the graph competed with the rail, the chains and
 * the what-if for the same strip of screen. Here it stays small until it is
 * asked for — hovered, focused or tapped — and then opens with its axes, the
 * reserve and where each path bottoms out. Every point is an engine output;
 * nothing here is interpolated beyond joining one day's close to the next.
 */
export function CashWidget({
  plan,
  whatIf,
  whatIfLabel,
  receded = false,
}: {
  plan: ScenarioResult
  whatIf: ScenarioResult | null
  whatIfLabel?: string
  /** A chain holds the camera: step back so it does not sit on the chain, until asked for. */
  receded?: boolean
}) {
  const [open, setOpen] = useState(false)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const S = open ? LARGE : SMALL

  const planDays = plan.days ?? []
  const wDays = whatIf?.days ?? []
  if (planDays.length === 0) return null

  const chartW = S.w
  const chartH = S.h - S.head
  const { l, r, t, b } = S.pad
  const innerW = chartW - l - r
  const innerH = chartH - t - b

  const start = planDays[0].date
  const last = [...planDays, ...wDays].reduce((m, d) => (d.date > m ? d.date : m), start)
  const span = Math.max(1, daysBetween(start, last))
  const xOf = (iso: string) => l + (daysBetween(start, iso) / span) * innerW

  const reserve = (whatIf ?? plan).reserveCents
  const values = [...planDays, ...wDays].map((d) => d.closingCents).concat(reserve)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max(1, hi - lo) * 0.12
  const yOf = (cents: number) => t + innerH - ((cents - (lo - pad)) / (hi - lo + pad * 2)) * innerH

  const line = (days: DayBalance[]) =>
    days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(d.date).toFixed(1)} ${yOf(d.closingCents).toFixed(1)}`).join(' ')

  const lead = whatIf ?? plan
  const leadDays = whatIf ? wDays : planDays
  const breach = leadDays.filter((d) => d.closingCents < reserve)

  const yTicks = [hi, (hi + lo) / 2, lo]
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => {
    const i = Math.round(f * (planDays.length - 1))
    return planDays[i].date
  })

  const summary =
    `Projected cash. Your plan's lowest is ${usd(plan.lowestCents)} on ${shortDate(plan.lowestDate)}.` +
    (whatIf
      ? ` With the what-if, the lowest is ${usd(whatIf.lowestCents)} on ${shortDate(whatIf.lowestDate)}.`
      : '') +
    ` Reserve ${usd(reserve)}.`

  return (
    <div
      role="figure"
      tabIndex={0}
      aria-label={summary}
      aria-expanded={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
      className="absolute bottom-4 left-4 z-30 overflow-hidden rounded-xl border border-hair bg-white/95 shadow-[0_10px_30px_-12px_rgba(15,23,38,0.35)] backdrop-blur"
      style={{
        width: S.w,
        height: S.h,
        opacity: receded && !open ? 0.35 : 1,
        transition:
          'width 240ms cubic-bezier(0.22,0.61,0.36,1), height 240ms cubic-bezier(0.22,0.61,0.36,1), opacity 300ms ease',
      }}
    >
      <div className="px-3 pt-2.5" style={{ height: S.head }}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            Projected cash
          </p>
          {!open && <p className="text-[10px] text-muted">hover to open</p>}
        </div>

        {open ? (
          <>
            <p className="mt-0.5 text-[11px] leading-snug text-[#3d4757]">
              Each day's closing balance from today's opening balance, against your{' '}
              <span className="tnum">{usd(reserve)}</span> reserve. Calculated here from the
              sources and assumptions listed under Data &amp; assumptions.
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Legend colour={PLAN} faded={!!whatIf} label="Your plan"
                value={`low ${usd(plan.lowestCents)} on ${shortDate(plan.lowestDate)}`} />
              {whatIf && (
                <Legend colour={WHAT_IF} label={whatIfLabel ? `What-if · ${whatIfLabel}` : 'What-if'}
                  value={`low ${usd(whatIf.lowestCents)} on ${shortDate(whatIf.lowestDate)}`} />
              )}
            </div>
          </>
        ) : (
          <div className="mt-1 flex items-center gap-3">
            <Legend colour={PLAN} faded={!!whatIf} label="Plan" value={usdCompact(plan.lowestCents)} compact />
            {whatIf && (
              <Legend colour={WHAT_IF} label="What-if" value={usdCompact(whatIf.lowestCents)} compact />
            )}
          </div>
        )}
      </div>

      <svg width={chartW} height={chartH} aria-hidden className="block">
        <defs>
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={whatIf ? WHAT_IF : PLAN} stopOpacity={0.16} />
            <stop offset="100%" stopColor={whatIf ? WHAT_IF : PLAN} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {open &&
          yTicks.map((v, i) => (
            <g key={`y-${i}`}>
              <line x1={l} x2={chartW - r} y1={yOf(v)} y2={yOf(v)} stroke="#1b2b4b" opacity={0.06} />
              <text x={l - 6} y={yOf(v) + 3.5} textAnchor="end" fontSize={10} fill="#7a8598" className="tnum">
                {usdCompact(v)}
              </text>
            </g>
          ))}
        {open &&
          xTicks.map((iso, i) => (
            <text key={`x-${i}`} x={xOf(iso)} y={chartH - 8} fontSize={10} fill="#7a8598" className="tnum"
              textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>
              {shortDate(iso)}
            </text>
          ))}

        {breach.length > 0 && (
          <rect x={xOf(breach[0].date)} y={t}
            width={Math.max(2, xOf(breach[breach.length - 1].date) - xOf(breach[0].date))}
            height={innerH} fill={RESERVE} opacity={0.08} />
        )}

        <path d={`${line(leadDays)} L ${xOf(leadDays[leadDays.length - 1].date)} ${t + innerH} L ${xOf(leadDays[0].date)} ${t + innerH} Z`}
          fill={`url(#fill-${uid})`} />

        <line x1={l} x2={chartW - r} y1={yOf(reserve)} y2={yOf(reserve)} stroke={RESERVE}
          strokeWidth={1.2} strokeDasharray="4 3" opacity={0.85} />
        {open && (
          <text x={chartW - r} y={yOf(reserve) - 4} textAnchor="end" fontSize={10} fill={RESERVE} className="tnum">
            Reserve {usd(reserve)}
          </text>
        )}

        <path d={line(planDays)} fill="none" stroke={PLAN} strokeWidth={open ? 2 : 1.6}
          opacity={whatIf ? 0.5 : 1} strokeLinejoin="round" />
        {whatIf && (
          <path d={line(wDays)} fill="none" stroke={WHAT_IF} strokeWidth={open ? 2.6 : 2} strokeLinejoin="round" />
        )}

        <circle cx={xOf(plan.lowestDate)} cy={yOf(plan.lowestCents)} r={open ? 3.6 : 2.6} fill="#fff"
          stroke={PLAN} strokeWidth={2} opacity={whatIf ? 0.7 : 1} />
        {whatIf && (
          <circle cx={xOf(whatIf.lowestDate)} cy={yOf(whatIf.lowestCents)} r={open ? 4.2 : 3} fill="#fff"
            stroke={WHAT_IF} strokeWidth={2.4} />
        )}
        {open && (
          <text x={xOf(lead.lowestDate)} y={Math.min(t + innerH - 2, yOf(lead.lowestCents) + 16)}
            textAnchor="middle" fontSize={10} fontWeight={600} fill={whatIf ? WHAT_IF : PLAN} className="tnum">
            {usd(lead.lowestCents)} · {shortDate(lead.lowestDate)}
          </text>
        )}
      </svg>
    </div>
  )
}

function Legend({
  colour, label, value, faded, compact,
}: {
  colour: string; label: string; value: string; faded?: boolean; compact?: boolean
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="h-[3px] w-4 shrink-0 rounded" style={{ background: colour, opacity: faded ? 0.5 : 1 }} />
      <span className={`truncate ${compact ? 'text-[11px]' : 'text-[11px] font-medium'} text-[#3d4757]`}>
        {label}
      </span>
      <span className={`tnum shrink-0 font-semibold text-ink ${compact ? 'text-[12px]' : 'text-[11px]'}`}>
        {value}
      </span>
    </span>
  )
}
