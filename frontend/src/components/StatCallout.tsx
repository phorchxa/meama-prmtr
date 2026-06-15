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
    gold:  dark ? "text-[#F4F0EA]"   : "text-meama-brown",
    green: dark ? "text-[#5CB87A]"   : "text-meama-green",
    red:   dark ? "text-[#E05A52]"   : "text-meama-red",
    blue:  dark ? "text-[#6B8FD8]"   : "text-meama-blue",
  }[tone];

  const tagBase = dark
    ? "border-[#F4F0EA]/20 text-[#C8C3BC]"
    : "border-meama-charcoal text-meama-muted";

  return (
    <div className="border-t border-meama-charcoal/50 pt-5">
      <div
        className={`tabular font-display text-[52px] uppercase leading-none tracking-[0.04em] ${toneText}`}
      >
        {value}
      </div>
      <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-[#9A9590]" : "text-meama-muted"}`}>
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
