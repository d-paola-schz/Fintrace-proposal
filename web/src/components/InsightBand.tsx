import { useState } from 'react'
import type { BriefingHighlight, HighlightLevel } from '../types/contracts'

/**
 * The three readings, as gradients rather than flat fills.
 *
 * Each runs through its own hue so the band reads as one state even while it
 * drifts, and every one is paired with a word in the tooltip: colour never
 * carries the meaning on its own.
 */
const LEVEL: Record<HighlightLevel, { word: string; gradient: string; ink: string; edge: string }> = {
  risk: {
    word: 'Below your reserve',
    gradient: 'linear-gradient(90deg,#c2410c,#ad4318,#e06a2b,#ad4318,#c2410c)',
    ink: '#8f3612',
    edge: '#ebc3ae',
  },
  watch: {
    word: 'Holds, but only just',
    gradient: 'linear-gradient(90deg,#b3860a,#caa02a,#e3bb46,#caa02a,#b3860a)',
    ink: '#7f5f06',
    edge: '#e8d296',
  },
  good: {
    word: 'Clear of your reserve',
    gradient: 'linear-gradient(90deg,#15803d,#1c9550,#3fb372,#1c9550,#15803d)',
    ink: '#14532d',
    edge: '#c2e2ce',
  },
}

/**
 * The opening insight, said on the timeline instead of above it.
 *
 * It used to be a paragraph in a bar that took the top fifth of the window
 * before the owner had looked at anything. The same finding is now painted over
 * the days it concerns — from the start of the projection to the low, or to the
 * breach if there is one — so where it applies is visible rather than described.
 * Hovering says it in a line; opening it says all of it.
 */
export function InsightBand({
  highlight,
  x,
  railY,
  railH,
  onOpen,
}: {
  highlight: BriefingHighlight
  /** Date to canvas x. */
  x: (iso: string) => number
  railY: number
  railH: number
  onOpen: () => void
}) {
  const [peek, setPeek] = useState(false)
  const level = LEVEL[highlight.level] ?? LEVEL.watch
  const x0 = x(highlight.startDate)
  const x1 = x(highlight.endDate)
  const left = Math.min(x0, x1)
  const width = Math.max(28, Math.abs(x1 - x0))
  // The painted band is exactly the rail. The button around it is taller, so a
  // fourteen-pixel stripe is still comfortable to hit.
  const hit = railH + 16
  const inset = (hit - railH) / 2

  return (
    <>
      <button
        type="button"
        onMouseEnter={() => setPeek(true)}
        onMouseLeave={() => setPeek(false)}
        onFocus={() => setPeek(true)}
        onBlur={() => setPeek(false)}
        onClick={onOpen}
        aria-label={`${level.word}. ${highlight.summary} Open the full reading.`}
        className="absolute z-[5] bg-transparent"
        style={{ left, top: railY - hit / 2, width, height: hit }}
      >
        {/* Square ends, the rail's exact height, no ring and no shadow: this is
            a stretch of the line in a different colour, not a tag laid over it.
            The vertical shading and the hairline along the top are the rail's
            own, so the join is invisible. */}
        <span
          className="absolute overflow-hidden transition-[filter] duration-200"
          style={{
            left: 0,
            right: 0,
            top: inset,
            height: railH,
            filter: peek ? 'brightness(1.07) saturate(1.06)' : 'none',
          }}
        >
          <span
            className="insight-band absolute inset-0"
            style={{ background: level.gradient }}
          />
          <span
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.05) 42%, rgba(0,0,0,0.15) 100%)',
            }}
          />
          <span
            className="absolute inset-x-0 h-px"
            style={{ top: 1.6, background: 'rgba(255,255,255,0.42)' }}
          />
        </span>
      </button>

      {peek && (
        <div
          className="pointer-events-none absolute z-30 -translate-x-1/2 rounded-xl border bg-white/95 px-3.5 py-2.5 shadow-[0_10px_28px_-8px_rgba(15,23,38,0.35)] backdrop-blur"
          style={{
            left: left + width / 2,
            top: railY - hit / 2 - 78,
            width: 330,
            borderColor: level.edge,
          }}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: level.ink }}
          >
            {level.word}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink">{highlight.summary}</p>
          <p className="mt-1.5 text-[10.5px] text-muted">Click to read the whole thing.</p>
        </div>
      )}
    </>
  )
}
