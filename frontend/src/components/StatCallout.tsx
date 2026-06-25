import type { ReactNode } from "react";

/** Large editorial stat block — Yeezy style big numbers. */
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
    gold:  dark ? "text-[#F5F7F5]"   : "text-meama-brown",
    green: dark ? "text-[#3DAE68]"   : "text-meama-green",
    red:   dark ? "text-[#E5484D]"   : "text-meama-red",
    blue:  dark ? "text-[#2E84F0]"   : "text-meama-blue",
  }[tone];

  const tagBase = dark
    ? "border-[#F5F7F5]/20 text-[#CBD1CC]"
    : "border-meama-charcoal text-meama-muted";

  return (
    <div className="border-t border-meama-charcoal/50 pt-5">
      <div
        className={`tabular font-mono text-[44px] font-semibold leading-none tracking-[-0.02em] ${toneText}`}
      >
        {value}
      </div>
      <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-[#9BA39C]" : "text-meama-muted"}`}>
        {children}
      </p>
      {tag ? (
        <span
          className={`mt-3 inline-block border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] ${tagBase}`}
        >
          {tag}
        </span>
      ) : null}
    </div>
  );
}
