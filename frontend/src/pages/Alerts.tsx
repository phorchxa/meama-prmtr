import { useTranslation } from "react-i18next";

import { Badge } from "../components/Badge";
import { ALERTS } from "../lib/mock";
import { PageHeader } from "./PageHeader";

const BORDER: Record<string, string> = {
  critical: "!border-l-meama-red",
  warning: "!border-l-meama-gold",
  info: "!border-l-meama-blue",
};

export default function Alerts() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader
        kicker="11 · Alerts"
        kickerKa="შეტყობინებები"
        title={t("pages.alerts.title")}
        subtitle={t("pages.alerts.subtitle")}
      />

      <div className="max-w-3xl space-y-3">
        {ALERTS.map((a) => (
          <div key={a.id} className={`card-m ${BORDER[a.severity]}`}>
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="text-lg leading-none">{a.emoji}</span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-meama-charcoal">{a.title}</h3>
                  <div className="flex items-center gap-2">
                    <Badge tone={a.channel === "telegram" ? "blue" : "muted"}>
                      {a.channel === "telegram" ? "Telegram" : "in-app"}
                    </Badge>
                    <span className="tabular text-xs text-meama-muted">{a.time}</span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-meama-muted">{a.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-cream/30">{t("common.demoData")}</p>
    </div>
  );
}
