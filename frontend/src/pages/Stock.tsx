import { useTranslation } from "react-i18next";

import { Badge } from "../components/Badge";
import { StatCallout } from "../components/StatCallout";
import { formatNumber } from "../lib/format";
import { STOCK } from "../lib/mock";
import { PageHeader } from "./PageHeader";

const STATUS_TONE = { ok: "green", low: "gold", critical: "red" } as const;
const COVER_TARGET_WEEKS = 6; // bar scale ceiling

export default function Stock() {
  const { t } = useTranslation();
  const critical = STOCK.filter((s) => s.status === "critical").length;
  const low = STOCK.filter((s) => s.status === "low").length;

  return (
    <div>
      <PageHeader
        kicker="09 · Stock"
        kickerKa="მარაგი"
        title={t("pages.stock.title")}
        subtitle={t("pages.stock.subtitle")}
      />

      <div className="card-m mb-6 grid grid-cols-1 gap-6 bg-meama-charcoal p-6 sm:grid-cols-3">
        <StatCallout dark value={String(critical)} tag="Critical · <2 weeks" tone="red">
          Below the 2-week cover floor — reorder now.
        </StatCallout>
        <StatCallout dark value={String(low)} tag="Low · 2–3 weeks" tone="gold">
          Approaching the floor — queue purchase orders.
        </StatCallout>
        <StatCallout dark value="14d" tag="Reorder point" tone="blue">
          Standard supplier lead time baked into the warning.
        </StatCallout>
      </div>

      <div className="card-m overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-meama-brown/10 text-left text-[11px] uppercase tracking-wider text-meama-muted">
              <th className="px-5 py-3">SKU</th>
              <th className="px-5 py-3 text-right">On hand</th>
              <th className="px-5 py-3 text-right">Velocity / day</th>
              <th className="px-5 py-3">Weeks of cover</th>
              <th className="px-5 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {[...STOCK]
              .sort((a, b) => a.weeksCover - b.weeksCover)
              .map((s) => (
                <tr key={s.sku} className={`border-b border-meama-brown/5 last:border-0 ${s.status === "critical" ? "bg-meama-red/5" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="font-bold text-meama-charcoal">{s.name}</div>
                    <div className="tabular text-[11px] text-meama-muted">{s.sku}</div>
                  </td>
                  <td className="tabular px-5 py-3 text-right">{formatNumber(s.onHand)}</td>
                  <td className="tabular px-5 py-3 text-right">{s.dailyVelocity}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 w-44 overflow-hidden rounded-full bg-meama-charcoal/5">
                        <div
                          className={`h-full rounded-full ${
                            s.status === "critical" ? "bg-meama-red" : s.status === "low" ? "bg-meama-gold" : "bg-meama-green"
                          }`}
                          style={{ width: `${Math.min((s.weeksCover / COVER_TARGET_WEEKS) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="tabular text-xs font-bold text-meama-charcoal">{s.weeksCover.toFixed(1)}w</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-muted/70">{t("common.demoData")}</p>
    </div>
  );
}
