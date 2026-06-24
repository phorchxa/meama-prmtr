import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { Skeleton } from "../components/Skeleton";
import { formatGEL, formatGEL0, formatNumber, tbilisiDate } from "../lib/format";
import {
  fetchPortfolio,
  type ChurnReason,
  type CustomerSegment,
  type CustomerStatus,
  type DeliveryVsPickupPreference,
  type PortfolioDetail as PortfolioDetailData,
  type ReturnPeriodLabel,
  type SessionProduct,
} from "../lib/portfoliosApi";
import { PageHeader } from "./PageHeader";

type Tone = "green" | "red" | "amber" | "blue" | "purple" | "neutral";

const SEGMENT_LABEL: Record<CustomerSegment, string> = {
  loyalist: "Loyal",
  at_risk: "At Risk",
  lapsed: "Lost",
  new_machine: "New Machine",
  active: "Active",
  prospect: "Prospect",
};

const STATUS_LABEL: Record<CustomerStatus, string> = {
  new: "New",
  active: "Active",
  at_risk: "At Risk",
  lost: "Lost",
  prospect: "Prospect",
};

const CHURN_LABEL: Record<ChurnReason, string> = {
  healthy_active: "Healthy active",
  promo_dependent: "Promo dependent",
  long_recency_gap: "Long recency gap",
  machine_without_capsules: "Machine without capsules",
  low_frequency: "Low frequency",
  single_category_dependency: "Single category dependency",
  new_customer: "New customer",
  never_ordered: "Never ordered",
  unknown: "Unknown",
};

const RETURN_LABEL: Record<ReturnPeriodLabel, string> = {
  frequent: "Frequent",
  regular: "Regular",
  slow: "Slow",
  lapsed_pattern: "Lapsed pattern",
};

const DELIVERY_LABEL: Record<DeliveryVsPickupPreference, string> = {
  delivery: "Delivery",
  pickup_or_store: "Pickup / store",
  mixed: "Mixed",
  unknown: "Unknown",
};

const SOURCE_LABEL: Record<string, string> = {
  web: "E-commerce",
  pos: "Brand store",
  "195189899265": "App",
};

const CHANNEL_LABEL: Record<string, string> = {
  online: "E-commerce",
  in_store: "Brand store",
  app: "App",
  mixed: "Mixed",
};

const SEGMENT_TONE: Record<CustomerSegment, Tone> = {
  loyalist: "green",
  at_risk: "amber",
  lapsed: "red",
  new_machine: "blue",
  active: "green",
  prospect: "neutral",
};

const STATUS_TONE: Record<CustomerStatus, Tone> = {
  new: "blue",
  active: "green",
  at_risk: "amber",
  lost: "red",
  prospect: "neutral",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function valueOrDash(value: ReactNode | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function dateOrDash(value: string | null | undefined) {
  return value ? tbilisiDate(value) : "—";
}

function pct(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function numberOrDash(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${formatNumber(value)}${suffix}`;
}

function regionLabel(region: string | null | undefined) {
  if (region === "tbilisi") return "Tbilisi";
  if (region === "regions") return "Regions";
  return "Unknown";
}

function tagClass(tone: Tone = "neutral") {
  const tones: Record<Tone, string> = {
    green: "border-[#a8d9bf] bg-[#e9f6ef] text-[#147348]",
    red: "border-[#efb7b1] bg-[#fff0ee] text-[#bb3a2f]",
    amber: "border-[#e4c07f] bg-[#fff4df] text-[#a26a10]",
    blue: "border-[#abc4ee] bg-[#edf3ff] text-[#214f90]",
    purple: "border-[#c8b3f3] bg-[#f3efff] text-[#6b43b6]",
    neutral: "border-[rgba(32,27,20,.095)] bg-[#f7f3ec] text-[#62594e]",
  };
  return tones[tone];
}

function toneTextClass(tone: Tone = "neutral") {
  const tones: Record<Tone, string> = {
    green: "text-[#147348]",
    red: "text-[#bb3a2f]",
    amber: "text-[#a26a10]",
    blue: "text-[#214f90]",
    purple: "text-[#6b43b6]",
    neutral: "text-[#62594e]",
  };
  return tones[tone];
}

function healthTone(score: number): Tone {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}

function healthFill(score: number) {
  if (score >= 70) return "bg-[#147348]";
  if (score >= 40) return "bg-[#a26a10]";
  return "bg-[#bb3a2f]";
}

function churnTone(reason: ChurnReason | null | undefined): Tone {
  if (!reason || reason === "unknown") return "neutral";
  if (reason === "healthy_active" || reason === "new_customer") return "green";
  if (reason === "promo_dependent" || reason === "low_frequency" || reason === "single_category_dependency") return "amber";
  return "red";
}

function topFlavor(data: PortfolioDetailData) {
  return data.top_flavors?.[0] ?? data.top_item_title ?? null;
}

function machineStatus(data: PortfolioDetailData) {
  if (data.has_machine) return data.machine_model ?? "Machine owned";
  if (data.machine_to_capsule_conversion_status === "capsules_without_machine_purchase") return "Capsules only";
  return "No machine";
}

function nextBestAction(data: PortfolioDetailData) {
  if (data.churn_reason === "healthy_active") return "Keep cadence steady; surface a relevant capsule refill.";
  if (data.churn_reason === "promo_dependent") return "Use value framing before discounts; protect full-price margin.";
  if (data.churn_reason === "long_recency_gap") return "Prioritize a winback message tied to their known product profile.";
  if (data.churn_reason === "machine_without_capsules") return "Trigger machine-owner capsule education and starter bundle.";
  if (data.churn_reason === "low_frequency") return "Send reorder reminder near the expected return window.";
  if (data.churn_reason === "single_category_dependency") return "Recommend an adjacent capsule category to broaden routine.";
  if (data.recommended_next_machine) return `Recommend ${data.recommended_next_machine}.`;
  if (data.expected_next_order_date) return "Prepare reorder outreach before expected next order.";
  return "Review customer history before campaign selection.";
}

function relTimeDetailed(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const FUNNEL_STAGE_LABEL_D: Record<number, string> = {
  1: "Browsing", 2: "Product view", 3: "Added to cart",
  4: "Checkout started", 5: "Payment info", 6: "Purchase", 7: "Purchase",
};

function Tag({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px]", tagClass(tone))}>
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[rgba(32,27,20,.095)] bg-white/75 shadow-[0_18px_50px_-34px_rgba(35,25,12,.55)]">
      <div className="border-b border-[rgba(32,27,20,.095)] px-4 py-3">
        <h3 className="text-[12.5px] font-semibold text-[#17120d]">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">{children}</div>;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-mono text-[8.5px] uppercase tracking-[.09em] text-[#9a9187]">{label}</div>
      <div className="truncate text-[12.5px] font-medium text-[#17120d]">{valueOrDash(value)}</div>
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-[18px] border border-[rgba(32,27,20,.095)] bg-white/75 p-3 shadow-[0_18px_50px_-34px_rgba(35,25,12,.55)]">
      <div className="mb-1.5 font-mono text-[8.5px] uppercase tracking-[.09em] text-[#9a9187]">{label}</div>
      <div className={cx("text-[21px] font-bold leading-none tracking-[-.045em]", toneTextClass(tone))}>
        {valueOrDash(value)}
      </div>
    </div>
  );
}

function ChipList({ values }: { values: string[] | null | undefined }) {
  if (!values?.length) return <span className="text-[12px] text-[#9a9187]">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span key={value} className="rounded-full border border-[rgba(42,34,24,.12)] bg-white/80 px-2.5 py-1 text-[11px] text-[#17120d]">
          {value}
        </span>
      ))}
    </div>
  );
}

function ProductList({ products }: { products: SessionProduct[] | null | undefined }) {
  if (!products?.length) return <span className="text-[12px] text-[#9a9187]">—</span>;
  return (
    <div className="space-y-1.5">
      {products.map((product) => (
        <div key={product.sku} className="min-w-0">
          <div className="truncate text-[12.5px] font-medium text-[#17120d]">{product.title}</div>
          <div className="truncate font-mono text-[9.5px] text-[#9a9187]">{product.sku}</div>
        </div>
      ))}
    </div>
  );
}

function sessionViewedProducts(data: PortfolioDetailData) {
  return data.latest_session?.viewed_products ?? data.viewed_products ?? [];
}

function sessionCartProducts(data: PortfolioDetailData) {
  return data.latest_session?.cart_products ?? data.cart_products ?? [];
}

function sessionAddToCarts(data: PortfolioDetailData) {
  return data.latest_session?.add_to_carts ?? data.add_to_carts ?? null;
}

function sessionConverted(data: PortfolioDetailData) {
  return data.latest_session?.converted ?? data.converted ?? null;
}

function sessionCartStatus(data: PortfolioDetailData) {
  if (data.latest_session?.cart_status) return data.latest_session.cart_status;
  if (data.cart_status) return data.cart_status;
  if (sessionConverted(data) === true) return "converted";
  if ((sessionAddToCarts(data) ?? 0) > 0 && sessionConverted(data) === false) return "active_abandoner";
  return sessionViewedProducts(data).length ? "browsing_only" : "no_cart_activity";
}

function recoveredOrderAt(data: PortfolioDetailData) {
  return data.latest_session?.recovered_order_at ?? data.recovered_order_at ?? null;
}

function daysToRecovery(data: PortfolioDetailData) {
  return data.latest_session?.days_to_recovery ?? data.days_to_recovery ?? null;
}

function cartStatusLabel(data: PortfolioDetailData) {
  const status = sessionCartStatus(data);
  if (status === "active_abandoner") return "Cart abandoner";
  if (status === "recovered_after_abandonment") return "Recovered after abandonment";
  if (status === "converted") return "Converted session";
  if (status === "browsing_only") return "Browsing only";
  return "No cart activity";
}

function ChannelSplit({ data }: { data: PortfolioDetailData }) {
  const ecommerce = data.ecommerce_share ?? 0;
  const store = data.brand_store_share ?? 0;
  const other = Math.max(0, 1 - ecommerce - store);
  const items = [
    { label: "Ecommerce", value: ecommerce, color: "bg-[#214f90]" },
    { label: "Brand store", value: store, color: "bg-[#147348]" },
    { label: "Other", value: other, color: "bg-[#a26a10]" },
  ].filter((item) => item.value > 0);

  return (
    <div>
      <div className="mb-2 flex h-7 overflow-hidden rounded-md bg-[rgba(23,18,13,.095)]">
        {items.length ? (
          items.map((item) => (
            <div key={item.label} className={cx("flex items-center justify-center font-mono text-[9.5px] text-white", item.color)} style={{ width: `${item.value * 100}%` }}>
              {Math.round(item.value * 100)}%
            </div>
          ))
        ) : (
          <div className="flex w-full items-center justify-center font-mono text-[10px] text-[#9a9187]">No channel split</div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-[#62594e]">
        <span>E-commerce {pct(data.ecommerce_share)}</span>
        <span>Brand store {pct(data.brand_store_share)}</span>
      </div>
    </div>
  );
}

function RecentOrders({ data }: { data: PortfolioDetailData }) {
  if (!data.recent_orders.length) return <p className="text-[12px] text-[#9a9187]">No recent orders returned.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[rgba(32,27,20,.095)] bg-[#f7f3ec] font-mono text-[9px] uppercase tracking-[.07em] text-[#9a9187]">
            <th className="px-3 py-2 text-left font-medium">Order</th>
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-left font-medium">Channel</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.recent_orders.slice(0, 12).map((order) => (
            <tr key={order.shopify_order_id} className="border-b border-[rgba(32,27,20,.075)] last:border-b-0">
              <td className="px-3 py-2 font-mono text-[10px] text-[#62594e]">#{order.shopify_order_id}</td>
              <td className="px-3 py-2 text-[#62594e]">{dateOrDash(order.processed_at)}</td>
              <td className="px-3 py-2 text-[#62594e]">{order.source ? SOURCE_LABEL[order.source] ?? order.source : "—"}</td>
              <td className="px-3 py-2 text-right font-medium text-[#17120d]">{formatGEL(order.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PortfolioDetail() {
  const { id } = useParams();
  const [data, setData] = useState<PortfolioDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="text-[#17120d]">
      <Link to="/portfolios" className="mb-4 inline-block font-mono text-[10px] uppercase tracking-[.09em] text-[#62594e] hover:text-[#17120d]">
        Back to portfolios
      </Link>

      {loading && !data && (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-[#efb7b1] bg-[#fff0ee] px-4 py-3 text-[13px] text-[#bb3a2f]">
          Error: {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <PageHeader
            kicker={`#${data.shopify_customer_id}`}
            title={data.full_name?.trim() || `Customer ${data.shopify_customer_id}`}
            subtitle="Customer 360"
          />

          <div className="overflow-hidden rounded-[26px] border border-[rgba(42,34,24,.10)] bg-gradient-to-br from-white/95 to-[#fffaf2]/75 shadow-[0_18px_50px_-34px_rgba(35,25,12,.55)]">
            <div className="flex flex-wrap items-start gap-4 p-5">
              <div className={cx("flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[20px] text-[18px] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.22),0_18px_32px_-25px_rgba(0,0,0,.75)]", healthFill(data.health_score))}>
                {data.initials || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[22px] font-extrabold leading-tight tracking-[-.045em] text-[#17120d]">
                  {data.full_name?.trim() || `#${data.shopify_customer_id}`}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Tag tone={SEGMENT_TONE[data.segment]}>{SEGMENT_LABEL[data.segment]}</Tag>
                  <Tag tone={STATUS_TONE[data.status]}>{STATUS_LABEL[data.status]}</Tag>
                  <Tag tone={churnTone(data.churn_reason)}>{data.churn_reason ? CHURN_LABEL[data.churn_reason] : "No risk label"}</Tag>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="LTV" value={formatGEL0(data.total_spend)} />
            <Stat label="Orders" value={formatNumber(data.order_count)} />
            <Stat label="AOV" value={formatGEL(data.aov)} />
            <Stat label="Health" value={`${data.health_score}`} tone={healthTone(data.health_score)} />
          </div>

          <Section title="Overview">
            <FieldGrid>
              <Field label="Name" value={data.full_name} />
              <Field label="Email" value={data.email} />
              <Field label="Phone" value={data.phone} />
              <Field label="Region" value={regionLabel(data.region)} />
              <Field label="Customer since" value={dateOrDash(data.customer_since)} />
              <Field label="Tenure" value={data.tenure_months != null ? `${data.tenure_months} months` : null} />
              <Field label="Active months" value={numberOrDash(data.active_months)} />
              <Field label="Registered" value={data.is_registered ? "Yes" : "No"} />
            </FieldGrid>
          </Section>

          <Section title="Commercial">
            <FieldGrid>
              <Field label="LTV" value={formatGEL(data.total_spend)} />
              <Field label="Orders" value={formatNumber(data.order_count)} />
              <Field label="AOV" value={formatGEL(data.aov)} />
              <Field label="Health score" value={`${data.health_score}/100`} />
              <Field label="Recency" value={numberOrDash(data.recency_score)} />
              <Field label="Frequency" value={numberOrDash(data.frequency_score)} />
              <Field label="Monetary" value={numberOrDash(data.monetary_score)} />
              <Field label="RFM label" value={data.rfm_label} />
            </FieldGrid>
          </Section>

          <Section title="Lifecycle">
            <FieldGrid>
              <Field label="Status" value={STATUS_LABEL[data.status]} />
              <Field label="Segment" value={SEGMENT_LABEL[data.segment]} />
              <Field label="Days since last order" value={numberOrDash(data.days_since_last_order, " days")} />
              <Field label="Expected next order" value={dateOrDash(data.expected_next_order_date)} />
              <Field label="Return period" value={data.return_period_label ? RETURN_LABEL[data.return_period_label] : null} />
              <Field label="Last order" value={dateOrDash(data.last_order_at)} />
            </FieldGrid>
          </Section>

          <Section title="Product DNA">
            <div className="space-y-4">
              <FieldGrid>
                <Field label="Top flavor" value={topFlavor(data)} />
                <Field label="Favorite intensity" value={data.favorite_intensity != null ? data.favorite_intensity.toFixed(2) : null} />
                <Field label="Avg capsule price" value={data.avg_capsule_price != null ? formatGEL(data.avg_capsule_price) : null} />
                <Field label="Capsule price range" value={data.capsule_price_range?.replace("_", " ")} />
              </FieldGrid>
              <div>
                <div className="mb-2 font-mono text-[8.5px] uppercase tracking-[.09em] text-[#9a9187]">Top flavors</div>
                <ChipList values={data.top_flavors} />
              </div>
              <div>
                <div className="mb-2 font-mono text-[8.5px] uppercase tracking-[.09em] text-[#9a9187]">Format preferences</div>
                <ChipList values={data.format_preferences} />
              </div>
              <div>
                <div className="mb-2 font-mono text-[8.5px] uppercase tracking-[.09em] text-[#9a9187]">Bought categories</div>
                <ChipList values={data.bought_capsule_categories} />
              </div>
              <div>
                <div className="mb-2 font-mono text-[8.5px] uppercase tracking-[.09em] text-[#9a9187]">Never bought categories</div>
                <ChipList values={data.never_bought_capsule_categories} />
              </div>
            </div>
          </Section>

          <Section title="Machine Journey">
            <FieldGrid>
              <Field label="Machine status" value={machineStatus(data)} />
              <Field label="Model" value={data.machine_model} />
              <Field label="Acquisition date" value={dateOrDash(data.machine_acquisition_date)} />
              <Field label="Conversion status" value={data.machine_to_capsule_conversion_status?.replace(/_/g, " ")} />
              <Field label="Recommended machine" value={data.recommended_next_machine} />
              <Field label="Capsule packs / month" value={data.avg_capsule_packs_per_month != null ? data.avg_capsule_packs_per_month.toFixed(2) : null} />
            </FieldGrid>
          </Section>

          <Section title="Behavior">
            <div className="space-y-4">
              <FieldGrid>
                <Field label="Avg return interval" value={data.avg_return_interval_days != null ? `${data.avg_return_interval_days} days` : null} />
                <Field label="Median return interval" value={data.median_return_interval_days != null ? `${data.median_return_interval_days} days` : null} />
                <Field label="Return window start" value={dateOrDash(data.expected_return_window_start)} />
                <Field label="Return window end" value={dateOrDash(data.expected_return_window_end)} />
                <Field label="Delivery vs pickup" value={data.delivery_vs_pickup_preference ? DELIVERY_LABEL[data.delivery_vs_pickup_preference] : null} />
                <Field label="Primary channel" value={data.channel ? CHANNEL_LABEL[data.channel] : null} />
              </FieldGrid>
              <ChannelSplit data={data} />
            </div>
          </Section>

          <Section title="Marketing">
            <FieldGrid>
              <Field label="Email consent" value={data.accept_marketing_email ? "Yes" : "No"} />
              <Field label="SMS consent" value={data.sms_marketing ? "Yes" : "No"} />
              <Field label="Promo share" value={pct(data.promo_share)} />
              <Field label="Promo spend" value={formatGEL(data.promo_spend)} />
              <Field label="Full price spend" value={formatGEL(data.full_price_spend)} />
              <Field label="Reachable" value={data.accept_marketing_email || data.sms_marketing ? "Yes" : "No"} />
            </FieldGrid>
          </Section>

          {/* Sessions & on-site behavior (prototype B) */}
          {(data.sessions_30d != null || data.last_session_at) && (
            <Section title="Sessions & on-site behavior">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
                <Field label="Cart status" value={cartStatusLabel(data)} />
                <Field label="Sessions · 30d" value={data.sessions_30d ?? 0} />
                <Field label="Last session" value={data.last_session_at ? relTimeDetailed(data.last_session_at) : null} />
                <Field label="Days since session" value={data.days_since_last_session != null ? `${data.days_since_last_session}d` : null} />
                <Field label="Checkout abandons" value={data.checkout_abandons ?? 0} />
                <Field label="Last funnel stage" value={data.last_funnel_stage != null ? (FUNNEL_STAGE_LABEL_D[data.last_funnel_stage] ?? `Stage ${data.last_funnel_stage}`) : null} />
                <Field label="Last cart value" value={data.last_cart_value != null ? `₾${data.last_cart_value.toFixed(0)}` : null} />
                <Field label="Viewed products" value={sessionViewedProducts(data).length ? <ProductList products={sessionViewedProducts(data)} /> : <ChipList values={data.last_viewed_products} />} />
                <Field label="Added to cart" value={<ProductList products={sessionCartProducts(data)} />} />
                <Field label="Format" value={data.last_viewed_category ?? data.top_browsed_category} />
                <Field label="Browsed over time" value={<ChipList values={data.top_viewed_products} />} />
                <Field label="Session channel" value={data.last_session_channel} />
                <Field label="Device" value={data.last_session_device} />
                <Field label="City" value={data.last_session_city} />
              </div>
              {data.session_warm && !["recovered_after_abandonment", "converted"].includes(sessionCartStatus(data)) && (
                <div className="mt-3 rounded-xl border border-[#c8b090] bg-[#fbf6ec] p-3 text-[12px] leading-5 text-[#6b5a3e]">
                  <b style={{ color: "#a9772f" }}>Win-back ready.</b> Customer has a recent session with cart activity and no recent order — warm pool for re-engagement.
                </div>
              )}
              {sessionCartStatus(data) === "active_abandoner" && (
                <div className="mt-3 rounded-xl border border-[#efb7b1] bg-[#fff0ee] p-3 text-[12px] leading-5 text-[#62594e]">
                  <b className="text-[#bb3a2f]">Cart abandoner.</b> Customer added product(s) to cart but did not convert.
                  {sessionCartProducts(data).length ? <div className="mt-2"><ProductList products={sessionCartProducts(data)} /></div> : null}
                </div>
              )}
              {sessionCartStatus(data) === "recovered_after_abandonment" && (
                <div className="mt-3 rounded-xl border border-[#a8d9bf] bg-[#e9f6ef] p-3 text-[12px] leading-5 text-[#62594e]">
                  <b className="text-[#147348]">Recovered after abandonment.</b> Customer placed a later valid retail order.
                  <div className="mt-1">
                    {recoveredOrderAt(data) ? dateOrDash(recoveredOrderAt(data)) : "Recovered order date unavailable"}
                    {daysToRecovery(data) != null ? ` · ${daysToRecovery(data)}d to recovery` : ""}
                  </div>
                </div>
              )}
              {sessionCartStatus(data) === "converted" && (
                <div className="mt-3 rounded-xl border border-[#abc4ee] bg-[#edf3ff] p-3 text-[12px] leading-5 text-[#62594e]">
                  <b className="text-[#214f90]">Converted session.</b> This session converted.
                </div>
              )}
              {data.never_ordered && (
                <p className="mt-2 text-[11px]" style={{ color: "#9a9187" }}>
                  Never ordered — this section shows registration context, browse history, and the stage they stopped at.
                </p>
              )}
            </Section>
          )}

          <Section title="Risk & Opportunity">
            <div className="space-y-3">
              <FieldGrid>
                <Field label="Churn reason" value={data.churn_reason ? CHURN_LABEL[data.churn_reason] : null} />
                <Field label="Next best action" value={nextBestAction(data)} />
              </FieldGrid>
              <div className="rounded-xl border border-[#c8b3f3] bg-[#f3efff] p-3 text-[12px] leading-5 text-[#62594e]">
                {nextBestAction(data)}
              </div>
            </div>
          </Section>

          <Section title="Recent Orders">
            <RecentOrders data={data} />
          </Section>
        </div>
      )}
    </div>
  );
}
