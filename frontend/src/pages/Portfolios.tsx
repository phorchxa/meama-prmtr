import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "../components/Badge";
import { Sparkline } from "../components/Sparkline";
import { formatGEL0, formatNumber } from "../lib/format";
import { CUSTOMERS, SEGMENT_META } from "../lib/mock";
import { PageHeader } from "./PageHeader";

function churnColor(score: number): string {
  if (score >= 0.7) return "bg-meama-red";
  if (score >= 0.4) return "bg-meama-gold";
  return "bg-meama-green";
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
        kicker="Portfolios"
        kickerKa="პორტფოლიოები"
        title={t("pages.portfolios.title")}
        subtitle={t("pages.portfolios.subtitle")}
      />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`${t("common.search")}…`}
        className="mb-6 w-full max-w-sm rounded-full border border-meama-gold/40 bg-white/10 px-4 py-2 text-sm text-meama-cream outline-none transition-colors placeholder:text-meama-cream/40 focus:border-meama-gold"
      />

      <div className="stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c) => {
          const meta = SEGMENT_META[c.segment];
          return (
            <Link key={c.id} to={`/portfolios/${c.id}`} className="card-m card-m-hover block">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-meama-brown font-display text-sm font-bold text-meama-goldsoft">
                  {initials(c.name)}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg font-semibold text-meama-brown">{c.name}</h3>
                  <div className="tabular text-[11px] text-meama-muted">{c.id}</div>
                </div>
                <span className="ml-auto shrink-0">
                  <Badge tone={meta.tone}>{ka ? meta.labelKa : meta.label}</Badge>
                </span>
              </div>

              <div className="tabular mt-4 grid grid-cols-3 gap-2 border-t border-meama-brown/10 pt-3 text-center text-xs text-meama-muted">
                <div>
                  <div className="text-sm font-extrabold text-meama-brown">{formatGEL0(c.ltv)}</div>
                  LTV
                </div>
                <div>
                  <div className="text-sm font-extrabold text-meama-brown">{formatNumber(c.orders)}</div>
                  orders
                </div>
                <div>
                  <div className={`text-sm font-extrabold ${c.lastOrderDaysAgo >= 45 ? "text-meama-red" : "text-meama-brown"}`}>
                    {c.lastOrderDaysAgo}d
                  </div>
                  last order
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-meama-muted">
                  <span>Churn risk</span>
                  <span className="tabular font-bold">{c.churnScore.toFixed(2)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-meama-brown/10">
                  <div className={`h-full rounded-full ${churnColor(c.churnScore)}`} style={{ width: `${c.churnScore * 100}%` }} />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-meama-muted">12-mo spend</span>
                <Sparkline data={c.spendHistory} width={120} height={26} />
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-cream/30">{t("common.demoData")}</p>
    </div>
  );
}
