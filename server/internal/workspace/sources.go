package workspace

import (
	"fmt"

	"github.com/preflight/preflight/server/internal/data"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
)

// Sources resolves every sourceRef the workspace emits into something the owner
// can actually open and read. A citation that does not resolve here is a bug.
func (b *Builder) Sources() []contracts.SourceRecord {
	o := b.Store.Olist
	a := b.Store.Assume

	files := ""
	for name, f := range o.Dataset.Files {
		files += fmt.Sprintf("%s: %s, %d rows, sha256 %s…\n", name, f.File, f.Rows, f.SHA256[:12])
	}

	out := []contracts.SourceRecord{
		{
			ID: "src-olist-dataset", Kind: "olist_query", Provenance: contracts.ProvOlistHistorical,
			Title:  "Olist public dataset files",
			Origin: o.Dataset.RetrievedFrom,
			Detail: o.Dataset.Name + "\n" + o.Dataset.Note + "\n\n" + files,
			AsOf:   o.Seller.LastSaleDate,
		},
		{
			ID: "src-olist-seller", Kind: "olist_query", Provenance: contracts.ProvOlistHistorical,
			Title:  "Seller subset",
			Origin: "olist_order_items JOIN olist_orders, filtered by seller_id",
			AsOf:   o.Seller.LastSaleDate,
			Detail: fmt.Sprintf(
				"Seller %s, %s/%s. %d order items across %d orders and %d distinct products, %s to %s, %s recorded item revenue in %d categories.\n\nOnly this seller's own order_items rows are counted. An Olist order can contain items from several sellers, so no order-level payment total is ever attributed to this seller. Orders with status canceled or unavailable are excluded.\n\nSeller substitution: %s",
				o.Seller.SellerID, o.Seller.City, o.Seller.State, o.Seller.ItemCount,
				o.Seller.OrderCount, o.Seller.DistinctProducts, o.Seller.FirstSaleDate,
				o.Seller.LastSaleDate, finance.FormatBRL(o.Seller.ItemRevenueCents),
				o.Seller.CategoryCount, o.SellerSelection.Reason),
		},
		{
			ID: "src-olist-window", Kind: "olist_query", Provenance: contracts.ProvOlistHistorical,
			Title:  "30-day window totals",
			Origin: "olist_order_items, seller subset, " + o.Window.Start + " to " + o.Window.End,
			AsOf:   o.Window.End,
			Detail: fmt.Sprintf(
				"%d items across %d orders, %s recorded item revenue.\n\n%s",
				o.Window.ItemCount, o.Window.OrderCount,
				finance.FormatBRL(o.Window.ItemRevenueCents), o.WindowSelection.Disclosure),
		},
		{
			ID: "src-olist-prior", Kind: "olist_query", Provenance: contracts.ProvOlistHistorical,
			Title:  "Previous 30-day window totals",
			Origin: "olist_order_items, seller subset, " + o.PriorWindow.Start + " to " + o.PriorWindow.End,
			AsOf:   o.PriorWindow.End,
			Detail: fmt.Sprintf("%d items across %d orders, %s recorded item revenue. Used only as the comparison baseline.",
				o.PriorWindow.ItemCount, o.PriorWindow.OrderCount,
				finance.FormatBRL(o.PriorWindow.ItemRevenueCents)),
		},
		{
			ID: "src-olist-products", Kind: "olist_query", Provenance: contracts.ProvOlistHistorical,
			Title:  "Top products in the window",
			Origin: "olist_order_items JOIN olist_products, seller subset",
			AsOf:   o.Window.End,
			Detail: b.topProductsDetail(),
		},
		{
			ID: "src-nessie-account", Kind: "nessie_record", Provenance: provenanceOfBaseline(b.Nessie),
			Title:  "Opening cash balance",
			Origin: b.baselineSource(),
			AsOf:   b.Nessie.AsOf,
			Detail: fmt.Sprintf("%s — %s.\n\n%s\n\nThis is mock banking data. No transaction in it corresponds to any Olist order on this timeline, and the two are never joined.",
				b.Nessie.AccountLabel, finance.FormatUSD(b.Nessie.BalanceCents), b.Nessie.Detail),
		},
		{
			ID: "src-fx", Kind: "assumption", Provenance: contracts.ProvDemoAssumption,
			Title: a.FX.Label, Detail: a.FX.Detail, Origin: "data/demo-assumptions.json",
		},
		{
			ID: "src-user-proposal", Kind: "user_input", Provenance: contracts.ProvUserEntered,
			Title:  "Proposed expenditure",
			Detail: "Entered by the owner in this session. It is held in the browser only, is never saved anywhere, and nothing about it has been scheduled or paid.",
			Origin: "This session",
		},
	}

	// Assumptions are citable too: a node may point straight at one.
	for _, as := range b.Assumptions(contracts.ScenarioResult{ReserveCents: a.Reserve.AmountCents}) {
		out = append(out, contracts.SourceRecord{
			ID: as.ID, Kind: "assumption", Provenance: as.Provenance,
			Title: as.Label, Detail: as.Detail, Origin: "data/demo-assumptions.json",
		})
	}

	// Daily rows behind the weekly sales markers.
	for _, d := range o.DailySales {
		if d.ItemCount == 0 {
			continue
		}
		ids := ""
		for _, id := range d.OrderIDs {
			ids += "  " + id + "\n"
		}
		if d.OrderIDsTruncated {
			ids += "  … further order ids omitted\n"
		}
		out = append(out, contracts.SourceRecord{
			ID: "src-olist-day-" + d.Date, Kind: "olist_query",
			Provenance: contracts.ProvOlistHistorical,
			Title:      "Recorded sales on " + d.Date,
			Origin:     "olist_order_items, seller subset",
			AsOf:       d.Date,
			Detail: fmt.Sprintf("%d items across %d orders, %s item revenue.\n\nOrder ids:\n%s",
				d.ItemCount, d.OrderCount, finance.FormatBRL(d.ItemRevenueCents), ids),
		})
	}

	if b.Nessie.Source == "live" {
		for _, t := range b.Nessie.Deposits {
			out = append(out, nessieSource(t, "deposit"))
		}
		for _, t := range b.Nessie.Withdrawals {
			out = append(out, nessieSource(t, "withdrawal"))
		}
	}
	return out
}

// nessieSource renders one sandbox transaction as an openable record.
func nessieSource(t data.NessieTxn, kind string) contracts.SourceRecord {
	date := t.TransactionDate
	if len(date) >= 10 {
		date = date[:10]
	}
	return contracts.SourceRecord{
		ID: "src-nessie-txn-" + t.ID, Kind: "nessie_record",
		Provenance: contracts.ProvNessieSandbox,
		Title:      "Sandbox " + kind,
		Origin:     "Nessie /accounts/{id}/" + kind + "s",
		AsOf:       date,
		Detail: fmt.Sprintf("%s on %s: %s. Status %s. %s\n\nMock banking data, unrelated to the Olist orders shown on this timeline.",
			kind, date, finance.FormatUSD(int64(t.Amount*100+0.5)), t.Status, t.Description),
	}
}

func (b *Builder) topProductsDetail() string {
	s := fmt.Sprintf("Top products by item count in the %s to %s window (%d items total):\n\n",
		b.Store.Olist.Window.Start, b.Store.Olist.Window.End, b.Store.Olist.Window.ItemCount)
	for _, p := range b.Store.Olist.TopProducts {
		s += fmt.Sprintf("%s  %s  %d items, %s revenue, %s recorded unit price\n",
			short(p.ProductID), p.Category, p.ItemCount,
			finance.FormatBRL(p.ItemRevenueCents), finance.FormatBRL(p.UnitPriceCents))
	}
	s += "\nRecorded unit price is what the customer paid. Olist publishes no cost of goods, so no margin is shown anywhere in this product."
	return s
}

// Assumptions lists every modelling decision, with the editable ones marked.
func (b *Builder) Assumptions(res contracts.ScenarioResult) []contracts.Assumption {
	a := b.Store.Assume
	reserve := a.Reserve.AmountCents
	if res.ReserveCents > 0 {
		reserve = res.ReserveCents
	}
	fx, fxProv := b.fxRate()
	fee, feeProv := b.feePct()
	bal, balProv := b.balanceCents()

	out := []contracts.Assumption{
		{ID: "asm-fx", Label: a.FX.Label, Detail: a.FX.Detail,
			Value:      fmt.Sprintf("R$%.2f = US$1.00", fx),
			Provenance: fxProv, Editable: true, Field: "brlPerUsd"},
		{ID: "asm-timeshift", Label: a.TimeShift.Label, Detail: a.TimeShift.Detail,
			Value:      fmt.Sprintf("%s recorded, shown as today", b.Store.Olist.Window.End),
			Provenance: contracts.ProvDemoAssumption},
		{ID: "asm-baseline", Label: a.Baseline.Label, Detail: a.Baseline.Detail,
			Value:      finance.FormatUSD(bal) + " — " + b.baselineSource(),
			Provenance: balProv, Editable: true, Field: "openingBalanceCents"},
		{ID: "asm-reserve", Label: a.Reserve.Label, Detail: a.Reserve.Detail,
			Value: finance.FormatUSD(reserve), Provenance: contracts.ProvUserEntered,
			Editable: true, Field: "reserveCents"},
		{ID: "asm-fee", Label: a.MarketplaceFee.Label, Detail: a.MarketplaceFee.Detail,
			Value:      fmt.Sprintf("%.0f%% of recorded item sales", fee),
			Provenance: feeProv, Editable: true, Field: "marketplaceFeePct"},
		{ID: "asm-payout", Label: a.Payout.Label, Detail: a.Payout.Detail,
			Value: fmt.Sprintf("%s on %s (delay %+d days)",
				finance.FormatUSD(b.PayoutAmountCents()),
				b.offset(a.Payout.OffsetDays+res.PayoutDelayDays), res.PayoutDelayDays),
			Provenance: map[bool]string{true: contracts.ProvUserEntered, false: contracts.ProvDemoAssumption}[feeProv == contracts.ProvUserEntered],
			Editable:   true, Field: "payoutDelayDays"},
	}
	for _, o := range a.ScheduledOutflows {
		ov, edited := b.outflowOverride(o.ID)
		amount, date := o.AmountCents, b.offset(o.OffsetDays)
		prov := contracts.ProvDemoAssumption
		if ov.AmountCents != nil {
			amount = *ov.AmountCents
		}
		if ov.Date != nil {
			date = *ov.Date
		}
		if edited && (ov.AmountCents != nil || ov.Date != nil) {
			prov = contracts.ProvUserEntered
		}
		value := finance.FormatUSD(amount) + " on " + date
		if ov.Removed {
			value = "Removed — you said this does not apply"
			prov = contracts.ProvUserEntered
		}
		out = append(out, contracts.Assumption{
			ID: o.ID, Label: o.Label, Detail: o.Detail,
			Value: value, Provenance: prov, Editable: true, Field: "outflow",
		})
	}
	return out
}
