-- ============================================================
-- 0009 · RLS for ETL-loaded tables
--
-- products_master, meama_georgia_orders, meama_georgia_order_items,
-- and products_georgia are loaded by the ETL pipeline (not created
-- by migrations). This migration enables RLS and adds access policies
-- consistent with 0002 (admin + analyst for financial tables).
--
-- All four functions (get_product_stats, get_product_channel_stats,
-- get_product_reorder_rates, get_product_new_metrics, get_product_top_bundles,
-- get_product_affinity_pairs) are SECURITY DEFINER so they bypass RLS
-- when called by the backend service role — no policy change needed there.
-- These policies protect direct table access via the anon/authenticated keys.
-- ============================================================

-- ── products_master ──────────────────────────────────────────────────────────
-- Read: any authenticated user (catalog data, not financial).
-- Write: admin only (ETL service role bypasses RLS).

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products_master'
  ) THEN
    ALTER TABLE products_master ENABLE ROW LEVEL SECURITY;

    CREATE POLICY IF NOT EXISTS products_master_read_auth ON products_master
      FOR SELECT USING (auth.uid() IS NOT NULL);

    CREATE POLICY IF NOT EXISTS products_master_admin_write ON products_master
      FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;

-- ── products_georgia (image URLs + variant data) ─────────────────────────────
-- Read: any authenticated user. No write policies — ETL-managed.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products_georgia'
  ) THEN
    ALTER TABLE products_georgia ENABLE ROW LEVEL SECURITY;

    CREATE POLICY IF NOT EXISTS products_georgia_read_auth ON products_georgia
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ── meama_georgia_orders ─────────────────────────────────────────────────────
-- Financial table: admin + analyst read only (same as `orders`).
-- Write: admin only.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meama_georgia_orders'
  ) THEN
    ALTER TABLE meama_georgia_orders ENABLE ROW LEVEL SECURITY;

    CREATE POLICY IF NOT EXISTS meama_georgia_orders_read_financial ON meama_georgia_orders
      FOR SELECT USING (can_read_financial());

    CREATE POLICY IF NOT EXISTS meama_georgia_orders_admin_write ON meama_georgia_orders
      FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;

-- ── meama_georgia_order_items ────────────────────────────────────────────────
-- Financial table: admin + analyst read only.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meama_georgia_order_items'
  ) THEN
    ALTER TABLE meama_georgia_order_items ENABLE ROW LEVEL SECURITY;

    CREATE POLICY IF NOT EXISTS meama_georgia_order_items_read_financial ON meama_georgia_order_items
      FOR SELECT USING (can_read_financial());

    CREATE POLICY IF NOT EXISTS meama_georgia_order_items_admin_write ON meama_georgia_order_items
      FOR ALL USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;

-- ── "Meama Products Bible" ────────────────────────────────────────────────────
-- Read-only enrichment data (capsule profiles, intensity, flavors, etc.).
-- Any authenticated user may read; no writes via API.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Meama Products Bible'
  ) THEN
    EXECUTE $inner$
      ALTER TABLE "Meama Products Bible" ENABLE ROW LEVEL SECURITY;
      CREATE POLICY IF NOT EXISTS meama_bible_read_auth ON "Meama Products Bible"
        FOR SELECT USING (auth.uid() IS NOT NULL);
    $inner$;
  END IF;
END $$;
