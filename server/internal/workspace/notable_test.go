package workspace

import (
	"fmt"
	"math"
	"strings"
	"testing"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
)

func notableOf(ws contracts.WorkspaceResponse) []contracts.Chain {
	var out []contracts.Chain
	for _, c := range ws.Chains {
		if c.RuleID == RuleNotableWeek {
			out = append(out, c)
		}
	}
	return out
}

// weekRevenue recomputes a week's item revenue straight from the daily rows,
// without going through the code under test. shifted is the week end on
// today's calendar.
func weekRevenue(t *testing.T, b *Builder, shifted string) int64 {
	t.Helper()
	end, err := finance.ParseDate(shifted)
	if err != nil {
		t.Fatalf("bad date %q", shifted)
	}
	end = end.AddDate(0, 0, -b.shiftDays())
	byDate := map[string]int64{}
	for _, d := range b.Store.Olist.DailySales {
		byDate[d.Date] = d.ItemRevenueCents
	}
	var sum int64
	for i := 0; i < 7; i++ {
		sum += byDate[end.AddDate(0, 0, -i).Format(finance.DateLayout)]
	}
	return sum
}

// A notable week has to be earned by the records: it is in the past, it moved
// by at least the threshold against the week before, and the change the chain
// quotes is the change the daily rows actually give.
func TestNotableWeeksAreEarnedByTheRecords(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	chains := notableOf(ws)
	if len(chains) == 0 {
		t.Fatal("this history moves sharply more than once; expected notable weeks")
	}
	if len(chains) > 3 {
		t.Errorf("at most a peak, a rise and a fall; got %d chains", len(chains))
	}

	events := map[string]contracts.FinancialEvent{}
	for _, e := range ws.Events {
		events[e.ID] = e
	}
	roots := map[string]bool{}
	for _, c := range chains {
		root, ok := events[c.RootEventID]
		if !ok || root.Kind != "sales" {
			t.Fatalf("%s hangs from %q, which is not a recorded sales week", c.ID, c.RootEventID)
		}
		if root.Date >= ws.Today {
			t.Errorf("%s hangs from %s, which is not in the past", c.ID, root.Date)
		}
		if roots[c.RootEventID] {
			t.Errorf("two notable chains hang from %s", c.RootEventID)
		}
		roots[c.RootEventID] = true

		d, _ := finance.ParseDate(root.Date)
		prev := d.AddDate(0, 0, -7).Format(finance.DateLayout)
		now, before := weekRevenue(t, b, root.Date), weekRevenue(t, b, prev)
		if before <= 0 {
			t.Fatalf("%s: the week before has no revenue to compare against", c.ID)
		}
		pct := float64(now-before) / float64(before) * 100
		if math.Abs(pct) < notableMovePct {
			t.Errorf("%s moved %.1f%%, under the %.0f%% threshold", c.ID, pct, notableMovePct)
		}
		quoted := ""
		for _, cl := range c.Nodes[0].Claims {
			if strings.HasSuffix(cl.ID, "-change") {
				quoted = cl.Display
			}
		}
		if want := fmt.Sprintf("%+.1f%%", pct); quoted != want {
			t.Errorf("%s quotes %q, the daily rows give %q", c.ID, quoted, want)
		}

		// Every step points only at recorded weeks already behind today.
		for _, n := range c.Nodes {
			for _, id := range n.HighlightEventIDs {
				if e := events[id]; e.Kind != "sales" || e.Date >= ws.Today {
					t.Errorf("%s highlights %s, which is not a past recorded week", n.ID, id)
				}
			}
		}
	}
}

// A history with no sharp moves gets no notable weeks. The rule must not
// promote the least boring week of a flat record.
func TestAFlatHistoryHasNoNotableWeeks(t *testing.T) {
	b := testBuilder(t)
	for i := range b.Store.Olist.DailySales {
		b.Store.Olist.DailySales[i].ItemRevenueCents = 10_000
		b.Store.Olist.DailySales[i].ItemCount = 1
		b.Store.Olist.DailySales[i].OrderCount = 1
	}
	if got := notableOf(b.Build(contracts.ScenarioRequest{})); len(got) != 0 {
		t.Errorf("a flat history produced %d notable chains", len(got))
	}
}

// Each closed chain is a tag about six days wide on the timeline, so two chains
// on the same side of the rail need their roots well apart or the tags collide.
func TestChainsOnTheSameSideAreSpacedApart(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})

	dates := map[string][]string{}
	for _, c := range ws.Chains {
		for _, e := range ws.Events {
			if e.ID == c.RootEventID {
				dates[c.Direction] = append(dates[c.Direction], e.Date)
			}
		}
	}
	for side, ds := range dates {
		for i := 0; i < len(ds); i++ {
			for j := i + 1; j < len(ds); j++ {
				if gap := daysApart(ds[i], ds[j]); gap < 8 {
					t.Errorf("chains %s the rail on %s and %s are only %d days apart", side, ds[i], ds[j], gap)
				}
			}
		}
	}
}

// A what-if cannot change a week that has already happened, so no notable
// chain may read differently under one — otherwise the branch would redraw a
// past week as if the what-if had touched it.
func TestNotableChainsNeverBranch(t *testing.T) {
	b := testBuilder(t)
	plan := b.Build(contracts.ScenarioRequest{})
	plan.Sanitize()
	ids := map[string]bool{}
	for _, c := range notableOf(plan) {
		ids[c.ID] = true
	}
	if len(ids) == 0 {
		t.Fatal("expected notable chains to test")
	}

	whatIfs := map[string]contracts.ScenarioRequest{
		"delay": {PayoutDelayDays: 5},
		"purchase": {Proposal: &contracts.ProposedDecision{
			Description: "Ads", Category: "marketing",
			Date: b.Today.AddDate(0, 0, 3).Format(finance.DateLayout), AmountCents: 3_000_00,
		}},
	}
	for name, req := range whatIfs {
		wi := b.Build(req)
		wi.Sanitize()
		br := BuildBranch(plan, wi)
		if br == nil {
			t.Fatalf("%s: no branch", name)
		}
		unchanged := map[string]bool{}
		for _, id := range br.UnchangedChainIDs {
			unchanged[id] = true
		}
		for id := range ids {
			if !unchanged[id] {
				t.Errorf("%s: past chain %s reads differently under the what-if", name, id)
			}
		}
	}
}
