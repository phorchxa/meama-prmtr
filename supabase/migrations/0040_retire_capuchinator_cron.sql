-- 0040 — Retire the Capuchinator checkout-upsell attribution cron + function.
--
-- Migration 0036 disabled the Capuchinator upsell (campaign -> completed,
-- promotion -> inactive) and intended to unschedule its attribution cron, but
-- the unschedule never took effect in production: `attribute-capuchinator-upsell`
-- was still active and firing hourly (campaigns.attribute_capuchinator_upsell(365))
-- against a completed/inactive campaign whose 21 attributed orders are frozen.
--
-- This removes the hourly no-op cron and its now-orphaned function. The active
-- upsell (Checkout Cups vol2) keeps its own cron `attribute-checkout-cups-upsell`.
-- The 21 historical campaign_orders rows are left untouched.

SELECT cron.unschedule('attribute-capuchinator-upsell')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'attribute-capuchinator-upsell');

DROP FUNCTION IF EXISTS campaigns.attribute_capuchinator_upsell(integer);
