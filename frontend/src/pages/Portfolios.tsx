import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "../components/Badge";
import { Sparkline } from "../components/Sparkline";
import { formatGEL0, formatNumber } from "../lib/format";
import { CUSTOMERS, SEGMENT_META } from "../lib/mock";
import { PageHeader } from "./PageHeader";

function churnTone(score: number): string {
  if (score >= 0.7) return "text-meama-red";
  if (score >= 0.4) return "text-meama-gold";
  return "text-meama-green";
}

export default function Portfolios() {
  const { t, i18n } = useTranslation();
  const ka = i18n.language === "ka";
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const rows = CUSTOMERS.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
  );

  return (
    <div>
      <PageHeader
        kicker="08 · Portfolios"
        kickerKa="პორტფოლიოები"
        title={t("pages.portfolios.title")}
        subtitle={t("pages.portfolios.subtitle")}
      />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`${t("common.search")}…`}
        className="mb-5 w-full max-w-sm rounded-full border border-meama-gold/40 bg-white px-4 py-2 text-sm outline-none transition-colors focus:border-meama-gold"
      />

      <div className="card-m overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-meama-brown/10 text-left text-[11px] uppercase tracking-wider text-meama-muted">
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Segment</th>
              <th className="px-5 py-3 text-right">LTV</th>
              <th className="px-5 py-3 text-right">Orders</th>
              <th className="px-5 py-3 text-right">Last order</th>
              <th className="px-5 py-3 text-right">Churn score</th>
              <th className="px-5 py-3">12-mo spend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const meta = SEGMENT_META[c.segment];
              return (
                <tr key={c.id} className="border-b border-meama-brown/5 last:border-0 hover:bg-meama-cream/40">
                  <td className="px-5 py-3">
                    <Link to={`/portfolios/${c.id}`} className="font-bold text-meama-charcoal hover:text-meama-gold">
                      {c.name}
                    </Link>
                    <div className="tabular text-[11px] text-meama-muted">{c.id}</div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={meta.tone}>{ka ? meta.labelKa : meta.label}</Badge>
                  </td>
                  <td className="tabular px-5 py-3 text-right font-semibold">{formatGEL0(c.ltv)}</td>
                  <td className="tabular px-5 py-3 text-right">{formatNumber(c.orders)}</td>
                  <td className="tabular px-5 py-3 text-right">
                    <span className={c.lastOrderDaysAgo >= 45 ? "font-bold text-meama-red" : ""}>
                      {c.lastOrderDaysAgo}d ago
                    </span>
                  </td>
                  <td className={`tabular px-5 py-3 text-right font-bold ${churnTone(c.churnScore)}`}>
                    {c.churnScore.toFixed(2)}
                  </td>
                  <td className="px-5 py-3">
                    <Sparkline data={c.spendHistory} width={110} height={26} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-muted/70">{t("common.demoData")}</p>
    </div>
  );
}
