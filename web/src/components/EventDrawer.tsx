import type { FinancialEvent } from '../types/contracts'
import { CERTAINTY_LABEL, longDate, usd } from '../lib/format'
import { ClaimRow, SourceLink } from './ClaimRow'
import { CardShell, DeckPanel, Eyebrow, type DeckSlide } from './DeckPanel'
import { ProvenanceChip } from './Tone'

/**
 * One dated event, dealt as the same deck a chain step gets.
 *
 * An event is not part of a chain, so its deck has nowhere further to go: the
 * arrows walk its own cards and stop at both ends.
 */
export function EventDrawer({
  event,
  width,
  onClose,
}: {
  event: FinancialEvent
  width: number
  onClose: () => void
}) {
  const claims = event.claims ?? []
  const refs = event.sourceRefs ?? []

  const whatItIs = (
    <CardShell>
      <p className="tnum text-[24px] font-semibold leading-none text-ink">
        {usd(event.amountCents)}
      </p>
      <p
        className={`mt-2.5 inline-block rounded px-2 py-[3px] text-[11px] font-medium ${
          event.affectsCash ? 'bg-[#eef4ff] text-[#26457f]' : 'bg-[#f2f4f9] text-[#46536b]'
        }`}
      >
        {event.affectsCash ? 'Moves the bank balance' : 'Does not move the bank balance'}
      </p>
      {event.detail && (
        <p className="mt-3 text-[13px] leading-relaxed text-[#22303f]">{event.detail}</p>
      )}
    </CardShell>
  )

  const figures = claims.length > 0 && (
    <ul className="rounded-xl border border-hair bg-white/80 px-3">
      {claims.map((c) => (
        <ClaimRow key={c.id} claim={c} />
      ))}
    </ul>
  )

  const whereFrom = (
    <div>
      <p className="text-[11px] leading-snug text-muted">
        Open any one to see the record behind it.
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-1.5">
        {refs.map((r) => (
          <SourceLink key={r} id={r} />
        ))}
      </div>
      {refs.length === 0 && (
        <p className="mt-2 text-[11px] italic text-muted">
          No source record: this states what the connected data does not contain.
        </p>
      )}
    </div>
  )

  const slides: DeckSlide[] = [{ key: 'what', label: 'What this is', content: whatItIs }]
  if (figures) slides.push({ key: 'figures', label: 'The figures behind it', content: figures })
  slides.push({ key: 'from', label: 'Where this came from', content: whereFrom })
  slides.push({
    key: 'all',
    label: 'The whole event',
    content: (
      <div className="space-y-3.5">
        {whatItIs}
        {figures && (
          <div>
            <Eyebrow>The figures behind it</Eyebrow>
            <div className="mt-1.5">{figures}</div>
          </div>
        )}
        <div>
          <Eyebrow>Where this came from</Eyebrow>
          <div className="mt-1.5">{whereFrom}</div>
        </div>
      </div>
    ),
  })

  const header = (
    <>
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
          className="shrink-0 rounded px-2.5 py-1.5 text-[17px] leading-none text-muted hover:bg-[#f2f4f9] hover:text-ink"
        >
          ×
        </button>
      </div>
      <h2 className="mt-2 text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink">
        {event.label}
      </h2>
    </>
  )

  return (
    <DeckPanel
      width={width}
      ariaLabel={event.label}
      header={header}
      slides={slides}
      resetKey={event.id}
      hint="← → to move between cards."
      onClose={onClose}
    />
  )
}
