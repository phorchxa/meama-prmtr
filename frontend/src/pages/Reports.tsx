import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "./PageHeader";

interface ReportDef {
  key: string;
  title: string;
  description: string;
}

interface ReportsApiResponse {
  reports: ReportDef[];
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export default function Reports() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atRiskLoading, setAtRiskLoading] = useState(false);

  const handleAtRiskExport = async () => {
    setAtRiskLoading(true);
    try {
      const res = await fetch(`${BASE}/api/v1/reports/at-risk-export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `at_risk_customers_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      alert("Export failed. Please try again.");
    } finally {
      setAtRiskLoading(false);
    }
  };

  const load = () => {
    setLoading(true);
    setError(null);
    fetch(`${BASE}/api/v1/reports`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`reports ${r.status}`))))
      .then((data: ReportsApiResponse) => setReports(data.reports ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        kicker="10 · Reports"
        kickerKa="ანგარიშები"
        title={t("pages.reports.title")}
        subtitle={t("pages.reports.subtitle")}
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

      {/* ── AT-RISK EXPORT CARD ────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #E0E4E1", padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#121712", marginBottom: 6 }}>
          At-Risk Customers
        </div>
        <div style={{ fontSize: 13, color: "#727B73", marginBottom: 16 }}>
          45–90 days since last order. Includes last 3 orders' capsule history.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", background: "#FDECEC", color: "#CC2E33" }}>
            at-risk
          </span>
          <span style={{ fontSize: 11, color: "#9BA39C" }}>
            capsule buyers · phone available
          </span>
        </div>
        <button
          onClick={handleAtRiskExport}
          disabled={atRiskLoading}
          style={{
            height: 36, padding: "0 16px",
            background: atRiskLoading ? "#ECEFEC" : "#121712",
            color: atRiskLoading ? "#9BA39C" : "#fff",
            border: "none", fontSize: 13, fontWeight: 600,
            cursor: atRiskLoading ? "not-allowed" : "pointer",
            fontFamily: "'Hanken Grotesk',sans-serif",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          {atRiskLoading ? (
            <><span style={{ fontSize: 12 }}>⏳</span> Generating...</>
          ) : (
            <><span style={{ fontSize: 12 }}>⬇</span> Export CSV</>
          )}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-m space-y-3">
              <div className="skeleton-shine h-4 w-3/4 rounded" />
              <div className="skeleton-shine h-3 w-full rounded" />
              <div className="skeleton-shine h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="border border-dashed border-meama-charcoal py-20 text-center">
          <div className="font-display text-[52px] uppercase leading-none tracking-[0.08em] text-meama-charcoal">
            —
          </div>
          <div className="mt-4 font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
            No reports generated yet
          </div>
          <p className="mt-2 text-sm text-meama-charcoal">
            Reports generate nightly at 02:00 Tbilisi (GitHub Actions cron)
          </p>
          <div className="mt-4 text-[11px] text-meama-muted">
            Run <code className="rounded bg-meama-charcoal/10 px-1 py-0.5 text-meama-cream">make etl</code> to
            trigger the first data sync
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <div key={r.key} className="card-m card-m-hover flex flex-col">
              <h3 className="font-extrabold text-meama-charcoal">{r.title}</h3>
              <p className="mt-1 flex-1 text-sm text-meama-muted">{r.description}</p>
              <div className="mt-4 flex items-center gap-2 border-t border-meama-brown/10 pt-3">
                <span className="rounded-full bg-meama-gold/15 px-3 py-1 text-[11px] font-bold text-meama-gold">
                  pre-computed nightly
                </span>
              </div>
              <div className="mt-3 text-center">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-meama-muted">
                  Downloads available after ETL runs
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
