-- 0037 — Checkout Cups Upsell vol2 attribution.
--
-- The active Wiz checkout upsell is ID 81405: "ჭიქები - ჩექაუთი vol2".
-- Orders should be found by the checkout upsell signal, not by searching for the
-- Georgian word "ჭიქები" as a normal promotion tag. Credit only the upselled cup
-- line items, not the whole order total. In Shopify order tags this appears as
-- "CW:Upsell" alongside other tags such as "3+1" and "EasyBundle - Bundle Order".

CREATE OR REPLACE FUNCTION campaigns.attribute_checkout_cups_upsell(window_days integer DEFAULT 365)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = campaigns, public AS $b$
WITH cmp AS (
  SELECT c.id
  FROM campaigns.campaigns c
  JOIN campaigns.promotions p ON p.id = c.promotion_id
  WHERE p.source_app = 'wiz'
    AND p.name = 'Checkout Cups Upsell vol2'
  LIMIT 1
),
o AS MATERIALIZED (
  SELECT shopify_order_id soid, customer_id, created_at
  FROM public.meama_georgia_orders
  WHERE financial_status = 'paid'
    AND cancelled_at IS NULL
    AND created_at > NOW() - make_interval(days => window_days)
    AND (
      tag ILIKE '%CW:Upsell%'
      OR tag ILIKE '%CW:%Upsell%'
      OR tag ILIKE '%upsell%'
      OR promotion_name ILIKE '%upsell%'
      OR promotion_name ILIKE '%checkout cups%'
      OR promotion_name ILIKE '%ჩექაუთი vol2%'
      OR promotion_name ILIKE '%ჭიქები%'
      OR discount_code ILIKE '%81405%'
    )
),
rev AS (
  SELECT
    o.soid,
    o.customer_id,
    o.created_at,
    COALESCE(SUM(oi.price * oi.quantity), 0) AS upsell_rev
  FROM o
  JOIN public.meama_georgia_order_items oi ON oi.shopify_order_id = o.soid
  WHERE oi.sku ILIKE 'mcm%'
     OR oi.sku ILIKE '%cup%'
     OR oi.title ILIKE '%cup%'
     OR oi.title ILIKE '%ჭიქ%'
  GROUP BY o.soid, o.customer_id, o.created_at
),
ins AS (
  INSERT INTO campaigns.campaign_orders (
    campaign_id, shopify_order_id, customer_id,
    attributed_revenue, attribution_window, created_at
  )
  SELECT
    (SELECT id FROM cmp),
    r.soid,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.customers_georgia cg
        WHERE cg.shopify_customer_id = r.customer_id
      ) THEN r.customer_id
    END,
    r.upsell_rev,
    0,
    r.created_at
  FROM rev r
  WHERE r.upsell_rev > 0
    AND (SELECT id FROM cmp) IS NOT NULL
  ON CONFLICT (campaign_id, shopify_order_id) DO UPDATE
    SET attributed_revenue = EXCLUDED.attributed_revenue
  RETURNING 1
)
SELECT count(*)::int FROM ins;
$b$;

GRANT EXECUTE ON FUNCTION campaigns.attribute_checkout_cups_upsell(integer) TO service_role;

SELECT cron.schedule(
  'attribute-checkout-cups-upsell',
  '12 * * * *',
  $$ SELECT campaigns.attribute_checkout_cups_upsell(365); $$
)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'attribute-checkout-cups-upsell'
);
