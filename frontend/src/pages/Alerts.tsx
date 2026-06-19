import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "../components/Badge";
import { type AlertRow, type AlertsResponse, fetchAlerts } from "../lib/api";
import { tbilisiTime } from "../lib/format";
import { PageHeader } from "./PageHeader";

const BORDER: Record<string, string> = {
  critical: "border-l-2 border-l-meama-red",
  high:     "border-l-2 border-l-meama-red",
  warning:  "border-l-2 border-l-meama-gold",
  medium:   "border-l-2 border-l-meama-gold",
  info:     "border-l-2 border-l-meama-blue",
};

function severityIcon(sev: string): string {
  if (sev === "critical" || sev === "high") return "🚨";
  if (sev === "warning" || sev === "medium") return "⚠️";
  return "ℹ️";
}

function SkeletonCards() {
  return (
    <div className="max-w-3xl space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card-m space-y-2">
          <div className="skeleton-shine h-4 w-3/4 rounded" />
          <div className="skeleton-shine h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function Alerts() {
  const { t } = useTranslation();
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "all">("open");

  const load = (status: "open" | "all") => {
    setLoading(true);
    setError(null);
    fetchAlerts(status)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(statusFilter); }, [statusFilter]);

  const alerts: AlertRow[] = data?.items ?? [];

  return (
    <div>
      <PageHeader
        kicker="11 · Alerts"
        kickerKa="შეტყობინებები"
        title={t("pages.alerts.title")}
        subtitle={t("pages.alerts.subtitle")}
      />

      {/* Filter + count bar */}
      <div className="mb-5 flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "open" | "all")}
          className="border border-meama-charcoal bg-meama-ivory px-3 py-1.5 font-mono text-xs text-meama-cream focus:border-meama-gold focus:outline-none"
        >
          <option value="open">Open alerts</option>
          <option value="all">All alerts</option>
        </select>
        <span className="font-mono text-[10px] text-meama-muted">
          {loading ? "Loading…" : `${alerts.length} alert${alerts.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-center justify-between border border-meama-red/30 bg-meama-red/5 p-4 font-mono text-sm text-meama-red">
          <span>! {error}</span>
          <button
            onClick={() => load(statusFilter)}
            className="border border-meama-red/30 px-3 py-1 text-xs hover:border-meama-red"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonCards />
      ) : alerts.length === 0 ? (
        <div className="max-w-3xl border border-dashed border-meama-charcoal py-16 text-center">
          <div className="font-display text-[52px] uppercase leading-none tracking-[0.08em] text-meama-charcoal">
            —
          </div>
          <div className="mt-3 font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
            No alerts yet
          </div>
          <div className="mt-1 text-xs text-meama-charcoal">
            System is watching — alerts fire when thresholds are breached
          </div>
        </div>
      ) : (
        <div className="max-w-3xl space-y-3">
          {alerts.map((a) => (
            <div key={a.id} className={`card-m ${BORDER[a.severity] ?? ""}`}>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="text-lg leading-none">{severityIcon(a.severity)}</span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-meama-charcoal">{a.type}</h3>
                    <div className="flex items-center gap-2">
                      {a.channels_sent?.length > 0 && (
                        <Badge tone={a.channels_sent.includes("telegram") ? "blue" : "muted"}>
                          {a.channels_sent.includes("telegram") ? "Telegram" : "in-app"}
                        </Badge>
                      )}
                      <Badge
                        tone={
                          a.severity === "critical" || a.severity === "high" ? "red" :
                          a.severity === "warning" || a.severity === "medium" ? "gold" : "muted"
                        }
                      >
                        {a.severity}
                      </Badge>
                      {a.created_at && (
                        <span className="tabular text-xs text-meama-muted">
                          {tbilisiTime(a.created_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-meama-muted">{a.message}</p>
                  {a.entity_id && (
                    <p className="mt-0.5 font-mono text-[10px] text-meama-charcoal">
                      entity: {a.entity_id}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
