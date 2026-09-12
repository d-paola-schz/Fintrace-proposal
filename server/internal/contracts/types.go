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

// ScenarioRequest is the validated input to the deterministic engine.
type ScenarioRequest struct {
	Proposal        *ProposedDecision `json:"proposal,omitempty"`
	PayoutDelayDays int               `json:"payoutDelayDays"`
	// ReserveCents overrides the default reserve when > 0.
	ReserveCents int64 `json:"reserveCents,omitempty"`
	// HorizonDays defaults to 30.
	HorizonDays int `json:"horizonDays,omitempty"`
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

	Proposal        *ProposedDecision `json:"proposal,omitempty"`
	DelayBreakpoint DelayBreakpoint   `json:"delayBreakpoint"`
	Alternatives    []Alternative     `json:"alternatives"`

	AppliedEvents []FinancialEvent `json:"appliedEvents"`
	Assumptions   []Assumption     `json:"assumptions"`
	MissingInputs []MissingInput   `json:"missingInputs"`
	Claims        []Claim          `json:"claims"`
	// Verdict is a plain-language, explicitly conditional statement.
	Verdict string `json:"verdict"`
	// Caveats always includes the affordability-is-not-ROI statement.
	Caveats []string `json:"caveats"`
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
	OK             bool             `json:"ok"`
	Intent         string           `json:"intent"`
	Answer         string           `json:"answer"`
	AnswerSource   string           `json:"answerSource"` // model | engine_fallback | unavailable
	SourceRefs     []string         `json:"sourceRefs"`
	Claims         []Claim          `json:"claims"`
	MissingInputs  []MissingInput   `json:"missingInputs,omitempty"`
	ProposedChange *ScenarioRequest `json:"proposedChange,omitempty"`
	ProposalNote   string           `json:"proposalNote,omitempty"`
	Unavailable    string           `json:"unavailable,omitempty"`
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
