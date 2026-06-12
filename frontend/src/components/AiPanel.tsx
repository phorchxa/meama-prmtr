import type { ReactNode } from "react";

/**
 * Reserved AI surface. In phase 2 these panels read Claude-generated content
 * from the `ai_insights` table (per-module batch jobs); for now they show a
 * representative sample so the layout and data contract are already in place.
 */
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
    <section className="panel-dark relative overflow-hidden !border-dashed">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-meama-gold/10 blur-2xl"
      />
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="var(--meama-gold)"
            aria-hidden="true"
          >
            <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
            <path d="M19 15l.9 3.1L23 19l-3.1.9L19 23l-.9-3.1L15 19l3.1-.9L19 15z" opacity="0.7" />
          </svg>
          <h3 className="font-display text-sm font-semibold tracking-wide text-meama-goldsoft">
            {title}
          </h3>
        </div>
        <span className="rounded-full border border-meama-gold/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-meama-gold">
          Claude · phase 2
        </span>
      </div>
      <div className="text-sm leading-relaxed text-meama-cream/80">{children}</div>
      {actionLabel ? (
        <button
          type="button"
          disabled
          title="Wires to the Claude batch pipeline in phase 2"
          className="mt-4 cursor-not-allowed rounded-full border border-meama-gold/40 px-4 py-1.5 text-xs font-bold text-meama-gold opacity-70"
        >
          ✦ {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
