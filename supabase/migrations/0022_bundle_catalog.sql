CREATE TABLE IF NOT EXISTS campaigns.bundle_catalog (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id  bigint      UNIQUE NOT NULL,
  title               text        NOT NULL,
  bundle_app          text        NOT NULL DEFAULT 'unknown',
  -- 'simple_bundles' | 'easy_bundle' | 'wiz' | 'unknown'
  status              text        NOT NULL DEFAULT 'active',
  -- 'active' | 'draft' | 'archived'
  price               numeric,
  compare_at_price    numeric,
  tag_pattern         text,
  promotion_id        uuid        REFERENCES campaigns.promotions(id) ON DELETE SET NULL,
  component_skus      text[],
  component_titles    text[],
  raw                 jsonb,
  shopify_created_at  timestamptz,
  shopify_updated_at  timestamptz,
  synced_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bundle_catalog_bundle_app_idx  ON campaigns.bundle_catalog(bundle_app);
CREATE INDEX IF NOT EXISTS bundle_catalog_status_idx      ON campaigns.bundle_catalog(status);
CREATE INDEX IF NOT EXISTS bundle_catalog_promotion_id_idx ON campaigns.bundle_catalog(promotion_id);

ALTER TABLE campaigns.bundle_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY bundle_catalog_select ON campaigns.bundle_catalog
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'analyst', 'marketing'));

GRANT SELECT ON campaigns.bundle_catalog TO authenticated, anon;
GRANT ALL   ON campaigns.bundle_catalog TO service_role;
