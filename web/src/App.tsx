import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScenarioRequest, SourceStatus, WorkspaceResponse } from './types/contracts'
import { api } from './lib/api'
import { TimelineWorkspace } from './components/TimelineWorkspace'
import { NodeEvidencePanel } from './components/NodeEvidencePanel'
import { AlternativesBar, ScenarioControls } from './components/ScenarioControls'
import { CashComparisonHeadline } from './components/CashComparison'
import { ToneMark } from './components/Tone'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TONE_STYLE } from './components/Tone'

const EMPTY: ScenarioRequest = { payoutDelayDays: 0, proposal: null }

export default function App() {
  const [ws, setWs] = useState<WorkspaceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scenario, setScenario] = useState<ScenarioRequest>(EMPTY)
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)
  const seq = useRef(0)

  const run = useCallback(async (req: ScenarioRequest) => {
    const mine = ++seq.current
    setBusy(true)
    setError(null)
    try {
      const next = await api.scenario(req)
      // Ignore a response that a newer request has already superseded.
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

  const selectNode = useCallback((id: string) => {
    setEventId(null)
    setNodeId((cur) => (cur === id ? null : id))
  }, [])

  const selectEvent = useCallback((id: string) => {
    setNodeId(null)
    setEventId((cur) => (cur === id ? null : id))
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
        <p className="text-[12px] text-muted">Loading the workspace…</p>
      </div>
    )
  }

  const alertTone = ws.alert ? TONE_STYLE[ws.alert.tone] : null
  // While a spend is on the table the comparison headline is the more precise
  // statement of the same risk, so the generic banner stands down.
  const comparing = !!ws.scenario.withoutProposal && !!ws.scenario.proposal

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-hair bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-[#1b2b4b] text-[12px] font-bold text-white">
            P
          </span>
          <span className="text-[14px] font-semibold tracking-tight text-ink">Preflight</span>
        </div>
        <span className="h-4 w-px bg-hair" />
        <span className="text-[12.5px] text-[#3d4757]">{ws.business.displayName}</span>
        <span className="tnum text-[11.5px] text-muted">
          {ws.displayCurrency} · {ws.today}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {(ws.sourceStatus ?? []).map((s) => (
            <StatusDot key={s.name} status={s} />
          ))}
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            className="rounded border border-hair px-2 py-1 text-[11px] text-[#3d4757] hover:border-[#c8d9f7]"
          >
            Data sources
          </button>
        </div>
      </header>

      {showSources && <SourcePanel ws={ws} onClose={() => setShowSources(false)} />}

      {ws.alert && alertTone && !comparing && (
        <button
          type="button"
          onClick={() => ws.alert?.focusNodeId && selectNode(ws.alert.focusNodeId)}
          className={`flex shrink-0 items-center gap-2.5 border-b px-4 py-2 text-left ${alertTone.chip}`}
        >
          <ToneMark tone={ws.alert.tone} size={11} />
          <span className="text-[12.5px] leading-snug">{ws.alert.message}</span>
          {ws.alert.focusNodeId && (
            <span className="ml-auto shrink-0 text-[11px] font-semibold underline">
              Open the node
            </span>
          )}
        </button>
      )}

      <ScenarioControls
        ws={ws}
        scenario={scenario}
        busy={busy}
        onChange={applyScenario}
        onReset={() => applyScenario(EMPTY)}
      />
      <CashComparisonHeadline scenario={ws.scenario} />
      <AlternativesBar ws={ws} scenario={scenario} onChange={applyScenario} />

      {error && (
        <p className="shrink-0 bg-[#fdf3ec] px-4 py-1.5 text-[11.5px] text-[#8a4a1f]">{error}</p>
      )}

      <main className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1">
          <ErrorBoundary area="The timeline">
            <TimelineWorkspace
            ws={ws}
            selectedNodeId={nodeId}
            selectedEventId={eventId}
            onSelectNode={selectNode}
              onSelectEvent={selectEvent}
            />
          </ErrorBoundary>
        </section>
        <aside className="w-[410px] shrink-0 border-l border-hair bg-white">
          <ErrorBoundary area="The detail panel">
            <NodeEvidencePanel
            ws={ws}
            node={node}
            event={event}
            scenario={scenario}
            onApplyScenario={applyScenario}
            onSelectNode={selectNode}
              onClose={() => {
                setNodeId(null)
                setEventId(null)
              }}
            />
          </ErrorBoundary>
        </aside>
      </main>

      <footer className="shrink-0 border-t border-hair bg-white px-4 py-1.5">
        <p className="text-[10px] leading-snug text-muted">{ws.dataNotice}</p>
      </footer>
    </div>
  )
}

// Only a verified call earns green. "configured" means a key exists and nothing
// has been proven, so it reads amber like every other unconfirmed state.
const STATE_COLOUR: Record<SourceStatus['state'], string> = {
  live: '#15803d',
  configured: '#9a7412',
  snapshot: '#9a7412',
  fixture: '#9a7412',
  unavailable: '#a35b2a',
}

const STATE_WORD: Record<SourceStatus['state'], string> = {
  live: 'live',
  configured: 'unverified',
  snapshot: 'snapshot',
  fixture: 'fixture',
  unavailable: 'unavailable',
}

function StatusDot({ status }: { status: SourceStatus }) {
  return (
    <span className="flex items-center gap-1.5" title={status.detail}>
      <span
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: STATE_COLOUR[status.state] ?? '#9a7412' }}
      />
      <span className="text-[10.5px] uppercase tracking-[0.05em] text-muted">
        {status.name} {STATE_WORD[status.state] ?? status.state}
      </span>
    </span>
  )
}

function SourcePanel({ ws, onClose }: { ws: WorkspaceResponse; onClose: () => void }) {
  return (
    <div className="shrink-0 border-b border-hair bg-[#f7f9fb] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-muted">
          Where every figure comes from
        </h2>
        <button type="button" onClick={onClose} className="text-[14px] leading-none text-muted">
          ×
        </button>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {(ws.sourceStatus ?? []).map((s) => (
          <div
            key={s.name}
            className={`rounded-lg border p-2.5 ${
              s.state === 'live' ? 'border-[#c2e2ce] bg-[#f4fbf7]' : 'border-hair bg-white'
            }`}
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: STATE_COLOUR[s.state] ?? '#9a7412' }}
              />
              {s.name} · {STATE_WORD[s.state] ?? s.state}
            </p>
            <p className="mt-1 text-[10.5px] leading-snug text-muted">{s.detail}</p>
            {/* Only the external dependencies can be mis-sold as connected.
                Olist is a prepared offline snapshot of a public dataset, which
                is exactly what it claims to be. */}
            {(s.state === 'configured' || s.state === 'fixture' || s.state === 'unavailable') && (
              <p className="mt-1 text-[10px] font-medium text-[#8a6d1f]">
                Not confirmed connected — do not present this as a live integration.
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {(ws.assumptions ?? []).map((a) => (
          <div key={a.id} className="rounded-lg border border-hair bg-white p-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11.5px] font-semibold text-ink">{a.label}</p>
              {a.value && <p className="tnum shrink-0 text-[10.5px] text-[#3d4757]">{a.value}</p>}
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-muted">{a.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
