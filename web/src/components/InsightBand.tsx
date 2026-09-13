import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { BriefingHighlight, HighlightLevel } from '../types/contracts'
import { shortDate } from '../lib/format'

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

type NoteLane = 'plan' | 'whatif'

const DISMISS_KEY = 'preflight.insightNote.dismissed'

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The band's one-line reading, as a notification symbol in the corner.
 *
 * The band only speaks when it is hovered, and it can be scrolled out of view.
 * This says the same line — the same words and colour, nothing added — but as
 * a small symbol that opens on hover, focus or tap, so it covers almost nothing
 * until it is asked for. With a what-if, both readings are listed, so the plan's
 * is never hidden by the hypothetical. It can be dismissed for the session;
 * the band on the timeline still says it.
 */
export function InsightNote({
  plan,
  whatIf,
  hidden = false,
  style,
  onOpen,
  onShow,
}: {
  plan: BriefingHighlight | null
  whatIf: BriefingHighlight | null
  /**
   * A chain holds the camera. Its links can reach the bottom of the frame, so
   * the symbol goes away entirely rather than sitting over one of them.
   */
  hidden?: boolean
  style?: CSSProperties
  onOpen: (lane: NoteLane) => void
  onShow: (lane: NoteLane) => void
}) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)
  const key = `${plan?.summary ?? ''}|${whatIf?.summary ?? ''}`
  // A reading the owner has not opened yet pings; opening it once quiets it.
  const [seenKey, setSeenKey] = useState<string | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const rows = [
    plan && { lane: 'plan' as const, h: plan },
    whatIf && { lane: 'whatif' as const, h: whatIf },
  ].filter((r): r is { lane: NoteLane; h: BriefingHighlight } => !!r)
  if (rows.length === 0 || dismissed) return null
  const lead = LEVEL[rows[rows.length - 1].h.level] ?? LEVEL.watch
  const shown = open && !hidden

  const show = () => {
    window.clearTimeout(closeTimer.current)
    setOpen(true)
    setSeenKey(key)
  }
  // A short grace period, so crossing from the symbol to the card never shuts it.
  const hide = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 160)
  }
  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Storage can be unavailable; it is still dismissed until reload.
    }
    setDismissed(true)
  }

  return (
    <div
      className="absolute bottom-4 z-30 flex flex-col items-end"
      style={{
        ...style,
        opacity: hidden ? 0 : 1,
        visibility: hidden ? 'hidden' : 'visible',
        transition: hidden ? 'opacity 300ms ease, visibility 0s linear 300ms' : 'opacity 300ms ease',
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hide()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      {shown && (
        <div
          id={panelId}
          role="region"
          aria-label="What the coloured stretch of the timeline means"
          className="deck-in mb-2 w-[300px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border bg-white/95 shadow-[0_10px_30px_-12px_rgba(15,23,38,0.35)] backdrop-blur"
          style={{ borderColor: lead.edge }}
        >
          {rows.map((r, i) => {
            const lv = LEVEL[r.h.level] ?? LEVEL.watch
            return (
              <div key={r.lane} className={`px-3 py-2 ${i > 0 ? 'border-t border-hair' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="insight-band h-1.5 w-5 shrink-0 rounded-full" style={{ background: lv.gradient }} />
                  <p className="min-w-0 text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: lv.ink }}>
                    {r.lane === 'whatif' && (
                      <span className="mr-1.5 rounded bg-[#6d28d9] px-1 py-[1px] text-[8.5px] font-bold text-white">What-if</span>
                    )}
                    {lv.word}
                  </p>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-ink">{r.h.summary}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
                  <span className="tnum text-muted">
                    {shortDate(r.h.startDate)} – {shortDate(r.h.endDate)}
                  </span>
                  <button type="button" onClick={() => onShow(r.lane)}
                    className="font-medium text-[#26457f] underline-offset-2 hover:underline">
                    Show on timeline
                  </button>
                  <button type="button" onClick={() => onOpen(r.lane)}
                    className="font-semibold underline-offset-2 hover:underline" style={{ color: lv.ink }}>
                    Read all
                  </button>
                </div>
              </div>
            )
          })}
          <div className="flex justify-end border-t border-hair bg-[#fafbfc] px-3 py-1.5">
            <button type="button" onClick={dismiss}
              className="text-[10.5px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline">
              Dismiss for this session
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        aria-expanded={shown}
        aria-controls={shown ? panelId : undefined}
        aria-label={`Timeline reading: ${rows.map((r) => `${r.lane === 'whatif' ? 'What-if, ' : ''}${(LEVEL[r.h.level] ?? LEVEL.watch).word}`).join('; ')}. Open to read.`}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border bg-white/95 shadow-[0_8px_22px_-10px_rgba(15,23,38,0.45)] backdrop-blur transition-transform hover:scale-105"
        style={{ borderColor: lead.edge }}
      >
        {seenKey !== key && (
          <span aria-hidden className="absolute inset-0 animate-ping rounded-full opacity-40"
            style={{ background: lead.gradient, animationIterationCount: 3 }} />
        )}
        <span aria-hidden className="insight-band relative flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold leading-none text-white"
          style={{ background: lead.gradient }}>
          {lead === LEVEL.good ? '✓' : '!'}
        </span>
        {rows.length > 1 && (
          <span aria-hidden className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#6d28d9] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
            {rows.length}
          </span>
        )}
      </button>
    </div>
  )
}
