import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router-dom";

import { AiPanel } from "../components/AiPanel";
import { Kicker } from "../components/Kicker";
import { StatCallout } from "../components/StatCallout";
import { type ProductSummary, fetchProducts } from "../lib/api";
import { formatGEL, formatGEL0, formatNumber, formatPercent } from "../lib/format";
import { PageHeader } from "./PageHeader";

const MONTHS = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
const MIN_PRICE_MULTIPLIER = 1.6667;

const CAT_LABELS: Record<string, { en: string; ka: string }> = {
  machine:   { en: "Machines & Hardware", ka: "აპარატები" },
  capsule:   { en: "Capsules", ka: "კაფსულები" },
  accessory: { en: "Accessories", ka: "აქსესუარები" },
};

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

export default function ProductDetail() {
  const { t } = useTranslation();
  const { sku } = useParams<{ sku: string }>();
  const [product, setProduct] = useState<ProductSummary | null | "not_found">(null);

  useEffect(() => {
    fetchProducts()
      .then((r) => {
        const hit = r.products.find((p) => p.sku === sku);
        setProduct(hit ?? "not_found");
      })
      .catch(() => setProduct("not_found"));
  }, [sku]);

  if (product === null) {
    return <div className="p-8 text-center font-mono text-meama-muted">Loading…</div>;
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

  return (
    <div>
      <Link
        to="/products"
        className="mb-4 inline-block font-mono text-xs font-bold uppercase tracking-wider text-meama-gold hover:underline"
      >
        ← {t("pages.productDetail.back")}
      </Link>

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
                <span className="font-mono text-[10px] text-meama-muted">Web {formatPercent(p.revenue_30d > 0 ? p.revenue_30d_web/p.revenue_30d : 0, 0)}</span>
                <div className="h-2 flex-none" style={{ width: `${(p.revenue_30d_pos / p.revenue_30d) * 180}px`, background: "var(--meama-blue)" }} />
                <span className="font-mono text-[10px] text-meama-muted">POS {formatPercent(p.revenue_30d > 0 ? p.revenue_30d_pos/p.revenue_30d : 0, 0)}</span>
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

        <AiPanel title={`AI Insight — ${p.name}`} actionLabel="Generate fresh insight">
          {p.ai_insight ??
            "Insights for this SKU will appear after the next nightly Claude batch run."}
        </AiPanel>
      </div>
    </div>
  );
}
