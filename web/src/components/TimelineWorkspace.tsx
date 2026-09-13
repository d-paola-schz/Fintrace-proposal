import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { BriefingHighlight, Chain, WorkspaceResponse } from '../types/contracts'
import { addDays, daysBetween, parseDay, shortDate, usd } from '../lib/format'
import { CARD_H, CARD_H_COMPACT, CARD_W, EventCard } from './EventCard'
import { EventMarker } from './EventMarker'
import { InsightBand } from './InsightBand'
import { ChainEntry, ENTRY_DROP, ENTRY_H, ENTRY_W } from './ChainEntry'
import {
  ChainNodeCard, ChainStrand, DEFAULT_METRICS, NODE_H, NODE_H_COMPACT, layoutChain,
  type ChainMetrics,
} from './SerpentineChain'

/** Which timeline something belongs to: the modelled plan, or the what-if branching off it. */
export type Lane = 'plan' | 'whatif'
export interface LaneRef {
  lane: Lane
  id: string
}

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
 * Room between the plan's hanging chain tags and the what-if rail. The
 * what-if's own Lowest pill and its label card live in this gap.
 */
const BRANCH_GAP = 84
/** How far a what-if chain tag hangs below the what-if rail. */
const BRANCH_DROP = 46
/** How far before the change the branch leaves the plan rail. */
const BRANCH_LEAD = 64
/** Width of the card that names the what-if and says what it leaves out. */
const LABEL_W = 432
/** Where a what-if event's card sits above its rail. */
const BRANCH_CARD_LIFT = 24

/**
 * The timeline: one horizontal rail through the middle of the workspace, with
 * dated events hanging from it and chains folding away from it.
 *
 * A what-if is not a different state of the same rail. It is a second, purple
 * rail that branches off the plan on the first day the two differ, and draws
 * only what the what-if changes — the events it adds or moves and the chains
 * that read differently. Everything else stays on the plan, and the card at the
 * branch says so, naming what was left out. The server decides what differs.
 */
export function TimelineWorkspace({
  plan,
  whatIf,
  selectedNode,
  selectedEvent,
  openChain,
  onSelectNode,
  onSelectEvent,
  onToggleChain,
  onOpenInsight,
  onCloseWhatIf,
  rightInset = 0,
  panelW = 0,
}: {
  plan: WorkspaceResponse
  /** The what-if, present only while one is shown; carries its branch. */
  whatIf: WorkspaceResponse | null
  selectedNode: LaneRef | null
  selectedEvent: LaneRef | null
  openChain: LaneRef | null
  onSelectNode: (id: string, lane: Lane) => void
  onSelectEvent: (id: string, lane: Lane) => void
  onToggleChain: (id: string, lane: Lane) => void
  /** Opens the full reading of a band drawn on a rail. */
  onOpenInsight: (lane: Lane) => void
  /** Removes the what-if, leaving the plan. */
  onCloseWhatIf: () => void
  /** Width of an open drawer, so nothing important is parked underneath it. */
  rightInset?: number
  /** Width of the description panel, so the camera frames the chain beside it. */
  panelW?: number
}) {
  const ws = plan
  const branch = whatIf?.branch ?? null
  const wi = whatIf && branch ? whatIf : null
  const hasBranch = !!wi && !!branch

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

  // One date scale for both rails, wide enough for whichever reaches further.
  const windowEnd = wi && wi.windowEnd > ws.windowEnd ? wi.windowEnd : ws.windowEnd
  const totalDays = Math.max(1, daysBetween(ws.windowStart, windowEnd))
  const canvasW = Math.max(frameW, totalDays * PX_PER_DAY + EDGE_PAD * 2) + rightInset
  const x = useMemo(
    () => (iso: string) => EDGE_PAD + daysBetween(ws.windowStart, iso) * PX_PER_DAY,
    [ws.windowStart],
  )

  const changedEvents = useMemo(() => new Set(branch?.changedEventIds ?? []), [branch])
  const changedChains = useMemo(() => new Set(branch?.changedChainIds ?? []), [branch])
  /** Only the chains that read differently are drawn on the what-if. */
  const branchChains = useMemo(
    () => (wi ? wi.chains.filter((c) => changedChains.has(c.id)) : []),
    [wi, changedChains],
  )

  const chainRoots = useMemo(() => new Set(ws.chains.map((c) => c.rootEventId)), [ws.chains])

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

  // ---- Focus: which chain, on which rail, holds the camera.
  const focusLane: Lane | null = openChain?.lane ?? null
  const focusChain: Chain | null = openChain
    ? ((openChain.lane === 'plan'
        ? ws.chains.find((c) => c.id === openChain.id)
        : branchChains.find((c) => c.id === openChain.id)) ?? null)
    : null
  const focused = !!focusChain
  const focusIsBranch = focused && focusLane === 'whatif'

  // The events the step being read is about, named by the Go rule that wrote
  // it. A what-if step's unchanged events are shown where they live — on the
  // plan — and its changed ones on its own rail.
  const stepIds = useMemo(() => {
    if (!focusChain || !selectedNode || selectedNode.lane !== focusLane) return [] as string[]
    return focusChain.nodes.find((n) => n.id === selectedNode.id)?.highlightEventIds ?? []
  }, [focusChain, selectedNode, focusLane])
  const revealed = useMemo(
    () => new Set(focusLane === 'whatif' ? stepIds.filter((id) => !changedEvents.has(id)) : stepIds),
    [stepIds, focusLane, changedEvents],
  )
  const revealedBranch = useMemo(
    () => new Set(focusLane === 'whatif' ? stepIds.filter((id) => changedEvents.has(id)) : []),
    [stepIds, focusLane, changedEvents],
  )

  const compact = frameH < 560
  const nodeH = compact ? NODE_H_COMPACT : NODE_H
  const cardH = compact ? CARD_H_COMPACT : CARD_H

  const rowCount = Math.max(1, ...placed.map((p) => p.row + 1))
  const cardBandH = rowCount * (cardH + CARD_ROW_GAP)

  // ---- Vertical budget.
  const GAP_FLOOR = nodeH + 8
  const FIRST_ABOVE = compact ? 26 : 32
  const FIRST_BELOW = compact ? 46 : 54
  const TAIL = compact ? 26 : 34

  const clampGap = (avail: number, first: number) =>
    Math.round(Math.min(120, Math.max(GAP_FLOOR, (avail - nodeH - first) / 2)))

  /** How far a closed plan chain's tag hangs from the rail. Below, it clears the date axis. */
  const dropFor = (dir: 1 | -1) => (dir === 1 ? ENTRY_DROP + AXIS_LABELS_H : ENTRY_DROP)

  const planHangsBelow = ws.chains.some((c) => c.direction === 'below')
  const openAbove = focusLane === 'plan' && focusChain?.direction === 'above'
  const openBelow = focusLane === 'plan' && focusChain?.direction === 'below'

  const gapAbove = clampGap(frameH / 2 - cardBandH - PILL_LANE - (compact ? 12 : 20), FIRST_ABOVE)
  const aboveNeed = openAbove
    ? PILL_LANE + cardBandH + FIRST_ABOVE + 2 * gapAbove + nodeH / 2 + (compact ? 18 : 24)
    : PILL_LANE + cardBandH + ENTRY_DROP + ENTRY_H + 24

  /** The what-if rail sits below whatever the plan hangs beneath its own rail. */
  const branchOffset = (planHangsBelow ? dropFor(1) + ENTRY_H : AXIS_LABELS_H + 12) + BRANCH_GAP
  const branchClosedNeed = branchOffset + BRANCH_DROP + ENTRY_H + 26

  // With a branch, the plan rail rises as far as it needs to so both rails and
  // their tags fit the window — but never above what hangs over the plan.
  const mid = Math.round(frameH / 2)
  const axisY = hasBranch
    ? Math.max(Math.round(aboveNeed), Math.min(mid, frameH - branchClosedNeed))
    : Math.max(mid, Math.round(aboveNeed))
  const branchY = axisY + branchOffset

  const gapBelow = clampGap(Math.max(frameH, axisY + 190) - axisY - 42, FIRST_BELOW)
  const gapBranch = clampGap(Math.max(frameH, branchY + 190) - branchY - 42, FIRST_BELOW)

  let belowNeed = openBelow
    ? FIRST_BELOW + 2 * gapBelow + nodeH / 2 + TAIL
    : FIRST_BELOW + dropFor(1) + ENTRY_H + 26
  if (hasBranch) {
    belowNeed = Math.max(
      belowNeed,
      focusIsBranch ? branchOffset + FIRST_BELOW + 2 * gapBranch + nodeH / 2 + TAIL : branchClosedNeed,
    )
  }
  const canvasH = Math.max(frameH, Math.round(axisY + belowNeed))

  const cardTop = (row: number) => axisY - PILL_LANE - (row + 1) * (cardH + CARD_ROW_GAP)
  const branchCardTop = branchY - BRANCH_CARD_LIFT - cardH

  /**
   * `extra` lengthens the first drop without moving any node: a chain above the
   * rail hangs from its root card's own top, which sits lower than the top of
   * the card band whenever that card is not in the top row.
   */
  const metricsFor = (dir: 1 | -1, lane: Lane, extra = 0): ChainMetrics =>
    lane === 'whatif'
      ? { ...DEFAULT_METRICS, firstLevel: FIRST_BELOW, levelGap: gapBranch, nodeH }
      : dir === 1
        ? { ...DEFAULT_METRICS, firstLevel: FIRST_BELOW, levelGap: gapBelow, nodeH }
        : { ...DEFAULT_METRICS, firstLevel: FIRST_ABOVE + extra, levelGap: gapAbove, nodeH }

  /** Top of the whole card band above the rail; closed tags above hang from here. */
  const bandTop = axisY - PILL_LANE - cardBandH
  const rootRow = (chain: Chain) =>
    placed.find((p) => p.event.id === chain.rootEventId)?.row ?? rowCount - 1

  // A what-if chain always hangs below its own rail: above it is the plan.
  const anchorFor = (chain: Chain, lane: Lane) => {
    if (lane === 'whatif') {
      const root = wi?.events.find((e) => e.id === chain.rootEventId)
      const anchorX = root ? x(root.date) : branch ? x(branch.startDate) : EDGE_PAD
      return { anchorX, anchorY: branchY, dir: 1 as const, extra: 0 }
    }
    const root = ws.events.find((e) => e.id === chain.rootEventId)
    const anchorX = root ? x(root.date) : EDGE_PAD
    if (chain.direction === 'below') return { anchorX, anchorY: axisY, dir: 1 as const, extra: 0 }
    // The strand has to touch the card it hangs from. Anchoring at the band top
    // left a gap down to any root card sitting in a lower row.
    const cardY = cardTop(rootRow(chain))
    return { anchorX, anchorY: cardY, dir: -1 as const, extra: cardY - bandTop }
  }

  const focusLayout = useMemo(() => {
    if (!focusChain || !focusLane) return null
    const { anchorX, anchorY, dir, extra } = anchorFor(focusChain, focusLane)
    return {
      chain: focusChain,
      lane: focusLane,
      anchorX,
      layout: layoutChain(focusChain, anchorX, anchorY, dir, false, metricsFor(dir, focusLane, extra)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusChain, focusLane, ws.events, wi, axisY, branchY, cardBandH, placed, gapAbove, gapBelow, gapBranch, nodeH, FIRST_BELOW])

  const planFocusRootId = focusLane === 'plan' ? (focusLayout?.chain.rootEventId ?? null) : null
  const branchFocusRootId = focusIsBranch ? (focusLayout?.chain.rootEventId ?? null) : null
  /** The branch steps aside entirely while a plan chain is being read. */
  const branchHidden = focused && !focusIsBranch

  /** Everything the focused chain is not steps back rather than vanishing. */
  const recede = (hidden: boolean): CSSProperties => ({
    opacity: hidden ? 0 : 1,
    pointerEvents: hidden ? 'none' : undefined,
    transition: 'opacity 380ms ease',
  })

  /**
   * Where the timeline was scrolled to when the camera took over.
   *
   * The camera used to zero the scroll on the way in, which threw the view to
   * the far end of the history before the move even started. The scroll is left
   * exactly where the owner had it and folded into the camera's own translation
   * instead, so the move begins from the frame they were already looking at.
   */
  const [frozen, setFrozen] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (focused && !frozen) setFrozen({ left: el.scrollLeft, top: el.scrollTop })
    if (!focused && frozen) setFrozen(null)
  }, [focused, frozen])

  type Box = { x0: number; x1: number; y0: number; y1: number }

  /**
   * The camera. Opening a chain scales and slides the canvas until that chain,
   * what it hangs from, and whatever the step being read points at fill the
   * space left of the panel.
   */
  const camera = useMemo(() => {
    if (!focusLayout || !frozen) {
      return { k: 1, tx: 0, ty: 0, view: null as null | Box }
    }
    const l = focusLayout.layout
    const cardBox = (p: (typeof placed)[number]): Box => {
      const cx = x(p.event.date)
      return { x0: cx - CARD_W / 2, x1: cx + CARD_W / 2, y0: cardTop(p.row), y1: cardTop(p.row) + cardH }
    }
    const branchCardBox = (iso: string): Box => {
      const cx = x(iso)
      return { x0: cx - CARD_W / 2, x1: cx + CARD_W / 2, y0: branchCardTop, y1: branchY + RAIL_H }
    }
    const grow = (box: Box, b: Box): Box => ({
      x0: Math.min(box.x0, b.x0), x1: Math.max(box.x1, b.x1),
      y0: Math.min(box.y0, b.y0), y1: Math.max(box.y1, b.y1),
    })

    const availW = Math.max(320, frameW - panelW)
    const availH = Math.max(240, frameH)
    const zoomFor = (b: Box) =>
      Math.min(availW / (b.x1 - b.x0 + FOCUS_PAD * 2), availH / (b.y1 - b.y0 + FOCUS_PAD * 2))

    // The chain and what it hangs from: always the subject.
    let base: Box = { x0: l.minX, x1: l.maxX, y0: l.minY, y1: l.maxY }
    if (focusLayout.lane === 'plan') {
      const root = placed.find((p) => p.event.id === focusLayout.chain.rootEventId)
      if (root) base = grow(base, cardBox(root))
    } else {
      base = grow(base, {
        x0: focusLayout.anchorX - 24, x1: focusLayout.anchorX + 24, y0: branchY - 24, y1: branchY + 24,
      })
      // If the chain hangs from an event the what-if moved, the move is part of
      // the subject: arriving on the chain shows where the event came from.
      for (const m of branch?.moves ?? []) {
        if (m.eventId !== focusLayout.chain.rootEventId) continue
        const gx = x(m.fromDate)
        base = grow(base, { x0: gx - 30, x1: gx + 30, y0: branchY - 16, y1: branchY + 40 })
      }
    }

    // What the step points at, if the frame can hold it legibly.
    let wanted = base
    for (const p of placed) {
      if (revealed.has(p.event.id)) wanted = grow(wanted, cardBox(p))
    }
    for (const e of wi?.events ?? []) {
      if (revealedBranch.has(e.id)) wanted = grow(wanted, branchCardBox(e.date))
    }

    const fits = zoomFor(wanted) >= MIN_ZOOM
    const box = fits ? wanted : base
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomFor(box)))
    const cx = (box.x0 + box.x1) / 2
    const cy = (box.y0 + box.y1) / 2
    const halfW = availW / (2 * k)
    const halfH = availH / (2 * k)
    const view = { x0: cx - halfW, x1: cx + halfW, y0: cy - halfH, y1: cy + halfH }

    return { k, tx: availW / 2 - k * cx + frozen.left, ty: availH / 2 - k * cy + frozen.top, view }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLayout, frameW, frameH, panelW, placed, cardH, axisY, branchY, revealed, revealedBranch, wi, branch, x, frozen])

  /** A revealed event gets a card only if the camera's frame actually holds it. */
  const inFrame = (x0: number, y0: number, y1: number) => {
    const v = camera.view
    if (!v) return true
    return x0 >= v.x0 && x0 + CARD_W <= v.x1 && y0 >= v.y0 && y1 <= v.y1
  }
  const showsCard = (id: string, row: number, date: string) =>
    chainRoots.has(id) ||
    (revealed.has(id) && inFrame(x(date) - CARD_W / 2, cardTop(row), cardTop(row) + cardH))

  useEffect(() => {
    if (didCenter.current || !scrollRef.current) return
    const el = scrollRef.current
    el.scrollLeft = Math.max(0, x(ws.today) - el.clientWidth * 0.46)
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

  // Week rules give the axis a rhythm to read against.
  const weeks = useMemo(() => {
    const out: string[] = []
    for (let d = 0; d <= totalDays; d += 1) {
      const iso = addDays(ws.windowStart, d)
      if (parseDay(iso).getUTCDay() === 1) out.push(iso)
    }
    return out
  }, [ws.windowStart, totalDays])

  const railEnd = x(ws.windowEnd) + 44

  const inWindow = (d?: string) => !!d && d >= ws.windowStart && d <= ws.windowEnd
  const lowMark = inWindow(ws.scenario.lowestDate) ? x(ws.scenario.lowestDate) : null
  const breachMark = inWindow(ws.scenario.firstBreachDate) ? x(ws.scenario.firstBreachDate!) : null

  // ---- The branch.
  const branchStartX = branch ? x(branch.startDate) : 0
  const branchEndX = branch ? Math.min(canvasW - 24, x(branch.endDate) + 44) : 0

  /**
   * Where the branch leaves the plan rail: a little before the change, and
   * clear of any plan chain tag hanging in the way, so the purple line never
   * runs through a tag the owner might want to click.
   */
  const branchFromX = useMemo(() => {
    if (!branch) return 0
    let fx = branchStartX - BRANCH_LEAD
    const spans = ws.chains
      .filter((c) => c.direction === 'below')
      .map((c) => {
        const root = ws.events.find((e) => e.id === c.rootEventId)
        const cx = root ? x(root.date) : EDGE_PAD
        return [cx - ENTRY_W / 2 - 16, cx + ENTRY_W / 2 + 16] as const
      })
      .sort((a, b) => b[0] - a[0])
    for (const [left, right] of spans) if (fx > left && fx < right) fx = left
    return fx
  }, [branch, branchStartX, ws.chains, ws.events, x])

  /** A what-if event is drawn if it changed, or if a changed chain hangs from it. */
  const branchEvents = useMemo(() => {
    if (!wi) return []
    const roots = new Set(branchChains.map((c) => c.rootEventId))
    return wi.events
      .filter((e) => e.kind !== 'balance' && (changedEvents.has(e.id) || roots.has(e.id)))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }, [wi, branchChains, changedEvents])

  /** The what-if's reading covers only its own stretch of rail. */
  const branchHighlight: BriefingHighlight | null = useMemo(() => {
    const h = wi?.briefing.highlight
    if (!h || !branch) return null
    const startDate = h.startDate > branch.startDate ? h.startDate : branch.startDate
    return { ...h, startDate, endDate: h.endDate > startDate ? h.endDate : startDate }
  }, [wi, branch])

  const wRes = wi?.scenario
  const onBranch = (d?: string) => !!branch && !!d && d >= branch.startDate && d <= windowEnd
  const wLowX = wRes && onBranch(wRes.lowestDate) ? x(wRes.lowestDate) : null
  const wBreachX = wRes && onBranch(wRes.firstBreachDate) ? x(wRes.firstBreachDate!) : null

  // When a what-if appears, bring its branch and label into view.
  const branchKey = branch ? `${branch.startDate}|${branch.label}` : ''
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !branchKey || focused) return
    const visibleW = el.clientWidth - rightInset
    const left = branchFromX - 14 - LABEL_W - 24
    const right = branchStartX + 280
    let sl = el.scrollLeft
    if (left < sl) sl = Math.max(0, left)
    else if (right > sl + visibleW) sl = Math.max(0, Math.min(left, right - visibleW))
    const bottom = branchY + BRANCH_DROP + ENTRY_H + 16
    const st = bottom > el.scrollTop + el.clientHeight ? bottom - el.clientHeight : el.scrollTop
    el.scrollTo({ left: sl, top: st, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchKey])

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
              <linearGradient id="railWhatIf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c4b5fd" />
                <stop offset="42%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#5b21b6" />
              </linearGradient>
              <pattern id="railHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="none" />
                <line x1="0" y1="0" x2="0" y2="7" stroke="#ffffff" strokeWidth="2.6" opacity="0.55" />
              </pattern>
              <filter id="railShadow" x="-2%" y="-320%" width="104%" height="740%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.4" floodColor="#17408f" floodOpacity="0.24" />
              </filter>
              <marker id="moveArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7"
                markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#5b21b6" />
              </marker>
              <filter id="railShadowWhatIf" x="-2%" y="-320%" width="104%" height="740%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.4" floodColor="#4c1d95" floodOpacity="0.26" />
              </filter>
            </defs>

            <g style={{ opacity: focused ? CONTEXT_DIM : 1, transition: 'opacity 380ms ease' }}>
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

            </g>

            {/* The what-if: a purple rail that leaves the plan just before the
                first day the two differ. It is all projection, so it is hatched
                along its whole length. */}
            {branch && (
              <g key={branchKey} style={{
                opacity: branchHidden ? 0 : focused && !focusIsBranch ? CONTEXT_DIM : 1,
                transition: 'opacity 380ms ease',
              }}>
                <path
                  d={`M ${branchFromX} ${axisY + RAIL_H / 2} L ${branchFromX} ${branchY - 26} Q ${branchFromX} ${branchY} ${branchFromX + 26} ${branchY} L ${branchStartX} ${branchY}`}
                  fill="none" stroke="#8b5cf6" strokeWidth={4} strokeLinecap="round"
                  strokeLinejoin="round" opacity={0.8} pathLength={1} className="branch-draw"
                />
                <g className="branch-grow">
                <g filter="url(#railShadowWhatIf)">
                  <rect x={branchStartX - RAIL_H / 2} y={branchY - RAIL_H / 2}
                    width={Math.max(RAIL_H, branchEndX - branchStartX + RAIL_H / 2)} height={RAIL_H}
                    rx={RAIL_H / 2} fill="url(#railWhatIf)" />
                  <rect x={branchStartX - RAIL_H / 2} y={branchY - RAIL_H / 2}
                    width={Math.max(RAIL_H, branchEndX - branchStartX + RAIL_H / 2)} height={RAIL_H}
                    rx={RAIL_H / 2} fill="url(#railHatch)" opacity={0.4} />
                </g>
                <line x1={branchStartX} y1={branchY - RAIL_H / 2 + 1.6} x2={branchEndX - 4}
                  y2={branchY - RAIL_H / 2 + 1.6} stroke="#ffffff" strokeWidth={1.2}
                  opacity={0.42} strokeLinecap="round" />
                </g>

                {/* stems for what-if events showing a card */}
                {branchEvents.filter((e) => revealedBranch.has(e.id)).map((e) => (
                  <line key={`wstem-${e.id}`} x1={x(e.date)} y1={branchCardTop + cardH} x2={x(e.date)}
                    y2={branchY - RAIL_H / 2} stroke="#a78bfa" strokeWidth={1.2} />
                ))}

                {/* stubs of chain for closed what-if chains */}
                {branchChains
                  .filter((c) => !(focusIsBranch && c.id === openChain?.id))
                  .map((c) => {
                    const { anchorX } = anchorFor(c, 'whatif')
                    return (
                      <line key={`wstub-${c.id}`} x1={anchorX} y1={branchY} x2={anchorX}
                        y2={branchY + BRANCH_DROP} stroke="#a78bfa" strokeWidth={2.4}
                        strokeDasharray="1.4 5.5" strokeLinecap="round"
                        style={{ opacity: focused ? 0 : 0.9, transition: 'opacity 380ms ease' }} />
                    )
                  })}
              </g>
            )}

            {/* A stem joins a card to the rail. An event showing only its bead
                has nothing at the top of one, so it gets none. */}
            {placed.filter(({ event, row }) => showsCard(event.id, row, event.date))
              .map(({ event, row }) => {
                const hot = selectedEvent?.lane === 'plan' && event.id === selectedEvent.id
                return (
                  <g key={`stem-${event.id}`}
                    style={{
                      opacity: focused && event.id !== planFocusRootId && !revealed.has(event.id) ? 0 : 1,
                      transition: 'opacity 380ms ease',
                    }}
                  >
                    <line x1={x(event.date)} y1={cardTop(row) + cardH} x2={x(event.date)}
                      y2={axisY - RAIL_H / 2} stroke={hot ? 'var(--color-flow)' : '#b9c4d6'}
                      strokeWidth={hot ? 1.6 : 1.1} />
                  </g>
                )
              })}

            {/* stubs of chain marking where a closed plan chain hangs */}
            {ws.chains.filter((c) => !(focusLane === 'plan' && c.id === openChain?.id)).map((c) => {
              const { anchorX, anchorY, dir } = anchorFor(c, 'plan')
              const from = dir === 1 ? axisY : bandTop
              return (
                <line key={`stub-${c.id}`} x1={anchorX} y1={anchorY} x2={anchorX}
                  y2={from + dir * dropFor(dir)} stroke="#b9a48c" strokeWidth={2.4}
                  strokeDasharray="1.4 5.5" strokeLinecap="round"
                  style={{ opacity: focused ? 0 : 0.9, transition: 'opacity 380ms ease' }} />
              )
            })}

            {focusLayout && <ChainStrand layout={focusLayout.layout} />}
          </svg>

          {ws.briefing.highlight && (
            <InsightBand highlight={ws.briefing.highlight} x={x} railY={axisY} railH={RAIL_H}
              onOpen={() => onOpenInsight('plan')} />
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
                dimmed={focused && event.id !== planFocusRootId && !revealed.has(event.id)}
                selected={selectedEvent?.lane === 'plan' && selectedEvent.id === event.id}
                onSelect={(id) => onSelectEvent(id, 'plan')} />
            ) : (
              <EventMarker key={event.id} event={event} x={x(event.date)} railY={axisY}
                cardY={cardTop(row)} cardH={cardH}
                dimmed={focused && !revealed.has(event.id)}
                selected={selectedEvent?.lane === 'plan' && selectedEvent.id === event.id}
                onSelect={(id) => onSelectEvent(id, 'plan')} />
            ),
          )}

          {/* closed plan chains: one tag each */}
          {ws.chains.filter((c) => !(focusLane === 'plan' && c.id === openChain?.id)).map((c) => {
            const { anchorX, dir } = anchorFor(c, 'plan')
            const from = dir === 1 ? axisY : axisY - PILL_LANE - cardBandH
            return (
              <ChainEntry key={c.id} chain={c} x={anchorX} y={from + dir * dropFor(dir)}
                dir={dir} active={false} dimmed={focused} onOpen={(id) => onToggleChain(id, 'plan')} />
            )
          })}

          {branch && wi && (
            <div key={branchKey} className="branch-fade">
              {/* The name of the what-if, the way back, and what it leaves out.
                  It stays readable while a what-if chain is open: the owner must
                  never lose track of reading a hypothetical. */}
              <section
                aria-label={`What-if: ${branch.label}`}
                className="absolute z-20 -translate-y-1/2 rounded-xl border border-[#ddd0f7] bg-white/95 px-3 py-2 shadow-[0_6px_18px_-10px_rgba(76,29,149,0.45)]"
                style={{ left: branchFromX - 14 - LABEL_W, top: branchY, width: LABEL_W, ...recede(branchHidden) }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded bg-[#6d28d9] px-1.5 py-[2px] text-[9.5px] font-bold uppercase tracking-[0.07em] text-white">
                    What-if
                  </span>
                  {/* Never truncated: the date is the part most likely to be cut, and
                      it is the part that says where the branch starts. */}
                  <span className="tnum min-w-0 flex-1 text-[12.5px] font-semibold leading-tight text-[#4c1d95] [overflow-wrap:anywhere]">
                    {branch.label}
                  </span>
                  <button
                    type="button"
                    onClick={onCloseWhatIf}
                    className="shrink-0 rounded-md border border-[#ddd0f7] bg-white px-2 py-[3px] text-[11px] font-medium text-[#5b21b6] hover:bg-[#f5f0ff]"
                  >
                    Back to my plan
                  </button>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-[#5b4a7a]">{branch.note}</p>
                {(branch.moves ?? []).map((m) => {
                  const ev = wi.events.find((e) => e.id === m.eventId)
                  return (
                    <span key={m.eventId} className="sr-only">
                      {ev?.label ?? 'An event'} moves from {shortDate(m.fromDate)} to {shortDate(m.toDate)}.
                    </span>
                  )
                })}
              </section>

              {branchHighlight && (
                <div style={recede(branchHidden)}>
                  <InsightBand highlight={branchHighlight} x={x} railY={branchY} railH={RAIL_H}
                    onOpen={() => onOpenInsight('whatif')} />
                </div>
              )}

              {wLowX != null && wRes && (
                <span
                  className="tnum absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full border bg-white px-2.5 py-1 text-[10.5px] font-semibold shadow-sm"
                  style={{
                    left: wLowX,
                    top: branchY - RAIL_H / 2 - PILL_DROP,
                    borderColor: wRes.breachesReserve ? '#ebc3ae' : '#ddd0f7',
                    color: wRes.breachesReserve ? '#8f3612' : '#5b21b6',
                    ...recede(focused),
                  }}
                >
                  What-if lowest {usd(wRes.lowestCents)}
                </span>
              )}

              {branchEvents.map((e) =>
                revealedBranch.has(e.id) ? (
                  <EventCard key={`wi-${e.id}`} event={e} x={x(e.date)} y={branchCardTop} h={cardH}
                    hasChain={branchChains.some((c) => c.rootEventId === e.id)}
                    highlighted
                    selected={selectedEvent?.lane === 'whatif' && selectedEvent.id === e.id}
                    onSelect={(id) => onSelectEvent(id, 'whatif')} />
                ) : (
                  <EventMarker key={`wi-${e.id}`} event={e} x={x(e.date)} railY={branchY}
                    cardY={branchCardTop} cardH={cardH}
                    dimmed={branchHidden || (focusIsBranch && e.id !== branchFocusRootId)}
                    selected={selectedEvent?.lane === 'whatif' && selectedEvent.id === e.id}
                    onSelect={(id) => onSelectEvent(id, 'whatif')} />
                ),
              )}

              {branchChains
                .filter((c) => !(focusIsBranch && c.id === openChain?.id))
                .map((c) => {
                  const { anchorX } = anchorFor(c, 'whatif')
                  return (
                    <ChainEntry key={`wi-${c.id}`} chain={c} x={anchorX} y={branchY + BRANCH_DROP}
                      dir={1} active={false} dimmed={focused} onOpen={(id) => onToggleChain(id, 'whatif')} />
                  )
                })}
            </div>
          )}

          {/* Marks that must read on top of the coloured band: where cash bottoms
              out, where it breaks the reserve, and where a moved event used to be.
              The band is an HTML layer above the rail drawing, so these get their
              own layer above the band. It never takes the pointer. */}
          <svg className="pointer-events-none absolute inset-0 z-[6]" width={canvasW} height={canvasH} aria-hidden>
            {/* The point where each card's stem meets the rail. */}
            {placed.filter(({ event, row }) => showsCard(event.id, row, event.date))
              .map(({ event }) => {
                const hot = selectedEvent?.lane === 'plan' && event.id === selectedEvent.id
                return (
                  <g key={`pt-${event.id}`}
                    style={{
                      opacity: focused && event.id !== planFocusRootId && !revealed.has(event.id) ? 0 : 1,
                      transition: 'opacity 380ms ease',
                    }}
                  >
                    <circle cx={x(event.date)} cy={axisY} r={hot ? 5.6 : 4.4} fill="#ffffff"
                      stroke={hot ? '#17408f' : '#2f5fbe'} strokeWidth={hot ? 2.2 : 1.8} />
                    <circle cx={x(event.date)} cy={axisY} r={hot ? 2 : 1.5} fill="#17408f" />
                  </g>
                )
              })}
            <g style={{ opacity: focused ? CONTEXT_DIM : 1, transition: 'opacity 380ms ease' }}>
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
                    y2={axisY - RAIL_H / 2} stroke="#ad4318" strokeWidth={1.6} strokeDasharray="3 3" />
                  <circle cx={breachMark} cy={axisY} r={4.2} fill="#fff" stroke="#ad4318" strokeWidth={2.2} />
                </g>
              )}
            </g>
            {branch && (
              <g key={branchKey} style={{ opacity: branchHidden ? 0 : 1, transition: 'opacity 380ms ease' }}>
                {/* Where a moved event used to be, and how far it went. The count
                    is the server's; nothing here is measured from the drawing. */}
                {(branch.moves ?? []).map((m) => {
                  const x0 = x(m.fromDate)
                  const x1 = x(m.toDate)
                  const dir = x1 >= x0 ? 1 : -1
                  const n = Math.abs(m.days)
                  return (
                    <g key={`mv-${m.eventId}`} className="branch-fade">
                      <circle cx={x0} cy={branchY} r={9} fill="#ffffff" stroke="#7c3aed"
                        strokeWidth={1.6} strokeDasharray="3 2.5" opacity={0.95} />
                      <path
                        d={`M ${x0 + dir * 12} ${branchY + 10} Q ${(x0 + x1) / 2} ${branchY + 32} ${x1 - dir * 15} ${branchY + 11}`}
                        fill="none" stroke="#5b21b6" strokeWidth={1.6} strokeDasharray="4 3"
                        markerEnd="url(#moveArrow)"
                      />
                      <text x={x0} y={branchY + (focusIsBranch ? 29 : 36)} textAnchor="middle"
                        fontSize={10.5} fontWeight={600} fill="#5b21b6" className="tnum">
                        {m.days > 0 ? '+' : '−'}{n} {n === 1 ? 'day' : 'days'}
                      </text>
                    </g>
                  )
                })}

                {wLowX != null && wRes && (
                  <g>
                    <line x1={wLowX} y1={branchY - RAIL_H / 2 - 16} x2={wLowX} y2={branchY - RAIL_H / 2}
                      stroke={wRes.breachesReserve ? '#ad4318' : '#15803d'} strokeWidth={1.6} />
                    <circle cx={wLowX} cy={branchY} r={4.6} fill="#fff"
                      stroke={wRes.breachesReserve ? '#ad4318' : '#15803d'} strokeWidth={2.4} />
                  </g>
                )}
                {wBreachX != null && wBreachX !== wLowX && (
                  <g>
                    <line x1={wBreachX} y1={branchY - RAIL_H / 2 - 16} x2={wBreachX}
                      y2={branchY - RAIL_H / 2} stroke="#ad4318" strokeWidth={1.6} strokeDasharray="3 3" />
                    <circle cx={wBreachX} cy={branchY} r={4.2} fill="#fff" stroke="#ad4318" strokeWidth={2.2} />
                  </g>
                )}

              </g>
            )}
          </svg>

          {focusLayout && (
            <div>
              {focusLayout.layout.levels.map((lv) => (
                <ChainNodeCard key={lv.node.id} node={lv.node} x={lv.nodeX} y={lv.y} h={nodeH}
                  selected={selectedNode?.lane === focusLayout.lane && selectedNode.id === lv.node.id}
                  onSelect={(id) => onSelectNode(id, focusLayout.lane)} />
              ))}
            </div>
          )}
         </div>
        </div>
      </div>

      {/* The way out sits outside the transform layer, so it holds the same
          corner whatever the camera is doing. */}
      {focusLayout && (
        <button
          type="button"
          onClick={() => onToggleChain(focusLayout.chain.id, focusLayout.lane)}
          className={`deck-in absolute left-4 top-4 z-40 flex items-center gap-1.5 rounded-full border bg-white/80 px-3 py-[5px] text-[11.5px] font-medium shadow-sm backdrop-blur transition-colors hover:bg-white ${
            focusLayout.lane === 'whatif' ? 'border-[#ddd0f7] text-[#5b21b6]' : 'border-[#c8d9f7] text-[#26457f]'
          }`}
        >
          <span aria-hidden>←</span>
          Close {focusLayout.chain.title}
          {focusLayout.lane === 'whatif' && ' · what-if'}
        </button>
      )}
    </div>
  )
}
