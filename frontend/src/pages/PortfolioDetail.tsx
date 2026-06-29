import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { Skeleton } from "../components/Skeleton";
import { formatGEL, formatGEL0, formatNumber, tbilisiDate } from "../lib/format";
import {
  fetchPageJourney,
  fetchPortfolio,
  type ChurnReason,
  type CustomerSegment,
  type CustomerStatus,
  type DeliveryVsPickupPreference,
  type PageJourney,
  type PageJourneyEntry,
  type PortfolioDetail as PortfolioDetailData,
  type ReturnPeriodLabel,
  type SessionProduct,
} from "../lib/portfoliosApi";

// ── Design tokens ──────────────────────────────────────────────────
const CLR = {
  g: "#1F9D52", gb: "#E9F8EE", gbd: "#9EDAB8", gd: "#16823F", gdark: "#0F662F",
  r: "#CC2E33", rb: "#FDECEC", rbd: "#F1B9BB",
  a: "#C97E08", ab: "#FFF6E6", abd: "#F0D79A",
  b: "#1A68CC", bb: "#EAF3FE", bbd: "#B8D4F8",
  tl: "#0E8C7E", tlb: "#E2F6F3", tlbd: "#A5DDD5",
  pu: "#5B3FD6", pub: "#F0ECFE", pubd: "#CFC2F5",
  text: "#121712", t2: "#525B53", t3: "#727B73", t4: "#9BA39C",
  bg2: "#FFFFFF", bg3: "#ECEFEC", bg4: "#E0E4E1",
  border: "#E0E4E1", border2: "#CBD1CC",
  canvas: "#F5F7F5",
  signal: "#D2F03C",
};

const MONO: React.CSSProperties = { fontFamily: "'Geist Mono', 'Courier New', monospace" };
const UI: React.CSSProperties   = { fontFamily: "'Hanken Grotesk', Inter, sans-serif" };
const PT: React.CSSProperties   = { ...UI, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: CLR.t4 };

// ── Helpers ────────────────────────────────────────────────────────
type Variant = "green" | "red" | "amber" | "blue" | "teal" | "purple" | "neutral";

const TAG_CLR: Record<Variant, { bg: string; color: string }> = {
  green:   { bg: CLR.gb,  color: CLR.gdark },
  red:     { bg: CLR.rb,  color: CLR.r     },
  amber:   { bg: CLR.ab,  color: CLR.a     },
  blue:    { bg: CLR.bb,  color: CLR.b     },
  teal:    { bg: CLR.tlb, color: CLR.tl    },
  purple:  { bg: CLR.pub, color: CLR.pu    },
  neutral: { bg: CLR.bg3, color: CLR.t2    },
};

function segVariant(seg: CustomerSegment): Variant {
  return ({ loyalist: "green", at_risk: "red", lapsed: "neutral", new_machine: "amber", active: "green", prospect: "neutral" } as Record<CustomerSegment, Variant>)[seg] ?? "neutral";
}
function segLabel(seg: CustomerSegment): string {
  return ({ loyalist: "Loyalist", at_risk: "At risk", lapsed: "Lapsed", new_machine: "New machine", active: "Active", prospect: "Prospect" } as Record<CustomerSegment, string>)[seg] ?? seg;
}
function segAvatar(seg: CustomerSegment): string {
  return ({ loyalist: CLR.gd, at_risk: CLR.r, lapsed: CLR.t3, new_machine: CLR.a, active: CLR.gd, prospect: CLR.t3 } as Record<CustomerSegment, string>)[seg] ?? CLR.gd;
}
function lifecycleLabel(s: CustomerStatus): string {
  return ({ prospect: "Prospect", lost: "Lapsed", at_risk: "At-risk", new: "New", active: "Active" } as Record<string, string>)[s] ?? s;
}
function lifecycleVariant(s: CustomerStatus): Variant {
  return ({ prospect: "neutral", lost: "red", at_risk: "amber", new: "blue", active: "green" } as Record<string, Variant>)[s] ?? "neutral";
}
function healthColor(score: number): string {
  return score >= 80 ? CLR.g : score >= 50 ? CLR.a : CLR.r;
}
function churnColor(risk: number): string {
  return risk >= 70 ? CLR.r : risk >= 40 ? CLR.a : CLR.gd;
}

function rfm5(data: PortfolioDetailData) {
  const r = data.recency_score ?? 0;
  const f = data.frequency_score ?? 0;
  const m = data.monetary_score ?? 0;
  return {
    R: r === 40 ? 5 : r >= 30 ? 4 : r >= 20 ? 3 : r >= 10 ? 2 : 1,
    F: f === 35 ? 5 : f >= 28 ? 4 : f >= 18 ? 3 : f >= 8 ? 2 : 1,
    M: m === 25 ? 5 : m >= 20 ? 4 : m >= 15 ? 3 : m >= 10 ? 2 : 1,
  };
}

function rfmLabel(R: number, F: number, M: number): string {
  const t = R + F + M;
  return t >= 12 ? "Champion" : t >= 9 ? "Loyal" : t >= 7 ? "Potential loyalist" : t >= 5 ? "At risk" : "Hibernating";
}

function da(v: string | null | undefined): string { return v ? tbilisiDate(v) : "—"; }

function joinedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function relTimeSince(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const FUNNEL_LABEL: Record<number, string> = {
  1: "Browsing", 2: "Product view", 3: "Added to cart",
  4: "Checkout started", 5: "Payment info", 6: "Purchase", 7: "Purchase",
};

const CHURN_LABEL: Record<ChurnReason, string> = {
  healthy_active: "Healthy active", promo_dependent: "Promo dependent",
  long_recency_gap: "Long recency gap", machine_without_capsules: "Machine without capsules",
  low_frequency: "Low frequency", single_category_dependency: "Single category dependency",
  new_customer: "New customer", never_ordered: "Never ordered", unknown: "Unknown",
};

const RETURN_LABEL: Record<ReturnPeriodLabel, string> = {
  frequent: "Frequent", regular: "Regular", slow: "Slow", lapsed_pattern: "Lapsed pattern",
};

const DELIVERY_LABEL: Record<DeliveryVsPickupPreference, string> = {
  delivery: "Delivery", pickup_or_store: "Pickup / store", mixed: "Mixed", unknown: "Unknown",
};

const CONV_LABEL: Record<string, string> = {
  no_machine: "No machine", machine_only_no_capsules: "Machine only",
  machine_then_capsules: "Active buyer", capsules_without_machine_purchase: "Capsules only", unknown: "Unknown",
};

const SOURCE_LABEL: Record<string, string> = {
  web: "E-commerce", pos: "Brand store", "195189899265": "App",
};

const DRINK_LABEL: Record<string, string> = {
  espresso: "Espresso", filter_coffee: "Filter coffee", tea: "Tea",
  cold_mix: "Cold mix", wellness: "Wellness", other: "Other",
};

function nextBestAction(data: PortfolioDetailData): string {
  if (data.churn_reason === "promo_dependent")            return "Use value framing before discounts; protect full-price margin. Recommend free shipping or loyalty points instead of blanket promo codes to build a full-price purchase habit.";
  if (data.churn_reason === "healthy_active")             return "Keep cadence steady; surface a relevant capsule refill to drive the next order.";
  if (data.churn_reason === "long_recency_gap")           return "Prioritize a win-back message tied to their product profile and last purchase.";
  if (data.churn_reason === "machine_without_capsules")   return "Trigger machine-owner capsule education and starter bundle — they have the machine but aren't buying capsules.";
  if (data.churn_reason === "low_frequency")              return "Send reorder reminder near the expected return window. Keep it simple and product-focused.";
  if (data.churn_reason === "single_category_dependency") return "Recommend an adjacent capsule category to reduce concentration risk and grow basket size.";
  if (data.recommended_next_machine)                      return `Recommend ${data.recommended_next_machine} machine upgrade — they're ready for the next tier.`;
  if (data.expected_next_order_date)                      return "Prepare reorder outreach before expected next order date.";
  return "Review customer history before campaign selection.";
}

// ── Session helpers ────────────────────────────────────────────────
function sessionViewedProducts(data: PortfolioDetailData): SessionProduct[] {
  return data.latest_session?.viewed_products ?? data.viewed_products ?? [];
}
function sessionCartProducts(data: PortfolioDetailData): SessionProduct[] {
  return data.latest_session?.cart_products ?? data.cart_products ?? [];
}
function sessionAddToCarts(data: PortfolioDetailData): number | null {
  return data.latest_session?.add_to_carts ?? data.add_to_carts ?? null;
}
function sessionConverted(data: PortfolioDetailData): boolean | null {
  return data.latest_session?.converted ?? data.converted ?? null;
}
function sessionCartStatus(data: PortfolioDetailData): string {
  if (data.latest_session?.cart_status) return data.latest_session.cart_status;
  if (data.cart_status) return data.cart_status;
  if (sessionConverted(data) === true) return "converted";
  if ((sessionAddToCarts(data) ?? 0) > 0 && sessionConverted(data) === false) return "active_abandoner";
  return sessionViewedProducts(data).length ? "browsing_only" : "no_cart_activity";
}
function recoveredOrderAt(data: PortfolioDetailData): string | null {
  return data.latest_session?.recovered_order_at ?? data.recovered_order_at ?? null;
}
function daysToRecovery(data: PortfolioDetailData): number | null {
  return data.latest_session?.days_to_recovery ?? data.days_to_recovery ?? null;
}

// ── Journey dot color ──────────────────────────────────────────────
function journeyDot(p: PageJourneyEntry): string {
  if (p.engagement_level === "exit") return CLR.r;
  const cat = p.page_category?.toLowerCase();
  if (cat === "product" || cat === "collection" || cat === "bundle") return CLR.g;
  if (cat === "cart" || cat === "checkout") return CLR.a;
  return CLR.border2;
}

// ── UI primitives ──────────────────────────────────────────────────

function Chip({ variant = "neutral", children }: { variant?: Variant; children: ReactNode }) {
  const t = TAG_CLR[variant];
  return (
    <span style={{ ...UI, background: t.bg, color: t.color, fontSize: 10, fontWeight: 600, padding: "2px 7px", display: "inline-block", margin: 1, borderRadius: 0 }}>
      {children}
    </span>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, overflow: "hidden" }}>
      <div style={{ borderBottom: `1px solid ${CLR.border}`, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={PT}>{title}</span>
        {sub && <span style={{ ...UI, fontSize: 10, color: CLR.t4 }}>{sub}</span>}
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

// 2-col label/value table
function TRow({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <tr style={{ borderBottom: `1px solid ${CLR.canvas}` }}>
      <td style={{ ...UI, color: CLR.t4, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap", width: "44%", paddingRight: 8, paddingTop: 7, paddingBottom: 7, verticalAlign: "top" }}>
        {label}
      </td>
      <td style={{ ...UI, color: CLR.text, fontSize: 12, fontWeight: 500, paddingTop: 7, paddingBottom: 7, verticalAlign: "top" }}>
        {children ?? <span style={{ color: CLR.t4 }}>—</span>}
      </td>
    </tr>
  );
}
function Tbl({ children }: { children: ReactNode }) {
  return <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>{children}</tbody></table>;
}

function ProductList({ products }: { products: SessionProduct[] }) {
  if (!products.length) return <span style={{ color: CLR.t4 }}>—</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {products.map((p) => (
        <div key={p.sku}>
          <div style={{ ...UI, color: CLR.text, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
          <div style={{ ...MONO, color: CLR.t4, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.sku}</div>
        </div>
      ))}
    </div>
  );
}

// ── Session banner ─────────────────────────────────────────────────
function SessionBanner({ data }: { data: PortfolioDetailData }) {
  const cartStatus = sessionCartStatus(data);
  const cartNames = sessionCartProducts(data).map((p) => p.title).join(" · ");
  const sessionCount = data.sessions_30d ?? 0;
  const countLabel = `${sessionCount} session${sessionCount !== 1 ? "s" : ""} · 30d`;

  if (cartStatus === "recovered_after_abandonment") {
    const parts = ["RECOVERED AFTER ABANDONMENT", da(recoveredOrderAt(data)), daysToRecovery(data) != null ? `${daysToRecovery(data)}d to recovery` : null, cartNames || null].filter(Boolean).join(" · ");
    return (
      <div style={{ background: CLR.gb, borderLeft: "3px solid " + CLR.g, padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: CLR.gdark }}>
        <span>✓ {parts}</span>
        <span style={{ fontWeight: 400, opacity: 0.7 }}>{countLabel}</span>
      </div>
    );
  }
  if (data.session_warm && cartStatus !== "converted") {
    const fLabel = data.last_funnel_stage != null ? FUNNEL_LABEL[data.last_funnel_stage] ?? "" : "";
    const top = sessionCartProducts(data)[0]?.title ?? sessionViewedProducts(data)[0]?.title ?? "";
    const text = ["Warm", fLabel, top].filter(Boolean).join(" · ");
    return (
      <div style={{ background: CLR.signal, padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: CLR.text }}>
        <span>🔥 {text}</span>
        <span style={{ fontWeight: 400, opacity: 0.7 }}>{countLabel}</span>
      </div>
    );
  }
  if (cartStatus === "active_abandoner") {
    const fLabel = data.last_funnel_stage != null ? FUNNEL_LABEL[data.last_funnel_stage] ?? "" : "";
    const text = ["Cart abandoner", fLabel].filter(Boolean).join(" · ");
    return (
      <div style={{ background: CLR.ab, borderLeft: "3px solid " + CLR.a, padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: CLR.a }}>
        <span>⚠ {text}</span>
        <span style={{ fontWeight: 400, opacity: 0.7 }}>{countLabel}</span>
      </div>
    );
  }
  return null;
}

// ── Main component ─────────────────────────────────────────────────
export default function PortfolioDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PortfolioDetailData | null>(null);
  const [pageJourney, setPageJourney] = useState<PageJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setError(null);
    Promise.all([
      fetchPortfolio(Number(id)),
      fetchPageJourney(Number(id)).catch(() => null),
    ])
      .then(([portfolio, journey]) => { setData(portfolio); setPageJourney(journey); })
      .catch((err: Error) => {
        if (err.message === "not_found") setNotFound(true);
        else setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (!id || notFound) return <Navigate to="/portfolios" replace />;

  if (loading && !data) {
    return (
      <div style={{ background: CLR.canvas, minHeight: "100vh", padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton className="h-[60px]" />
          <Skeleton className="h-[44px]" />
          <Skeleton className="h-[72px]" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Skeleton className="h-[340px]" />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Skeleton className="h-[180px]" />
              <Skeleton className="h-[148px]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: CLR.canvas, minHeight: "100vh", padding: 20 }}>
        <div style={{ background: CLR.rb, borderLeft: `3px solid ${CLR.r}`, color: CLR.r, padding: "12px 16px", fontSize: 13 }}>Error: {error}</div>
      </div>
    );
  }

  if (!data) return null;

  // ── Computed values ──
  const churnRisk    = 100 - data.health_score;
  const { R, F, M }  = rfm5(data);
  const rLabel        = rfmLabel(R, F, M);
  const promoSharePct = Math.round((data.promo_share ?? 0) * 100);
  const fullSharePct  = 100 - promoSharePct;
  const isDiscountLed = (data.promo_share ?? 0) >= 0.6;
  const hasSpend      = ((data.promo_spend ?? 0) + (data.full_price_spend ?? 0)) > 0;
  const eco           = Math.round((data.ecommerce_share ?? 0) * 100);
  const store         = Math.round((data.brand_store_share ?? 0) * 100);
  const appPct        = Math.round(((data as PortfolioDetailData & { app_share?: number | null }).app_share ?? 0) * 100);
  const underConsuming = data.has_machine && data.avg_capsule_packs_per_month != null && data.avg_capsule_packs_per_month < 1.5;
  const cartStatus    = sessionCartStatus(data);

  const spendInsight = isDiscountLed
    ? `${promoSharePct}% of spend is discount-led. Margin risk — they wait for sales. Pull from blanket promos and test value offers (free shipping, loyalty points, a free sample) to build a full-price habit.`
    : promoSharePct <= 20
    ? `Healthy — ${fullSharePct}% full-price. Protect this: reward with early access and loyalty, never train them to expect discounts.`
    : `Mixed — ${promoSharePct}% on promo. Watch the trend; nudge toward full-price reorders with convenience, not price.`;

  return (
    <div style={{ background: CLR.canvas, minHeight: "100vh", ...UI }}>

      {/* ══ STICKY HEADER ══════════════════════════════════════════ */}
      <div style={{
        position: "sticky", top: 56, zIndex: 50,
        background: CLR.bg2, borderBottom: `1px solid ${CLR.border}`,
        padding: "0 24px", display: "flex", alignItems: "center", gap: 14, height: 60,
      }}>
        <a onClick={() => navigate("/portfolios")} style={{ ...UI, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: CLR.t3, cursor: "pointer", flexShrink: 0, textDecoration: "none" }}>
          ← Portfolios
        </a>

        <div style={{ width: 40, height: 40, background: segAvatar(data.segment), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0, letterSpacing: ".01em" }}>
          {data.initials || "?"}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <div style={{ ...UI, fontSize: 16, fontWeight: 700, letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {data.full_name?.trim() || `#${data.shopify_customer_id}`}
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
              <Chip variant={segVariant(data.segment)}>{segLabel(data.segment)}</Chip>
              <Chip variant={lifecycleVariant(data.status)}>{lifecycleLabel(data.status)}</Chip>
              {isDiscountLed && <Chip variant="amber">Discount-led</Chip>}
            </div>
          </div>
          <div style={{ ...UI, fontSize: 11, color: CLR.t3, display: "flex", gap: 8, alignItems: "center" }}>
            {data.capital_vs_regional === "capital" && <span>📍 Capital (Tbilisi)</span>}
            {data.capital_vs_regional === "regional" && <span>📍 Regional</span>}
            {data.customer_since && <><span>·</span><span>Joined {joinedDate(data.customer_since)}</span></>}
            <span>·</span>
            <span style={{ ...MONO, fontSize: 10 }}>SHOP-{data.shopify_customer_id}</span>
          </div>
        </div>

        {/* 4 KPIs in header */}
        <div style={{ display: "flex", flexShrink: 0 }}>
          {([
            { label: "LTV",        val: formatGEL0(data.total_spend),   color: CLR.text },
            { label: "Orders",     val: String(data.order_count),        color: CLR.text },
            { label: "AOV",        val: formatGEL(data.aov),             color: CLR.text },
            { label: "Churn risk", val: `${churnRisk}%`,                 color: churnColor(churnRisk) },
          ] as { label: string; val: string; color: string }[]).map(({ label, val, color }) => (
            <div key={label} style={{ padding: "0 18px", borderLeft: `1px solid ${CLR.border}`, textAlign: "center" }}>
              <div style={{ ...UI, fontSize: 9, fontWeight: 600, color: CLR.t4, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{label}</div>
              <div style={{ ...MONO, fontSize: 17, fontWeight: 600, color }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginLeft: 16, flexShrink: 0 }}>
          <button style={{ ...UI, height: 32, padding: "0 14px", border: `1px solid ${CLR.border}`, background: CLR.bg2, fontSize: 12, fontWeight: 500, cursor: "pointer", color: CLR.text }}>
            Contact
          </button>
          <button style={{ ...UI, height: 32, padding: "0 14px", border: "none", background: CLR.text, color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            Export
          </button>
        </div>
      </div>

      <SessionBanner data={data} />

      {/* ══ BODY ══════════════════════════════════════════════════════ */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── KPI ROW ── */}
        <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, display: "grid", gridTemplateColumns: "repeat(4,1fr)" }}>
          {([
            { label: "Lifetime value", val: formatGEL0(data.total_spend),                                  sub: null,                                                       color: CLR.text },
            { label: "Orders",         val: String(data.order_count),                                       sub: data.avg_return_interval_days != null ? `every ${Math.round(data.avg_return_interval_days)} days` : null, color: CLR.text },
            { label: "AOV",            val: formatGEL(data.aov),                                            sub: null,                                                       color: CLR.text },
            { label: "Churn risk",     val: `${churnRisk}%`,                                                sub: null,                                                       color: churnColor(churnRisk) },
          ] as { label: string; val: string; sub: string | null; color: string }[]).map(({ label, val, sub, color }, i) => (
            <div key={label} style={{ padding: "16px 18px", borderRight: i < 3 ? `1px solid ${CLR.border}` : "none" }}>
              <div style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", color: CLR.t4, marginBottom: 6 }}>{label}</div>
              <div style={{ ...MONO, fontSize: 22, fontWeight: 600, color, letterSpacing: "-.01em" }}>{val}</div>
              {sub && <div style={{ ...UI, fontSize: 10, color: CLR.t4, marginTop: 2 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* ROW 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* SESSIONS */}
          <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, overflow: "hidden" }}>
            <div style={{ borderBottom: `1px solid ${CLR.border}`, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={PT}>Sessions & on-site behavior</span>
              {data.sessions_30d != null && data.sessions_30d > 0 && (
                <span style={{ ...UI, fontSize: 10, color: CLR.t4 }}>{data.sessions_30d} session{data.sessions_30d !== 1 ? "s" : ""} · 30d</span>
              )}
            </div>

            {!data.last_session_at ? (
              <div style={{ padding: "14px 16px" }}>
                <p style={{ ...UI, color: CLR.t3, fontSize: 12, lineHeight: 1.6 }}>No sessions recorded yet — fills in once this customer browses while logged in.</p>
              </div>
            ) : (
              <>
                {/* rec-chip inside panel */}
                {cartStatus === "recovered_after_abandonment" && (
                  <div style={{ background: CLR.gb, borderLeft: "3px solid " + CLR.g, padding: "9px 12px" }}>
                    <div style={{ ...MONO, fontSize: 11, fontWeight: 600, color: CLR.gd }}>RECOVERED AFTER ABANDONMENT</div>
                    <div style={{ ...MONO, fontSize: 10, color: CLR.gd, marginTop: 2 }}>
                      {da(recoveredOrderAt(data))}{daysToRecovery(data) != null ? ` · ${daysToRecovery(data)}d to recovery` : ""}
                    </div>
                  </div>
                )}
                {cartStatus === "active_abandoner" && (
                  <div style={{ background: CLR.ab, borderLeft: "3px solid " + CLR.a, padding: "9px 12px" }}>
                    <div style={{ ...MONO, fontSize: 11, fontWeight: 600, color: CLR.a }}>CART ABANDONER</div>
                    {sessionCartProducts(data).length > 0 && (
                      <div style={{ ...MONO, fontSize: 10, color: CLR.a, marginTop: 2 }}>{sessionCartProducts(data).map((p) => p.title).join(" · ")}</div>
                    )}
                  </div>
                )}

                {/* s4 mini KPI row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: `1px solid ${CLR.border}` }}>
                  {([
                    { label: "Sessions · 30d", val: String(data.sessions_30d ?? "—"),                                                     sub: null },
                    { label: "Last seen",       val: relTimeSince(data.last_session_at),                                                   sub: data.days_since_last_session != null ? `Days since: ${data.days_since_last_session}` : null },
                    { label: "Device",          val: data.last_session_device ?? "—",                                                       sub: null },
                    { label: "Channel",         val: data.last_session_channel ?? "Direct",                                                 sub: null },
                  ] as { label: string; val: string; sub: string | null }[]).map(({ label, val, sub }, i) => (
                    <div key={label} style={{ padding: "10px 14px", borderRight: i < 3 ? `1px solid ${CLR.border}` : "none" }}>
                      <div style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", color: CLR.t4, marginBottom: 4 }}>{label}</div>
                      <div style={{ ...MONO, fontSize: 14, fontWeight: 600, color: CLR.text }}>{val}</div>
                      {sub && <div style={{ ...UI, fontSize: 10, color: CLR.t4, marginTop: 1 }}>{sub}</div>}
                    </div>
                  ))}
                </div>

                {/* data table */}
                <div style={{ padding: "14px 16px" }}>
                  <Tbl>
                    <TRow label="Cart status">
                      {cartStatus === "recovered_after_abandonment" ? <Chip variant="green">Recovered after abandonment</Chip>
                        : cartStatus === "active_abandoner" ? <Chip variant="amber">Cart abandoner</Chip>
                        : cartStatus === "converted" ? <Chip variant="blue">Converted session</Chip>
                        : cartStatus === "browsing_only" ? <Chip variant="neutral">Browsing only</Chip>
                        : <span style={{ color: CLR.t4 }}>No cart activity</span>}
                    </TRow>
                    <TRow label="Last funnel stage">
                      {data.last_funnel_stage != null ? (FUNNEL_LABEL[data.last_funnel_stage] ?? `Stage ${data.last_funnel_stage}`) : "—"}
                    </TRow>
                    <TRow label="Last cart value">
                      {data.last_cart_value != null && data.last_cart_value > 0
                        ? <span style={MONO}>₾{data.last_cart_value.toFixed(0)}</span> : null}
                    </TRow>
                    <TRow label="Checkout abandons">
                      {data.checkout_abandons != null ? <span style={MONO}>{data.checkout_abandons}</span> : null}
                    </TRow>
                    {sessionViewedProducts(data).length > 0 && (
                      <TRow label="Viewed products"><ProductList products={sessionViewedProducts(data)} /></TRow>
                    )}
                    {sessionCartProducts(data).length > 0 && (
                      <TRow label="Added to cart">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                          {sessionCartProducts(data).map((p) => (
                            <span key={p.sku} style={{ ...UI, background: CLR.text, color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", display: "inline-block" }}>{p.title}</span>
                          ))}
                        </div>
                      </TRow>
                    )}
                    {(data.last_carted_products?.length ?? 0) > 0 && (
                      <TRow label="Carted products">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                          {data.last_carted_products!.map((v) => <Chip key={v} variant="neutral">{v}</Chip>)}
                        </div>
                      </TRow>
                    )}
                    {data.last_cart_recovery_outcome && (
                      <TRow label="Cart recovery">
                        {data.last_cart_recovery_outcome === "recovered_same"
                          ? <Chip variant="green">Bought what they carted</Chip>
                          : data.last_cart_recovery_outcome === "recovered_different"
                            ? <Chip variant="amber">Bought — different items</Chip>
                            : null}
                      </TRow>
                    )}
                    {data.last_session_city && <TRow label="City">{data.last_session_city}</TRow>}
                  </Tbl>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: Account health + Identity stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* ACCOUNT HEALTH */}
            <Panel title="Account health" sub={rLabel}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
                {/* SVG ring */}
                <svg width="64" height="64" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
                  <circle cx="32" cy="32" r="26" fill="none" stroke={CLR.bg3} strokeWidth="8" />
                  <circle cx="32" cy="32" r="26" fill="none" stroke={healthColor(data.health_score)} strokeWidth="8"
                    strokeDasharray={`${(data.health_score / 100) * 163} 163`}
                    strokeDashoffset="41" strokeLinecap="butt" transform="rotate(-90 32 32)" />
                  <text x="32" y="30" textAnchor="middle" fontSize="15" fontWeight="700" fill={CLR.text} fontFamily="'Geist Mono',monospace">{data.health_score}</text>
                  <text x="32" y="41" textAnchor="middle" fontSize="7" fill={CLR.t4} fontFamily="'Hanken Grotesk',sans-serif">HEALTH</text>
                </svg>

                <div style={{ display: "flex", gap: 20 }}>
                  {([["R", R], ["F", F], ["M", M]] as [string, number][]).map(([k, v]) => (
                    <div key={k} style={{ textAlign: "center" }}>
                      <div style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", color: CLR.t4, marginBottom: 2 }}>{k}</div>
                      <div style={{ ...MONO, fontSize: 20, fontWeight: 600, color: v >= 4 ? CLR.g : v >= 3 ? CLR.a : CLR.r }}>{v}</div>
                      <div style={{ ...UI, fontSize: 10, color: CLR.t4 }}>/5</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <Chip variant={lifecycleVariant(data.status)}>{lifecycleLabel(data.status)}</Chip>
                  <div style={{ ...UI, fontSize: 9, color: CLR.t4, marginTop: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>Lifecycle</div>
                </div>
              </div>

              <Tbl>
                <TRow label="RFM label"><span style={{ fontWeight: 600 }}>{rLabel}</span></TRow>
                <TRow label="Next order"><span style={MONO}>{da(data.expected_next_order_date)}</span></TRow>
                <TRow label="Days since order">
                  {data.days_since_last_order != null ? <span style={MONO}>{data.days_since_last_order} days</span> : null}
                </TRow>
                <TRow label="Categories bought">{data.top_product_types?.join(" · ") ?? null}</TRow>
              </Tbl>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
                {([["Recency", R], ["Frequency", F], ["Monetary", M]] as [string, number][]).map(([k, v]) => (
                  <div key={k} style={{ background: CLR.canvas, padding: 12, textAlign: "center" }}>
                    <div style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: CLR.t4, marginBottom: 5 }}>{k}</div>
                    <div style={{ ...MONO, fontSize: 22, fontWeight: 600, color: v >= 4 ? CLR.g : v >= 3 ? CLR.a : CLR.r }}>{v}</div>
                    <div style={{ ...UI, fontSize: 10, color: CLR.t4 }}>/5</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, padding: "8px 10px", background: CLR.gb }}>
                <span style={{ ...UI, fontSize: 11, fontWeight: 600, color: CLR.gd }}>RFM label: {rLabel}</span>
              </div>
            </Panel>

            {/* IDENTITY & CONTACT */}
            <Panel title="Identity & contact">
              <Tbl>
                <TRow label="Email">
                  {data.email
                    ? <span style={MONO}>{data.email}</span>
                    : <span style={{ color: CLR.t4 }}>{data.phone_only ? "[phone-only]" : "—"}</span>}
                </TRow>
                <TRow label="Phone">
                  {data.phone ? <span style={MONO}>{data.phone}</span> : null}
                </TRow>
                <TRow label="Consent">
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    <Chip variant={data.accept_marketing_email ? "neutral" : "neutral"}>
                      {data.accept_marketing_email ? "Email ✓" : "Email ✕"}
                    </Chip>
                    <Chip variant={data.sms_marketing ? "green" : "neutral"}>
                      {data.sms_marketing ? "SMS ✓" : "SMS ✕"}
                    </Chip>
                  </div>
                </TRow>
                <TRow label="Registered"><span style={MONO}>{joinedDate(data.customer_since)}</span></TRow>
                <TRow label="Tenure">{data.tenure_months != null ? `${data.tenure_months} months` : null}</TRow>
                <TRow label="Active months">
                  {data.active_months != null ? <span style={MONO}>{data.active_months} of {data.tenure_months ?? "?"}</span> : null}
                </TRow>
                <TRow label="Location">
                  {data.capital_vs_regional === "capital" ? <Chip variant="blue">Capital</Chip>
                    : data.capital_vs_regional === "regional" ? <Chip variant="neutral">Regional</Chip>
                    : null}
                </TRow>
              </Tbl>
            </Panel>
          </div>
        </div>{/* /row1 */}

        {/* ROW 2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* PAGE JOURNEY */}
          {pageJourney && pageJourney.pages.length > 0 ? (
            <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, overflow: "hidden" }}>
              <div style={{ borderBottom: `1px solid ${CLR.border}`, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={PT}>Page journey · last session</span>
                <span style={{ ...UI, fontSize: 10, color: CLR.t4 }}>{pageJourney.total_pages_visited} pages · 30d</span>
              </div>

              {/* jsum: 3-col summary */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: `1px solid ${CLR.border}` }}>
                {([
                  { label: "Total pages",  val: String(pageJourney.total_pages_visited) },
                  { label: "Most visited", val: pageJourney.most_visited_category || "—" },
                  { label: "Avg time/page",val: pageJourney.avg_time_on_page_sec > 0 ? `${Math.round(pageJourney.avg_time_on_page_sec)}s` : "—" },
                ] as { label: string; val: string }[]).map(({ label, val }, i) => (
                  <div key={label} style={{ padding: "9px 14px", borderRight: i < 2 ? `1px solid ${CLR.border}` : "none", textAlign: "center" }}>
                    <div style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: CLR.t4, marginBottom: 3 }}>{label}</div>
                    <div style={{ ...MONO, fontSize: 14, fontWeight: 600, color: CLR.text }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* exit page */}
              {pageJourney.exit_page && (
                <div style={{ padding: "6px 16px", fontSize: 10, color: CLR.t4 }}>
                  Exit page: <span style={{ color: CLR.r, fontWeight: 600 }}>{pageJourney.exit_page_label ?? pageJourney.exit_page}</span>
                </div>
              )}

              {/* jrow list */}
              <div>
                {(pageJourney.pages as PageJourneyEntry[]).slice(0, 10).map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 16px", borderBottom: `1px solid ${CLR.canvas}` }}>
                    <span style={{ ...MONO, fontSize: 10, color: CLR.t4, width: 42, flexShrink: 0 }}>{relTimeSince(p.occurred_at)}</span>
                    <div style={{ width: 7, height: 7, background: journeyDot(p), flexShrink: 0 }} />
                    <span style={{ ...UI, fontSize: 12, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.path}>
                      {p.page_label || p.path}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", background: CLR.canvas, color: CLR.t4, textTransform: "uppercase", letterSpacing: ".03em", flexShrink: 0 }}>
                      {p.page_category}
                    </span>
                    <span style={{ ...MONO, fontSize: 10, color: CLR.t4, width: 38, textAlign: "right", flexShrink: 0 }}>
                      {p.time_on_page_sec != null ? `${Math.round(p.time_on_page_sec)}s` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Panel title="Page journey · last session">
              <p style={{ ...UI, color: CLR.t3, fontSize: 12 }}>No page journey data recorded yet.</p>
            </Panel>
          )}

          {/* CHANNELS — right col */}
          <Panel title="Channels & acquisition">
            <div style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: CLR.t4, marginBottom: 7 }}>Where they buy</div>
            {/* channel bar */}
            <div style={{ height: 16, background: CLR.b, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 600, marginBottom: 6 }}>
              {eco > 0 && eco === 100 ? "100%" : ""}
              {eco > 0 && eco < 100 && (
                <div style={{ width: `${eco}%`, height: "100%", background: CLR.b, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 600 }}>{eco > 20 ? `${eco}%` : ""}</div>
              )}
            </div>
            <div style={{ ...UI, fontSize: 10, color: CLR.t4, marginBottom: 14 }}>
              ▪ Online {eco}% &nbsp;▪ In-store {store}% &nbsp;▪ App {appPct}%
            </div>
            <Tbl>
              <TRow label="Primary channel">
                {data.channel ? ({ online: "E-commerce", in_store: "Brand store", app: "App", mixed: "Mixed", none: "—" } as Record<string, string>)[data.channel] ?? data.channel : null}
              </TRow>
              <TRow label="Promo orders">
                {data.promo_orders > 0 ? <span style={MONO}>{data.promo_orders} of {data.order_count}</span> : "None"}
              </TRow>
            </Tbl>
            {data.has_machine && data.avg_capsule_packs_per_month != null && (
              <div style={{ marginTop: 14 }}>
                <div style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: CLR.t4, marginBottom: 6 }}>Capsule consumption vs machine</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>{data.avg_capsule_packs_per_month.toFixed(1)} packs/mo</span>
                  <span style={{ color: CLR.t4 }}>expected ~2.5/mo</span>
                </div>
                <div style={{ height: 4, background: CLR.bg3 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (data.avg_capsule_packs_per_month / 2.5) * 100)}%`, background: underConsuming ? CLR.r : CLR.g }} />
                </div>
                {underConsuming && (
                  <div style={{ ...UI, background: CLR.rb, borderLeft: `2px solid ${CLR.r}`, color: CLR.t2, padding: "8px 10px", fontSize: 11, lineHeight: 1.6, marginTop: 8 }}>
                    <strong>Under-consuming.</strong> Machine owner buying far fewer capsules than expected.
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>{/* /row2 */}

        {/* ROW 3 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* SPEND QUALITY */}
          {hasSpend ? (
            <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, overflow: "hidden" }}>
              <div style={{ borderBottom: `1px solid ${CLR.border}`, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={PT}>Spend quality</span>
                <span style={{ ...UI, fontSize: 10, color: CLR.t4 }}>{promoSharePct}% promo · {data.promo_orders} promo orders</span>
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ ...UI, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: CLR.t4 }}>Promo vs full-price</span>
                  <span style={{ ...UI, fontSize: 11, fontWeight: 600, color: isDiscountLed ? CLR.r : CLR.gd }}>{promoSharePct}% on promo</span>
                </div>
                <div style={{ height: 24, display: "flex", marginBottom: 5 }}>
                  <div style={{ width: `${fullSharePct}%`, background: CLR.gd, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff" }}>
                    {fullSharePct > 15 ? `${fullSharePct}% full` : ""}
                  </div>
                  <div style={{ flex: 1, background: CLR.a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff" }}>
                    {promoSharePct > 10 ? `${promoSharePct}% promo` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", ...MONO, fontSize: 10, color: CLR.t4, marginBottom: 10 }}>
                  <span style={{ color: CLR.gd }}>Full ₾{formatNumber(data.full_price_spend)}</span>
                  <span style={{ color: CLR.a }}>Promo ₾{formatNumber(data.promo_spend)}</span>
                </div>
                <div style={{ ...UI, background: isDiscountLed ? CLR.rb : CLR.canvas, borderLeft: `2px solid ${isDiscountLed ? CLR.r : CLR.gd}`, padding: "10px 12px", fontSize: 11, lineHeight: 1.6, color: CLR.text }}>
                  {spendInsight}
                </div>
              </div>
            </div>
          ) : (
            <Panel title="Spend quality">
              <p style={{ ...UI, color: CLR.t4, fontSize: 12 }}>No spend data available.</p>
            </Panel>
          )}

          {/* PURCHASE & RFM — right col */}
          <Panel title="Purchase & RFM detail">
            <Tbl>
              <TRow label="Last order"><span style={MONO}>{da(data.last_order_at)}</span></TRow>
              <TRow label="Return interval">
                {data.avg_return_interval_days != null ? `every ${Math.round(data.avg_return_interval_days)} days` : null}
              </TRow>
              <TRow label="AOV capsules">
                {data.capsule_aov != null ? <span style={MONO}>{formatGEL(data.capsule_aov)}</span> : null}
              </TRow>
              <TRow label="Packs / month">
                {data.avg_capsule_packs_per_month != null ? <span style={MONO}>{data.avg_capsule_packs_per_month.toFixed(1)}</span> : null}
              </TRow>
              <TRow label="Next order"><span style={MONO}>{da(data.expected_next_order_date)}</span></TRow>
              <TRow label="Price range">
                {data.capsule_price_range ? (
                  <Chip variant={data.capsule_price_range === "premium" ? "purple" : data.capsule_price_range === "mid_range" ? "blue" : "neutral"}>
                    {data.capsule_price_range.replace("_", " ")}
                  </Chip>
                ) : null}
              </TRow>
            </Tbl>
          </Panel>
        </div>{/* /row3 */}

        {/* ROW 4 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* FLAVOR DNA */}
          <Panel title="Flavor & product DNA">
            <Tbl>
              <TRow label="Intensity">
                {data.intensity_bucket && (
                  <Chip variant={data.intensity_bucket === "strong" ? "red" : data.intensity_bucket === "medium" ? "amber" : "blue"}>
                    {data.intensity_bucket}
                  </Chip>
                )}
                {data.favorite_intensity != null && (
                  <span style={{ ...MONO, fontSize: 12, marginLeft: 6 }}>{data.favorite_intensity.toFixed(1)} / 10</span>
                )}
              </TRow>
              {data.beverage_type_preference && (
                <TRow label="Drink style">
                  <Chip variant="neutral">{DRINK_LABEL[data.beverage_type_preference] ?? data.beverage_type_preference}</Chip>
                </TRow>
              )}
              {data.top_flavors?.length ? (
                <TRow label="Top flavors">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                    {data.top_flavors.map((f, i) => (
                      <span key={f} style={{ ...UI, background: i === 0 ? CLR.text : CLR.bg3, color: i === 0 ? "#fff" : CLR.t2, fontSize: 10, fontWeight: i === 0 ? 600 : 500, padding: "2px 8px", display: "inline-block" }}>{f}</span>
                    ))}
                  </div>
                </TRow>
              ) : null}
              {data.format_preferences?.length ? (
                <TRow label="Format pref.">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                    {data.format_preferences.map((f) => <Chip key={f} variant="neutral">{f}</Chip>)}
                  </div>
                </TRow>
              ) : null}
              {data.bought_capsule_categories?.length ? (
                <TRow label="Categories bought">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                    {data.bought_capsule_categories.map((c) => <Chip key={c} variant="green">{c}</Chip>)}
                  </div>
                </TRow>
              ) : null}
            </Tbl>
            {data.never_bought_capsule_categories?.length ? (
              <div>
                <div style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: CLR.t4, marginBottom: 7, marginTop: 12 }}>Has never tried 👇</div>
                <div style={{ display: "flex", flexWrap: "wrap" }}>
                  {data.never_bought_capsule_categories.map((c) => (
                    <span key={c} style={{ ...UI, fontSize: 10, fontWeight: 400, padding: "2px 8px", background: "transparent", color: CLR.t4, border: `1px dashed ${CLR.border2}`, display: "inline-block", margin: "1px 2px 1px 0" }}>{c}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {!data.top_flavors?.length && !data.bought_capsule_categories?.length && (
              <p style={{ ...UI, color: CLR.t4, fontSize: 12, marginTop: 4 }}>No capsule purchase history yet.</p>
            )}
          </Panel>

          {/* MACHINE + LIFECYCLE — right col, stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            <Panel title="Machine journey">
              <Tbl>
                <TRow label="Machine">
                  {data.machine_model ?? (data.has_machine ? "Machine owned" : <span style={{ color: CLR.t4 }}>No machine</span>)}
                </TRow>
                <TRow label="Acquired"><span style={MONO}>{da(data.machine_acquisition_date)}</span></TRow>
                <TRow label="Conversion status">
                  <Chip variant={
                    data.machine_to_capsule_conversion_status === "machine_then_capsules" ? "green"
                      : data.machine_to_capsule_conversion_status === "no_machine" ? "neutral"
                      : data.machine_to_capsule_conversion_status === "machine_only_no_capsules" ? "red"
                      : "amber"
                  }>
                    {CONV_LABEL[data.machine_to_capsule_conversion_status ?? "unknown"] ?? "—"}
                  </Chip>
                </TRow>
                <TRow label="Packs / month">
                  {data.avg_capsule_packs_per_month != null ? <span style={MONO}>{data.avg_capsule_packs_per_month.toFixed(1)}</span> : null}
                </TRow>
              </Tbl>
              {data.recommended_next_machine && (
                <div style={{ background: CLR.ab, border: `1px solid ${CLR.abd}`, padding: "9px 12px", marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🤖</span>
                  <div>
                    <div style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: CLR.t4, marginBottom: 3 }}>Recommended upgrade</div>
                    <div style={{ ...UI, fontSize: 13, fontWeight: 600, color: CLR.a }}>{data.recommended_next_machine}</div>
                  </div>
                </div>
              )}
              {data.machine_to_capsule_conversion_status === "machine_only_no_capsules" && (
                <div style={{ ...UI, background: CLR.rb, borderLeft: `2px solid ${CLR.r}`, color: CLR.t2, padding: "8px 10px", fontSize: 11, lineHeight: 1.6, marginTop: 12 }}>
                  <strong>⚠ Under-consuming.</strong> Has a machine but {data.avg_capsule_packs_per_month ?? 0} packs/mo — trigger a capsule starter offer.
                </div>
              )}
            </Panel>

            <Panel title="Lifecycle & return pattern">
              <Tbl>
                <TRow label="Status"><Chip variant={lifecycleVariant(data.status)}>{lifecycleLabel(data.status)}</Chip></TRow>
                <TRow label="Churn signal">
                  {data.churn_reason
                    ? <span style={{ color: data.churn_reason === "promo_dependent" ? CLR.a : CLR.text, fontWeight: 600 }}>{CHURN_LABEL[data.churn_reason]}</span>
                    : null}
                </TRow>
                <TRow label="Return pattern">
                  {data.return_period_label ? <Chip variant="neutral">{RETURN_LABEL[data.return_period_label]}</Chip> : null}
                </TRow>
                <TRow label="Delivery pref.">
                  {data.delivery_vs_pickup_preference ? DELIVERY_LABEL[data.delivery_vs_pickup_preference] : null}
                </TRow>
                {data.avg_return_interval_days != null && (
                  <TRow label="Avg return"><span style={MONO}>every {Math.round(data.avg_return_interval_days)} days</span></TRow>
                )}
                {data.median_return_interval_days != null && (
                  <TRow label="Median"><span style={MONO}>every {Math.round(data.median_return_interval_days)} days</span></TRow>
                )}
              </Tbl>
              {data.expected_return_window_start && data.expected_return_window_end && (
                <div style={{ background: CLR.bb, padding: "10px 12px", marginTop: 12 }}>
                  <div style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: CLR.t4, marginBottom: 4 }}>Expected return window</div>
                  <div style={{ ...MONO, fontSize: 14, fontWeight: 600, color: CLR.b }}>
                    {da(data.expected_return_window_start)} – {da(data.expected_return_window_end)}
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </div>{/* /row4 */}

        {/* ── NEXT BEST ACTION ── */}
        <div style={{ background: CLR.text, padding: "18px 20px" }}>
          <div style={{ ...UI, fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: CLR.signal, marginBottom: 6 }}>
            Next best action
          </div>
          <div style={{ ...UI, fontSize: 10, color: CLR.t3, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".03em" }}>
            Based on churn signal: {data.churn_reason ? CHURN_LABEL[data.churn_reason] : "—"}
          </div>
          <div style={{ ...UI, fontSize: 12, lineHeight: 1.7, color: "#D0D4D1" }}>
            {nextBestAction(data)}
          </div>
          {isDiscountLed && (
            <div style={{ ...MONO, fontSize: 14, fontWeight: 600, color: "#fff", marginTop: 10 }}>
              Est. margin impact: +8% if converted to full-price
            </div>
          )}
        </div>

        {/* ── RECENT ORDERS ── */}
        <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, overflow: "hidden" }}>
          <div style={{ borderBottom: `1px solid ${CLR.border}`, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={PT}>Recent orders</span>
            <span style={{ ...UI, fontSize: 10, color: CLR.t4 }}>last {Math.min(data.recent_orders.length, 12)}</span>
          </div>
          {!data.recent_orders.length ? (
            <div style={{ padding: "14px 16px" }}>
              <p style={{ ...UI, color: CLR.t4, fontSize: 12 }}>No recent orders.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, ...UI }}>
                <thead>
                  <tr style={{ background: CLR.canvas, borderBottom: `1px solid ${CLR.border}` }}>
                    {["Order", "Date", "Channel", "Discount code", "Discount", "Total"].map((h, i) => (
                      <th key={h} style={{ ...UI, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: CLR.t4, padding: "8px 12px", textAlign: i >= 4 ? "right" : "left", borderBottom: `1px solid ${CLR.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.recent_orders.slice(0, 12).map((o) => (
                    <tr key={o.shopify_order_id} style={{ borderBottom: `1px solid ${CLR.canvas}` }}>
                      <td style={{ ...MONO, padding: "9px 12px", color: CLR.t2 }}>#{o.shopify_order_id}</td>
                      <td style={{ ...MONO, padding: "9px 12px", color: CLR.text }}>{da(o.processed_at)}</td>
                      <td style={{ padding: "9px 12px", color: CLR.text }}>{o.source ? SOURCE_LABEL[o.source] ?? o.source : "—"}</td>
                      <td style={{ ...MONO, padding: "9px 12px", color: o.discount_code ? CLR.a : CLR.t4 }}>{o.discount_code ?? "—"}</td>
                      <td style={{ ...MONO, padding: "9px 12px", textAlign: "right", color: o.discount_amount > 0 ? CLR.a : CLR.t4 }}>
                        {o.discount_amount > 0 ? `−₾${o.discount_amount.toFixed(2)}` : "—"}
                      </td>
                      <td style={{ ...MONO, padding: "9px 12px", textAlign: "right", fontWeight: 600, color: CLR.text }}>{formatGEL(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── BEHAVIOR RECORDING ── */}
        <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, overflow: "hidden" }}>
          <div style={{ borderBottom: `1px solid ${CLR.border}`, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={PT}>Behavior recording</span>
            <span style={{ ...UI, fontSize: 10, color: CLR.t4 }}>Microsoft Clarity</span>
          </div>
          <div style={{ padding: "12px 16px" }}>
            <a
              href={`https://clarity.microsoft.com/projects/view/s77hhg1bkm/impressions?CustomUserId=${data.shopify_customer_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...UI, display: "block", width: "100%", padding: 14, background: CLR.text, color: "#fff", textAlign: "center", fontSize: 13, fontWeight: 600, textDecoration: "none", letterSpacing: ".01em" }}
            >
              Open in Clarity →
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
