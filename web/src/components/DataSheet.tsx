import type { WorkspaceResponse } from '../types/contracts'
import { Sheet } from './Sheet'
import { SourceLink } from './ClaimRow'
import { ProvenanceChip } from './Tone'

const STATE_COLOUR: Record<string, string> = {
  live: '#15803d', configured: '#9a7412', snapshot: '#9a7412',
  fixture: '#9a7412', unavailable: '#a35b2a',
}
const STATE_WORD: Record<string, string> = {
  live: 'live', configured: 'unverified', snapshot: 'snapshot',
  fixture: 'fixture', unavailable: 'unavailable',
}

/** Where every figure comes from, on demand rather than always on screen. */
export function DataSheet({ ws, onClose }: { ws: WorkspaceResponse; onClose: () => void }) {
  return (
    <Sheet
      title="Data & assumptions"
      subtitle={ws.dataNotice}
      onClose={onClose}
      wide
    >
      <div className="grid gap-2 md:grid-cols-3">
        {(ws.sourceStatus ?? []).map((s) => (
          <div
            key={s.name}
            className={`rounded-lg border p-3 ${
              s.state === 'live' ? 'border-[#c2e2ce] bg-[#f4fbf7]' : 'border-hair bg-white'
            }`}
          >
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink">
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: STATE_COLOUR[s.state] ?? '#9a7412' }}
              />
              {s.name} · {STATE_WORD[s.state] ?? s.state}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted">{s.detail}</p>
            {(s.state === 'configured' || s.state === 'fixture' || s.state === 'unavailable') && (
              <p className="mt-1 text-[10px] font-medium text-[#8a6d1f]">
                Not confirmed connected — do not present this as a live integration.
              </p>
            )}
          </div>
        ))}
      </div>

      <h3 className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
        Every assumption behind the figures
      </h3>
      <div className="grid gap-2 md:grid-cols-2">
        {(ws.assumptions ?? []).map((a) => (
          <div key={a.id} className="rounded-lg border border-hair bg-white p-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12px] font-semibold text-ink">{a.label}</p>
              <ProvenanceChip provenance={a.provenance} />
            </div>
            {a.value && <p className="tnum mt-0.5 text-[11.5px] text-[#3d4757]">{a.value}</p>}
            <p className="mt-1 text-[10.5px] leading-snug text-muted">{a.detail}</p>
          </div>
        ))}
      </div>

      <h3 className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
        The business
      </h3>
      <div className="rounded-lg border border-hair bg-white p-3">
        <p className="text-[12px] font-semibold text-ink">{ws.business.displayName}</p>
        <p className="mt-0.5 text-[11.5px] text-[#3d4757]">
          {ws.business.category} · {ws.business.location}
        </p>
        <p className="tnum mt-1 text-[11px] text-muted">{ws.business.sourceWindow}</p>
        <p className="mt-1.5 text-[11px] leading-snug text-muted">{ws.business.timeShiftNote}</p>
        <div className="mt-2">
          <SourceLink id="src-olist-seller" />
        </div>
      </div>
    </Sheet>
  )
}
