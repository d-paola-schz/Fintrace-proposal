import type { Briefing } from '../types/contracts'

/**
 * The what-if strip, and nothing else.
 *
 * This bar used to carry the whole opening briefing — a lead, a paragraph of
 * figures, two buttons and an ask box — which took the top fifth of the window
 * before the owner had looked at anything. That reading now lives on the
 * timeline, painted over the days it is about.
 *
 * What stays is the one thing that must never be quiet: the announcement that
 * what is on screen is a hypothetical, and the way back out of it.
 */
export function BriefingBar({
  briefing,
  onReset,
}: {
  briefing: Briefing
  onReset: () => void
}) {
  if (briefing.mode !== 'scenario') return null

  return (
    <section
      aria-label="What-if in progress"
      className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#ebc3ae] bg-[#fdf1ea] px-6 py-1.5"
    >
      <span className="rounded bg-[#8f3612] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.07em] text-white">
        What-if
      </span>
      <span className="text-[12.5px] font-medium text-[#8f3612]">{briefing.scenarioLabel}</span>
      <span className="text-[11.5px] text-[#8f3612]/85">
        Nothing here has been applied to your modelled plan.
      </span>
      <button
        type="button"
        onClick={onReset}
        className="ml-auto rounded-md bg-[#8f3612] px-3.5 py-1.5 text-[12.5px] font-medium text-white"
      >
        Back to my plan
      </button>
    </section>
  )
}
