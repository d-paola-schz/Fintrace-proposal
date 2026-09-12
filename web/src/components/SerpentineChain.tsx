import { useLayoutEffect, useMemo, useRef, useState } from 'react'
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

export const NODE_W = 270
/** Comfortable node height. Short viewports shrink this — see ChainMetrics. */
export const NODE_H = 44
/** Node height when vertical room is tight (720p projectors, 768p laptops). */
export const NODE_H_COMPACT = 38
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

  // The chain hangs centred under its root event: the runs extend half a run
  // each side of the anchor, and every node is centred on the anchor itself.
  // The strand drops straight down from the rail into node 01, then folds.
  const mid = anchorX
  const xA = anchorX - RUN / 2
  const xB = anchorX + RUN / 2

  const levelY = (i: number) => anchorY + dir * (FIRST_LEVEL + i * LEVEL_GAP)

  const nodes = [...chain.nodes].sort((a, b) => a.sequence - b.sequence).slice(0, 3)
  const levels = nodes.map((node, i) => ({ y: levelY(i), nodeX: mid, node }))

  const leftEdge = mid - NODE_W / 2
  const rightEdge = mid + NODE_W / 2

  const toneOf = (from: number, to: number): Tone =>
    chain.segments.find((s) => s.fromSequence === from && s.toSequence === to)?.tone ?? 'review'

  const segments: ChainLayout['segments'] = []
  const r = TURN * dir

  // Root -> node 1: a plumb drop from the rail to the top edge of the node.
  if (levels[0]) {
    const y1 = levels[0].y
    segments.push({
      key: 'seg-0-1',
      tone: toneOf(0, 1),
      d: `M ${anchorX} ${anchorY} L ${anchorX} ${y1 - dir * (nodeH / 2)}`,
    })
  }

  // node i -> node i+1: leave one edge, run out to the side, tight turn, run
  // back to the same edge of the next node. Sides alternate, which is what
  // makes the fold read as a switchback.
  for (let i = 0; i + 1 < levels.length; i++) {
    const yFrom = levels[i].y
    const yTo = levels[i + 1].y
    const outward = i % 2 === 0 ? sign > 0 : sign < 0
    const corner = outward ? xB : xA
    const edge = outward ? rightEdge : leftEdge
    const rx = outward ? TURN : -TURN
    segments.push({
      key: `seg-${i + 1}-${i + 2}`,
      tone: toneOf(i + 1, i + 2),
      d:
        `M ${edge} ${yFrom} L ${corner - rx} ${yFrom} ` +
        `Q ${corner} ${yFrom} ${corner} ${yFrom + r} ` +
        `L ${corner} ${yTo - r} ` +
        `Q ${corner} ${yTo} ${corner - rx} ${yTo} ` +
        `L ${edge} ${yTo}`,
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

/**
 * The strand, drawn as an actual chain.
 *
 * Links are placed along the measured path at a fixed spacing and rotated to
 * the local tangent, so they follow the switchback round its turns. Consecutive
 * links alternate between face-on and edge-on and are spaced closer together
 * than they are long, which is what makes them read as interlocking rather than
 * as beads on a string.
 */

/** Geometry of one link, in path-space pixels. */
const LINK_LEN = 13
const LINK_FACE_W = 8.5
const LINK_EDGE_W = 4
const LINK_SPACING = 8.6 // < LINK_LEN, so neighbours overlap and interlock
const LINK_STROKE = 1.9

interface Link {
  x: number
  y: number
  /** tangent angle in degrees */
  a: number
  face: boolean
}

/** Measures a path and returns evenly spaced, tangent-aligned link positions. */
function useLinksAlongPath(d: string): [React.RefObject<SVGPathElement | null>, Link[]] {
  const ref = useRef<SVGPathElement | null>(null)
  const [links, setLinks] = useState<Link[]>([])

  useLayoutEffect(() => {
    const path = ref.current
    if (!path) return
    let total = 0
    try {
      total = path.getTotalLength()
    } catch {
      return
    }
    if (!Number.isFinite(total) || total <= 0) {
      setLinks([])
      return
    }
    const out: Link[] = []
    let i = 0
    for (let at = LINK_SPACING / 2; at <= total; at += LINK_SPACING, i++) {
      const p = path.getPointAtLength(at)
      // Sample slightly ahead for the tangent; clamp at the end of the path.
      const ahead = path.getPointAtLength(Math.min(total, at + 1))
      const behind = path.getPointAtLength(Math.max(0, at - 1))
      const a = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI
      out.push({ x: p.x, y: p.y, a, face: i % 2 === 0 })
    }
    setLinks(out)
  }, [d])

  return [ref, links]
}

function ChainSegmentLinks({ d, tone }: { d: string; tone: Tone }) {
  const [ref, links] = useLinksAlongPath(d)
  const colour = TONE_STYLE[tone].stroke

  return (
    <g>
      {/* Measured, never painted: the links are the visible strand. */}
      <path ref={ref} d={d} fill="none" stroke="none" />
      {links.map((l, i) => {
        const w = l.face ? LINK_FACE_W : LINK_EDGE_W
        return (
          <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.a})`}>
            {/* seat the link against its neighbours */}
            <rect
              x={-LINK_LEN / 2}
              y={-w / 2}
              width={LINK_LEN}
              height={w}
              rx={w / 2}
              ry={w / 2}
              fill="none"
              stroke="var(--color-paper)"
              strokeWidth={LINK_STROKE + 1.6}
            />
            <rect
              x={-LINK_LEN / 2}
              y={-w / 2}
              width={LINK_LEN}
              height={w}
              rx={w / 2}
              ry={w / 2}
              fill="none"
              stroke={colour}
              strokeWidth={LINK_STROKE}
              opacity={l.face ? 0.95 : 0.8}
            />
            {/* a single highlight along the top of the face-on links reads as
                a machined edge catching the light */}
            {l.face && (
              <rect
                x={-LINK_LEN / 2 + 1.7}
                y={-w / 2 + 0.8}
                width={LINK_LEN - 3.4}
                height={w - 1.6}
                rx={(w - 1.6) / 2}
                ry={(w - 1.6) / 2}
                fill="none"
                stroke="#ffffff"
                strokeWidth={0.7}
                opacity={0.42}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}

export function ChainStrand({ layout }: { layout: ChainLayout }) {
  return (
    <g aria-hidden>
      {layout.segments.map((s) => (
        <ChainSegmentLinks key={s.key} d={s.d} tone={s.tone} />
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
  dimmed,
  onSelect,
}: {
  node: ChainNode
  x: number
  y: number
  h?: number
  selected: boolean
  /** True while another chain has focus, so this one recedes without hiding. */
  dimmed?: boolean
  onSelect: (id: string) => void
}) {
  const t = TONE_STYLE[node.tone]
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      aria-pressed={selected}
      title={node.summary}
      className={`absolute rounded-lg border text-left transition-all ${t.border} ${
        selected ? 'shadow-[0_0_0_2px_var(--color-flow)] z-20' : 'hover:shadow-md z-10'
      } ${dimmed && !selected ? 'opacity-55' : 'opacity-100'}`}
      style={{
        left: x - NODE_W / 2,
        top: y - h / 2,
        width: NODE_W,
        height: h,
        background: t.fill,
      }}
    >
      <span className="flex h-full items-center gap-2 px-2.5">
        <span
          className="tnum flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold text-white"
          style={{ background: t.stroke }}
        >
          {node.sequence}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold leading-tight text-ink">
            {node.title}
          </span>
          <span className={`flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] ${t.text}`}>
            <ToneMark tone={node.tone} size={7} />
            {STATUS_LABEL[node.status]}
          </span>
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
