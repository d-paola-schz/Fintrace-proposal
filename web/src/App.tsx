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

const EMPTY: ScenarioRequest = { payoutDelayDays: 0, proposal: null, assumptions: null }

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
  const seq = useRef(0)

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
  const selectNode = useCallback(
    (id: string) => {
      setEventId(null)
      setNodeId((cur) => (cur === id ? null : id))
      const chain = ws?.chains.find((c) => c.nodes.some((n) => n.id === id))
      if (chain) setOpenChainId(chain.id)
    },
    [ws],
  )

  const toggleChain = useCallback((id: string) => {
    setOpenChainId((cur) => {
      if (cur === id) {
        setNodeId(null)
        return null
      }
      return id
    })
  }, [])

  const selectEvent = useCallback((id: string) => {
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
    if (a.chainId) setOpenChainId(a.chainId)
    setEventId(null)
    if (a.nodeId) setNodeId(a.nodeId)
  }, [])

  const askWith = useCallback((question: string) => {
    setAskSeed(question)
    setSheet('ask')
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
        <div className="max-w-md rounded-lg border border-[#e6c7ae] bg-[#fdf3ec] p-4">
          <h1 className="text-[14px] font-semibold text-[#8a4a1f]">
            The calculation service is not responding
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#8a4a1f]">{error}</p>
          <button
            type="button"
            onClick={() => run(scenario)}
            className="mt-3 rounded bg-[#8a4a1f] px-3 py-1.5 text-[12px] font-medium text-white"
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
            onClick={() => setSheet('scenario')}
            className="rounded-md border border-hair px-2.5 py-1 text-[11.5px] text-[#3d4757] hover:border-[#c8d9f7]"
          >
            Try a scenario
          </button>
          <button
            type="button"
            onClick={() => setSheet('data')}
            className="rounded-md border border-hair px-2.5 py-1 text-[11.5px] text-[#3d4757] hover:border-[#c8d9f7]"
          >
            Data &amp; assumptions
          </button>
        </div>
      </header>

      <BriefingBar
        briefing={ws.briefing}
        busy={busy}
        onSeeWhy={seeWhy}
        onCheckPurchase={() => setSheet('purchase')}
        onAsk={askWith}
        onReset={reset}
      />

      {error && (
        <p className="shrink-0 bg-[#fdf3ec] px-6 py-1.5 text-[11.5px] text-[#8a4a1f]">{error}</p>
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
            rightInset={node || event ? 430 : 0}
          />
        </ErrorBoundary>

        {node && (
          <ErrorBoundary area="The detail panel">
            <NodeDrawer
              ws={ws}
              node={node}
              scenario={scenario}
              onApplyScenario={applyScenario}
              onSelectNode={selectNode}
              onClose={closeDetail}
            />
          </ErrorBoundary>
        )}

        {event && !node && (
          <ErrorBoundary area="The detail panel">
            <EventDrawer event={event} onClose={closeDetail} />
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
  )
}
