# Preflight — Capital One Challenge

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

**Design reference:** [Figma Make — E-commerce Financial Decision Workspace](https://www.figma.com/make/VzcWdUaaq2UaS0fwlHP7n0/E-commerce-Financial-Decision-Workspace?t=7m6Rt55X4JkwBsem-0).
The Figma prototype is an aesthetic reference only. Its illustrative copy and its
mismatched selected-node state are **not** treated as facts — see
[Corrections to the prototype](#corrections-to-the-figma-prototype).

## Run it locally

Requires Go 1.26+ and Node 22+.

```bash
git clone https://github.com/d-paola-schz/Capital-One-Challenge.git
cd Capital-One-Challenge
npm --prefix web install
npm --prefix web run build
go build -o preflight-bin ./server/cmd/preflight
./preflight-bin
```

Open <http://localhost:8080>. One process serves both `/api/*` and the built UI.

It runs with **no credentials at all**: the bank balance falls back to a clearly
labelled fixture, and chat answers are written by the calculation engine instead
of a language model.

During development, run the two sides separately:

```bash
go run ./server/cmd/preflight      # API on :8080
npm --prefix web run dev           # UI on :5173, proxying /api to :8080
```

## Environment variables

Everything secret stays on the server and never reaches the browser bundle.
Copy `.env.example` and fill in what you have.

| Variable | Required | Effect when unset |
| --- | --- | --- |
| `NESSIE_API_KEY` | no | Opening balance comes from `data/nessie-fallback.json`, labelled **fixture — not retrieved from the Nessie API** in the header, the source panel and the claim itself. |
| `NESSIE_ACCOUNT_ID` | no | The sandbox account with the largest balance is used. |
| `NESSIE_BASE_URL` | no | Defaults to `https://api.nessieisreal.com`. |
| `GEMINI_API_KEY` | no | Header shows `AI UNAVAILABLE`; the engine writes chat answers itself and says so. Nothing is faked. |
| `GEMINI_MODEL` | no | Defaults to `gemini-2.0-flash`. Confirm free-tier eligibility before deploying. |
| `AI_PROVIDER` | no | `gemini` when a key is present, otherwise none. Set `ollama` for a local model. |
| `OLLAMA_BASE_URL` | no | Defaults to `http://127.0.0.1:11434`. Never expose it publicly. |
| `PORT` | no | Defaults to `8080`. |
| `DATA_DIR` / `WEB_DIR` | no | Default to `data` and `web/dist`. |

## Where every number comes from

Preflight draws on **two unrelated sources** plus a short list of assumptions we
wrote down deliberately. They are never joined into one ledger, and every figure
on screen carries a badge naming its origin.

| Badge | Source | What it means |
| --- | --- | --- |
| **Olist record** | Brazilian E-Commerce Public Dataset by Olist (Kaggle, CC BY-NC-SA 4.0) | Real historical marketplace orders, 2016–2018, in **BRL**. Only this seller's own `order_items` rows; cancelled and unavailable orders excluded. Redrawn onto today's calendar as a clearly labelled time-shifted scenario. Not live sales. |
| **Sandbox bank** | Capital One Nessie sandbox | **Mock banking data for a different, fictional customer.** No transaction in it corresponds to any Olist order. Supplies the opening balance only. |
| **Demo assumption** | `data/demo-assumptions.json` | Things the sources do not contain: the payout date and amount, the 20% marketplace commission, the supplier payment, ad spend, rent, and the R$5.00 = US$1.00 conversion. All listed in the app under **Data sources**. |
| **You entered** | This session | The minimum reserve and any proposed expenditure. Held in the browser; nothing is saved, scheduled or paid. |
| **Calculated here** | `server/internal/finance` | The daily projection, lowest balance and date, reserve comparison, breaking payout delay, and alternatives. |

**Sales are not cash.** An item sale never moves the bank balance — only the
opening balance and future cash events do. Both rules are enforced by tests.

**What the sources cannot support is never shown.** Olist publishes no cost of
goods, no inventory and no payout ledger, so Preflight shows no margin and no
days-of-stock figure. It names the one missing number instead.

Full detail, including the SHA-256 of every source file and the seller
substitution, is in [`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md).

### Seller substitution

The brief named Olist seller `3442f8959a84dea7ee197c632cb2df15`. That seller has
**3 order items across 3 days** and cannot support a 30-day cash demonstration.
We substituted `955fee9216a65b617aa5c0531780ce60` — 1,498 order items, 1,286
orders, 23 product categories, São Paulo. The substitution and the original's
statistics are recorded in the prepared data and shown in the app.

## Corrections to the Figma prototype

The Figma file is a visual reference with illustrative copy. This implementation
deliberately departs from it:

- The timeline sits at the **vertical centre** of the workspace, not near the
  bottom under a dominant cash chart.
- Selection is coherent: the panel title, chart, evidence and chat always
  describe the **same** node.
- The banner points at **real future events** in the normalized data.
- "Amazon", "repeat orders +34%", "six days of stock" and "statistically
  consistent" are not reproduced as facts. No Amazon integration exists, and
  inventory is not derived from Olist.

## Tests

```bash
go test ./server/...                               # 37 tests
python3 -m venv .venv && .venv/bin/pip install duckdb
.venv/bin/python scripts/verify_attribution.py     # data attribution checks
```

The financial tests cover the reserve boundary at exactly equal and one cent
under, payout delays crossing a bill date, the baseline never being
double-counted, sales never moving the bank balance, an already-breaching plan
not being blamed on a delay, every citation resolving to a real source record,
and the language model never emitting a number the engine did not compute.

`scripts/verify_attribution.py` proves the multi-seller rule against the real
CSVs: an Olist order can contain items from several sellers, and Preflight never
attributes a whole order's payment to one of them.

## Regenerate the prepared data

Raw Olist CSVs are **not** committed. Download the dataset, put the CSVs in
`data/raw/`, then:

```bash
python3 -m venv .venv && .venv/bin/pip install duckdb
.venv/bin/python scripts/prepare_olist.py
.venv/bin/python scripts/verify_attribution.py
```

This writes the small versioned `data/olist-seller-summary.json` that the Go
service loads. Nothing Python runs during the demo.

## Deploy

One Render Free web service built from the included `Dockerfile`
(see `render.yaml`). Health check: `/api/health`. Set `NESSIE_API_KEY`,
`NESSIE_ACCOUNT_ID` and `GEMINI_API_KEY` in the Render dashboard — never in the
repository.

## Documentation

- [`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md) — where every number comes
  from, and what the sources cannot support.
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — the 90-second walkthrough.
