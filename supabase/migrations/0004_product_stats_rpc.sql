-- ============================================================
-- Product stats RPC — called by FastAPI GET /api/v1/products
-- Works on the actual ETL-loaded tables (meama_georgia_* prefix).
-- Run this once in the Supabase SQL editor.
-- ============================================================

create or replace function get_product_stats()
returns table (
    sku         text,
    units_30d   bigint,
    revenue_30d numeric,
    repeat_rate numeric,
    m0  bigint, m1  bigint, m2  bigint, m3  bigint,
    m4  bigint, m5  bigint, m6  bigint, m7  bigint,
    m8  bigint, m9  bigint, m10 bigint, m11 bigint
)
language sql
security definer
stable
as $$
with
-- Retail orders in last 13 months (ecom = web, brand store = pos)
retail as (
    select shopify_order_id,
           customer_id,
           processed_at
    from   meama_georgia_orders
    where  source in ('web', 'pos')
      and  processed_at >= now() - interval '13 months'
      and  financial_status in ('paid', 'partially_paid', 'partially_refunded')
      and  cancelled_at is null
),
-- Line items joined to those retail orders
items as (
    select i.sku::text              as sku,
           i.shopify_order_id       as order_id,
           i.quantity::bigint       as qty,
           i.price::numeric         as price,
           r.customer_id::text      as customer_id,
           r.processed_at
    from   meama_georgia_order_items i
    join   retail r on r.shopify_order_id = i.shopify_order_id
    where  i.sku is not null
      and  i.quantity > 0
),
-- 30d + 12 monthly buckets per SKU
monthly as (
    select
        sku,
        sum(case when processed_at >= now() - interval '30 days' then qty   else 0 end) as units_30d,
        sum(case when processed_at >= now() - interval '30 days' then qty * price else 0 end) as revenue_30d,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '11 months') then qty else 0 end) as m0,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '10 months') then qty else 0 end) as m1,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '9 months')  then qty else 0 end) as m2,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '8 months')  then qty else 0 end) as m3,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '7 months')  then qty else 0 end) as m4,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '6 months')  then qty else 0 end) as m5,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '5 months')  then qty else 0 end) as m6,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '4 months')  then qty else 0 end) as m7,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '3 months')  then qty else 0 end) as m8,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '2 months')  then qty else 0 end) as m9,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now() - interval '1 month')   then qty else 0 end) as m10,
        sum(case when date_trunc('month', processed_at) = date_trunc('month', now())                         then qty else 0 end) as m11
    from items
    group by sku
),
-- Repeat rate: customers who placed 2+ orders containing this SKU (13m window)
orders_per_customer as (
    select   sku,
             customer_id,
             count(distinct order_id) as n_orders
    from     items
    where    customer_id is not null
    group by sku, customer_id
),
repeat_summary as (
    select   sku,
             count(*)                                    as total_buyers,
             count(*) filter (where n_orders > 1)       as repeat_buyers
    from     orders_per_customer
    group by sku
)
select
    m.sku,
    m.units_30d,
    m.revenue_30d,
    coalesce(r.repeat_buyers::numeric / nullif(r.total_buyers, 0), 0) as repeat_rate,
    m.m0, m.m1, m.m2, m.m3, m.m4, m.m5, m.m6, m.m7, m.m8, m.m9, m.m10, m.m11
from monthly m
left join repeat_summary r on r.sku = m.sku
$$;
