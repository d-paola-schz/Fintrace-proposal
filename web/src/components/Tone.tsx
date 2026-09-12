import type { Provenance, Tone } from '../types/contracts'
import { PROVENANCE_LABEL, TONE_WORD } from '../lib/format'

// Every tone carries a colour, a word and a mark. Colour is never the only
// thing distinguishing one state from another.
// The three strokes used to sit 18 degrees of hue apart, which is not enough
// to tell bronze from gold in a chip the size of a fingernail. Risk is pulled
// towards red and opportunity towards yellow, so the hues now read 15, 44 and
// 218: three obviously different things rather than two browns and a grey.
export const TONE_STYLE: Record<Tone, {
  stroke: string; fill: string; text: string; border: string; chip: string
}> = {
  risk: {
    stroke: '#ad4318', fill: 'var(--color-bronze-soft)', text: 'text-[#8f3612]',
    border: 'border-[#ebc3ae]', chip: 'bg-[#fdf1ea] text-[#8f3612] border-[#ebc3ae]',
  },
  review: {
    stroke: '#5d6e8c', fill: 'var(--color-silver-soft)', text: 'text-[#46536b]',
    border: 'border-[#c7d0de]', chip: 'bg-[#f2f4f9] text-[#46536b] border-[#c7d0de]',
  },
  opportunity: {
    stroke: '#b3860a', fill: 'var(--color-gold-soft)', text: 'text-[#7f5f06]',
    border: 'border-[#e8d296]', chip: 'bg-[#fdf7e4] text-[#7f5f06] border-[#e8d296]',
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
  derived: 'bg-[#f2f4f9] text-[#46536b] border-[#c7d0de]',
  user_entered: 'bg-[#f5f0fb] text-[#54397e] border-[#d9caec]',
  demo_assumption: 'bg-[#fdf7e4] text-[#7f5f06] border-[#e8d296]',
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
