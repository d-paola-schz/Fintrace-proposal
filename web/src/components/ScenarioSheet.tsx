import { useState } from 'react'
import type { ScenarioRequest, WorkspaceResponse } from '../types/contracts'
import { addDays, shortDate, usd } from '../lib/format'
import { Sheet } from './Sheet'
import { AssumptionEditor } from './AssumptionEditor'
import { Section } from './Section'

/**
 * One place to ask "what if", instead of a slider, a number box and a button
 * sitting permanently above the timeline.
 *
 * Every change is previewed against the current plan before it is applied, so
 * the owner sees the difference rather than watching the workspace silently
 * change underneath them.
 */
export function ScenarioSheet({
  ws,
  scenario,
  busy,
  onPreview,
  onClose,
  onReset,
}: {
  ws: WorkspaceResponse
  scenario: ScenarioRequest
  busy: boolean
  onPreview: (req: ScenarioRequest) => void
  onClose: () => void
  onReset: () => void
}) {
  const [amount, setAmount] = useState('3000')
  const [date, setDate] = useState(addDays(ws.today, 4))
  const [desc, setDesc] = useState('Ad campaign')
  const [category, setCategory] = useState('marketing')

  const bp = ws.scenario.delayBreakpoint
  const changed = scenario.payoutDelayDays !== 0 || !!scenario.proposal || !!scenario.assumptions

  const quick = [
    bp.found && bp.delayDays > 0
      ? {
          id: 'q-delay',
          label: `Payout arrives ${bp.delayDays} days late`,
          detail: 'The first delay that changes the answer.',
          req: { ...scenario, payoutDelayDays: bp.delayDays },
        }
      : null,
    {
      id: 'q-delay-week',
      label: 'Payout arrives a week late',
      detail: 'A longer wait than the one that first breaks it.',
      req: { ...scenario, payoutDelayDays: 7 },
    },
    {
      id: 'q-reserve',
      label: 'Raise the reserve to $7,500',
      detail: 'A more cautious floor to hold.',
      req: { ...scenario, reserveCents: 750_000 },
    },
  ].filter(Boolean) as { id: string; label: string; detail: string; req: ScenarioRequest }[]

  function runProposal() {
    const cents = Math.round(Number(amount.replace(/,/g, '')) * 100)
    if (!Number.isFinite(cents) || cents <= 0) return
    onPreview({
      ...scenario,
      proposal: {
        description: desc || 'Proposed expenditure',
        category,
        date,
        amountCents: cents,
        minimumReserveCents: ws.scenario.reserveCents,
      },
    })
  }

  return (
    <Sheet
      title="Try a scenario"
      subtitle="Nothing here is scheduled or paid. Every result comes from the same calculation as your current plan."
      onClose={onClose}
      wide
    >
      <div className="rounded-lg border border-hair bg-[#f7f9fb] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          Current plan
        </p>
        <p className="tnum mt-1 text-[15px] font-semibold text-ink">
          Lowest {usd(ws.scenario.lowestCents)} on {shortDate(ws.scenario.lowestDate)}
        </p>
        <p className="mt-0.5 text-[11.5px] text-muted">
          Reserve {usd(ws.scenario.reserveCents)} ·{' '}
          {ws.scenario.breachesReserve
            ? `${usd(-ws.scenario.headroomCents)} below`
            : `${usd(ws.scenario.headroomCents)} above`}
        </p>
        {changed && (
          <button
            type="button"
            onClick={onReset}
            className="mt-2 rounded border border-hair bg-white px-2.5 py-1 text-[11.5px] font-medium text-[#3d4757] hover:border-[#c8d9f7]"
          >
            Back to the current plan
          </button>
        )}
      </div>

      <Section title="One click">
        <ul className="grid gap-1.5 sm:grid-cols-3">
          {quick.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPreview(q.req)}
                className="h-full w-full rounded-lg border border-hair bg-white p-2.5 text-left hover:border-[#c8d9f7] disabled:opacity-50"
              >
                <p className="text-[12px] font-semibold text-ink">{q.label}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{q.detail}</p>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="A purchase you are considering" tone="action">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[#d9caec] bg-[#f9f6fd] p-3">
          <Field label="What for">
            <input
              value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={80}
              className="w-40 rounded border border-hair bg-white px-2 py-1 text-[12px] outline-none focus:border-[#c8d9f7]"
            />
          </Field>
          <Field label="Category">
            <select
              value={category} onChange={(e) => setCategory(e.target.value)}
              className="rounded border border-hair bg-white px-2 py-1 text-[12px] outline-none focus:border-[#c8d9f7]"
            >
              <option value="marketing">marketing</option>
              <option value="inventory">inventory</option>
              <option value="equipment">equipment</option>
              <option value="other">other</option>
            </select>
          </Field>
          <Field label="Amount">
            <span className="flex items-center gap-1">
              <span className="text-[12px] text-muted">$</span>
              <input
                value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                className="tnum w-24 rounded border border-hair bg-white px-2 py-1 text-[12px] outline-none focus:border-[#c8d9f7]"
              />
            </span>
          </Field>
          <Field label="Leaves the account on">
            <input
              type="date" value={date} min={ws.today} max={addDays(ws.today, 90)}
              onChange={(e) => setDate(e.target.value)}
              className="tnum rounded border border-hair bg-white px-2 py-1 text-[12px] outline-none focus:border-[#c8d9f7]"
            />
          </Field>
          <button
            type="button" onClick={runProposal} disabled={busy}
            className="rounded-md bg-[#54397e] px-3.5 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50"
          >
            See the difference
          </button>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted">
          Preflight projects what this does to your cash. It cannot tell you what the spend would
          earn back — nothing in the connected records measures that.
        </p>
      </Section>

      <Section title="Adjust the payout and reserve" collapsible defaultOpen={false}>
        <div className="space-y-3 rounded-lg border border-hair bg-white p-3">
          <label className="flex flex-wrap items-center gap-3">
            <span className="w-32 text-[11.5px] font-medium text-[#3d4757]">Payout delay</span>
            <input
              type="range" min={0} max={14} step={1} value={scenario.payoutDelayDays}
              onChange={(e) => onPreview({ ...scenario, payoutDelayDays: Number(e.target.value) })}
              className="w-44 accent-[#1b2b4b]"
              aria-label="Payout delay in days"
            />
            <span className="tnum text-[12px] text-ink">
              {scenario.payoutDelayDays === 0 ? 'on time' : `+${scenario.payoutDelayDays} days`}
            </span>
          </label>
          <label className="flex flex-wrap items-center gap-3">
            <span className="w-32 text-[11.5px] font-medium text-[#3d4757]">Minimum reserve</span>
            <span className="flex items-center gap-1">
              <span className="text-[12px] text-muted">$</span>
              <input
                type="number" min={0} step={500}
                value={Math.round(ws.scenario.reserveCents / 100)}
                onChange={(e) =>
                  onPreview({ ...scenario, reserveCents: Math.max(0, Number(e.target.value)) * 100 })
                }
                className="tnum w-24 rounded border border-hair px-2 py-1 text-[12px] outline-none focus:border-[#c8d9f7]"
                aria-label="Minimum operating reserve in dollars"
              />
            </span>
          </label>
        </div>
      </Section>

      <Section title="Your figures" collapsible defaultOpen={false}>
        <AssumptionEditor ws={ws} scenario={scenario} onChange={onPreview} />
      </Section>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}
