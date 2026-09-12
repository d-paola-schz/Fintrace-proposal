import type {
  ChainNode, FinancialEvent, ScenarioRequest, WorkspaceResponse,
} from '../types/contracts'
import { STATUS_LABEL, TONE_WORD, longDate, shortDate, usd } from '../lib/format'
import { ClaimRow, SourceLink } from './ClaimRow'
import { ContextChart } from './ContextChart'
import { Chat } from './Chat'
import { ProvenanceChip, TONE_STYLE, ToneMark } from './Tone'

/** The contextual panel. Selection, title, chart, evidence and chat always
 *  describe the same node — never two different things at once. */
export function NodeEvidencePanel({
  ws,
  node,
  event,
  scenario,
  onApplyScenario,
  onSelectNode,
  onClose,
}: {
  ws: WorkspaceResponse
  node: ChainNode | null
  event: FinancialEvent | null
  scenario: ScenarioRequest
  onApplyScenario: (req: ScenarioRequest) => void
  onSelectNode: (id: string) => void
  onClose: () => void
}) {
  if (node) {
    return (
      <NodePanel
        ws={ws}
        node={node}
        scenario={scenario}
        onApplyScenario={onApplyScenario}
        onSelectNode={onSelectNode}
        onClose={onClose}
      />
    )
  }
  if (event) {
    return <EventPanel event={event} onClose={onClose} />
  }
  return <OverviewPanel ws={ws} scenario={scenario} onApplyScenario={onApplyScenario} />
}

function PanelShell({
  eyebrow, title, onClose, children,
}: {
  eyebrow: React.ReactNode
  title: React.ReactNode
  onClose?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-hair px-4 pb-3 pt-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">{eyebrow}</div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close and return to the overview"
              className="shrink-0 rounded px-1.5 text-[15px] leading-none text-muted hover:text-ink"
            >
              ×
            </button>
          )}
        </div>
        <h2 className="mt-1.5 text-[16px] font-semibold leading-snug text-ink">{title}</h2>
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
      {children}
    </h3>
  )
}

function NodePanel({
  ws, node, scenario, onApplyScenario, onSelectNode, onClose,
}: {
  ws: WorkspaceResponse
  node: ChainNode
  scenario: ScenarioRequest
  onApplyScenario: (req: ScenarioRequest) => void
  onSelectNode: (id: string) => void
  onClose: () => void
}) {
  const chain = ws.chains.find((c) => c.id === node.chainId)
  const t = TONE_STYLE[node.tone]
  const assumptions = (ws.assumptions ?? []).filter((a) =>
    (node.assumptionRefs ?? []).includes(a.id),
  )

  return (
    <PanelShell
      onClose={onClose}
      eyebrow={
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.07em] ${t.chip}`}
          >
            <ToneMark tone={node.tone} size={8} />
            {TONE_WORD[node.tone]}
          </span>
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">
            {STATUS_LABEL[node.status]}
          </span>
          {chain && (
            <span className="tnum text-[10.5px] text-muted">
              {chain.title} · {node.sequence} of {(chain.nodes ?? []).length}
            </span>
          )}
        </div>
      }
      title={node.title}
    >
      {/* step through the chain without losing your place */}
      {chain && (
        <div className="mb-3 flex gap-1">
          {(chain.nodes ?? []).map((n) => (
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
              <span className="mt-0.5 block truncate">{TONE_WORD[n.tone]}</span>
            </button>
          ))}
        </div>
      )}

      <p className="text-[13px] leading-relaxed text-[#22303f]">{node.explanation}</p>

      {node.chart && (
        <div className="mt-3">
          <ContextChart spec={node.chart} />
        </div>
      )}

      {(node.claims ?? []).length > 0 && (
        <section className="mt-4">
          <SectionTitle>Evidence</SectionTitle>
          <ul className="rounded-lg border border-hair bg-white px-3">
            {(node.claims ?? []).map((c) => (
              <ClaimRow key={c.id} claim={c} />
            ))}
          </ul>
        </section>
      )}

      {assumptions.length > 0 && (
        <section className="mt-4">
          <SectionTitle>Assumptions behind this</SectionTitle>
          <ul className="space-y-1.5">
            {assumptions.map((a) => (
              <li key={a.id} className="rounded-lg border border-hair bg-white p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] font-semibold text-ink">{a.label}</p>
                  <ProvenanceChip provenance={a.provenance} />
                </div>
                {a.value && <p className="tnum mt-0.5 text-[11.5px] text-[#3d4757]">{a.value}</p>}
                <p className="mt-1 text-[10.5px] leading-snug text-muted">{a.detail}</p>
                {a.editable && (
                  <p className="mt-1 text-[10px] font-medium text-[#26457f]">
                    You can change this in the controls above the timeline.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(node.responseOptions ?? []).length > 0 && (
        <section className="mt-4">
          <SectionTitle>What you could do</SectionTitle>
          <ul className="space-y-1.5">
            {(node.responseOptions ?? []).map((o) => (
              <li key={o.id} className="rounded-lg border border-hair bg-white p-2.5">
                <p className="text-[12px] font-semibold text-ink">{o.label}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{o.detail}</p>
                {o.action === 'adjust_payout_delay' && o.value && (
                  <button
                    type="button"
                    onClick={() =>
                      onApplyScenario({ ...scenario, payoutDelayDays: Number(o.value) })
                    }
                    className="mt-1.5 rounded bg-[#1b2b4b] px-2.5 py-1 text-[11px] font-medium text-white"
                  >
                    Apply a {o.value}-day delay
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] italic leading-snug text-muted">
            These are proposals. Preflight never contacts a supplier, moves money, or changes
            anything outside this screen.
          </p>
        </section>
      )}

      <section className="mt-4 border-t border-hair pt-3">
        <SectionTitle>Ask about this node</SectionTitle>
        <Chat
          nodeId={node.id}
          scenario={scenario}
          suggestions={node.suggestedAsks}
          placeholder="Ask about this node…"
          onApplyScenario={onApplyScenario}
          compact
        />
      </section>

      <p className="mt-3 text-[10px] text-muted">
        Rule <span className="font-mono">{node.ruleId}</span> · sources{' '}
        {(node.sourceRefs ?? []).length > 0 ? (
          <span className="inline-flex flex-wrap gap-1 align-middle">
            {(node.sourceRefs ?? []).slice(0, 4).map((r) => (
              <SourceLink key={r} id={r} />
            ))}
          </span>
        ) : (
          'none'
        )}
      </p>
    </PanelShell>
  )
}

function EventPanel({ event, onClose }: { event: FinancialEvent; onClose: () => void }) {
  return (
    <PanelShell
      onClose={onClose}
      eyebrow={
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceChip provenance={event.provenance} />
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">
            {event.certainty}
          </span>
          <span className="tnum text-[10.5px] text-muted">{longDate(event.date)}</span>
        </div>
      }
      title={event.label}
    >
      <p className="tnum text-[22px] font-semibold text-ink">{usd(event.amountCents)}</p>
      <p
        className={`mt-1 inline-block rounded px-1.5 py-[2px] text-[10.5px] font-medium ${
          event.affectsCash
            ? 'bg-[#eef4ff] text-[#26457f]'
            : 'bg-[#f3f5f8] text-[#4a5566]'
        }`}
      >
        {event.affectsCash
          ? 'Moves the bank balance'
          : 'Does not move the bank balance'}
      </p>
      {event.detail && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-[#22303f]">{event.detail}</p>
      )}

      {(event.claims ?? []).length > 0 && (
        <section className="mt-4">
          <SectionTitle>Evidence</SectionTitle>
          <ul className="rounded-lg border border-hair bg-white px-3">
            {(event.claims ?? []).map((c) => (
              <ClaimRow key={c.id} claim={c} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4">
        <SectionTitle>Sources</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {(event.sourceRefs ?? []).map((r) => (
            <SourceLink key={r} id={r} />
          ))}
        </div>
      </section>
    </PanelShell>
  )
}

function OverviewPanel({
  ws, scenario, onApplyScenario,
}: {
  ws: WorkspaceResponse
  scenario: ScenarioRequest
  onApplyScenario: (req: ScenarioRequest) => void
}) {
  const s = ws.scenario
  return (
    <PanelShell
      eyebrow={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted">
            {ws.business.displayName}
          </span>
          <span className="text-[10.5px] text-muted">{ws.business.location}</span>
        </div>
      }
      title={s.breachesReserve ? 'Your reserve is at risk' : 'Where your cash stands'}
    >
      <p className="text-[13px] leading-relaxed text-[#22303f]">{s.verdict}</p>

      <section className="mt-3">
        <SectionTitle>The numbers</SectionTitle>
        <ul className="rounded-lg border border-hair bg-white px-3">
          {(s.claims ?? []).map((c) => (
            <ClaimRow key={c.id} claim={c} />
          ))}
        </ul>
      </section>

      <section className="mt-4">
        <SectionTitle>What this cannot tell you</SectionTitle>
        <ul className="space-y-1.5">
          {(s.missingInputs ?? []).map((m) => (
            <li key={m.field} className="rounded-lg border border-hair bg-white p-2.5">
              <p className="text-[11.5px] font-semibold text-ink">{m.question}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{m.whyItMatters}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4">
        <SectionTitle>Business</SectionTitle>
        <div className="rounded-lg border border-hair bg-white p-2.5">
          <p className="text-[11.5px] text-[#3d4757]">{ws.business.category}</p>
          <p className="tnum mt-1 text-[10.5px] text-muted">{ws.business.sourceWindow}</p>
          <p className="mt-1.5 text-[10.5px] leading-snug text-muted">
            {ws.business.timeShiftNote}
          </p>
          <div className="mt-2">
            <SourceLink id="src-olist-seller" />
          </div>
        </div>
      </section>

      <section className="mt-4 border-t border-hair pt-3">
        <SectionTitle>Ask about the business</SectionTitle>
        <Chat
          scenario={scenario}
          placeholder="Ask anything about your cash…"
          suggestions={[
            'How is the business doing?',
            'Why is cash tight when sales are up?',
            'Could I spend $3,000 on ads before the end of the month?',
          ]}
          onApplyScenario={onApplyScenario}
        />
      </section>

      <p className="mt-3 text-[10px] leading-snug text-muted">
        Window {shortDate(s.startDate)} – {shortDate(s.endDate)} · {ws.displayCurrency} ·{' '}
        {ws.timezone}
      </p>
    </PanelShell>
  )
}
