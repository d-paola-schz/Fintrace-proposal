# Fintrace — Capital One Challenge

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

## Scope

**What this is:** a working prototype for one onboarded business — real
historical sales for one Olist seller, a real Nessie sandbox bank balance,
and a deterministic engine that projects cash, stress-tests a payout delay,
and checks a proposed purchase against a reserve. The AI only rephrases
figures the engine already computed; every number on screen names its own
source and its own confidence (`live` / `fixture` / `snapshot` / `demo
assumption`).

**What it deliberately doesn't do (yet):**
- **No multi-business support.** One seller, one bank account, no signup, no
  database — state lives in memory and is rebuilt from the prepared files on
  every request. Serving a second business today means editing those files,
  not creating an account.
- **No live CSV/file upload.** Olist data is normalized offline, once, by
  `scripts/prepare_olist.py`, and committed as a small JSON file — not
  ingested at request time.
- **No margin, inventory, or cost-of-goods figures**, anywhere. The connected
  sources don't contain them, so nothing here estimates them.
- **Olist and Nessie are never joined as if they described the same
  business** — they don't, and pretending otherwise would misrepresent the
  data. See [§6 of `docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md#6-today-vs-a-real-deployment-why-the-two-sources-are-not-joined)
  for what a real multi-business deployment would need instead.
- One narrative rule (which outflows count as a "movable lever" when
  suggesting how to protect the reserve) still assumes this demo's specific
  outflow categories. Documented, not hidden — see `docs/DATA_PROVENANCE.md`.

Full detail behind every one of these is in
[`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md) rather than repeated here.

## Run it locally

Requires Go 1.26+ and Node 22+.

```bash
git clone https://github.com/d-paola-schz/Fintrace-proposal.git
cd Fintrace-proposal
npm --prefix web install
npm --prefix web run build
go build -o preflight-bin ./server/cmd/preflight
./preflight-bin
```

Open <http://localhost:8080>. One process serves both `/api/*` and the built UI.

It runs with **no credentials at all**: the bank balance falls back to a clearly
labelled fixture, and chat answers are written by the calculation engine instead
of a language model.

On Windows, `rebuild.ps1` does all of the above in one step — rebuilds the
frontend and backend together, restarts the server, and confirms it actually
came up before printing the URL:

```powershell
.\rebuild.ps1              # add -SkipInstall to skip `npm install`
```

This exists because a backend built from old code paired with a freshly built
frontend (or vice versa) fails in confusing, silent ways — a field the UI
expects is just missing from the API response. Prefer it over running `go
build` and the old binary separately.

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
| `GEMINI_MODEL` | no | Defaults to `gemini-3.1-flash-lite` — chosen for its free-tier daily quota (500 requests/day), which the full-size tier can exhaust mid-demo. Confirm current free-tier limits for your key in Google AI Studio before presenting; they change over time. If `/api/probe` reports a 404, the response names the models your key can actually use. |
| `GEMINI_BASE_URL` | no | Defaults to `https://generativelanguage.googleapis.com`. Only for testing against a stub. |
| `AI_PROVIDER` | no | `gemini` when a key is present, otherwise none. Set `ollama` for a local model. |
| `OLLAMA_BASE_URL` | no | Defaults to `http://127.0.0.1:11434`. Never expose it publicly. |
| `PORT` | no | Defaults to `8080`. |
| `DATA_DIR` / `WEB_DIR` | no | Default to `data` and `web/dist`. |

## Where every number comes from

Fintrace draws on **two unrelated sources** plus a short list of assumptions we
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
goods, no inventory and no payout ledger, so Fintrace shows no margin and no
days-of-stock figure. It names the one missing number instead.

**Why aren't they joined?** Because they are not the same business — Olist is a
real historical seller, Nessie is an unrelated sandbox customer, and inventing
a link between them would be a claim the data cannot back. Both sources are
real (a genuine dataset, a genuine live API call); only their combination is
staged for the demo. In a real deployment, Olist and Nessie both disappear,
replaced by one onboarded business's own bank connection and own sales
channel — see [§6 of `docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md#6-today-vs-a-real-deployment-why-the-two-sources-are-not-joined)
for what that migration looks like.

Full detail, including the SHA-256 of every source file and the seller
substitution, is in [`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md).

### Seller substitution

The brief named Olist seller `3442f8959a84dea7ee197c632cb2df15`. That seller has
**3 order items across 3 days** and cannot support a 30-day cash demonstration.
We substituted `955fee9216a65b617aa5c0531780ce60` — 1,498 order items, 1,286
orders, 23 product categories, São Paulo. The substitution and the original's
statistics are recorded in the prepared data and shown in the app.

## Tests

```bash
go test ./server/...                               # 89 tests
python3 -m venv .venv && .venv/bin/pip install duckdb
.venv/bin/python scripts/verify_attribution.py     # data attribution checks
```

The financial tests cover the reserve boundary at exactly equal and one cent
under, payout delays crossing a bill date, the baseline never being
double-counted, sales never moving the bank balance, an already-breaching plan
not being blamed on a delay, every citation resolving to a real source record,
and the language model never emitting a number the engine did not compute.

`scripts/verify_attribution.py` proves the multi-seller rule against the real
CSVs: an Olist order can contain items from several sellers, and Fintrace never
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

## Is it actually connected?

A key in the environment is not evidence that an integration works, so the app
never reports one as `live` until a real call has succeeded. The status
vocabulary, in descending order of confidence:

| State | Meaning |
| --- | --- |
| `live` | a real call to the dependency succeeded this run |
| `configured` | credentials present, **no call has succeeded yet** — do not present as connected |
| `snapshot` | prepared data captured from a real source at a known time (Olist) |
| `fixture` | values we wrote ourselves; never retrieved from the dependency |
| `unavailable` | not usable at all |

`GET /api/probe` makes **one real call to each external dependency** and reports
what happened. It returns no secrets, no balances and no full account ids. Run
it right after setting keys on the host, and again before presenting:

```bash
curl -s https://<your-service>.onrender.com/api/probe | jq
```

The header chips and the **Data sources** panel show the same states in the UI,
and anything not `live` is explicitly marked *"Not confirmed connected — do not
present this as a live integration."*

Whatever the external state, the deterministic engine, the timeline, the chains
and every figure keep working. Nessie falls back to the labelled fixture; chat
falls back to engine-authored answers marked *"AI explanation unavailable"*.

## Documentation

- [`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md) — where every number comes
  from, and what the sources cannot support.
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — the 90-second walkthrough.
