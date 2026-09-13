package workspace

import (
	"fmt"
	"strings"
	"time"

	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/data"
	"github.com/preflight/preflight/server/internal/finance"
)

// Build assembles the full workspace for one scenario request.
//
// A what-if also carries its branch: the same request with the what-if taken
// out is built alongside it, and the two are compared, so the interface can
// draw the what-if as a second timeline showing only what it changes.
func (b *Builder) Build(req contracts.ScenarioRequest) contracts.WorkspaceResponse {
	resp := b.build(req)
	if resp.Scenario.ScenarioActive {
		// Reserve and figure edits are plan inputs, not hypotheticals, so the plan
		// being branched from keeps them. Only the what-if itself is removed.
		planReq := req
		planReq.Proposal = nil
		planReq.PayoutDelayDays = 0
		plan := b.build(planReq)
		b.Overrides = req.Assumptions

		// Compare normalized payloads, so a nil slice on one side and an empty one
		// on the other can never count as a difference.
		plan.Sanitize()
		resp.Sanitize()
		resp.Branch = BuildBranch(plan, resp)
	}
	return resp
}

func (b *Builder) build(req contracts.ScenarioRequest) contracts.WorkspaceResponse {
	b.Overrides = req.Assumptions
	events := b.Events()
	res := b.RunScenario(req, events)

	// The proposal, if any, belongs on the timeline too.
	displayEvents := events
	if req.Proposal != nil && req.Proposal.AmountCents > 0 {
		displayEvents = append(displayEvents, finance.ProposalEvent(*req.Proposal, "USD"))
	}
	if req.PayoutDelayDays != 0 {
		displayEvents = finance.ShiftPayouts(displayEvents, req.PayoutDelayDays)
	}

	chains := b.BuildChains(res, displayEvents)
	start, end := b.WindowBounds(displayEvents)

	return contracts.WorkspaceResponse{
		Business:        b.profile(),
		DisplayCurrency: b.Store.Assume.DisplayCurrency,
		Timezone:        b.Store.Assume.BusinessTimezone,
		Today:           b.offset(0),
		WindowStart:     start,
		WindowEnd:       end,
		Events:          displayEvents,
		Chains:          chains,
		Briefing:        b.BuildBriefing(res, displayEvents, chains),
		Outlook:         b.BuildOutlook(res, displayEvents),
		Scenario:        res,
		Assumptions:     b.Assumptions(res),
		Sources:         b.Sources(),
		SourceStatus:    nil, // filled by the handler, which owns the clients
		Alert:           b.alert(res, displayEvents),
		DataNotice:      "Two unrelated sources. Olist is historical Brazilian marketplace data in BRL, redrawn onto today's calendar. Nessie is unrelated mock banking data. They are never joined into one ledger, and every figure below says which it came from.",
		GeneratedAt:     time.Now().UTC().Format(time.RFC3339),
	}
}

// RunScenario applies the request to the engine. This is the only path by which
// any number in the product is produced.
func (b *Builder) RunScenario(req contracts.ScenarioRequest, events []contracts.FinancialEvent) contracts.ScenarioResult {
	b.Overrides = req.Assumptions
	reserve := b.Store.Assume.Reserve.AmountCents
	if req.ReserveCents > 0 {
		reserve = req.ReserveCents
	}
	horizon := req.HorizonDays
	if horizon <= 0 {
		horizon = finance.DefaultHorizonDays
	}

	// unshifted carries the proposal but keeps the payout on its originally
	// modeled date. The delay breakpoint is always measured from there, so the
	// statement "a delay of N days breaks the reserve" means the same thing
	// however many days the owner has already applied.
	unshifted := events
	hasProposal := req.Proposal != nil && req.Proposal.AmountCents > 0
	if hasProposal {
		unshifted = append(append([]contracts.FinancialEvent{}, unshifted...),
			finance.ProposalEvent(*req.Proposal, "USD"))
	}
	applied := unshifted
	if req.PayoutDelayDays != 0 {
		applied = finance.ShiftPayouts(applied, req.PayoutDelayDays)
	}

	balance, _ := b.balanceCents()
	in := finance.Input{
		BaselineCents:  balance,
		BaselineAsOf:   b.Nessie.AsOf,
		BaselineSource: b.baselineSource(),
		Currency:       "USD",
		StartDate:      finance.Day(b.Today),
		HorizonDays:    horizon,
		ReserveCents:   reserve,
		Events:         applied,
	}

	res := finance.Project(in)
	res.PayoutDelayDays = req.PayoutDelayDays

	delayIn := in
	delayIn.Events = unshifted
	res.DelayBreakpoint = finance.FindFirstBreachingDelay(delayIn, finance.DefaultDelayHorizonDays)

	// The plan as it actually stands: payout on time, nothing proposed. Kept
	// beside every scenario so a what-if can never be read as where they are.
	res.ScenarioActive = req.PayoutDelayDays != 0 || hasProposal
	if res.ScenarioActive {
		plainIn := in
		plainIn.Events = events
		plain := finance.Project(plainIn)
		res.OnTimePlan = &contracts.CashPath{
			Label:           "Current plan",
			Days:            plain.Days,
			LowestCents:     plain.LowestCents,
			LowestDate:      plain.LowestDate,
			HeadroomCents:   plain.HeadroomCents,
			BreachesReserve: plain.BreachesReserve,
			FirstBreachDate: plain.FirstBreachDate,
		}
	}
	if hasProposal {
		p := *req.Proposal
		p.MinimumReserveCents = reserve
		res.Proposal = &p
		end := finance.Day(b.Today).AddDate(0, 0, horizon-1)
		res.Alternatives = finance.BuildAlternatives(in, p, end)

		// The same window with the spend removed, so the owner can see the two
		// paths together and read the cost of the decision off the difference.
		current := in
		current.Events = applied[:0:0]
		for _, e := range applied {
			if e.ID != finance.ProposalEventID {
				current.Events = append(current.Events, e)
			}
		}
		base := finance.Project(current)
		res.WithoutProposal = &contracts.CashPath{
			Label:           "Without this spend",
			Days:            base.Days,
			LowestCents:     base.LowestCents,
			LowestDate:      base.LowestDate,
			HeadroomCents:   base.HeadroomCents,
			BreachesReserve: base.BreachesReserve,
			FirstBreachDate: base.FirstBreachDate,
		}
		res.DeltaLowestCents = res.LowestCents - base.LowestCents
	}
	res.Verdict, res.Caveats = finance.Verdict(res, hasProposal)
	res.Assumptions = b.Assumptions(res)
	res.MissingInputs = b.missingInputs(req)
	res.Claims = b.resultClaims(res)
	return res
}

func (b *Builder) baselineSource() string {
	if _, prov := b.balanceCents(); prov == contracts.ProvUserEntered {
		return "The opening balance you entered"
	}
	if b.Nessie.Source == "live" {
		return "Nessie sandbox account (live read)"
	}
	return "Committed demo fixture — not retrieved from Nessie"
}

// BaselineCaveat is the same real-vs-fixture honesty check as baselineSource,
// worded for the owner's ear instead of an audit trail. The chat voice talks
// about "your cash" throughout — it should never name the vendor or say
// "sandbox" — but it must still say plainly when a figure is a stand-in
// rather than a live reading, because that is the one thing this product can
// never blur. Citations elsewhere (Data & assumptions, "show the math") still
// carry the full technical wording from baselineSource for anyone who wants
// it; this is only for the sentence spoken back to the owner.
func (b *Builder) BaselineCaveat() string {
	if _, prov := b.balanceCents(); prov == contracts.ProvUserEntered {
		return ""
	}
	if b.Nessie.Source == "live" {
		return ""
	}
	return " That figure is a placeholder for this demo, not a live reading of your account."
}

func (b *Builder) missingInputs(req contracts.ScenarioRequest) []contracts.MissingInput {
	var out []contracts.MissingInput
	if req.Proposal != nil && req.Proposal.AmountCents > 0 {
		out = append(out, contracts.MissingInput{
			Field:        "expectedBenefit",
			Question:     "What do you expect this spend to bring in, and by when?",
			WhyItMatters: "Preflight can tell you whether the cash survives the month. It cannot tell you whether the spend is worth making, because nothing in the connected records measures what advertising or stock earns back.",
		})
	}
	out = append(out, contracts.MissingInput{
		Field:        "unitsOnHand",
		Question:     "How many units of your top product do you currently hold?",
		WhyItMatters: "It is the one number standing between the recorded sales pattern and a dated stock-out estimate. The Olist release has no inventory table, so it cannot be derived.",
	})
	return out
}

func (b *Builder) resultClaims(res contracts.ScenarioResult) []contracts.Claim {
	return []contracts.Claim{
		{
			ID: "claim-res-baseline", Label: "Opening balance",
			Display:     finance.FormatUSD(res.BaselineBalanceCents),
			AmountCents: ptr(res.BaselineBalanceCents), Currency: "USD",
			Provenance: provenanceOfBaseline(b.Nessie), SourceRefs: []string{"src-nessie-account"},
			AsOf: res.BaselineAsOf, Note: b.baselineSource() + ". Only future events change it.",
		},
		{
			ID: "claim-res-lowest", Label: "Lowest projected cash",
			Display:     finance.FormatUSD(res.LowestCents) + " on " + finance.HumanDate(res.LowestDate),
			AmountCents: ptr(res.LowestCents), Currency: "USD",
			Provenance: contracts.ProvDerived,
			SourceRefs: []string{"src-nessie-account", "asm-supplier", "asm-rent", "asm-ads", "asm-payout"},
			Note:       fmt.Sprintf("The tightest of %d projected days.", len(res.Days)),
		},
		{
			ID: "claim-res-reserve", Label: "Minimum operating reserve",
			Display: finance.FormatUSD(res.ReserveCents), AmountCents: ptr(res.ReserveCents),
			Currency: "USD", Provenance: contracts.ProvUserEntered,
			SourceRefs: []string{"asm-reserve"},
		},
		{
			ID: "claim-res-headroom", Label: "Headroom at the lowest point",
			Display: finance.FormatUSD(res.HeadroomCents), AmountCents: ptr(res.HeadroomCents),
			Currency: "USD", Provenance: contracts.ProvDerived,
			SourceRefs: []string{"asm-reserve"},
			Note:       "Lowest projected cash minus the reserve. A balance exactly equal to the reserve is not a breach.",
		},
	}
}

// secondOf lets an accessor that returns (value, provenance) be used where only
// the provenance is wanted.
func secondOf[T any](_ T, prov string) string { return prov }

func provenanceOfBaseline(n *data.NessieSnapshot) string {
	if n.Source == "live" {
		return contracts.ProvNessieSandbox
	}
	return contracts.ProvDemoAssumption
}

func (b *Builder) profile() contracts.BusinessProfile {
	o := b.Store.Olist
	cats := make([]string, 0, 3)
	for i, c := range o.Seller.Categories {
		if i == 3 {
			break
		}
		cats = append(cats, strings.ReplaceAll(c.Name, "_", " "))
	}
	return contracts.BusinessProfile{
		DisplayName: "Casa Girassol",
		SellerID:    o.Seller.SellerID,
		Category:    strings.Join(cats, ", "),
		Location:    strings.Title(o.Seller.City) + ", " + strings.ToUpper(o.Seller.State),
		SourceWindow: fmt.Sprintf("%s to %s recorded (%d order items)",
			o.Seller.FirstSaleDate, o.Seller.LastSaleDate, o.Seller.ItemCount),
		TimeShiftNote: fmt.Sprintf(
			"Display name chosen for the demo. The underlying records are Olist seller %s, whose 30 days to %s are redrawn onto the 30 days to today. %s",
			short(o.Seller.SellerID), o.Window.End, o.WindowSelection.Disclosure),
	}
}

func short(id string) string {
	if len(id) <= 10 {
		return id
	}
	return id[:8] + "…"
}

// alert points at real future events in the normalized data, never at prose.
func (b *Builder) alert(res contracts.ScenarioResult, events []contracts.FinancialEvent) *contracts.WorkspaceAlert {
	supplier, ok := findEvent(events, "evt-asm-supplier")
	payout, ok2 := findEvent(events, "evt-payout")
	if !ok || !ok2 {
		return nil
	}
	bp := res.DelayBreakpoint
	if res.BreachesReserve {
		return &contracts.WorkspaceAlert{
			Tone: contracts.ToneRisk,
			Message: fmt.Sprintf(
				"Projected cash falls below your %s reserve on %s, reaching %s on %s. Open the payout chain to see what moves it.",
				finance.FormatUSD(res.ReserveCents), finance.HumanDate(res.FirstBreachDate),
				finance.FormatUSD(res.LowestCents), finance.HumanDate(res.LowestDate)),
			EventIDs: []string{supplier.ID, payout.ID}, ChainID: "chain-payout",
			FocusNodeID: "node-payout-2",
		}
	}
	if bp.Found {
		return &contracts.WorkspaceAlert{
			Tone: contracts.ToneReview,
			Message: fmt.Sprintf(
				"Your %s supplier payment on %s falls before the %s payout expected %s. A payout delay of %d days or more would drop you below your %s reserve on %s.",
				finance.FormatUSD(-supplier.AmountCents), finance.HumanDate(supplier.Date),
				finance.FormatUSD(payout.AmountCents), finance.HumanDate(payout.Date),
				bp.DelayDays, finance.FormatUSD(res.ReserveCents), finance.HumanDate(bp.BreachDate)),
			EventIDs: []string{supplier.ID, payout.ID}, ChainID: "chain-payout",
			FocusNodeID: "node-payout-2",
		}
	}
	return &contracts.WorkspaceAlert{
		Tone: contracts.ToneOpportunity,
		Message: fmt.Sprintf(
			"Projected cash holds above your %s reserve for the full window, and no payout delay up to %d days changes that.",
			finance.FormatUSD(res.ReserveCents), bp.TestedUpToDays),
		EventIDs: []string{payout.ID}, ChainID: "chain-payout", FocusNodeID: "node-payout-2",
	}
}
