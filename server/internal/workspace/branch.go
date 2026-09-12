package workspace

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
)

// BuildBranch compares a what-if against the plan it branches from.
//
// Both payloads must already be sanitized. Changed means anything the
// interface would render differs, so the comparison is made on the whole
// serialized event or chain rather than on a hand-picked set of fields: a
// field added later is covered without anyone remembering to add it here.
func BuildBranch(plan, whatIf contracts.WorkspaceResponse) *contracts.WhatIfBranch {
	if !whatIf.Scenario.ScenarioActive {
		return nil
	}
	br := &contracts.WhatIfBranch{
		Label:             branchLabel(whatIf.Scenario),
		EndDate:           whatIf.WindowEnd,
		ChangedEventIDs:   []string{},
		RemovedEventIDs:   []string{},
		ChangedChainIDs:   []string{},
		UnchangedChainIDs: []string{},
	}

	start := ""
	earliest := func(d string) {
		if d != "" && (start == "" || d < start) {
			start = d
		}
	}

	planEvents := map[string]contracts.FinancialEvent{}
	for _, e := range plan.Events {
		planEvents[e.ID] = e
	}
	inWhatIf := map[string]bool{}
	for _, e := range whatIf.Events {
		inWhatIf[e.ID] = true
		if e.Kind == "balance" {
			continue
		}
		old, ok := planEvents[e.ID]
		if ok && sameJSON(old, e) {
			br.UnchangedEventCount++
			continue
		}
		br.ChangedEventIDs = append(br.ChangedEventIDs, e.ID)
		earliest(e.Date)
		if ok {
			// A moved event diverges from where it used to be, not where it went.
			earliest(old.Date)
		}
	}
	for _, e := range plan.Events {
		if !inWhatIf[e.ID] && e.Kind != "balance" {
			br.RemovedEventIDs = append(br.RemovedEventIDs, e.ID)
			earliest(e.Date)
		}
	}
	// Nothing a what-if changes is recorded, so it cannot branch in the past.
	if start == "" || start < whatIf.Today {
		start = whatIf.Today
	}
	br.StartDate = start

	planChains := map[string]contracts.Chain{}
	for _, c := range plan.Chains {
		planChains[c.ID] = c
	}
	var sameTitles []string
	for _, c := range whatIf.Chains {
		if old, ok := planChains[c.ID]; ok && sameJSON(old, c) {
			br.UnchangedChainIDs = append(br.UnchangedChainIDs, c.ID)
			sameTitles = append(sameTitles, c.Title)
			continue
		}
		br.ChangedChainIDs = append(br.ChangedChainIDs, c.ID)
	}

	br.Note = branchNote(sameTitles, br.UnchangedEventCount, len(br.ChangedChainIDs))
	return br
}

// sameJSON reports whether two values serialize identically. A value that
// cannot be serialized is treated as changed, so it is drawn rather than hidden.
func sameJSON(a, b any) bool {
	ja, errA := json.Marshal(a)
	jb, errB := json.Marshal(b)
	return errA == nil && errB == nil && string(ja) == string(jb)
}

// branchLabel names the what-if from the request the engine actually ran.
func branchLabel(res contracts.ScenarioResult) string {
	var parts []string
	if p := res.Proposal; p != nil {
		desc := strings.TrimSpace(p.Description)
		if desc == "" {
			desc = "Spend"
		}
		parts = append(parts, fmt.Sprintf("%s of %s on %s",
			branchUpperFirst(desc), finance.FormatUSD(p.AmountCents), finance.HumanDate(p.Date)))
	}
	if n := res.PayoutDelayDays; n != 0 {
		parts = append(parts, fmt.Sprintf("Payout %d %s late", n, branchPlural(n, "day", "days")))
	}
	return strings.Join(parts, " · ")
}

// branchNote says, in words, that the what-if timeline is not the plan, that it
// draws only differences, and what it therefore leaves out.
func branchNote(sameChains []string, sameEvents, changedChains int) string {
	note := "Nothing here is applied to your plan. Only what differs from it is drawn on this timeline."
	if changedChains == 0 {
		note = "Nothing here is applied to your plan. No chain reads differently under this what-if, so only the changed events are drawn on this timeline."
	}

	items := append([]string{}, sameChains...)
	if sameEvents > 0 {
		items = append(items, fmt.Sprintf("%d %s", sameEvents, branchPlural(sameEvents, "event", "events")))
	}
	if len(items) == 0 {
		return note
	}
	if len(items) > 1 || sameEvents > 1 {
		return note + " " + branchAndList(items) + " are the same in both, so they stay on your plan."
	}
	return note + " " + items[0] + " is the same in both, so it stays on your plan."
}

func branchPlural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

func branchAndList(items []string) string {
	switch len(items) {
	case 0:
		return ""
	case 1:
		return items[0]
	}
	return strings.Join(items[:len(items)-1], ", ") + " and " + items[len(items)-1]
}

func branchUpperFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
