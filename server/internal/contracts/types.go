// Package contracts is the single source of truth for the JSON exchanged between
// the Go server and the React client. The mirrored TypeScript lives in
// web/src/types/contracts.ts and must be edited alongside this file.
package contracts

// Provenance values. Every displayed financial claim must carry one.
const (
	ProvOlistHistorical = "olist_historical"
	ProvNessieSandbox   = "nessie_sandbox"
	ProvDerived         = "derived"
	ProvUserEntered     = "user_entered"
	ProvDemoAssumption  = "demo_assumption"
)

// ProvenanceWords renders a provenance for prose rather than for a badge.
var ProvenanceWords = map[string]string{
	ProvOlistHistorical: "the Olist records",
	ProvNessieSandbox:   "the sandbox bank account",
	ProvDerived:         "a calculation on this page",
	ProvUserEntered:     "something you entered",
	ProvDemoAssumption:  "a demo assumption",
}

// Certainty values.
const (
	CertaintyRecorded    = "recorded"
	CertaintyScheduled   = "scheduled"
	CertaintyConditional = "conditional"
)

// Chain node tones. Colour is never the only carrier of meaning; each tone also
// has a word and an icon in the UI.
const (
	ToneRisk        = "risk"        // bronze
	ToneReview      = "review"      // silver
	ToneOpportunity = "opportunity" // gold
)

// Chain node statuses.
const (
	StatusObserved = "observed"
	StatusInferred = "inferred"
	StatusPossible = "possible"
	StatusAction   = "action"
)

// Claim is one displayed number with its source. The UI refuses to render a
// financial figure that does not arrive inside a Claim.
type Claim struct {
	ID          string   `json:"id"`
	Label       string   `json:"label"`
	Display     string   `json:"display"`
	AmountCents *int64   `json:"amountCents,omitempty"`
	Currency    string   `json:"currency,omitempty"`
	Provenance  string   `json:"provenance"`
	SourceRefs  []string `json:"sourceRefs"`
	AsOf        string   `json:"asOf,omitempty"`
	Note        string   `json:"note,omitempty"`
}

// FinancialEvent is one dated item on the timeline.
type FinancialEvent struct {
	ID          string   `json:"id"`
	Date        string   `json:"date"` // YYYY-MM-DD in the business timezone
	Label       string   `json:"label"`
	Kind        string   `json:"kind"` // sales | payout | supplier_payment | bill | ad_spend | proposal
	AmountCents int64    `json:"amountCents"`
	Currency    string   `json:"currency"`
	Provenance  string   `json:"provenance"`
	Certainty   string   `json:"certainty"`
	SourceRefs  []string `json:"sourceRefs"`
	AsOf        string   `json:"asOf"`
	Detail      string   `json:"detail,omitempty"`
	Claims      []Claim  `json:"claims,omitempty"`
	// AffectsCash gates the engine. Sales are revenue, not cash: an order-item
	// sale never moves the bank balance, so it is displayed on the timeline with
	// AffectsCash false and the projection ignores it entirely.
	AffectsCash bool `json:"affectsCash"`
}

// IsInflow reports whether the event increases cash.
func (e FinancialEvent) IsInflow() bool { return e.AmountCents > 0 }

// ResponseOption is a proposal shown to the owner. Nothing is ever executed.
type ResponseOption struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Detail string `json:"detail"`
	// Action tells the UI which control to offer. "adjust_payout_delay",
	// "compare_alternative", "edit_proposal", or "" for advisory only.
	Action string `json:"action,omitempty"`
	Value  string `json:"value,omitempty"`
}

// ChartSpec describes the contextual chart a node wants to render.
type ChartSpec struct {
	Kind    string       `json:"kind"` // cash_projection | weekly_sales
	Title   string       `json:"title"`
	Caption string       `json:"caption"`
	Points  []ChartPoint `json:"points,omitempty"`
	// ThresholdCents draws the reserve line on cash charts.
	ThresholdCents *int64   `json:"thresholdCents,omitempty"`
	Currency       string   `json:"currency"`
	Provenance     string   `json:"provenance"`
	SourceRefs     []string `json:"sourceRefs"`
}

type ChartPoint struct {
	Date        string `json:"date"`
	Label       string `json:"label,omitempty"`
	AmountCents int64  `json:"amountCents"`
	Projected   bool   `json:"projected"`
}

// ChainNode is one inspectable step of a chain.
type ChainNode struct {
	ID          string `json:"id"`
	ChainID     string `json:"chainId"`
	RootEventID string `json:"rootEventId"`
	Sequence    int    `json:"sequence"` // 1..3, level 1 nearest the axis
	Title       string `json:"title"`
	Summary     string `json:"summary"` // compact card line
	Tone        string `json:"tone"`
	Status      string `json:"status"`
	Explanation string `json:"explanation"`

	Claims          []Claim          `json:"claims"`
	SourceRefs      []string         `json:"sourceRefs"`
	AssumptionRefs  []string         `json:"assumptionRefs"`
	RuleID          string           `json:"ruleId"`
	Chart           *ChartSpec       `json:"chart,omitempty"`
	ResponseOptions []ResponseOption `json:"responseOptions"`
	SuggestedAsks   []string         `json:"suggestedAsks,omitempty"`

	// HighlightEventIDs are the dated events this step is actually talking
	// about, named by the rule that wrote the step. The interface brings just
	// these back onto the timeline while the step is being read, so the owner
	// can see which days a sentence refers to.
	//
	// This adds no figure and no claim. Every id here must already be an event
	// in the same payload; a test enforces that.
	HighlightEventIDs []string `json:"highlightEventIds"`
}

// ChainSegment is the strand between two consecutive levels. Segments carry
// their own tone so one chain can run risk -> review -> opportunity.
type ChainSegment struct {
	FromSequence int    `json:"fromSequence"` // 0 means root event -> node 1
	ToSequence   int    `json:"toSequence"`
	Tone         string `json:"tone"`
	Label        string `json:"label,omitempty"`
}

// Chain is a compact folded strand anchored to one timeline event.
type Chain struct {
	ID          string         `json:"id"`
	RootEventID string         `json:"rootEventId"`
	Title       string         `json:"title"`
	Direction   string         `json:"direction"` // above | below
	RuleID      string         `json:"ruleId"`
	Nodes       []ChainNode    `json:"nodes"`
	Segments    []ChainSegment `json:"segments"`
}

// Assumption is a named, inspectable modelling decision.
type Assumption struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Detail     string `json:"detail"`
	Value      string `json:"value,omitempty"`
	Provenance string `json:"provenance"`
	Editable   bool   `json:"editable"`
	// Field names the scenario field the UI may edit, when Editable.
	Field string `json:"field,omitempty"`
}

// SourceRecord resolves a sourceRef ID to something the owner can open.
type SourceRecord struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"` // olist_query | nessie_record | assumption | user_input | derived
	Title      string `json:"title"`
	Detail     string `json:"detail"`
	Provenance string `json:"provenance"`
	AsOf       string `json:"asOf,omitempty"`
	// Origin is a human-readable pointer such as a table name or API route.
	Origin string `json:"origin,omitempty"`
}

// SourceStatus reports per-dependency health without leaking secrets.
type SourceStatus struct {
	Name     string `json:"name"`  // olist | nessie | ai
	State    string `json:"state"` // live | snapshot | fixture | unavailable
	Detail   string `json:"detail"`
	AsOf     string `json:"asOf,omitempty"`
	Degraded bool   `json:"degraded"`
}

// ProposedDecision is a dated expenditure the owner is considering.
type ProposedDecision struct {
	Description         string `json:"description"`
	Category            string `json:"category"` // marketing | inventory | equipment | other
	Date                string `json:"date"`
	AmountCents         int64  `json:"amountCents"`
	MinimumReserveCents int64  `json:"minimumReserveCents"`
}

// OutflowOverride replaces one modeled payment with the owner's own figure.
type OutflowOverride struct {
	AmountCents *int64  `json:"amountCents,omitempty"`
	Date        *string `json:"date,omitempty"`
	// Removed drops the payment entirely: it may simply not apply to them.
	Removed bool `json:"removed,omitempty"`
}

// AssumptionOverrides turns the demo's fixed figures into the owner's inputs.
//
// Everything here shipped as a constant in data/demo-assumptions.json. Any
// value the owner supplies replaces it and, just as importantly, changes that
// figure's provenance from "demo assumption" to "you entered", so the source
// badges stay truthful as the scenario becomes theirs.
type AssumptionOverrides struct {
	// Outflows is keyed by assumption id: asm-supplier, asm-ads, asm-rent.
	Outflows map[string]OutflowOverride `json:"outflows,omitempty"`
	// MarketplaceFeePct replaces the modeled commission.
	MarketplaceFeePct *float64 `json:"marketplaceFeePct,omitempty"`
	// BRLPerUSD replaces the demo conversion rate.
	BRLPerUSD *float64 `json:"brlPerUsd,omitempty"`
	// OpeningBalanceCents replaces the starting cash position.
	OpeningBalanceCents *int64 `json:"openingBalanceCents,omitempty"`
}

// Any reports whether the owner has changed anything at all.
func (a *AssumptionOverrides) Any() bool {
	if a == nil {
		return false
	}
	return len(a.Outflows) > 0 || a.MarketplaceFeePct != nil ||
		a.BRLPerUSD != nil || a.OpeningBalanceCents != nil
}

// ScenarioRequest is the validated input to the deterministic engine.
type ScenarioRequest struct {
	Proposal        *ProposedDecision `json:"proposal,omitempty"`
	PayoutDelayDays int               `json:"payoutDelayDays"`
	// ReserveCents overrides the default reserve when > 0.
	ReserveCents int64 `json:"reserveCents,omitempty"`
	// HorizonDays defaults to 30.
	HorizonDays int `json:"horizonDays,omitempty"`
	// Assumptions replaces the demo's fixed figures with the owner's own.
	Assumptions *AssumptionOverrides `json:"assumptions,omitempty"`
}

// DayBalance is one row of the daily projection.
type DayBalance struct {
	Date         string   `json:"date"`
	OpeningCents int64    `json:"openingCents"`
	InflowCents  int64    `json:"inflowCents"`
	OutflowCents int64    `json:"outflowCents"`
	ClosingCents int64    `json:"closingCents"`
	EventIDs     []string `json:"eventIds"`
	BelowReserve bool     `json:"belowReserve"`
}

// DelayBreakpoint is the first whole-day payout delay that breaches the reserve.
type DelayBreakpoint struct {
	Found          bool   `json:"found"`
	DelayDays      int    `json:"delayDays"`
	TestedUpToDays int    `json:"testedUpToDays"`
	BreachDate     string `json:"breachDate,omitempty"`
	LowestCents    int64  `json:"lowestCents"`
	Explanation    string `json:"explanation"`
}

// Alternative is one comparable variation of the proposal.
type Alternative struct {
	ID              string           `json:"id"`
	Kind            string           `json:"kind"` // delay | reduce | split | none
	Label           string           `json:"label"`
	Detail          string           `json:"detail"`
	Proposal        ProposedDecision `json:"proposal"`
	LowestCents     int64            `json:"lowestCents"`
	LowestDate      string           `json:"lowestDate"`
	BreachesReserve bool             `json:"breachesReserve"`
	// HeadroomCents is lowest minus reserve; negative means a breach.
	HeadroomCents int64  `json:"headroomCents"`
	Tradeoff      string `json:"tradeoff"`
}

// MissingInput names exactly one thing the owner must supply.
type MissingInput struct {
	Field        string `json:"field"`
	Question     string `json:"question"`
	WhyItMatters string `json:"whyItMatters"`
}

// CashPath is one projected cash line. The workspace shows two of them side by
// side when a spend is proposed, so the cost of the decision is visible in
// place rather than described.
type CashPath struct {
	Label           string       `json:"label"`
	Days            []DayBalance `json:"days"`
	LowestCents     int64        `json:"lowestCents"`
	LowestDate      string       `json:"lowestDate"`
	HeadroomCents   int64        `json:"headroomCents"`
	BreachesReserve bool         `json:"breachesReserve"`
	FirstBreachDate string       `json:"firstBreachDate,omitempty"`
}

// ScenarioResult is the deterministic engine output. The language model may
// narrate it but never alters or recomputes any number in it.
type ScenarioResult struct {
	Currency             string `json:"currency"`
	BaselineBalanceCents int64  `json:"baselineBalanceCents"`
	BaselineAsOf         string `json:"baselineAsOf"`
	BaselineSource       string `json:"baselineSource"`
	StartDate            string `json:"startDate"`
	EndDate              string `json:"endDate"`
	ReserveCents         int64  `json:"reserveCents"`
	PayoutDelayDays      int    `json:"payoutDelayDays"`

	Days            []DayBalance `json:"days"`
	LowestCents     int64        `json:"lowestCents"`
	LowestDate      string       `json:"lowestDate"`
	HeadroomCents   int64        `json:"headroomCents"`
	BreachesReserve bool         `json:"breachesReserve"`
	FirstBreachDate string       `json:"firstBreachDate,omitempty"`

	Proposal *ProposedDecision `json:"proposal,omitempty"`
	// WithoutProposal is the same projection with the proposed spend removed.
	// It is present only while a proposal is active, and is what lets the
	// timeline draw "where you are now" against "with this spend".
	WithoutProposal *CashPath `json:"withoutProposal,omitempty"`
	// DeltaLowestCents is proposed lowest minus current lowest: what the spend
	// costs at the tightest moment. Negative means the trough drops.
	DeltaLowestCents int64 `json:"deltaLowestCents"`
	// OnTimePlan is the projection with no delay and no proposal: the plan as it
	// stands. Present whenever a scenario is being viewed, so the owner always
	// has the real plan to compare against and can never mistake a what-if for
	// where they actually are.
	OnTimePlan *CashPath `json:"onTimePlan,omitempty"`
	// ScenarioActive says a what-if is being shown rather than the plan.
	ScenarioActive  bool            `json:"scenarioActive"`
	DelayBreakpoint DelayBreakpoint `json:"delayBreakpoint"`
	Alternatives    []Alternative   `json:"alternatives"`

	AppliedEvents []FinancialEvent `json:"appliedEvents"`
	Assumptions   []Assumption     `json:"assumptions"`
	MissingInputs []MissingInput   `json:"missingInputs"`
	Claims        []Claim          `json:"claims"`
	// Verdict is a plain-language, explicitly conditional statement.
	Verdict string `json:"verdict"`
	// Caveats always includes the affordability-is-not-ROI statement.
	Caveats []string `json:"caveats"`
}

// OutlookLine is one statement about the cash position.
//
// Kind is load-bearing. "plan" describes the forecast as it currently stands;
// "conditional" describes what WOULD happen under a change that has not
// happened. Presenting a conditional as if it were the plan is the single most
// misleading thing this product could do, so the two are separated here rather
// than left to the wording of a sentence.
type OutlookLine struct {
	Kind        string `json:"kind"` // plan | conditional
	Label       string `json:"label"`
	Sentence    string `json:"sentence"`
	AmountCents int64  `json:"amountCents"`
	Date        string `json:"date"`
	Tone        string `json:"tone"`
	// Badge is the short qualifier shown beside the label. The server decides
	// it so the client never has to infer meaning from label wording.
	Badge string `json:"badge,omitempty"` // "hasn't happened" | "unchanged"
	// FocusNodeID opens the chain node that explains this line.
	FocusNodeID string `json:"focusNodeId,omitempty"`
	// ScenarioDelayDays is the delay this line describes, for a one-click try.
	ScenarioDelayDays int `json:"scenarioDelayDays,omitempty"`
}

// BriefingAction is a next step the owner can actually take, with everything
// the client needs to carry them to the right place on the timeline.
type BriefingAction struct {
	Label   string `json:"label"`
	Kind    string `json:"kind"` // see_why | check_purchase
	EventID string `json:"eventId,omitempty"`
	ChainID string `json:"chainId,omitempty"`
	NodeID  string `json:"nodeId,omitempty"`
}

// Briefing is what the owner reads first: three short sentences in the order a
// consultant would say them — can you cover what is coming, by how much, and
// what could change it — followed by the one thing to click.
//
// It is deliberately not a provenance report. The figures are the engine's, and
// the sources stay one click away rather than on the opening screen.
type Briefing struct {
	Mode   string `json:"mode"`   // plan | scenario
	Status string `json:"status"` // on_track | at_risk
	// Lead answers "can I cover what is coming?" in one clause.
	Lead string `json:"lead"`
	// Detail carries the numbers: the low, its date, and the reserve standing.
	Detail string `json:"detail"`
	// Watch names the main thing that could change the answer. It is always
	// phrased as a possibility, never as something that has happened.
	Watch string `json:"watch,omitempty"`
	// ScenarioLabel is set only while a what-if is being shown.
	ScenarioLabel string          `json:"scenarioLabel,omitempty"`
	SeeWhy        *BriefingAction `json:"seeWhy,omitempty"`
	// Highlight marks the stretch of the timeline this briefing is about, so
	// the interface can say it on the timeline itself rather than in a
	// paragraph above it.
	Highlight *BriefingHighlight `json:"highlight,omitempty"`
}

// BriefingHighlight is the span of days the opening insight concerns, and how
// that span reads.
//
// Level is not a restatement of Status. Status answers "does the modelled plan
// breach the reserve"; Level adds the middle case the owner actually cares
// about — the plan holds, but a delay inside the tested range would break it.
// Both come from the engine; neither is a judgement written by hand.
type BriefingHighlight struct {
	// Level is good | watch | risk.
	Level     string `json:"level"`
	StartDate string `json:"startDate"`
	EndDate   string `json:"endDate"`
	// Summary is one line, for a reader who has only hovered.
	Summary string `json:"summary"`
}

// Outlook is the first thing the owner reads: where the plan stands, and
// separately, what could change it.
type Outlook struct {
	Headline string      `json:"headline"`
	Status   string      `json:"status"` // on_track | at_risk
	Plan     OutlookLine `json:"plan"`
	// Conditional is absent when nothing within the tested range changes the
	// answer. It is never merged into Plan.
	Conditional *OutlookLine `json:"conditional,omitempty"`
}

// Mode reports whether this result describes the modelled plan or a what-if.
func (r ScenarioResult) Mode() string {
	if r.ScenarioActive {
		return "scenario"
	}
	return "plan"
}

// WorkspaceResponse is the initial payload for the workspace.
type WorkspaceResponse struct {
	Business        BusinessProfile  `json:"business"`
	DisplayCurrency string           `json:"displayCurrency"`
	Timezone        string           `json:"timezone"`
	Today           string           `json:"today"`
	WindowStart     string           `json:"windowStart"`
	WindowEnd       string           `json:"windowEnd"`
	Events          []FinancialEvent `json:"events"`
	Chains          []Chain          `json:"chains"`
	Scenario        ScenarioResult   `json:"scenario"`
	Assumptions     []Assumption     `json:"assumptions"`
	Sources         []SourceRecord   `json:"sources"`
	SourceStatus    []SourceStatus   `json:"sourceStatus"`
	Briefing        Briefing         `json:"briefing"`
	Outlook         Outlook          `json:"outlook"`
	Alert           *WorkspaceAlert  `json:"alert,omitempty"`
	DataNotice      string           `json:"dataNotice"`
	GeneratedAt     string           `json:"generatedAt"`
}

// WorkspaceAlert is the single banner line. It must point at a real future event.
type WorkspaceAlert struct {
	Tone        string   `json:"tone"`
	Message     string   `json:"message"`
	EventIDs    []string `json:"eventIds"`
	ChainID     string   `json:"chainId,omitempty"`
	FocusNodeID string   `json:"focusNodeId,omitempty"`
}

type BusinessProfile struct {
	DisplayName   string `json:"displayName"`
	SellerID      string `json:"sellerId"`
	Category      string `json:"category"`
	Location      string `json:"location"`
	SourceWindow  string `json:"sourceWindow"`
	TimeShiftNote string `json:"timeShiftNote"`
}

// ChatRequest is a bounded question.
type ChatRequest struct {
	Question string           `json:"question"`
	NodeID   string           `json:"nodeId,omitempty"`
	Scenario *ScenarioRequest `json:"scenario,omitempty"`
}

// ChatResponse carries a short answer plus resolvable citations, or an explicit
// unavailable/missing-input state. It never contains model-invented figures.
type ChatResponse struct {
	OK            bool           `json:"ok"`
	Intent        string         `json:"intent"`
	Answer        string         `json:"answer"`
	AnswerSource  string         `json:"answerSource"` // model | engine_fallback | unavailable
	SourceRefs    []string       `json:"sourceRefs"`
	Claims        []Claim        `json:"claims"`
	MissingInputs []MissingInput `json:"missingInputs,omitempty"`
	// PartialProposal carries whatever the question did supply, so the client
	// can ask only for what is genuinely missing instead of starting over.
	PartialProposal *ProposedDecision `json:"partialProposal,omitempty"`
	ProposedChange  *ScenarioRequest  `json:"proposedChange,omitempty"`
	ProposalNote    string            `json:"proposalNote,omitempty"`
	Unavailable     string            `json:"unavailable,omitempty"`
}

// Discovery is one thing the language model proposed looking at, after the Go
// engine has checked it.
//
// The division is deliberate and is the whole point: the model may only say
// WHICH of the events already on the timeline deserve attention and WHY, in
// words. It may not state a figure, invent an event, or decide severity. Every
// number attached here is computed by the engine afterwards, and anything the
// model referenced that does not exist causes the candidate to be rejected and
// reported as rejected rather than quietly dropped.
type Discovery struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Rationale string `json:"rationale"`
	// EventRefs are timeline event IDs. Every one is checked to exist.
	EventRefs []string `json:"eventRefs"`
	Status    string   `json:"status"` // verified | rejected
	// RejectedBecause is shown to the user. A silent drop would hide the fact
	// that the model produced something unusable.
	RejectedBecause string  `json:"rejectedBecause,omitempty"`
	Tone            string  `json:"tone,omitempty"`
	Claims          []Claim `json:"claims"`
}

// DiscoveryResponse is the result of one model pass over the timeline.
type DiscoveryResponse struct {
	Available   bool        `json:"available"`
	Source      string      `json:"source"` // model | unavailable
	Unavailable string      `json:"unavailable,omitempty"`
	Proposed    int         `json:"proposed"`
	Verified    int         `json:"verified"`
	Discoveries []Discovery `json:"discoveries"`
	Note        string      `json:"note"`
}

// Sanitize fills every nil slice in a discovery reply.
func (d *DiscoveryResponse) Sanitize() {
	d.Discoveries = nonNil(d.Discoveries)
	for i := range d.Discoveries {
		d.Discoveries[i].EventRefs = nonNil(d.Discoveries[i].EventRefs)
		d.Discoveries[i].Claims = sanitizeClaims(d.Discoveries[i].Claims)
	}
}

// HealthResponse reports readiness without exposing secrets.
type HealthResponse struct {
	Status      string         `json:"status"`
	Version     string         `json:"version"`
	StartedAt   string         `json:"startedAt"`
	UptimeSecs  int64          `json:"uptimeSeconds"`
	Sources     []SourceStatus `json:"sources"`
	DataVersion string         `json:"dataVersion"`
}

// --- JSON slice discipline ----------------------------------------------
//
// Go marshals a nil slice as `null`, not `[]`. The client reads these fields
// with `.length`, so a single nil slice anywhere in this payload takes down the
// whole React tree. Every response is passed through Sanitize before it is
// written, so the contract can promise: a field typed as an array is always an
// array.

func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

func sanitizeClaims(cs []Claim) []Claim {
	cs = nonNil(cs)
	for i := range cs {
		cs[i].SourceRefs = nonNil(cs[i].SourceRefs)
	}
	return cs
}

func sanitizeChart(c *ChartSpec) *ChartSpec {
	if c == nil {
		return nil
	}
	c.Points = nonNil(c.Points)
	c.SourceRefs = nonNil(c.SourceRefs)
	return c
}

func sanitizeEvents(es []FinancialEvent) []FinancialEvent {
	es = nonNil(es)
	for i := range es {
		es[i].SourceRefs = nonNil(es[i].SourceRefs)
		es[i].Claims = sanitizeClaims(es[i].Claims)
	}
	return es
}

// Sanitize fills every nil slice in the result so the client never sees null
// where it expects an array.
func (r *ScenarioResult) Sanitize() {
	r.Days = nonNil(r.Days)
	for i := range r.Days {
		r.Days[i].EventIDs = nonNil(r.Days[i].EventIDs)
	}
	r.AppliedEvents = sanitizeEvents(r.AppliedEvents)
	r.Assumptions = nonNil(r.Assumptions)
	r.MissingInputs = nonNil(r.MissingInputs)
	r.Claims = sanitizeClaims(r.Claims)
	r.Alternatives = nonNil(r.Alternatives)
	r.Caveats = nonNil(r.Caveats)
	if r.OnTimePlan != nil {
		r.OnTimePlan.Days = nonNil(r.OnTimePlan.Days)
		for i := range r.OnTimePlan.Days {
			r.OnTimePlan.Days[i].EventIDs = nonNil(r.OnTimePlan.Days[i].EventIDs)
		}
	}
	if r.WithoutProposal != nil {
		r.WithoutProposal.Days = nonNil(r.WithoutProposal.Days)
		for i := range r.WithoutProposal.Days {
			r.WithoutProposal.Days[i].EventIDs = nonNil(r.WithoutProposal.Days[i].EventIDs)
		}
	}
}

// Sanitize fills every nil slice in the workspace payload.
func (w *WorkspaceResponse) Sanitize() {
	w.Events = sanitizeEvents(w.Events)
	w.Assumptions = nonNil(w.Assumptions)
	w.Sources = nonNil(w.Sources)
	w.SourceStatus = nonNil(w.SourceStatus)
	w.Chains = nonNil(w.Chains)
	for i := range w.Chains {
		c := &w.Chains[i]
		c.Segments = nonNil(c.Segments)
		c.Nodes = nonNil(c.Nodes)
		for j := range c.Nodes {
			n := &c.Nodes[j]
			n.Claims = sanitizeClaims(n.Claims)
			n.SourceRefs = nonNil(n.SourceRefs)
			n.AssumptionRefs = nonNil(n.AssumptionRefs)
			n.ResponseOptions = nonNil(n.ResponseOptions)
			n.SuggestedAsks = nonNil(n.SuggestedAsks)
			n.HighlightEventIDs = nonNil(n.HighlightEventIDs)
			n.Chart = sanitizeChart(n.Chart)
		}
	}
	if w.Alert != nil {
		w.Alert.EventIDs = nonNil(w.Alert.EventIDs)
	}
	w.Scenario.Sanitize()
}

// Sanitize fills every nil slice in a chat reply.
func (c *ChatResponse) Sanitize() {
	c.SourceRefs = nonNil(c.SourceRefs)
	c.Claims = sanitizeClaims(c.Claims)
	c.MissingInputs = nonNil(c.MissingInputs)
}
