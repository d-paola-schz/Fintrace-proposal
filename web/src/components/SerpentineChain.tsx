import { useMemo } from 'react'
import type { Chain, ChainNode, Tone } from '../types/contracts'
import { TONE_STYLE, ToneMark } from './Tone'
import { STATUS_LABEL } from '../lib/format'

// Geometry of one folded chain.
//
// A chain has one root on the timeline and progresses vertically away from the
// axis through three stacked levels. Each level is a short HORIZONTAL run; at
// the end of a run the strand makes a tight rounded turn on the side and runs
// back the other way on the next level — a switchback, not a staircase and not
// a column of cards. A node sits on each level and interrupts the strand: the
// strand meets one edge of the node and resumes at the opposite edge.

export const NODE_W = 272
/** Comfortable node height. Short viewports shrink this — see ChainMetrics. */
export const NODE_H = 60
/** Node height when vertical room is tight (720p projectors, 768p laptops). */
export const NODE_H_COMPACT = 48
const TURN = 15 // corner radius of a switchback turn

export interface ChainMetrics {
  /** horizontal length of one level */
  run: number
  /** vertical distance between levels */
  levelGap: number
  /** from the anchor to the first level line */
  firstLevel: number
  /** height of a node box; shrinks when the workspace is short */
  nodeH: number
}

export const DEFAULT_METRICS: ChainMetrics = {
  run: 376, levelGap: 84, firstLevel: 32, nodeH: NODE_H,
}

export interface ChainLayout {
  levels: { y: number; nodeX: number; node: ChainNode }[]
  segments: { d: string; tone: Tone; key: string }[]
  /** Bounding box in the canvas coordinate space, for hit testing and scroll. */
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * layoutChain positions a chain anchored at (anchorX, anchorY).
 * `dir` is -1 for a chain above the axis and +1 for one below; the topology is
 * identical, mirrored.
 * `flip` runs the chain to the left of its anchor instead of the right, so a
 * chain near the right edge of the canvas stays on screen.
 */
export function layoutChain(
  chain: Chain,
  anchorX: number,
  anchorY: number,
  dir: 1 | -1,
  flip: boolean,
  metrics: ChainMetrics = DEFAULT_METRICS,
): ChainLayout {
  const { run: RUN, levelGap: LEVEL_GAP, firstLevel: FIRST_LEVEL, nodeH } = metrics
  const sign = flip ? -1 : 1
  const xA = anchorX
  const xB = anchorX + sign * RUN

  const levelY = (i: number) => anchorY + dir * (FIRST_LEVEL + i * LEVEL_GAP)
  const mid = (xA + xB) / 2

  const nodes = [...chain.nodes].sort((a, b) => a.sequence - b.sequence).slice(0, 3)
  const levels = nodes.map((node, i) => ({ y: levelY(i), nodeX: mid, node }))

  // Edges of the node box on a given level.
  const leftEdge = mid - NODE_W / 2
  const rightEdge = mid + NODE_W / 2
  // Outer/inner relative to the run direction.
  const entry = sign > 0 ? leftEdge : rightEdge
  const exit = sign > 0 ? rightEdge : leftEdge

  const toneOf = (from: number, to: number): Tone =>
    chain.segments.find((s) => s.fromSequence === from && s.toSequence === to)?.tone ?? 'review'

  const segments: ChainLayout['segments'] = []
  const r = TURN * dir
  const rx = TURN * sign

  // Root -> node 1: drop away from the axis, turn, run inward to the node edge.
  if (levels[0]) {
    const y1 = levels[0].y
    segments.push({
      key: 'seg-0-1',
      tone: toneOf(0, 1),
      d: `M ${xA} ${anchorY} L ${xA} ${y1 - r} Q ${xA} ${y1} ${xA + rx} ${y1} L ${entry} ${y1}`,
    })
  }

  // node i -> node i+1: leave the far edge, run to the side, tight turn, run back.
  for (let i = 0; i + 1 < levels.length; i++) {
    const yFrom = levels[i].y
    const yTo = levels[i + 1].y
    // Odd levels run in the opposite direction, so entry/exit swap.
    const forward = i % 2 === 0
    const start = forward ? exit : entry
    const end = forward ? exit : entry
    const corner = forward ? xB : xA
    const cornerIn = forward ? xB - rx : xA + rx
    const cornerOut = forward ? xB - rx : xA + rx
    segments.push({
      key: `seg-${i + 1}-${i + 2}`,
      tone: toneOf(i + 1, i + 2),
      d:
        `M ${start} ${yFrom} L ${cornerIn} ${yFrom} ` +
        `Q ${corner} ${yFrom} ${corner} ${yFrom + r} ` +
        `L ${corner} ${yTo - r} ` +
        `Q ${corner} ${yTo} ${cornerOut} ${yTo} ` +
        `L ${end} ${yTo}`,
    })
  }

  const ys = levels.map((l) => l.y)
  return {
    levels,
    segments,
    minX: Math.min(xA, xB) - 10,
    maxX: Math.max(xA, xB) + 10,
    minY: Math.min(anchorY, ...ys) - nodeH / 2,
    maxY: Math.max(anchorY, ...ys) + nodeH / 2,
  }
}

/** The strand itself. Two passes: a solid tone line, then white gaps that read
 *  as links without turning the chain into jewellery. */
export function ChainStrand({ layout }: { layout: ChainLayout }) {
  return (
    <g aria-hidden>
      {layout.segments.map((s) => (
        <g key={s.key}>
          <path
            d={s.d}
            fill="none"
            stroke={TONE_STYLE[s.tone].stroke}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.92}
          />
          <path
            d={s.d}
            fill="none"
            stroke="var(--color-paper)"
            strokeWidth={3.4}
            strokeLinecap="butt"
            strokeDasharray="1.1 8"
            opacity={0.75}
          />
        </g>
      ))}
    </g>
  )
}

export function ChainNodeCard({
  node,
  x,
  y,
  h = NODE_H,
  selected,
  onSelect,
}: {
  node: ChainNode
  x: number
  y: number
  h?: number
  selected: boolean
  onSelect: (id: string) => void
}) {
  const compact = h < NODE_H
  const t = TONE_STYLE[node.tone]
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      aria-pressed={selected}
      className={`absolute rounded-lg border text-left transition-shadow ${t.border} ${
        selected ? 'shadow-[0_0_0_2px_var(--color-flow)] z-20' : 'hover:shadow-md z-10'
      }`}
      style={{
        left: x - NODE_W / 2,
        top: y - h / 2,
        width: NODE_W,
        height: h,
        background: t.fill,
      }}
    >
      <span className="flex h-full items-center gap-2 px-2.5 py-1">
        <span
          className="tnum flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: t.stroke }}
        >
          {String(node.sequence).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.07em] ${t.text}`}>
            <ToneMark tone={node.tone} size={7} />
            {STATUS_LABEL[node.status]}
          </span>
          <span className="mt-[1px] block text-[12px] font-semibold leading-[1.25] text-ink line-clamp-2">
            {node.title}
          </span>
          {/* The summary is the first thing to go when height is scarce; the
              title and the tone still carry the meaning. */}
          {!compact && (
            <span className="mt-[1px] block truncate text-[10px] leading-tight text-muted">
              {node.summary}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

/** Convenience hook so the workspace can lay out and render in one place. */
export function useChainLayout(
  chain: Chain,
  anchorX: number,
  anchorY: number,
  dir: 1 | -1,
  flip: boolean,
  metrics: ChainMetrics = DEFAULT_METRICS,
) {
  return useMemo(
    () => layoutChain(chain, anchorX, anchorY, dir, flip, metrics),
    [chain, anchorX, anchorY, dir, flip, metrics],
  )
}
