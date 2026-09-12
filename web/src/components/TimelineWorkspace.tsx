import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Chain, WorkspaceResponse } from '../types/contracts'
import { addDays, daysBetween, parseDay, shortDate, usd } from '../lib/format'
import { CARD_H, CARD_H_COMPACT, CARD_W, EventCard } from './EventCard'
import { EventMarker } from './EventMarker'
import { InsightBand } from './InsightBand'
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
 * Height reserved immediately above the rail for the Today and Lowest pills.
 * Without it the bottom card row and the pills were laid out independently and
 * overlapped by nine pixels at every window size.
 */
const PILL_LANE = 46
/**
 * Ticks plus dated labels drawn under the rail. A chain tag hanging below has
 * to clear them, or it sits on top of the calendar it is pointing at.
 */
const AXIS_LABELS_H = 18
/**
 * How far above the rail the Today and Lowest pills sit. It has to clear the
 * markers, which now stand proud of the rail rather than inside it.
 */
const PILL_DROP = 36
/** Padding left around the focused chain when the camera frames it. */
const FOCUS_PAD = 46
/** The camera never magnifies past this, however small the chain. */
const MAX_ZOOM = 1.8
/**
 * ...nor shrinks past this, however wide the step's subject. Below about this
 * the node text stops being comfortably readable, so a step whose events span
 * more than the frame can hold gives up showing all of them rather than
 * shrinking the chain into illegibility.
 */
const MIN_ZOOM = 0.82
/** Opacity the rail and calendar fall to while a chain holds the frame. */
const CONTEXT_DIM = 0.28

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
  onOpenInsight,
  rightInset = 0,
  panelW = 0,
}: {
  ws: WorkspaceResponse
  selectedNodeId: string | null
  selectedEventId: string | null
  openChainId: string | null
  onSelectNode: (id: string) => void
  onSelectEvent: (id: string) => void
  onToggleChain: (id: string) => void
  /** Opens the full reading of the band drawn on the rail. */
  onOpenInsight: () => void
  /** Width of an open drawer, so nothing important is parked underneath it. */
  rightInset?: number
  /** Width of the description panel, so the camera frames the chain beside it. */
  panelW?: number
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

  const chainRoots = useMemo(
    () => new Set(ws.chains.map((c) => c.rootEventId)),
    [ws.chains],
  )

  const visibleEvents = useMemo(
    () =>
      ws.events
        .filter((e) => e.kind !== 'balance')
        .filter((e) => e.date >= ws.windowStart && e.date <= ws.windowEnd)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [ws.events, ws.windowStart, ws.windowEnd],
  )

  // Every event gets a row, whether or not it is currently showing a card.
  // Packing only the visible ones made the band change height as a step
  // revealed or released events, which moved the rail — and the chain hanging
  // off it — underneath the camera.
  const placed = useMemo(() => {
    const rowEnds: number[] = []
    return visibleEvents.map((e) => {
      const left = x(e.date) - CARD_W / 2
      let row = rowEnds.findIndex((end) => left > end + 10)
      if (row === -1) {
        row = rowEnds.length
        rowEnds.push(0)
      }
      rowEnds[row] = left + CARD_W
      return { event: e, row }
    })
  }, [visibleEvents, x])

  // The events the step being read is about. Named by the Go rule that wrote
  // the step, never inferred here from dates or wording.
  const revealed = useMemo(() => {
    if (!openChainId || !selectedNodeId) return new Set<string>()
    const node = ws.chains
      .find((c) => c.id === openChainId)
      ?.nodes.find((n) => n.id === selectedNodeId)
    return new Set(node?.highlightEventIds ?? [])
  }, [ws.chains, openChainId, selectedNodeId])


  const compact = frameH < 560
  const nodeH = compact ? NODE_H_COMPACT : NODE_H
  const cardH = compact ? CARD_H_COMPACT : CARD_H

  const rowCount = Math.max(1, ...placed.map((p) => p.row + 1))
  const cardBandH = rowCount * (cardH + CARD_ROW_GAP)

  /**
   * The two cash paths to draw against each other.
   *
   * A proposed spend compares against the same plan without it. A payout delay
   * compares against the plan with the payout on time — which the engine
   * already returns for every what-if. Only the proposal case was ever drawn,
   * so applying a delay changed the timeline without showing what it changed.
   */
  const baseline =
    ws.scenario.proposal && ws.scenario.withoutProposal
      ? ws.scenario.withoutProposal
      : ws.scenario.payoutDelayDays !== 0
        ? (ws.scenario.onTimePlan ?? null)
        : null
  const comparing = !!baseline
  const comparingDelay = comparing && !ws.scenario.proposal
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
  /**
   * How far a closed chain's tag hangs from the rail.
   *
   * Below the rail it has to clear the date axis, and when a comparison is
   * drawn it has to clear that too — a tag sitting on top of the very chart
   * explaining the what-if was hiding the answer behind the question.
   */
  const dropFor = (dir: 1 | -1) =>
    dir === 1
      ? ENTRY_DROP + AXIS_LABELS_H + (comparing ? bandTop + BAND_H + 14 : 0)
      : ENTRY_DROP

  const openAbove = focusChain?.direction === 'above'
  const openBelow = focusChain?.direction === 'below'

  const gapAbove = clampGap(frameH / 2 - cardBandH - PILL_LANE - (compact ? 12 : 20), FIRST_ABOVE)
  const aboveNeed = openAbove
    ? PILL_LANE + cardBandH + FIRST_ABOVE + 2 * gapAbove + nodeH / 2 + (compact ? 18 : 24)
    : PILL_LANE + cardBandH + ENTRY_DROP + ENTRY_H + 24

  const axisY = Math.max(Math.round(frameH / 2), Math.round(aboveNeed))
  const gapBelow = clampGap(Math.max(frameH, axisY + 190) - axisY - 42, FIRST_BELOW)
  const belowNeed = openBelow
    ? FIRST_BELOW + 2 * gapBelow + nodeH / 2 + (compact ? 26 : 34)
    : FIRST_BELOW + dropFor(1) + ENTRY_H + 26
  const canvasH = Math.max(frameH, Math.round(axisY + belowNeed))

  const cardTop = (row: number) => axisY - PILL_LANE - (row + 1) * (cardH + CARD_ROW_GAP)

  const metricsFor = (dir: 1 | -1): ChainMetrics =>
    dir === 1
      ? { ...DEFAULT_METRICS, firstLevel: FIRST_BELOW, levelGap: gapBelow, nodeH }
      : { ...DEFAULT_METRICS, firstLevel: FIRST_ABOVE, levelGap: gapAbove, nodeH }

  const anchorFor = (chain: Chain) => {
    const root = ws.events.find((e) => e.id === chain.rootEventId)
    const anchorX = root ? x(root.date) : EDGE_PAD
    if (chain.direction === 'below') return { anchorX, anchorY: axisY, dir: 1 as const }
    return { anchorX, anchorY: axisY - PILL_LANE - cardBandH, dir: -1 as const }
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

  const focused = !!focusLayout
  const focusRootId = focusLayout?.chain.rootEventId ?? null

  /** Everything the focused chain is not steps back rather than vanishing. */
  const recede = (hidden: boolean): CSSProperties => ({
    opacity: hidden ? 0 : 1,
    pointerEvents: hidden ? 'none' : undefined,
    transition: 'opacity 380ms ease',
  })

  /**
   * The camera.
   *
   * Opening a chain stops being a disclosure and becomes a move: the canvas
   * scales and slides until that chain fills the space left of the panel, and
   * everything the chain is not fades back. The scale comes from the chain's
   * own bounding box rather than a constant, so a tall chain and a short one
   * both arrive framed.
   */
  /**
   * Where the timeline was scrolled to when the camera took over.
   *
   * The camera used to zero the scroll on the way in, which threw the view to
   * the far end of the history before the move even started — the zoom appeared
   * to fly in from months ago. The scroll is left exactly where the owner had
   * it and folded into the camera's own translation instead, so the move begins
   * from the frame they were already looking at. Nothing scrolls; only the
   * transform animates.
   */
  const [frozen, setFrozen] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (focused && !frozen) setFrozen({ left: el.scrollLeft, top: el.scrollTop })
    if (!focused && frozen) setFrozen(null)
  }, [focused, frozen])

  const camera = useMemo(() => {
    // Identity until the frozen scroll is known, so the transition has exactly
    // one leg: from the survey frame to the chain.
    if (!focusLayout || !frozen) {
      return { k: 1, tx: 0, ty: 0, view: null as null | { x0: number; x1: number; y0: number; y1: number } }
    }
    const l = focusLayout.layout
    // The card the chain hangs from is part of the subject. Framing the strand
    // alone pushed that card up behind the header at wider windows.
    // The subject is the chain, the card it hangs from, and whatever the step
    // being read points at. Stepping through a chain therefore moves the
    // camera: the frame widens to take in the days that step is about, and
    // closes again on a step no recorded day backs.
    const cardBox = (p: (typeof placed)[number]) => {
      const cx = x(p.event.date)
      return {
        x0: cx - CARD_W / 2,
        x1: cx + CARD_W / 2,
        y0: cardTop(p.row),
        y1: cardTop(p.row) + cardH,
      }
    }
    const grow = (
      box: { x0: number; x1: number; y0: number; y1: number },
      b: { x0: number; x1: number; y0: number; y1: number },
    ) => ({
      x0: Math.min(box.x0, b.x0), x1: Math.max(box.x1, b.x1),
      y0: Math.min(box.y0, b.y0), y1: Math.max(box.y1, b.y1),
    })

    const availW = Math.max(320, frameW - panelW)
    const availH = Math.max(240, frameH)
    const zoomFor = (b: { x0: number; x1: number; y0: number; y1: number }) =>
      Math.min(availW / (b.x1 - b.x0 + FOCUS_PAD * 2), availH / (b.y1 - b.y0 + FOCUS_PAD * 2))

    // The chain and the card it hangs from: always the subject.
    let base = { x0: l.minX, x1: l.maxX, y0: l.minY, y1: l.maxY }
    const root = placed.find((p) => p.event.id === focusLayout.chain.rootEventId)
    if (root) base = grow(base, cardBox(root))

    // What the step points at, if the frame can hold it legibly.
    let wanted = base
    for (const p of placed) {
      if (revealed.has(p.event.id)) wanted = grow(wanted, cardBox(p))
    }

    const fits = zoomFor(wanted) >= MIN_ZOOM
    const box = fits ? wanted : base
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomFor(box)))
    const cx = (box.x0 + box.x1) / 2
    const cy = (box.y0 + box.y1) / 2

    // Whatever the frame ends up holding at that zoom. A step may point at more
    // days than fit; those keep their bead on the rail rather than being shrunk
    // into an unreadable row of cards.
    const halfW = availW / (2 * k)
    const halfH = availH / (2 * k)
    const view = { x0: cx - halfW, x1: cx + halfW, y0: cy - halfH, y1: cy + halfH }

    // The container keeps its scroll offset, so the translation has to carry it.
    return {
      k,
      tx: availW / 2 - k * cx + frozen.left,
      ty: availH / 2 - k * cy + frozen.top,
      view,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLayout, frameW, frameH, panelW, placed, cardH, axisY, revealed, x, frozen])

  /**
   * A revealed event gets a card only if the camera's frame actually holds it.
   * A step can point at more days than fit; those keep a lit bead on the rail
   * instead, which is honest about being part of the step without shrinking
   * the chain to fit them all.
   */
  const inFrame = (row: number, date: string) => {
    const v = camera.view
    if (!v) return true
    const cx = x(date)
    return (
      cx - CARD_W / 2 >= v.x0 && cx + CARD_W / 2 <= v.x1 &&
      cardTop(row) >= v.y0 && cardTop(row) + cardH <= v.y1
    )
  }
  const showsCard = (id: string, row: number, date: string) =>
    chainRoots.has(id) || (revealed.has(id) && inFrame(row, date))


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
    // A focused chain is framed by the camera, not by scrolling.
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
        className={`h-full ${focused ? 'overflow-hidden' : 'scrollbar-thin overflow-auto'}`}
        role="region"
        aria-label="Financial timeline. Use Tab to move between events and chains."
        tabIndex={0}
      >
        <div className="relative" style={{ width: canvasW, height: canvasH }}>
         <div
          className="absolute inset-0"
          style={{
            transformOrigin: '0 0',
            transform: `translate(${camera.tx}px, ${camera.ty}px) scale(${camera.k})`,
            transition: 'transform 620ms cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
         >
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

            <g
              style={{
                opacity: focused ? CONTEXT_DIM : 1,
                transition: 'opacity 380ms ease',
              }}
            >
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
                  stroke={ws.scenario.breachesReserve ? '#ad4318' : '#15803d'} strokeWidth={1.6} />
                <circle cx={lowMark} cy={axisY} r={4.6} fill="#fff"
                  stroke={ws.scenario.breachesReserve ? '#ad4318' : '#15803d'} strokeWidth={2.4} />
              </g>
            )}
            {breachMark != null && breachMark !== lowMark && (
              <g>
                <line x1={breachMark} y1={axisY - RAIL_H / 2 - 16} x2={breachMark}
                  y2={axisY - RAIL_H / 2} stroke="#ad4318" strokeWidth={1.6}
                  strokeDasharray="3 3" />
                <circle cx={breachMark} cy={axisY} r={4.2} fill="#fff" stroke="#ad4318" strokeWidth={2.2} />
              </g>
            )}

            </g>

            {/* A stem joins a card to the rail. An event showing only its bead
                has nothing at the top of one, so it gets none: the stems were
                hanging off empty space above every marker. */}
            {placed.filter(({ event, row }) => showsCard(event.id, row, event.date))
              .map(({ event, row }) => {
              const hot = event.id === selectedEventId
              return (
                <g key={`stem-${event.id}`}
                  style={{
                    opacity:
                      focused && event.id !== focusRootId && !revealed.has(event.id) ? 0 : 1,
                    transition: 'opacity 380ms ease',
                  }}
                >
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
              <CashComparison
                scenario={ws.scenario}
                baseline={baseline}
                delay={comparingDelay}
                x={x}
                top={axisY + RAIL_H / 2 + bandTop}
              />
            )}

            {/* stubs of chain marking where a closed chain hangs */}
            {ws.chains.filter((c) => c.id !== openChainId).map((c) => {
              const { anchorX, dir } = anchorFor(c)
              const from = dir === 1 ? axisY : axisY - PILL_LANE - cardBandH
              return (
                <line key={`stub-${c.id}`} x1={anchorX} y1={from} x2={anchorX}
                  y2={from + dir * dropFor(dir)} stroke="#b9a48c" strokeWidth={2.4}
                  strokeDasharray="1.4 5.5" strokeLinecap="round"
                  style={{ opacity: focused ? 0 : 0.9, transition: 'opacity 380ms ease' }} />
              )
            })}

            {focusLayout && <ChainStrand layout={focusLayout.layout} />}
          </svg>

          {ws.briefing.highlight && (
            <InsightBand
              highlight={ws.briefing.highlight}
              x={x}
              railY={axisY}
              railH={RAIL_H}
              onOpen={onOpenInsight}
            />
          )}

          <div className="absolute z-20 -translate-x-1/2 rounded-full border border-[#c8d9f7] bg-white px-3 py-1 shadow-sm"
            style={{ left: todayX, top: axisY - RAIL_H / 2 - PILL_DROP, ...recede(focused) }}>
            <span className="tnum whitespace-nowrap text-[11px] font-semibold text-[#26457f]">
              Today · {usd(ws.scenario.baselineBalanceCents)}
            </span>
          </div>

          {lowMark != null && (
            <span
              className="tnum absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full border bg-white px-2.5 py-1 text-[10.5px] font-semibold shadow-sm"
              style={{
                left: lowMark,
                top: axisY - RAIL_H / 2 - PILL_DROP,
                borderColor: ws.scenario.breachesReserve ? '#ebc3ae' : '#c2e2ce',
                color: ws.scenario.breachesReserve ? '#8f3612' : '#1f5c3c',
                ...recede(focused),
              }}
            >
              Lowest {usd(ws.scenario.lowestCents)}
            </span>
          )}

          {placed.map(({ event, row }) =>
            showsCard(event.id, row, event.date) ? (
              <EventCard key={event.id} event={event} x={x(event.date)} y={cardTop(row)} h={cardH}
                hasChain={chainRoots.has(event.id)}
                highlighted={revealed.has(event.id)}
                muted={!event.affectsCash && !chainRoots.has(event.id)}
                dimmed={focused && event.id !== focusRootId && !revealed.has(event.id)}
                selected={selectedEventId === event.id} onSelect={onSelectEvent} />
            ) : (
              /* everything else: a bead on the rail, readable on demand */
              <EventMarker key={event.id} event={event} x={x(event.date)} railY={axisY}
                cardY={cardTop(row)} cardH={cardH}
                dimmed={focused && !revealed.has(event.id)}
                selected={selectedEventId === event.id} onSelect={onSelectEvent} />
            ),
          )}

          {/* closed chains: one tag each */}
          {ws.chains.filter((c) => c.id !== openChainId).map((c) => {
            const { anchorX, dir } = anchorFor(c)
            const from = dir === 1 ? axisY : axisY - PILL_LANE - cardBandH
            return (
              <ChainEntry key={c.id} chain={c} x={anchorX} y={from + dir * dropFor(dir)}
                dir={dir} active={false} dimmed={focused} onOpen={onToggleChain} />
            )
          })}

          {/* the open chain, with a way to put it away again */}
          {focusLayout && (
            <div>
              {focusLayout.layout.levels.map((lv) => (
                <ChainNodeCard key={lv.node.id} node={lv.node} x={lv.nodeX} y={lv.y} h={nodeH}
                  selected={selectedNodeId === lv.node.id} onSelect={onSelectNode} />
              ))}
            </div>
          )}
         </div>
        </div>
      </div>

      {/* The way out sits outside the transform layer, so it holds the same
          corner whatever the camera is doing. Chasing the bottom of a chain
          that moves on every step is not where a way out belongs. */}
      {focusLayout && (
        <button
          type="button"
          onClick={() => onToggleChain(focusLayout.chain.id)}
          className="deck-in absolute left-4 top-4 z-40 flex items-center gap-1.5 rounded-full border border-[#c8d9f7] bg-white/80 px-3 py-[5px] text-[11.5px] font-medium text-[#26457f] shadow-sm backdrop-blur transition-colors hover:bg-white"
        >
          <span aria-hidden>←</span>
          Close {focusLayout.chain.title}
        </button>
      )}
    </div>
  )
}
