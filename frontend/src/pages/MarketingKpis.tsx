import { useEffect, useState } from "react";

import {
  fetchSocialKpis,
  type FacebookKpis,
  type InstagramKpis,
  type SocialKpis,
  type TikTokKpis,
} from "../lib/api";

/* ── design tokens (dark surface, this page only) ──────────────────────────
   bg #0a0a0a · card #111 · border #1e1e1e
   gold #C8963E · green #2D6A4F · red #C0392B · muted #6B6B6B
   ─────────────────────────────────────────────────────────────────────── */
const GOLD  = "#C8963E";
const GREEN = "#2D6A4F";
const RED   = "#C0392B";
const MUTED = "#6B6B6B";
const DASH  = "–";

const nf    = new Intl.NumberFormat("en-US");
const fmt   = (v: number | null | undefined) => v == null ? DASH : nf.format(Math.round(v));
const fmtPct = (v: number | null | undefined, sign = false) =>
  v == null ? DASH : `${sign && v > 0 ? "+" : ""}${v.toFixed(1)}%`;

type Status = "good" | "warn" | "na";

function status(val: number | null | undefined, min: number): Status {
  if (val == null) return "na";
  return val >= min ? "good" : "warn";
}

/* ── Sparkline ─────────────────────────────────────────────────────────── */
function Spark({ data, h = 28 }: { data: number[]; h?: number }) {
  if (!data || data.length < 2) return null;
  const w = 80;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const sx = w / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * sx).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={GOLD} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Status dot ─────────────────────────────────────────────────────────── */
function Dot({ s }: { s: Status }) {
  const c = s === "good" ? GREEN : s === "warn" ? RED : "#2e2e2e";
  return <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />;
}

/* ── Cadence pill ───────────────────────────────────────────────────────── */
function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
      style={{ background: "#1a1a1a", color: MUTED }}>
      {label}
    </span>
  );
}

/* ── Target badge ───────────────────────────────────────────────────────── */
function Target({ text }: { text: string }) {
  return <span className="text-[10px] tabular-nums" style={{ color: MUTED }}>{text}</span>;
}

/* ── Primary KPI row ────────────────────────────────────────────────────── */
function PrimaryRow({ name, value, s, target, cadence }: {
  name: string; value: string; s: Status; target: string; cadence: string;
}) {
  const valueColor = s === "warn" ? RED : s === "good" ? "#fff" : "#fff";
  return (
    <div className="rounded-lg p-4" style={{ background: "#161616", border: "1px solid #2a2a2a" }}>
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ color: GOLD }} className="text-xs">★</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white">{name}</span>
      </div>
      <div className="text-3xl font-bold tabular-nums mb-3" style={{ color: valueColor }}>{value}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Dot s={s} />
          <Target text={target} />
        </div>
        <Pill label={cadence} />
      </div>
    </div>
  );
}

/* ── Metric row ─────────────────────────────────────────────────────────── */
function MetricRow({ name, value, s, target, cadence, note, spark }: {
  name: string; value: string; s: Status; target: string; cadence: string;
  note?: string; spark?: number[];
}) {
  return (
    <div className="py-3" style={{ borderBottom: "1px solid #1a1a1a" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Dot s={s} />
            <span className="text-[12px] text-white truncate">{name}</span>
          </div>
          {note && <p className="mt-0.5 ml-3.5 text-[10px] leading-tight" style={{ color: MUTED }}>{note}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {spark && spark.length > 1 && <Spark data={spark} />}
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums text-white">{value}</div>
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <Target text={target} />
              <Pill label={cadence} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Platform card ──────────────────────────────────────────────────────── */
interface MetricDef {
  name: string; value: string; s: Status; target: string; cadence: string;
  note?: string; spark?: number[];
}

function PlatformCard({ category, name, primary, metrics }: {
  category: string;
  name: string;
  primary: { name: string; value: string; s: Status; target: string; cadence: string };
  metrics: MetricDef[];
}) {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
      {/* card header */}
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid #1e1e1e" }}>
        <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
          {category}
        </span>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-white">{name}</h2>
      </div>

      <div className="flex flex-col flex-1 px-5 pb-5">
        {/* primary KPI */}
        <div className="mt-4">
          <PrimaryRow {...primary} />
        </div>

        {/* secondary metrics */}
        <div className="mt-2">
          {metrics.map((m) => <MetricRow key={m.name} {...m} />)}
        </div>
      </div>
    </div>
  );
}

/* ── Per-platform metric builders ──────────────────────────────────────── */
function buildTikTok(t: TikTokKpis) {
  return {
    primary: {
      name: "Follower Growth Rate",
      value: fmtPct(t.follower_growth_pct, true),
      s: status(t.follower_growth_pct, 5),
      target: "≥ +5% / month",
      cadence: "Monthly",
    },
    metrics: [
      {
        name: "Total Followers",
        value: fmt(t.followers_total),
        s: "na" as Status,
        target: "Grow",
        cadence: "Monthly",
      },
      {
        name: "Engagement Rate",
        value: fmtPct(t.engagement_rate),
        s: status(t.engagement_rate, 4),
        target: "≥ 4%",
        cadence: "Weekly",
      },
      {
        name: "Reach / Impressions",
        value: fmt(t.reach_30d),
        s: "na" as Status,
        target: "Grow · video views",
        cadence: "Monthly",
        note: "True reach unavailable — TikTok API scope",
      },
      {
        name: "Share / Duet Rate",
        value: fmtPct(t.share_rate),
        s: "na" as Status,
        target: "Grow · shares ÷ views",
        cadence: "Weekly",
      },
      {
        name: "FYP Rate",
        value: DASH,
        s: "na" as Status,
        target: "Not in API",
        cadence: "Weekly",
        note: "No FYP-specific field available",
      },
      {
        name: "Content Cadence",
        value: t.cadence_per_week == null ? DASH : `${t.cadence_per_week}/wk`,
        s: "na" as Status,
        target: "Grow · last 6 wks",
        cadence: "Weekly",
        spark: t.cadence_weekly,
      },
    ] as MetricDef[],
  };
}

function buildInstagram(ig: InstagramKpis) {
  return {
    primary: {
      name: "Follower Growth Rate",
      value: fmtPct(ig.follower_growth_pct, true),
      s: status(ig.follower_growth_pct, 5),
      target: "≥ +5% / month",
      cadence: "Monthly",
    },
    metrics: [
      {
        name: "Total Followers",
        value: fmt(ig.followers_total),
        s: "na" as Status,
        target: "Grow",
        cadence: "Monthly",
        spark: ig.reach_trend,
      },
      {
        name: "Engagement Rate",
        value: fmtPct(ig.engagement_rate),
        s: status(ig.engagement_rate, 4),
        target: "≥ 4%",
        cadence: "Weekly",
      },
      {
        name: "Reach / Impressions",
        value: fmt(ig.reach_30d),
        s: "na" as Status,
        target: "Grow · last 30d",
        cadence: "Monthly",
        spark: ig.reach_trend,
      },
      {
        name: "Saves per Post",
        value: ig.saves_per_post == null ? "N/A" : fmt(ig.saves_per_post),
        s: "na" as Status,
        target: "Grow · saves not in API",
        cadence: "Weekly",
      },
      {
        name: "Reels Plays",
        value: fmt(ig.reels_count_30d),
        s: "na" as Status,
        target: "Grow · video posts",
        cadence: "Weekly",
        note: "Plays unavailable — showing video post count",
      },
      {
        name: "Content Cadence",
        value: ig.cadence_per_week == null ? DASH : `${ig.cadence_per_week}/wk`,
        s: "na" as Status,
        target: "Grow · last 6 wks",
        cadence: "Weekly",
        spark: ig.cadence_weekly,
      },
    ] as MetricDef[],
  };
}

function buildFacebook(fb: FacebookKpis) {
  const na = (name: string, cadence: string, note?: string): MetricDef => ({
    name, value: DASH, s: "na", target: "No data yet", cadence, note,
  });

  return {
    primary: {
      name: "Page Follower Growth",
      value: fmtPct(fb.follower_growth_pct, true),
      s: status(fb.follower_growth_pct, 3),
      target: "≥ +3% / month",
      cadence: "Monthly",
    },
    metrics: fb.available ? [
      {
        name: "Total Page Followers",
        value: fmt(fb.followers_total),
        s: "na" as Status,
        target: "Grow",
        cadence: "Monthly",
        spark: fb.reach_trend,
      },
      {
        name: "Organic Reach",
        value: fmt(fb.organic_reach_30d),
        s: "na" as Status,
        target: "Grow · last 30d",
        cadence: "Weekly",
      },
      {
        name: "Engagement Rate",
        value: fmtPct(fb.engagement_rate),
        s: status(fb.engagement_rate, 3),
        target: "≥ 3%",
        cadence: "Weekly",
      },
      {
        name: "Post Impressions",
        value: fmt(fb.impressions_30d),
        s: "na" as Status,
        target: "Grow · last 30d",
        cadence: "Weekly",
      },
      {
        name: "Video Views (3s+)",
        value: fmt(fb.video_views_3s),
        s: "na" as Status,
        target: "Grow",
        cadence: "Weekly",
        note: "Not in current schema — planned",
      },
    ] as MetricDef[] : [
      na("Total Page Followers", "Monthly"),
      na("Organic Reach", "Weekly"),
      na("Engagement Rate", "Weekly"),
      na("Post Impressions", "Weekly"),
      na("Video Views (3s+)", "Weekly", "Page token pending"),
    ],
  };
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export default function MarketingKpis() {
  const [data, setData] = useState<SocialKpis | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSocialKpis()
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : "Load failed"); });
    return () => { alive = false; };
  }, []);

  const tt = data ? buildTikTok(data.tiktok) : null;
  const ig = data ? buildInstagram(data.instagram) : null;
  const fb = data ? buildFacebook(data.facebook) : null;

  const loading = !data && !err;

  return (
    <div className="-mx-6 -my-10 min-h-screen px-6 py-10" style={{ background: "#0a0a0a" }}>
      <div className="mx-auto max-w-7xl">

        {/* ── Header banner ─────────────────────────────────────────── */}
        <header className="mb-10 rounded-xl px-7 py-6" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
          <span className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: GOLD }}>
            Communication Direction
          </span>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-white">
            Audience Growth · Engagement · Reach
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: MUTED }}>
            Measured on brand building — audience size, growth rate, content quality.
            Not connected to sales. Times in Asia/Tbilisi (GMT+4).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Follower Growth", "Engagement Rate", "Reach"].map((label) => (
              <span key={label} className="rounded-full px-3 py-1 text-[11px] font-medium"
                style={{ background: "#1a1a1a", color: "#d4d4d4", border: "1px solid #2a2a2a" }}>
                {label}
              </span>
            ))}
          </div>
          {err && (
            <p className="mt-4 rounded-lg px-4 py-2 text-sm" style={{ background: "#1a0a0a", border: "1px solid #3a1a1a", color: RED }}>
              Could not load KPIs: {err}
            </p>
          )}
        </header>

        {/* ── Loading skeletons ──────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[520px] animate-pulse rounded-xl" style={{ background: "#111", border: "1px solid #1e1e1e" }} />
            ))}
          </div>
        )}

        {/* ── Platform cards ─────────────────────────────────────────── */}
        {tt && ig && fb && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <PlatformCard
              category="Short Video"
              name="TikTok"
              primary={tt.primary}
              metrics={tt.metrics}
            />
            <PlatformCard
              category="Photo · Reels"
              name="Instagram"
              primary={ig.primary}
              metrics={ig.metrics}
            />
            <PlatformCard
              category="Page · Paid"
              name="Facebook"
              primary={fb.primary}
              metrics={fb.metrics}
            />
          </div>
        )}

        {/* ── Security note ──────────────────────────────────────────── */}
        <p className="mt-8 text-[10px]" style={{ color: "#3a3a3a" }}>
          ⚠ RLS is disabled on social tables (meta_ig_insights, meta_ig_posts, meta_page_insights, tiktok_*). Enable policies before granting wider access.
        </p>

      </div>
    </div>
  );
}
