import type { Outlook, OutlookLine } from '../types/contracts'
import { TONE_STYLE, ToneMark } from './Tone'
import { usd } from '../lib/format'

/**
 * The first thing the owner reads, and the answer to "what is happening?".
 *
 * The plan and the conditional are presented as two separate statements with
 * their own headings, because they are two different forecasts. Running them
 * together — "cash holds" next to "cash falls below" — reads as the product
 * contradicting itself, which is what it used to do.
 */
export function OutlookBar({
  outlook,
  onExploreDelay,
  onAsk,
  onScenario,
  busy,
}: {
  outlook: Outlook
  onExploreDelay: (line: OutlookLine) => void
  onAsk: () => void
  onScenario: () => void
  busy: boolean
}) {
  const onTrack = outlook.status === 'on_track'

  return (
    <section
      aria-label="Cash outlook"
      className="shrink-0 border-b border-hair bg-white px-6 py-3.5"
    >
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-start gap-x-8 gap-y-3">
        <div className="min-w-[300px] flex-1">
          <h1 className="flex items-center gap-2 text-[19px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: onTrack ? '#15803d' : TONE_STYLE.risk.stroke }}
            />
            {outlook.headline}
          </h1>
          <Line line={outlook.plan} />
        </div>

        {outlook.conditional && (
          <div className="min-w-[300px] flex-1 border-l border-hair pl-8">
            <Line line={outlook.conditional} />
            {outlook.conditional.scenarioDelayDays ? (
              <button
                type="button"
                onClick={() => onExploreDelay(outlook.conditional!)}
                disabled={busy}
                className="mt-2 rounded-md bg-[#8a4a1f] px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50"
              >
                Explore the delay
              </button>
            ) : null}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2 self-center">
          <button
            type="button"
            onClick={onAsk}
            className="rounded-md border border-[#c8d9f7] bg-[#eef4ff] px-3.5 py-2 text-[12.5px] font-medium text-[#26457f] hover:bg-[#e3edff]"
          >
            Ask Preflight
          </button>
          <button
            type="button"
            onClick={onScenario}
            className="rounded-md border border-hair bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#3d4757] hover:border-[#c8d9f7]"
          >
            Try a scenario
          </button>
        </div>
      </div>
    </section>
  )
}

/** `kind` decides the treatment, never which column the line happens to be in. */
function Line({ line }: { line: OutlookLine }) {
  const conditional = line.kind === 'conditional'
  return (
    <div className="mt-1.5">
      <p className="flex items-center gap-1.5">
        {conditional && <ToneMark tone={line.tone} size={9} />}
        <span
          className={`text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
            conditional ? 'text-[#8a4a1f]' : 'text-muted'
          }`}
        >
          {line.label}
        </span>
        {line.badge && (
          <span
            className={`rounded px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-[0.05em] ${
              conditional || line.badge === 'not applied'
                ? 'bg-[#fdf3ec] text-[#8a4a1f]'
                : 'bg-[#eef4ff] text-[#26457f]'
            }`}
          >
            {line.badge}
          </span>
        )}
      </p>
      <p className="mt-1 max-w-[46ch] text-[13.5px] leading-relaxed text-[#22303f]">
        {line.sentence}
      </p>
      <p className="tnum mt-1 text-[11.5px] text-muted">
        Lowest point {usd(line.amountCents)}
      </p>
    </div>
  )
}
