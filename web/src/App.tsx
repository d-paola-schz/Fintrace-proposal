import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BriefingAction, ScenarioRequest, WorkspaceResponse } from './types/contracts'
import { api } from './lib/api'
import { TimelineWorkspace } from './components/TimelineWorkspace'
import { NodeDrawer } from './components/NodeDrawer'
import { EventDrawer } from './components/EventDrawer'
import { BriefingBar } from './components/BriefingBar'
import { PurchaseSheet } from './components/PurchaseSheet'
import { ScenarioSheet } from './components/ScenarioSheet'
import { AskSheet } from './components/AskSheet'
import { DataSheet } from './components/DataSheet'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SourceIndexProvider } from './lib/sources'
import { InsightPanel } from './components/InsightPanel'

const EMPTY: ScenarioRequest = { payoutDelayDays: 0, proposal: null, assumptions: null }

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
  const [ws, setWs] = useState<WorkspaceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scenario, setScenario] = useState<ScenarioRequest>(EMPTY)
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [openChainId, setOpenChainId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [askSeed, setAskSeed] = useState<string | undefined>()
  // Whether the step now open was reached by walking backwards, so its deck
  // knows to open on its last card rather than its first.
  const [enteredAtEnd, setEnteredAtEnd] = useState(false)
  const [insight, setInsight] = useState(false)
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
      const next = await api.scenario(req)
      if (mine === seq.current) setWs(next)
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

  // Opening a node opens its chain; they can never disagree.
  //
  // Selecting is not a toggle. Once a chain holds the camera, clicking the step
  // you are already reading used to empty the panel and leave the chain framed
  // against nothing, which read as a misfire rather than a choice. The panel's
  // close control and the chain's own close tag are the ways out.
  const selectNode = useCallback(
    (id: string, atEnd = false) => {
      setInsight(false)
      setEventId(null)
      setEnteredAtEnd(atEnd)
      setNodeId(id)
      const chain = ws?.chains.find((c) => c.nodes.some((n) => n.id === id))
      if (chain) setOpenChainId(chain.id)
    },
    [ws],
  )

  // Opening a chain is now a camera move onto it, so it arrives already
  // saying something: step 01 is selected and its description is what fills
  // the space the rest of the timeline just gave up.
  const toggleChain = useCallback(
    (id: string) => {
      setOpenChainId((cur) => {
        if (cur === id) {
          setNodeId(null)
          return null
        }
        setEventId(null)
        setEnteredAtEnd(false)
        const first = ws?.chains
          .find((c) => c.id === id)
          ?.nodes.reduce<(typeof ws.chains)[number]['nodes'][number] | null>(
            (best, n) => (best === null || n.sequence < best.sequence ? n : best),
            null,
          )
        setNodeId(first ? first.id : null)
        return id
      })
    },
    [ws],
  )

  const selectEvent = useCallback((id: string) => {
    setInsight(false)
    setNodeId(null)
    setEventId((cur) => (cur === id ? null : id))
  }, [])

  const closeDetail = useCallback(() => {
    setNodeId(null)
    setEventId(null)
  }, [])

  // "See why" is the teaching moment: it opens the chain the briefing was
  // talking about and reveals its first step, so the owner learns what the
  // chains are for by using one.
  const seeWhy = useCallback((a: BriefingAction) => {
    setSheet(null)
    setEnteredAtEnd(false)
    if (a.chainId) setOpenChainId(a.chainId)
    setEventId(null)
    if (a.nodeId) setNodeId(a.nodeId)
  }, [])


  const node = useMemo(() => {
    if (!ws || !nodeId) return null
    for (const c of ws.chains) {
      const n = c.nodes.find((x) => x.id === nodeId)
      if (n) return n
    }
    return null
  }, [ws, nodeId])

  const event = useMemo(
    () => (ws && eventId ? (ws.events.find((e) => e.id === eventId) ?? null) : null),
    [ws, eventId],
  )

  if (error && !ws) {
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

  if (!ws) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[12.5px] text-muted">Loading your workspace…</p>
      </div>
    )
  }

  return (
    <SourceIndexProvider sources={ws.sources ?? []}>
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-hair bg-white px-6 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-[#1b2b4b] text-[12px] font-bold text-white">
          P
        </span>
        <span className="text-[14px] font-semibold tracking-tight text-ink">Preflight</span>
        <span className="h-4 w-px bg-hair" />
        <span className="text-[12.5px] text-[#3d4757]">{ws.business.displayName}</span>
        <span className="tnum text-[11.5px] text-muted">
          {ws.displayCurrency} · {ws.today}
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

      {/* Only the what-if strip remains above the timeline. The opening reading
          moved onto the rail itself, where the days it concerns actually are. */}
      <BriefingBar briefing={ws.briefing} onReset={reset} />

      {error && (
        <p className="shrink-0 bg-[#fdf1ea] px-6 py-1.5 text-[11.5px] text-[#8f3612]">{error}</p>
      )}

      <main className="relative min-h-0 flex-1">
        <ErrorBoundary area="The timeline">
          <TimelineWorkspace
            ws={ws}
            selectedNodeId={nodeId}
            selectedEventId={eventId}
            openChainId={openChainId}
            onSelectNode={selectNode}
            onSelectEvent={selectEvent}
            onToggleChain={toggleChain}
            onOpenInsight={() => setInsight(true)}
            rightInset={node || event || insight ? panelW : 0}
            panelW={node || insight ? panelW : 0}
          />
        </ErrorBoundary>

        {node && (
          <ErrorBoundary area="The detail panel">
            <NodeDrawer
              ws={ws}
              width={panelW}
              startAtEnd={enteredAtEnd}
              node={node}
              scenario={scenario}
              onApplyScenario={applyScenario}
              onSelectNode={selectNode}
              onClose={closeDetail}
            />
          </ErrorBoundary>
        )}

        {insight && !node && !event && (
          <ErrorBoundary area="The reading">
            <InsightPanel
              ws={ws}
              width={panelW}
              scenario={scenario}
              onSeeWhy={(a) => {
                setInsight(false)
                seeWhy(a)
              }}
              onClose={() => setInsight(false)}
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
            ws={ws}
            scenario={scenario}
            busy={busy}
            onPreview={applyScenario}
            onReset={reset}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'ask' && (
          <AskSheet
            ws={ws}
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
            ws={ws}
            scenario={scenario}
            busy={busy}
            onRun={applyScenario}
            onReset={() => {
              reset()
              setSheet(null)
            }}
            onInspect={() => setSheet(null)}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'data' && <DataSheet ws={ws} onClose={() => setSheet(null)} />}
      </main>
    </div>
    </SourceIndexProvider>
  )
}
