import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

import { MiniBars } from "../components/MiniBars";
import { type AffinityPair, type ProductSummary, fetchAffinityPairs, fetchProducts } from "../lib/api";
import { formatGEL, formatGEL0, formatNumber, formatPercent } from "../lib/format";
import { PageHeader } from "./PageHeader";

// ── Intensity bucket (from Bible intensity_level or intensity_bucket field) ───
function resolveIntensityBucket(p: ProductSummary): "light" | "medium" | "strong" | null {
  if (p.intensity_bucket) return p.intensity_bucket;
  if (p.intensity_level === null) return null;
  if (p.intensity_level < 4) return "light";
  if (p.intensity_level < 7) return "medium";
  return "strong";
}

// ── Commercial category (Tea / Coffee / Wellness) ─────────────────────────────
function resolveCommercialCat(p: ProductSummary): "coffee" | "tea" | "wellness" | null {
  const bev = p.beverage_type_en;
  if (bev === "tea") return "tea";
  if (bev === "wellness") return "wellness";
  if (bev === "espresso" || bev === "filter_coffee" || bev === "cold_mix") return "coffee";
  const pt = (p.product_type_geo || "").toLowerCase();
  if (pt.includes("tea")) return "tea";
  if (pt.includes("coffee") || pt.includes("capsule") || pt.includes("multicapsule")) return "coffee";
  const cat = (p.category || "").toLowerCase();
  if (cat.includes("tea")) return "tea";
  return null;
}

// ── Category labels ────────────────────────────────────────────────────────────
const CAT_LABELS: Record<string, string> = {
  "Multicapsule": "Multicapsule", "European": "European Format",
  "Classic Coffee": "Classic Coffee", "Classic\xa0Coffee": "Classic Coffee",
  "BIO": "BIO", "Tea": "Tea", "Coffee Machine": "Machines",
  "Accessories": "Accessories", "Variety Pack": "Variety Packs",
  "Bundle": "Bundles", "Coffee Machine Replacement Parts": "Spare Parts",
  "Merch": "Merch", "Add On": "Add-Ons",
};

type Tab = "catalog" | "revenue" | "retention" | "affinity" | "segments";
type SortKey = "revenue" | "units" | "price" | "repeat" | "reorder90" | "buyers" | "trend" | "total_revenue" | "growth" | "margin";
type SortDir = "desc" | "asc";
type CommercialCat = "all" | "coffee" | "tea" | "wellness";
type IntensityFilter = "all" | "light" | "medium" | "strong";
type PerformerFilter = "all" | "top_returning" | "worst";
type StatusFilter = "all" | "active" | "draft" | "archived";

// Catalog grid/table render in batches instead of mounting every filtered
// product (and its image) at once — the DOM/image cost scales with what's
// actually on screen, not with the size of the catalog.
const CATALOG_BATCH_SIZE = 24;

// ── Caffeine bucket ────────────────────────────────────────────────────────────
function caffeineBucket(mg: number | null): "none" | "low" | "medium" | "high" {
  if (mg === null) return "none";
  if (mg === 0) return "none";
  if (mg < 50) return "low";
  if (mg < 100) return "medium";
  return "high";
}

// ── Product image placeholder ─────────────────────────────────────────────────
// Reserves the card's image slot up front (fixed height) so cards never jump,
// and shows a shimmer skeleton per-card until that image's own request lands —
// instead of the whole grid waiting on the slowest photo.
function ProductImage({ src, name }: { src: string | null; name: string }) {
  const [err, setErr] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!src || err) {
    return (
      <div className="flex h-28 w-full items-center justify-center bg-meama-charcoal">
        <span className="font-mono text-[10px] text-meama-muted">[ IMG ]</span>
      </div>
    );
  }
  return (
    <div className="relative h-28 w-full overflow-hidden bg-meama-charcoal">
      {!loaded && <div className="skeleton-shine absolute inset-0" />}
      <img
        src={src}
        alt={name}
        onLoad={() => setLoaded(true)}
        onError={() => setErr(true)}
        className={`h-28 w-full object-contain p-2 transition-opacity duration-150 ${loaded ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

// ── Intensity bar ──────────────────────────────────────────────────────────────
function IntensityBar({ value, max = 12 }: { value: number | null; max?: number }) {
  if (value === null) return null;
  const pct = Math.min(1, value / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 bg-meama-charcoal">
        <div className="h-full bg-meama-gold" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-meama-muted">{value}/{max}</span>
    </div>
  );
}

// ── Export helpers ─────────────────────────────────────────────────────────────
function buildExportRows(products: ProductSummary[]) {
  return products.map((p) => ({
    SKU: p.sku,
    Name: p.name,
    Category: CAT_LABELS[p.category] ?? p.category,
    Price: p.price,
    "Revenue 30d (₾)": p.revenue_30d,
    "Units 30d": p.units_sold_30d,
    "Revenue Web 30d (₾)": p.revenue_30d_web,
    "Units Web 30d": p.units_30d_web,
    "ASP Web (₾)": p.avg_price_web ?? "",
    "Revenue POS 30d (₾)": p.revenue_30d_pos,
    "Units POS 30d": p.units_30d_pos,
    "ASP POS (₾)": p.avg_price_pos ?? "",
    "Repeat Rate": formatPercent(p.repeat_rate, 1),
    "Reorder 30d": formatPercent(p.reorder_rate_30d, 1),
    "Reorder 60d": formatPercent(p.reorder_rate_60d, 1),
    "Reorder 90d": formatPercent(p.reorder_rate_90d, 1),
    "Retention 90d": formatPercent(p.retention_rate, 1),
    "Total Buyers": p.total_buyers,
    Caffeine: p.caffeine ?? "",
    Bio: p.bio ? "Yes" : "No",
    "Flavor Profile": p.flavor_profile ?? "",
    "Beverage Type": p.beverage_type ?? "",
    "Capsule Format": p.capsule_format ?? "",
    Intensity: p.intensity_level ?? "",
    Bitterness: p.bitterness ?? "",
    Arabica: p.arabica_pct ?? "",
    Robusta: p.robusta_pct ?? "",
    "Compatible With": p.compatible_with ?? "",
    Ingredients: p.ingredients ?? "",
  }));
}

function exportCSV(products: ProductSummary[]) {
  const rows = buildExportRows(products);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h as keyof typeof r] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "meama_products.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function exportXLSX(products: ProductSummary[]) {
  const rows = buildExportRows(products);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.writeFile(wb, "meama_products.xlsx");
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="card-m animate-pulse">
      <div className="h-28 w-full bg-meama-charcoal" />
      <div className="mt-3 space-y-2 p-1">
        <div className="h-2 w-16 rounded bg-meama-charcoal" />
        <div className="h-4 w-3/4 rounded bg-meama-charcoal" />
        <div className="h-2 w-24 rounded bg-meama-charcoal" />
      </div>
    </div>
  );
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "revenue", label: "Revenue 30d" },
  { key: "total_revenue", label: "Revenue All-time" },
  { key: "units", label: "Units 30d" },
  { key: "price", label: "Price" },
  { key: "repeat", label: "Repeat rate" },
  { key: "reorder90", label: "Reorder 90d" },
  { key: "buyers", label: "Total buyers" },
  { key: "growth", label: "Monthly growth" },
  { key: "margin", label: "Margin %" },
  { key: "trend", label: "Trend" },
];

function sortProducts(products: ProductSummary[], key: SortKey, dir: SortDir): ProductSummary[] {
  const multiplier = dir === "desc" ? -1 : 1;
  return [...products].sort((a, b) => {
    let va = 0, vb = 0;
    switch (key) {
      case "revenue":       va = a.revenue_30d; vb = b.revenue_30d; break;
      case "total_revenue": va = a.total_revenue; vb = b.total_revenue; break;
      case "units":         va = a.units_sold_30d; vb = b.units_sold_30d; break;
      case "price":         va = a.price; vb = b.price; break;
      case "repeat":        va = a.repeat_rate; vb = b.repeat_rate; break;
      case "reorder90":     va = a.reorder_rate_90d; vb = b.reorder_rate_90d; break;
      case "buyers":        va = a.total_buyers; vb = b.total_buyers; break;
      case "growth":        va = a.monthly_growth_pct ?? -999; vb = b.monthly_growth_pct ?? -999; break;
      case "margin":        va = a.margin_pct ?? -999; vb = b.margin_pct ?? -999; break;
      case "trend":         va = a.monthly_units[11] ?? 0; vb = b.monthly_units[11] ?? 0; break;
    }
    return (va - vb) * multiplier;
  });
}

// ── Revenue tab ───────────────────────────────────────────────────────────────
function RevenueTab({ products }: { products: ProductSummary[] }) {
  const top = [...products].sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 20);
  const totalRev = products.reduce((s, p) => s + p.revenue_30d, 0);
  const totalWeb = products.reduce((s, p) => s + p.revenue_30d_web, 0);
  const totalPos = products.reduce((s, p) => s + p.revenue_30d_pos, 0);
  const totalAllTime = products.reduce((s, p) => s + p.total_revenue, 0);
  const totalFullPrice = products.reduce((s, p) => s + p.full_price_revenue, 0);
  const totalDiscounted = products.reduce((s, p) => s + p.discounted_revenue, 0);

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Revenue · 30d", value: formatGEL0(totalRev) },
          { label: "E-Commerce · 30d", value: formatGEL0(totalWeb), sub: totalRev ? `${((totalWeb/totalRev)*100).toFixed(0)}% of 30d` : "—" },
          { label: "Brand Store · 30d", value: formatGEL0(totalPos), sub: totalRev ? `${((totalPos/totalRev)*100).toFixed(0)}% of 30d` : "—" },
          { label: "All-Time Revenue", value: formatGEL0(totalAllTime) },
        ].map((s) => (
          <div key={s.label} className="panel-dark border-l-2 border-l-[#3A423B]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#9BA39C]">{s.label}</div>
            <div className="tabular mt-1 font-display text-[28px] uppercase leading-none text-[#F5F7F5]">{s.value}</div>
            {s.sub ? <div className="font-mono text-xs text-[#CBD1CC]">{s.sub}</div> : null}
          </div>
        ))}
      </div>

      {/* Ranked table — all-time + new metrics */}
      <div>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
          — Top 20 by All-Time Revenue
        </div>
        <div className="overflow-x-auto border border-meama-charcoal">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-meama-charcoal">
                {["#", "Product", "Cat.", "All-Time Rev", "Total Units", "Format Rank", "Total Rank", "MoM Growth", "Margin %", "Rev 30d"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-right first:text-left second:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map((p, i) => {
                const growth = p.monthly_growth_pct;
                const growthColor = growth == null ? "text-meama-muted" : growth > 0 ? "text-meama-green" : growth < 0 ? "text-meama-red" : "text-meama-muted";
                const marginColor = p.margin_pct == null ? "text-meama-muted" : p.margin_pct >= 0.4 ? "text-meama-green" : p.margin_pct >= 0.2 ? "text-meama-gold" : "text-meama-red";
                return (
                  <tr key={p.sku} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                    <td className="px-3 py-2 font-mono text-xs text-meama-muted">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link to={`/products/${p.sku}`} className="font-medium text-meama-brown hover:text-meama-gold">
                        {p.name}
                      </Link>
                      <div className="font-mono text-[10px] text-meama-muted">{p.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-meama-cream">{CAT_LABELS[p.category] ?? p.category}</td>
                    <td className="tabular px-3 py-2 text-right font-semibold text-meama-brown">{formatGEL0(p.total_revenue)}</td>
                    <td className="tabular px-3 py-2 text-right text-meama-cream">{formatNumber(p.total_quantity)}</td>
                    <td className="tabular px-3 py-2 text-right text-meama-cream">
                      {p.format_rank_pct != null ? formatPercent(p.format_rank_pct, 1) : <span className="text-meama-muted">—</span>}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-meama-cream">
                      {p.total_rank_pct != null ? formatPercent(p.total_rank_pct, 1) : <span className="text-meama-muted">—</span>}
                    </td>
                    <td className={`tabular px-3 py-2 text-right font-mono font-bold ${growthColor}`}>
                      {growth != null ? `${growth > 0 ? "+" : ""}${formatPercent(growth, 1)}` : "—"}
                    </td>
                    <td className={`tabular px-3 py-2 text-right font-mono font-bold ${marginColor}`}>
                      {p.margin_pct != null ? formatPercent(p.margin_pct, 1) : <span className="text-meama-muted">—</span>}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-meama-cream">{formatGEL0(p.revenue_30d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly trend chart — top 6 */}
      <div>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
          — Unit Trend by Month · Top 6 SKUs
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top.slice(0, 6).map((p) => {
            const monthly = p.monthly_units.length === 12 ? p.monthly_units : Array(12).fill(0);
            const declining = monthly[11] < monthly[0];
            return (
              <div key={p.sku} className="card-m">
                <div className="font-mono text-[10px] uppercase tracking-wider text-meama-gold">
                  {CAT_LABELS[p.category] ?? p.category}
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-meama-brown">{p.name}</div>
                {p.monthly_growth_pct != null && (
                  <div className={`font-mono text-[10px] ${p.monthly_growth_pct > 0 ? "text-meama-green" : p.monthly_growth_pct < 0 ? "text-meama-red" : "text-meama-muted"}`}>
                    MoM {p.monthly_growth_pct > 0 ? "+" : ""}{formatPercent(p.monthly_growth_pct, 1)}
                  </div>
                )}
                <div className="mt-3 flex items-end gap-1" style={{ height: 40 }}>
                  {monthly.map((v, idx) => {
                    const max = Math.max(...monthly, 1);
                    return (
                      <div
                        key={idx}
                        className={`flex-1 rounded-t-none ${idx === 11 ? "bg-meama-gold" : declining ? "bg-meama-red/40" : "bg-meama-gold/35"}`}
                        style={{ height: `${(v / max) * 100}%`, minHeight: 1 }}
                      />
                    );
                  })}
                </div>
                <div className="tabular mt-2 flex justify-between text-[10px] text-meama-muted">
                  <span>12 mo ago</span>
                  <span className={declining ? "text-meama-red" : "text-meama-green"}>
                    {declining ? "▼" : "▲"} {formatNumber(p.units_sold_30d)} u · 30d
                  </span>
                  <span>now</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Promo behavior — full price vs discounted */}
      <div>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
          — Promo Behaviour · Full Price vs Discounted (All-Time)
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="panel-dark border-l-2 border-l-[#3A423B]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#9BA39C]">Full-Price Revenue</div>
            <div className="tabular mt-1 font-display text-[28px] uppercase leading-none text-[#F5F7F5]">{formatGEL0(totalFullPrice)}</div>
            <div className="font-mono text-xs text-[#CBD1CC]">
              {totalAllTime > 0 ? `${((totalFullPrice / totalAllTime) * 100).toFixed(1)}% of all-time` : "—"}
            </div>
          </div>
          <div className="panel-dark border-l-2 border-l-[#3A423B]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#9BA39C]">Discounted Revenue</div>
            <div className="tabular mt-1 font-display text-[28px] uppercase leading-none text-[#F5F7F5]">{formatGEL0(totalDiscounted)}</div>
            <div className="font-mono text-xs text-[#CBD1CC]">
              {totalAllTime > 0 ? `${((totalDiscounted / totalAllTime) * 100).toFixed(1)}% of all-time` : "—"}
            </div>
          </div>
        </div>
        {/* Per-product promo breakdown — top 15 by discounted units */}
        <div className="mt-4 overflow-x-auto border border-meama-charcoal">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-meama-charcoal">
                {["Product", "Full-Price Rev", "Full-Price Units", "Discounted Rev", "Discounted Units", "Discount Share"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...products]
                .filter((p) => p.discounted_units > 0 || p.full_price_units > 0)
                .sort((a, b) => b.discounted_units - a.discounted_units)
                .slice(0, 15)
                .map((p) => {
                  const totalUnits = p.full_price_units + p.discounted_units;
                  const discShare = totalUnits > 0 ? p.discounted_units / totalUnits : 0;
                  return (
                    <tr key={p.sku} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                      <td className="px-3 py-2">
                        <Link to={`/products/${p.sku}`} className="font-medium text-meama-brown hover:text-meama-gold">{p.name}</Link>
                        <div className="font-mono text-[10px] text-meama-muted">{p.sku}</div>
                      </td>
                      <td className="tabular px-3 py-2 text-right text-meama-cream">{formatGEL0(p.full_price_revenue)}</td>
                      <td className="tabular px-3 py-2 text-right text-meama-cream">{formatNumber(p.full_price_units)}</td>
                      <td className="tabular px-3 py-2 text-right text-meama-cream">{formatGEL0(p.discounted_revenue)}</td>
                      <td className="tabular px-3 py-2 text-right text-meama-cream">{formatNumber(p.discounted_units)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="h-1 w-16 bg-meama-charcoal">
                            <div className={`h-full ${discShare > 0.5 ? "bg-meama-red" : discShare > 0.25 ? "bg-meama-gold" : "bg-meama-green"}`} style={{ width: `${discShare * 100}%` }} />
                          </div>
                          <span className={`tabular font-mono text-xs font-bold ${discShare > 0.5 ? "text-meama-red" : discShare > 0.25 ? "text-meama-gold" : "text-meama-green"}`}>
                            {formatPercent(discShare, 1)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Stock status badge ─────────────────────────────────────────────────────────
function StockBadge({ status }: { status: string | null }) {
  if (!status || status === "unknown") return null;
  const cfg = {
    understock: { label: "UNDERSTOCK", cls: "bg-meama-red/10 text-meama-red border-meama-red/30" },
    in_stock:   { label: "IN STOCK",   cls: "bg-meama-green/10 text-meama-green border-meama-green/30" },
    overstock:  { label: "OVERSTOCK",  cls: "bg-meama-blue/10 text-meama-blue border-meama-blue/30" },
  }[status] ?? { label: status.toUpperCase(), cls: "border-meama-charcoal text-meama-muted" };
  return (
    <span className={`inline-block border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Retention tab ──────────────────────────────────────────────────────────────
function RetentionTab({ products }: { products: ProductSummary[] }) {
  const [window, setWindow] = useState<30 | 60 | 90>(90);
  const sorted = [...products]
    .filter((p) => p.total_buyers > 0)
    .sort((a, b) => {
      const key: "reorder_rate_30d" | "reorder_rate_60d" | "reorder_rate_90d" = `reorder_rate_${window}d`;
      return b[key] - a[key];
    });
  const topRetention = [...products]
    .filter((p) => p.total_buyers >= 10)
    .sort((a, b) => b.retention_rate - a.retention_rate)
    .slice(0, 5);

  const understockCount = products.filter((p) => p.stock_status === "understock").length;
  const overstockCount  = products.filter((p) => p.stock_status === "overstock").length;
  const avgRefundRate   = products.filter((p) => p.total_quantity > 0).reduce((s, p) => s + p.refund_rate, 0) /
    Math.max(1, products.filter((p) => p.total_quantity > 0).length);

  return (
    <div className="space-y-6">
      {/* Stock + refund summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Understock SKUs", value: String(understockCount), cls: understockCount > 0 ? "text-meama-red" : "text-[#F5F7F5]" },
          { label: "Overstock SKUs",  value: String(overstockCount),  cls: overstockCount  > 0 ? "text-meama-blue" : "text-[#F5F7F5]" },
          { label: "Avg Refund Rate", value: formatPercent(avgRefundRate, 2), cls: avgRefundRate > 0.05 ? "text-meama-red" : "text-[#F5F7F5]" },
          { label: "Products Tracked", value: String(products.filter((p) => p.avg_monthly_consumption > 0).length), cls: "text-[#F5F7F5]" },
        ].map((s) => (
          <div key={s.label} className="panel-dark border-l-2 border-l-[#3A423B]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#9BA39C]">{s.label}</div>
            <div className={`tabular mt-1 font-display text-[28px] uppercase leading-none ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Top retention capsules */}
      <div className="panel-dark border-l-2 border-l-[#3A423B]">
        <div className="mb-4 font-mono text-[9.5px] uppercase tracking-[0.3em] text-[#9BA39C]">
          — Capsules That Bring Customers Back Most · 90d Retention Rate
        </div>
        <div className="space-y-3">
          {topRetention.map((p, i) => (
            <div key={p.sku} className="flex items-center gap-3">
              <span className="tabular w-4 font-mono text-xs text-[#727B73]">{i + 1}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#F5F7F5]">{p.name}</span>
                  <StockBadge status={p.stock_status} />
                </div>
                <div className="mt-1 h-px bg-[#222823]">
                  <div className="h-full bg-[#F5F7F5]" style={{ width: `${p.retention_rate * 100}%` }} />
                </div>
              </div>
              <span className="tabular font-display text-xl text-[#F5F7F5]">
                {formatPercent(p.retention_rate, 1)}
              </span>
              <span className="font-mono text-[10px] text-[#727B73]">{p.total_buyers} buyers</span>
            </div>
          ))}
        </div>
      </div>

      {/* Window toggle + full table */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-meama-gold">
            — Reorder Rate per SKU
          </div>
          <div className="flex gap-1">
            {([30, 60, 90] as const).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`px-3 py-1 font-mono text-xs transition-colors ${
                  window === w
                    ? "bg-meama-brown text-meama-espresso"
                    : "border border-meama-charcoal text-meama-cream hover:border-meama-gold hover:text-meama-gold"
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto border border-meama-charcoal">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-meama-charcoal">
                {["Product", "Category", "Buyers", "Reorder Rate", "Retention 90d", "Avg Monthly", "Refund Rate", "Stock", "Repeat"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-left last:text-right">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 30).map((p) => {
                const rate = p[`reorder_rate_${window}d` as keyof ProductSummary] as number;
                return (
                  <tr key={p.sku} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                    <td className="px-3 py-2">
                      <Link to={`/products/${p.sku}`} className="font-medium text-meama-brown hover:text-meama-gold">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-meama-cream">{CAT_LABELS[p.category] ?? p.category}</td>
                    <td className="tabular px-3 py-2 text-meama-cream">{formatNumber(p.total_buyers)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-20 bg-meama-charcoal">
                          <div className="h-full bg-meama-gold" style={{ width: `${Math.min(rate * 100, 100)}%` }} />
                        </div>
                        <span className={`tabular font-mono text-xs font-bold ${rate > 0.15 ? "text-meama-green" : rate > 0.05 ? "text-meama-gold" : "text-meama-muted"}`}>
                          {formatPercent(rate, 1)}
                        </span>
                      </div>
                    </td>
                    <td className={`tabular px-3 py-2 font-mono text-xs ${p.retention_rate > 0.2 ? "text-meama-green" : "text-meama-muted"}`}>
                      {formatPercent(p.retention_rate, 1)}
                    </td>
                    <td className="tabular px-3 py-2 font-mono text-xs text-meama-cream">
                      {p.avg_monthly_consumption > 0 ? formatNumber(Math.round(p.avg_monthly_consumption)) : <span className="text-meama-muted">—</span>}
                    </td>
                    <td className={`tabular px-3 py-2 font-mono text-xs ${p.refund_rate > 0.05 ? "text-meama-red" : p.refund_rate > 0.02 ? "text-meama-gold" : "text-meama-muted"}`}>
                      {formatPercent(p.refund_rate, 2)}
                    </td>
                    <td className="px-3 py-2">
                      <StockBadge status={p.stock_status} />
                    </td>
                    <td className="tabular px-3 py-2 text-right font-mono text-xs text-meama-cream">
                      {formatPercent(p.repeat_rate, 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Affinity tab ───────────────────────────────────────────────────────────────
function AffinityTab() {
  const [pairs, setPairs] = useState<AffinityPair[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAffinityPairs()
      .then(setPairs)
      .catch(() => setPairs([]))
      .finally(() => setLoading(false));
  }, []);

  const machines = pairs.filter(
    (p) =>
      (p.sku_a.startsWith("acc") || p.sku_b.startsWith("acc") ||
       (p.name_a ?? "").toLowerCase().includes("machine") ||
       (p.name_b ?? "").toLowerCase().includes("machine"))
  );

  return (
    <div className="space-y-6">
      {/* Frequently bought together */}
      <div>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
          — Most Frequently Bought Together · Last 6 months
        </div>
        {loading ? (
          <div className="font-mono text-sm text-meama-muted">Loading pairs…</div>
        ) : (
          <div className="overflow-x-auto border border-meama-charcoal">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-meama-charcoal">
                  {["#", "Product A", "Product B", "Co-orders", "Strength"].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-left last:text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pairs.slice(0, 25).map((p, i) => {
                  const max = pairs[0]?.co_orders ?? 1;
                  const strength = p.co_orders / max;
                  return (
                    <tr key={`${p.sku_a}-${p.sku_b}`} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                      <td className="px-3 py-2 font-mono text-xs text-meama-muted">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-meama-brown">{p.name_a ?? p.sku_a}</span>
                        <span className="ml-1.5 font-mono text-[10px] text-meama-muted">{p.sku_a}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-meama-brown">{p.name_b ?? p.sku_b}</span>
                        <span className="ml-1.5 font-mono text-[10px] text-meama-muted">{p.sku_b}</span>
                      </td>
                      <td className="tabular px-3 py-2 font-mono text-sm font-bold text-meama-gold">
                        {formatNumber(p.co_orders)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="h-1 w-16 bg-meama-charcoal">
                            <div className="h-full bg-meama-gold" style={{ width: `${strength * 100}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Machine + accessory bundles */}
      {machines.length > 0 && (
        <div>
          <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
            — Machine & Accessory Bundle Patterns
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {machines.slice(0, 8).map((p) => (
              <div key={`${p.sku_a}-${p.sku_b}`} className="card-m flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-meama-brown">
                    {p.name_a ?? p.sku_a} <span className="text-meama-gold">+</span> {p.name_b ?? p.sku_b}
                  </div>
                  <div className="font-mono text-[10px] text-meama-muted">{p.sku_a} · {p.sku_b}</div>
                </div>
                <span className="tabular shrink-0 font-mono text-lg font-bold text-meama-gold">
                  {formatNumber(p.co_orders)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Segment Intel tab ─────────────────────────────────────────────────────────
function SegmentIntelTab({ products }: { products: ProductSummary[] }) {
  const SEGMENT_ORDER = ["loyalist", "active", "at_risk", "lapsed", "new_machine", "prospect"];
  const SEGMENT_COLOR: Record<string, string> = {
    loyalist:    "text-meama-green",
    active:      "text-meama-gold",
    at_risk:     "text-meama-red",
    lapsed:      "text-meama-muted",
    new_machine: "text-meama-blue",
    prospect:    "text-meama-muted",
  };

  // Cross-tab: for each commercial category, show top 5 products by reorder rate
  const commercialGroups: Record<string, ProductSummary[]> = {};
  for (const p of products) {
    const cc = resolveCommercialCat(p) ?? "other";
    if (!commercialGroups[cc]) commercialGroups[cc] = [];
    commercialGroups[cc].push(p);
  }

  // Top products for returning customers (reorder_rate_90d × total_buyers)
  const topReturning = [...products]
    .filter((p) => p.total_buyers >= 5 && p.reorder_rate_90d > 0)
    .sort((a, b) => (b.reorder_rate_90d * b.total_buyers) - (a.reorder_rate_90d * a.total_buyers))
    .slice(0, 10);

  // Worst performers: low revenue, low reorder, sufficient buyers to be meaningful
  const worstPerformers = [...products]
    .filter((p) => p.total_buyers >= 3 && p.total_revenue > 0)
    .sort((a, b) => (a.revenue_30d + a.reorder_rate_90d * 1000) - (b.revenue_30d + b.reorder_rate_90d * 1000))
    .slice(0, 10);

  // Intensity distribution
  const intensityDist = { light: 0, medium: 0, strong: 0, unknown: 0 };
  for (const p of products) {
    const b = resolveIntensityBucket(p) ?? "unknown";
    intensityDist[b as keyof typeof intensityDist]++;
  }

  return (
    <div className="space-y-8">
      {/* Intensity distribution */}
      <div>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
          — Intensity Distribution
        </div>
        <div className="grid grid-cols-4 gap-3">
          {(["light", "medium", "strong", "unknown"] as const).map((b) => {
            const count = intensityDist[b];
            const pct = products.length > 0 ? count / products.length : 0;
            return (
              <div key={b} className="panel-dark border-l-2 border-l-[#3A423B]">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#9BA39C]">{b}</div>
                <div className={`tabular mt-1 font-display text-[28px] uppercase leading-none ${
                  b === "light" ? "text-meama-green" : b === "medium" ? "text-meama-gold" : b === "strong" ? "text-meama-red" : "text-meama-muted"
                }`}>{count}</div>
                <div className="font-mono text-xs text-[#CBD1CC]">{formatPercent(pct, 0)} of catalog</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top products for returning customers */}
      <div>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
          — Top Products · Returning Customer Magnets
        </div>
        <div className="overflow-x-auto border border-meama-charcoal">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-meama-charcoal">
                {["#", "Product", "Category", "Intensity", "Reorder 90d", "Buyers", "Retention", "Action"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topReturning.map((p, i) => {
                const ib = resolveIntensityBucket(p);
                return (
                  <tr key={p.sku} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                    <td className="px-3 py-2 font-mono text-xs text-meama-muted">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link to={`/products/${p.sku}`} className="font-medium text-meama-brown hover:text-meama-gold">
                        {p.name}
                      </Link>
                      <div className="font-mono text-[9px] text-meama-muted">{p.sku}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-meama-cream">{CAT_LABELS[p.category] ?? p.category}</td>
                    <td className="px-3 py-2">
                      {ib ? (
                        <span className={`font-mono text-[9px] uppercase px-1.5 py-0.5 ${
                          ib === "light" ? "bg-meama-green/10 text-meama-green" :
                          ib === "medium" ? "bg-meama-gold/10 text-meama-gold" :
                          "bg-meama-red/10 text-meama-red"
                        }`}>{ib}</span>
                      ) : <span className="text-meama-muted">—</span>}
                    </td>
                    <td className="tabular px-3 py-2 font-mono text-sm font-bold text-meama-green">
                      {formatPercent(p.reorder_rate_90d, 1)}
                    </td>
                    <td className="tabular px-3 py-2 font-mono text-xs text-meama-cream">{formatNumber(p.total_buyers)}</td>
                    <td className="tabular px-3 py-2 font-mono text-xs text-meama-cream">{formatPercent(p.retention_rate, 1)}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/customers?product_sku=${encodeURIComponent(p.sku)}`}
                        className="font-mono text-[9px] text-meama-gold hover:underline whitespace-nowrap"
                      >
                        Buyers →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Worst performers */}
      <div>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
          — Worst Performers · Low Revenue + Low Reorder
        </div>
        <div className="overflow-x-auto border border-meama-charcoal">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-meama-charcoal">
                {["Product", "Category", "Rev 30d", "Units 30d", "Reorder 90d", "Buyers", "Refund Rate", "Stock", "Action"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {worstPerformers.map((p) => (
                <tr key={p.sku} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                  <td className="px-3 py-2">
                    <Link to={`/products/${p.sku}`} className="font-medium text-meama-brown hover:text-meama-gold">
                      {p.name}
                    </Link>
                    <div className="font-mono text-[9px] text-meama-muted">{p.sku}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-meama-cream">{CAT_LABELS[p.category] ?? p.category}</td>
                  <td className="tabular px-3 py-2 text-meama-red font-semibold">{formatGEL0(p.revenue_30d)}</td>
                  <td className="tabular px-3 py-2 font-mono text-xs text-meama-cream">{formatNumber(p.units_sold_30d)}</td>
                  <td className="tabular px-3 py-2 font-mono text-xs text-meama-muted">{formatPercent(p.reorder_rate_90d, 1)}</td>
                  <td className="tabular px-3 py-2 font-mono text-xs text-meama-cream">{formatNumber(p.total_buyers)}</td>
                  <td className={`tabular px-3 py-2 font-mono text-xs ${p.refund_rate > 0.05 ? "text-meama-red font-bold" : "text-meama-muted"}`}>
                    {formatPercent(p.refund_rate, 2)}
                  </td>
                  <td className="px-3 py-2"><StockBadge status={p.stock_status} /></td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/customers?product_sku=${encodeURIComponent(p.sku)}`}
                      className="font-mono text-[9px] text-meama-gold/60 hover:text-meama-gold whitespace-nowrap"
                    >
                      Buyers →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category breakdown: top 5 by reorder per commercial type */}
      <div>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
          — Top 5 by Reorder Rate · per Commercial Category
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {(["coffee", "tea", "wellness"] as const).map((cc) => {
            const group = (commercialGroups[cc] ?? [])
              .filter((p) => p.total_buyers >= 3)
              .sort((a, b) => b.reorder_rate_90d - a.reorder_rate_90d)
              .slice(0, 5);
            if (group.length === 0) return null;
            return (
              <div key={cc} className="panel-dark border-l-2 border-l-[#3A423B]">
                <div className={`mb-3 font-mono text-[10px] uppercase tracking-wider font-bold ${
                  cc === "coffee" ? "text-meama-gold" : cc === "tea" ? "text-meama-green" : "text-meama-blue"
                }`}>{cc}</div>
                <div className="space-y-2">
                  {group.map((p, i) => (
                    <div key={p.sku} className="flex items-center gap-2">
                      <span className="tabular w-3 font-mono text-[10px] text-[#727B73]">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <Link to={`/products/${p.sku}`} className="truncate block text-[11px] font-medium text-[#F5F7F5] hover:text-meama-gold">
                          {p.name}
                        </Link>
                        <div className="mt-0.5 h-px bg-[#222823]">
                          <div className="h-full bg-[#16823F]" style={{ width: `${Math.min(p.reorder_rate_90d * 100, 100)}%` }} />
                        </div>
                      </div>
                      <span className="tabular shrink-0 font-mono text-xs font-bold text-[#F5F7F5]">
                        {formatPercent(p.reorder_rate_90d, 1)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-[#222823] pt-2">
                  <Link
                    to={`/customers?beverage_type=${cc}`}
                    className="font-mono text-[9px] text-meama-gold/60 hover:text-meama-gold"
                  >
                    View {cc} buyers in Portfolios →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Segment legend */}
      <div>
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
          — Segment Quick Reference
        </div>
        <div className="flex flex-wrap gap-3">
          {SEGMENT_ORDER.map((seg) => (
            <div key={seg} className="flex items-center gap-1.5">
              <span className={`font-mono text-[10px] font-bold ${SEGMENT_COLOR[seg] ?? "text-meama-muted"}`}>
                {seg}
              </span>
              <Link
                to={`/customers?segment=${seg}`}
                className="font-mono text-[9px] text-meama-muted hover:text-meama-gold"
              >
                → view
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Products page ─────────────────────────────────────────────────────────
export default function Products() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("catalog");
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [caffeine, setCaffeine] = useState<"all" | "none" | "low" | "medium" | "high">("all");
  const [bioOnly, setBioOnly] = useState(false);
  const [hotcold, setHotcold] = useState<"all" | "hot" | "cold">("all");
  const [trendFilter, setTrendFilter] = useState<"all" | "up" | "down">("all");
  const [intensityFilter, setIntensityFilter] = useState<IntensityFilter>("all");
  const [commercialCat, setCommercialCat] = useState<CommercialCat>("all");
  const [flavorSearch, setFlavorSearch] = useState("");
  const [performerFilter, setPerformerFilter] = useState<PerformerFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [showExport, setShowExport] = useState(false);
  const [visibleCount, setVisibleCount] = useState(CATALOG_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchProducts()
      .then((r) => setProducts(r.products))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products]);

  const filtered = useMemo(() => {
    let out = products;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.flavor_profile ?? "").toLowerCase().includes(q) ||
        p.flavor_notes.some((f) => f.toLowerCase().includes(q))
      );
    }
    if (category !== "all") out = out.filter((p) => p.category === category);
    if (statusFilter !== "all") out = out.filter((p) => p.status === statusFilter);
    if (caffeine !== "all") out = out.filter((p) => caffeineBucket(p.caffeine_mg) === caffeine);
    if (bioOnly) out = out.filter((p) => p.bio);
    if (hotcold !== "all") {
      out = out.filter((p) => {
        const hc = (p.hot_cold ?? "").toLowerCase();
        return hotcold === "hot" ? hc.includes("hot") || hc.includes("ცხელი") : hc.includes("cold") || hc.includes("ცივ");
      });
    }
    if (trendFilter !== "all") {
      out = out.filter((p) => {
        const declining = (p.monthly_units[11] ?? 0) < (p.monthly_units[0] ?? 0);
        return trendFilter === "up" ? !declining : declining;
      });
    }
    if (intensityFilter !== "all") {
      out = out.filter((p) => resolveIntensityBucket(p) === intensityFilter);
    }
    if (commercialCat !== "all") {
      out = out.filter((p) => resolveCommercialCat(p) === commercialCat);
    }
    if (flavorSearch.trim()) {
      const fq = flavorSearch.toLowerCase().trim();
      out = out.filter((p) =>
        p.flavor_notes.some((f) => f.toLowerCase().includes(fq)) ||
        (p.flavor_profile ?? "").toLowerCase().includes(fq)
      );
    }
    if (performerFilter === "top_returning") {
      out = out.filter((p) => p.reorder_rate_90d > 0.1 && p.total_buyers >= 5);
      out = [...out].sort((a, b) => b.reorder_rate_90d - a.reorder_rate_90d);
      return out.slice(0, 20);
    }
    if (performerFilter === "worst") {
      out = out.filter((p) => p.total_buyers >= 3);
      out = [...out].sort((a, b) => a.revenue_30d - b.revenue_30d);
      return out.slice(0, 20);
    }
    return sortProducts(out, sortKey, sortDir);
  }, [products, search, category, statusFilter, caffeine, bioOnly, hotcold, trendFilter, intensityFilter, commercialCat, flavorSearch, performerFilter, sortKey, sortDir]);

  // Reset to the first batch whenever the filtered set changes (new search,
  // filter, sort, or the initial load) rather than keeping a stale scroll depth.
  useEffect(() => {
    setVisibleCount(CATALOG_BATCH_SIZE);
  }, [filtered]);

  const visibleProducts = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  // Infinite scroll: grow the visible batch as the sentinel nears the viewport,
  // so cards (and their photos) mount progressively instead of all at once.
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + CATALOG_BATCH_SIZE, filtered.length));
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length]);

  const TABS: { key: Tab; label: string }[] = [
    { key: "catalog", label: "Catalog" },
    { key: "revenue", label: "Revenue & Margin" },
    { key: "retention", label: "Retention" },
    { key: "affinity", label: "Bundling & Affinity" },
    { key: "segments", label: "Segment Intel" },
  ];

  const activeFilterCount = [
    search, category !== "all", statusFilter !== "all", caffeine !== "all", bioOnly,
    hotcold !== "all", trendFilter !== "all", intensityFilter !== "all",
    commercialCat !== "all", flavorSearch, performerFilter !== "all",
  ].filter(Boolean).length;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <PageHeader
          kicker="Products"
          kickerKa="პროდუქტები"
          title={t("pages.products.title")}
          subtitle={t("pages.products.subtitle")}
        />
        {/* Export dropdown */}
        <div className="relative shrink-0 pb-7">
          <button
            onClick={() => setShowExport((v) => !v)}
            className="border border-meama-charcoal px-4 py-2 font-mono text-xs font-medium text-meama-cream transition-colors hover:border-meama-gold hover:text-meama-gold"
          >
            Export ↓
          </button>
          {showExport && (
            <div className="absolute right-0 top-full z-10 mt-1 border border-meama-charcoal bg-meama-ivory shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
              <button
                onClick={() => { exportCSV(filtered); setShowExport(false); }}
                className="block w-full px-4 py-2 text-left font-mono text-xs text-meama-cream hover:bg-meama-roast hover:text-meama-brown"
              >
                Download CSV
              </button>
              <button
                onClick={() => { exportXLSX(filtered); setShowExport(false); }}
                className="block w-full border-t border-meama-charcoal px-4 py-2 text-left font-mono text-xs text-meama-cream hover:bg-meama-roast hover:text-meama-brown"
              >
                Download Excel (.xlsx)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-0 border-b border-meama-charcoal">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 font-mono text-xs font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-meama-gold text-meama-gold"
                : "text-meama-cream/50 hover:text-meama-brown"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 border border-meama-red/30 bg-meama-red/5 p-4 font-mono text-sm text-meama-red">
          ! Could not load products: {error}
        </div>
      )}

      {/* ── CATALOG TAB ──────────────────────────────────────────────────── */}
      {tab === "catalog" && (
        <div>
          {/* Filter bar — row 1: search + commercial filters */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search name / SKU / flavour…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-52 border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-brown placeholder-meama-muted focus:border-meama-gold focus:outline-none"
            />

            {/* Commercial category */}
            <select
              value={commercialCat}
              onChange={(e) => setCommercialCat(e.target.value as CommercialCat)}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              <option value="all">All categories</option>
              <option value="coffee">Coffee</option>
              <option value="tea">Tea</option>
              <option value="wellness">Wellness</option>
            </select>

            {/* Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>

            {/* Intensity */}
            <select
              value={intensityFilter}
              onChange={(e) => setIntensityFilter(e.target.value as IntensityFilter)}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              <option value="all">All intensity</option>
              <option value="light">Light (1–3)</option>
              <option value="medium">Medium (4–6)</option>
              <option value="strong">Strong (7+)</option>
            </select>

            {/* Flavour search */}
            <input
              type="text"
              placeholder="Flavour (e.g. caramel)…"
              value={flavorSearch}
              onChange={(e) => setFlavorSearch(e.target.value)}
              className="w-44 border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-brown placeholder-meama-muted focus:border-meama-gold focus:outline-none"
            />

            {/* Performer filter */}
            <select
              value={performerFilter}
              onChange={(e) => setPerformerFilter(e.target.value as PerformerFilter)}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              <option value="all">All performers</option>
              <option value="top_returning">Top · Returning buyers</option>
              <option value="worst">Worst · Low revenue</option>
            </select>

            {/* Caffeine */}
            <select
              value={caffeine}
              onChange={(e) => setCaffeine(e.target.value as typeof caffeine)}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              <option value="all">All caffeine</option>
              <option value="none">Caffeine-free</option>
              <option value="low">Low &lt;50mg</option>
              <option value="medium">50–100mg</option>
              <option value="high">High &gt;100mg</option>
            </select>

            {/* Hot/Cold */}
            <select
              value={hotcold}
              onChange={(e) => setHotcold(e.target.value as typeof hotcold)}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              <option value="all">Hot & Cold</option>
              <option value="hot">Hot only</option>
              <option value="cold">Cold only</option>
            </select>

            {/* Trend */}
            <select
              value={trendFilter}
              onChange={(e) => setTrendFilter(e.target.value as typeof trendFilter)}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              <option value="all">All trends</option>
              <option value="up">Trending ▲</option>
              <option value="down">Declining ▼</option>
            </select>

            {/* Bio toggle */}
            <button
              onClick={() => setBioOnly((v) => !v)}
              className={`px-3 py-1.5 font-mono text-xs transition-colors ${
                bioOnly
                  ? "bg-meama-brown text-meama-espresso"
                  : "border border-meama-charcoal text-meama-cream hover:border-meama-gold hover:text-meama-gold"
              }`}
            >
              BIO only
            </button>

            {/* Clear all filters */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setSearch(""); setCategory("all"); setStatusFilter("all"); setCaffeine("all");
                  setBioOnly(false); setHotcold("all"); setTrendFilter("all");
                  setIntensityFilter("all"); setCommercialCat("all");
                  setFlavorSearch(""); setPerformerFilter("all");
                }}
                className="border border-meama-red/40 px-3 py-1.5 font-mono text-xs text-meama-red hover:border-meama-red hover:bg-meama-red/5"
              >
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </button>
            )}
          </div>

          {/* Filter bar — row 2: sort + view */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>

            <button
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              className="border border-meama-charcoal px-2.5 py-1.5 font-mono text-xs text-meama-cream hover:border-meama-gold hover:text-meama-gold"
              title="Toggle sort direction"
            >
              {sortDir === "desc" ? "↓" : "↑"}
            </button>

            <div className="ml-auto flex">
              <button
                onClick={() => setView("grid")}
                className={`border border-meama-charcoal px-2.5 py-1.5 font-mono text-xs ${view === "grid" ? "bg-meama-brown text-meama-espresso" : "text-meama-cream hover:text-meama-gold"}`}
              >
                ⊞
              </button>
              <button
                onClick={() => setView("table")}
                className={`border-y border-r border-meama-charcoal px-2.5 py-1.5 font-mono text-xs ${view === "table" ? "bg-meama-brown text-meama-espresso" : "text-meama-cream hover:text-meama-gold"}`}
              >
                ≡
              </button>
            </div>
          </div>

          {/* Category chips */}
          {!loading && categories.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategory("all")}
                className={`px-3 py-1 font-mono text-[11px] transition-colors ${
                  category === "all"
                    ? "bg-meama-brown text-meama-espresso"
                    : "border border-meama-charcoal text-meama-cream/60 hover:border-meama-gold hover:text-meama-gold"
                }`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1 font-mono text-[11px] transition-colors ${
                    category === c
                      ? "bg-meama-brown text-meama-espresso"
                      : "border border-meama-charcoal text-meama-cream/60 hover:border-meama-gold hover:text-meama-gold"
                  }`}
                >
                  {CAT_LABELS[c] ?? c}
                </button>
              ))}
            </div>
          )}

          <div className="mb-3 font-mono text-[10px] text-meama-muted">
            {loading
              ? "Loading…"
              : `${filtered.length} products${visibleProducts.length < filtered.length ? ` · showing ${visibleProducts.length}` : ""}`}
          </div>

          {/* Grid view */}
          {view === "grid" && (
            <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {loading
                ? Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)
                : visibleProducts.map((p) => {
                    const monthly = p.monthly_units.length === 12 ? p.monthly_units : Array(12).fill(0);
                    const declining = monthly[11] < monthly[0];
                    return (
                      <div
                        key={p.sku}
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate(`/products/${p.sku}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") navigate(`/products/${p.sku}`);
                        }}
                        className="card-m card-m-hover block cursor-pointer"
                      >
                        <ProductImage src={p.image_url} name={p.name} />
                        <div className="mt-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-meama-gold">
                                {CAT_LABELS[p.category] ?? p.category}
                              </div>
                              <div className="truncate text-sm font-semibold text-meama-brown">{p.name}</div>
                              <div className="font-mono text-[9px] text-meama-muted">{p.sku}</div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="tabular border border-meama-gold/50 px-2 py-0.5 font-mono text-[11px] font-bold text-meama-gold">
                                {formatGEL(p.price)}
                              </span>
                              <StockBadge status={p.stock_status} />
                            </div>
                          </div>

                          {/* Intensity bar + bucket badge */}
                          {p.intensity_level != null && (
                            <div className="mt-2">
                              <IntensityBar value={p.intensity_level} />
                            </div>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {resolveIntensityBucket(p) && (
                              <span className={`font-mono text-[9px] uppercase tracking-wide px-1.5 py-0.5 ${
                                resolveIntensityBucket(p) === "light" ? "bg-meama-green/10 text-meama-green" :
                                resolveIntensityBucket(p) === "medium" ? "bg-meama-gold/10 text-meama-gold" :
                                "bg-meama-red/10 text-meama-red"
                              }`}>
                                {resolveIntensityBucket(p)}
                              </span>
                            )}
                            {resolveCommercialCat(p) && (
                              <span className="font-mono text-[9px] uppercase tracking-wide px-1.5 py-0.5 bg-meama-blue/10 text-meama-blue">
                                {resolveCommercialCat(p)}
                              </span>
                            )}
                            {p.bio && (
                              <span className="font-mono text-[9px] uppercase tracking-wide px-1.5 py-0.5 bg-meama-green/10 text-meama-green">
                                BIO
                              </span>
                            )}
                          </div>

                          {/* Flavour notes */}
                          {p.flavor_notes.length > 0 && (
                            <div className="mt-1 font-mono text-[9px] text-meama-muted truncate">
                              {p.flavor_notes.slice(0, 3).join(" · ")}
                            </div>
                          )}

                          {/* Caffeine */}
                          {p.caffeine && (
                            <div className="mt-0.5 font-mono text-[9px] text-meama-muted">
                              ⚡ {p.caffeine}
                            </div>
                          )}

                          {/* Top bundle partner */}
                          {p.top_bundle_name && (
                            <div className="mt-1 font-mono text-[9px] text-meama-muted">
                              + often with <span className="text-meama-cream">{p.top_bundle_name}</span>
                            </div>
                          )}

                          <div className="tabular mt-3 flex items-end justify-between border-t border-meama-charcoal pt-2">
                            <div className="text-xs text-meama-muted">
                              <span className="block font-bold text-meama-cream">
                                {formatNumber(p.units_sold_30d)} u · 30d
                              </span>
                              {p.repeat_rate > 0
                                ? <span className="text-[10px]">repeat {formatPercent(p.repeat_rate, 0)}</span>
                                : <span className="text-[10px]">hardware</span>}
                            </div>
                            <MiniBars
                              data={monthly}
                              width={90}
                              height={28}
                              color={declining ? "var(--meama-red)" : "var(--meama-gold)"}
                            />
                          </div>

                          {/* Portfolios cross-link — stopPropagation keeps this
                              from also triggering the card's own onClick navigation */}
                          <div className="mt-2 border-t border-meama-charcoal pt-2">
                            <Link
                              to={`/customers?product_sku=${encodeURIComponent(p.sku)}`}
                              className="font-mono text-[9px] text-meama-gold/60 hover:text-meama-gold transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View buyers in Portfolios →
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          )}

          {/* Table view */}
          {view === "table" && !loading && (
            <div className="overflow-x-auto border border-meama-charcoal">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-meama-charcoal">
                    {["Product", "Type", "Price", "Rev 30d", "Units 30d", "Intensity", "Flavours", "Caffeine", "Repeat", "Reorder 90d", "Bio", "Stock", "Trend", "Portfolios"].map((h) => (
                      <th key={h} className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((p) => {
                    const declining = (p.monthly_units[11] ?? 0) < (p.monthly_units[0] ?? 0);
                    const ib = resolveIntensityBucket(p);
                    const cc = resolveCommercialCat(p);
                    return (
                      <tr key={p.sku} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                        <td className="px-3 py-2">
                          <Link to={`/products/${p.sku}`} className="font-medium text-meama-brown hover:text-meama-gold">
                            {p.name}
                          </Link>
                          <div className="font-mono text-[9px] text-meama-muted">{p.sku}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-mono text-[10px] text-meama-cream">{CAT_LABELS[p.category] ?? p.category}</div>
                          {cc && (
                            <div className={`mt-0.5 font-mono text-[9px] uppercase ${
                              cc === "coffee" ? "text-meama-gold" : cc === "tea" ? "text-meama-green" : "text-meama-blue"
                            }`}>{cc}</div>
                          )}
                        </td>
                        <td className="tabular px-3 py-2 text-meama-cream">{formatGEL(p.price)}</td>
                        <td className="tabular px-3 py-2 font-semibold text-meama-brown">{formatGEL0(p.revenue_30d)}</td>
                        <td className="tabular px-3 py-2 text-meama-cream">{formatNumber(p.units_sold_30d)}</td>
                        <td className="px-3 py-2">
                          {p.intensity_level != null ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-12"><IntensityBar value={p.intensity_level} /></div>
                              {ib && (
                                <span className={`font-mono text-[9px] uppercase ${
                                  ib === "light" ? "text-meama-green" : ib === "medium" ? "text-meama-gold" : "text-meama-red"
                                }`}>{ib}</span>
                              )}
                            </div>
                          ) : <span className="text-meama-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-meama-muted max-w-[120px] truncate">
                          {p.flavor_notes.length > 0
                            ? p.flavor_notes.slice(0, 2).join(", ")
                            : p.flavor_profile
                              ? p.flavor_profile.split(",")[0]?.trim()
                              : <span>—</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-meama-cream">{p.caffeine ?? "—"}</td>
                        <td className="tabular px-3 py-2 font-mono text-xs text-meama-cream">{formatPercent(p.repeat_rate, 0)}</td>
                        <td className={`tabular px-3 py-2 font-mono text-xs font-bold ${p.reorder_rate_90d > 0.15 ? "text-meama-green" : p.reorder_rate_90d > 0.05 ? "text-meama-gold" : "text-meama-muted"}`}>
                          {formatPercent(p.reorder_rate_90d, 1)}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs">
                          {p.bio ? <span className="text-meama-green">✓</span> : <span className="text-meama-muted">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <StockBadge status={p.stock_status} />
                        </td>
                        <td className={`px-3 py-2 text-center font-mono text-xs ${declining ? "text-meama-red" : "text-meama-green"}`}>
                          {declining ? "▼" : "▲"}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            to={`/customers?product_sku=${encodeURIComponent(p.sku)}`}
                            className="font-mono text-[9px] text-meama-gold/60 hover:text-meama-gold transition-colors whitespace-nowrap"
                          >
                            Buyers →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Infinite-scroll sentinel — pulls in the next batch as it nears
              the viewport; the button is a visible, no-JS-scroll-math fallback. */}
          {!loading && visibleProducts.length < filtered.length && (
            <div ref={loadMoreRef} className="mt-6 flex justify-center">
              <button
                onClick={() => setVisibleCount((c) => Math.min(c + CATALOG_BATCH_SIZE, filtered.length))}
                className="border border-meama-charcoal px-4 py-2 font-mono text-xs text-meama-cream transition-colors hover:border-meama-gold hover:text-meama-gold"
              >
                Load more ({filtered.length - visibleProducts.length} remaining)
              </button>
            </div>
          )}

          {!loading && filtered.length === 0 && !error && (
            <div className="mt-12 text-center font-mono text-sm text-meama-muted">
              [ — ] No products match the current filters.
            </div>
          )}
        </div>
      )}

      {/* ── REVENUE TAB ──────────────────────────────────────────────────── */}
      {tab === "revenue" && !loading && <RevenueTab products={products} />}

      {/* ── RETENTION TAB ────────────────────────────────────────────────── */}
      {tab === "retention" && !loading && <RetentionTab products={products} />}

      {/* ── AFFINITY TAB ─────────────────────────────────────────────────── */}
      {tab === "affinity" && <AffinityTab />}

      {/* ── SEGMENT INTEL TAB ────────────────────────────────────────────── */}
      {tab === "segments" && !loading && <SegmentIntelTab products={products} />}

      {/* Loading state for non-catalog tabs */}
      {loading && tab !== "catalog" && (
        <div className="font-mono text-sm text-meama-muted">Loading product data…</div>
      )}
    </div>
  );
}
