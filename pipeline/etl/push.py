"""Stage 3 — push clean DuckDB tables to Supabase via upserts + sync_log.

Every push writes a `sync_log` row (success | partial | error). Silent failures
are forbidden (see CLAUDE.md conventions).
"""
from __future__ import annotations

# Order matters: parents before children (FK-safe upsert order).
PUSH_ORDER = [
    "customers",
    "products",
    "inventory",
    "orders",
    "order_items",
    "meta_insights",
]


def push(con, supabase) -> dict:
    """Upsert clean tables into Supabase. STUB — Phase 1.

    Phase 1 per table:
      rows = con.execute(f"SELECT * FROM clean_{table}").df().to_dict("records")
      supabase.table(table).upsert(rows, on_conflict=<natural_key>).execute()
      write sync_log(source=table, status=..., records_in=len(rows), finished_at=now)
    """
    _ = PUSH_ORDER
    return {"status": "stub", "stage": "push", "tables": PUSH_ORDER}
