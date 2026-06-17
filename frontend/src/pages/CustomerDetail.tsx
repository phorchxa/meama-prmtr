import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AiPanel } from "../components/AiPanel";
import { Kicker } from "../components/Kicker";
import { StatCallout } from "../components/StatCallout";
import {
  type CustomerDetail as CustomerDetailType,
  type CustomerOrderRow,
  type CustomerProductRow,
  fetchCustomer,
  fetchCustomerOrders,
  fetchCustomerProducts,
} from "../lib/api";
import { formatGEL, formatGEL0, formatNumber, formatPercent } from "../lib/format";
import { PageHeader } from "./PageHeader";

// ── Constants (from business_rules — never hard-code) ─────────────────────────
const AT_RISK_MIN_DAYS = 45;
const CHURN_DAYS = 90;
const CHURN_SCORE_ALERT = 0.7;

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ka-GE", { timeZone: "Asia/Tbilisi", year: "numeric", month: "short", day: "numeric" });
}

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string | null }) {
  const cfg: Record<string, string> = {
    active: "border-meama-green/40 text-meama-green",
    at_risk: "border-meama-red/40 text-meama-red",
    lost: "border-meama-red/60 text-meama-red",
    new: "border-meama-blue/40 text-meama-blue",
  };
  const label: Record<string, string> = {
    active: "ACTIVE",
    at_risk: "AT RISK",
    lost: "LOST",
    new: "NEW",
  };
  const cls = cfg[status ?? ""] ?? "border-meama-charcoal text-meama-muted";
  return (
    <span className={`inline-block border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${cls}`}>
      {label[status ?? ""] ?? (status ?? "—")}
    </span>
  );
}

// ── Segment chip ──────────────────────────────────────────────────────────────
function SegmentChip({ segment }: { segment: string | null }) {
  if (!segment) return null;
  const SEGMENT_LABELS: Record<string, string> = {
    champion: "Champion",
    capsule_loyalist: "Capsule Loyalist",
    flavour_explorer: "Flavour Explorer",
    regular: "Regular",
    at_risk: "At Risk",
    lost: "Lost",
    new: "New",
  };
  const SEGMENT_COLORS: Record<string, string> = {
    champion: "bg-meama-green/10 text-meama-green border-meama-green/30",
    capsule_loyalist: "bg-meama-gold/10 text-meama-gold border-meama-gold/30",
    flavour_explorer: "bg-meama-blue/10 text-meama-blue border-meama-blue/30",
    regular: "bg-meama-charcoal/10 text-meama-muted border-meama-charcoal/30",
    at_risk: "bg-meama-red/10 text-meama-red border-meama-red/30",
    lost: "bg-meama-red/15 text-meama-red border-meama-red/40",
    new: "bg-meama-blue/10 text-meama-blue border-meama-blue/30",
  };
  return (
    <span className={`inline-block border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${SEGMENT_COLORS[segment] ?? "border-meama-charcoal text-meama-muted"}`}>
      {SEGMENT_LABELS[segment] ?? segment}
    </span>
  );
}

// ── Channel label ─────────────────────────────────────────────────────────────
const CHANNEL_LABEL: Record<string, string> = {
  ecom: "E-Commerce",
  brand_store: "Brand Store",
  mixed: "Mixed",
};


// ── Products section ──────────────────────────────────────────────────────────
function PurchasedProducts({
  customerId,
  searchParams,
}: {
  customerId: string;
  searchParams: URLSearchParams;
}) {
  const [rows, setRows] = useState<CustomerProductRow[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetchCustomerProducts(customerId)
      .then(setRows)
      .catch(() => { setErr(true); setRows([]); });
  }, [customerId]);

  if (rows === null) {
    return (
      <div className="card-m space-y-2">
        <Kicker>Purchased Products</Kicker>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex gap-3 py-2">
            <div className="h-3 w-24 animate-pulse rounded bg-meama-charcoal" />
            <div className="h-3 flex-1 animate-pulse rounded bg-meama-charcoal" />
            <div className="h-3 w-16 animate-pulse rounded bg-meama-charcoal" />
          </div>
        ))}
      </div>
    );
  }

  if (err || rows.length === 0) {
    return (
      <div className="card-m">
        <Kicker>Purchased Products</Kicker>
        <p className="mt-3 font-mono text-xs text-meama-muted">
          {err ? "Could not load product history." : "No retail purchases on record."}
        </p>
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => b.total_spend - a.total_spend);

  return (
    <div className="card-m">
      <Kicker>{`Purchased Products · ${rows.length} SKUs`}</Kicker>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-meama-charcoal">
              {["Product", "Category", "Units", "Spend", "Last Purchase"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-left last:text-right"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const params = new URLSearchParams(searchParams);
              params.set("customer_id", customerId);
              return (
                <tr key={p.sku} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                  <td className="px-3 py-2">
                    <Link
                      to={`/products/${p.sku}`}
                      className="font-medium text-meama-brown hover:text-meama-gold"
                    >
                      {p.name}
                    </Link>
                    <div className="font-mono text-[9px] text-meama-muted">{p.sku}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-meama-cream">{p.category ?? "—"}</td>
                  <td className="tabular px-3 py-2 font-mono text-xs text-meama-cream">
                    {formatNumber(p.total_units)}
                  </td>
                  <td className="tabular px-3 py-2 font-semibold text-meama-brown">
                    {formatGEL0(p.total_spend)}
                  </td>
                  <td className="tabular px-3 py-2 text-right font-mono text-xs text-meama-muted">
                    {formatDate(p.last_purchase_date)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Orders timeline ───────────────────────────────────────────────────────────
function OrdersTimeline({ customerId }: { customerId: string }) {
  const [orders, setOrders] = useState<CustomerOrderRow[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetchCustomerOrders(customerId)
      .then(setOrders)
      .catch(() => { setErr(true); setOrders([]); });
  }, [customerId]);

  if (orders === null) {
    return (
      <div className="card-m space-y-2">
        <Kicker>Order History</Kicker>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex gap-3 py-1.5">
            <div className="h-3 w-20 animate-pulse rounded bg-meama-charcoal" />
            <div className="h-3 flex-1 animate-pulse rounded bg-meama-charcoal" />
            <div className="h-3 w-12 animate-pulse rounded bg-meama-charcoal" />
          </div>
        ))}
      </div>
    );
  }

  if (err || orders.length === 0) {
    return (
      <div className="card-m">
        <Kicker>Order History</Kicker>
        <p className="mt-3 font-mono text-xs text-meama-muted">
          {err ? "Could not load orders." : "No retail orders on record."}
        </p>
      </div>
    );
  }

  return (
    <div className="card-m">
      <Kicker>{`Order History · ${orders.length} orders shown`}</Kicker>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-meama-charcoal">
              {["Order ID", "Date", "Channel", "Items", "Total", "Status"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-meama-gold text-left last:text-right"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.order_id} className="border-b border-meama-charcoal hover:bg-meama-ivory">
                <td className="px-3 py-2 font-mono text-[10px] text-meama-muted">{o.order_id}</td>
                <td className="tabular px-3 py-2 font-mono text-xs text-meama-cream">
                  {formatDate(o.order_date)}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-meama-cream">
                  {CHANNEL_LABEL[o.channel ?? ""] ?? o.channel ?? "—"}
                </td>
                <td className="tabular px-3 py-2 text-meama-cream">{formatNumber(o.items_count)}</td>
                <td className="tabular px-3 py-2 font-semibold text-meama-brown">
                  {formatGEL0(o.total_price)}
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`font-mono text-[9px] uppercase tracking-wider ${
                      o.status === "cancelled" ? "text-meama-red" : "text-meama-muted"
                    }`}
                  >
                    {o.status ?? "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [customer, setCustomer] = useState<CustomerDetailType | null | "not_found">(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { navigate("/customers", { replace: true }); return; }
    fetchCustomer(id)
      .then(setCustomer)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Failed";
        if (msg.includes("404")) {
          setCustomer("not_found");
        } else {
          setErr(msg);
          setCustomer("not_found");
        }
      });
  }, [id, navigate]);

  if (customer === null) {
    return (
      <div className="space-y-4 p-8">
        <div className="h-3 w-32 animate-pulse rounded bg-meama-charcoal" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-meama-charcoal" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-meama-charcoal" />
          ))}
        </div>
      </div>
    );
  }

  if (customer === "not_found") {
    return (
      <div className="p-8 text-center">
        <div className="font-mono text-sm text-meama-red">{err ?? "Customer not found."}</div>
        <Link
          to="/customers"
          className="mt-4 inline-block font-mono text-xs font-bold uppercase tracking-wider text-meama-gold hover:underline"
        >
          ← Back to Customers
        </Link>
      </div>
    );
  }

  const c = customer;
  const m = c.metrics;
  const days = daysSince(c.last_order_date);
  const churnScore = m?.churn_score ?? null;
  const churnTone: "red" | "gold" | "green" | undefined =
    churnScore == null ? undefined : churnScore >= CHURN_SCORE_ALERT ? "red" : churnScore >= 0.4 ? "gold" : "green";

  // Derive lifecycle label
  const lifecycleLabel = (() => {
    if (days == null) return "Unknown";
    if (days >= CHURN_DAYS) return `${days}d — LOST`;
    if (days >= AT_RISK_MIN_DAYS) return `${days}d — AT RISK`;
    return `${days}d`;
  })();
  const lifecycleTone: "red" | "green" | undefined =
    days == null ? undefined : days >= AT_RISK_MIN_DAYS ? "red" : "green";

  // NO_DISCOUNT check
  const NO_DISCOUNT_SEGMENTS = ["champion", "capsule_loyalist", "flavour_explorer"];
  const noDiscount = c.rfm_segment ? NO_DISCOUNT_SEGMENTS.includes(c.rfm_segment) : false;

  // Build back-link preserving any incoming search params
  const backHref = (() => {
    const from = searchParams.get("from");
    if (from === "products" && searchParams.get("product_sku")) {
      return `/products/${searchParams.get("product_sku")}`;
    }
    return "/customers";
  })();
  const backLabel = backHref.startsWith("/products") ? "← Back to Product" : "← Customers";

  return (
    <div>
      <Link
        to={backHref}
        className="mb-4 inline-block font-mono text-xs font-bold uppercase tracking-wider text-meama-gold hover:underline"
      >
        {backLabel}
      </Link>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusChip status={c.status} />
        <SegmentChip segment={c.rfm_segment} />
        {noDiscount && (
          <span className="border border-meama-gold/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-meama-gold">
            Early access only — never discounts
          </span>
        )}
        {m?.upsell_tag && (
          <span className="border border-meama-blue/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-meama-blue">
            Upsell target
          </span>
        )}
      </div>

      <PageHeader
        kicker={c.customer_id}
        title={
          c.first_name && c.last_name
            ? `${c.first_name} ${c.last_name}`
            : c.cluster_tag ?? c.customer_id
        }
        subtitle={m?.cluster_tag ?? undefined}
      />

      {/* KPI row */}
      <div className="panel-dark mb-5 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <StatCallout
          dark
          value={c.ltv != null ? formatGEL0(c.ltv) : "—"}
          tag="Lifetime Value"
          tone="gold"
        >
          Registered-customer LTV, retail channels only.
        </StatCallout>

        <StatCallout
          dark
          value={m?.aov_total != null ? formatGEL(m.aov_total) : c.aov != null ? formatGEL(c.aov) : "—"}
          tag="Avg Order Value"
          tone="blue"
        >
          Zero-spend orders excluded by rule.
        </StatCallout>

        <StatCallout
          dark
          value={lifecycleLabel}
          tag="Since last order"
          tone={lifecycleTone}
        >
          {days != null && days >= AT_RISK_MIN_DAYS
            ? "Past the 45-day at-risk threshold."
            : "Inside normal reorder cadence."}
        </StatCallout>

        <StatCallout
          dark
          value={churnScore != null ? churnScore.toFixed(2) : "—"}
          tag="Churn score"
          tone={churnTone}
        >
          Claude batch output (0.0–1.0). Alert fires at {CHURN_SCORE_ALERT}.
        </StatCallout>
      </div>

      <div className="stagger space-y-5">
        {/* Metrics panel */}
        {m && (
          <div className="card-m">
            <Kicker>Profile</Kicker>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {[
                { label: "RFM Recency", value: m.recency_score != null ? String(m.recency_score) : "—" },
                { label: "RFM Frequency", value: m.frequency_score != null ? String(m.frequency_score) : "—" },
                { label: "RFM Monetary", value: m.monetary_score != null ? String(m.monetary_score) : "—" },
                { label: "AOV (capsules)", value: m.aov_capsules != null ? formatGEL(m.aov_capsules) : "—" },
                { label: "Discount dependency", value: m.discount_dependency_pct != null ? formatPercent(m.discount_dependency_pct, 1) : "—" },
                { label: "Machine on file", value: m.has_machine === true ? (m.machine_model ?? "Yes") : m.has_machine === false ? "No" : "—" },
                { label: "Expected next order", value: formatDate(m.expected_next_order) },
                { label: "Last computed", value: m.computed_at ? formatDate(m.computed_at) : "—" },
              ].map((item) => (
                <div key={item.label} className="border-t border-meama-charcoal pt-3">
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-meama-muted">
                    {item.label}
                  </dt>
                  <dd className="mt-1 font-semibold text-meama-brown">{item.value}</dd>
                </div>
              ))}
            </dl>

            {/* Contact info (masked) */}
            {(c.email_masked || c.phone_masked) && (
              <div className="mt-4 border-t border-meama-charcoal pt-4">
                <div className="font-mono text-[10px] uppercase tracking-wider text-meama-gold mb-2">
                  Contact
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  {c.email_masked && (
                    <div>
                      <span className="text-meama-muted">Email: </span>
                      <span className="font-mono text-meama-cream">{c.email_masked}</span>
                    </div>
                  )}
                  {c.phone_masked && (
                    <div>
                      <span className="text-meama-muted">Phone: </span>
                      <span className="font-mono text-meama-cream">{c.phone_masked}</span>
                    </div>
                  )}
                  {c.registration_date && (
                    <div>
                      <span className="text-meama-muted">Registered: </span>
                      <span className="font-mono text-meama-cream">{formatDate(c.registration_date)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI insight */}
        <AiPanel title={`AI Note — ${c.customer_id}`} actionLabel="Draft outreach with AI">
          A fresh note for this customer lands with the next nightly Claude batch.
        </AiPanel>

        {/* Products */}
        <PurchasedProducts customerId={c.customer_id} searchParams={searchParams} />

        {/* Orders */}
        <OrdersTimeline customerId={c.customer_id} />
      </div>
    </div>
  );
}
