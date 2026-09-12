# Preflight / Fintrace — session handoff

Written 2026-09-12 at the end of a long Claude Code session, for whoever (or
whichever account) picks this up next. Repo:
`https://github.com/d-paola-schz/Fintrace-proposal`, local checkout at
`/Users/pablo/Documents/VSC/TEC/HackMty`.

---

## 1. Where git stands

**The merge is done.** `origin/main` was pulled in at `9cc5f7e` on 2026-09-12
with no conflicts; `go test ./...` and `go vet ./...` both pass on the merged
tree. Four commits from danna-schz came across:

- `c5abbad` Update Gemini integration
- `df86b95` merge of `feature/llm-security-hardening`
- `d8c5fd9` / `3fcc9c9` Document data-source coherence and the single-account
  Nessie limitation (the same message twice — two commits, duplicated content
  in `docs/DATA_PROVENANCE.md`; harmless, but someone may want to tidy it)

Her `gemini.go` change is now the local one: model `gemini-3.6-flash` and a
`thinkingConfig: low` cap so hidden reasoning cannot consume the whole
`maxOutputTokens` budget. That reasoning is sound — keep it.

**Nothing has been pushed.** The branch still carries this session's four UX
commits plus the merge, all local. The user has not given the word, and Render
deploys from `main`, so a push ships straight to the judge-facing URL. Push
deliberately.

The standing rules for this repo: preserve both histories, **never force-push**,
never replace the remote default branch.

Also new on the remote, untouched here: `origin/feature/nessie-seed-data`.

### One thing to raise with the team

`c5abbad` committed **`preflight-bin.exe~`, an 11.5 MB Windows binary**, to
`main` — and the merge has now brought it into this working tree. `.gitignore`
has `*.exe` but the filename ends in `~`, so the pattern missed it. That binary
violates the project's own "no compiled binaries in git" rule. Suggested fix (a
normal commit, no history rewrite):

```bash
git rm --cached 'preflight-bin.exe~' && printf '*.exe~\npreflight-bin.exe*\n' >> .gitignore
```

Rewriting it out of history is possible but is a team decision — don't do it
unilaterally during the hackathon.

### Authorship

Commits must be authored by **Pablo `<pablovargas.astorga@gmail.com>`** (the
machine's global git identity). An earlier session wrongly set a local
`user.email` override and had to rewrite seven commits to fix it. There is no
local override now — leave it that way. Do not add Claude as co-author unless
asked; the user has explicitly said not to.

---

## 2. What this project is

A cash decision workspace for a small e-commerce owner. One horizontal timeline,
chains of evidence folding off the events that matter, and a deterministic Go
engine answering: *can I spend this, on this date, without breaking my reserve?*

- **Frontend** — React 19 + Vite + TypeScript + Tailwind v4 + Recharts, custom SVG chains.
- **API + engine** — Go `net/http`, one process serving `/api/*` and the built UI.
  All money is integer cents; all dates are date-only.
- **Data prep** — Python + DuckDB, offline, run once. Nothing Python runs at demo time.

### Run it

```bash
go run ./server/cmd/preflight      # API on :8080
npm --prefix web run dev           # UI on :5173, proxies /api to :8080
```

Single-process production shape:

```bash
npm --prefix web install && npm --prefix web run build && go build -o preflight-bin ./server/cmd/preflight && ./preflight-bin
```

Toolchain in use: Go 1.26.1, Node 24.19. Tests: `go test ./...` — **64 tests, all
passing** at `2a2358d`.

### API surface

`GET /api/health` · `GET /api/probe` · `GET /api/workspace` ·
`POST /api/scenarios` · `POST /api/chat` · `POST /api/discover` ·
`GET /api/sources/{id}` · `/` serves the built UI.

---

## 3. The rules that govern this codebase

These are the user's, not mine. They have been enforced consistently and a
reviewer will notice if they break.

**Honesty about data**
- Olist is historical BRL marketplace data. Nessie is unrelated mock banking
  data. **Never present them as a verified joined ledger.**
- Never compute gross margin, net margin, current stock, or real payouts from
  inputs we don't have.
- Preserve BRL source values; disclose any USD scenario conversion.
- Every displayed financial claim carries a source or is clearly labelled a demo
  assumption. Provenance vocabulary:
  `olist_historical | nessie_sandbox | derived | user_entered | demo_assumption`.
- Source-status vocabulary: `live | configured | snapshot | fixture | unavailable`.
  Do not report `live` for an untested key or `snapshot` for a fixture that was
  never fetched. `/api/probe` exists to prove what is actually connected.

**Honesty about the model**
- No paid Claude API. The Anthropic subscription is for development only.
- If no model is available, the engine writes the answer and the UI says the
  model is unavailable. **Never fake a successful AI response.**
- The model may only rephrase engine-computed facts. `ai.ValidateAnswer`
  rejects any number the engine did not produce.

**Honesty about time and state**
- Never say a future payout has arrived, that a hypothetical delay happened, or
  that the app knows real inventory on hand.
- The default view is the **modelled plan**. Never call it "your actual plan."
- A what-if must always announce itself and offer a way back.

**Figma**
- The Figma prototype is aesthetic reference only. Its illustrative numbers and
  its mismatched selected-node state are not facts.

---

## 4. Where the code lives

### Go

| Path | What it is |
| --- | --- |
| `server/internal/contracts/types.go` | **Single source of truth for JSON.** `FinancialEvent` (with the `AffectsCash` gate), `ChainNode`, `Chain`, `Claim`, `ScenarioResult`, `CashPath`, `Outlook`, `Briefing`, `Discovery`, `AssumptionOverrides`. |
| `server/internal/finance/project_cash.go` | `Project(Input) ScenarioResult`. Daily balance, lowest point and date, reserve breach. |
| `server/internal/finance/stress_test_engine.go` | `ShiftPayouts`, `ProposalEvent`, `FindFirstBreachingDelay`, `BuildAlternatives`, `Verdict`. |
| `server/internal/workspace/briefing.go` | `BuildBriefing` — the three-sentence opening briefing + `SeeWhy` action. |
| `server/internal/workspace/outlook.go` | `BuildOutlook` — keeps plan and conditional lines distinct. |
| `server/internal/workspace/discover.go` | `BuildBrief`, `Verify` (rejects candidates with digits, unknown event ids, or fewer than two real events). |
| `server/internal/ai/` | `gemini.go`, `ollama.go`, `provider.go`, `validate.go`. |
| `server/internal/data/` | `store.go`, `nessie.go`. |

Two invariants that have bitten before:

1. **Revenue is not cash.** `Project` skips any event without `AffectsCash`.
   Don't remove that gate.
2. **Nil slices become JSON `null` and crash the React tree.**
   `WorkspaceResponse.Sanitize()` runs every slice through `nonNil`. Any new
   slice field must be added there. A missing one caused a full white screen once.

Also: the delay breakpoint must be measured from **unshifted** events. Measuring
from already-shifted ones produced the nonsense "a 1-day payout delay breaks the
reserve."

### Frontend (`web/src/components/`)

| File | Role |
| --- | --- |
| `BriefingBar.tsx` | The opening briefing, `See why` / `Check a purchase`, the "What decision are you making?" input, and the what-if strip. |
| `TimelineWorkspace.tsx` | The rail, week rules, event cards, lowest/breach markers, chain entry points, `rightInset` scroll-clear. `EDGE_PAD = 240`. |
| `SerpentineChain.tsx` | `layoutChain`, `useLinksAlongPath`, `ChainSegmentLinks`, `ChainNodeCard`. `NODE_W 270`, `NODE_H 44`, `LINK_LEN 13`, `LINK_SPACING 8.6`. |
| `ChainEntry.tsx` | Collapsed chain tag on the rail. |
| `PurchaseSheet.tsx` | Guided amount/date form; plain answer first, then current-vs-with-purchase, then alternatives. |
| `Chat.tsx` | Free-text ask; `CompleteProposal` inline form fed by `ChatResponse.partialProposal`. |
| `NodeDrawer.tsx` / `NodeEvidencePanel.tsx` | Five-tier evidence hierarchy. `ORIGIN_MEANING` is keyed on **claim provenance**, not node status — that fix matters, it once labelled a demo assumption "recorded in the data". |
| `ErrorBoundary.tsx` | Wraps the tree so one bad field can't blank the page. |

Layout is verified at **1280×800 and 1440×900**, closed and with each chain
open: nothing clipped, nothing behind the drawer, no vertical scroll, no text
escaping a card. Re-check both widths after any layout change. Only one chain
opens at a time — that's what keeps three levels inside the viewport.

### Data and scripts

- `data/demo-assumptions.json`, `data/nessie-fallback.json`,
  `data/olist-seller-summary.json` — committed, small, prepared.
- `data/raw/` — gitignored. Raw Olist CSVs are CC BY-NC-SA; download and
  regenerate with `scripts/prepare_olist.py`.
- `scripts/verify_attribution.py` — proves the seller attribution is
  conservative (9 of 1,287 orders are multi-seller; ours R$135,171.70 <
  all-items R$136,370.96).
- Seller in use is **`955fee9216a65b617aa5c0531780ce60`**. The originally
  specified `3442f8959a84dea7ee197c632cb2df15` has only 3 order items — not
  enough history. This substitution is documented in the prepared data.

---

## 5. Open items

### Gemini — still unverified
The teammate's `c5abbad` set `DefaultGeminiModel = "gemini-3.6-flash"` and added
a `thinkingConfig` cap so hidden reasoning can't eat the whole output budget.
That reasoning is sound. **Nobody has confirmed the live path works.** The
adapter self-diagnoses: on a 404 it calls `ListModels` and reports which models
the key can actually use. To verify:

```bash
curl -s localhost:8080/api/probe | jq
```

Until it passes, the model-backed features honestly display "No model is
connected" and the engine answers everything. That is a working state, not a
broken one — do not paper over it.

### Nessie — `NESSIE_ACCOUNT_ID` is wrong on Render
It currently holds the Olist seller hash `3442f8959a84dea7ee197c632cb2df15`,
which is not a Nessie account id and returns 404. Either remove it (the adapter
then picks the sandbox account with the largest balance) or set a real one.
Both fixes are in the Render dashboard — env vars must never go in chat or git.

Note the Nessie failure mode: a bad key returns **200 with an empty array**, not
an error. Don't treat 200 as success.

### Deployment
`render.yaml` defines one Docker web service, free plan, health check
`/api/health`, secrets `sync: false`. Render deploys from `main`, so **pushing
ships straight to the judge-facing URL** `https://fintrace-proposal.onrender.com`.
Push deliberately.

### Cosmetic, unfixed
- With both chains closed, the area below the rail reads a little empty. Moving
  the axis up ~8% would fix it if it bothers anyone.
- Below ~1100px wide the drawer covers more timeline than ideal.

---

## 6. Suggested first moves for the next session

1. Raise `preflight-bin.exe~` with the team, and extend `.gitignore` (§1).
2. Verify Gemini via `/api/probe` now that `gemini-3.6-flash` is the local
   default — this is the biggest unknown left.
3. Fix `NESSIE_ACCOUNT_ID` in the Render dashboard.
4. Decide with the user whether to push. Nothing from this session has gone to
   the remote, and that was deliberate.

## 7. How the user likes to work

Short, direct, unsentimental. They want the honest state of things, not
reassurance — they have pushed back hard on over-claiming ("we shouldn't pitch
those as connected yet"). They approve plans before implementation and work in
explicit phases. They notice visual detail and will say when something is "too
much". They read commit metadata. When something is wrong, say so plainly and
fix it rather than explaining around it.
