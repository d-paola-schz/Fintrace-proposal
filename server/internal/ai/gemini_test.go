package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A 404 from generateContent means the model name is not served to this key.
// That is indistinguishable from any other failure unless the adapter asks the
// API what this key can actually use, so it does — and reports the answer.
func TestA404ReportsTheModelsTheKeyCanActuallyUse(t *testing.T) {
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, ":generateContent"):
			w.WriteHeader(http.StatusNotFound)
		case strings.HasSuffix(r.URL.Path, "/models"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[
				{"name":"models/gemini-flash-latest","supportedGenerationMethods":["generateContent"]},
				{"name":"models/text-embedding-004","supportedGenerationMethods":["embedContent"]},
				{"name":"models/gemini-pro-latest","supportedGenerationMethods":["generateContent"]}
			]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer stub.Close()

	t.Setenv("GEMINI_API_KEY", "test-key")
	t.Setenv("GEMINI_BASE_URL", stub.URL)
	t.Setenv("GEMINI_MODEL", "gemini-not-served-here")
	g := NewGemini()

	if err := g.Verify(context.Background()); err == nil {
		t.Fatal("a 404 must not be reported as success")
	}

	detail := g.Status().Detail
	for _, want := range []string{"gemini-not-served-here", "gemini-flash-latest", "gemini-pro-latest", "GEMINI_MODEL"} {
		if !strings.Contains(detail, want) {
			t.Errorf("the diagnosis should mention %q, got: %s", want, detail)
		}
	}
	// Models that cannot generate content are not suggestions.
	if strings.Contains(detail, "text-embedding-004") {
		t.Errorf("an embedding model was offered as a chat model: %s", detail)
	}
	if g.Status().State != "unavailable" || !g.Status().Degraded {
		t.Errorf("a failed provider must report unavailable and degraded")
	}
}

func TestListModelsOnlyReturnsModelsThatCanGenerate(t *testing.T) {
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"models":[
			{"name":"models/a","supportedGenerationMethods":["generateContent","countTokens"]},
			{"name":"models/b","supportedGenerationMethods":["embedContent"]}
		]}`))
	}))
	defer stub.Close()

	t.Setenv("GEMINI_API_KEY", "k")
	t.Setenv("GEMINI_BASE_URL", stub.URL)
	g := NewGemini()

	got, err := g.ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels: %v", err)
	}
	if len(got) != 1 || got[0] != "a" {
		t.Fatalf("got %v, want [a]", got)
	}
}

// Without a key nothing is attempted and nothing is claimed.
func TestNoKeyMeansNoCallAndNoClaim(t *testing.T) {
	t.Setenv("GEMINI_API_KEY", "")
	g := NewGemini()
	if _, err := g.ListModels(context.Background()); err != ErrUnavailable {
		t.Error("ListModels must refuse without a key")
	}
	if err := g.Verify(context.Background()); err != ErrUnavailable {
		t.Error("Verify must refuse without a key")
	}
}
