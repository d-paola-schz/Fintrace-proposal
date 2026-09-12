package workspace

import (
	"strings"
	"testing"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
)

func adCampaign() *contracts.ProposedDecision {
	return &contracts.ProposedDecision{
		Description: "Ad campaign", Category: "marketing", Date: "2026-09-16",
		AmountCents: 300_000, MinimumReserveCents: 500_000,
	}
}

func branchCases() map[string]contracts.ScenarioRequest {
	return map[string]contracts.ScenarioRequest{
		"purchase":         {Proposal: adCampaign()},
		"delay":            {PayoutDelayDays: 5},
		"purchase + delay": {Proposal: adCampaign(), PayoutDelayDays: 5},
	}
}

func branchHas(ids []string, id string) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

func TestThePlanHasNoBranch(t *testing.T) {
	if br := testBuilder(t).Build(contracts.ScenarioRequest{}).Branch; br != nil {
		t.Fatalf("the plan must never describe itself as a what-if: %+v", br)
	}
}

// Reserve and figure edits change the plan itself. Drawing them as a branch
// would present the owner's own inputs as a hypothetical.
func TestPlanInputsAloneDoNotBranch(t *testing.T) {
	if br := testBuilder(t).Build(contracts.ScenarioRequest{ReserveCents: 750_000}).Branch; br != nil {
		t.Fatalf("a reserve change is not a what-if: %+v", br)
	}
}

func TestAPurchaseBranchesOnTheDayItLeaves(t *testing.T) {
	ws := testBuilder(t).Build(contracts.ScenarioRequest{Proposal: adCampaign()})
	br := ws.Branch
	if br == nil {
		t.Fatal("a proposal must produce a branch")
	}
	if br.StartDate != "2026-09-16" {
		t.Errorf("branch starts %s, want the spend's own date 2026-09-16", br.StartDate)
	}
	if !branchHas(br.ChangedEventIDs, finance.ProposalEventID) {
		t.Errorf("the proposed spend is not listed as changed: %v", br.ChangedEventIDs)
	}
	if br.EndDate != ws.WindowEnd {
		t.Errorf("branch ends %s, want the what-if window end %s", br.EndDate, ws.WindowEnd)
	}
	if !strings.Contains(br.Label, "$3,000.00") || !strings.Contains(br.Label, "Sep 16") {
		t.Errorf("label %q does not name the spend the engine ran", br.Label)
	}
}

// A delayed payout diverges from the day it was due, not the day it lands.
func TestADelayBranchesWhereThePayoutWasDue(t *testing.T) {
	b := testBuilder(t)
	payout, ok := findEvent(b.Build(contracts.ScenarioRequest{}).Events, "evt-payout")
	if !ok {
		t.Fatal("plan has no payout event")
	}
	br := b.Build(contracts.ScenarioRequest{PayoutDelayDays: 5}).Branch
	if br == nil {
		t.Fatal("a delay must produce a branch")
	}
	if br.StartDate != payout.Date {
		t.Errorf("branch starts %s, want the payout's planned date %s", br.StartDate, payout.Date)
	}
	if !branchHas(br.ChangedEventIDs, "evt-payout") {
		t.Errorf("the moved payout is not listed as changed: %v", br.ChangedEventIDs)
	}
}

// The sales chain is measured from recorded weeks only. No cash what-if can
// change it, so it must never be redrawn on the branch.
func TestTheSalesChainNeverBranches(t *testing.T) {
	b := testBuilder(t)
	for name, req := range branchCases() {
		ws := b.Build(req)
		for _, c := range ws.Chains {
			if c.RuleID == RuleSalesStock && !branchHas(ws.Branch.UnchangedChainIDs, c.ID) {
				t.Errorf("%s: sales chain %s is drawn as changed", name, c.ID)
			}
		}
	}
}

// Every chain is drawn on the branch or named as unchanged — exactly one — and
// both claims are literally true against the plan.
func TestEveryChainIsAccountedForExactlyOnce(t *testing.T) {
	b := testBuilder(t)
	for name, req := range branchCases() {
		planReq := req
		planReq.Proposal, planReq.PayoutDelayDays = nil, 0
		plan := b.Build(planReq)
		plan.Sanitize()
		ws := b.Build(req)

		for _, c := range ws.Chains {
			changed := branchHas(ws.Branch.ChangedChainIDs, c.ID)
			same := branchHas(ws.Branch.UnchangedChainIDs, c.ID)
			if changed == same {
				t.Errorf("%s: chain %s changed=%v unchanged=%v; want exactly one", name, c.ID, changed, same)
			}
			var planCopy *contracts.Chain
			for i := range plan.Chains {
				if plan.Chains[i].ID == c.ID {
					planCopy = &plan.Chains[i]
				}
			}
			if same && (planCopy == nil || !sameJSON(*planCopy, c)) {
				t.Errorf("%s: chain %s is called unchanged but differs from the plan", name, c.ID)
			}
			if changed && planCopy != nil && sameJSON(*planCopy, c) {
				t.Errorf("%s: chain %s is drawn as changed but is identical to the plan", name, c.ID)
			}
		}
	}
}

// Leaving something off the branch is only honest if the branch says so.
func TestTheBranchSaysWhatItLeftOut(t *testing.T) {
	b := testBuilder(t)
	for name, req := range branchCases() {
		ws := b.Build(req)
		br := ws.Branch
		if !strings.Contains(br.Note, "Nothing here is applied to your plan.") {
			t.Errorf("%s: note %q does not say the what-if is unapplied", name, br.Note)
		}
		for _, c := range ws.Chains {
			if branchHas(br.UnchangedChainIDs, c.ID) && !strings.Contains(br.Note, c.Title) {
				t.Errorf("%s: note %q omits unchanged chain %q", name, br.Note, c.Title)
			}
		}
		if br.UnchangedEventCount > 0 && !strings.Contains(br.Note, "stay") {
			t.Errorf("%s: note %q does not say where the unchanged events went", name, br.Note)
		}
	}
}

func TestTheBranchNeverStartsBeforeToday(t *testing.T) {
	b := testBuilder(t)
	for name, req := range branchCases() {
		ws := b.Build(req)
		if ws.Branch.StartDate < ws.Today {
			t.Errorf("%s: branch starts %s, before today %s", name, ws.Branch.StartDate, ws.Today)
		}
	}
}
