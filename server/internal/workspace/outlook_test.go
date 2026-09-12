package workspace

import (
	"strings"
	"testing"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
)

// The forecast as it stands and a what-if are different things. Presenting one
// as the other is the most misleading thing this product could do, so the line
// describing what is on screen must always be labelled for what it actually is.
func TestTheLineOnScreenAlwaysDescribesWhatIsOnScreen(t *testing.T) {
	b := testBuilder(t)

	t.Run("no scenario: the plan is the plan", func(t *testing.T) {
		o := b.Build(contracts.ScenarioRequest{}).Outlook
		if o.Plan.Kind != "plan" {
			t.Errorf("kind = %q, want plan", o.Plan.Kind)
		}
		if o.Plan.Label != "Current plan" {
			t.Errorf("label = %q, want Current plan", o.Plan.Label)
		}
		if o.Conditional == nil || o.Conditional.Kind != "conditional" {
			t.Fatalf("the risk ahead must be offered as conditional, got %+v", o.Conditional)
		}
		if !strings.Contains(o.Conditional.Sentence, "has not happened") {
			t.Errorf("a conditional must say it has not happened: %q", o.Conditional.Sentence)
		}
		if o.Conditional.Badge == "" {
			t.Error("a conditional needs a badge so colour is not the only signal")
		}
	})

	t.Run("delay applied: the screen is a what-if, and says so", func(t *testing.T) {
		o := b.Build(contracts.ScenarioRequest{PayoutDelayDays: 5}).Outlook
		if o.Plan.Kind != "conditional" {
			t.Errorf("while showing a delay the headline line is conditional, got %q", o.Plan.Kind)
		}
		if strings.EqualFold(o.Plan.Label, "Current plan") {
			t.Error("a what-if must never be labelled Current plan")
		}
		if o.Conditional == nil || o.Conditional.Kind != "plan" {
			t.Fatal("the real plan must be shown alongside for comparison")
		}
		if !strings.Contains(o.Conditional.Sentence, "has been applied") &&
			!strings.Contains(o.Conditional.Sentence, "Without this change") {
			t.Errorf("the comparison line must say it is the untouched plan: %q",
				o.Conditional.Sentence)
		}
	})

	t.Run("proposal: labelled as a change, not as the plan", func(t *testing.T) {
		date := b.Today.AddDate(0, 0, 4).Format(finance.DateLayout)
		o := b.Build(contracts.ScenarioRequest{
			Proposal: &contracts.ProposedDecision{
				Description: "Ads", Category: "marketing", Date: date, AmountCents: 300_00,
			},
		}).Outlook
		if strings.EqualFold(o.Plan.Label, "Current plan") {
			t.Error("a proposed spend must never be labelled Current plan")
		}
		if o.Plan.Badge == "" {
			t.Error("a proposal needs a badge saying it is not applied")
		}
		if o.Conditional == nil {
			t.Fatal("the untouched plan must stay visible beside a proposal")
		}
	})
}

// The two lines must never report the same figure as if they agreed, and the
// numbers must come from the engine rather than the sentence.
func TestOutlookFiguresMatchTheEngine(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	o, s := ws.Outlook, ws.Scenario

	if o.Plan.AmountCents != s.LowestCents {
		t.Errorf("plan amount %d does not match the engine's lowest %d",
			o.Plan.AmountCents, s.LowestCents)
	}
	if o.Plan.Date != s.LowestDate {
		t.Errorf("plan date %q does not match the engine's %q", o.Plan.Date, s.LowestDate)
	}
	if o.Conditional != nil {
		if o.Conditional.AmountCents != s.DelayBreakpoint.LowestCents {
			t.Errorf("conditional amount %d does not match the breakpoint %d",
				o.Conditional.AmountCents, s.DelayBreakpoint.LowestCents)
		}
		if o.Conditional.AmountCents == o.Plan.AmountCents {
			t.Error("the two lines report the same figure; they describe different scenarios")
		}
	}
	if o.Status != "on_track" && o.Status != "at_risk" {
		t.Errorf("unknown status %q", o.Status)
	}
}

// Whatever is on screen, the untouched plan must be retrievable.
func TestTheRealPlanIsAlwaysAvailableBesideAScenario(t *testing.T) {
	b := testBuilder(t)
	base := b.Build(contracts.ScenarioRequest{}).Scenario

	for _, req := range []contracts.ScenarioRequest{
		{PayoutDelayDays: 5},
		{PayoutDelayDays: 12},
	} {
		s := b.Build(req).Scenario
		if !s.ScenarioActive {
			t.Errorf("delay %d should mark the scenario active", req.PayoutDelayDays)
		}
		if s.OnTimePlan == nil {
			t.Fatalf("delay %d must carry the on-time plan", req.PayoutDelayDays)
		}
		if s.OnTimePlan.LowestCents != base.LowestCents {
			t.Errorf("the on-time plan drifted: %d vs %d",
				s.OnTimePlan.LowestCents, base.LowestCents)
		}
	}

	if b.Build(contracts.ScenarioRequest{}).Scenario.ScenarioActive {
		t.Error("with nothing applied there is no scenario to be active")
	}
}

// The briefing is the first thing anyone reads, so it must describe the
// modelled plan by default and never present a hypothetical as something that
// has happened.
func TestBriefingOpensOnThePlanAndNeverAssertsAHypothetical(t *testing.T) {
	b := testBuilder(t)

	t.Run("default is the plan, with the risk as a possibility", func(t *testing.T) {
		br := b.Build(contracts.ScenarioRequest{}).Briefing
		if br.Mode != "plan" {
			t.Fatalf("mode = %q, want plan", br.Mode)
		}
		if br.ScenarioLabel != "" {
			t.Errorf("no what-if is active, so there must be no scenario label: %q",
				br.ScenarioLabel)
		}
		if br.Lead == "" || br.Detail == "" {
			t.Fatal("the briefing needs a lead and a detail sentence")
		}
		if br.Watch != "" && !strings.Contains(br.Watch, "could") {
			t.Errorf("the risk must be a possibility, not an event: %q", br.Watch)
		}
		// Never claim the modelled plan is the owner's real position.
		joined := br.Lead + " " + br.Detail + " " + br.Watch
		for _, forbidden := range []string{"actual plan", "has arrived", "was delayed", "your real"} {
			if strings.Contains(strings.ToLower(joined), forbidden) {
				t.Errorf("briefing says %q: %s", forbidden, joined)
			}
		}
		if br.SeeWhy == nil || br.SeeWhy.NodeID == "" || br.SeeWhy.ChainID == "" {
			t.Fatalf("See why must point at a specific chain step, got %+v", br.SeeWhy)
		}
	})

	t.Run("a what-if announces itself", func(t *testing.T) {
		br := b.Build(contracts.ScenarioRequest{PayoutDelayDays: 5}).Briefing
		if br.Mode != "scenario" {
			t.Fatalf("mode = %q, want scenario", br.Mode)
		}
		if !strings.HasPrefix(br.ScenarioLabel, "What-if") {
			t.Errorf("scenario label must announce itself: %q", br.ScenarioLabel)
		}
		if !strings.Contains(br.Lead, "would") {
			t.Errorf("a hypothetical outcome must be conditional: %q", br.Lead)
		}
		if !strings.Contains(br.Watch, "has been applied") {
			t.Errorf("a what-if must say it is not applied: %q", br.Watch)
		}
	})

	t.Run("See why points at a step that exists", func(t *testing.T) {
		ws := b.Build(contracts.ScenarioRequest{})
		a := ws.Briefing.SeeWhy
		var found bool
		for _, c := range ws.Chains {
			if c.ID != a.ChainID {
				continue
			}
			for _, n := range c.Nodes {
				if n.ID == a.NodeID && n.Sequence == 1 {
					found = true
				}
			}
		}
		if !found {
			t.Fatalf("See why targets %s/%s, which is not the first step of a real chain",
				a.ChainID, a.NodeID)
		}
	})
}
