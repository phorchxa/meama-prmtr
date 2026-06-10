-- ============================================================
-- MEAMA PRMTR — 0002 auth roles + Row Level Security
-- Invite-only Supabase Auth. Roles: admin, analyst, marketing, viewer.
-- ============================================================

-- ---- user_roles ----
create table if not exists user_roles (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users(id) on delete cascade,
    role       text not null check (role in ('admin','analyst','marketing','viewer')),
    created_at timestamptz not null default now(),
    unique (user_id)
);

-- ---- role helper ----
create or replace function get_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role from user_roles where user_id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable as $$ select get_user_role() = 'admin'; $$;

-- can read financial data (orders, margins): admin + analyst only
create or replace function can_read_financial() returns boolean
language sql stable as $$ select get_user_role() in ('admin','analyst'); $$;

-- ---- enable RLS on EVERY table ----
alter table customers        enable row level security;
alter table products         enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;
alter table inventory        enable row level security;
alter table customer_metrics enable row level security;
alter table campaigns        enable row level security;
alter table meta_insights    enable row level security;
alter table alerts           enable row level security;
alter table actions          enable row level security;
alter table ai_insights      enable row level security;
alter table sync_log         enable row level security;
alter table user_roles       enable row level security;

-- ---- user_roles policies ----
-- a user may read their own role; only admin manages roles
create policy user_roles_self_read on user_roles
    for select using (user_id = auth.uid() or is_admin());
create policy user_roles_admin_write on user_roles
    for all using (is_admin()) with check (is_admin());

-- ---- FINANCIAL tables: orders + order_items -> admin + analyst read only ----
create policy orders_read_financial on orders
    for select using (can_read_financial());
create policy orders_admin_write on orders
    for all using (is_admin()) with check (is_admin());

create policy order_items_read_financial on order_items
    for select using (can_read_financial());
create policy order_items_admin_write on order_items
    for all using (is_admin()) with check (is_admin());

-- ---- alerts: readable by ALL authenticated; writes admin-gated ----
create policy alerts_read_all on alerts
    for select using (auth.uid() is not null);
create policy alerts_admin_write on alerts
    for all using (is_admin()) with check (is_admin());

-- ---- general read tables: any authenticated user; writes admin-gated ----
-- (products, customers, inventory, customer_metrics, campaigns, meta_insights,
--  actions, ai_insights, sync_log). meta_insights/campaigns financials are USD ad
--  data, treated as non-customer-financial and readable by authenticated users;
--  tighten in Phase 1 if marketing must be excluded from spend.
do $$
declare t text;
begin
    foreach t in array array[
        'products','customers','inventory','customer_metrics',
        'campaigns','meta_insights','actions','ai_insights','sync_log'
    ] loop
        execute format(
            'create policy %1$s_read_auth on %1$s for select using (auth.uid() is not null);',
            t);
        execute format(
            'create policy %1$s_admin_write on %1$s for all using (is_admin()) with check (is_admin());',
            t);
    end loop;
end $$;
