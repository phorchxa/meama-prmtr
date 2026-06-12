import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { IntensityDots } from "../components/IntensityDots";
import { MiniBars } from "../components/MiniBars";
import { formatGEL, formatNumber, formatPercent } from "../lib/format";
import { CATEGORIES } from "../lib/mock";
import { PageHeader } from "./PageHeader";

const FILTERS = [{ id: "all", name: "All products" }, ...CATEGORIES.map((c) => ({ id: c.id, name: c.name }))];

export default function Products() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");

  const products = CATEGORIES.filter((c) => filter === "all" || c.id === filter).flatMap((c) =>
    c.products.map((p) => ({ ...p, category: c.name })),
  );

  return (
    <div>
      <PageHeader
        kicker="Products"
        kickerKa="პროდუქტები"
        title={t("pages.products.title")}
        subtitle={t("pages.products.subtitle")}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 ${
              filter === f.id
                ? "bg-meama-gold text-meama-espresso shadow-[0_6px_18px_rgba(200,150,62,0.35)]"
                : "border border-meama-gold/35 text-meama-cream/65 hover:bg-meama-gold/15 hover:text-meama-goldsoft"
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="stagger grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const declining = p.monthly[11] < p.monthly[0];
          return (
            <Link key={p.sku} to={`/products/${p.sku}`} className="card-m card-m-hover block">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-meama-gold">
                    {p.category}
                  </div>
                  <h3 className="font-display text-xl font-semibold text-meama-brown">{p.name}</h3>
                  <div className="tabular text-[11px] text-meama-muted">{p.sku}</div>
                </div>
                <span className="tabular shrink-0 rounded-full bg-meama-brown px-3 py-1 text-xs font-bold text-meama-goldsoft">
                  {formatGEL(p.price)}
                </span>
              </div>

              <p className="mt-2 text-sm text-meama-muted">{p.notes}</p>

              {p.intensity != null ? (
                <div className="mt-3">
                  <IntensityDots value={p.intensity} />
                </div>
              ) : null}

              <div className="tabular mt-4 flex items-end justify-between border-t border-meama-brown/10 pt-3">
                <div className="text-xs text-meama-muted">
                  <span className="block font-bold text-meama-brown">{formatNumber(p.units30d)} units · 30d</span>
                  {p.repeatRate > 0 ? `repeat ${formatPercent(p.repeatRate, 0)}` : "hardware"}
                </div>
                <MiniBars data={p.monthly} width={110} height={30} color={declining ? "var(--meama-red)" : "var(--meama-gold)"} />
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11px] text-meama-cream/30">{t("common.demoData")}</p>
    </div>
  );
}
