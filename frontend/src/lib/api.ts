const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface ProductSummary {
  sku: string;
  name: string;
  category: string;
  subcategory: string | null;
  price: number;
  cogs: number | null;

  // Enrichment
  image_url: string | null;
  caffeine: string | null;
  caffeine_mg: number | null;
  intensity_level: number | null;
  bitterness: number | null;
  arabica_pct: number | null;
  robusta_pct: number | null;
  flavor_profile: string | null;
  ingredients: string | null;
  beverage_type: string | null;
  bio: boolean;
  compatible_with: string | null;
  capsule_format: string | null;
  hot_cold: string | null;

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

export async function fetchProducts(): Promise<ProductsResponse> {
  const res = await fetch(`${BASE}/api/v1/products`);
  if (!res.ok) throw new Error(`products ${res.status}`);
  return res.json() as Promise<ProductsResponse>;
}

export async function fetchAffinityPairs(): Promise<AffinityPair[]> {
  const res = await fetch(`${BASE}/api/v1/products/affinity`);
  if (!res.ok) throw new Error(`affinity ${res.status}`);
  return res.json() as Promise<AffinityPair[]>;
}
