import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "../components/Badge";
import { formatGEL0 } from "../lib/format";
import { ACTIONS } from "../lib/mock";
import { PageHeader } from "./PageHeader";

const SEVERITY_TONE = { critical: "red", high: "gold", normal: "muted" } as const;

export default function Actions() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader
        kicker="05 · Action Queue"
        kickerKa="ქმედებების რიგი"
        title={t("pages.actions.title")}
        subtitle={t("pages.actions.subtitle")}
      />

      <div className="space-y-3">
        {ACTIONS.map((a) => (
          <Link
            key={a.rank}
            to={a.to}
            className={`card-m card-m-hover flex items-center justify-between gap-4 ${
              a.severity === "critical" ? "!border-l-meama-red" : a.severity === "high" ? "!border-l-meama-gold" : "!border-l-meama-brown/20"
            }`}
          >
            <div className="flex items-start gap-4">
              <span className="tabular mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-meama-charcoal text-sm font-extrabold text-meama-gold">
                {a.rank}
              </span>
              <div>
                <h3 className="font-bold text-meama-charcoal">{a.title}</h3>
                <p className="mt-0.5 text-sm text-meama-muted">{a.signal}</p>
                <span className="mt-1 inline-block text-[11px] font-semibold uppercase tracking-wider text-meama-gold">
                  {a.module} →
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {a.impact > 0 ? (
                <span className="tabular text-lg font-extrabold text-meama-brown">{formatGEL0(a.impact)}</span>
              ) : (
                <span className="text-sm text-meama-muted">—</span>
              )}
              <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-muted/70">{t("common.demoData")}</p>
    </div>
  );
}
