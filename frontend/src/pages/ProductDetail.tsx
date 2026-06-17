import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import { AiPanel } from "../components/AiPanel";
import { Kicker } from "../components/Kicker";
import { StatCallout } from "../components/StatCallout";
import {
  type ProductCustomerRow,
  type ProductSummary,
  fetchProduct,
  fetchProductCustomers,
} from "../lib/api";
import { formatGEL, formatGEL0, formatNumber, formatPercent } from "../lib/format";
import { PageHeader } from "./PageHeader";

// Business rule constants — must match business_rules.py
const MIN_PRICE_MULTIPLIER = 1.6667;
const CHURN_SCORE_ALERT = 0.7;

const MONTHS = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];

const CAT_LABELS: Record<string, { en: string; ka: string }> = {
  machine:   { en: "Machines & Hardware", ka: "აპარატები" },
  capsule:   { en: "Capsules", ka: "კაფსულები" },
  accessory: { en: "Accessories", ka: "აქსესუარები" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ProductImage({ src, name }: { src: string | null; name: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="flex h-48 w-full items-center justify-center bg-meama-charcoal">
        <span className="font-mono text-xs text-meama-muted">[ IMG ]</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      onError={() => setErr(true)}
      className="h-48 w-full object-contain bg-meama-charcoal p-4"
    />
  );
}

function IntensityBar({ value, max = 12, label }: { value: number | null; max?: number; label: string }) {
  if (value === null) return null;
  const pct = Math.min(1, value / max) * 100;
  return (
    <div>
      <div className="mb-0.5 flex justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-meama-muted">{label}</span>
        <span className="tabular font-mono text-[10px] text-meama-cream">{value}/{max}</span>
      </div>
      <div className="h-1 bg-meama-charcoal">
        <div className="h-full bg-meama-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Segment chip ──────────────────────────────────────────────────────────────
function SegmentChip({ segment }: { segment: string | null }) {
  if (!segment) return <span className="text-meama-muted text-[10px]">—</span>;
  const colors: Record<string, string> = {
    champion: "bg-meama-green/10 text-meama-green border-meama-green/30",
    capsule_loyalist: "bg-meama-gold/10 text-meama-gold border-meama-gold/30",
    flavour_explorer: "bg-meama-blue/10 text-meama-blue border-meama-blue/30",
    regular: "border-meama-charcoal text-meama-muted",
    at_risk: "bg-meama-red/10 text-meama-red border-meama-red/30",
    lost: "bg-meama-red/15 text-meama-red border-meama-red/40",
    new: "bg-meama-blue/10 text-meama-blue border-meama-blue/30",
  };
  const labels: Record<string, string> = {
    champion: "Champion",
    capsule_loyalist: "Loyalist",
    flavour_explorer: "Explorer",
    regular: "Regular",
    at_risk: "At Risk",
    lost: "Lost",
    new: "New",
  };
  return (
    <span className={`inline-block border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${colors[segment] ?? "border-meama-charcoal text-meama-muted"}`}>
      {labels[segment] ?? segment}
    </span>
  );
}

// ── Top Customers section ─────────────────────────────────────────────────────
function TopCustomers({ sku }: { sku: string }) {
  const [rows, setRows] = useState<ProductCustomerRow[] | null>(null);

  useEffect(() => {
    fetchProductCustomers(sku, 20)
      .then(setRows)
      .catch(() => setRows([]));
  }, [sku]);

  if (rows === null) {
    return (
      <div className="card-m">
        <Kicker>Top Customers</Kicker>
        <div className="mt-3 space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-3 w-24 animate-pulse rounded bg-meama-charcoal" />
              <div className="h-3 flex-1 animate-pulse rounded bg-meama-charcoal" />
              <div className="h-3 w-16 animate-pulse rounded bg-meama-charcoal" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card-m">
        <Kicker>Top Customers</Kicker>
        <p className="mt-3 font-mono text-xs text-meama-muted">
          No customer purchase data available for this SKU yet.
        </p>
      </div>
    );
  }

  const maxSpend = rows[0]?.total_spend ?? 1;

  return (
    <div className="card-m">
      <Kicker>{`Top Customers · ${rows.length} shown · sorted by spend`}</Kicker>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-meama-charcoal">
              {["#", "Customer", "Segment", "Units", "Spend", "Last Purchase", "Churn"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-left last:text-right"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const churnColor =
                r.churn_score == null
                  ? "text-meama-muted"
                  : r.churn_score >= CHURN_SCORE_ALERT
                  ? "text-meama-red font-bold"
                  : r.churn_score >= 0.4
                  ? "text-meama-gold"
                  : "text-meama-green";
              const barW = maxSpend > 0 ? (r.total_spend / maxSpend) * 100 : 0;
              return (
                <tr key={r.customer_id} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                  <td className="px-3 py-2 font-mono text-[10px] text-meama-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/customers/${r.customer_id}?from=products&product_sku=${sku}`}
                      className="font-mono text-xs font-bold text-meama-brown hover:text-meama-gold"
                    >
                      {r.customer_id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <SegmentChip segment={r.rfm_segment} />
                  </td>
                  <td className="tabular px-3 py-2 font-mono text-xs text-meama-cream">
                    {formatNumber(r.total_units)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-16 bg-meama-charcoal">
                        <div className="h-full bg-meama-gold" style={{ width: `${barW}%` }} />
                      </div>
                      <span className="tabular font-semibold text-meama-brown">
                        {formatGEL0(r.total_spend)}
                      </span>
                    </div>
                  </td>
                  <td className="tabular px-3 py-2 font-mono text-xs text-meama-muted">
                    {r.last_purchase_date
                      ? new Date(r.last_purchase_date).toLocaleDateString("ka-GE", {
                          timeZone: "Asia/Tbilisi",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className={`tabular px-3 py-2 text-right font-mono text-xs ${churnColor}`}>
                    {r.churn_score != null ? r.churn_score.toFixed(2) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-right">
        <Link
          to={`/customers?product_sku=${sku}`}
          className="font-mono text-[10px] font-bold uppercase tracking-wider text-meama-gold hover:underline"
        >
          View all customers →
        </Link>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProductDetail() {
  const { t } = useTranslation();
  const { sku } = useParams<{ sku: string }>();
  const [searchParams] = useSearchParams();
  const [product, setProduct] = useState<ProductSummary | null | "not_found">(null);

  useEffect(() => {
    if (!sku) { setProduct("not_found"); return; }
    fetchProduct(sku)
      .then(setProduct)
      .catch(() => setProduct("not_found"));
  }, [sku]);

  if (product === null) {
    return (
      <div className="space-y-4 p-8">
        <div className="h-3 w-32 animate-pulse rounded bg-meama-charcoal" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-meama-charcoal" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded bg-meama-charcoal" />)}
        </div>
      </div>
    );
  }
  if (product === "not_found") {
    return <Navigate to="/products" replace />;
  }

  const p = product;
  const monthly = p.monthly_units.length === 12 ? p.monthly_units : Array(12).fill(0);
  const maxMonthly = Math.max(...monthly, 1);
  const declining = monthly[11] < monthly[0];
  const cat = CAT_LABELS[p.category];
  const promoFloor = p.cogs != null ? p.cogs * MIN_PRICE_MULTIPLIER : null;
  const maxSafeDiscount = promoFloor != null ? Math.max(0, 1 - promoFloor / p.price) : null;
  const marginPerUnit = p.cogs != null ? (p.price - p.cogs) / p.price : null;

  // Incoming context — e.g. navigated from a customer page
  const fromCustomer = searchParams.get("customer_id");

  return (
    <div>
      {/* Back link — context-aware */}
      <div className="mb-4 flex items-center gap-4">
        <Link
          to="/products"
          className="font-mono text-xs font-bold uppercase tracking-wider text-meama-gold hover:underline"
        >
          ← {t("pages.productDetail.back")}
        </Link>
        {fromCustomer && (
          <Link
            to={`/customers/${fromCustomer}`}
            className="font-mono text-xs uppercase tracking-wider text-meama-muted hover:text-meama-gold"
          >
            ← Back to customer {fromCustomer}
          </Link>
        )}
      </div>

      <PageHeader
        kicker={cat?.en ?? p.category}
        kickerKa={cat?.ka}
        title={p.name}
        subtitle={p.subcategory ?? undefined}
      />

      {/* Hero row: image + quick facts */}
      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="card-m overflow-hidden !p-0">
          <ProductImage src={p.image_url} name={p.name} />
          <div className="p-4">
            <div className="font-mono text-[10px] text-meama-muted">{p.sku}</div>
            <div className="tabular mt-1 text-xl font-bold text-meama-brown">{formatGEL(p.price)}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.bio && (
                <span className="border border-meama-green px-2 py-0.5 font-mono text-[10px] text-meama-green">BIO</span>
              )}
              {p.caffeine && (
                <span className="border border-meama-charcoal px-2 py-0.5 font-mono text-[10px] text-meama-cream">
                  ⚡ {p.caffeine}
                </span>
              )}
              {p.capsule_format && (
                <span className="border border-meama-charcoal px-2 py-0.5 font-mono text-[10px] text-meama-cream">
                  {p.capsule_format}
                </span>
              )}
              {p.hot_cold && (
                <span className="border border-meama-charcoal px-2 py-0.5 font-mono text-[10px] text-meama-cream">
                  {p.hot_cold}
                </span>
              )}
            </div>
            {/* Quick-links to cross-tabs */}
            <div className="mt-3 flex gap-3 border-t border-meama-charcoal pt-3">
              <Link
                to={`/customers?product_sku=${p.sku}`}
                className="font-mono text-[10px] text-meama-muted hover:text-meama-gold"
              >
                Customers →
              </Link>
              <Link
                to={`/stock?sku=${p.sku}`}
                className="font-mono text-[10px] text-meama-muted hover:text-meama-gold"
              >
                Stock →
              </Link>
            </div>
          </div>
        </div>

        {/* Product attributes from Bible */}
        <div className="card-m space-y-4">
          <Kicker>Profile</Kicker>
          {p.intensity_level != null && (
            <IntensityBar value={p.intensity_level} label="Intensity" />
          )}
          {p.bitterness != null && (
            <IntensityBar value={p.bitterness} label="Bitterness" />
          )}
          {p.arabica_pct != null && (
            <IntensityBar
              value={p.arabica_pct > 1 ? p.arabica_pct : Math.round(p.arabica_pct * 100)}
              max={100}
              label="Arabica %"
            />
          )}
          {p.robusta_pct != null && (
            <IntensityBar
              value={p.robusta_pct > 1 ? p.robusta_pct : Math.round(p.robusta_pct * 100)}
              max={100}
              label="Robusta %"
            />
          )}
          {p.flavor_profile && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-meama-muted">Flavor Profile</div>
              <div className="mt-0.5 text-sm text-meama-cream">{p.flavor_profile}</div>
            </div>
          )}
          {p.beverage_type && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-meama-muted">Beverage Type</div>
              <div className="mt-0.5 text-sm text-meama-cream">{p.beverage_type}</div>
            </div>
          )}
          {p.compatible_with && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-meama-muted">Compatible With</div>
              <div className="mt-0.5 text-sm text-meama-cream">{p.compatible_with}</div>
            </div>
          )}
          {p.intensity_level == null && p.flavor_profile == null && (
            <p className="text-sm text-meama-muted">Profile data not available for this SKU.</p>
          )}
        </div>

        {/* Ingredients */}
        <div className="card-m">
          <Kicker>Ingredients</Kicker>
          {p.ingredients ? (
            <p className="mt-2 text-sm leading-relaxed text-meama-cream/80">{p.ingredients}</p>
          ) : (
            <p className="mt-2 text-sm text-meama-muted">Not listed for this SKU.</p>
          )}
          {p.compatible_with && (
            <div className="mt-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-meama-muted">Machine</div>
              <div className="mt-0.5 text-sm text-meama-brown">{p.compatible_with}</div>
            </div>
          )}
          {/* Bundle partner */}
          {p.top_bundle_name && (
            <div className="mt-4 border-t border-meama-charcoal pt-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-meama-muted">Often bought with</div>
              <Link
                to={`/products/${p.top_bundle_sku}`}
                className="mt-0.5 block text-sm font-semibold text-meama-brown hover:text-meama-gold"
              >
                {p.top_bundle_name}
                <span className="ml-1 font-mono text-[10px] text-meama-muted">
                  ({formatNumber(p.top_bundle_count)}×)
                </span>
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="stagger space-y-5">
        {/* Sales KPIs */}
        <div className="panel-dark grid grid-cols-2 gap-6 lg:grid-cols-4">
          <StatCallout dark value={formatGEL0(p.revenue_30d)} tag="Revenue · 30d">
            {formatNumber(p.units_sold_30d)} units at list price.
          </StatCallout>
          <StatCallout
            dark
            value={marginPerUnit != null ? formatPercent(marginPerUnit, 0) : "—"}
            tag="Gross margin"
            tone="green"
          >
            {marginPerUnit != null
              ? `Per unit (COGS ${formatGEL(p.cogs!)})`
              : "COGS not loaded yet."}
          </StatCallout>
          <StatCallout
            dark
            value={p.total_buyers > 0 ? formatNumber(p.total_buyers) : "—"}
            tag="Total buyers"
            tone="blue"
          >
            Unique customers in last 13 months.
          </StatCallout>
          <StatCallout
            dark
            value={declining ? "▼ declining" : "▲ growing"}
            tag="12-mo trend"
            tone={declining ? "red" : "green"}
          >
            {declining ? "Units below year-ago level." : "Units above year-ago level."}
          </StatCallout>
        </div>

        {/* Channel split */}
        <div className="card-m">
          <Kicker>Channel Split · 30d</Kicker>
          <div className="mt-4 grid grid-cols-2 gap-6">
            {[
              {
                label: "E-Commerce (Web)",
                units: p.units_30d_web,
                revenue: p.revenue_30d_web,
                asp: p.avg_price_web,
              },
              {
                label: "Brand Store (POS)",
                units: p.units_30d_pos,
                revenue: p.revenue_30d_pos,
                asp: p.avg_price_pos,
              },
            ].map((ch) => (
              <div key={ch.label}>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-meama-gold">{ch.label}</div>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-meama-muted">Units</dt>
                    <dd className="tabular font-semibold text-meama-brown">{formatNumber(ch.units)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-meama-muted">Revenue</dt>
                    <dd className="tabular font-semibold text-meama-brown">{formatGEL0(ch.revenue)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-meama-muted">Avg. Selling Price</dt>
                    <dd className="tabular font-semibold text-meama-brown">
                      {ch.asp != null ? formatGEL(ch.asp) : <span className="text-meama-muted">—</span>}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
          <div className="mt-4 h-px bg-meama-charcoal" />
          <div className="tabular mt-3 flex items-center gap-3">
            {p.revenue_30d > 0 && (
              <>
                <div className="h-2 flex-none" style={{ width: `${(p.revenue_30d_web / p.revenue_30d) * 180}px`, background: "var(--meama-gold)" }} />
                <span className="font-mono text-[10px] text-meama-muted">
                  Web {formatPercent(p.revenue_30d > 0 ? p.revenue_30d_web / p.revenue_30d : 0, 0)}
                </span>
                <div className="h-2 flex-none" style={{ width: `${(p.revenue_30d_pos / p.revenue_30d) * 180}px`, background: "var(--meama-blue)" }} />
                <span className="font-mono text-[10px] text-meama-muted">
                  POS {formatPercent(p.revenue_30d > 0 ? p.revenue_30d_pos / p.revenue_30d : 0, 0)}
                </span>
              </>
            )}
            {p.revenue_30d === 0 && (
              <span className="font-mono text-[10px] text-meama-muted">No retail sales in last 30 days.</span>
            )}
          </div>
        </div>

        {/* Reorder rates */}
        <div className="card-m">
          <Kicker>Reorder & Retention</Kicker>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Reorder 30d", value: p.reorder_rate_30d },
              { label: "Reorder 60d", value: p.reorder_rate_60d },
              { label: "Reorder 90d", value: p.reorder_rate_90d },
              { label: "Retention 90d", value: p.retention_rate },
            ].map((r) => (
              <div key={r.label} className="border-t-2 border-meama-charcoal pt-3">
                <div className="tabular text-2xl font-bold text-meama-gold">
                  {formatPercent(r.value, 1)}
                </div>
                <div className="mt-1 h-1 bg-meama-charcoal">
                  <div className="h-full bg-meama-gold" style={{ width: `${r.value * 100}%` }} />
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-meama-muted">
                  {r.label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 font-mono text-[10px] text-meama-muted">
            Reorder = % who bought again within the window. Retention = % still active in last 90d.
            Based on {formatNumber(p.total_buyers)} unique buyers.
          </div>
        </div>

        {/* Monthly trend */}
        <div className="card-m">
          <Kicker>{t("pages.productDetail.history")}</Kicker>
          <div className="mt-4 flex h-44 items-end gap-1.5">
            {monthly.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="tabular text-[9px] font-semibold text-meama-muted">
                  {formatNumber(v)}
                </span>
                <div
                  className={`w-full ${
                    i === 11
                      ? "bg-meama-gold"
                      : declining
                        ? "bg-meama-red/40"
                        : "bg-meama-gold/40"
                  }`}
                  style={{ height: `${(v / maxMonthly) * 100}%`, minHeight: "2px" }}
                />
                <span className="text-[9px] text-meama-muted">{MONTHS[i]}</span>
              </div>
            ))}
          </div>
          <div className="tabular mt-2 flex justify-between font-mono text-[10px] text-meama-muted">
            <span>12 months ago</span>
            <span>Current month (partial)</span>
          </div>
        </div>

        {/* Promo guardrails */}
        {promoFloor != null && maxSafeDiscount != null && (
          <div className="card-m">
            <Kicker>Promo Guardrails</Kicker>
            <dl className="tabular mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              {[
                { label: "List price", value: formatGEL(p.price), color: "text-meama-brown" },
                { label: "COGS", value: formatGEL(p.cogs!), color: "text-meama-cream" },
                { label: "Min safe price (×1.6667)", value: formatGEL(promoFloor), color: "text-meama-green" },
                { label: "Max safe discount", value: formatPercent(Math.min(maxSafeDiscount, 0.25), 1), color: "text-meama-red" },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-meama-muted">{item.label}</dt>
                  <dd className={`mt-0.5 text-lg font-bold ${item.color}`}>{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 font-mono text-[10px] text-meama-muted">
              40% margin floor · 25% hard cap. Enforced by the Discount Engine.
            </p>
          </div>
        )}

        {/* Top customers — cross-tab link */}
        {sku && <TopCustomers sku={sku} />}

        <AiPanel title={`AI Insight — ${p.name}`} actionLabel="Generate fresh insight">
          {p.ai_insight ??
            "Insights for this SKU will appear after the next nightly Claude batch run."}
        </AiPanel>
      </div>
    </div>
  );
}
