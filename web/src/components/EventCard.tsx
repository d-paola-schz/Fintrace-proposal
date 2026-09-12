import type { FinancialEvent } from '../types/contracts'
import { CERTAINTY_LABEL, shortDate, usd } from '../lib/format'

export const CARD_W = 172
export const CARD_H = 50
/** Card height when vertical room is tight. */
export const CARD_H_COMPACT = 42

const KIND_ACCENT: Record<string, string> = {
  sales: '#2563eb',
  payout: '#9a7412',
  supplier_payment: '#a35b2a',
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
  onSelect,
}: {
  event: FinancialEvent
  x: number
  y: number
  h?: number
  hasChain: boolean
  highlighted: boolean
  selected: boolean
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
      className={`absolute rounded-md border bg-white text-left transition-shadow ${
        selected
          ? 'shadow-[0_0_0_2px_var(--color-flow)] z-20 border-transparent'
          : highlighted
            ? 'border-[#c8d9f7] shadow-sm z-10'
            : 'border-hair hover:shadow-md'
      }`}
      style={{
        left: x - CARD_W / 2,
        top: y,
        width: CARD_W,
        height: h,
        borderLeft: `3px solid ${accent}`,
        borderStyle: projected ? 'dashed solid solid dashed' : undefined,
        borderLeftStyle: 'solid',
      }}
    >
      <span className="flex h-full flex-col justify-center gap-[2px] px-2.5">
        <span className="flex items-baseline justify-between gap-1">
          <span className="truncate text-[11.5px] font-semibold leading-tight text-ink">
            {event.label}
          </span>
          <span className="tnum shrink-0 text-[10px] text-muted">{shortDate(event.date)}</span>
        </span>
        <span className="flex items-center justify-between gap-1">
          <span
            className={`tnum text-[13px] font-semibold leading-none ${
              amount ? 'text-[#15803d]' : 'text-[#b4501f]'
            }`}
          >
            {event.kind === 'sales' || event.kind === 'balance'
              ? usd(event.amountCents)
              : usd(event.amountCents, { sign: event.amountCents > 0 })}
          </span>
          <span className="flex items-center gap-1">
            {hasChain && (
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.06em] text-muted"
                title="This event has a chain"
              >
                chain
              </span>
            )}
            <span
              className={`text-[9px] font-semibold uppercase tracking-[0.05em] ${
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
