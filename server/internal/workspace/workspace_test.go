package workspace

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/data"
	"github.com/preflight/preflight/server/internal/finance"
)

func testBuilder(t *testing.T) *Builder {
	t.Helper()
	store, err := data.Load("../../../data")
	if err != nil {
		t.Fatalf("load prepared data: %v", err)
	}
	snap := store.NessieFallback
	return &Builder{
		Store:  store,
		Nessie: &snap,
		Today:  finance.Day(time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC)),
	}
}

// Every citation the product renders must open something. A dangling sourceRef
// is a broken promise to the person checking our numbers.
func TestEveryCitationResolves(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})

	known := map[string]bool{}
	for _, s := range ws.Sources {
		known[s.ID] = true
	}

	check := func(where string, refs []string) {
		for _, r := range refs {
			if !known[r] {
				t.Errorf("%s cites %q, which no source record resolves", where, r)
			}
		}
	}
	for _, e := range ws.Events {
		check("event "+e.ID, e.SourceRefs)
		for _, c := range e.Claims {
			check("claim "+c.ID, c.SourceRefs)
		}
	}
	for _, ch := range ws.Chains {
		for _, n := range ch.Nodes {
			check("node "+n.ID, n.SourceRefs)
			check("node "+n.ID+" assumptions", n.AssumptionRefs)
			for _, c := range n.Claims {
				check("claim "+c.ID, c.SourceRefs)
			}
			if n.Chart != nil {
				check("chart on "+n.ID, n.Chart.SourceRefs)
			}
		}
	}
	for _, c := range ws.Scenario.Claims {
		check("scenario claim "+c.ID, c.SourceRefs)
	}
}

// No displayed figure may appear without a source. This is the product's
// central promise.
func TestEveryClaimCarriesProvenance(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	valid := map[string]bool{
		contracts.ProvOlistHistorical: true, contracts.ProvNessieSandbox: true,
		contracts.ProvDerived: true, contracts.ProvUserEntered: true,
		contracts.ProvDemoAssumption: true,
	}
	seen := 0
	visit := func(c contracts.Claim) {
		seen++
		if !valid[c.Provenance] {
			t.Errorf("claim %s has provenance %q", c.ID, c.Provenance)
		}
		if strings.TrimSpace(c.Display) == "" {
			t.Errorf("claim %s has no display value", c.ID)
		}
	}
	for _, e := range ws.Events {
		for _, c := range e.Claims {
			visit(c)
		}
	}
	for _, ch := range ws.Chains {
		for _, n := range ch.Nodes {
			for _, c := range n.Claims {
				visit(c)
			}
		}
	}
	for _, c := range ws.Scenario.Claims {
		visit(c)
	}
	if seen < 10 {
		t.Fatalf("only %d claims found; the workspace is not wired up", seen)
	}
}

// Olist publishes no cost of goods, so a margin must never be stated as a
// number anywhere — only as an explicit absence.
func TestMarginAndStockAreNeverGivenAsNumbers(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})

	for _, ch := range ws.Chains {
		for _, n := range ch.Nodes {
			for _, c := range n.Claims {
				l := strings.ToLower(c.Label)
				if strings.Contains(l, "margin") || strings.Contains(l, "units on hand") ||
					strings.Contains(l, "stock") {
					if strings.ContainsAny(c.Display, "0123456789") {
						t.Errorf("claim %q states %q; this cannot be derived from the sources",
							c.Label, c.Display)
					}
					if c.AmountCents != nil {
						t.Errorf("claim %q carries an amount; it must be an explicit absence", c.Label)
					}
				}
			}
		}
	}

	// The chain that raises the reorder question must name the missing number.
	var reorder *contracts.ChainNode
	for _, ch := range ws.Chains {
		for i := range ch.Nodes {
			if ch.Nodes[i].ID == "node-sales-3" {
				reorder = &ch.Nodes[i]
			}
		}
	}
	if reorder == nil {
		t.Fatal("the sales chain must reach the reorder question")
	}
	if !strings.Contains(strings.ToLower(reorder.Explanation), "units") {
		t.Errorf("the reorder node must name the one missing input: %q", reorder.Explanation)
	}
}

// Item sales are revenue. They must never be applied to the bank balance.
func TestSalesEventsAreMarkedNonCash(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	found := 0
	for _, e := range ws.Events {
		if e.Kind == "sales" {
			found++
			if e.AffectsCash {
				t.Errorf("sales event %s is marked as cash", e.ID)
			}
			if e.Provenance != contracts.ProvOlistHistorical {
				t.Errorf("sales event %s has provenance %q", e.ID, e.Provenance)
			}
		}
	}
	if found == 0 {
		t.Fatal("no sales events were produced")
	}
}

// The payout is a modeled figure. Its arithmetic must be exactly the documented
// chain: recorded seller revenue, less the modeled fee, at the demo rate.
func TestPayoutIsDerivedFromSellerRevenueOnly(t *testing.T) {
	b := testBuilder(t)
	brl := b.Store.Olist.Window.ItemRevenueCents
	fee := b.Store.Assume.MarketplaceFee.RatePct
	want := b.Store.BRLToUSDCents(int64(float64(brl) * (100 - fee) / 100))

	if got := b.PayoutAmountCents(); got != want {
		t.Fatalf("payout = %d, want %d", got, want)
	}

	ws := b.Build(contracts.ScenarioRequest{})
	var payout *contracts.FinancialEvent
	for i := range ws.Events {
		if ws.Events[i].ID == "evt-payout" {
			payout = &ws.Events[i]
		}
	}
	if payout == nil {
		t.Fatal("no payout event")
	}
	if payout.Provenance != contracts.ProvDemoAssumption {
		t.Errorf("a modeled payout must be a demo assumption, got %q", payout.Provenance)
	}
	if payout.Certainty != contracts.CertaintyConditional {
		t.Errorf("a modeled payout is conditional, got %q", payout.Certainty)
	}
	if !strings.Contains(payout.Claims[0].Note, "no payout ledger") {
		t.Errorf("the payout claim must disclose that no payout ledger exists: %q",
			payout.Claims[0].Note)
	}
}

// The banner must point at events that actually exist and are still ahead.
func TestAlertPointsAtRealFutureEvents(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	if ws.Alert == nil {
		t.Fatal("no alert produced")
	}
	if len(ws.Alert.EventIDs) == 0 {
		t.Fatal("the alert cites no events")
	}
	for _, id := range ws.Alert.EventIDs {
		var found *contracts.FinancialEvent
		for i := range ws.Events {
			if ws.Events[i].ID == id {
				found = &ws.Events[i]
			}
		}
		if found == nil {
			t.Fatalf("the alert cites %q, which is not on the timeline", id)
		}
		if found.Date <= ws.Today {
			t.Errorf("the alert cites %q dated %s, which is not in the future", id, found.Date)
		}
	}
	// The node the alert opens must exist in the chain it names.
	var ok bool
	for _, c := range ws.Chains {
		if c.ID != ws.Alert.ChainID {
			continue
		}
		for _, n := range c.Nodes {
			if n.ID == ws.Alert.FocusNodeID {
				ok = true
			}
		}
	}
	if !ok {
		t.Errorf("the alert focuses %q, which is not a node of chain %q",
			ws.Alert.FocusNodeID, ws.Alert.ChainID)
	}
}

// One chain must be able to carry more than one tone, or the colours are just
// decoration on a verdict already made.
func TestAChainCarriesMoreThanOneTone(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	for _, c := range ws.Chains {
		tones := map[string]bool{}
		for _, n := range c.Nodes {
			tones[n.Tone] = true
		}
		for _, s := range c.Segments {
			tones[s.Tone] = true
		}
		if len(tones) < 2 {
			t.Errorf("chain %s is uniformly %v", c.ID, tones)
		}
		if len(c.Nodes) != 3 {
			t.Errorf("chain %s has %d nodes, want 3", c.ID, len(c.Nodes))
		}
		if len(c.Segments) != 3 {
			t.Errorf("chain %s has %d segments, want 3", c.ID, len(c.Segments))
		}
		for i, n := range c.Nodes {
			if n.Sequence != i+1 {
				t.Errorf("chain %s node %d has sequence %d", c.ID, i, n.Sequence)
			}
		}
	}
}

// Changing the payout date must change the projection, the chain and the alert
// together. A stale panel beside a moved line is the failure this guards.
func TestChangingThePayoutDateMovesEverythingTogether(t *testing.T) {
	b := testBuilder(t)
	base := b.Build(contracts.ScenarioRequest{})
	bp := base.Scenario.DelayBreakpoint
	if !bp.Found {
		t.Skip("no breaching delay in the current fixture")
	}

	delayed := b.Build(contracts.ScenarioRequest{PayoutDelayDays: bp.DelayDays})
	if !delayed.Scenario.BreachesReserve {
		t.Fatalf("at the breakpoint delay the projection must breach")
	}
	if delayed.Scenario.LowestCents >= base.Scenario.LowestCents {
		t.Errorf("delaying the payout must lower the trough: %d -> %d",
			base.Scenario.LowestCents, delayed.Scenario.LowestCents)
	}
	if delayed.Alert.Tone != contracts.ToneRisk {
		t.Errorf("the alert must turn to risk, got %q", delayed.Alert.Tone)
	}

	// The payout event itself moved by exactly the delay.
	find := func(ws contracts.WorkspaceResponse) string {
		for _, e := range ws.Events {
			if e.ID == "evt-payout" {
				return e.Date
			}
		}
		return ""
	}
	from, _ := finance.ParseDate(find(base))
	to, _ := finance.ParseDate(find(delayed))
	if got := int(to.Sub(from).Hours() / 24); got != bp.DelayDays {
		t.Errorf("payout moved %d days, want %d", got, bp.DelayDays)
	}
}

// The opening balance is the only historical figure in the projection.
func TestProjectionStartsFromTheBaselineAndNothingElse(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	s := ws.Scenario
	if s.BaselineBalanceCents != b.Nessie.BalanceCents {
		t.Fatalf("baseline = %d, want the account balance %d",
			s.BaselineBalanceCents, b.Nessie.BalanceCents)
	}
	if s.Days[0].OpeningCents != b.Nessie.BalanceCents {
		t.Fatalf("day one opens at %d, want %d", s.Days[0].OpeningCents, b.Nessie.BalanceCents)
	}
	// No event dated before today may appear in the applied set.
	for _, e := range s.AppliedEvents {
		if e.Date < ws.Today {
			t.Errorf("applied event %s is dated %s, before today %s", e.ID, e.Date, ws.Today)
		}
	}
}

// With no key configured the product must say so rather than implying a live
// bank connection.
func TestFixtureBaselineIsLabelledHonestly(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	if !strings.Contains(ws.Scenario.BaselineSource, "fixture") {
		t.Fatalf("baseline source = %q; it must not imply a live read", ws.Scenario.BaselineSource)
	}
	for _, c := range ws.Scenario.Claims {
		if c.ID == "claim-res-baseline" && c.Provenance != contracts.ProvDemoAssumption {
			t.Errorf("an unfetched baseline must not claim nessie_sandbox provenance")
		}
	}
}

// Go marshals a nil slice as `null`. The client reads these fields with
// `.length`, so one nil slice white-screens the entire page and the user has to
// reload. This asserts the payload never contains null where an array belongs.
func TestPayloadNeverContainsNullWhereAnArrayIsExpected(t *testing.T) {
	b := testBuilder(t)

	for _, req := range []contracts.ScenarioRequest{
		{},
		{PayoutDelayDays: 14},
		{Proposal: &contracts.ProposedDecision{
			Description: "Ads", Category: "marketing",
			Date: b.Today.AddDate(0, 0, 4).Format(finance.DateLayout), AmountCents: 300_00,
		}},
	} {
		ws := b.Build(req)
		ws.Sanitize()

		raw, err := json.Marshal(ws)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		var tree any
		if err := json.Unmarshal(raw, &tree); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		// These keys are read with .length on the client.
		arrayKeys := map[string]bool{
			"events": true, "chains": true, "nodes": true, "segments": true,
			"claims": true, "sourceRefs": true, "assumptionRefs": true,
			"responseOptions": true, "suggestedAsks": true, "assumptions": true,
			"sources": true, "sourceStatus": true, "missingInputs": true,
			"alternatives": true, "caveats": true, "days": true, "eventIds": true,
			"appliedEvents": true, "points": true,
		}
		var walk func(node any, path string)
		walk = func(node any, path string) {
			switch v := node.(type) {
			case map[string]any:
				for k, child := range v {
					p := path + "." + k
					if child == nil && arrayKeys[k] {
						t.Errorf("%s is null; the client calls .length on it", p)
					}
					walk(child, p)
				}
			case []any:
				for i, child := range v {
					walk(child, fmt.Sprintf("%s[%d]", path, i))
				}
			}
		}
		walk(tree, "workspace")
	}
}

// The timeline must always reach whatever the scenario produces. Dragging the
// payout to the end of the delay range used to push it past a fixed window
// edge, where the event vanished and its chain lost its anchor.
func TestTimelineWindowAlwaysContainsEveryEvent(t *testing.T) {
	b := testBuilder(t)

	for _, delay := range []int{0, 5, 14, 30, 60} {
		ws := b.Build(contracts.ScenarioRequest{PayoutDelayDays: delay})

		for _, e := range ws.Events {
			if e.Date < ws.WindowStart || e.Date > ws.WindowEnd {
				t.Errorf("delay %d: event %s on %s falls outside the window %s..%s",
					delay, e.ID, e.Date, ws.WindowStart, ws.WindowEnd)
			}
		}
		// Every chain must still resolve its root to a rendered event.
		for _, c := range ws.Chains {
			found := false
			for _, e := range ws.Events {
				if e.ID == c.RootEventID {
					found = true
				}
			}
			if !found {
				t.Errorf("delay %d: chain %s roots at %q, which is not on the timeline",
					delay, c.ID, c.RootEventID)
			}
		}
	}
}

// A proposal dated far out must also stretch the window.
func TestTimelineWindowCoversADistantProposal(t *testing.T) {
	b := testBuilder(t)
	far := b.Today.AddDate(0, 0, 75).Format(finance.DateLayout)
	ws := b.Build(contracts.ScenarioRequest{
		Proposal: &contracts.ProposedDecision{
			Description: "Equipment", Category: "equipment", Date: far, AmountCents: 100_00,
		},
		HorizonDays: 90,
	})
	if ws.WindowEnd < far {
		t.Fatalf("window ends %s, before the proposal on %s", ws.WindowEnd, far)
	}
}

// A proposal must come back with the same window projected without it, so the
// timeline can draw both paths and the owner reads the cost off the difference
// rather than being told it.
func TestProposalReturnsBothCashPaths(t *testing.T) {
	b := testBuilder(t)
	date := b.Today.AddDate(0, 0, 4).Format(finance.DateLayout)
	ws := b.Build(contracts.ScenarioRequest{
		Proposal: &contracts.ProposedDecision{
			Description: "Ads", Category: "marketing", Date: date, AmountCents: 300_00,
		},
	})
	s := ws.Scenario

	if s.WithoutProposal == nil {
		t.Fatal("a proposal must also return the path without it")
	}
	if len(s.WithoutProposal.Days) != len(s.Days) {
		t.Fatalf("paths cover different windows: %d vs %d",
			len(s.WithoutProposal.Days), len(s.Days))
	}
	// Spending money cannot raise the trough.
	if s.LowestCents > s.WithoutProposal.LowestCents {
		t.Errorf("the spend raised the lowest point: %d vs %d",
			s.LowestCents, s.WithoutProposal.LowestCents)
	}
	if s.DeltaLowestCents != s.LowestCents-s.WithoutProposal.LowestCents {
		t.Errorf("delta %d does not match the two paths", s.DeltaLowestCents)
	}
	// The two paths must be identical before the spend lands.
	for i, d := range s.Days {
		if d.Date >= date {
			break
		}
		if d.ClosingCents != s.WithoutProposal.Days[i].ClosingCents {
			t.Errorf("%s differs before the spend date: %d vs %d",
				d.Date, d.ClosingCents, s.WithoutProposal.Days[i].ClosingCents)
		}
	}
}

// With no proposal there is nothing to compare, and the field must be absent
// rather than an empty shell the UI would try to draw.
func TestNoProposalMeansNoComparison(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	if ws.Scenario.WithoutProposal != nil {
		t.Fatal("no proposal, so there must be no comparison path")
	}
	if ws.Scenario.DeltaLowestCents != 0 {
		t.Fatalf("delta = %d with no proposal", ws.Scenario.DeltaLowestCents)
	}
}

// Every figure the demo ships as a constant must be replaceable by the owner,
// and the projection must actually change when it is.
func TestOwnerFiguresReplaceTheDemoConstants(t *testing.T) {
	b := testBuilder(t)
	base := b.Build(contracts.ScenarioRequest{})

	balance := int64(900_000)
	fee := 8.0
	fx := 5.6
	supplier := int64(-620_000)
	date := b.Today.AddDate(0, 0, 6).Format(finance.DateLayout)

	edited := b.Build(contracts.ScenarioRequest{
		Assumptions: &contracts.AssumptionOverrides{
			OpeningBalanceCents: &balance,
			MarketplaceFeePct:   &fee,
			BRLPerUSD:           &fx,
			Outflows: map[string]contracts.OutflowOverride{
				"asm-supplier": {AmountCents: &supplier, Date: &date},
				"asm-rent":     {Removed: true},
			},
		},
	})

	if edited.Scenario.BaselineBalanceCents != balance {
		t.Errorf("baseline = %d, want %d", edited.Scenario.BaselineBalanceCents, balance)
	}
	if edited.Scenario.LowestCents == base.Scenario.LowestCents {
		t.Error("changing the inputs did not change the projection")
	}

	find := func(ws contracts.WorkspaceResponse, id string) *contracts.FinancialEvent {
		for i := range ws.Events {
			if ws.Events[i].ID == id {
				return &ws.Events[i]
			}
		}
		return nil
	}
	sup := find(edited, "evt-asm-supplier")
	if sup == nil || sup.AmountCents != supplier || sup.Date != date {
		t.Errorf("supplier payment not replaced: %+v", sup)
	}
	if find(edited, "evt-asm-rent") != nil {
		t.Error("a removed payment must not stay on the timeline")
	}
	// A lower fee leaves more of the same recorded revenue to pay out.
	if find(edited, "evt-payout").AmountCents == find(base, "evt-payout").AmountCents {
		t.Error("changing the commission did not change the payout")
	}
}

// A figure the owner supplied is theirs, and the badge must say so rather than
// continuing to call it a demo assumption.
func TestOverriddenFiguresChangeProvenance(t *testing.T) {
	b := testBuilder(t)
	fee := 8.0
	ws := b.Build(contracts.ScenarioRequest{
		Assumptions: &contracts.AssumptionOverrides{MarketplaceFeePct: &fee},
	})

	byID := map[string]contracts.Assumption{}
	for _, a := range ws.Assumptions {
		byID[a.ID] = a
	}
	if got := byID["asm-fee"].Provenance; got != contracts.ProvUserEntered {
		t.Errorf("an edited commission should be user_entered, got %q", got)
	}
	// Untouched figures must NOT be relabelled as the owner's.
	if got := byID["asm-ads"].Provenance; got != contracts.ProvDemoAssumption {
		t.Errorf("an untouched figure must stay a demo assumption, got %q", got)
	}
	if got := byID["asm-timeshift"].Provenance; got != contracts.ProvDemoAssumption {
		t.Errorf("the time shift is never the owner's, got %q", got)
	}
}

// Removing every outflow must not break the projection.
func TestRemovingEveryModelledPaymentStillProjects(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{
		Assumptions: &contracts.AssumptionOverrides{
			Outflows: map[string]contracts.OutflowOverride{
				"asm-supplier": {Removed: true},
				"asm-ads":      {Removed: true},
				"asm-rent":     {Removed: true},
			},
		},
	})
	if len(ws.Scenario.Days) == 0 {
		t.Fatal("projection produced no days")
	}
	if ws.Scenario.BreachesReserve {
		t.Error("with no outflows at all the reserve cannot be breached")
	}
}
