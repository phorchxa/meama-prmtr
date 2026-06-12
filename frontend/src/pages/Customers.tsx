import { useTranslation } from "react-i18next";

import { Kicker } from "../components/Kicker";
import { StatCallout } from "../components/StatCallout";
import { formatGEL, formatNumber, formatPercent } from "../lib/format";
import { AOV_BY_SEGMENT, CHURN_BUCKETS, NEW_VS_RETURNING, SEGMENT_DISTRIBUTION, SEGMENT_META } from "../lib/mock";
import { PageHeader } from "./PageHeader";

const TONE_BG: Record<string, string> = {
  green: "bg-meama-green",
  gold: "bg-meama-gold",
  blue: "bg-meama-blue",
  red: "bg-meama-red",
  muted: "bg-meama-muted",
};

export default function Customers() {
  const { t, i18n } = useTranslation();
  const ka = i18n.language === "ka";
  const maxChurn = Math.max(...CHURN_BUCKETS.map((b) => b.count));
  const maxAov = Math.max(...AOV_BY_SEGMENT.map((s) => s.aov));

  return (
    <div>
      <PageHeader
        kicker="07 · Customers"
        kickerKa="მომხმარებლები"
        title={t("pages.customers.title")}
        subtitle={t("pages.customers.subtitle")}
      />

      <div className="card-m mb-6 grid grid-cols-1 gap-6 bg-meama-charcoal p-6 sm:grid-cols-4">
        <StatCallout dark value="12,408" tag="Active">
          Registered customers with a retail order in 90 days.
        </StatCallout>
        <StatCallout dark value="1,733" tag="At risk · 45–89d" tone="red">
          Past the 45-day silence threshold — win-back fires automatically.
        </StatCallout>
        <StatCallout dark value="612" tag="Churn ≥ 0.7" tone="red">
          High churn scores from the nightly Claude batch.
        </StatCallout>
        <StatCallout dark value="₾50.2" tag="AOV" tone="gold">
          Zero-spend orders excluded by rule.
        </StatCallout>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-m">
          <Kicker>Segment distribution</Kicker>
          <ul className="mt-3 space-y-3">
            {SEGMENT_DISTRIBUTION.map(({ segment, share, count }) => {
              const meta = SEGMENT_META[segment];
              return (
                <li key={segment}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-meama-charcoal">
                      {ka ? meta.labelKa : meta.label}
                    </span>
                    <span className="tabular text-xs text-meama-muted">
                      {formatNumber(count)} · {formatPercent(share, 0)}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-meama-charcoal/5">
                    <div
                      className={`h-full rounded-full ${TONE_BG[meta.tone]}`}
                      style={{ width: `${share * 100 * 2.8}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card-m">
          <Kicker>Churn score distribution</Kicker>
          <p className="mt-1 text-xs text-meama-muted">Claude output, 0.0–1.0 — never a trained model. Alert at ≥ 0.7.</p>
          <div className="mt-4 flex h-40 items-end gap-3">
            {CHURN_BUCKETS.map((b, i) => {
              const hot = i >= 3;
              return (
                <div key={b.range} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="tabular text-xs font-semibold text-meama-charcoal">{formatNumber(b.count)}</span>
                  <div
                    className={`w-full rounded-t ${hot ? "bg-meama-red" : "bg-meama-gold"} ${hot ? "" : "opacity-80"}`}
                    style={{ height: `${(b.count / maxChurn) * 100}%` }}
                  />
                  <span className="tabular text-[10px] text-meama-muted">{b.range}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-m">
          <Kicker>AOV by segment</Kicker>
          <ul className="mt-3 space-y-3">
            {AOV_BY_SEGMENT.map(({ segment, aov }) => {
              const meta = SEGMENT_META[segment];
              return (
                <li key={segment} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 font-semibold text-meama-charcoal">
                    {ka ? meta.labelKa : meta.label}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-meama-charcoal/5">
                    <div className={`h-full rounded-full ${TONE_BG[meta.tone]}`} style={{ width: `${(aov / maxAov) * 100}%` }} />
                  </div>
                  <span className="tabular w-16 text-right font-bold text-meama-brown">{formatGEL(aov)}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card-m">
          <Kicker>New vs returning · 12 months</Kicker>
          <p className="mt-1 text-xs text-meama-muted">Share of monthly orders from first-time buyers.</p>
          <div className="mt-4 flex h-40 items-end gap-2">
            {NEW_VS_RETURNING.map((mth) => (
              <div key={mth.month} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 flex-col justify-end overflow-hidden rounded-t bg-meama-brown/85">
                  <div className="w-full bg-meama-gold" style={{ height: `${mth.newPct * 100}%` }} />
                </div>
                <span className="text-[10px] text-meama-muted">{mth.month}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-meama-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-meama-gold" /> New</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-meama-brown/85" /> Returning</span>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-muted/70">{t("common.demoData")}</p>
    </div>
  );
}
