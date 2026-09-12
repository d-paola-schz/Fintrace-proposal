import type { Chain } from '../types/contracts'
import { TONE_STYLE, ToneMark } from './Tone'

export const PREVIEW_W = 214
export const PREVIEW_H = 46
/** How far the preview hangs from the rail before its stub of chain. */
export const PREVIEW_DROP = 34

/**
 * A chain before it is opened: a short stub of real chain dropping from the
 * root event into a labelled tag.
 *
 * Both chains used to sit fully expanded at all times, which filled the screen
 * with material the owner had not asked for. Collapsed, a chain announces what
 * it is about and how many steps it has, and unfolds only when chosen.
 */
export function ChainPreview({
  chain,
  x,
  y,
  dir,
  selected,
  onSelect,
}: {
  chain: Chain
  x: number
  y: number
  /** -1 above the rail, +1 below */
  dir: 1 | -1
  selected: boolean
  onSelect: (id: string) => void
}) {
  const tones = chain.nodes.map((n) => n.tone)
  const lead = TONE_STYLE[tones[0] ?? 'review']

  return (
    <button
      type="button"
      onClick={() => onSelect(chain.id)}
      aria-expanded={selected}
      aria-label={`${chain.title}, ${chain.nodes.length} steps. Open this chain.`}
      className={`absolute rounded-lg border bg-white text-left transition-shadow ${
        selected ? 'shadow-[0_0_0_2px_var(--color-flow)]' : 'hover:shadow-md'
      }`}
      style={{
        left: x - PREVIEW_W / 2,
        top: dir === 1 ? y : y - PREVIEW_H,
        width: PREVIEW_W,
        height: PREVIEW_H,
        borderColor: lead.stroke,
      }}
    >
      <span className="flex h-full items-center gap-2 px-2.5">
        <span className="flex shrink-0 items-center gap-[3px]">
          {tones.map((t, i) => (
            <ToneMark key={i} tone={t} size={9} />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold leading-tight text-ink">
            {chain.title}
          </span>
          <span className="block text-[10.5px] leading-tight text-muted">
            {chain.nodes.length} steps · tap to open
          </span>
        </span>
      </span>
    </button>
  )
}

/** The stub of chain linking a collapsed preview to its root event. */
export function previewStubPath(x: number, railY: number, y: number): string {
  return `M ${x} ${railY} L ${x} ${y}`
}
