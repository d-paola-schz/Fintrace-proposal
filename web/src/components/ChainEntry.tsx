import type { Chain } from '../types/contracts'
import { TONE_STYLE, ToneMark } from './Tone'

export const ENTRY_W = 264
export const ENTRY_H = 62
/** How far the tag hangs from the rail before its stub of chain. */
export const ENTRY_DROP = 34

/**
 * A chain before it is opened.
 *
 * Every node of every chain on screen at once gave the owner a diagram to
 * decode before they knew what it was for. A chain now announces itself —
 * what it is about, how many steps, and that it opens — and unfolds when it
 * is chosen or when the briefing sends the owner to it.
 */
export function ChainEntry({
  chain,
  x,
  y,
  dir,
  active,
  dimmed,
  onOpen,
}: {
  chain: Chain
  x: number
  y: number
  /** -1 above the rail, +1 below */
  dir: 1 | -1
  active: boolean
  /** Out of frame while another chain holds the camera. */
  dimmed?: boolean
  onOpen: (id: string) => void
}) {
  const tones = chain.nodes.map((n) => n.tone)
  const lead = TONE_STYLE[tones[0] ?? 'review']
  const worst = tones.includes('risk') ? 'risk' : tones.includes('review') ? 'review' : 'opportunity'

  return (
    <button
      type="button"
      onClick={() => onOpen(chain.id)}
      aria-expanded={active}
      aria-label={`${chain.title}: ${chain.nodes.length} steps. Open to read them.`}
      className={`chain-entry absolute rounded-xl border-2 text-left transition-all duration-200 hover:-translate-y-[1px] hover:shadow-lg ${
        active ? 'shadow-[0_0_0_2px_var(--color-flow)]' : 'shadow-md'
      }`}
      style={{
        left: x - ENTRY_W / 2,
        top: dir === 1 ? y : y - ENTRY_H,
        width: ENTRY_W,
        height: ENTRY_H,
        borderColor: lead.stroke,
        background: lead.fill,
        opacity: dimmed ? 0 : 1,
        pointerEvents: dimmed ? 'none' : undefined,
        transition: 'opacity 380ms ease, transform 200ms ease, box-shadow 200ms ease',
      }}
    >
      {/* The attract ring. It is the only thing on the opening screen asking to
          be clicked, so it is allowed to say so. */}
      <span
        aria-hidden
        className="chain-entry-ring pointer-events-none absolute inset-0 rounded-xl border-2"
        style={{ borderColor: lead.stroke }}
      />
      <span className="relative flex h-full items-center gap-3 px-3.5">
        <span className="flex shrink-0 items-center gap-[3px]">
          {tones.map((t, i) => (
            <ToneMark key={i} tone={t} size={11} />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight text-ink">
            {chain.title}
          </span>
          <span className={`block truncate text-[11.5px] leading-tight ${TONE_STYLE[worst].text}`}>
            {chain.nodes.length} steps
          </span>
        </span>
        <span
          className="shrink-0 rounded-full border px-2.5 py-[4px] text-[10.5px] font-semibold uppercase tracking-[0.06em]"
          style={{ borderColor: lead.stroke, color: lead.stroke }}
        >
          Open
        </span>
      </span>
    </button>
  )
}
