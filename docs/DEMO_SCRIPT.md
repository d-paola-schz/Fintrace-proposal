# The 90-second demo

Open the URL a minute before you present. Start with the workspace untouched.

**1 — The timeline (10s).** One horizontal axis through the middle of the
screen. Solid to the left of today, dashed to the right. Compact dated cards:
four weeks of recorded item sales, then the scheduled ad spend, the supplier
payment, the expected payout and the rent. Header badges say `OLIST SNAPSHOT`,
`NESSIE SNAPSHOT` (or `FIXTURE`), `AI UNAVAILABLE` or `AI LIVE` — the product
tells you what it is running on before you ask.

**2 — The banner (10s).** *"Your $4,600.00 supplier payment on Sep 17 falls
before the $4,214.69 payout expected Sep 20. A payout delay of 5 days or more
would drop you below your $5,000.00 reserve on Sep 24."* Both dates are real
future events on the timeline behind it.

**3 — The chains (15s).** Two chains fold away from the axis, each through
three stacked nodes. The colours belong to sections, not to whole branches: the
payout chain runs **silver → bronze → gold** (what is scheduled, what could
break, what you could do). The sales chain runs **gold → silver → silver**. Say
it out loud: *a chain is not automatically all good or all bad.*

**4 — Open a node (15s).** Click **02 · A 5-day payout delay breaks the
reserve**. The panel, the title, the chart and the evidence all describe that
node — nothing else. The chart shows the projected balance against the reserve
line. Each figure carries a source chip; click one and the actual Olist query,
sandbox record or named assumption opens inline.

**5 — Move the payout (15s).** Drag **Payout delay** to 5. The payout card
slides right, the chain follows its root, the alert turns bronze, the node text
picks up *"You are currently testing a 5-day delay, and the projection below
does fall through the reserve, first on Sep 24,"* and the chart dips under the
line. One input, everything recomputed by Go.

**6 — Propose a spend (20s).** Reset. Click **Propose a spend** → $3,000 on
ads, four days out → **Run preflight**. The answer: *does not fit — cash falls
to $3,700.00 on Sep 17, $1,300.00 below your reserve.* Three comparison cards
appear: as proposed (below reserve), same amount seven days later (holds), half
the amount on the same day (holds). Click one to run it.

Note what node 02 now says: **"The reserve breaks even with the payout on
time."** The engine will not blame a delay for a commitment that breaks the plan
by itself.

**7 — The honest part (15s).** In the panel: *"How many units of your top
product do you currently hold?"* — the one number that would turn the sales
pattern into a reorder decision, which the Olist release simply does not
contain. Ask the node chat *"What is my margin on this product?"* and it says a
margin cannot be calculated without a recorded unit cost, and will not be
guessed. Open **Data sources** to show the two unrelated datasets and every
assumption behind the demo.

## If something is down

- **No Nessie key.** The opening balance comes from the committed fixture and
  says so in three places. Everything else works.
- **No AI key.** The header says `AI UNAVAILABLE`. Chat still answers — the
  engine writes the reply itself and labels it. Nothing is faked.
- **No network at the venue.** `go run ./server/cmd/preflight` after
  `npm --prefix web run build` serves the whole thing from localhost:8080 with
  no external calls.
