import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Chain, WorkspaceResponse } from '../types/contracts'
import { addDays, daysBetween, parseDay, shortDate, usd } from '../lib/format'
import { CARD_H, CARD_H_COMPACT, CARD_W, EventCard } from './EventCard'
import { BAND_H, CashComparison } from './CashComparison'
import { ChainEntry, ENTRY_DROP, ENTRY_H } from './ChainEntry'
import {
  ChainNodeCard, ChainStrand, DEFAULT_METRICS, NODE_H, NODE_H_COMPACT, layoutChain,
  type ChainMetrics,
} from './SerpentineChain'

const PX_PER_DAY = 42
const EDGE_PAD = 240
const CARD_ROW_GAP = 6
const MIN_CANVAS_H = 460
/** Thickness of the timeline rail the chains hang from. */
const RAIL_H = 14

/**
 * The timeline: one horizontal rail through the middle of the workspace, with
 * dated events hanging from it and chains folding away from it.
 *
 * The rail now has the full width of the window — no panel compresses it — and
 * only the chain the owner has opened is expanded. The others stay as compact
 * tags, so the screen shows what was asked for rather than everything at once.
 */
export function TimelineWorkspace({
  ws,
  selectedNodeId,
  selectedEventId,
  openChainId,
  onSelectNode,
  onSelectEvent,
  onToggleChain,
  rightInset = 0,
}: {
  ws: WorkspaceResponse
  selectedNodeId: string | null
  selectedEventId: string | null
  openChainId: string | null
  onSelectNode: (id: string) => void
  onSelectEvent: (id: string) => void
  onToggleChain: (id: string) => void
  /** Width of an open drawer, so nothing important is parked underneath it. */
  rightInset?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameH, setFrameH] = useState(MIN_CANVAS_H)
  const [frameW, setFrameW] = useState(1200)
  const didCenter = useRef(false)

  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    const read = (r: DOMRectReadOnly | DOMRect) => {
      setFrameH(Math.max(MIN_CANVAS_H, r.height))
      setFrameW(r.width)
    }
    const ro = new ResizeObserver(([entry]) => read(entry.contentRect))
    ro.observe(el)
    read(el.getBoundingClientRect())
    return () => ro.disconnect()
  }, [])

  const totalDays = Math.max(1, daysBetween(ws.windowStart, ws.windowEnd))
  const canvasW = Math.max(frameW, totalDays * PX_PER_DAY + EDGE_PAD * 2) + rightInset
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

  const compact = frameH < 560
  const nodeH = compact ? NODE_H_COMPACT : NODE_H
  const cardH = compact ? CARD_H_COMPACT : CARD_H

  const rowCount = Math.max(1, ...placed.map((p) => p.row + 1))
  const cardBandH = rowCount * (cardH + CARD_ROW_GAP)

  const comparing = !!ws.scenario.withoutProposal && !!ws.scenario.proposal
  const bandTop = 24

  const focusChain = ws.chains.find((c) => c.id === openChainId) ?? null

  // Vertical budget. Only the open chain needs room for three levels; a
  // collapsed chain needs a tag's worth.
  const GAP_FLOOR = nodeH + 8
  const FIRST_ABOVE = compact ? 26 : 32
  const FIRST_BELOW = (compact ? 46 : 54) + (comparing ? bandTop + BAND_H + 12 : 0)

  const clampGap = (avail: number, first: number) =>
    Math.round(Math.min(120, Math.max(GAP_FLOOR, (avail - nodeH - first) / 2)))

  // One chain is open at a time, so only its side of the rail is budgeted for
  // three levels; the other needs room for a tag. That is what keeps a whole
  // chain inside the viewport instead of running off the bottom.
  const openAbove = focusChain?.direction === 'above'
  const openBelow = focusChain?.direction === 'below'

  const gapAbove = clampGap(frameH / 2 - cardBandH - (compact ? 34 : 42), FIRST_ABOVE)
  const aboveNeed = openAbove
    ? cardBandH + 18 + FIRST_ABOVE + 2 * gapAbove + nodeH / 2 + (compact ? 18 : 24)
    : cardBandH + 18 + ENTRY_DROP + ENTRY_H + 24

  const axisY = Math.max(Math.round(frameH / 2), Math.round(aboveNeed))
  const gapBelow = clampGap(Math.max(frameH, axisY + 190) - axisY - 42, FIRST_BELOW)
  const belowNeed = openBelow
    ? FIRST_BELOW + 2 * gapBelow + nodeH / 2 + (compact ? 26 : 34)
    : FIRST_BELOW + ENTRY_DROP + ENTRY_H + 26
  const canvasH = Math.max(frameH, Math.round(axisY + belowNeed))

  const cardTop = (row: number) => axisY - 20 - (row + 1) * (cardH + CARD_ROW_GAP)

  const metricsFor = (dir: 1 | -1): ChainMetrics =>
    dir === 1
      ? { ...DEFAULT_METRICS, firstLevel: FIRST_BELOW, levelGap: gapBelow, nodeH }
      : { ...DEFAULT_METRICS, firstLevel: FIRST_ABOVE, levelGap: gapAbove, nodeH }

  const anchorFor = (chain: Chain) => {
    const root = ws.events.find((e) => e.id === chain.rootEventId)
    const anchorX = root ? x(root.date) : EDGE_PAD
    if (chain.direction === 'below') return { anchorX, anchorY: axisY, dir: 1 as const }
    return { anchorX, anchorY: axisY - cardBandH - 20, dir: -1 as const }
  }

  const focusLayout = useMemo(() => {
    if (!focusChain) return null
    const { anchorX, anchorY, dir } = anchorFor(focusChain)
    return {
      chain: focusChain,
      layout: layoutChain(focusChain, anchorX, anchorY, dir, false, metricsFor(dir)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusChain, ws.events, axisY, cardBandH, gapAbove, gapBelow, nodeH, FIRST_BELOW])

  useEffect(() => {
    if (didCenter.current || !scrollRef.current) return
    const el = scrollRef.current
    el.scrollLeft = Math.max(0, x(ws.today) - el.clientWidth * 0.46)
    didCenter.current = true
  }, [ws.today, x])

  // Bring whatever the owner just opened into view, and keep it clear of the
  // drawer: a chain explained by a panel sitting on top of it is no use.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (comparing) {
      el.scrollTo({ top: Math.max(0, axisY - RAIL_H - 52), behavior: 'smooth' })
    }
    if (focusLayout) {
      const visible = Math.max(240, el.clientWidth - rightInset)
      const centre = (focusLayout.layout.minX + focusLayout.layout.maxX) / 2
      el.scrollTo({ left: Math.max(0, centre - visible / 2), behavior: 'smooth' })
    }
  }, [comparing, axisY, focusLayout, rightInset])

  const todayX = x(ws.today)
  const ticks = useMemo(() => {
    const out: string[] = []
    for (let d = 0; d <= totalDays; d += 1) {
      const iso = addDays(ws.windowStart, d)
      if (parseInt(iso.slice(8), 10) % 3 === 1) out.push(iso)
    }
    return out
  }, [ws.windowStart, totalDays])

  // Calendar structure: week rules give the axis a rhythm to read against, and
  // month bands say where in the year you are without reading every tick.
  const weeks = useMemo(() => {
    const out: string[] = []
    for (let d = 0; d <= totalDays; d += 1) {
      const iso = addDays(ws.windowStart, d)
      if (parseDay(iso).getUTCDay() === 1) out.push(iso)
    }
    return out
  }, [ws.windowStart, totalDays])


  const chainRoots = new Set(ws.chains.map((c) => c.rootEventId))
  const railEnd = canvasW - EDGE_PAD + 44

  const inWindow = (d?: string) => !!d && d >= ws.windowStart && d <= ws.windowEnd
  const lowMark = inWindow(ws.scenario.lowestDate) ? x(ws.scenario.lowestDate) : null
  const breachMark = inWindow(ws.scenario.firstBreachDate)
    ? x(ws.scenario.firstBreachDate!)
    : null

  return (
    <div ref={frameRef} className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        className="scrollbar-thin h-full overflow-auto"
        role="region"
        aria-label="Financial timeline. Use Tab to move between events and chains."
        tabIndex={0}
      >
        <div className="relative" style={{ width: canvasW, height: canvasH }}>
          <svg className="pointer-events-none absolute inset-0" width={canvasW} height={canvasH} aria-hidden>
            <defs>
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
              <pattern id="railHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="none" />
                <line x1="0" y1="0" x2="0" y2="7" stroke="#ffffff" strokeWidth="2.6" opacity="0.55" />
              </pattern>
              <filter id="railShadow" x="-2%" y="-320%" width="104%" height="740%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.4" floodColor="#17408f" floodOpacity="0.24" />
              </filter>
            </defs>

            {/* week rules, behind everything */}
            {weeks.map((iso) => (
              <line key={`wk-${iso}`} x1={x(iso)} y1={18} x2={x(iso)} y2={canvasH - 18}
                stroke="#1b2b4b" strokeWidth={1} opacity={0.05} />
            ))}

            <g filter="url(#railShadow)">
              <rect x={EDGE_PAD - 44} y={axisY - RAIL_H / 2}
                width={Math.max(0, todayX - (EDGE_PAD - 44))} height={RAIL_H}
                rx={RAIL_H / 2} fill="url(#railRecorded)" />
              <rect x={todayX} y={axisY - RAIL_H / 2}
                width={Math.max(0, railEnd - todayX)} height={RAIL_H}
                rx={RAIL_H / 2} fill="url(#railProjected)" />
              <rect x={todayX} y={axisY - RAIL_H / 2}
                width={Math.max(0, railEnd - todayX)} height={RAIL_H}
                rx={RAIL_H / 2} fill="url(#railHatch)" opacity={0.5} />
            </g>
            <line x1={EDGE_PAD - 40} y1={axisY - RAIL_H / 2 + 1.6} x2={railEnd - 4}
              y2={axisY - RAIL_H / 2 + 1.6} stroke="#ffffff" strokeWidth={1.2}
              opacity={0.42} strokeLinecap="round" />

            {ticks.map((iso) => (
              <g key={iso}>
                <line x1={x(iso)} y1={axisY + RAIL_H / 2 + 2} x2={x(iso)}
                  y2={axisY + RAIL_H / 2 + 7} stroke="#9aa8bd" strokeWidth={1} />
                <text x={x(iso)} y={axisY + RAIL_H / 2 + 20} textAnchor="middle"
                  className="tnum" fontSize={10.5} fill="#7a8598">
                  {shortDate(iso)}
                </text>
              </g>
            ))}

            <line x1={todayX} y1={24} x2={todayX} y2={canvasH - 24}
              stroke="var(--color-flow)" strokeWidth={1.25} strokeDasharray="2 7" opacity={0.3} />

            {/* The three dates that decide everything, marked on the rail
                itself: where cash bottoms out, and where it would first fall
                through the reserve. A date axis alone made the owner hunt. */}
            {lowMark != null && (
              <g>
                <line x1={lowMark} y1={axisY - RAIL_H / 2 - 16} x2={lowMark} y2={axisY - RAIL_H / 2}
                  stroke={ws.scenario.breachesReserve ? '#a35b2a' : '#15803d'} strokeWidth={1.6} />
                <circle cx={lowMark} cy={axisY} r={4.6} fill="#fff"
                  stroke={ws.scenario.breachesReserve ? '#a35b2a' : '#15803d'} strokeWidth={2.4} />
              </g>
            )}
            {breachMark != null && breachMark !== lowMark && (
              <g>
                <line x1={breachMark} y1={axisY - RAIL_H / 2 - 16} x2={breachMark}
                  y2={axisY - RAIL_H / 2} stroke="#a35b2a" strokeWidth={1.6}
                  strokeDasharray="3 3" />
                <circle cx={breachMark} cy={axisY} r={4.2} fill="#fff" stroke="#a35b2a" strokeWidth={2.2} />
              </g>
            )}

            {placed.map(({ event, row }) => {
              const hot = event.id === selectedEventId
              return (
                <g key={`stem-${event.id}`}>
                  <line x1={x(event.date)} y1={cardTop(row) + cardH} x2={x(event.date)}
                    y2={axisY - RAIL_H / 2} stroke={hot ? 'var(--color-flow)' : '#b9c4d6'}
                    strokeWidth={hot ? 1.6 : 1.1} />
                  <circle cx={x(event.date)} cy={axisY} r={hot ? 5.6 : 4.4} fill="#ffffff"
                    stroke={hot ? '#17408f' : '#2f5fbe'} strokeWidth={hot ? 2.2 : 1.8} />
                  <circle cx={x(event.date)} cy={axisY} r={hot ? 2 : 1.5} fill="#17408f" />
                </g>
              )
            })}

            {comparing && (
              <CashComparison scenario={ws.scenario} x={x} top={axisY + RAIL_H / 2 + bandTop} />
            )}

            {/* stubs of chain marking where a closed chain hangs */}
            {ws.chains.filter((c) => c.id !== openChainId).map((c) => {
              const { anchorX, dir } = anchorFor(c)
              const from = dir === 1 ? axisY : axisY - cardBandH - 18
              return (
                <line key={`stub-${c.id}`} x1={anchorX} y1={from} x2={anchorX}
                  y2={from + dir * ENTRY_DROP} stroke="#b9a48c" strokeWidth={2.4}
                  strokeDasharray="1.4 5.5" strokeLinecap="round" opacity={0.9} />
              )
            })}

            {focusLayout && <ChainStrand layout={focusLayout.layout} />}
          </svg>

          <div className="absolute z-20 -translate-x-1/2 rounded-full border border-[#c8d9f7] bg-white px-3 py-1 shadow-sm"
            style={{ left: todayX, top: axisY - RAIL_H / 2 - 28 }}>
            <span className="tnum whitespace-nowrap text-[11px] font-semibold text-[#26457f]">
              Today · {usd(ws.scenario.baselineBalanceCents)}
            </span>
          </div>

          {lowMark != null && (
            <span
              className="tnum absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full border bg-white px-2.5 py-1 text-[10.5px] font-semibold shadow-sm"
              style={{
                left: lowMark,
                top: axisY - RAIL_H / 2 - 28,
                borderColor: ws.scenario.breachesReserve ? '#e6c7ae' : '#c2e2ce',
                color: ws.scenario.breachesReserve ? '#8a4a1f' : '#1f5c3c',
              }}
            >
              Lowest {usd(ws.scenario.lowestCents)}
            </span>
          )}

          {placed.map(({ event, row }) => (
            <EventCard key={event.id} event={event} x={x(event.date)} y={cardTop(row)} h={cardH}
              hasChain={chainRoots.has(event.id)} highlighted={false}
              muted={!event.affectsCash && !chainRoots.has(event.id)}
              selected={selectedEventId === event.id} onSelect={onSelectEvent} />
          ))}

          {/* closed chains: one tag each */}
          {ws.chains.filter((c) => c.id !== openChainId).map((c) => {
            const { anchorX, dir } = anchorFor(c)
            const from = dir === 1 ? axisY : axisY - cardBandH - 18
            return (
              <ChainEntry key={c.id} chain={c} x={anchorX} y={from + dir * ENTRY_DROP}
                dir={dir} active={false} onOpen={onToggleChain} />
            )
          })}

          {/* the open chain, with a way to put it away again */}
          {focusLayout && (
            <div>
              <button
                type="button"
                onClick={() => onToggleChain(focusLayout.chain.id)}
                className="absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#c8d9f7] bg-[#eef4ff] px-3 py-[4px] text-[11px] font-medium text-[#26457f]"
                style={{
                  left: (focusLayout.layout.minX + focusLayout.layout.maxX) / 2,
                  top: focusLayout.chain.direction === 'below'
                    ? focusLayout.layout.maxY + 10
                    : Math.max(2, focusLayout.layout.minY - 26),
                }}
              >
                {focusLayout.chain.title} · close
              </button>
              {focusLayout.layout.levels.map((lv) => (
                <ChainNodeCard key={lv.node.id} node={lv.node} x={lv.nodeX} y={lv.y} h={nodeH}
                  selected={selectedNodeId === lv.node.id} onSelect={onSelectNode} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
