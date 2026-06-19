import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { Kicker } from "../components/Kicker";
import { StatCallout } from "../components/StatCallout";
import {
  type CustomerAnalytics,
  type CustomerSummary,
  fetchCustomerAnalytics,
  fetchCustomers,
} from "../lib/api";
import { formatGEL, formatNumber, formatPercent } from "../lib/format";
import { PageHeader } from "./PageHeader";

// ── Business rule constants (mirror business_rules.py) ────────────────────────
const AT_RISK_MIN_DAYS = 45;
const CHURN_DAYS = 90;
const CHURN_SCORE_ALERT = 0.7;


const SEGMENT_LABELS: Record<string, string> = {
  champion: "Champion",
  capsule_loyalist: "Capsule Loyalist",
  flavour_explorer: "Flavour Explorer",
  regular: "Regular",
  at_risk: "At Risk",
  lost: "Lost",
  new: "New",
};

const SEGMENT_COLORS: Record<string, string> = {
  champion: "bg-meama-green/10 text-meama-green border-meama-green/30",
  capsule_loyalist: "bg-meama-gold/10 text-meama-gold border-meama-gold/30",
  flavour_explorer: "bg-meama-blue/10 text-meama-blue border-meama-blue/30",
  regular: "bg-meama-charcoal/10 text-meama-muted border-meama-charcoal/30",
  at_risk: "bg-meama-red/10 text-meama-red border-meama-red/30",
  lost: "bg-meama-red/15 text-meama-red border-meama-red/40",
  new: "bg-meama-blue/10 text-meama-blue border-meama-blue/30",
};

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

// ── SegmentChip ───────────────────────────────────────────────────────────────
function SegmentChip({ segment }: { segment: string | null }) {
  if (!segment) return <span className="text-meama-muted">—</span>;
  return (
    <span
      className={`inline-block border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
        SEGMENT_COLORS[segment] ?? "border-meama-charcoal text-meama-muted"
      }`}
    >
      {SEGMENT_LABELS[segment] ?? segment}
    </span>
  );
}

// ── StatusChip ────────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string | null }) {
  const cfg: Record<string, string> = {
    active: "text-meama-green",
    at_risk: "text-meama-red",
    lost: "text-meama-red",
    new: "text-meama-blue",
  };
  return (
    <span className={`font-mono text-[9px] uppercase ${cfg[status ?? ""] ?? "text-meama-muted"}`}>
      {status ?? "—"}
    </span>
  );
}

// ── Table skeleton ────────────────────────────────────────────────────────────
function SkeletonRows({ count = 10 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <tr key={i} className="border-b border-meama-charcoal">
          {[1, 2, 3, 4, 5, 6].map((j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-3 animate-pulse rounded bg-meama-charcoal" style={{ width: `${60 + (i + j) * 7}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

const SEGMENT_TONE_BG: Record<string, string> = {
  champion: "bg-meama-green",
  capsule_loyalist: "bg-meama-gold",
  flavour_explorer: "bg-meama-blue",
  regular: "bg-meama-muted",
  at_risk: "bg-meama-red",
  lost: "bg-meama-red",
  new: "bg-meama-blue",
  unknown: "bg-meama-charcoal",
};

const STATUS_TONE_BG: Record<string, string> = {
  active: "bg-meama-green",
  at_risk: "bg-meama-red",
  lost: "bg-meama-red",
  new: "bg-meama-blue",
  unknown: "bg-meama-muted",
};

const SEGMENT_LABEL: Record<string, string> = {
  champion: "Champion",
  capsule_loyalist: "Capsule Loyalist",
  flavour_explorer: "Flavour Explorer",
  regular: "Regular",
  at_risk: "At Risk",
  lost: "Lost",
  new: "New",
};

// ── Analytics panels — real data from /api/v1/customers/analytics ─────────────
function AnalyticsSection() {
  const [data, setData] = useState<CustomerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomerAnalytics()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="card-m space-y-3">
            <div className="skeleton-shine h-3 w-32 rounded" />
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="space-y-1">
                <div className="skeleton-shine h-3 rounded" style={{ width: `${50 + j * 10}%` }} />
                <div className="skeleton-shine h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (error || !data?.populated) {
    return (
      <div className="border border-dashed border-meama-charcoal py-16 text-center">
        <div className="font-display text-[52px] uppercase leading-none tracking-[0.08em] text-meama-charcoal">—</div>
        <div className="mt-3 font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
          No customer data yet
        </div>
        <div className="mt-2 text-xs text-meama-charcoal">
          Run <code className="text-meama-cream">make etl</code> to populate customer_metrics
        </div>
      </div>
    );
  }

  const maxSegShare = Math.max(...data.segment_distribution.map((s) => s.share), 0.01);
  const maxStShare = Math.max(...data.status_distribution.map((s) => s.share), 0.01);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Segment distribution */}
      <div className="card-m">
        <Kicker>{`Segment distribution · ${formatNumber(data.total_customers)} customers`}</Kicker>
        <ul className="mt-3 space-y-3">
          {data.segment_distribution.map(({ segment, share, count }) => (
            <li key={segment}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-semibold text-meama-charcoal">
                  {SEGMENT_LABEL[segment] ?? segment}
                </span>
                <span className="tabular text-xs text-meama-muted">
                  {formatNumber(count)} · {formatPercent(share, 0)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-meama-charcoal/5">
                <div
                  className={`h-full rounded-full ${SEGMENT_TONE_BG[segment] ?? "bg-meama-charcoal"}`}
                  style={{ width: `${(share / maxSegShare) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Status distribution */}
      <div className="card-m">
        <Kicker>Status distribution</Kicker>
        <ul className="mt-3 space-y-3">
          {data.status_distribution.map(({ status, share, count }) => (
            <li key={status}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-semibold capitalize text-meama-charcoal">
                  {status.replace("_", " ")}
                </span>
                <span className="tabular text-xs text-meama-muted">
                  {formatNumber(count)} · {formatPercent(share, 0)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-meama-charcoal/5">
                <div
                  className={`h-full rounded-full ${STATUS_TONE_BG[status] ?? "bg-meama-charcoal"}`}
                  style={{ width: `${(share / maxStShare) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Avg KPIs */}
      <div className="card-m lg:col-span-2">
        <Kicker>Portfolio averages</Kicker>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-meama-muted">Avg LTV</div>
            <div className="tabular mt-1 font-display text-2xl uppercase leading-none text-meama-brown">
              {data.avg_ltv != null ? formatGEL(data.avg_ltv) : "—"}
            </div>
            <div className="mt-0.5 text-[10px] text-meama-charcoal">Registered only</div>
          </div>
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-meama-muted">Avg AOV</div>
            <div className="tabular mt-1 font-display text-2xl uppercase leading-none text-meama-brown">
              {data.avg_aov != null ? formatGEL(data.avg_aov) : "—"}
            </div>
            <div className="mt-0.5 text-[10px] text-meama-charcoal">Zero-spend excluded</div>
          </div>
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-meama-muted">Avg churn score</div>
            <div className={`tabular mt-1 font-display text-2xl uppercase leading-none ${
              data.avg_churn_score != null && data.avg_churn_score >= 0.7
                ? "text-meama-red"
                : "text-meama-brown"
            }`}>
              {data.avg_churn_score != null ? data.avg_churn_score.toFixed(2) : "—"}
            </div>
            <div className="mt-0.5 text-[10px] text-meama-charcoal">Claude output · alert ≥ 0.7</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
type CustomerTab = "list" | "analytics";

export default function Customers() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Sync filter state from URL params so links can deep-link into filtered views
  const [tab, setTab] = useState<CustomerTab>("list");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all");
  const [segmentFilter, setSegmentFilter] = useState(searchParams.get("segment") ?? "all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveData, setLiveData] = useState(true); // tracks whether real data loaded

  // Update URL when filters change
  useEffect(() => {
    const sp = new URLSearchParams();
    if (search) sp.set("q", search);
    if (statusFilter !== "all") sp.set("status", statusFilter);
    if (segmentFilter !== "all") sp.set("segment", segmentFilter);
    setSearchParams(sp, { replace: true });
  }, [search, statusFilter, segmentFilter, setSearchParams]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchCustomers({
      q: search || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      segment: segmentFilter !== "all" ? segmentFilter : undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((result) => {
        setCustomers(result.items);
        setTotal(result.total);
        setLiveData(result.items.length > 0 || result.total === 0);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load customers");
        setLiveData(false);
        setCustomers([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [search, statusFilter, segmentFilter, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const STATUS_OPTIONS = ["all", "active", "at_risk", "lost", "new"];
  const SEGMENT_OPTIONS = [
    "all", "champion", "capsule_loyalist", "flavour_explorer", "regular", "at_risk", "lost", "new",
  ];

  return (
    <div>
      <PageHeader
        kicker="07 · Customers"
        kickerKa="მომხმარებლები"
        title={t("pages.customers.title")}
        subtitle={t("pages.customers.subtitle")}
      />

      {/* KPI summary — derived from live list data */}
      <div className="panel-dark mb-6 grid grid-cols-1 gap-6 sm:grid-cols-4">
        <StatCallout dark value={loading ? "…" : formatNumber(total)} tag="Total in DB">
          Registered customers with computed metrics.
        </StatCallout>
        <StatCallout
          dark
          value={loading ? "…" : formatNumber(customers.filter((c) => c.status === "at_risk").length)}
          tag="At risk · 45–89d"
          tone="red"
        >
          Past the {AT_RISK_MIN_DAYS}-day silence threshold — current page.
        </StatCallout>
        <StatCallout
          dark
          value={loading ? "…" : formatNumber(customers.filter((c) => (c.churn_score ?? 0) >= CHURN_SCORE_ALERT).length)}
          tag="Churn ≥ 0.7"
          tone="red"
        >
          High churn scores from the nightly Claude batch — current page.
        </StatCallout>
        <StatCallout dark value={loading ? "…" : formatNumber(customers.filter((c) => c.status === "active").length)} tag="Active" tone="gold">
          Active on current page. Run ETL for full count.
        </StatCallout>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-0 border-b border-meama-charcoal">
        {(["list", "analytics"] as CustomerTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 font-mono text-xs font-medium transition-colors capitalize ${
              tab === t
                ? "border-b-2 border-meama-gold text-meama-gold"
                : "text-meama-cream/50 hover:text-meama-brown"
            }`}
          >
            {t === "list" ? "Customer List" : "Analytics"}
          </button>
        ))}
      </div>

      {tab === "analytics" && <AnalyticsSection />}

      {tab === "list" && (
        <div>
          {/* Filter bar */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search customer ID…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-brown placeholder-meama-muted focus:border-meama-gold focus:outline-none"
            />

            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.slice(1).map((s) => (
                <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>
              ))}
            </select>

            <select
              value={segmentFilter}
              onChange={(e) => { setSegmentFilter(e.target.value); setPage(1); }}
              className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
            >
              <option value="all">All segments</option>
              {SEGMENT_OPTIONS.slice(1).map((s) => (
                <option key={s} value={s}>{SEGMENT_LABELS[s] ?? s}</option>
              ))}
            </select>

            {(search || statusFilter !== "all" || segmentFilter !== "all") && (
              <button
                onClick={() => { setSearch(""); setStatusFilter("all"); setSegmentFilter("all"); setPage(1); }}
                className="border border-meama-charcoal px-3 py-1.5 font-mono text-xs text-meama-muted hover:border-meama-red hover:text-meama-red"
              >
                Clear
              </button>
            )}

            <span className="ml-auto font-mono text-[10px] text-meama-muted">
              {loading ? "Loading…" : `${formatNumber(total)} customers`}
            </span>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-5 border border-meama-red/30 bg-meama-red/5 p-4 font-mono text-sm text-meama-red">
              ! {error}
              {!liveData && (
                <span className="ml-2 text-meama-muted">
                  — customer data not yet populated in DB
                </span>
              )}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto border border-meama-charcoal">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-meama-charcoal">
                  {["Customer ID", "Status", "Segment", "LTV", "AOV", "Last Order", "Churn Score"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-left last:text-right"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows count={12} />
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center font-mono text-sm text-meama-muted">
                      {error
                        ? "Customer data not yet loaded into the database."
                        : "No customers match the current filters."}
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => {
                    const days = daysSince(c.last_order_date);
                    const daysLabel =
                      days == null
                        ? "—"
                        : days >= CHURN_DAYS
                        ? `${days}d (lost)`
                        : days >= AT_RISK_MIN_DAYS
                        ? `${days}d (at risk)`
                        : `${days}d`;
                    const daysColor =
                      days == null
                        ? "text-meama-muted"
                        : days >= AT_RISK_MIN_DAYS
                        ? "text-meama-red"
                        : "text-meama-cream";
                    const churnColor =
                      c.churn_score == null
                        ? "text-meama-muted"
                        : c.churn_score >= CHURN_SCORE_ALERT
                        ? "text-meama-red font-bold"
                        : c.churn_score >= 0.4
                        ? "text-meama-gold"
                        : "text-meama-green";

                    return (
                      <tr
                        key={c.customer_id}
                        className="border-b border-meama-charcoal hover:bg-meama-ivory"
                      >
                        <td className="px-3 py-2.5">
                          <Link
                            to={`/customers/${c.customer_id}`}
                            className="font-mono text-xs font-bold text-meama-brown hover:text-meama-gold"
                          >
                            {c.customer_id}
                          </Link>
                          {c.cluster_tag && (
                            <div className="font-mono text-[9px] text-meama-muted">{c.cluster_tag}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusChip status={c.status} />
                        </td>
                        <td className="px-3 py-2.5">
                          <SegmentChip segment={c.rfm_segment} />
                        </td>
                        <td className="tabular px-3 py-2.5 font-semibold text-meama-brown">
                          {c.ltv != null ? formatGEL(c.ltv) : <span className="text-meama-muted">—</span>}
                        </td>
                        <td className="tabular px-3 py-2.5 text-meama-cream">
                          {c.aov != null ? formatGEL(c.aov) : <span className="text-meama-muted">—</span>}
                        </td>
                        <td className={`tabular px-3 py-2.5 font-mono text-xs ${daysColor}`}>
                          {daysLabel}
                        </td>
                        <td className={`tabular px-3 py-2.5 text-right font-mono text-xs ${churnColor}`}>
                          {c.churn_score != null ? c.churn_score.toFixed(2) : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="border border-meama-charcoal px-4 py-2 font-mono text-xs text-meama-cream disabled:opacity-30 hover:border-meama-gold hover:text-meama-gold"
              >
                ← Prev
              </button>
              <span className="font-mono text-xs text-meama-muted">
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="border border-meama-charcoal px-4 py-2 font-mono text-xs text-meama-cream disabled:opacity-30 hover:border-meama-gold hover:text-meama-gold"
              >
                Next →
              </button>
            </div>
          )}

          {/* Empty-state help when no live data */}
          {!loading && !error && customers.length === 0 && total === 0 && (
            <div className="mt-10 border border-meama-charcoal/30 p-6 text-center">
              <div className="font-mono text-xs text-meama-muted">
                [ — ] No customer data in the database yet.
              </div>
              <div className="mt-2 font-mono text-[10px] text-meama-muted">
                Run the ETL pipeline to populate customer_metrics:{" "}
                <code className="text-meama-cream">make etl</code>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
