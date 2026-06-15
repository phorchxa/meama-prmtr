export type BadgeTone = "green" | "gold" | "blue" | "red" | "muted";

const TONES: Record<BadgeTone, string> = {
  green: "border-meama-green/40 text-meama-green bg-meama-green/8",
  gold:  "border-meama-charcoal text-meama-brown bg-transparent",
  blue:  "border-meama-blue/40 text-meama-blue bg-meama-blue/8",
  red:   "border-meama-red/40 text-meama-red bg-meama-red/8",
  muted: "border-meama-charcoal text-meama-muted bg-transparent",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
