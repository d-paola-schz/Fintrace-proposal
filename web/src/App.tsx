import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BriefingAction, ScenarioRequest, WorkspaceResponse } from './types/contracts'
import { api } from './lib/api'
import { TimelineWorkspace, type Lane, type LaneRef } from './components/TimelineWorkspace'
import { NodeDrawer } from './components/NodeDrawer'
import { EventDrawer } from './components/EventDrawer'
import { PurchaseSheet } from './components/PurchaseSheet'
import { ScenarioSheet } from './components/ScenarioSheet'
import { AskSheet } from './components/AskSheet'
import { DataSheet } from './components/DataSheet'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SourceIndexProvider } from './lib/sources'
import { InsightPanel } from './components/InsightPanel'
import { CashWidget } from './components/CashWidget'

const EMPTY: ScenarioRequest = { payoutDelayDays: 0, proposal: null, assumptions: null }

/** A what-if is a proposed spend or a payout delay. Reserve and figures are plan inputs. */
function isWhatIf(req: ScenarioRequest) {
  return req.payoutDelayDays !== 0 || !!(req.proposal && req.proposal.amountCents > 0)
}

/** The same request with the what-if taken out: the plan it branches from. */
function planOf(req: ScenarioRequest): ScenarioRequest {
  return { ...req, proposal: null, payoutDelayDays: 0 }
}

/**
 * Width of the description panel. The camera frames a chain in what is left,
 * so on a narrow window the panel has to give ground or there is nothing to
 * frame the chain in.
 */
function panelWidth(vw: number) {
  return Math.round(Math.min(460, Math.max(340, vw * 0.34)))
}

type SheetKind = 'scenario' | 'ask' | 'data' | 'purchase' | null

export default function App() {
  // The plan is always on screen. A what-if is fetched beside it, never in its
  // place, so the two can be read at once and can never be mistaken for each other.
  const [plan, setPlan] = useState<WorkspaceResponse | null>(null)
  const [whatIf, setWhatIf] = useState<WorkspaceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scenario, setScenario] = useState<ScenarioRequest>(EMPTY)
  const [nodeRef, setNodeRef] = useState<LaneRef | null>(null)
  const [eventRef, setEventRef] = useState<LaneRef | null>(null)
  const [openChain, setOpenChain] = useState<LaneRef | null>(null)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [askSeed, setAskSeed] = useState<string | undefined>()
  // Whether the step now open was reached by walking backwards, so its deck
  // knows to open on its last card rather than its first.
  const [enteredAtEnd, setEnteredAtEnd] = useState(false)
  const [insight, setInsight] = useState<Lane | null>(null)
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  const seq = useRef(0)

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const panelW = panelWidth(vw)

  const run = useCallback(async (req: ScenarioRequest) => {
    const mine = ++seq.current
    setBusy(true)
    setError(null)
    try {
      const [p, w] = await Promise.all([
        api.scenario(planOf(req)),
        isWhatIf(req) ? api.scenario(req) : Promise.resolve(null),
      ])
      if (mine !== seq.current) return
      setPlan(p)
      const next = w && w.branch ? w : null
      setWhatIf(next)
      // A what-if the server could not branch must never vanish silently: the
      // owner would think the change had been checked and nothing happened.
      if (isWhatIf(req) && !next) {
        setError(
          'The calculation service returned this what-if without a comparison to your plan, so it cannot be drawn. The API may be an older build — restart it and try again.',
        )
      }
      // Anything open on a what-if that no longer exists, or on a chain it no
      // longer changes, is closed rather than left pointing at nothing.
      const stillThere = (ref: LaneRef | null, kind: 'chain' | 'node' | 'event') => {
        if (!ref || ref.lane === 'plan') return true
        if (!next?.branch) return false
        const changed = new Set(next.branch.changedChainIds)
        if (kind === 'chain') return changed.has(ref.id)
        if (kind === 'node') return next.chains.some((c) => changed.has(c.id) && c.nodes.some((n) => n.id === ref.id))
        return next.events.some((e) => e.id === ref.id)
      }
      // A what-if applied while a plan chain is open moves the reader onto that
      // chain's what-if version, at the step they were reading. If the what-if
      // leaves that chain as it was, the camera steps back instead, so the new
      // branch is on screen rather than hidden behind the plan chain.
      const changedIds = new Set(next?.branch?.changedChainIds ?? [])
      const jump = !!next && isWhatIf(req)
      setOpenChain((c) => {
        if (jump && c?.lane === 'plan') return changedIds.has(c.id) ? { id: c.id, lane: 'whatif' } : null
        return stillThere(c, 'chain') ? c : null
      })
      setNodeRef((n) => {
        if (jump && n?.lane === 'plan') {
          const onBranch = next!.chains.some(
            (ch) => changedIds.has(ch.id) && ch.nodes.some((x) => x.id === n.id),
          )
          return onBranch ? { id: n.id, lane: 'whatif' } : null
        }
        return stillThere(n, 'node') ? n : null
      })
      setEventRef((e) => (stillThere(e, 'event') ? e : null))
      setInsight((l) => (l === 'whatif' && !next ? null : l))
    } catch (e) {
      if (mine === seq.current) {
        setError(e instanceof Error ? e.message : 'Could not reach the calculation service.')
      }
    } finally {
      if (mine === seq.current) setBusy(false)
    }
  }, [])

  useEffect(() => {
    run(EMPTY)
  }, [run])

  const applyScenario = useCallback(
    (req: ScenarioRequest) => {
      setScenario(req)
      run(req)
    },
    [run],
  )

  const reset = useCallback(() => {
    setScenario(EMPTY)
    run(EMPTY)
  }, [run])

  /** Removes the what-if and keeps the owner's own reserve and figures. */
  const closeWhatIf = useCallback(() => {
    const next = planOf(scenario)
    setScenario(next)
    run(next)
  }, [scenario, run])

  const laneWs = useCallback(
    (lane: Lane) => (lane === 'whatif' && whatIf ? whatIf : plan),
    [plan, whatIf],
  )
  const laneReq = useCallback(
    (lane: Lane) => (lane === 'whatif' ? scenario : planOf(scenario)),
    [scenario],
  )

  // Opening a node opens its chain on the same rail; they can never disagree.
  const selectNode = useCallback(
    (id: string, lane: Lane, atEnd = false) => {
      setInsight(null)
      setEventRef(null)
      setEnteredAtEnd(atEnd)
      setNodeRef({ id, lane })
      const chain = laneWs(lane)?.chains.find((c) => c.nodes.some((n) => n.id === id))
      if (chain) setOpenChain({ id: chain.id, lane })
    },
    [laneWs],
  )

  // Opening a chain is a camera move onto it, so it arrives already saying
  // something: step 01 is selected.
  const toggleChain = useCallback(
    (id: string, lane: Lane) => {
      if (openChain && openChain.id === id && openChain.lane === lane) {
        setOpenChain(null)
        setNodeRef(null)
        return
      }
      setEventRef(null)
      setInsight(null)
      setEnteredAtEnd(false)
      const chain = laneWs(lane)?.chains.find((c) => c.id === id)
      const first = chain?.nodes.reduce<(typeof chain.nodes)[number] | null>(
        (best, n) => (best === null || n.sequence < best.sequence ? n : best),
        null,
      )
      setNodeRef(first ? { id: first.id, lane } : null)
      setOpenChain({ id, lane })
    },
    [openChain, laneWs],
  )

  const selectEvent = useCallback((id: string, lane: Lane) => {
    setInsight(null)
    setNodeRef(null)
    setEventRef((cur) => (cur && cur.id === id && cur.lane === lane ? null : { id, lane }))
  }, [])

  const closeDetail = useCallback(() => {
    setNodeRef(null)
    setEventRef(null)
  }, [])

  // "See why" opens the chain the reading was talking about, on the rail the
  // reading belongs to — unless the what-if left that chain on the plan.
  const seeWhy = useCallback(
    (a: BriefingAction, lane: Lane) => {
      setSheet(null)
      setEnteredAtEnd(false)
      setEventRef(null)
      const onBranch =
        lane === 'whatif' && !!a.chainId && !!whatIf?.branch?.changedChainIds.includes(a.chainId)
      const l: Lane = onBranch ? 'whatif' : 'plan'
      if (a.chainId) setOpenChain({ id: a.chainId, lane: l })
      if (a.nodeId) setNodeRef({ id: a.nodeId, lane: l })
    },
    [whatIf],
  )

  const node = useMemo(() => {
    if (!nodeRef) return null
    for (const c of laneWs(nodeRef.lane)?.chains ?? []) {
      const n = c.nodes.find((x) => x.id === nodeRef.id)
      if (n) return n
    }
    return null
  }, [nodeRef, laneWs])

  const event = useMemo(
    () => (eventRef ? (laneWs(eventRef.lane)?.events.find((e) => e.id === eventRef.id) ?? null) : null),
    [eventRef, laneWs],
  )

  if (error && !plan) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-[#ebc3ae] bg-[#fdf1ea] p-4">
          <h1 className="text-[14px] font-semibold text-[#8f3612]">
            The calculation service is not responding
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#8f3612]">{error}</p>
          <button
            type="button"
            onClick={() => run(scenario)}
            className="mt-3 rounded bg-[#8f3612] px-3 py-1.5 text-[12px] font-medium text-white"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[12.5px] text-muted">Loading your workspace…</p>
      </div>
    )
  }

  // The sheets that answer a what-if read the what-if; the ones about the plan read the plan.
  const current = whatIf ?? plan

  return (
    <SourceIndexProvider sources={plan.sources ?? []}>
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-hair bg-white px-6 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-[#1b2b4b] text-[12px] font-bold text-white">
          P
        </span>
        <span className="text-[14px] font-semibold tracking-tight text-ink">Preflight</span>
        <span className="h-4 w-px bg-hair" />
        <span className="text-[12.5px] text-[#3d4757]">{plan.business.displayName}</span>
        <span className="tnum text-[11.5px] text-muted">
          {plan.displayCurrency} · {plan.today}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {busy && <span className="text-[11.5px] italic text-muted">recomputing…</span>}
          <button
            type="button"
            onClick={() => setSheet('ask')}
            className="rounded-md border border-hair px-3 py-1.5 text-[12px] text-[#3d4757] hover:border-[#c8d9f7]"
          >
            Ask a question
          </button>
          <button
            type="button"
            onClick={() => setSheet('purchase')}
            className="rounded-md border border-[#c8d9f7] bg-[#eef4ff] px-3 py-1.5 text-[12px] font-semibold text-[#26457f] hover:bg-[#e3edff]"
          >
            Check a purchase
          </button>
          <button
            type="button"
            onClick={() => setSheet('scenario')}
            className="rounded-md border border-hair px-3 py-1.5 text-[12px] text-[#3d4757] hover:border-[#c8d9f7]"
          >
            Try a scenario
          </button>
          <button
            type="button"
            onClick={() => setSheet('data')}
            className="rounded-md border border-hair px-3 py-1.5 text-[12px] text-[#3d4757] hover:border-[#c8d9f7]"
          >
            Data &amp; assumptions
          </button>
        </div>
      </header>

      {error && (
        <p className="shrink-0 bg-[#fdf1ea] px-6 py-1.5 text-[11.5px] text-[#8f3612]">{error}</p>
      )}

      <main className="relative min-h-0 flex-1">
        <ErrorBoundary area="The timeline">
          <TimelineWorkspace
            plan={plan}
            whatIf={whatIf}
            selectedNode={nodeRef}
            selectedEvent={eventRef}
            openChain={openChain}
            onSelectNode={(id, lane) => selectNode(id, lane)}
            onSelectEvent={selectEvent}
            onToggleChain={toggleChain}
            onOpenInsight={(lane) => {
              setNodeRef(null)
              setEventRef(null)
              setInsight(lane)
            }}
            onCloseWhatIf={closeWhatIf}
            rightInset={node || event || insight ? panelW : 0}
            panelW={node || insight ? panelW : 0}
          />
        </ErrorBoundary>

        <ErrorBoundary area="The cash graph">
          <CashWidget
            plan={plan.scenario}
            whatIf={whatIf?.scenario ?? null}
            whatIfLabel={whatIf?.branch?.label}
            receded={!!openChain}
          />
        </ErrorBoundary>

        {node && nodeRef && (
          <ErrorBoundary area="The detail panel">
            <NodeDrawer
              ws={laneWs(nodeRef.lane)!}
              width={panelW}
              startAtEnd={enteredAtEnd}
              node={node}
              scenario={laneReq(nodeRef.lane)}
              onApplyScenario={applyScenario}
              onSelectNode={(id, atEnd) => selectNode(id, nodeRef.lane, atEnd)}
              onClose={closeDetail}
            />
          </ErrorBoundary>
        )}

        {insight && !node && !event && (
          <ErrorBoundary area="The reading">
            <InsightPanel
              ws={laneWs(insight)!}
              width={panelW}
              scenario={laneReq(insight)}
              onSeeWhy={(a) => {
                const lane = insight
                setInsight(null)
                seeWhy(a, lane)
              }}
              onClose={() => setInsight(null)}
            />
          </ErrorBoundary>
        )}

        {event && !node && (
          <ErrorBoundary area="The detail panel">
            <EventDrawer event={event} width={panelW} onClose={closeDetail} />
          </ErrorBoundary>
        )}

        {sheet === 'scenario' && (
          <ScenarioSheet
            ws={plan}
            scenario={scenario}
            busy={busy}
            onPreview={applyScenario}
            onReset={reset}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'ask' && (
          <AskSheet
            ws={current}
            scenario={scenario}
            initialQuestion={askSeed}
            onApplyScenario={applyScenario}
            onClose={() => {
              setSheet(null)
              setAskSeed(undefined)
            }}
          />
        )}
        {sheet === 'purchase' && (
          <PurchaseSheet
            ws={current}
            scenario={scenario}
            busy={busy}
            onRun={applyScenario}
            onReset={() => {
              closeWhatIf()
              setSheet(null)
            }}
            onInspect={() => setSheet(null)}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'data' && <DataSheet ws={plan} onClose={() => setSheet(null)} />}
      </main>
    </div>
    </SourceIndexProvider>
  )
}
