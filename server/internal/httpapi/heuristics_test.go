package httpapi

import (
	"testing"
	"time"

	"github.com/preflight/preflight/server/internal/ai"
	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
)

// The router must never manufacture an amount or a date. A missing value has to
// stay missing so the product asks for it.
func TestHeuristicExtractNeverInventsAnAmount(t *testing.T) {
	for _, q := range []string{
		"Can I afford some ads soon?",
		"Should I invest in more stock?",
		"Is it safe to spend on marketing?",
	} {
		e := heuristicExtract(q)
		if e.AmountCents != 0 {
			t.Errorf("%q produced amount %d; no amount was stated", q, e.AmountCents)
		}
	}
}

func TestHeuristicExtractReadsStatedAmounts(t *testing.T) {
	cases := map[string]int64{
		"Could I spend $3,000 on ads before the end of the month?": 300000,
		"can I put $1,500.50 into inventory":                       150050,
		"what about 2500 dollars on equipment":                     250000,
		"is $12k on a van affordable":                              1200000,
	}
	for q, want := range cases {
		if got := heuristicExtract(q).AmountCents; got != want {
			t.Errorf("%q -> %d, want %d", q, got, want)
		}
	}
}

func TestParseDateResolvesOnlyStatedDates(t *testing.T) {
	now := time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)
	cases := map[string]string{
		"spend $100 on 2026-09-20":               "2026-09-20",
		"in 5 days":                              "2026-09-17",
		"on Sep 25":                              "2026-09-25",
		"before the end of the month":            "2026-09-30",
		"tomorrow":                               "2026-09-13",
		"sometime soon":                          "",
		"when things settle down":                "",
		"maybe later this quarter if sales hold": "",
	}
	for q, want := range cases {
		if got := parseDate(q, now); got != want {
			t.Errorf("%q -> %q, want %q", q, got, want)
		}
	}
}

// A date already past would silently become a no-op in the projection, so the
// proposal builder must reject it and ask instead.
func TestBuildProposalRejectsPastDatesAndAsks(t *testing.T) {
	today := time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)
	ws := contracts.WorkspaceResponse{Scenario: contracts.ScenarioResult{ReserveCents: 500_00}}

	_, missing := buildProposal(ai.Extraction{AmountCents: 300_00, Date: "2026-09-01"}, ws, today)
	if len(missing) != 1 || missing[0].Field != "date" {
		t.Fatalf("a past date must be asked for again, got %+v", missing)
	}

	p, missing := buildProposal(ai.Extraction{AmountCents: 300_00, Date: "2026-09-20"}, ws, today)
	if len(missing) != 0 || p == nil {
		t.Fatalf("a complete proposal must build, got %+v / %+v", p, missing)
	}
	if p.MinimumReserveCents != 500_00 {
		t.Fatalf("the proposal must carry the current reserve, got %d", p.MinimumReserveCents)
	}
}

func TestBuildProposalAsksForBothWhenNeitherIsStated(t *testing.T) {
	today := time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)
	_, missing := buildProposal(ai.Extraction{}, contracts.WorkspaceResponse{}, today)
	if len(missing) != 2 {
		t.Fatalf("want both amount and date requested, got %+v", missing)
	}
}

func TestValidateScenarioRejectsOutOfBoundsInput(t *testing.T) {
	today := time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)
	bad := []contracts.ScenarioRequest{
		{PayoutDelayDays: -1},
		{PayoutDelayDays: 61},
		{ReserveCents: -5},
		{HorizonDays: finance.MaxHorizonDays + 1},
		{Proposal: &contracts.ProposedDecision{AmountCents: 100, Date: "not-a-date"}},
		{Proposal: &contracts.ProposedDecision{AmountCents: 100, Date: "2020-01-01"}},
		{Proposal: &contracts.ProposedDecision{AmountCents: 100, Date: "2026-09-20", Category: "crypto"}},
		{Proposal: &contracts.ProposedDecision{AmountCents: 100_000_001}},
	}
	for i, req := range bad {
		r := req
		if err := validateScenario(&r, today); err == nil {
			t.Errorf("case %d should have been rejected: %+v", i, req)
		}
	}
	ok := contracts.ScenarioRequest{
		PayoutDelayDays: 5, ReserveCents: 500_00,
		Proposal: &contracts.ProposedDecision{AmountCents: 300_00, Date: "2026-09-20", Category: "marketing"},
	}
	if err := validateScenario(&ok, today); err != nil {
		t.Fatalf("valid request rejected: %v", err)
	}
}

func TestHeuristicIntentRouting(t *testing.T) {
	cases := map[string]ai.Intent{
		"Could I spend $3,000 on ads before month end?": ai.IntentProposeSpend,
		"Where does the payout figure come from?":       ai.IntentEvidence,
		"Why is cash tight when sales are up?":          ai.IntentExplainCash,
		"What happens if the payout is 3 days late?":    ai.IntentExplainCash,
		"How is the business doing?":                    ai.IntentCompanySummary,
	}
	for q, want := range cases {
		if got := heuristicIntent(q, ""); got != want {
			t.Errorf("%q -> %s, want %s", q, got, want)
		}
	}
}

// With the model unavailable, the heuristic router is the only thing standing
// between an off-topic question and a fabricated-looking answer. A question
// with nothing to do with cash, sales or the workspace must be refused, even
// when a node happens to be open — an open node must not make every question
// about that node.
func TestHeuristicIntentRefusesOffTopicQuestions(t *testing.T) {
	offTopic := []string{
		"what's the weather now?",
		"tell me a joke",
		"who won the game last night",
		"what is the capital of France",
	}
	for _, q := range offTopic {
		if got := heuristicIntent(q, ""); got != ai.IntentUnsupported {
			t.Errorf("%q with no node open -> %s, want unsupported", q, got)
		}
		if got := heuristicIntent(q, "node-payout-2"); got != ai.IntentUnsupported {
			t.Errorf("%q with a node open -> %s, want unsupported, not an explanation of the open node", q, got)
		}
	}
}

// A short, in-domain follow-up while a node is open should still explain that
// node — the fix must not make the assistant refuse ordinary follow-ups.
func TestHeuristicIntentStillExplainsOpenNodeForInDomainFollowUps(t *testing.T) {
	for _, q := range []string{"why?", "explain this", "tell me more"} {
		if got := heuristicIntent(q, "node-payout-2"); got != ai.IntentExplainNode {
			t.Errorf("%q with a node open -> %s, want explain_node", q, got)
		}
	}
}
