-- Shopify discounts mirror, populated via webhook (edge function: shopify-discounts-webhook)
CREATE TABLE IF NOT EXISTS campaigns.shopify_discounts (
  shopify_id                bigint      PRIMARY KEY,
  title                     text        NOT NULL,
  status                    text,                          -- ACTIVE | EXPIRED | SCHEDULED
  discount_type             text,                          -- percentage | fixed_amount | buy_x_get_y | free_shipping
  value                     numeric,
  value_type                text,                          -- percentage | fixed_amount
  code                      text,                          -- first/only discount code (NULL for automatic)
  usage_count               integer     NOT NULL DEFAULT 0,
  usage_limit               integer,
  applies_once_per_customer boolean     NOT NULL DEFAULT false,
  starts_at                 timestamptz,
  ends_at                   timestamptz,
  raw                       jsonb,                         -- full Shopify payload
  shopify_created_at        timestamptz,
  shopify_updated_at        timestamptz,
  synced_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopify_discounts_status_idx  ON campaigns.shopify_discounts (status);
CREATE INDEX IF NOT EXISTS shopify_discounts_code_idx    ON campaigns.shopify_discounts (code);
CREATE INDEX IF NOT EXISTS shopify_discounts_ends_at_idx ON campaigns.shopify_discounts (ends_at);

-- RLS: service_role writes (webhook), admin/analyst read
ALTER TABLE campaigns.shopify_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_analyst_read_shopify_discounts"
  ON campaigns.shopify_discounts FOR SELECT
  USING (
    auth.jwt() ->> 'role' IN ('admin', 'analyst', 'marketing')
  );
