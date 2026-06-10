import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatGEL, formatPercent } from "../lib/format";
import { PageHeader } from "./PageHeader";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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

export default function Campaigns() {
  const { t } = useTranslation();
  const [sku, setSku] = useState("CAP-CLS-01");
  const [fullPrice, setFullPrice] = useState(29);
  const [cogs, setCogs] = useState(10);
  const [discount, setDiscount] = useState(15);
  const [result, setResult] = useState<PromoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setLoading(true);
    setError(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title={t("pages.campaigns.title")} subtitle={t("pages.campaigns.subtitle")} />

      <div className="max-w-2xl rounded-lg border border-meama-gold/30 bg-white p-5">
        <h2 className="mb-4 font-medium text-meama-brown">{t("promo.title")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm">
            <span className="text-meama-muted">SKU</span>
            <input
              className="mt-1 w-full rounded border border-meama-gold/40 px-2 py-1"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-meama-muted">Full price ₾</span>
            <input
              type="number"
              className="tabular mt-1 w-full rounded border border-meama-gold/40 px-2 py-1"
              value={fullPrice}
              onChange={(e) => setFullPrice(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            <span className="text-meama-muted">COGS ₾</span>
            <input
              type="number"
              className="tabular mt-1 w-full rounded border border-meama-gold/40 px-2 py-1"
              value={cogs}
              onChange={(e) => setCogs(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            <span className="text-meama-muted">{t("promo.discount")}</span>
            <input
              type="number"
              className="tabular mt-1 w-full rounded border border-meama-gold/40 px-2 py-1"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          onClick={calculate}
          disabled={loading}
          className="mt-4 rounded bg-meama-brown px-4 py-2 text-sm font-medium text-meama-cream hover:bg-meama-brown/90 disabled:opacity-60"
        >
          {loading ? t("common.loading") : t("promo.calculate")}
        </button>

        {error ? <p className="mt-3 text-sm text-meama-red">⚠️ {error}</p> : null}

        {result ? (
          <div className="mt-5 space-y-3">
            {result.lines.map((line) => (
              <div
                key={line.sku}
                className={`rounded border p-3 text-sm ${
                  line.status === "green"
                    ? "border-meama-green/40 bg-meama-green/5"
                    : "border-meama-red/40 bg-meama-red/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-meama-brown">{line.sku}</span>
                  <span
                    className={`font-semibold ${
                      line.status === "green" ? "text-meama-green" : "text-meama-red"
                    }`}
                  >
                    {line.status === "green" ? t("promo.green") : t("promo.red")}
                  </span>
                </div>
                <dl className="tabular mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-meama-muted">
                  <dt>{t("promo.margin")}</dt>
                  <dd className="text-right text-meama-charcoal">
                    {formatPercent(line.effective_margin)}
                  </dd>
                  <dt>{t("promo.minPrice")}</dt>
                  <dd className="text-right text-meama-charcoal">
                    {formatGEL(line.min_safe_price)}
                  </dd>
                  <dt>Discounted price</dt>
                  <dd className="text-right text-meama-charcoal">
                    {formatGEL(line.discounted_price)}
                  </dd>
                  <dt>Max safe discount</dt>
                  <dd className="text-right text-meama-charcoal">
                    {formatPercent(line.max_safe_discount)}
                  </dd>
                </dl>
                {line.reasons.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-meama-red">
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
