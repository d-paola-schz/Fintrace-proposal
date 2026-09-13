package httpapi

import (
	"context"
	"encoding/json"
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

// handleProbe makes one real call to each external dependency and reports what
// happened. It is the answer to "is this actually connected, or just
// configured?" — run it right after setting keys on the host, and again before
// presenting. It returns no secrets, no balances and no full account ids.
func (s *Server) handleProbe(w http.ResponseWriter, r *http.Request) {
	s.probeMu.Lock()
	defer s.probeMu.Unlock()
	if s.probeBody != nil && time.Since(s.probeAt) < probeTTL {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Probe-Cached", "true")
		_, _ = w.Write(s.probeBody)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()

	type result struct {
		Name      string `json:"name"`
		Connected bool   `json:"connected"`
		Detail    string `json:"detail"`
		Fallback  string `json:"fallback"`
	}
	out := struct {
		CheckedAt string   `json:"checkedAt"`
		AllLive   bool     `json:"allLive"`
		Results   []result `json:"results"`
		Note      string   `json:"note"`
	}{CheckedAt: time.Now().UTC().Format(time.RFC3339)}

	nDetail, nErr := s.nessie.Verify(ctx)
	out.Results = append(out.Results, result{
		Name: "nessie", Connected: nErr == nil, Detail: nDetail,
		Fallback: "The committed demo fixture supplies the opening balance, labelled as a fixture throughout the UI.",
	})

	aiDetail := fmt.Sprintf("Provider %q answered a minimal verification request.", s.ai.Name())
	aiErr := s.ai.Verify(ctx)
	if aiErr != nil {
		aiDetail = s.ai.Status().Detail
	}
	out.Results = append(out.Results, result{
		Name: "ai", Connected: aiErr == nil, Detail: aiDetail,
		Fallback: "Chat answers are written by the Go engine and labelled \"AI explanation unavailable\". Every number is unaffected.",
	})

	out.AllLive = nErr == nil && aiErr == nil
	out.Note = "Anything not reported connected here must not be described as connected. The deterministic engine, the timeline, the chains and every figure work regardless. This result is cached for 30 seconds so repeated checks cannot burn a free-tier quota."

	body, err := json.Marshal(out)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not encode the probe result")
		return
	}
	s.probeBody, s.probeAt = body, time.Now()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(body)
}

func (s *Server) handleWorkspace(w http.ResponseWriter, r *http.Request) {
	b := s.builder(r.Context())
	resp := b.Build(contracts.ScenarioRequest{})
	resp.SourceStatus = s.sourceStatus()
	resp.Sanitize()
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
	if err := validateOverrides(req.Assumptions, today); err != nil {
		return err
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
	if err := validateOverrides(req.Assumptions, today); err != nil {
		return err
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

// validateOverrides bounds every owner-supplied figure before it can reach the
// engine. An unbounded rate or a date outside the window would produce a
// projection that is arithmetically fine and completely meaningless.
func validateOverrides(a *contracts.AssumptionOverrides, today time.Time) error {
	if a == nil {
		return nil
	}
	if a.MarketplaceFeePct != nil {
		if *a.MarketplaceFeePct < 0 || *a.MarketplaceFeePct > 90 {
			return fmt.Errorf("marketplaceFeePct must be between 0 and 90")
		}
	}
	if a.BRLPerUSD != nil {
		if *a.BRLPerUSD < 0.1 || *a.BRLPerUSD > 100 {
			return fmt.Errorf("brlPerUsd must be between 0.1 and 100")
		}
	}
	if a.OpeningBalanceCents != nil {
		if *a.OpeningBalanceCents < 0 || *a.OpeningBalanceCents > 1_000_000_000 {
			return fmt.Errorf("openingBalanceCents must be between 0 and 1000000000")
		}
	}
	if len(a.Outflows) > 12 {
		return fmt.Errorf("too many outflow overrides")
	}
	for id, o := range a.Outflows {
		if !strings.HasPrefix(id, "asm-") || len(id) > 40 {
			return fmt.Errorf("unknown assumption id %q", id)
		}
		if o.AmountCents != nil && (*o.AmountCents > 0 || *o.AmountCents < -100_000_000) {
			return fmt.Errorf("%s amountCents must be a negative amount no larger than 100000000", id)
		}
		if o.Date != nil {
			d, err := finance.ParseDate(*o.Date)
			if err != nil {
				return fmt.Errorf("%s date: %w", id, err)
			}
			// A payment the owner edits is still a schedule, not a record. Dated
			// before today it would sit on the timeline as a forecast for a day
			// that has gone, and the projection would silently drop it. This used
			// to allow yesterday; proposals never did.
			if d.Before(finance.Day(today)) {
				return fmt.Errorf("%s cannot be dated in the past", id)
			}
			if d.After(finance.Day(today).AddDate(0, 0, finance.MaxHorizonDays)) {
				return fmt.Errorf("%s is beyond the %d-day horizon", id, finance.MaxHorizonDays)
			}
		}
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
	resp.Sanitize()
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

// handleDiscover runs one model pass over the timeline and returns what
// survived checking. The model chooses which events belong together and says
// why; the engine decides whether that is true, attaches every figure, and sets
// the severity. Candidates that fail are returned as rejected, with the reason,
// rather than hidden.
func (s *Server) handleDiscover(w http.ResponseWriter, r *http.Request) {
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
	ws := b.Build(req)
	ws.Sanitize()

	resp := contracts.DiscoveryResponse{
		Note: "The model chose which events to put together and why, in words. Every figure below, and the severity, came from the engine afterwards. Anything the model referred to that does not exist was rejected and is shown as rejected.",
	}

	if !s.ai.Available() {
		resp.Source = "unavailable"
		resp.Unavailable = s.ai.Status().Detail
		resp.Sanitize()
		writeJSON(w, http.StatusOK, resp)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()

	candidates, err := s.ai.Discover(ctx, b.BuildBrief(ws))
	if err != nil {
		resp.Source = "unavailable"
		resp.Unavailable = s.ai.Status().Detail
		resp.Sanitize()
		writeJSON(w, http.StatusOK, resp)
		return
	}

	resp.Available = true
	resp.Source = "model"
	resp.Proposed = len(candidates)
	resp.Discoveries = b.Verify(candidates, ws)
	for _, d := range resp.Discoveries {
		if d.Status == "verified" {
			resp.Verified++
		}
	}
	resp.Sanitize()
	writeJSON(w, http.StatusOK, resp)
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
	ws.Sanitize()
	answer := s.answer(r.Context(), b, ws, req)
	answer.Sanitize()
	writeJSON(w, http.StatusOK, answer)
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
			// Hand back what the question did supply so the form can ask only
			// for the rest.
			resp.PartialProposal = &contracts.ProposedDecision{
				Description:         firstNonEmpty(extracted.Description, "Purchase"),
				Category:            firstNonEmpty(extracted.Category, "other"),
				Date:                extracted.Date,
				AmountCents:         extracted.AmountCents,
				MinimumReserveCents: ws.Scenario.ReserveCents,
			}
			resp.Answer = "Before running this I need " + missingList(missing) +
				". Fill it in below and Fintrace will project every day against your reserve."
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
	resp.Answer = engineAnswer(b, ws, node, intent)
	resp.AnswerSource = "engine_fallback"
	resp.Unavailable = s.ai.Status().Detail
	return resp
}

// engineAnswer writes the answer itself when no model is available. It is
// deliberately short and picks what the question asked for, rather than
// concatenating every fact the engine knows.
func engineAnswer(b *workspace.Builder, ws contracts.WorkspaceResponse, node *contracts.ChainNode, intent ai.Intent) string {
	res := ws.Scenario
	o := b.Store.Olist

	if node != nil && (intent == ai.IntentExplainNode || intent == ai.IntentEvidence) {
		out := node.Explanation
		if intent == ai.IntentEvidence && len(node.Claims) > 0 {
			var parts []string
			for _, c := range node.Claims {
				parts = append(parts, fmt.Sprintf("%s — %s, from %s",
					c.Label, c.Display, contracts.ProvenanceWords[c.Provenance]))
			}
			out += " The figures behind it: " + strings.Join(parts, "; ") + "."
		}
		return out
	}

	switch intent {
	case ai.IntentCompanySummary:
		delta := ""
		if o.PriorWindow.ItemRevenueCents > 0 {
			pct := float64(o.Window.ItemRevenueCents-o.PriorWindow.ItemRevenueCents) /
				float64(o.PriorWindow.ItemRevenueCents) * 100
			delta = fmt.Sprintf(" Recorded item sales were %s over the 30-day window, %+.1f%% against the 30 days before it, on %d items either side.",
				finance.FormatBRL(o.Window.ItemRevenueCents), pct, o.Window.ItemCount)
		}
		return fmt.Sprintf("%s%s Those sales are historical marketplace records in BRL, not bank deposits, and this workspace shows no margin because the source has no record of what anything cost you.",
			res.Verdict, delta)

	case ai.IntentExplainCash:
		return fmt.Sprintf("%s %s",
			res.Verdict, res.DelayBreakpoint.Explanation)

	case ai.IntentScenarioResult:
		out := res.Verdict
		for _, a := range res.Alternatives {
			out += fmt.Sprintf(" %s: lowest %s on %s, %s the reserve.",
				a.Label, finance.FormatUSD(a.LowestCents), finance.HumanDate(a.LowestDate),
				map[bool]string{true: "below", false: "at or above"}[a.BreachesReserve])
		}
		if len(res.Caveats) > 0 {
			out += " " + res.Caveats[0]
		}
		return out

	case ai.IntentEvidence:
		return fmt.Sprintf("The opening balance of %s comes from %s. Everything after it is calculated here: the lowest projected point is %s on %s against your %s reserve. Open any figure's source chip to read the exact record or assumption behind it.",
			finance.FormatUSD(res.BaselineBalanceCents), res.BaselineSource,
			finance.FormatUSD(res.LowestCents), finance.HumanDate(res.LowestDate),
			finance.FormatUSD(res.ReserveCents))
	}
	return res.Verdict
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
			WhyItMatters: "The projection needs the exact amount. Fintrace will not assume one.",
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

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
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
