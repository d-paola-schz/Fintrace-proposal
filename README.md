# Preflight

A financial decision workspace for a small e-commerce owner. One horizontal
timeline, folded chains of evidence hanging off unusual events, and a
deterministic Go engine that answers "can I spend this, on this date, without
breaking my reserve?"

## Run it locally

```bash
go run ./server/cmd/preflight          # API on :8080
npm --prefix web install && npm --prefix web run dev   # UI on :5173
```

Build everything into one process:

```bash
npm --prefix web install && npm --prefix web run build
go build -o preflight-bin ./server/cmd/preflight && ./preflight-bin
```

## Regenerate the prepared data

```bash
python3 -m venv .venv && .venv/bin/pip install duckdb
.venv/bin/python scripts/prepare_olist.py
```

Raw Olist CSVs belong in `data/raw/` and are not committed.

## Configuration

All secrets stay server-side. See `.env.example`. Nothing works differently
without them except that Nessie falls back to a labelled fixture and the chat
answers come from the engine instead of a model.

## What is real

See `docs/DATA_PROVENANCE.md`.
