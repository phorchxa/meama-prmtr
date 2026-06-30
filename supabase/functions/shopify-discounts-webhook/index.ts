import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function verifyHmac(secret: string, body: string, hmac: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expected === hmac;
}

// deno-lint-ignore no-explicit-any
function parseRow(p: any) {
  const rawId = p.id ?? "";
  const shopifyId = typeof rawId === "string"
    ? Number(rawId.split("/").pop())
    : Number(rawId);

  const code: string | null =
    p.code ??
    (Array.isArray(p.codes) && p.codes.length > 0 ? p.codes[0]?.code : null) ??
    null;

  return {
    shopify_id: shopifyId,
    title: p.title ?? "",
    status: p.status ?? null,
    discount_type: p.discount_type ?? p.type ?? null,
    value: p.value != null ? parseFloat(p.value) : null,
    value_type: p.value_type ?? null,
    code,
    usage_count: p.usage_count ?? 0,
    usage_limit: p.usage_limit ?? null,
    applies_once_per_customer: p.applies_once_per_customer ?? false,
    starts_at: p.starts_at ?? null,
    ends_at: p.ends_at ?? null,
    raw: p,
    shopify_created_at: p.created_at ?? null,
    shopify_updated_at: p.updated_at ?? null,
    synced_at: new Date().toISOString(),
  };
}

// deno-lint-ignore no-explicit-any
async function linkPromotion(sb: ReturnType<typeof createClient>, shopifyId: number, code: string): Promise<void> {
  // Build all possible prefix candidates from shortest to longest.
  // For code "3PLUS1-GHWSPTLT95" → ["3PLUS1", "3PLUS1-GHWSPTLT95"]
  // For code "newcust-multibundle-18062026-ABCD" → ["newcust", "newcust-multibundle", "newcust-multibundle-18062026", ...]
  const parts = code.split("-");
  const candidates: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    candidates.push(parts.slice(0, i).join("-"));
  }

  const { data: promos } = await sb
    .schema("campaigns")
    .from("promotions")
    .select("id, shopify_code")
    .in("shopify_code", candidates);

  if (!promos || promos.length === 0) return;

  // Pick the longest matching shopify_code (most specific prefix wins)
  const best = promos.sort(
    (a, b) => (b.shopify_code?.length ?? 0) - (a.shopify_code?.length ?? 0),
  )[0];

  await sb
    .schema("campaigns")
    .from("shopify_discounts")
    .update({ promotion_id: best.id })
    .eq("shopify_id", shopifyId);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const topic = req.headers.get("x-shopify-topic") ?? "";

  if (!WEBHOOK_SECRET || !(await verifyHmac(WEBHOOK_SECRET, body, hmacHeader))) {
    console.error("HMAC verification failed", { topic });
    return new Response("Unauthorized", { status: 401 });
  }

  if (!topic.startsWith("discounts/")) {
    return new Response("OK", { status: 200 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  // deno-lint-ignore no-explicit-any
  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (topic === "discounts/delete") {
    const rawId = payload.id ?? "";
    const shopifyId = typeof rawId === "string"
      ? Number(rawId.split("/").pop())
      : Number(rawId);

    const { error } = await sb
      .schema("campaigns")
      .from("shopify_discounts")
      .delete()
      .eq("shopify_id", shopifyId);

    if (error) {
      console.error("delete error", error);
      return new Response("Internal Server Error", { status: 500 });
    }
    return new Response("OK", { status: 200 });
  }

  // discounts/create or discounts/update
  const row = parseRow(payload);
  const { error } = await sb
    .schema("campaigns")
    .from("shopify_discounts")
    .upsert(row, { onConflict: "shopify_id" });

  if (error) {
    console.error("upsert error", error);
    return new Response("Internal Server Error", { status: 500 });
  }

  // Auto-link to promotion (fire and forget — don't fail the webhook on link errors)
  if (row.code) {
    linkPromotion(sb, row.shopify_id, row.code).catch((e) =>
      console.warn("linkPromotion failed", e)
    );
  }

  return new Response("OK", { status: 200 });
});
