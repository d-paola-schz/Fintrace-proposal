package workspace

import (
	"fmt"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
)

// Chains are produced by a small number of explicit Go rules. The language
// model never decides that a chain exists, what colour a node is, or what a
// node claims. Each node points at an observed input, a named rule, or a
// transparent assumption.
//
// Rule 1 — payout timing: a scheduled outflow standing before a modeled payout,
// stress-tested against the owner's reserve.
// Rule 2 — sales versus availability: a recorded change in this seller's item
// sales, and the single missing number that stops it becoming a stock decision.

const (
	RulePayoutTiming = "rule-payout-timing"
	RuleSalesStock   = "rule-sales-vs-availability"

	// windowWeeks is how many weekly markers fall inside the 30-day window the
	// sales chain's figures are measured over.
	windowWeeks = 4
)

// BuildChains returns the chains for the current scenario result. Tones come
// from the engine's own findings, so re-running a scenario can change them.
func (b *Builder) BuildChains(res contracts.ScenarioResult, events []contracts.FinancialEvent) []contracts.Chain {
	return []contracts.Chain{
		b.payoutTimingChain(res, events),
		b.salesStockChain(),
	}
}

// presentEvents keeps only the ids that resolve to an event in this payload.
// A step may never point the timeline at a day that is not on it.
func presentEvents(events []contracts.FinancialEvent, ids ...string) []string {
	out := []string{}
	for _, id := range ids {
		if _, ok := findEvent(events, id); ok {
			out = append(out, id)
		}
	}
	return out
}

func findEvent(events []contracts.FinancialEvent, id string) (contracts.FinancialEvent, bool) {
	for _, e := range events {
		if e.ID == id {
			return e, true
		}
	}
	return contracts.FinancialEvent{}, false
}

func (b *Builder) payoutTimingChain(res contracts.ScenarioResult, events []contracts.FinancialEvent) contracts.Chain {
	payout, _ := findEvent(events, "evt-payout")
	supplier, _ := findEvent(events, "evt-asm-supplier")
	rent, _ := findEvent(events, "evt-asm-rent")
	bp := res.DelayBreakpoint

	chain := contracts.Chain{
		ID: "chain-payout", RootEventID: "evt-payout", Direction: "below",
		Title: "Payout timing", RuleID: RulePayoutTiming,
	}

	// ---- Node 01: what is actually on the calendar. Observed, needs review.
	n1 := contracts.ChainNode{
		ID: "node-payout-1", ChainID: chain.ID, RootEventID: "evt-payout", Sequence: 1,
		Title:  "Payment comes first",
		Tone:   contracts.ToneReview,
		Status: contracts.StatusObserved,
		RuleID: RulePayoutTiming,
		Summary: fmt.Sprintf("%s out on %s, %s expected %s",
			finance.FormatUSD(-supplier.AmountCents), finance.HumanDate(supplier.Date),
			finance.FormatUSD(payout.AmountCents), finance.HumanDate(payout.Date)),
		Explanation: fmt.Sprintf(
			"Your supplier payment of %s is dated %s. The marketplace payout of %s is not expected until %s, three days later. The payment therefore has to clear out of the balance you already hold, not out of money that has arrived. The payout's date and amount are both modeled for this demonstration — Olist publishes no payout ledger — so this ordering is an assumption you can change, not a record.",
			finance.FormatUSD(-supplier.AmountCents), finance.HumanDate(supplier.Date),
			finance.FormatUSD(payout.AmountCents), finance.HumanDate(payout.Date)),
		SourceRefs:     []string{"asm-supplier", "asm-payout", "src-olist-window"},
		AssumptionRefs: []string{"asm-payout", "asm-fee", "asm-fx"},
		Claims: []contracts.Claim{
			claimOf(supplier), claimOf(payout),
			{
				ID: "claim-gap-days", Label: "Days between the payment and the payout",
				Display: "3 days", Provenance: contracts.ProvDerived,
				SourceRefs: []string{"asm-supplier", "asm-payout"},
				Note:       "Difference between the two dated events above.",
			},
		},
		ResponseOptions: []contracts.ResponseOption{
			{ID: "opt-open-payout", Label: "Test a different payout date",
				Detail: "Move the expected payout and watch every projected day recompute.",
				Action: "adjust_payout_delay", Value: "3"},
		},
		SuggestedAsks: []string{
			"Why does this payment not come out of the payout?",
			"What exactly is assumed about this payout?",
		},
		// The two dates the sentence above is comparing.
		HighlightEventIDs: presentEvents(events, "evt-asm-supplier", "evt-payout"),
	}

	// ---- Node 02: the stress test. Tone follows the engine's finding.
	n2 := contracts.ChainNode{
		ID: "node-payout-2", ChainID: chain.ID, RootEventID: "evt-payout", Sequence: 2,
		Status:         contracts.StatusPossible,
		RuleID:         RulePayoutTiming,
		SourceRefs:     []string{"asm-payout", "asm-supplier", "asm-rent", "src-nessie-account"},
		AssumptionRefs: []string{"asm-reserve", "asm-payout", "asm-fee"},
		ResponseOptions: []contracts.ResponseOption{
			{ID: "opt-delay-test", Label: "Apply that delay to the timeline",
				Detail: "Recompute every day, and this chain, with the payout moved.",
				Action: "adjust_payout_delay", Value: fmt.Sprintf("%d", bp.DelayDays)},
		},
		SuggestedAsks: []string{
			"What happens if the payout is a week late?",
			"Which payment causes the shortfall?",
		},
	}
	// The payout is always part of this step; the outflow named alongside it is
	// whichever one the engine actually blamed.
	n2.HighlightEventIDs = presentEvents(events, "evt-payout")
	if bp.Found {
		if bp.DelayDays == 0 {
			n2.HighlightEventIDs = presentEvents(events, "evt-payout", "evt-asm-supplier")
		} else {
			n2.HighlightEventIDs = presentEvents(events, "evt-payout", "evt-asm-rent")
		}
		n2.Tone = contracts.ToneRisk
		if bp.DelayDays == 0 {
			n2.Title = "The gap is already there"
		} else {
			n2.Title = fmt.Sprintf("A %d-day delay creates a gap", bp.DelayDays)
		}
		n2.Summary = fmt.Sprintf("First breach %s, cash %s",
			finance.HumanDate(bp.BreachDate), finance.FormatUSD(bp.LowestCents))
		if bp.DelayDays == 0 {
			n2.Explanation = bp.Explanation +
				" Removing or moving the commitment that causes it is what changes the answer, not the payout date." +
				appliedDelayNote(res)
		} else {
			n2.Explanation = fmt.Sprintf(
				"%s The payment that pushes it under is %s of %s on %s: with the payout still outstanding, that day closes below the floor. Delays shorter than %d days stay at or above it.%s",
				bp.Explanation, rent.Label, finance.FormatUSD(-rent.AmountCents),
				finance.HumanDate(rent.Date), bp.DelayDays, appliedDelayNote(res))
		}
	} else {
		n2.Tone = contracts.ToneReview
		n2.Title = "A delay would not break it"
		n2.Summary = fmt.Sprintf("Tested to %d days", bp.TestedUpToDays)
		n2.Explanation = bp.Explanation +
			" That holds only for the outflows currently modeled; adding a new commitment can change it."
	}
	n2.Claims = []contracts.Claim{
		{
			ID: "claim-breakpoint", Label: "First payout delay that breaches",
			Display: delayDisplay(bp), Provenance: contracts.ProvDerived,
			SourceRefs: []string{"asm-payout", "asm-reserve", "src-nessie-account"},
			Note:       fmt.Sprintf("Computed by projecting the balance day by day for each whole-day delay from 1 to %d and taking the first that falls below the reserve.", bp.TestedUpToDays),
		},
		{
			ID: "claim-lowest", Label: "Lowest projected cash at that delay",
			Display: finance.FormatUSD(bp.LowestCents), AmountCents: ptr(bp.LowestCents),
			Currency: "USD", Provenance: contracts.ProvDerived,
			SourceRefs: []string{"src-nessie-account", "asm-supplier", "asm-rent", "asm-ads"},
		},
		{
			ID: "claim-reserve", Label: "Minimum operating reserve",
			Display: finance.FormatUSD(res.ReserveCents), AmountCents: ptr(res.ReserveCents),
			Currency: "USD", Provenance: contracts.ProvUserEntered,
			SourceRefs: []string{"asm-reserve"},
			Note:       "Owner-set floor. Change it and every figure on this page recomputes.",
		},
	}
	n2.Chart = b.cashChart(res)

	// ---- Node 03: what the owner could do. Always a proposal, never an action.
	n3 := contracts.ChainNode{
		ID: "node-payout-3", ChainID: chain.ID, RootEventID: "evt-payout", Sequence: 3,
		Title:   "Two ways to protect the reserve",
		Tone:    contracts.ToneOpportunity,
		Status:  contracts.StatusAction,
		RuleID:  RulePayoutTiming,
		Summary: "Move the ad spend, or ask for later supplier terms",
		Explanation: fmt.Sprintf(
			"Both levers are inside your control and neither depends on the payout arriving. Holding the %s ad charge until after the payout keeps that cash in the account through the tightest days. Asking the supplier to move %s later has the same effect on the balance. Preflight can only show what each does to the cash line — it does not place either request, and it cannot tell you what the ad spend would have earned.",
			finance.FormatUSD(-eventAmount(events, "evt-asm-ads")), finance.FormatUSD(-supplier.AmountCents)),
		SourceRefs:     []string{"asm-ads", "asm-supplier"},
		AssumptionRefs: []string{"asm-reserve"},
		Claims: []contracts.Claim{
			claimOf(mustEvent(events, "evt-asm-ads")),
			{
				ID: "claim-roi-unknown", Label: "Return on either lever",
				Display: "Cannot be determined", Provenance: contracts.ProvDerived,
				SourceRefs: []string{},
				Note:       "Nothing in the connected records measures what advertising earns, or what later supplier terms cost. This page compares cash timing only.",
			},
		},
		ResponseOptions: []contracts.ResponseOption{
			{ID: "opt-propose", Label: "Propose a different spend",
				Detail: "Enter an amount and a date and run it through the same projection.",
				Action: "edit_proposal"},
			{ID: "opt-compare", Label: "Compare a smaller or later version",
				Detail: "Evaluate one alternative against the same reserve.",
				Action: "compare_alternative"},
		},
		SuggestedAsks: []string{
			"Could I spend $3,000 on ads before month end?",
			"What if I halve the ad spend instead?",
		},
		// The two outflows this step proposes moving.
		HighlightEventIDs: presentEvents(events, "evt-asm-ads", "evt-asm-supplier"),
	}

	chain.Nodes = []contracts.ChainNode{n1, n2, n3}
	chain.Segments = []contracts.ChainSegment{
		{FromSequence: 0, ToSequence: 1, Tone: contracts.ToneReview, Label: "scheduled"},
		{FromSequence: 1, ToSequence: 2, Tone: n2.Tone, Label: "if delayed"},
		{FromSequence: 2, ToSequence: 3, Tone: contracts.ToneOpportunity, Label: "you can"},
	}
	return chain
}

func (b *Builder) salesStockChain() contracts.Chain {
	o := b.Store.Olist
	win, prior := o.Window, o.PriorWindow
	deltaPct := 0.0
	if prior.ItemRevenueCents > 0 {
		deltaPct = float64(win.ItemRevenueCents-prior.ItemRevenueCents) / float64(prior.ItemRevenueCents) * 100
	}
	avgNow := win.ItemRevenueCents / int64(max(1, win.ItemCount))
	avgPrior := prior.ItemRevenueCents / int64(max(1, prior.ItemCount))

	sales := b.salesEvents()
	rootID := ""
	// The timeline now carries several months of recorded weeks, but the
	// figures in this chain are measured over the 30-day window only. The
	// highlight has to stay inside what the claims actually cover, or a step
	// would point at weeks its own numbers do not include.
	windowIDs := []string{}
	for i, e := range sales {
		if rootID == "" {
			rootID = e.ID // the most recent weekly marker
		}
		if i < windowWeeks {
			windowIDs = append(windowIDs, e.ID)
		}
	}

	chain := contracts.Chain{
		ID: "chain-sales", RootEventID: rootID, Direction: "above",
		Title: "Sales mix", RuleID: RuleSalesStock,
	}

	n1 := contracts.ChainNode{
		ID: "node-sales-1", ChainID: chain.ID, RootEventID: rootID, Sequence: 1,
		Title:  fmt.Sprintf("Revenue up %.1f%%, same volume", deltaPct),
		Tone:   contracts.ToneOpportunity,
		Status: contracts.StatusObserved,
		RuleID: RuleSalesStock,
		Summary: fmt.Sprintf("%d items both windows, %s average item price",
			win.ItemCount, finance.FormatBRL(avgNow)),
		Explanation: fmt.Sprintf(
			"This seller sold %d items in the 30 days to %s and %d items in the 30 days before that — the same count — yet recorded item revenue rose %.1f%%, from %s to %s. The whole difference is average item price: %s against %s. These are the seller's own recorded order-item rows, with cancelled and unavailable orders excluded.",
			win.ItemCount, win.End, prior.ItemCount, deltaPct,
			finance.FormatBRL(prior.ItemRevenueCents), finance.FormatBRL(win.ItemRevenueCents),
			finance.FormatBRL(avgNow), finance.FormatBRL(avgPrior)),
		SourceRefs:     []string{"src-olist-window", "src-olist-prior", "src-olist-seller"},
		AssumptionRefs: []string{"asm-timeshift"},
		Claims: []contracts.Claim{
			{
				ID: "claim-window-rev", Label: "Item revenue, 30-day window",
				Display:     finance.FormatBRL(win.ItemRevenueCents),
				AmountCents: ptr(win.ItemRevenueCents), Currency: "BRL",
				Provenance: contracts.ProvOlistHistorical,
				SourceRefs: []string{"src-olist-window"}, AsOf: win.End,
				Note: b.convertedNote(win.ItemRevenueCents),
			},
			{
				ID: "claim-prior-rev", Label: "Item revenue, previous 30 days",
				Display:     finance.FormatBRL(prior.ItemRevenueCents),
				AmountCents: ptr(prior.ItemRevenueCents), Currency: "BRL",
				Provenance: contracts.ProvOlistHistorical,
				SourceRefs: []string{"src-olist-prior"}, AsOf: prior.End,
				Note: b.convertedNote(prior.ItemRevenueCents),
			},
			{
				ID: "claim-delta", Label: "Change in item revenue",
				Display: fmt.Sprintf("%+.1f%%", deltaPct), Provenance: contracts.ProvDerived,
				SourceRefs: []string{"src-olist-window", "src-olist-prior"},
				Note:       "Both windows are 30 days and both count only this seller's items.",
			},
		},
		Chart:           b.salesChart(),
		ResponseOptions: []contracts.ResponseOption{},
		SuggestedAsks: []string{
			"Is this growth or just price?",
			"Which categories moved?",
		},
		// The recorded weeks this comparison is made of.
		HighlightEventIDs: windowIDs,
	}

	topShare := 0.0
	topCat, topPrice := "", int64(0)
	topCount := 0
	if len(o.TopProducts) > 0 {
		tp := o.TopProducts[0]
		topCount = tp.ItemCount
		topCat, topPrice = tp.Category, tp.UnitPriceCents
		if win.ItemCount > 0 {
			topShare = float64(tp.ItemCount) / float64(win.ItemCount) * 100
		}
	}

	n2 := contracts.ChainNode{
		ID: "node-sales-2", ChainID: chain.ID, RootEventID: rootID, Sequence: 2,
		Title:   fmt.Sprintf("One product carries %.0f%%", topShare),
		Tone:    contracts.ToneReview,
		Status:  contracts.StatusInferred,
		RuleID:  RuleSalesStock,
		Summary: fmt.Sprintf("%d of %d items, %s each", topCount, win.ItemCount, finance.FormatBRL(topPrice)),
		Explanation: fmt.Sprintf(
			"%d of the %d items sold in the window are the same product, in %s, at %s each. That concentration is worth knowing before any reorder decision, because a single product carrying a third of the volume is also a single point of failure. This is a count of recorded rows — it says nothing about how many units remain.",
			topCount, win.ItemCount, topCat, finance.FormatBRL(topPrice)),
		SourceRefs:     []string{"src-olist-window", "src-olist-products"},
		AssumptionRefs: []string{},
		Claims: []contracts.Claim{
			{
				ID: "claim-top-share", Label: "Share of window items from the top product",
				Display:    fmt.Sprintf("%.0f%% (%d of %d)", topShare, topCount, win.ItemCount),
				Provenance: contracts.ProvDerived,
				SourceRefs: []string{"src-olist-window", "src-olist-products"}, AsOf: win.End,
			},
			{
				ID: "claim-top-price", Label: "Recorded unit price",
				Display: finance.FormatBRL(topPrice), AmountCents: ptr(topPrice), Currency: "BRL",
				Provenance: contracts.ProvOlistHistorical,
				SourceRefs: []string{"src-olist-products"},
				Note:       "Average recorded item price. This is the price the customer paid, not what the product cost you — Olist publishes no cost of goods.",
			},
		},
		ResponseOptions: []contracts.ResponseOption{},
		SuggestedAsks:   []string{"What else sells alongside it?"},
		// The same recorded weeks, counted by product rather than by revenue.
		HighlightEventIDs: windowIDs,
	}

	n3 := contracts.ChainNode{
		ID: "node-sales-3", ChainID: chain.ID, RootEventID: rootID, Sequence: 3,
		Title:   "Reordering needs a number we lack",
		Tone:    contracts.ToneReview,
		Status:  contracts.StatusPossible,
		RuleID:  RuleSalesStock,
		Summary: "Missing: units on hand",
		Explanation: fmt.Sprintf(
			"To turn that sales pattern into a reorder decision, this workspace needs one number it does not have: how many units of that product you currently hold. The Olist release contains no inventory table and no cost of goods for any seller, so a days-of-stock figure or a margin cannot be calculated from the connected records — and will not be guessed. Enter units on hand and the %s recorded unit price becomes a dated stock-out estimate you can actually act on.",
			finance.FormatBRL(topPrice)),
		SourceRefs:     []string{"src-olist-products"},
		AssumptionRefs: []string{},
		Claims: []contracts.Claim{
			{
				ID: "claim-stock", Label: "Units on hand",
				Display: "Not in the connected records", Provenance: contracts.ProvDerived,
				SourceRefs: []string{},
				Note:       "The Olist public dataset has no inventory table. Nothing on this page estimates it.",
			},
			{
				ID: "claim-margin", Label: "Margin on this product",
				Display: "Not in the connected records", Provenance: contracts.ProvDerived,
				SourceRefs: []string{},
				Note:       "Margin needs a recorded unit cost. Olist publishes sale prices only, so no margin figure appears anywhere in this product.",
			},
		},
		ResponseOptions: []contracts.ResponseOption{
			{ID: "opt-enter-stock", Label: "Enter units on hand",
				Detail: "Supply the one missing number and this becomes a dated stock-out estimate.",
				Action: "edit_proposal"},
		},
		SuggestedAsks: []string{"What is my margin on this product?"},
		// Deliberately empty. Units on hand are not in the connected records,
		// so there is no day on the timeline this step can point at, and the
		// timeline says so by staying empty.
		HighlightEventIDs: []string{},
	}

	chain.Nodes = []contracts.ChainNode{n1, n2, n3}
	chain.Segments = []contracts.ChainSegment{
		{FromSequence: 0, ToSequence: 1, Tone: contracts.ToneOpportunity, Label: "recorded"},
		{FromSequence: 1, ToSequence: 2, Tone: contracts.ToneReview, Label: "concentrated in"},
		{FromSequence: 2, ToSequence: 3, Tone: contracts.ToneReview, Label: "but"},
	}
	return chain
}

// appliedDelayNote states where the timeline currently stands relative to the
// breakpoint, so the node never contradicts the chart beside it.
func appliedDelayNote(res contracts.ScenarioResult) string {
	if res.PayoutDelayDays == 0 {
		return " The timeline currently assumes the payout is on time."
	}
	if res.BreachesReserve {
		return fmt.Sprintf(" You are currently testing a %d-day delay, and the projection below does fall through the reserve, first on %s.",
			res.PayoutDelayDays, finance.HumanDate(res.FirstBreachDate))
	}
	return fmt.Sprintf(" You are currently testing a %d-day delay, which still holds above the reserve.", res.PayoutDelayDays)
}

func delayDisplay(bp contracts.DelayBreakpoint) string {
	if !bp.Found {
		return fmt.Sprintf("None within %d days", bp.TestedUpToDays)
	}
	if bp.DelayDays == 0 {
		return "Already below, with no delay"
	}
	return fmt.Sprintf("%d days", bp.DelayDays)
}

func (b *Builder) cashChart(res contracts.ScenarioResult) *contracts.ChartSpec {
	pts := make([]contracts.ChartPoint, 0, len(res.Days))
	for _, d := range res.Days {
		pts = append(pts, contracts.ChartPoint{
			Date: d.Date, AmountCents: d.ClosingCents, Projected: true,
		})
	}
	reserve := res.ReserveCents
	return &contracts.ChartSpec{
		Kind: "cash_projection", Currency: "USD",
		Title: fmt.Sprintf("Projected cash, %s to %s",
			finance.HumanDate(res.StartDate), finance.HumanDate(res.EndDate)),
		Caption: fmt.Sprintf(
			"Every day is projected from the %s opening balance and the modeled events only. The line is the reserve at %s.",
			finance.FormatUSD(res.BaselineBalanceCents), finance.FormatUSD(reserve)),
		Points: pts, ThresholdCents: &reserve,
		Provenance: contracts.ProvDerived,
		SourceRefs: []string{"src-nessie-account", "asm-supplier", "asm-rent", "asm-ads", "asm-payout"},
	}
}

func (b *Builder) salesChart() *contracts.ChartSpec {
	var pts []contracts.ChartPoint
	for _, e := range b.salesEvents() {
		pts = append(pts, contracts.ChartPoint{
			Date: e.Date, AmountCents: e.AmountCents, Projected: false,
			Label: finance.HumanDate(e.Date),
		})
	}
	// salesEvents runs newest first; the chart reads left to right.
	for i, j := 0, len(pts)-1; i < j; i, j = i+1, j-1 {
		pts[i], pts[j] = pts[j], pts[i]
	}
	return &contracts.ChartSpec{
		Kind: "weekly_sales", Currency: "USD",
		Title:   "Recorded item sales, four weeks",
		Caption: "This seller's own order items, converted at the demo rate and redrawn onto the current calendar. Sales, not bank deposits.",
		Points:  pts, Provenance: contracts.ProvOlistHistorical,
		SourceRefs: []string{"src-olist-seller", "src-olist-window", "src-fx"},
	}
}

func claimOf(e contracts.FinancialEvent) contracts.Claim {
	if len(e.Claims) > 0 {
		return e.Claims[0]
	}
	return contracts.Claim{
		ID: "claim-" + e.ID, Label: e.Label, Display: finance.FormatUSD(e.AmountCents),
		AmountCents: ptr(e.AmountCents), Currency: e.Currency,
		Provenance: e.Provenance, SourceRefs: e.SourceRefs, AsOf: e.AsOf, Note: e.Detail,
	}
}

func eventAmount(events []contracts.FinancialEvent, id string) int64 {
	e, _ := findEvent(events, id)
	return e.AmountCents
}

func mustEvent(events []contracts.FinancialEvent, id string) contracts.FinancialEvent {
	e, _ := findEvent(events, id)
	return e
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
