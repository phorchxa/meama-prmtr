import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "../components/Skeleton";
import { formatGEL, formatGEL0, formatNumber, tbilisiDate } from "../lib/format";
import {
  fetchPageJourney,
  fetchPortfolio,
  fetchPortfolios,
  type ChurnReason,
  type CustomerSegment,
  type CustomerStatus,
  type DeliveryVsPickupPreference,
  type ListParams,
  type PageJourney,
  type PageJourneyEntry,
  type PortfolioDetail,
  type PortfolioSummary,
  type ReturnPeriodLabel,
  type SessionProduct,
} from "../lib/portfoliosApi";
import { PageHeader } from "./PageHeader";

// ── Color tokens (from meama-crm.html) ──────────────────────────
const CLR = {
  g: "#1c7a4a", gb: "#ecf7f1", gbd: "#b0dcc4",
  r: "#b83228", rb: "#fdf2f1", rbd: "#edb8b3",
  a: "#8a5a0a", ab: "#fdf5e8", abd: "#e0c898",
  b: "#1a4d8a", bb: "#edf2fc", bbd: "#afc8f0",
  tl: "#0c6868", tlb: "#edf6f6", tlbd: "#98d0d0",
  pu: "#5a3a9a", pub: "#f2eeff", pubd: "#c4a8f0",
  text: "#161513", t2: "#666460", t3: "#9e9b96", t4: "#c4c1bc",
  bg2: "#ffffff", bg3: "#f2f1ef", bg4: "#ebebea", bg5: "#e2e1de",
  border: "#e4e3e0", border2: "#d4d3d0",
};

type Variant = "green" | "red" | "amber" | "blue" | "teal" | "purple" | "neutral";

const TAG_TOKEN: Record<Variant, { bg: string; color: string; border: string }> = {
  green:   { bg: CLR.gb,  color: CLR.g,  border: CLR.gbd  },
  red:     { bg: CLR.rb,  color: CLR.r,  border: CLR.rbd  },
  amber:   { bg: CLR.ab,  color: CLR.a,  border: CLR.abd  },
  blue:    { bg: CLR.bb,  color: CLR.b,  border: CLR.bbd  },
  teal:    { bg: CLR.tlb, color: CLR.tl, border: CLR.tlbd },
  purple:  { bg: CLR.pub, color: CLR.pu, border: CLR.pubd },
  neutral: { bg: CLR.bg3, color: CLR.t2, border: CLR.border },
};

// ── Helpers ──────────────────────────────────────────────────────
function segAccent(seg: CustomerSegment): string {
  const m: Record<CustomerSegment, string> = {
    loyalist: CLR.g, at_risk: CLR.r, lapsed: CLR.t3, new_machine: CLR.a, active: CLR.g, prospect: CLR.t3,
  };
  return m[seg] ?? CLR.g;
}

function segVariant(seg: CustomerSegment): Variant {
  const m: Record<CustomerSegment, Variant> = {
    loyalist: "green", at_risk: "red", lapsed: "neutral", new_machine: "amber", active: "green", prospect: "neutral",
  };
  return m[seg] ?? "neutral";
}

function segLabel(seg: CustomerSegment): string {
  const m: Record<CustomerSegment, string> = {
    loyalist: "Loyalist", at_risk: "At risk", lapsed: "Lapsed", new_machine: "New machine", active: "Active", prospect: "Prospect",
  };
  return m[seg] ?? seg;
}

function lifecycleLabel(s: CustomerStatus): string {
  return s === "prospect" ? "Prospect" : s === "lost" ? "Lapsed" : s === "at_risk" ? "At-risk" : s === "new" ? "New" : "Active";
}

function lifecycleVariant(s: CustomerStatus): Variant {
  return s === "prospect" ? "neutral" : s === "lost" ? "red" : s === "at_risk" ? "amber" : s === "new" ? "blue" : "green";
}

function healthColor(score: number): string {
  return score >= 75 ? CLR.g : score >= 50 ? CLR.a : CLR.r;
}

function churnColor(risk: number): string {
  return risk >= 70 ? CLR.r : risk >= 40 ? CLR.a : CLR.g;
}

function rfm5(data: PortfolioSummary) {
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

function reorderText(data: PortfolioSummary): string {
  const days = data.days_since_last_order;
  const interval = data.avg_return_interval_days;
  if (days == null) return "No order history";
  if (!interval) return data.expected_next_order_date ? `Expected ${tbilisiDate(data.expected_next_order_date)}` : "No pattern yet";
  const remaining = Math.round(interval - days);
  if (remaining < 0) return `${Math.abs(remaining)} days overdue`;
  if (remaining === 0) return "Due today";
  return `Due in ${remaining} days`;
}

function reorderPct(data: PortfolioSummary): number {
  const days = data.days_since_last_order;
  const interval = data.avg_return_interval_days;
  if (days == null || !interval) return 50;
  const pct = Math.max(5, Math.min(100, ((interval - days) / interval) * 100));
  return pct;
}

function reorderColor(data: PortfolioSummary): string {
  const days = data.days_since_last_order;
  const interval = data.avg_return_interval_days;
  if (!days || !interval) return CLR.t3;
  return days > interval ? CLR.r : days > interval * 0.8 ? CLR.a : CLR.g;
}

function joinedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function da(v: string | null | undefined): string { return v ? tbilisiDate(v) : "—"; }

function relTimeSince(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const FUNNEL_STAGE_LABEL: Record<number, string> = {
  1: "Browsing", 2: "Product view", 3: "Added to cart",
  4: "Checkout started", 5: "Payment info", 6: "Purchase", 7: "Purchase",
};


function nextBestAction(data: PortfolioSummary): string {
  if (data.churn_reason === "healthy_active") return "Keep cadence steady; surface a relevant capsule refill.";
  if (data.churn_reason === "promo_dependent") return "Use value framing before discounts; protect full-price margin.";
  if (data.churn_reason === "long_recency_gap") return "Prioritize a win-back message tied to their product profile.";
  if (data.churn_reason === "machine_without_capsules") return "Trigger machine-owner capsule education and starter bundle.";
  if (data.churn_reason === "low_frequency") return "Send reorder reminder near the expected return window.";
  if (data.churn_reason === "single_category_dependency") return "Recommend an adjacent capsule category.";
  if (data.recommended_next_machine) return `Recommend ${data.recommended_next_machine} machine upgrade.`;
  if (data.expected_next_order_date) return "Prepare reorder outreach before expected next order.";
  return "Review customer history before campaign selection.";
}

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

// ── Small reusable components ─────────────────────────────────────

function Tag({ variant = "neutral", children }: { variant?: Variant; children: ReactNode }) {
  const t = TAG_TOKEN[variant];
  return (
    <span
      style={{ background: t.bg, color: t.color, borderColor: t.border }}
      className="inline-flex items-center border px-1.5 py-[1px] rounded-[3px] font-mono text-[10.5px] whitespace-nowrap"
    >
      {children}
    </span>
  );
}

function PanelHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{ borderBottom: `1px solid ${CLR.border}`, background: CLR.bg2 }}
      className="flex items-center gap-2 px-4 py-[11px]"
    >
      <span className="text-[12.5px] font-medium" style={{ color: CLR.text }}>{title}</span>
      {sub && <span className="ml-auto font-mono text-[10px]" style={{ color: CLR.t3 }}>{sub}</span>}
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: 10, overflow: "hidden" }}>
      <PanelHeader title={title} sub={sub} />
      <div className="p-4">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[8.5px] uppercase tracking-[.07em] mb-[3px]" style={{ color: CLR.t3 }}>
      {children}
    </div>
  );
}

function FieldVal({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <div className="text-[12px] font-medium leading-snug truncate" style={{ color: muted ? CLR.t3 : CLR.text }}>
      {children ?? "—"}
    </div>
  );
}

function Grid2({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-[10px]">{children}</div>;
}

function Fld({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <FieldVal muted={muted}>{value ?? "—"}</FieldVal>
    </div>
  );
}

function ChipList({ values }: { values: string[] | null | undefined }) {
  if (!values?.length) return <span style={{ color: CLR.t3 }}>—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          style={{ background: CLR.bg3, borderColor: CLR.border, color: CLR.text }}
          className="rounded-full border px-2 py-[3px] text-[11px] leading-tight"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function ProductList({ products }: { products: SessionProduct[] | null | undefined }) {
  if (!products?.length) return <span style={{ color: CLR.t3 }}>—</span>;
  return (
    <div className="flex flex-col gap-1.5">
      {products.map((product) => (
        <div key={product.sku} className="min-w-0">
          <div className="truncate text-[12px] font-medium leading-tight" style={{ color: CLR.text }}>
            {product.title}
          </div>
          <div className="truncate font-mono text-[9px] leading-tight" style={{ color: CLR.t3 }}>
            {product.sku}
          </div>
        </div>
      ))}
    </div>
  );
}

function sessionViewedProducts(data: PortfolioSummary) {
  return data.latest_session?.viewed_products ?? data.viewed_products ?? [];
}

function sessionCartProducts(data: PortfolioSummary) {
  return data.latest_session?.cart_products ?? data.cart_products ?? [];
}

function sessionAddToCarts(data: PortfolioSummary) {
  return data.latest_session?.add_to_carts ?? data.add_to_carts ?? null;
}

function sessionConverted(data: PortfolioSummary) {
  return data.latest_session?.converted ?? data.converted ?? null;
}

function sessionCartStatus(data: PortfolioSummary) {
  if (data.latest_session?.cart_status) return data.latest_session.cart_status;
  if (data.cart_status) return data.cart_status;
  if (sessionConverted(data) === true) return "converted";
  if ((sessionAddToCarts(data) ?? 0) > 0 && sessionConverted(data) === false) return "active_abandoner";
  return sessionViewedProducts(data).length ? "browsing_only" : "no_cart_activity";
}

function recoveredOrderAt(data: PortfolioSummary) {
  return data.latest_session?.recovered_order_at ?? data.recovered_order_at ?? null;
}

function daysToRecovery(data: PortfolioSummary) {
  return data.latest_session?.days_to_recovery ?? data.days_to_recovery ?? null;
}

function cartStatusLabel(data: PortfolioSummary) {
  const status = sessionCartStatus(data);
  if (status === "active_abandoner") return "Cart abandoner";
  if (status === "recovered_after_abandonment") return "Recovered after abandonment";
  if (status === "converted") return "Converted session";
  if (status === "browsing_only") return "Browsing only";
  return "No cart activity";
}

function ConsentPills({ email, sms }: { email: boolean; sms: boolean }) {
  return (
    <div className="flex gap-1.5 mt-[3px]">
      <span
        style={email
          ? { background: CLR.gb, color: CLR.g, borderColor: CLR.gbd }
          : { background: CLR.bg3, color: CLR.t4, borderColor: CLR.border }}
        className="font-mono text-[9.5px] px-[7px] py-[2px] rounded-full border"
      >
        ✉ {email ? "Email" : "Email ✕"}
      </span>
      <span
        style={sms
          ? { background: CLR.gb, color: CLR.g, borderColor: CLR.gbd }
          : { background: CLR.bg3, color: CLR.t4, borderColor: CLR.border }}
        className="font-mono text-[9.5px] px-[7px] py-[2px] rounded-full border"
      >
        💬 {sms ? "SMS" : "SMS ✕"}
      </span>
    </div>
  );
}

// ── CustomerCard ─────────────────────────────────────────────────

function CustomerCard({ customer, onOpen }: { customer: PortfolioSummary; onOpen: (id: number) => void }) {
  const promoSharePct = Math.round((customer.promo_share ?? 0) * 100);
  const fullSharePct = 100 - promoSharePct;
  const isDiscountLed = (customer.promo_share ?? 0) >= 0.6;
  const accent = segAccent(customer.segment);

  const flavors = customer.top_flavors?.slice(0, 3) ?? [];
  const viewedProducts = sessionViewedProducts(customer);
  const cartProducts = sessionCartProducts(customer);
  const sessionProducts = cartProducts.length > 0 ? cartProducts : viewedProducts;
  const lastViewedProducts = customer.last_viewed_products?.filter(Boolean) ?? [];
  const lastViewedCategory = customer.last_viewed_category ?? customer.top_browsed_category;
  const sessionProductCount = sessionProducts.length || lastViewedProducts.length;
  const sessionProductTitle = sessionProducts[0]?.title ?? lastViewedProducts[0];

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={(e) => { (e.currentTarget as HTMLElement).blur(); onOpen(customer.shopify_customer_id); }}
      onKeyDown={(e) => e.key === "Enter" && onOpen(customer.shopify_customer_id)}
      style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: 14 }}
      className="cursor-pointer overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_-10px_rgba(0,0,0,.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1c7a4a]/40"
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = CLR.border2)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = CLR.border)}
    >
      {/* Top: avatar + name + LTV */}
      <div style={{ borderBottom: `1px solid ${CLR.border}` }} className="flex items-start gap-[11px] px-4 pb-3 pt-[14px]">
        <div
          style={{ background: accent, width: 42, height: 42, borderRadius: 12 }}
          className="flex shrink-0 items-center justify-center text-[15px] font-semibold text-white"
        >
          {customer.initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold leading-[1.1] tracking-[-0.01em] truncate" style={{ color: CLR.text }}>
            {customer.full_name?.trim() || `#${customer.shopify_customer_id}`}
          </div>
          <div className="mt-[3px] flex flex-wrap items-center gap-[5px] font-mono text-[10px]" style={{ color: CLR.t3 }}>
            <Tag variant={segVariant(customer.segment)}>{segLabel(customer.segment)}</Tag>
            <span>· joined {joinedDate(customer.customer_since)}</span>
            {isDiscountLed && <Tag variant="red">Discount-led</Tag>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[16px] font-light leading-none" style={{ color: CLR.text }}>
            {formatGEL0(customer.total_spend)}
          </div>
          <div className="font-mono text-[8.5px] uppercase tracking-[.08em] mt-[3px]" style={{ color: CLR.t3 }}>Lifetime</div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {/* Health strip */}
        <div
          style={{ borderBottom: `1px dashed ${CLR.border2}` }}
          className="flex items-center gap-2 mb-[11px] pb-[11px]"
        >
          <Tag variant={lifecycleVariant(customer.status)}>{lifecycleLabel(customer.status)}</Tag>
          <span className="font-mono text-[8.5px] uppercase tracking-[.06em]" style={{ color: CLR.t3 }}>Health</span>
          <div className="flex-1 h-[6px] rounded overflow-hidden" style={{ background: CLR.bg4 }}>
            <div style={{ width: `${customer.health_score}%`, height: "100%", background: healthColor(customer.health_score), borderRadius: 4 }} />
          </div>
          <span className="font-mono text-[13px] font-semibold w-[26px] text-right" style={{ color: healthColor(customer.health_score) }}>
            {customer.health_score}
          </span>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-2 gap-x-[14px] gap-y-[10px]">
          <div>
            <FieldLabel>📍 Location</FieldLabel>
            <FieldVal>{customer.capital_vs_regional === "capital" ? "Capital (Tbilisi)" : customer.capital_vs_regional === "regional" ? "Regional" : customer.region === "tbilisi" ? "Tbilisi" : customer.region === "regions" ? "Regions" : "—"}</FieldVal>
          </div>
          <div>
            <FieldLabel>☕ Machine</FieldLabel>
            <FieldVal muted={!customer.has_machine}>{customer.has_machine ? (customer.machine_model ?? "Machine owned") : "No machine"}</FieldVal>
          </div>
          <div>
            <FieldLabel>📋 Last order</FieldLabel>
            <FieldVal muted={!customer.last_order_at}>{customer.last_order_at ? da(customer.last_order_at) : "—"}</FieldVal>
          </div>
          <div>
            <FieldLabel>📦 Orders / freq</FieldLabel>
            <FieldVal>
              {customer.order_count > 0
                ? `${customer.order_count}${customer.avg_return_interval_days ? ` · every ${Math.round(customer.avg_return_interval_days)}d` : ""}`
                : "—"}
            </FieldVal>
          </div>
        </div>

        {/* Promo vs full-price bar */}
        {customer.order_count > 0 && (customer.promo_spend + customer.full_price_spend) > 0 && (
          <div style={{ borderTop: `1px dashed ${CLR.border2}` }} className="mt-[11px] pt-[11px]">
            <div className="flex justify-between items-center mb-[6px]">
              <FieldLabel>₾ Promo vs full-price spend</FieldLabel>
              <span className="font-mono text-[10px]" style={{ color: isDiscountLed ? CLR.r : CLR.t3 }}>
                {promoSharePct}% on promo
              </span>
            </div>
            <div className="flex h-[8px] rounded overflow-hidden" style={{ background: CLR.bg4 }}>
              <div style={{ width: `${fullSharePct}%`, background: CLR.g, opacity: 0.8 }} title={`Full price ₾${customer.full_price_spend.toFixed(0)}`} />
              <div style={{ width: `${promoSharePct}%`, background: CLR.a, opacity: 0.85 }} title={`Promo ₾${customer.promo_spend.toFixed(0)}`} />
            </div>
            <div className="flex justify-between font-mono text-[9.5px] mt-1" style={{ color: CLR.t3 }}>
              <span style={{ color: CLR.g }}>Full ₾{formatNumber(customer.full_price_spend)}</span>
              <span style={{ color: CLR.a }}>Promo ₾{formatNumber(customer.promo_spend)} · {customer.promo_orders} orders</span>
            </div>
          </div>
        )}

        {/* Session line (prototype A) — show whenever session data exists */}
        {!!customer.last_session_at && (
          <div
            style={{
              borderTop: `1px dashed ${customer.session_warm ? "#C8B090" : CLR.border2}`,
              background: customer.session_warm ? "#FBF6EC" : CLR.bg3,
              borderRadius: 7, padding: "10px 12px", marginTop: 11,
            }}
          >
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-[6px] font-mono text-[10px] tracking-[.06em] uppercase"
                style={{ color: customer.session_warm ? "#A9772F" : CLR.t3 }}>
                {customer.session_warm && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#A9772F", boxShadow: "0 0 0 3px rgba(185,138,62,.2)", display: "inline-block" }} />
                )}
                {customer.session_warm ? "Warm · browsing" : "Last session"}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[.06em]" style={{ color: "#A39B89" }}>
                {relTimeSince(customer.last_session_at)}
              </span>
            </div>
            <div className="mt-[6px] text-[11.5px]" style={{ color: "#2B2823" }}>
              {customer.last_funnel_stage != null && (
                <span>Reached <b>{FUNNEL_STAGE_LABEL[customer.last_funnel_stage] ?? `Stage ${customer.last_funnel_stage}`}</b></span>
              )}
              {customer.last_cart_recovery_outcome === "recovered_same" && (
                <> <Tag variant="green">Recovered ✓ same</Tag></>
              )}
              {customer.last_cart_recovery_outcome === "recovered_different" && (
                <> <Tag variant="amber">Recovered · different</Tag></>
              )}
              {customer.last_cart_value != null && customer.last_cart_value > 0 && (
                <span> · <b>₾{customer.last_cart_value.toFixed(0)}</b> cart</span>
              )}
              {sessionProductTitle && (
                <span>
                  {" "}· {cartProducts.length > 0 ? "carted" : "viewing"} <b>{sessionProductTitle}</b>
                  {sessionProductCount > 1 ? ` +${sessionProductCount - 1}` : ""}
                  {lastViewedCategory && <> <Tag variant="neutral">{lastViewedCategory}</Tag></>}
                </span>
              )}
              {!sessionProductTitle && lastViewedCategory && (
                <span> · viewing <b>{lastViewedCategory}</b></span>
              )}
              {!customer.last_funnel_stage && !lastViewedCategory && customer.sessions_30d != null && (
                <span className="font-mono text-[10px]" style={{ color: CLR.t3 }}>
                  {customer.sessions_30d} session{customer.sessions_30d !== 1 ? "s" : ""} · 30d
                </span>
              )}
            </div>
          </div>
        )}

        {/* Contact */}
        <div style={{ borderTop: `1px dashed ${CLR.border2}` }} className="mt-[11px] pt-[11px] flex flex-col gap-[5px]">
          <div className="flex items-center gap-[7px] min-w-0">
            <span className="text-[11px] w-[13px] text-center shrink-0" style={{ color: CLR.t3 }}>✉</span>
            <span className="font-mono text-[10.5px] truncate" style={{ color: CLR.t2 }}>{customer.email ?? "[phone-only]"}</span>
          </div>
          {customer.phone && (
            <div className="flex items-center gap-[7px] min-w-0">
              <span className="text-[11px] w-[13px] text-center shrink-0" style={{ color: CLR.t3 }}>📞</span>
              <span className="font-mono text-[10.5px] truncate" style={{ color: CLR.t2 }}>{customer.phone}</span>
            </div>
          )}
          <ConsentPills email={customer.accept_marketing_email} sms={customer.sms_marketing} />
        </div>
      </div>

      {/* Buys together / flavors section */}
      <div style={{ borderTop: `1px solid ${CLR.border}`, background: CLR.bg3 }} className="px-4 pb-[13px] pt-[11px]">
        <div className="font-mono text-[8.5px] uppercase tracking-[.07em] mb-[7px]" style={{ color: CLR.t3 }}>
          {flavors.length ? "Top flavors" : "Product signal"}
        </div>
        <div className="flex flex-wrap gap-[5px]">
          {flavors.length ? flavors.map((f, i) => (
            <span
              key={f}
              style={i === 0
                ? { background: CLR.text, color: "#fff", border: `1px solid ${CLR.text}` }
                : { background: CLR.bg2, color: CLR.text, border: `1px solid ${CLR.border2}` }}
              className="text-[11px] px-[9px] py-[3px] rounded-full inline-flex items-center gap-[5px]"
            >
              {f}
            </span>
          )) : (
            <>
              {customer.top_item_title && (
                <span style={{ background: CLR.text, color: "#fff", border: `1px solid ${CLR.text}` }}
                  className="text-[11px] px-[9px] py-[3px] rounded-full">{customer.top_item_title}</span>
              )}
              {customer.top_product_types?.[0] && (
                <span style={{ background: CLR.bg2, color: CLR.text, border: `1px solid ${CLR.border2}` }}
                  className="text-[11px] px-[9px] py-[3px] rounded-full">{customer.top_product_types[0]}</span>
              )}
              {!customer.top_item_title && !customer.top_product_types?.[0] && (
                <span className="text-[11.5px]" style={{ color: CLR.t3 }}>No capsule history yet</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reorder footer */}
      <div style={{ borderTop: `1px solid ${CLR.border}` }} className="flex items-center gap-2 px-4 py-[10px]">
        <div className="flex-1 min-w-0">
          <div className="flex justify-between font-mono text-[9px] uppercase tracking-[.06em] mb-[5px]">
            <span style={{ color: CLR.t3 }}>Reorder window</span>
            <span style={{ color: reorderColor(customer) }}>{reorderText(customer)}</span>
          </div>
          <div className="h-[5px] rounded overflow-hidden" style={{ background: CLR.bg4 }}>
            <div style={{ width: `${reorderPct(customer)}%`, height: "100%", background: reorderColor(customer), borderRadius: 3 }} />
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Drawer loading / error ────────────────────────────────────────

function DrawerSkeleton() {
  return (
    <div className="p-5 space-y-4">
      <Skeleton className="h-[76px] rounded-xl" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[68px] rounded-xl" />)}
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-36 rounded-xl" />
    </div>
  );
}

// ── CustomerDrawer ────────────────────────────────────────────────

function CustomerDrawer({ customerId, onClose }: { customerId: number | null; onClose: () => void }) {
  const [data, setData] = useState<PortfolioDetail | null>(null);
  const [pageJourney, setPageJourney] = useState<PageJourney | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = customerId !== null;

  useEffect(() => {
    if (!open) { setData(null); setPageJourney(null); setError(null); return; }
    setLoading(true);
    setError(null);
    Promise.all([
      fetchPortfolio(customerId),
      fetchPageJourney(customerId).catch(() => null),
    ])
      .then(([portfolio, journey]) => { setData(portfolio); setPageJourney(journey); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [customerId, open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ background: "rgba(20,18,16,.32)", backdropFilter: "blur(2px)" }}
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{
          background: "#f7f6f4",
          borderLeft: `1px solid ${CLR.border}`,
          boxShadow: "-20px 0 50px -20px rgba(0,0,0,.25)",
        }}
        className={`fixed top-0 right-0 bottom-0 z-50 flex w-[540px] max-w-[92vw] flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {loading && !data && <DrawerSkeleton />}
        {error && <div className="p-5 text-[13px]" style={{ color: CLR.r }}>Error: {error}</div>}

        {data && <DrawerContent data={data} onClose={onClose} pageJourney={pageJourney} />}
      </aside>
    </>
  );
}

const CAT_EMOJI: Record<string, string> = {
  home: "🏠", product: "📦", collection: "📚", cart: "🛒",
  checkout: "💳", account: "👤", info: "📄", bundle: "🎁", search: "🔍",
};
function catEmoji(cat: string): string { return CAT_EMOJI[cat?.toLowerCase()] ?? "📄"; }
function engColor(level: string): string {
  if (level === "bounce") return CLR.r;
  if (level === "quick")  return CLR.a;
  if (level === "engaged" || level === "deep") return CLR.g;
  return CLR.t3;
}
function engBg(level: string): string {
  if (level === "bounce") return CLR.rb;
  if (level === "quick")  return CLR.ab;
  if (level === "engaged" || level === "deep") return CLR.gb;
  return "#efefed";
}

function DrawerContent({ data, onClose, pageJourney }: { data: PortfolioDetail; onClose: () => void; pageJourney?: PageJourney | null }) {

  const accent = segAccent(data.segment);
  const churnRiskStat = 100 - data.health_score;
  const { R, F, M } = rfm5(data);
  const rLabel = rfmLabel(R, F, M);
  const promoSharePct = Math.round((data.promo_share ?? 0) * 100);
  const fullSharePct = 100 - promoSharePct;
  const isDiscountLed = (data.promo_share ?? 0) >= 0.6;
  const spendTotal = (data.promo_spend ?? 0) + (data.full_price_spend ?? 0);
  const hasSpendData = spendTotal > 0;

  // Channel split
  const eco = Math.round((data.ecommerce_share ?? 0) * 100);
  const store = Math.round((data.brand_store_share ?? 0) * 100);
  const appPct = Math.round(((data as PortfolioDetail & { app_share?: number | null }).app_share ?? 0) * 100);

  // Under-consuming: machine owner buying capsules < half expected
  const underConsuming =
    data.has_machine &&
    data.avg_capsule_packs_per_month != null &&
    data.avg_capsule_packs_per_month < 1.5;

  // Spend insight
  const spendInsight = isDiscountLed
    ? `${promoSharePct}% of spend is discount-led. Margin risk — they wait for sales. Pull from blanket promos and test value offers (free shipping, loyalty points, a free sample) to build a full-price habit.`
    : promoSharePct <= 20
    ? `Healthy — ${fullSharePct}% full-price. Protect this: reward with early access and loyalty, never train them to expect discounts.`
    : `Mixed — ${promoSharePct}% on promo. Watch the trend; nudge toward full-price reorders with convenience, not price.`;

  return (
    <>
      {/* Header */}
      <div
        style={{ background: CLR.bg2, borderBottom: `1px solid ${CLR.border}` }}
        className="flex shrink-0 items-start gap-[13px] px-5 py-[18px]"
      >
        <div style={{ background: accent, width: 50, height: 50, borderRadius: 14 }}
          className="flex shrink-0 items-center justify-center text-[18px] font-semibold text-white">
          {data.initials || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-semibold tracking-[-0.01em]" style={{ color: CLR.text }}>
            {data.full_name?.trim() || `#${data.shopify_customer_id}`}
          </div>
          <div className="font-mono text-[10px] mt-[4px] flex flex-wrap gap-[5px] items-center" style={{ color: CLR.t3 }}>
            <Tag variant={segVariant(data.segment)}>{segLabel(data.segment)}</Tag>
            {isDiscountLed && <Tag variant="red">Discount-led</Tag>}
            <span>· {data.capital_vs_regional === "capital" ? "Capital" : data.capital_vs_regional === "regional" ? "Regional" : data.region === "tbilisi" ? "Tbilisi" : "Regions"}</span>
            <span>· joined {joinedDate(data.customer_since)}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ border: `1px solid ${CLR.border}`, background: CLR.bg2, borderRadius: 7, color: CLR.t2 }}
          className="flex h-[28px] w-[28px] shrink-0 items-center justify-center text-[13px] hover:bg-[#f2f1ef]"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-[14px]">

        {/* Stat row */}
        <div className="grid grid-cols-4 gap-[9px]">
          {[
            { label: "LTV", value: formatGEL0(data.total_spend), color: CLR.text },
            { label: "Orders", value: String(data.order_count), color: CLR.text },
            { label: "AOV", value: formatGEL(data.aov), color: CLR.text },
            { label: "Churn risk", value: `${churnRiskStat}%`, color: churnColor(churnRiskStat) },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: 10 }} className="p-3">
              <div className="font-mono text-[8.5px] uppercase tracking-[.06em] mb-[5px]" style={{ color: CLR.t3 }}>{label}</div>
              <div className="text-[17px] font-light leading-none" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Sessions & on-site behavior — always rendered */}
        <Panel
          title="Sessions & on-site behavior"
          sub={data.sessions_30d != null && data.sessions_30d > 0
            ? `${data.sessions_30d} session${data.sessions_30d !== 1 ? "s" : ""} · 30d`
            : undefined}
        >
          {!data.last_session_at ? (
            <p className="text-[11.5px] leading-[1.55]" style={{ color: CLR.t3 }}>
              No sessions recorded yet — fills in once this customer browses while logged in.
            </p>
          ) : (
            <>
              {data.session_warm && !["recovered_after_abandonment", "converted"].includes(sessionCartStatus(data)) && (
                <div style={{ background: "#FBF6EC", border: `1px solid #C8B090`, borderRadius: 7, padding: "8px 11px", marginBottom: 11 }}>
                  <span className="flex items-center gap-[6px] font-mono text-[10px] uppercase tracking-[.06em]" style={{ color: "#A9772F" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#A9772F", boxShadow: "0 0 0 3px rgba(185,138,62,.2)", display: "inline-block" }} />
                    Warm · actively browsing, no recent order — win-back opportunity
                  </span>
                </div>
              )}
              {sessionCartStatus(data) === "active_abandoner" && (
                <div style={{ background: CLR.rb, border: `1px solid ${CLR.rbd}`, borderRadius: 7, padding: "8px 11px", marginBottom: 11 }}>
                  <div className="font-mono text-[10px] uppercase tracking-[.06em]" style={{ color: CLR.r }}>
                    Cart abandoner
                  </div>
                  {sessionCartProducts(data).length ? <div className="mt-2"><ProductList products={sessionCartProducts(data)} /></div> : null}
                </div>
              )}
              {sessionCartStatus(data) === "recovered_after_abandonment" && (
                <div style={{ background: CLR.gb, border: `1px solid ${CLR.gbd}`, borderRadius: 7, padding: "8px 11px", marginBottom: 11 }}>
                  <div className="font-mono text-[10px] uppercase tracking-[.06em]" style={{ color: CLR.g }}>
                    Recovered after abandonment
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: CLR.t2 }}>
                    {recoveredOrderAt(data) ? da(recoveredOrderAt(data)) : "Recovered order date unavailable"}
                    {daysToRecovery(data) != null ? ` · ${daysToRecovery(data)}d to recovery` : ""}
                  </div>
                </div>
              )}
              {sessionCartStatus(data) === "converted" && (
                <div style={{ background: CLR.bb, border: `1px solid ${CLR.bbd}`, borderRadius: 7, padding: "8px 11px", marginBottom: 11 }}>
                  <span className="font-mono text-[10px] uppercase tracking-[.06em]" style={{ color: CLR.b }}>
                    Converted session
                  </span>
                </div>
              )}
              <Grid2>
                <Fld label="Cart status" value={cartStatusLabel(data)} />
                <Fld label="Sessions · 30d" value={data.sessions_30d ?? "—"} />
                <Fld label="Last seen" value={relTimeSince(data.last_session_at)} />
                <Fld label="Days since session" value={data.days_since_last_session != null ? `${data.days_since_last_session}d` : "—"} />
                <Fld label="Checkout abandons" value={data.checkout_abandons ?? "—"} />
                <Fld label="Last funnel stage" value={data.last_funnel_stage != null ? (FUNNEL_STAGE_LABEL[data.last_funnel_stage] ?? `Stage ${data.last_funnel_stage}`) : "—"} />
                <Fld label="Last cart value" value={data.last_cart_value != null && data.last_cart_value > 0 ? `₾${data.last_cart_value.toFixed(0)}` : "—"} />
                <Fld label="Viewed products" value={sessionViewedProducts(data).length ? <ProductList products={sessionViewedProducts(data)} /> : <ChipList values={data.last_viewed_products} />} />
                <Fld label="Added to cart" value={<ProductList products={sessionCartProducts(data)} />} />
                <Fld label="Format" value={data.last_viewed_category ?? data.top_browsed_category ?? "—"} />
                <Fld label="Browsed over time" value={<ChipList values={data.top_viewed_products} />} />
                <Fld label="Device" value={data.last_session_device ?? "—"} />
                {data.last_cart_recovery_outcome && (
                  <Fld
                    label="Cart recovery"
                    value={
                      data.last_cart_recovery_outcome === "recovered_same"
                        ? <span style={{ color: CLR.g }}>Bought what they carted</span>
                        : data.last_cart_recovery_outcome === "recovered_different"
                          ? <span style={{ color: CLR.a }}>Bought — different items</span>
                          : (data.last_cart_value ?? 0) > 0
                            ? <span style={{ color: CLR.t3 }}>Still a target</span>
                            : "—"
                    }
                  />
                )}
                {(data.last_carted_products?.length ?? 0) > 0 && (
                  <Fld label="Carted products" value={<ChipList values={data.last_carted_products} />} />
                )}
                {!data.session_warm && (data.last_funnel_stage ?? 0) >= 6 && (data.recent_orders?.length ?? 0) > 0 && (
                  <Fld
                    label="Last purchase"
                    value={`${formatGEL(data.recent_orders[0].total)} · ${relTimeSince(data.recent_orders[0].processed_at)}`}
                  />
                )}
              </Grid2>
            </>
          )}
        </Panel>

        {/* Page journey */}
        {pageJourney && pageJourney.pages.length > 0 && (
          <Panel title="Page journey" sub={`${pageJourney.total_pages_visited} pages · 30d`}>
            <Grid2>
              <Fld label="Total pages" value={pageJourney.total_pages_visited} />
              <Fld
                label="Most visited"
                value={pageJourney.most_visited_category || "—"}
              />
              <Fld
                label="Avg time on page"
                value={pageJourney.avg_time_on_page_sec > 0 ? `${Math.round(pageJourney.avg_time_on_page_sec)}s` : "—"}
              />
              <Fld
                label="Exit page"
                value={pageJourney.exit_page
                  ? <span className="font-mono text-[10px]" title={pageJourney.exit_page}>
                      {pageJourney.exit_page_label
                        ? pageJourney.exit_page_label
                        : pageJourney.exit_page.length > 25
                          ? pageJourney.exit_page.slice(0, 22) + "…"
                          : pageJourney.exit_page}
                    </span>
                  : "—"}
              />
            </Grid2>
            <div className="mt-[12px] space-y-[6px]">
              {(pageJourney.pages as PageJourneyEntry[]).slice(0, 10).map((p, i) => (
                <div key={i} className="flex items-center gap-[7px]">
                  <span className="text-[13px] leading-none">{catEmoji(p.page_category)}</span>
                  <span
                    className="flex-1 truncate font-mono text-[10px]"
                    style={{ color: CLR.text }}
                    title={p.path}
                  >
                    {p.page_label || (p.path.length > 35 ? p.path.slice(0, 32) + "…" : p.path)}
                  </span>
                  {p.time_on_page_sec != null && (
                    <span
                      className="rounded px-[5px] py-[1px] text-[9px] font-medium whitespace-nowrap"
                      style={{ background: engBg(p.engagement_level), color: engColor(p.engagement_level) }}
                    >
                      {Math.round(p.time_on_page_sec)}s
                    </span>
                  )}
                  <span className="text-[10px] whitespace-nowrap" style={{ color: CLR.t3 }}>
                    {relTimeSince(p.occurred_at)}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* 3. Account health */}
        <Panel title="Account health" sub={rLabel}>
          {/* Health ring + RFM blocks */}
          <div className="flex items-center gap-4 mb-[13px]">
            {/* Ring */}
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: `conic-gradient(${healthColor(data.health_score)} ${data.health_score * 3.6}deg, ${CLR.bg4} 0)`,
            }} className="flex shrink-0 items-center justify-center">
              <div style={{ width: 43, height: 43, borderRadius: "50%", background: CLR.bg2 }}
                className="flex flex-col items-center justify-center">
                <div className="text-[16px] font-semibold leading-none" style={{ color: healthColor(data.health_score) }}>
                  {data.health_score}
                </div>
                <div className="font-mono text-[7px] uppercase" style={{ color: CLR.t3 }}>health</div>
              </div>
            </div>
            {/* R/F/M blocks */}
            <div className="flex gap-[18px]">
              {[["R", R], ["F", F], ["M", M]].map(([k, v]) => (
                <div key={k as string} className="text-center">
                  <div className="font-mono text-[9px]" style={{ color: CLR.t3 }}>{k as string}</div>
                  <div className="text-[15px] font-light" style={{ color: (v as number) >= 4 ? CLR.g : (v as number) >= 3 ? CLR.a : CLR.r }}>
                    {v as number}
                  </div>
                </div>
              ))}
            </div>
            <div className="ml-auto text-right">
              <div className="font-mono text-[8.5px] uppercase tracking-[.06em] mb-1" style={{ color: CLR.t3 }}>Lifecycle</div>
              <Tag variant={lifecycleVariant(data.status)}>{lifecycleLabel(data.status)}</Tag>
            </div>
          </div>
          <Grid2>
            <Fld label="Predicted next order" value={da(data.expected_next_order_date)} />
            <Fld label="Days since last order" value={data.days_since_last_order != null ? `${data.days_since_last_order} days` : "—"} />
            <Fld label="RFM label" value={rLabel} />
            <Fld label="Categories bought" value={data.top_product_types?.join(" · ") ?? "—"} />
          </Grid2>
        </Panel>

        {/* 4. Identity & contact */}
        <Panel title="Identity & contact">
          <Grid2>
            <div className="min-w-0">
              <FieldLabel>✉ Email</FieldLabel>
              <FieldVal muted={!data.email}>{data.email ?? (data.phone_only ? "[phone-only]" : "—")}</FieldVal>
            </div>
            <div className="min-w-0">
              <FieldLabel>📞 Phone</FieldLabel>
              <FieldVal muted={!data.phone}>{data.phone ?? "—"}</FieldVal>
            </div>
            <Fld label="📅 Registered" value={joinedDate(data.customer_since)} />
            <Fld label="⏱ Tenure" value={data.tenure_months != null ? `${data.tenure_months} months` : "—"} />
            <Fld label="📦 Active months" value={data.active_months != null ? `${data.active_months} of ${data.tenure_months ?? "?"}` : "—"} />
            <div>
              <FieldLabel>📍 Capital / regional</FieldLabel>
              <div className="mt-[3px]">
                <Tag variant={data.capital_vs_regional === "capital" ? "blue" : "neutral"}>
                  {data.capital_vs_regional === "capital" ? "Capital" : data.capital_vs_regional === "regional" ? "Regional" : "Unknown"}
                </Tag>
              </div>
            </div>
          </Grid2>
          <div className="mt-3">
            <FieldLabel>Marketing consent</FieldLabel>
            <ConsentPills email={data.accept_marketing_email} sms={data.sms_marketing} />
          </div>
        </Panel>

        {/* 5. Channels & acquisition */}
        <Panel title="Channels & acquisition">
          <div className="font-mono text-[8.5px] uppercase tracking-[.09em] mb-2" style={{ color: CLR.t3 }}>Where they buy</div>
          <div className="flex h-[26px] rounded overflow-hidden mb-[7px]" style={{ background: CLR.bg4 }}>
            {eco > 0 && (
              <div style={{ width: `${eco}%`, background: CLR.b, opacity: 0.82 }}
                className="flex items-center justify-center text-white font-mono text-[9.5px]">{eco}%</div>
            )}
            {store > 0 && (
              <div style={{ width: `${store}%`, background: CLR.a, opacity: 0.82 }}
                className="flex items-center justify-center text-white font-mono text-[9.5px]">{store}%</div>
            )}
            {appPct > 0 && (
              <div style={{ width: `${appPct}%`, background: CLR.tl, opacity: 0.82 }}
                className="flex items-center justify-center text-white font-mono text-[9.5px]">{appPct}%</div>
            )}
          </div>
          <div className="flex gap-[14px] mb-[13px]">
            {[
              { label: "Online", pct: eco, color: CLR.b },
              { label: "In-store", pct: store, color: CLR.a },
              { label: "App", pct: appPct, color: CLR.tl },
            ].map(({ label, pct: p, color }) => (
              <div key={label} className="flex items-center gap-[5px] text-[11px]" style={{ color: CLR.t2 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                {label} {p}%
              </div>
            ))}
          </div>
          <Grid2>
            <Fld label="Primary channel" value={data.channel ? ({ online: "E-commerce", in_store: "Brand store", app: "App", mixed: "Mixed", none: "—" } as Record<string, string>)[data.channel] : "—"} />
            <Fld label="Promo orders" value={data.promo_orders > 0 ? `${data.promo_orders} of ${data.order_count}` : "None"} />
          </Grid2>
          {/* Capsule consumption (machine owners only) */}
          {data.has_machine && data.avg_capsule_packs_per_month != null && (
            <div style={{ borderTop: `1px solid ${CLR.border}` }} className="mt-[13px] pt-3">
              <div className="font-mono text-[8.5px] uppercase tracking-[.09em] mb-[7px]" style={{ color: CLR.t3 }}>
                Capsule consumption vs machine
              </div>
              <div className="flex justify-between text-[12px] mb-[5px]" style={{ color: CLR.text }}>
                <span>{data.avg_capsule_packs_per_month.toFixed(1)} packs/mo</span>
                <span style={{ color: CLR.t3 }}>expected ~2.5/mo</span>
              </div>
              <div className="h-[9px] rounded overflow-hidden" style={{ background: CLR.bg4 }}>
                <div style={{
                  width: `${Math.min(100, (data.avg_capsule_packs_per_month / 2.5) * 100)}%`,
                  height: "100%", background: underConsuming ? CLR.r : CLR.g, opacity: 0.8, borderRadius: 5
                }} />
              </div>
              {underConsuming && (
                <div style={{ background: CLR.rb, borderLeft: `2px solid ${CLR.r}`, borderRadius: 6, color: CLR.t2 }}
                  className="mt-2 p-[9px_11px] text-[11.5px] leading-[1.5]">
                  <strong>Under-consuming.</strong> Machine owner buying far fewer capsules than expected — a silent churn signal. Trigger a reorder nudge now.
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* 6. Purchase & RFM */}
        <Panel title="Purchase & RFM detail">
          <Grid2>
            <Fld label="📋 Last order" value={da(data.last_order_at)} />
            <Fld label="🔄 Return interval" value={data.avg_return_interval_days != null ? `every ${Math.round(data.avg_return_interval_days)} days` : "—"} />
            <Fld label="📦 AOV capsules" value={data.capsule_aov != null ? formatGEL(data.capsule_aov) : "—"} />
            <Fld label="📦 Packs / month" value={data.avg_capsule_packs_per_month != null ? `${data.avg_capsule_packs_per_month.toFixed(1)}` : "—"} />
            <Fld label="🔜 Next order" value={da(data.expected_next_order_date)} />
            <div>
              <FieldLabel>💰 Price range</FieldLabel>
              <div className="mt-[3px]">
                {data.capsule_price_range ? (
                  <Tag variant={data.capsule_price_range === "premium" ? "purple" : data.capsule_price_range === "mid_range" ? "blue" : "neutral"}>
                    {data.capsule_price_range.replace("_", " ")}
                  </Tag>
                ) : <span style={{ color: CLR.t3 }}>—</span>}
              </div>
            </div>
          </Grid2>

          {/* RFM blocks */}
          <div style={{ borderTop: `1px solid ${CLR.border}` }} className="mt-3 pt-3">
            <div className="font-mono text-[8.5px] uppercase tracking-[.09em] mb-[9px]" style={{ color: CLR.t3 }}>RFM breakdown</div>
            <div className="flex gap-[14px] mb-[9px]">
              {[["Recency", R], ["Frequency", F], ["Monetary", M]].map(([k, v]) => (
                <div key={k as string} style={{ flex: 1, background: CLR.bg3, border: `1px solid ${CLR.border}`, borderRadius: 8 }}
                  className="px-[11px] py-[9px] text-center">
                  <div className="font-mono text-[9px] uppercase tracking-[.07em] mb-1" style={{ color: CLR.t3 }}>{k as string}</div>
                  <div className="text-[22px] font-light" style={{ color: (v as number) >= 4 ? CLR.g : (v as number) >= 3 ? CLR.a : CLR.r }}>
                    {v as number}
                  </div>
                  <div className="font-mono text-[8.5px]" style={{ color: CLR.t3 }}>/ 5</div>
                </div>
              ))}
            </div>
            <div style={{ background: CLR.bg3, borderRadius: 6, color: CLR.t2 }} className="px-[10px] py-[7px] font-mono text-[10px]">
              RFM label: <strong>{rLabel}</strong>
            </div>
          </div>
        </Panel>

        {/* 7. Flavor & product DNA */}
        <Panel title="Flavor & product DNA">
          {/* Intensity row */}
          <div className="flex items-center gap-[10px] mb-[11px]">
            <div>
              <FieldLabel>🔥 Intensity</FieldLabel>
              <div className="flex items-center gap-[7px] mt-[3px]">
                {data.intensity_bucket ? (
                  <Tag variant={
                    data.intensity_bucket === "strong" ? "red"
                    : data.intensity_bucket === "medium" ? "amber"
                    : "blue"
                  }>
                    {data.intensity_bucket}
                  </Tag>
                ) : null}
                <span className="font-mono text-[12px]" style={{ color: CLR.text }}>
                  {data.favorite_intensity != null ? `${data.favorite_intensity.toFixed(1)} / 10` : "—"}
                </span>
              </div>
              {data.bible_match_rate != null && data.bible_match_rate < 0.5 && (
                <div className="font-mono text-[9px] mt-[4px]" style={{ color: CLR.t3 }}>
                  Partial data ({Math.round(data.bible_match_rate * 100)}% matched)
                </div>
              )}
            </div>
            {/* Beverage type preference */}
            {data.beverage_type_preference && (
              <div className="ml-auto text-right">
                <FieldLabel>Drink style</FieldLabel>
                <div className="mt-[3px]">
                  <Tag variant={
                    data.beverage_type_preference === "espresso"      ? "red"
                    : data.beverage_type_preference === "filter_coffee" ? "amber"
                    : data.beverage_type_preference === "tea"           ? "green"
                    : data.beverage_type_preference === "cold_mix"      ? "teal"
                    : data.beverage_type_preference === "wellness"       ? "purple"
                    : "neutral"
                  }>
                    {{
                      espresso:      "Espresso",
                      filter_coffee: "Filter coffee",
                      tea:           "Tea",
                      cold_mix:      "Cold mix",
                      wellness:      "Wellness",
                      other:         "Other",
                    }[data.beverage_type_preference] ?? data.beverage_type_preference}
                  </Tag>
                </div>
              </div>
            )}
          </div>

          {/* Top flavors */}
          {data.top_flavors?.length ? (
            <div className="mt-[9px]">
              <FieldLabel>Top flavors</FieldLabel>
              <div className="flex flex-wrap gap-[5px] mt-[6px]">
                {data.top_flavors.map((f, i) => (
                  <span key={f}
                    style={i === 0
                      ? { background: CLR.text, color: "#fff", border: `1px solid ${CLR.text}` }
                      : { background: CLR.bg2, color: CLR.text, border: `1px solid ${CLR.border2}` }}
                    className="text-[11px] px-[9px] py-[3px] rounded-full">{f}</span>
                ))}
              </div>
            </div>
          ) : null}
          {data.format_preferences?.length ? (
            <div className="mt-[9px]">
              <FieldLabel>Format preferences</FieldLabel>
              <div className="flex flex-wrap gap-[5px] mt-[6px]">
                {data.format_preferences.map((f) => (
                  <span key={f} style={{ background: CLR.bg2, color: CLR.text, border: `1px solid ${CLR.border2}` }}
                    className="text-[11px] px-[9px] py-[3px] rounded-full">{f}</span>
                ))}
              </div>
            </div>
          ) : null}
          {data.bought_capsule_categories?.length ? (
            <div className="mt-[9px]">
              <FieldLabel>Categories bought</FieldLabel>
              <div className="flex flex-wrap gap-[5px] mt-[6px]">
                {data.bought_capsule_categories.map((c) => (
                  <span key={c} style={{ background: CLR.gb, color: CLR.g, border: `1px solid ${CLR.gbd}` }}
                    className="text-[11px] px-[9px] py-[3px] rounded-full">{c}</span>
                ))}
              </div>
            </div>
          ) : null}
          {data.never_bought_capsule_categories?.length ? (
            <div className="mt-[9px]">
              <FieldLabel>Has never tried 👇</FieldLabel>
              <div className="flex flex-wrap gap-[5px] mt-[6px]">
                {data.never_bought_capsule_categories.map((c) => (
                  <span key={c} style={{ background: CLR.rb, color: CLR.r, border: `1px solid ${CLR.rbd}`, opacity: 0.8 }}
                    className="text-[11px] px-[9px] py-[3px] rounded-full">{c}</span>
                ))}
              </div>
            </div>
          ) : null}
          {!data.top_flavors?.length && !data.bought_capsule_categories?.length && (
            <p className="text-[11.5px] mt-2" style={{ color: CLR.t3 }}>No capsule purchase history yet.</p>
          )}
        </Panel>

        {/* 8. Machine journey */}
        <Panel title="Machine journey">
          <Grid2>
            <Fld label="☕ Machine" value={data.machine_model ?? (data.has_machine ? "Machine owned" : "No machine")} muted={!data.has_machine} />
            <Fld label="📅 Acquired" value={da(data.machine_acquisition_date)} />
            <div>
              <FieldLabel>🔄 Conversion status</FieldLabel>
              <div className="mt-[3px]">
                <Tag variant={
                  data.machine_to_capsule_conversion_status === "machine_then_capsules" ? "green"
                    : data.machine_to_capsule_conversion_status === "no_machine" ? "neutral"
                    : data.machine_to_capsule_conversion_status === "machine_only_no_capsules" ? "red"
                    : "amber"
                }>
                  {CONV_LABEL[data.machine_to_capsule_conversion_status ?? "unknown"] ?? "—"}
                </Tag>
              </div>
            </div>
            <Fld label="📦 Packs / month" value={data.avg_capsule_packs_per_month != null ? `${data.avg_capsule_packs_per_month.toFixed(1)}` : "—"} />
          </Grid2>
          {data.recommended_next_machine && (
            <div style={{ background: CLR.ab, border: `1px solid ${CLR.abd}`, borderRadius: 7 }}
              className="mt-[11px] flex items-center gap-[10px] p-[10px_12px]">
              <div className="text-[18px]">🤖</div>
              <div>
                <FieldLabel>Recommended upgrade</FieldLabel>
                <div className="text-[13px] font-semibold" style={{ color: CLR.a }}>{data.recommended_next_machine}</div>
              </div>
            </div>
          )}
          {(data.machine_to_capsule_conversion_status === "machine_only_no_capsules") && (
            <div style={{ background: CLR.rb, borderLeft: `2px solid ${CLR.r}`, borderRadius: 6, color: CLR.t2 }}
              className="mt-[10px] p-[9px_11px] text-[11.5px] leading-[1.5]">
              <strong>⚠ Under-consuming.</strong> Has a machine but {data.avg_capsule_packs_per_month ?? 0} packs/mo — well below potential. Trigger a capsule starter offer now.
            </div>
          )}
        </Panel>

        {/* 9. Lifecycle & return pattern */}
        <Panel title="Lifecycle & return pattern">
          <Grid2>
            <div>
              <FieldLabel>🔴 Status</FieldLabel>
              <div className="mt-[3px]">
                <Tag variant={lifecycleVariant(data.status)}>{lifecycleLabel(data.status)}</Tag>
              </div>
            </div>
            <div>
              <FieldLabel>🔬 Churn signal</FieldLabel>
              <FieldVal>{data.churn_reason ? CHURN_LABEL[data.churn_reason] : "—"}</FieldVal>
            </div>
            <div>
              <FieldLabel>🔄 Return pattern</FieldLabel>
              <div className="mt-[3px]">
                {data.return_period_label
                  ? <Tag variant="neutral">{RETURN_LABEL[data.return_period_label]}</Tag>
                  : <span style={{ color: CLR.t3 }}>—</span>}
              </div>
            </div>
            <Fld label="🚚 Delivery pref" value={data.delivery_vs_pickup_preference ? DELIVERY_LABEL[data.delivery_vs_pickup_preference] : "—"} />
            {data.avg_return_interval_days != null && (
              <Fld label="↩ Avg return" value={`every ${Math.round(data.avg_return_interval_days)} days`} />
            )}
            {data.median_return_interval_days != null && (
              <Fld label="↩ Median" value={`every ${Math.round(data.median_return_interval_days)} days`} />
            )}
          </Grid2>
          {data.expected_return_window_start && data.expected_return_window_end && (
            <div style={{ background: CLR.tlb, border: `1px solid ${CLR.tlbd}`, borderRadius: 7 }}
              className="mt-[9px] px-3 py-[9px]">
              <FieldLabel>Expected return window</FieldLabel>
              <div className="text-[13px] font-medium mt-1" style={{ color: CLR.tl }}>
                {da(data.expected_return_window_start)} – {da(data.expected_return_window_end)}
              </div>
            </div>
          )}
        </Panel>

        {/* 10. Spend quality */}
        {hasSpendData && (
          <div style={{
            background: CLR.bg2,
            border: `1px solid ${isDiscountLed ? CLR.rbd : CLR.border}`,
            borderRadius: 10,
            overflow: "hidden",
          }}>
            <div style={{
              borderBottom: `1px solid ${isDiscountLed ? CLR.rbd : CLR.border}`,
              background: isDiscountLed ? CLR.rb : CLR.bg2,
            }} className="flex items-center gap-2 px-4 py-[11px]">
              <span className="text-[12.5px] font-medium" style={{ color: isDiscountLed ? CLR.r : CLR.text }}>
                💰 Spend quality
              </span>
              <span className="ml-auto font-mono text-[10px]" style={{ color: CLR.t3 }}>
                {promoSharePct}% promo · {data.promo_orders} promo orders
              </span>
            </div>
            <div className="p-4">
              <div className="flex h-[30px] rounded overflow-hidden mb-2">
                <div style={{ width: `${fullSharePct}%`, background: CLR.g, opacity: 0.82 }}
                  className="flex items-center justify-center text-white font-mono text-[10px]">
                  {fullSharePct > 15 && `${fullSharePct}% full`}
                </div>
                <div style={{ width: `${promoSharePct}%`, background: CLR.a, opacity: 0.85 }}
                  className="flex items-center justify-center text-white font-mono text-[10px]">
                  {promoSharePct > 10 && `${promoSharePct}% promo`}
                </div>
              </div>
              <div className="flex justify-between font-mono text-[10px] mb-[11px]" style={{ color: CLR.t3 }}>
                <span style={{ color: CLR.g }}>Full price ₾{formatNumber(data.full_price_spend)}</span>
                <span style={{ color: CLR.a }}>Promo ₾{formatNumber(data.promo_spend)}</span>
              </div>
              <div style={{
                background: isDiscountLed ? CLR.rb : CLR.bg3,
                borderLeft: `2px solid ${isDiscountLed ? CLR.r : CLR.g}`,
                borderRadius: 6,
              color: CLR.t2,
              }} className="p-[9px_11px] text-[11.5px] leading-[1.5]">
                {spendInsight}
              </div>
            </div>
          </div>
        )}

        {/* 11. Next best action */}
        <Panel title="Next best action">
          <div className="font-mono text-[8.5px] uppercase tracking-[.09em] mb-[3px]" style={{ color: CLR.t3 }}>
            Based on churn signal: {data.churn_reason ? CHURN_LABEL[data.churn_reason] : "—"}
          </div>
          <div style={{ background: CLR.bg3, borderRadius: 6, borderLeft: `2px solid ${CLR.border2}`, color: CLR.t2 }}
            className="p-[9px_11px] text-[12px] leading-[1.5]">
            {nextBestAction(data)}
          </div>
        </Panel>

        {/* 12. Recent Orders */}
        <Panel title="Recent orders" sub={`last ${Math.min(data.recent_orders.length, 6)}`}>
          {!data.recent_orders.length
            ? <p className="text-[12px]" style={{ color: CLR.t3 }}>No recent orders.</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr style={{ background: CLR.bg3, borderBottom: `1px solid ${CLR.border}` }}>
                      {["Order", "Date", "Channel", "Total"].map((h) => (
                        <th key={h} className={`px-3 py-2 font-mono text-[9px] uppercase tracking-[.07em] text-left font-medium`}
                          style={{ color: CLR.t3 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_orders.slice(0, 6).map((o) => (
                      <tr key={o.shopify_order_id} style={{ borderBottom: `1px solid ${CLR.border}` }}>
                        <td className="px-3 py-2 font-mono text-[10px]" style={{ color: CLR.t2 }}>#{o.shopify_order_id}</td>
                        <td className="px-3 py-2" style={{ color: CLR.t2 }}>{da(o.processed_at)}</td>
                        <td className="px-3 py-2" style={{ color: CLR.t2 }}>{o.source ? SOURCE_LABEL[o.source] ?? o.source : "—"}</td>
                        <td className="px-3 py-2 text-right font-medium" style={{ color: CLR.text }}>{formatGEL(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Panel>

        {/* 13. Behavior recording */}
        {data.shopify_customer_id != null && (
          <Panel title="Behavior recording">
            <a
              href={`https://clarity.microsoft.com/projects/view/s77hhg1bkm/impressions?CustomUserId=${data.shopify_customer_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: CLR.text, color: "#fff", borderRadius: 8, display: "block", textDecoration: "none" }}
              className="w-full py-[10px] text-[12px] font-medium text-center hover:opacity-90 transition-opacity"
            >
              Open in Clarity →
            </a>
            <p className="mt-2 text-[11px] leading-[1.5]" style={{ color: CLR.t3 }}>
              Opens Microsoft Clarity filtered to this customer's recorded sessions — heatmaps, scroll depth, clicks, and rage-click signals.
            </p>
          </Panel>
        )}

        {/* 14. Action button */}
        <button
          style={{ background: CLR.text, color: "#fff", border: "none", borderRadius: 8 }}
          className="w-full py-[10px] text-[12px] font-medium text-center hover:opacity-90 transition-opacity"
        >
          {nextBestAction(data)} →
        </button>

      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────

type FilterRow1 =
  | "all" | "no_machine" | "machine_no_capsules" | "never_ordered" | "promo_heavy" | "recommend"
  | "loyalist" | "at_risk" | "new_machine" | "active" | "lapsed";

type SessionAction = "carted_never_bought" | "cart_abandoner" | "checkout_abandoner" | "converted" | "";

type FilterRow2 = "all" | "email" | "sms" | "any" | "none";

const SORT_OPTIONS = [
  { value: "last_order_at", label: "Last order" },
  { value: "total_spend", label: "Total spend" },
  { value: "order_count", label: "Orders" },
  { value: "days_since_last_order", label: "Days silent" },
  { value: "health_score", label: "Health" },
  { value: "promo_share", label: "Promo share" },
  { value: "aov", label: "AOV" },
  { value: "last_session", label: "Last session" },
];

export default function Portfolios() {
  const { t } = useTranslation();

  const [query, setQuery]         = useState("");
  const [row1, setRow1]           = useState<FilterRow1>("all");
  const [row2, setRow2]           = useState<FilterRow2>("all");
  const [intensity, setIntensity] = useState<"light" | "medium" | "strong" | "">("");
  const [region, setRegion]       = useState("");
  const [channel, setChannel]     = useState("");
  const [sort, setSort]           = useState("last_order_at");
  const [descDir, setDescDir]     = useState(true);
  const [page, setPage]           = useState(1);
  const [sessionRecency, setSessionRecency] = useState<"today"|"7d"|"30d"|"never"|"">("");
  const [sessionAction, setSessionAction] = useState<SessionAction>("");
  const [warmFilter, setWarmFilter] = useState(false);

  const [items, setItems]   = useState<PortfolioSummary[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [drawerId, setDrawerId] = useState<number | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const openDrawer  = useCallback((id: number) => { const y = window.scrollY; setDrawerId(id); requestAnimationFrame(() => window.scrollTo(0, y)); }, []);
  const closeDrawer = useCallback(() => setDrawerId(null), []);

  useEffect(() => { setPage(1); }, [query, row1, row2, intensity, region, channel, sort, descDir, sessionRecency, sessionAction, warmFilter]);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const params: ListParams = {
        q: query || undefined,
        region: region || undefined,
        channel: channel || undefined,
        sort,
        desc: descDir,
        page,
        page_size: 48,
      };

      if (row1 === "no_machine")         params.no_machine         = true;
      if (row1 === "machine_no_capsules") params.machine_no_capsules = true;
      if (row1 === "never_ordered")      params.never_ordered       = true;
      if (row1 === "promo_heavy")   params.promo_heavy   = true;
      if (row1 === "loyalist")      params.segment = "loyalist";
      if (row1 === "at_risk")       params.segment = "at_risk";
      if (row1 === "new_machine")   params.segment = "new_machine";
      if (row1 === "active")        params.segment = "active";
      if (row1 === "lapsed")        params.segment = "lapsed";
      if (row1 === "recommend") {
        setItems([]); setTotal(0); setFetched(true); setLoading(false);
        return;
      }

      if (row2 === "email") params.email_consent = true;
      if (row2 === "sms")   params.sms_consent   = true;
      if (row2 === "any")   params.any_consent   = true;
      if (row2 === "none")  { params.email_consent = false; params.sms_consent = false; }

      if (intensity) params.intensity_bucket = intensity;
      if (sessionRecency) params.session_recency = sessionRecency as "today"|"7d"|"30d"|"never";
      if (sessionAction) params.session_action = sessionAction as "carted_never_bought"|"cart_abandoner"|"checkout_abandoner"|"converted";
      if (warmFilter) params.warm = true;

      setLoading(true);
      setError(null);
      fetchPortfolios(params)
        .then((res) => { setItems(res.items); setTotal(res.total); setFetched(true); })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 280);
    return () => clearTimeout(debounce.current);
  }, [query, row1, row2, intensity, region, channel, sort, descDir, page, sessionRecency, sessionAction, warmFilter]);

  const totalPages = Math.max(1, Math.ceil(total / 48));

  const row1Opts: { id: FilterRow1; label: string; variant?: Variant; sep?: boolean }[] = [
    { id: "all",                label: "All" },
    { id: "no_machine",         label: "No machine" },
    { id: "machine_no_capsules",label: "☕ No capsules", variant: "amber" },
    { id: "never_ordered",      label: "Never ordered" },
    { id: "promo_heavy",  label: "% Promo-driven", variant: "amber" },
    { id: "recommend",    label: "✦ Recommend",    variant: "purple" },
    { id: "loyalist",     label: "Loyalist",       variant: "green",  sep: true },
    { id: "at_risk",      label: "At risk",        variant: "red" },
    { id: "new_machine",  label: "New machine",    variant: "amber" },
    { id: "active",       label: "Active",         variant: "green" },
    { id: "lapsed",       label: "Lapsed",         variant: "neutral" },
  ];

  const row2Opts: { id: FilterRow2; label: string }[] = [
    { id: "all",   label: "All" },
    { id: "email", label: "✉ Email opt-in" },
    { id: "sms",   label: "💬 SMS opt-in" },
    { id: "any",   label: "Any channel" },
    { id: "none",  label: "No consent" },
  ];

  const isComingSoon = row1 === "recommend";

  function FilterPill({ label, active, variant, onClick }: {
    label: string; active: boolean; variant?: Variant; onClick: () => void;
  }) {
    const t = variant ? TAG_TOKEN[variant] : TAG_TOKEN.neutral;
    return (
      <button
        onClick={onClick}
        style={active
          ? { background: t.bg, color: t.color, borderColor: t.border }
          : { background: CLR.bg2 + "8c", color: CLR.t2, borderColor: CLR.border }}
        className="inline-flex items-center border px-2 py-1 rounded-md font-mono text-[10px] transition-all"
      >
        {label}
      </button>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Portfolios"
        kickerKa="პორტფოლიოები"
        title={t("pages.portfolios.title")}
        subtitle={t("pages.portfolios.subtitle")}
      />

      <p className="mb-4 text-[12px] leading-[1.5]" style={{ color: CLR.t2 }}>
        One card per customer. Scan commercial value, reorder timing, machine context, product DNA, and the primary risk signal.
        Open any card for the full Customer 360.
      </p>

      {/* Search + sort toolbar */}
      <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: 10 }}
        className="mb-3 flex flex-wrap items-center gap-2 p-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search (name / email / phone)…"
          style={{ background: CLR.bg3, border: `1px solid ${CLR.border}`, color: CLR.text }}
          className="h-8 w-full max-w-[200px] rounded-md px-[10px] text-[12px] outline-none placeholder:text-[#9e9b96] focus:border-[#d4d3d0]"
        />
        <select value={region} onChange={(e) => setRegion(e.target.value)}
          style={{ background: CLR.bg3, border: `1px solid ${CLR.border}`, color: CLR.t2 }}
          className="h-8 rounded-md px-2 font-mono text-[11px] outline-none">
          <option value="">Region</option>
          <option value="tbilisi">Tbilisi</option>
          <option value="regions">Regions</option>
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}
          style={{ background: CLR.bg3, border: `1px solid ${CLR.border}`, color: CLR.t2 }}
          className="h-8 rounded-md px-2 font-mono text-[11px] outline-none">
          <option value="">Channel</option>
          <option value="online">Online</option>
          <option value="in_store">Brand store</option>
          <option value="app">App</option>
          <option value="mixed">Mixed</option>
        </select>
        <select value={sessionRecency} onChange={(e) => setSessionRecency(e.target.value as "today"|"7d"|"30d"|"never"|"")}
          style={{ background: CLR.bg3, border: `1px solid ${CLR.border}`, color: sessionRecency ? CLR.a : CLR.t2 }}
          className="h-8 rounded-md px-2 font-mono text-[11px] outline-none">
          <option value="">Session</option>
          <option value="today">Browsed today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="never">Never visited</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          style={{ background: CLR.bg3, border: `1px solid ${CLR.border}`, color: CLR.t2 }}
          className="h-8 rounded-md px-2 font-mono text-[11px] outline-none">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={() => setDescDir((d) => !d)}
          style={{ background: CLR.bg3, border: `1px solid ${CLR.border}`, color: CLR.t2 }}
          className="h-8 rounded-md px-2 font-mono text-[11px] hover:bg-white">
          {descDir ? "↓ Desc" : "↑ Asc"}
        </button>
        {fetched && (
          <span className="ml-auto font-mono text-[10px]" style={{ color: CLR.t3 }}>
            {formatNumber(total)} customers
          </span>
        )}
      </div>

      {/* Filter row 1 */}
      <div style={{ background: CLR.bg2 + "99", border: `1px solid ${CLR.border}`, borderRadius: 10 }}
        className="mb-3 flex flex-wrap items-center gap-1.5 p-2.5">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[.07em]" style={{ color: CLR.t3 }}>Filter</span>
        {row1Opts.map((o) => (
          <span key={o.id} className="flex items-center gap-1.5">
            {o.sep && <span style={{ color: CLR.border2 }} className="mx-1">|</span>}
            <FilterPill label={o.label} active={row1 === o.id} variant={o.variant} onClick={() => setRow1(o.id)} />
          </span>
        ))}
        <span style={{ color: CLR.border2 }} className="mx-1">|</span>
        <FilterPill label="🔥 Warm" active={warmFilter} variant="amber" onClick={() => setWarmFilter((w) => !w)} />
      </div>

      {/* Filter row 2 — Reachable */}
      <div style={{ background: CLR.bg2 + "99", border: `1px solid ${CLR.border}`, borderRadius: 10 }}
        className="mb-3 flex flex-wrap items-center gap-1.5 p-2.5">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[.07em]" style={{ color: CLR.t3 }}>Reachable</span>
        {row2Opts.map((o) => (
          <FilterPill key={o.id} label={o.label} active={row2 === o.id} onClick={() => setRow2(o.id)} />
        ))}
      </div>

      {/* Filter row 3 — Intensity */}
      <div style={{ background: CLR.bg2 + "99", border: `1px solid ${CLR.border}`, borderRadius: 10 }}
        className="mb-3 flex flex-wrap items-center gap-1.5 p-2.5">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[.07em]" style={{ color: CLR.t3 }}>Intensity</span>
        <FilterPill label="☕ All"    active={intensity === ""}       onClick={() => setIntensity("")} />
        <FilterPill label="🌿 Light"  active={intensity === "light"}  variant="blue"   onClick={() => setIntensity("light")} />
        <FilterPill label="☕ Medium" active={intensity === "medium"} variant="amber"  onClick={() => setIntensity("medium")} />
        <FilterPill label="🔥 Strong" active={intensity === "strong"} variant="red"    onClick={() => setIntensity("strong")} />
      </div>

      {/* Filter row 4 — Session */}
      <div style={{ background: CLR.bg2 + "99", border: `1px solid ${CLR.border}`, borderRadius: 10 }}
        className="mb-6 flex flex-wrap items-center gap-1.5 p-2.5">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[.07em]" style={{ color: CLR.t3 }}>Session</span>
        <FilterPill label="Any"                active={sessionAction === ""}                  onClick={() => setSessionAction("")} />
        <FilterPill label="Carted, not bought" active={sessionAction === "carted_never_bought"} variant="amber" onClick={() => setSessionAction("carted_never_bought")} />
        <FilterPill label="Cart abandoner"     active={sessionAction === "cart_abandoner"}      variant="amber" onClick={() => setSessionAction("cart_abandoner")} />
        <FilterPill label="Checkout abandoner" active={sessionAction === "checkout_abandoner"}  variant="red"   onClick={() => setSessionAction("checkout_abandoner")} />
        <FilterPill label="Converted session"  active={sessionAction === "converted"}           variant="green" onClick={() => setSessionAction("converted")} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: CLR.rb, border: `1px solid ${CLR.rbd}`, borderRadius: 10, color: CLR.r }}
          className="mb-5 px-4 py-3 text-[13px]">
          Error: {error}
        </div>
      )}

      {/* Coming soon placeholder */}
      {isComingSoon && (
        <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: 10, color: CLR.t3 }}
          className="mt-12 p-8 text-center text-[13px]">
          This view needs a dedicated endpoint before it can show real data.
        </div>
      )}

      {/* Loading skeletons */}
      {loading && !fetched && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-[420px] rounded-2xl" />
          ))}
        </div>
      )}

      {/* Grid */}
      {fetched && !isComingSoon && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((c) => (
              <CustomerCard key={c.shopify_customer_id} customer={c} onOpen={openDrawer} />
            ))}
          </div>

          {!items.length && !loading && (
            <div style={{ background: CLR.bg2, border: `1px solid ${CLR.border}`, borderRadius: 10, color: CLR.t3 }}
              className="mt-10 p-8 text-center text-[13px]">No customers match this filter.</div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                style={{ background: CLR.bg2 + "b3", border: `1px solid ${CLR.border}`, color: CLR.t2 }}
                className="rounded-lg px-3 py-1.5 font-mono text-[10px] disabled:opacity-40 hover:bg-white">
                Prev
              </button>
              <span className="font-mono text-[10px]" style={{ color: CLR.t3 }}>{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ background: CLR.bg2 + "b3", border: `1px solid ${CLR.border}`, color: CLR.t2 }}
                className="rounded-lg px-3 py-1.5 font-mono text-[10px] disabled:opacity-40 hover:bg-white">
                Next
              </button>
            </div>
          )}
        </>
      )}

      <CustomerDrawer customerId={drawerId} onClose={closeDrawer} />
    </div>
  );
}
