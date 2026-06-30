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
  if (type === 'currency') {
    if (val >= 1000) return `₾${(val / 1000).toFixed(0)}K`;
    if (val >= 100)  return `₾${val.toFixed(0)}`;
    return `₾${val.toFixed(2)}`;           // small values (e.g. capsule price) keep cents
  }
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

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/kpi/sales-channels`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setKpiData(d))
      .catch(() => { /* show — values on error */ })
      .finally(() => setLoading(false));
  }, []);

  // ── Live channel data ────────────────────────────────────────────────────
  const ec = kpiData?.ecommerce;
  const bs = kpiData?.brand_stores;
  const cs = kpiData?.call_sales;
  const wh = kpiData?.wholesale;
  const dr = kpiData?.dropper;

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

  // ── Wholesale (B2B) ────────────────────────────────────────────────────────
  const whRev = metric('revenue', wh);
  const whSt  = channelSt(whRev.delta_pct);

  // Append a static target reference to a cell's prev line (targets come from spec, not data).
  const tgt = (c: McProps, t: string): McProps =>
    ({ ...c, prev: c.prev === '—' ? `target ${t}` : `${c.prev} · target ${t}` });
  // COGS-backed margin can't be computed reliably yet — show as pending, not a fake number.
  const pendingCell = (label: string, target: string): McProps =>
    ({ label, value: '—', vt: 'pos', prev: `COGS pending · target ${target}`, delta: '', dt: 'neu' });

  const whRow1: McProps[] = [
    tgt(cell('B2B Net Revenue', whRev, 'currency', true, { primary: true }), '₾225K/mo'),
    cell('Active Accounts',     metric('active_accounts', wh), 'number', true),
    cell('New Accounts',        metric('new_accounts', wh),    'number', true),
    tgt(cell('Reorder Rate',    metric('reorder_rate', wh),    'pct',    true), '≥70%'),
  ];
  const whRow2: McProps[] = [
    cell('AOV per Account',         metric('aov_per_account', wh), 'currency', true),
    cell('AOV — Capsules Only',     metric('capsule_aov', wh),     'currency', true),
    cell('Order Frequency / Account', metric('order_frequency', wh), 'number', true),
    pendingCell('Gross Margin on B2B', '≥25%'),
  ];

  // ── Dropper (Vending) ──────────────────────────────────────────────────────
  const drCaps = metric('caps_per_machine_day', dr);
  const drSt   = channelSt(drCaps.delta_pct);

  const drRow1: McProps[] = [
    cell('Caps / Machine / Day', drCaps,                           'number', true, { primary: true }),
    cell('Active Machines',      metric('active_machines', dr),    'number', true),
    cell('New Placements',       metric('new_placements', dr),     'number', true),
  ];
  const drRow2: McProps[] = [
    cell('Revenue / Machine',    metric('rev_per_machine', dr),    'currency', true),
    cell('AOV — Capsule Price',  metric('capsule_price', dr),      'currency', true),
    pendingCell('Gross Margin / Machine', '≥50%'),
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
          <ChHeader name="Wholesale" sub="B2B" dot="#C97E08"
            st={whSt.st} status={whSt.status} />
          <MGrid cols={4} cells={whRow1} />
          <MGrid cols={4} cells={whRow2} />
        </Ch>

        {/* Dropper + Call Sales — side by side */}
        <Side>
          <Ch noMb>
            <ChHeader name="Dropper" sub="Vending · B2B" dot="#7C3AED"
              st={drSt.st} status={drSt.status} />
            <MGrid cols={3} cells={drRow1} />
            <MGrid cols={3} cells={drRow2} />
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
            <ChHeader name="TikTok" sub="Short Video" dot="#121712" st="behind"
              status="↓ Growth 3.2% vs ≥5%" />
            <MGrid cols={3} cells={[
              { label: 'Follower Growth Rate', value: '+3.2%', vt: 'neg', prev: 'prev +5.0% · target ≥5%', delta: '↓ –1.8pp MoM', dt: 'neg', bar: { w: '64%', bt: 'neg' }, primary: true },
              { label: 'Total Followers',      value: '48.4K', vt: 'pos', prev: 'prev 46.9K',               delta: '↑ +1,500',     dt: 'pos' },
              { label: 'Engagement Rate',      value: '3.8%',  vt: 'neg', prev: 'prev 4.3% · target ≥4%',  delta: '↓ –0.5pp',     dt: 'neg' },
            ]} />
            <MGrid cols={3} cells={[
              { label: 'Reach / Impressions', value: '890K', vt: 'pos', prev: 'prev 795K',   delta: '↑ +12%',   dt: 'pos' },
              { label: 'FYP Rate',            value: '6.1%', vt: 'pos', prev: 'prev 5.9%',   delta: '↑ +0.2pp', dt: 'pos' },
              { label: 'Share / Duet Rate',   value: '1.2%', vt: 'pos', prev: 'tracking',    delta: '→ MoM',    dt: 'neu' },
            ]} />
          </Ch>

          <Ch noMb>
            <ChHeader name="Instagram" sub="Photo · Reels" dot="#7C3AED" st="behind"
              status="↓ Growth 2.1% vs ≥5%" />
            <MGrid cols={3} cells={[
              { label: 'Follower Growth Rate', value: '+2.1%', vt: 'neg', prev: 'prev +5.0% · target ≥5%', delta: '↓ –2.9pp MoM', dt: 'neg', bar: { w: '42%', bt: 'neg' }, primary: true },
              { label: 'Total Followers',      value: '62.1K', vt: 'pos', prev: 'prev 60.8K',               delta: '↑ +1,300',     dt: 'pos' },
              { label: 'Engagement Rate',      value: '2.7%',  vt: 'neg', prev: 'prev 3.1% · target ≥3%',  delta: '↓ –0.4pp',     dt: 'neg' },
            ]} />
            <MGrid cols={3} cells={[
              { label: 'Reach / Post',  value: '18.4K', vt: 'pos', prev: 'prev 17.0K',      delta: '↑ +8%',  dt: 'pos' },
              { label: 'Story Views',   value: '9,800', vt: 'pos', prev: 'prev 9,245',       delta: '↑ +6%',  dt: 'pos' },
              { label: 'Saves / Shares',value: '1,340', vt: 'pos', prev: 'tracking growth',  delta: '→ MoM',  dt: 'neu' },
            ]} />
          </Ch>
        </Side>

        {/* Facebook + Meama Corner — row 2 */}
        <Side>
          <Ch noMb>
            <ChHeader name="Facebook Ads" sub="Paid · Social" dot="#1A68CC" st="behind"
              status="↓ ROAS 2.8× vs ≥3×" />
            <MGrid cols={4} cells={[
              { label: 'ROAS',  value: '2.8×',  vt: 'neg', prev: 'prev 3.2× · target ≥3×', delta: '↓ –0.4× MoM',   dt: 'neg', bar: { w: '93%', bt: 'neg' }, primary: true },
              { label: 'CTR',   value: '1.4%',  vt: 'pos', prev: 'prev 1.6%',               delta: '↓ –0.2pp',      dt: 'neg' },
              { label: 'CPM',   value: '₾4.20', vt: 'pos', prev: 'prev ₾3.80',              delta: '↓ +₾0.40 (up)', dt: 'neg' },
              { label: 'Reach', value: '210K',  vt: 'pos', prev: 'prev 183K',               delta: '↑ +15%',        dt: 'pos' },
            ]} />
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
