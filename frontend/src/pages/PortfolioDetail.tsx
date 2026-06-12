import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router-dom";

import { AiPanel } from "../components/AiPanel";
import { Badge } from "../components/Badge";
import { Kicker } from "../components/Kicker";
import { MiniBars } from "../components/MiniBars";
import { StatCallout } from "../components/StatCallout";
import { formatGEL, formatGEL0, formatNumber } from "../lib/format";
import { CUSTOMER_AI, CUSTOMERS, NO_DISCOUNT_SEGMENTS, SEGMENT_META } from "../lib/mock";
import { PageHeader } from "./PageHeader";

const CHANNEL_LABEL = { ecom: "E-commerce", brand_store: "Brand store", mixed: "E-com + stores" } as const;

export default function PortfolioDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const ka = i18n.language === "ka";

  const c = CUSTOMERS.find((x) => x.id === id);
  if (!c) return <Navigate to="/portfolios" replace />;

  const meta = SEGMENT_META[c.segment];
  const noDiscount = NO_DISCOUNT_SEGMENTS.includes(c.segment);
  const churnTone = c.churnScore >= 0.7 ? "red" : c.churnScore >= 0.4 ? "gold" : "green";

  return (
    <div>
      <Link to="/portfolios" className="mb-4 inline-block text-xs font-bold uppercase tracking-wider text-meama-gold hover:underline">
        ← {t("pages.portfolioDetail.back")}
      </Link>
      <PageHeader kicker={c.id} title={c.name} />
      <div className="-mt-4 mb-6 flex flex-wrap gap-2">
        <Badge tone={meta.tone}>{ka ? meta.labelKa : meta.label}</Badge>
        {c.upsellFlag ? <Badge tone="blue">upsell target</Badge> : null}
        {noDiscount ? <Badge tone="gold">early access only — never discounts</Badge> : null}
      </div>

      <div className="stagger space-y-5">
        <div className="panel-dark grid grid-cols-2 gap-6 lg:grid-cols-4">
          <StatCallout dark value={formatGEL0(c.ltv)} tag="Lifetime value">
            Registered-customer LTV, retail channels only.
          </StatCallout>
          <StatCallout dark value={formatNumber(c.orders)} tag="Orders" tone="blue">
            Average order value {formatGEL(c.aov)}.
          </StatCallout>
          <StatCallout dark value={`${c.lastOrderDaysAgo}d`} tag="Since last order" tone={c.lastOrderDaysAgo >= 45 ? "red" : "green"}>
            {c.lastOrderDaysAgo >= 45
              ? "Past the 45-day at-risk threshold — win-back is live."
              : "Inside normal reorder cadence."}
          </StatCallout>
          <StatCallout dark value={c.churnScore.toFixed(2)} tag="Churn score" tone={churnTone}>
            Claude batch output (0.0–1.0). Alert fires at 0.7.
          </StatCallout>
        </div>

        <AiPanel title={`AI Note — ${c.name.split(" ")[0]}`} actionLabel="Draft outreach with AI">
          {CUSTOMER_AI[c.id] ?? "A fresh note for this customer lands with the next nightly Claude batch."}
        </AiPanel>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="card-m">
            <Kicker>12-month spend · GEL</Kicker>
            <div className="mt-3">
              <MiniBars data={c.spendHistory} width={460} height={90} />
            </div>
            <div className="tabular mt-2 flex justify-between text-xs text-meama-muted">
              <span>12 months ago</span>
              <span>this month: {formatGEL0(c.spendHistory[c.spendHistory.length - 1])}</span>
            </div>
          </div>

          <div className="card-m">
            <Kicker>Profile</Kicker>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-meama-muted">Preferred channel</dt>
                <dd className="font-semibold text-meama-charcoal">{CHANNEL_LABEL[c.channel]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-meama-muted">Favourite flavours</dt>
                <dd className="flex max-w-[60%] flex-wrap justify-end gap-1.5">
                  {c.favouriteFlavours.map((f) => (
                    <span key={f} className="rounded-full bg-meama-gold/15 px-2.5 py-0.5 text-[11px] font-semibold text-meama-brown">
                      {f}
                    </span>
                  ))}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-meama-muted">Discount policy</dt>
                <dd className={`font-semibold ${noDiscount ? "text-meama-gold" : "text-meama-charcoal"}`}>
                  {noDiscount ? "Early access only" : "Standard (≤ 25% cap)"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-cream/30">{t("common.demoData")}</p>
    </div>
  );
}
