package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/preflight/preflight/server/internal/contracts"
)

// DefaultGeminiModel is a free-tier model on the Gemini developer API. Confirm
// current free-tier eligibility for the project before a public deployment.
const DefaultGeminiModel = "gemini-2.0-flash"

type Gemini struct {
	key   string
	model string
	http  *http.Client

	mu       sync.RWMutex
	lastErr  string
	lastOK   time.Time
	verified bool
}

func NewGemini() *Gemini {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = DefaultGeminiModel
	}
	return &Gemini{
		key:   strings.TrimSpace(os.Getenv("GEMINI_API_KEY")),
		model: model,
		http:  &http.Client{Timeout: 20 * time.Second},
	}
}

func (g *Gemini) Name() string    { return "gemini" }
func (g *Gemini) Available() bool { return g.key != "" }

func (g *Gemini) Status() contracts.SourceStatus {
	g.mu.RLock()
	defer g.mu.RUnlock()
	st := contracts.SourceStatus{Name: "ai"}
	switch {
	case g.key == "":
		st.State, st.Degraded = "unavailable", true
		st.Detail = "GEMINI_API_KEY is not set. AI explanation unavailable; all figures are still computed by the Go engine."
	case g.lastErr != "":
		st.State, st.Degraded = "unavailable", true
		st.Detail = "Gemini call failed: " + g.lastErr + ". AI explanation unavailable; figures are unaffected."
	case g.verified:
		st.State = "live"
		st.AsOf = g.lastOK.UTC().Format(time.RFC3339)
		st.Detail = fmt.Sprintf("Gemini %s answered successfully. It only phrases engine output.", g.model)
	default:
		st.State = "live"
		st.Detail = fmt.Sprintf("Gemini %s configured, not yet called this run.", g.model)
	}
	return st
}

type geminiReq struct {
	Contents []geminiContent `json:"contents"`
	System   *geminiContent  `json:"systemInstruction,omitempty"`
	Config   geminiGenConfig `json:"generationConfig"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiGenConfig struct {
	Temperature      float64 `json:"temperature"`
	MaxOutputTokens  int     `json:"maxOutputTokens"`
	ResponseMimeType string  `json:"responseMimeType,omitempty"`
}

func (g *Gemini) call(ctx context.Context, system, user string, jsonOut bool, maxTokens int) (string, error) {
	if g.key == "" {
		return "", ErrUnavailable
	}
	body := geminiReq{
		Contents: []geminiContent{{Role: "user", Parts: []geminiPart{{Text: user}}}},
		Config:   geminiGenConfig{Temperature: 0.1, MaxOutputTokens: maxTokens},
	}
	if system != "" {
		body.System = &geminiContent{Parts: []geminiPart{{Text: system}}}
	}
	if jsonOut {
		body.Config.ResponseMimeType = "application/json"
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent", g.model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	// The key travels in a header, never in the URL or any log line.
	req.Header.Set("x-goog-api-key", g.key)

	resp, err := g.http.Do(req)
	if err != nil {
		g.fail(err.Error())
		return "", ErrUnavailable
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		g.fail(fmt.Sprintf("HTTP %d from the Gemini API", resp.StatusCode))
		return "", ErrUnavailable
	}
	var parsed struct {
		Candidates []struct {
			Content geminiContent `json:"content"`
			Finish  string        `json:"finishReason"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		g.fail("unreadable Gemini response")
		return "", ErrUnavailable
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		g.fail("Gemini returned no content")
		return "", ErrUnavailable
	}
	g.succeed()
	return strings.TrimSpace(parsed.Candidates[0].Content.Parts[0].Text), nil
}

func (g *Gemini) fail(msg string) {
	g.mu.Lock()
	g.lastErr = msg
	g.mu.Unlock()
}

func (g *Gemini) succeed() {
	g.mu.Lock()
	g.lastErr, g.verified, g.lastOK = "", true, time.Now()
	g.mu.Unlock()
}

const explainSystem = `You explain small-business cash figures that have ALREADY been calculated.

Absolute rules:
- Use ONLY the facts given. Never introduce a number, date, percentage or currency amount that does not appear verbatim in the facts.
- Never perform arithmetic. Never estimate, forecast, or infer a figure.
- Never claim a data source, integration or record that is not named in the facts.
- Never say a payment was made, scheduled or sent. Everything is a proposal.
- Never say an expenditure is a good investment. Affordability is not return.
- Plain language for a capable business owner who is not a finance specialist.
- 2 to 4 short sentences. No bullet points, no headings, no markdown.`

// Explain phrases the engine's facts. The result is validated before use.
func (g *Gemini) Explain(ctx context.Context, p Prompt) (string, error) {
	var sb strings.Builder
	sb.WriteString("Question from the owner:\n")
	sb.WriteString(p.Question)
	sb.WriteString("\n\nVerified facts you may use (these are the only facts that exist):\n")
	for _, f := range p.Facts {
		sb.WriteString("- ")
		sb.WriteString(f)
		sb.WriteString("\n")
	}
	if p.Style != "" {
		sb.WriteString("\nEmphasis: " + p.Style + "\n")
	}
	sb.WriteString("\nAnswer in 2-4 sentences using only those facts.")

	out, err := g.call(ctx, explainSystem, sb.String(), false, 400)
	if err != nil {
		return "", err
	}
	if err := ValidateAnswer(out, p.AllowedNumbers); err != nil {
		g.fail("answer failed number validation: " + err.Error())
		return "", ErrUnavailable
	}
	return out, nil
}

const routeSystem = `You classify one question from a small-business owner about their cash position, and extract ONLY values the question itself states.

Reply with JSON only:
{"intent": "...", "amountCents": 0, "date": "", "payoutDelayDays": 0, "category": "", "description": ""}

intent must be exactly one of:
  company_summary    - how is the business doing
  explain_cash_gap   - why is cash tight, what is the risk
  explain_node       - explain the selected item on screen
  evidence_for_node  - where does this number come from
  scenario_result    - explain the current projection or comparison
  propose_spend      - the owner wants to spend or invest an amount
  unsupported        - anything else, including anything outside this business's cash

Extraction rules, applied strictly:
- amountCents: only if the question states an amount. $3,000 -> 300000. If no amount is stated, use 0. NEVER guess.
- date: only if the question states one, as YYYY-MM-DD. If it says a relative date you cannot resolve, leave it "".
- payoutDelayDays: only if the question states a number of days of delay. Otherwise 0.
- category: one of marketing, inventory, equipment, other. Use "" if unclear.
- description: at most 6 words naming the spend, taken from the question.
- Never invent an amount or a date. A missing value is better than a guessed one.`

var jsonFence = regexp.MustCompile("(?s)```(?:json)?(.*?)```")

func (g *Gemini) Route(ctx context.Context, question, nodeID string) (Extraction, error) {
	out, err := g.call(ctx, routeSystem, "Question: "+question, true, 200)
	if err != nil {
		return Extraction{}, err
	}
	if m := jsonFence.FindStringSubmatch(out); len(m) == 2 {
		out = strings.TrimSpace(m[1])
	}
	var e Extraction
	if err := json.Unmarshal([]byte(out), &e); err != nil {
		return Extraction{}, ErrUnavailable
	}
	if !AllowedIntents[e.Intent] {
		e.Intent = IntentUnsupported
	}
	e.NodeID = nodeID
	return e, nil
}
