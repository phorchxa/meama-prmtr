import { formatGEL, formatNumber, formatPercent, formatUSD } from "../lib/format";
import { Sparkline } from "./Sparkline";

export interface KpiWidgetProps {
  label: string;
  value: number;
  unit: "GEL" | "USD" | "count" | "pct";
  deltaPct?: number | null;
  trend?: number[];
}

function renderValue(value: number, unit: KpiWidgetProps["unit"]): string {
  switch (unit) {
    case "GEL":
      return formatGEL(value);
    case "USD":
      return formatUSD(value);
    case "pct":
      return formatPercent(value);
    default:
      return formatNumber(value);
  }
}

export function KpiWidget({ label, value, unit, deltaPct, trend }: KpiWidgetProps) {
  const positive = (deltaPct ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-meama-gold/30 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-meama-muted">
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="tabular text-2xl font-semibold text-meama-brown">
          {renderValue(value, unit)}
        </div>
        {trend && trend.length > 1 ? <Sparkline data={trend} /> : null}
      </div>
      {deltaPct != null ? (
        <div
          className={`tabular mt-1 text-xs font-medium ${
            positive ? "text-meama-green" : "text-meama-red"
          }`}
        >
          {positive ? "▲" : "▼"} {formatPercent(Math.abs(deltaPct))}
        </div>
      ) : null}
    </div>
  );
}
