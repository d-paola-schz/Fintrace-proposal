import type { Provenance, Tone } from '../types/contracts'
import { PROVENANCE_LABEL, TONE_WORD } from '../lib/format'

// Every tone carries a colour, a word and a mark. Colour is never the only
// thing distinguishing one state from another.
export const TONE_STYLE: Record<Tone, {
  stroke: string; fill: string; text: string; border: string; chip: string
}> = {
  risk: {
    stroke: '#a35b2a', fill: 'var(--color-bronze-soft)', text: 'text-[#8a4a1f]',
    border: 'border-[#e6c7ae]', chip: 'bg-[#fdf3ec] text-[#8a4a1f] border-[#e6c7ae]',
  },
  review: {
    stroke: '#64748b', fill: 'var(--color-silver-soft)', text: 'text-[#4a5566]',
    border: 'border-[#cbd3de]', chip: 'bg-[#f3f5f8] text-[#4a5566] border-[#cbd3de]',
  },
  opportunity: {
    stroke: '#9a7412', fill: 'var(--color-gold-soft)', text: 'text-[#7d5e0d]',
    border: 'border-[#e3d19a]', chip: 'bg-[#fdf8e9] text-[#7d5e0d] border-[#e3d19a]',
  },
}

export function ToneMark({ tone, size = 10 }: { tone: Tone; size?: number }) {
  const c = TONE_STYLE[tone].stroke
  if (tone === 'risk') {
    // Triangle: attention.
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden className="shrink-0">
        <path d="M5 0.8 L9.4 8.8 H0.6 Z" fill={c} />
      </svg>
    )
  }
  if (tone === 'opportunity') {
    // Diamond: an opening.
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden className="shrink-0">
        <path d="M5 0.5 L9.5 5 L5 9.5 L0.5 5 Z" fill={c} />
      </svg>
    )
  }
  // Circle: unresolved.
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden className="shrink-0">
      <circle cx="5" cy="5" r="3.6" fill="none" stroke={c} strokeWidth="1.8" />
    </svg>
  )
}

export function ToneChip({ tone, children }: { tone: Tone; children?: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.07em] ${TONE_STYLE[tone].chip}`}
    >
      <ToneMark tone={tone} size={8} />
      {children ?? TONE_WORD[tone]}
    </span>
  )
}

const PROV_CLASS: Record<Provenance, string> = {
  olist_historical: 'bg-[#eef4ff] text-[#26457f] border-[#c8d9f7]',
  nessie_sandbox: 'bg-[#edf7f1] text-[#1f5c3c] border-[#c2e2ce]',
  derived: 'bg-[#f3f5f8] text-[#4a5566] border-[#cbd3de]',
  user_entered: 'bg-[#f5f0fb] text-[#54397e] border-[#d9caec]',
  demo_assumption: 'bg-[#fdf8e9] text-[#7d5e0d] border-[#e3d19a]',
}

/** The source badge. No financial figure appears anywhere without one. */
export function ProvenanceChip({ provenance, title }: { provenance: Provenance; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-[0.05em] ${PROV_CLASS[provenance]}`}
    >
      {PROVENANCE_LABEL[provenance]}
    </span>
  )
}
