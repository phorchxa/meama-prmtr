import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router-dom";

import { AiPanel } from "../components/AiPanel";
import { IntensityDots } from "../components/IntensityDots";
import { Kicker } from "../components/Kicker";
import { StatCallout } from "../components/StatCallout";
import { formatGEL, formatGEL0, formatNumber, formatPercent } from "../lib/format";
import { CATEGORIES, PRODUCT_AI, PRODUCT_DESCRIPTIONS } from "../lib/mock";
import { PageHeader } from "./PageHeader";

const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
// Business rule: min safe promo price = COGS × 1.6667 (40% margin floor).
const MIN_PRICE_MULTIPLIER = 1.6667;

export default function ProductDetail() {
  const { t } = useTranslation();
  const { sku } = useParams();

  const hit = CATEGORIES.flatMap((c) => c.products.map((p) => ({ p, category: c }))).find(
    (x) => x.p.sku === sku,
  );
  if (!hit) return <Navigate to="/products" replace />;
  const { p, category } = hit;

  const revenue30d = p.units30d * p.price;
  const marginPerUnit = (p.price - p.cogs) / p.price;
  const promoFloor = p.cogs * MIN_PRICE_MULTIPLIER;
  const maxSafeDiscount = Math.max(0, 1 - promoFloor / p.price);
  const maxMonthly = Math.max(...p.monthly);
  const declining = p.monthly[11] < p.monthly[0];

  return (
    <div>
      <Link to="/products" className="mb-4 inline-block text-xs font-bold uppercase tracking-wider text-meama-gold hover:underline">
        ← {t("pages.productDetail.back")}
      </Link>
      <PageHeader kicker={category.name} kickerKa={category.nameKa} title={p.name} subtitle={p.notes} />
      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-4">
        <span className="tabular rounded-full bg-meama-gold px-3.5 py-1 text-sm font-bold text-meama-espresso">
          {formatGEL(p.price)}
        </span>
        <span className="tabular text-xs text-meama-cream/50">{p.sku}</span>
        {p.intensity != null ? (
          <span className="rounded-full bg-meama-ivory px-3 py-1">
            <IntensityDots value={p.intensity} />
          </span>
        ) : null}
      </div>

      <div className="stagger space-y-5">
        <div className="panel-dark">
          <Kicker>The story</Kicker>
          <p className="max-w-3xl text-[15px] leading-relaxed text-meama-cream/85">
            {PRODUCT_DESCRIPTIONS[p.sku] ?? p.notes}
          </p>
        </div>

        <div className="panel-dark grid grid-cols-2 gap-6 lg:grid-cols-4">
          <StatCallout dark value={formatGEL0(revenue30d)} tag="Revenue · 30d">
            {formatNumber(p.units30d)} units at list price.
          </StatCallout>
          <StatCallout dark value={formatPercent(marginPerUnit, 0)} tag="Gross margin" tone="green">
            Per unit at full price ({formatGEL(p.price)} / COGS {formatGEL(p.cogs)}).
          </StatCallout>
          <StatCallout dark value={p.repeatRate > 0 ? formatPercent(p.repeatRate, 0) : "—"} tag="Repeat rate" tone="blue">
            {p.repeatRate > 0 ? "Buyers reordering within 60 days." : "Hardware — one-time purchase."}
          </StatCallout>
          <StatCallout dark value={declining ? "▼ declining" : "▲ growing"} tag="12-mo trend" tone={declining ? "red" : "green"}>
            {declining ? "Units below year-ago level." : "Units above year-ago level."}
          </StatCallout>
        </div>

        <div className="card-m">
          <Kicker>{t("pages.productDetail.history")}</Kicker>
          <div className="mt-4 flex h-44 items-end gap-2">
            {p.monthly.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="tabular text-[10px] font-semibold text-meama-muted">{formatNumber(v)}</span>
                <div
                  className={`w-full rounded-t ${i === 11 ? "bg-meama-gold" : declining ? "bg-meama-red/50" : "bg-meama-gold/50"}`}
                  style={{ height: `${(v / maxMonthly) * 100}%` }}
                />
                <span className="text-[10px] text-meama-muted">{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-m">
          <Kicker>Promo guardrails</Kicker>
          <dl className="tabular mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-meama-muted sm:grid-cols-4">
            <div>
              <dt className="text-[10px] uppercase tracking-wider">List price</dt>
              <dd className="font-bold text-meama-brown">{formatGEL(p.price)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider">COGS</dt>
              <dd className="font-bold text-meama-brown">{formatGEL(p.cogs)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider">Min safe price (×1.6667)</dt>
              <dd className="font-bold text-meama-green">{formatGEL(promoFloor)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider">Max safe discount</dt>
              <dd className="font-bold text-meama-red">{formatPercent(Math.min(maxSafeDiscount, 0.25), 1)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-meama-muted">
            Enforced by the Discount Engine: 40% margin floor, 25% hard cap — whichever bites first.
          </p>
        </div>

        <AiPanel title={`AI Insight — ${p.name}`} actionLabel="Generate fresh insight">
          {PRODUCT_AI[p.sku] ?? "Insights for this SKU will appear after the next nightly Claude batch run."}
        </AiPanel>
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-cream/30">{t("common.demoData")}</p>
    </div>
  );
}
