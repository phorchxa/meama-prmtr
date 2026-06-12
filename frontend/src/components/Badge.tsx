export type BadgeTone = "green" | "gold" | "blue" | "red" | "muted";

const TONES: Record<BadgeTone, string> = {
  green: "bg-meama-green/12 text-meama-green",
  gold: "bg-meama-gold/15 text-[#8a6526]",
  blue: "bg-meama-blue/10 text-meama-blue",
  red: "bg-meama-red/10 text-meama-red",
  muted: "bg-meama-charcoal/8 text-meama-muted",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
