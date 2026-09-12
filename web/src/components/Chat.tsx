import { useEffect, useRef, useState } from 'react'
import type { ChatResponse, ScenarioRequest } from '../types/contracts'
import { api } from '../lib/api'
import { usd } from '../lib/format'
import { SourceLink } from './ClaimRow'

interface Turn {
  question: string
  response?: ChatResponse
  error?: string
}

/** Chat for the whole company, or scoped to one node. The assistant only ever
 *  phrases what the engine computed, and says so when no model answered. */
export function Chat({
  nodeId,
  scenario,
  suggestions,
  placeholder,
  onApplyScenario,
  compact,
  initialQuestion,
}: {
  nodeId?: string
  scenario: ScenarioRequest
  suggestions?: string[]
  placeholder: string
  onApplyScenario: (req: ScenarioRequest) => void
  compact?: boolean
  /** Asked once on mount, so a question typed elsewhere arrives answered. */
  initialQuestion?: string
}) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const asked = useRef(false)

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    setText('')
    setBusy(true)
    setTurns((t) => [...t, { question: q }])
    try {
      const response = await api.chat({ question: q, nodeId, scenario })
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, response } : x)))
    } catch (e) {
      const error = e instanceof Error ? e.message : 'The request failed.'
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error } : x)))
    } finally {
      setBusy(false)
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
      })
    }
  }

  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true
      void ask(initialQuestion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion])

  return (
    <div className="flex min-h-0 flex-col">
      {turns.length > 0 && (
        <div
          ref={listRef}
          className={`scrollbar-thin mb-2 space-y-3 overflow-y-auto ${compact ? 'max-h-64' : 'max-h-80'}`}
        >
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <p className="rounded-md bg-[#eef4ff] px-2.5 py-1.5 text-[12px] leading-snug text-[#26457f]">
                {t.question}
              </p>
              {t.error && (
                <p className="rounded-md border border-[#ebc3ae] bg-[#fdf1ea] px-2.5 py-1.5 text-[11.5px] text-[#8f3612]">
                  {t.error}
                </p>
              )}
              {t.response && <Answer response={t.response} onApplyScenario={onApplyScenario} />}
            </div>
          ))}
          {busy && <p className="text-[11.5px] italic text-muted">Calculating…</p>}
        </div>
      )}

      {suggestions && suggestions.length > 0 && turns.length === 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border border-hair bg-white px-2.5 py-1 text-[11px] text-[#3d4757] hover:border-[#c8d9f7] hover:text-[#26457f]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(text)
        }}
        className="flex items-center gap-1.5"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          aria-label={placeholder}
          className="min-w-0 flex-1 rounded-md border border-hair bg-white px-2.5 py-1.5 text-[12px] outline-none placeholder:text-[#9aa4b2] focus:border-[#c8d9f7]"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-md bg-[#1b2b4b] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  )
}

/**
 * The small guided form the brief asks for: when a question is missing an
 * amount or a date, collect exactly that and hand it to the engine. The model
 * never fills the gap itself, and nothing is answered until the engine can
 * actually calculate it.
 */
function CompleteProposal({
  response,
  onApplyScenario,
}: {
  response: ChatResponse
  onApplyScenario: (req: ScenarioRequest) => void
}) {
  const p = response.partialProposal
  const missing = new Set((response.missingInputs ?? []).map((m) => m.field))
  const today = new Date().toISOString().slice(0, 10)
  const [amount, setAmount] = useState(p && p.amountCents > 0 ? String(p.amountCents / 100) : '')
  const [date, setDate] = useState(p?.date ?? '')

  if (!p) {
    return (
      <ul className="mt-2 space-y-1.5">
        {(response.missingInputs ?? []).map((m) => (
          <li key={m.field} className="rounded bg-[#fdf7e4] px-2 py-1.5">
            <p className="text-[11.5px] font-semibold text-[#7f5f06]">{m.question}</p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-[#7f5f06]/85">{m.whyItMatters}</p>
          </li>
        ))}
      </ul>
    )
  }

  const cents = Math.round(Number(amount.replace(/,/g, '')) * 100)
  const ready = Number.isFinite(cents) && cents > 0 && !!date

  return (
    <form
      className="mt-2 rounded-md border border-[#e8d296] bg-[#fdf7e4] p-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        onApplyScenario({
          payoutDelayDays: 0,
          proposal: { ...p, amountCents: cents, date },
        })
      }}
    >
      <p className="text-[11.5px] font-semibold text-[#7f5f06]">
        {(response.missingInputs ?? []).map((m) => m.question).join(' ')}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[#7f5f06]">
            Amount
          </span>
          <span className="flex items-center gap-1">
            <span className="text-[11.5px] text-[#7f5f06]">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              aria-label="Amount in dollars"
              className={`tnum w-24 rounded border bg-white px-2 py-1 text-[12px] outline-none ${
                missing.has('amountCents') && !amount ? 'border-[#ad4318]' : 'border-hair'
              }`}
            />
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[#7f5f06]">
            Leaves the account
          </span>
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date the money leaves the account"
            className={`tnum rounded border bg-white px-2 py-1 text-[12px] outline-none ${
              missing.has('date') && !date ? 'border-[#ad4318]' : 'border-hair'
            }`}
          />
        </label>
        <button
          type="submit"
          disabled={!ready}
          className="rounded bg-[#7f5f06] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          Calculate it
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-[#7f5f06]/85">
        {(response.missingInputs ?? [])[0]?.whyItMatters}
      </p>
    </form>
  )
}

function Answer({
  response,
  onApplyScenario,
}: {
  response: ChatResponse
  onApplyScenario: (req: ScenarioRequest) => void
}) {
  const p = response.proposedChange?.proposal
  return (
    <div className="rounded-md border border-hair bg-white px-2.5 py-2">
      <p className="text-[12px] leading-relaxed text-ink">{response.answer}</p>

      {response.answerSource !== 'model' && (
        <p className="mt-2 rounded bg-[#f7f9fb] px-2 py-1 text-[10px] leading-snug text-muted">
          {response.unavailable
            ? `AI explanation unavailable — this wording comes straight from the calculation engine. ${response.unavailable}`
            : 'Written by the calculation engine, not a language model.'}
        </p>
      )}

      {response.missingInputs && response.missingInputs.length > 0 && (
        <CompleteProposal response={response} onApplyScenario={onApplyScenario} />
      )}

      {p && (
        <div className="mt-2 rounded-md border border-[#d9caec] bg-[#f9f6fd] p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#54397e]">
            Proposed — not scheduled
          </p>
          <p className="tnum mt-1 text-[12.5px] font-semibold text-ink">
            {p.description} · {usd(p.amountCents)} on {p.date}
          </p>
          <p className="mt-1 text-[10.5px] leading-snug text-muted">{response.proposalNote}</p>
          <button
            type="button"
            onClick={() => onApplyScenario(response.proposedChange!)}
            className="mt-2 rounded bg-[#54397e] px-2.5 py-1 text-[11px] font-medium text-white"
          >
            Run this on the timeline
          </button>
        </div>
      )}

      {(response.sourceRefs ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...new Set(response.sourceRefs ?? [])].slice(0, 6).map((r) => (
            <SourceLink key={r} id={r} />
          ))}
        </div>
      )}
    </div>
  )
}
