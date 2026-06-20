-- ============================================================
-- 0019 · Drop products_master + "SKU Matching" (and the orphan RPC)
--
-- Prereq: 0018 must be applied first. After 0018 the 6 product RPCs read
-- order_items.sku directly and take metadata from a deduped products_georgia
-- CTE — none reference products_master or "SKU Matching" anymore.
--
-- Remaining references retired here:
--   * get_product_full_stats — superseded by get_product_stats /
--     get_product_new_metrics; called by NOTHING (verified backend+frontend).
--     Its body still joined products_master, so drop it before the table.
--
-- get_product_segment_buyers (live 0013 version) already uses order_items.sku
-- + portfolio_customers — it does NOT touch products_master, so it stays.
--
-- products_georgia is now the single product catalog (keyed on variant_sku).
-- ============================================================

DROP FUNCTION IF EXISTS get_product_full_stats();

DROP TABLE IF EXISTS products_master CASCADE;
DROP TABLE IF EXISTS "SKU Matching" CASCADE;
