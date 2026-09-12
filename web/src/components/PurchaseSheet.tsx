import { useState } from 'react'
import type { ScenarioRequest, WorkspaceResponse } from '../types/contracts'
import { addDays, shortDate, usd } from '../lib/format'
import { Sheet } from './Sheet'

/**
 * Checking a purchase, as a guided decision rather than a control panel.
 *
 * The owner is asked only for what the engine needs — an amount and a date —
 * and gets the plain answer first: does the modelled balance stay above the
 * reserve, where is the low, and what is the trade-off. The comparison against
 * the current plan follows, and only then the timeline.
 */
export function PurchaseSheet({
  ws,
  scenario,
  busy,
  onRun,
  onClose,
  onReset,
  onInspect,
}: {
  ws: WorkspaceResponse
  scenario: ScenarioRequest
  busy: boolean
  onRun: (req: ScenarioRequest) => void
  onClose: () => void
  onReset: () => void
  onInspect: () => void
}) {
  const [amount, setAmount] = useState('2000')
  const [date, setDate] = useState(addDays(ws.today, 5))
  const [desc, setDesc] = useState('Inventory')
  const [category, setCategory] = useState('inventory')
  const [touched, setTouched] = useState(false)

  const s = ws.scenario
  const result = s.proposal && s.withoutProposal ? s : null
  const amountCents = Math.round(Number(amount.replace(/,/g, '')) * 100)
  const amountOk = Number.isFinite(amountCents) && amountCents > 0
  const dateOk = !!date && date >= ws.today

  function run() {
    setTouched(true)
    if (!amountOk || !dateOk) return
    onRun({
      ...scenario,
      proposal: {
        description: desc || 'Purchase',
        category,
        date,
        amountCents,
        minimumReserveCents: s.reserveCents,
      },
    })
  }

  return (
    <Sheet
      title="Check a purchase"
      subtitle="Preflight projects what this does to your modelled cash. Nothing is scheduled or paid."
      onClose={onClose}
      wide
    >
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-hair bg-[#f7f9fb] p-3">
        <Field label="What is it for">
          <input
            value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={60}
            className="w-40 rounded border border-hair bg-white px-2 py-1.5 text-[13px] outline-none focus:border-[#c8d9f7]"
          />
        </Field>
        <Field label="Category">
          <select
            value={category} onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-hair bg-white px-2 py-1.5 text-[13px] outline-none focus:border-[#c8d9f7]"
          >
            <option value="inventory">inventory</option>
            <option value="marketing">marketing</option>
            <option value="equipment">equipment</option>
            <option value="other">other</option>
          </select>
        </Field>
        <Field label="How much" error={touched && !amountOk ? 'Enter an amount' : undefined}>
          <span className="flex items-center gap-1">
            <span className="text-[13px] text-muted">$</span>
            <input
              value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
              aria-invalid={touched && !amountOk}
              className={`tnum w-28 rounded border bg-white px-2 py-1.5 text-[13px] outline-none focus:border-[#c8d9f7] ${
                touched && !amountOk ? 'border-[#a35b2a]' : 'border-hair'
              }`}
            />
          </span>
        </Field>
        <Field label="When does it leave" error={touched && !dateOk ? 'Pick a future date' : undefined}>
          <input
            type="date" value={date} min={ws.today} max={addDays(ws.today, 90)}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={touched && !dateOk}
            className={`tnum rounded border bg-white px-2 py-1.5 text-[13px] outline-none focus:border-[#c8d9f7] ${
              touched && !dateOk ? 'border-[#a35b2a]' : 'border-hair'
            }`}
          />
        </Field>
        <button
          type="button" onClick={run} disabled={busy}
          className="rounded-md bg-[#1b2b4b] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Check it'}
        </button>
      </div>

      {result && (
        <>
          <div
            className={`mt-4 rounded-lg border p-4 ${
              result.breachesReserve
                ? 'border-[#e6c7ae] bg-[#fdf3ec]'
                : 'border-[#c2e2ce] bg-[#f4fbf7]'
            }`}
          >
            <p
              className={`text-[17px] font-semibold leading-snug ${
                result.breachesReserve ? 'text-[#8a4a1f]' : 'text-[#1f5c3c]'
              }`}
            >
              {result.breachesReserve
                ? 'This would take you below your reserve.'
                : 'Your modelled plan can cover this.'}
            </p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#22303f]">
              The low becomes {usd(result.lowestCents)} on {shortDate(result.lowestDate)},{' '}
              {result.breachesReserve
                ? `${usd(-result.headroomCents)} short of your ${usd(result.reserveCents)} reserve.`
                : `leaving ${usd(result.headroomCents)} above your ${usd(result.reserveCents)} reserve.`}
            </p>
            {result.caveats?.[0] && (
              <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{result.caveats[0]}</p>
            )}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Compare
              label="Current plan"
              amount={result.withoutProposal!.lowestCents}
              date={result.withoutProposal!.lowestDate}
              breach={result.withoutProposal!.breachesReserve}
            />
            <Compare
              label="With this purchase"
              amount={result.lowestCents}
              date={result.lowestDate}
              breach={result.breachesReserve}
              highlight
            />
          </div>

          {result.alternatives.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
                Instead
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.alternatives.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onRun({ ...scenario, proposal: a.proposal })}
                    title={a.tradeoff}
                    className={`tnum rounded-full border px-3 py-1.5 text-[12px] ${
                      a.breachesReserve
                        ? 'border-[#e6c7ae] bg-white text-[#8a4a1f]'
                        : 'border-[#c2e2ce] bg-white text-[#1f5c3c]'
                    }`}
                  >
                    {a.label} · {a.breachesReserve ? 'still below' : 'holds'} {usd(a.lowestCents)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onInspect}
              className="rounded-md bg-[#1b2b4b] px-3.5 py-2 text-[12.5px] font-semibold text-white"
            >
              See it on the timeline
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-md border border-hair bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#3d4757]"
            >
              Back to my plan
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function Compare({
  label, amount, date, breach, highlight,
}: {
  label: string; amount: number; date: string; breach: boolean; highlight?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? 'border-[#d9caec] bg-[#f9f6fd]' : 'border-hair bg-white'
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="tnum mt-1 text-[16px] font-semibold text-ink">{usd(amount)}</p>
      <p className="tnum mt-0.5 text-[11.5px] text-muted">
        low on {shortDate(date)} · {breach ? 'below reserve' : 'holds reserve'}
      </p>
    </div>
  )
}

function Field({
  label, error, children,
}: {
  label: string; error?: string; children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      {children}
      {error && <span className="text-[10.5px] text-[#a35b2a]">{error}</span>}
    </label>
  )
}
