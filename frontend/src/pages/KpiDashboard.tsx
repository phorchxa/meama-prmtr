import { useState, useEffect, type ReactNode } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const MONO = "'Geist Mono','SFMono-Regular',ui-monospace,monospace";
const UI   = "'Hanken Grotesk','Segoe UI',system-ui,sans-serif";

// ── Token maps ──────────────────────────────────────────────────────────────
const DeltaBg  = { pos: '#E9F8EE', neg: '#FDECEC', warn: '#FFF6E6', neu: '#ECEFEC' } as const;
const DeltaClr = { pos: '#16823F', neg: '#CC2E33', warn: '#C97E08', neu: '#525B53' } as const;
const ValClr   = { pos: '#121712', neg: '#CC2E33', warn: '#C97E08' }               as const;
const BarClr   = { neg: '#CC2E33', warn: '#C97E08', pos: '#1F9D52' }               as const;
const StatBg   = { behind: '#FDECEC', watch: '#FFF6E6', growing: '#E9F8EE', track: '#ECEFEC' } as const;
const StatClr  = { behind: '#CC2E33', watch: '#C97E08', growing: '#16823F', track: '#525B53' } as const;

type DT = keyof typeof DeltaBg;
type VT = keyof typeof ValClr;
type BT = keyof typeof BarClr;
type ST = keyof typeof StatBg;

// ── Types ───────────────────────────────────────────────────────────────────
interface McProps {
  label: string;
  value: string;
  vt: VT;
  prev: string;
  delta: string;
  dt: DT;
  bar?: { w: string; bt: BT };
  primary?: boolean;
}

interface MetricVal { current: number | null; previous: number | null; delta_pct: number | null; }

// ── Data helpers ────────────────────────────────────────────────────────────
const fmt = (val: number | null | undefined, type: 'currency' | 'pct' | 'number' = 'number'): string => {
  if (val === null || val === undefined) return '—';
  if (type === 'currency') return `₾${val >= 1000 ? (val / 1000).toFixed(0) + 'K' : val.toFixed(0)}`;
  if (type === 'pct') return `${val.toFixed(1)}%`;
  return val >= 1000 ? val.toLocaleString() : val.toString();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const metric = (key: string, channel: any): MetricVal =>
  channel?.[key] ?? { current: null, previous: null, delta_pct: null };

const deltaInfo = (m: MetricVal, goodUp = true): { dt: DT; deltaStr: string } => {
  if (m.delta_pct === null) return { dt: 'neu', deltaStr: '' };
  const d = m.delta_pct;
  const up = d > 0;
  const good = goodUp ? up : !up;
  const dt: DT = good ? 'pos' : 'neg';
  const arrow = up ? '↑' : '↓';
  const sign = up ? '+' : '';
  return { dt, deltaStr: `${arrow} ${sign}${d.toFixed(1)}% MoM` };
};

const vtOf = (dt: DT): VT => (dt === 'pos' ? 'pos' : dt === 'neg' ? 'neg' : 'pos');

const prevFmt = (m: MetricVal, type: 'currency' | 'pct' | 'number'): string => {
  if (m.previous === null) return '—';
  if (m.previous === 0 && m.delta_pct === null) return 'no prev data';
  return `prev ${fmt(m.previous, type)}`;
};

const cell = (
  label: string,
  m: MetricVal,
  fmtType: 'currency' | 'pct' | 'number' = 'number',
  goodUp = true,
  opts: Partial<McProps> = {},
): McProps => {
  const { dt, deltaStr } = deltaInfo(m, goodUp);
  return { label, value: fmt(m.current, fmtType), vt: vtOf(dt), prev: prevFmt(m, fmtType), delta: deltaStr, dt, ...opts };
};

const nullCell = (label: string, opts: Partial<McProps> = {}): McProps => ({
  label, value: '—', vt: 'pos', prev: '—', delta: '', dt: 'neu', ...opts,
});

const channelSt = (revDelta: number | null): { st: ST; status: string } => {
  if (revDelta === null) return { st: 'track', status: '→ On track' };
  if (revDelta < -5)    return { st: 'behind', status: `↓ Behind · ${revDelta.toFixed(1)}% MoM` };
  if (revDelta < 0)     return { st: 'watch',  status: `→ Watching · ${revDelta.toFixed(1)}% MoM` };
  return                       { st: 'growing', status: `↑ On track · +${revDelta.toFixed(1)}% MoM` };
};

// ── Social KPI helpers (comms tab) ───────────────────────────────────────
const fmtK = (v: number | null | undefined): string => {
  if (v == null) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString();
};
const fmtPctS = (v: number | null | undefined, sign = false): string => {
  if (v == null) return '—';
  return `${sign && v > 0 ? '+' : ''}${v.toFixed(1)}%`;
};
const grade = (v: number | null | undefined, thresh: number): { vt: VT; dt: DT } =>
  v == null ? { vt: 'pos', dt: 'neu' } : v >= thresh ? { vt: 'pos', dt: 'pos' } : { vt: 'neg', dt: 'neg' };

// ── Metric cell ─────────────────────────────────────────────────────────────
function MC({ label, value, vt, prev, delta, dt, bar, primary }: McProps) {
  return (
    <div style={{ background: primary ? '#FAFBFA' : '#fff', padding: '20px 20px 16px', position: 'relative' }}>
      {primary && (
        <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 9, color: '#C97E08' }}>★</span>
      )}
      <div style={{
        fontFamily: UI, fontSize: 11, fontWeight: 600, color: '#525B53',
        textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: MONO, fontSize: 22, fontWeight: 600,
        lineHeight: 1, letterSpacing: '-.01em', marginBottom: 5,
        fontFeatureSettings: '"tnum" 1, "lnum" 1',
        color: ValClr[vt],
      }}>
        {value}
      </div>
      <div style={{ fontFamily: UI, fontSize: 11, color: '#727B73', marginBottom: 5 }}>
        {prev}
      </div>
      {delta && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 11, fontWeight: 600, fontFamily: MONO,
          padding: '2px 7px',
          background: DeltaBg[dt], color: DeltaClr[dt],
        }}>
          {delta}
        </div>
      )}
      {bar && (
        <div style={{ height: 2, background: '#ECEFEC', marginTop: 8 }}>
          <div style={{ height: '100%', width: bar.w, background: BarClr[bar.bt] }} />
        </div>
      )}
    </div>
  );
}

// ── Metrics grid ────────────────────────────────────────────────────────────
function MGrid({ cols, cells }: { cols: number; cells: McProps[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      background: '#E0E4E1',
      gap: 1,
      border: '1px solid #E0E4E1',
      borderTop: 'none',
    }}>
      {cells.map((c, i) => <MC key={i} {...c} />)}
    </div>
  );
}

// ── Channel header ──────────────────────────────────────────────────────────
function ChHeader({ name, sub, dot, status, st }: {
  name: string; sub: string; dot: string; status: string; st: ST;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: '#fff', border: '1px solid #E0E4E1', borderBottom: 'none',
      padding: '10px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 8, height: 8, background: dot, flexShrink: 0 }} />
        <span style={{ fontFamily: UI, fontSize: 13, fontWeight: 700, color: '#121712' }}>{name}</span>
        <span style={{ fontFamily: UI, fontSize: 11, color: '#727B73', fontWeight: 500 }}>{sub}</span>
      </div>
      <span style={{
        fontFamily: UI, fontSize: 11, fontWeight: 600, padding: '3px 9px',
        display: 'flex', alignItems: 'center', gap: 5,
        background: StatBg[st], color: StatClr[st],
      }}>
        {status}
      </span>
    </div>
  );
}

// ── Channel section wrapper ─────────────────────────────────────────────────
function Ch({ children, noMb }: { children: ReactNode; noMb?: boolean }) {
  return <div style={{ marginBottom: noMb ? 0 : 20 }}>{children}</div>;
}

// ── Side-by-side layout ─────────────────────────────────────────────────────
function Side({ children, mb }: { children: ReactNode; mb?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: mb ?? 0 }}>
      {children}
    </div>
  );
}

// ── Tab ─────────────────────────────────────────────────────────────────────
type Tab = 'sales' | 'comms' | 'cx';

// ── Main page ───────────────────────────────────────────────────────────────
export default function KpiDashboard() {
  const [tab, setTab] = useState<Tab>('sales');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [kpiData, setKpiData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [social,  setSocial]  = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [metaOv,  setMetaOv]  = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/kpi/sales-channels`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setKpiData(d))
      .catch(() => { /* show — values on error */ })
      .finally(() => setLoading(false));
    fetch(`${API_BASE}/api/v1/marketing/social-kpis`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSocial(d); })
      .catch(() => {});
    fetch(`${API_BASE}/api/v1/campaigns/meta-overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMetaOv(d); })
      .catch(() => {});
  }, []);

  // ── Live channel data ────────────────────────────────────────────────────
  const ec = kpiData?.ecommerce;
  const bs = kpiData?.brand_stores;
  const cs = kpiData?.call_sales;

  const ecRev = metric('revenue', ec);
  const ecSt  = channelSt(ecRev.delta_pct);

  const bsRev = metric('revenue', bs);
  const bsSt  = channelSt(bsRev.delta_pct);

  const csRev = metric('revenue', cs);
  const csSt  = channelSt(csRev.delta_pct);

  // Ecommerce row 1
  const ecRow1: McProps[] = [
    cell('Net Revenue',      ecRev,                        'currency', true,  { primary: true }),
    cell('Sessions',         metric('sessions', ec),       'number',   true),
    cell('Conversion Rate',  metric('conversion_rate', ec),'pct',      true),
    cell('Cart Abandonment', metric('cart_abandon_rate', ec),'pct',    false),
    cell('Total AOV',        metric('aov', ec),            'currency', true),
    cell('New Customers',    metric('new_customers', ec),  'number',   true),
  ];

  // Ecommerce row 2
  const ecRow2: McProps[] = [
    cell('Accessory Attach Rate', metric('accessory_attach_rate', ec), 'pct', true),
    cell('Returning Revenue %',   metric('returning_revenue_pct', ec), 'pct', true),
    nullCell('Contribution Margin %'),
  ];

  // Brand Stores row
  const bsRow: McProps[] = [
    cell('Revenue',              bsRev,                              'currency', true,  { primary: true }),
    nullCell('Footfall'),
    nullCell('Conversion Rate'),
    cell('AOV / Basket',         metric('aov', bs),                  'currency', true),
    cell('Units / Transaction',  metric('avg_units_per_txn', bs),    'number',   true),
    nullCell('Contribution Margin %'),
  ];

  // Call Sales row 1
  const csRow1: McProps[] = [
    nullCell('Outbound Conversion'),
    nullCell('Calls Made'),
    cell('Phone Revenue', csRev, 'currency', true, { primary: true }),
  ];

  // Call Sales row 2
  const csRow2: McProps[] = [
    cell('Phone AOV',             metric('aov', cs),        'currency', true),
    cell('Upsell Rate',           metric('upsell_rate', cs),'pct',      true),
    cell('New Customers Reached', metric('new_customers', cs),'number', true),
  ];

  // ── Comms tab: live social + paid data ───────────────────────────────────
  const tt  = social?.tiktok;
  const igs = social?.instagram;
  const fbm = metaOv;

  const ttGrowth = tt?.follower_growth_pct ?? null;
  const ttGoodGr = ttGrowth != null && ttGrowth >= 5;
  const ttSt: ST = tt == null ? 'track' : ttGoodGr ? 'growing' : 'behind';
  const ttStatus = tt == null ? '— Loading' : `${ttGoodGr ? '↑' : '↓'} Growth ${fmtPctS(ttGrowth)} vs ≥5%`;
  const ttRow1: McProps[] = [
    { label: 'Follower Growth Rate', value: fmtPctS(ttGrowth, true), ...grade(ttGrowth, 5), prev: 'target ≥5% / month', delta: ttGrowth != null && !ttGoodGr ? `↓ ${(ttGrowth - 5).toFixed(1)}pp vs target` : '', bar: { w: ttGrowth != null ? `${Math.min(100, Math.max(0, ttGrowth / 5 * 100)).toFixed(0)}%` : '0%', bt: ttGoodGr ? 'pos' : 'neg' }, primary: true },
    { label: 'Total Followers',      value: tt?.followers_total != null ? tt.followers_total.toLocaleString() : '—', vt: 'pos', prev: '—', delta: '', dt: 'neu' },
    { label: 'Engagement Rate',      value: fmtPctS(tt?.engagement_rate), ...grade(tt?.engagement_rate, 4), prev: 'target ≥4%', delta: tt?.engagement_rate != null && tt.engagement_rate < 4 ? `↓ ${(tt.engagement_rate - 4).toFixed(1)}pp vs target` : '' },
  ];
  const ttRow2: McProps[] = [
    { label: 'Reach · Video Views', value: fmtK(tt?.reach_30d),    vt: 'pos', prev: 'last 30d',         delta: '', dt: 'neu' },
    { label: 'FYP Rate',            value: '—',                     vt: 'pos', prev: 'not in API scope',  delta: '', dt: 'neu' },
    { label: 'Share / Duet Rate',   value: fmtPctS(tt?.share_rate), vt: 'pos', prev: 'shares ÷ views',   delta: '', dt: 'neu' },
  ];

  const igGrowth = igs?.follower_growth_pct ?? null;
  const igGoodGr = igGrowth != null && igGrowth >= 5;
  const igSt: ST = igs == null ? 'track' : igGoodGr ? 'growing' : 'behind';
  const igStatus = igs == null ? '— Loading' : `${igGoodGr ? '↑' : '↓'} Growth ${fmtPctS(igGrowth)} vs ≥5%`;
  const igRow1: McProps[] = [
    { label: 'Follower Growth Rate', value: fmtPctS(igGrowth, true), ...grade(igGrowth, 5), prev: 'target ≥5% / month', delta: igGrowth != null && !igGoodGr ? `↓ ${(igGrowth - 5).toFixed(1)}pp vs target` : '', bar: { w: igGrowth != null ? `${Math.min(100, Math.max(0, igGrowth / 5 * 100)).toFixed(0)}%` : '0%', bt: igGoodGr ? 'pos' : 'neg' }, primary: true },
    { label: 'Total Followers',      value: igs?.followers_total != null ? igs.followers_total.toLocaleString() : '—', vt: 'pos', prev: '—', delta: '', dt: 'neu' },
    { label: 'Engagement Rate',      value: fmtPctS(igs?.engagement_rate), ...grade(igs?.engagement_rate, 3), prev: 'target ≥3%', delta: igs?.engagement_rate != null && igs.engagement_rate < 3 ? `↓ ${(igs.engagement_rate - 3).toFixed(1)}pp vs target` : '' },
  ];
  const igRow2: McProps[] = [
    { label: 'Reach (30d)',      value: fmtK(igs?.reach_30d),                                               vt: 'pos', prev: 'total last 30d',   delta: '', dt: 'neu' },
    { label: 'Story Completion', value: '—',                                                                vt: 'pos', prev: 'not in DB',          delta: '', dt: 'neu' },
    { label: 'Saves / Post',     value: igs?.saves_per_post != null ? igs.saves_per_post.toFixed(0) : '—', vt: 'pos', prev: 'saves not in API',   delta: '', dt: 'neu' },
  ];

  const fbRoas     = fbm?.blended_roas ?? null;
  const fbGoodRoas = fbRoas != null && fbRoas >= 3;
  const fbSt: ST   = fbm == null ? 'track' : fbGoodRoas ? 'growing' : 'behind';
  const fbStatus   = fbm == null ? '— Loading' : `${fbGoodRoas ? '↑' : '↓'} ROAS ${fbRoas?.toFixed(1) ?? '—'}× vs ≥3×`;
  const fbImpr     = fbm?.total_impressions ?? 0;
  const fbClicks   = fbm?.total_clicks ?? 0;
  const fbSpendUsd = fbm?.total_spend_usd ?? 0;
  const fbCtr      = fbImpr > 0 ? fbClicks / fbImpr * 100 : null;
  const fbCpm      = fbImpr > 0 ? fbSpendUsd / fbImpr * 1000 : null;
  const fbRow: McProps[] = [
    { label: 'ROAS',        value: fbRoas != null ? `${fbRoas.toFixed(1)}×` : '—', ...grade(fbRoas, 3), prev: 'target ≥3×', delta: fbRoas != null && !fbGoodRoas ? `↓ ${(fbRoas - 3).toFixed(1)}× vs target` : '', bar: { w: fbRoas != null ? `${Math.min(100, fbRoas / 3 * 100).toFixed(0)}%` : '0%', bt: fbGoodRoas ? 'pos' : 'neg' }, primary: true },
    { label: 'CTR',         value: fmtPctS(fbCtr),                                 vt: 'pos', prev: 'clicks ÷ impressions',  delta: '', dt: 'neu' },
    { label: 'CPM (USD)',   value: fbCpm != null ? `$${fbCpm.toFixed(2)}` : '—',   vt: 'pos', prev: 'cost per 1K impr.',     delta: '', dt: 'neu' },
    { label: 'Impressions', value: fmtK(fbm?.total_impressions),                   vt: 'pos', prev: `${fbm?.period_days ?? 30}d`, delta: '', dt: 'neu' },
  ];

  const tbtn = (t: Tab) => ({
    fontFamily: UI,
    padding: '0 20px',
    height: 40,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
    fontSize: 13,
    fontWeight: tab === t ? 600 : 500,
    color: tab === t ? '#121712' : '#525B53',
    cursor: 'pointer' as const,
    background: 'none',
    border: 'none',
    borderBottom: tab === t ? '2px solid #16823F' : '2px solid transparent',
    marginBottom: -1,
    transition: 'all 120ms',
  });

  const tcnt = (t: Tab) => ({
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    background: tab === t ? '#E9F8EE' : '#ECEFEC',
    color: tab === t ? '#16823F' : '#525B53',
  });

  if (loading) {
    return (
      <div style={{ fontFamily: UI }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.01em', color: '#121712' }}>
            Commercial KPI Dashboard
          </div>
          <div style={{ fontSize: 13, color: '#525B53', marginTop: 4 }}>
            North Star + all channels vs target · Month-over-month comparison
          </div>
        </div>
        <div style={{ color: '#525B53', fontSize: 13 }}>Loading KPI data…</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: UI }}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.01em', color: '#121712' }}>
          Commercial KPI Dashboard
        </div>
        <div style={{ fontSize: 13, color: '#525B53', marginTop: 4 }}>
          North Star + all channels vs target · Month-over-month comparison
        </div>
      </div>

      {/* ── Direction tabs ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E0E4E1', marginBottom: 24 }}>
        <button style={tbtn('sales')} onClick={() => setTab('sales')}>
          Sales Direction <span style={tcnt('sales')}>5 ch</span>
        </button>
        <button style={tbtn('comms')} onClick={() => setTab('comms')}>
          Communication <span style={tcnt('comms')}>4 ch</span>
        </button>
        <button style={tbtn('cx')} onClick={() => setTab('cx')}>
          Customer Experience <span style={tcnt('cx')}>2 ch</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SALES TAB
          ══════════════════════════════════════════════════════════════ */}
      <div style={{ display: tab === 'sales' ? 'block' : 'none' }}>

        {/* Ecommerce */}
        <Ch>
          <ChHeader name="Ecommerce" sub="D2C · Digital" dot="#1F9D52"
            st={ecSt.st} status={ecSt.status} />
          <MGrid cols={6} cells={ecRow1} />
          <MGrid cols={3} cells={ecRow2} />
        </Ch>

        {/* Brand Stores */}
        <Ch>
          <ChHeader name="Brand Stores" sub="D2C · Retail" dot="#1F9D52"
            st={bsSt.st} status={bsSt.status} />
          <MGrid cols={6} cells={bsRow} />
        </Ch>

        {/* Wholesale */}
        <Ch>
          <ChHeader name="Wholesale" sub="B2B" dot="#C97E08" st="behind"
            status="↓ Behind target · –₾16K MoM" />
          <MGrid cols={5} cells={[
            { label: 'B2B Net Revenue',  value: '₾210K',  vt: 'neg',  prev: 'prev ₾226K · target ₾225K', delta: '↓ –7% MoM',    dt: 'neg', bar: { w: '93%', bt: 'neg' }, primary: true },
            { label: 'Active Accounts',  value: '87',     vt: 'pos',  prev: 'prev 82',                    delta: '↑ +5 accounts', dt: 'pos' },
            { label: 'New Accounts',     value: '6',      vt: 'warn', prev: 'prev 8',                     delta: '↓ –2 accounts', dt: 'neg' },
            { label: 'Reorder Rate',     value: '64%',    vt: 'neg',  prev: 'prev 70% · target ≥70%',     delta: '↓ –6pp',        dt: 'neg', bar: { w: '91%', bt: 'neg' } },
            { label: 'AOV / Account',    value: '₾2,414', vt: 'pos',  prev: 'prev ₾2,294',               delta: '↑ +₾120',       dt: 'pos' },
          ]} />
        </Ch>

        {/* Dropper + Call Sales — side by side */}
        <Side>
          <Ch noMb>
            <ChHeader name="Dropper" sub="Vending · B2B" dot="#7C3AED" st="growing"
              status="↑ Growing · +0.4/day" />
            <MGrid cols={3} cells={[
              { label: 'Caps / Machine / Day', value: '14.2',   vt: 'warn', prev: 'prev 13.8',          delta: '↑ +0.4 · growing', dt: 'pos', primary: true },
              { label: 'Active Machines',      value: '38',     vt: 'pos',  prev: 'prev 35',             delta: '↑ +3',             dt: 'pos' },
              { label: 'Rev / Machine / Mo',   value: '₾1,631', vt: 'pos',  prev: 'prev ₾1,544',        delta: '↑ +₾87',           dt: 'pos' },
            ]} />
            <MGrid cols={3} cells={[
              { label: 'New Placements',       value: '3',     vt: 'pos', prev: 'tracking vs target',    delta: '→ target/mo', dt: 'neu' },
              { label: 'AOV Capsule Price',    value: '₾2.41', vt: 'pos', prev: 'tracking',              delta: '→ MoM',       dt: 'neu' },
              { label: 'Gross Margin / Mach.', value: '48%',   vt: 'neg', prev: 'prev 50% · target ≥50%',delta: '↓ –2pp',      dt: 'neg', bar: { w: '96%', bt: 'warn' } },
            ]} />
          </Ch>

          <Ch noMb>
            <ChHeader name="Call · Sales" sub="Outbound" dot="#1A68CC"
              st={csSt.st} status={csSt.status} />
            <MGrid cols={3} cells={csRow1} />
            <MGrid cols={3} cells={csRow2} />
          </Ch>
        </Side>

      </div>

      {/* ══════════════════════════════════════════════════════════════════
          COMMS TAB
          ══════════════════════════════════════════════════════════════ */}
      <div style={{ display: tab === 'comms' ? 'block' : 'none' }}>

        {/* TikTok + Instagram — row 1 */}
        <Side mb={20}>
          <Ch noMb>
            <ChHeader name="TikTok" sub="Short Video" dot="#121712" st={ttSt} status={ttStatus} />
            <MGrid cols={3} cells={ttRow1} />
            <MGrid cols={3} cells={ttRow2} />
          </Ch>

          <Ch noMb>
            <ChHeader name="Instagram" sub="Photo · Reels" dot="#7C3AED" st={igSt} status={igStatus} />
            <MGrid cols={3} cells={igRow1} />
            <MGrid cols={3} cells={igRow2} />
          </Ch>
        </Side>

        {/* Facebook Ads + Meama Corner — row 2 */}
        <Side>
          <Ch noMb>
            <ChHeader name="Facebook Ads" sub="Paid · Social" dot="#1A68CC" st={fbSt} status={fbStatus} />
            <MGrid cols={4} cells={fbRow} />
          </Ch>

          <Ch noMb>
            <ChHeader name="Meama Corner" sub="Offline · Retail" dot="#C97E08" st="track"
              status="↑ Tracking · +4% MoM" />
            <MGrid cols={3} cells={[
              { label: 'Visitors / Interactions', value: '1,240', vt: 'warn', prev: 'prev 1,192 · tracking', delta: '↑ +48 · +4%', dt: 'pos', primary: true },
              { label: 'Events Hosted',           value: '3',     vt: 'warn', prev: 'prev 4',                delta: '↓ –1 event',  dt: 'neg' },
              { label: 'UGC Generated',           value: '87',    vt: 'pos',  prev: 'prev 75',               delta: '↑ +12',       dt: 'pos' },
            ]} />
          </Ch>
        </Side>

      </div>

      {/* ══════════════════════════════════════════════════════════════════
          CX TAB
          ══════════════════════════════════════════════════════════════ */}
      <div style={{ display: tab === 'cx' ? 'block' : 'none' }}>

        {/* Call Support */}
        <Ch>
          <ChHeader name="Call · Support" sub="Support" dot="#1F9D52" st="behind"
            status="↓ FCR 74% vs ≥80% · –4pp MoM" />
          <MGrid cols={5} cells={[
            { label: 'First Call Resolution', value: '74%',    vt: 'neg', prev: 'prev 78% · target ≥80%',    delta: '↓ –4pp MoM',   dt: 'neg', bar: { w: '93%', bt: 'neg' }, primary: true },
            { label: 'CSAT Score',            value: '3.9/5',  vt: 'neg', prev: 'prev 4.1/5 · target ≥4.2', delta: '↓ –0.2',       dt: 'neg' },
            { label: 'Avg Handle Time',       value: '4m 12s', vt: 'neg', prev: 'prev 3m 54s',               delta: '↓ +18s worse', dt: 'neg' },
            { label: 'Response Time',         value: '2m 40s', vt: 'neg', prev: 'prev 2m 20s · target ≤2min',delta: '↓ +20s worse', dt: 'neg' },
            { label: 'Escalation Rate',       value: '13%',    vt: 'neg', prev: 'prev 10% · target ≤10%',    delta: '↓ +3pp worse', dt: 'neg' },
          ]} />
        </Ch>

        {/* Chat & Social DMs */}
        <Ch>
          <ChHeader name="Chat & Social DMs" sub="Digital Support" dot="#1A68CC" st="behind"
            status="↓ Response 1h24m vs ≤1hr" />
          <MGrid cols={4} cells={[
            { label: 'Response Time',   value: '1h 24m', vt: 'neg', prev: 'prev 58m · target ≤1hr',      delta: '↓ +26m worse', dt: 'neg', bar: { w: '100%', bt: 'neg' }, primary: true },
            { label: 'Resolution Rate', value: '79%',    vt: 'neg', prev: 'prev 85% · target ≥85%',      delta: '↓ –6pp',       dt: 'neg' },
            { label: 'CSAT Score',      value: '4.0/5',  vt: 'neg', prev: 'prev 4.2/5 · target ≥4.2',   delta: '↓ –0.2',       dt: 'neg' },
            { label: 'Volume Handled',  value: '2,140',  vt: 'pos', prev: 'prev 1,982',                  delta: '↑ +8%',        dt: 'pos' },
          ]} />
        </Ch>

      </div>

    </div>
  );
}
