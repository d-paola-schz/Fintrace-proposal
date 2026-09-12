import type { FinancialEvent } from '../types/contracts'
import { CERTAINTY_LABEL, shortDate, usd } from '../lib/format'

export const CARD_W = 186
export const CARD_H = 50
/** Card height when vertical room is tight. */
export const CARD_H_COMPACT = 42

export const KIND_ACCENT: Record<string, string> = {
  sales: '#2563eb',
  payout: '#b3860a',
  supplier_payment: '#ad4318',
  ad_spend: '#7c5cbf',
  bill: '#5a6675',
  proposal: '#0f766e',
  bank: '#1f5c3c',
}

/** A compact dated event on the timeline. History is solid; anything scheduled
 *  or conditional is visibly different in both style and words. */
export function EventCard({
  event,
  x,
  y,
  h = CARD_H,
  hasChain,
  highlighted,
  selected,
  muted,
  dimmed,
  onSelect,
}: {
  event: FinancialEvent
  x: number
  y: number
  h?: number
  hasChain: boolean
  highlighted: boolean
  selected: boolean
  /** Repeated, non-cash markers recede so the money events lead the eye. */
  muted?: boolean
  /** Out of frame while a chain holds the camera. */
  dimmed?: boolean
  onSelect: (id: string) => void
}) {
  const accent = KIND_ACCENT[event.kind] ?? '#5a6675'
  const projected = event.certainty !== 'recorded'
  const amount = event.kind === 'sales' || event.amountCents >= 0

  return (
    <button
      type="button"
      onClick={() => onSelect(event.id)}
      aria-pressed={selected}
      title={`${event.label} · ${shortDate(event.date)}`}
      className={`absolute rounded-md border text-left transition-all ${
        selected
          ? 'shadow-[0_0_0_2px_var(--color-flow)] z-20 border-transparent bg-white'
          : highlighted
            ? 'border-[#c8d9f7] bg-white shadow-sm z-10'
            : muted
              ? 'border-hair bg-[#fafbfc] opacity-75 hover:opacity-100 hover:shadow-sm'
              : 'border-hair bg-white hover:shadow-md'
      }`}
      style={{
        left: x - CARD_W / 2,
        top: y,
        width: CARD_W,
        height: h,
        opacity: dimmed ? 0 : 1,
        pointerEvents: dimmed ? 'none' : undefined,
        transition: 'opacity 380ms ease',
        borderLeft: `3px solid ${accent}`,
        borderStyle: projected ? 'dashed solid solid dashed' : undefined,
        borderLeftStyle: 'solid',
      }}
    >
      <span className="flex h-full flex-col justify-center gap-[2px] overflow-hidden px-2.5">
        <span className="flex items-baseline justify-between gap-1">
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold leading-tight text-ink">
            {event.label}
          </span>
          <span className="tnum shrink-0 text-[10px] text-muted">{shortDate(event.date)}</span>
        </span>
        <span className="flex items-center justify-between gap-1">
          <span
            className={`tnum shrink-0 text-[13px] font-semibold leading-none ${
              amount ? 'text-[#15803d]' : 'text-[#b4501f]'
            }`}
          >
            {event.kind === 'sales' || event.kind === 'balance'
              ? usd(event.amountCents)
              : usd(event.amountCents, { sign: event.amountCents > 0 })}
          </span>
          <span className="flex min-w-0 items-center gap-1">
            {/* A glyph rather than the word "chain": it says the same thing in a
                tenth of the width, which is what pushed the status label out of
                the card. */}
            {hasChain && (
              <svg
                width="13" height="8" viewBox="0 0 13 8" aria-hidden
                className="shrink-0 text-muted"
              >
                <title>This event has a chain</title>
                <rect x="0.9" y="1.4" width="6.6" height="5.2" rx="2.6"
                  fill="none" stroke="currentColor" strokeWidth="1.3" />
                <rect x="5.5" y="1.4" width="6.6" height="5.2" rx="2.6"
                  fill="none" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            )}
            <span
              className={`truncate text-[9px] font-semibold uppercase tracking-[0.05em] ${
                projected ? 'text-[#8a6d1f]' : 'text-muted'
              }`}
            >
              {CERTAINTY_LABEL[event.certainty]}
            </span>
          </span>
        </span>
      </span>
    </button>
  )
}
