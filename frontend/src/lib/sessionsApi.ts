const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export type Range = "today" | "7d" | "30d";

export interface SessionsKpis {
  sessions: number;
  unique_visitors: number;
  registered_share: number;
  conversion_rate: number;
  avg_duration_seconds: number;
  engaged_pct: number;
}

export interface FunnelRow {
  label: string;
  count: number;
  pct: number;
}

export interface WhoIsBrowsing {
  registered: number;
  anonymous: number;
  warm: number;
}

export interface TopProduct {
  sku: string;
  name: string;
  category: string | null;
  count: number;
}

export interface ChannelRow {
  channel: string;
  count: number;
  pct: number;
}

export interface DeviceRow {
  device_type: string;
  count: number;
  pct: number;
}

export interface GeoRow {
  location: string;
  count: number;
  pct: number;
}

export interface SessionsOverview {
  range: Range;
  kpis: SessionsKpis;
  funnel: FunnelRow[];
  who: WhoIsBrowsing;
  top_products: TopProduct[];
  top_categories: TopProduct[];
  viewed_not_bought: TopProduct[];
  channels: ChannelRow[];
  devices: DeviceRow[];
  geo: GeoRow[];
}

export interface RecoverableCart {
  customer_id: string | null;
  full_name: string | null;
  email: string | null;
  segment: string | null;
  stage: string;
  stage_num: number;
  cart_value: number;
  last_seen: string;
  products: string[];
}

export interface AbandonmentKpis {
  cart_abandonment_rate: number;
  checkout_abandonment_rate: number;
  recoverable_carts: number;
  recoverable_value: number;
}

export interface AbandonmentByStage {
  stage: string;
  stage_num: number;
  count: number;
}

export interface SourceSplit {
  shopify_abandoned: number;
  live_pixel: number;
}

export interface AbandonmentData {
  range: Range;
  kpis: AbandonmentKpis;
  by_stage: AbandonmentByStage[];
  source: SourceSplit;
  recoverable: RecoverableCart[];
}

export async function fetchSessionsOverview(range: Range = "30d"): Promise<SessionsOverview> {
  const r = await fetch(`${API_BASE}/api/v1/sessions/overview?range=${range}`);
  if (!r.ok) throw new Error(`Sessions overview: ${r.status}`);
  return r.json();
}

export async function fetchAbandonmentData(range: Range = "30d"): Promise<AbandonmentData> {
  const r = await fetch(`${API_BASE}/api/v1/sessions/abandonment?range=${range}`);
  if (!r.ok) throw new Error(`Abandonment: ${r.status}`);
  return r.json();
}
