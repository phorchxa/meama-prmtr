// Demo dataset for the UI shell. Shapes mirror the API contracts so pages can
// swap to live endpoints without restructuring. Order data is GEL; Meta Ads is USD.

// ---------- Command Center ----------
export interface Kpi {
  label: string;
  labelKa: string;
  value: number;
  unit: "GEL" | "USD" | "count" | "pct";
  deltaPct: number | null;
  trend?: number[];
}

export const KPIS: Kpi[] = [
  { label: "Revenue · 30d", labelKa: "შემოსავალი · 30 დღე", value: 412380, unit: "GEL", deltaPct: 0.082, trend: [296, 310, 322, 301, 348, 365, 359, 392, 401, 388, 405, 412] },
  { label: "Orders · 30d", labelKa: "შეკვეთები · 30 დღე", value: 8214, unit: "count", deltaPct: 0.054, trend: [61, 64, 66, 63, 70, 72, 71, 76, 79, 77, 80, 82] },
  { label: "Avg Order Value", labelKa: "საშ. შეკვეთის ღირებულება", value: 50.2, unit: "GEL", deltaPct: 0.027 },
  { label: "Active Customers", labelKa: "აქტიური მომხმარებლები", value: 12408, unit: "count", deltaPct: 0.031 },
  { label: "At-Risk (45–89d)", labelKa: "რისკის ქვეშ (45–89 დღე)", value: 1733, unit: "count", deltaPct: -0.046 },
  { label: "Meta Spend · 30d", labelKa: "Meta ხარჯი · 30 დღე", value: 18420, unit: "USD", deltaPct: 0.112 },
];

export const REVENUE_TREND_30D = [
  11.2, 12.8, 12.1, 13.4, 12.9, 14.2, 15.8, 13.1, 12.4, 13.9, 14.6, 15.2, 14.1,
  13.8, 16.4, 17.2, 14.9, 13.6, 14.8, 15.5, 16.1, 14.4, 13.9, 15.8, 16.9, 17.4,
  15.2, 14.6, 16.2, 17.8,
]; // ₾K per day

export const CHANNEL_SPLIT = { ecom: 0.58, brandStore: 0.42 };

// ---------- Products ----------
export interface Product {
  sku: string;
  name: string;
  /** Capsule intensity 1–12; null for hardware. */
  intensity: number | null;
  notes: string;
  price: number; // GEL
  cogs: number; // GEL
  units30d: number;
  /** Units sold per month, last 12 months (oldest first). */
  monthly: number[];
  repeatRate: number; // share of buyers who reorder within 60d
}

export interface ProductCategory {
  id: string;
  name: string;
  nameKa: string;
  blurb: string;
  revenue30d: number; // GEL
  units30d: number;
  marginAvg: number;
  products: Product[];
}

const m = (base: number, lift: number[]): number[] => lift.map((x) => Math.round(base * x));

export const CATEGORIES: ProductCategory[] = [
  {
    id: "coffee-capsules",
    name: "Coffee Capsules",
    nameKa: "ყავის კაფსულები",
    blurb: "Core revenue engine — 12 flavours, highest repeat rate in the portfolio.",
    revenue30d: 248900,
    units30d: 9870,
    marginAvg: 0.57,
    products: [
      { sku: "CAP-COL-01", name: "Colombia", intensity: 6, notes: "Caramel · red fruit · balanced", price: 24.9, cogs: 9.4, units30d: 1480, monthly: m(1300, [0.82, 0.85, 0.9, 0.88, 0.95, 1.0, 0.97, 1.04, 1.08, 1.05, 1.1, 1.14]), repeatRate: 0.64 },
      { sku: "CAP-ETH-02", name: "Ethiopia", intensity: 5, notes: "Jasmine · bergamot · citrus", price: 26.9, cogs: 10.2, units30d: 1120, monthly: m(980, [0.8, 0.84, 0.88, 0.91, 0.94, 0.99, 1.02, 1.0, 1.06, 1.09, 1.12, 1.14]), repeatRate: 0.61 },
      { sku: "CAP-BRA-03", name: "Brazil", intensity: 7, notes: "Cocoa · hazelnut · round body", price: 23.9, cogs: 9.0, units30d: 1310, monthly: m(1180, [0.85, 0.88, 0.86, 0.92, 0.96, 1.0, 1.03, 1.05, 1.02, 1.08, 1.1, 1.11]), repeatRate: 0.66 },
      { sku: "CAP-GUA-04", name: "Guatemala", intensity: 8, notes: "Dark chocolate · spice", price: 26.9, cogs: 10.4, units30d: 840, monthly: m(760, [0.78, 0.82, 0.85, 0.9, 0.93, 0.97, 1.0, 1.04, 1.02, 1.07, 1.09, 1.1]), repeatRate: 0.58 },
      { sku: "CAP-CLS-05", name: "Espresso Classico", intensity: 9, notes: "Roasted · full body · crema", price: 22.9, cogs: 8.6, units30d: 1620, monthly: m(1450, [0.86, 0.89, 0.92, 0.9, 0.97, 1.0, 1.04, 1.06, 1.09, 1.07, 1.12, 1.12]), repeatRate: 0.71 },
      { sku: "CAP-INT-06", name: "Espresso Intenso", intensity: 11, notes: "Smoky · bold · long finish", price: 22.9, cogs: 8.6, units30d: 1390, monthly: m(1260, [0.84, 0.87, 0.9, 0.94, 0.96, 1.01, 1.03, 1.05, 1.08, 1.1, 1.1, 1.1]), repeatRate: 0.69 },
      { sku: "CAP-LUN-07", name: "Lungo Oro", intensity: 4, notes: "Honey · almond · gentle", price: 24.9, cogs: 9.6, units30d: 610, monthly: m(560, [0.8, 0.83, 0.87, 0.9, 0.92, 0.96, 1.0, 1.03, 1.05, 1.04, 1.08, 1.09]), repeatRate: 0.55 },
      { sku: "CAP-RIS-08", name: "Ristretto", intensity: 12, notes: "Intense · peppery · dense", price: 23.9, cogs: 9.1, units30d: 540, monthly: m(500, [0.82, 0.85, 0.84, 0.9, 0.94, 0.98, 1.0, 1.02, 1.06, 1.08, 1.07, 1.08]), repeatRate: 0.62 },
      { sku: "CAP-DEC-09", name: "Decaf Notte", intensity: 5, notes: "Swiss-water decaf · cocoa", price: 25.9, cogs: 10.8, units30d: 320, monthly: m(290, [0.85, 0.86, 0.9, 0.93, 0.95, 0.97, 1.0, 1.01, 1.05, 1.06, 1.1, 1.1]), repeatRate: 0.59 },
      { sku: "CAP-CAR-10", name: "Caramel", intensity: 5, notes: "Sweet caramel · dessert profile", price: 25.9, cogs: 10.1, units30d: 290, monthly: m(250, [0.7, 0.76, 0.82, 0.88, 0.92, 0.97, 1.0, 1.06, 1.1, 1.13, 1.15, 1.16]), repeatRate: 0.48 },
      { sku: "CAP-VAN-11", name: "Vanilla", intensity: 4, notes: "Vanilla · soft · aromatic", price: 25.9, cogs: 10.1, units30d: 240, monthly: m(210, [0.72, 0.78, 0.83, 0.87, 0.93, 0.96, 1.0, 1.05, 1.08, 1.12, 1.14, 1.14]), repeatRate: 0.45 },
      { sku: "CAP-HAZ-12", name: "Hazelnut", intensity: 5, notes: "Roasted hazelnut · creamy", price: 25.9, cogs: 10.1, units30d: 110, monthly: m(160, [1.15, 1.1, 1.06, 1.0, 0.96, 0.9, 0.85, 0.8, 0.76, 0.72, 0.7, 0.69]), repeatRate: 0.41 },
    ],
  },
  {
    id: "tea-capsules",
    name: "Tea Capsules",
    nameKa: "ჩაის კაფსულები",
    blurb: "Fast-growing line — strong cross-sell into coffee households.",
    revenue30d: 64200,
    units30d: 2710,
    marginAvg: 0.61,
    products: [
      { sku: "TEA-EGR-01", name: "Earl Grey", intensity: 3, notes: "Bergamot · classic black", price: 23.9, cogs: 8.2, units30d: 640, monthly: m(540, [0.78, 0.82, 0.86, 0.9, 0.94, 0.98, 1.0, 1.04, 1.08, 1.1, 1.13, 1.16]), repeatRate: 0.57 },
      { sku: "TEA-EBF-02", name: "English Breakfast", intensity: 4, notes: "Malty · brisk · morning", price: 23.9, cogs: 8.2, units30d: 520, monthly: m(450, [0.8, 0.84, 0.88, 0.9, 0.95, 0.98, 1.02, 1.04, 1.07, 1.1, 1.12, 1.13]), repeatRate: 0.55 },
      { sku: "TEA-JAS-03", name: "Green Jasmine", intensity: 2, notes: "Floral · light · fragrant", price: 24.9, cogs: 8.8, units30d: 470, monthly: m(390, [0.74, 0.79, 0.84, 0.89, 0.93, 0.97, 1.0, 1.06, 1.1, 1.14, 1.17, 1.2]), repeatRate: 0.53 },
      { sku: "TEA-MTN-04", name: "Mountain Herbs", intensity: 2, notes: "Georgian highland herbs", price: 25.9, cogs: 9.0, units30d: 430, monthly: m(350, [0.7, 0.76, 0.82, 0.88, 0.93, 0.98, 1.02, 1.08, 1.12, 1.16, 1.2, 1.23]), repeatRate: 0.58 },
      { sku: "TEA-CHA-05", name: "Chamomile", intensity: 1, notes: "Calming · evening · honeyed", price: 23.9, cogs: 8.0, units30d: 360, monthly: m(310, [0.8, 0.83, 0.87, 0.9, 0.94, 0.97, 1.0, 1.03, 1.06, 1.1, 1.12, 1.13]), repeatRate: 0.5 },
      { sku: "TEA-BCU-06", name: "Black Currant", intensity: 3, notes: "Fruity · tart · jammy", price: 24.9, cogs: 8.7, units30d: 290, monthly: m(240, [0.72, 0.77, 0.83, 0.88, 0.92, 0.97, 1.0, 1.05, 1.1, 1.14, 1.18, 1.2]), repeatRate: 0.47 },
    ],
  },
  {
    id: "machines",
    name: "Machines & Hardware",
    nameKa: "აპარატები",
    blurb: "Acquisition anchor — every machine sold locks in capsule demand.",
    revenue30d: 99280,
    units30d: 312,
    marginAvg: 0.38,
    products: [
      { sku: "MCH-ONE-01", name: "MEAMA One", intensity: null, notes: "Compact capsule machine", price: 299, cogs: 192, units30d: 186, monthly: m(150, [0.8, 0.85, 0.9, 0.88, 0.95, 1.0, 1.05, 1.1, 1.08, 1.15, 1.2, 1.24]), repeatRate: 0.0 },
      { sku: "MCH-PRO-02", name: "MEAMA Pro", intensity: null, notes: "Pro model · milk system", price: 449, cogs: 296, units30d: 74, monthly: m(60, [0.78, 0.82, 0.88, 0.92, 0.95, 1.0, 1.02, 1.08, 1.1, 1.16, 1.2, 1.23]), repeatRate: 0.0 },
      { sku: "MCH-MLK-03", name: "Milk Frother", intensity: null, notes: "Hot & cold foam", price: 89, cogs: 54, units30d: 52, monthly: m(45, [0.82, 0.85, 0.9, 0.93, 0.96, 1.0, 1.04, 1.06, 1.1, 1.12, 1.15, 1.16]), repeatRate: 0.0 },
    ],
  },
];

// ---------- Customers / Portfolios ----------
export type Segment =
  | "champion"
  | "capsule_loyalist"
  | "flavour_explorer"
  | "regular"
  | "at_risk"
  | "lost"
  | "new";

export const SEGMENT_META: Record<Segment, { label: string; labelKa: string; tone: "green" | "gold" | "blue" | "red" | "muted" }> = {
  champion: { label: "Champion", labelKa: "ჩემპიონი", tone: "green" },
  capsule_loyalist: { label: "Capsule Loyalist", labelKa: "კაფსულის ლოიალისტი", tone: "gold" },
  flavour_explorer: { label: "Flavour Explorer", labelKa: "გემოს მკვლევარი", tone: "blue" },
  regular: { label: "Regular", labelKa: "რეგულარული", tone: "muted" },
  at_risk: { label: "At Risk", labelKa: "რისკის ქვეშ", tone: "red" },
  lost: { label: "Lost", labelKa: "დაკარგული", tone: "red" },
  new: { label: "New", labelKa: "ახალი", tone: "blue" },
};

/** Segments that never receive discounts — early access only. */
export const NO_DISCOUNT_SEGMENTS: Segment[] = ["champion", "capsule_loyalist", "flavour_explorer"];

export interface Customer {
  id: string;
  name: string;
  segment: Segment;
  ltv: number; // GEL, registered customers only
  orders: number;
  aov: number; // GEL
  lastOrderDaysAgo: number;
  churnScore: number; // 0.0–1.0, Claude batch output
  upsellFlag: boolean;
  favouriteFlavours: string[];
  channel: "ecom" | "brand_store" | "mixed";
  /** Monthly spend, last 12 months, GEL. */
  spendHistory: number[];
}

export const CUSTOMERS: Customer[] = [
  { id: "C-07342", name: "Davit Lomidze", segment: "champion", ltv: 5960, orders: 81, aov: 73.6, lastOrderDaysAgo: 4, churnScore: 0.04, upsellFlag: false, favouriteFlavours: ["Espresso Intenso", "Ristretto", "Guatemala"], channel: "mixed", spendHistory: [410, 460, 430, 490, 520, 480, 510, 530, 470, 540, 560, 520] },
  { id: "C-10412", name: "Nino Kapanadze", segment: "champion", ltv: 4820, orders: 64, aov: 75.3, lastOrderDaysAgo: 7, churnScore: 0.06, upsellFlag: true, favouriteFlavours: ["Colombia", "Ethiopia", "Green Jasmine"], channel: "ecom", spendHistory: [360, 380, 410, 390, 430, 450, 420, 460, 470, 440, 480, 490] },
  { id: "C-09873", name: "Giorgi Beridze", segment: "capsule_loyalist", ltv: 3140, orders: 48, aov: 65.4, lastOrderDaysAgo: 12, churnScore: 0.11, upsellFlag: true, favouriteFlavours: ["Espresso Classico", "Brazil"], channel: "ecom", spendHistory: [240, 250, 260, 240, 270, 280, 260, 290, 300, 280, 310, 300] },
  { id: "C-10978", name: "Mariam Japaridze", segment: "capsule_loyalist", ltv: 2540, orders: 39, aov: 65.1, lastOrderDaysAgo: 9, churnScore: 0.09, upsellFlag: false, favouriteFlavours: ["Colombia", "Caramel"], channel: "brand_store", spendHistory: [190, 200, 210, 220, 210, 230, 240, 230, 250, 260, 250, 270] },
  { id: "C-08755", name: "Levan Tsiklauri", segment: "at_risk", ltv: 2310, orders: 31, aov: 74.5, lastOrderDaysAgo: 61, churnScore: 0.74, upsellFlag: false, favouriteFlavours: ["Brazil", "Espresso Classico"], channel: "ecom", spendHistory: [280, 260, 290, 270, 250, 230, 200, 170, 120, 60, 0, 0] },
  { id: "C-10033", name: "Zurab Kvaratskhelia", segment: "at_risk", ltv: 1690, orders: 23, aov: 73.5, lastOrderDaysAgo: 52, churnScore: 0.68, upsellFlag: false, favouriteFlavours: ["Espresso Intenso"], channel: "brand_store", spendHistory: [210, 220, 200, 230, 210, 190, 160, 140, 100, 70, 30, 0] },
  { id: "C-11240", name: "Tamar Gelashvili", segment: "flavour_explorer", ltv: 1870, orders: 26, aov: 71.9, lastOrderDaysAgo: 15, churnScore: 0.18, upsellFlag: true, favouriteFlavours: ["Black Currant", "Vanilla", "Mountain Herbs", "Ethiopia"], channel: "ecom", spendHistory: [120, 140, 150, 160, 150, 170, 180, 170, 190, 200, 190, 210] },
  { id: "C-11587", name: "Salome Tsereteli", segment: "flavour_explorer", ltv: 980, orders: 14, aov: 70.0, lastOrderDaysAgo: 21, churnScore: 0.22, upsellFlag: false, favouriteFlavours: ["Green Jasmine", "Chamomile", "Caramel"], channel: "ecom", spendHistory: [60, 70, 80, 75, 90, 95, 100, 95, 110, 115, 110, 120] },
  { id: "C-09114", name: "Irakli Maisuradze", segment: "lost", ltv: 1420, orders: 19, aov: 74.7, lastOrderDaysAgo: 124, churnScore: 0.91, upsellFlag: false, favouriteFlavours: ["Lungo Oro"], channel: "ecom", spendHistory: [180, 170, 160, 150, 120, 90, 60, 20, 0, 0, 0, 0] },
  { id: "C-12001", name: "Ana Khurtsidze", segment: "new", ltv: 148, orders: 2, aov: 74.0, lastOrderDaysAgo: 6, churnScore: 0.32, upsellFlag: true, favouriteFlavours: ["Colombia"], channel: "ecom", spendHistory: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 74, 74] },
];

export const SEGMENT_DISTRIBUTION: { segment: Segment; share: number; count: number }[] = [
  { segment: "champion", share: 0.08, count: 993 },
  { segment: "capsule_loyalist", share: 0.22, count: 2730 },
  { segment: "flavour_explorer", share: 0.15, count: 1861 },
  { segment: "regular", share: 0.3, count: 3722 },
  { segment: "at_risk", share: 0.14, count: 1733 },
  { segment: "lost", share: 0.11, count: 1369 },
];

export const CHURN_BUCKETS = [
  { range: "0.0–0.2", count: 6240 },
  { range: "0.2–0.4", count: 2890 },
  { range: "0.4–0.6", count: 1640 },
  { range: "0.6–0.8", count: 1026 },
  { range: "0.8–1.0", count: 612 },
];

export const AOV_BY_SEGMENT: { segment: Segment; aov: number }[] = [
  { segment: "champion", aov: 74.6 },
  { segment: "capsule_loyalist", aov: 65.2 },
  { segment: "flavour_explorer", aov: 70.8 },
  { segment: "regular", aov: 48.4 },
  { segment: "at_risk", aov: 52.1 },
];

export const NEW_VS_RETURNING = [
  { month: "Jul", newPct: 0.34 }, { month: "Aug", newPct: 0.32 }, { month: "Sep", newPct: 0.31 },
  { month: "Oct", newPct: 0.29 }, { month: "Nov", newPct: 0.33 }, { month: "Dec", newPct: 0.38 },
  { month: "Jan", newPct: 0.30 }, { month: "Feb", newPct: 0.28 }, { month: "Mar", newPct: 0.27 },
  { month: "Apr", newPct: 0.26 }, { month: "May", newPct: 0.25 }, { month: "Jun", newPct: 0.24 },
];

// ---------- Money Hunter ----------
export interface Opportunity {
  id: string;
  title: string;
  detail: string;
  customers: number;
  estValue: number; // GEL
  confidence: "high" | "medium" | "low";
  playbook: string;
  discountAllowed: boolean;
}

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "OP-01",
    title: "Machine upsell — heavy capsule buyers without a machine",
    detail: "184 customers buying 3+ capsule boxes/month on a competitor or office machine.",
    customers: 184,
    estValue: 55000,
    confidence: "high",
    playbook: "Bundle offer: MEAMA One + 4 boxes. Margin-safe at list price.",
    discountAllowed: true,
  },
  {
    id: "OP-02",
    title: "Win-back — at-risk regulars (45–89 days silent)",
    detail: "412 regulars past the 45-day silence threshold, churn score under 0.7.",
    customers: 412,
    estValue: 48200,
    confidence: "high",
    playbook: "Replenishment reminder + capped 15% voucher (max 25% rule enforced).",
    discountAllowed: true,
  },
  {
    id: "OP-03",
    title: "Tea cross-sell — coffee-only households",
    detail: "921 coffee buyers with zero tea purchases; lookalike affinity to Mountain Herbs.",
    customers: 921,
    estValue: 19400,
    confidence: "medium",
    playbook: "Sampler pack insert in next coffee order, no discount required.",
    discountAllowed: false,
  },
  {
    id: "OP-04",
    title: "Replenishment due — predicted reorder this week",
    detail: "268 customers whose reorder cadence lands in the next 7 days.",
    customers: 268,
    estValue: 14300,
    confidence: "high",
    playbook: "Telegram/SMS nudge at their usual ordering hour. No discount.",
    discountAllowed: false,
  },
  {
    id: "OP-05",
    title: "Dormant champions — early-access reactivation",
    detail: "36 champions silent 30–44 days. NO-DISCOUNT segment — early access only.",
    customers: 36,
    estValue: 12900,
    confidence: "medium",
    playbook: "Early access to the new single-origin drop. Never a price cut.",
    discountAllowed: false,
  },
];

// ---------- Ads (USD only) ----------
export interface AdCampaign {
  id: string;
  name: string;
  status: "active" | "paused";
  spend: number; // USD
  revenue: number; // USD-equivalent attributed
  roas: number;
  ctr: number;
  cpm: number;
  purchases: number;
}

export const AD_CAMPAIGNS: AdCampaign[] = [
  { id: "ad-1", name: "Prospecting — Lookalike GE 3%", status: "active", spend: 6240, revenue: 23712, roas: 3.8, ctr: 0.021, cpm: 4.1, purchases: 412 },
  { id: "ad-2", name: "Retargeting — Cart & View 14d", status: "active", spend: 3180, revenue: 16218, roas: 5.1, ctr: 0.034, cpm: 6.2, purchases: 348 },
  { id: "ad-3", name: "Capsule Bundles — Summer Drop", status: "active", spend: 4460, revenue: 12934, roas: 2.9, ctr: 0.018, cpm: 4.8, purchases: 256 },
  { id: "ad-4", name: "Machines — Gift Season Prep", status: "active", spend: 2890, revenue: 7514, roas: 2.6, ctr: 0.015, cpm: 5.4, purchases: 64 },
  { id: "ad-5", name: "Brand Awareness — Reels GE", status: "active", spend: 1650, revenue: 2640, roas: 1.6, ctr: 0.011, cpm: 2.9, purchases: 38 },
];

export const ROAS_ALERT_THRESHOLD = 2.0;
export const SPEND_TREND_14D = [1180, 1240, 1210, 1320, 1290, 1380, 1420, 1350, 1310, 1440, 1390, 1460, 1510, 1480]; // USD/day

// ---------- Action Queue ----------
export interface ActionItem {
  rank: number;
  title: string;
  signal: string;
  impact: number; // GEL
  severity: "critical" | "high" | "normal";
  module: string;
  to: string;
}

export const ACTIONS: ActionItem[] = [
  { rank: 1, title: "Pause 'Brand Awareness — Reels GE'", signal: "ROAS 1.6 — below the 2.0 alert threshold for 3 days", impact: 4900, severity: "critical", module: "Ad Intelligence", to: "/ads" },
  { rank: 2, title: "Reorder Espresso Classico capsules", signal: "1.6 weeks of cover left — below the 2-week floor", impact: 38600, severity: "critical", module: "Stock", to: "/stock" },
  { rank: 3, title: "Launch at-risk win-back (412 customers)", signal: "45-day silence threshold crossed; churn scores rising", impact: 48200, severity: "high", module: "Money Hunter", to: "/money-hunter" },
  { rank: 4, title: "Approve machine-upsell bundle draft", signal: "Claude draft ready; 184 high-confidence targets", impact: 55000, severity: "high", module: "Money Hunter", to: "/money-hunter" },
  { rank: 5, title: "Review Hazelnut capsule decline", signal: "Units down 40% over 12 months — delist or reposition", impact: 2800, severity: "normal", module: "Products", to: "/products/coffee-capsules" },
  { rank: 6, title: "Send early-access drop to champions", signal: "36 dormant champions; NO-DISCOUNT segment", impact: 12900, severity: "normal", module: "Money Hunter", to: "/money-hunter" },
  { rank: 7, title: "QA June retail report before board export", signal: "Scheduled for Friday 18:00 Tbilisi", impact: 0, severity: "normal", module: "Reports", to: "/reports" },
];

// ---------- Alerts ----------
export interface AlertRow {
  id: string;
  severity: "critical" | "warning" | "info";
  emoji: "🚨" | "⚠️" | "ℹ️";
  title: string;
  detail: string;
  time: string; // pre-formatted ka-GE GMT+4
  channel: "telegram" | "in_app";
}

export const ALERTS: AlertRow[] = [
  { id: "al-1", severity: "critical", emoji: "🚨", title: "ROAS below threshold", detail: "'Brand Awareness — Reels GE' at 1.6 (threshold 2.0) for 3 consecutive days.", time: "12.06.2026, 09:14", channel: "telegram" },
  { id: "al-2", severity: "critical", emoji: "🚨", title: "Stock critical — Espresso Classico", detail: "1.6 weeks of cover left; reorder point is 14 days.", time: "12.06.2026, 06:02", channel: "telegram" },
  { id: "al-3", severity: "warning", emoji: "⚠️", title: "Cancel spike — e-commerce", detail: "Cancellations at 11% of orders in the last 24h (alert fires at 15%). Watching.", time: "11.06.2026, 22:40", channel: "in_app" },
  { id: "al-4", severity: "warning", emoji: "⚠️", title: "High churn-risk cohort grew", detail: "612 customers now score ≥ 0.7 (+38 this week).", time: "11.06.2026, 02:05", channel: "telegram" },
  { id: "al-5", severity: "info", emoji: "ℹ️", title: "Nightly ETL completed", detail: "14/14 sources loaded · 121,384 orders · sync_log clean.", time: "12.06.2026, 02:11", channel: "in_app" },
  { id: "al-6", severity: "info", emoji: "ℹ️", title: "Claude batch insights refreshed", detail: "churn_score, cluster_tag, upsell_tag updated for 12,408 active customers.", time: "12.06.2026, 02:54", channel: "in_app" },
];

// ---------- Stock ----------
export interface StockRow {
  sku: string;
  name: string;
  onHand: number;
  dailyVelocity: number;
  weeksCover: number;
  status: "ok" | "low" | "critical";
}

export const STOCK: StockRow[] = [
  { sku: "CAP-CLS-05", name: "Espresso Classico", onHand: 1810, dailyVelocity: 162, weeksCover: 1.6, status: "critical" },
  { sku: "CAP-INT-06", name: "Espresso Intenso", onHand: 2540, dailyVelocity: 139, weeksCover: 2.6, status: "low" },
  { sku: "CAP-COL-01", name: "Colombia", onHand: 4180, dailyVelocity: 148, weeksCover: 4.0, status: "ok" },
  { sku: "CAP-BRA-03", name: "Brazil", onHand: 3660, dailyVelocity: 131, weeksCover: 4.0, status: "ok" },
  { sku: "TEA-EGR-01", name: "Earl Grey", onHand: 980, dailyVelocity: 64, weeksCover: 2.2, status: "low" },
  { sku: "TEA-MTN-04", name: "Mountain Herbs", onHand: 1520, dailyVelocity: 43, weeksCover: 5.1, status: "ok" },
  { sku: "MCH-ONE-01", name: "MEAMA One", onHand: 64, dailyVelocity: 6.2, weeksCover: 1.5, status: "critical" },
  { sku: "MCH-PRO-02", name: "MEAMA Pro", onHand: 48, dailyVelocity: 2.5, weeksCover: 2.7, status: "low" },
];

// ---------- Reports ----------
export interface ReportCard {
  id: string;
  name: string;
  nameKa: string;
  description: string;
  lastGenerated: string;
  rows: number;
}

export const REPORTS: ReportCard[] = [
  { id: "rp-1", name: "Monthly Retail Summary", nameKa: "თვიური საცალო შეჯამება", description: "Revenue, orders, AOV by channel — e-com + brand stores only.", lastGenerated: "12.06.2026, 02:20", rows: 14 },
  { id: "rp-2", name: "SKU Performance", nameKa: "SKU ეფექტურობა", description: "Per-SKU revenue, margin, repeat rate, 12-month trend.", lastGenerated: "12.06.2026, 02:22", rows: 21 },
  { id: "rp-3", name: "Segment Movement", nameKa: "სეგმენტების მოძრაობა", description: "Month-over-month transitions between RFM segments.", lastGenerated: "12.06.2026, 02:25", rows: 36 },
  { id: "rp-4", name: "Campaign Lift", nameKa: "კამპანიის ეფექტი", description: "Pre/post revenue lift and redemption per campaign.", lastGenerated: "12.06.2026, 02:27", rows: 9 },
  { id: "rp-5", name: "Meta Ads Weekly (USD)", nameKa: "Meta კვირეული (USD)", description: "Spend, ROAS, CPM by campaign — USD only, never mixed with GEL.", lastGenerated: "12.06.2026, 02:30", rows: 5 },
  { id: "rp-6", name: "Churn Watchlist", nameKa: "გადინების სია", description: "Customers with churn_score ≥ 0.7, ranked by LTV at risk.", lastGenerated: "12.06.2026, 02:33", rows: 612 },
];

// ---------- Money totals ----------
export const MONEY_ON_TABLE = OPPORTUNITIES.reduce((s, o) => s + o.estValue, 0);
