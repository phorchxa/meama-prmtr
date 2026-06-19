import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  type CampaignDetail,
  type CampaignSummary,
  type MetaOverview,
  createCampaign,
  fetchCampaignDetail,
  fetchCampaigns,
  fetchMetaOverview,
} from "../lib/api";
import {
  formatGEL,
  formatGEL0,
  formatNumber,
  formatPercent,
  formatUSD,
  formatUSD0,
} from "../lib/format";
import { Badge, type BadgeTone } from "../components/Badge";
import { PageHeader } from "./PageHeader";

/*
 * 05 · Campaign Intelligence — brand editorial styling (monochrome, sharp).
 *
 * Data wiring:
 *   • Overview / Promotions / Plan / Calendar  ← real  (GET /campaigns)
 *   • Ads                                       ← real  (GET /campaigns/meta-overview)
 *   • Calculator (margin safety)                ← real  (POST /campaigns/promo-calculator)
 *   • Calculator (ROI estimate)                 ← live arithmetic on your inputs
 *   • Drawer products w/ prices                 ← real  (GET /campaigns/{id})
 *   • Approval Queue / AI ad copy               ← PLACEHOLDER (AI pipeline not built yet)
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const ROAS_THRESHOLD = 2.0;
const MARGIN_FLOOR = 0.4;
const MIN_PRICE_MULTIPLIER = 1.6667;
const MAX_DISCOUNT = 0.25;

type Tab = "overview" | "promotions" | "ads" | "queue";
type PromoTab = "calculator" | "calendar" | "plan";

// ── helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  ecommerce: "E-com", pos: "Brand store", email: "Email", sms: "SMS",
  telegram: "Telegram", push: "Push", omnisend: "Email", paid: "Paid",
};

function channelLabel(c: string | null | undefined) {
  if (!c) return "—";
  return CHANNEL_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ka-GE", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Tbilisi",
  });
}

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "green", running: "green", completed: "muted", draft: "blue",
  approved: "blue", pending: "gold", pending_approval: "gold",
  paused: "gold", cancelled: "red", rejected: "red",
};

function statusTone(s: string | null | undefined): BadgeTone {
  return STATUS_TONE[s ?? ""] ?? "muted";
}

function discountLabel(c: CampaignSummary): string | null {
  if ((c.promo_type === "discount" || c.promo_type === "gift") &&
      c.discount_value !== null && c.discount_value > 0 && c.discount_value <= 100) {
    return `${c.discount_value}%`;
  }
  return null;
}

// ── shared primitives (brand) ────────────────────────────────────────────────

function Kpi({ label, value, foot, footTone }: {
  label: string; value: string; foot?: string; footTone?: "up" | "down" | "flat";
}) {
  const footCls = footTone === "up" ? "text-meama-green" : footTone === "down" ? "text-meama-red" : "text-meama-muted";
  return (
    <div className="border border-meama-charcoal bg-meama-ivory p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-meama-muted">{label}</div>
      <div className="tabular mt-2.5 font-display text-[34px] uppercase leading-none text-meama-brown">{value}</div>
      {foot && <div className={`mt-2 font-mono text-[10px] uppercase tracking-wider ${footCls}`}>{foot}</div>}
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="border border-meama-charcoal bg-meama-ivory">
      <div className="flex items-baseline justify-between gap-3 border-b border-meama-charcoal px-5 py-3">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-meama-brown">{title}</h3>
        {sub && <span className="font-mono text-[10px] uppercase tracking-wider text-meama-muted">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-meama-muted">{children}</p>;
}

function Placeholder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border border-dashed border-meama-charcoal bg-meama-roast p-6">
      <span className="inline-block border border-meama-charcoal px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-meama-muted">
        Placeholder
      </span>
      <h4 className="mt-3 font-display text-[22px] uppercase leading-none tracking-[0.04em] text-meama-brown">{title}</h4>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-meama-cream">{children}</p>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 py-3 text-sm text-meama-muted">
      <span className="pulse-live h-1.5 w-1.5 rounded-full bg-meama-brown" />{label}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="border border-meama-red/40 bg-meama-red/8 px-4 py-3 text-sm text-meama-red">{children}</div>;
}

// ── detail drawer ──────────────────────────────────────────────────────────

function DrawerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-meama-charcoal py-2.5 last:border-b-0">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-meama-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-sm text-meama-brown">{children}</span>
    </div>
  );
}

function CampaignDrawer({ c, onClose }: { c: CampaignSummary; onClose: () => void }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchCampaignDetail(c.id)
      .then((d) => { if (active) setDetail(d); })
      .catch(() => { /* keep summary-only view */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [c.id]);

  const roasOk = c.meta_roas !== null && c.meta_roas >= ROAS_THRESHOLD;

  let offer: string | null = discountLabel(c);
  if (detail) {
    if (detail.discount_type === "percentage" && detail.discount_value) offer = `${detail.discount_value}% off`;
    else if (detail.min_order_value) offer = `Bundle · ${formatGEL0(detail.min_order_value)}`;
    else if (detail.discount_value && detail.discount_type) offer = `${formatGEL0(detail.discount_value)} ${detail.discount_type}`;
  }

  const runWindow = detail?.valid_from || detail?.valid_to
    ? `${fmtDate(detail?.valid_from)} → ${fmtDate(detail?.valid_to)}` : null;

  const terms: { label: string; value: React.ReactNode }[] = [];
  const push = (label: string, value: React.ReactNode | null | undefined) => { if (value) terms.push({ label, value }); };
  push("Type", c.promo_type);
  push("Channel", c.channel ? channelLabel(c.channel) : null);
  push("Segment", c.target_segment);
  push("Offer", offer);
  push("Code", c.shopify_code ? <span className="font-mono text-[12px]">{c.shopify_code}</span> : null);
  push("Bundle tag", detail?.tag_pattern ? <span className="font-mono text-[11px]">{detail.tag_pattern}</span> : null);
  push("Run window", runWindow);
  push("Launched", c.launched_at ? fmtDate(c.launched_at) : null);
  if (detail?.excluded_segments?.length) push("No-discount", detail.excluded_segments.join(", "));

  const kpis = [
    { label: "Revenue", value: c.revenue_total !== null ? formatGEL0(c.revenue_total) : "—", cls: c.revenue_total ? "text-meama-green" : "text-meama-brown" },
    { label: "Orders", value: c.converted !== null ? formatNumber(c.converted) : "—", cls: "text-meama-brown" },
    { label: "Rev / disc", value: c.roi !== null ? `${c.roi >= 0 ? "+" : ""}${c.roi.toFixed(1)}×` : "—", cls: c.roi !== null ? (c.roi >= 0 ? "text-meama-green" : "text-meama-red") : "text-meama-muted" },
    { label: "Avg order", value: c.avg_order_value !== null ? formatGEL(c.avg_order_value) : "—", cls: "text-meama-brown" },
  ];

  const products = detail?.products ?? [];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-meama-brown/40" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden border border-meama-charcoal bg-meama-ivory shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        {/* header */}
        <div className="shrink-0 border-b border-meama-charcoal bg-meama-ivory px-6 py-5">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            <Badge tone={statusTone(c.status)}>{(c.status ?? "—").toUpperCase()}</Badge>
            {c.channel && <Badge tone="blue">{channelLabel(c.channel)}</Badge>}
            {c.promo_type && <Badge tone="muted">{c.promo_type.toUpperCase()}</Badge>}
            {offer && <Badge tone="gold">{offer.toUpperCase()}</Badge>}
          </div>
          <h2 className="pr-8 font-display text-[26px] uppercase leading-none tracking-[0.03em] text-meama-brown">{c.name}</h2>
          {c.shopify_code && <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-meama-muted">{c.shopify_code}</p>}
          <button onClick={onClose} aria-label="Close"
            className="absolute right-5 top-5 flex h-7 w-7 items-center justify-center border border-meama-charcoal text-meama-muted transition-colors hover:border-meama-brown hover:text-meama-brown">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* results */}
          <div className="mt-5 grid grid-cols-2 gap-px border border-meama-charcoal bg-meama-charcoal sm:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="bg-meama-ivory px-4 py-3">
                <p className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{k.label}</p>
                <p className={`tabular mt-1.5 font-display text-[24px] uppercase leading-none ${k.cls}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {(c.reached !== null || c.conversion_rate !== null) && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-px border border-meama-charcoal bg-meama-charcoal">
                <div className="bg-meama-ivory px-4 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">Reached</p>
                  <p className="tabular mt-1.5 font-display text-[20px] uppercase leading-none text-meama-brown">{c.reached !== null ? formatNumber(c.reached) : "—"}</p>
                </div>
                <div className="bg-meama-ivory px-4 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">Conversion</p>
                  <p className={`tabular mt-1.5 font-display text-[20px] uppercase leading-none ${c.conversion_rate !== null && c.conversion_rate > 100 ? "text-meama-red" : "text-meama-brown"}`}>
                    {c.conversion_rate !== null ? `${c.conversion_rate.toFixed(0)}%` : "—"}{c.conversion_rate !== null && c.conversion_rate > 100 ? " ⚠" : ""}
                  </p>
                </div>
              </div>
              {c.conversion_rate !== null && c.conversion_rate > 100 && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-meama-muted">
                  ⚠ Over 100% — historical campaign audience is under-counted, so attributed orders outnumber the recorded reach.
                </p>
              )}
            </>
          )}

          {terms.length > 0 && (
            <>
              <SectionLabel>Promotion terms</SectionLabel>
              <div className="border border-meama-charcoal px-4">
                {terms.map((t) => <DrawerRow key={t.label} label={t.label}>{t.value}</DrawerRow>)}
              </div>
            </>
          )}

          <SectionLabel>
            Products sold {products.length > 0 && <span className="text-meama-muted/70">· top {products.length} by revenue</span>}
          </SectionLabel>
          {loading && <div className="h-28 animate-pulse border border-meama-charcoal bg-meama-roast" />}
          {!loading && products.length === 0 && <p className="text-sm text-meama-muted">No attributed product orders.</p>}
          {products.length > 0 && (
            <div className="border border-meama-charcoal">
              <div className="grid grid-cols-[1fr_56px_48px_72px] gap-2 border-b border-meama-charcoal px-4 py-2 font-mono text-[9px] uppercase tracking-wider text-meama-muted">
                <span>Product</span><span className="text-right">Price</span><span className="text-right">Units</span><span className="text-right">Revenue</span>
              </div>
              {products.map((p, i) => (
                <div key={p.sku ?? i} className="grid grid-cols-[1fr_56px_48px_72px] items-center gap-2 border-b border-meama-charcoal px-4 py-2 text-[12px] last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate text-meama-brown">{p.title ?? "—"}</span>
                    {p.sku && <span className="block truncate font-mono text-[9px] text-meama-muted">{p.sku}</span>}
                  </span>
                  <span className="tabular text-right text-meama-cream">{p.price !== null ? formatGEL0(p.price) : "—"}</span>
                  <span className="tabular text-right text-meama-muted">{formatNumber(p.units)}</span>
                  <span className="tabular text-right text-meama-green">{formatGEL0(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}

          {c.meta_spend_usd > 0 && (
            <>
              <SectionLabel>Meta ads (USD)</SectionLabel>
              <div className="border border-meama-charcoal px-4">
                <DrawerRow label="Spend">{formatUSD(c.meta_spend_usd)}</DrawerRow>
                {c.meta_roas !== null && (
                  <DrawerRow label="ROAS"><span className={roasOk ? "text-meama-green" : "text-meama-red"}>{c.meta_roas.toFixed(2)}×</span></DrawerRow>
                )}
                {c.meta_impressions > 0 && <DrawerRow label="Impressions">{formatNumber(c.meta_impressions)}</DrawerRow>}
                {c.meta_clicks > 0 && <DrawerRow label="Clicks">{formatNumber(c.meta_clicks)}</DrawerRow>}
                {c.meta_impressions > 0 && c.meta_clicks > 0 && (
                  <DrawerRow label="CTR">{formatPercent(c.meta_clicks / c.meta_impressions, 2)}</DrawerRow>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────────

function ListRow({ c, onSelect }: { c: CampaignSummary; onSelect: (c: CampaignSummary) => void }) {
  const disc = discountLabel(c);
  return (
    <button onClick={() => onSelect(c)}
      className="flex w-full items-center gap-4 border-b border-meama-charcoal px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-meama-espresso">
      <div className="min-w-0 flex-[2]">
        <div className="truncate text-sm font-medium text-meama-brown">{c.name}</div>
        <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-meama-muted">
          {channelLabel(c.channel)}{c.target_segment ? ` · ${c.target_segment}` : ""}
        </div>
      </div>
      <span className={`tabular w-11 text-right font-mono text-[11px] ${disc ? "text-meama-brown" : "text-meama-muted"}`}>{disc ?? "—"}</span>
      <span className="tabular w-12 text-right font-mono text-[11px] text-meama-green" title="Revenue ÷ discount given">{c.roi !== null ? `${c.roi.toFixed(1)}×` : "—"}</span>
      <span className="tabular w-20 text-right font-mono text-[12px] font-medium text-meama-brown">{c.revenue_total !== null ? formatGEL0(c.revenue_total) : "—"}</span>
      <span className="hidden w-24 justify-end sm:flex"><Badge tone={statusTone(c.status)}>{(c.status ?? "—").toUpperCase()}</Badge></span>
      <svg className="shrink-0 text-meama-charcoal" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  );
}

function OverviewTab({ campaigns, onSelect }: { campaigns: CampaignSummary[]; onSelect: (c: CampaignSummary) => void }) {
  const byChannel = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const c of campaigns) {
      const key = channelLabel(c.channel);
      const cur = map.get(key) ?? { count: 0, revenue: 0 };
      cur.count += 1; cur.revenue += c.revenue_total ?? 0;
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  }, [campaigns]);

  const pending = campaigns.filter((c) => c.status === "draft" || c.status === "pending_approval");
  const sorted = [...campaigns].sort((a, b) => (b.revenue_total ?? 0) - (a.revenue_total ?? 0));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="All campaigns" sub={`${campaigns.length} total`}>
        {sorted.length === 0 && <p className="px-5 py-4 text-sm text-meama-muted">No campaigns yet.</p>}
        {sorted.map((c) => <ListRow key={c.id} c={c} onSelect={onSelect} />)}
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel title="By channel">
          <div className="px-5 py-1">
            {byChannel.length === 0 && <p className="py-3 text-sm text-meama-muted">—</p>}
            {byChannel.map(([ch, v]) => (
              <div key={ch} className="flex items-center gap-3 border-b border-meama-charcoal py-2.5 text-sm last:border-b-0">
                <span className="flex-1 truncate text-meama-brown">{ch}</span>
                <span className="font-mono text-[10px] uppercase text-meama-muted">{v.count} camp.</span>
                <span className="tabular font-mono text-[12px] font-medium text-meama-green">{formatGEL0(v.revenue)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Pending approval" sub="needs action">
          <div className="px-5 py-1">
            {pending.length === 0 && <p className="py-3 text-sm text-meama-muted">Nothing pending.</p>}
            {pending.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-b border-meama-charcoal py-2.5 text-sm last:border-b-0">
                <span className="flex-1 truncate text-meama-brown">{c.name}</span>
                <span className="tabular font-mono text-[12px] text-meama-green">{c.revenue_total !== null ? formatGEL0(c.revenue_total) : "—"}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Month forecast">
          <div className="px-5 py-4">
            <span className="inline-block border border-dashed border-meama-charcoal px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-meama-muted">
              Placeholder
            </span>
            <p className="mt-3 text-sm leading-relaxed text-meama-cream">
              A real forward forecast sums <span className="text-meama-brown">predicted_revenue</span> across planned
              campaigns — populated by the Claude prediction pipeline, which isn&apos;t wired yet. No planned
              campaign currently carries a prediction.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── CALCULATOR ───────────────────────────────────────────────────────────────

interface PromoLine {
  sku: string; full_price: number; cogs: number; discounted_price: number;
  min_safe_price: number; max_safe_discount: number; effective_margin: number;
  status: "green" | "red"; blocked: boolean; reasons: string[];
}
interface PromoResponse { discount_pct: number; blocked: boolean; lines: PromoLine[]; }

function computeLocally(sku: string, fullPrice: number, cogs: number, discountPct: number): PromoResponse {
  const discountedPrice = fullPrice * (1 - discountPct);
  const minSafePrice = cogs * MIN_PRICE_MULTIPLIER;
  const maxSafeDiscount = Math.max(0, 1 - minSafePrice / fullPrice);
  const effectiveMargin = discountedPrice > 0 ? (discountedPrice - cogs) / discountedPrice : 0;
  const reasons: string[] = [];
  if (discountPct > MAX_DISCOUNT) reasons.push(`Discount exceeds the hard ${MAX_DISCOUNT * 100}% cap`);
  if (effectiveMargin < MARGIN_FLOOR) reasons.push(`Margin ${(effectiveMargin * 100).toFixed(1)}% is below the ${MARGIN_FLOOR * 100}% floor`);
  if (discountedPrice < minSafePrice) reasons.push(`Price ₾${discountedPrice.toFixed(2)} below min safe ₾${minSafePrice.toFixed(2)}`);
  return {
    discount_pct: discountPct, blocked: reasons.length > 0,
    lines: [{ sku, full_price: fullPrice, cogs, discounted_price: discountedPrice, min_safe_price: minSafePrice, max_safe_discount: maxSafeDiscount, effective_margin: effectiveMargin, status: reasons.length > 0 ? "red" : "green", blocked: reasons.length > 0, reasons }],
  };
}

function Field({ label, value, onChange, type = "number" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="tabular border border-meama-charcoal bg-meama-ivory px-3 py-2 text-sm text-meama-brown outline-none transition-colors focus:border-meama-brown" />
    </label>
  );
}

function CalculatorTab() {
  const { t } = useTranslation();
  const [sku, setSku] = useState("CAP-CLS-05");
  const [fullPrice, setFullPrice] = useState(22.9);
  const [cogs, setCogs] = useState(8.6);
  const [discount, setDiscount] = useState(15);
  const [result, setResult] = useState<PromoResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);

  const [audience, setAudience] = useState(417);
  const [convRate, setConvRate] = useState(34);
  const [units, setUnits] = useState(2);

  async function calculate() {
    setLoading(true); setOffline(false);
    try {
      const resp = await fetch(`${API_BASE}/api/v1/campaigns/promo-calculator`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku_list: [{ sku, full_price: fullPrice, cogs }], discount_pct: discount / 100 }),
      });
      if (!resp.ok) throw new Error();
      setResult((await resp.json()) as PromoResponse);
    } catch {
      setResult(computeLocally(sku, fullPrice, cogs, discount / 100));
      setOffline(true);
    } finally { setLoading(false); }
  }

  useEffect(() => { void calculate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const est = useMemo(() => {
    const discountedPrice = fullPrice * (1 - discount / 100);
    const converters = Math.round(audience * (convRate / 100));
    const unitsSold = converters * units;
    const revenue = unitsSold * discountedPrice;
    const promoCost = unitsSold * (fullPrice - discountedPrice);
    const grossProfit = revenue - unitsSold * cogs;
    const roi = promoCost > 0 ? grossProfit / promoCost : null;
    const marginAfter = discountedPrice > 0 ? (discountedPrice - cogs) / discountedPrice : 0;
    return { converters, revenue, promoCost, grossProfit, roi, marginAfter };
  }, [fullPrice, cogs, discount, audience, convRate, units]);

  return (
    <>
      {/* enforced business rules (reference — not editable here) */}
      <div className="mb-5 border border-dashed border-meama-charcoal bg-meama-roast p-4">
        <div className="flex items-center justify-between">
          <span className="inline-block border border-meama-charcoal px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-meama-muted">
            Reference · enforced rules
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-meama-muted">business_rules.py</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-px bg-meama-charcoal sm:grid-cols-4">
          {[
            { tag: "Margin floor", value: "40%", note: "Min gross margin on every line", cls: "text-meama-green" },
            { tag: "Discount cap", value: "25%", note: "Hard cap — never overridable", cls: "text-meama-red" },
            { tag: "Min price", value: "×1.6667", note: "COGS × 1.6667 = floor per SKU", cls: "text-meama-brown" },
            { tag: "VIP segments", value: "0%", note: "Champion · Loyalist · Explorer — never discounted", cls: "text-meama-blue" },
          ].map((r) => (
            <div key={r.tag} className="bg-meama-roast p-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{r.tag}</p>
              <p className={`tabular mt-1.5 font-display text-[26px] uppercase leading-none ${r.cls}`}>{r.value}</p>
              <p className="mt-1.5 text-[11px] leading-snug text-meama-cream">{r.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-meama-muted">
          The hard limits the calculator below enforces — defined centrally, not editable from this screen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* margin safety */}
        <Panel title="Promotion builder" sub="margin safety · live">
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="SKU" type="text" value={sku} onChange={setSku} />
              <Field label="Full price ₾" value={String(fullPrice)} onChange={(v) => setFullPrice(Number(v))} />
              <Field label="COGS ₾" value={String(cogs)} onChange={(v) => setCogs(Number(v))} />
              <Field label="Discount %" value={String(discount)} onChange={(v) => setDiscount(Number(v))} />
            </div>
            <button onClick={() => void calculate()} disabled={loading}
              className="mt-5 w-full bg-meama-brown px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-meama-espresso transition-opacity hover:opacity-90 disabled:opacity-50">
              {loading ? "Calculating…" : "↻ Check margin safety"}
            </button>
            {offline && <p className="mt-3 text-[11px] text-meama-muted">ℹ️ {t("promo.offline", "Backend unreachable — showing local calculation.")}</p>}

            {result && result.lines.map((line) => (
              <div key={line.sku} className={`mt-5 border-l-2 p-4 ${line.status === "green" ? "border-l-meama-green bg-meama-green/5" : "border-l-meama-red bg-meama-red/5"}`}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-display text-[18px] uppercase tracking-[0.03em] text-meama-brown">{line.sku}</span>
                  <Badge tone={line.status === "green" ? "green" : "red"}>{line.status === "green" ? "SAFE" : "BLOCKED"}</Badge>
                </div>
                <dl className="tabular grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                  <dt className="text-meama-muted">Margin after</dt><dd className="text-right font-medium text-meama-brown">{formatPercent(line.effective_margin)}</dd>
                  <dt className="text-meama-muted">Discounted price</dt><dd className="text-right font-medium text-meama-brown">{formatGEL(line.discounted_price)}</dd>
                  <dt className="text-meama-muted">Min safe price</dt><dd className="text-right font-medium text-meama-brown">{formatGEL(line.min_safe_price)}</dd>
                  <dt className="text-meama-muted">Max safe discount</dt><dd className="text-right font-medium text-meama-brown">{formatPercent(line.max_safe_discount)}</dd>
                </dl>
                {line.reasons.length > 0 && (
                  <ul className="mt-3 list-inside list-disc space-y-0.5 text-[12px] text-meama-red">
                    {line.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Panel>

        {/* ROI estimate */}
        <Panel title="ROI estimate" sub="your assumptions · arithmetic">
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4">
              <Field label="Audience" value={String(audience)} onChange={(v) => setAudience(Number(v))} />
              <Field label="Conv. rate %" value={String(convRate)} onChange={(v) => setConvRate(Number(v))} />
              <Field label="Units / cust." value={String(units)} onChange={(v) => setUnits(Number(v))} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-px border border-meama-charcoal bg-meama-charcoal sm:grid-cols-3">
              {[
                { l: "Converters", v: formatNumber(est.converters), cls: "text-meama-brown" },
                { l: "Revenue", v: formatGEL0(est.revenue), cls: "text-meama-green" },
                { l: "Promo cost", v: formatGEL0(est.promoCost), cls: "text-meama-brown" },
                { l: "Gross profit", v: formatGEL0(est.grossProfit), cls: "text-meama-green" },
                { l: "ROI", v: est.roi !== null ? `${est.roi.toFixed(1)}×` : "—", cls: est.roi !== null && est.roi >= 1 ? "text-meama-green" : "text-meama-red" },
                { l: "Margin after", v: formatPercent(est.marginAfter), cls: est.marginAfter >= MARGIN_FLOOR ? "text-meama-green" : "text-meama-red" },
              ].map((r) => (
                <div key={r.l} className="bg-meama-ivory px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{r.l}</p>
                  <p className={`tabular mt-1 font-display text-[20px] uppercase leading-none ${r.cls}`}>{r.v}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-meama-muted">
              Revenue &amp; ROI are computed from the audience, conversion and unit assumptions you enter —
              not a forecast model. Margin safety (left) is the binding business rule.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}

// ── ADD CAMPAIGN MODAL ───────────────────────────────────────────────────────

const CHANNELS = ["email", "sms", "ecommerce", "pos", "paid"] as const;
const TYPES = ["bundle", "discount", "gift", "subscription", "clearance"] as const;

function ModalSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: readonly string[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="border border-meama-charcoal bg-meama-ivory px-3 py-2 text-sm text-meama-brown outline-none transition-colors focus:border-meama-brown">
        {options.map((o) => <option key={o} value={o}>{channelLabel(o) !== "—" && CHANNELS.includes(o as typeof CHANNELS[number]) ? channelLabel(o) : o}</option>)}
      </select>
    </label>
  );
}

function AddCampaignModal({ defaultDate, onAdd, onClose }: {
  defaultDate: string; onAdd: (c: CampaignSummary) => void; onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [channel, setChannel] = useState<string>("email");
  const [type, setType] = useState<string>("discount");
  const [segment, setSegment] = useState("");
  const [discount, setDiscount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const showDiscount = type === "discount" || type === "gift";
  const discNum = discount ? Number(discount) : null;
  const valid = name.trim().length > 0 && Boolean(date);

  async function submit() {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      const created = await createCampaign({
        name: name.trim(),
        channel,
        promo_type: type,
        discount_value: showDiscount ? discNum : null,
        target_segment: segment.trim() || null,
        scheduled_at: new Date(`${date}T00:00:00`).toISOString(),
      });
      onAdd(created);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-meama-brown/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg border border-meama-charcoal bg-meama-ivory shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <div className="flex items-center justify-between border-b border-meama-charcoal px-6 py-4">
          <h2 className="font-display text-[22px] uppercase leading-none tracking-[0.03em] text-meama-brown">Add campaign</h2>
          <button onClick={onClose} aria-label="Close"
            className="flex h-7 w-7 items-center justify-center border border-meama-charcoal text-meama-muted transition-colors hover:border-meama-brown hover:text-meama-brown">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">Campaign name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring win-back"
              className="border border-meama-charcoal bg-meama-ivory px-3 py-2 text-sm text-meama-brown outline-none transition-colors focus:border-meama-brown" />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="tabular border border-meama-charcoal bg-meama-ivory px-3 py-2 text-sm text-meama-brown outline-none transition-colors focus:border-meama-brown" />
            </label>
            <ModalSelect label="Channel" value={channel} onChange={setChannel} options={CHANNELS} />
            <ModalSelect label="Type" value={type} onChange={setType} options={TYPES} />
            {showDiscount ? (
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">Discount %</span>
                <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="optional"
                  className="tabular border border-meama-charcoal bg-meama-ivory px-3 py-2 text-sm text-meama-brown outline-none transition-colors focus:border-meama-brown" />
              </label>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">Segment</span>
                <input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="optional"
                  className="border border-meama-charcoal bg-meama-ivory px-3 py-2 text-sm text-meama-brown outline-none transition-colors focus:border-meama-brown" />
              </label>
            )}
          </div>

          {showDiscount && (
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">Segment</span>
              <input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="optional"
                className="border border-meama-charcoal bg-meama-ivory px-3 py-2 text-sm text-meama-brown outline-none transition-colors focus:border-meama-brown" />
            </label>
          )}

          {error && (
            <p className="mt-3 border border-meama-red/40 bg-meama-red/8 px-3 py-2 text-[12px] text-meama-red">{error}</p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button onClick={() => void submit()} disabled={!valid || saving}
              className="bg-meama-brown px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-meama-espresso transition-opacity hover:opacity-90 disabled:opacity-40">
              {saving ? "Saving…" : "Add to calendar →"}
            </button>
            <button onClick={onClose} disabled={saving}
              className="border border-meama-charcoal px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-meama-cream transition-colors hover:border-meama-brown hover:text-meama-brown disabled:opacity-40">
              Cancel
            </button>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-meama-muted">
            Saved to the database as a <span className="text-meama-brown">draft</span> campaign (origin: manual).
            Discount promos automatically exclude the no-discount VIP segments.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── CALENDAR ─────────────────────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CAL_TONE: Record<string, string> = {
  green: "border-meama-green/40 bg-meama-green/8 text-meama-green",
  blue:  "border-meama-blue/40 bg-meama-blue/8 text-meama-blue",
  gold:  "border-meama-charcoal bg-meama-roast text-meama-brown",
  red:   "border-meama-red/40 bg-meama-red/8 text-meama-red",
  muted: "border-meama-charcoal bg-meama-roast text-meama-muted",
};

function CalendarTab({ campaigns, onSelect, onAdd }: {
  campaigns: CampaignSummary[]; onSelect: (c: CampaignSummary) => void; onAdd: (c: CampaignSummary) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [adding, setAdding] = useState(false);

  const byDate = useMemo(() => {
    const map = new Map<string, CampaignSummary[]>();
    for (const c of campaigns) {
      const raw = c.launched_at ?? c.scheduled_at;
      if (!raw) continue;
      const d = raw.slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(c);
    }
    return map;
  }, [campaigns]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(year, month).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const monthTotal = [...byDate.entries()].filter(([d]) => {
    const [y, m] = d.split("-").map(Number);
    return y === year && m === month + 1;
  }).reduce((s, [, cs]) => s + cs.length, 0);

  function shift(delta: number) {
    const m = month + delta;
    if (m < 0) { setYear((y) => y - 1); setMonth(11); }
    else if (m > 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth(m);
  }

  const navBtn = "border border-meama-charcoal px-3 py-1.5 font-mono text-xs text-meama-cream transition-colors hover:border-meama-gold hover:text-meama-gold";
  const defaultDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(now.getDate(), daysInMonth)).padStart(2, "0")}`;

  return (
    <Panel title="Campaign calendar" sub={`${monthTotal} this month`}>
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button className={navBtn} onClick={() => shift(-1)}>←</button>
            <span className="font-display text-[20px] uppercase tracking-[0.04em] text-meama-brown">{monthLabel}</span>
            <button className={navBtn} onClick={() => shift(1)}>→</button>
          </div>
          <button onClick={() => setAdding(true)}
            className="bg-meama-brown px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-meama-espresso transition-opacity hover:opacity-90">
            + Add campaign
          </button>
        </div>
        {adding && <AddCampaignModal defaultDate={defaultDate} onAdd={onAdd} onClose={() => setAdding(false)} />}
        <div className="mb-1 grid grid-cols-7">
          {DOW.map((d) => <div key={d} className="py-1 text-center font-mono text-[9px] uppercase tracking-wider text-meama-muted">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="min-h-[78px] bg-meama-roast/50" />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const evs = byDate.get(dateStr) ?? [];
            const isToday = dateStr === todayStr;
            return (
              <div key={i} className={`min-h-[78px] border p-1.5 ${isToday ? "border-meama-brown bg-meama-brown/5" : "border-meama-charcoal bg-meama-ivory"}`}>
                <span className={`mb-1 block font-mono text-[10px] ${isToday ? "font-bold text-meama-brown" : "text-meama-muted"}`}>{day}</span>
                {evs.slice(0, 3).map((c) => (
                  <button key={c.id} title={c.name} onClick={() => onSelect(c)}
                    className={`mb-0.5 block w-full truncate border px-1 py-0.5 text-left font-mono text-[9px] leading-tight transition-opacity hover:opacity-70 ${CAL_TONE[statusTone(c.status)]}`}>
                    {c.name}
                  </button>
                ))}
                {evs.length > 3 && <span className="block pl-1 font-mono text-[9px] text-meama-muted">+{evs.length - 3}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

// ── PLAN ─────────────────────────────────────────────────────────────────────

function PlanTab({ campaigns, onSelect }: { campaigns: CampaignSummary[]; onSelect: (c: CampaignSummary) => void }) {
  const rows = [...campaigns].sort((a, b) => {
    const da = a.launched_at ?? a.scheduled_at ?? "";
    const db = b.launched_at ?? b.scheduled_at ?? "";
    return db.localeCompare(da);
  });
  const totalRev = campaigns.reduce((s, c) => s + (c.revenue_total ?? 0), 0);
  const discounts = campaigns.map(discountLabel).filter(Boolean).map((d) => Number(d!.replace("%", "")));
  const avgDisc = discounts.length ? discounts.reduce((a, b) => a + b, 0) / discounts.length : null;
  const approved = campaigns.filter((c) => c.status === "active" || c.status === "approved").length;

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Campaign plan" sub="all planned & running">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-meama-charcoal">
                {["Campaign", "Type", "Date", "Segment", "Disc.", "Rev/Disc", "Status"].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold ${i > 0 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} onClick={() => onSelect(c)} className="cursor-pointer border-b border-meama-charcoal hover:bg-meama-espresso">
                  <td className="px-4 py-2.5 font-medium text-meama-brown">{c.name}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-meama-cream">{c.promo_type ?? "—"}</td>
                  <td className="tabular px-4 py-2.5 text-right font-mono text-[11px] text-meama-muted">{fmtDate(c.launched_at ?? c.scheduled_at)}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-meama-cream">{c.target_segment ?? "—"}</td>
                  <td className="tabular px-4 py-2.5 text-right text-meama-brown">{discountLabel(c) ?? "—"}</td>
                  <td className="tabular px-4 py-2.5 text-right text-meama-green">{c.roi !== null ? `${c.roi.toFixed(1)}×` : "—"}</td>
                  <td className="px-4 py-2.5 text-right"><Badge tone={statusTone(c.status)}>{(c.status ?? "—").toUpperCase()}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Month totals">
        <div className="grid grid-cols-2 gap-px border-t border-meama-charcoal bg-meama-charcoal sm:grid-cols-4">
          {[
            { l: "Total revenue", v: formatGEL0(totalRev), cls: "text-meama-green" },
            { l: "Campaigns", v: String(campaigns.length), cls: "text-meama-brown" },
            { l: "Avg discount", v: avgDisc !== null ? `${avgDisc.toFixed(1)}%` : "—", cls: "text-meama-brown" },
            { l: "Active / approved", v: String(approved), cls: "text-meama-green" },
          ].map((s) => (
            <div key={s.l} className="bg-meama-ivory px-5 py-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{s.l}</p>
              <p className={`tabular mt-1.5 font-display text-[28px] uppercase leading-none ${s.cls}`}>{s.v}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── ADS ──────────────────────────────────────────────────────────────────────

const ACCOUNT_NAMES: Record<string, string> = {
  act_338230624893406: "Meama Bakup",
  act_1127266979207472: "Meama New",
};

function SpendBars({ data }: { data: { date: string; spend_usd: number }[] }) {
  if (!data.length) return <div className="flex h-14 items-center justify-center text-xs text-meama-muted">No spend data</div>;
  const max = Math.max(...data.map((d) => d.spend_usd), 1);
  const W = 600, H = 56, gap = 3;
  const barW = (W - (data.length - 1) * gap) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" aria-hidden="true">
      {data.map((d, i) => {
        const h = Math.max(2, (d.spend_usd / max) * (H - 4));
        return <rect key={d.date} x={i * (barW + gap)} y={H - h} width={barW} height={h} fill="#1C3A7A" opacity="0.6" />;
      })}
    </svg>
  );
}

function AdsTab({ overview, loading, error }: { overview: MetaOverview | null; loading: boolean; error: string | null }) {
  if (loading) return <Loading label="Loading Meta data…" />;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!overview) return null;

  const ov = overview;
  const roasOk = ov.blended_roas !== null && ov.blended_roas >= ROAS_THRESHOLD;

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-px border border-meama-charcoal bg-meama-charcoal sm:grid-cols-5">
        {[
          { l: "Spend · 30d", v: formatUSD0(ov.total_spend_usd), cls: "text-meama-brown" },
          { l: "Blended ROAS", v: ov.blended_roas !== null ? `${ov.blended_roas.toFixed(2)}×` : "—", cls: ov.blended_roas === null ? "text-meama-brown" : roasOk ? "text-meama-green" : "text-meama-red" },
          { l: "Impressions", v: formatNumber(ov.total_impressions), cls: "text-meama-brown" },
          { l: "Clicks", v: formatNumber(ov.total_clicks), cls: "text-meama-brown" },
          { l: "Below 2× ROAS", v: String(ov.below_threshold_count), cls: ov.below_threshold_count > 0 ? "text-meama-red" : "text-meama-green" },
        ].map((s) => (
          <div key={s.l} className="bg-meama-ivory p-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{s.l}</p>
            <p className={`tabular mt-1.5 font-display text-[26px] uppercase leading-none ${s.cls}`}>{s.v}</p>
          </div>
        ))}
      </div>

      {ov.daily_trend.length > 0 && (
        <Panel title="Daily spend" sub="last 14 days">
          <div className="p-5">
            <SpendBars data={ov.daily_trend} />
            <div className="mt-2 flex justify-between font-mono text-[9px] uppercase tracking-wider text-meama-muted">
              <span>{ov.daily_trend[0]?.date}</span>
              <span>avg {formatUSD(ov.daily_trend.reduce((s, d) => s + d.spend_usd, 0) / ov.daily_trend.length)}/day</span>
              <span>{ov.daily_trend[ov.daily_trend.length - 1]?.date}</span>
            </div>
          </div>
        </Panel>
      )}

      {ov.campaigns.length > 0 && (
        <div className="mt-5">
          <Panel title="Meta campaigns" sub={`${ov.campaigns.length} active`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-meama-charcoal">
                    {["Campaign", "Account", "Spend", "Impr.", "Clicks", "CTR", "ROAS", "Status"].map((h, i) => (
                      <th key={h} className={`px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold ${i > 1 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ov.campaigns.map((c) => {
                    const danger = c.roas !== null && c.roas < ROAS_THRESHOLD;
                    const ctr = c.impressions > 0 ? c.clicks / c.impressions : null;
                    return (
                      <tr key={c.meta_campaign_id} className={`border-b border-meama-charcoal ${danger ? "bg-meama-red/5" : "hover:bg-meama-espresso"}`}>
                        <td className="px-4 py-2.5 font-medium text-meama-brown">{c.meta_campaign_name ?? c.meta_campaign_id}</td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-meama-muted">{ACCOUNT_NAMES[c.meta_account_id ?? ""] ?? c.meta_account_id ?? "—"}</td>
                        <td className="tabular px-4 py-2.5 text-right text-meama-brown">{formatUSD0(c.spend_usd)}</td>
                        <td className="tabular px-4 py-2.5 text-right text-meama-cream">{formatNumber(c.impressions)}</td>
                        <td className="tabular px-4 py-2.5 text-right text-meama-cream">{formatNumber(c.clicks)}</td>
                        <td className="tabular px-4 py-2.5 text-right text-meama-cream">{ctr !== null ? formatPercent(ctr, 2) : "—"}</td>
                        <td className={`tabular px-4 py-2.5 text-right font-medium ${c.roas === null ? "text-meama-muted" : danger ? "text-meama-red" : "text-meama-green"}`}>{c.roas !== null ? `${c.roas.toFixed(2)}×` : "—"}</td>
                        <td className="px-4 py-2.5 text-right">{c.roas === null ? "—" : danger ? <Badge tone="red">BELOW 2×</Badge> : <Badge tone="green">HEALTHY</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
      {ov.campaigns.length === 0 && <p className="text-sm text-meama-muted">No Meta data for the last 30 days.</p>}

      <Placeholder title="AI ad recommendations">
        Auto-generated audience targeting, ad copy and budget suggestions will appear here once the
        Claude-powered suggestion pipeline (LangGraph) is wired. The figures above are live Meta Marketing API data.
      </Placeholder>
    </>
  );
}

// ── APPROVAL QUEUE (placeholder) ─────────────────────────────────────────────

function QueueTab({ campaigns, onSelect }: { campaigns: CampaignSummary[]; onSelect: (c: CampaignSummary) => void }) {
  const pending = campaigns.filter((c) => c.status === "draft" || c.status === "pending_approval");
  return (
    <>
      {pending.length > 0 && (
        <Panel title="Awaiting approval" sub={`${pending.length} draft/pending`}>
          {pending.map((c) => <ListRow key={c.id} c={c} onSelect={onSelect} />)}
        </Panel>
      )}
      <Placeholder title="AI approval queue">
        This is where Claude-suggested campaigns land for manager approval — each with predicted revenue,
        ROI, margin and fatigue risk, plus Approve / Edit / Reject actions. The suggestion engine
        (segment → offer → predict → copy → approval) is not built yet, so only existing draft/pending
        campaigns from the database are shown above.
      </Placeholder>
    </>
  );
}

// ── tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }: {
  tabs: { id: string; label: string; badge?: number }[]; active: string; onChange: (id: string) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-6 border-b border-meama-charcoal">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`relative -mb-px flex items-center gap-2 pb-3 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
            active === t.id
              ? "text-meama-brown after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-meama-brown"
              : "text-meama-muted hover:text-meama-brown"
          }`}>
          {t.label}
          {t.badge ? <span className="border border-meama-red/40 bg-meama-red/8 px-1.5 text-[9px] text-meama-red">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ── root ─────────────────────────────────────────────────────────────────────

export default function Campaigns() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("overview");
  const [promoTab, setPromoTab] = useState<PromoTab>("calculator");
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaOverview | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CampaignSummary | null>(null);

  useEffect(() => {
    fetchCampaigns().then(setCampaigns).catch((e: unknown) => setError(String(e))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "ads" || meta) return;
    setMetaLoading(true);
    fetchMetaOverview().then(setMeta).catch((e: unknown) => setMetaError(String(e))).finally(() => setMetaLoading(false));
  }, [tab, meta]);

  const addCampaign = (c: CampaignSummary) => setCampaigns((prev) => [c, ...prev]);

  const active = campaigns.filter((c) => c.status === "active").length;
  const totalRev = campaigns.reduce((s, c) => s + (c.revenue_total ?? 0), 0);
  const withRoi = campaigns.filter((c) => c.roi !== null);
  const avgRoi = withRoi.length ? withRoi.reduce((s, c) => s + (c.roi ?? 0), 0) / withRoi.length : null;
  const pendingCount = campaigns.filter((c) => c.status === "draft" || c.status === "pending_approval").length;

  return (
    <div>
      <PageHeader
        kicker="05 · Campaign Intelligence"
        kickerKa="კამპანიები"
        title={t("pages.campaigns.title", "Campaigns")}
        subtitle={t("pages.campaigns.subtitle", "Plan · price · measure — retail channels only")}
      />

      {loading && <Loading label="Loading campaigns…" />}
      {error && <ErrorBox>{error}</ErrorBox>}

      {!loading && !error && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-px border border-meama-charcoal bg-meama-charcoal sm:grid-cols-4">
            <Kpi label="Active campaigns" value={String(active)} foot="running now" footTone="up" />
            <Kpi label="Attributed revenue" value={formatGEL0(totalRev)} foot="all campaigns" footTone="flat" />
            <Kpi label="Avg rev / disc" value={avgRoi !== null ? `${avgRoi.toFixed(1)}×` : "—"} foot="revenue ÷ discount" footTone="flat" />
            <Kpi label="Pending approval" value={String(pendingCount)} foot={pendingCount > 0 ? "action needed" : "all clear"} footTone={pendingCount > 0 ? "down" : "up"} />
          </div>

          <TabBar
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "promotions", label: "Promotions" },
              { id: "ads", label: "Ads" },
              { id: "queue", label: "Approval Queue", badge: pendingCount || undefined },
            ]}
            active={tab}
            onChange={(id) => setTab(id as Tab)}
          />

          {tab === "overview" && <OverviewTab campaigns={campaigns} onSelect={setSelected} />}

          {tab === "promotions" && (
            <>
              <TabBar
                tabs={[
                  { id: "calculator", label: "Calculator" },
                  { id: "calendar", label: "Calendar" },
                  { id: "plan", label: "Plan" },
                ]}
                active={promoTab}
                onChange={(id) => setPromoTab(id as PromoTab)}
              />
              {promoTab === "calculator" && <CalculatorTab />}
              {promoTab === "calendar" && <CalendarTab campaigns={campaigns} onSelect={setSelected} onAdd={addCampaign} />}
              {promoTab === "plan" && <PlanTab campaigns={campaigns} onSelect={setSelected} />}
            </>
          )}

          {tab === "ads" && <AdsTab overview={meta} loading={metaLoading} error={metaError} />}
          {tab === "queue" && <QueueTab campaigns={campaigns} onSelect={setSelected} />}
        </>
      )}

      {selected && <CampaignDrawer c={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
