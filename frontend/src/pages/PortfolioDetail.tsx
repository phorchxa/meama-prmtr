import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router-dom";

import { Badge, type BadgeTone } from "../components/Badge";
import { Kicker } from "../components/Kicker";
import { Skeleton } from "../components/Skeleton";
import { StatCallout } from "../components/StatCallout";
import { formatGEL, formatGEL0, formatNumber, tbilisiDate } from "../lib/format";
import {
  fetchPortfolio,
  type PortfolioDetail as PortfolioDetailData,
} from "../lib/portfoliosApi";
import { PageHeader } from "./PageHeader";

const STATUS_TONE: Record<string, BadgeTone> = {
  new:     "blue",
  active:  "green",
  at_risk: "gold",
  lost:    "red",
};

const STATUS_KA: Record<string, string> = {
  new:     "ახალი",
  active:  "აქტიური",
  at_risk: "რისკის ქვეშ",
  lost:    "დაკარგული",
};

const CHANNEL_LABEL: Record<string, string> = {
  online:   "E-commerce",
  in_store: "Brand store",
  app:      "App",
  mixed:    "E-com + stores",
};

const SOURCE_LABEL: Record<string, string> = {
  web:            "E-commerce",
  pos:            "Brand store",
  "195189899265": "App",
};

const REGION_KA: Record<string, string> = {
  tbilisi: "თბილისი",
  regions: "რეგიონები",
  unknown: "უცნობი",
};

export default function PortfolioDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const ka = i18n.language === "ka";

  const [data,     setData]     = useState<PortfolioDetailData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setError(null);
    fetchPortfolio(Number(id))
      .then(setData)
      .catch((err: Error) => {
        if (err.message === "not_found") setNotFound(true);
        else setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (!id || notFound) return <Navigate to="/portfolios" replace />;

  const days      = data?.days_since_last_order ?? 0;
  const daysTone: BadgeTone  = days >= 90 ? "red" : days >= 45 ? "gold" : "green";
  const statusTone: BadgeTone = data ? (STATUS_TONE[data.status] ?? "blue") : "blue";

  return (
    <div>
      <Link
        to="/portfolios"
        className="mb-4 inline-block text-xs font-bold uppercase tracking-wider text-meama-gold hover:underline"
      >
        ← {t("pages.portfolioDetail.back")}
      </Link>

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-5">
          <Skeleton className="h-20 w-3/4 rounded-2xl" />
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-meama-red/30 bg-meama-red/10 px-5 py-4 text-sm text-meama-red">
          {error}
        </div>
      )}

      {data && (
        <>
          <PageHeader
            kicker={`#${data.shopify_customer_id}`}
            title={
              data.phone_only
                ? `${data.initials} · Phone login`
                : (data.full_name?.trim() || data.email || data.initials)
            }
          />

          <div className="-mt-4 mb-6 flex flex-wrap gap-2">
            <Badge tone={statusTone}>
              {ka ? (STATUS_KA[data.status] ?? data.status) : data.status.replace("_", " ")}
            </Badge>
            <Badge tone="blue">
              {ka ? (REGION_KA[data.region] ?? data.region) : data.region}
            </Badge>
            {data.has_machine && (
              <Badge tone="blue">
                {data.machine_model ?? (ka ? "მანქანის მფლობელი" : "Machine owner")}
              </Badge>
            )}
            {data.phone_only  && <Badge tone="gold">Phone login</Badge>}
          </div>

          <div className="stagger space-y-5">
            {/* KPI row */}
            <div className="panel-dark grid grid-cols-2 gap-6 lg:grid-cols-4">
              <StatCallout dark value={formatGEL0(data.total_spend)} tag="Total spend">
                {formatNumber(data.order_count)}{" "}
                {ka ? "შეკვეთა" : "orders"} · AOV {formatGEL(data.aov)}
              </StatCallout>

              <StatCallout dark value={formatNumber(data.order_count)} tag="Orders" tone="blue">
                {ka ? "პირველი" : "First"}:{" "}
                {data.first_order_at ? tbilisiDate(data.first_order_at) : "—"}
              </StatCallout>

              <StatCallout
                dark
                value={`${days}d`}
                tag={ka ? "ბოლო შეკვეთიდან" : "Since last order"}
                tone={daysTone}
              >
                {days >= 90
                  ? (ka ? "დაკარგული — 90+ დღე" : "Lost — 90+ days silent")
                  : days >= 45
                  ? (ka ? "რისკის ქვეშ — 45-89 დღე" : "At-risk — 45–89 day window")
                  : (ka ? "ნორმალური ციკლი" : "Inside normal reorder cadence")}
              </StatCallout>

              <StatCallout
                dark
                value={data.channel ? (CHANNEL_LABEL[data.channel] ?? data.channel) : "—"}
                tag="Channel"
                tone="gold"
              >
                {data.is_registered
                  ? (ka ? "რეგისტრირებული" : "Registered customer")
                  : (ka ? "სტუმარი" : "Guest checkout")}
              </StatCallout>
            </div>

            {/* Top product categories */}
            <div className="card-m">
              <Kicker>{ka ? "ტოპ კატეგორიები · ბოლო შეკვეთები" : "Top categories · recent orders"}</Kicker>
              <div className="mt-3 flex flex-wrap gap-2">
                {(data.top_product_types ?? []).length > 0 ? (
                  data.top_product_types!.map((pt) => (
                    <span
                      key={pt}
                      className="rounded-full bg-meama-gold/15 px-3 py-1 text-sm font-semibold text-meama-brown"
                    >
                      {pt}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-meama-muted">—</span>
                )}
                {data.has_machine && (
                  <span className="rounded-full bg-meama-blue/10 px-3 py-1 text-sm font-semibold text-meama-blue">
                    {ka ? "მანქანის მფლობელი" : "Machine owner"}
                  </span>
                )}
              </div>
            </div>

            {/* Order timeline */}
            <div className="card-m">
              <Kicker>{ka ? "შეკვეთების ისტორია" : "Order history"}</Kicker>
              {data.recent_orders.length === 0 ? (
                <p className="mt-3 text-sm text-meama-muted">
                  {ka ? "შეკვეთები ვერ მოიძებნა" : "No orders found"}
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="tabular w-full text-sm">
                    <thead>
                      <tr className="border-b border-meama-brown/10 text-[11px] uppercase tracking-wider text-meama-muted">
                        <th className="pb-2 text-left font-semibold">
                          {ka ? "შეკვეთა" : "Order"}
                        </th>
                        <th className="pb-2 text-left font-semibold">
                          {ka ? "თარიღი" : "Date"}
                        </th>
                        <th className="pb-2 text-left font-semibold">
                          {ka ? "არხი" : "Channel"}
                        </th>
                        <th className="pb-2 text-right font-semibold">
                          {ka ? "ჯამი" : "Total"}
                        </th>
                        <th className="pb-2 text-right font-semibold">
                          {ka ? "ფასდაკლება" : "Discount"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-meama-brown/5">
                      {data.recent_orders.map((o) => (
                        <tr key={o.shopify_order_id} className="hover:bg-meama-brown/5">
                          <td className="py-2 text-meama-cream/70">
                            #{o.shopify_order_id}
                          </td>
                          <td className="py-2 text-meama-muted">
                            {o.processed_at ? tbilisiDate(o.processed_at) : "—"}
                          </td>
                          <td className="py-2 text-meama-muted">
                            {o.source
                              ? (SOURCE_LABEL[o.source] ?? o.source)
                              : "—"}
                          </td>
                          <td className="py-2 text-right font-semibold text-meama-brown">
                            {formatGEL(o.total)}
                          </td>
                          <td className="py-2 text-right text-meama-muted">
                            {o.discount_code
                              ? `${o.discount_code} (${formatGEL(o.discount_amount)})`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
