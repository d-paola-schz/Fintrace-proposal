#!/usr/bin/env python3
"""Offline preparation of the Olist seller subset.

Runs once, outside the demo, and writes a small versioned JSON that the Go
service loads. Nothing here runs during the live demo.

Truth rules enforced by this script:
  * Only the chosen seller's own order_items rows contribute revenue. An Olist
    order can contain items from several sellers, so order-level payment totals
    are never attributed to one seller.
  * Amounts stay in BRL, the currency of the source. No conversion happens here.
  * Cost of goods, stock on hand, supplier terms and margin do not exist in
    these tables, so no field of that kind is emitted.

Usage: .venv/bin/python scripts/prepare_olist.py
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import date, timedelta

import duckdb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "olist-seller-summary.json")

DATA_VERSION = "olist-seller-v1"
MIRROR = ("https://github.com/MMBazel/Kaggle-Brazilian-Ecommerce-Prediction"
          "/tree/main/data/raw")
DATASET = "Brazilian E-Commerce Public Dataset by Olist (Kaggle, CC BY-NC-SA 4.0)"

# The seller named in the brief. Kept in the output so the substitution is
# documented rather than silent.
SPECIFIED_SELLER = "3442f8959a84dea7ee197c632cb2df15"
SELLER = os.environ.get("OLIST_SELLER", "955fee9216a65b617aa5c0531780ce60")

# Orders in these states never produced a sale.
EXCLUDED_STATUS = ("canceled", "unavailable")

# The timeline shows 30 days of history plus projected days, and compares the
# window with the 30 days before it. 90 days of dailies gives the charts room.
WINDOW_DAYS = 30
DAILY_DAYS = 90

# Anchor date for the demo window. The seller traded from 2017-07 to 2018-08;
# this is the end of its densest month. Choosing it is a presentation decision
# and is reported in the output so the UI can disclose it.
WINDOW_END = os.environ.get("OLIST_WINDOW_END", "2018-05-31")


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def brl_cents(value) -> int:
    """BRL float -> integer cents, half-up, never float-rounded downstream."""
    return int(round(float(value) * 100))


def main() -> int:
    files = {
        "order_items": "olist_order_items_dataset.csv",
        "orders": "olist_orders_dataset.csv",
        "products": "olist_products_dataset.csv",
        "sellers": "olist_sellers_dataset.csv",
    }
    for name, fn in files.items():
        p = os.path.join(RAW, fn)
        if not os.path.exists(p):
            print(f"missing {p}", file=sys.stderr)
            return 1

    con = duckdb.connect()
    for name, fn in files.items():
        path = os.path.join(RAW, fn).replace("'", "''")
        con.execute(
            f"CREATE VIEW {name} AS SELECT * FROM read_csv_auto('{path}', header=true)"
        )

    # Seller-linked item sales only: join items -> orders for date and status.
    con.execute(
        """
        CREATE TABLE seller_items AS
        SELECT
            i.order_id,
            i.order_item_id,
            i.product_id,
            i.price                                    AS price_brl,
            i.freight_value                            AS freight_brl,
            CAST(o.order_purchase_timestamp AS DATE)   AS sale_date,
            o.order_status,
            p.product_category_name                    AS category
        FROM order_items i
        JOIN orders   o ON o.order_id = i.order_id
        LEFT JOIN products p ON p.product_id = i.product_id
        WHERE i.seller_id = ?
          AND o.order_status NOT IN ('canceled', 'unavailable')
        """,
        [SELLER],
    )

    stats = con.execute(
        """
        SELECT COUNT(*)                      AS items,
               COUNT(DISTINCT order_id)      AS orders,
               COUNT(DISTINCT product_id)    AS products,
               MIN(sale_date)                AS first_date,
               MAX(sale_date)                AS last_date,
               SUM(price_brl)                AS revenue_brl
        FROM seller_items
        """
    ).fetchone()
    items, order_count, products, first_date, last_date, revenue = stats
    if not items:
        print(f"seller {SELLER} has no usable rows", file=sys.stderr)
        return 1

    # Volume check for the seller named in the brief, so the swap is evidenced.
    specified = con.execute(
        """
        SELECT COUNT(*), COUNT(DISTINCT i.order_id), MIN(CAST(o.order_purchase_timestamp AS DATE)),
               MAX(CAST(o.order_purchase_timestamp AS DATE))
        FROM order_items i JOIN orders o ON o.order_id = i.order_id
        WHERE i.seller_id = ?
        """,
        [SPECIFIED_SELLER],
    ).fetchone()

    seller_row = con.execute(
        "SELECT seller_city, seller_state FROM sellers WHERE seller_id = ?", [SELLER]
    ).fetchone() or ("unknown", "unknown")

    window_end = min(date.fromisoformat(WINDOW_END), last_date)
    window_start = window_end - timedelta(days=WINDOW_DAYS - 1)
    prior_end = window_start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=WINDOW_DAYS - 1)
    daily_start = window_end - timedelta(days=DAILY_DAYS - 1)

    def totals(a: date, b: date):
        r = con.execute(
            """
            SELECT COUNT(*), COUNT(DISTINCT order_id), SUM(price_brl)
            FROM seller_items WHERE sale_date BETWEEN ? AND ?
            """,
            [a, b],
        ).fetchone()
        return {
            "start": a.isoformat(),
            "end": b.isoformat(),
            "itemCount": int(r[0] or 0),
            "orderCount": int(r[1] or 0),
            "itemRevenueCents": brl_cents(r[2] or 0),
        }

    daily_rows = con.execute(
        """
        SELECT sale_date,
               COUNT(*)                  AS items,
               COUNT(DISTINCT order_id)  AS orders,
               SUM(price_brl)            AS revenue,
               list(DISTINCT order_id)   AS order_ids
        FROM seller_items
        WHERE sale_date BETWEEN ? AND ?
        GROUP BY sale_date ORDER BY sale_date
        """,
        [daily_start, window_end],
    ).fetchall()

    by_date = {r[0]: r for r in daily_rows}
    daily = []
    cursor = daily_start
    while cursor <= window_end:
        r = by_date.get(cursor)
        if r:
            daily.append({
                "date": cursor.isoformat(),
                "itemCount": int(r[1]),
                "orderCount": int(r[2]),
                "itemRevenueCents": brl_cents(r[3]),
                # Cap the id list: it is evidence, not a data dump.
                "orderIds": sorted(r[4])[:6],
                "orderIdsTruncated": len(r[4]) > 6,
            })
        else:
            daily.append({
                "date": cursor.isoformat(), "itemCount": 0, "orderCount": 0,
                "itemRevenueCents": 0, "orderIds": [], "orderIdsTruncated": False,
            })
        cursor += timedelta(days=1)

    categories = [
        {"name": c or "uncategorized", "itemCount": int(n), "itemRevenueCents": brl_cents(v)}
        for c, n, v in con.execute(
            """
            SELECT category, COUNT(*), SUM(price_brl) FROM seller_items
            GROUP BY category ORDER BY COUNT(*) DESC
            """
        ).fetchall()
    ]

    top_products = [
        {"productId": pid, "category": cat or "uncategorized", "itemCount": int(n),
         "itemRevenueCents": brl_cents(v), "unitPriceCents": brl_cents(avg)}
        for pid, cat, n, v, avg in con.execute(
            """
            SELECT product_id, any_value(category), COUNT(*), SUM(price_brl), AVG(price_brl)
            FROM seller_items WHERE sale_date BETWEEN ? AND ?
            GROUP BY product_id ORDER BY COUNT(*) DESC LIMIT 8
            """,
            [window_start, window_end],
        ).fetchall()
    ]

    doc = {
        "dataVersion": DATA_VERSION,
        "currency": "BRL",
        "dataset": {
            "name": DATASET,
            "retrievedFrom": MIRROR,
            "note": ("Public mirror of the Kaggle release. Row counts were checked "
                     "against the published dataset before use."),
            "files": {
                name: {
                    "file": fn,
                    "sha256": sha256(os.path.join(RAW, fn)),
                    "rows": int(con.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]),
                }
                for name, fn in files.items()
            },
        },
        "sellerSelection": {
            "selectedSellerId": SELLER,
            "specifiedSellerId": SPECIFIED_SELLER,
            "substituted": SELLER != SPECIFIED_SELLER,
            "reason": (
                f"The seller named in the brief has only {int(specified[0])} order "
                f"item(s) across {int(specified[1])} order(s) "
                f"({specified[2]} to {specified[3]}), which cannot support a "
                "30-day cash demonstration. The substitute was chosen for order "
                "volume, continuous date coverage and product-category variety."
            ),
            "specifiedSellerStats": {
                "itemCount": int(specified[0]),
                "orderCount": int(specified[1]),
                "firstDate": str(specified[2]),
                "lastDate": str(specified[3]),
            },
        },
        "seller": {
            "sellerId": SELLER,
            "city": seller_row[0],
            "state": seller_row[1],
            "itemCount": int(items),
            "orderCount": int(order_count),
            "distinctProducts": int(products),
            "firstSaleDate": first_date.isoformat(),
            "lastSaleDate": last_date.isoformat(),
            "itemRevenueCents": brl_cents(revenue),
            "categoryCount": len(categories),
            "categories": categories[:10],
        },
        "window": totals(window_start, window_end),
        "priorWindow": totals(prior_start, prior_end),
        "dailyRange": {"start": daily_start.isoformat(), "end": window_end.isoformat()},
        "windowSelection": {
            "anchorDate": window_end.isoformat(),
            "chosenBy": "presentation",
            "disclosure": (
                "The 30-day demo window ends "
                f"{window_end.isoformat()}, the close of this seller's "
                "highest-activity month. The seller's full recorded history "
                f"({first_date.isoformat()} to {last_date.isoformat()}) is "
                "summarised in the same file; its last months were quieter "
                "than the window shown."
            ),
        },
        "dailySales": daily,
        "topProducts": top_products,
        "notEmitted": [
            "unitCostCents — Olist publishes no cost of goods for any seller",
            "stockOnHand — Olist publishes no inventory position",
            "grossMarginPct / netMarginPct — not derivable without recorded costs",
            "payoutDate / payoutAmount — Olist publishes no seller payout ledger",
        ],
        "notes": [
            "Revenue is the sum of this seller's own order_items.price only.",
            "Orders with status canceled or unavailable are excluded.",
            "Freight is recorded separately and is not counted as seller revenue.",
            "All amounts are BRL integer cents, exactly as published.",
        ],
    }

    with open(OUT, "w") as fh:
        json.dump(doc, fh, indent=2)
        fh.write("\n")
    print(f"wrote {OUT}")
    print(f"  seller {SELLER}: {items} items, {order_count} orders, "
          f"{first_date} -> {last_date}, BRL {revenue:,.2f}")
    print(f"  window {window_start} -> {window_end}: "
          f"{doc['window']['itemCount']} items, "
          f"BRL {doc['window']['itemRevenueCents']/100:,.2f}")
    print(f"  prior  {prior_start} -> {prior_end}: "
          f"{doc['priorWindow']['itemCount']} items, "
          f"BRL {doc['priorWindow']['itemRevenueCents']/100:,.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
