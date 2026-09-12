import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScenarioRequest } from '../types/contracts'
import { Chat } from './Chat'

export interface DeckSlide {
  key: string
  /** The card's name, printed above it. */
  label: string
  content: React.ReactNode
}

/**
 * The floating panel every detail view is dealt into.
 *
 * One long scrolling column asked the reader to find the part they wanted
 * inside a page of prose, tables and controls. The same content is dealt one
 * card at a time and the arrow keys walk it. The shell knows nothing about
 * what is on the cards; a caller that has somewhere further to go — the next
 * link of a chain, say — supplies `onPastEnd`.
 */
export function DeckPanel({
  width,
  ariaLabel,
  header,
  slides,
  resetKey,
  startAtEnd = false,
  hint,
  accent,
  tint,
  askScenario,
  askNodeId,
  askPlaceholder = 'Ask about this…',
  askSuggestions,
  onApplyScenario,
  onClose,
  onPastEnd,
}: {
  /** Reserved width, including the gap the panel floats inside. */
  width: number
  ariaLabel: string
  header: React.ReactNode
  slides: DeckSlide[]
  /** Changing this deals a fresh deck. */
  resetKey: string
  /** Start on the last card, so arriving backwards feels continuous. */
  startAtEnd?: boolean
  hint?: string
  /** Line colour of the thing being described, drawn along the panel's top. */
  accent?: string
  /** Its palest shade, washed faintly over the panel. */
  tint?: string
  /**
   * Supplying a scenario puts a way to talk in the footer, on every card.
   * It used to live on the last card only, which meant the owner had to finish
   * reading before they could ask anything.
   */
  askScenario?: ScenarioRequest
  askNodeId?: string
  askPlaceholder?: string
  askSuggestions?: string[]
  onApplyScenario?: (req: ScenarioRequest) => void
  onClose: () => void
  /**
   * Called when the reader walks past either end. Return true if you moved
   * somewhere; false leaves the deck where it is and disables that arrow.
   */
  onPastEnd?: (dir: 1 | -1) => boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(startAtEnd ? slides.length - 1 : 0)
  const [dir, setDir] = useState<1 | -1>(1)

  const count = slides.length
  useEffect(() => {
    setAt(startAtEnd ? Math.max(0, count - 1) : 0)
    // startAtEnd is read once per deck, on purpose: it describes how this deck
    // was entered, not a value to react to afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, count])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const step = useCallback(
    (d: 1 | -1) => {
      const next = at + d
      if (next >= 0 && next < count) {
        setDir(d)
        setAt(next)
        return
      }
      if (onPastEnd?.(d)) setDir(d)
    },
    [at, count, onPastEnd, setAt, setDir],
  )

  const canGo = useMemo(
    () => ({
      back: at > 0 || !!onPastEnd,
      forward: at < count - 1 || !!onPastEnd,
    }),
    [at, count, onPastEnd],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Never steal the arrows from someone typing a question.
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        step(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        step(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onClose])

  const slide = slides[Math.min(at, count - 1)] ?? slides[0]
  const [asking, setAsking] = useState(false)

  // Leaving this deck closes the conversation with it.
  useEffect(() => setAsking(false), [resetKey])

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={ariaLabel}
      style={{ width: Math.max(280, width - 34), right: 17, top: 17, bottom: 17 }}
      className="deck-in absolute z-30 flex max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/72 shadow-[0_18px_48px_-12px_rgba(15,23,38,0.28),0_2px_8px_rgba(15,23,38,0.06)] outline-none backdrop-blur-2xl focus-visible:outline-none"
    >
      {/* The panel takes the colour of the link it is describing, so walking a
          chain visibly carries its tone across rather than leaving the reader
          to match a chip to a node. Absolutely positioned and painted first;
          every band below is `relative`, so it sits under all of them. */}
      {tint && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-colors duration-300"
          style={{ background: tint, opacity: 0.5 }}
        />
      )}
      {accent && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] transition-colors duration-300"
          style={{ background: accent }}
        />
      )}

      <header className="relative shrink-0 border-b border-hair/70 px-5 pb-3 pt-4">{header}</header>

      <div
        key={`${resetKey}-${slide?.key}`}
        className={`scrollbar-thin relative min-h-0 flex-1 overflow-y-auto px-5 py-4 ${
          dir === 1 ? 'slide-in-next' : 'slide-in-prev'
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
          {slide?.label}
        </p>
        <div className="mt-2.5">{slide?.content}</div>
      </div>

      <footer className="relative shrink-0 border-t border-hair/70 px-5 py-2.5">
        {askScenario && (
          <div className="mb-2.5">
            {asking ? (
              <div className="rounded-xl border border-hair bg-white/80 p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
                    Ask
                  </span>
                  <button
                    type="button"
                    onClick={() => setAsking(false)}
                    className="rounded px-1.5 py-0.5 text-[11px] text-muted hover:text-ink"
                  >
                    hide
                  </button>
                </div>
                <Chat
                  nodeId={askNodeId}
                  scenario={askScenario}
                  suggestions={askSuggestions}
                  placeholder={askPlaceholder}
                  onApplyScenario={onApplyScenario ?? (() => {})}
                  compact
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAsking(true)}
                className="flex w-full items-center gap-2 rounded-full border border-hair bg-white/70 px-3.5 py-2 text-left text-[12px] text-muted hover:border-[#c8d9f7] hover:text-[#26457f]"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden className="shrink-0">
                  <path
                    d="M2 3.2h10v6.1H6.4L3.6 11.6V9.3H2Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                </svg>
                {askPlaceholder}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={!canGo.back}
            aria-label="Previous card"
            className="rounded-md border border-hair bg-white/70 px-3.5 py-2 text-[14px] leading-none text-[#3d4757] enabled:hover:border-[#c8d9f7] disabled:opacity-35"
          >
            ‹
          </button>

          <div className="flex items-center gap-1.5" role="tablist" aria-label="Cards">
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={i === at}
                aria-label={s.label}
                onClick={() => {
                  setDir(i > at ? 1 : -1)
                  setAt(i)
                }}
                className="group flex items-center px-0.5 py-2"
              >
                {/* The bar is small on purpose; the target around it is not. */}
                <span
                  className={`block h-2 rounded-full transition-all duration-200 ${
                    i === at
                      ? 'w-6 bg-[#26457f]'
                      : 'w-2 bg-[#c3ccda] group-hover:bg-[#9aa8bd]'
                  }`}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => step(1)}
            disabled={!canGo.forward}
            aria-label="Next card"
            className="rounded-md border border-hair bg-white/70 px-3.5 py-2 text-[14px] leading-none text-[#3d4757] enabled:hover:border-[#c8d9f7] disabled:opacity-35"
          >
            ›
          </button>
        </div>
        {hint && <p className="mt-1.5 text-center text-[10px] text-muted">{hint}</p>}
      </footer>
    </aside>
  )
}

/** A pale card the deck's content sits on. */
export function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hair/80 bg-white/70 p-4 shadow-[0_1px_2px_rgba(15,23,38,0.04)]">
      {children}
    </div>
  )
}

/** A small uppercase label above a block inside a card. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">{children}</p>
  )
}
