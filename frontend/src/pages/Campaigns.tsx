import { Fragment, useEffect, useMemo, useRef, useState, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  type CampaignDetail,
  type CampaignSummary,
  type CatalogProduct,
  type MetaOverview,
  createCampaign,
  fetchCampaignDetail,
  fetchCampaigns,
  fetchCatalogProducts,
  fetchMetaOverview,
  setCampaignStatus,
} from "../lib/api";
import {
  formatGEL,
  formatGEL0,
  formatNumber,
  formatPercent,
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
const GEO_VAT = 0.18;

function calcNetMargin(grossPrice: number, cogs: number): number {
  const net = grossPrice / (1 + GEO_VAT);
  return net > 0 ? (net - cogs) / net : 0;
}
function calcMinSafePrice(cogs: number): number {
  return cogs * MIN_PRICE_MULTIPLIER * (1 + GEO_VAT);
}
// Largest discount that keeps net margin >= floor. Uncapped (can exceed 25%).
function calcMaxSafeDiscount(fullPrice: number, cogs: number): number {
  return fullPrice > 0 ? Math.max(0, 1 - calcMinSafePrice(cogs) / fullPrice) : 0;
}

// ---- B2B wholesale (mirror backend business_rules.py) ----
const B2B_CAP_TIER_THRESHOLD = 500;   // capsules / order
const B2B_CAP_DISCOUNT_UNDER = 0.25;
const B2B_CAP_DISCOUNT_OVER = 0.30;
const B2B_ACCESSORY_DISCOUNT = 0.15;  // machines = ecom (no B2B price)

type Tab = "overview" | "promotions" | "ads" | "queue";
type PromoTab = "calculator" | "calendar" | "plan" | "edit";

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

// ── shared primitives (PRMTR v2 design system) ───────────────────────────────

const controlCls =
  "h-10 border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-disabled)] hover:border-[var(--color-border-strong)] focus:border-[var(--green-500)] focus:shadow-[var(--shadow-focus)]";

const selectCls =
  `${controlCls} w-full appearance-none pr-10`;

const secondaryBtnCls =
  "inline-flex h-10 items-center justify-center gap-2 border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--gray-50)] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none disabled:text-[var(--color-text-disabled)]";

const primaryBtnCls =
  "inline-flex h-10 items-center justify-center gap-2 bg-[var(--color-action-primary)] px-4 text-sm font-semibold text-[var(--color-action-primary-text)] transition-colors hover:bg-[var(--color-action-primary-hover)] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none disabled:bg-[var(--gray-200)] disabled:text-[var(--gray-400)]";

const metricCardCls =
  "bg-[var(--color-surface)] p-5 shadow-sm transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-md";

function StyledSelect({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`${selectCls} ${className}`}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Custom popover dropdown — replaces the native <select> for product/category
// pickers so the OPEN menu can be styled (group headers, checkmarks, hover).
interface ComboOption { value: string; label: string }
interface ComboGroup { label?: string; options: ComboOption[] }

function Combo({ value, onChange, groups, placeholder = "— select —", disabled }: {
  value: string;
  onChange: (v: string) => void;
  groups: ComboGroup[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allOptions = useMemo(() => groups.flatMap(g => g.options), [groups]);
  const selected = allOptions.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`${controlCls} flex w-full items-center justify-between gap-2 text-left ${disabled ? "opacity-60" : ""}`}>
        <span className={`truncate ${selected ? "" : "text-[var(--color-text-disabled)]"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"
          className={`h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto border border-[var(--color-border-strong)] bg-[var(--color-surface)] py-1 shadow-lg">
          {groups.map((g, gi) => (
            <Fragment key={g.label ?? `g${gi}`}>
              {g.label && (
                <p className="px-3 pb-1 pt-2 font-mono text-[9px] uppercase tracking-widest text-[var(--color-text-tertiary)]">{g.label}</p>
              )}
              {g.options.map(o => {
                const active = o.value === value;
                return (
                  <button type="button" key={o.value} role="option" aria-selected={active}
                    onClick={() => { onChange(o.value); setOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--gray-50)] ${active ? "font-medium text-[var(--green-700)]" : "text-[var(--color-text)]"}`}>
                    <span className="w-3 flex-shrink-0 text-[var(--green-600)]">{active ? "✓" : ""}</span>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </Fragment>
          ))}
          {!allOptions.length && <p className="px-3 py-2 text-sm text-[var(--color-text-tertiary)]">— none —</p>}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, foot, footTone }: {
  label: string; value: string; foot?: string; footTone?: "up" | "down" | "flat";
}) {
  const footCls = footTone === "up" ? "text-[var(--color-positive)]" : footTone === "down" ? "text-[var(--color-negative)]" : "text-[var(--color-text-tertiary)]";
  return (
    <div className={metricCardCls}>
      <div className="text-[12px] font-medium leading-4 text-[var(--color-text-secondary)]">{label}</div>
      <div className="tabular mt-2 font-mono text-[32px] font-semibold leading-9 tracking-[-0.02em] text-[var(--color-text)]">{value}</div>
      {foot && <div className={`mt-2 font-mono text-[12px] font-semibold leading-4 ${footCls}`}>{foot}</div>}
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] px-5 py-[18px]">
        <h3 className="text-[20px] font-semibold leading-[26px] tracking-[-0.01em] text-[var(--color-text)]">{title}</h3>
        {sub && <span className="font-mono text-[12px] font-medium leading-4 text-[var(--color-text-tertiary)]">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 mt-5 text-[12px] font-medium leading-4 text-[var(--color-text-secondary)]">{children}</p>;
}

function Placeholder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] p-6">
      <span className="inline-block border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] font-semibold leading-4 text-[var(--color-text-tertiary)]">
        Placeholder
      </span>
      <h4 className="mt-3 text-[20px] font-semibold leading-[26px] tracking-[-0.01em] text-[var(--color-text)]">{title}</h4>
      <p className="mt-2 max-w-[70ch] text-sm leading-5 text-[var(--color-text-secondary)]">{children}</p>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 py-3 text-sm text-[var(--color-text-secondary)]">
      <span className="pulse-live h-2 w-2 bg-[var(--signal-500)]" />{label}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="border border-[var(--critical-500)] border-l-[3px] border-l-[var(--critical-600)] bg-[var(--critical-50)] px-4 py-3 text-sm text-[var(--critical-600)]">{children}</div>;
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

  const runWindow = (detail?.valid_from || detail?.valid_to || c.valid_to)
    ? `${fmtDate(detail?.valid_from)} → ${fmtDate(detail?.valid_to ?? c.valid_to)}` : null;
  const isCheckoutUpsell = detail?.source_app === "wiz" && c.promo_type === "bundle";

  const terms: { label: string; value: React.ReactNode }[] = [];
  const push = (label: string, value: React.ReactNode | null | undefined) => { if (value) terms.push({ label, value }); };
  push("Type", c.promo_type);
  push("Channel", c.channel ? channelLabel(c.channel) : null);
  push("Segment", c.target_segment);
  push("Offer", offer);
  push("Code", c.shopify_code ? <span className="font-mono text-[12px]">{c.shopify_code}</span> : null);
  if (c.shopify_usage_count !== null) {
    const usageStr = c.shopify_usage_limit
      ? `${formatNumber(c.shopify_usage_count)} / ${formatNumber(c.shopify_usage_limit)}`
      : `${formatNumber(c.shopify_usage_count)} used`;
    push("Usage", usageStr);
  }
  if (isCheckoutUpsell) {
    push("Attribution", <span className="font-mono text-[11px]">checkout upsell items</span>);
  } else {
    push("Bundle tag", detail?.tag_pattern ? <span className="font-mono text-[11px]">{detail.tag_pattern}</span> : null);
  }
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
            {c.shopify_discount_status && (
              <Badge tone={
                c.shopify_discount_status === "ACTIVE" ? "green" :
                c.shopify_discount_status === "EXPIRED" ? "red" : "muted"
              }>
                {`SHOPIFY ${c.shopify_discount_status}`}
              </Badge>
            )}
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
              <SectionLabel>Meta ads</SectionLabel>
              <div className="border border-meama-charcoal px-4">
                <DrawerRow label="Spend">{formatGEL(c.meta_spend_usd)}</DrawerRow>
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
      className="flex min-h-14 w-full items-center gap-4 border-b border-[var(--color-divider)] px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--gray-50)]">
      <div className="min-w-0 flex-[2]">
        <div className="truncate text-sm font-semibold text-[var(--color-text)]">{c.name}</div>
        <div className="mt-0.5 truncate text-[12px] leading-4 text-[var(--color-text-secondary)]">
          {channelLabel(c.channel)}{c.target_segment ? ` · ${c.target_segment}` : ""}
        </div>
      </div>
      <span className={`tabular w-11 text-right font-mono text-[12px] font-semibold ${disc ? "text-[var(--color-text)]" : "text-[var(--color-text-tertiary)]"}`}>{disc ?? "—"}</span>
      <span className="tabular w-12 text-right font-mono text-[12px] font-semibold text-[var(--color-positive)]" title="Revenue ÷ discount given">{c.roi !== null ? `${c.roi.toFixed(1)}×` : "—"}</span>
      <span className="tabular w-24 text-right font-mono text-[14px] font-semibold text-[var(--color-text)]">{c.revenue_total !== null ? formatGEL0(c.revenue_total) : "—"}</span>
      <span className="flex w-24 justify-end">
        {(() => {
          const eff = effectiveStatus(c);
          const tone: BadgeTone =
            eff === "ACTIVE"    ? "green" :
            eff === "EXPIRED"   ? "red"   :
            eff === "SCHEDULED" ? "muted" :
            statusTone(c.status);
          return <Badge tone={tone}>{eff.toUpperCase()}</Badge>;
        })()}
      </span>
      <svg className="shrink-0 text-[var(--color-text-disabled)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  );
}

type ShopifyFilter = "all" | "ACTIVE" | "EXPIRED" | "SCHEDULED" | "unlinked";
type SortKey = "revenue" | "ending_date";

function effectiveStatus(c: CampaignSummary): string {
  // Hard date block — always wins regardless of DB or Shopify status
  if (c.valid_to && new Date(c.valid_to) < new Date()) return "EXPIRED";
  // Explicit DB active — our manual truth; overrides historical Shopify CSV snapshot
  // (CSV backfill can mark codes EXPIRED even when the underlying offer is still live)
  if (c.status === "active") return "ACTIVE";
  // Shopify discount status for non-explicitly-active campaigns
  if (c.shopify_discount_status) return c.shopify_discount_status;
  // Future end date → live
  if (c.valid_to) return "ACTIVE";
  // Fallback: surface DB status uppercase
  return c.status?.toUpperCase() ?? "—";
}

function OverviewTab({ campaigns, onSelect }: { campaigns: CampaignSummary[]; onSelect: (c: CampaignSummary) => void }) {
  const [filter, setFilter] = useState<ShopifyFilter>("ACTIVE");
  const [sort, setSort] = useState<SortKey>("revenue");

  const byChannel = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const c of campaigns) {
      const key = channelLabel(c.channel);
      const cur = map.get(key) ?? { count: 0, revenue: 0 };
      cur.count += 1; cur.revenue += c.revenue_total ?? 0;
      map.set(key, cur);
    }
    const HIDDEN_CHANNELS = new Set(["Email", "Paid"]);
    return [...map.entries()]
      .filter(([ch]) => !HIDDEN_CHANNELS.has(ch))
      .sort((a, b) => b[1].revenue - a[1].revenue);
  }, [campaigns]);

  const counts = useMemo(() => ({
    all: campaigns.length,
    ACTIVE:    campaigns.filter((c) => effectiveStatus(c) === "ACTIVE").length,
    EXPIRED:   campaigns.filter((c) => effectiveStatus(c) === "EXPIRED").length,
    SCHEDULED: campaigns.filter((c) => effectiveStatus(c) === "SCHEDULED").length,
    unlinked:  campaigns.filter((c) => !["ACTIVE","EXPIRED","SCHEDULED"].includes(effectiveStatus(c))).length,
  }), [campaigns]);

  const filtered = useMemo(() => {
    const compareFn = sort === "ending_date"
      ? (a: CampaignSummary, b: CampaignSummary) => {
          const now = Date.now();
          const aEnd = a.valid_to ? new Date(a.valid_to).getTime() : null;
          const bEnd = b.valid_to ? new Date(b.valid_to).getTime() : null;
          const aExpired = aEnd !== null && aEnd < now;
          const bExpired = bEnd !== null && bEnd < now;
          if (aExpired && bExpired) return bEnd! - aEnd!;
          if (aExpired) return -1;
          if (bExpired) return 1;
          return 0;
        }
      : (a: CampaignSummary, b: CampaignSummary) => (b.revenue_total ?? 0) - (a.revenue_total ?? 0);
    const base = [...campaigns].sort(compareFn);
    if (filter === "all") return base;
    if (filter === "unlinked") return base.filter((c) => !["ACTIVE","EXPIRED","SCHEDULED"].includes(effectiveStatus(c)));
    return base.filter((c) => effectiveStatus(c) === filter);
  }, [campaigns, filter, sort]);

  const pending = campaigns.filter((c) => c.status === "draft" || c.status === "pending_approval");

  const FILTERS: { id: ShopifyFilter; label: string }[] = [
    { id: "all",       label: "All" },
    { id: "ACTIVE",    label: "Active" },
    { id: "EXPIRED",   label: "Expired" },
    { id: "SCHEDULED", label: "Scheduled" },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="All campaigns" sub={`${filtered.length} of ${campaigns.length}`}>
        {/* Shopify status filter strip */}
        <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex h-9 items-center gap-1.5 px-3 text-sm font-semibold transition-colors ${
                filter === f.id
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--gray-50)] hover:text-[var(--color-text)]"
              }`}
            >
              {f.label}
              <span className={`font-mono text-[11px] ${filter === f.id ? "text-[var(--color-text)]" : "text-[var(--color-text-tertiary)]"}`}>
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>
        {/* Sort controls */}
        <div className="flex items-center gap-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <span className="px-4 text-[12px] font-medium text-[var(--color-text-tertiary)]">Sort</span>
          {(["revenue", "ending_date"] as SortKey[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`h-9 border-l border-[var(--color-border)] px-4 text-sm font-semibold transition-colors ${
                sort === s ? "bg-[var(--gray-50)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              }`}
            >
              {s === "revenue" ? "Revenue" : "Ending date"}
            </button>
          ))}
          {filter === "ACTIVE" && (
            <span className="ml-auto px-4 font-mono text-[11px] font-semibold text-[var(--color-text-tertiary)]">
              MTD revenue · orders
            </span>
          )}
        </div>
        {filtered.length === 0 && <p className="px-5 py-4 text-sm text-meama-muted">No campaigns match this filter.</p>}
        {filtered.map((c) => <ListRow key={c.id} c={c} onSelect={onSelect} />)}
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
  const minSafePrice = calcMinSafePrice(cogs);
  const maxSafeDiscount = Math.max(0, 1 - minSafePrice / fullPrice);
  const effectiveMargin = calcNetMargin(discountedPrice, cogs);
  const reasons: string[] = [];
  if (effectiveMargin < MARGIN_FLOOR) reasons.push(`Net margin ${(effectiveMargin * 100).toFixed(1)}% is below the 40% floor`);
  if (discountedPrice < minSafePrice) reasons.push(`Price ₾${discountedPrice.toFixed(2)} below min safe ₾${minSafePrice.toFixed(2)}`);
  return {
    discount_pct: discountPct, blocked: reasons.length > 0,
    lines: [{ sku, full_price: fullPrice, cogs, discounted_price: discountedPrice, min_safe_price: minSafePrice, max_safe_discount: maxSafeDiscount, effective_margin: effectiveMargin, status: reasons.length > 0 ? "red" : "green", blocked: reasons.length > 0, reasons }],
  };
}

function Field({ label, value, onChange, type = "number" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium leading-4 text-[var(--color-text-secondary)]">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className={`tabular ${controlCls}`} />
    </label>
  );
}

// ── STATIC DATA (from MEAMA_Commercial_Master_2026.xlsx) ─────────────────────

const ACCESSORIES = [
  { name: "Milk Frother",         fullPrice: 80,  cogs: 43.80 },
  { name: "Metal Cup 280ml",      fullPrice: 35,  cogs: 16.22 },
  { name: "Metal Cup 160ml",      fullPrice: 30,  cogs: 13.86 },
  { name: "Holder Round 18cm",    fullPrice: 20,  cogs:  9.17 },
  { name: "Holder AcryCube 15cm", fullPrice: 25,  cogs: 14.26 },
  { name: "Holder AcryCube 13cm", fullPrice: 25,  cogs: 12.86 },
  { name: "Candle",               fullPrice: 30,  cogs: 29.85 },
  { name: "Skelaris (Cleaner)",   fullPrice:  5,  cogs:  0.10 },
] as const;

// Per-category data from MEAMA_Commercial_Master_2026.xlsx
// packPrice & boxCogs are per-box (pack) averages. maxDiscount from Inputs col J.
const CATEGORY_LIMITS = [
  { category: "Espresso & Lungo", sub: "Classic",            maxDiscount: 0.30, packPrice: 15.0, boxCogs:  3.85, capsPerPack: 10 },
  { category: "Espresso & Lungo", sub: "Flavoured",          maxDiscount: 0.30, packPrice: 16.0, boxCogs:  4.15, capsPerPack: 10 },
  { category: "Filtered Coffee",  sub: "Classic",            maxDiscount: 0.20, packPrice: 20.5, boxCogs:  6.16, capsPerPack: 12 },
  { category: "Filtered Coffee",  sub: "Classic — Flagship", maxDiscount: 0.33, packPrice: 24.0, boxCogs:  7.85, capsPerPack: 12 },
  { category: "Filtered Coffee",  sub: "Flavoured",          maxDiscount: 0.30, packPrice: 21.0, boxCogs:  7.36, capsPerPack: 12 },
  { category: "Filtered Coffee",  sub: "Latte",              maxDiscount: 0.20, packPrice: 22.0, boxCogs:  8.75, capsPerPack: 12 },
  { category: "Tea & Infusions",  sub: "Classic",            maxDiscount: 0.40, packPrice: 18.0, boxCogs:  5.07, capsPerPack: 12 },
  { category: "Tea & Infusions",  sub: "Specialty",          maxDiscount: 0.30, packPrice: 22.0, boxCogs:  6.06, capsPerPack: 12 },
  { category: "Tea & Infusions",  sub: "Latte",              maxDiscount: 0.20, packPrice: 20.0, boxCogs:  6.27, capsPerPack: 12 },
  { category: "Juices & Cold",    sub: "Cold",               maxDiscount: 0.50, packPrice: 20.0, boxCogs:  4.96, capsPerPack: 12 },
  { category: "Juices & Cold",    sub: "Fresh Juice",        maxDiscount: 0.00, packPrice: 24.0, boxCogs: 15.60, capsPerPack: 12 },
  { category: "Functional",       sub: "Wellness Drink",     maxDiscount: 0.30, packPrice: 22.0, boxCogs:  7.31, capsPerPack: 12 },
  { category: "Functional",       sub: "Functional Coffee",  maxDiscount: 0.15, packPrice: 22.0, boxCogs:  8.99, capsPerPack: 12 },
];

// ── PRODUCT CATALOG HELPERS ──────────────────────────────────────────────────
// The live catalog (campaigns.product_catalog, synced from the commercial-master
// sheet) drives every product picker so price + COGS are selected, not typed.

const TYPE_LABEL: Record<CatalogProduct["product_type"], string> = {
  capsule: "Capsules", classic_coffee: "Classic Coffee", machine: "Machines", accessory: "Accessories",
};

/** Price + COGS for one sellable unit: a PACK for capsules (matching the
 *  builder's pack-level math), the item itself for everything else. */
function unitEconomics(p: CatalogProduct): { fullPrice: number; cogs: number } {
  if (p.product_type === "capsule" && p.caps_per_pack) {
    return { fullPrice: p.price_per_pack ?? 0, cogs: (p.total_cogs ?? 0) * p.caps_per_pack };
  }
  return { fullPrice: p.price_per_unit ?? p.price_per_pack ?? 0, cogs: p.total_cogs ?? 0 };
}

function productLabel(p: CatalogProduct): string {
  const name = p.name_en || p.sku;
  const sub = p.subcategory ? ` · ${p.subcategory}` : "";
  const { fullPrice } = unitEconomics(p);
  return `${name}${sub} (₾${fullPrice.toFixed(fullPrice < 10 ? 2 : 0)})`;
}

// A category·subcategory average row, computed live from the catalog.
interface CategoryAverage {
  key: string;          // "avg:Category|Subcategory" — distinct from any SKU
  label: string;
  category: string;
  subcategory: string;
  fullPrice: number;
  cogs: number;
  count: number;
}

/** Grouped product dropdown. `types` restricts which product kinds appear;
 *  groups are optgroups by category. When `aggregates` is given, a leading
 *  "Category averages" group lets the user calculate on a whole category.
 *  Value is the selected SKU or an "avg:" key ("" = none). */
function ProductSelect({ label, products, value, onChange, types, aggregates }: {
  label: string;
  products: CatalogProduct[];
  value: string;
  onChange: (key: string) => void;
  types?: CatalogProduct["product_type"][];
  aggregates?: CategoryAverage[];
}) {
  const pool = types ? products.filter(p => types.includes(p.product_type)) : products;
  const groups = useMemo<ComboGroup[]>(() => {
    const out: ComboGroup[] = [];
    if (aggregates && aggregates.length > 0) {
      out.push({
        label: "Category averages",
        options: aggregates.map(a => ({
          value: a.key,
          label: `${a.label} — avg of ${a.count} (₾${a.fullPrice.toFixed(a.fullPrice < 10 ? 2 : 0)})`,
        })),
      });
    }
    const m = new Map<string, CatalogProduct[]>();
    for (const p of pool) {
      const key = p.category || TYPE_LABEL[p.product_type] || "Other";
      (m.get(key) ?? m.set(key, []).get(key)!).push(p);
    }
    for (const [cat, items] of m) {
      out.push({ label: cat, options: items.map(p => ({ value: p.sku, label: productLabel(p) })) });
    }
    return out;
  }, [pool, aggregates]);

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium leading-4 text-[var(--color-text-secondary)]">{label}</span>
      <Combo value={value} onChange={onChange} groups={groups}
        placeholder={pool.length ? "— pick a product —" : "— catalog unavailable —"} />
    </label>
  );
}

// ── BUNDLE MARGIN CALCULATOR ─────────────────────────────────────────────────

interface BundleItem { id: number; name: string; fullPrice: number; cogs: number; qty: number; }

let _nextBundleId = 5;
const DEFAULT_ITEMS: BundleItem[] = [
  { id: 1, name: "Versatile Machine",         fullPrice: 399,  cogs: 268.60, qty: 1 },
  { id: 2, name: "Capsule Box (Multi Classic)",fullPrice: 20.5, cogs:   6.16, qty: 2 },
  { id: 3, name: "Metal Cup 280ml",           fullPrice: 35,   cogs:  16.22, qty: 1 },
  { id: 4, name: "Holder Round 18cm",         fullPrice: 20,   cogs:   9.17, qty: 1 },
];

function BundleCalc({ products, aggregates }: { products: CatalogProduct[]; aggregates: CategoryAverage[] }) {
  const [bundlePrice, setBundlePrice] = useState(399);
  const [items, setItems] = useState<BundleItem[]>(DEFAULT_ITEMS);
  const [monthlyCapMargin, setMonthlyCapMargin] = useState(30);
  const [pickSku, setPickSku] = useState("");

  function updateItem(id: number, field: keyof BundleItem, val: string) {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, [field]: field === "name" ? val : Number(val) } : i
    ));
  }

  function addFromCatalog(s: string) {
    if (s.startsWith("avg:")) {
      const a = aggregates.find(x => x.key === s);
      if (!a) return;
      setItems(prev => [...prev, {
        id: _nextBundleId++, name: `${a.label} (avg)`,
        fullPrice: Number(a.fullPrice.toFixed(2)), cogs: Number(a.cogs.toFixed(2)), qty: 1,
      }]);
      setPickSku("");
      return;
    }
    const p = products.find(x => x.sku === s);
    if (!p) return;
    const { fullPrice, cogs } = unitEconomics(p);
    setItems(prev => [...prev, {
      id: _nextBundleId++,
      name: p.name_en ? `${p.name_en}${p.subcategory ? ` · ${p.subcategory}` : ""}` : p.sku,
      fullPrice: Number(fullPrice.toFixed(2)), cogs: Number(cogs.toFixed(2)), qty: 1,
    }]);
    setPickSku("");  // reset so the same product can be added again
  }

  const totalCogs   = items.reduce((s, i) => s + i.cogs * i.qty, 0);
  const sumOfParts  = items.reduce((s, i) => s + i.fullPrice * i.qty, 0);
  const netBundle   = bundlePrice / (1 + GEO_VAT);
  const bundleMargin = netBundle > 0 ? (netBundle - totalCogs) / netBundle : 0;
  const valueToCustomer = sumOfParts - bundlePrice;
  // Corner cost = profit you forgo by discounting the PRIMARY item (the machine —
  // the priciest line) into the bundle, vs selling it standalone at full price.
  // Matches the Starter Bundles sheet: standalone_net_profit − bundle_net_profit.
  const primary = items.length ? items.reduce((a, b) => (b.fullPrice > a.fullPrice ? b : a)) : null;
  const standaloneNetProfit = primary ? (primary.fullPrice / (1 + GEO_VAT) - primary.cogs) * primary.qty : 0;
  const bundleNetProfit = netBundle - totalCogs;
  const cornerCost  = standaloneNetProfit - bundleNetProfit;
  const payback     = monthlyCapMargin > 0 && cornerCost > 0 ? cornerCost / monthlyCapMargin : null;
  const marginOk    = bundleMargin >= MARGIN_FLOOR;

  return (
    <Panel title="Bundle margin" sub="multi-SKU · payback">
      <div className="p-5">
        {/* items table */}
        <div className="mb-1 grid grid-cols-[2fr_1fr_1fr_40px_20px] gap-2">
          {["Item", "Full price ₾", "COGS ₾", "Qty", ""].map(h => (
            <span key={h} className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{h}</span>
          ))}
        </div>
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="grid grid-cols-[2fr_1fr_1fr_40px_20px] items-center gap-2">
              <input value={item.name} onChange={e => updateItem(item.id, "name", e.target.value)}
                className={controlCls} />
              <input type="number" value={item.fullPrice} onChange={e => updateItem(item.id, "fullPrice", e.target.value)}
                className={`tabular ${controlCls}`} />
              <input type="number" value={item.cogs} onChange={e => updateItem(item.id, "cogs", e.target.value)}
                className={`tabular ${controlCls}`} />
              <input type="number" value={item.qty} min={1} onChange={e => updateItem(item.id, "qty", e.target.value)}
                className={`tabular ${controlCls}`} />
              <button onClick={() => setItems(p => p.filter(i => i.id !== item.id))}
                className="flex h-10 items-center justify-center text-base leading-none text-[var(--color-text-tertiary)] hover:text-[var(--critical-600)]">×</button>
            </div>
          ))}
        </div>
        {/* add a bundle component straight from the live catalog */}
        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <ProductSelect label="Add product or category from catalog" products={products} aggregates={aggregates}
              value={pickSku} onChange={(s) => { setPickSku(s); addFromCatalog(s); }} />
          </div>
          <button onClick={() => setItems(p => [...p, { id: _nextBundleId++, name: "New item", fullPrice: 0, cogs: 0, qty: 1 }])}
            className={`whitespace-nowrap ${secondaryBtnCls}`}>
            + Blank row
          </button>
        </div>

        {/* bundle price + payback input */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-meama-charcoal pt-5">
          <Field label="Bundle price ₾" value={String(bundlePrice)} onChange={v => setBundlePrice(Number(v))} />
          <Field label="Monthly capsule margin / customer ₾" value={String(monthlyCapMargin)} onChange={v => setMonthlyCapMargin(Number(v))} />
        </div>

        {/* results */}
        <div className="mt-5 grid grid-cols-2 gap-px border border-meama-charcoal bg-meama-charcoal sm:grid-cols-4">
          {[
            { l: "Bundle net margin", v: formatPercent(bundleMargin),   cls: marginOk ? "text-meama-green" : "text-meama-red" },
            { l: "Total COGS",        v: formatGEL(totalCogs),           cls: "text-meama-brown" },
            { l: "Value to customer", v: formatGEL(valueToCustomer),     cls: "text-meama-blue" },
            { l: "Payback",           v: payback !== null ? `${payback.toFixed(1)} mo` : cornerCost <= 0 ? "none" : "—",
              cls: payback !== null && payback <= 6 ? "text-meama-green" : payback !== null ? "text-meama-muted" : "text-meama-green" },
          ].map(r => (
            <div key={r.l} className="bg-meama-ivory px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{r.l}</p>
              <p className={`tabular mt-1 font-display text-[20px] uppercase leading-none ${r.cls}`}>{r.v}</p>
            </div>
          ))}
        </div>
        {!marginOk && (
          <p className="mt-3 text-[12px] text-meama-red">
            Net margin {formatPercent(bundleMargin)} is below the 40% floor — raise bundle price or reduce COGS.
          </p>
        )}
        <p className="mt-3 text-[11px] text-meama-muted">
          Corner cost = profit foregone on the {primary ? `“${primary.name}”` : "machine"} vs. selling it at full price
          (net of VAT). Payback = corner cost ÷ monthly capsule margin per customer.
        </p>
      </div>
    </Panel>
  );
}

// ── CATEGORY DISCOUNT CEILINGS ───────────────────────────────────────────────

function CategoryCeilings({ aggregates }: { aggregates: CategoryAverage[] }) {
  // Ceilings are computed live (net of VAT) from the catalog category averages;
  // fall back to the static economics only when the catalog is unavailable.
  const subRows = aggregates.filter(a => a.subcategory); // exclude "· all" rollups
  const rows = subRows.length
    ? subRows.map(a => ({
        category: a.category, sub: a.subcategory || a.label,
        maxDiscount: calcMaxSafeDiscount(a.fullPrice, a.cogs),
      }))
    : CATEGORY_LIMITS.map(c => ({
        category: c.category, sub: c.sub,
        maxDiscount: calcMaxSafeDiscount(c.packPrice, c.boxCogs),
      }));
  return (
    <Panel title="Category discount ceilings" sub="live · net of VAT">
      <div className="divide-y divide-meama-charcoal">
        {rows.map(c => {
          const barPct = Math.round((Math.max(0, c.maxDiscount) / 0.5) * 100);
          return (
            <div key={`${c.category}-${c.sub}`} className="flex items-center gap-3 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-meama-brown">{c.sub}</p>
                <p className="font-mono text-[9px] uppercase text-meama-muted">{c.category}</p>
              </div>
              <div className="h-1 w-14 overflow-hidden bg-[var(--color-border)]">
                <div className="h-full bg-[var(--green-600)]" style={{ width: `${barPct}%` }} />
              </div>
              <span className={`tabular w-14 text-right font-mono text-[13px] font-medium ${
                c.maxDiscount <= 0 ? "text-meama-red" : c.maxDiscount >= 0.4 ? "text-meama-green" : "text-meama-brown"
              }`}>
                {c.maxDiscount <= 0 ? "NO DISC" : formatPercent(c.maxDiscount)}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── GIFT-WITH-PURCHASE COST ──────────────────────────────────────────────────

function GiftCalc({ products }: { products: CatalogProduct[] }) {
  const [mode, setMode] = useState<"gift" | "upsell">("gift");
  const [basketGross, setBasketGross] = useState(100);
  const [upsellOff, setUpsellOff] = useState(10); // flat ₾ off the accessory (sheet default)

  // Live accessories from the catalog; fall back to the static list if empty.
  const gifts = useMemo(() => {
    const live = products
      .filter(p => p.product_type === "accessory")
      .map(p => { const e = unitEconomics(p); return { name: p.name_en || p.sku, fullPrice: e.fullPrice, cogs: e.cogs }; });
    return live.length ? live : ACCESSORIES.map(a => ({ name: a.name, fullPrice: a.fullPrice, cogs: a.cogs }));
  }, [products]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const acc = gifts[Math.min(selectedIdx, gifts.length - 1)] ?? gifts[0];

  // Gift mode: accessory given free, costs only its COGS, hits the basket margin.
  const giftCost        = acc.cogs;
  const basketNet       = basketGross / (1 + GEO_VAT);
  const marginHitPct    = basketNet > 0 ? giftCost / basketNet : 0;
  const requiredMargin  = MARGIN_FLOOR + marginHitPct;
  // Upsell mode: accessory sold at a reduced price; margin is net of VAT at it.
  const upsellPrice     = Math.max(0, acc.fullPrice - upsellOff);
  const upsellMargin    = calcNetMargin(upsellPrice, acc.cogs);
  const upsellDiscount  = acc.fullPrice > 0 ? upsellOff / acc.fullPrice : 0;

  const giftCells = [
    { l: "Cost to gift",    v: formatGEL(giftCost),          cls: "text-meama-red" },
    { l: "Retail margin",   v: formatPercent(calcNetMargin(acc.fullPrice, acc.cogs)), cls: "text-meama-brown" },
    { l: "Margin hit",      v: formatPercent(marginHitPct),  cls: "text-meama-brown" },
    { l: "Required margin", v: formatPercent(requiredMargin), cls: requiredMargin <= 0.7 ? "text-meama-green" : "text-meama-muted" },
  ];
  const upsellCells = [
    { l: "Upsell price",    v: formatGEL(upsellPrice),        cls: "text-meama-brown" },
    { l: "₾ off",           v: formatGEL(upsellOff),          cls: "text-meama-blue" },
    { l: "Discount",        v: formatPercent(upsellDiscount), cls: "text-meama-brown" },
    { l: "Margin at upsell",v: formatPercent(upsellMargin),   cls: upsellMargin >= MARGIN_FLOOR ? "text-meama-green" : "text-meama-red" },
  ];
  const cells = mode === "gift" ? giftCells : upsellCells;

  return (
    <Panel title="Accessory upsell & gift" sub="upsell price · gift COGS">
      <div className="p-5">
        <div className="mb-4 inline-flex border border-meama-charcoal text-[11px]">
          {(["gift", "upsell"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 font-mono uppercase tracking-widest ${mode === m ? "bg-meama-brown text-meama-ivory" : "text-meama-muted"}`}>
              {m === "gift" ? "Gift" : "Upsell"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{mode === "gift" ? "Accessory to gift" : "Accessory to upsell"}</span>
            <Combo value={String(selectedIdx)} onChange={v => setSelectedIdx(Number(v))}
              groups={[{ options: gifts.map((a, i) => ({ value: String(i), label: `${a.name} (₾${a.fullPrice.toFixed(a.fullPrice < 10 ? 2 : 0)})` })) }]} />
          </label>
          {mode === "gift"
            ? <Field label="Basket size (order value) ₾" value={String(basketGross)} onChange={v => setBasketGross(Number(v))} />
            : <Field label="Accessory ₾ off" value={String(upsellOff)} onChange={v => setUpsellOff(Number(v))} />}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-px border border-meama-charcoal bg-meama-charcoal sm:grid-cols-4">
          {cells.map(r => (
            <div key={r.l} className="bg-meama-ivory px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{r.l}</p>
              <p className={`tabular mt-1 font-display text-[20px] uppercase leading-none ${r.cls}`}>{r.v}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-meama-muted">
          {mode === "gift" ? (
            <>Margin hit = gift COGS ÷ basket net revenue. Basket products must carry at least{" "}
            <span className="text-meama-brown">{formatPercent(requiredMargin)}</span> net margin to land at 40% overall.</>
          ) : (
            <>Selling the accessory at a reduced price (not free). Margin is net of VAT at the upsell price —
            keep it above the 40% floor.</>
          )}
        </p>
      </div>
    </Panel>
  );
}

// ── MEAMA MIX (capsule volume reward) ────────────────────────────────────────
// Flat-₾-off any capsule basket, tiered. NOT the bundle calc — adds per-cup,
// effective-discount % and a margin-floor verdict.
const MIX_TIERS = [
  { name: "Mix 4", caps: 46, flat: 15 },
  { name: "Mix 6", caps: 69, flat: 25 },
  { name: "Mix 8", caps: 92, flat: 40 },
];

function MixCalc({ products }: { products: CatalogProduct[] }) {
  // Blended per-cup economics from the live catalog (fallback to sheet blended avg).
  const blended = useMemo(() => {
    const caps = products.filter(p => p.product_type === "capsule" && p.caps_per_pack);
    if (!caps.length) return { price: 1.72, cogs: 0.65 };
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const price = mean(caps.map(p => p.price_per_unit ?? (p.price_per_pack ?? 0) / (p.caps_per_pack || 1)));
    const cogs = mean(caps.map(p => p.total_cogs ?? 0));
    return { price: price || 1.72, cogs: cogs || 0.65 };
  }, [products]);

  const [tierIdx, setTierIdx] = useState(1);
  const [pricePerCup, setPricePerCup] = useState(1.72);
  const [cogsPerCup, setCogsPerCup] = useState(0.65);
  useEffect(() => {
    setPricePerCup(Number(blended.price.toFixed(2)));
    setCogsPerCup(Number(blended.cogs.toFixed(2)));
  }, [blended]);

  const tier = MIX_TIERS[tierIdx];
  const basket = tier.caps * pricePerCup;
  const youPay = Math.max(0, basket - tier.flat);
  const perCup = tier.caps > 0 ? youPay / tier.caps : 0;
  const effDiscount = basket > 0 ? tier.flat / basket : 0;
  const basketCogs = tier.caps * cogsPerCup;
  const netYouPay = youPay / (1 + GEO_VAT);
  const blendedMargin = netYouPay > 0 ? (netYouPay - basketCogs) / netYouPay : 0;
  const floorOk = blendedMargin >= MARGIN_FLOOR;

  return (
    <Panel title="MEAMA Mix" sub="capsule tiers · flat ₾ off">
      <div className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">Tier</span>
            <StyledSelect value={tierIdx} onChange={e => setTierIdx(Number(e.target.value))}>
              {MIX_TIERS.map((tr, i) => <option key={tr.name} value={i}>{tr.name} · {tr.caps} caps · −₾{tr.flat}</option>)}
            </StyledSelect>
          </label>
          <Field label="Price / cup ₾" value={String(pricePerCup)} onChange={v => setPricePerCup(Number(v))} />
          <Field label="Blended COGS / cup ₾" value={String(cogsPerCup)} onChange={v => setCogsPerCup(Number(v))} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-px border border-meama-charcoal bg-meama-charcoal sm:grid-cols-3">
          {[
            { l: "Avg basket",     v: formatGEL(basket),         cls: "text-meama-brown" },
            { l: "You pay",        v: formatGEL(youPay),         cls: "text-meama-blue" },
            { l: "Per cup",        v: formatGEL(perCup),         cls: "text-meama-brown" },
            { l: "Eff. discount",  v: formatPercent(effDiscount),cls: "text-meama-brown" },
            { l: "Blended margin", v: formatPercent(blendedMargin), cls: floorOk ? "text-meama-green" : "text-meama-red" },
            { l: "Floor",          v: floorOk ? "OK" : "⚠ THIN", cls: floorOk ? "text-meama-green" : "text-meama-red" },
          ].map(r => (
            <div key={r.l} className="bg-meama-ivory px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-meama-muted">{r.l}</p>
              <p className={`tabular mt-1 font-display text-[20px] uppercase leading-none ${r.cls}`}>{r.v}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-meama-muted">
          Always-on consumer reward, one deal per order. Effective discount stays under the 25% B2B entry point;
          blended margin (net of VAT) must hold the 40% floor.
        </p>
      </div>
    </Panel>
  );
}

// ── B2B WHOLESALE (gated channel; never combines with B2C) ────────────────────

function B2BCalc({ products, aggregates }: { products: CatalogProduct[]; aggregates: CategoryAverage[] }) {
  const capRows = aggregates.map(a => ({
    label: a.label,
    mUnder: calcNetMargin(a.fullPrice * (1 - B2B_CAP_DISCOUNT_UNDER), a.cogs),
    mOver: calcNetMargin(a.fullPrice * (1 - B2B_CAP_DISCOUNT_OVER), a.cogs),
  }));
  const accRows = useMemo(() => {
    const src = products.filter(p => p.product_type === "accessory")
      .map(p => { const e = unitEconomics(p); return { name: p.name_en || p.sku, full: e.fullPrice, cogs: e.cogs }; });
    const list = src.length ? src : ACCESSORIES.map(a => ({ name: a.name, full: a.fullPrice, cogs: a.cogs }));
    return list.map(a => {
      const price = a.full * (1 - B2B_ACCESSORY_DISCOUNT);
      return { name: a.name, price, margin: calcNetMargin(price, a.cogs) };
    });
  }, [products]);

  const marginCls = (m: number) => (m >= MARGIN_FLOOR ? "text-meama-green" : "text-meama-red");

  return (
    <Panel title="B2B wholesale" sub="gated · net of VAT">
      <div className="p-5">
        <p className="mb-3 font-mono text-[9px] uppercase tracking-widest text-meama-muted">
          Capsules — {(B2B_CAP_DISCOUNT_UNDER * 100).toFixed(0)}% under {B2B_CAP_TIER_THRESHOLD} caps · {(B2B_CAP_DISCOUNT_OVER * 100).toFixed(0)}% at/over
        </p>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-x-3 gap-y-1.5 text-[12px]">
          <span className="font-mono text-[9px] uppercase text-meama-muted">Category</span>
          <span className="text-right font-mono text-[9px] uppercase text-meama-muted">&lt;500</span>
          <span className="text-right font-mono text-[9px] uppercase text-meama-muted">500+</span>
          {capRows.map(r => (
            <Fragment key={r.label}>
              <span className="truncate text-meama-brown">{r.label}</span>
              <span className={`tabular text-right font-medium ${marginCls(r.mUnder)}`}>{formatPercent(r.mUnder)}</span>
              <span className={`tabular text-right font-medium ${marginCls(r.mOver)}`}>{formatPercent(r.mOver)}</span>
            </Fragment>
          ))}
          {!capRows.length && <span className="col-span-3 text-meama-muted">— catalog unavailable —</span>}
        </div>

        <p className="mb-2 mt-5 font-mono text-[9px] uppercase tracking-widest text-meama-muted">
          Accessories — {(B2B_ACCESSORY_DISCOUNT * 100).toFixed(0)}% wholesale · machines = ecom
        </p>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-x-3 gap-y-1.5 text-[12px]">
          {accRows.map(r => (
            <Fragment key={r.name}>
              <span className="truncate text-meama-brown">{r.name}</span>
              <span className="tabular text-right text-meama-brown">{formatGEL(r.price)}</span>
              <span className={`tabular text-right font-medium ${marginCls(r.margin)}`}>{formatPercent(r.margin)}</span>
            </Fragment>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-meama-muted">
          Registered business accounts + minimum order only. A separate price list — never combined with any
          B2C offer (Mix, gifts, codes).
        </p>
      </div>
    </Panel>
  );
}

function CalculatorTab() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [sku, setSku] = useState("CAP-CLS-05");
  const [fullPrice, setFullPrice] = useState(20.5);
  const [cogs, setCogs] = useState(6.16);
  const [discount, setDiscount] = useState(15);
  const [result, setResult] = useState<PromoResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);

  const [audience, setAudience] = useState(417);
  const [convRate, setConvRate] = useState(34);
  const [units, setUnits] = useState(2);

  useEffect(() => { void fetchCatalogProducts().then(setProducts); }, []);

  // Live category·subcategory averages (consumables only) for the picker.
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

  // Per-subcategory averages (mean over the SKUs in that subcategory) — used by
  // the ceilings reference panel for per-subcategory detail.
  const subAverages = useMemo<CategoryAverage[]>(() => {
    const groups = new Map<string, { category: string; subcategory: string; items: CatalogProduct[] }>();
    for (const p of products) {
      if (p.product_type !== "capsule" && p.product_type !== "classic_coffee") continue;
      const category = p.category || "Other";
      const subcategory = p.subcategory || "";
      const key = `${category}|${subcategory}`;
      if (!groups.has(key)) groups.set(key, { category, subcategory, items: [] });
      groups.get(key)!.items.push(p);
    }
    return [...groups.values()].map(g => {
      const econ = g.items.map(unitEconomics);
      return {
        key: `avg:${g.category}|${g.subcategory}`,
        label: `${g.category}${g.subcategory ? ` · ${g.subcategory}` : ""}`,
        category: g.category, subcategory: g.subcategory,
        fullPrice: mean(econ.map(e => e.fullPrice)),
        cogs: mean(econ.map(e => e.cogs)),
        count: g.items.length,
      };
    });
  }, [products]);

  // Whole-category averages = unweighted mean of the subcategory averages,
  // matching the sheet's per-category "Averages" row. This is what the product
  // pickers offer (one average per category).
  const aggregates = useMemo<CategoryAverage[]>(() => {
    const byCat = new Map<string, CategoryAverage[]>();
    for (const s of subAverages) (byCat.get(s.category) ?? byCat.set(s.category, []).get(s.category)!).push(s);
    return [...byCat.entries()].map(([category, subs]) => ({
      key: `avg:${category}|`,
      label: category,
      category, subcategory: "",
      fullPrice: mean(subs.map(s => s.fullPrice)),
      cogs: mean(subs.map(s => s.cogs)),
      count: subs.reduce((n, s) => n + s.count, 0),
    })).sort((a, b) => a.category.localeCompare(b.category));
  }, [subAverages]);

  // Margin-safe discount ceiling for the CURRENT inputs (net of VAT, uncapped).
  const ceiling = calcMaxSafeDiscount(fullPrice, cogs);

  function handleSelect(key: string) {
    setSelectedSku(key);
    if (key.startsWith("avg:")) {
      const a = aggregates.find(x => x.key === key);
      if (!a) return;
      setFullPrice(Number(a.fullPrice.toFixed(2)));
      setCogs(Number(a.cogs.toFixed(2)));
      setSku(`${a.label} (avg)`);
      return;
    }
    const p = products.find(x => x.sku === key);
    if (!p) return;
    const { fullPrice: fp, cogs: cg } = unitEconomics(p);
    setFullPrice(Number(fp.toFixed(2)));
    setCogs(Number(cg.toFixed(2)));
    setSku(p.name_en ? `${p.name_en} (${p.sku})` : p.sku);
  }

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
    const revenue = unitsSold * discountedPrice;                       // gross GEL (incl. VAT)
    const netRevenue = revenue / (1 + GEO_VAT);                        // ex-VAT
    const promoCost = unitsSold * (fullPrice - discountedPrice);       // discount value gross
    const grossProfit = netRevenue - unitsSold * cogs;                 // net profit
    const roi = promoCost > 0 ? grossProfit / (promoCost / (1 + GEO_VAT)) : null;
    const marginAfter = calcNetMargin(discountedPrice, cogs);
    return { converters, revenue, promoCost, grossProfit, roi, marginAfter };
  }, [fullPrice, cogs, discount, audience, convRate, units]);

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* margin safety */}
        <Panel title="Promotion builder" sub="margin safety · live">
          <div className="p-5">
            {/* product / category selector — live catalog auto-fills price & COGS */}
            <div className="mb-4">
              <ProductSelect label="Product or category avg (auto-fills price &amp; COGS)"
                products={products} aggregates={aggregates} value={selectedSku} onChange={handleSelect} />
            </div>
            {fullPrice > 0 && (
              <div className="mb-4 flex items-center justify-between border border-dashed border-meama-charcoal px-3 py-2 text-[11px]">
                <span className="text-meama-muted">Margin-safe ceiling</span>
                <span className={`tabular font-mono font-medium ${ceiling <= 0 ? "text-meama-red" : "text-meama-brown"}`}>
                  {ceiling <= 0 ? "NO DISCOUNT" : `≤ ${(ceiling * 100).toFixed(0)}%`}
                </span>
                {ceiling > 0 && (
                  <Badge tone={discount / 100 > ceiling ? "red" : "green"}>
                    {discount / 100 > ceiling ? "ABOVE CEILING" : "WITHIN CEILING"}
                  </Badge>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="SKU / name" type="text" value={sku} onChange={setSku} />
              <Field label="Full price ₾" value={String(fullPrice)} onChange={(v) => setFullPrice(Number(v))} />
              <Field label="COGS ₾" value={String(cogs)} onChange={(v) => setCogs(Number(v))} />
              <Field label="Discount %" value={String(discount)} onChange={(v) => setDiscount(Number(v))} />
            </div>
            <button onClick={() => void calculate()} disabled={loading}
              className={`mt-5 w-full ${primaryBtnCls}`}>
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
              not a forecast model. Promo cost is the gross discount given; ROI = net profit ÷ discount spend
              (both ex-VAT). Margin safety (left) is the binding business rule.
            </p>
          </div>
        </Panel>
      </div>

      {/* Bundle margin + payback */}
      <div className="mt-5">
        <BundleCalc products={products} aggregates={aggregates} />
      </div>

      {/* MEAMA Mix + B2B wholesale */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MixCalc products={products} />
        <B2BCalc products={products} aggregates={aggregates} />
      </div>

      {/* Category ceilings + gift calculator */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CategoryCeilings aggregates={subAverages} />
        <GiftCalc products={products} />
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
      <span className="text-[12px] font-medium leading-4 text-[var(--color-text-secondary)]">{label}</span>
      <StyledSelect value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{channelLabel(o) !== "—" && CHANNELS.includes(o as typeof CHANNELS[number]) ? channelLabel(o) : o}</option>)}
      </StyledSelect>
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
      <div className="absolute inset-0 bg-[var(--color-overlay)]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-pop">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-[18px]">
          <h2 className="text-[20px] font-semibold leading-[26px] tracking-[-0.01em] text-[var(--color-text)]">Add campaign</h2>
          <button onClick={onClose} aria-label="Close"
            className="flex h-10 w-10 items-center justify-center border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--gray-50)] hover:text-[var(--color-text)] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium leading-4 text-[var(--color-text-secondary)]">Campaign name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring win-back"
              className={controlCls} />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium leading-4 text-[var(--color-text-secondary)]">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className={`tabular ${controlCls}`} />
            </label>
            <ModalSelect label="Channel" value={channel} onChange={setChannel} options={CHANNELS} />
            <ModalSelect label="Type" value={type} onChange={setType} options={TYPES} />
            {showDiscount ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium leading-4 text-[var(--color-text-secondary)]">Discount %</span>
                <input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="optional"
                  className={`tabular ${controlCls}`} />
              </label>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium leading-4 text-[var(--color-text-secondary)]">Segment</span>
                <input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="optional"
                  className={controlCls} />
              </label>
            )}
          </div>

          {showDiscount && (
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-[12px] font-medium leading-4 text-[var(--color-text-secondary)]">Segment</span>
              <input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="optional"
                className={controlCls} />
            </label>
          )}

          {error && (
            <p className="mt-3 border border-[var(--critical-500)] border-l-[3px] border-l-[var(--critical-600)] bg-[var(--critical-50)] px-3 py-2 text-[12px] text-[var(--critical-600)]">{error}</p>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button onClick={() => void submit()} disabled={!valid || saving}
              className={primaryBtnCls}>
              {saving ? "Saving…" : "Add to calendar →"}
            </button>
            <button onClick={onClose} disabled={saving}
              className={secondaryBtnCls}>
              Cancel
            </button>
          </div>
          <p className="mt-4 text-[12px] leading-4 text-[var(--color-text-tertiary)]">
            Saved to the database as a <span className="text-[var(--color-text)]">draft</span> campaign (origin: manual).
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

const CAL_BAR_TONE: Record<string, string> = {
  green: "border-[var(--success-500)] bg-[var(--success-50)] text-[var(--success-600)]",
  blue:  "border-[var(--info-500)] bg-[var(--info-50)] text-[var(--info-600)]",
  gold:  "border-[var(--warning-500)] bg-[var(--warning-50)] text-[var(--warning-600)]",
  red:   "border-[var(--critical-500)] bg-[var(--critical-50)] text-[var(--critical-600)]",
  muted: "border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)]",
};

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateOnly(iso: string | null | undefined) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function clampDate(d: Date, min: Date, max: Date) {
  if (d < min) return min;
  if (d > max) return max;
  return d;
}

function CalendarTab({ campaigns, onSelect, onAdd }: {
  campaigns: CampaignSummary[]; onSelect: (c: CampaignSummary) => void; onAdd: (c: CampaignSummary) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [adding, setAdding] = useState(false);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = dateKey(now);

  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month, daysInMonth);

  const calendarEvents = useMemo(() => {
    return campaigns
      .map((c) => {
        const fallback = parseDateOnly(c.launched_at ?? c.scheduled_at);
        const start = parseDateOnly(c.valid_from) ?? fallback;
        const end = parseDateOnly(c.valid_to) ?? start;
        if (!start || !end || end < monthStart || start > monthEnd) return null;
        return {
          campaign: c,
          start: clampDate(start, monthStart, monthEnd),
          end: clampDate(end, monthStart, monthEnd),
        };
      })
      .filter((e): e is { campaign: CampaignSummary; start: Date; end: Date } => Boolean(e))
      .sort((a, b) => {
        const byStart = a.start.getTime() - b.start.getTime();
        if (byStart !== 0) return byStart;
        return b.end.getTime() - a.end.getTime();
      });
  }, [campaigns, monthEnd.getTime(), monthStart.getTime()]);

  const monthLabel = new Date(year, month).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const monthTotal = calendarEvents.length;

  function shift(delta: number) {
    const m = month + delta;
    if (m < 0) { setYear((y) => y - 1); setMonth(11); }
    else if (m > 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth(m);
  }

  const navBtn = "flex h-10 w-10 items-center justify-center border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--gray-50)] hover:text-[var(--color-text)] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none";
  const defaultDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(now.getDate(), daysInMonth)).padStart(2, "0")}`;

  return (
    <Panel title="Campaign calendar" sub={`${monthTotal} this month`}>
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button className={navBtn} onClick={() => shift(-1)}>←</button>
            <span className="text-[24px] font-semibold leading-[30px] tracking-[-0.01em] text-[var(--color-text)]">{monthLabel}</span>
            <button className={navBtn} onClick={() => shift(1)}>→</button>
          </div>
          <button onClick={() => setAdding(true)}
            className={primaryBtnCls}>
            + Add campaign
          </button>
        </div>
        {adding && <AddCampaignModal defaultDate={defaultDate} onAdd={onAdd} onClose={() => setAdding(false)} />}
        <div className="mb-1 grid grid-cols-7">
          {DOW.map((d) => <div key={d} className="py-1 text-center text-[12px] font-medium leading-4 text-[var(--color-text-tertiary)]">{d}</div>)}
        </div>
        <div className="space-y-1">
          {weeks.map((week, wi) => {
            const weekDays = week
              .map((day, di) => day === null ? null : { day, index: di, date: new Date(year, month, day) })
              .filter((d): d is { day: number; index: number; date: Date } => Boolean(d));
            const weekStart = weekDays[0]?.date;
            const weekEnd = weekDays[weekDays.length - 1]?.date;
            const spans = weekStart && weekEnd
              ? calendarEvents
                .map((event) => {
                  if (event.end < weekStart || event.start > weekEnd) return null;
                  const start = clampDate(event.start, weekStart, weekEnd);
                  const end = clampDate(event.end, weekStart, weekEnd);
                  const colStart = start.getDay() + 1;
                  const colSpan = end.getDay() - start.getDay() + 1;
                  return { ...event, colStart, colSpan };
                })
                .filter((s): s is { campaign: CampaignSummary; start: Date; end: Date; colStart: number; colSpan: number } => Boolean(s))
              : [];
            const visibleSpans = spans.slice(0, 4);

            return (
              <div key={wi} className="relative">
                <div className="grid grid-cols-7 gap-1">
                  {week.map((day, di) => {
                    if (day === null) return <div key={di} className="min-h-[96px] bg-[var(--color-surface-sunken)]/50" />;
                    const dateStr = dateKey(new Date(year, month, day));
                    const isToday = dateStr === todayStr;
                    return (
                      <div key={di} className={`min-h-[96px] border p-1.5 ${isToday ? "border-[var(--green-600)] bg-[var(--signal-100)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
                        <span className={`block font-mono text-[12px] font-semibold ${isToday ? "text-[var(--color-text)]" : "text-[var(--color-text-tertiary)]"}`}>{day}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="pointer-events-none absolute inset-x-0 top-7 grid grid-cols-7 gap-1 px-0">
                  {visibleSpans.map((span, lane) => (
                    <button
                      key={`${span.campaign.id}-${lane}-${span.colStart}`}
                      title={`${span.campaign.name} · ${fmtDate(span.start.toISOString())} → ${fmtDate(span.end.toISOString())}`}
                      onClick={() => onSelect(span.campaign)}
                      style={{ gridColumn: `${span.colStart} / span ${span.colSpan}`, gridRow: lane + 1 }}
                      className={`pointer-events-auto h-5 min-w-0 truncate border px-2 text-left text-[12px] font-semibold leading-5 transition-opacity hover:opacity-75 ${CAL_BAR_TONE[statusTone(span.campaign.status)]}`}
                    >
                      {span.campaign.name}
                    </button>
                  ))}
                </div>
                {spans.length > visibleSpans.length && (
                  <span className="absolute bottom-1 left-2 font-mono text-[11px] text-[var(--color-text-tertiary)]">+{spans.length - visibleSpans.length} more</span>
                )}
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
        return <rect key={d.date} x={i * (barW + gap)} y={H - h} width={barW} height={h} fill="var(--info-600)" opacity="0.6" />;
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
          { l: "Spend · 30d", v: formatGEL0(ov.total_spend_usd), cls: "text-meama-brown" },
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
              <span>avg {formatGEL(ov.daily_trend.reduce((s, d) => s + d.spend_usd, 0) / ov.daily_trend.length)}/day</span>
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
                        <td className="tabular px-4 py-2.5 text-right text-meama-brown">{formatGEL0(c.spend_usd)}</td>
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

// ── EDIT PROMOTIONS (toggle active status) ───────────────────────────────────

function Toggle({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      role="switch"
      aria-checked={on}
      className={`relative h-5 w-9 shrink-0 border transition-colors disabled:opacity-50 ${
        on ? "border-meama-green bg-meama-green/20" : "border-meama-charcoal bg-meama-roast"
      }`}
      title={on ? "Active — click to turn off" : "Off — click to set active"}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 transition-all ${
          on ? "left-[18px] bg-meama-green" : "left-0.5 bg-meama-muted"
        }`}
      />
    </button>
  );
}

function EditPromotionsTab({
  campaigns,
  onToggle,
}: {
  campaigns: CampaignSummary[];
  onToggle: (id: string, status: "active" | "completed") => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeCount = campaigns.filter((c) => c.status === "active").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...campaigns].sort((a, b) => {
      const aOn = a.status === "active" ? 0 : 1;
      const bOn = b.status === "active" ? 0 : 1;
      return aOn - bOn || a.name.localeCompare(b.name);
    });
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.shopify_code ?? "").toLowerCase().includes(q),
      );
    }
    if (onlyActive) list = list.filter((c) => c.status === "active");
    return list;
  }, [campaigns, query, onlyActive]);

  async function toggle(c: CampaignSummary) {
    const next = c.status === "active" ? "completed" : "active";
    setBusy(c.id);
    setError(null);
    try {
      await onToggle(c.id, next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Edit promotions" sub={`${activeCount} active · ${campaigns.length} total`}>
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3 border-b border-meama-charcoal px-5 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or code…"
          className={`min-w-[200px] flex-1 ${controlCls}`}
        />
        <button
          onClick={() => setOnlyActive((v) => !v)}
          className={`h-10 border px-4 text-sm font-semibold transition-colors focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none ${
            onlyActive
              ? "border-[var(--success-500)] bg-[var(--success-50)] text-[var(--success-600)]"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--gray-50)] hover:text-[var(--color-text)]"
          }`}
        >
          Active only
        </button>
      </div>

      {error && (
        <div className="border-b border-meama-red/40 bg-meama-red/8 px-5 py-2 text-[12px] text-meama-red">
          {error}
        </div>
      )}

      <div className="max-h-[60vh] overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-5 py-4 text-sm text-meama-muted">No promotions match.</p>
        )}
        {filtered.map((c) => {
          const on = c.status === "active";
          const eff = effectiveStatus(c);
          return (
            <div
              key={c.id}
              className="flex items-center gap-4 border-b border-meama-charcoal px-5 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-meama-brown">{c.name}</div>
                <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-meama-muted">
                  {channelLabel(c.channel)}
                  {c.shopify_code ? ` · ${c.shopify_code}` : ""}
                  {c.promo_type ? ` · ${c.promo_type}` : ""}
                </div>
              </div>
              {eff === "EXPIRED" && on && (
                <span className="font-mono text-[9px] uppercase tracking-wider text-meama-red" title="Past end date overrides — shows as expired">
                  date-expired
                </span>
              )}
              <span className="w-20 text-right font-mono text-[10px] uppercase tracking-wider text-meama-muted">
                {busy === c.id ? "saving…" : on ? "active" : "off"}
              </span>
              <Toggle on={on} busy={busy === c.id} onClick={() => void toggle(c)} />
            </div>
          );
        })}
      </div>
      <p className="border-t border-meama-charcoal px-5 py-3 text-[11px] leading-relaxed text-meama-muted">
        Toggling writes <span className="text-meama-brown">campaigns.status</span> in Supabase
        (active ⟷ completed). The "Active campaigns" KPI and Overview filters update immediately.
      </p>
    </Panel>
  );
}

// ── tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }: {
  tabs: { id: string; label: string; badge?: number }[]; active: string; onChange: (id: string) => void;
}) {
  return (
    <div className="mb-6 flex min-h-11 flex-wrap gap-1 border-b border-[var(--color-border)]">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`relative -mb-px flex h-11 items-center gap-2 px-3 text-sm font-semibold transition-colors ${
            active === t.id
              ? "text-[var(--color-text)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[var(--green-600)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--gray-50)] hover:text-[var(--color-text)]"
          }`}>
          {t.label}
          {t.badge ? <span className="bg-[var(--signal-500)] px-1.5 font-mono text-[10px] font-semibold text-[var(--gray-900)]">{t.badge}</span> : null}
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

  async function toggleCampaignStatus(id: string, status: "active" | "completed") {
    const updated = await setCampaignStatus(id, status);
    setCampaigns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: updated.status } : c)),
    );
  }

  const active = campaigns.filter((c) => effectiveStatus(c) === "ACTIVE").length;
  // KPI cards are month-to-date: sum/average each campaign's MTD figures only.
  const totalRev = campaigns.reduce((s, c) => s + (c.revenue_mtd ?? 0), 0);
  const withRoi = campaigns.filter((c) => c.roi_mtd !== null);
  const avgRoi = withRoi.length ? withRoi.reduce((s, c) => s + (c.roi_mtd ?? 0), 0) / withRoi.length : null;
  const pendingCount = campaigns.filter((c) => c.status === "draft" || c.status === "pending_approval").length;

  return (
    <div className="text-[var(--color-text)]">
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
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Active campaigns" value={String(active)} foot="running now" footTone="up" />
            <Kpi label="Attributed revenue" value={formatGEL0(totalRev)} foot="month-to-date" footTone="flat" />
            <Kpi label="Avg rev / disc" value={avgRoi !== null ? `${avgRoi.toFixed(1)}×` : "—"} foot="revenue ÷ discount · MTD" footTone="flat" />
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
                  { id: "edit", label: "Edit" },
                ]}
                active={promoTab}
                onChange={(id) => setPromoTab(id as PromoTab)}
              />
              {promoTab === "calculator" && <CalculatorTab />}
              {promoTab === "calendar" && <CalendarTab campaigns={campaigns} onSelect={setSelected} onAdd={addCampaign} />}
              {promoTab === "plan" && <PlanTab campaigns={campaigns} onSelect={setSelected} />}
              {promoTab === "edit" && <EditPromotionsTab campaigns={campaigns} onToggle={toggleCampaignStatus} />}
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
