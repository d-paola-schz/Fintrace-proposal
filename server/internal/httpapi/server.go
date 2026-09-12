// Package httpapi wires the HTTP surface: /api/* plus the built frontend.
package httpapi

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/preflight/preflight/server/internal/ai"
	"github.com/preflight/preflight/server/internal/contracts"
	"github.com/preflight/preflight/server/internal/data"
)

const version = "0.4.0"

// maxBodyBytes bounds every request body.
const maxBodyBytes = 64 << 10

type Server struct {
	store     *data.Store
	nessie    *data.NessieClient
	ai        ai.Provider
	startedAt time.Time
	webDir    string

	// probeMu guards a short cache of the last probe. The endpoint is public
	// and makes real upstream calls, so repeated hits must not burn a
	// free-tier quota or hammer the sandbox.
	probeMu   sync.Mutex
	probeAt   time.Time
	probeBody []byte
}

// probeTTL is how long a probe result is reused before calling upstream again.
const probeTTL = 30 * time.Second

func New(store *data.Store, nessie *data.NessieClient, provider ai.Provider, webDir string) *Server {
	return &Server{store: store, nessie: nessie, ai: provider, startedAt: time.Now(), webDir: webDir}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/probe", s.handleProbe)
	mux.HandleFunc("POST /api/discover", s.handleDiscover)
	mux.HandleFunc("GET /api/workspace", s.handleWorkspace)
	mux.HandleFunc("POST /api/scenarios", s.handleScenario)
	mux.HandleFunc("POST /api/chat", s.handleChat)
	mux.HandleFunc("GET /api/sources/{id}", s.handleSource)
	mux.HandleFunc("/", s.handleStatic)
	return logging(mux)
}

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
		}
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode error: %v", err)
	}
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeBody(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	b, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	if len(b) == 0 {
		return nil
	}
	return json.Unmarshal(b, dst)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, contracts.HealthResponse{
		Status:      "ok",
		Version:     version,
		StartedAt:   s.startedAt.UTC().Format(time.RFC3339),
		UptimeSecs:  int64(time.Since(s.startedAt).Seconds()),
		Sources:     s.sourceStatus(),
		DataVersion: s.store.DataVersion(),
	})
}

// sourceStatus reports dependency health. It never includes key material.
func (s *Server) sourceStatus() []contracts.SourceStatus {
	out := []contracts.SourceStatus{s.store.OlistStatus()}
	out = append(out, s.nessie.Status())
	out = append(out, s.ai.Status())
	return out
}

// handleStatic serves the built Vite assets with SPA fallback.
func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeErr(w, http.StatusNotFound, "unknown endpoint")
		return
	}
	if s.webDir == "" {
		writeJSON(w, http.StatusOK, map[string]string{
			"service": "preflight",
			"note":    "frontend bundle not built; run npm --prefix web run build",
		})
		return
	}
	clean := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
	if clean == "." || clean == "/" {
		clean = "index.html"
	}
	full := filepath.Join(s.webDir, clean)
	if st, err := os.Stat(full); err == nil && !st.IsDir() {
		if strings.HasPrefix(clean, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		http.ServeFile(w, r, full)
		return
	}
	index := filepath.Join(s.webDir, "index.html")
	if _, err := os.Stat(index); err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	http.ServeFile(w, r, index)
}
