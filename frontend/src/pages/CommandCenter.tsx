import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "../components/Badge";
import { Kicker } from "../components/Kicker";
import { type OverviewResponse, fetchOverview } from "../lib/api";
import { formatGEL0, formatNumber, formatPercent, tbilisiTime } from "../lib/format";
import { PageHeader } from "./PageHeader";

// ── Inline SVG area chart (inline-SVG only — no chart library) ────────────────
function RevenueArea({ data }: { data: number[] }) {
  if (data.length < 2) return null;
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
        <line key={f} x1="0" y1={h * f} x2={w} y2={h * f} stroke="var(--gray-300)" opacity="0.5" />
      ))}
      <polygon points={area} fill="var(--green-500)" opacity="0.12" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--green-600)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill="var(--green-600)" />
    </svg>
  );
}

// ── KPI card skeleton ──────────────────────────────────────────────────────────
function KpiSkeleton() {
  return (
    <div className="card-m space-y-3">
      <div className="skeleton-shine h-3 w-24 rounded" />
      <div className="skeleton-shine h-8 w-32 rounded" />
      <div className="skeleton-shine h-3 w-16 rounded" />
    </div>
  );
}

// ── Severity label → icon ─────────────────────────────────────────────────────
function severityIcon(sev: string) {
  if (sev === "critical") return "🚨";
  if (sev === "high" || sev === "warning") return "⚠️";
  return "ℹ️";
}

// ── KPI card ──────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "red" | "gold" | "green";
}

function KpiCard({ label, value, sub, tone = "default" }: KpiCardProps) {
  const valColor =
    tone === "red" ? "text-meama-red" :
    tone === "gold" ? "text-meama-gold" :
    tone === "green" ? "text-meama-green" :
    "text-meama-brown";

  return (
    <div className="card-m">
      <div className="mb-1.5 text-[12px] font-medium text-meama-muted">{label}</div>
      <div className={`tabular font-mono text-[30px] font-semibold leading-none tracking-[-0.02em] ${valColor}`}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-meama-muted">{sub}</div>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CommandCenter() {
  const { t } = useTranslation();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const retry = () => {
    setLoading(true);
    setError(null);
    fetchOverview()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  const kpis = data?.kpis;
  const trend = data?.revenue_trend_30d ?? [];
  const trendValues = trend.map((p) => p.revenue);
  const recentAlerts = (data?.alerts ?? []).filter((a) => a.severity !== "info").slice(0, 3);
  const topActions = (data?.actions ?? []).slice(0, 3);
  const ecomPct = kpis?.ecom_pct ?? 0;

  return (
    <div>
      <PageHeader
        kicker="01 · Command"
        kickerKa="სამეთაურო"
        title={t("pages.command.title")}
        subtitle={t("pages.command.subtitle")}
      />

      {/* Error banner */}
      {error && (
        <div className="mb-5 flex items-center justify-between border border-meama-red/30 bg-meama-red/5 p-4 font-mono text-sm text-meama-red">
          <span>! {error}</span>
          <button
            onClick={retry}
            className="ml-4 border border-meama-red/30 px-3 py-1 text-xs hover:border-meama-red"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 8 }, (_, i) => <KpiSkeleton key={i} />)
        ) : kpis ? (
          <>
            <KpiCard
              label="Revenue · 30 days"
              value={formatGEL0(kpis.revenue_30d_gel)}
              sub="Retail channels only"
            />
            <KpiCard
              label="Units sold · 30 days"
              value={formatNumber(kpis.units_30d)}
              sub="E-com + brand stores"
            />
            <KpiCard
              label="Active SKUs"
              value={formatNumber(kpis.total_skus)}
              sub="Excluding test / shipping"
            />
            <KpiCard
              label="Avg margin"
              value={formatPercent(kpis.avg_margin_pct)}
              sub={`Floor: 40%`}
              tone={kpis.avg_margin_pct < 0.4 ? "red" : "green"}
            />
            <KpiCard
              label="Top category"
              value={kpis.top_category ?? "—"}
              sub={kpis.top_category ? `${formatPercent(kpis.top_category_pct, 0)} of revenue` : undefined}
            />
            <KpiCard
              label="E-commerce share"
              value={formatPercent(ecomPct > 0 ? ecomPct : 0.5)}
              sub={ecomPct > 0 ? "vs brand stores" : "No channel data yet"}
              tone="gold"
            />
            <KpiCard
              label="Critical stock SKUs"
              value={String(kpis.critical_stock_skus)}
              sub="Below 2-week cover"
              tone={kpis.critical_stock_skus > 0 ? "red" : "green"}
            />
            <KpiCard
              label="Low stock SKUs"
              value={String(kpis.low_stock_skus)}
              sub="Below 4-week cover"
              tone={kpis.low_stock_skus > 0 ? "gold" : "default"}
            />
          </>
        ) : null}
      </div>

      {/* Revenue trend + money panel */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card-m lg:col-span-2">
          <Kicker>Revenue trend · 30 days</Kicker>
          {loading ? (
            <div className="skeleton-shine mt-2 h-36 w-full rounded" />
          ) : trendValues.length >= 2 ? (
            <>
              <div className="flex items-baseline justify-between">
                <div className="tabular text-2xl font-extrabold text-meama-brown">
                  {formatGEL0(kpis?.revenue_30d_gel ?? 0)}
                </div>
                <div className="text-xs text-meama-muted">₾ / day · Asia/Tbilisi</div>
              </div>
              <RevenueArea data={trendValues} />
              {ecomPct > 0 && (
                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-xs text-meama-muted">
                    <span>E-commerce {formatPercent(ecomPct, 0)}</span>
                    <span>Brand stores {formatPercent(1 - ecomPct, 0)}</span>
                  </div>
                  <div className="flex h-1.5 overflow-hidden">
                    <div className="bg-green-500" style={{ width: `${ecomPct * 100}%` }} />
                    <div className="bg-gray-200" style={{ width: `${(1 - ecomPct) * 100}%` }} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 border border-dashed border-meama-charcoal py-10 text-center">
              <div className="font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
                Revenue trend not available
              </div>
              <div className="mt-1 text-[11px] text-meama-charcoal">
                Run <code className="text-meama-cream">make etl</code> to populate orders_flat
              </div>
            </div>
          )}
        </div>

        <Link
          to="/stock"
          className="card-m-hover panel-dark block transition-all duration-300 hover:-translate-y-px hover:shadow-lg"
        >
          <div className="mb-3 text-[12px] font-medium text-gray-400">
            Stock alerts
          </div>
          {loading ? (
            <div className="space-y-2">
              <div className="skeleton-shine h-10 w-16 rounded" />
              <div className="skeleton-shine h-4 w-32 rounded" />
            </div>
          ) : (
            <>
              <div className="tabular font-mono text-[52px] font-semibold leading-none tracking-[-0.02em] text-danger-500">
                {kpis?.critical_stock_skus ?? 0}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                critical SKUs below 2-week cover floor.{" "}
                {(kpis?.low_stock_skus ?? 0) > 0
                  ? `${kpis!.low_stock_skus} more approaching the limit.`
                  : ""}
              </p>
            </>
          )}
          <span className="mt-4 inline-block font-mono text-[11px] font-semibold text-gray-300">
            View stock →
          </span>
        </Link>
      </div>

      {/* Alerts + Actions */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-m">
          <div className="mb-3 flex items-center justify-between">
            <Kicker>Recent alerts</Kicker>
            <Link
              to="/alerts"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-meama-muted transition-colors hover:text-meama-brown"
            >
              {t("common.viewAll")} →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="skeleton-shine h-4 w-4 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton-shine h-3 w-3/4 rounded" />
                    <div className="skeleton-shine h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentAlerts.length === 0 ? (
            <div className="border border-dashed border-meama-charcoal py-8 text-center">
              <div className="font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
                No active alerts
              </div>
              <div className="mt-1 text-[11px] text-meama-charcoal">System is watching</div>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentAlerts.map((a) => (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <span aria-hidden="true">{severityIcon(a.severity)}</span>
                  <div>
                    <div className="font-semibold text-meama-brown">{a.type}</div>
                    <div className="text-xs text-meama-muted">{a.message}</div>
                    {a.created_at && (
                      <div className="tabular mt-0.5 text-[10px] text-meama-charcoal">
                        {tbilisiTime(a.created_at)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-m">
          <div className="mb-3 flex items-center justify-between">
            <Kicker>Recommended actions</Kicker>
            <Link
              to="/stock"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-meama-muted transition-colors hover:text-meama-brown"
            >
              Stock →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="skeleton-shine h-6 w-6 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton-shine h-3 w-3/4 rounded" />
                    <div className="skeleton-shine h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : topActions.length === 0 ? (
            <div className="border border-dashed border-meama-charcoal py-8 text-center">
              <div className="font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
                No actions required
              </div>
              <div className="mt-1 text-[11px] text-meama-charcoal">Stock levels look healthy</div>
            </div>
          ) : (
            <ul className="space-y-3">
              {topActions.map((a, idx) => (
                <li key={a.sku ?? idx} className="flex items-start justify-between gap-3 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-meama-charcoal font-mono text-[9px] font-bold text-meama-muted">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-meama-brown">{a.title}</div>
                      <div className="text-xs text-meama-muted">{a.signal}</div>
                    </div>
                  </div>
                  {a.est_impact_gel > 0 && (
                    <Badge tone={a.severity === "critical" ? "red" : "gold"}>
                      {formatGEL0(a.est_impact_gel)}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
