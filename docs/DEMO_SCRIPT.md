# The 90-second demo

Open the URL a minute before you present. Start with the workspace untouched.

**1 — The timeline (10s).** One horizontal axis through the middle of the
screen. Solid to the left of today, dashed to the right. The opening screen is
split at today. Everything that has already happened carries its card, marked
recorded, with a solid edge. What is still ahead stays quiet: only an event a
chain hangs from carries a card, and every other upcoming event sits on the rail
as a bead — filled for cash in, hollow for cash out. Hover or tab to one and its
full card appears. Nothing before today is ever a prediction; the server refuses
to put a scheduled payment or a proposed spend on a day that has passed. Two pills mark what
matters before anything is clicked: today's balance, and the lowest point
ahead. Header badges say `OLIST SNAPSHOT`, `NESSIE SNAPSHOT` (or `FIXTURE`),
`AI UNAVAILABLE` or `AI LIVE` — the product tells you what it is running on
before you ask.

Each upcoming marker carries a plus, and clicking one opens the event. Drag the
rail left and roughly three months of this seller's recorded weeks scroll past
as cards — real recorded weeks, time-shifted like everything else. None of them move the
bank balance, and a test enforces that, so scrolling back changes no figure on
the page. A few of those weeks carry a chain of their own — the peak week, the
sharpest rise and the sharpest fall — chosen by a rule that only fires on a move
of at least 40% against the week before. Each says what the records show, which
part moved, and what the week cannot tell you: no cash, no margin, no product
breakdown.

Say it out loud: *nothing has been hidden, it is waiting to be asked for.*

**2 — The band (10s).** There is no paragraph at the top of the screen telling
you how things stand. The reading is painted on the rail itself, over the exact
stretch of days it concerns — today to the projected low — and it drifts. Green
means clear of the reserve, amber means it holds but only just, red means it
does not hold. Hover it for the one-line version: *"Holds at $6,700.00 on Sep
17, but a payout 5 days late would break it."* Click it for the whole reading,
the figures behind it, and the thing that could change it.

The colour is not a judgement someone typed. It comes from the engine: red when
the projection breaches the reserve, amber when it holds but a delay inside the
tested range would break it, green otherwise. Run a purchase that does not fit
and watch the same band turn red.

**3 — Open a chain (15s).** Two tagged chain roots hang off the axis, and one
of them is the only thing on the screen that pulses. Click **Payout timing**.
The workspace performs a camera move: the canvas scales and slides until that
chain and the payout it hangs from fill the frame, while the rest of the
timeline fades back to a dim calendar behind it. Step 01 is already selected,
so the description is there on arrival.

The chain runs through three stacked nodes, and the colours belong to sections
rather than to whole branches: **silver → bronze → gold** — what is scheduled,
what could break, what you could do. The sales chain runs **gold → silver →
silver**. Say it out loud: *a chain is not automatically all good or all bad.*

**4 — Walk the chain (15s).** Put your hand on the right arrow key and leave it
there. The panel is a small deck: what happened, why it matters, what you could
do, the workings, then the whole step on one card. Right walks the cards, left
walks back, and going past the last card carries straight on into the next link
of the chain, because that is what a chain is. Clicking a step or a dot jumps
there directly.

Watch the timeline, not the panel. Each step brings back exactly the
days it is talking about and puts the others away: step 01 shows the supplier
payment and the payout it is being compared against, step 02 swaps the supplier
payment for the warehouse rent the engine actually blames, and step 03 shows
the ad spend and the supplier payment it proposes moving. The camera pans to
keep them in frame.

Those events are named by the Go rule that wrote each step, not guessed from
the wording, and a test rejects any step that points at a day the timeline does
not have.

The deck, the title, the chart and the evidence always describe the selected
node and nothing else. The chart shows the projected balance against the
reserve line. Each figure carries a source chip; click one and the actual Olist
query, sandbox record or named assumption opens inline.

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

**7 — The honest part (15s).** Open **Sales mix** and walk to step 03. Steps 01
and 02 light up the recorded weeks they are counting; step 03 lights up nothing
at all, because units on hand are not in the connected records and there is no
day it can point at. The interface says the same thing the prose does. In the panel: *"How many units of
your top product do you currently hold?"* — the one number that would turn the sales
pattern into a reorder decision, which the Olist release simply does not
contain. Every panel carries a way to talk at the bottom, on every card. Ask
*"What is my margin on this product?"* and it says a margin cannot be calculated
without a recorded unit cost, and will not be guessed. Open **Data sources** to show the two unrelated datasets and every
assumption behind the demo.

## If something is down

- **No Nessie key.** The opening balance comes from the committed fixture and
  says so in three places. Everything else works.
- **No AI key.** The header says `AI UNAVAILABLE`. Chat still answers — the
  engine writes the reply itself and labels it. Nothing is faked.
- **No network at the venue.** `go run ./server/cmd/preflight` after
  `npm --prefix web run build` serves the whole thing from localhost:8080 with
  no external calls.
