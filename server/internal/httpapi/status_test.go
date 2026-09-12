package httpapi

import (
	"context"
	"strings"
	"testing"

	"github.com/preflight/preflight/server/internal/ai"
	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/data"
)

// A key in the environment is not evidence that an integration works. Until a
// real call has succeeded the status must say "configured", never "live" —
// otherwise the product invites someone to demo a connection that has never
// been tested.
func TestAIWithAnUntestedKeyIsNotReportedLive(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "test-key-never-called")
	g := ai.NewGemini()

	st := g.Status()
	if st.State == "live" {
		t.Fatalf("an unverified key must not report live, got %+v", st)
	}
	if st.State != "configured" {
		t.Errorf("state = %q, want configured", st.State)
	}
	if !st.Degraded {
		t.Error("an unverified provider must be marked degraded")
	}
	if !strings.Contains(st.Detail, "no call has succeeded") {
		t.Errorf("the detail must say why it is unconfirmed: %q", st.Detail)
	}
}

func TestAIWithNoKeyIsUnavailableAndSaysFiguresAreUnaffected(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "")
	t.Setenv("AI_PROVIDER", "")
	p := ai.Select()

	if p.Available() {
		t.Fatal("no key must not report available")
	}
	st := p.Status()
	if st.State != "unavailable" || !st.Degraded {
		t.Fatalf("state = %+v, want unavailable and degraded", st)
	}
	if !strings.Contains(st.Detail, "does not depend on a model") {
		t.Errorf("the detail must reassure that figures are unaffected: %q", st.Detail)
	}
	if err := p.Verify(context.Background()); err == nil {
		t.Error("Verify must fail when nothing is configured")
	}
}

// The committed fallback was written by us. Calling it a snapshot would imply
// it was captured from Nessie at some point, which is false.
func TestUnconfiguredNessieReportsFixtureNotSnapshot(t *testing.T) {
	t.Setenv("NESSIE_API_KEY", "")
	c := data.NewNessieClient()

	st := c.Status()
	if st.State != "fixture" {
		t.Fatalf("state = %q, want fixture", st.State)
	}
	if !st.Degraded {
		t.Error("the fixture path must be marked degraded")
	}
	if !strings.Contains(st.Detail, "never retrieved") {
		t.Errorf("the detail must say it was never retrieved from Nessie: %q", st.Detail)
	}
}

func TestConfiguredButUncalledNessieIsNotLive(t *testing.T) {
	t.Setenv("NESSIE_API_KEY", "test-key-never-called")
	c := data.NewNessieClient()

	st := c.Status()
	if st.State == "live" {
		t.Fatalf("an uncalled Nessie key must not report live, got %+v", st)
	}
	if st.State != "configured" {
		t.Errorf("state = %q, want configured", st.State)
	}
}

// Whatever the external state, the fixture keeps the whole demo working.
func TestFixtureFallbackKeepsTheBaselineUsable(t *testing.T) {
	t.Setenv("NESSIE_API_KEY", "")
	store, err := data.Load("../../../data")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	c := data.NewNessieClient()
	snap := c.Snapshot(context.Background(), &store.NessieFallback)

	if snap.Source != "fixture" {
		t.Errorf("source = %q, want fixture", snap.Source)
	}
	if snap.BalanceCents <= 0 {
		t.Fatal("the fixture must still supply a usable opening balance")
	}
	if !strings.Contains(snap.Detail, "NOT retrieved") {
		t.Errorf("the fixture must declare itself: %q", snap.Detail)
	}
}

// Every state the UI can receive must be one the UI knows how to colour.
func TestSourceStatusStatesAreFromTheDocumentedVocabulary(t *testing.T) {
	known := map[string]bool{
		"live": true, "configured": true, "snapshot": true,
		"fixture": true, "unavailable": true,
	}
	var states []contracts.SourceStatus

	t.Setenv("NESSIE_API_KEY", "")
	states = append(states, data.NewNessieClient().Status())
	t.Setenv("NESSIE_API_KEY", "x")
	states = append(states, data.NewNessieClient().Status())
	t.Setenv("GEMINI_API_KEY", "")
	t.Setenv("AI_PROVIDER", "")
	states = append(states, ai.Select().Status())
	t.Setenv("GEMINI_API_KEY", "x")
	states = append(states, ai.NewGemini().Status())

	for _, st := range states {
		if !known[st.State] {
			t.Errorf("%s reported undocumented state %q", st.Name, st.State)
		}
	}
}
