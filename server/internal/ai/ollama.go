package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/preflight/preflight/server/internal/contracts"
)

// Ollama is the optional on-site fallback. It is never used by the public
// deployment: a hosted service cannot reach a model on somebody's laptop.
type Ollama struct {
	base  string
	model string
	http  *http.Client

	mu      sync.RWMutex
	lastErr string
}

func NewOllama() *Ollama {
	base := strings.TrimRight(os.Getenv("OLLAMA_BASE_URL"), "/")
	if base == "" {
		base = "http://127.0.0.1:11434"
	}
	model := os.Getenv("OLLAMA_MODEL")
	if model == "" {
		model = "qwen3:4b"
	}
	return &Ollama{base: base, model: model, http: &http.Client{Timeout: 40 * time.Second}}
}

func (o *Ollama) Name() string    { return "ollama" }
func (o *Ollama) Available() bool { return true }

func (o *Ollama) Status() contracts.SourceStatus {
	o.mu.RLock()
	defer o.mu.RUnlock()
	st := contracts.SourceStatus{Name: "ai", State: "live",
		Detail: fmt.Sprintf("Local Ollama %s at %s. Explanations only; it computes nothing.", o.model, o.base)}
	if o.lastErr != "" {
		st.State, st.Degraded = "unavailable", true
		st.Detail = "Local Ollama call failed: " + o.lastErr + ". AI explanation unavailable; figures are unaffected."
	}
	return st
}

func (o *Ollama) chat(ctx context.Context, system, user string, jsonOut bool) (string, error) {
	payload := map[string]any{
		"model":  o.model,
		"stream": false,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"options": map[string]any{"temperature": 0.1},
	}
	if jsonOut {
		payload["format"] = "json"
	}
	b, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, o.base+"/api/chat", bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := o.http.Do(req)
	if err != nil {
		o.fail(err.Error())
		return "", ErrUnavailable
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		o.fail(fmt.Sprintf("HTTP %d", resp.StatusCode))
		return "", ErrUnavailable
	}
	var parsed struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil || parsed.Message.Content == "" {
		o.fail("unreadable response")
		return "", ErrUnavailable
	}
	o.mu.Lock()
	o.lastErr = ""
	o.mu.Unlock()
	return strings.TrimSpace(stripThinking(parsed.Message.Content)), nil
}

// stripThinking removes a reasoning preamble some local models emit.
func stripThinking(s string) string {
	if i := strings.Index(s, "</think>"); i >= 0 {
		return s[i+len("</think>"):]
	}
	return s
}

func (o *Ollama) fail(msg string) {
	o.mu.Lock()
	o.lastErr = msg
	o.mu.Unlock()
}

func (o *Ollama) Explain(ctx context.Context, p Prompt) (string, error) {
	var sb strings.Builder
	sb.WriteString("Question: " + p.Question + "\n\nVerified facts (the only facts that exist):\n")
	for _, f := range p.Facts {
		sb.WriteString("- " + f + "\n")
	}
	sb.WriteString("\nAnswer in 2-4 sentences using only those facts.")
	out, err := o.chat(ctx, explainSystem, sb.String(), false)
	if err != nil {
		return "", err
	}
	if err := ValidateAnswer(out, p.AllowedNumbers); err != nil {
		o.fail("answer failed number validation")
		return "", ErrUnavailable
	}
	return out, nil
}

// Verify sends the smallest useful request to the local model.
func (o *Ollama) Verify(ctx context.Context) error {
	out, err := o.chat(ctx, "Reply with the single word: ok", "Reply with the single word: ok", false)
	if err != nil {
		return err
	}
	if strings.TrimSpace(out) == "" {
		o.fail("empty verification response")
		return ErrUnavailable
	}
	return nil
}

func (o *Ollama) Route(ctx context.Context, question, nodeID string) (Extraction, error) {
	out, err := o.chat(ctx, routeSystem, "Question: "+question, true)
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
