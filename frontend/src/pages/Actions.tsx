import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "../components/Badge";
import { type StockItem, fetchStock } from "../lib/api";
import { formatGEL0 } from "../lib/format";
import { PageHeader } from "./PageHeader";

const SEVERITY_TONE = { critical: "red", high: "gold", normal: "muted" } as const;

interface ActionItem {
  rank: number;
  title: string;
  signal: string;
  impact: number;
  severity: "critical" | "high" | "normal";
  module: string;
  to: string;
  sku?: string;
}

function deriveActionsFromStock(items: StockItem[]): ActionItem[] {
  const actions: ActionItem[] = [];
  let rank = 1;

  const critical = items.filter((s) => s.status === "critical");
  const low = items.filter((s) => s.status === "low");

  for (const s of critical) {
    const estImpact = s.price
      ? Math.round(s.velocity_per_day * 14 * s.price)
      : 0;
    actions.push({
      rank: rank++,
      title: `Reorder ${s.name}`,
      signal: `${s.weeks_of_cover.toFixed(1)} weeks of cover — below the 2-week floor`,
      impact: estImpact,
      severity: "critical",
      module: "Stock",
      to: "/stock",
      sku: s.sku,
    });
  }

  for (const s of low) {
    const estImpact = s.price
      ? Math.round(s.velocity_per_day * 14 * s.price)
      : 0;
    actions.push({
      rank: rank++,
      title: `Queue purchase order — ${s.name}`,
      signal: `${s.weeks_of_cover.toFixed(1)} weeks of cover — approaching the 4-week threshold`,
      impact: estImpact,
      severity: "high",
      module: "Stock",
      to: "/stock",
      sku: s.sku,
    });
  }

  return actions;
}

function SkeletonItems() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card-m flex items-center gap-4">
          <div className="skeleton-shine h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton-shine h-4 w-2/3 rounded" />
            <div className="skeleton-shine h-3 w-1/2 rounded" />
          </div>
          <div className="skeleton-shine h-6 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function Actions() {
  const { t } = useTranslation();
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchStock()
      .then((stock) => {
        setActions(deriveActionsFromStock(stock.items));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        kicker="05 · Action Queue"
        kickerKa="ქმედებების რიგი"
        title={t("pages.actions.title")}
        subtitle={t("pages.actions.subtitle")}
      />

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

      {loading ? (
        <SkeletonItems />
      ) : actions.length === 0 ? (
        <div className="border border-dashed border-meama-charcoal py-16 text-center">
          <div className="font-display text-[52px] uppercase leading-none tracking-[0.08em] text-meama-charcoal">
            —
          </div>
          <div className="mt-3 font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
            No actions required
          </div>
          <div className="mt-1 text-xs text-meama-charcoal">
            All stock levels are within safe thresholds
          </div>
          <div className="mt-4 text-[11px] text-meama-charcoal">
            Actions also populate from{" "}
            <Link to="/alerts" className="text-meama-gold hover:underline">Alerts</Link>
            {" "}and{" "}
            <Link to="/money-hunter" className="text-meama-gold hover:underline">Money Hunter</Link>
            {" "}once ETL is run
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => (
            <Link
              key={a.rank}
              to={a.to}
              className={`card-m card-m-hover flex items-center justify-between gap-4 ${
                a.severity === "critical" ? "border-l-2 border-l-meama-red" :
                a.severity === "high" ? "border-l-2 border-l-meama-gold" :
                ""
              }`}
            >
              <div className="flex items-start gap-4">
                <span className="tabular mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-meama-brown text-sm font-extrabold text-meama-gold">
                  {a.rank}
                </span>
                <div>
                  <h3 className="font-bold text-meama-charcoal">{a.title}</h3>
                  <p className="mt-0.5 text-sm text-meama-muted">{a.signal}</p>
                  <span className="mt-1 inline-block text-[11px] font-semibold uppercase tracking-wider text-meama-gold">
                    {a.module} →
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {a.impact > 0 ? (
                  <span className="tabular text-lg font-extrabold text-meama-brown">
                    {formatGEL0(a.impact)}
                  </span>
                ) : (
                  <span className="text-sm text-meama-muted">—</span>
                )}
                <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
