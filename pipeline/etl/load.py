"""Stage 1 — CSV -> DuckDB staging.

A loader is registered per source NAME. There are 14 sources. We deliberately do
NOT invent column schemas — each loader is a TODO stub that, in Phase 1, will be
filled in against the actual CSV headers. The registry exists so the CLI can list
and dispatch sources today.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"


@dataclass(frozen=True)
class Source:
    name: str
    description: str
    # default expected filename in data/raw/ (confirm against real files in Phase 1)
    filename: str


# The 14 CSV sources. Filenames are placeholders to be confirmed against the
# real export set in Phase 1 — do NOT treat these as authoritative schemas.
SOURCES: list[Source] = [
    Source("orders", "Shopify orders (header level)", "orders.csv"),
    Source("order_items", "Shopify order line items", "order_items.csv"),
    Source("customers", "Shopify customers", "customers.csv"),
    Source("products", "SKU master / product catalog", "products.csv"),
    Source("inventory", "Units on hand per SKU", "inventory.csv"),
    Source("refunds", "Refunds / returns", "refunds.csv"),
    Source("discounts", "Discount / promo code usage", "discounts.csv"),
    Source("brand_store_sales", "Brand store POS sales", "brand_store_sales.csv"),
    Source("vending_sales", "Vending machine sales (non-retail, tagged)", "vending_sales.csv"),
    Source("b2b_orders", "B2B / wholesale orders (non-retail, tagged)", "b2b_orders.csv"),
    Source("collect_orders", "Collect orders (non-retail, tagged)", "collect_orders.csv"),
    Source("machine_registrations", "Machine ownership / registration", "machine_registrations.csv"),
    Source("regions", "Region reference (tbilisi / regions)", "regions.csv"),
    Source("meta_insights", "Meta ad insights export (USD)", "meta_insights.csv"),
]

# name -> loader callable. Populated by @register below.
LOADERS: dict[str, Callable[["object", Source], int]] = {}


def register(name: str):
    def _wrap(fn: Callable[["object", Source], int]):
        LOADERS[name] = fn
        return fn

    return _wrap


def _todo_loader(con, source: Source) -> int:
    """Placeholder loader — wired per source in Phase 1 against real CSV headers.

    Phase 1 body:
        path = RAW_DIR / source.filename
        con.execute(f"CREATE OR REPLACE TABLE stg_{source.name} AS "
                    f"SELECT * FROM read_csv_auto('{path}', header=true)")
        return con.execute(f"SELECT count(*) FROM stg_{source.name}").fetchone()[0]
    """
    raise NotImplementedError(
        f"Loader for source '{source.name}' is a TODO stub — implemented in Phase 1."
    )


# Register a TODO stub for every source. Replace individually in Phase 1.
for _src in SOURCES:
    register(_src.name)(_todo_loader)


def list_sources() -> list[Source]:
    return list(SOURCES)


def load_source(con, name: str) -> int:
    """Dispatch to the registered loader for `name`. Returns rows loaded."""
    source = next((s for s in SOURCES if s.name == name), None)
    if source is None:
        raise KeyError(f"Unknown source '{name}'. Known: {[s.name for s in SOURCES]}")
    return LOADERS[name](con, source)
