package finance

import (
	"fmt"
	"time"

	"github.com/preflight/preflight/server/internal/contracts"
)

// PayoutEventKind marks the event a delay stress test moves.
const PayoutEventKind = "payout"

// ProposalEventID is the stable ID given to the owner's proposed expenditure.
const ProposalEventID = "evt-proposal"

// DefaultDelayHorizonDays bounds the payout-delay search.
const DefaultDelayHorizonDays = 14

// ShiftPayouts returns a copy of events with every payout event moved later by
// delayDays whole days. Other events keep their dates.
func ShiftPayouts(events []contracts.FinancialEvent, delayDays int) []contracts.FinancialEvent {
	if delayDays == 0 {
		return events
	}
	out := make([]contracts.FinancialEvent, len(events))
	copy(out, events)
	for i := range out {
		if out[i].Kind != PayoutEventKind {
			continue
		}
		d, err := ParseDate(out[i].Date)
		if err != nil {
			continue
		}
		out[i].Date = d.AddDate(0, 0, delayDays).Format(DateLayout)
		// A delayed payout is conditional, not scheduled.
		out[i].Certainty = contracts.CertaintyConditional
		out[i].Detail = fmt.Sprintf("%s Moved %d day(s) later in this scenario.", out[i].Detail, delayDays)
	}
	return out
}

// ProposalEvent turns a proposed decision into a dated outflow event.
func ProposalEvent(p contracts.ProposedDecision, currency string) contracts.FinancialEvent {
	amount := p.AmountCents
	if amount > 0 {
		amount = -amount
	}
	label := p.Description
	if label == "" {
		label = "Proposed expenditure"
	}
	return contracts.FinancialEvent{
		ID:          ProposalEventID,
		Date:        p.Date,
		Label:       label,
		Kind:        "proposal",
		AmountCents: amount,
		Currency:    currency,
		Provenance:  contracts.ProvUserEntered,
		Certainty:   contracts.CertaintyConditional,
		SourceRefs:  []string{"src-user-proposal"},
		AffectsCash: true,
		Detail:      "Entered by the owner in this session. Nothing has been scheduled or paid.",
	}
}

// FindFirstBreachingDelay walks whole-day payout delays from 1 upward and
// returns the first delay whose projection falls below the reserve. Delay 0 is
// evaluated by the caller as the base case.
func FindFirstBreachingDelay(in Input, horizonDays int) contracts.DelayBreakpoint {
	if horizonDays <= 0 {
		horizonDays = DefaultDelayHorizonDays
	}
	base := in.Events
	bp := contracts.DelayBreakpoint{TestedUpToDays: horizonDays}

	for d := 1; d <= horizonDays; d++ {
		trial := in
		trial.Events = ShiftPayouts(base, d)
		r := Project(trial)
		if r.BreachesReserve {
			bp.Found = true
			bp.DelayDays = d
			bp.BreachDate = r.FirstBreachDate
			bp.LowestCents = r.LowestCents
			bp.Explanation = fmt.Sprintf(
				"A payout delay of %d day(s) is the first that drops projected cash below the %s reserve, on %s (lowest %s). Shorter delays stay at or above it.",
				d, FormatUSD(in.ReserveCents), HumanDate(r.FirstBreachDate), FormatUSD(r.LowestCents))
			return bp
		}
	}
	final := in
	final.Events = ShiftPayouts(base, horizonDays)
	r := Project(final)
	bp.LowestCents = r.LowestCents
	bp.Explanation = fmt.Sprintf(
		"No payout delay up to %d days drops projected cash below the %s reserve. At the longest delay tested the lowest balance is %s.",
		horizonDays, FormatUSD(in.ReserveCents), FormatUSD(r.LowestCents))
	return bp
}

// BuildAlternatives evaluates comparable variations of the proposal so the
// owner can weigh one against another. It proposes; it never acts.
func BuildAlternatives(in Input, p contracts.ProposedDecision, latestDate time.Time) []contracts.Alternative {
	if p.AmountCents == 0 {
		return nil
	}
	withoutProposal := make([]contracts.FinancialEvent, 0, len(in.Events))
	for _, e := range in.Events {
		if e.ID != ProposalEventID {
			withoutProposal = append(withoutProposal, e)
		}
	}

	evaluate := func(alt contracts.ProposedDecision) (int64, string, bool) {
		trial := in
		trial.Events = append(append([]contracts.FinancialEvent{}, withoutProposal...),
			ProposalEvent(alt, in.Currency))
		r := Project(trial)
		return r.LowestCents, r.LowestDate, r.BreachesReserve
	}

	var out []contracts.Alternative

	// Alternative 1: same amount, paid after the payout is expected to land.
	if d, err := ParseDate(p.Date); err == nil {
		later := d.AddDate(0, 0, 7)
		if !latestDate.IsZero() && later.After(latestDate) {
			later = latestDate
		}
		if later.After(d) {
			alt := p
			alt.Date = later.Format(DateLayout)
			alt.Description = p.Description + " (delayed)"
			low, lowDate, breach := evaluate(alt)
			out = append(out, contracts.Alternative{
				ID: "alt-delay", Kind: "delay",
				Label:    fmt.Sprintf("Same amount, pay on %s", HumanDate(alt.Date)),
				Detail:   fmt.Sprintf("Move the %s spend %d days later, after the expected payout.", FormatUSD(p.AmountCents), int(later.Sub(d).Hours()/24)),
				Proposal: alt, LowestCents: low, LowestDate: lowDate,
				BreachesReserve: breach, HeadroomCents: low - in.ReserveCents,
				Tradeoff: "Delays whatever the spend was meant to achieve. It does not change the return, which this demo cannot estimate.",
			})
		}
	}

	// Alternative 2: half the amount on the original date.
	half := p.AmountCents / 2
	if half > 0 {
		alt := p
		alt.AmountCents = half
		alt.Description = p.Description + " (reduced)"
		low, lowDate, breach := evaluate(alt)
		out = append(out, contracts.Alternative{
			ID: "alt-reduce", Kind: "reduce",
			Label:    fmt.Sprintf("Half the amount (%s) on %s", FormatUSD(half), HumanDate(p.Date)),
			Detail:   "Keep the original date and commit less cash.",
			Proposal: alt, LowestCents: low, LowestDate: lowDate,
			BreachesReserve: breach, HeadroomCents: low - in.ReserveCents,
			Tradeoff: "Less cash at risk, and correspondingly less of whatever the spend buys.",
		})
	}
	return out
}

// Verdict states the affordability conclusion in plain, conditional language.
// Affordability is never presented as an endorsement of the spend.
func Verdict(r contracts.ScenarioResult, hasProposal bool) (string, []string) {
	caveats := []string{
		"Affordable under these assumptions is not the same as worthwhile. This projection says nothing about what the money earns back.",
		"Only future dated events change the balance. Past transactions are already inside the opening figure and are never added again.",
	}
	if !hasProposal {
		if r.BreachesReserve {
			return fmt.Sprintf(
				"Before adding any new spending, projected cash already falls below your %s reserve on %s. The lowest point is %s on %s.",
				FormatUSD(r.ReserveCents), HumanDate(r.FirstBreachDate),
				FormatUSD(r.LowestCents), HumanDate(r.LowestDate)), caveats
		}
		return fmt.Sprintf(
			"With the events currently modeled, projected cash stays at or above your %s reserve for the whole %d-day window. The lowest point is %s on %s, leaving %s of headroom.",
			FormatUSD(r.ReserveCents), len(r.Days), FormatUSD(r.LowestCents),
			HumanDate(r.LowestDate), FormatUSD(r.HeadroomCents)), caveats
	}
	if r.BreachesReserve {
		return fmt.Sprintf(
			"Under these assumptions this spend does not fit. Projected cash falls to %s on %s, which is %s below your %s reserve.",
			FormatUSD(r.LowestCents), HumanDate(r.LowestDate),
			FormatUSD(-r.HeadroomCents), FormatUSD(r.ReserveCents)), caveats
	}
	return fmt.Sprintf(
		"Under these assumptions this spend fits. Every projected day stays at or above your %s reserve, with the tightest point %s on %s — %s of headroom.",
		FormatUSD(r.ReserveCents), FormatUSD(r.LowestCents),
		HumanDate(r.LowestDate), FormatUSD(r.HeadroomCents)), caveats
}
