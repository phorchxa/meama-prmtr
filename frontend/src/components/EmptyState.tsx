import { useTranslation } from "react-i18next";

export function EmptyState({ title, hint }: { title?: string; hint?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-meama-charcoal py-16 text-center">
      <div className="font-display text-[52px] uppercase leading-none tracking-[0.08em] text-meama-charcoal">
        —
      </div>
      <div className="mt-3 font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
        {title ?? t("common.empty")}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-meama-charcoal">{hint ?? t("common.empty_hint")}</div>
      ) : null}
    </div>
  );
}
