import { useMemo } from 'react'
import type { ChainNode, ScenarioRequest, WorkspaceResponse } from '../types/contracts'
import { STATUS_LABEL, TONE_WORD, usd } from '../lib/format'
import { ruleName } from '../lib/sources'
import { ClaimRow, SourceLink } from './ClaimRow'
import { ContextChart } from './ContextChart'
import { CardShell, DeckPanel, Eyebrow, type DeckSlide } from './DeckPanel'
import { ProvenanceChip, TONE_STYLE, ToneMark } from './Tone'

/**
 * Where the figure came from. This must follow the claim's provenance, not the
 * node's status: an "observed" node can rest on a modelled assumption, and
 * calling that "recorded in the data" would be false.
 */
const ORIGIN_MEANING: Record<string, string> = {
  olist_historical: 'Recorded in the marketplace data.',
  nessie_sandbox: 'From the sandbox bank records.',
  derived: 'Calculated by Preflight from the figures behind it.',
  user_entered: 'A figure you entered.',
  demo_assumption: 'A modelled assumption for this demonstration, not a record.',
}

/** What kind of statement the step is making. */
const STATUS_MEANING: Record<string, string> = {
  observed: 'Observed',
  inferred: 'Worked out from the records',
  possible: 'Conditional — it has not happened',
  action: 'Something you could choose to do',
}

type SlideKind = 'explain' | 'matters' | 'act' | 'math' | 'debrief'

const SLIDE_LABEL: Record<SlideKind, string> = {
  explain: 'What happened',
  matters: 'Why it matters',
  act: 'What you could do',
  math: 'Show the math',
  debrief: 'The whole step',
}

/**
 * Which cards this step actually has.
 *
 * A step with no proposals does not get an empty "what you could do" card, and
 * a step with no headline figure does not get an empty "why it matters" one.
 * The deck is as long as the step has something to say.
 */
function slidesFor(node: ChainNode): SlideKind[] {
  const out: SlideKind[] = ['explain']
  if (node.claims?.[0]) out.push('matters')
  if ((node.responseOptions ?? []).length > 0) out.push('act')
  out.push('math', 'debrief')
  return out
}

/**
 * The detail for one step, as a small deck rather than one long column.
 *
 * A single scrolling panel asked the owner to find the part they wanted inside
 * a page of prose, tables and controls. The same content is now dealt out one
 * card at a time — what happened, why it matters, what could be done, the
 * workings, then the whole step together — and the arrow keys walk it. Reaching
 * the end of a step's cards carries on into the next link of the chain, because
 * that is what a chain is.
 */
export function NodeDrawer({
  ws,
  width,
  startAtEnd,
  node,
  scenario,
  onApplyScenario,
  onSelectNode,
  onClose,
}: {
  ws: WorkspaceResponse
  /** Reserved width, including the gap the card floats inside. */
  width: number
  /** Open on the last card, because this step was reached by walking back. */
  startAtEnd: boolean
  node: ChainNode
  scenario: ScenarioRequest
  onApplyScenario: (req: ScenarioRequest) => void
  onSelectNode: (id: string, atEnd?: boolean) => void
  onClose: () => void
}) {
  const chain = ws.chains.find((c) => c.id === node.chainId)
  const t = TONE_STYLE[node.tone]
  const assumptions = (ws.assumptions ?? []).filter((a) =>
    (node.assumptionRefs ?? []).includes(a.id),
  )
  const impact = node.claims?.[0]

  const kinds = useMemo(() => slidesFor(node), [node])

  const nodes = useMemo(() => chain?.nodes ?? [], [chain])
  const nodeAt = nodes.findIndex((n) => n.id === node.id)

  // Walking left out of a deck lands on the previous step's last card, so the
  // two directions are continuous. The workspace owns that flag, because it
  // outlives this component: selecting the neighbour unmounts this one.
  const pastEnd = (d: 1 | -1) => {
    const neighbour = nodes[nodeAt + d]
    if (!neighbour) return false
    onSelectNode(neighbour.id, d === -1)
    return true
  }


  const explanation = (
    <p className="text-[14px] leading-relaxed text-[#1b2635]">{node.explanation}</p>
  )

  // The deck prints the card's name above it, so the card repeats it only in
  // the debrief, where several cards sit together and need telling apart.
  const whyItMatters = (labelled: boolean) => impact ? (
    <CardShell>
      {labelled && <Eyebrow>Why it matters</Eyebrow>}
      <p className={`tnum text-[22px] font-semibold leading-tight text-ink ${labelled ? 'mt-1.5' : ''}`}>
        {impact.display}
      </p>
      <p className="mt-0.5 text-[12px] text-muted">{impact.label}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <ProvenanceChip provenance={impact.provenance} />
        <span className="text-[10.5px] text-muted">{ORIGIN_MEANING[impact.provenance] ?? ''}</span>
        <span className="text-[10.5px] text-muted">· {STATUS_MEANING[node.status]}</span>
      </div>
      {impact.note && (
        <p className="mt-2 text-[11px] leading-snug text-muted">{impact.note}</p>
      )}
    </CardShell>
  ) : null

  const whatYouCouldDo = (node.responseOptions ?? []).length > 0 && (
    <div className="space-y-2">
      {(node.responseOptions ?? []).map((o) => (
        <div key={o.id} className="rounded-xl border border-[#d9caec] bg-[#f9f6fd]/80 p-3.5">
          <p className="text-[13px] font-semibold text-ink">{o.label}</p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">{o.detail}</p>
          {o.action === 'adjust_payout_delay' && o.value && (
            <button
              type="button"
              onClick={() => onApplyScenario({ ...scenario, payoutDelayDays: Number(o.value) })}
              className="mt-2.5 rounded bg-[#54397e] px-3.5 py-2 text-[12px] font-medium text-white"
            >
              Try a {o.value}-day delay
            </button>
          )}
        </div>
      ))}
      <p className="text-[10px] italic leading-snug text-muted">
        Proposals only. Preflight never contacts a supplier or moves money.
      </p>
    </div>
  )

  const sourcesBlock = (
    <div>
      <Eyebrow>Where these figures come from</Eyebrow>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        Open any one to see the record behind it.
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-1.5">
        {(node.sourceRefs ?? []).map((r) => (
          <SourceLink key={r} id={r} />
        ))}
      </div>
    </div>
  )

  const theMath = (
    <div className="space-y-3">
      {node.chart && <ContextChart spec={node.chart} />}
      {(node.claims ?? []).length > 0 && (
        <ul className="rounded-xl border border-hair bg-white/80 px-3">
          {(node.claims ?? []).map((c) => (
            <ClaimRow key={c.id} claim={c} />
          ))}
        </ul>
      )}

      {assumptions.length > 0 && (
        <div>
          <Eyebrow>Assumptions this rests on</Eyebrow>
          <ul className="mt-1.5 space-y-1.5">
            {assumptions.map((a) => (
              <li key={a.id} className="rounded-xl border border-hair bg-white/80 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] font-semibold text-ink">{a.label}</p>
                  <ProvenanceChip provenance={a.provenance} />
                </div>
                {a.value && <p className="tnum mt-0.5 text-[11.5px] text-[#3d4757]">{a.value}</p>}
                <p className="mt-1 text-[10.5px] leading-snug text-muted">{a.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sourcesBlock}

      <p className="text-[10.5px] leading-snug text-muted">
        Worked out by Preflight's own rules, not by a language model. Lowest projected cash on
        the current plan is <span className="tnum">{usd(ws.scenario.lowestCents)}</span>.
      </p>
      <p className="text-[9.5px] text-muted" title={node.ruleId}>
        Rule: {ruleName(node.ruleId)}
      </p>
    </div>
  )

  const slides: DeckSlide[] = kinds.map((k) => ({
    key: k,
    label: SLIDE_LABEL[k],
    content:
      k === 'explain' ? explanation
      : k === 'matters' ? whyItMatters(false)
      : k === 'act' ? whatYouCouldDo
      : k === 'math' ? theMath
      : (
        <div className="space-y-3.5">
          {explanation}
          {whyItMatters(true)}
          {whatYouCouldDo}
          {sourcesBlock}
        </div>
      ),
  }))

  const header = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.07em] ${t.chip}`}
          >
            <ToneMark tone={node.tone} size={8} />
            {TONE_WORD[node.tone]} · {STATUS_LABEL[node.status]}
          </span>
          {chain && (
            <p className="mt-1.5 text-[11px] text-muted">
              {chain.title} · step {node.sequence} of {chain.nodes.length}
            </p>
          )}
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
        {node.title}
      </h2>

      {chain && (
        <div className="mt-2.5 flex gap-1">
          {chain.nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelectNode(n.id)}
              aria-current={n.id === node.id}
              className={`min-w-0 flex-1 rounded border px-2 py-1.5 text-left text-[10.5px] ${
                n.id === node.id
                  ? `${TONE_STYLE[n.tone].chip} font-semibold`
                  : 'border-hair bg-white/70 text-muted hover:border-[#c8d9f7]'
              }`}
            >
              <span className="flex items-center gap-1">
                <ToneMark tone={n.tone} size={7} />
                {String(n.sequence).padStart(2, '0')}
              </span>
              <span className="mt-0.5 block truncate">{n.title}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )

  return (
    <DeckPanel
      width={width}
      ariaLabel={node.title}
      header={header}
      slides={slides}
      resetKey={node.id}
      startAtEnd={startAtEnd}
      hint="← → to move. Past the last card carries on to the next link."
      accent={t.stroke}
      tint={t.fill}
      askScenario={scenario}
      askNodeId={node.id}
      askPlaceholder="Ask about this step…"
      askSuggestions={node.suggestedAsks}
      onApplyScenario={onApplyScenario}
      onClose={onClose}
      onPastEnd={pastEnd}
    />
  )
}
