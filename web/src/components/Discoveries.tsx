import { useState } from 'react'
import type { DiscoveryResponse, ScenarioRequest } from '../types/contracts'
import { api } from '../lib/api'
import { ClaimRow } from './ClaimRow'
import { ToneChip } from './Tone'

/**
 * One model pass over the timeline, and what survived checking.
 *
 * The split is shown rather than claimed: the model picked which events belong
 * together and said why, in words; the engine decided whether that was true,
 * produced every figure, and set the severity. Candidates the engine could not
 * confirm are listed as rejected with the reason, because hiding them would
 * flatter the model and mislead about how much of this is actually AI.
 */
export function Discoveries({ scenario }: { scenario: ScenarioRequest }) {
  const [result, setResult] = useState<DiscoveryResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      setResult(await api.discover(scenario))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="w-full rounded-md border border-[#d9caec] bg-[#f9f6fd] px-3 py-2 text-left disabled:opacity-60"
      >
        <span className="block text-[12.5px] font-semibold text-[#54397e]">
          {busy ? 'Reading the timeline…' : 'What should I look at?'}
        </span>
        <span className="mt-0.5 block text-[10.5px] leading-snug text-muted">
          The model picks what belongs together. The engine checks it and supplies every number.
        </span>
      </button>

      {error && (
        <p className="mt-2 rounded border border-[#e6c7ae] bg-[#fdf3ec] px-2 py-1.5 text-[11px] text-[#8a4a1f]">
          {error}
        </p>
      )}

      {result && !result.available && (
        <div className="mt-2 rounded-md border border-hair bg-[#f7f9fb] p-2.5">
          <p className="text-[11.5px] font-semibold text-ink">No model is connected</p>
          <p className="mt-1 text-[10.5px] leading-snug text-muted">{result.unavailable}</p>
          <p className="mt-1 text-[10.5px] leading-snug text-muted">
            Every chain, figure and projection on this page is produced by the Go engine and is
            unaffected.
          </p>
        </div>
      )}

      {result?.available && (
        <div className="mt-2 space-y-2">
          <p className="tnum text-[10.5px] text-muted">
            {result.proposed} proposed · {result.verified} verified by the engine ·{' '}
            {result.proposed - result.verified} rejected
          </p>

          {result.discoveries.map((d) => (
            <div
              key={d.id}
              className={`rounded-lg border p-2.5 ${
                d.status === 'rejected'
                  ? 'border-hair bg-[#f7f9fb]'
                  : 'border-[#d9caec] bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p
                  className={`text-[12.5px] font-semibold ${
                    d.status === 'rejected' ? 'text-muted line-through' : 'text-ink'
                  }`}
                >
                  {d.title}
                </p>
                {d.status === 'verified' && d.tone ? (
                  <ToneChip tone={d.tone} />
                ) : (
                  <span className="shrink-0 rounded border border-hair bg-white px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-[0.05em] text-muted">
                    rejected
                  </span>
                )}
              </div>

              <p className="mt-1 text-[11px] leading-snug text-[#3d4757]">{d.rationale}</p>

              {d.status === 'rejected' ? (
                <p className="mt-1.5 rounded bg-white px-2 py-1 text-[10.5px] leading-snug text-[#8a4a1f]">
                  Engine check failed: {d.rejectedBecause}
                </p>
              ) : (
                d.claims.length > 0 && (
                  <ul className="mt-1.5 rounded-md border border-hair bg-white px-2.5">
                    {d.claims.map((c) => (
                      <ClaimRow key={c.id} claim={c} />
                    ))}
                  </ul>
                )
              )}
            </div>
          ))}

          <p className="text-[10px] leading-snug text-muted">{result.note}</p>
        </div>
      )}
    </div>
  )
}
