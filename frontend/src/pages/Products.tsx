import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";

import { MiniBars } from "../components/MiniBars";
import { type AffinityPair, type ProductSummary, fetchAffinityPairs, fetchProducts } from "../lib/api";
import { formatGEL, formatGEL0, formatNumber, formatPercent } from "../lib/format";
import { PageHeader } from "./PageHeader";

// ── Category labels ────────────────────────────────────────────────────────────
const CAT_LABELS: Record<string, string> = {
  "Multicapsule": "Multicapsule", "European": "European Format",
  "Classic Coffee": "Classic Coffee", "Classic\xa0Coffee": "Classic Coffee",
  "BIO": "BIO", "Tea": "Tea", "Coffee Machine": "Machines",
  "Accessories": "Accessories", "Variety Pack": "Variety Packs",
  "Bundle": "Bundles", "Coffee Machine Replacement Parts": "Spare Parts",
  "Merch": "Merch", "Add On": "Add-Ons",
};

type Tab = "catalog" | "revenue" | "retention" | "affinity";
type SortKey = "revenue" | "units" | "price" | "repeat" | "reorder90" | "buyers" | "trend";
type SortDir = "desc" | "asc";

// ── Caffeine bucket ────────────────────────────────────────────────────────────
function caffeineBucket(mg: number | null): "none" | "low" | "medium" | "high" {
  if (mg === null) return "none";
  if (mg === 0) return "none";
  if (mg < 50) return "low";
  if (mg < 100) return "medium";
  return "high";
}

// ── Product image placeholder ─────────────────────────────────────────────────
function ProductImage({ src, name }: { src: string | null; name: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex h-28 w-full items-center justify-center bg-meama-charcoal">
        <span className="font-mono text-[10px] text-meama-muted">[ IMG ]</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      onError={() => setErr(true)}
      className="h-28 w-full object-contain bg-meama-charcoal p-2"
      loading="lazy"
    />
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

// ── Filter/sort bar ───────────────────────────────────────────────────────────
interface FiltersState {
  search: string;
  category: string;
  caffeine: "all" | "none" | "low" | "medium" | "high";
  bio: boolean;
  hotcold: "all" | "hot" | "cold";
  trend: "all" | "up" | "down";
  sortKey: SortKey;
  sortDir: SortDir;
  view: "grid" | "table";
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "revenue", label: "Revenue 30d" },
  { key: "units", label: "Units 30d" },
  { key: "price", label: "Price" },
  { key: "repeat", label: "Repeat rate" },
  { key: "reorder90", label: "Reorder 90d" },
  { key: "buyers", label: "Total buyers" },
  { key: "trend", label: "Trend" },
];

function sortProducts(products: ProductSummary[], key: SortKey, dir: SortDir): ProductSummary[] {
  const multiplier = dir === "desc" ? -1 : 1;
  return [...products].sort((a, b) => {
    let va = 0, vb = 0;
    switch (key) {
      case "revenue":  va = a.revenue_30d; vb = b.revenue_30d; break;
      case "units":    va = a.units_sold_30d; vb = b.units_sold_30d; break;
      case "price":    va = a.price; vb = b.price; break;
      case "repeat":   va = a.repeat_rate; vb = b.repeat_rate; break;
      case "reorder90": va = a.reorder_rate_90d; vb = b.reorder_rate_90d; break;
      case "buyers":   va = a.total_buyers; vb = b.total_buyers; break;
      case "trend":    va = a.monthly_units[11] ?? 0; vb = b.monthly_units[11] ?? 0; break;
    }
    return (va - vb) * multiplier;
  });
}

// ── Revenue tab ───────────────────────────────────────────────────────────────
function RevenueTab({ products }: { products: ProductSummary[] }) {
  const top = [...products].sort((a, b) => b.revenue_30d - a.revenue_30d).slice(0, 20);
  const totalRev = products.reduce((s, p) => s + p.revenue_30d, 0);
  const totalWeb = products.reduce((s, p) => s + p.revenue_30d_web, 0);
  const totalPos = products.reduce((s, p) => s + p.revenue_30d_pos, 0);
  const capsules = products.filter((p) => p.repeat_rate > 0 && p.revenue_30d > 0);
  const activeCapsuleBuyers = new Set<string>();
  // Use repeat_rate as proxy for active capsule customers (can't enumerate here)
  const avgMonthlySpend = capsules.length > 0
    ? capsules.reduce((s, p) => s + p.revenue_30d, 0) / Math.max(1, capsules.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Revenue · 30d", value: formatGEL0(totalRev) },
          { label: "E-Commerce", value: formatGEL0(totalWeb), sub: totalRev ? `${((totalWeb/totalRev)*100).toFixed(0)}%` : "—" },
          { label: "Brand Store", value: formatGEL0(totalPos), sub: totalRev ? `${((totalPos/totalRev)*100).toFixed(0)}%` : "—" },
          { label: "Avg Capsule Rev / SKU", value: formatGEL0(avgMonthlySpend) },
        ].map((s) => (
          <div key={s.label} className="panel-dark border-l-2 border-l-[#3A3A3A]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#9A9590]">{s.label}</div>
            <div className="tabular mt-1 font-display text-[28px] uppercase leading-none text-[#F4F0EA]">{s.value}</div>
            {s.sub ? <div className="font-mono text-xs text-[#C8C3BC]">{s.sub} of total</div> : null}
          </div>
        ))}
      </div>

      {/* Ranked table */}
      <div>
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-meama-gold">
          — Top 20 by Revenue · 30d
        </div>
        <div className="overflow-x-auto border border-meama-charcoal">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-meama-charcoal">
                {["#", "Product", "Category", "Price", "Rev 30d", "Web", "POS", "ASP Web", "ASP POS", "Repeat"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map((p, i) => {
                const declining = (p.monthly_units[11] ?? 0) < (p.monthly_units[0] ?? 0);
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
                    <td className="tabular px-3 py-2 text-right text-meama-cream">{formatGEL(p.price)}</td>
                    <td className="tabular px-3 py-2 text-right font-semibold text-meama-brown">{formatGEL0(p.revenue_30d)}</td>
                    <td className="tabular px-3 py-2 text-right text-meama-cream">{formatGEL0(p.revenue_30d_web)}</td>
                    <td className="tabular px-3 py-2 text-right text-meama-cream">{formatGEL0(p.revenue_30d_pos)}</td>
                    <td className="tabular px-3 py-2 text-right text-meama-cream">
                      {p.avg_price_web != null ? formatGEL(p.avg_price_web) : <span className="text-meama-muted">—</span>}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-meama-cream">
                      {p.avg_price_pos != null ? formatGEL(p.avg_price_pos) : <span className="text-meama-muted">—</span>}
                    </td>
                    <td className={`tabular px-3 py-2 text-right font-mono ${declining ? "text-meama-red" : "text-meama-green"}`}>
                      {formatPercent(p.repeat_rate, 0)}
                    </td>
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
          — Revenue Growth by Month · Top 6 SKUs
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
                <div className="mt-3 flex items-end gap-1" style={{ height: 40 }}>
                  {monthly.map((v, i) => {
                    const max = Math.max(...monthly, 1);
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-t-none ${i === 11 ? "bg-meama-gold" : declining ? "bg-meama-red/40" : "bg-meama-gold/35"}`}
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

      {/* Promo behavior — pending */}
      <div className="border border-dashed border-meama-charcoal p-6">
        <div className="font-mono text-[10px] uppercase tracking-wider text-meama-muted">
          — Promo Behavior
        </div>
        <p className="mt-2 font-mono text-sm text-meama-muted">
          Promo vs. non-promo velocity and campaign rankings will appear once the ETL
          ingests promo codes from the order data. Fields needed:{" "}
          <code className="text-meama-gold">discount_codes</code> /{" "}
          <code className="text-meama-gold">discount_amount</code> per order.
        </p>
      </div>
    </div>
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

  return (
    <div className="space-y-6">
      {/* Which capsule brings customers back */}
      <div className="panel-dark border-l-2 border-l-[#3A3A3A]">
        <div className="mb-4 font-mono text-[9.5px] uppercase tracking-[0.3em] text-[#9A9590]">
          — Capsules That Bring Customers Back Most · 90d Retention Rate
        </div>
        <div className="space-y-3">
          {topRetention.map((p, i) => (
            <div key={p.sku} className="flex items-center gap-3">
              <span className="tabular w-4 font-mono text-xs text-[#5A5A5A]">{i + 1}</span>
              <div className="flex-1">
                <div className="text-sm font-medium text-[#F4F0EA]">{p.name}</div>
                <div className="mt-1 h-px bg-[#2A2A2A]">
                  <div className="h-full bg-[#F4F0EA]" style={{ width: `${p.retention_rate * 100}%` }} />
                </div>
              </div>
              <span className="tabular font-display text-xl text-[#F4F0EA]">
                {formatPercent(p.retention_rate, 1)}
              </span>
              <span className="font-mono text-[10px] text-[#5A5A5A]">{p.total_buyers} buyers</span>
            </div>
          ))}
        </div>
      </div>

      {/* Window toggle + table */}
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
                {["Product", "Category", "Buyers", "Reorder Rate", "Retention 90d", "Repeat"].map((h) => (
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
                          <div className="h-full bg-meama-gold" style={{ width: `${rate * 100}%` }} />
                        </div>
                        <span className={`tabular font-mono text-xs font-bold ${rate > 0.15 ? "text-meama-green" : rate > 0.05 ? "text-meama-gold" : "text-meama-muted"}`}>
                          {formatPercent(rate, 1)}
                        </span>
                      </div>
                    </td>
                    <td className={`tabular px-3 py-2 font-mono text-xs ${p.retention_rate > 0.2 ? "text-meama-green" : "text-meama-muted"}`}>
                      {formatPercent(p.retention_rate, 1)}
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

// ── Main Products page ─────────────────────────────────────────────────────────
export default function Products() {
  const { t } = useTranslation();

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
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [showExport, setShowExport] = useState(false);

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
      out = out.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    if (category !== "all") out = out.filter((p) => p.category === category);
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
    return sortProducts(out, sortKey, sortDir);
  }, [products, search, category, caffeine, bioOnly, hotcold, trendFilter, sortKey, sortDir]);

  const TABS: { key: Tab; label: string }[] = [
    { key: "catalog", label: "Catalog" },
    { key: "revenue", label: "Revenue & Margin" },
    { key: "retention", label: "Retention" },
    { key: "affinity", label: "Bundling & Affinity" },
  ];

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
          {/* Filter bar */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {/* Search */}
            <input
              type="text"
              placeholder="Search name / SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-brown placeholder-meama-muted focus:border-meama-gold focus:outline-none"
            />

            {/* Caffeine */}
            <select
              value={caffeine}
              onChange={(e) => setCaffeine(e.target.value as typeof caffeine)}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              <option value="all">All caffeine</option>
              <option value="none">Caffeine-free</option>
              <option value="low">Low (&lt;50mg)</option>
              <option value="medium">Medium (50-100mg)</option>
              <option value="high">High (&gt;100mg)</option>
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

            {/* Sort */}
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

            {/* View toggle */}
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
            {loading ? "Loading…" : `${filtered.length} products`}
          </div>

          {/* Grid view */}
          {view === "grid" && (
            <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {loading
                ? Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)
                : filtered.map((p) => {
                    const monthly = p.monthly_units.length === 12 ? p.monthly_units : Array(12).fill(0);
                    const declining = monthly[11] < monthly[0];
                    return (
                      <Link key={p.sku} to={`/products/${p.sku}`} className="card-m card-m-hover block">
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
                            <span className="tabular shrink-0 border border-meama-gold/50 px-2 py-0.5 font-mono text-[11px] font-bold text-meama-gold">
                              {formatGEL(p.price)}
                            </span>
                          </div>

                          {/* Intensity + caffeine */}
                          {p.intensity_level != null && (
                            <div className="mt-2">
                              <IntensityBar value={p.intensity_level} />
                            </div>
                          )}
                          {p.caffeine && (
                            <div className="mt-1 font-mono text-[9px] text-meama-muted">
                              ⚡ {p.caffeine}
                              {p.bio && <span className="ml-2 text-meama-green">· BIO</span>}
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
                        </div>
                      </Link>
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
                    {["Product", "Category", "Price", "Rev 30d", "Units 30d", "Caffeine", "Intensity", "Repeat", "Reorder 90d", "Bio", "Trend"].map((h) => (
                      <th key={h} className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-left last:text-center">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const declining = (p.monthly_units[11] ?? 0) < (p.monthly_units[0] ?? 0);
                    return (
                      <tr key={p.sku} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                        <td className="px-3 py-2">
                          <Link to={`/products/${p.sku}`} className="font-medium text-meama-brown hover:text-meama-gold">
                            {p.name}
                          </Link>
                          <div className="font-mono text-[9px] text-meama-muted">{p.sku}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-meama-cream">{CAT_LABELS[p.category] ?? p.category}</td>
                        <td className="tabular px-3 py-2 text-meama-cream">{formatGEL(p.price)}</td>
                        <td className="tabular px-3 py-2 font-semibold text-meama-brown">{formatGEL0(p.revenue_30d)}</td>
                        <td className="tabular px-3 py-2 text-meama-cream">{formatNumber(p.units_sold_30d)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-meama-cream">{p.caffeine ?? "—"}</td>
                        <td className="px-3 py-2">
                          {p.intensity_level != null
                            ? <div className="w-16"><IntensityBar value={p.intensity_level} /></div>
                            : <span className="text-meama-muted">—</span>}
                        </td>
                        <td className="tabular px-3 py-2 font-mono text-xs text-meama-cream">{formatPercent(p.repeat_rate, 0)}</td>
                        <td className={`tabular px-3 py-2 font-mono text-xs font-bold ${p.reorder_rate_90d > 0.15 ? "text-meama-green" : p.reorder_rate_90d > 0.05 ? "text-meama-gold" : "text-meama-muted"}`}>
                          {formatPercent(p.reorder_rate_90d, 1)}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs">
                          {p.bio ? <span className="text-meama-green">✓</span> : <span className="text-meama-muted">—</span>}
                        </td>
                        <td className={`px-3 py-2 text-center font-mono text-xs ${declining ? "text-meama-red" : "text-meama-green"}`}>
                          {declining ? "▼" : "▲"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

      {/* Loading state for non-catalog tabs */}
      {loading && tab !== "catalog" && (
        <div className="font-mono text-sm text-meama-muted">Loading product data…</div>
      )}
    </div>
  );
}
