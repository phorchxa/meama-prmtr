import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "../components/Badge";
import { Kicker } from "../components/Kicker";
import { KpiWidget } from "../components/KpiWidget";
import { formatGEL0 } from "../lib/format";
import { ACTIONS, ALERTS, CHANNEL_SPLIT, KPIS, MONEY_ON_TABLE, REVENUE_TREND_30D } from "../lib/mock";
import { PageHeader } from "./PageHeader";

/** Inline-SVG area chart for the 30-day revenue trend (₾K/day). */
function RevenueArea({ data }: { data: number[] }) {
  const w = 720;
  const h = 150;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - 14 - ((v - min) / span) * (h - 28)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" role="img" aria-label="30-day revenue trend">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" y1={h * f} x2={w} y2={h * f} stroke="var(--meama-charcoal)" opacity="0.06" />
      ))}
      <polygon points={area} fill="var(--meama-gold)" opacity="0.12" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--meama-gold)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill="var(--meama-gold)" />
    </svg>
  );
}

export default function CommandCenter() {
  const { t, i18n } = useTranslation();
  const ka = i18n.language === "ka";
  const criticalAlerts = ALERTS.filter((a) => a.severity !== "info").slice(0, 3);
  const topActions = ACTIONS.slice(0, 3);

  return (
    <div>
      <PageHeader
        kicker="01 · Command"
        kickerKa="სამეთაურო"
        title={t("pages.command.title")}
        subtitle={t("pages.command.subtitle")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {KPIS.map((kpi) => (
          <KpiWidget
            key={kpi.label}
            label={ka ? kpi.labelKa : kpi.label}
            value={kpi.value}
            unit={kpi.unit}
            deltaPct={kpi.deltaPct}
            trend={kpi.trend}
          />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-m lg:col-span-2">
          <Kicker>Revenue · 30 days</Kicker>
          <div className="flex items-baseline justify-between">
            <div className="tabular text-2xl font-extrabold text-meama-brown">{formatGEL0(412380)}</div>
            <div className="text-xs text-meama-muted">₾K / day · Asia/Tbilisi</div>
          </div>
          <RevenueArea data={REVENUE_TREND_30D} />
          <div className="mt-2">
            <div className="mb-1 flex justify-between text-xs text-meama-muted">
              <span>E-commerce {Math.round(CHANNEL_SPLIT.ecom * 100)}%</span>
              <span>Brand stores {Math.round(CHANNEL_SPLIT.brandStore * 100)}%</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full">
              <div className="bg-meama-gold" style={{ width: `${CHANNEL_SPLIT.ecom * 100}%` }} />
              <div className="bg-meama-brown" style={{ width: `${CHANNEL_SPLIT.brandStore * 100}%` }} />
            </div>
          </div>
        </div>

        <Link to="/money-hunter" className="card-m card-m-hover block bg-meama-charcoal !border-meama-gold/30">
          <Kicker>Money on the table</Kicker>
          <div className="tabular mt-2 text-4xl font-extrabold leading-none text-meama-gold">
            {formatGEL0(MONEY_ON_TABLE)}
          </div>
          <p className="mt-3 text-sm text-meama-cream/70">
            5 ranked opportunities sitting in the customer base — win-backs, upsells, cross-sells.
          </p>
          <span className="mt-4 inline-block text-xs font-bold uppercase tracking-wider text-meama-gold">
            {t("nav.moneyHunter")} →
          </span>
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-m !border-l-meama-red">
          <div className="mb-3 flex items-center justify-between">
            <Kicker>Live alerts</Kicker>
            <Link to="/alerts" className="text-xs font-semibold text-meama-gold hover:underline">
              {t("common.viewAll")} →
            </Link>
          </div>
          <ul className="space-y-3">
            {criticalAlerts.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span aria-hidden="true">{a.emoji}</span>
                <div>
                  <div className="font-semibold text-meama-charcoal">{a.title}</div>
                  <div className="text-xs text-meama-muted">{a.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-m">
          <div className="mb-3 flex items-center justify-between">
            <Kicker>Next best actions</Kicker>
            <Link to="/actions" className="text-xs font-semibold text-meama-gold hover:underline">
              {t("common.viewAll")} →
            </Link>
          </div>
          <ul className="space-y-3">
            {topActions.map((a) => (
              <li key={a.rank} className="flex items-start justify-between gap-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-meama-gold/15 text-[11px] font-bold text-meama-gold">
                    {a.rank}
                  </span>
                  <div>
                    <div className="font-semibold text-meama-charcoal">{a.title}</div>
                    <div className="text-xs text-meama-muted">{a.signal}</div>
                  </div>
                </div>
                {a.impact > 0 ? (
                  <Badge tone={a.severity === "critical" ? "red" : "gold"}>{formatGEL0(a.impact)}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-cream/30">{t("common.demoData")}</p>
    </div>
  );
}
