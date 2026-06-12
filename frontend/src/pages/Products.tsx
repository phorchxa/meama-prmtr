import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { MiniBars } from "../components/MiniBars";
import { formatGEL0, formatNumber, formatPercent } from "../lib/format";
import { CATEGORIES } from "../lib/mock";
import { PageHeader } from "./PageHeader";

/** Sum of per-product monthly units → category trend. */
function categoryTrend(monthlies: number[][]): number[] {
  return monthlies.reduce((acc, m) => acc.map((v, i) => v + (m[i] ?? 0)), new Array<number>(12).fill(0));
}

export default function Products() {
  const { t, i18n } = useTranslation();
  const ka = i18n.language === "ka";

  return (
    <div>
      <PageHeader
        kicker="06 · Products"
        kickerKa="პროდუქტები"
        title={t("pages.products.title")}
        subtitle={t("pages.products.subtitle")}
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((cat) => (
          <Link key={cat.id} to={`/products/${cat.id}`} className="card-m card-m-hover block">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-meama-gold">
              {formatNumber(cat.products.length)} SKUs
            </div>
            <h3 className="text-lg font-extrabold text-meama-charcoal">{ka ? cat.nameKa : cat.name}</h3>
            <p className="mt-1 min-h-10 text-sm text-meama-muted">{cat.blurb}</p>

            <div className="tabular mt-4 grid grid-cols-3 gap-2 border-t border-meama-brown/10 pt-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-meama-muted">Revenue 30d</div>
                <div className="font-extrabold text-meama-brown">{formatGEL0(cat.revenue30d)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-meama-muted">Units 30d</div>
                <div className="font-extrabold text-meama-brown">{formatNumber(cat.units30d)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-meama-muted">Avg margin</div>
                <div className="font-extrabold text-meama-green">{formatPercent(cat.marginAvg, 0)}</div>
              </div>
            </div>

            <div className="mt-4">
              <MiniBars data={categoryTrend(cat.products.map((p) => p.monthly))} width={260} height={40} />
            </div>

            <span className="mt-4 inline-block text-xs font-bold uppercase tracking-wider text-meama-gold">
              {t("pages.productDetail.flavours")} →
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-muted/70">{t("common.demoData")}</p>
    </div>
  );
}
