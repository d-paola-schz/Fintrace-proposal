# Fintrace Proposal

## 1. Competitive Differentiation

Fintrace is not another accounting dashboard. Its purpose is to help a small e-commerce business answer a decision-oriented question:

> **"Can I safely spend this money on this date without breaking my minimum cash reserve?"**

Most common financial tools focus on recording transactions, reporting historical performance, or showing the current account balance. Fintrace instead focuses on the **timing of future cash movements** and how those movements affect the user's ability to spend.

### Fintrace vs. traditional tools

| Capability | Spreadsheet | Accounting software | Basic banking dashboard | Fintrace |
|---|---|---|---|---|
| Current balance | Manual / imported | Yes | Yes | Yes |
| Historical reporting | Yes | Yes | Limited | Yes |
| Future cash-flow timeline | Manual | Limited / configuration-dependent | Limited | **Core feature** |
| "What if?" spending scenarios | Manual | Limited | Usually unavailable | **Core feature** |
| Minimum cash reserve | Manual | Possible | Usually unavailable | **Built into decision logic** |
| Evidence behind a recommendation | User-built | Varies | Limited | **Explicit evidence chains** |
| Source of every number | Often unclear | Varies | Usually unclear | **Explicit provenance** |
| AI-generated explanation | Optional / external | Product-dependent | Product-dependent | **Optional and non-authoritative** |
| Deterministic financial calculations | Depends on implementation | Yes for recorded data | Yes | **Core design principle** |

The differentiation is therefore not simply "we use AI." The main differentiator is the combination of:

1. **Time-aware cash-flow decisions**
2. **Deterministic calculations**
3. **Transparent data provenance**
4. **Evidence chains explaining why a decision is considered safe or risky**
5. **Explicit handling of missing information instead of invented values**

Fintrace is designed to be honest about what it knows, what it assumes, and what it cannot calculate.

---

## 2. Market Gap

Small e-commerce businesses can have positive sales and still experience cash-flow problems because money does not necessarily arrive when expenses are due.

A seller may have:

- Upcoming supplier payments
- Advertising expenses
- Rent or operating costs
- Inventory purchases
- Marketplace commissions
- Periodic marketplace payouts

Traditional accounting tools are primarily designed to **record and report financial activity**. Banking dashboards are primarily designed to **show account information**. Neither necessarily answers the operational question that Fintrace focuses on:

> **"If I spend this amount today, what happens to my cash position before my next incoming payment?"**

This creates a gap between **financial visibility** and **financial decision support**.

Fintrace addresses that gap by combining current cash, future obligations, expected incoming payments, user-defined assumptions, and a minimum cash reserve into a single decision-oriented timeline.

The product therefore sits between:

**Accounting → Banking → Decision Support**

rather than trying to replace either accounting or banking.

---

## 3. Substantiated Business Model

Fintrace is initially designed around a **freemium SaaS model**.

### Free tier

The free version would provide enough functionality for a small seller to experience the core value proposition:

- Basic cash-flow timeline
- Basic projected cash position
- Limited scenarios
- Safe-to-spend analysis

### Pro tier

A paid tier could target businesses that make cash-flow decisions frequently.

Potential features:

- Multiple accounts
- More scenarios
- Cash-flow alerts
- Advanced what-if analysis
- More integrations
- Higher event and data limits

### Business tier

A higher tier could target growing businesses and teams:

- Multiple users
- Multiple businesses/accounts
- Advanced integrations
- Additional controls and reporting

A working pricing hypothesis for the Pro tier is approximately **$20/month ($240/year)**. This is not presented as validated pricing; it is a testable assumption for an initial pilot.

### Why would users pay?

Fintrace creates value by helping businesses avoid or better time potentially costly cash-flow mistakes.

The product is not selling another financial report. It is selling **confidence before a financial decision**.

A user does not need to ask:

> "How much money do I have?"

They can ask:

> **"Can I spend $3,000 on ads in four days?"**

Fintrace provides a calculation, the evidence behind it, and possible alternatives.

---

## 4. Market Size — TAM / SAM / SOM

The U.S. provides a large potential market for a product aimed at small businesses. The U.S. Small Business Administration's 2025 Small Business Profile reports **36.2 million small businesses** in the United States.

This number is useful as a market anchor, but it should not be presented as if all 36.2 million businesses were immediate Fintrace customers. Fintrace is intentionally starting with a narrower e-commerce segment.

### TAM — Total Addressable Market

For an upper-bound subscription model, assume all U.S. small businesses were potential customers.

**36.2 million businesses × $240/year = approximately $8.69 billion annual revenue opportunity.**

This is an **upper-bound TAM scenario**, not a claim that every small business needs Fintrace.

### SAM — Serviceable Available Market

Fintrace's initial serviceable market is smaller:

> **Small e-commerce businesses with recurring expenses, periodic payouts, and a need for cash-flow planning.**

Because there is no single federal statistic that directly identifies exactly how many small businesses match this specific profile, we use an explicit business assumption rather than presenting an unsourced number as fact.

For an initial planning scenario, assume **10% of the small-business base** fits the target profile:

**36.2 million × 10% = 3.62 million businesses**

**3.62 million × $240/year = approximately $869 million annual SAM.**

The 10% figure is a **planning assumption to be validated through customer research and pilot adoption**, not a sourced market statistic.

### SOM — Serviceable Obtainable Market

Fintrace should not attempt to acquire the entire SAM immediately.

As a conservative initial scenario, assume the company captures **1% of the modeled SAM**:

**3.62 million × 1% = 36,200 customers**

**36,200 × $240/year = approximately $8.7 million ARR.**

This is an illustrative early-scale scenario, not a forecast.

### Why use explicit assumptions?

Market sizing becomes more credible when sourced facts and business assumptions are clearly separated.

Therefore:

- **36.2 million** = externally sourced small-business count
- **$240/year** = Fintrace pricing hypothesis
- **10%** = SAM planning assumption
- **1%** = SOM planning assumption

This approach avoids presenting invented precision as if it were market research.

---

## 5. Adoption Strategy / Go-To-Market

Fintrace should initially target businesses that already experience the specific problem the product solves:

> **Small e-commerce sellers whose cash inflows and cash outflows are poorly synchronized.**

The initial go-to-market strategy is product-led:

### Step 1 — Focus on a narrow beachhead

Target small online sellers with:

- Marketplace payouts
- Supplier payments
- Advertising expenses
- Inventory costs
- Tight cash reserves

### Step 2 — Demonstrate immediate value

Instead of asking a user to configure a complex financial dashboard, Fintrace starts with a concrete question:

> **"Can I spend $3,000 on ads in four days?"**

The user immediately receives a calculated answer.

### Step 3 — Show the evidence

The user can inspect the timeline and evidence chains behind the result.

This makes the product's recommendation transparent instead of presenting it as a black-box score.

### Step 4 — Convert high-value users

Users who repeatedly use Fintrace can move to the Pro tier for:

- More scenarios
- More accounts
- Alerts
- Integrations
- Advanced analysis

### Step 5 — Expand through partnerships

Once the product is validated, Fintrace could expand through:

- E-commerce platforms
- Marketplaces
- Accounting platforms
- Business banking partnerships

### Long-term Capital One opportunity

The strongest long-term opportunity is not necessarily to keep Fintrace as an independent SaaS application.

Its cash-flow decision engine could become an embedded capability inside business banking.

Instead of showing only:

> **Current balance: $8,400**

a banking product could potentially show:

> **Safe to spend: $2,100**

and explain the calculation using upcoming obligations, expected payouts, and the user's minimum reserve.

This would turn banking information into **actionable cash-flow decision support**.

---

## 6. Why Fintrace Can Scale Beyond the Prototype

The current prototype uses:

- **Olist** for historical e-commerce data
- **Capital One Nessie** for a simulated banking environment
- **Declared assumptions** for information that is not available from those sources

These sources are intentionally separated and are not presented as if they belonged to the same real customer.

The production architecture can replace these inputs with:

```text
Real banking data
        +
Real marketplace data
        +
User-provided information
        ↓
Deterministic calculation engine
        ↓
Cash-flow decision
        ↓
Optional AI explanation
```
---

## 9. Specific User Persona

The following image presents the specific user persona defined for Fintrace.

<!-- Insert User Persona image here -->

---

## 10. Structured User Journey Map

The following image presents the structured user journey map for Fintrace.

<!-- Insert User Journey Map image here -->
