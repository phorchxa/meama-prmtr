export type BadgeTone = "green" | "gold" | "blue" | "red" | "muted";

const TONES: Record<BadgeTone, string> = {
  green: "border-[var(--success-500)] bg-[var(--success-50)] text-[var(--success-600)]",
  gold:  "border-[var(--warning-500)] bg-[var(--warning-50)] text-[var(--warning-600)]",
  blue:  "border-[var(--info-500)] bg-[var(--info-50)] text-[var(--info-600)]",
  red:   "border-[var(--critical-500)] bg-[var(--critical-50)] text-[var(--critical-600)]",
  muted: "border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-text-tertiary)]",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap border px-2 py-0.5 font-sans text-[12px] font-semibold leading-4 ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
