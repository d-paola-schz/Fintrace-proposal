# Preflight

A cash decision workspace for a small e-commerce owner. One horizontal timeline
through the middle of the screen, folded chains of evidence hanging off the
events that deserve attention, and a deterministic Go engine answering the only
question that matters before a purchase: *can I spend this, on this date,
without breaking my reserve?*

- **Frontend** — React + Vite + TypeScript, Tailwind, custom SVG chains, Recharts.
- **API and engine** — Go `net/http`, one process serving `/api/*` and the built
  UI. All money is integer cents; all dates are date-only.
- **Data preparation** — Python + DuckDB, offline, once. Nothing Python runs
  during the demo.

## Run it

```bash
npm --prefix web install && npm --prefix web run build
go build -o preflight-bin ./server/cmd/preflight && ./preflight-bin
```

Then open http://localhost:8080. It works with no credentials at all: the bank
balance falls back to a labelled fixture and the chat answers are written by the
engine instead of a model.

During development, run the two sides separately:

```bash
go run ./server/cmd/preflight      # API on :8080
npm --prefix web run dev           # UI on :5173, proxying /api
```

## Tests

```bash
go test ./server/...                                 # 36 tests
.venv/bin/python scripts/verify_attribution.py       # data attribution checks
```

The financial tests cover the reserve boundary at exactly equal and one cent
under, payout delays crossing a bill date, the baseline never being
double-counted, sales never moving the bank balance, an already-breaching plan
not being blamed on a delay, and the model never emitting a number the engine
did not compute.

## Regenerate the prepared data

```bash
python3 -m venv .venv && .venv/bin/pip install duckdb
# put the Olist CSVs in data/raw/ first
.venv/bin/python scripts/prepare_olist.py
```

Raw CSVs are not committed; the small prepared JSON is.

## Configuration

Everything secret stays on the server. See `.env.example`.

| Variable | Effect when unset |
| --- | --- |
| `NESSIE_API_KEY` | Opening balance comes from `data/nessie-fallback.json`, labelled as a fixture in the UI. |
| `NESSIE_ACCOUNT_ID` | The account with the largest balance is used. |
| `GEMINI_API_KEY` | Header shows `AI UNAVAILABLE`; the engine writes chat answers itself. |
| `AI_PROVIDER` | `gemini` when a key is present, otherwise none. `ollama` for a local model. |

## Deploy

One Render Free web service from the included `Dockerfile` / `render.yaml`.
Health check: `/api/health`.

## Documentation

- [`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md) — where every number comes
  from, and what the sources cannot support.
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — the 90-second walkthrough.
