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

// ── Employee Scoring tokens ─────────────────────────────────────────────────
type TierType = 'full' | 'three' | 'half' | 'zero' | 'track' | 'unassigned';

const TIER_BORDER: Record<TierType, string> = {
  full: '#1F9D52', three: '#16823F', half: '#C97E08',
  zero: '#9BA39C', track: '#D0D5D1', unassigned: '#D0D5D1',
};
const TIER_BADGE_BG: Record<TierType, string> = {
  full: '#1F9D52', three: '#E9F8EE', half: '#FFF6E6',
  zero: '#F5F7F5', track: '#ECEFEC', unassigned: '#ECEFEC',
};
const TIER_BADGE_CLR: Record<TierType, string> = {
  full: '#fff', three: '#16823F', half: '#C97E08',
  zero: '#9BA39C', track: '#727B73', unassigned: '#727B73',
};
const TIER_LABEL: Record<TierType, string> = {
  full: '≥100%', three: '80–99%', half: '60–79%',
  zero: '0–59%', track: 'Track', unassigned: 'Pending',
};

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

interface ScoringKpi {
  label: string; prev: string; actual: string;
  attainment: number | null; tier: TierType | null;
  trend: '↑' | '↓' | '→' | null; note?: string;
}
interface EmpData {
  name: string; channel: string; direction: 'sales' | 'comms';
  headlineLabel: string; headlinePrev: string; headlineActual: string;
  headlineAttainment: number | null; headlineTrend: '↑' | '↓' | '→' | null;
  tier: TierType; bonus: number | null; kpis: ScoringKpi[];
}

// ── Employee data (hardcoded — will wire to API) ────────────────────────────
const EMPLOYEES: EmpData[] = [
  {
    name: "ლუკა აკოფაშვილი", channel: "Ecommerce", direction: "sales",
    headlineLabel: "Net Revenue", headlinePrev: "₾265K", headlineActual: "₾149K",
    headlineAttainment: 52, headlineTrend: null, tier: 'zero', bonus: 0,
    kpis: [
      { label: 'New Customers',         prev: '807',      actual: '413',     attainment: 49,   tier: 'zero',  trend: '↓' },
      { label: 'Returning Revenue %',   prev: '56.8%',    actual: '63.9%',   attainment: 80,   tier: 'three', trend: '↑' },
      { label: 'Accessory Attach Rate', prev: '11.5%',    actual: '13.1%',   attainment: 95,   tier: 'three', trend: '↑' },
      { label: 'Cart Abandonment',      prev: '—',        actual: '83.5%',   attainment: 0,    tier: 'zero',  trend: null, note: 'target ≤70% — over' },
      { label: 'AOV',                   prev: '₾112.01',  actual: '₾108.26', attainment: null, tier: null,    trend: '↓' },
      { label: 'Capsule AOV',           prev: '₾100.71',  actual: '₾111.94', attainment: null, tier: null,    trend: '↑' },
      { label: 'Conversion Rate',       prev: '—',        actual: '1.49%',   attainment: null, tier: null,    trend: null, note: 'target ≥2.5%' },
      { label: 'Contribution Margin',   prev: '—',        actual: '—',       attainment: null, tier: null,    trend: null },
    ],
  },
  {
    name: "ნინი თოფურია", channel: "Brand Stores", direction: "sales",
    headlineLabel: "Revenue", headlinePrev: "₾226K", headlineActual: "₾157K",
    headlineAttainment: 67, headlineTrend: null, tier: 'half', bonus: 500,
    kpis: [
      { label: 'Accessory Attach Rate', prev: '5.42%',  actual: '5.66%',  attainment: 87,   tier: 'three', trend: '↑' },
      { label: 'Registered %',          prev: '84.3%',  actual: '73.5%',  attainment: null, tier: null,    trend: '↓' },
      { label: 'Avg Units / Txn',       prev: '9.49',   actual: '9.58',   attainment: null, tier: null,    trend: '↑', note: '≥2.2 met ✓' },
      { label: 'Capsule AOV',           prev: '₾64.78', actual: '₾74.54', attainment: null, tier: null,    trend: '↑' },
      { label: 'New Customers',         prev: '1,154',  actual: '582',    attainment: null, tier: null,    trend: '↓' },
    ],
  },
  {
    name: "ლიკა ჯუღაშვილი", channel: "Wholesale", direction: "sales",
    headlineLabel: "B2B Net Revenue", headlinePrev: "₾346K", headlineActual: "₾304K",
    headlineAttainment: 84, headlineTrend: null, tier: 'three', bonus: 750,
    kpis: [
      { label: 'Reorder Rate',    prev: '76.7%',  actual: '84.8%',  attainment: 120, tier: 'full',  trend: '↑', note: 'fixed ≥70%, capped' },
      { label: 'New Accounts',    prev: '71',     actual: '42',     attainment: 57,  tier: 'zero',  trend: '↓' },
      { label: 'AOV per Account', prev: '₾1,134', actual: '₾1,101', attainment: 94,  tier: 'three', trend: '↓' },
      { label: 'Gross Margin',    prev: '—',      actual: '—',      attainment: null, tier: null,   trend: null },
    ],
  },
  {
    name: "თიკა ბერუაშვილი", channel: "Call Sales", direction: "sales",
    headlineLabel: "Phone Revenue", headlinePrev: "₾51K", headlineActual: "₾58K",
    headlineAttainment: 104, headlineTrend: null, tier: 'full', bonus: 1000,
    kpis: [
      { label: 'Upsell Rate',           prev: '75.3%',   actual: '78.4%',  attainment: 120, tier: 'full',  trend: '↑', note: 'fixed ≥25%, capped' },
      { label: 'Phone AOV',             prev: '₾108.55', actual: '₾119.32',attainment: 120, tier: 'full',  trend: '↑', note: 'fixed ≥₾90, capped' },
      { label: 'New Customers Reached', prev: '320',     actual: '324',    attainment: 96,  tier: 'three', trend: '↑' },
      { label: 'Outbound Calls Made',   prev: '—',       actual: '—',      attainment: null, tier: null,   trend: null },
    ],
  },
  {
    name: "ბექა ჩერტკოევი", channel: "Dropper", direction: "sales",
    headlineLabel: "Caps / Machine / Day", headlinePrev: "26.0", headlineActual: "28.1",
    headlineAttainment: null, headlineTrend: '↑', tier: 'track', bonus: null,
    kpis: [
      { label: 'Active Machines', prev: '113',     actual: '113',     attainment: null, tier: null, trend: '→' },
      { label: 'Rev / Machine',   prev: '₾448.59', actual: '₾453.36', attainment: null, tier: null, trend: '↑' },
      { label: 'New Placements',  prev: '1',       actual: '1',       attainment: null, tier: null, trend: '→' },
      { label: 'Gross Margin',    prev: '—',       actual: '—',       attainment: null, tier: null, trend: null },
    ],
  },
  {
    name: "საბა გაბარაშვილი", channel: "TikTok", direction: "comms",
    headlineLabel: "Follower Growth Rate", headlinePrev: "+5.0%", headlineActual: "+3.2%",
    headlineAttainment: 64, headlineTrend: null, tier: 'half', bonus: 500,
    kpis: [
      { label: 'Platform data', prev: '—', actual: '—', attainment: null, tier: null, trend: null, note: 'Pending TikTok sync integration' },
    ],
  },
  {
    name: "TBD", channel: "Instagram", direction: "comms",
    headlineLabel: "—", headlinePrev: "—", headlineActual: "—",
    headlineAttainment: null, headlineTrend: null, tier: 'unassigned', bonus: null, kpis: [],
  },
  {
    name: "TBD", channel: "Facebook", direction: "comms",
    headlineLabel: "—", headlinePrev: "—", headlineActual: "—",
    headlineAttainment: null, headlineTrend: null, tier: 'unassigned', bonus: null, kpis: [],
  },
  {
    name: "ქეთა ტატიშვილი", channel: "Meama Corner", direction: "comms",
    headlineLabel: "Visitors / Interactions", headlinePrev: "1,192", headlineActual: "1,240",
    headlineAttainment: null, headlineTrend: '↑', tier: 'track', bonus: null,
    kpis: [
      { label: 'Visitors / Interactions', prev: '1,192', actual: '1,240', attainment: null, tier: null, trend: '↑' },
    ],
  },
  {
    name: "TBD", channel: "X", direction: "comms",
    headlineLabel: "—", headlinePrev: "—", headlineActual: "—",
    headlineAttainment: null, headlineTrend: null, tier: 'unassigned', bonus: null, kpis: [],
  },
];

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

// ── Scoring: direction section label ────────────────────────────────────────
function DirLabel({ text, first }: { text: string; first?: boolean }) {
  return (
    <div style={{
      fontFamily: UI, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '.08em', color: '#9BA39C',
      marginTop: first ? 0 : 20, marginBottom: 8,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {text}
      <div style={{ flex: 1, height: 1, background: '#E0E4E1' }} />
    </div>
  );
}

// ── Scoring: KPI detail row — purely informational, all muted ───────────────
function KpiDetailRow({ kpi }: { kpi: ScoringKpi }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 68px 68px 52px',
      gap: 8, alignItems: 'center',
      padding: '6px 14px', borderBottom: '1px solid #F5F7F5', fontSize: 11,
    }}>
      <div style={{ fontFamily: UI, color: '#727B73' }}>
        {kpi.label}
        {kpi.note && (
          <span style={{ fontSize: 10, color: '#9BA39C', fontStyle: 'italic', marginLeft: 5 }}>
            {kpi.note}
          </span>
        )}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: '#9BA39C', textAlign: 'right', fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
        {kpi.prev}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: '#525B53', textAlign: 'right', fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
        {kpi.actual}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: '#9BA39C', textAlign: 'right', fontStyle: 'italic', fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
        {kpi.attainment !== null ? `${kpi.attainment}%` : (kpi.trend ?? '—')}
      </div>
    </div>
  );
}

// ── Scoring: Employee row (compact, expandable) ─────────────────────────────
function EmployeeRow({ emp }: { emp: EmpData }) {
  const [open, setOpen] = useState(false);
  const isUnassigned = emp.tier === 'unassigned';
  const isTrack      = emp.tier === 'track';
  const bclr         = TIER_BORDER[emp.tier];
  const barW         = emp.headlineAttainment !== null ? `${Math.min(emp.headlineAttainment, 100)}%` : '0%';
  const attClr       = TIER_BORDER[emp.tier];

  return (
    <div style={{ opacity: isUnassigned ? 0.5 : 1, marginBottom: 4 }}>
      {/* Collapsed row — 7-column grid */}
      <div
        onClick={() => !isUnassigned && setOpen(o => !o)}
        style={{
          display: 'grid',
          gridTemplateColumns: '160px 140px 1fr 80px 110px 76px 48px',
          gap: 12, alignItems: 'center',
          background: '#fff', border: '1px solid #E0E4E1', borderLeft: `3px solid ${bclr}`,
          padding: '0 14px', height: 60,
          cursor: isUnassigned ? 'default' : 'pointer',
          userSelect: 'none' as const,
        }}
      >
        {/* Col 1: Name + channel */}
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontFamily: UI, fontSize: 13, fontWeight: 600, color: '#121712', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {emp.name}
          </div>
          <div style={{ fontFamily: UI, fontSize: 11, color: '#727B73', marginTop: 1 }}>{emp.channel}</div>
        </div>

        {/* Col 2: Headline KPI label + actual value */}
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontFamily: UI, fontSize: 9, fontWeight: 600, color: '#9BA39C', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ★ {emp.headlineLabel}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: '#121712', marginTop: 2, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
            {emp.headlineActual}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: '#9BA39C', marginTop: 1, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
            prev {emp.headlinePrev}
          </div>
        </div>

        {/* Col 3: Progress bar OR "tracking metric" text */}
        <div>
          {isTrack || isUnassigned ? (
            <div style={{ fontFamily: UI, fontSize: 11, color: '#9BA39C', fontStyle: 'italic' }}>
              {emp.headlineTrend ?? '→'} Growing — tracking metric
            </div>
          ) : (
            <div style={{ height: 4, background: '#ECEFEC' }}>
              <div style={{ height: '100%', width: barW, background: bclr }} />
            </div>
          )}
        </div>

        {/* Col 4: Attainment % */}
        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, textAlign: 'right', color: attClr, fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>
          {emp.headlineAttainment !== null ? `${emp.headlineAttainment}%` : ''}
        </div>

        {/* Col 5: Tier badge + "(headline KPI only)" note */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: UI, fontSize: 10, fontWeight: 700, padding: '3px 8px', display: 'inline-block', background: TIER_BADGE_BG[emp.tier], color: TIER_BADGE_CLR[emp.tier] }}>
            {TIER_LABEL[emp.tier]}
          </div>
          {!isTrack && !isUnassigned && (
            <div style={{ fontFamily: UI, fontSize: 9, color: '#9BA39C', fontStyle: 'italic', marginTop: 2 }}>
              (headline KPI only)
            </div>
          )}
        </div>

        {/* Col 6: Bonus */}
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, textAlign: 'right', fontFeatureSettings: '"tnum" 1, "lnum" 1', color: (emp.bonus ?? 0) > 0 ? '#16823F' : '#9BA39C' }}>
          {emp.bonus !== null
            ? (emp.bonus > 0 ? `₾${emp.bonus.toLocaleString()}` : '₾0')
            : <span style={{ fontSize: 11, fontStyle: 'italic', fontWeight: 400 }}>not scored</span>}
        </div>

        {/* Col 7: Chevron */}
        {!isUnassigned ? (
          <div style={{ textAlign: 'center', fontSize: 10, color: '#9BA39C', transition: 'transform 120ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▼
          </div>
        ) : (
          <div />
        )}
      </div>

      {/* Expanded detail — all muted, informational only */}
      {open && !isUnassigned && (
        <div style={{ background: '#FAFBFA', border: '1px solid #E0E4E1', borderTop: 'none', borderLeft: `3px solid ${bclr}` }}>
          <div style={{ padding: '7px 14px 5px', fontFamily: UI, fontSize: 10, color: '#9BA39C', fontStyle: 'italic', borderBottom: '1px solid #ECEFEC' }}>
            Other metrics — informational only, not part of bonus calculation
          </div>
          {emp.kpis.length > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 68px 68px 52px', gap: 8, padding: '4px 14px', fontFamily: UI, fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9BA39C', borderBottom: '1px solid #F5F7F5' }}>
                <span>KPI</span>
                <span style={{ textAlign: 'right' }}>Prev</span>
                <span style={{ textAlign: 'right' }}>Actual</span>
                <span style={{ textAlign: 'right' }}>Attain</span>
              </div>
              {emp.kpis.map((kpi, i) => <KpiDetailRow key={i} kpi={kpi} />)}
            </>
          ) : (
            <div style={{ padding: '8px 14px', fontFamily: UI, fontSize: 11, color: '#9BA39C' }}>No additional KPI data.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab type ─────────────────────────────────────────────────────────────────
type Tab = 'sales' | 'comms' | 'cx' | 'scoring';

// ── Main page ────────────────────────────────────────────────────────────────
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
  const wh = kpiData?.wholesale;
  const dr = kpiData?.dropper;

  const ecRev = metric('revenue', ec);
  const ecSt  = channelSt(ecRev.delta_pct);

  const bsRev = metric('revenue', bs);
  const bsSt  = channelSt(bsRev.delta_pct);

  const csRev = metric('revenue', cs);
  const csSt  = channelSt(csRev.delta_pct);

  // Ecommerce
  const ecRow1: McProps[] = [
    cell('Revenue',          ecRev,                          'currency', true,  { primary: true }),
    cell('Sessions',         metric('sessions', ec),         'number',   true),
    cell('Conversion Rate',  metric('conversion_rate', ec),  'pct',      true),
    cell('Cart Abandonment', metric('cart_abandon_rate', ec),'pct',      false),
    cell('Total AOV',        metric('aov', ec),              'currency', true),
    cell('New Customers',    metric('new_customers', ec),    'number',   true),
  ];
  const ecRow2: McProps[] = [
    cell('Accessory Attach Rate', metric('accessory_attach_rate', ec), 'pct', true),
    cell('Returning Revenue %',   metric('returning_revenue_pct', ec), 'pct', true),
    nullCell('Contribution Margin %'),
  ];

  // Brand Stores
  const bsRow: McProps[] = [
    cell('Revenue',             bsRev,                           'currency', true,  { primary: true }),
    nullCell('Footfall'),
    nullCell('Conversion Rate'),
    cell('AOV / Basket',        metric('aov', bs),               'currency', true),
    cell('Units / Transaction', metric('avg_units_per_txn', bs), 'number',   true),
    nullCell('Contribution Margin %'),
  ];

  // Call Sales
  const csRow1: McProps[] = [
    nullCell('Outbound Conversion'),
    nullCell('Calls Made'),
    cell('Phone Revenue', csRev, 'currency', true, { primary: true }),
  ];
  const csRow2: McProps[] = [
    cell('Phone AOV',             metric('aov', cs),         'currency', true),
    cell('Upsell Rate',           metric('upsell_rate', cs), 'pct',      true),
    cell('New Customers Reached', metric('new_customers', cs),'number',  true),
  ];

  // ── Wholesale (B2B) ──────────────────────────────────────────────────────
  const whRev = metric('revenue', wh);
  const whSt  = channelSt(whRev.delta_pct);

  const tgt = (c: McProps, t: string): McProps =>
    ({ ...c, prev: c.prev === '—' ? `target ${t}` : `${c.prev} · target ${t}` });
  const pendingCell = (label: string, target: string): McProps =>
    ({ label, value: '—', vt: 'pos', prev: `COGS pending · target ${target}`, delta: '', dt: 'neu' });

  const whRow1: McProps[] = [
    tgt(cell('B2B Net Revenue', whRev, 'currency', true, { primary: true }), '₾225K/mo'),
    cell('Active Accounts',     metric('active_accounts', wh), 'number', true),
    cell('New Accounts',        metric('new_accounts', wh),    'number', true),
    tgt(cell('Reorder Rate',    metric('reorder_rate', wh),    'pct',    true), '≥70%'),
  ];
  const whRow2: McProps[] = [
    cell('AOV per Account',           metric('aov_per_account', wh), 'currency', true),
    cell('AOV — Capsules Only',       metric('capsule_aov', wh),     'currency', true),
    cell('Order Frequency / Account', metric('order_frequency', wh), 'number',   true),
    pendingCell('Gross Margin on B2B', '≥25%'),
  ];

  // ── Dropper (Vending) ────────────────────────────────────────────────────
  const drCaps = metric('caps_per_machine_day', dr);
  const drSt   = channelSt(drCaps.delta_pct);

  const drRow1: McProps[] = [
    cell('Caps / Machine / Day', drCaps,                        'number', true, { primary: true }),
    cell('Active Machines',      metric('active_machines', dr), 'number', true),
    cell('New Placements',       metric('new_placements', dr),  'number', true),
  ];
  const drRow2: McProps[] = [
    cell('Revenue / Machine',   metric('rev_per_machine', dr), 'currency', true),
    cell('AOV — Capsule Price', metric('capsule_price', dr),   'currency', true),
    pendingCell('Gross Margin / Machine', '≥50%'),
  ];

  // ── Employee Scoring ─────────────────────────────────────────────────────
  const totalBonus = EMPLOYEES.reduce((s, e) => s + (e.bonus ?? 0), 0);

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
        <button style={tbtn('scoring')} onClick={() => setTab('scoring')}>
          Employee Scoring <span style={tcnt('scoring')}>10</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SALES TAB
          ══════════════════════════════════════════════════════════════ */}
      <div style={{ display: tab === 'sales' ? 'block' : 'none' }}>

        <Ch>
          <ChHeader name="Ecommerce" sub="D2C · Digital" dot="#1F9D52" st={ecSt.st} status={ecSt.status} />
          <MGrid cols={6} cells={ecRow1} />
          <MGrid cols={3} cells={ecRow2} />
        </Ch>

        <Ch>
          <ChHeader name="Brand Stores" sub="D2C · Retail" dot="#1F9D52" st={bsSt.st} status={bsSt.status} />
          <MGrid cols={6} cells={bsRow} />
        </Ch>

        <Ch>
          <ChHeader name="Wholesale" sub="B2B" dot="#C97E08" st={whSt.st} status={whSt.status} />
          <MGrid cols={4} cells={whRow1} />
          <MGrid cols={4} cells={whRow2} />
        </Ch>

        <Side>
          <Ch noMb>
            <ChHeader name="Dropper" sub="Vending · B2B" dot="#7C3AED" st={drSt.st} status={drSt.status} />
            <MGrid cols={3} cells={drRow1} />
            <MGrid cols={3} cells={drRow2} />
          </Ch>
          <Ch noMb>
            <ChHeader name="Call · Sales" sub="Outbound" dot="#1A68CC" st={csSt.st} status={csSt.status} />
            <MGrid cols={3} cells={csRow1} />
            <MGrid cols={3} cells={csRow2} />
          </Ch>
        </Side>

      </div>

      {/* ══════════════════════════════════════════════════════════════════
          COMMS TAB
          ══════════════════════════════════════════════════════════════ */}
      <div style={{ display: tab === 'comms' ? 'block' : 'none' }}>

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
            <ChHeader name="Meama Corner" sub="Offline · Retail" dot="#C97E08" st="track" status="↑ Tracking · +4% MoM" />
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

        <Ch>
          <ChHeader name="Call · Support" sub="Support" dot="#1F9D52" st="behind" status="↓ FCR 74% vs ≥80% · –4pp MoM" />
          <MGrid cols={5} cells={[
            { label: 'First Call Resolution', value: '74%',    vt: 'neg', prev: 'prev 78% · target ≥80%',     delta: '↓ –4pp MoM',   dt: 'neg', bar: { w: '93%', bt: 'neg' }, primary: true },
            { label: 'CSAT Score',            value: '3.9/5',  vt: 'neg', prev: 'prev 4.1/5 · target ≥4.2',  delta: '↓ –0.2',       dt: 'neg' },
            { label: 'Avg Handle Time',       value: '4m 12s', vt: 'neg', prev: 'prev 3m 54s',                delta: '↓ +18s worse', dt: 'neg' },
            { label: 'Response Time',         value: '2m 40s', vt: 'neg', prev: 'prev 2m 20s · target ≤2min', delta: '↓ +20s worse', dt: 'neg' },
            { label: 'Escalation Rate',       value: '13%',    vt: 'neg', prev: 'prev 10% · target ≤10%',     delta: '↓ +3pp worse', dt: 'neg' },
          ]} />
        </Ch>

        <Ch>
          <ChHeader name="Chat & Social DMs" sub="Digital Support" dot="#1A68CC" st="behind" status="↓ Response 1h24m vs ≤1hr" />
          <MGrid cols={4} cells={[
            { label: 'Response Time',   value: '1h 24m', vt: 'neg', prev: 'prev 58m · target ≤1hr',    delta: '↓ +26m worse', dt: 'neg', bar: { w: '100%', bt: 'neg' }, primary: true },
            { label: 'Resolution Rate', value: '79%',    vt: 'neg', prev: 'prev 85% · target ≥85%',    delta: '↓ –6pp',       dt: 'neg' },
            { label: 'CSAT Score',      value: '4.0/5',  vt: 'neg', prev: 'prev 4.2/5 · target ≥4.2', delta: '↓ –0.2',       dt: 'neg' },
            { label: 'Volume Handled',  value: '2,140',  vt: 'pos', prev: 'prev 1,982',                delta: '↑ +8%',        dt: 'pos' },
          ]} />
        </Ch>

      </div>

      {/* ══════════════════════════════════════════════════════════════════
          EMPLOYEE SCORING TAB
          ══════════════════════════════════════════════════════════════ */}
      <div style={{ display: tab === 'scoring' ? 'block' : 'none' }}>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em', color: '#121712' }}>
            Employee Scoring &amp; Bonus Pool
          </div>
          <div style={{ fontSize: 12, color: '#727B73', marginTop: 3 }}>
            June 2026 · Click a row to see every KPI · headline KPI drives bonus tier
          </div>
        </div>

        {/* Tier range bar */}
        <div style={{ display: 'flex', height: 28, border: '1px solid #E0E4E1', marginBottom: 20 }}>
          {[
            { label: '0–59% → ₾0',     bg: '#F5F7F5', color: '#9BA39C', w: '30%' },
            { label: '60–79% → ₾500',  bg: '#FFF6E6', color: '#C97E08', w: '20%' },
            { label: '80–99% → ₾750',  bg: '#E9F8EE', color: '#16823F', w: '20%' },
            { label: '≥100% → ₾1,000', bg: '#1F9D52', color: '#fff',    w: '30%' },
          ].map((seg, i, arr) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: MONO, fontSize: 10, fontWeight: 600,
              background: seg.bg, color: seg.color, width: seg.w,
              borderRight: i < arr.length - 1 ? '1px solid #E0E4E1' : 'none',
            }}>
              {seg.label}
            </div>
          ))}
        </div>

        <DirLabel text="Sales Direction" first />
        {EMPLOYEES.filter(e => e.direction === 'sales').map((emp, i) => (
          <EmployeeRow key={i} emp={emp} />
        ))}

        <DirLabel text="Communication Direction" />
        {EMPLOYEES.filter(e => e.direction === 'comms').map((emp, i) => (
          <EmployeeRow key={i} emp={emp} />
        ))}

        {/* Footer */}
        <div style={{ marginTop: 20, background: '#121712', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px' }}>
          <div style={{ fontFamily: UI, fontSize: 12, color: '#9BA39C' }}>
            Total bonus pool this month:{' '}
            <span style={{ fontFamily: MONO, fontSize: 15, color: '#fff', marginLeft: 6, fontWeight: 700 }}>
              ₾{totalBonus.toLocaleString()}
            </span>
          </div>
          <div style={{ fontFamily: UI, fontSize: 11, color: '#9BA39C' }}>
            {EMPLOYEES.filter(e => e.tier === 'unassigned').length} positions pending assignment
          </div>
        </div>

      </div>

    </div>
  );
}
