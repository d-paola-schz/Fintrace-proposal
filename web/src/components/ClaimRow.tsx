import { useState } from 'react'
import type { Claim, SourceRecord } from '../types/contracts'
import { api } from '../lib/api'
import { ProvenanceChip } from './Tone'
import { longDate } from '../lib/format'

/** One displayed figure with its source. Clicking a citation opens the actual
 *  record — the query, the sandbox row, or the named assumption. */
export function ClaimRow({ claim }: { claim: Claim }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="border-b border-hair py-2 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-tight text-muted">{claim.label}</span>
          <span className="tnum mt-[2px] block text-[13.5px] font-semibold leading-tight text-ink">
            {claim.display}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <ProvenanceChip provenance={claim.provenance} />
          <span className="text-[9.5px] text-muted underline decoration-dotted">
            {open ? 'hide source' : 'source'}
          </span>
        </span>
      </button>

      {open && (
        <div className="mt-2 rounded-md bg-[#f7f9fb] p-2.5">
          {claim.note && (
            <p className="text-[11px] leading-relaxed text-[#3d4757]">{claim.note}</p>
          )}
          {claim.asOf && (
            <p className="mt-1.5 text-[10px] text-muted">As of {longDate(claim.asOf)}</p>
          )}
          {claim.sourceRefs.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {claim.sourceRefs.map((ref) => (
                <SourceLink key={ref} id={ref} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[10.5px] italic text-muted">
              No source record: this states what the connected data does not contain.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

export function SourceLink({ id }: { id: string }) {
  const [rec, setRec] = useState<SourceRecord | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  async function open() {
    if (rec) {
      setRec(null)
      return
    }
    setState('loading')
    try {
      setRec(await api.source(id))
      setState('idle')
    } catch {
      setState('error')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded border border-hair bg-white px-1.5 py-[2px] font-mono text-[9.5px] text-[#3d4757] hover:border-[#c8d9f7] hover:text-[#26457f]"
      >
        {state === 'loading' ? 'opening…' : id}
      </button>
      {state === 'error' && (
        <span className="text-[9.5px] text-[#a35b2a]">could not open {id}</span>
      )}
      {rec && (
        <div className="mt-1.5 w-full rounded-md border border-hair bg-white p-2.5">
          <div className="flex items-start justify-between gap-2">
            <h5 className="text-[11.5px] font-semibold text-ink">{rec.title}</h5>
            <ProvenanceChip provenance={rec.provenance} />
          </div>
          {rec.origin && (
            <p className="mt-1 font-mono text-[10px] text-muted break-all">{rec.origin}</p>
          )}
          <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap text-[10.5px] leading-relaxed text-[#3d4757] scrollbar-thin">
            {rec.detail}
          </pre>
        </div>
      )}
    </>
  )
}
