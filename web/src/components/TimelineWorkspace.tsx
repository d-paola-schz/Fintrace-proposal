import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Chain, WorkspaceResponse } from '../types/contracts'
import { addDays, daysBetween, shortDate, usd } from '../lib/format'
import { CARD_H, CARD_H_COMPACT, CARD_W, EventCard } from './EventCard'
import {
  ChainNodeCard, ChainStrand, DEFAULT_METRICS, NODE_H, NODE_H_COMPACT, layoutChain,
  type ChainMetrics,
} from './SerpentineChain'

const PX_PER_DAY = 42
const EDGE_PAD = 120
const CARD_ROW_GAP = 6
const MIN_CANVAS_H = 620
/** Thickness of the timeline rail the chains hang from. */
const RAIL_H = 14

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

  // Vertical budget. Below roughly 700px of workspace the comfortable sizes no
  // longer fit two three-level chains around a centred axis, and the lowest
  // node drops below the fold — which is exactly what happens on a 1366x768
  // laptop or a 720p projector. Shrink the boxes rather than hide a node.
  const compact = frameH < 700
  const nodeH = compact ? NODE_H_COMPACT : NODE_H
  const cardH = compact ? CARD_H_COMPACT : CARD_H

  const rowCount = Math.max(1, ...placed.map((p) => p.row + 1))
  const cardBandH = rowCount * (cardH + CARD_ROW_GAP)

  // The axis sits at the centre of the workspace whenever the chains fit; when
  // they do not, it moves just far enough for the upper chain to be whole and
  // the canvas scrolls rather than clipping a node.
  const GAP_FLOOR = nodeH + 8
  const FIRST_ABOVE = compact ? 26 : DEFAULT_METRICS.firstLevel
  const FIRST_BELOW = compact ? 46 : 54

  const clampGap = (avail: number, first: number) =>
    Math.round(Math.min(122, Math.max(GAP_FLOOR, (avail - nodeH - first) / 2)))

  const gapAbove = clampGap(frameH / 2 - cardBandH - (compact ? 38 : 48), FIRST_ABOVE)
  const aboveNeed =
    cardBandH + 22 + FIRST_ABOVE + 2 * gapAbove + nodeH / 2 + (compact ? 20 : 26)
  const axisY = Math.max(Math.round(frameH / 2), Math.round(aboveNeed))
  const gapBelow = clampGap(Math.max(frameH, axisY + 200) - axisY - 46, FIRST_BELOW)
  const belowNeed = FIRST_BELOW + 2 * gapBelow + nodeH / 2 + (compact ? 30 : 40)
  const canvasH = Math.max(frameH, Math.round(axisY + belowNeed))

  // Row 0 sits nearest the axis; later rows stack further away from it.
  const cardTop = (row: number) => axisY - 22 - (row + 1) * (cardH + CARD_ROW_GAP)

  const metricsFor = (dir: 1 | -1): ChainMetrics =>
    dir === 1
      ? { ...DEFAULT_METRICS, firstLevel: FIRST_BELOW, levelGap: gapBelow, nodeH }
      : { ...DEFAULT_METRICS, firstLevel: FIRST_ABOVE, levelGap: gapAbove, nodeH }

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
    [ws.chains, ws.events, axisY, cardBandH, canvasW, gapAbove, gapBelow, nodeH],
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
          {/* ---- the rail, the strands, and the dated anchors ---- */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={canvasW}
            height={canvasH}
            aria-hidden
          >
            <defs>
              {/* The rail reads as a machined bar: light along the top edge,
                  shadowed underneath, so the chains visibly hang from it. */}
              <linearGradient id="railRecorded" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7ba7f5" />
                <stop offset="42%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#17408f" />
              </linearGradient>
              <linearGradient id="railProjected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#cfdffb" />
                <stop offset="42%" stopColor="#9dbdf6" />
                <stop offset="100%" stopColor="#7c9fdc" />
              </linearGradient>
              <pattern
                id="railHatch" width="7" height="7"
                patternUnits="userSpaceOnUse" patternTransform="rotate(45)"
              >
                <rect width="7" height="7" fill="none" />
                <line x1="0" y1="0" x2="0" y2="7" stroke="#ffffff" strokeWidth="2.6" opacity="0.55" />
              </pattern>
              <filter id="railShadow" x="-2%" y="-320%" width="104%" height="740%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.4" floodColor="#17408f" floodOpacity="0.26" />
              </filter>
            </defs>

            {/* recorded run: solid bar */}
            <g filter="url(#railShadow)">
              <rect
                x={EDGE_PAD - 44}
                y={axisY - RAIL_H / 2}
                width={Math.max(0, todayX - (EDGE_PAD - 44))}
                height={RAIL_H}
                rx={RAIL_H / 2}
                fill="url(#railRecorded)"
              />
              {/* projected run: same bar, lighter, hatched so "not yet real"
                  is carried by texture and not by colour alone */}
              <rect
                x={todayX}
                y={axisY - RAIL_H / 2}
                width={Math.max(0, canvasW - EDGE_PAD + 44 - todayX)}
                height={RAIL_H}
                rx={RAIL_H / 2}
                fill="url(#railProjected)"
              />
              <rect
                x={todayX}
                y={axisY - RAIL_H / 2}
                width={Math.max(0, canvasW - EDGE_PAD + 44 - todayX)}
                height={RAIL_H}
                rx={RAIL_H / 2}
                fill="url(#railHatch)"
                opacity={0.5}
              />
            </g>
            {/* machined highlight along the top edge */}
            <line
              x1={EDGE_PAD - 40}
              y1={axisY - RAIL_H / 2 + 1.6}
              x2={canvasW - EDGE_PAD + 40}
              y2={axisY - RAIL_H / 2 + 1.6}
              stroke="#ffffff"
              strokeWidth={1.2}
              opacity={0.42}
              strokeLinecap="round"
            />

            {/* date ticks read below the rail */}
            {ticks.map((iso) => (
              <g key={iso}>
                <line
                  x1={x(iso)}
                  y1={axisY + RAIL_H / 2 + 2}
                  x2={x(iso)}
                  y2={axisY + RAIL_H / 2 + 7}
                  stroke="#9aa8bd"
                  strokeWidth={1}
                />
                <text
                  x={x(iso)}
                  y={axisY + RAIL_H / 2 + 20}
                  textAnchor="middle"
                  className="tnum"
                  fontSize={10}
                  fill="#7a8598"
                >
                  {shortDate(iso)}
                </text>
              </g>
            ))}

            {/* today: a beam through the whole workspace */}
            <line
              x1={todayX}
              y1={28}
              x2={todayX}
              y2={canvasH - 28}
              stroke="var(--color-flow)"
              strokeWidth={1.25}
              strokeDasharray="2 7"
              opacity={0.34}
            />

            {/* each dated card hangs from a bolt seated in the rail */}
            {placed.map(({ event, row }) => {
              const hot = highlighted.has(event.id)
              return (
                <g key={`stem-${event.id}`}>
                  <line
                    x1={x(event.date)}
                    y1={cardTop(row) + cardH}
                    x2={x(event.date)}
                    y2={axisY - RAIL_H / 2}
                    stroke={hot ? 'var(--color-flow)' : '#b9c4d6'}
                    strokeWidth={hot ? 1.6 : 1.1}
                  />
                  <circle
                    cx={x(event.date)}
                    cy={axisY}
                    r={hot ? 5.6 : 4.4}
                    fill="#ffffff"
                    stroke={hot ? '#17408f' : '#2f5fbe'}
                    strokeWidth={hot ? 2.2 : 1.8}
                  />
                  <circle cx={x(event.date)} cy={axisY} r={hot ? 2 : 1.5} fill="#17408f" />
                </g>
              )
            })}

            {layouts.map(({ chain, layout }) => (
              <ChainStrand key={chain.id} layout={layout} />
            ))}
          </svg>

          {/* ---- today marker ---- */}
          <div
            className="absolute z-20 -translate-x-1/2 rounded-full border border-[#c8d9f7] bg-white px-2.5 py-1 shadow-sm"
            style={{ left: todayX, top: axisY - RAIL_H / 2 - 27 }}
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
              h={cardH}
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
                  h={nodeH}
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
