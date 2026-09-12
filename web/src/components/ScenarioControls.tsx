import { useEffect, useState } from 'react'
import type { ScenarioRequest, WorkspaceResponse } from '../types/contracts'
import { addDays, shortDate } from '../lib/format'

/** Deterministic controls for the two things the owner can change: when the
 *  payout lands, and what they are thinking of spending. Everything here is a
 *  proposal — nothing is committed anywhere. */
export function ScenarioControls({
  ws, scenario, busy, onChange, onReset,
}: {
  ws: WorkspaceResponse
  scenario: ScenarioRequest
  busy: boolean
  onChange: (req: ScenarioRequest) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('3000')
  const [date, setDate] = useState(addDays(ws.today, 4))
  const [desc, setDesc] = useState('Ad campaign')
  const [category, setCategory] = useState('marketing')

  useEffect(() => {
    if (scenario.proposal) {
      setAmount(String(scenario.proposal.amountCents / 100))
      setDate(scenario.proposal.date)
      setDesc(scenario.proposal.description)
      setCategory(scenario.proposal.category || 'marketing')
      setOpen(true)
    }
  }, [scenario.proposal])

  const bp = ws.scenario.delayBreakpoint
  const reserveDollars = Math.round(ws.scenario.reserveCents / 100)

  function runProposal() {
    const cents = Math.round(Number(amount.replace(/,/g, '')) * 100)
    if (!Number.isFinite(cents) || cents <= 0) return
    onChange({
      ...scenario,
      proposal: {
        description: desc || 'Proposed expenditure',
        category, date, amountCents: cents,
        minimumReserveCents: ws.scenario.reserveCents,
      },
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-hair bg-white px-4 py-2">
      {/* payout timing */}
      <label className="flex items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
          Payout delay
        </span>
        <input
          type="range" min={0} max={14} step={1}
          value={scenario.payoutDelayDays}
          onChange={(e) => onChange({ ...scenario, payoutDelayDays: Number(e.target.value) })}
          className="w-36 accent-[#1b2b4b]"
          aria-label="Payout delay in days"
        />
        <span className="tnum w-24 text-[11.5px] text-ink">
          {scenario.payoutDelayDays === 0
            ? 'on time'
            : `+${scenario.payoutDelayDays} day${scenario.payoutDelayDays === 1 ? '' : 's'}`}
        </span>
      </label>

      {bp.found && (
        <span
          className={`tnum rounded border px-2 py-[3px] text-[10.5px] ${
            bp.delayDays === 0 || scenario.payoutDelayDays >= bp.delayDays
              ? 'border-[#ebc3ae] bg-[#fdf1ea] text-[#8f3612]'
              : 'border-hair bg-white text-muted'
          }`}
        >
          {bp.delayDays === 0
            ? `already below on ${shortDate(bp.breachDate ?? '')}`
            : `breaks at +${bp.delayDays} days (${shortDate(bp.breachDate ?? '')})`}
        </span>
      )}

      {/* reserve */}
      <label className="flex items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
          Reserve
        </span>
        <span className="text-[11.5px] text-muted">$</span>
        <input
          type="number" min={0} step={500} value={reserveDollars}
          onChange={(e) =>
            onChange({ ...scenario, reserveCents: Math.max(0, Number(e.target.value)) * 100 })
          }
          className="tnum w-20 rounded border border-hair px-1.5 py-[3px] text-[11.5px] outline-none focus:border-[#c8d9f7]"
          aria-label="Minimum operating reserve in dollars"
        />
      </label>

      <div className="ml-auto flex items-center gap-2">
        {busy && <span className="text-[11px] italic text-muted">recomputing…</span>}
        {(scenario.payoutDelayDays !== 0 || scenario.proposal) && (
          <button
            type="button"
            onClick={onReset}
            className="rounded border border-hair px-3 py-1.5 text-[12px] text-[#3d4757] hover:border-[#c8d9f7]"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded bg-[#1b2b4b] px-3.5 py-1.5 text-[12px] font-medium text-white"
        >
          {scenario.proposal ? 'Edit the spend' : 'Propose a spend'}
        </button>
      </div>

      {open && (
        <div className="flex w-full flex-wrap items-end gap-3 rounded-lg border border-[#d9caec] bg-[#f9f6fd] px-3 py-2">
          <Field label="What for">
            <input
              value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={80}
              className="w-40 rounded border border-hair bg-white px-1.5 py-[3px] text-[11.5px] outline-none focus:border-[#c8d9f7]"
            />
          </Field>
          <Field label="Category">
            <select
              value={category} onChange={(e) => setCategory(e.target.value)}
              className="rounded border border-hair bg-white px-1.5 py-[3px] text-[11.5px] outline-none focus:border-[#c8d9f7]"
            >
              <option value="marketing">marketing</option>
              <option value="inventory">inventory</option>
              <option value="equipment">equipment</option>
              <option value="other">other</option>
            </select>
          </Field>
          <Field label="Amount">
            <span className="flex items-center gap-1">
              <span className="text-[11.5px] text-muted">$</span>
              <input
                value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                className="tnum w-24 rounded border border-hair bg-white px-1.5 py-[3px] text-[11.5px] outline-none focus:border-[#c8d9f7]"
              />
            </span>
          </Field>
          <Field label="Leaves the account on">
            <input
              type="date" value={date} min={ws.today} max={addDays(ws.today, 90)}
              onChange={(e) => setDate(e.target.value)}
              className="tnum rounded border border-hair bg-white px-1.5 py-[3px] text-[11.5px] outline-none focus:border-[#c8d9f7]"
            />
          </Field>
          <button
            type="button" onClick={runProposal} disabled={busy}
            className="rounded bg-[#54397e] px-3 py-[5px] text-[11.5px] font-medium text-white disabled:opacity-40"
          >
            Run preflight
          </button>
          {scenario.proposal && (
            <button
              type="button"
              onClick={() => onChange({ ...scenario, proposal: null })}
              className="rounded border border-hair bg-white px-2.5 py-[4px] text-[11.5px] text-[#3d4757]"
            >
              Remove
            </button>
          )}
          <p className="w-full text-[10px] text-muted">
            Nothing here is scheduled or paid. Preflight only projects what this would do to your
            cash — it cannot tell you what the spend would earn back.
          </p>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-[3px]">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}
