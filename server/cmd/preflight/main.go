// Command preflight serves the API and the built frontend from one process.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/preflight/preflight/server/internal/ai"
	"github.com/preflight/preflight/server/internal/data"
	"github.com/preflight/preflight/server/internal/httpapi"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("preflight ")

	dataDir := envOr("DATA_DIR", "data")
	webDir := envOr("WEB_DIR", "web/dist")
	port := envOr("PORT", "8080")

	store, err := data.Load(dataDir)
	if err != nil {
		log.Fatalf("cannot load prepared data from %s: %v", dataDir, err)
	}
	if _, err := os.Stat(webDir); err != nil {
		log.Printf("no frontend bundle at %s; serving the API only", webDir)
		webDir = ""
	}

	nessie := data.NewNessieClient()
	provider := ai.Select()

	log.Printf("data %s | nessie configured=%v | ai provider=%s available=%v",
		store.DataVersion(), nessie.Configured(), provider.Name(), provider.Available())

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           httpapi.New(store, nessie, provider, webDir).Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      45 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Printf("stopped")
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
