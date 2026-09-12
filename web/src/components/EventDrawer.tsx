import { useEffect, useRef } from 'react'
import type { FinancialEvent } from '../types/contracts'
import { CERTAINTY_LABEL, longDate, usd } from '../lib/format'
import { ClaimRow, SourceLink } from './ClaimRow'
import { Section } from './Section'
import { ProvenanceChip } from './Tone'

/** One dated event, opened on demand. */
export function EventDrawer({
  event,
  onClose,
}: {
  event: FinancialEvent
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={event.label}
      className="absolute right-0 top-0 z-30 flex h-full w-[430px] max-w-[92vw] flex-col border-l border-hair bg-white shadow-[-12px_0_32px_rgba(15,23,38,0.08)] outline-none"
    >
      <header className="shrink-0 border-b border-hair px-5 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceChip provenance={event.provenance} />
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">
              {CERTAINTY_LABEL[event.certainty]}
            </span>
            <span className="tnum text-[11px] text-muted">{longDate(event.date)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded px-2 py-1 text-[16px] leading-none text-muted hover:bg-[#f3f5f8] hover:text-ink"
          >
            ×
          </button>
        </div>
        <h2 className="mt-2 text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink">
          {event.label}
        </h2>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <p className="tnum text-[24px] font-semibold leading-none text-ink">
          {usd(event.amountCents)}
        </p>
        <p
          className={`mt-2 inline-block rounded px-2 py-[3px] text-[11px] font-medium ${
            event.affectsCash ? 'bg-[#eef4ff] text-[#26457f]' : 'bg-[#f3f5f8] text-[#4a5566]'
          }`}
        >
          {event.affectsCash ? 'Moves the bank balance' : 'Does not move the bank balance'}
        </p>
        {event.detail && (
          <p className="mt-3 text-[13px] leading-relaxed text-[#22303f]">{event.detail}</p>
        )}

        {(event.claims ?? []).length > 0 && (
          <Section title="The figures behind it" count={(event.claims ?? []).length}>
            <ul className="rounded-lg border border-hair bg-white px-3">
              {(event.claims ?? []).map((c) => (
                <ClaimRow key={c.id} claim={c} />
              ))}
            </ul>
          </Section>
        )}

        <Section
          title="Where this came from"
          count={(event.sourceRefs ?? []).length}
          collapsible
          defaultOpen={false}
        >
          <div className="flex flex-wrap items-start gap-1.5">
            {(event.sourceRefs ?? []).map((r) => (
              <SourceLink key={r} id={r} />
            ))}
          </div>
        </Section>
      </div>
    </aside>
  )
}
