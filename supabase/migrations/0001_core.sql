-- ============================================================
-- MEAMA PRMTR — 0001 core schema
-- Postgres / Supabase. Retail scope = ecom + brand_store; vending/b2b/collect
-- rows are stored but tagged and excluded from retail queries.
-- ============================================================

-- ---- Enums ----
do $$ begin
    create type channel_t        as enum ('ecom','brand_store','vending','b2b','collect');
    create type region_t         as enum ('tbilisi','regions');
    create type delivery_t       as enum ('delivery','pickup');
    create type product_cat_t    as enum ('machine','capsule','accessory');
    create type product_subcat_t as enum ('flavoured','origin','functional','classic');
    create type intensity_t      as enum ('light','medium','strong');
    create type format_t         as enum ('51mm','37mm');
    create type cust_status_t     as enum ('new','active','at_risk','lost');
    create type approval_t       as enum ('pending','approved','edited','rejected');
    create type alert_sev_t      as enum ('critical','high','medium');
    create type alert_status_t   as enum ('open','resolved');
    create type action_status_t  as enum ('pending','in_progress','done');
    create type sync_status_t    as enum ('success','error','partial');
exception when duplicate_object then null; end $$;

-- ---- updated_at helper ----
create or replace function set_updated_at() returns trigger as $$
begin
    new.updated_at = now();
    return new;
end; $$ language plpgsql;

-- ---- customers ----
create table if not exists customers (
    id                  uuid primary key default gen_random_uuid(),
    shopify_customer_id text unique,
    email               text,
    first_name          text,
    last_name           text,
    phone               text,
    otp_phone           text,
    region              region_t,
    is_registered       boolean not null default false,
    registration_date   date,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists idx_customers_email  on customers (email);
create index if not exists idx_customers_region on customers (region);
create trigger trg_customers_updated before update on customers
    for each row execute function set_updated_at();

-- ---- products (SKU master) ----
create table if not exists products (
    sku                       text primary key,
    name                      text not null,
    category                  product_cat_t,
    subcategory               product_subcat_t,
    intensity                 intensity_t,
    format                    format_t,
    price                     numeric(12,2),
    cogs                      numeric(12,2),
    compatible_machine_models text[],
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now()
);
create index if not exists idx_products_category on products (category);
create trigger trg_products_updated before update on products
    for each row execute function set_updated_at();

-- ---- orders ----
create table if not exists orders (
    id               uuid primary key default gen_random_uuid(),
    shopify_order_id text unique,
    customer_id      uuid references customers(id) on delete set null,  -- nullable: guests
    channel          channel_t not null,
    status           text,
    total_price      numeric(12,2),
    discount_amount  numeric(12,2) default 0,
    promo_code       text,
    delivery_type    delivery_t,
    region           region_t,
    ordered_at       timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index if not exists idx_orders_customer  on orders (customer_id);
create index if not exists idx_orders_channel   on orders (channel);
create index if not exists idx_orders_ordered_at on orders (ordered_at);
create trigger trg_orders_updated before update on orders
    for each row execute function set_updated_at();

-- ---- order_items ----
create table if not exists order_items (
    id         uuid primary key default gen_random_uuid(),
    order_id   uuid not null references orders(id) on delete cascade,
    sku        text references products(sku),
    quantity   integer not null default 1,
    unit_price numeric(12,2),
    discount   numeric(12,2) default 0,
    created_at timestamptz not null default now()
);
create index if not exists idx_order_items_order on order_items (order_id);
create index if not exists idx_order_items_sku   on order_items (sku);

-- ---- inventory ----
create table if not exists inventory (
    sku           text primary key references products(sku) on delete cascade,
    units_on_hand integer not null default 0,
    updated_at    timestamptz not null default now()
);
create trigger trg_inventory_updated before update on inventory
    for each row execute function set_updated_at();

-- ---- customer_metrics (nightly refresh; AI fields from Claude, NOT a model) ----
create table if not exists customer_metrics (
    customer_id            uuid primary key references customers(id) on delete cascade,
    recency_score          smallint,            -- 1..5
    frequency_score        smallint,            -- 1..5
    monetary_score         smallint,            -- 1..5
    rfm_segment            text,
    cluster_tag            text,                -- Claude output
    churn_score            numeric(4,3),        -- Claude output, 0.000..1.000
    upsell_tag             boolean,             -- Claude output
    status                 cust_status_t,
    ltv                    numeric(14,2),
    aov_total              numeric(12,2),
    aov_capsules           numeric(12,2),
    discount_dependency_pct numeric(5,2),
    has_machine            boolean,
    machine_model          text,
    last_order_date        date,
    expected_next_order    date,
    computed_at            timestamptz not null default now()
);
create index if not exists idx_metrics_status  on customer_metrics (status);
create index if not exists idx_metrics_segment on customer_metrics (rfm_segment);

-- ---- campaigns ----
create table if not exists campaigns (
    id                uuid primary key default gen_random_uuid(),
    name              text not null,
    type              text,
    target_segment    text,
    channel           text,
    discount_pct      numeric(5,4),
    starts_at         timestamptz,
    ends_at           timestamptz,
    status            text,
    predicted_reach   integer,
    predicted_revenue numeric(14,2),
    actual_revenue    numeric(14,2),
    ai_draft_copy     text,
    approval_status   approval_t default 'pending',
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create trigger trg_campaigns_updated before update on campaigns
    for each row execute function set_updated_at();

-- ---- meta_insights (USD) ----
create table if not exists meta_insights (
    id           uuid primary key default gen_random_uuid(),
    campaign_id  uuid references campaigns(id) on delete cascade,
    date         date not null,
    spend_usd    numeric(14,2),
    impressions  bigint,
    clicks       bigint,
    roas         numeric(10,4),
    demographics jsonb,
    created_at   timestamptz not null default now(),
    unique (campaign_id, date)
);
create index if not exists idx_meta_insights_date on meta_insights (date);

-- ---- alerts ----
-- Cooldown-dedup pattern (used by services/alert_engine.is_duplicate):
--   SELECT 1 FROM alerts
--   WHERE type = :type AND entity_id IS NOT DISTINCT FROM :entity_id
--     AND status = 'open' AND created_at > now() - :cooldown LIMIT 1;
create table if not exists alerts (
    id            uuid primary key default gen_random_uuid(),
    type          text not null,
    severity      alert_sev_t not null,
    entity_id     text,
    message       text not null,
    status        alert_status_t not null default 'open',
    channels_sent text[] default '{}',
    created_at    timestamptz not null default now()
);
create index if not exists idx_alerts_dedup on alerts (type, entity_id, status, created_at);

-- ---- actions (Action Queue) ----
create table if not exists actions (
    id                       uuid primary key default gen_random_uuid(),
    priority                 smallint not null check (priority between 1 and 5),
    action_type              text not null,
    customer_or_segment      text,
    trigger_signal           text,
    suggested_offer          text,
    estimated_revenue_impact numeric(14,2),
    deadline                 timestamptz,
    status                   action_status_t not null default 'pending',
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);
create index if not exists idx_actions_status   on actions (status);
create index if not exists idx_actions_priority on actions (priority);
create trigger trg_actions_updated before update on actions
    for each row execute function set_updated_at();

-- ---- ai_insights (24h TTL) ----
create table if not exists ai_insights (
    id              uuid primary key default gen_random_uuid(),
    insight_type    text not null,
    scope           text,
    summary         text,
    recommendations jsonb,
    data_snapshot   jsonb,
    created_at      timestamptz not null default now(),
    expires_at      timestamptz not null default now() + interval '24 hours'
);
create index if not exists idx_ai_insights_expires on ai_insights (expires_at);

-- ---- sync_log ----
create table if not exists sync_log (
    id          uuid primary key default gen_random_uuid(),
    source      text not null,
    status      sync_status_t not null,
    records_in  integer default 0,
    error_msg   text,
    finished_at timestamptz not null default now()
);
create index if not exists idx_sync_log_source on sync_log (source, finished_at);
