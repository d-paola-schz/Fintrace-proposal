// Package ai holds the bounded language-model adapters. A provider may only
// phrase an explanation of numbers the Go engine already computed, or classify
// a question into an approved intent. It never calculates, never sees a secret
// belonging to the client, and never invents a figure or a citation.
package ai

import (
	"context"
	"errors"
	"os"
	"strings"

	"github.com/preflight/preflight/server/internal/contracts"
)

// ErrUnavailable means no usable provider is configured or the call failed. The
// caller must then show the engine result with an explicit unavailable notice
// rather than fabricating an answer.
var ErrUnavailable = errors.New("ai provider unavailable")

// Intent is the allowlist of things a question may be routed to.
type Intent string

const (
	IntentCompanySummary Intent = "company_summary"
	IntentExplainNode    Intent = "explain_node"
	IntentExplainCash    Intent = "explain_cash_gap"
	IntentScenarioResult Intent = "scenario_result"
	IntentProposeSpend   Intent = "propose_spend"
	IntentEvidence       Intent = "evidence_for_node"
	IntentUnsupported    Intent = "unsupported"
)

// AllowedIntents is the closed set the router may return.
var AllowedIntents = map[Intent]bool{
	IntentCompanySummary: true,
	IntentExplainNode:    true,
	IntentExplainCash:    true,
	IntentScenarioResult: true,
	IntentProposeSpend:   true,
	IntentEvidence:       true,
	IntentUnsupported:    true,
}

// Extraction is the only structured output a model is trusted to produce, and
// every field is validated in Go before it reaches the engine.
type Extraction struct {
	Intent Intent `json:"intent"`
	// AmountCents is set only when the question stated an amount.
	AmountCents int64 `json:"amountCents"`
	// Date is set only when the question stated a date.
	Date string `json:"date"`
	// PayoutDelayDays is set only when the question stated a delay.
	PayoutDelayDays int    `json:"payoutDelayDays"`
	Category        string `json:"category"`
	Description     string `json:"description"`
	NodeID          string `json:"nodeId"`
}

// Provider is implemented by each adapter.
type Provider interface {
	Name() string
	Available() bool
	Status() contracts.SourceStatus
	// Explain phrases an answer strictly from facts. It must not add numbers.
	Explain(ctx context.Context, prompt Prompt) (string, error)
	// Route classifies a question and extracts only fields the user supplied.
	Route(ctx context.Context, question string, nodeID string) (Extraction, error)
	// Verify makes one minimal real call so the product can state whether the
	// integration actually works, rather than that a key exists.
	Verify(ctx context.Context) error
}

// Prompt carries the engine's own words. Facts is a pre-rendered list of
// verified statements; the model may reorganise them but not extend them.
type Prompt struct {
	Question string
	Facts    []string
	// AllowedNumbers lists every numeric token the answer may contain. The
	// validator rejects an answer containing any other number.
	AllowedNumbers []string
	Style          string
}

// Select builds the provider named by AI_PROVIDER.
func Select() Provider {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER"))) {
	case "gemini":
		return NewGemini()
	case "ollama":
		return NewOllama()
	case "", "none", "off":
		// A key present without an explicit provider still enables Gemini, so a
		// deployment only needs the one variable set.
		if os.Getenv("GEMINI_API_KEY") != "" {
			return NewGemini()
		}
		return NewUnavailable("AI_PROVIDER is not set and no GEMINI_API_KEY is present.")
	default:
		return NewUnavailable("AI_PROVIDER names an unknown provider.")
	}
}

// Unavailable is the honest no-op provider.
type Unavailable struct{ reason string }

func NewUnavailable(reason string) *Unavailable { return &Unavailable{reason: reason} }

func (u *Unavailable) Name() string    { return "none" }
func (u *Unavailable) Available() bool { return false }
func (u *Unavailable) Status() contracts.SourceStatus {
	return contracts.SourceStatus{
		Name: "ai", State: "unavailable", Degraded: true,
		Detail: "AI explanation unavailable. " + u.reason +
			" Every number, chain and scenario on this page is computed by the Go engine and does not depend on a model.",
	}
}
func (u *Unavailable) Explain(context.Context, Prompt) (string, error) { return "", ErrUnavailable }
func (u *Unavailable) Verify(context.Context) error                    { return ErrUnavailable }
func (u *Unavailable) Route(context.Context, string, string) (Extraction, error) {
	return Extraction{}, ErrUnavailable
}
