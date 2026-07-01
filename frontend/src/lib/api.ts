const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

// ── Products ──────────────────────────────────────────────────────────────────

export interface ProductSummary {
  sku: string;
  name: string;
  category: string;
  subcategory: string | null;
  price: number;
  cogs: number | null;
  status: "active" | "draft" | "archived";

  // Enrichment
  image_url: string | null;
  caffeine: string | null;
  caffeine_mg: number | null;
  intensity_level: number | null;
  intensity_bucket: "light" | "medium" | "strong" | null;
  bitterness: number | null;
  arabica_pct: number | null;
  robusta_pct: number | null;
  flavor_profile: string | null;
  flavor_notes: string[];
  ingredients: string | null;
  beverage_type: string | null;
  beverage_type_en: "espresso" | "filter_coffee" | "tea" | "cold_mix" | "wellness" | null;
  bio: boolean;
  compatible_with: string | null;
  capsule_format: string | null;
  hot_cold: string | null;
  product_type_geo: string | null;

  // Sales stats
  units_sold_30d: number;
  revenue_30d: number;
  monthly_units: number[];
  repeat_rate: number;

  // Channel split
  units_30d_web: number;
  revenue_30d_web: number;
  avg_price_web: number | null;
  units_30d_pos: number;
  revenue_30d_pos: number;
  avg_price_pos: number | null;

  // Reorder rates
  total_buyers: number;
  reorder_rate_30d: number;
  reorder_rate_60d: number;
  reorder_rate_90d: number;
  retention_rate: number;

  // New metrics
  total_revenue: number;
  total_quantity: number;
  format_rank_pct: number | null;
  total_rank_pct: number | null;
  monthly_growth_pct: number | null;
  margin_pct: number | null;
  full_price_revenue: number;
  full_price_units: number;
  discounted_revenue: number;
  discounted_units: number;
  avg_monthly_consumption: number;
  refund_rate: number;

  // Bundle
  top_bundle_sku: string | null;
  top_bundle_name: string | null;
  top_bundle_count: number;

  // Stock
  stock_quantity: number | null;
  stock_status: "understock" | "in_stock" | "overstock" | null;

  ai_insight: string | null;
}

export interface AffinityPair {
  sku_a: string;
  sku_b: string;
  co_orders: number;
  name_a: string | null;
  name_b: string | null;
}

export interface ProductsResponse {
  products: ProductSummary[];
  affinities: AffinityPair[];
}

// Product cross-links
export interface ProductCustomerRow {
  customer_id: string;
  total_spend: number;
  total_units: number;
  order_count: number;
  last_purchase_date: string | null;
  rfm_segment: string | null;
  churn_score: number | null;
}

export interface ProductOrderRow {
  order_id: string;
  customer_id: string;
  order_date: string | null;
  channel: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export async function fetchProducts(): Promise<ProductsResponse> {
  const res = await fetch(`${BASE}/api/v1/products`);
  if (!res.ok) throw new Error(`products ${res.status}`);
  return res.json() as Promise<ProductsResponse>;
}

export async function fetchProduct(sku: string): Promise<ProductSummary> {
  const res = await fetch(`${BASE}/api/v1/products/${encodeURIComponent(sku)}`);
  if (!res.ok) throw new Error(`product ${res.status}`);
  return res.json() as Promise<ProductSummary>;
}

export async function fetchAffinityPairs(): Promise<AffinityPair[]> {
  const res = await fetch(`${BASE}/api/v1/products/affinity`);
  if (!res.ok) throw new Error(`affinity ${res.status}`);
  return res.json() as Promise<AffinityPair[]>;
}

export async function fetchProductCustomers(sku: string, limit = 20): Promise<ProductCustomerRow[]> {
  const res = await fetch(`${BASE}/api/v1/products/${encodeURIComponent(sku)}/customers?limit=${limit}`);
  if (!res.ok) return [];
  return res.json() as Promise<ProductCustomerRow[]>;
}

export async function fetchProductOrders(sku: string, limit = 50, channel?: string): Promise<ProductOrderRow[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (channel) params.set("channel", channel);
  const res = await fetch(`${BASE}/api/v1/products/${encodeURIComponent(sku)}/orders?${params}`);
  if (!res.ok) return [];
  return res.json() as Promise<ProductOrderRow[]>;
}

export interface ProductSegmentBuyerRow {
  segment: string;
  rfm_label: string;
  customer_count: number;
  total_spend: number;
  avg_spend: number;
}

export async function fetchProductSegmentBuyers(sku: string): Promise<ProductSegmentBuyerRow[]> {
  const res = await fetch(`${BASE}/api/v1/products/${encodeURIComponent(sku)}/segment-buyers`);
  if (!res.ok) return [];
  return res.json() as Promise<ProductSegmentBuyerRow[]>;
}

// ── Customers ─────────────────────────────────────────────────────────────────

export interface CustomerSummary {
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
  region: string | null;
  is_registered: boolean;
  status: string | null;
  rfm_segment: string | null;
  ltv: number | null;
  last_order_date: string | null;
  churn_score: number | null;
  cluster_tag: string | null;
  order_count: number | null;
  aov: number | null;
}

export interface CustomerMetrics {
  recency_score: number | null;
  frequency_score: number | null;
  monetary_score: number | null;
  rfm_segment: string | null;
  cluster_tag: string | null;
  churn_score: number | null;
  upsell_tag: boolean | null;
  status: string | null;
  ltv: number | null;
  aov_total: number | null;
  aov_capsules: number | null;
  discount_dependency_pct: number | null;
  has_machine: boolean | null;
  machine_model: string | null;
  last_order_date: string | null;
  expected_next_order: string | null;
  computed_at: string | null;
}

export interface CustomerDetail extends CustomerSummary {
  email_masked: string | null;
  phone_masked: string | null;
  registration_date: string | null;
  metrics: CustomerMetrics | null;
}

export interface CustomerProductRow {
  sku: string;
  name: string;
  total_units: number;
  total_spend: number;
  last_purchase_date: string | null;
  category: string | null;
}

export interface CustomerOrderRow {
  order_id: string;
  order_date: string | null;
  channel: string | null;
  total_price: number;
  items_count: number;
  status: string | null;
}

export interface CustomersPage {
  items: CustomerSummary[];
  total: number;
  page: number;
  page_size: number;
}

export async function fetchCustomers(params?: {
  q?: string;
  status?: string;
  segment?: string;
  channel?: string;
  page?: number;
  page_size?: number;
}): Promise<CustomersPage> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.status) sp.set("status", params.status);
  if (params?.segment) sp.set("segment", params.segment);
  if (params?.channel) sp.set("channel", params.channel);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  const res = await fetch(`${BASE}/api/v1/customers?${sp}`);
  if (!res.ok) throw new Error(`customers ${res.status}`);
  return res.json() as Promise<CustomersPage>;
}

export async function fetchCustomer(id: string): Promise<CustomerDetail> {
  const res = await fetch(`${BASE}/api/v1/customers/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`customer ${res.status}`);
  return res.json() as Promise<CustomerDetail>;
}

export async function fetchCustomerProducts(id: string): Promise<CustomerProductRow[]> {
  const res = await fetch(`${BASE}/api/v1/customers/${encodeURIComponent(id)}/products`);
  if (!res.ok) return [];
  return res.json() as Promise<CustomerProductRow[]>;
}

export async function fetchCustomerOrders(id: string, limit = 20): Promise<CustomerOrderRow[]> {
  const res = await fetch(`${BASE}/api/v1/customers/${encodeURIComponent(id)}/orders?limit=${limit}`);
  if (!res.ok) return [];
  return res.json() as Promise<CustomerOrderRow[]>;
}

// ── Overview (Command Center) ──────────────────────────────────────────────────

export interface OverviewKpis {
  total_skus: number;
  revenue_30d_gel: number;
  units_30d: number;
  top_category: string | null;
  top_category_pct: number;
  avg_margin_pct: number | null;
  critical_stock_skus: number;
  low_stock_skus: number;
  ecom_pct: number;
}

export interface OverviewTrendPoint {
  date: string;
  revenue: number;
}

export interface OverviewAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  created_at: string | null;
  status: string;
}

export interface OverviewAction {
  type: string;
  sku: string | null;
  title: string;
  signal: string;
  severity: string;
  est_impact_gel: number;
  to: string;
}

export interface OverviewResponse {
  kpis: OverviewKpis;
  revenue_trend_30d: OverviewTrendPoint[];
  alerts: OverviewAlert[];
  actions: OverviewAction[];
}

export async function fetchOverview(): Promise<OverviewResponse> {
  const res = await fetch(`${BASE}/api/v1/overview`);
  if (!res.ok) throw new Error(`overview ${res.status}`);
  return res.json() as Promise<OverviewResponse>;
}

// ── Stock ─────────────────────────────────────────────────────────────────────

export interface StockItem {
  sku: string;
  name: string;
  category: string;
  units_on_hand: number;
  velocity_per_day: number;
  weeks_of_cover: number;
  reorder_point: number;
  status: "critical" | "low" | "ok";
  price: number | null;
}

export interface StockResponse {
  items: StockItem[];
  critical_count: number;
  low_stock_count: number;
  total: number;
}

export async function fetchStock(lowOnly = false): Promise<StockResponse> {
  const params = lowOnly ? "?low_stock_only=true" : "";
  const res = await fetch(`${BASE}/api/v1/stock${params}`);
  if (!res.ok) throw new Error(`stock ${res.status}`);
  return res.json() as Promise<StockResponse>;
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export interface AlertRow {
  id: string;
  type: string;
  severity: string;
  entity_id: string | null;
  message: string;
  status: string;
  channels_sent: string[];
  created_at: string | null;
}

export interface AlertsResponse {
  items: AlertRow[];
  open_count: number;
}

export async function fetchAlerts(status = "open", limit = 50): Promise<AlertsResponse> {
  const params = new URLSearchParams({ status, limit: String(limit) });
  const res = await fetch(`${BASE}/api/v1/alerts?${params}`);
  if (!res.ok) throw new Error(`alerts ${res.status}`);
  return res.json() as Promise<AlertsResponse>;
}

// ── Customer Analytics ────────────────────────────────────────────────────────

export interface SegmentBucket {
  segment: string;
  count: number;
  share: number;
}

export interface StatusBucket {
  status: string;
  count: number;
  share: number;
}

export interface CustomerAnalytics {
  total_customers: number;
  segment_distribution: SegmentBucket[];
  status_distribution: StatusBucket[];
  avg_churn_score: number | null;
  avg_ltv: number | null;
  avg_aov: number | null;
  populated: boolean;
}

export async function fetchCustomerAnalytics(): Promise<CustomerAnalytics> {
  const res = await fetch(`${BASE}/api/v1/customers/analytics`);
  if (!res.ok) throw new Error(`customer analytics ${res.status}`);
  return res.json() as Promise<CustomerAnalytics>;
}

export interface CampaignSummary {
  id: string;
  name: string;
  channel: string | null;
  status: string | null;
  promo_type: string | null;
  discount_value: number | null;
  shopify_code: string | null;
  target_segment: string | null;
  launched_at: string | null;
  scheduled_at: string | null;
  // GEL results
  revenue_total: number | null;
  roi: number | null;
  converted: number | null;
  reached: number | null;
  conversion_rate: number | null;
  avg_order_value: number | null;
  // Month-to-date attributed revenue / ROI (NULL if no MTD orders) — KPI cards
  revenue_mtd: number | null;
  roi_mtd: number | null;
  // Meta (USD)
  meta_spend_usd: number;
  meta_roas: number | null;
  meta_impressions: number;
  meta_clicks: number;
  // Promotion window (for calendar spans and sorting by end date)
  valid_from: string | null;
  valid_to: string | null;
  // Shopify live discount status
  shopify_discount_status: string | null;
  shopify_usage_count: number | null;
  shopify_usage_limit: number | null;
  source_app: string | null;
}

export async function fetchCampaigns(): Promise<CampaignSummary[]> {
  const res = await fetch(`${BASE}/api/v1/campaigns`);
  if (!res.ok) throw new Error(`campaigns ${res.status}`);
  return res.json() as Promise<CampaignSummary[]>;
}

export interface CampaignCreateInput {
  name: string;
  channel: string;
  promo_type?: string | null;
  discount_value?: number | null;
  target_segment?: string | null;
  scheduled_at?: string | null;
}

export async function createCampaign(input: CampaignCreateInput): Promise<CampaignSummary> {
  const res = await fetch(`${BASE}/api/v1/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null) as { detail?: string } | null;
    throw new Error(detail?.detail ?? `create campaign ${res.status}`);
  }
  return res.json() as Promise<CampaignSummary>;
}

export async function setCampaignStatus(
  id: string,
  status: "active" | "completed",
): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/api/v1/campaigns/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null) as { detail?: string } | null;
    throw new Error(detail?.detail ?? `set status ${res.status}`);
  }
  return res.json() as Promise<{ status: string }>;
}

export interface CampaignProductRow {
  sku: string | null;
  title: string | null;
  price: number | null;
  compare_at_price: number | null;
  cost_per_item: number | null;
  units: number;
  revenue: number;
}

export interface CampaignDetail extends CampaignSummary {
  discount_type: string | null;
  min_order_value: number | null;
  valid_from: string | null;
  tag_pattern: string | null;
  excluded_segments: string[];
  products: CampaignProductRow[];
}

export async function fetchCampaignDetail(id: string): Promise<CampaignDetail> {
  const res = await fetch(`${BASE}/api/v1/campaigns/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`campaign ${res.status}`);
  return res.json() as Promise<CampaignDetail>;
}

export interface MetaCampaignRow {
  meta_campaign_id: string;
  meta_campaign_name: string | null;
  meta_account_id: string | null;
  spend_usd: number;
  impressions: number;
  clicks: number;
  roas: number | null;
}

export interface MetaDailyPoint {
  date: string;
  spend_usd: number;
}

export interface MetaOverview {
  period_days: number;
  total_spend_usd: number;
  blended_roas: number | null;
  total_impressions: number;
  total_clicks: number;
  campaign_count: number;
  below_threshold_count: number;
  campaigns: MetaCampaignRow[];
  daily_trend: MetaDailyPoint[];
}

export async function fetchMetaOverview(): Promise<MetaOverview> {
  const res = await fetch(`${BASE}/api/v1/campaigns/meta-overview`);
  if (!res.ok) throw new Error(`meta-overview ${res.status}`);
  return res.json() as Promise<MetaOverview>;
}

// Product catalog synced from the commercial-master sheet — powers the promo
// calculator's product/bundle pickers (price + COGS selected, not typed).
export interface CatalogProduct {
  sku: string;
  name_en: string | null;
  name_ka: string | null;
  product_type: "capsule" | "classic_coffee" | "machine" | "accessory";
  category: string | null;
  subcategory: string | null;
  status: string;
  caps_per_pack: number | null;
  price_per_pack: number | null;
  price_per_unit: number | null;
  total_cogs: number | null;
  full_margin: number | null;
}

export async function fetchCatalogProducts(): Promise<CatalogProduct[]> {
  const res = await fetch(`${BASE}/api/v1/campaigns/products`);
  if (!res.ok) return [];
  return res.json() as Promise<CatalogProduct[]>;
}

// ── Marketing · Social KPIs ─────────────────────────────────────────────────

export interface TikTokKpis {
  available: boolean;
  followers_total: number | null;
  follower_growth_pct: number | null;
  engagement_rate: number | null;
  reach_30d: number | null;
  share_rate: number | null;
  completion_rate: number | null; // always null — not in DB
  fyp_rate: number | null;        // always null — not in DB
  cadence_weekly: number[];
  cadence_per_week: number | null;
}

export interface InstagramKpis {
  available: boolean;
  followers_total: number | null;
  follower_growth_pct: number | null;
  engagement_rate: number | null;
  reach_30d: number | null;
  reach_trend: number[];
  saves_per_post: number | null;  // null = N/A (saves unavailable)
  reels_count_30d: number | null;
  cadence_weekly: number[];
  cadence_per_week: number | null;
  story_completion: number | null; // always null — not in DB
}

export interface FacebookKpis {
  available: boolean;
  followers_total: number | null;
  follower_growth_pct: number | null;
  organic_reach_30d: number | null;
  impressions_30d: number | null;
  engagement_rate: number | null;
  reach_trend: number[];
  video_views_3s: number | null;   // null — not in current schema
  post_count_30d: number | null;   // null — not in current schema
}

export interface SocialKpis {
  tiktok: TikTokKpis;
  instagram: InstagramKpis;
  facebook: FacebookKpis;
  generated_at: string;
}

export async function fetchSocialKpis(): Promise<SocialKpis> {
  const res = await fetch(`${BASE}/api/v1/marketing/social-kpis`);
  if (!res.ok) throw new Error(`social-kpis ${res.status}`);
  return res.json() as Promise<SocialKpis>;
}

// ── Social KPI dashboard (detailed — /social-kpis) ──────────────────────────

export type MetricStatus =
  | "ok"
  | "insufficient_history"
  | "not_available"
  | "not_connected"
  | "no_data";

export interface KpiMetric {
  value: number | null;
  status: MetricStatus;
  note: string | null;
}

export interface SocialKpisTikTok {
  available: boolean;
  follower_growth_rate: KpiMetric;
  followers_total: KpiMetric;
  engagement_rate: KpiMetric;
  reach: KpiMetric;
  share_rate: KpiMetric;
  fyp_rate: KpiMetric;
  cadence_weekly: number[];
  cadence_per_week: number | null;
}

export interface SocialKpisInstagram {
  available: boolean;
  follower_growth_rate: KpiMetric;
  followers_total: KpiMetric;
  engagement_rate: KpiMetric;
  reach_30d: KpiMetric;
  impressions_30d: KpiMetric;
  saves_per_post: KpiMetric;
  reels_plays: KpiMetric;
  cadence_weekly: number[];
  cadence_per_week: number | null;
}

export interface SocialKpisFacebook {
  available: boolean;
  status: MetricStatus;
  note: string;
}

export interface SocialKpisPlaceholder {
  available: boolean;
  status: MetricStatus;
  note: string;
}

export interface SocialKpisOverview {
  tiktok: SocialKpisTikTok;
  instagram: SocialKpisInstagram;
  facebook: SocialKpisFacebook;
  meama_corner: SocialKpisPlaceholder;
  x_twitter: SocialKpisPlaceholder;
  period_days: number;
  generated_at: string;
}

export async function fetchSocialKpisOverview(periodDays = 30): Promise<SocialKpisOverview> {
  const res = await fetch(`${BASE}/api/v1/social-kpis/overview?period_days=${periodDays}`);
  if (!res.ok) throw new Error(`social-kpis/overview ${res.status}`);
  return res.json() as Promise<SocialKpisOverview>;
}

// ── Social content browser (/social) ────────────────────────────────────────

export interface TikTokVideoSnap {
  video_id: string;
  title: string | null;
  description: string | null;
  cover_image_url: string | null;
  video_url: string | null;
  duration: number | null;
  published_at: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  download_count: number;
  engagement_rate: number | null;
  snapshot_date: string | null;
  hashtags: string[];
  snapshot_count: number;
}

export interface TikTokSnapshotPoint {
  date: string;
  view_count: number;
  like_count: number;
}

export interface TikTokVideoHistory {
  video_id: string;
  snapshots: TikTokSnapshotPoint[];
}

export interface FollowerGrowthPoint {
  date: string;
  followers_count: number;
}

export interface HashtagCount {
  hashtag: string;
  count: number;
}

export interface TikTokOverview {
  total_videos: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  avg_engagement_rate: number | null;
  followers_count: number | null;
  follower_growth_trend: FollowerGrowthPoint[];
  top_5_by_views: TikTokVideoSnap[];
  top_5_by_engagement: TikTokVideoSnap[];
  top_hashtags: HashtagCount[];
}

export interface TikTokVideosResponse {
  videos: TikTokVideoSnap[];
  total: number;
}

export interface AiReport {
  report: string;
  generated_at: string;
  cached: boolean;
}

export interface MetaIgPost {
  media_id: string;
  media_type: string;
  permalink: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  timestamp: string | null;
  likes: number;
  comments: number;
}

export interface MetaIgInsightPoint {
  date: string;
  total_followers: number | null;
  reach: number | null;
  accounts_engaged: number | null;
  total_interactions: number | null;
}

export interface MetaTypeStat {
  media_type: string;
  post_count: number;
  avg_likes: number;
  avg_comments: number;
}

export interface MetaOverview {
  total_posts: number;
  total_likes: number;
  total_comments: number;
  by_media_type: MetaTypeStat[];
  top_5_by_likes: MetaIgPost[];
  current_followers: number | null;
  followers_delta: number | null;
  insights_trend: MetaIgInsightPoint[];
}

export interface MetaPostsResponse {
  posts: MetaIgPost[];
  total: number;
}

export interface MetaCampaignBrief {
  campaign_id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  has_performance_data: boolean;
  ad_sets_count: number;
}

export interface MetaCampaignsResponse {
  campaigns: MetaCampaignBrief[];
  total_campaigns: number;
  total_ad_sets: number;
  total_ads: number;
  performance_data_available: boolean;
}

export async function fetchSocialTikTokOverview(): Promise<TikTokOverview> {
  const res = await fetch(`${BASE}/api/v1/social/tiktok/overview`);
  if (!res.ok) throw new Error(`social/tiktok/overview ${res.status}`);
  return res.json() as Promise<TikTokOverview>;
}

export async function fetchSocialTikTokVideos(): Promise<TikTokVideosResponse> {
  const res = await fetch(`${BASE}/api/v1/social/tiktok/videos`);
  if (!res.ok) throw new Error(`social/tiktok/videos ${res.status}`);
  return res.json() as Promise<TikTokVideosResponse>;
}

export async function fetchSocialTikTokVideoHistory(videoId: string): Promise<TikTokVideoHistory> {
  const res = await fetch(`${BASE}/api/v1/social/tiktok/video/${encodeURIComponent(videoId)}/history`);
  if (!res.ok) throw new Error(`social/tiktok/video/${videoId}/history ${res.status}`);
  return res.json() as Promise<TikTokVideoHistory>;
}

export async function fetchSocialTikTokAiReport(lang: string, refresh = false): Promise<AiReport> {
  const params = new URLSearchParams({ lang });
  if (refresh) params.set("refresh", "true");
  const res = await fetch(`${BASE}/api/v1/social/tiktok/ai-report?${params}`);
  if (!res.ok) throw new Error(`social/tiktok/ai-report ${res.status}`);
  return res.json() as Promise<AiReport>;
}

export async function fetchSocialMetaOverview(): Promise<MetaOverview> {
  const res = await fetch(`${BASE}/api/v1/social/meta/overview`);
  if (!res.ok) throw new Error(`social/meta/overview ${res.status}`);
  return res.json() as Promise<MetaOverview>;
}

export async function fetchSocialMetaPosts(limit = 60): Promise<MetaPostsResponse> {
  const res = await fetch(`${BASE}/api/v1/social/meta/posts?limit=${limit}`);
  if (!res.ok) throw new Error(`social/meta/posts ${res.status}`);
  return res.json() as Promise<MetaPostsResponse>;
}

export async function fetchSocialMetaCampaigns(): Promise<MetaCampaignsResponse> {
  const res = await fetch(`${BASE}/api/v1/social/meta/campaigns`);
  if (!res.ok) throw new Error(`social/meta/campaigns ${res.status}`);
  return res.json() as Promise<MetaCampaignsResponse>;
}

export async function fetchSocialMetaAiReport(lang: string, refresh = false): Promise<AiReport> {
  const params = new URLSearchParams({ lang });
  if (refresh) params.set("refresh", "true");
  const res = await fetch(`${BASE}/api/v1/social/meta/ai-report?${params}`);
  if (!res.ok) throw new Error(`social/meta/ai-report ${res.status}`);
  return res.json() as Promise<AiReport>;
}
