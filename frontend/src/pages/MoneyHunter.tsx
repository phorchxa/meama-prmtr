import { useTranslation } from "react-i18next";

import { Badge } from "../components/Badge";
import { StatCallout } from "../components/StatCallout";
import { formatGEL0, formatNumber } from "../lib/format";
import { MONEY_ON_TABLE, OPPORTUNITIES } from "../lib/mock";
import { PageHeader } from "./PageHeader";

const CONFIDENCE_TONE = { high: "green", medium: "gold", low: "muted" } as const;

export default function MoneyHunter() {
  const { t } = useTranslation();
  const highConfidence = OPPORTUNITIES.filter((o) => o.confidence === "high");
  const targets = OPPORTUNITIES.reduce((s, o) => s + o.customers, 0);

  return (
    <div>
      <PageHeader
        kicker="02 · Money Hunter"
        kickerKa="ფულის მონადირე"
        title={t("pages.moneyHunter.title")}
        subtitle={t("pages.moneyHunter.subtitle")}
      />

      <div className="panel-dark mb-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCallout dark value={formatGEL0(MONEY_ON_TABLE)} tag="Total opportunity">
          Estimated recoverable revenue across all open plays.
        </StatCallout>
        <StatCallout dark value={formatNumber(targets)} tag="Target customers" tone="blue">
          Customers matched to at least one play — no overlap double-counting.
        </StatCallout>
        <StatCallout dark value={formatGEL0(highConfidence.reduce((s, o) => s + o.estValue, 0))} tag="High confidence" tone="green">
          Value in plays with strong signal quality and proven playbooks.
        </StatCallout>
      </div>

      <div className="space-y-4">
        {OPPORTUNITIES.map((op, i) => (
          <div key={op.id} className="card-m card-m-hover">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-4">
                <span className="tabular mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-meama-gold/15 text-sm font-extrabold text-meama-gold">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-bold text-meama-charcoal">{op.title}</h3>
                  <p className="mt-1 text-sm text-meama-muted">{op.detail}</p>
                  <p className="mt-2 text-sm text-meama-brown">
                    <span className="font-semibold text-meama-gold">Playbook · </span>
                    {op.playbook}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="tabular text-2xl font-extrabold text-meama-brown">{formatGEL0(op.estValue)}</div>
                <div className="flex gap-2">
                  <Badge tone={CONFIDENCE_TONE[op.confidence]}>{`${op.confidence} confidence`}</Badge>
                  <Badge tone={op.discountAllowed ? "blue" : "red"}>
                    {op.discountAllowed ? "discount ok ≤25%" : "no discount"}
                  </Badge>
                </div>
                <div className="tabular text-xs text-meama-muted">{formatNumber(op.customers)} customers</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-cream/30">{t("common.demoData")}</p>
    </div>
  );
}
