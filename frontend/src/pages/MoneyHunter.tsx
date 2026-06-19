import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { StatCallout } from "../components/StatCallout";
import { type CustomerAnalytics, fetchCustomerAnalytics } from "../lib/api";
import { formatGEL, formatNumber } from "../lib/format";
import { PageHeader } from "./PageHeader";

export default function MoneyHunter() {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState<CustomerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchCustomerAnalytics()
      .then(setAnalytics)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const populated = analytics?.populated === true;
  const atRisk = analytics?.status_distribution.find((s) => s.status === "at_risk");
  const lost = analytics?.status_distribution.find((s) => s.status === "lost");
  const upsellSegments = analytics?.segment_distribution.filter(
    (s) => ["champion", "capsule_loyalist", "flavour_explorer"].includes(s.segment)
  ) ?? [];

  return (
    <div>
      <PageHeader
        kicker="02 · Money Hunter"
        kickerKa="ფულის მონადირე"
        title={t("pages.moneyHunter.title")}
        subtitle={t("pages.moneyHunter.subtitle")}
      />

      {error && (
        <div className="mb-5 flex items-center justify-between border border-meama-red/30 bg-meama-red/5 p-4 font-mono text-sm text-meama-red">
          <span>! {error}</span>
          <button onClick={load} className="border border-meama-red/30 px-3 py-1 text-xs hover:border-meama-red">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="panel-dark grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton-shine h-8 w-24 rounded" />
                <div className="skeleton-shine h-3 w-32 rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : !populated ? (
        <div className="border border-dashed border-meama-charcoal py-20 text-center">
          <div className="font-display text-[52px] uppercase leading-none tracking-[0.08em] text-meama-charcoal">
            —
          </div>
          <div className="mt-4 font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
            No customer data yet
          </div>
          <p className="mt-2 text-sm text-meama-charcoal">
            Revenue opportunities are derived from customer_metrics — run ETL to discover them.
          </p>
          <div className="mt-4 text-[11px] text-meama-muted">
            Run <code className="rounded bg-meama-charcoal/10 px-1 py-0.5 text-meama-cream">make etl</code> to
            populate customer segments, churn scores, and upsell flags
          </div>
        </div>
      ) : (
        <>
          {/* KPI summary */}
          <div className="panel-dark mb-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <StatCallout
              dark
              value={formatNumber(analytics!.total_customers)}
              tag="Total customers"
            >
              Registered customers with computed metrics.
            </StatCallout>
            <StatCallout
              dark
              value={atRisk ? formatNumber(atRisk.count) : "0"}
              tag="At risk · 45–89d"
              tone="red"
            >
              Past the 45-day silence threshold — win-back candidates.
            </StatCallout>
            <StatCallout
              dark
              value={analytics!.avg_ltv != null ? formatGEL(analytics!.avg_ltv) : "—"}
              tag="Avg LTV"
              tone="gold"
            >
              Registered customers only. Zero-spend excluded.
            </StatCallout>
          </div>

          {/* Opportunity cards derived from real data */}
          <div className="space-y-4">
            {atRisk && atRisk.count > 0 && (
              <div className="card-m card-m-hover">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <span className="tabular mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-meama-red/15 text-sm font-extrabold text-meama-red">
                      1
                    </span>
                    <div>
                      <h3 className="font-bold text-meama-charcoal">
                        Win-back — at-risk customers ({formatNumber(atRisk.count)} silent 45–89d)
                      </h3>
                      <p className="mt-1 text-sm text-meama-muted">
                        Customers past the 45-day silence threshold with churn scores below 0.7.
                        Replenishment reminder + capped 15% voucher (max 25% rule enforced).
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-xs uppercase tracking-[0.18em] text-meama-muted">
                      {formatNumber(atRisk.count)} customers
                    </div>
                  </div>
                </div>
              </div>
            )}

            {lost && lost.count > 0 && (
              <div className="card-m card-m-hover">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <span className="tabular mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-meama-gold/15 text-sm font-extrabold text-meama-gold">
                      2
                    </span>
                    <div>
                      <h3 className="font-bold text-meama-charcoal">
                        Lost customers — organic re-engagement ({formatNumber(lost.count)} ≥90d)
                      </h3>
                      <p className="mt-1 text-sm text-meama-muted">
                        Customers churned beyond 90 days. Newsletter-only — paid win-back
                        rarely justifies LTV at this stage.
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-xs uppercase tracking-[0.18em] text-meama-muted">
                      {formatNumber(lost.count)} customers
                    </div>
                  </div>
                </div>
              </div>
            )}

            {upsellSegments.length > 0 && (
              <div className="card-m card-m-hover">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <span className="tabular mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-meama-green/15 text-sm font-extrabold text-meama-green">
                      3
                    </span>
                    <div>
                      <h3 className="font-bold text-meama-charcoal">
                        Premium segments — early access, no discount
                      </h3>
                      <p className="mt-1 text-sm text-meama-muted">
                        Champions, Capsule Loyalists, and Flavour Explorers —{" "}
                        {formatNumber(upsellSegments.reduce((s, x) => s + x.count, 0))} customers
                        total. Never discount these segments. Early access to new drops only.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {upsellSegments.map((seg) => (
                          <span
                            key={seg.segment}
                            className="font-mono text-[10px] uppercase tracking-wider text-meama-gold"
                          >
                            {seg.segment.replace("_", " ")} · {formatNumber(seg.count)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {atRisk === undefined && lost === undefined && upsellSegments.length === 0 && (
              <div className="border border-dashed border-meama-charcoal py-10 text-center">
                <div className="font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
                  No opportunities identified yet
                </div>
                <div className="mt-1 text-[11px] text-meama-charcoal">
                  Customer segments are computed by the nightly ETL + Claude batch
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
