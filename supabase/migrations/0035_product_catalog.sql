-- Commercial-master product catalog, synced from the Google Sheets
--   "MEAMA Commercial Master 2026"  (financials: COGS, price, margins, discount logic)
--   "MEAMA Core Product Bible"      (identity, sensory, preparation)
--
-- Source of truth for the promo calculator's per-SKU economics. Distinct from
-- public.products_georgia (live Shopify catalog) — this holds curated COMMERCIAL
-- planning COGS + the discount/margin reference, keyed by the same SKU.
--
-- Margin / max-discount math is NOT stored here: the backend derives it from
-- (price_per_unit, total_cogs) via business_rules.py, the single source of truth.

CREATE TABLE IF NOT EXISTS campaigns.product_catalog (
  sku                 text        PRIMARY KEY,

  -- identity
  production_name     text,
  name_en             text,
  name_ka             text,
  product_type        text        NOT NULL DEFAULT 'capsule',
  -- 'capsule' | 'classic_coffee' | 'machine' | 'accessory'
  format              text,        -- 'Nespresso' | 'Multicapsule' | null
  category            text,
  subcategory         text,
  status              text        NOT NULL DEFAULT 'live',
  -- 'live' | 'development' | 'seasonal' | 'discontinued'

  -- pricing & economics (per-SKU, from the Format / Classic Coffee / Machines tabs)
  caps_per_pack       numeric,     -- unit count; null for non-capsule
  price_per_pack      numeric,     -- retail ₾ for the whole pack/unit
  price_per_unit      numeric,     -- ₾ per capsule (capsules) or selling price (whole units)
  production_cogs     numeric,     -- ₾ cost before packaging
  total_cogs          numeric,     -- ₾ fully-loaded cost — the calculator's COGS input
  full_margin         numeric,     -- margin fraction at full price (reference, from sheet)

  -- sensory / metadata (capsules)
  intensity           numeric,
  bitterness          numeric,
  caffeine_mg         numeric,
  flavour_notes       text,

  -- preparation (from the Preparation Guide tab)
  compatible_machines text[],
  recommended_program text,
  serving             text,

  -- commercial context (for ROI sizing in the calculator)
  sales_units         numeric,
  current_stock       numeric,

  -- provenance
  source_tab          text,        -- which sheet tab the economics came from
  raw                 jsonb,        -- untouched source cells incl. sheet's own discount columns
  synced_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_catalog_type_idx        ON campaigns.product_catalog(product_type);
CREATE INDEX IF NOT EXISTS product_catalog_category_idx    ON campaigns.product_catalog(category, subcategory);
CREATE INDEX IF NOT EXISTS product_catalog_status_idx      ON campaigns.product_catalog(status);

ALTER TABLE campaigns.product_catalog ENABLE ROW LEVEL SECURITY;

-- COGS / margins are financial data: admin + analyst only (mirrors the
-- financial-table rule in CLAUDE.md). Marketing sees products via a view if needed.
CREATE POLICY product_catalog_select ON campaigns.product_catalog
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'analyst'));

GRANT SELECT ON campaigns.product_catalog TO authenticated;
GRANT ALL    ON campaigns.product_catalog TO service_role;
