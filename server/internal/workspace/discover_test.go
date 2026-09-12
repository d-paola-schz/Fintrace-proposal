package workspace

import (
	"strings"
	"testing"

	"github.com/preflight/preflight/server/internal/ai"
	"github.com/preflight/preflight/server/internal/contracts"
)

func verifyOne(t *testing.T, c ai.Candidate) contracts.Discovery {
	t.Helper()
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	got := b.Verify([]ai.Candidate{c}, ws)
	if len(got) != 1 {
		t.Fatalf("want 1 discovery, got %d", len(got))
	}
	return got[0]
}

// The model may say which events matter. It may not say what anything is worth.
func TestACandidateStatingItsOwnFigureIsRejected(t *testing.T) {
	for _, bad := range []ai.Candidate{
		{Title: "Supplier payment of $4,600 lands first",
			Rationale: "It leaves before the payout.",
			EventRefs: []string{"evt-asm-supplier", "evt-payout"}},
		{Title: "Payment lands before payout",
			Rationale: "That leaves only 3 days of cover.",
			EventRefs: []string{"evt-asm-supplier", "evt-payout"}},
	} {
		d := verifyOne(t, bad)
		if d.Status != "rejected" {
			t.Errorf("a candidate stating a figure must be rejected: %q / %q", bad.Title, bad.Rationale)
		}
		if !strings.Contains(d.RejectedBecause, "figure") {
			t.Errorf("the reason should name the problem, got %q", d.RejectedBecause)
		}
	}
}

// An id the model made up must not silently become a real-looking finding.
func TestACandidateReferencingAnUnknownEventIsRejected(t *testing.T) {
	d := verifyOne(t, ai.Candidate{
		Title:     "Amazon payout is late",
		Rationale: "The marketplace deposit has not arrived.",
		EventRefs: []string{"evt-amazon-payout", "evt-payout"},
	})
	if d.Status != "rejected" {
		t.Fatalf("an invented event id must be rejected, got %+v", d)
	}
	if !strings.Contains(d.RejectedBecause, "evt-amazon-payout") {
		t.Errorf("the reason should name the missing id, got %q", d.RejectedBecause)
	}
	if len(d.Claims) != 0 {
		t.Error("a rejected candidate must carry no figures")
	}
}

func TestACandidateRelatingFewerThanTwoEventsIsRejected(t *testing.T) {
	d := verifyOne(t, ai.Candidate{
		Title:     "The supplier payment is large",
		Rationale: "It is the biggest outflow.",
		EventRefs: []string{"evt-asm-supplier"},
	})
	if d.Status != "rejected" {
		t.Fatalf("a single-event candidate has no relationship to check, got %+v", d)
	}
}

// A good candidate survives, and every number on it comes from the engine.
func TestAVerifiedCandidateCarriesOnlyEngineFigures(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	got := b.Verify([]ai.Candidate{{
		Title:     "Supplier payment lands before the payout",
		Rationale: "The outflow clears before the marketplace money is expected.",
		EventRefs: []string{"evt-asm-supplier", "evt-payout"},
	}}, ws)

	d := got[0]
	if d.Status != "verified" {
		t.Fatalf("a sound candidate was rejected: %s", d.RejectedBecause)
	}
	if len(d.Claims) == 0 {
		t.Fatal("a verified discovery must carry the engine's figures")
	}
	if d.Tone == "" {
		t.Error("the engine must set the tone; the model does not")
	}
	for _, c := range d.Claims {
		if c.Provenance == "" {
			t.Errorf("claim %s has no provenance", c.ID)
		}
	}
	// The net-effect figure must be the engine's sum, not anything asserted.
	var net *contracts.Claim
	for i := range d.Claims {
		if d.Claims[i].ID == "claim-disc-net" {
			net = &d.Claims[i]
		}
	}
	if net == nil {
		t.Fatal("two cash events should produce a net effect claim")
	}
	var want int64
	for _, e := range ws.Events {
		if e.ID == "evt-asm-supplier" || e.ID == "evt-payout" {
			want += e.AmountCents
		}
	}
	if net.AmountCents == nil || *net.AmountCents != want {
		t.Errorf("net = %v, want %d", net.AmountCents, want)
	}
}

// More than three is padding; the pass is capped.
func TestDiscoveryIsCappedAtThree(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	many := make([]ai.Candidate, 8)
	for i := range many {
		many[i] = ai.Candidate{
			Title: "Related events", Rationale: "They interact.",
			EventRefs: []string{"evt-asm-supplier", "evt-payout"},
		}
	}
	if got := b.Verify(many, ws); len(got) != maxDiscoveries {
		t.Fatalf("got %d discoveries, want %d", len(got), maxDiscoveries)
	}
}

// The brief is the only thing the model sees, and it must not leak raw sources
// or anything that would let it fabricate a figure.
func TestBriefExposesOnlyTimelineFactsAndEngineFindings(t *testing.T) {
	b := testBuilder(t)
	ws := b.Build(contracts.ScenarioRequest{})
	brief := b.BuildBrief(ws)

	if len(brief.Events) != len(ws.Events) {
		t.Errorf("brief lists %d events, timeline has %d", len(brief.Events), len(ws.Events))
	}
	if len(brief.Findings) == 0 {
		t.Error("the brief must include what the engine already concluded")
	}
	joined := strings.Join(append(brief.Events, brief.Findings...), "\n")
	for _, leak := range []string{"API_KEY", "sha256", "nessieisreal", "generativelanguage"} {
		if strings.Contains(joined, leak) {
			t.Errorf("the brief leaks %q", leak)
		}
	}
	// Every referenced id must be resolvable, or the model is being invited to
	// cite something that cannot be checked.
	for _, line := range brief.Events {
		id := strings.TrimSpace(strings.Split(line, "|")[0])
		found := false
		for _, e := range ws.Events {
			if e.ID == id {
				found = true
			}
		}
		if !found {
			t.Errorf("brief names %q, which is not a timeline event", id)
		}
	}
}
