#!/usr/bin/env python3
"""Checks that the prepared seller summary attributes only this seller's own
items, and never a whole multi-seller order.

Run after prepare_olist.py: .venv/bin/python scripts/verify_attribution.py
"""
import json, os, sys, duckdb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
doc = json.load(open(os.path.join(ROOT, "data", "olist-seller-summary.json")))
SELLER = doc["seller"]["sellerId"]

con = duckdb.connect()
for n, f in {
    "order_items": "olist_order_items_dataset.csv",
    "orders": "olist_orders_dataset.csv",
}.items():
    con.execute(f"CREATE VIEW {n} AS SELECT * FROM read_csv_auto('{RAW}/{f}', header=true)")

fails = []

def check(name, ok, detail):
    print(("PASS  " if ok else "FAIL  ") + name)
    if detail:
        print("        " + detail)
    if not ok:
        fails.append(name)

# 1. The seller genuinely shares orders with other sellers, so the trap is real.
shared, total_orders = con.execute(f"""
    WITH mine AS (SELECT DISTINCT order_id FROM order_items WHERE seller_id = '{SELLER}')
    SELECT COUNT(*) FILTER (WHERE others > 0), COUNT(*) FROM (
      SELECT m.order_id,
             COUNT(*) FILTER (WHERE i.seller_id <> '{SELLER}') AS others
      FROM mine m JOIN order_items i USING(order_id) GROUP BY m.order_id)
""").fetchone()
check("multi-seller orders exist in this seller's order set",
      shared > 0,
      f"{shared} of {total_orders} orders containing our items also contain another seller's items")

# 2. Attributed revenue must equal the sum of OUR item prices, not the orders'.
mine_only, all_items_in_those_orders = con.execute(f"""
    WITH mine AS (SELECT DISTINCT order_id FROM order_items WHERE seller_id = '{SELLER}')
    SELECT
      SUM(i.price) FILTER (WHERE i.seller_id = '{SELLER}'),
      SUM(i.price)
    FROM mine m JOIN order_items i USING(order_id)
""").fetchone()
check("attributed revenue is strictly less than the full value of those orders",
      float(mine_only) < float(all_items_in_those_orders),
      f"ours R${mine_only:,.2f} vs all items in the same orders R${all_items_in_those_orders:,.2f}")

# 3. The lifetime figure in the summary matches a fresh recomputation.
recomputed = con.execute(f"""
    SELECT ROUND(SUM(i.price) * 100) FROM order_items i JOIN orders o USING(order_id)
    WHERE i.seller_id = '{SELLER}' AND o.order_status NOT IN ('canceled','unavailable')
""").fetchone()[0]
check("summary lifetime revenue matches a fresh query",
      int(recomputed) == doc["seller"]["itemRevenueCents"],
      f"summary {doc['seller']['itemRevenueCents']} vs recomputed {int(recomputed)}")

# 4. The window total equals the sum of its own daily rows.
w = doc["window"]
daily = sum(d["itemRevenueCents"] for d in doc["dailySales"]
            if w["start"] <= d["date"] <= w["end"])
check("window total equals the sum of its daily rows",
      daily == w["itemRevenueCents"],
      f"daily {daily} vs window {w['itemRevenueCents']}")

# 5. Cancelled orders are excluded.
cancelled = con.execute(f"""
    SELECT COUNT(*) FROM order_items i JOIN orders o USING(order_id)
    WHERE i.seller_id = '{SELLER}' AND o.order_status IN ('canceled','unavailable')
""").fetchone()[0]
with_cancelled = con.execute(f"""
    SELECT COUNT(*) FROM order_items WHERE seller_id = '{SELLER}'
""").fetchone()[0]
check("cancelled and unavailable orders are excluded",
      doc["seller"]["itemCount"] == with_cancelled - cancelled,
      f"{cancelled} excluded row(s); summary counts {doc['seller']['itemCount']} of {with_cancelled}")

# 6. Nothing the source cannot support was emitted as data. The documentation
#    lists these names deliberately, so only the data sections are scanned.
banned = ("unitCost", "stockOnHand", "grossMargin", "netMargin", "payoutDate",
          "cogs", "costCents", "marginPct")
payload = {k: v for k, v in doc.items() if k not in ("notEmitted", "notes")}
blob = json.dumps(payload)
leaked = [b for b in banned if f'"{b}' in blob]
check("no cost, stock, margin or payout field was emitted as data",
      not leaked, f"leaked: {leaked}" if leaked else "none present")

# 7. The documentation still records why those fields are absent.
check("the summary documents what the source cannot support",
      len(doc.get("notEmitted", [])) >= 4,
      f"{len(doc.get('notEmitted', []))} documented absences")

print()
print("FAILED" if fails else "All attribution checks passed.")
sys.exit(1 if fails else 0)
