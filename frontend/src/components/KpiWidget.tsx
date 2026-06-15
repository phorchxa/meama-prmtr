import { useEffect, useRef, useState } from "react";
import { formatGEL, formatNumber, formatPercent, formatUSD } from "../lib/format";
import { Sparkline } from "./Sparkline";

export interface KpiWidgetProps {
  label: string;
  value: number;
  unit: "GEL" | "USD" | "count" | "pct";
  deltaPct?: number | null;
  trend?: number[];
}

function useCountUp(target: number, duration = 1200): number {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setDisplay(0); return; }
    let raf: number;
    startRef.current = null;
    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(eased * target));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

function renderValue(value: number, unit: KpiWidgetProps["unit"]): string {
  switch (unit) {
    case "GEL": return formatGEL(value);
    case "USD": return formatUSD(value);
    case "pct": return formatPercent(value);
    default:    return formatNumber(value);
  }
}

export function KpiWidget({ label, value, unit, deltaPct, trend }: KpiWidgetProps) {
  const animated = useCountUp(value);
  const positive = (deltaPct ?? 0) >= 0;
  return (
    <div className="card-m card-m-hover group p-5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-meama-muted">
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="tabular font-display text-[34px] uppercase leading-none text-meama-brown">
          {renderValue(animated, unit)}
        </div>
        {trend && trend.length > 1 ? (
          <div className="mb-1 opacity-60 transition-opacity duration-200 group-hover:opacity-100">
            <Sparkline data={trend} />
          </div>
        ) : null}
      </div>
      {deltaPct != null ? (
        <div
          className={`tabular mt-2 font-mono text-[10px] font-medium ${
            positive ? "text-meama-green" : "text-meama-red"
          }`}
        >
          {positive ? "↑" : "↓"} {formatPercent(Math.abs(deltaPct))}
        </div>
      ) : null}
    </div>
  );
}
