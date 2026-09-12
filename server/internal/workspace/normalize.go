// Package workspace turns prepared sources into the typed events, assumptions
// and source records the UI renders. It is the only place where historical
// Olist records are redrawn onto the current calendar, and it labels every
// figure it produces.
package workspace

import (
	"fmt"
	"time"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/data"
	"github.com/preflight/preflight/server/internal/finance"
)

// Minimum display window around today, in days. The rendered window always
// grows to contain every event, so a payout pushed to the end of the delay
// range can never fall off the edge of the timeline.
const (
	pastDays   = 21
	futureDays = 14
	// edgePadDays keeps an event off the very rim of the canvas.
	edgePadDays = 2
)

// Builder assembles a workspace for a given "today".
type Builder struct {
	Store  *data.Store
	Nessie *data.NessieSnapshot
	Today  time.Time
	// Overrides are the owner's own figures, replacing the demo's constants.
	Overrides *contracts.AssumptionOverrides
}

// --- owner-supplied figures -------------------------------------------------
//
// Each accessor returns the owner's value when they have given one, otherwise
// the modelled default, together with the provenance the resulting figure
// should carry. A number the owner typed is theirs, and the badge says so.

func (b *Builder) feePct() (float64, string) {
	if b.Overrides != nil && b.Overrides.MarketplaceFeePct != nil {
		return *b.Overrides.MarketplaceFeePct, contracts.ProvUserEntered
	}
	return b.Store.Assume.MarketplaceFee.RatePct, contracts.ProvDemoAssumption
}

func (b *Builder) fxRate() (float64, string) {
	if b.Overrides != nil && b.Overrides.BRLPerUSD != nil {
		return *b.Overrides.BRLPerUSD, contracts.ProvUserEntered
	}
	return b.Store.Assume.FX.BRLPerUSD, contracts.ProvDemoAssumption
}

func (b *Builder) balanceCents() (int64, string) {
	if b.Overrides != nil && b.Overrides.OpeningBalanceCents != nil {
		return *b.Overrides.OpeningBalanceCents, contracts.ProvUserEntered
	}
	return b.Nessie.BalanceCents, provenanceOfBaseline(b.Nessie)
}

// outflowOverride returns the owner's replacement for one modelled payment.
func (b *Builder) outflowOverride(id string) (contracts.OutflowOverride, bool) {
	if b.Overrides == nil {
		return contracts.OutflowOverride{}, false
	}
	o, ok := b.Overrides.Outflows[id]
	return o, ok
}

// shiftDays is how far the recorded Olist window is moved to reach today.
func (b *Builder) shiftDays() int {
	end, err := finance.ParseDate(b.Store.Olist.Window.End)
	if err != nil {
		return 0
	}
	return int(finance.Day(b.Today).Sub(finance.Day(end)).Hours() / 24)
}

func (b *Builder) shift(date string) string {
	d, err := finance.ParseDate(date)
	if err != nil {
		return date
	}
	return d.AddDate(0, 0, b.shiftDays()).Format(finance.DateLayout)
}

func (b *Builder) offset(days int) string {
	return finance.Day(b.Today).AddDate(0, 0, days).Format(finance.DateLayout)
}

func (b *Builder) usd(brlCents int64) int64 {
	rate, _ := b.fxRate()
	return int64(float64(brlCents)/rate + 0.5)
}

// convertedNote renders the disclosure that must accompany every converted figure.
func (b *Builder) convertedNote(brlCents int64) string {
	rate, prov := b.fxRate()
	source := "the demo rate"
	if prov == contracts.ProvUserEntered {
		source = "the rate you entered"
	}
	return fmt.Sprintf("Recorded as %s. Shown as %s using %s of R$%.2f = US$1.00, which is not a market rate for any date.",
		finance.FormatBRL(brlCents), finance.FormatUSD(b.usd(brlCents)), source, rate)
}

// Events returns every timeline event: recorded seller sales redrawn onto the
// current calendar, recorded sandbox bank activity, the opening balance marker,
// and the modeled future cash events.
func (b *Builder) Events() []contracts.FinancialEvent {
	var out []contracts.FinancialEvent
	out = append(out, b.salesEvents()...)
	out = append(out, b.bankEvents()...)
	out = append(out, b.balanceMarker())
	out = append(out, b.futureEvents()...)
	return out
}

// salesEvents rolls the seller's recorded daily item sales into weekly markers.
// They are revenue, never cash: AffectsCash stays false.
func (b *Builder) salesEvents() []contracts.FinancialEvent {
	byDate := map[string]data.DailySale{}
	for _, d := range b.Store.Olist.DailySales {
		byDate[d.Date] = d
	}
	srcEnd, err := finance.ParseDate(b.Store.Olist.Window.End)
	if err != nil {
		return nil
	}

	var out []contracts.FinancialEvent
	// Four complete weeks ending on the last recorded day.
	for w := 0; w < 4; w++ {
		weekEnd := srcEnd.AddDate(0, 0, -7*w)
		var brl int64
		var items, orders int
		var refs []string
		for i := 0; i < 7; i++ {
			day := weekEnd.AddDate(0, 0, -i).Format(finance.DateLayout)
			d, ok := byDate[day]
			if !ok {
				continue
			}
			brl += d.ItemRevenueCents
			items += d.ItemCount
			orders += d.OrderCount
			if len(refs) < 4 && len(d.OrderIDs) > 0 {
				refs = append(refs, "src-olist-day-"+day)
			}
		}
		if items == 0 {
			continue
		}
		shifted := b.shift(weekEnd.Format(finance.DateLayout))
		id := "evt-sales-" + shifted
		refs = append([]string{"src-olist-seller", "src-olist-window"}, refs...)
		out = append(out, contracts.FinancialEvent{
			ID:          id,
			Date:        shifted,
			Label:       "Item sales",
			Kind:        "sales",
			AmountCents: b.usd(brl),
			Currency:    b.Store.Assume.DisplayCurrency,
			Provenance:  contracts.ProvOlistHistorical,
			Certainty:   contracts.CertaintyRecorded,
			SourceRefs:  refs,
			AsOf:        b.Store.Olist.Window.End,
			AffectsCash: false,
			Detail: fmt.Sprintf(
				"%d items across %d orders in the seven days to %s (recorded %s). Marketplace sales, not bank cash: none of this has reached the account.",
				items, orders, finance.HumanDate(shifted), weekEnd.Format("Jan 2, 2006")),
			Claims: []contracts.Claim{
				{
					ID: id + "-revenue", Label: "Item sales in the week",
					Display: finance.FormatUSD(b.usd(brl)), AmountCents: ptr(b.usd(brl)),
					Currency: "USD", Provenance: contracts.ProvOlistHistorical,
					SourceRefs: []string{"src-olist-seller", "src-fx"},
					AsOf:       b.Store.Olist.Window.End, Note: b.convertedNote(brl),
				},
				{
					ID: id + "-items", Label: "Items sold",
					Display:    fmt.Sprintf("%d items / %d orders", items, orders),
					Provenance: contracts.ProvOlistHistorical,
					SourceRefs: refs, AsOf: b.Store.Olist.Window.End,
					Note: "Counted from this seller's own order_items rows only. An Olist order can contain other sellers' items, which are excluded.",
				},
			},
		})
	}
	return out
}

// bankEvents renders recorded sandbox transactions. They sit before today and
// are therefore already inside the opening balance; the projection window
// excludes them so they can never be counted twice.
func (b *Builder) bankEvents() []contracts.FinancialEvent {
	if b.Nessie == nil || b.Nessie.Source != "live" {
		return nil
	}
	var out []contracts.FinancialEvent
	add := func(t data.NessieTxn, sign int64, label string) {
		date := t.TransactionDate
		if len(date) >= 10 {
			date = date[:10]
		}
		if _, err := finance.ParseDate(date); err != nil {
			return
		}
		amt := sign * int64(t.Amount*100+0.5)
		out = append(out, contracts.FinancialEvent{
			ID: "evt-bank-" + t.ID, Date: date, Label: label, Kind: "bank",
			AmountCents: amt, Currency: "USD",
			Provenance: contracts.ProvNessieSandbox, Certainty: contracts.CertaintyRecorded,
			SourceRefs: []string{"src-nessie-txn-" + t.ID}, AsOf: b.Nessie.AsOf,
			AffectsCash: true,
			Detail:      "Recorded in the Nessie sandbox account. Mock banking data, unrelated to the Olist orders shown on this timeline.",
		})
	}
	for _, d := range b.Nessie.Deposits {
		add(d, 1, "Sandbox deposit")
	}
	for _, w := range b.Nessie.Withdrawals {
		add(w, -1, "Sandbox withdrawal")
	}
	return out
}

func (b *Builder) balanceMarker() contracts.FinancialEvent {
	bal, prov := b.balanceCents()
	note := "Read from the Nessie sandbox account."
	if prov == contracts.ProvUserEntered {
		note = "You entered this opening balance, replacing the figure the app would otherwise use."
	} else if b.Nessie.Source != "live" {
		note = b.Nessie.Detail
	}
	return contracts.FinancialEvent{
		ID: "evt-today", Date: b.offset(0), Label: "Cash on hand", Kind: "balance",
		AmountCents: bal, Currency: "USD", Provenance: prov,
		Certainty: contracts.CertaintyRecorded, SourceRefs: []string{"src-nessie-account"},
		AsOf: b.Nessie.AsOf, AffectsCash: false,
		Detail: "The starting point for every projection. " + note +
			" Past transactions are already inside this figure and are never added to it again.",
		Claims: []contracts.Claim{{
			ID: "claim-balance", Label: "Cash on hand today",
			Display: finance.FormatUSD(bal), AmountCents: ptr(bal), Currency: "USD",
			Provenance: prov, SourceRefs: []string{"src-nessie-account"},
			AsOf: b.Nessie.AsOf, Note: note,
		}},
	}
}

// PayoutAmountCents is the modeled payout: this seller's own recorded item
// revenue for the window, less a modeled marketplace commission, converted at
// the demo rate. Every step of that is an assumption except the revenue.
func (b *Builder) PayoutAmountCents() int64 {
	brl := b.Store.Olist.Window.ItemRevenueCents
	fee, _ := b.feePct()
	net := int64(float64(brl) * (100 - fee) / 100)
	return b.usd(net)
}

func (b *Builder) futureEvents() []contracts.FinancialEvent {
	var out []contracts.FinancialEvent
	a := b.Store.Assume

	for _, o := range a.ScheduledOutflows {
		ov, edited := b.outflowOverride(o.ID)
		if ov.Removed {
			continue
		}
		amount, date := o.AmountCents, b.offset(o.OffsetDays)
		prov, detail := contracts.ProvDemoAssumption, o.Detail
		if ov.AmountCents != nil {
			amount = *ov.AmountCents
		}
		if ov.Date != nil {
			date = *ov.Date
		}
		if edited && (ov.AmountCents != nil || ov.Date != nil) {
			prov = contracts.ProvUserEntered
			detail = "You entered this payment, replacing the figure the demo would otherwise assume."
		}
		kind := "bill"
		switch o.ID {
		case "asm-supplier":
			kind = "supplier_payment"
		case "asm-ads":
			kind = "ad_spend"
		}
		out = append(out, contracts.FinancialEvent{
			ID: "evt-" + o.ID, Date: date, Label: o.Label, Kind: kind,
			AmountCents: amount, Currency: o.Currency,
			Provenance: prov, Certainty: contracts.CertaintyScheduled,
			SourceRefs: []string{o.ID}, AsOf: b.offset(0), AffectsCash: true,
			Detail: detail,
			Claims: []contracts.Claim{{
				ID: "claim-" + o.ID, Label: o.Label,
				Display: finance.FormatUSD(amount), AmountCents: ptr(amount),
				Currency: "USD", Provenance: prov,
				SourceRefs: []string{o.ID}, Note: detail,
			}},
		})
	}

	brl := b.Store.Olist.Window.ItemRevenueCents
	payout := b.PayoutAmountCents()
	fee, feeProv := b.feePct()
	payoutProv := contracts.ProvDemoAssumption
	if feeProv == contracts.ProvUserEntered {
		payoutProv = contracts.ProvUserEntered
	}
	out = append(out, contracts.FinancialEvent{
		ID: "evt-payout", Date: b.offset(a.Payout.OffsetDays), Label: a.Payout.Label,
		Kind: finance.PayoutEventKind, AmountCents: payout, Currency: "USD",
		Provenance: payoutProv, Certainty: contracts.CertaintyConditional,
		SourceRefs: []string{"asm-payout", "asm-fee", "src-olist-window", "src-fx"},
		AsOf:       b.offset(0), AffectsCash: true,
		Detail: a.Payout.Detail,
		Claims: []contracts.Claim{{
			ID: "claim-payout", Label: "Expected payout",
			Display: finance.FormatUSD(payout), AmountCents: ptr(payout), Currency: "USD",
			Provenance: payoutProv,
			SourceRefs: []string{"src-olist-window", "asm-fee", "src-fx"},
			Note: fmt.Sprintf(
				"Built from %s of recorded item sales in the 30-day window, less a %.0f%% marketplace commission, converted to dollars. Olist publishes no payout ledger, so the date and the commission do not come from the records.",
				finance.FormatBRL(brl), fee),
		}},
	})
	return out
}

// WindowBounds is the visible span of the timeline. It starts from the default
// window around today and then stretches to cover every event it was given, so
// nothing a scenario produces is ever rendered outside the axis.
func (b *Builder) WindowBounds(events []contracts.FinancialEvent) (string, string) {
	start := finance.Day(b.Today).AddDate(0, 0, -pastDays)
	end := finance.Day(b.Today).AddDate(0, 0, futureDays)

	for _, e := range events {
		d, err := finance.ParseDate(e.Date)
		if err != nil {
			continue
		}
		d = finance.Day(d)
		if d.Before(start) {
			start = d.AddDate(0, 0, -edgePadDays)
		}
		if d.After(end) {
			end = d.AddDate(0, 0, edgePadDays)
		}
	}
	return start.Format(finance.DateLayout), end.Format(finance.DateLayout)
}

func ptr(v int64) *int64 { return &v }
