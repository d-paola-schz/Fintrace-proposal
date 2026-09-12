import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Chain, WorkspaceResponse } from '../types/contracts'
import { addDays, daysBetween, shortDate, usd } from '../lib/format'
import { CARD_H, CARD_W, EventCard } from './EventCard'
import {
  ChainNodeCard, ChainStrand, DEFAULT_METRICS, NODE_H, layoutChain,
  type ChainMetrics,
} from './SerpentineChain'

const PX_PER_DAY = 42
const EDGE_PAD = 120
const CARD_ROW_GAP = 6
const MIN_CANVAS_H = 620

/** The timeline is the first thing the owner understands: one horizontal axis
 *  through the middle of the workspace, with real space above and below it. */
export function TimelineWorkspace({
  ws,
  selectedNodeId,
  selectedEventId,
  onSelectNode,
  onSelectEvent,
}: {
  ws: WorkspaceResponse
  selectedNodeId: string | null
  selectedEventId: string | null
  onSelectNode: (id: string) => void
  onSelectEvent: (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameH, setFrameH] = useState(MIN_CANVAS_H)
  const didCenter = useRef(false)

  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setFrameH(Math.max(MIN_CANVAS_H, entry.contentRect.height))
    })
    ro.observe(el)
    setFrameH(Math.max(MIN_CANVAS_H, el.getBoundingClientRect().height))
    return () => ro.disconnect()
  }, [])

  const totalDays = Math.max(1, daysBetween(ws.windowStart, ws.windowEnd))
  const canvasW = totalDays * PX_PER_DAY + EDGE_PAD * 2
  const x = useMemo(
    () => (iso: string) => EDGE_PAD + daysBetween(ws.windowStart, iso) * PX_PER_DAY,
    [ws.windowStart],
  )

  // Event cards stack into as few rows as fit without overlapping.
  const placed = useMemo(() => {
    const visible = ws.events
      .filter((e) => e.kind !== 'balance')
      .filter((e) => e.date >= ws.windowStart && e.date <= ws.windowEnd)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const rowEnds: number[] = []
    return visible.map((e) => {
      const left = x(e.date) - CARD_W / 2
      let row = rowEnds.findIndex((end) => left > end + 10)
      if (row === -1) {
        row = rowEnds.length
        rowEnds.push(0)
      }
      rowEnds[row] = left + CARD_W
      return { event: e, row }
    })
  }, [ws.events, ws.windowStart, ws.windowEnd, x])

  const rowCount = Math.max(1, ...placed.map((p) => p.row + 1))
  const cardBandH = rowCount * (CARD_H + CARD_ROW_GAP)

  // Vertical budget. The axis sits at the centre of the workspace whenever the
  // chains fit; when they do not, the axis moves just far enough for the upper
  // chain to be whole and the canvas scrolls rather than clipping a node.
  const GAP_FLOOR = NODE_H + 8
  const FIRST_ABOVE = DEFAULT_METRICS.firstLevel
  const FIRST_BELOW = 54

  const clampGap = (avail: number, first: number) =>
    Math.round(Math.min(122, Math.max(GAP_FLOOR, (avail - NODE_H - first) / 2)))

  const gapAbove = clampGap(frameH / 2 - cardBandH - 48, FIRST_ABOVE)
  const aboveNeed = cardBandH + 22 + FIRST_ABOVE + 2 * gapAbove + NODE_H / 2 + 26
  const axisY = Math.max(Math.round(frameH / 2), Math.round(aboveNeed))
  const gapBelow = clampGap(Math.max(frameH, axisY + 220) - axisY - 46, FIRST_BELOW)
  const belowNeed = FIRST_BELOW + 2 * gapBelow + NODE_H / 2 + 40
  const canvasH = Math.max(frameH, Math.round(axisY + belowNeed))

  // Row 0 sits nearest the axis; later rows stack further away from it.
  const cardTop = (row: number) => axisY - 22 - (row + 1) * (CARD_H + CARD_ROW_GAP)

  const metricsFor = (dir: 1 | -1): ChainMetrics =>
    dir === 1
      ? { ...DEFAULT_METRICS, firstLevel: FIRST_BELOW, levelGap: gapBelow }
      : { ...DEFAULT_METRICS, firstLevel: FIRST_ABOVE, levelGap: gapAbove }

  const chainAnchor = (chain: Chain) => {
    const root = ws.events.find((e) => e.id === chain.rootEventId)
    const anchorX = root ? x(root.date) : EDGE_PAD
    if (chain.direction === 'below') return { anchorX, anchorY: axisY, dir: 1 as const }
    // An above-axis chain hangs off the top of the card band so it never
    // collides with the dated cards.
    return { anchorX, anchorY: axisY - cardBandH - 22, dir: -1 as const }
  }

  const layouts = useMemo(
    () =>
      ws.chains.map((chain) => {
        const { anchorX, anchorY, dir } = chainAnchor(chain)
        const flip = anchorX + DEFAULT_METRICS.run + 40 > canvasW
        return { chain, layout: layoutChain(chain, anchorX, anchorY, dir, flip, metricsFor(dir)) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.chains, ws.events, axisY, cardBandH, canvasW, gapAbove, gapBelow],
  )

  // Open on today, with the future — where the decisions are — in view.
  useEffect(() => {
    if (didCenter.current || !scrollRef.current) return
    const el = scrollRef.current
    el.scrollLeft = Math.max(0, x(ws.today) - el.clientWidth * 0.42)
    didCenter.current = true
  }, [ws.today, x])

  const todayX = x(ws.today)
  const ticks = useMemo(() => {
    const out: string[] = []
    for (let d = 0; d <= totalDays; d += 1) {
      const iso = addDays(ws.windowStart, d)
      if (parseInt(iso.slice(8), 10) % 3 === 1) out.push(iso)
    }
    return out
  }, [ws.windowStart, totalDays])

  const highlighted = new Set(ws.alert?.eventIds ?? [])
  const chainRoots = new Set(ws.chains.map((c) => c.rootEventId))

  return (
    <div ref={frameRef} className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        className="scrollbar-thin h-full overflow-auto"
        role="region"
        aria-label="Financial timeline"
      >
        <div className="relative" style={{ width: canvasW, height: canvasH }}>
          {/* ---- strands and axis, drawn beneath the interactive cards ---- */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={canvasW}
            height={canvasH}
            aria-hidden
          >
            {/* the axis */}
            <line
              x1={EDGE_PAD - 40}
              y1={axisY}
              x2={canvasW - EDGE_PAD + 40}
              y2={axisY}
              stroke="var(--color-flow)"
              strokeWidth={2}
              opacity={0.85}
            />
            {/* the future is dashed: the axis itself says what is projected */}
            <line
              x1={todayX}
              y1={axisY}
              x2={canvasW - EDGE_PAD + 40}
              y2={axisY}
              stroke="var(--color-flow)"
              strokeWidth={2}
              strokeDasharray="5 5"
              opacity={0.55}
            />
            <line
              x1={todayX}
              y1={40}
              x2={todayX}
              y2={canvasH - 40}
              stroke="var(--color-flow)"
              strokeWidth={1}
              strokeDasharray="3 6"
              opacity={0.3}
            />
            {ticks.map((iso) => (
              <g key={iso}>
                <line
                  x1={x(iso)}
                  y1={axisY + 1}
                  x2={x(iso)}
                  y2={axisY + 7}
                  stroke="#aab4c2"
                  strokeWidth={1}
                />
                <text
                  x={x(iso)}
                  y={axisY + 20}
                  textAnchor="middle"
                  className="tnum"
                  fontSize={10}
                  fill="#8b95a4"
                >
                  {shortDate(iso)}
                </text>
              </g>
            ))}
            {/* dots and stems for each dated card */}
            {placed.map(({ event, row }) => (
              <g key={`stem-${event.id}`}>
                <line
                  x1={x(event.date)}
                  y1={cardTop(row) + CARD_H}
                  x2={x(event.date)}
                  y2={axisY}
                  stroke={highlighted.has(event.id) ? 'var(--color-flow)' : '#c6cedb'}
                  strokeWidth={1}
                />
                <circle
                  cx={x(event.date)}
                  cy={axisY}
                  r={highlighted.has(event.id) ? 5 : 3.5}
                  fill={highlighted.has(event.id) ? 'var(--color-flow)' : '#fff'}
                  stroke="var(--color-flow)"
                  strokeWidth={1.6}
                />
              </g>
            ))}
            {layouts.map(({ chain, layout }) => (
              <ChainStrand key={chain.id} layout={layout} />
            ))}
          </svg>

          {/* ---- today marker ---- */}
          <div
            className="absolute z-20 -translate-x-1/2 rounded-full border border-[#c8d9f7] bg-white px-2.5 py-1 shadow-sm"
            style={{ left: todayX, top: axisY - 13 }}
          >
            <span className="tnum whitespace-nowrap text-[10.5px] font-semibold text-[#26457f]">
              Today · {usd(ws.scenario.baselineBalanceCents)}
            </span>
          </div>

          {/* ---- dated events ---- */}
          {placed.map(({ event, row }) => (
            <EventCard
              key={event.id}
              event={event}
              x={x(event.date)}
              y={cardTop(row)}
              hasChain={chainRoots.has(event.id)}
              highlighted={highlighted.has(event.id)}
              selected={selectedEventId === event.id}
              onSelect={onSelectEvent}
            />
          ))}

          {/* ---- chain nodes ---- */}
          {layouts.map(({ chain, layout }) => (
            <div key={chain.id}>
              <div
                className="absolute z-10 -translate-x-1/2 whitespace-nowrap text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted"
                style={{
                  left: (layout.minX + layout.maxX) / 2,
                  top:
                    chain.direction === 'below'
                      ? layout.maxY + 8
                      : Math.max(2, layout.minY - 18),
                }}
              >
                {chain.title} chain
              </div>
              {layout.levels.map((lv) => (
                <ChainNodeCard
                  key={lv.node.id}
                  node={lv.node}
                  x={lv.nodeX}
                  y={lv.y}
                  selected={selectedNodeId === lv.node.id}
                  onSelect={onSelectNode}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
