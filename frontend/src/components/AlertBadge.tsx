type Severity = "critical" | "high" | "medium";

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-meama-red/10 text-meama-red border-meama-red/30",
  high: "bg-meama-gold/15 text-meama-brown border-meama-gold/40",
  medium: "bg-meama-blue/10 text-meama-blue border-meama-blue/30",
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: "🚨",
  high: "⚠️",
  medium: "ℹ️",
};

export function AlertBadge({ severity, label }: { severity: Severity; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[severity]}`}
    >
      <span aria-hidden="true">{SEVERITY_EMOJI[severity]}</span>
      {label ?? severity}
    </span>
  );
}

/** Header bell with an unread count. */
export function AlertBell({ count }: { count: number }) {
  return (
    <span className="relative inline-flex" aria-label={`${count} alerts`}>
      <span className="text-xl">🔔</span>
      {count > 0 ? (
        <span className="tabular absolute -right-2 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-meama-red px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      ) : null}
    </span>
  );
}
