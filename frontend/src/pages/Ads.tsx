import { useTranslation } from "react-i18next";

import { Badge } from "../components/Badge";
import { Kicker } from "../components/Kicker";
import { MiniBars } from "../components/MiniBars";
import { StatCallout } from "../components/StatCallout";
import { formatNumber, formatPercent, formatUSD0 } from "../lib/format";
import { AD_CAMPAIGNS, ROAS_ALERT_THRESHOLD, SPEND_TREND_14D } from "../lib/mock";
import { PageHeader } from "./PageHeader";

export default function Ads() {
  const { t } = useTranslation();
  const spend = AD_CAMPAIGNS.reduce((s, c) => s + c.spend, 0);
  const revenue = AD_CAMPAIGNS.reduce((s, c) => s + c.revenue, 0);
  const purchases = AD_CAMPAIGNS.reduce((s, c) => s + c.purchases, 0);
  const blendedRoas = revenue / spend;
  const underThreshold = AD_CAMPAIGNS.filter((c) => c.roas < ROAS_ALERT_THRESHOLD);

  return (
    <div>
      <PageHeader
        kicker="03 · Meta Ads"
        kickerKa="Meta რეკლამა"
        title={t("pages.ads.title")}
        subtitle={t("pages.ads.subtitle")}
      />

      <div className="card-m mb-6 grid grid-cols-1 gap-6 !border-l-meama-blue bg-meama-charcoal p-6 sm:grid-cols-4">
        <StatCallout dark value={formatUSD0(spend)} tag="Spend · 30d" tone="blue">
          Across {AD_CAMPAIGNS.length} active campaigns. USD — never mixed with GEL.
        </StatCallout>
        <StatCallout dark value={`${blendedRoas.toFixed(1)}×`} tag="Blended ROAS" tone={blendedRoas >= ROAS_ALERT_THRESHOLD ? "green" : "red"}>
          Attributed revenue over spend. Alert threshold {ROAS_ALERT_THRESHOLD.toFixed(1)}×.
        </StatCallout>
        <StatCallout dark value={formatNumber(purchases)} tag="Purchases" tone="gold">
          Meta-attributed orders in the last 30 days.
        </StatCallout>
        <StatCallout dark value={String(underThreshold.length)} tag="Below threshold" tone={underThreshold.length > 0 ? "red" : "green"}>
          Campaigns under the {ROAS_ALERT_THRESHOLD.toFixed(1)}× ROAS floor right now.
        </StatCallout>
      </div>

      <div className="card-m mb-6">
        <div className="flex items-center justify-between">
          <Kicker>Daily spend · last 14 days</Kicker>
          <span className="tabular text-xs text-meama-muted">avg {formatUSD0(SPEND_TREND_14D.reduce((a, b) => a + b, 0) / 14)}/day</span>
        </div>
        <MiniBars data={SPEND_TREND_14D} width={680} height={64} color="var(--meama-blue)" />
      </div>

      <div className="card-m overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-meama-brown/10 text-left text-[11px] uppercase tracking-wider text-meama-muted">
              <th className="px-5 py-3">Campaign</th>
              <th className="px-5 py-3 text-right">Spend</th>
              <th className="px-5 py-3 text-right">Revenue</th>
              <th className="px-5 py-3 text-right">ROAS</th>
              <th className="px-5 py-3 text-right">CTR</th>
              <th className="px-5 py-3 text-right">CPM</th>
              <th className="px-5 py-3 text-right">Purchases</th>
              <th className="px-5 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {AD_CAMPAIGNS.map((c) => {
              const danger = c.roas < ROAS_ALERT_THRESHOLD;
              return (
                <tr key={c.id} className={`border-b border-meama-brown/5 last:border-0 ${danger ? "bg-meama-red/5" : ""}`}>
                  <td className="px-5 py-3 font-semibold text-meama-charcoal">{c.name}</td>
                  <td className="tabular px-5 py-3 text-right">{formatUSD0(c.spend)}</td>
                  <td className="tabular px-5 py-3 text-right">{formatUSD0(c.revenue)}</td>
                  <td className={`tabular px-5 py-3 text-right font-bold ${danger ? "text-meama-red" : "text-meama-green"}`}>
                    {c.roas.toFixed(1)}×
                  </td>
                  <td className="tabular px-5 py-3 text-right">{formatPercent(c.ctr)}</td>
                  <td className="tabular px-5 py-3 text-right">${c.cpm.toFixed(1)}</td>
                  <td className="tabular px-5 py-3 text-right">{formatNumber(c.purchases)}</td>
                  <td className="px-5 py-3 text-right">
                    {danger ? <Badge tone="red">🚨 below 2.0×</Badge> : <Badge tone="green">healthy</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-muted/70">{t("common.demoData")}</p>
    </div>
  );
}
