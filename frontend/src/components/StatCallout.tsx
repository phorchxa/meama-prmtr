import type { ReactNode } from "react";

/** Large stat in the dark-section style: gold top rule, big gold figure. */
export function StatCallout({
  value,
  children,
  tag,
  tone = "gold",
  dark = false,
}: {
  value: string;
  children: ReactNode;
  tag?: string;
  tone?: "gold" | "green" | "red" | "blue";
  dark?: boolean;
}) {
  const toneText = {
    gold: "text-meama-gold",
    green: "text-meama-green",
    red: "text-meama-red",
    blue: "text-meama-blue",
  }[tone];
  const tagTone = {
    gold: "bg-meama-gold/15 text-meama-gold",
    green: "bg-meama-green/15 text-meama-green",
    red: "bg-meama-red/15 text-meama-red",
    blue: "bg-meama-blue/15 text-meama-blue",
  }[tone];
  return (
    <div className="border-t-2 border-meama-gold/40 pt-4">
      <div className={`tabular text-4xl font-extrabold leading-none tracking-tight ${toneText}`}>
        {value}
      </div>
      <p className={`mt-2 text-sm ${dark ? "text-meama-cream/70" : "text-meama-muted"}`}>
        {children}
      </p>
      {tag ? (
        <span
          className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tagTone}`}
        >
          {tag}
        </span>
      ) : null}
    </div>
  );
}
