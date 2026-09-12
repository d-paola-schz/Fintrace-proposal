import type { CashPath, ScenarioRequest, ScenarioResult, WorkspaceResponse } from '../types/contracts'
import { shortDate, usd } from '../lib/format'

export const BAND_H = 88

const NOW_COLOUR = '#2563eb'
const SPEND_COLOUR = '#7c3aed'
/** A delay is not a decision you are making, so it is not the spend colour. */
const DELAY_COLOUR = '#ad4318'
const RESERVE_COLOUR = '#ad4318'

/**
 * Both cash paths, drawn inside the timeline on the same date axis: where the
 * money goes if nothing changes, and where it goes with the proposed spend.
 * The filled area between them is the cost of the decision, shown rather than
 * described, and the stretch where the proposed path falls under the reserve
 * is called out on the spot.
 */
export function CashComparison({
  scenario,
  baseline,
  delay,
  x,
  top,
}: {
  scenario: ScenarioResult
  /** The path to compare against: the plan without the spend, or with the
   *  payout on time. */
  baseline: CashPath | null
  /** True when the what-if is a payout delay rather than a proposed spend. */
  delay?: boolean
  /** the timeline's own date scale, so the two views line up exactly */
  x: (iso: string) => number
  top: number
}) {
  if (!baseline) return null

  const withDays = scenario.days ?? []
  const nowDays = baseline.days ?? []
  if (withDays.length === 0 || nowDays.length === 0) return null
  const accent = delay ? DELAY_COLOUR : SPEND_COLOUR

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
          <stop offset="0%" stopColor={accent} stopOpacity={0.2} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.07} />
        </linearGradient>
      </defs>

      {/* the stretch that falls through the reserve */}
      {breachDays.length > 0 && (
        <rect
          x={x(breachDays[0].date)}
          y={top}
          width={Math.max(2, x(breachDays[breachDays.length - 1].date) - x(breachDays[0].date))}
          height={BAND_H}
          fill="#ad4318"
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
      <path d={line(withDays)} fill="none" stroke={accent} strokeWidth={2.6} />

      {/* where each path bottoms out */}
      <circle cx={x(lowNow.date)} cy={yOf(lowNow.closingCents)} r={3.4} fill="#fff"
        stroke={NOW_COLOUR} strokeWidth={2} opacity={0.75} />
      <circle cx={x(lowWith.date)} cy={yOf(lowWith.closingCents)} r={4.2} fill="#fff"
        stroke={accent} strokeWidth={2.6} />
      <text
        x={x(lowWith.date)}
        y={yOf(lowWith.closingCents) + 15}
        textAnchor="middle"
        fontSize={10}
        fontWeight={600}
        fill={accent}
        className="tnum"
      >
        {usd(lowWith.closingCents)} {shortDate(lowWith.date)}
      </text>

      {/* The plan's own low, named too. Without it the reader sees where they
          would end up but not what they are giving up to get there. */}
      <text
        x={x(lowNow.date)}
        y={yOf(lowNow.closingCents) - 8}
        textAnchor="middle"
        fontSize={9.5}
        fill={NOW_COLOUR}
        opacity={0.8}
        className="tnum"
      >
        {baseline.label} {usd(lowNow.closingCents)}
      </text>
    </g>
  )
}

/**
 * The whole decision in one strip: where you were, where this puts you, what it
 * costs at the tightest day, and the alternatives as peers you can try in a
 * click. Previously this was two stacked bars competing for the same attention.
 */
export function CashComparisonHeadline({
  ws,
  scenario,
  onChange,
}: {
  ws: WorkspaceResponse
  scenario: ScenarioRequest
  onChange: (req: ScenarioRequest) => void
}) {
  const s = ws.scenario
  const without = s.withoutProposal
  if (!without || !s.proposal) return null
  const breach = s.breachesReserve
  const alts = s.alternatives ?? []

  return (
    <div
      className={`border-b px-4 py-2 ${
        breach ? 'border-[#ebc3ae] bg-[#fdf1ea]' : 'border-[#d9caec] bg-[#f9f6fd]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-5 rounded" style={{ background: NOW_COLOUR, opacity: 0.55 }} />
          <span className="text-[11px] text-muted">Without it</span>
          <span className="tnum text-[12.5px] font-semibold text-ink">
            {usd(without.lowestCents)}
          </span>
        </span>

        <span className="text-[13px] text-muted">→</span>

        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-5 rounded" style={{ background: SPEND_COLOUR }} />
          <span className="text-[11px] text-muted">With it</span>
          <span
            className={`tnum text-[12.5px] font-semibold ${breach ? 'text-[#8f3612]' : 'text-ink'}`}
          >
            {usd(s.lowestCents)}
          </span>
        </span>

        <span
          className={`tnum rounded px-2 py-[3px] text-[11.5px] font-semibold text-white ${
            breach ? 'bg-[#8f3612]' : 'bg-[#54397e]'
          }`}
        >
          {usd(s.deltaLowestCents)} at the tightest day
        </span>

        <span className="text-[11.5px] leading-snug text-[#3d4757]">
          {breach ? (
            <>
              <strong>{usd(-s.headroomCents)} below</strong> your reserve on{' '}
              {shortDate(s.firstBreachDate ?? s.lowestDate)}.
            </>
          ) : (
            <>
              <strong>{usd(s.headroomCents)} above</strong> your reserve.
            </>
          )}
        </span>
      </div>

      {alts.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
            Instead
          </span>
          {alts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChange({ ...scenario, proposal: a.proposal })}
              title={a.tradeoff}
              className={`tnum rounded-full border px-2.5 py-[3px] text-[11px] transition-colors ${
                a.breachesReserve
                  ? 'border-[#ebc3ae] bg-white text-[#8f3612] hover:bg-[#fdf1ea]'
                  : 'border-[#c2e2ce] bg-white text-[#1f5c3c] hover:bg-[#f4fbf7]'
              }`}
            >
              {a.label} · {a.breachesReserve ? 'still below' : 'holds'} {usd(a.lowestCents)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
