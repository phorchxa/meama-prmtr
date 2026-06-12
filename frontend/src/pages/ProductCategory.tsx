import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router-dom";

import { IntensityDots } from "../components/IntensityDots";
import { MiniBars } from "../components/MiniBars";
import { StatCallout } from "../components/StatCallout";
import { formatGEL, formatGEL0, formatNumber, formatPercent } from "../lib/format";
import { CATEGORIES } from "../lib/mock";
import { PageHeader } from "./PageHeader";

export default function ProductCategory() {
  const { t, i18n } = useTranslation();
  const { categoryId } = useParams();
  const ka = i18n.language === "ka";

  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (!cat) return <Navigate to="/products" replace />;

  const bestSeller = [...cat.products].sort((a, b) => b.units30d - a.units30d)[0];

  return (
    <div>
      <Link to="/products" className="mb-4 inline-block text-xs font-bold uppercase tracking-wider text-meama-gold hover:underline">
        ← {t("pages.productDetail.back")}
      </Link>
      <PageHeader
        kicker={cat.name}
        kickerKa={cat.nameKa}
        title={ka ? cat.nameKa : cat.name}
        subtitle={cat.blurb}
      />

      <div className="card-m mb-6 grid grid-cols-1 gap-6 bg-meama-charcoal p-6 sm:grid-cols-4">
        <StatCallout dark value={formatGEL0(cat.revenue30d)} tag="Revenue · 30d">
          E-commerce + brand stores only.
        </StatCallout>
        <StatCallout dark value={formatNumber(cat.units30d)} tag="Units · 30d" tone="blue">
          Boxes / units sold across the category.
        </StatCallout>
        <StatCallout dark value={formatPercent(cat.marginAvg, 0)} tag="Avg margin" tone="green">
          Weighted gross margin across SKUs.
        </StatCallout>
        <StatCallout dark value={bestSeller.name} tag="Best seller" tone="gold">
          {formatNumber(bestSeller.units30d)} units in the last 30 days.
        </StatCallout>
      </div>

      <div className="card-m overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-meama-brown/10 text-left text-[11px] uppercase tracking-wider text-meama-muted">
              <th className="px-5 py-3">{t("pages.productDetail.flavours")}</th>
              <th className="px-5 py-3">Intensity</th>
              <th className="px-5 py-3">Notes</th>
              <th className="px-5 py-3 text-right">Price</th>
              <th className="px-5 py-3 text-right">Units 30d</th>
              <th className="px-5 py-3 text-right">Repeat rate</th>
              <th className="px-5 py-3">{t("pages.productDetail.history")}</th>
            </tr>
          </thead>
          <tbody>
            {cat.products.map((p) => {
              const declining = p.monthly[11] < p.monthly[0];
              return (
                <tr key={p.sku} className="border-b border-meama-brown/5 last:border-0 hover:bg-meama-cream/40">
                  <td className="px-5 py-3">
                    <div className="font-bold text-meama-charcoal">{p.name}</div>
                    <div className="tabular text-[11px] text-meama-muted">{p.sku}</div>
                  </td>
                  <td className="px-5 py-3">
                    {p.intensity != null ? <IntensityDots value={p.intensity} /> : <span className="text-meama-muted">—</span>}
                  </td>
                  <td className="px-5 py-3 text-meama-muted">{p.notes}</td>
                  <td className="tabular px-5 py-3 text-right font-semibold">{formatGEL(p.price)}</td>
                  <td className="tabular px-5 py-3 text-right">{formatNumber(p.units30d)}</td>
                  <td className="tabular px-5 py-3 text-right">
                    {p.repeatRate > 0 ? formatPercent(p.repeatRate, 0) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <MiniBars data={p.monthly} color={declining ? "var(--meama-red)" : "var(--meama-gold)"} />
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
