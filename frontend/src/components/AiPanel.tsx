import type { ReactNode } from "react";

export function AiPanel({
  title = "AI Insight",
  children,
  actionLabel,
}: {
  title?: string;
  children: ReactNode;
  actionLabel?: string;
}) {
  return (
    <section className="border border-meama-charcoal bg-[#121712] p-6 text-[#F5F7F5]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#F5F7F5" aria-hidden="true">
            <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
            <path d="M19 15l.9 3.1L23 19l-3.1.9L19 23l-.9-3.1L15 19l3.1-.9L19 15z" opacity="0.5" />
          </svg>
          <h3 className="font-mono text-[9.5px] uppercase tracking-[0.3em] text-[#CBD1CC]">
            {title}
          </h3>
        </div>
        <span className="border border-[#F5F7F5]/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#CBD1CC]/50">
          Claude · phase 2
        </span>
      </div>
      <div className="text-sm leading-relaxed text-[#9BA39C]">{children}</div>
      {actionLabel ? (
        <button
          type="button"
          disabled
          title="Wires to the Claude batch pipeline in phase 2"
          className="mt-5 border border-[#F5F7F5]/20 px-4 py-2 font-mono text-[10px] uppercase
                     tracking-[0.2em] text-[#F5F7F5]/40 cursor-not-allowed"
        >
          ✦ {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
