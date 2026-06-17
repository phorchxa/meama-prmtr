-- ============================================================
-- 0012 · Fix get_product_stats revenue_30d overcounting
--
-- price in meama_georgia_order_items is a NET LINE TOTAL
-- (unit_price × qty, after discount), NOT a unit price.
-- So revenue = SUM(price), not SUM(qty * price).
--
-- Also expands channel filter to include mobile app source
-- '195189899265', 'online_store', 'Online Store' for consistency
-- with all other retail RPCs.
-- ============================================================

CREATE OR REPLACE FUNCTION get_product_stats()
RETURNS TABLE (
    sku         TEXT,
    units_30d   BIGINT,
    revenue_30d NUMERIC,
    repeat_rate NUMERIC,
    m0  BIGINT, m1  BIGINT, m2  BIGINT, m3  BIGINT,
    m4  BIGINT, m5  BIGINT, m6  BIGINT, m7  BIGINT,
    m8  BIGINT, m9  BIGINT, m10 BIGINT, m11 BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
WITH
retail AS (
    SELECT shopify_order_id,
           customer_id,
           processed_at
    FROM   meama_georgia_orders
    WHERE  source IN ('web', 'pos', '195189899265', 'online_store', 'Online Store')
      AND  processed_at >= NOW() - INTERVAL '13 months'
      AND  financial_status IN ('paid', 'partially_paid', 'partially_refunded')
      AND  cancelled_at IS NULL
),
items AS (
    SELECT i.sku::TEXT              AS sku,
           i.shopify_order_id       AS order_id,
           i.quantity::BIGINT       AS qty,
           i.price::NUMERIC         AS price,
           r.customer_id::TEXT      AS customer_id,
           r.processed_at
    FROM   meama_georgia_order_items i
    JOIN   retail r ON r.shopify_order_id = i.shopify_order_id
    WHERE  i.sku IS NOT NULL
      AND  i.quantity > 0
),
monthly AS (
    SELECT
        sku,
        SUM(CASE WHEN processed_at >= NOW() - INTERVAL '30 days' THEN qty   ELSE 0 END) AS units_30d,
        SUM(CASE WHEN processed_at >= NOW() - INTERVAL '30 days' THEN price ELSE 0 END) AS revenue_30d,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '11 months') THEN qty ELSE 0 END) AS m0,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '10 months') THEN qty ELSE 0 END) AS m1,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '9 months')  THEN qty ELSE 0 END) AS m2,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '8 months')  THEN qty ELSE 0 END) AS m3,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '7 months')  THEN qty ELSE 0 END) AS m4,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '6 months')  THEN qty ELSE 0 END) AS m5,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '5 months')  THEN qty ELSE 0 END) AS m6,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '4 months')  THEN qty ELSE 0 END) AS m7,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '3 months')  THEN qty ELSE 0 END) AS m8,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '2 months')  THEN qty ELSE 0 END) AS m9,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW() - INTERVAL '1 month')   THEN qty ELSE 0 END) AS m10,
        SUM(CASE WHEN date_trunc('month', processed_at) = date_trunc('month', NOW())                         THEN qty ELSE 0 END) AS m11
    FROM items
    GROUP BY sku
),
orders_per_customer AS (
    SELECT   sku,
             customer_id,
             COUNT(DISTINCT order_id) AS n_orders
    FROM     items
    WHERE    customer_id IS NOT NULL
    GROUP BY sku, customer_id
),
repeat_summary AS (
    SELECT   sku,
             COUNT(*)                                    AS total_buyers,
             COUNT(*) FILTER (WHERE n_orders > 1)       AS repeat_buyers
    FROM     orders_per_customer
    GROUP BY sku
)
SELECT
    m.sku,
    m.units_30d,
    m.revenue_30d,
    COALESCE(r.repeat_buyers::NUMERIC / NULLIF(r.total_buyers, 0), 0) AS repeat_rate,
    m.m0, m.m1, m.m2, m.m3, m.m4, m.m5, m.m6, m.m7, m.m8, m.m9, m.m10, m.m11
FROM monthly m
LEFT JOIN repeat_summary r ON r.sku = m.sku
$$;
