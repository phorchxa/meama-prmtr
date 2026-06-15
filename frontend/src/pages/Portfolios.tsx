import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge, type BadgeTone } from "../components/Badge";
import { Skeleton } from "../components/Skeleton";
import { formatGEL, formatGEL0, formatNumber, tbilisiDate } from "../lib/format";
import {
  fetchPortfolio,
  fetchPortfolios,
  type CustomerSegment,
  type ListParams,
  type PortfolioDetail,
  type PortfolioSummary,
} from "../lib/portfoliosApi";
import { PageHeader } from "./PageHeader";

// ─── Design-token helpers ───────────────────────────────────────────────────

const SEGMENT_META: Record<
  CustomerSegment,
  { label: string; labelKa: string; tone: BadgeTone }
> = {
  loyalist:    { label: "Loyalist",    labelKa: "ლოიალური",    tone: "green" },
  at_risk:     { label: "At Risk",     labelKa: "რისკის ქვეშ", tone: "gold"  },
  lapsed:      { label: "Lapsed",      labelKa: "გათიშული",    tone: "red"   },
  new_machine: { label: "New Machine", labelKa: "ახალი მანქ.", tone: "blue"  },
  active:      { label: "Active",      labelKa: "აქტიური",     tone: "green" },
};

const SOURCE_LABEL: Record<string, string> = {
  web:            "E-commerce",
  pos:            "Brand store",
  "195189899265": "App",
};

const CHANNEL_LABEL: Record<string, string> = {
  online:   "E-com",
  in_store: "Store",
  app:      "App",
  mixed:    "Mixed",
};

function healthColor(score: number): string {
  if (score >= 70) return "bg-meama-green";
  if (score >= 40) return "bg-meama-gold";
  return "bg-meama-red";
}

function healthTextColor(score: number): string {
  if (score >= 70) return "text-meama-green";
  if (score >= 40) return "text-meama-gold";
  return "text-meama-red";
}

function activityColor(days: number): string {
  if (days < 20) return "bg-meama-green";
  if (days < 45) return "bg-meama-gold";
  return "bg-meama-red";
}

function rfmScore(days: number, orders: number, spend: number): { r: number; f: number; m: number } {
  const r = days < 20 ? 5 : days < 45 ? 4 : days < 60 ? 3 : days < 90 ? 2 : 1;
  const f = orders >= 15 ? 5 : orders >= 8 ? 4 : orders >= 4 ? 3 : orders >= 2 ? 2 : 1;
  const m = spend >= 5000 ? 5 : spend >= 2000 ? 4 : spend >= 800 ? 3 : spend >= 200 ? 2 : 1;
  return { r, f, m };
}

// ─── Pill filter ────────────────────────────────────────────────────────────

function PillFilter({
  active,
  onClick,
  children,
  separator = false,
}: {
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  separator?: boolean;
}) {
  if (separator)
    return <span className="mx-1 select-none text-meama-muted/30">─</span>;
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? "border-meama-gold bg-meama-gold text-meama-espresso"
          : "border-meama-gold/25 bg-transparent text-meama-cream/70 hover:border-meama-gold/60"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Health bar ─────────────────────────────────────────────────────────────

function HealthBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 overflow-hidden rounded-full bg-meama-brown/10 h-1.5">
        <div
          className={`h-full rounded-full transition-all ${healthColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`tabular text-[11px] font-bold w-7 text-right ${healthTextColor(score)}`}>
        {score}
      </span>
    </div>
  );
}

// ─── Promo bar ───────────────────────────────────────────────────────────────

function PromoBar({ fullPriceSpend, promoSpend, totalSpend }: {
  fullPriceSpend: number;
  promoSpend: number;
  totalSpend: number;
}) {
  if (totalSpend <= 0) return null;
  const fullPct  = Math.round((fullPriceSpend / totalSpend) * 100);
  const promoPct = Math.round((promoSpend    / totalSpend) * 100);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-meama-brown/10">
      <div className="bg-meama-green h-full" style={{ width: `${fullPct}%` }} />
      <div className="bg-meama-gold  h-full" style={{ width: `${promoPct}%` }} />
    </div>
  );
}

// ─── Customer Card ───────────────────────────────────────────────────────────

function CustomerCard({
  c,
  ka,
  onOpen,
}: {
  c: PortfolioSummary;
  ka: boolean;
  onOpen: (id: number) => void;
}) {
  const seg  = SEGMENT_META[c.segment] ?? SEGMENT_META.active;
  const days = c.days_since_last_order ?? 0;
  const activityPct = Math.min(100, (days / 90) * 100);
  const promoSharePct = Math.round(c.promo_share * 100);
  const joinedDate = c.customer_created_at ? tbilisiDate(c.customer_created_at) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(c.shopify_customer_id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(c.shopify_customer_id)}
      className="card-m card-m-hover cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-meama-gold"
    >
      {/* pc-top: avatar + name + LTV */}
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-meama-brown font-display text-sm font-bold text-meama-goldsoft">
          {c.initials || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-base font-semibold text-meama-brown leading-tight">
              {c.full_name?.trim() || `#${c.shopify_customer_id}`}
            </h3>
            <span className="ml-auto shrink-0 tabular text-sm font-extrabold text-meama-brown">
              {formatGEL0(c.total_spend)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <Badge tone={seg.tone}>{ka ? seg.labelKa : seg.label}</Badge>
            {joinedDate && (
              <span className="text-[10px] text-meama-muted">· joined {joinedDate}</span>
            )}
          </div>
        </div>
      </div>

      {/* health strip */}
      <div className="mt-3 flex items-center gap-2 border-t border-meama-brown/10 pt-3">
        <div className="flex-1">
          <HealthBar score={c.health_score} />
        </div>
      </div>

      {/* 2×2 info grid */}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-meama-muted">
        <div className="truncate">
          <span className="mr-1">📍</span>
          {c.region === "tbilisi"
            ? (ka ? "თბილისი" : "Tbilisi")
            : c.region === "regions"
            ? (ka ? "რეგიონები" : "Regions")
            : "—"}
        </div>
        <div className="truncate">
          <span className="mr-1">☕</span>
          {c.has_machine ? (c.machine_model ?? (ka ? "მანქანა" : "Machine")) : (ka ? "მანქანა არ აქვს" : "No machine")}
        </div>
        <div className="truncate">
          <span className="mr-1">🛒</span>
          {days}d {ka ? "წინ" : "ago"}
        </div>
        <div className="truncate tabular">
          <span className="mr-1">🔁</span>
          {c.order_count} {ka ? "შეკ." : "orders"} · {CHANNEL_LABEL[c.channel ?? ""] ?? "—"}
        </div>
      </div>

      {/* promo bar */}
      {c.total_spend > 0 && (
        <div className="mt-3">
          <PromoBar
            fullPriceSpend={c.full_price_spend}
            promoSpend={c.promo_spend}
            totalSpend={c.total_spend}
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-meama-muted">
            <span>
              <span className="text-meama-green font-semibold">{formatGEL0(c.full_price_spend)}</span>
              {" full / "}
              <span className="text-meama-gold font-semibold">{formatGEL0(c.promo_spend)}</span>
              {" promo"}
            </span>
            <span>{promoSharePct}% on promo</span>
          </div>
        </div>
      )}

      {/* contact + consent */}
      <div className="mt-3 space-y-1 border-t border-meama-brown/10 pt-3 text-[11px] text-meama-muted">
        {!c.phone_only && c.email && (
          <div className="truncate">✉ {c.email}</div>
        )}
        {c.phone && (
          <div className="truncate">☎ {c.phone}</div>
        )}
        {c.phone_only && (
          <div className="italic text-meama-muted/60">{ka ? "ტელეფონით შესვლა" : "Phone login"}</div>
        )}
        <div className="flex gap-1.5 flex-wrap mt-1">
          {c.accept_marketing_email && (
            <span className="rounded-full bg-meama-blue/10 px-2 py-0.5 text-[10px] font-semibold text-meama-blue">
              📧 Email ✓
            </span>
          )}
          {c.sms_marketing && (
            <span className="rounded-full bg-meama-green/10 px-2 py-0.5 text-[10px] font-semibold text-meama-green">
              💬 SMS ✓
            </span>
          )}
        </div>
      </div>

      {/* pc-flav: top categories */}
      {(c.top_product_types ?? []).length > 0 && (
        <div className="mt-3 border-t border-meama-brown/10 pt-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-meama-muted">
            {ka ? "ყიდულობს" : "Buys"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(c.top_product_types ?? []).map((pt) => (
              <span
                key={pt}
                className="rounded-full bg-meama-gold/10 px-2 py-0.5 text-[10px] font-semibold text-meama-brown"
              >
                {pt}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* pc-foot: reorder window */}
      <div className="mt-3 border-t border-meama-brown/10 pt-3">
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-meama-muted">
          <span>{ka ? "აქტივობა" : "Activity"}</span>
          <span className="tabular font-bold">
            {days < 20
              ? (ka ? "ახლახანს" : "Recent")
              : days < 45
              ? `${ka ? "ვადა" : "Due"} ~${Math.max(0, 30 - days)}d`
              : (ka ? "ვადა გავიდა" : "Overdue")}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-meama-brown/10">
          <div
            className={`h-full rounded-full transition-all ${activityColor(days)}`}
            style={{ width: `${activityPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Drawer ─────────────────────────────────────────────────────────────────

function DrawerLoadingState() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-16 rounded-xl w-3/4" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}

function segmentAction(segment: CustomerSegment, ka: boolean): string {
  if (segment === "lapsed")      return ka ? "დაბრუნების კამპანია →" : "Send win-back →";
  if (segment === "at_risk")     return ka ? "რისკის გამოხმაურება →" : "Send re-engage →";
  if (segment === "new_machine") return ka ? "სტარტ-კიტის გაგზავნა →" : "Send starter kit →";
  if (segment === "loyalist")    return ka ? "პრემიუმ შეთავაზება →" : "Send premium offer →";
  return ka ? "ინდივ. კამპანია →" : "Custom campaign →";
}

function Drawer({
  customerId,
  ka,
  onClose,
}: {
  customerId: number | null;
  ka: boolean;
  onClose: () => void;
}) {
  const [data, setData]       = useState<PortfolioDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const drawerRef             = useRef<HTMLDivElement>(null);

  const open = customerId !== null;

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchPortfolio(customerId!)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [customerId, open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const days = data?.days_since_last_order ?? 0;
  const rfm  = data ? rfmScore(days, data.order_count, data.total_spend) : null;
  const seg  = data ? (SEGMENT_META[data.segment] ?? SEGMENT_META.active) : null;
  const promoSharePct = data ? Math.round(data.promo_share * 100) : 0;

  return (
    <>
      {/* Scrim */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={drawerRef}
        className={`fixed right-0 top-0 z-50 flex h-full w-[540px] max-w-[92vw] flex-col bg-meama-roast shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={ka ? "მომხმარებლის დეტალები" : "Customer details"}
      >
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {loading && !data && <DrawerLoadingState />}

          {error && (
            <div className="p-6 text-sm text-meama-red">
              {ka ? "შეცდომა: " : "Error: "}{error}
            </div>
          )}

          {data && (
            <div className="space-y-0">
              {/* 1. Header */}
              <div className="flex items-start gap-4 border-b border-meama-brown/20 px-6 py-5">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-meama-brown font-display text-xl font-bold text-meama-goldsoft">
                  {data.initials || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-bold text-meama-cream leading-tight">
                    {data.full_name?.trim() || `#${data.shopify_customer_id}`}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {seg && (
                      <Badge tone={seg.tone}>{ka ? seg.labelKa : seg.label}</Badge>
                    )}
                    <span className="text-xs text-meama-muted">
                      {data.region === "tbilisi" ? (ka ? "თბილისი" : "Tbilisi")
                        : data.region === "regions" ? (ka ? "რეგიონები" : "Regions")
                        : "—"}
                    </span>
                    {data.customer_created_at && (
                      <span className="text-xs text-meama-muted">
                        · {ka ? "შეუერთდა" : "joined"} {tbilisiDate(data.customer_created_at)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 rounded-full border border-meama-brown/30 p-1.5 text-meama-muted transition-colors hover:border-meama-gold hover:text-meama-gold"
                  aria-label="Close"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              {/* 2. Stat row — 4 cols */}
              <div className="grid grid-cols-4 gap-0 border-b border-meama-brown/20">
                {[
                  { label: ka ? "სულ დახარჯა" : "Total spend", value: formatGEL0(data.total_spend), tone: "text-meama-gold" },
                  { label: ka ? "შეკვეთები"   : "Orders",      value: formatNumber(data.order_count), tone: "text-meama-cream" },
                  { label: "AOV",              value: formatGEL(data.aov),                     tone: "text-meama-cream" },
                  { label: ka ? "დღე" : "Days silent", value: `${days}d`,                      tone: days >= 90 ? "text-meama-red" : days >= 45 ? "text-meama-gold" : "text-meama-green" },
                ].map((s) => (
                  <div key={s.label} className="border-r border-meama-brown/20 last:border-r-0 px-4 py-4 text-center">
                    <div className={`tabular text-lg font-extrabold leading-none ${s.tone}`}>
                      {s.value}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-meama-muted">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* 3. Account health */}
              <div className="border-b border-meama-brown/20 px-6 py-5 space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-meama-muted font-bold">
                  {ka ? "ჯანმრთელობის ქულა" : "Account health"}
                </div>
                <HealthBar score={data.health_score} />

                {/* RFM */}
                {rfm && (
                  <div className="flex gap-4">
                    {[
                      { key: "R", value: rfm.r, label: ka ? "რეცენტ." : "Recency" },
                      { key: "F", value: rfm.f, label: ka ? "სიხშ."   : "Frequency" },
                      { key: "M", value: rfm.m, label: ka ? "მოთხ."   : "Monetary" },
                    ].map((r) => (
                      <div key={r.key} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase text-meama-muted">{r.key}</span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className={`h-2 w-2 rounded-sm ${i < r.value ? "bg-meama-gold" : "bg-meama-brown/20"}`}
                            />
                          ))}
                        </div>
                        <span className="tabular text-[10px] text-meama-muted">{r.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Segment + status + predicted next */}
                <div className="flex flex-wrap items-center gap-2">
                  {seg && <Badge tone={seg.tone}>{ka ? seg.labelKa : seg.label}</Badge>}
                  <span className="text-xs text-meama-muted">
                    {ka ? "შემდ. შეკ. ~" : "Next order ~"}
                    {Math.max(0, 30 - days)}d
                  </span>
                </div>
              </div>

              {/* 4. Spend quality */}
              <div className="border-b border-meama-brown/20 px-6 py-5 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-meama-muted font-bold">
                  {ka ? "ხარჯის ხარისხი" : "Spend quality"}
                </div>
                <PromoBar
                  fullPriceSpend={data.full_price_spend}
                  promoSpend={data.promo_spend}
                  totalSpend={data.total_spend}
                />
                <div className="flex items-center justify-between text-xs">
                  <span>
                    <span className="text-meama-green font-semibold">{formatGEL0(data.full_price_spend)}</span>
                    <span className="text-meama-muted"> full · </span>
                    <span className="text-meama-gold font-semibold">{formatGEL0(data.promo_spend)}</span>
                    <span className="text-meama-muted"> promo</span>
                  </span>
                  <span className="text-meama-muted tabular">
                    {promoSharePct}% {ka ? "ფასდაკლებით" : "on promo"}
                  </span>
                </div>
                {promoSharePct >= 60 && (
                  <p className="text-xs text-meama-gold">
                    ⚠ {ka ? "მაღალი პრომო-დამოკიდებულება" : "High promo dependency — margin sensitive"}
                  </p>
                )}
              </div>

              {/* 5. Profile section */}
              <div className="border-b border-meama-brown/20 px-6 py-5 space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-meama-muted font-bold">
                  {ka ? "პროფილი" : "Profile"}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-meama-muted mb-0.5">
                      {ka ? "მანქანა" : "Machine"}
                    </div>
                    <div className="text-meama-cream font-semibold">
                      {data.has_machine ? (data.machine_model ?? (ka ? "მანქანა" : "Machine")) : (ka ? "არ აქვს" : "None")}
                    </div>
                  </div>
                  {data.top_item_title && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-meama-muted mb-0.5">
                        {ka ? "ყველაზე ხშირი" : "Top flavor"}
                      </div>
                      <div className="text-meama-cream font-semibold truncate">{data.top_item_title}</div>
                    </div>
                  )}
                </div>

                {/* Top categories */}
                {(data.top_product_types ?? []).length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-meama-muted mb-1.5">
                      {ka ? "კატეგორიები" : "Categories"}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.top_product_types!.map((pt) => (
                        <span
                          key={pt}
                          className="rounded-full bg-meama-gold/15 px-2.5 py-0.5 text-xs font-semibold text-meama-brown"
                        >
                          {pt}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact */}
                <div className="space-y-1 text-sm">
                  {!data.phone_only && data.email && (
                    <div className="flex items-center gap-2 text-meama-cream/80">
                      <span className="text-meama-muted">✉</span>
                      {data.email}
                    </div>
                  )}
                  {data.phone && (
                    <div className="flex items-center gap-2 text-meama-cream/80">
                      <span className="text-meama-muted">☎</span>
                      {data.phone}
                    </div>
                  )}
                  {data.phone_only && (
                    <div className="italic text-xs text-meama-muted/60">
                      {ka ? "ტელეფონით შესვლა" : "Phone login only"}
                    </div>
                  )}
                </div>

                {/* Consent pills */}
                <div className="flex gap-1.5 flex-wrap">
                  {data.accept_marketing_email ? (
                    <span className="rounded-full bg-meama-blue/10 px-2.5 py-0.5 text-xs font-semibold text-meama-blue">📧 Email ✓</span>
                  ) : (
                    <span className="rounded-full bg-meama-brown/15 px-2.5 py-0.5 text-xs font-semibold text-meama-muted">📧 Email ✗</span>
                  )}
                  {data.sms_marketing ? (
                    <span className="rounded-full bg-meama-green/10 px-2.5 py-0.5 text-xs font-semibold text-meama-green">💬 SMS ✓</span>
                  ) : (
                    <span className="rounded-full bg-meama-brown/15 px-2.5 py-0.5 text-xs font-semibold text-meama-muted">💬 SMS ✗</span>
                  )}
                </div>
              </div>

              {/* 6. Recent orders table */}
              <div className="border-b border-meama-brown/20 px-6 py-5">
                <div className="text-[10px] uppercase tracking-wider text-meama-muted font-bold mb-3">
                  {ka ? "ბოლო შეკვეთები" : "Recent orders"}
                </div>
                {data.recent_orders.length === 0 ? (
                  <p className="text-sm text-meama-muted">
                    {ka ? "შეკვეთები ვერ მოიძებნა" : "No orders found"}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="tabular w-full text-xs">
                      <thead>
                        <tr className="border-b border-meama-brown/10 text-[10px] uppercase tracking-wider text-meama-muted">
                          <th className="pb-2 text-left font-semibold">{ka ? "შეკ." : "Order"}</th>
                          <th className="pb-2 text-left font-semibold">{ka ? "თარიღი" : "Date"}</th>
                          <th className="pb-2 text-left font-semibold">{ka ? "არხი" : "Ch."}</th>
                          <th className="pb-2 text-right font-semibold">{ka ? "ჯამი" : "Total"}</th>
                          <th className="pb-2 text-right font-semibold">{ka ? "ფასდ." : "Disc."}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-meama-brown/5">
                        {data.recent_orders.map((o) => (
                          <tr key={o.shopify_order_id} className="hover:bg-meama-brown/5">
                            <td className="py-1.5 text-meama-cream/60">#{o.shopify_order_id}</td>
                            <td className="py-1.5 text-meama-muted">{o.processed_at ? tbilisiDate(o.processed_at) : "—"}</td>
                            <td className="py-1.5 text-meama-muted">{o.source ? (SOURCE_LABEL[o.source] ?? o.source) : "—"}</td>
                            <td className="py-1.5 text-right font-semibold text-meama-cream">{formatGEL(o.total)}</td>
                            <td className="py-1.5 text-right text-meama-muted">
                              {o.discount_code ? `${o.discount_code} (${formatGEL(o.discount_amount)})` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 7. Action button */}
              <div className="px-6 py-5">
                <button className="w-full rounded-xl bg-meama-gold px-4 py-3 text-sm font-bold text-meama-espresso transition-opacity hover:opacity-90">
                  {segmentAction(data.segment, ka)}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

type FilterRow1 =
  | "all"
  | "no_machine"
  | "never_ordered"
  | "promo_heavy"
  | "recommend"
  | "loyalist"
  | "at_risk"
  | "new_machine"
  | "active"
  | "lapsed";

type FilterRow2 = "all" | "email" | "sms" | "any" | "none";

const SORT_OPTIONS = [
  { value: "last_order_at",         label: "Last order"  },
  { value: "total_spend",           label: "Total spend" },
  { value: "order_count",           label: "Orders"      },
  { value: "days_since_last_order", label: "Days silent" },
  { value: "health_score",          label: "Health"      },
  { value: "promo_share",           label: "Promo share" },
  { value: "aov",                   label: "AOV"         },
];

export default function Portfolios() {
  const { t, i18n } = useTranslation();
  const ka = i18n.language === "ka";

  const [query,    setQuery]    = useState("");
  const [row1,     setRow1]     = useState<FilterRow1>("all");
  const [row2,     setRow2]     = useState<FilterRow2>("all");
  const [region,   setRegion]   = useState("");
  const [channel,  setChannel]  = useState("");
  const [sort,     setSort]     = useState("last_order_at");
  const [descDir,  setDescDir]  = useState(true);
  const [page,     setPage]     = useState(1);

  const [items,   setItems]   = useState<PortfolioSummary[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const [drawerId, setDrawerId] = useState<number | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const openDrawer  = useCallback((id: number) => setDrawerId(id),  []);
  const closeDrawer = useCallback(() => setDrawerId(null), []);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [query, row1, row2, region, channel, sort, descDir]);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      // Build params from filter state
      const params: ListParams = {
        q:        query   || undefined,
        region:   region  || undefined,
        channel:  channel || undefined,
        sort,
        desc:     descDir,
        page,
        page_size: 48,
      };

      // Row 1 filters
      if (row1 === "no_machine")  params.no_machine  = true;
      if (row1 === "promo_heavy") params.promo_heavy = true;
      if (row1 === "loyalist")    params.segment     = "loyalist";
      if (row1 === "at_risk")     params.segment     = "at_risk";
      if (row1 === "new_machine") params.segment     = "new_machine";
      if (row1 === "active")      params.segment     = "active";
      if (row1 === "lapsed")      params.segment     = "lapsed";
      // "never_ordered" and "recommend" are stubs — no server param, return empty
      if (row1 === "never_ordered" || row1 === "recommend") {
        setItems([]);
        setTotal(0);
        setFetched(true);
        setLoading(false);
        return;
      }

      // Row 2 consent filters
      if (row2 === "email") params.email_consent = true;
      if (row2 === "sms")   params.sms_consent   = true;
      if (row2 === "any")   params.any_consent   = true;
      if (row2 === "none")  { params.email_consent = false; params.sms_consent = false; }

      setLoading(true);
      setError(null);
      fetchPortfolios(params)
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
          setFetched(true);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 280);

    return () => clearTimeout(debounce.current);
  }, [query, row1, row2, region, channel, sort, descDir, page]);

  const totalPages = Math.max(1, Math.ceil(total / 48));

  const row1Options: { id: FilterRow1; label: string; labelKa: string; sep?: boolean }[] = [
    { id: "all",           label: "All",            labelKa: "ყველა"       },
    { id: "no_machine",    label: "No machine",     labelKa: "მანქ. გარეშე" },
    { id: "never_ordered", label: "Never ordered",  labelKa: "შეკ. არ ჰქონია" },
    { id: "promo_heavy",   label: "% Promo-driven", labelKa: "% პრომო"     },
    { id: "recommend",     label: "✦ Recommend",    labelKa: "✦ სარეკომ."  },
    { id: "loyalist",      label: "Loyalist",       labelKa: "ლოიალური",  sep: true },
    { id: "at_risk",       label: "At risk",        labelKa: "რისკი"       },
    { id: "new_machine",   label: "New machine",    labelKa: "ახ. მანქ."   },
    { id: "active",        label: "Active",         labelKa: "აქტიური"    },
    { id: "lapsed",        label: "Lapsed",         labelKa: "გათიშული"   },
  ];

  const row2Options: { id: FilterRow2; label: string; labelKa: string }[] = [
    { id: "all",   label: "All",           labelKa: "ყველა"        },
    { id: "email", label: "📧 Email opt-in", labelKa: "📧 Email"   },
    { id: "sms",   label: "💬 SMS opt-in",   labelKa: "💬 SMS"     },
    { id: "any",   label: "Any channel",   labelKa: "ნებისმიერი"  },
    { id: "none",  label: "No consent",    labelKa: "თანხმობა არ. " },
  ];

  const isComingSoon = row1 === "never_ordered" || row1 === "recommend";

  return (
    <div>
      <PageHeader
        kicker="Portfolios"
        kickerKa="პორტფოლიოები"
        title={t("pages.portfolios.title")}
        subtitle={t("pages.portfolios.subtitle")}
      />

      {/* Search + secondary filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${t("common.search")} (name / email / phone)…`}
          className="w-full max-w-xs rounded-full border border-meama-gold/40 bg-white/10 px-4 py-1.5 text-sm text-meama-cream outline-none transition-colors placeholder:text-meama-cream/40 focus:border-meama-gold"
        />

        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-full border border-meama-gold/40 bg-meama-espresso/60 px-3 py-1.5 text-xs font-semibold text-meama-cream/80 outline-none focus:border-meama-gold"
          aria-label={ka ? "რეგიონი" : "Region"}
        >
          <option value="">{ka ? "რეგიონი" : "Region"}</option>
          <option value="tbilisi">{ka ? "თბილისი" : "Tbilisi"}</option>
          <option value="regions">{ka ? "რეგიონები" : "Regions"}</option>
        </select>

        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="rounded-full border border-meama-gold/40 bg-meama-espresso/60 px-3 py-1.5 text-xs font-semibold text-meama-cream/80 outline-none focus:border-meama-gold"
          aria-label={ka ? "არხი" : "Channel"}
        >
          <option value="">{ka ? "არხი" : "Channel"}</option>
          <option value="online">Online</option>
          <option value="in_store">In Store</option>
          <option value="app">App</option>
          <option value="mixed">Mixed</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-full border border-meama-gold/40 bg-meama-espresso/60 px-3 py-1.5 text-xs font-semibold text-meama-cream/80 outline-none focus:border-meama-gold"
          aria-label={ka ? "სორტირება" : "Sort by"}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          onClick={() => setDescDir((d) => !d)}
          className="rounded-full border border-meama-gold/40 px-3 py-1.5 text-xs font-semibold text-meama-cream/80 transition-colors hover:border-meama-gold"
          aria-label="toggle sort direction"
        >
          {descDir ? "↓" : "↑"}
        </button>

        {fetched && (
          <span className="ml-auto tabular text-[11px] text-meama-muted">
            {formatNumber(total)} {ka ? "მომხმარებელი" : "customers"}
          </span>
        )}
      </div>

      {/* Filter row 1 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {row1Options.map((o) => (
          <span key={o.id} className="flex items-center gap-1.5">
            {o.sep && <PillFilter active={false} onClick={() => {}} separator />}
            <PillFilter active={row1 === o.id} onClick={() => setRow1(o.id)}>
              {ka ? o.labelKa : o.label}
            </PillFilter>
          </span>
        ))}
      </div>

      {/* Filter row 2 — reachable */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-meama-muted mr-1">
          {ka ? "მისაწვდომი:" : "Reachable:"}
        </span>
        {row2Options.map((o) => (
          <PillFilter key={o.id} active={row2 === o.id} onClick={() => setRow2(o.id)}>
            {ka ? o.labelKa : o.label}
          </PillFilter>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 rounded-xl border border-meama-red/30 bg-meama-red/10 px-5 py-4 text-sm text-meama-red">
          {ka ? "შეცდომა — " : "Error — "}{error}
          <span className="ml-2 text-meama-muted">
            {ka ? "(backend გაშვებულია?)" : "(is the backend running?)"}
          </span>
        </div>
      )}

      {/* Coming-soon stub */}
      {isComingSoon && fetched && (
        <div className="mt-12 text-center space-y-2">
          <p className="text-3xl">🔮</p>
          <p className="text-sm font-semibold text-meama-muted">
            {ka ? "მალე გამოჩნდება" : "Coming soon"}
          </p>
        </div>
      )}

      {/* Skeleton on initial load */}
      {loading && !fetched && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Grid */}
      {fetched && !isComingSoon && (
        <>
          <div className="stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <CustomerCard key={c.shopify_customer_id} c={c} ka={ka} onOpen={openDrawer} />
            ))}
          </div>

          {items.length === 0 && !loading && (
            <p className="mt-10 text-center text-sm text-meama-muted">
              {ka ? "მომხმარებლები ვერ მოიძებნა" : "No customers found"}
            </p>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-full border border-meama-gold/40 px-4 py-1.5 text-xs font-semibold text-meama-cream/80 disabled:opacity-30 hover:border-meama-gold"
              >
                ← {ka ? "წინა" : "Prev"}
              </button>
              <span className="tabular text-xs text-meama-muted">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-full border border-meama-gold/40 px-4 py-1.5 text-xs font-semibold text-meama-cream/80 disabled:opacity-30 hover:border-meama-gold"
              >
                {ka ? "შემდეგი" : "Next"} →
              </button>
            </div>
          )}
        </>
      )}

      {/* Drawer */}
      <Drawer customerId={drawerId} ka={ka} onClose={closeDrawer} />
    </div>
  );
}
