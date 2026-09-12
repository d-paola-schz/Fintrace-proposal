import { useEffect, useRef } from 'react'
import type { ChainNode, ScenarioRequest, WorkspaceResponse } from '../types/contracts'
import { STATUS_LABEL, TONE_WORD, usd } from '../lib/format'
import { ClaimRow, SourceLink } from './ClaimRow'
import { ContextChart } from './ContextChart'
import { Chat } from './Chat'
import { Section } from './Section'
import { ProvenanceChip, TONE_STYLE, ToneMark } from './Tone'

const STATUS_MEANING: Record<string, string> = {
  observed: 'This is recorded in the data.',
  inferred: 'Worked out from the records.',
  possible: 'A conditional outcome — it has not happened.',
  action: 'Something you could choose to do.',
}

/**
 * The detail for one node, as an overlay rather than a permanent column.
 *
 * It used to be a sidebar that compressed the timeline whether or not anything
 * was selected. Now it appears only when the owner opens a node, and it answers
 * three questions in order — what happened, why it matters, what can be done —
 * with the workings kept underneath rather than removed.
 */
export function NodeDrawer({
  ws,
  node,
  scenario,
  onApplyScenario,
  onSelectNode,
  onClose,
}: {
  ws: WorkspaceResponse
  node: ChainNode
  scenario: ScenarioRequest
  onApplyScenario: (req: ScenarioRequest) => void
  onSelectNode: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chain = ws.chains.find((c) => c.id === node.chainId)
  const t = TONE_STYLE[node.tone]
  const assumptions = (ws.assumptions ?? []).filter((a) =>
    (node.assumptionRefs ?? []).includes(a.id),
  )

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const impact = node.claims?.[0]

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={node.title}
      className="absolute right-0 top-0 z-30 flex h-full w-[430px] max-w-[92vw] flex-col border-l border-hair bg-white shadow-[-12px_0_32px_rgba(15,23,38,0.08)] outline-none"
    >
      <header className="shrink-0 border-b border-hair px-5 pb-3 pt-4">
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
            className="shrink-0 rounded px-2 py-1 text-[16px] leading-none text-muted hover:bg-[#f3f5f8] hover:text-ink"
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
                className={`flex-1 rounded border px-1.5 py-1 text-left text-[10px] ${
                  n.id === node.id
                    ? `${TONE_STYLE[n.tone].chip} font-semibold`
                    : 'border-hair bg-white text-muted hover:border-[#c8d9f7]'
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
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* 1 — What happened */}
        <p className="text-[14px] leading-relaxed text-[#1b2635]">{node.explanation}</p>

        {/* 2 — Why it matters */}
        {impact && (
          <div className="mt-3.5 rounded-lg border border-hair bg-[#f7f9fb] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
              Why it matters
            </p>
            <p className="tnum mt-1 text-[17px] font-semibold leading-tight text-ink">
              {impact.display}
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted">{impact.label}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ProvenanceChip provenance={impact.provenance} />
              <span className="text-[10.5px] text-muted">{STATUS_MEANING[node.status]}</span>
            </div>
          </div>
        )}

        {/* 3 — What can I do */}
        {(node.responseOptions ?? []).length > 0 && (
          <Section title="What you could do" tone="action">
            <ul className="space-y-1.5">
              {(node.responseOptions ?? []).map((o) => (
                <li key={o.id} className="rounded-lg border border-[#d9caec] bg-[#f9f6fd] p-2.5">
                  <p className="text-[12.5px] font-semibold text-ink">{o.label}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted">{o.detail}</p>
                  {o.action === 'adjust_payout_delay' && o.value && (
                    <button
                      type="button"
                      onClick={() =>
                        onApplyScenario({ ...scenario, payoutDelayDays: Number(o.value) })
                      }
                      className="mt-2 rounded bg-[#54397e] px-2.5 py-1 text-[11.5px] font-medium text-white"
                    >
                      Try a {o.value}-day delay
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[10px] italic leading-snug text-muted">
              Proposals only. Preflight never contacts a supplier or moves money.
            </p>
          </Section>
        )}

        {/* 4 — Show the math */}
        <Section title="Show the math" collapsible defaultOpen={false}>
          {node.chart && (
            <div className="mb-2">
              <ContextChart spec={node.chart} />
            </div>
          )}
          {(node.claims ?? []).length > 0 && (
            <ul className="rounded-lg border border-hair bg-white px-3">
              {(node.claims ?? []).map((c) => (
                <ClaimRow key={c.id} claim={c} />
              ))}
            </ul>
          )}

          {assumptions.length > 0 && (
            <>
              <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                Assumptions this rests on
              </p>
              <ul className="space-y-1.5">
                {assumptions.map((a) => (
                  <li key={a.id} className="rounded-lg border border-hair bg-white p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12px] font-semibold text-ink">{a.label}</p>
                      <ProvenanceChip provenance={a.provenance} />
                    </div>
                    {a.value && (
                      <p className="tnum mt-0.5 text-[11.5px] text-[#3d4757]">{a.value}</p>
                    )}
                    <p className="mt-1 text-[10.5px] leading-snug text-muted">{a.detail}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            Sources
          </p>
          <div className="flex flex-wrap items-start gap-1.5">
            {(node.sourceRefs ?? []).map((r) => (
              <SourceLink key={r} id={r} />
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted">
            Generated by rule <span className="font-mono">{node.ruleId}</span>, not by a language
            model. Lowest projected cash on the current plan is{' '}
            <span className="tnum">{usd(ws.scenario.lowestCents)}</span>.
          </p>
        </Section>

        {/* 5 — Ask about this */}
        <Section title="Ask about this step" tone="action">
          <Chat
            nodeId={node.id}
            scenario={scenario}
            suggestions={node.suggestedAsks}
            placeholder="Ask about this step…"
            onApplyScenario={onApplyScenario}
            compact
          />
        </Section>
      </div>
    </aside>
  )
}
