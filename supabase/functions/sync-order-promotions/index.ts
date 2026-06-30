import { createClient } from "jsr:@supabase/supabase-js@2";

// Pulls the Shopify order metafield custom.promotion_name for orders created in
// the last `days` (default 21) and writes it onto public.meama_georgia_orders.
// Shopify order webhooks don't carry metafields, so this Admin-API pull is the
// only way to get the field. Auth: an Admin token is minted at runtime from the
// app's client_id/client_secret via the client_credentials grant.

// Env names follow the existing shopify-* functions: SHOPIFY_SHOP + SB_URL/SB_SERVICE_ROLE_KEY,
// with fallbacks to the alternate names in case either convention is set.
const SUPABASE_URL = Deno.env.get("SB_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOP_DOMAIN = (Deno.env.get("SHOPIFY_SHOP") ?? Deno.env.get("SHOPIFY_SHOP_DOMAIN") ?? "").replace(/\/+$/, "");
const CLIENT_ID = Deno.env.get("SHOPIFY_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "";
const API_VERSION = Deno.env.get("SHOPIFY_API_VERSION") ?? "2024-10";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mintToken(): Promise<string> {
  const res = await fetch(`https://${SHOP_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`token mint failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  if (!j.access_token) throw new Error("no access_token in client_credentials response");
  return j.access_token as string;
}

const QUERY = `
query($cursor: String, $q: String!) {
  orders(first: 250, after: $cursor, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      promo: metafield(namespace: "custom", key: "promotion_name") { value }
    }
  }
}`;

function gidToBigint(gid: string): number | null {
  const tail = String(gid).split("/").pop();
  const n = Number(tail);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let days = 21;
  let syncType = "scheduled";
  try {
    const body = await req.json();
    if (body && typeof body.days === "number" && body.days > 0) days = Math.min(body.days, 90);
    if (body && body.source && body.source !== "scheduler") syncType = "manual";
  } catch { /* no/invalid body — use defaults */ }

  // YYYY-MM-DD lower bound for the Shopify search query.
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const q = `created_at:>=${since}`;

  let scanned = 0;
  const rows: { shopify_order_id: number; promotion_name: string }[] = [];

  try {
    if (!SHOP_DOMAIN || !CLIENT_ID || !CLIENT_SECRET) {
      throw new Error("missing SHOPIFY_SHOP / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET secrets");
    }
    const token = await mintToken();
    const gqlUrl = `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
    const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

    let cursor: string | null = null;
    for (let page = 0; page < 200; page++) {
      let resp = await fetch(gqlUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: QUERY, variables: { cursor, q } }),
      });
      let data = await resp.json();

      // GraphQL-level throttle: back off and retry the same page once.
      if (data?.errors?.some((e: any) => e?.extensions?.code === "THROTTLED")) {
        await sleep(2000);
        resp = await fetch(gqlUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: QUERY, variables: { cursor, q } }),
        });
        data = await resp.json();
      }
      if (data?.errors?.length) throw new Error("graphql: " + JSON.stringify(data.errors).slice(0, 300));

      const conn = data.data.orders;
      for (const n of conn.nodes) {
        scanned++;
        const val = (n.promo?.value ?? "").trim();
        if (!val) continue;
        const id = gidToBigint(n.id);
        if (id !== null) rows.push({ shopify_order_id: id, promotion_name: val });
      }
      if (!conn.pageInfo.hasNextPage) break;
      cursor = conn.pageInfo.endCursor;
      await sleep(400); // stay under the GraphQL cost bucket
    }

    let synced = 0;
    if (rows.length > 0) {
      const { data: updated, error } = await sb.rpc("apply_order_promotion_names", { rows });
      if (error) throw new Error("rpc apply_order_promotion_names: " + error.message);
      synced = typeof updated === "number" ? updated : 0;
    }

    await sb.from("order_promotion_sync_log").insert({
      sync_type: syncType, window_days: days,
      rows_scanned: scanned, rows_synced: synced,
      status: "success", duration_ms: Date.now() - startedAt,
    });

    return new Response(
      JSON.stringify({ ok: true, days, scanned, with_promotion: rows.length, synced }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync-order-promotions failed:", msg);
    await sb.from("order_promotion_sync_log").insert({
      sync_type: syncType, window_days: days,
      rows_scanned: scanned, rows_synced: 0,
      status: "error", error_msg: msg.slice(0, 500), duration_ms: Date.now() - startedAt,
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
