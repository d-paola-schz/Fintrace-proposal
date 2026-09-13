# Where every number comes from

Fintrace draws on two sources that have nothing to do with each other, plus a
short list of assumptions we wrote down on purpose. The product never blends
them into a single ledger, and every figure on screen carries a badge saying
which one it came from.

## 1. Olist — historical, Brazilian, in BRL

**What it is.** The Brazilian E-Commerce Public Dataset by Olist (Kaggle,
CC BY-NC-SA 4.0): about 99,441 orders and 112,650 order items placed between
2016 and 2018. We retrieved it from a public GitHub mirror and checked its row
counts against the published dataset before using it. The SHA-256 of each file
is recorded in `data/olist-seller-summary.json`, comes from: [This link](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce/data?select=olist_orders_dataset.csv)

**The seller.** The brief named `3442f8959a84dea7ee197c632cb2df15`. That seller
has **3 order items across 3 days** — it cannot support a 30-day cash
demonstration. We substituted `955fee9216a65b617aa5c0531780ce60`: 1,498 order
items, 1,286 orders, 23 product categories, São Paulo, trading from 2017-07-24
to 2018-08-28. The substitution and the original's statistics are recorded in
the prepared data and shown in the app.

**Attribution.** An Olist order can contain items from several sellers. We sum
only this seller's own `order_items.price` rows after joining `orders` for date
and status, and we exclude orders with status `canceled` or `unavailable`.
`scripts/verify_attribution.py` proves this on every run: 9 of the 1,287 orders
containing our items also contain another seller's, and our attributed revenue
(R$135,171.70) is strictly less than the full value of those orders
(R$136,370.96).

**The window.** The workspace shows the 30 days ending 2018-05-31 — the close of
this seller's busiest month — against the 30 days before it. That choice is a
presentation decision and the app says so in the source panel, alongside the
seller's full history, whose final months were quieter than the window shown.

**What Olist does not contain, and what we therefore never show:**

| Not available | Consequence in the product |
| --- | --- |
| Stock on hand | No days-of-stock figure. The reorder node names units on hand as the one missing input. |
| Unit cost / COGS | No gross or net margin appears anywhere. A test enforces this. |
| Supplier terms | The supplier payment is a demo assumption, entered by us. |
| Payout ledger | The payout date and amount are modeled, never recorded. |
| Any bank link | No Olist order corresponds to any Nessie transaction. |

## 2. Nessie — mock banking, unrelated

The Capital One Nessie sandbox supplies the opening cash balance and any
recorded bank rows. It is **mock data for a different, fictional customer**; it
is not this seller's bank account, and no deposit in it corresponds to an Olist
order. The app labels every Nessie figure `Sandbox bank`.

Without `NESSIE_API_KEY` the app falls back to `data/nessie-fallback.json`,
which is labelled **fixture — not retrieved from the Nessie API** in the header,
in the source panel, and on the baseline claim itself. It is never presented as
a snapshot of something we actually fetched.

## 3. Assumptions we wrote down

All in `data/demo-assumptions.json`, all visible in the app under "Data sources".

| Assumption | Value | Why it is an assumption |
| --- | --- | --- |
| Currency conversion | R$5.00 = US$1.00 | A round number, deliberately not a market rate for any date. Every converted figure keeps its BRL original beside it. |
| Time shift | 2018-05-31 shown as today | The seller's recorded daily shapes, counts and amounts, redrawn onto the current calendar. Not live sales. |
| Marketplace commission | 20% | Olist publishes no fee. Applied only to produce a payout figure. |
| Payout timing | today + 8 days | No payout ledger exists. Editable in the app. |
| Supplier payment | −$4,600, today + 5 | Entered for the demonstration. |
| Ad spend | −$1,180, today + 3 | Entered for the demonstration. |
| Warehouse rent | −$2,200, today + 12 | Entered for the demonstration. |
| Minimum reserve | $5,000 | Owner-set. Editable in the app. |

## 4. What is computed rather than sourced

The daily projection, the lowest balance and its date, the reserve comparison,
the first payout delay that breaches, and the alternatives are all computed by
the Go engine in `server/internal/finance`, from integer cents and date-only
arithmetic. They are badged `Calculated here`.

**Sales are not cash.** An item sale never moves the bank balance. Only the
opening balance and future cash events do. Both rules are enforced by tests.

## 5. What the language model may and may not do

The model is given a list of sentences the engine already wrote and is asked to
rephrase them. Before any answer is shown:

- every number in it must appear in the engine's own facts, after normalising
  `$6,700.00` / `6700` / `6,700.0` to the same value;
- a short list of claims is banned outright — margins, "I have scheduled", "good
  investment", guaranteed returns.

An answer that fails either check is discarded and the engine's own wording is
shown instead, labelled. With no key configured at all, every number, chain and
scenario still works; only the phrasing changes, and the header says
`AI UNAVAILABLE`.

The model may also extract a proposed amount and date from a question. It is
never allowed to guess one: a missing amount or date produces a visible request
for it, and the extracted proposal is always shown for editing before it runs.

## 6. Today vs. a real deployment: why the two sources are not joined

**There is no relationship between Olist and Nessie beyond the opening
balance.** This is worth stating plainly, for the team as much as for anyone
reviewing the code: they do not share an entity, a time period, or a currency.

| | Olist | Nessie |
| --- | --- | --- |
| Entity | A real seller from the Olist marketplace (`955fee92…`) | An unrelated, fictional sandbox customer |
| Time period | Real sales from 2017-07-24 to 2018-08-28, **time-shifted** onto today's calendar | A balance read "now" |
| Currency | BRL, converted at an invented flat rate (R$5.00 = US$1.00) | USD, as returned by the API |

The only interaction between the two is that Nessie's balance is used as the
**starting number** for a projection whose day-to-day movements come entirely
from Olist and from `data/demo-assumptions.json`. That is a staging decision
for the demo, not a data relationship — see `Build()` and `RunScenario()` in
`server/internal/workspace/build.go`.

**Both sources are still real, and that is deliberate.** Olist is genuine
historical marketplace data, not synthetic. Nessie is a genuine live API call
against Capital One's sandbox, not a mock we wrote ourselves. Using two real
sources proves the plumbing works end to end — normalizing a real CSV dataset,
calling a real bank API, projecting a real balance forward — without
pretending they describe the same business, which they do not.

**Joining them today would be dishonest, not just unfinished.** Olist is a
public historical dataset; no live customer stands behind it. Fabricating a
link between a real bank balance and a stranger's 2018 sales would produce a
number that looks precise and means nothing.

### What changes in a real product

The seed of the idea does not change — a business's cash balance plus its
future sales, checked against a reserve — but Olist would not be part of it.
In production, both feeds would belong to the **same onboarded business**:

1. A `business`/`customer` record created at signup, in a database this
   product owns (this is the piece that does not exist yet).
2. A real bank connection scoped to that business (open banking / Plaid-style,
   or Nessie's production tier if Capital One offers one) — replacing the
   Nessie sandbox call, not extending it.
3. A real sales-channel connection scoped to that same business (Shopify,
   WooCommerce, Mercado Libre, or whatever platform they actually sell on) —
   replacing Olist entirely, not joining it to anything.

Only at that point does a join make sense, because both sides would describe
the same business in the same window in the same currency. Until that
integration exists, presenting Olist+Nessie as anything other than a
proof-of-plumbing for the demo would be a claim the product cannot support —
which is exactly the standard the rest of this document holds itself to.

### Known limitation of the current demo

The running demo reads from **one Nessie sandbox account**, created once and
referenced by `NESSIE_ACCOUNT_ID`. That is a demo simplification, not a
product design: it stands in for the single onboarded business the current
prototype serves. A multi-business deployment would need one bank connection
per onboarded customer, created at signup rather than by hand — which in turn
needs the `business`/`customer` record described above. No credentials,
account ids, or customer ids belonging to this or any sandbox account are
recorded in this repository.

### Known limitation: the chain rules are hardcoded to this one scenario

`server/internal/workspace/chains.go` produces the two evidence chains
("Payout timing", "Sales mix") from two Go functions, `payoutTimingChain()`
and `salesStockChain()`, that reference this demo's specific event ids
directly in source — `evt-payout`, `evt-asm-supplier`, `evt-asm-rent`,
`evt-asm-ads`. They are not general rules like "the largest outflow scheduled
before the next expected inflow"; they are, in effect, "look up the event
literally named `evt-asm-supplier` and write this sentence about it." If an
event with a different id existed instead — a second supplier, a seller with
no rent line — `findEvent()` returns a zero-value event and the chain reasons
about $0.00 with no error raised.

A third rule, `notableChains()` in `server/internal/workspace/notable.go`, is
general rather than hardcoded. It reads the seller's daily sales, finds the peak
week, the sharpest rise and the sharpest fall among weeks already past, and only
builds a chain for a move of at least 40% against the week before. A flat
history produces no chains. Its figures are recomputed from the daily rows in
its tests.

This was audited deliberately (not discovered as a defect): every number the
chains produce for **this** seller and **this** set of demo assumptions is
correct — see the chain-by-chain verification in this project's manual test
notes. The limitation is generality, not correctness. The projection engine
(`finance.Project`) and the what-if comparison (`workspace.BuildBranch`) do
not have this problem — both already operate on whatever events and chains
they are given, with no event id baked in.

Making the chains scenario-agnostic means replacing the literal id lookups
with pattern-based rules — e.g. "the largest outflow inside N days of a
modeled inflow" instead of "the event named `evt-asm-supplier`" — so the same
two rules could run against a different seller's outflows without code
changes. That is a rewrite of the rule logic, not a bug fix, and has not been
done: multi-business generality was out of scope for this demo, which serves
one seller by design.
