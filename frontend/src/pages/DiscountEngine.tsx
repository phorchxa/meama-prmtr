import { useState } from "react";
import { useTranslation } from "react-i18next";

import { StatCallout } from "../components/StatCallout";
import { formatGEL, formatPercent } from "../lib/format";
import { PageHeader } from "./PageHeader";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

// Business rules — mirror backend/app/business_rules.py exactly.
const MARGIN_FLOOR = 0.4;
const MIN_PRICE_MULTIPLIER = 1.6667;
const MAX_DISCOUNT = 0.25;

interface PromoLine {
  sku: string;
  full_price: number;
  cogs: number;
  discounted_price: number;
  min_safe_price: number;
  max_safe_discount: number;
  effective_margin: number;
  status: "green" | "red";
  blocked: boolean;
  reasons: string[];
}
interface PromoResponse {
  discount_pct: number;
  blocked: boolean;
  lines: PromoLine[];
}

/** Client-side fallback when the backend is unreachable — same rules, same shape. */
function computeLocally(sku: string, fullPrice: number, cogs: number, discountPct: number): PromoResponse {
  const discountedPrice = fullPrice * (1 - discountPct);
  const minSafePrice = cogs * MIN_PRICE_MULTIPLIER;
  const maxSafeDiscount = Math.max(0, 1 - minSafePrice / fullPrice);
  const effectiveMargin = discountedPrice > 0 ? (discountedPrice - cogs) / discountedPrice : 0;
  const reasons: string[] = [];
  if (discountPct > MAX_DISCOUNT) reasons.push(`Discount exceeds the hard ${MAX_DISCOUNT * 100}% cap`);
  if (effectiveMargin < MARGIN_FLOOR) reasons.push(`Margin ${(effectiveMargin * 100).toFixed(1)}% is below the ${MARGIN_FLOOR * 100}% floor`);
  const blocked = reasons.length > 0;
  return {
    discount_pct: discountPct,
    blocked,
    lines: [
      {
        sku,
        full_price: fullPrice,
        cogs,
        discounted_price: discountedPrice,
        min_safe_price: minSafePrice,
        max_safe_discount: maxSafeDiscount,
        effective_margin: effectiveMargin,
        status: blocked ? "red" : "green",
        blocked,
        reasons,
      },
    ],
  };
}

export default function DiscountEngine() {
  const { t } = useTranslation();
  const [sku, setSku] = useState("CAP-CLS-05");
  const [fullPrice, setFullPrice] = useState(22.9);
  const [cogs, setCogs] = useState(8.6);
  const [discount, setDiscount] = useState(15);
  const [result, setResult] = useState<PromoResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setLoading(true);
    setOffline(false);
    try {
      const resp = await fetch(`${API_BASE}/api/v1/campaigns/promo-calculator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_list: [{ sku, full_price: fullPrice, cogs }],
          discount_pct: discount / 100,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setResult((await resp.json()) as PromoResponse);
    } catch {
      // Backend not running — compute with the same rules locally.
      setResult(computeLocally(sku, fullPrice, cogs, discount / 100));
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="04 · Discount Engine"
        kickerKa="ფასდაკლების ძრავა"
        title={t("pages.discount.title")}
        subtitle={t("pages.discount.subtitle")}
      />

      <div className="panel-dark mb-6 grid grid-cols-1 gap-6 sm:grid-cols-4">
        <StatCallout dark value="40%" tag="Margin floor" tone="green">
          Minimum gross margin enforced on every promo line.
        </StatCallout>
        <StatCallout dark value="25%" tag="Discount cap" tone="red">
          Hard platform cap — no override, no exceptions.
        </StatCallout>
        <StatCallout dark value="×1.6667" tag="Min price" tone="gold">
          Min safe price = COGS × 1.6667. The floor in lari, per SKU.
        </StatCallout>
        <StatCallout dark value="0" tag="VIP discounts" tone="gold">
          {t("promo.noDiscountNote")}
        </StatCallout>
      </div>

      <div className="card-m max-w-3xl">
        <h2 className="mb-4 font-bold text-meama-brown">{t("promo.title")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm">
            <span className="text-meama-muted">SKU</span>
            <input
              className="mt-1 w-full rounded border border-meama-gold/40 px-2 py-1.5"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-meama-muted">Full price ₾</span>
            <input
              type="number"
              className="tabular mt-1 w-full rounded border border-meama-gold/40 px-2 py-1.5"
              value={fullPrice}
              onChange={(e) => setFullPrice(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            <span className="text-meama-muted">COGS ₾</span>
            <input
              type="number"
              className="tabular mt-1 w-full rounded border border-meama-gold/40 px-2 py-1.5"
              value={cogs}
              onChange={(e) => setCogs(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            <span className="text-meama-muted">{t("promo.discount")}</span>
            <input
              type="number"
              className="tabular mt-1 w-full rounded border border-meama-gold/40 px-2 py-1.5"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          onClick={() => void calculate()}
          disabled={loading}
          className="mt-4 rounded-full bg-meama-gold px-6 py-2 text-sm font-bold text-meama-charcoal transition-all hover:-translate-y-px hover:shadow-lg disabled:opacity-60"
        >
          {loading ? t("common.loading") : t("promo.calculate")}
        </button>

        {offline ? <p className="mt-3 text-xs text-meama-muted">ℹ️ {t("promo.offline")}</p> : null}

        {result ? (
          <div className="mt-5 space-y-3">
            {result.lines.map((line) => (
              <div
                key={line.sku}
                className={`rounded-lg border-l-[3px] p-4 text-sm ${
                  line.status === "green"
                    ? "border border-meama-green/30 border-l-meama-green bg-meama-green/5"
                    : "border border-meama-red/30 border-l-meama-red bg-meama-red/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-meama-brown">{line.sku}</span>
                  <span
                    className={`text-xs font-extrabold uppercase tracking-wider ${
                      line.status === "green" ? "text-meama-green" : "text-meama-red"
                    }`}
                  >
                    {line.status === "green" ? `✓ ${t("promo.green")}` : `✕ ${t("promo.red")}`}
                  </span>
                </div>
                <dl className="tabular mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-meama-muted">
                  <dt>{t("promo.margin")}</dt>
                  <dd className="text-right font-semibold text-meama-charcoal">{formatPercent(line.effective_margin)}</dd>
                  <dt>{t("promo.minPrice")}</dt>
                  <dd className="text-right font-semibold text-meama-charcoal">{formatGEL(line.min_safe_price)}</dd>
                  <dt>Discounted price</dt>
                  <dd className="text-right font-semibold text-meama-charcoal">{formatGEL(line.discounted_price)}</dd>
                  <dt>Max safe discount</dt>
                  <dd className="text-right font-semibold text-meama-charcoal">{formatPercent(line.max_safe_discount)}</dd>
                </dl>
                {line.reasons.length > 0 ? (
                  <ul className="mt-3 list-inside list-disc text-meama-red">
                    {line.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
