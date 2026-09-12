package workspace

import (
	"fmt"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
)

// BuildOutlook states the cash position in the owner's language.
//
// Two things are kept strictly apart, because confusing them is the most
// misleading thing this product could do:
//
//   - what the plan actually is, and
//   - what some change WOULD do to it.
//
// So the first line always describes exactly what is on screen — and says so
// when that is a what-if rather than the plan — while the second line carries
// the alternative. When the owner is looking at the plan, the alternative is
// the risk ahead of them. When they are looking at a scenario, the alternative
// is the plan they can return to.
func (b *Builder) BuildOutlook(
	res contracts.ScenarioResult,
	events []contracts.FinancialEvent,
) contracts.Outlook {
	low := finance.FormatUSD(res.LowestCents)
	lowDate := finance.HumanDate(res.LowestDate)
	reserve := finance.FormatUSD(res.ReserveCents)
	breach := res.BreachesReserve

	standing := "%s above your %s reserve."
	amount := finance.FormatUSD(res.HeadroomCents)
	if breach {
		standing = "%s below your %s reserve."
		amount = finance.FormatUSD(-res.HeadroomCents)
	}
	tail := fmt.Sprintf(standing, amount, reserve)

	out := contracts.Outlook{}
	tone := contracts.ToneOpportunity
	if breach {
		tone = contracts.ToneRisk
	}

	switch {
	case res.Proposal != nil:
		out.Status = map[bool]string{true: "at_risk", false: "on_track"}[breach]
		out.Headline = map[bool]string{
			true:  "This spend does not fit",
			false: "This spend fits",
		}[breach]
		out.Plan = contracts.OutlookLine{
			Kind: "plan", Label: "With this change", Badge: "not applied", Tone: tone,
			AmountCents: res.LowestCents, Date: res.LowestDate,
			Sentence: fmt.Sprintf("Cash reaches %s on %s, %s", low, lowDate, tail),
		}

	case res.PayoutDelayDays != 0:
		out.Status = map[bool]string{true: "at_risk", false: "on_track"}[breach]
		out.Headline = fmt.Sprintf("Showing a %d-day payout delay", res.PayoutDelayDays)
		out.Plan = contracts.OutlookLine{
			Kind:  "conditional",
			Label: fmt.Sprintf("What-if · payout %d days late", res.PayoutDelayDays),
			Badge: "hasn't happened",
			Tone:  tone, AmountCents: res.LowestCents, Date: res.LowestDate,
			Sentence: fmt.Sprintf("Under this delay cash reaches %s on %s, %s", low, lowDate, tail),
		}

	case breach:
		out.Status, out.Headline = "at_risk", "Your cash plan needs attention"
		out.Plan = contracts.OutlookLine{
			Kind: "plan", Label: "Current plan", Tone: tone,
			AmountCents: res.LowestCents, Date: res.LowestDate,
			Sentence: fmt.Sprintf("Your lowest projected balance is %s on %s, %s", low, lowDate, tail),
		}

	default:
		out.Status, out.Headline = "on_track", "Your cash plan is on track"
		out.Plan = contracts.OutlookLine{
			Kind: "plan", Label: "Current plan", Tone: tone,
			AmountCents: res.LowestCents, Date: res.LowestDate,
			Sentence: fmt.Sprintf("Your lowest projected balance is %s on %s — %s", low, lowDate, tail),
		}
	}

	// ---- the alternative ----
	if res.ScenarioActive && res.OnTimePlan != nil {
		p := res.OnTimePlan
		side := fmt.Sprintf("%s above", finance.FormatUSD(p.HeadroomCents))
		if p.BreachesReserve {
			side = fmt.Sprintf("%s below", finance.FormatUSD(-p.HeadroomCents))
		}
		out.Conditional = &contracts.OutlookLine{
			Kind: "plan", Label: "Your actual plan", Badge: "unchanged",
			Tone:        contracts.ToneReview,
			AmountCents: p.LowestCents, Date: p.LowestDate,
			Sentence: fmt.Sprintf(
				"Without this change, your lowest point is %s on %s, %s your reserve. Nothing here has been applied to your real plan.",
				finance.FormatUSD(p.LowestCents), finance.HumanDate(p.LowestDate), side),
		}
		return out
	}

	bp := res.DelayBreakpoint
	if bp.Found && bp.DelayDays > 0 {
		payoutDate := ""
		for _, e := range events {
			if e.ID == "evt-payout" {
				payoutDate = finance.HumanDate(e.Date)
			}
		}
		label := fmt.Sprintf("If the payout is %d days late", bp.DelayDays)
		if payoutDate != "" {
			label = fmt.Sprintf("If the %s payout is %d days late", payoutDate, bp.DelayDays)
		}
		out.Conditional = &contracts.OutlookLine{
			Kind: "conditional", Label: label, Badge: "hasn't happened",
			Tone:        contracts.ToneRisk,
			AmountCents: bp.LowestCents, Date: bp.BreachDate,
			ScenarioDelayDays: bp.DelayDays, FocusNodeID: "node-payout-2",
			Sentence: fmt.Sprintf(
				"Cash could fall to %s and drop below your reserve on %s. This has not happened — it is what a delay of %d days or more would do.",
				finance.FormatUSD(bp.LowestCents), finance.HumanDate(bp.BreachDate), bp.DelayDays),
		}
	}
	return out
}
