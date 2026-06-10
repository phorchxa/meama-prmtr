import { useTranslation } from "react-i18next";

export function EmptyState({ title, hint }: { title?: string; hint?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-meama-gold/40 bg-white/60 p-12 text-center">
      <div className="text-3xl">☕</div>
      <div className="mt-2 font-medium text-meama-brown">{title ?? t("common.empty")}</div>
      <div className="mt-1 text-sm text-meama-muted">{hint ?? t("common.empty_hint")}</div>
    </div>
  );
}
