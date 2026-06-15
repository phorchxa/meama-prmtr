-- ============================================================
-- 0009 · Populate cogs for variant SKUs (machines & accessories)
-- These SKUs exist as color/style variants of the parent SKU
-- provided by team leader. COGS is identical across colors.
-- Avorebundle100 skipped — not found in products_master.
-- ============================================================

UPDATE products_master SET cogs = v.cogs
FROM (VALUES
  -- Pinta (Espresso machine, 2 colors)
  ('Pinta-Black-0000',                    164.177),
  ('Pinta-White-0000',                    164.177),
  -- Multicapsule K51 (4 colors + uuid duplicate)
  ('K51CM0000000-BLACK',                  107.320),
  ('K51CM0000000-GRAY',                   107.320),
  ('K51CM0000000-RED',                    107.320),
  ('K51CM0000000-WHITE',                  107.320),
  ('K51CM0000000-WHITE-fake',             107.320),
  ('4dcde103-e0ba-4164-819c-c74dd0982e6f', 107.320),
  -- Versatile (4 colors + uuid duplicate)
  ('Versatile-Black-11B10000000000',      268.600),
  ('Versatile-Blue-13BL10000000000',      268.600),
  ('Versatile-Pastel Green-12G10000000000', 268.600),
  ('Versatile-White-10W10000000000',      268.600),
  ('85b06405-eda6-430e-89b6-d036229177ee', 268.600),
  -- Milk Frother (2 colors + 3rd-party sku)
  ('Milk Frother-Black-0000',              85.000),
  ('Milk Frother-White-0000',              85.000),
  ('MS-130TEU',                            85.000),
  -- Glass cups 250ml (4 color variants)
  ('gc250all',                             30.000),
  ('gc250blue',                            30.000),
  ('gc250c',                               30.000),
  ('gc250clear',                           30.000),
  -- Metal cup 160ml (4 colors)
  ('mcm160b',                              25.000),
  ('mcm160c',                              25.000),
  ('mcm160lg',                             25.000),
  ('mcm160p',                              25.000),
  -- Metal cup 280ml (4 colors)
  ('mcm280b',                              30.000),
  ('mcm280c',                              30.000),
  ('mcm280lg',                             30.000),
  ('mcm280p',                              30.000),
  -- Candle (2 variants)
  ('Candle1',                              30.000),
  ('Candle2',                              30.000)
) AS v(sku, cogs)
WHERE products_master.sku = v.sku;
