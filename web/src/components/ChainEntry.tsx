import type { Chain } from '../types/contracts'
import { TONE_STYLE, ToneMark } from './Tone'

export const ENTRY_W = 236
export const ENTRY_H = 52
/** How far the tag hangs from the rail before its stub of chain. */
export const ENTRY_DROP = 30

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
  onOpen,
}: {
  chain: Chain
  x: number
  y: number
  /** -1 above the rail, +1 below */
  dir: 1 | -1
  active: boolean
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
      className={`absolute rounded-lg border bg-white text-left shadow-sm transition-shadow hover:shadow-md ${
        active ? 'shadow-[0_0_0_2px_var(--color-flow)]' : ''
      }`}
      style={{
        left: x - ENTRY_W / 2,
        top: dir === 1 ? y : y - ENTRY_H,
        width: ENTRY_W,
        height: ENTRY_H,
        borderColor: lead.stroke,
      }}
    >
      <span className="flex h-full items-center gap-2.5 px-3">
        <span className="flex shrink-0 items-center gap-[3px]">
          {tones.map((t, i) => (
            <ToneMark key={i} tone={t} size={10} />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
            {chain.title}
          </span>
          <span className={`block truncate text-[11px] leading-tight ${TONE_STYLE[worst].text}`}>
            {chain.nodes.length} steps · open
          </span>
        </span>
      </span>
    </button>
  )
}
