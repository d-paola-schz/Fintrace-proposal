import type { ScenarioResult } from '../types/contracts'
import { shortDate, usd } from '../lib/format'

export const BAND_H = 88

const NOW_COLOUR = '#2563eb'
const SPEND_COLOUR = '#7c3aed'
const RESERVE_COLOUR = '#a35b2a'

/**
 * Both cash paths, drawn inside the timeline on the same date axis: where the
 * money goes if nothing changes, and where it goes with the proposed spend.
 * The filled area between them is the cost of the decision, shown rather than
 * described, and the stretch where the proposed path falls under the reserve
 * is called out on the spot.
 */
export function CashComparison({
  scenario,
  x,
  top,
}: {
  scenario: ScenarioResult
  /** the timeline's own date scale, so the two views line up exactly */
  x: (iso: string) => number
  top: number
}) {
  const without = scenario.withoutProposal
  if (!without || !scenario.proposal) return null

  const withDays = scenario.days ?? []
  const nowDays = without.days ?? []
  if (withDays.length === 0 || nowDays.length === 0) return null

  const reserve = scenario.reserveCents
  const values = [
    ...withDays.map((d) => d.closingCents),
    ...nowDays.map((d) => d.closingCents),
    reserve,
  ]
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = Math.max(1, hi - lo)
  const pad = span * 0.14
  const yOf = (cents: number) =>
    top + BAND_H - ((cents - (lo - pad)) / (span + pad * 2)) * BAND_H

  const line = (days: typeof withDays) =>
    days.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.date)} ${yOf(d.closingCents)}`).join(' ')

  // The gap between the two paths, closed into a fillable shape.
  const area =
    line(nowDays) +
    ' ' +
    withDays
      .slice()
      .reverse()
      .map((d) => `L ${x(d.date)} ${yOf(d.closingCents)}`)
      .join(' ') +
    ' Z'

  const breachDays = withDays.filter((d) => d.closingCents < reserve)
  const lowWith = withDays.reduce((a, b) => (b.closingCents < a.closingCents ? b : a), withDays[0])
  const lowNow = nowDays.reduce((a, b) => (b.closingCents < a.closingCents ? b : a), nowDays[0])

  return (
    <g aria-hidden>
      <defs>
        <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SPEND_COLOUR} stopOpacity={0.2} />
          <stop offset="100%" stopColor={SPEND_COLOUR} stopOpacity={0.07} />
        </linearGradient>
      </defs>

      {/* the stretch that falls through the reserve */}
      {breachDays.length > 0 && (
        <rect
          x={x(breachDays[0].date)}
          y={top}
          width={Math.max(2, x(breachDays[breachDays.length - 1].date) - x(breachDays[0].date))}
          height={BAND_H}
          fill="#a35b2a"
          opacity={0.07}
        />
      )}

      {/* the cost of the decision, as an area */}
      <path d={area} fill="url(#costFill)" />

      {/* the floor */}
      <line
        x1={x(withDays[0].date)}
        y1={yOf(reserve)}
        x2={x(withDays[withDays.length - 1].date)}
        y2={yOf(reserve)}
        stroke={RESERVE_COLOUR}
        strokeWidth={1.4}
        strokeDasharray="5 4"
        opacity={0.85}
      />
      <text
        x={x(withDays[0].date) + 4}
        y={yOf(reserve) - 4}
        fontSize={9.5}
        fill={RESERVE_COLOUR}
        className="tnum"
      >
        Reserve {usd(reserve)}
      </text>

      <path d={line(nowDays)} fill="none" stroke={NOW_COLOUR} strokeWidth={2} opacity={0.55} />
      <path d={line(withDays)} fill="none" stroke={SPEND_COLOUR} strokeWidth={2.6} />

      {/* where each path bottoms out */}
      <circle cx={x(lowNow.date)} cy={yOf(lowNow.closingCents)} r={3.4} fill="#fff"
        stroke={NOW_COLOUR} strokeWidth={2} opacity={0.75} />
      <circle cx={x(lowWith.date)} cy={yOf(lowWith.closingCents)} r={4.2} fill="#fff"
        stroke={SPEND_COLOUR} strokeWidth={2.6} />
      <text
        x={x(lowWith.date)}
        y={yOf(lowWith.closingCents) + 15}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill={SPEND_COLOUR}
        className="tnum"
      >
        {usd(lowWith.closingCents)} {shortDate(lowWith.date)}
      </text>
    </g>
  )
}

/** The plain-language headline that sits above the two paths. */
export function CashComparisonHeadline({ scenario }: { scenario: ScenarioResult }) {
  const without = scenario.withoutProposal
  if (!without || !scenario.proposal) return null
  const breach = scenario.breachesReserve

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 ${
        breach ? 'border-[#e6c7ae] bg-[#fdf3ec]' : 'border-[#d9caec] bg-[#f9f6fd]'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span className="h-[3px] w-5 rounded" style={{ background: NOW_COLOUR, opacity: 0.55 }} />
        <span className="text-[11px] text-muted">Without this spend</span>
        <span className="tnum text-[12.5px] font-semibold text-ink">
          {usd(without.lowestCents)}
        </span>
      </span>

      <span className="text-[13px] text-muted">→</span>

      <span className="flex items-center gap-1.5">
        <span className="h-[3px] w-5 rounded" style={{ background: SPEND_COLOUR }} />
        <span className="text-[11px] text-muted">With it</span>
        <span
          className={`tnum text-[12.5px] font-semibold ${breach ? 'text-[#8a4a1f]' : 'text-ink'}`}
        >
          {usd(scenario.lowestCents)}
        </span>
      </span>

      <span
        className={`tnum rounded px-2 py-[3px] text-[11.5px] font-semibold ${
          breach ? 'bg-[#8a4a1f] text-white' : 'bg-[#54397e] text-white'
        }`}
      >
        {usd(scenario.deltaLowestCents)} at the tightest day
      </span>

      <span className="text-[11.5px] leading-snug text-[#3d4757]">
        {breach ? (
          <>
            That is <strong>{usd(-scenario.headroomCents)} below</strong> your reserve on{' '}
            {shortDate(scenario.firstBreachDate ?? scenario.lowestDate)}.
          </>
        ) : (
          <>
            Still <strong>{usd(scenario.headroomCents)} above</strong> your reserve.
          </>
        )}
      </span>
    </div>
  )
}
