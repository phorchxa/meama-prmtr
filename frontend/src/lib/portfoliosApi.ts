// Portfolios API client — calls the FastAPI backend.
// The service-role key never reaches the browser; the backend mediates all DB access.

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const BASE = `${API_BASE}/api/v1/portfolios`;

export type CustomerStatus  = "new" | "active" | "at_risk" | "lost" | "prospect";
export type CustomerSegment = "loyalist" | "at_risk" | "lapsed" | "new_machine" | "active" | "prospect";
export type CustomerChannel = "online" | "in_store" | "app" | "mixed" | "none";
export type CustomerRegion  = "tbilisi" | "regions" | "unknown";
export type CapitalVsRegional = "capital" | "regional" | "unknown";
export type MachineConversionStatus =
  | "no_machine"
  | "machine_only_no_capsules"
  | "machine_then_capsules"
  | "capsules_without_machine_purchase"
  | "unknown";
export type CapsulePriceRange = "budget" | "mid_range" | "premium";
export type ReturnPeriodLabel = "frequent" | "regular" | "slow" | "lapsed_pattern";
export type ChurnReason =
  | "healthy_active"
  | "promo_dependent"
  | "long_recency_gap"
  | "machine_without_capsules"
  | "low_frequency"
  | "single_category_dependency"
  | "new_customer"
  | "never_ordered"
  | "unknown";
export type DeliveryVsPickupPreference =
  | "delivery"
  | "pickup_or_store"
  | "mixed"
  | "unknown";

export interface SessionProduct {
  sku: string;
  title: string;
}

export interface LatestSession {
  session_id?: string | null;
  products_viewed_sku?: string[] | null;
  products_carted_sku?: string[] | null;
  types_viewed?: string[] | null;
  viewed_products?: SessionProduct[] | null;
  cart_products?: SessionProduct[] | null;
  add_to_carts?: number | null;
  converted?: boolean | null;
}

export interface PortfolioSummary {
  shopify_customer_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  phone_only: boolean;
  initials: string;
  accept_marketing_email: boolean;
  sms_marketing: boolean;
  region: CustomerRegion;
  order_count: number;
  total_spend: number;
  aov: number;
  last_order_at: string | null;
  days_since_last_order: number | null;
  customer_since?: string | null;
  tenure_days?: number | null;
  tenure_months?: number | null;
  active_months?: number | null;
  status: CustomerStatus;
  segment: CustomerSegment;
  health_score: number;
  recency_score?: number | null;
  frequency_score?: number | null;
  monetary_score?: number | null;
  rfm_label?: string | null;
  has_machine: boolean;
  machine_model: string | null;
  machine_acquisition_date?: string | null;
  machine_to_capsule_conversion_status?: MachineConversionStatus | null;
  channel: CustomerChannel | null;
  top_product_types: string[] | null;
  top_item_title: string | null;
  capsule_aov?: number | null;
  avg_capsule_packs_per_month?: number | null;
  expected_next_order_date?: string | null;
  top_flavors?: string[] | null;
  format_preferences?: string[] | null;
  never_bought_capsules_flag?: boolean | null;
  favorite_intensity?: number | null;
  intensity_bucket?: "light" | "medium" | "strong" | null;
  avg_capsule_price?: number | null;
  capsule_price_range?: CapsulePriceRange | null;
  bought_capsule_categories?: string[] | null;
  never_bought_capsule_categories?: string[] | null;
  avg_return_interval_days?: number | null;
  median_return_interval_days?: number | null;
  return_period_label?: ReturnPeriodLabel | null;
  expected_return_window_start?: string | null;
  expected_return_window_end?: string | null;
  churn_reason?: ChurnReason | null;
  recommended_next_machine?: string | null;
  delivery_vs_pickup_preference?: DeliveryVsPickupPreference | null;
  promo_orders: number;
  promo_spend: number;
  full_price_spend: number;
  promo_share: number;
  capital_vs_regional?: CapitalVsRegional | null;
  ecommerce_share?: number | null;
  brand_store_share?: number | null;
  app_share?: number | null;
  beverage_type_preference?: string | null;
  bible_match_rate?: number | null;
  never_ordered?: boolean;
  is_registered: boolean;
  customer_created_at: string | null;
  // Session behavior
  sessions_30d?: number | null;
  last_session_at?: string | null;
  days_since_last_session?: number | null;
  last_funnel_stage?: number | null;
  last_cart_value?: number | null;
  last_viewed_sku?: string | null;
  add_to_carts?: number | null;
  converted?: boolean | null;
  viewed_products?: SessionProduct[] | null;
  cart_products?: SessionProduct[] | null;
  latest_session?: LatestSession | null;
  checkout_abandons?: number | null;
  session_warm?: boolean;
  top_browsed_category?: string | null;
  last_viewed_products?: string[] | null;
  last_viewed_category?: string | null;
  top_viewed_products?: string[] | null;
  last_session_channel?: string | null;
  last_session_device?: string | null;
  last_session_city?: string | null;
}

export interface OrderRow {
  shopify_order_id: number;
  processed_at: string | null;
  total: number;
  source: string | null;
  discount_code: string | null;
  discount_amount: number;
}

export interface PortfolioDetail extends PortfolioSummary {
  first_order_at: string | null;
  recent_orders: OrderRow[];
}

export interface PortfolioPage {
  items: PortfolioSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListParams {
  q?: string;
  status?: string;
  segment?: string;
  region?: string;
  channel?: string;
  has_machine?: boolean;
  no_machine?: boolean;
  email_consent?: boolean;
  sms_consent?: boolean;
  any_consent?: boolean;
  promo_heavy?: boolean;
  never_ordered?: boolean;
  intensity_bucket?: "light" | "medium" | "strong";
  session_recency?: "today" | "7d" | "30d" | "never";
  warm?: boolean;
  sort?: string;
  desc?: boolean;
  page?: number;
  page_size?: number;
}

export async function fetchPortfolios(params: ListParams = {}): Promise<PortfolioPage> {
  const sp = new URLSearchParams();
  if (params.q)                              sp.set("q",             params.q);
  if (params.status)                         sp.set("status",        params.status);
  if (params.segment)                        sp.set("segment",       params.segment);
  if (params.region)                         sp.set("region",        params.region);
  if (params.channel)                        sp.set("channel",       params.channel);
  if (params.has_machine !== undefined)      sp.set("has_machine",   String(params.has_machine));
  if (params.no_machine  !== undefined)      sp.set("no_machine",    String(params.no_machine));
  if (params.email_consent !== undefined)    sp.set("email_consent", String(params.email_consent));
  if (params.sms_consent   !== undefined)    sp.set("sms_consent",   String(params.sms_consent));
  if (params.any_consent   !== undefined)    sp.set("any_consent",   String(params.any_consent));
  if (params.promo_heavy   !== undefined)    sp.set("promo_heavy",   String(params.promo_heavy));
  if (params.never_ordered !== undefined)    sp.set("never_ordered",    String(params.never_ordered));
  if (params.intensity_bucket)               sp.set("intensity_bucket", params.intensity_bucket);
  if (params.session_recency)               sp.set("session_recency",  params.session_recency);
  if (params.warm !== undefined)            sp.set("warm",             String(params.warm));
  if (params.sort)                           sp.set("sort",             params.sort);
  if (params.desc !== undefined)             sp.set("desc",          String(params.desc));
  sp.set("page",      String(params.page      ?? 1));
  sp.set("page_size", String(params.page_size ?? 48));

  const res = await fetch(`${BASE}?${sp.toString()}`);
  if (!res.ok) throw new Error(`Portfolios ${res.status}`);
  return res.json() as Promise<PortfolioPage>;
}

export async function fetchPortfolio(customerId: number): Promise<PortfolioDetail> {
  const res = await fetch(`${BASE}/${customerId}`);
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok)            throw new Error(`Portfolio ${res.status}`);
  return res.json() as Promise<PortfolioDetail>;
}
