import type {
  BriefingAction,
  HighlightLevel,
  ScenarioRequest,
  WorkspaceResponse,
} from '../types/contracts'
import { shortDate } from '../lib/format'
import { CardShell, DeckPanel, Eyebrow, type DeckSlide } from './DeckPanel'

const LEVEL_WORD: Record<HighlightLevel, string> = {
  risk: 'Below your reserve',
  watch: 'Holds, but only just',
  good: 'Clear of your reserve',
}

const LEVEL_STYLE: Record<HighlightLevel, { accent: string; tint: string; chip: string }> = {
  risk: { accent: '#ad4318', tint: '#fdf1ea', chip: 'bg-[#fdf1ea] text-[#8f3612] border-[#ebc3ae]' },
  watch: { accent: '#b3860a', tint: '#fdf7e4', chip: 'bg-[#fdf7e4] text-[#7f5f06] border-[#e8d296]' },
  good: { accent: '#15803d', tint: '#edf7f1', chip: 'bg-[#edf7f1] text-[#14532d] border-[#c2e2ce]' },
}

/**
 * The whole opening reading, once the owner asks for it.
 *
 * The same words that used to sit in a bar above the timeline, now reached by
 * clicking the band those words are about. Nothing here is new: the lead, the
 * figures and the thing to watch all come from the engine's briefing.
 */
export function InsightPanel({
  ws,
  width,
  scenario,
  onSeeWhy,
  onClose,
}: {
  ws: WorkspaceResponse
  width: number
  scenario: ScenarioRequest
  onSeeWhy: (a: BriefingAction) => void
  onClose: () => void
}) {
  const b = ws.briefing
  const level: HighlightLevel = b.highlight?.level ?? (b.status === 'at_risk' ? 'risk' : 'good')
  const style = LEVEL_STYLE[level]

  const slides: DeckSlide[] = [
    {
      key: 'reading',
      label: 'Where the plan stands',
      content: (
        <div className="space-y-3">
          <p className="text-[15px] font-semibold leading-snug text-ink">{b.lead}</p>
          <CardShell>
            <Eyebrow>The figures</Eyebrow>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#1b2635]">{b.detail}</p>
          </CardShell>
          <p className="text-[11px] leading-snug text-muted">
            This is the modelled plan, not a statement of your account. It rests on the demo
            assumptions listed under Data &amp; assumptions.
          </p>
        </div>
      ),
    },
  ]

  if (b.watch) {
    slides.push({
      key: 'watch',
      label: 'What could change it',
      content: (
        <div className="space-y-3">
          <CardShell>
            <p className="text-[13.5px] leading-relaxed text-[#1b2635]">{b.watch}</p>
          </CardShell>
          {b.seeWhy && (
            <button
              type="button"
              onClick={() => onSeeWhy(b.seeWhy!)}
              className="rounded-md border border-[#c8d9f7] bg-[#eef4ff] px-[18px] py-2.5 text-[13px] font-semibold text-[#26457f] hover:bg-[#e3edff]"
            >
              {b.seeWhy.label}
            </button>
          )}
          <p className="text-[11px] leading-snug text-muted">
            Phrased as a possibility because it has not happened. Nothing on this page assumes it
            has.
          </p>
        </div>
      ),
    })
  }

  const header = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-[4px] text-[10.5px] font-semibold uppercase tracking-[0.07em] ${style.chip}`}
        >
          {LEVEL_WORD[level]}
        </span>
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
        {b.highlight
          ? `${shortDate(b.highlight.startDate)} to ${shortDate(b.highlight.endDate)}`
          : 'Where the plan stands'}
      </h2>
      <p className="mt-1 text-[11px] text-muted">
        The stretch marked on the timeline behind this panel.
      </p>
    </>
  )

  return (
    <DeckPanel
      width={width}
      ariaLabel="Where the plan stands"
      header={header}
      slides={slides}
      resetKey="insight"
      hint="← → to move between cards."
      accent={style.accent}
      tint={style.tint}
      askScenario={scenario}
      askPlaceholder="Ask about your cash position…"
      onClose={onClose}
    />
  )
}
