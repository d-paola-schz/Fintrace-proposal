// Mirrors server/internal/contracts/types.go. Edit both together.

export type Provenance =
  | 'olist_historical'
  | 'nessie_sandbox'
  | 'derived'
  | 'user_entered'
  | 'demo_assumption'

export type Certainty = 'recorded' | 'scheduled' | 'conditional'
export type Tone = 'risk' | 'review' | 'opportunity'
export type NodeStatus = 'observed' | 'inferred' | 'possible' | 'action'

export interface Claim {
  id: string
  label: string
  display: string
  amountCents?: number
  currency?: string
  provenance: Provenance
  sourceRefs: string[]
  asOf?: string
  note?: string
}

export interface FinancialEvent {
  id: string
  date: string
  label: string
  kind: string
  amountCents: number
  currency: string
  provenance: Provenance
  certainty: Certainty
  sourceRefs: string[]
  asOf: string
  detail?: string
  claims?: Claim[]
  affectsCash: boolean
}

export interface ResponseOption {
  id: string
  label: string
  detail: string
  action?: 'adjust_payout_delay' | 'compare_alternative' | 'edit_proposal' | ''
  value?: string
}

export interface ChartPoint {
  date: string
  label?: string
  amountCents: number
  projected: boolean
}

export interface ChartSpec {
  kind: 'cash_projection' | 'weekly_sales'
  title: string
  caption: string
  points?: ChartPoint[]
  thresholdCents?: number
  currency: string
  provenance: Provenance
  sourceRefs: string[]
}

export interface ChainNode {
  id: string
  chainId: string
  rootEventId: string
  sequence: number
  title: string
  summary: string
  tone: Tone
  status: NodeStatus
  explanation: string
  claims: Claim[]
  sourceRefs: string[]
  assumptionRefs: string[]
  ruleId: string
  chart?: ChartSpec
  responseOptions: ResponseOption[]
  suggestedAsks?: string[]
}

export interface ChainSegment {
  fromSequence: number
  toSequence: number
  tone: Tone
  label?: string
}

export interface Chain {
  id: string
  rootEventId: string
  title: string
  direction: 'above' | 'below'
  ruleId: string
  nodes: ChainNode[]
  segments: ChainSegment[]
}

export interface Assumption {
  id: string
  label: string
  detail: string
  value?: string
  provenance: Provenance
  editable: boolean
  field?: string
}

export interface SourceRecord {
  id: string
  kind: string
  title: string
  detail: string
  provenance: Provenance
  asOf?: string
  origin?: string
}

/**
 * State vocabulary, in descending order of confidence:
 *   live         a real call to the dependency succeeded this run
 *   configured   credentials present but NO call has succeeded yet — never
 *                present this as connected
 *   snapshot     prepared data captured from a real source at a known time
 *   fixture      values we wrote ourselves; never retrieved from the dependency
 *   unavailable  not usable at all
 */
export interface SourceStatus {
  name: 'olist' | 'nessie' | 'ai'
  state: 'live' | 'configured' | 'snapshot' | 'fixture' | 'unavailable'
  detail: string
  asOf?: string
  degraded: boolean
}

export interface ProposedDecision {
  description: string
  category: string
  date: string
  amountCents: number
  minimumReserveCents: number
}

export interface OutflowOverride {
  amountCents?: number
  date?: string
  removed?: boolean
}

/** Replaces the demo's fixed figures with the owner's own. */
export interface AssumptionOverrides {
  outflows?: Record<string, OutflowOverride>
  marketplaceFeePct?: number
  brlPerUsd?: number
  openingBalanceCents?: number
}

export interface ScenarioRequest {
  proposal?: ProposedDecision | null
  payoutDelayDays: number
  reserveCents?: number
  horizonDays?: number
  assumptions?: AssumptionOverrides | null
}

export interface DayBalance {
  date: string
  openingCents: number
  inflowCents: number
  outflowCents: number
  closingCents: number
  eventIds: string[]
  belowReserve: boolean
}

export interface DelayBreakpoint {
  found: boolean
  delayDays: number
  testedUpToDays: number
  breachDate?: string
  lowestCents: number
  explanation: string
}

export interface Alternative {
  id: string
  kind: string
  label: string
  detail: string
  proposal: ProposedDecision
  lowestCents: number
  lowestDate: string
  breachesReserve: boolean
  headroomCents: number
  tradeoff: string
}

export interface MissingInput {
  field: string
  question: string
  whyItMatters: string
}

export interface CashPath {
  label: string
  days: DayBalance[]
  lowestCents: number
  lowestDate: string
  headroomCents: number
  breachesReserve: boolean
  firstBreachDate?: string
}

export interface ScenarioResult {
  currency: string
  baselineBalanceCents: number
  baselineAsOf: string
  baselineSource: string
  startDate: string
  endDate: string
  reserveCents: number
  payoutDelayDays: number
  days: DayBalance[]
  lowestCents: number
  lowestDate: string
  headroomCents: number
  breachesReserve: boolean
  firstBreachDate?: string
  proposal?: ProposedDecision
  withoutProposal?: CashPath
  deltaLowestCents: number
  delayBreakpoint: DelayBreakpoint
  alternatives: Alternative[]
  appliedEvents: FinancialEvent[]
  assumptions: Assumption[]
  missingInputs: MissingInput[]
  claims: Claim[]
  verdict: string
  caveats: string[]
}

export interface BusinessProfile {
  displayName: string
  sellerId: string
  category: string
  location: string
  sourceWindow: string
  timeShiftNote: string
}

/**
 * `kind` is load-bearing. "plan" describes the forecast as it stands;
 * "conditional" describes what WOULD happen under a change that has not
 * happened. They must never be rendered as one statement.
 */
export interface OutlookLine {
  kind: 'plan' | 'conditional'
  label: string
  sentence: string
  amountCents: number
  date: string
  tone: Tone
  /** Server-decided qualifier; the client never infers it from the label. */
  badge?: string
  focusNodeId?: string
  scenarioDelayDays?: number
}

export interface Outlook {
  headline: string
  status: 'on_track' | 'at_risk'
  plan: OutlookLine
  conditional?: OutlookLine
}

export interface WorkspaceAlert {
  tone: Tone
  message: string
  eventIds: string[]
  chainId?: string
  focusNodeId?: string
}

export interface WorkspaceResponse {
  business: BusinessProfile
  displayCurrency: string
  timezone: string
  today: string
  windowStart: string
  windowEnd: string
  events: FinancialEvent[]
  chains: Chain[]
  outlook: Outlook
  scenario: ScenarioResult
  assumptions: Assumption[]
  sources: SourceRecord[]
  sourceStatus: SourceStatus[]
  alert?: WorkspaceAlert
  dataNotice: string
  generatedAt: string
}

export interface ChatRequest {
  question: string
  nodeId?: string
  scenario?: ScenarioRequest
}

export interface ChatResponse {
  ok: boolean
  intent: string
  answer: string
  answerSource: 'model' | 'engine_fallback' | 'unavailable'
  sourceRefs: string[]
  claims: Claim[]
  missingInputs?: MissingInput[]
  proposedChange?: ScenarioRequest
  proposalNote?: string
  unavailable?: string
}

export interface Discovery {
  id: string
  title: string
  rationale: string
  eventRefs: string[]
  status: 'verified' | 'rejected'
  rejectedBecause?: string
  tone?: Tone
  claims: Claim[]
}

export interface DiscoveryResponse {
  available: boolean
  source: 'model' | 'unavailable'
  unavailable?: string
  proposed: number
  verified: number
  discoveries: Discovery[]
  note: string
}

export interface HealthResponse {
  status: string
  version: string
  startedAt: string
  uptimeSeconds: number
  sources: SourceStatus[]
  dataVersion: string
}
