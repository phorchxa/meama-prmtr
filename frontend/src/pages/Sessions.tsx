import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "./PageHeader";
import {
  fetchAbandonmentData,
  fetchSessionsOverview,
  type AbandonmentData,
  type Range,
  type SessionsOverview,
} from "../lib/sessionsApi";

// ── Design tokens (prototype palette) ──────────────────────────────
const C = {
  bg: "#F5F7F5",      // gray-50 canvas
  card: "#FFFFFF",    // gray-0 surface
  line: "#E0E4E1",    // gray-200 border
  lineSoft: "#ECEFEC",// gray-100 divider
  ink: "#121712",     // gray-900 text
  muted: "#9BA39C",   // gray-400
  muted2: "#727B73",  // gray-500
  green: "#16823F",   // green-600
  greenBg: "#E9F8EE", // green-50
  greenBar: "#1F9D52",// green-500
  amber: "#C97E08",   // warning-600
  amberBar: "#F5A314",// warning-500
  red: "#CC2E33",     // danger-600
  redBg: "#FDECEC",   // danger-50
  chipLine: "#CBD1CC",// gray-300
};

// ── Helpers ──────────────────────────────────────────────────────────
function fmtDur(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtGEL(v: number): string {
  if (v >= 1000) return `₾${(v / 1000).toFixed(0)}k`;
  return `₾${v.toFixed(0)}`;
}

function relTime(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function chLabel(ch: string): string {
  const m: Record<string, string> = {
    direct: "Direct",
    organic_search: "Organic Search",
    paid: "Paid",
    organic_social: "Organic Social",
    email: "Email / Referral",
    referral: "Email / Referral",
    unknown: "Other",
  };
  return m[ch] ?? ch;
}

const FUNNEL_COLORS = [C.greenBar, "#3DAE68", "#6FCB90", C.amberBar, "#EF6820", C.green];
const CHANNEL_COLORS = [C.amberBar, C.greenBar, "#2E84F0", "#3DAE68", "#EF6820", C.muted2];

// ── Components ────────────────────────────────────────────────────────

function Sec({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 0 }} className="p-5 mb-5">
      <div className="flex justify-between items-baseline mb-4">
        <h2 style={{ color: C.ink }} className="text-[15px] font-semibold m-0">{title}</h2>
        {meta && <span style={{ color: C.muted }} className="font-mono text-[10px] tracking-[.13em] uppercase">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: C.muted }} className="block font-mono text-[9.5px] tracking-[.13em] uppercase mb-[5px]">
      {children}
    </span>
  );
}

function KpiBox({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div style={{ background: C.card, borderRight: `1px solid ${C.line}` }} className="px-[18px] py-[18px] last:border-r-0">
      <div style={{ color: C.ink }} className="text-[26px] font-bold tracking-[-0.01em] leading-none">
        {value}
        {sub && <small style={{ color: C.muted2 }} className="text-[14px] font-semibold ml-[2px]">{sub}</small>}
      </div>
      <Lbl>{label}</Lbl>
    </div>
  );
}

function HBar({ pct, color, height = 22 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: C.lineSoft, borderRadius: 0, overflow: "hidden" }}>
      <span style={{ display: "block", height: "100%", width: `${Math.max(pct * 100, 2)}%`, background: color, transition: "width .4s ease" }} />
    </div>
  );
}

function SegPill({ label, color, value }: { label: string; color: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center" style={{ color: C.muted2, fontSize: 13 }}>
      <span className="flex items-center gap-2">
        <span style={{ width: 9, height: 9, borderRadius: 0, background: color, display: "inline-block" }} />
        {label}
      </span>
      <b style={{ color: C.ink }}>{value}</b>
    </div>
  );
}

function Callout({ children, variant = "red" }: { children: React.ReactNode; variant?: "red" | "green" }) {
  const isGreen = variant === "green";
  return (
    <div style={{
      borderLeft: `3px solid ${isGreen ? C.green : C.red}`,
      background: isGreen ? C.greenBg : C.redBg,
      borderRadius: 0,
      padding: "12px 14px",
      fontSize: 13,
      marginTop: 14,
      color: C.muted2,
    }}>
      {children}
    </div>
  );
}

function RankRow({ name, count, max, color = C.amber }: { name: string; count: number; max: number; color?: string }) {
  return (
    <div className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr 64px" }}>
      <div>
        <div style={{ fontSize: 13, color: C.ink }}>{name}</div>
        <div style={{ height: 6, background: C.lineSoft, borderRadius: 0, marginTop: 4, overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${(count / max) * 100}%`, background: color }} />
        </div>
      </div>
      <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11, color: C.muted2 }}>
        {fmtNum(count)}
      </span>
    </div>
  );
}

type SegPill2Props = { label: string; tone: "atrisk" | "never" | "queued" | "plain" };
function Pill2({ label, tone }: SegPill2Props) {
  const styles: Record<string, React.CSSProperties> = {
    atrisk: { borderColor: "#FBD9C4", color: "#EF6820", background: "#FDEEE4" },
    never:  { borderColor: "#CBD1CC", color: C.muted2 },
    queued: { borderColor: "#A5E2BB", color: C.green, background: C.greenBg },
    plain:  { borderColor: C.chipLine, color: C.muted2 },
  };
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: ".04em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 0, border: `1px solid`, display: "inline-block", ...styles[tone] }}>
      {label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function Sessions() {
  const [range, setRange] = useState<Range>("30d");
  const [overview, setOverview] = useState<SessionsOverview | null>(null);
  const [abandonment, setAbandonment] = useState<AbandonmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchSessionsOverview(range), fetchAbandonmentData(range)])
      .then(([ov, ab]) => { setOverview(ov); setAbandonment(ab); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [range]);

  const rangeLabel = range === "today" ? "today" : range === "7d" ? "last 7 days" : "last 30 days";

  return (
    <div>
      <PageHeader
        kicker="07 · Sessions"
        title="Sessions & Abandonment"
        subtitle="Live on-site behavior — registered customers and anonymous visitors."
      />

      {/* Range toggle */}
      <div className="flex justify-end mb-5">
        <div style={{ display: "inline-flex", background: C.card, border: `1px solid ${C.line}`, borderRadius: 0, overflow: "hidden" }}>
          {(["today", "7d", "30d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                fontFamily: "monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase",
                color: range === r ? "#fff" : C.muted2,
                background: range === r ? C.ink : "none",
                border: "none", borderRight: `1px solid ${C.line}`, padding: "9px 15px", cursor: "pointer",
              }}
              className="last:border-r-0"
            >
              {r === "today" ? "Today" : r === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 0, padding: "12px 16px", color: C.red, marginBottom: 20 }}>
          Error: {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: C.amberBar }} />
        </div>
      )}

      {!loading && overview && (
        <>
          {/* KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", background: C.line, border: `1px solid ${C.line}`, borderRadius: 0, overflow: "hidden", marginBottom: 20 }}>
            <KpiBox label="Sessions" value={fmtNum(overview.kpis.sessions)} />
            <KpiBox label="Unique visitors" value={fmtNum(overview.kpis.unique_visitors)} />
            <KpiBox label="Registered share" value={Math.round(overview.kpis.registered_share * 100)} sub="%" />
            <KpiBox label="Conversion rate" value={(overview.kpis.conversion_rate * 100).toFixed(1)} sub="%" />
            <KpiBox label="Avg duration" value={fmtDur(overview.kpis.avg_duration_seconds)} />
            <KpiBox label="Engaged sessions" value={Math.round(overview.kpis.engaged_pct * 100)} sub="%" />
            <KpiBox label="Bounce rate" value={overview.kpis.bounce_rate_pct.toFixed(1)} sub="%" />
            <KpiBox label="New · Returning" value={`${fmtNum(overview.kpis.new_visitors)} · ${fmtNum(overview.kpis.returning_visitors)}`} />
          </div>

          {/* Row 1: funnel + who */}
          <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: "1.35fr 1fr" }}>
            {/* Funnel */}
            <Sec title="Conversion funnel" meta={rangeLabel}>
              <div className="flex flex-col gap-[9px]">
                {overview.funnel.map((row, i) => (
                  <div key={row.label} className="grid items-center gap-3" style={{ gridTemplateColumns: "150px 1fr 90px" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: C.muted2 }}>
                      {row.label}
                    </span>
                    <HBar pct={row.pct} color={FUNNEL_COLORS[i] ?? C.muted2} />
                    <span style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: C.ink }}>
                      {fmtNum(row.count)}
                      <small style={{ display: "block", fontFamily: "monospace", fontSize: "9.5px", color: C.muted, fontWeight: 400 }}>
                        {fmtPct(row.pct)}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
              {overview.funnel.length >= 3 && (
                <Callout>
                  <b style={{ color: C.ink }}>Biggest leak: Add to cart → Checkout.</b> The largest recoverable pool — sessions that carted but never started checkout.
                </Callout>
              )}
            </Sec>

            {/* Who is browsing */}
            <Sec title="Who is browsing" meta={rangeLabel}>
              {(() => {
                const total = overview.who.registered + overview.who.anonymous;
                const regPct = total ? overview.who.registered / total : 0;
                return (
                  <>
                    <div style={{ height: 14, borderRadius: 0, display: "flex", overflow: "hidden", marginBottom: 14 }}>
                      <i style={{ display: "block", height: "100%", width: `${regPct * 100}%`, background: C.greenBar }} />
                      <i style={{ display: "block", height: "100%", flex: 1, background: "#CBD1CC" }} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <SegPill label="Registered (linked to customer)" color={C.greenBar} value={fmtNum(overview.who.registered)} />
                      <SegPill label="Anonymous (aggregate only)" color="#CBD1CC" value={fmtNum(overview.who.anonymous)} />
                    </div>
                    <Callout>
                      <b style={{ color: C.ink }}>{fmtNum(overview.who.warm)} registered customers browsing, not buying.</b> Includes never-ordered registrants — the warm pool for re-engagement.
                    </Callout>
                  </>
                );
              })()}
            </Sec>
          </div>

          {/* Row 2: top products / categories / gap */}
          <Sec title="What they view — to the SKU" meta={`product_viewed · ${rangeLabel}`}>
            <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              {/* Top products */}
              <div>
                <Lbl>Top viewed products</Lbl>
                <div className="flex flex-col gap-[9px]">
                  {overview.top_products.map((p) => (
                    <RankRow key={p.sku || p.name} name={p.name} count={p.count}
                      max={overview.top_products[0]?.count || 1} color={C.greenBar} />
                  ))}
                  {!overview.top_products.length && <span style={{ color: C.muted, fontSize: 13 }}>No data yet</span>}
                </div>
              </div>

              {/* Top categories */}
              <div>
                <Lbl>Top categories</Lbl>
                <div className="flex flex-col gap-[9px]">
                  {overview.top_categories.map((c) => (
                    <RankRow key={c.name} name={c.name} count={c.count}
                      max={overview.top_categories[0]?.count || 1} color={C.amberBar} />
                  ))}
                  {!overview.top_categories.length && <span style={{ color: C.muted, fontSize: 13 }}>No data yet</span>}
                </div>
              </div>

              {/* Viewed not bought */}
              <div>
                <Lbl>Viewed, not bought · gap</Lbl>
                <div className="flex flex-col gap-[9px]">
                  {overview.viewed_not_bought.map((p) => (
                    <RankRow key={p.sku || p.name} name={p.name} count={p.count}
                      max={overview.viewed_not_bought[0]?.count || 1} color={C.red} />
                  ))}
                  {!overview.viewed_not_bought.length && <span style={{ color: C.muted, fontSize: 13 }}>No gap detected</span>}
                </div>
              </div>
            </div>
          </Sec>

          {/* Row 3: channel + device/region */}
          <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: "1.35fr 1fr" }}>
            <Sec title="Acquisition channel" meta={`sessions · ${rangeLabel}`}>
              <div className="flex flex-col gap-3">
                {overview.channels.map((ch, i) => (
                  <div key={ch.channel} className="grid items-center gap-[10px]" style={{ gridTemplateColumns: "130px 1fr 48px" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "10.5px", letterSpacing: ".05em", textTransform: "uppercase", color: C.muted2 }}>
                      {chLabel(ch.channel)}
                    </span>
                    <HBar pct={ch.pct} color={CHANNEL_COLORS[i] ?? C.muted2} height={14} />
                    <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11, color: C.muted2 }}>
                      {fmtPct(ch.pct)}
                    </span>
                  </div>
                ))}
              </div>
            </Sec>

            <Sec title="Device & region" meta="geo · self-hosted">
              {(() => {
                const mobile = overview.devices.find(d => d.device_type === "mobile");
                const mPct = mobile ? Math.round(mobile.pct * 100) : 0;
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div><Lbl>Mobile</Lbl><span style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{mPct}%</span></div>
                      <div><Lbl>Desktop / tablet</Lbl><span style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{100 - mPct}%</span></div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {overview.geo.map((g, i) => (
                        <div key={g.location} className="grid items-center gap-[10px]" style={{ gridTemplateColumns: "130px 1fr 48px" }}>
                          <span style={{ fontFamily: "monospace", fontSize: "10.5px", letterSpacing: ".05em", textTransform: "uppercase", color: C.muted2 }}>
                            {g.location}
                          </span>
                          <HBar pct={g.pct} color={CHANNEL_COLORS[i] ?? C.muted2} height={14} />
                          <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11, color: C.muted2 }}>
                            {fmtPct(g.pct)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </Sec>
          </div>
        </>
      )}

      {/* ── Abandonment ── */}
      {!loading && abandonment && (
        <>
          {/* Abandonment KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", background: C.line, border: `1px solid ${C.line}`, borderRadius: 0, overflow: "hidden", marginBottom: 20 }}>
            <KpiBox label="Cart abandonment" value={Math.round(abandonment.kpis.cart_abandonment_rate * 100)} sub="%" />
            <KpiBox label="Checkout abandonment" value={Math.round(abandonment.kpis.checkout_abandonment_rate * 100)} sub="%" />
            <KpiBox label={`Recoverable carts · ${rangeLabel}`} value={fmtNum(abandonment.kpis.recoverable_carts)} />
            <KpiBox label="Recoverable value" value={fmtGEL(abandonment.kpis.recoverable_value)} />
          </div>

          {/* Abandonment by stage + source */}
          <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: "1.35fr 1fr" }}>
            <Sec title="Where carts are abandoned" meta="by furthest stage">
              <div className="flex flex-col gap-3">
                {(() => {
                  const max = Math.max(...abandonment.by_stage.map(s => s.count), 1);
                  return abandonment.by_stage.map((s, i) => (
                    <div key={s.stage} className="grid items-center gap-[10px]" style={{ gridTemplateColumns: "160px 1fr 48px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "10.5px", textTransform: "uppercase", color: C.muted2 }}>{s.stage}</span>
                      <HBar pct={s.count / max} color={[C.amberBar, "#F5A314", "#EF6820", C.red][i] ?? C.red} height={18} />
                      <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11, color: C.muted2 }}>{s.count}</span>
                    </div>
                  ));
                })()}
              </div>
              {abandonment.by_stage.some(s => s.stage_num >= 6) && (
                <Callout>
                  <b style={{ color: C.ink }}>Reached payment and dropped.</b> Highest intent, highest ROI — the primary win-back trigger fires here.
                </Callout>
              )}
            </Sec>

            <Sec title="Source" meta="combined">
              {(() => {
                const total = abandonment.source.shopify_abandoned + abandonment.source.live_pixel;
                const shopifyPct = total ? abandonment.source.shopify_abandoned / total : 0;
                return (
                  <>
                    <div style={{ height: 14, borderRadius: 0, display: "flex", overflow: "hidden", marginBottom: 14 }}>
                      <i style={{ display: "block", height: "100%", width: `${shopifyPct * 100}%`, background: C.amberBar }} />
                      <i style={{ display: "block", height: "100%", flex: 1, background: "#3DAE68" }} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <SegPill label="Shopify abandoned checkout (email)" color={C.amberBar} value={abandonment.source.shopify_abandoned} />
                      <SegPill label="Live pixel (earlier stages)" color="#3DAE68" value={abandonment.source.live_pixel} />
                    </div>
                    <p style={{ fontFamily: "monospace", fontSize: 10, color: C.muted2, marginTop: 14 }}>
                      Existing <b>georgia_abandoned_carts</b> + live <b>checkout_started</b> abandonment, deduped by client/session.
                    </p>
                  </>
                );
              })()}
            </Sec>
          </div>

          {/* Recoverable carts table */}
          <Sec title="Recoverable carts" meta="most valuable first">
            {abandonment.recoverable.length === 0 ? (
              <p style={{ color: C.muted, fontSize: 13 }}>No recoverable carts in this period.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Customer", "Segment", "Stage reached", "Cart", "Last seen", "Source"].map(h => (
                      <th key={h} style={{ fontFamily: "monospace", fontSize: "9.5px", letterSpacing: ".12em", textTransform: "uppercase", color: C.muted, textAlign: "left", fontWeight: 500, padding: "0 10px 10px", borderBottom: `1px solid ${C.line}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {abandonment.recoverable.map((cart, i) => (
                    <tr key={`${cart.customer_id}-${i}`}>
                      <td style={{ padding: "11px 10px", borderBottom: `1px solid ${C.lineSoft}`, verticalAlign: "middle" }}>
                        {cart.customer_id ? (
                          <Link to={`/portfolios/${cart.customer_id}`} style={{ color: C.ink, fontWeight: 500 }}>
                            {cart.full_name || `#${cart.customer_id}`}
                          </Link>
                        ) : (
                          <span style={{ color: C.ink, fontWeight: 500 }}>{cart.email || "Anonymous"}</span>
                        )}
                        {cart.email && <div style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>{cart.email}</div>}
                      </td>
                      <td style={{ padding: "11px 10px", borderBottom: `1px solid ${C.lineSoft}`, verticalAlign: "middle" }}>
                        {cart.segment
                          ? <Pill2 label={cart.segment.replace(/_/g, " ")} tone={cart.segment === "at_risk" ? "atrisk" : "plain"} />
                          : <Pill2 label="Unknown" tone="never" />}
                      </td>
                      <td style={{ padding: "11px 10px", borderBottom: `1px solid ${C.lineSoft}`, fontWeight: 600 }}>{cart.stage}</td>
                      <td style={{ padding: "11px 10px", borderBottom: `1px solid ${C.lineSoft}`, fontWeight: 700 }}>₾{cart.cart_value.toFixed(0)}</td>
                      <td style={{ padding: "11px 10px", borderBottom: `1px solid ${C.lineSoft}` }}>{relTime(cart.last_seen)}</td>
                      <td style={{ padding: "11px 10px", borderBottom: `1px solid ${C.lineSoft}` }}>
                        <Pill2 label={cart.products.length ? "Live pixel" : "Shopify"} tone="queued" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Sec>
        </>
      )}
    </div>
  );
}
