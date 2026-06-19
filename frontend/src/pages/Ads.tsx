import { useTranslation } from "react-i18next";

import { PageHeader } from "./PageHeader";

export default function Ads() {
  const { t } = useTranslation();

  return (
    <div>
      <PageHeader
        kicker="03 · Meta Ads"
        kickerKa="Meta რეკლამა"
        title={t("pages.ads.title")}
        subtitle={t("pages.ads.subtitle")}
      />

      <div className="border border-dashed border-meama-charcoal py-20 text-center">
        <div className="font-display text-[52px] uppercase leading-none tracking-[0.08em] text-meama-charcoal">
          —
        </div>
        <div className="mt-4 font-mono text-xs uppercase tracking-[0.22em] text-meama-muted">
          Meta Ads not connected
        </div>
        <p className="mt-2 text-sm text-meama-charcoal">
          Configure a Meta Marketing API System User token to enable ad intelligence.
        </p>
        <div className="mt-6 space-y-1 text-[11px] text-meama-muted">
          <div>Set <code className="rounded bg-meama-charcoal/10 px-1 py-0.5 text-meama-cream">META_ACCESS_TOKEN</code> in your environment</div>
          <div>Set <code className="rounded bg-meama-charcoal/10 px-1 py-0.5 text-meama-cream">META_AD_ACCOUNT_ID</code> in your environment</div>
          <div className="pt-1 text-meama-charcoal">All ad amounts are USD — never mixed with GEL (₾)</div>
        </div>
      </div>
    </div>
  );
}
