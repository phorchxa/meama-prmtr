import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "../components/Badge";
import { StatCallout } from "../components/StatCallout";
import { type StockItem, type StockResponse, fetchStock } from "../lib/api";
import { formatNumber } from "../lib/format";
import { PageHeader } from "./PageHeader";

const STATUS_TONE = { ok: "green", low: "gold", critical: "red" } as const;
const COVER_TARGET_WEEKS = 8; // bar scale ceiling

function SkeletonRows({ count = 10 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <tr key={i} className="border-b border-meama-charcoal">
          {[1, 2, 3, 4, 5].map((j) => (
            <td key={j} className="px-5 py-2.5">
              <div className="skeleton-shine h-3 rounded" style={{ width: `${55 + (i + j) * 5}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function Stock() {
  const { t } = useTranslation();
  const [data, setData] = useState<StockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchStock()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const items: StockItem[] = data?.items ?? [];
  const critical = data?.critical_count ?? 0;
  const low = data?.low_stock_count ?? 0;

  return (
    <div>
      <PageHeader
        kicker="09 · Stock"
        kickerKa="მარაგი"
        title={t("pages.stock.title")}
        subtitle={t("pages.stock.subtitle")}
      />

      <div className="panel-dark mb-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCallout dark value={loading ? "…" : String(critical)} tag="Critical · <2 weeks" tone="red">
          Below the 2-week cover floor — reorder now.
        </StatCallout>
        <StatCallout dark value={loading ? "…" : String(low)} tag="Low · 2–4 weeks" tone="gold">
          Approaching the floor — queue purchase orders.
        </StatCallout>
        <StatCallout dark value="14d" tag="Reorder point" tone="blue">
          Standard supplier lead time baked into the warning.
        </StatCallout>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-center justify-between border border-meama-red/30 bg-meama-red/5 p-4 font-mono text-sm text-meama-red">
          <span>! {error}</span>
          <button
            onClick={load}
            className="border border-meama-red/30 px-3 py-1 text-xs hover:border-meama-red"
          >
            Retry
          </button>
        </div>
      )}

      <div className="card-m overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-meama-brown/10 text-left text-[11px] uppercase tracking-wider text-meama-muted">
              <th className="px-5 py-3">SKU / Name</th>
              <th className="px-5 py-3 text-right">On hand</th>
              <th className="px-5 py-3 text-right">Velocity / day</th>
              <th className="px-5 py-3">Weeks of cover</th>
              <th className="px-5 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows count={12} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <div className="font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
                    No stock data
                  </div>
                  <div className="mt-1 text-[11px] text-meama-charcoal">
                    products_master has no stock_quantity values yet
                  </div>
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr
                  key={s.sku}
                  className={`border-b border-meama-brown/5 last:border-0 hover:bg-meama-ivory/40 ${
                    s.status === "critical" ? "bg-meama-red/5" : ""
                  }`}
                >
                  <td className="px-5 py-2.5">
                    <div className="font-bold text-meama-charcoal">{s.name}</div>
                    <div className="tabular text-[11px] text-meama-muted">{s.sku}</div>
                  </td>
                  <td className="tabular px-5 py-2.5 text-right text-meama-cream">
                    {formatNumber(s.units_on_hand)}
                  </td>
                  <td className="tabular px-5 py-2.5 text-right text-meama-cream">
                    {s.velocity_per_day > 0 ? s.velocity_per_day.toFixed(1) : <span className="text-meama-muted">—</span>}
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-44 overflow-hidden rounded-full bg-meama-charcoal/5">
                        <div
                          className={`h-full rounded-full ${
                            s.status === "critical" ? "bg-meama-red" :
                            s.status === "low" ? "bg-meama-gold" :
                            "bg-meama-green"
                          }`}
                          style={{ width: `${Math.min((s.weeks_of_cover / COVER_TARGET_WEEKS) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="tabular w-10 text-xs font-bold text-meama-charcoal">
                        {s.weeks_of_cover >= 99 ? "99+" : `${s.weeks_of_cover.toFixed(1)}w`}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && items.length > 0 && (
        <p className="mt-3 font-mono text-[10px] text-meama-muted">
          {formatNumber(items.length)} SKUs · sorted by urgency ·
          velocity = units_sold_30d / 30
        </p>
      )}
    </div>
  );
}
