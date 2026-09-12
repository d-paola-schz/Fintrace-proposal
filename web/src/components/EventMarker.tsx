import { useState } from 'react'
import type { FinancialEvent } from '../types/contracts'
import { shortDate, usd } from '../lib/format'
import { CARD_H, KIND_ACCENT } from './EventCard'
import { EventCard } from './EventCard'

/** Hit area of a marker. Larger than the bead it draws, so it stays clickable. */
export const MARKER_HIT = 34
/** Resting diameter. Deliberately wider than the rail, so a marker reads as a
 *  thing sitting on the line rather than a notch cut into it. */
const BEAD = 22
const BEAD_HOT = 27

/**
 * An event that is not the root of a chain.
 *
 * The opening screen used to show every event as a full card, which put eight
 * labelled amounts in front of an owner who had not yet been told what to look
 * at. A marker keeps the event on the timeline — its date, its kind and
 * whether cash moved in or out — and hands over the rest only when it is
 * asked for. Hovering or focusing it previews the same card the event always
 * had; clicking it selects the event as before.
 */
export function EventMarker({
  event,
  x,
  railY,
  cardY,
  cardH = CARD_H,
  selected,
  dimmed,
  onSelect,
}: {
  event: FinancialEvent
  x: number
  /** Y of the rail the marker sits on. */
  railY: number
  /** Y the preview card is drawn at, in the card band above the rail. */
  cardY: number
  cardH?: number
  selected: boolean
  /** Out of frame while a chain holds the camera. */
  dimmed?: boolean
  onSelect: (id: string) => void
}) {
  const [peek, setPeek] = useState(false)
  const accent = KIND_ACCENT[event.kind] ?? '#5a6675'
  const inflow = event.kind === 'sales' || event.amountCents >= 0
  const show = !dimmed && (peek || selected)

  return (
    <>
      <button
        type="button"
        onMouseEnter={() => setPeek(true)}
        onMouseLeave={() => setPeek(false)}
        onFocus={() => setPeek(true)}
        onBlur={() => setPeek(false)}
        onClick={() => onSelect(event.id)}
        aria-pressed={selected}
        aria-label={`${event.label}, ${shortDate(event.date)}, ${usd(event.amountCents, {
          sign: event.amountCents > 0,
        })}. Select to read it.`}
        className="absolute z-10 flex cursor-pointer items-center justify-center rounded-full transition-transform duration-200 hover:scale-[1.06]"
        style={{
          left: x - MARKER_HIT / 2,
          top: railY - MARKER_HIT / 2,
          width: MARKER_HIT,
          height: MARKER_HIT,
          opacity: dimmed ? 0 : 1,
          pointerEvents: dimmed ? 'none' : undefined,
          transition: 'opacity 380ms ease',
        }}
      >
        {/* A bead sitting proud of the rail, carrying a plus so it reads as
            something to open rather than a decoration. Filled means cash came
            in, hollow means it went out, and the plus inverts to stay legible
            against either. Nothing is drawn below the rail: that lane belongs
            to the date axis, and a tick there collided with every label. */}
        <span
          aria-hidden
          className="relative flex items-center justify-center rounded-full border-2 transition-all duration-200"
          style={{
            width: show ? BEAD_HOT : BEAD,
            height: show ? BEAD_HOT : BEAD,
            borderColor: accent,
            background: inflow ? accent : '#ffffff',
            boxShadow: `0 0 0 2.5px #fff, 0 1px 3px rgba(15,23,38,0.22)${
              selected ? ', 0 0 0 4.5px var(--color-flow)' : ''
            }`,
          }}
        >
          <svg
            width={show ? 13 : 11}
            height={show ? 13 : 11}
            viewBox="0 0 12 12"
            className="transition-all duration-200"
          >
            <path
              d="M6 2.2 V9.8 M2.2 6 H9.8"
              stroke={inflow ? '#ffffff' : accent}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>

      {/* Preview only. It never takes the pointer, so moving towards it can
          never make it flicker out from under the cursor. */}
      {show && (
        <div className="pointer-events-none absolute z-30" style={{ left: 0, top: 0 }}>
          <EventCard
            event={event}
            x={x}
            y={cardY}
            h={cardH}
            hasChain={false}
            highlighted
            selected={selected}
            onSelect={() => {}}
          />
        </div>
      )}
    </>
  )
}
