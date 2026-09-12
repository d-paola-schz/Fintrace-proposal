import type { ScenarioRequest, WorkspaceResponse } from '../types/contracts'
import { ProvenanceChip } from './Tone'
import { usd } from '../lib/format'

/**
 * The figures the demo ships as constants, made editable.
 *
 * Everything here was hardcoded: the opening balance, the commission, the
 * conversion rate, and each scheduled payment. Supplying a value replaces it
 * and flips its badge from "demo assumption" to "you entered", so the source
 * labelling stays true as the scenario stops being ours and becomes theirs.
 */
export function AssumptionEditor({
  ws,
  scenario,
  onChange,
}: {
  ws: WorkspaceResponse
  scenario: ScenarioRequest
  onChange: (req: ScenarioRequest) => void
}) {
  const ov = scenario.assumptions ?? {}
  const byID = Object.fromEntries(ws.assumptions.map((a) => [a.id, a]))

  const patch = (next: Partial<NonNullable<ScenarioRequest['assumptions']>>) =>
    onChange({ ...scenario, assumptions: { ...ov, ...next } })

  const patchOutflow = (id: string, next: Record<string, unknown>) =>
    patch({ outflows: { ...(ov.outflows ?? {}), [id]: { ...(ov.outflows?.[id] ?? {}), ...next } } })

  const dollars = (cents: number) => Math.round(cents / 100)
  const currentBalance = ov.openingBalanceCents ?? ws.scenario.baselineBalanceCents
  const outflowIDs = ['asm-supplier', 'asm-ads', 'asm-rent']

  return (
    <div className="space-y-2">
      <Row
        label="Opening balance"
        provenance={byID['asm-baseline']?.provenance}
        hint="Cash on hand at the start of the projection."
      >
        <span className="flex items-center gap-1">
          <span className="text-[11px] text-muted">$</span>
          <input
            type="number" min={0} step={100} value={dollars(currentBalance)}
            onChange={(e) => patch({ openingBalanceCents: Math.max(0, Number(e.target.value)) * 100 })}
            className="tnum w-24 rounded border border-hair px-1.5 py-[3px] text-[11.5px] outline-none focus:border-[#c8d9f7]"
          />
        </span>
      </Row>

      <Row
        label="Marketplace commission"
        provenance={byID['asm-fee']?.provenance}
        hint="Olist publishes no fee. This is what the payout is reduced by."
      >
        <span className="flex items-center gap-1">
          <input
            type="number" min={0} max={90} step={1}
            value={ov.marketplaceFeePct ?? 20}
            onChange={(e) => patch({ marketplaceFeePct: Number(e.target.value) })}
            className="tnum w-16 rounded border border-hair px-1.5 py-[3px] text-[11.5px] outline-none focus:border-[#c8d9f7]"
          />
          <span className="text-[11px] text-muted">%</span>
        </span>
      </Row>

      <Row
        label="Conversion rate"
        provenance={byID['asm-fx']?.provenance}
        hint="Sales are recorded in BRL. Not a market rate for any date."
      >
        <span className="flex items-center gap-1">
          <span className="text-[11px] text-muted">R$</span>
          <input
            type="number" min={0.1} max={100} step={0.1}
            value={ov.brlPerUsd ?? 5}
            onChange={(e) => patch({ brlPerUsd: Number(e.target.value) })}
            className="tnum w-16 rounded border border-hair px-1.5 py-[3px] text-[11.5px] outline-none focus:border-[#c8d9f7]"
          />
          <span className="text-[11px] text-muted">= $1</span>
        </span>
      </Row>

      {outflowIDs.map((id) => {
        const a = byID[id]
        if (!a) return null
        const o = ov.outflows?.[id] ?? {}
        const event = ws.events.find((e) => e.id === 'evt-' + id)
        const amount = o.amountCents ?? event?.amountCents ?? 0
        const date = o.date ?? event?.date ?? ws.today
        return (
          <Row key={id} label={a.label} provenance={a.provenance} hint={a.detail}>
            {o.removed ? (
              <button
                type="button"
                onClick={() => patchOutflow(id, { removed: false })}
                className="rounded border border-hair px-2 py-[3px] text-[11px] text-[#3d4757]"
              >
                Put it back
              </button>
            ) : (
              <span className="flex items-center gap-1">
                <span className="text-[11px] text-muted">−$</span>
                <input
                  type="number" min={0} step={50} value={Math.abs(dollars(amount))}
                  onChange={(e) =>
                    patchOutflow(id, { amountCents: -Math.abs(Number(e.target.value)) * 100 })
                  }
                  className="tnum w-20 rounded border border-hair px-1.5 py-[3px] text-[11.5px] outline-none focus:border-[#c8d9f7]"
                />
                <input
                  type="date" value={date} min={ws.today}
                  onChange={(e) => patchOutflow(id, { date: e.target.value })}
                  className="tnum rounded border border-hair px-1.5 py-[3px] text-[11px] outline-none focus:border-[#c8d9f7]"
                />
                <button
                  type="button"
                  onClick={() => patchOutflow(id, { removed: true })}
                  title="This payment does not apply to me"
                  className="rounded px-1 text-[13px] leading-none text-muted hover:text-[#8a4a1f]"
                >
                  ×
                </button>
              </span>
            )}
          </Row>
        )
      })}

      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] leading-snug text-muted">
          Anything you change here is yours, and its badge says so. The reserve and the payout
          date are on the control strip above the timeline.
        </p>
        {scenario.assumptions && (
          <button
            type="button"
            onClick={() => onChange({ ...scenario, assumptions: null })}
            className="shrink-0 rounded border border-hair px-2 py-1 text-[11px] text-[#3d4757] hover:border-[#c8d9f7]"
          >
            Restore defaults
          </button>
        )}
      </div>
    </div>
  )
}

function Row({
  label,
  provenance,
  hint,
  children,
}: {
  label: string
  provenance?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-hair bg-white p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-ink">{label}</p>
          {hint && <p className="mt-0.5 text-[10px] leading-snug text-muted">{hint}</p>}
        </div>
        {provenance && (
          <ProvenanceChip provenance={provenance as never} />
        )}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

/** A one-line summary for the collapsed state. */
export function assumptionSummary(ws: WorkspaceResponse): string {
  const mine = ws.assumptions.filter((a) => a.provenance === 'user_entered').length
  return `${usd(ws.scenario.baselineBalanceCents)} opening · ${mine} figure${mine === 1 ? '' : 's'} yours`
}
