import { useEffect, useState } from "react";

import {
  fetchSocialKpisOverview,
  type KpiMetric,
  type MetricStatus,
  type SocialKpisInstagram,
  type SocialKpisOverview,
  type SocialKpisTikTok,
} from "../lib/api";

/* ── design tokens ──────────────────────────────────────────────────────────
   bg #0a0a0a · card #111 · border #1e1e1e
   gold #C8963E · green #2D6A4F · red #C0392B · amber #B87333
   muted #6B6B6B · surface2 #161616
   ─────────────────────────────────────────────────────────────────────── */
const GOLD   = "#C8963E";
const GREEN  = "#2D6A4F";
const RED    = "#C0392B";
const AMBER  = "#B87333";
const MUTED  = "#6B6B6B";
const DASH   = "–";

/* ── formatters ─────────────────────────────────────────────────────────── */
const nf    = new Intl.NumberFormat("en-US");
const fmt   = (v: number | null | undefined) => v == null ? DASH : nf.format(Math.round(v));
const fmtK  = (v: number | null | undefined) => {
  if (v == null) return DASH;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return nf.format(Math.round(v));
};
const fmtPct = (v: number | null | undefined, sign = false) =>
  v == null ? DASH : `${sign && v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/* ── Sparkline ──────────────────────────────────────────────────────────── */
function Spark({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;
  const W = 64; const H = 24;
  const min = Math.min(...data); const max = Math.max(...data);
  const span = max - min || 1;
  const sx = W / (data.length - 1);
  const pts = data.map((v, i) =>
    `${(i * sx).toFixed(1)},${(H - ((v - min) / span) * (H - 4) - 2).toFixed(1)}`
  ).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={GOLD} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Status dot ─────────────────────────────────────────────────────────── */
function Dot({ good }: { good: boolean | null }) {
  const bg = good === null ? "#2e2e2e" : good ? GREEN : RED;
  return <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ background: bg }} />;
}

/* ── Cadence badge ──────────────────────────────────────────────────────── */
function Badge({ label, amber }: { label: string; amber?: boolean }) {
  return (
    <span className="rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
      style={{ background: amber ? "#1c1100" : "#1a1a1a", color: amber ? AMBER : MUTED }}>
      {label}
    </span>
  );
}

/* ── Metric value display (handles all status states) ───────────────────── */
function MetricVal({
  metric,
  render,
  good,
}: {
  metric: KpiMetric;
  render: (v: number) => string;
  good?: boolean | null;
}) {
  const st = metric.status as MetricStatus;

  if (st === "insufficient_history") {
    return (
      <div className="flex flex-col gap-1">
        <span className="rounded px-2 py-0.5 text-[10px] font-semibold inline-flex items-center gap-1"
          style={{ background: "#1c1100", color: AMBER }}>
          ⏳ Insufficient history
        </span>
        {metric.note && (
          <p className="text-[9px] leading-tight" style={{ color: MUTED }}>{metric.note}</p>
        )}
      </div>
    );
  }

  if (st === "not_available") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] italic" style={{ color: MUTED }}>Not available</span>
        {metric.note && (
          <p className="text-[9px] leading-tight" style={{ color: "#444" }}>{metric.note}</p>
        )}
      </div>
    );
  }

  if (st === "no_data" || metric.value == null) {
    return <span className="text-sm font-semibold tabular-nums" style={{ color: MUTED }}>{DASH}</span>;
  }

  const displayGood = good !== undefined ? good : null;
  const color = displayGood === null ? "#e5e5e5" : displayGood ? "#e5e5e5" : RED;

  return (
    <div className="flex items-center gap-1.5">
      <Dot good={displayGood} />
      <span className="text-sm font-semibold tabular-nums" style={{ color }}>{render(metric.value)}</span>
    </div>
  );
}

/* ── Primary KPI block ──────────────────────────────────────────────────── */
function PrimaryKpi({
  label, metric, render, threshold, cadence,
}: {
  label: string;
  metric: KpiMetric;
  render: (v: number) => string;
  threshold?: number;
  cadence: string;
}) {
  const good = metric.status === "ok" && metric.value != null && threshold != null
    ? metric.value >= threshold : null;

  return (
    <div className="rounded-lg p-3" style={{ background: "#161616", border: "1px solid #2a2a2a" }}>
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ color: GOLD }} className="text-[11px]">★</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white">{label}</span>
      </div>
      <div className="mb-2">
        {metric.status === "ok" && metric.value != null ? (
          <div className="text-2xl font-bold tabular-nums" style={{ color: good === false ? RED : "#fff" }}>
            {render(metric.value)}
          </div>
        ) : (
          <MetricVal metric={metric} render={render} good={null} />
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        {threshold != null && (
          <span className="text-[10px]" style={{ color: MUTED }}>≥ {render(threshold)}</span>
        )}
        <Badge label={cadence} />
      </div>
    </div>
  );
}

/* ── Secondary metric row ───────────────────────────────────────────────── */
function MetricRow({
  label, metric, render, target, cadence, good, spark,
}: {
  label: string;
  metric: KpiMetric;
  render: (v: number) => string;
  target?: string;
  cadence: string;
  good?: boolean | null;
  spark?: number[];
}) {
  return (
    <div className="py-2.5" style={{ borderBottom: "1px solid #1a1a1a" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-[11px] text-white block leading-tight truncate">{label}</span>
          {target && (
            <span className="text-[9px]" style={{ color: MUTED }}>{target}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {spark && spark.length > 1 && <Spark data={spark} />}
          <div className="text-right min-w-[56px]">
            <MetricVal metric={metric} render={render} good={good} />
            <Badge label={cadence} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Connected platform card ────────────────────────────────────────────── */
function ConnectedCard({
  category, name, dot, primary, children,
}: {
  category: string;
  name: string;
  dot: string;
  primary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden h-full"
      style={{ background: "#111", border: "1px solid #1e1e1e" }}>
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #1e1e1e" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: dot }} />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
            {category}
          </span>
        </div>
        <h2 className="text-lg font-bold tracking-tight text-white leading-none">{name}</h2>
      </div>
      <div className="flex flex-col flex-1 px-4 pb-4">
        <div className="mt-3">{primary}</div>
        <div className="mt-1 flex-1">{children}</div>
      </div>
    </div>
  );
}

/* ── Not-connected platform card ────────────────────────────────────────── */
function NotConnectedCard({
  category, name, dot, metrics, note,
}: {
  category: string;
  name: string;
  dot: string;
  metrics: string[];
  note?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden h-full"
      style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}>
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #1a1a1a" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: dot }} />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>
            {category}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight" style={{ color: "#444" }}>{name}</h2>
          <span className="rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ background: "#1a1a1a", color: MUTED }}>
            Not connected
          </span>
        </div>
      </div>
      <div className="flex flex-col flex-1 px-4 pb-4">
        {note && (
          <p className="mt-3 mb-2 text-[10px] leading-snug rounded-lg px-3 py-2"
            style={{ background: "#161616", color: "#555", border: "1px solid #222" }}>
            {note}
          </p>
        )}
        <div className="mt-1">
          {metrics.map((m) => (
            <div key={m} className="py-2.5 flex items-center justify-between"
              style={{ borderBottom: "1px solid #161616" }}>
              <span className="text-[11px]" style={{ color: "#3a3a3a" }}>{m}</span>
              <span className="text-[11px]" style={{ color: "#2a2a2a" }}>—</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── TikTok card builder ────────────────────────────────────────────────── */
function TikTokCard({ t }: { t: SocialKpisTikTok }) {
  return (
    <ConnectedCard
      category="Short Video"
      name="TikTok"
      dot="#e5e5e5"
      primary={
        <PrimaryKpi
          label="Follower Growth Rate"
          metric={t.follower_growth_rate}
          render={(v) => fmtPct(v, true)}
          threshold={5}
          cadence="Monthly"
        />
      }
    >
      <MetricRow label="Total Followers"    metric={t.followers_total}   render={(v) => fmt(v)}           target="Grow"     cadence="Monthly" />
      <MetricRow label="Engagement Rate"    metric={t.engagement_rate}   render={(v) => fmtPct(v)}        target="≥ 4%"     cadence="Weekly"
        good={t.engagement_rate.status === "ok" && t.engagement_rate.value != null ? t.engagement_rate.value >= 4 : null} />
      <MetricRow label="Reach / Impressions" metric={t.reach}            render={(v) => fmtK(v)}          target="Grow"     cadence="Weekly" />
      <MetricRow label="Share / Duet Rate"  metric={t.share_rate}        render={(v) => fmtPct(v)}        target="Grow"     cadence="Weekly" />
      <MetricRow label="FYP Rate"           metric={t.fyp_rate}          render={(v) => fmtPct(v)}        target="Grow"     cadence="Weekly" />
      <MetricRow
        label="Content Cadence"
        metric={{ value: t.cadence_per_week, status: t.cadence_per_week != null ? "ok" : "no_data", note: null }}
        render={(v) => `${v.toFixed(1)}/wk`}
        target="Last 6 wks"
        cadence="Weekly"
        spark={t.cadence_weekly}
      />
    </ConnectedCard>
  );
}

/* ── Instagram card builder ─────────────────────────────────────────────── */
function InstagramCard({ ig }: { ig: SocialKpisInstagram }) {
  return (
    <ConnectedCard
      category="Photo · Reels"
      name="Instagram"
      dot="#7C3AED"
      primary={
        <PrimaryKpi
          label="Follower Growth Rate"
          metric={ig.follower_growth_rate}
          render={(v) => fmtPct(v, true)}
          threshold={5}
          cadence="Monthly"
        />
      }
    >
      <MetricRow label="Total Followers"  metric={ig.followers_total}  render={(v) => fmt(v)}    target="Grow"     cadence="Monthly" />
      <MetricRow label="Engagement Rate"  metric={ig.engagement_rate}  render={(v) => fmtPct(v)} target="≥ 4%"     cadence="Weekly"
        good={ig.engagement_rate.status === "ok" && ig.engagement_rate.value != null ? ig.engagement_rate.value >= 4 : null} />
      <MetricRow label="Reach (30d)"      metric={ig.reach_30d}        render={(v) => fmtK(v)}   target="Grow"     cadence="Monthly"
        spark={ig.reach_30d.status === "ok" ? undefined : undefined} />
      <MetricRow label="Impressions (30d)" metric={ig.impressions_30d} render={(v) => fmtK(v)}   target="Grow"     cadence="Monthly" />
      <MetricRow label="Saves / Post"     metric={ig.saves_per_post}   render={(v) => v.toFixed(1)} target="Grow"  cadence="Weekly" />
      <MetricRow label="Reels Plays"      metric={ig.reels_plays}      render={(v) => fmtK(v)}   target="Grow"     cadence="Weekly" />
      <MetricRow
        label="Content Cadence"
        metric={{ value: ig.cadence_per_week, status: ig.cadence_per_week != null ? "ok" : "no_data", note: null }}
        render={(v) => `${v.toFixed(1)}/wk`}
        target="Last 6 wks"
        cadence="Weekly"
        spark={ig.cadence_weekly}
      />
    </ConnectedCard>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export default function SocialKpis() {
  const [data, setData]   = useState<SocialKpisOverview | null>(null);
  const [err,  setErr]    = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSocialKpisOverview(30)
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : "Load failed"); });
    return () => { alive = false; };
  }, []);

  const loading = !data && !err;

  return (
    <div className="-mx-6 -my-10 min-h-screen px-6 py-10" style={{ background: "#0a0a0a" }}>
      <div className="mx-auto max-w-[1600px]">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="mb-8 rounded-xl px-6 py-5" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
          <span className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: GOLD }}>
            Communication Direction
          </span>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white">
            Audience Growth · Engagement · Reach
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed" style={{ color: MUTED }}>
            Measured on brand building — audience size, growth rate, content quality.
            Not connected to sales. Times in Asia/Tbilisi (GMT+4).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Follower Growth", "Engagement Rate", "Reach"].map((l) => (
              <span key={l} className="rounded-full px-3 py-1 text-[11px] font-medium"
                style={{ background: "#1a1a1a", color: "#d4d4d4", border: "1px solid #2a2a2a" }}>
                {l}
              </span>
            ))}
          </div>
          {err && (
            <p className="mt-3 rounded-lg px-4 py-2 text-sm" style={{ background: "#1a0a0a", border: "1px solid #3a1a1a", color: RED }}>
              Could not load: {err}
            </p>
          )}
        </header>

        {/* ── Loading skeletons ──────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[540px] animate-pulse rounded-xl" style={{ background: "#111", border: "1px solid #1e1e1e" }} />
            ))}
          </div>
        )}

        {/* ── Platform grid ─────────────────────────────────────────── */}
        {data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">

            {/* TikTok */}
            <TikTokCard t={data.tiktok} />

            {/* Instagram */}
            <InstagramCard ig={data.instagram} />

            {/* Facebook — not connected */}
            <NotConnectedCard
              category="Page · Organic"
              name="Facebook"
              dot="#1A68CC"
              note={data.facebook.note}
              metrics={[
                "Page Follower Growth",
                "Total Page Followers",
                "Organic Reach",
                "Engagement Rate",
                "Post Impressions",
                "Video Views (3s+)",
              ]}
            />

            {/* Meama Corner — no data source */}
            <NotConnectedCard
              category="Community"
              name="Meama Corner"
              dot={AMBER}
              note={data.meama_corner.note}
              metrics={[
                "Member Growth Rate",
                "Total Members",
                "Active Member Rate (30d)",
                "Engagement per Post",
                "Quiz / Activity Participation",
                "Member Retention Rate",
              ]}
            />

            {/* X — no data source */}
            <NotConnectedCard
              category="Short Text"
              name="X"
              dot="#e5e5e5"
              note={data.x_twitter.note}
              metrics={[
                "Follower Growth Rate",
                "Total Followers",
                "Engagement Rate",
                "Impressions / Reach",
                "Retweet / Quote Rate",
              ]}
            />
          </div>
        )}

        {/* ── Follow-up items ────────────────────────────────────────── */}
        {data && (
          <div className="mt-8 rounded-xl px-5 py-4" style={{ background: "#0d0d0d", border: "1px solid #1a1a1a" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: AMBER }}>
              Follow-up items · not built yet
            </p>
            <ul className="space-y-1.5">
              {[
                "meta_page_insights has zero rows — Facebook Page Insights sync Edge Function needs to be built (mirror tiktok-sync pattern) before the Facebook card can show data.",
                "meta_ig_insights has 8 of 10 fields always NULL — sync function needs fixing to populate impressions, likes, saves, reels_plays etc., or deprecate in favour of aggregating from meta_ig_posts.",
                "TikTok reach / download_count are structurally 0 from Sandbox API — re-check after Production app review approval; may need token upgrade.",
              ].map((item, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-snug" style={{ color: "#555" }}>
                  <span style={{ color: AMBER, flexShrink: 0 }}>{i + 1}.</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Security note ─────────────────────────────────────────── */}
        <p className="mt-6 text-[10px]" style={{ color: "#2e2e2e" }}>
          ⚠ RLS is disabled on social tables (meta_ig_insights, meta_ig_posts, tiktok_*). Enable policies before granting wider access.
        </p>

      </div>
    </div>
  );
}
