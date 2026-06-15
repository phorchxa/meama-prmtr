type Severity = "critical" | "high" | "medium";

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "border-meama-red/50 text-meama-red",
  high:     "border-meama-brown/30 text-meama-brown",
  medium:   "border-meama-blue/40 text-meama-blue",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "🚨",
  high:     "⚠️",
  medium:   "ℹ️",
};

export function AlertBadge({ severity, label }: { severity: Severity; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${SEVERITY_STYLES[severity]}`}
    >
      <span aria-hidden="true">{SEVERITY_LABEL[severity]}</span>
      {label ?? severity}
    </span>
  );
}

export function AlertBell({ count }: { count: number }) {
  return (
    <span className="relative inline-flex" aria-label={`${count} alerts`}>
      <span className="text-[18px]">🔔</span>
      {count > 0 ? (
        <span
          className="tabular absolute -right-2 -top-1 inline-flex h-4 min-w-4 items-center
                     justify-center rounded-full bg-meama-red px-1 text-[9px] font-bold text-white"
        >
          {count}
        </span>
      ) : null}
    </span>
  );
}
