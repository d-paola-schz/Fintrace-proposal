package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/preflight/preflight/server/internal/ai"
	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/finance"
	"github.com/preflight/preflight/server/internal/workspace"
)

// maxQuestionRunes bounds a chat question.
const maxQuestionRunes = 500

func (s *Server) builder(ctx context.Context) *workspace.Builder {
	snap := s.nessie.Snapshot(ctx, &s.store.NessieFallback)
	loc, err := time.LoadLocation(s.store.Assume.BusinessTimezone)
	if err != nil {
		loc = time.UTC
	}
	return &workspace.Builder{Store: s.store, Nessie: snap, Today: finance.Day(time.Now().In(loc))}
}

func (s *Server) handleWorkspace(w http.ResponseWriter, r *http.Request) {
	b := s.builder(r.Context())
	resp := b.Build(contracts.ScenarioRequest{})
	resp.SourceStatus = s.sourceStatus()
	writeJSON(w, http.StatusOK, resp)
}

// validateScenario enforces every bound before a request reaches the engine.
func validateScenario(req *contracts.ScenarioRequest, today time.Time) error {
	if req.PayoutDelayDays < 0 || req.PayoutDelayDays > 60 {
		return fmt.Errorf("payoutDelayDays must be between 0 and 60")
	}
	if req.ReserveCents < 0 || req.ReserveCents > 100_000_000 {
		return fmt.Errorf("reserveCents must be between 0 and 100000000")
	}
	if req.HorizonDays < 0 || req.HorizonDays > finance.MaxHorizonDays {
		return fmt.Errorf("horizonDays must be between 0 and %d", finance.MaxHorizonDays)
	}
	if req.Proposal == nil {
		return nil
	}
	p := req.Proposal
	if p.AmountCents < 0 || p.AmountCents > 100_000_000 {
		return fmt.Errorf("proposal amountCents must be between 0 and 100000000")
	}
	if p.AmountCents > 0 {
		d, err := finance.ParseDate(p.Date)
		if err != nil {
			return fmt.Errorf("proposal date: %w", err)
		}
		if d.Before(finance.Day(today)) {
			return fmt.Errorf("a proposal cannot be dated in the past")
		}
		if d.After(finance.Day(today).AddDate(0, 0, finance.MaxHorizonDays)) {
			return fmt.Errorf("proposal date is beyond the %d-day horizon", finance.MaxHorizonDays)
		}
	}
	switch p.Category {
	case "", "marketing", "inventory", "equipment", "other":
	default:
		return fmt.Errorf("category must be marketing, inventory, equipment or other")
	}
	if len(p.Description) > 120 {
		p.Description = p.Description[:120]
	}
	return nil
}

func (s *Server) handleScenario(w http.ResponseWriter, r *http.Request) {
	var req contracts.ScenarioRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "could not read the request body")
		return
	}
	b := s.builder(r.Context())
	if err := validateScenario(&req, b.Today); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	resp := b.Build(req)
	resp.SourceStatus = s.sourceStatus()
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleSource(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	b := s.builder(r.Context())
	for _, rec := range b.Sources() {
		if rec.ID == id {
			writeJSON(w, http.StatusOK, rec)
			return
		}
	}
	writeErr(w, http.StatusNotFound, "no source record with that id")
}

func (s *Server) handleChat(w http.ResponseWriter, r *http.Request) {
	var req contracts.ChatRequest
	if err := decodeBody(w, r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "could not read the request body")
		return
	}
	req.Question = strings.TrimSpace(req.Question)
	if req.Question == "" {
		writeErr(w, http.StatusBadRequest, "question is required")
		return
	}
	if len([]rune(req.Question)) > maxQuestionRunes {
		req.Question = string([]rune(req.Question)[:maxQuestionRunes])
	}

	b := s.builder(r.Context())
	scenario := contracts.ScenarioRequest{}
	if req.Scenario != nil {
		scenario = *req.Scenario
		if err := validateScenario(&scenario, b.Today); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	ws := b.Build(scenario)
	writeJSON(w, http.StatusOK, s.answer(r.Context(), b, ws, req))
}

// answer routes the question, gathers the engine's own facts, and asks the
// model only to phrase them. If no model is available or the answer fails
// validation, the engine's factual summary is returned instead, labelled.
func (s *Server) answer(ctx context.Context, b *workspace.Builder, ws contracts.WorkspaceResponse, req contracts.ChatRequest) contracts.ChatResponse {
	intent := ai.Intent(ai.IntentCompanySummary)
	var extracted ai.Extraction
	routed := false

	if s.ai.Available() {
		if e, err := s.ai.Route(ctx, req.Question, req.NodeID); err == nil {
			extracted, intent, routed = e, e.Intent, true
		}
	}
	if !routed {
		intent = heuristicIntent(req.Question, req.NodeID)
		extracted = heuristicExtract(req.Question)
		extracted.Intent = intent
	}

	node := findNode(ws, req.NodeID)
	facts, refs, claims := s.facts(b, ws, node, intent)

	resp := contracts.ChatResponse{
		Intent: string(intent), SourceRefs: refs, Claims: claims, OK: true,
	}

	// A spend proposal needs an amount and a date. Missing values are asked
	// for; they are never invented.
	if intent == ai.IntentProposeSpend {
		prop, missing := buildProposal(extracted, ws, b.Today)
		if len(missing) > 0 {
			resp.AnswerSource = "engine_fallback"
			resp.MissingInputs = missing
			resp.Answer = "Before running this I need " + missingList(missing) +
				". Enter it in the proposal card and Preflight will project every day against your reserve."
			return resp
		}
		change := contracts.ScenarioRequest{
			Proposal: prop, PayoutDelayDays: ws.Scenario.PayoutDelayDays,
			ReserveCents: ws.Scenario.ReserveCents,
		}
		resp.ProposedChange = &change
		resp.ProposalNote = "Review and edit this before running it. Nothing is scheduled or paid."
		trial := b.Build(change)
		facts, refs, claims = s.facts(b, trial, node, ai.IntentScenarioResult)
		resp.SourceRefs, resp.Claims = refs, claims
	}

	if intent == ai.IntentUnsupported {
		resp.AnswerSource = "engine_fallback"
		resp.Answer = "That is outside what this workspace can answer. It covers this seller's recorded sales, the sandbox cash balance, the modeled future payments, and what a proposed expenditure does to your reserve."
		return resp
	}

	allowed := ai.ExtractNumbers(facts...)
	if s.ai.Available() {
		out, err := s.ai.Explain(ctx, ai.Prompt{
			Question: req.Question, Facts: facts, AllowedNumbers: allowed,
			Style: styleFor(intent),
		})
		if err == nil {
			resp.Answer, resp.AnswerSource = out, "model"
			return resp
		}
	}
	resp.Answer = strings.Join(facts, " ")
	resp.AnswerSource = "engine_fallback"
	resp.Unavailable = s.ai.Status().Detail
	return resp
}

func styleFor(i ai.Intent) string {
	switch i {
	case ai.IntentEvidence:
		return "Name where each figure came from."
	case ai.IntentExplainCash:
		return "Lead with the timing, not the total."
	case ai.IntentScenarioResult:
		return "State whether it fits, then the tightest day."
	}
	return ""
}

// facts renders the engine's findings as sentences. Every number the model is
// allowed to use appears here first.
func (s *Server) facts(b *workspace.Builder, ws contracts.WorkspaceResponse, node *contracts.ChainNode, intent ai.Intent) ([]string, []string, []contracts.Claim) {
	res := ws.Scenario
	var facts []string
	var refs []string
	var claims []contracts.Claim

	if node != nil && (intent == ai.IntentExplainNode || intent == ai.IntentEvidence) {
		facts = append(facts, node.Explanation)
		for _, c := range node.Claims {
			facts = append(facts, fmt.Sprintf("%s: %s (source: %s).", c.Label, c.Display, c.Provenance))
		}
		refs = append(refs, node.SourceRefs...)
		claims = append(claims, node.Claims...)
		return facts, refs, claims
	}

	facts = append(facts, res.Verdict)
	facts = append(facts, fmt.Sprintf(
		"The opening balance is %s, from %s.",
		finance.FormatUSD(res.BaselineBalanceCents), res.BaselineSource))
	facts = append(facts, fmt.Sprintf(
		"Lowest projected cash is %s on %s, against a %s reserve, leaving %s.",
		finance.FormatUSD(res.LowestCents), finance.HumanDate(res.LowestDate),
		finance.FormatUSD(res.ReserveCents), finance.FormatUSD(res.HeadroomCents)))
	facts = append(facts, res.DelayBreakpoint.Explanation)

	if intent == ai.IntentCompanySummary {
		o := b.Store.Olist
		facts = append(facts, fmt.Sprintf(
			"Recorded item sales were %s across %d items in the 30-day window, against %s across %d items in the previous 30 days.",
			finance.FormatBRL(o.Window.ItemRevenueCents), o.Window.ItemCount,
			finance.FormatBRL(o.PriorWindow.ItemRevenueCents), o.PriorWindow.ItemCount))
		facts = append(facts, "Those sales are historical Brazilian marketplace records in BRL, redrawn onto today's calendar. They are not bank deposits, and no figure here is a margin: the source has no cost of goods.")
		refs = append(refs, "src-olist-window", "src-olist-prior")
	}

	for _, a := range res.Alternatives {
		facts = append(facts, fmt.Sprintf(
			"Alternative %q: lowest cash %s on %s, %s the reserve.",
			a.Label, finance.FormatUSD(a.LowestCents), finance.HumanDate(a.LowestDate),
			map[bool]string{true: "below", false: "at or above"}[a.BreachesReserve]))
	}
	facts = append(facts, res.Caveats...)
	refs = append(refs, "src-nessie-account", "asm-reserve", "asm-payout")
	claims = append(claims, res.Claims...)
	return facts, refs, claims
}

func findNode(ws contracts.WorkspaceResponse, id string) *contracts.ChainNode {
	if id == "" {
		return nil
	}
	for _, c := range ws.Chains {
		for i := range c.Nodes {
			if c.Nodes[i].ID == id {
				return &c.Nodes[i]
			}
		}
	}
	return nil
}

func buildProposal(e ai.Extraction, ws contracts.WorkspaceResponse, today time.Time) (*contracts.ProposedDecision, []contracts.MissingInput) {
	var missing []contracts.MissingInput
	if e.AmountCents <= 0 {
		missing = append(missing, contracts.MissingInput{
			Field: "amountCents", Question: "How much do you want to spend?",
			WhyItMatters: "The projection needs the exact amount. Preflight will not assume one.",
		})
	}
	date := e.Date
	if date != "" {
		if d, err := finance.ParseDate(date); err != nil || d.Before(finance.Day(today)) {
			date = ""
		}
	}
	if date == "" {
		missing = append(missing, contracts.MissingInput{
			Field: "date", Question: "On what date would the money leave the account?",
			WhyItMatters: "Timing decides this, not the amount alone. The same spend can be safe one week and a breach the next.",
		})
	}
	if len(missing) > 0 {
		return nil, missing
	}
	desc := e.Description
	if desc == "" {
		desc = "Proposed expenditure"
	}
	cat := e.Category
	if cat == "" {
		cat = "other"
	}
	return &contracts.ProposedDecision{
		Description: desc, Category: cat, Date: date,
		AmountCents: e.AmountCents, MinimumReserveCents: ws.Scenario.ReserveCents,
	}, nil
}

func missingList(m []contracts.MissingInput) string {
	var parts []string
	for _, x := range m {
		switch x.Field {
		case "amountCents":
			parts = append(parts, "the amount")
		case "date":
			parts = append(parts, "the date it leaves the account")
		default:
			parts = append(parts, x.Field)
		}
	}
	return strings.Join(parts, " and ")
}
