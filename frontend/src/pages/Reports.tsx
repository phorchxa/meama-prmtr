import { useTranslation } from "react-i18next";

import { formatNumber } from "../lib/format";
import { REPORTS } from "../lib/mock";
import { PageHeader } from "./PageHeader";

export default function Reports() {
  const { t, i18n } = useTranslation();
  const ka = i18n.language === "ka";

  return (
    <div>
      <PageHeader
        kicker="10 · Reports"
        kickerKa="ანგარიშები"
        title={t("pages.reports.title")}
        subtitle={t("pages.reports.subtitle")}
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <div key={r.id} className="card-m card-m-hover flex flex-col">
            <h3 className="font-extrabold text-meama-charcoal">{ka ? r.nameKa : r.name}</h3>
            <p className="mt-1 flex-1 text-sm text-meama-muted">{r.description}</p>
            <div className="tabular mt-4 flex items-center justify-between border-t border-meama-brown/10 pt-3 text-xs text-meama-muted">
              <span>{r.lastGenerated}</span>
              <span>{formatNumber(r.rows)} rows</span>
            </div>
            <div className="mt-3 flex gap-2">
              <span className="rounded-full border border-meama-gold/40 px-3 py-1 text-[11px] font-bold text-meama-brown">
                CSV
              </span>
              <span className="rounded-full border border-meama-gold/40 px-3 py-1 text-[11px] font-bold text-meama-brown">
                XLSX
              </span>
              <span className="rounded-full bg-meama-gold/15 px-3 py-1 text-[11px] font-bold text-meama-gold">
                pre-computed nightly
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-muted/70">{t("common.demoData")}</p>
    </div>
  );
}
