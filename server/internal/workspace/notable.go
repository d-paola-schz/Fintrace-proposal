package workspace

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/data"
	"github.com/preflight/preflight/server/internal/finance"
)

// Rule 3 — notable weeks: a recorded week whose item revenue moved sharply
// against the week before earns a chain of its own.
//
// Only three kinds of week qualify, each one a fact about the recorded rows:
// the peak week, the sharpest rise and the sharpest fall. A history that never
// moves by notableMovePct produces no chains at all, rather than promoting its
// least boring week. Every figure comes from the seller's daily sales; nothing
// here says why a week moved, because the records do not say.
const (
	RuleNotableWeek = "rule-notable-week"

	// notableMovePct is the smallest week-on-week change in item revenue, in
	// either direction, that makes a week worth a chain.
	notableMovePct = 40.0
)

// recordedWeek is one seven-day block of the seller's daily sales, on the same
// boundaries as the weekly markers on the timeline.
type recordedWeek struct {
	eventID string // empty when the week sold nothing, so it has no marker
	date    string // week end, redrawn onto today's calendar
	srcEnd  string // week end as recorded
	revenue int64  // BRL cents
	items   int
	orders  int
	// complete says every one of the seven days is inside the published daily
	// range. A week reaching past it would compare against missing days.
	complete bool
}

func (b *Builder) recordedWeeks(n int) []recordedWeek {
	byDate := map[string]data.DailySale{}
	for _, d := range b.Store.Olist.DailySales {
		byDate[d.Date] = d
	}
	srcEnd, err := finance.ParseDate(b.Store.Olist.Window.End)
	if err != nil {
		return nil
	}
	out := make([]recordedWeek, 0, n)
	for w := 0; w < n; w++ {
		weekEnd := srcEnd.AddDate(0, 0, -7*w)
		wk := recordedWeek{srcEnd: weekEnd.Format(finance.DateLayout), complete: true}
		for i := 0; i < 7; i++ {
			d, ok := byDate[weekEnd.AddDate(0, 0, -i).Format(finance.DateLayout)]
			if !ok {
				wk.complete = false
				continue
			}
			wk.revenue += d.ItemRevenueCents
			wk.items += d.ItemCount
			wk.orders += d.OrderCount
		}
		wk.date = b.shift(wk.srcEnd)
		if wk.items > 0 {
			wk.eventID = "evt-sales-" + wk.date // the same id salesEvents gives it
		}
		out = append(out, wk)
	}
	return out
}

type notableWeek struct {
	role  string // peak | rise | fall
	week  recordedWeek
	prior recordedWeek
	pct   float64
}

// notableWeeks picks at most one peak, one rise and one fall among the weeks
// already behind today, in date order.
func (b *Builder) notableWeeks() []notableWeek {
	// One week more than the timeline shows, so the oldest week drawn still has
	// a week before it to be compared with.
	weeks := b.recordedWeeks(salesWeeks + 1)
	today := b.offset(0)

	type cand struct {
		i   int
		pct float64
	}
	var cands []cand
	peak := -1
	for i := 0; i < salesWeeks && i+1 < len(weeks); i++ {
		w, p := weeks[i], weeks[i+1]
		if w.eventID == "" {
			continue
		}
		if peak < 0 || w.revenue > weeks[peak].revenue {
			peak = i
		}
		// Only what has already happened, and only against a whole week.
		if w.date >= today || !w.complete || !p.complete || p.revenue <= 0 {
			continue
		}
		cands = append(cands, cand{i, float64(w.revenue-p.revenue) / float64(p.revenue) * 100})
	}

	picked := map[int]string{}
	pctOf := map[int]float64{}
	for _, c := range cands {
		pctOf[c.i] = c.pct
	}
	// The peak must be the highest week of everything shown, not just of the
	// candidates, or "peak week" would be a false title.
	if pct, ok := pctOf[peak]; ok && pct >= notableMovePct {
		picked[peak] = "peak"
	}
	rise, fall := -1, -1
	for _, c := range cands {
		if _, taken := picked[c.i]; taken {
			continue
		}
		if c.pct >= notableMovePct && (rise < 0 || c.pct > pctOf[rise]) {
			rise = c.i
		}
		if c.pct <= -notableMovePct && (fall < 0 || c.pct < pctOf[fall]) {
			fall = c.i
		}
	}
	if rise >= 0 {
		picked[rise] = "rise"
	}
	if fall >= 0 {
		picked[fall] = "fall"
	}

	out := make([]notableWeek, 0, len(picked))
	for i, role := range picked {
		out = append(out, notableWeek{role: role, week: weeks[i], prior: weeks[i+1], pct: pctOf[i]})
	}
	sort.Slice(out, func(a, c int) bool { return out[a].week.date < out[c].week.date })
	return out
}

// notableChains builds one chain per notable week and decides which side of
// the rail each hangs from.
//
// Sides are chosen so chains on the same side sit as far apart as possible,
// because each closed chain is a tag roughly six days wide on the timeline.
// Only roots that never move are weighed — these weeks and the sales chain's
// week — so a what-if that shifts the payout can never flip a past week's side
// and make its chain look changed.
func (b *Builder) notableChains(events []contracts.FinancialEvent, salesRoot string) []contracts.Chain {
	weeks := b.notableWeeks()
	if len(weeks) == 0 {
		return nil
	}

	sides := make([]string, len(weeks))
	bestScore, bestBelow := math.Inf(-1), -1
	for mask := 0; mask < 1<<len(weeks); mask++ {
		above := map[string][]string{"above": {}, "below": {}}
		if salesRoot != "" {
			above["above"] = append(above["above"], salesRoot)
		}
		below := 0
		trial := make([]string, len(weeks))
		for i, w := range weeks {
			side := "below"
			if mask&(1<<i) != 0 {
				side = "above"
			} else {
				below++
			}
			trial[i] = side
			above[side] = append(above[side], w.week.date)
		}
		score := math.Inf(1)
		for _, dates := range above {
			sort.Strings(dates)
			for i := 1; i < len(dates); i++ {
				if gap := float64(daysApart(dates[i-1], dates[i])); gap < score {
					score = gap
				}
			}
		}
		// The wider gap wins; on a tie, prefer hanging below, where the past
		// side of the rail is otherwise empty.
		if score > bestScore || (score == bestScore && below > bestBelow) {
			bestScore, bestBelow = score, below
			copy(sides, trial)
		}
	}

	out := make([]contracts.Chain, 0, len(weeks))
	for i, w := range weeks {
		out = append(out, b.notableWeekChain(w, sides[i], events))
	}
	return out
}

func daysApart(a, c string) int {
	da, errA := finance.ParseDate(a)
	dc, errC := finance.ParseDate(c)
	if errA != nil || errC != nil {
		return 0
	}
	return int(math.Abs(math.Round(finance.Day(dc).Sub(finance.Day(da)).Hours() / 24)))
}

// dayRefs keeps an event's citations to individual recorded days.
func dayRefs(events []contracts.FinancialEvent, id string) []string {
	refs := []string{"src-olist-seller"}
	if e, ok := findEvent(events, id); ok {
		for _, r := range e.SourceRefs {
			if strings.HasPrefix(r, "src-olist-day-") {
				refs = append(refs, r)
			}
		}
	}
	return refs
}

func (b *Builder) notableWeekChain(nw notableWeek, side string, events []contracts.FinancialEvent) contracts.Chain {
	w, p := nw.week, nw.prior
	id := "chain-week-" + w.date
	title := map[string]string{"peak": "Peak week", "rise": "Sharpest rise", "fall": "Sharpest fall"}[nw.role]
	both := presentEvents(events, w.eventID, p.eventID)
	weekRefs := dayRefs(events, w.eventID)
	priorRefs := dayRefs(events, p.eventID)
	avg := func(x recordedWeek) int64 { return x.revenue / int64(max(1, x.items)) }
	change := func(now, before float64) float64 {
		if before == 0 {
			return 0
		}
		return (now - before) / before * 100
	}

	chain := contracts.Chain{
		ID: id, RootEventID: w.eventID, Direction: side,
		Title: title, RuleID: RuleNotableWeek,
	}

	// ---- 01: what the records show. A rise reads as an opening; a sharp fall
	// reads as risk in the sense the tones use it — worth attention. Neither
	// says anything about cash, which this chain never claims to know.
	tone1 := contracts.ToneOpportunity
	verb := "up"
	if nw.pct < 0 {
		tone1, verb = contracts.ToneRisk, "down"
	}
	peakNote := ""
	if nw.role == "peak" {
		peakNote = fmt.Sprintf(" It is the highest weekly total of the %d recorded weeks on this timeline.", salesWeeks)
	}
	n1 := contracts.ChainNode{
		ID: "node-week-" + w.date + "-1", ChainID: id, RootEventID: w.eventID, Sequence: 1,
		Title:  fmt.Sprintf("Revenue %s %.0f%% on the week before", verb, math.Abs(nw.pct)),
		Tone:   tone1,
		Status: contracts.StatusObserved,
		RuleID: RuleNotableWeek,
		Summary: fmt.Sprintf("%s against %s",
			finance.FormatBRL(w.revenue), finance.FormatBRL(p.revenue)),
		Explanation: fmt.Sprintf(
			"In the seven days to %s this seller's recorded item revenue was %s, against %s in the seven days before — a change of %+.1f%%.%s These are the seller's own order-item rows, recorded in the week ending %s, with cancelled and unavailable orders excluded, and redrawn onto today's calendar.",
			finance.HumanDate(w.date), finance.FormatBRL(w.revenue), finance.FormatBRL(p.revenue),
			nw.pct, peakNote, finance.HumanDate(w.srcEnd)),
		SourceRefs:     weekRefs,
		AssumptionRefs: []string{"asm-timeshift"},
		Claims: []contracts.Claim{
			{
				ID: id + "-revenue", Label: "Item revenue that week",
				Display: finance.FormatBRL(w.revenue), AmountCents: ptr(w.revenue), Currency: "BRL",
				Provenance: contracts.ProvOlistHistorical, SourceRefs: weekRefs, AsOf: w.srcEnd,
				Note: b.convertedNote(w.revenue),
			},
			{
				ID: id + "-prior", Label: "Item revenue the week before",
				Display: finance.FormatBRL(p.revenue), AmountCents: ptr(p.revenue), Currency: "BRL",
				Provenance: contracts.ProvOlistHistorical, SourceRefs: priorRefs, AsOf: p.srcEnd,
				Note: b.convertedNote(p.revenue),
			},
			{
				ID: id + "-change", Label: "Change on the week before",
				Display: fmt.Sprintf("%+.1f%%", nw.pct), Provenance: contracts.ProvDerived,
				SourceRefs: weekRefs,
				Note:       "Both are whole seven-day weeks of this seller's own items.",
			},
		},
		Chart:             b.salesChart(),
		ResponseOptions:   []contracts.ResponseOption{},
		SuggestedAsks:     []string{"Is this growth or just price?", "What did the week before look like?"},
		HighlightEventIDs: both,
	}

	// ---- 02: which part moved — the number of orders, or the price of items.
	// "Moved more" is a comparison of two recorded changes, not a cause.
	ordersPct := change(float64(w.orders), float64(p.orders))
	pricePct := change(float64(avg(w)), float64(avg(p)))
	title2, driver := "Mostly the number of orders", "the number of orders moved more than the average item price"
	if math.Abs(pricePct) > math.Abs(ordersPct) {
		title2, driver = "Mostly the price of items", "the average item price moved more than the number of orders"
	}
	n2 := contracts.ChainNode{
		ID: "node-week-" + w.date + "-2", ChainID: id, RootEventID: w.eventID, Sequence: 2,
		Title:  title2,
		Tone:   contracts.ToneReview,
		Status: contracts.StatusInferred,
		RuleID: RuleNotableWeek,
		Summary: fmt.Sprintf("%d orders against %d, %s against %s per item",
			w.orders, p.orders, finance.FormatBRL(avg(w)), finance.FormatBRL(avg(p))),
		Explanation: fmt.Sprintf(
			"Orders went from %d to %d (%+.1f%%), and the average item price went from %s to %s (%+.1f%%). Of the two, %s. That describes what changed in the records; it does not say why, because nothing in them records the reason.",
			p.orders, w.orders, ordersPct, finance.FormatBRL(avg(p)), finance.FormatBRL(avg(w)), pricePct, driver),
		SourceRefs:     weekRefs,
		AssumptionRefs: []string{},
		Claims: []contracts.Claim{
			{
				ID: id + "-orders", Label: "Orders that week, and the week before",
				Display:    fmt.Sprintf("%d and %d", w.orders, p.orders),
				Provenance: contracts.ProvOlistHistorical, SourceRefs: weekRefs, AsOf: w.srcEnd,
			},
			{
				ID: id + "-avg", Label: "Average item price that week",
				Display: finance.FormatBRL(avg(w)), AmountCents: ptr(avg(w)), Currency: "BRL",
				Provenance: contracts.ProvDerived, SourceRefs: weekRefs,
				Note: fmt.Sprintf("Item revenue divided by %d items. The week before: %s over %d items.",
					w.items, finance.FormatBRL(avg(p)), p.items),
			},
		},
		ResponseOptions:   []contracts.ResponseOption{},
		SuggestedAsks:     []string{"Which products sold that week?"},
		HighlightEventIDs: both,
	}

	// ---- 03: what the week cannot tell you. It points at no day, because the
	// missing numbers are not on any day of this timeline.
	n3 := contracts.ChainNode{
		ID: "node-week-" + w.date + "-3", ChainID: id, RootEventID: w.eventID, Sequence: 3,
		Title:          "What this week cannot tell you",
		Tone:           contracts.ToneReview,
		Status:         contracts.StatusPossible,
		RuleID:         RuleNotableWeek,
		Summary:        "No cash, margin or product breakdown",
		Explanation:    "None of this is cash in the account: marketplace sales are paid out later, and no payout ledger is published, so what this week added to the bank is not recorded. The records hold no cost of goods, so no margin can be given. Products are only published for the 30-day window, so this week cannot be broken down by product. Anything read into the move beyond revenue, orders and price would be a guess.",
		SourceRefs:     []string{"src-olist-seller"},
		AssumptionRefs: []string{},
		Claims: []contracts.Claim{
			{
				ID: id + "-cash", Label: "Cash from this week that reached the account",
				Display: "Not in the connected records", Provenance: contracts.ProvDerived,
				SourceRefs: []string{},
				Note:       "Olist publishes no payout ledger, and sales are not bank deposits.",
			},
			{
				ID: id + "-margin", Label: "Margin that week",
				Display: "Not in the connected records", Provenance: contracts.ProvDerived,
				SourceRefs: []string{},
				Note:       "Margin needs a recorded unit cost. Olist publishes sale prices only.",
			},
		},
		ResponseOptions:   []contracts.ResponseOption{},
		SuggestedAsks:     []string{"What is my margin on that week?"},
		HighlightEventIDs: []string{},
	}

	chain.Nodes = []contracts.ChainNode{n1, n2, n3}
	chain.Segments = []contracts.ChainSegment{
		{FromSequence: 0, ToSequence: 1, Tone: tone1, Label: "recorded"},
		{FromSequence: 1, ToSequence: 2, Tone: contracts.ToneReview, Label: "made of"},
		{FromSequence: 2, ToSequence: 3, Tone: contracts.ToneReview, Label: "but"},
	}
	return chain
}
