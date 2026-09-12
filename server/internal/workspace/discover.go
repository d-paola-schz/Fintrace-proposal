package workspace

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/preflight/preflight/server/internal/ai"
	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
)

// maxDiscoveries bounds what a single pass may return.
const maxDiscoveries = 3

// digit matches any figure. The model is told not to write one; this enforces it.
var digit = regexp.MustCompile(`\d`)

// BuildBrief assembles the only material a discovery pass is allowed to see:
// the events already on the timeline and the conclusions the engine already
// reached. No raw source data, no credentials, nothing the model could use to
// invent a figure.
func (b *Builder) BuildBrief(ws contracts.WorkspaceResponse) ai.Brief {
	brief := ai.Brief{
		Business: fmt.Sprintf("%s, a %s seller in %s",
			ws.Business.DisplayName, ws.Business.Category, ws.Business.Location),
	}
	for _, e := range ws.Events {
		kind := "moves cash"
		if !e.AffectsCash {
			kind = "does not move cash"
		}
		brief.Events = append(brief.Events, fmt.Sprintf(
			"%s | %s | %s | %s | %s | %s",
			e.ID, e.Date, e.Label, kind, e.Certainty, e.Provenance))
	}
	s := ws.Scenario
	brief.Findings = []string{
		s.Verdict,
		s.DelayBreakpoint.Explanation,
		"Item sales are historical marketplace records, not bank deposits.",
		"No margin, unit cost or stock level exists in the connected data.",
	}
	return brief
}

// Verify checks each candidate against what actually exists and what the engine
// actually computed. A candidate survives only if every event it names is real,
// it relates at least two of them, and it states no figure of its own. The
// engine then attaches the real numbers and decides the tone.
//
// Rejections are returned, not discarded: hiding them would misrepresent how
// well the model is doing.
func (b *Builder) Verify(
	candidates []ai.Candidate,
	ws contracts.WorkspaceResponse,
) []contracts.Discovery {
	byID := map[string]contracts.FinancialEvent{}
	for _, e := range ws.Events {
		byID[e.ID] = e
	}

	out := make([]contracts.Discovery, 0, len(candidates))
	for i, c := range candidates {
		if i >= maxDiscoveries {
			break
		}
		d := contracts.Discovery{
			ID:        fmt.Sprintf("disc-%d", i+1),
			Title:     strings.TrimSpace(c.Title),
			Rationale: strings.TrimSpace(c.Rationale),
			EventRefs: c.EventRefs,
			Status:    "verified",
			Claims:    []contracts.Claim{},
		}

		switch {
		case d.Title == "":
			d.Status, d.RejectedBecause = "rejected", "The model returned no title."
		case digit.MatchString(d.Title) || digit.MatchString(d.Rationale):
			d.Status, d.RejectedBecause = "rejected",
				"It stated a figure of its own. Only the engine may produce numbers, so this was not shown as written."
		}

		if d.Status == "verified" {
			var missing []string
			var real []contracts.FinancialEvent
			for _, ref := range c.EventRefs {
				e, ok := byID[ref]
				if !ok {
					missing = append(missing, ref)
					continue
				}
				real = append(real, e)
			}
			switch {
			case len(missing) > 0:
				d.Status = "rejected"
				d.RejectedBecause = fmt.Sprintf(
					"It referred to %s, which is not on this timeline.", strings.Join(missing, ", "))
			case len(real) < 2:
				d.Status = "rejected"
				d.RejectedBecause = "It related fewer than two real events, so there is no relationship to check."
			default:
				sort.Slice(real, func(x, y int) bool { return real[x].Date < real[y].Date })
				d.Claims = b.claimsForEvents(real)
				d.Tone = b.toneForEvents(real, ws)
			}
		}
		out = append(out, d)
	}
	return out
}

// claimsForEvents attaches the engine's own figures for the referenced events.
// These are the only numbers a discovery ever carries.
func (b *Builder) claimsForEvents(events []contracts.FinancialEvent) []contracts.Claim {
	out := make([]contracts.Claim, 0, len(events)+1)
	var net int64
	cash := 0
	for _, e := range events {
		out = append(out, claimOf(e))
		if e.AffectsCash {
			net += e.AmountCents
			cash++
		}
	}
	if cash >= 2 {
		out = append(out, contracts.Claim{
			ID: "claim-disc-net", Label: "Net effect on cash of these events",
			Display: finance.FormatUSD(net), AmountCents: &net, Currency: "USD",
			Provenance: contracts.ProvDerived,
			SourceRefs: []string{"src-nessie-account"},
			Note:       "Summed by the engine from the events named above. The model did not produce this figure.",
		})
	}
	return out
}

// toneForEvents decides severity from the engine's findings, never from the
// model's wording.
func (b *Builder) toneForEvents(
	events []contracts.FinancialEvent,
	ws contracts.WorkspaceResponse,
) string {
	var out int64
	for _, e := range events {
		if e.AffectsCash && e.AmountCents < 0 {
			out += -e.AmountCents
		}
	}
	switch {
	case ws.Scenario.BreachesReserve && out > 0:
		return contracts.ToneRisk
	case out >= ws.Scenario.HeadroomCents && out > 0:
		return contracts.ToneReview
	case out == 0:
		return contracts.ToneOpportunity
	default:
		return contracts.ToneReview
	}
}
