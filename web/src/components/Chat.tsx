import { useRef, useState } from 'react'
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
}: {
  nodeId?: string
  scenario: ScenarioRequest
  suggestions?: string[]
  placeholder: string
  onApplyScenario: (req: ScenarioRequest) => void
  compact?: boolean
}) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

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
                <p className="rounded-md border border-[#e6c7ae] bg-[#fdf3ec] px-2.5 py-1.5 text-[11.5px] text-[#8a4a1f]">
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
        <ul className="mt-2 space-y-1.5">
          {response.missingInputs.map((m) => (
            <li key={m.field} className="rounded bg-[#fdf8e9] px-2 py-1.5">
              <p className="text-[11.5px] font-semibold text-[#7d5e0d]">{m.question}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-[#7d5e0d]/85">{m.whyItMatters}</p>
            </li>
          ))}
        </ul>
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

      {response.sourceRefs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...new Set(response.sourceRefs)].slice(0, 6).map((r) => (
            <SourceLink key={r} id={r} />
          ))}
        </div>
      )}
    </div>
  )
}
