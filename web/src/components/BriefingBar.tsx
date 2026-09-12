import { useState } from 'react'
import type { Briefing, BriefingAction } from '../types/contracts'

const EXAMPLES = [
  'Can I buy $2,000 of inventory?',
  'What if my payout is late?',
  'Where could cash get tight?',
]

/**
 * The opening briefing: what a consultant would say in three sentences, then
 * the one thing to click.
 *
 * The previous screen put the plan and a hypothetical side by side at equal
 * weight, which read as two competing paragraphs and made the app look like it
 * had opened in a delay it had not. There is one paragraph now; a what-if only
 * appears once the owner asks for one, and announces itself when it does.
 */
export function BriefingBar({
  briefing,
  busy,
  onSeeWhy,
  onCheckPurchase,
  onAsk,
  onReset,
}: {
  briefing: Briefing
  busy: boolean
  onSeeWhy: (a: BriefingAction) => void
  onCheckPurchase: () => void
  onAsk: (question: string) => void
  onReset: () => void
}) {
  const [text, setText] = useState('')
  const scenario = briefing.mode === 'scenario'
  const atRisk = briefing.status === 'at_risk'

  return (
    <section aria-label="Briefing" className="shrink-0 border-b border-hair bg-white">
      {scenario && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[#e6c7ae] bg-[#fdf3ec] px-6 py-1.5">
          <span className="rounded bg-[#8a4a1f] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.07em] text-white">
            What-if
          </span>
          <span className="text-[12.5px] font-medium text-[#8a4a1f]">
            {briefing.scenarioLabel}
          </span>
          <span className="text-[11.5px] text-[#8a4a1f]/85">
            Nothing here has been applied to your modelled plan.
          </span>
          <button
            type="button"
            onClick={onReset}
            className="ml-auto rounded-md bg-[#8a4a1f] px-3 py-1 text-[12px] font-medium text-white"
          >
            Back to my plan
          </button>
        </div>
      )}

      <div className="mx-auto flex max-w-[1560px] flex-wrap items-start gap-x-10 gap-y-4 px-6 py-4">
        <div className="min-w-[340px] max-w-[62ch] flex-1">
          <p className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-[7px] inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: atRisk ? '#a35b2a' : '#15803d' }}
            />
            <span className="text-[20px] font-semibold leading-snug tracking-[-0.012em] text-ink">
              {briefing.lead}
            </span>
          </p>
          <p className="mt-1.5 pl-[22px] text-[14px] leading-relaxed text-[#3d4757]">
            {briefing.detail}
            {briefing.watch && <> {briefing.watch}</>}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 pl-[22px]">
            {briefing.seeWhy && (
              <button
                type="button"
                onClick={() => onSeeWhy(briefing.seeWhy!)}
                disabled={busy}
                className="rounded-md bg-[#1b2b4b] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#25396180] disabled:opacity-50"
              >
                {briefing.seeWhy.label}
              </button>
            )}
            <button
              type="button"
              onClick={onCheckPurchase}
              disabled={busy}
              className="rounded-md border border-[#c8d9f7] bg-[#eef4ff] px-4 py-2 text-[13px] font-semibold text-[#26457f] hover:bg-[#e3edff] disabled:opacity-50"
            >
              Check a purchase
            </button>
          </div>
        </div>

        <div className="min-w-[320px] flex-1">
          <label
            htmlFor="decision-input"
            className="block text-[13px] font-semibold text-ink"
          >
            What decision are you making?
          </label>
          <form
            className="mt-1.5 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) {
                onAsk(text.trim())
                setText('')
              }
            }}
          >
            <input
              id="decision-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="Type a question, or describe what you're planning…"
              className="min-w-0 flex-1 rounded-md border border-hair bg-white px-3 py-2 text-[13px] outline-none placeholder:text-[#9aa4b2] focus:border-[#c8d9f7]"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="shrink-0 rounded-md bg-[#1b2b4b] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Ask
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onAsk(q)}
                className="rounded-full border border-hair bg-white px-2.5 py-1 text-[11.5px] text-[#3d4757] hover:border-[#c8d9f7] hover:text-[#26457f]"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
