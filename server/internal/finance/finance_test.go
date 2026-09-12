package finance

import (
	"strings"
	"testing"
	"time"

	"github.com/preflight/preflight/server/internal/contracts"
)

func mustDate(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := ParseDate(s)
	if err != nil {
		t.Fatalf("ParseDate(%q): %v", s, err)
	}
	return d
}

func ev(id, date string, cents int64, kind string) contracts.FinancialEvent {
	return contracts.FinancialEvent{
		ID: id, Date: date, AmountCents: cents, Kind: kind,
		Currency: "USD", Label: id, AffectsCash: true,
	}
}

func baseInput(t *testing.T, events ...contracts.FinancialEvent) Input {
	t.Helper()
	return Input{
		BaselineCents: 1_000_00,
		Currency:      "USD",
		StartDate:     mustDate(t, "2026-09-12"),
		HorizonDays:   10,
		ReserveCents:  500_00,
		Events:        events,
	}
}

// The reserve is a floor, not a trigger: landing exactly on it is safe and one
// cent under is not. This boundary decides the demo's central claim.
func TestReserveBoundaryExactlyEqualIsNotABreach(t *testing.T) {
	in := baseInput(t, ev("e1", "2026-09-14", -500_00, "bill"))
	r := Project(in)
	if r.LowestCents != 500_00 {
		t.Fatalf("lowest = %d, want 50000", r.LowestCents)
	}
	if r.BreachesReserve {
		t.Fatalf("balance exactly equal to the reserve must not breach")
	}
	if r.HeadroomCents != 0 {
		t.Fatalf("headroom = %d, want 0", r.HeadroomCents)
	}
}

func TestReserveBoundaryOneCentUnderBreaches(t *testing.T) {
	in := baseInput(t, ev("e1", "2026-09-14", -500_01, "bill"))
	r := Project(in)
	if !r.BreachesReserve {
		t.Fatalf("one cent below the reserve must breach")
	}
	if r.FirstBreachDate != "2026-09-14" {
		t.Fatalf("first breach = %q, want 2026-09-14", r.FirstBreachDate)
	}
	if r.HeadroomCents != -1 {
		t.Fatalf("headroom = %d, want -1", r.HeadroomCents)
	}
}

// The opening balance already contains every past transaction. Re-applying one
// would inflate cash and is the most damaging error the engine could make.
func TestEventsBeforeWindowAreNeverApplied(t *testing.T) {
	in := baseInput(t,
		ev("past-deposit", "2026-09-01", 5_000_00, "payout"),
		ev("past-bill", "2026-09-11", -900_00, "bill"),
		ev("future", "2026-09-15", -100_00, "bill"),
	)
	r := Project(in)
	if got := r.Days[len(r.Days)-1].ClosingCents; got != 900_00 {
		t.Fatalf("closing = %d, want 90000 (baseline 100000 minus only the future 10000)", got)
	}
	if len(r.AppliedEvents) != 1 || r.AppliedEvents[0].ID != "future" {
		t.Fatalf("applied = %+v, want only the in-window event", r.AppliedEvents)
	}
}

func TestEventsAfterHorizonAreNotApplied(t *testing.T) {
	in := baseInput(t, ev("far", "2026-09-30", -900_00, "bill"))
	r := Project(in)
	if r.LowestCents != 1_000_00 {
		t.Fatalf("lowest = %d, want unchanged baseline", r.LowestCents)
	}
	if len(r.AppliedEvents) != 0 {
		t.Fatalf("applied = %+v, want none", r.AppliedEvents)
	}
}

func TestLowestBalanceAndDateAreTheTightestDay(t *testing.T) {
	in := baseInput(t,
		ev("a", "2026-09-13", -600_00, "bill"),
		ev("b", "2026-09-16", 400_00, "payout"),
		ev("c", "2026-09-18", -200_00, "bill"),
	)
	r := Project(in)
	// 1000 -> 400 (13th, lowest) -> 800 (16th) -> 600 (18th)
	if r.LowestCents != 400_00 || r.LowestDate != "2026-09-13" {
		t.Fatalf("lowest = %d on %s, want 40000 on 2026-09-13", r.LowestCents, r.LowestDate)
	}
	if !r.BreachesReserve {
		t.Fatalf("400.00 is below the 500.00 reserve and must breach")
	}
}

func TestDayRowsBalanceOpeningPlusFlowsEqualsClosing(t *testing.T) {
	in := baseInput(t,
		ev("in", "2026-09-14", 250_00, "payout"),
		ev("out", "2026-09-14", -125_00, "bill"),
	)
	r := Project(in)
	for _, d := range r.Days {
		if d.OpeningCents+d.InflowCents-d.OutflowCents != d.ClosingCents {
			t.Fatalf("%s: %d + %d - %d != %d", d.Date, d.OpeningCents, d.InflowCents, d.OutflowCents, d.ClosingCents)
		}
	}
	day := r.Days[2]
	if day.InflowCents != 250_00 || day.OutflowCents != 125_00 || len(day.EventIDs) != 2 {
		t.Fatalf("same-day netting wrong: %+v", day)
	}
}

// A delayed payout that slips past a bill is the demo's core risk mechanic.
func TestShiftPayoutsMovesOnlyPayoutEvents(t *testing.T) {
	events := []contracts.FinancialEvent{
		ev("payout", "2026-09-20", 400_00, "payout"),
		ev("bill", "2026-09-20", -400_00, "bill"),
	}
	got := ShiftPayouts(events, 3)
	if got[0].Date != "2026-09-23" {
		t.Fatalf("payout date = %s, want 2026-09-23", got[0].Date)
	}
	if got[1].Date != "2026-09-20" {
		t.Fatalf("bill must not move, got %s", got[1].Date)
	}
	if got[0].Certainty != contracts.CertaintyConditional {
		t.Fatalf("a shifted payout must be marked conditional, got %q", got[0].Certainty)
	}
	if events[0].Date != "2026-09-20" {
		t.Fatalf("ShiftPayouts must not mutate its input")
	}
}

func TestFindFirstBreachingDelayIsTheEarliestDelayThatBreaches(t *testing.T) {
	// Baseline 1000; payout +600 on the 15th; bill -900 on the 18th.
	// Reserve 500. Undelayed: 1000 -> 1600 -> 700, safe.
	// The payout must land on or before the 18th to keep cash at 700.
	// Delay 3 puts it on the 18th (same day, still safe: 1000-900+600=700).
	// Delay 4 puts it on the 19th: the 18th closes at 100, a breach.
	in := baseInput(t,
		ev("payout", "2026-09-15", 600_00, "payout"),
		ev("bill", "2026-09-18", -900_00, "bill"),
	)
	base := Project(in)
	if base.BreachesReserve {
		t.Fatalf("undelayed case must be safe, lowest %d", base.LowestCents)
	}
	bp := FindFirstBreachingDelay(in, 10)
	if !bp.Found {
		t.Fatalf("expected a breaching delay within 10 days: %s", bp.Explanation)
	}
	if bp.DelayDays != 4 {
		t.Fatalf("first breaching delay = %d, want 4", bp.DelayDays)
	}
	if bp.BreachDate != "2026-09-18" {
		t.Fatalf("breach date = %s, want 2026-09-18", bp.BreachDate)
	}
}

func TestFindFirstBreachingDelayReportsWhenNoneBreaches(t *testing.T) {
	in := baseInput(t, ev("payout", "2026-09-15", 600_00, "payout"))
	bp := FindFirstBreachingDelay(in, 7)
	if bp.Found {
		t.Fatalf("no bill exists, so no delay can breach; got delay %d", bp.DelayDays)
	}
	if bp.TestedUpToDays != 7 {
		t.Fatalf("testedUpTo = %d, want 7", bp.TestedUpToDays)
	}
}

func TestProposalEventIsAlwaysAnOutflowAndNeverScheduled(t *testing.T) {
	e := ProposalEvent(contracts.ProposedDecision{
		Description: "Ad campaign", Date: "2026-09-16", AmountCents: 300_00,
	}, "USD")
	if e.AmountCents != -300_00 {
		t.Fatalf("proposal amount = %d, want -30000", e.AmountCents)
	}
	if e.Certainty != contracts.CertaintyConditional {
		t.Fatalf("a proposal is conditional, got %q", e.Certainty)
	}
	if e.Provenance != contracts.ProvUserEntered {
		t.Fatalf("provenance = %q, want user_entered", e.Provenance)
	}
}

func TestAlternativesAreEvaluatedAgainstTheSameReserve(t *testing.T) {
	p := contracts.ProposedDecision{Description: "Ads", Date: "2026-09-14", AmountCents: 600_00}
	in := baseInput(t, ProposalEvent(p, "USD"))
	base := Project(in)
	if !base.BreachesReserve {
		t.Fatalf("setup: the full spend should breach, lowest %d", base.LowestCents)
	}
	alts := BuildAlternatives(in, p, time.Time{})
	if len(alts) != 2 {
		t.Fatalf("want a delay and a reduce alternative, got %d", len(alts))
	}
	var reduce *contracts.Alternative
	for i := range alts {
		if alts[i].Kind == "reduce" {
			reduce = &alts[i]
		}
	}
	if reduce == nil {
		t.Fatalf("no reduce alternative")
	}
	if reduce.Proposal.AmountCents != 300_00 {
		t.Fatalf("reduced amount = %d, want 30000", reduce.Proposal.AmountCents)
	}
	if reduce.BreachesReserve {
		t.Fatalf("halving 600 to 300 leaves 700, above the 500 reserve")
	}
	if reduce.HeadroomCents != 200_00 {
		t.Fatalf("headroom = %d, want 20000", reduce.HeadroomCents)
	}
}

func TestVerdictNeverEndorsesTheSpend(t *testing.T) {
	in := baseInput(t)
	r := Project(in)
	v, caveats := Verdict(r, true)
	if v == "" {
		t.Fatalf("empty verdict")
	}
	if len(caveats) == 0 {
		t.Fatalf("the affordability-is-not-ROI caveat must always be present")
	}
}

func TestFormatUSDUsesIntegerCents(t *testing.T) {
	cases := map[int64]string{
		0: "$0.00", 5: "$0.05", 100: "$1.00", 123456: "$1,234.56",
		-99: "-$0.99", 1000000000: "$10,000,000.00",
	}
	for cents, want := range cases {
		if got := FormatUSD(cents); got != want {
			t.Errorf("FormatUSD(%d) = %s, want %s", cents, got, want)
		}
	}
}

func TestProjectIsDeterministic(t *testing.T) {
	in := baseInput(t,
		ev("b", "2026-09-14", -100_00, "bill"),
		ev("a", "2026-09-14", 50_00, "payout"),
	)
	first := Project(in)
	for i := 0; i < 20; i++ {
		again := Project(in)
		if again.LowestCents != first.LowestCents || again.LowestDate != first.LowestDate {
			t.Fatalf("projection is not deterministic across runs")
		}
		if again.Days[2].EventIDs[0] != first.Days[2].EventIDs[0] {
			t.Fatalf("same-day event ordering is not stable")
		}
	}
}

// Sales are revenue, not cash. An order-item sale must never move the bank
// balance, however prominently it appears on the timeline.
func TestSalesEventsNeverMoveTheBalance(t *testing.T) {
	sale := ev("sales-week", "2026-09-14", 9_999_00, "sales")
	sale.AffectsCash = false
	bill := ev("bill", "2026-09-15", -100_00, "bill")
	bill.AffectsCash = true

	in := baseInput(t, sale, bill)
	r := Project(in)
	if got := r.Days[len(r.Days)-1].ClosingCents; got != 900_00 {
		t.Fatalf("closing = %d, want 90000: the sale must not add cash", got)
	}
	for _, d := range r.Days {
		for _, id := range d.EventIDs {
			if id == "sales-week" {
				t.Fatalf("a non-cash sales event was applied to the projection")
			}
		}
	}
}

// If the plan already breaches with the payout on time, the delay is not the
// cause and the engine must not blame it.
func TestDelayBreakpointReportsAnAlreadyBreachingBaseline(t *testing.T) {
	in := baseInput(t,
		ev("payout", "2026-09-20", 600_00, "payout"),
		ev("spend", "2026-09-13", -700_00, "proposal"),
	)
	bp := FindFirstBreachingDelay(in, 10)
	if !bp.Found || bp.DelayDays != 0 {
		t.Fatalf("want a delay-0 breakpoint, got found=%v delay=%d", bp.Found, bp.DelayDays)
	}
	if bp.BreachDate != "2026-09-13" {
		t.Fatalf("breach date = %s, want 2026-09-13", bp.BreachDate)
	}
	if !strings.Contains(bp.Explanation, "not what breaks this plan") {
		t.Fatalf("explanation must say the delay is not the cause: %q", bp.Explanation)
	}
}
