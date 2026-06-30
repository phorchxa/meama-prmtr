-- 0041 · KPI RPCs for Wholesale (B2B) and Dropper (Vending) sales channels
-- Mirrors the existing kpi_ecommerce / kpi_brand_stores pattern (base -> items join
-- products_georgia -> single aggregate row). Revenue is NET of 18% VAT (total / 1.18),
-- per CLAUDE.md convention. Capsules identified by products_georgia.product_type ILIKE
-- '%capsule%'.
--
-- gross_margin_pct is returned as NULL on purpose: COGS in products_georgia.cost_per_item
-- cannot be reconciled with order-line prices today. For B2B only ~32% of line revenue has
-- any cost_per_item, and that cost is per-single-capsule (~₾0.80) while the line price is
-- per-pack (~₾87, ~10.8 capsules/pack) — a unit mismatch that makes any computed margin
-- meaningless (~100%). For Vending, ZERO matched lines carry a cost_per_item at all. The
-- column is kept for forward-compatibility; the UI shows "—" until COGS is backfilled with
-- per-sold-unit costs (see migration 0008 / products_georgia).
--
-- NOTE: an earlier partial version of these functions existed with a different return
-- signature (gross revenue, fewer columns). DROP first — CREATE OR REPLACE cannot change a
-- function's OUT columns.
DROP FUNCTION IF EXISTS public.kpi_wholesale(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.kpi_dropper(timestamptz, timestamptz);

-- ───────────────────────────────────────────────────────────────────────────
-- Wholesale (B2B): b2b_orders / b2b_order_items / products_georgia
-- account = b2b_orders.customer_id (ordering customer)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpi_wholesale(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(
  revenue          numeric,
  active_accounts  bigint,
  new_accounts     bigint,
  reorder_rate     numeric,
  aov_per_account  numeric,
  capsule_aov      numeric,
  order_frequency  numeric,
  gross_margin_pct numeric
)
LANGUAGE sql
AS $function$
  WITH base AS (
    SELECT o.shopify_order_id, o.customer_id, o.total
    FROM b2b_orders o
    WHERE COALESCE(o.processed_at, o.created_at) >= p_from
      AND COALESCE(o.processed_at, o.created_at) <  p_to
      AND COALESCE(o.financial_status, '') <> 'voided'
      AND o.cancelled_at IS NULL
      AND o.customer_id IS NOT NULL
  ),
  with_caps AS (
    SELECT b.shopify_order_id, b.customer_id, b.total,
           MAX(CASE WHEN pg.product_type ILIKE '%capsule%' THEN 1 ELSE 0 END)::int AS has_capsule
    FROM base b
    LEFT JOIN b2b_order_items oi ON oi.shopify_order_id = b.shopify_order_id
    LEFT JOIN products_georgia pg ON pg.variant_sku = oi.sku
    GROUP BY b.shopify_order_id, b.customer_id, b.total
  ),
  active AS (SELECT DISTINCT customer_id FROM base),
  prior AS (
    SELECT DISTINCT customer_id FROM b2b_orders
    WHERE COALESCE(processed_at, created_at) < p_from
      AND COALESCE(financial_status, '') <> 'voided' AND cancelled_at IS NULL
      AND customer_id IS NOT NULL
  ),
  firsts AS (
    SELECT customer_id, MIN(COALESCE(processed_at, created_at)) AS f
    FROM b2b_orders
    WHERE COALESCE(financial_status, '') <> 'voided' AND cancelled_at IS NULL
      AND customer_id IS NOT NULL
    GROUP BY customer_id
  )
  SELECT
    ROUND(SUM(wc.total) / 1.18, 2)                                                AS revenue,
    COUNT(DISTINCT wc.customer_id)::bigint                                        AS active_accounts,
    (SELECT COUNT(*) FROM firsts WHERE f >= p_from AND f < p_to)::bigint          AS new_accounts,
    ROUND(100.0 * (SELECT COUNT(*) FROM active a WHERE a.customer_id IN (SELECT customer_id FROM prior))
      / NULLIF((SELECT COUNT(*) FROM active), 0), 2)                              AS reorder_rate,
    ROUND((SUM(wc.total) / 1.18) / NULLIF(COUNT(DISTINCT wc.customer_id), 0), 2)  AS aov_per_account,
    ROUND(AVG(CASE WHEN wc.has_capsule = 1 THEN wc.total / 1.18 END), 2)          AS capsule_aov,
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT wc.customer_id), 0), 2)       AS order_frequency,
    NULL::numeric                                                                 AS gross_margin_pct  -- COGS not reconcilable; see header
  FROM with_caps wc;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- Dropper (Vending): vending_orders / vending_order_items / products_georgia
-- machine = vending_orders.vms_id
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpi_dropper(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(
  caps_per_machine_day numeric,
  active_machines      bigint,
  new_placements       bigint,
  rev_per_machine      numeric,
  capsule_price        numeric,
  gross_margin_pct     numeric
)
LANGUAGE sql
AS $function$
  WITH base AS (
    SELECT o.shopify_order_id, o.vms_id, o.total,
           COALESCE(o.processed_at, o.created_at) AS ts
    FROM vending_orders o
    WHERE COALESCE(o.processed_at, o.created_at) >= p_from
      AND COALESCE(o.processed_at, o.created_at) <  p_to
      AND COALESCE(o.financial_status, '') <> 'voided'
      AND o.cancelled_at IS NULL
      AND o.vms_id IS NOT NULL
  ),
  -- Vending dispenses are effectively all capsules; the products_georgia mapping is too
  -- incomplete for vending SKUs (~40% match) to filter on, so total line quantity is the
  -- accurate "capsules dispensed" basis.
  items AS (
    SELECT oi.quantity, oi.price
    FROM base b
    JOIN vending_order_items oi ON oi.shopify_order_id = b.shopify_order_id
  ),
  firsts AS (
    SELECT vms_id, MIN(COALESCE(processed_at, created_at)) AS f
    FROM vending_orders
    WHERE COALESCE(financial_status, '') <> 'voided' AND cancelled_at IS NULL AND vms_id IS NOT NULL
    GROUP BY vms_id
  ),
  agg AS (
    SELECT COUNT(DISTINCT vms_id)     AS machines,
           COUNT(DISTINCT date(ts))   AS active_days,
           SUM(total)                 AS gross_rev
    FROM base
  )
  SELECT
    ROUND((SELECT SUM(quantity) FROM items)::numeric
      / NULLIF((SELECT machines FROM agg), 0)
      / NULLIF((SELECT active_days FROM agg), 0), 1)                             AS caps_per_machine_day,
    (SELECT machines FROM agg)::bigint                                           AS active_machines,
    (SELECT COUNT(*) FROM firsts WHERE f >= p_from AND f < p_to)::bigint         AS new_placements,
    ROUND((SELECT gross_rev FROM agg) / 1.18 / NULLIF((SELECT machines FROM agg), 0), 2) AS rev_per_machine,
    ROUND((SELECT SUM(quantity * price) / 1.18 FROM items)
      / NULLIF((SELECT SUM(quantity) FROM items), 0), 2)                         AS capsule_price,
    NULL::numeric                                                               AS gross_margin_pct;  -- no vending COGS; see header
$function$;
