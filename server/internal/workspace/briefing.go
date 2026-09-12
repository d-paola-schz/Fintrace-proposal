package workspace

import (
	"fmt"
	"strings"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
)

// BuildBriefing writes the opening paragraph: whether the plan covers what is
// coming, by how much, and what could change it — then points at the one place
// worth looking.
//
// Every figure comes from the engine. The wording is deliberately plain and
// deliberately careful: a delay that has not happened is always "could", and
// the modelled plan is never called the owner's actual plan, because it rests
// on demo assumptions and a banking fixture.
func (b *Builder) BuildBriefing(
	res contracts.ScenarioResult,
	events []contracts.FinancialEvent,
	chains []contracts.Chain,
) contracts.Briefing {
	low := finance.FormatUSD(res.LowestCents)
	lowDate := finance.HumanDate(res.LowestDate)
	reserve := finance.FormatUSD(res.ReserveCents)

	br := contracts.Briefing{Mode: "plan"}
	br.Status = map[bool]string{true: "at_risk", false: "on_track"}[res.BreachesReserve]

	// The nearest obligation the owner would be worrying about.
	obligation := largestUpcomingOutflow(events, res.StartDate)

	switch {
	case res.Proposal != nil:
		br.Mode = "scenario"
		br.ScenarioLabel = fmt.Sprintf("What-if: %s of %s on %s",
			strings.ToLower(res.Proposal.Description),
			finance.FormatUSD(res.Proposal.AmountCents),
			finance.HumanDate(res.Proposal.Date))
		if res.BreachesReserve {
			br.Lead = "This purchase would take you below your reserve."
		} else {
			br.Lead = "Your modelled plan still covers this purchase."
		}
	case res.PayoutDelayDays != 0:
		br.Mode = "scenario"
		br.ScenarioLabel = fmt.Sprintf("What-if: payout delayed %d days", res.PayoutDelayDays)
		if res.BreachesReserve {
			br.Lead = "With this delay, cash would drop below your reserve."
		} else {
			br.Lead = "Even with this delay, your modelled plan holds."
		}
	case res.BreachesReserve:
		br.Lead = "Your modelled plan does not cover everything scheduled."
	case obligation != "":
		br.Lead = fmt.Sprintf("You can cover your upcoming %s.", strings.ToLower(obligation))
	default:
		br.Lead = "Your modelled cash plan holds through the window."
	}

	if res.BreachesReserve {
		br.Detail = fmt.Sprintf("The projected low is %s on %s, %s short of your %s reserve.",
			low, lowDate, finance.FormatUSD(-res.HeadroomCents), reserve)
	} else {
		br.Detail = fmt.Sprintf("The projected low is %s on %s, leaving %s above your %s reserve.",
			low, lowDate, finance.FormatUSD(res.HeadroomCents), reserve)
	}

	// What could change it — a possibility, never an event.
	bp := res.DelayBreakpoint
	if res.Mode() == "plan" && bp.Found && bp.DelayDays > 0 {
		br.Watch = "A late marketplace payout could change that."
	} else if res.Mode() == "scenario" {
		br.Watch = "Nothing here has been applied to your modelled plan."
	}

	br.Highlight = highlightFor(res)

	// Where to look. Prefer the chain that explains the risk just named.
	if node, chain, event := firstStepOf(chains, "chain-payout", events); node != "" {
		br.SeeWhy = &contracts.BriefingAction{
			Label: "See why", Kind: "see_why",
			EventID: event, ChainID: chain, NodeID: node,
		}
	}
	return br
}

// largestUpcomingOutflow names the biggest scheduled payment still ahead, which
// is the thing an owner is actually asking about when they open the app.
func largestUpcomingOutflow(events []contracts.FinancialEvent, from string) string {
	best := ""
	var biggest int64
	for _, e := range events {
		if !e.AffectsCash || e.AmountCents >= 0 || e.Date < from {
			continue
		}
		if -e.AmountCents > biggest {
			biggest, best = -e.AmountCents, e.Label
		}
	}
	return best
}

// firstStepOf returns the opening node of a chain, plus the chain and the event
// it hangs from, so "See why" lands somewhere specific.
func firstStepOf(chains []contracts.Chain, preferred string, _ []contracts.FinancialEvent) (string, string, string) {
	pick := func(c contracts.Chain) (string, string, string) {
		for _, n := range c.Nodes {
			if n.Sequence == 1 {
				return n.ID, c.ID, c.RootEventID
			}
		}
		return "", "", ""
	}
	for _, c := range chains {
		if c.ID == preferred {
			return pick(c)
		}
	}
	if len(chains) > 0 {
		return pick(chains[0])
	}
	return "", "", ""
}

// highlightFor marks the days the briefing is about, and how they read.
//
// The span runs from the start of the projection to whichever comes later: the
// day cash bottoms out, or the day it first falls through the reserve. Both are
// engine outputs, so the band can never point at a day the projection does not
// contain.
//
// Three levels, because two were not enough to be useful: a plan that holds and
// a plan that holds only while nothing slips are different situations, and the
// owner wants to tell them apart at a glance.
func highlightFor(res contracts.ScenarioResult) *contracts.BriefingHighlight {
	end := res.LowestDate
	if res.FirstBreachDate != "" && res.FirstBreachDate > end {
		end = res.FirstBreachDate
	}
	if res.StartDate == "" || end == "" {
		return nil
	}

	bp := res.DelayBreakpoint
	h := &contracts.BriefingHighlight{StartDate: res.StartDate, EndDate: end}
	switch {
	case res.BreachesReserve:
		h.Level = "risk"
		h.Summary = fmt.Sprintf("Cash falls to %s on %s, below your %s reserve.",
			finance.FormatUSD(res.LowestCents), finance.HumanDate(res.LowestDate),
			finance.FormatUSD(res.ReserveCents))
	case bp.Found && bp.DelayDays > 0:
		h.Level = "watch"
		h.Summary = fmt.Sprintf("Holds at %s on %s, but a payout %d days late would break it.",
			finance.FormatUSD(res.LowestCents), finance.HumanDate(res.LowestDate), bp.DelayDays)
	default:
		h.Level = "good"
		h.Summary = fmt.Sprintf("Lowest is %s on %s, %s clear of your %s reserve.",
			finance.FormatUSD(res.LowestCents), finance.HumanDate(res.LowestDate),
			finance.FormatUSD(res.HeadroomCents), finance.FormatUSD(res.ReserveCents))
	}
	return h
}
