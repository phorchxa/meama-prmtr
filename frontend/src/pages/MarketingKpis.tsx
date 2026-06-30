import { useEffect, useState, type ReactNode } from "react";

import {
  fetchSocialKpis,
  type InstagramKpis,
  type SocialKpis,
  type TikTokKpis,
} from "../lib/api";

/* ──────────────────────────────────────────────────────────────────────────
   Self-contained dark theme (this page only — the rest of the app is light).
   bg #0d0d0d · card #111111 · border #1a1a1a · accent red #e53e3e
   ────────────────────────────────────────────────────────────────────────── */

const RED = "#e53e3e";
const GREEN = "#22c55e";
const GREY = "#6b6b6b";
const DASH = "–";

type Status = "good" | "bad" | "na";

const nf = new Intl.NumberFormat("en-US");
const fmtInt = (v: number | null | undefined) => (v == null ? DASH : nf.format(Math.round(v)));
const fmtPct = (v: number | null | undefined, sign = false) =>
  v == null ? DASH : `${sign && v > 0 ? "+" : ""}${v.toFixed(1)}%`;

/* status from a value + minimum target; null value → N/A */
function meets(value: number | null | undefined, min: number): Status {
  if (value == null) return "na";
  return value >= min ? "good" : "bad";
}

/* ── Inline-SVG sparkline — red stroke, no axes, 60px tall ─────────────────── */
function Sparkline({ data, width = 260, height = 60 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return <div className="h-[60px]" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / span) * (height - 6) - 3).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="trend">
      <polyline points={pts} fill="none" stroke={RED} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Inline-SVG weekly bars — red bars, no axes ───────────────────────────── */
function WeeklyBars({ data, width = 260, height = 60 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length === 0) return <div className="h-[60px]" />;
  const max = Math.max(...data, 1);
  const gap = 6;
  const barW = (width - gap * (data.length - 1)) / data.length;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="weekly cadence">
      {data.map((v, i) => {
        const h = Math.max((v / max) * (height - 4), 2);
        const last = i === data.length - 1;
        return (
          <rect key={i} x={i * (barW + gap)} y={height - h} width={barW} height={h} rx={2} fill={RED} opacity={last ? 1 : 0.4} />
        );
      })}
    </svg>
  );
}

/* ── Status dot ───────────────────────────────────────────────────────────── */
function StatusDot({ status }: { status: Status }) {
  const color = status === "good" ? GREEN : status === "bad" ? RED : GREY;
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />;
}

/* ── Frequency pill ───────────────────────────────────────────────────────── */
function FreqPill({ freq }: { freq: "Weekly" | "Monthly" }) {
  return (
    <span className="rounded-full bg-[#1a1a1a] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#8a8a8a]">
      {freq}
    </span>
  );
}

/* ── KPI descriptor ───────────────────────────────────────────────────────── */
interface Kpi {
  name: string;
  value: ReactNode;
  target: string;
  freq: "Weekly" | "Monthly";
  status: Status;
  chart?: ReactNode;
  note?: string;
  primary?: boolean;
}

/* ── Secondary KPI card ───────────────────────────────────────────────────── */
function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <div className="flex flex-col rounded-xl border border-[#1a1a1a] bg-[#111111] p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-white">{kpi.name}</span>
        <StatusDot status={kpi.status} />
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums text-white">{kpi.value}</div>
      {kpi.chart ? <div className="mt-3">{kpi.chart}</div> : null}
      {kpi.note ? <p className="mt-2 text-[11px] leading-snug text-[#6b6b6b]">{kpi.note}</p> : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="text-[11px] text-[#6b6b6b]">{kpi.target}</span>
        <FreqPill freq={kpi.freq} />
      </div>
    </div>
  );
}

/* ── Primary (★) KPI — larger, gold star, sits in the header row ──────────── */
function PrimaryKpi({ kpi }: { kpi: Kpi }) {
  return (
    <div className="flex flex-col rounded-xl border border-[#2a2a2a] bg-[#141414] p-6 shadow-[0_0_0_1px_rgba(229,62,62,0.12)]">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-white">
          <span className="text-[#C8963E]" aria-hidden="true">★</span>
          {kpi.name}
        </span>
        <StatusDot status={kpi.status} />
      </div>
      <div className="mt-3 text-5xl font-bold tabular-nums" style={{ color: kpi.status === "bad" ? RED : "#ffffff" }}>
        {kpi.value}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        <span className="text-xs text-[#8a8a8a]">{kpi.target}</span>
        <FreqPill freq={kpi.freq} />
      </div>
    </div>
  );
}

/* ── Platform section ─────────────────────────────────────────────────────── */
function PlatformSection({
  kicker,
  name,
  primary,
  secondary,
}: {
  kicker: string;
  name: string;
  primary: Kpi;
  secondary: Kpi[];
}) {
  return (
    <section className="mb-14">
      {/* Header row: identity + primary KPI summary */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_minmax(280px,360px)] lg:items-stretch">
        <div className="flex flex-col justify-center rounded-xl border border-[#1a1a1a] bg-[#111111] p-7">
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: RED }}>
            {kicker}
          </span>
          <h2 className="mt-2 text-4xl font-bold tracking-tight text-white">{name}</h2>
        </div>
        <PrimaryKpi kpi={primary} />
      </div>

      {/* Secondary KPIs */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        {secondary.map((k) => (
          <KpiCard key={k.name} kpi={k} />
        ))}
      </div>
    </section>
  );
}

/* ── KPI builders per platform ────────────────────────────────────────────── */
function tiktokKpis(t: TikTokKpis): { primary: Kpi; secondary: Kpi[] } {
  return {
    primary: {
      name: "Follower Growth Rate",
      value: fmtPct(t.follower_growth_pct, true),
      target: "Target ≥ +5% / month",
      freq: "Monthly",
      status: meets(t.follower_growth_pct, 5),
      primary: true,
    },
    secondary: [
      {
        name: "Total Followers",
        value: fmtInt(t.followers_total),
        target: "Current audience",
        freq: "Monthly",
        status: "na",
      },
      {
        name: "Engagement Rate",
        value: fmtPct(t.engagement_rate),
        target: "Target ≥ 4%",
        freq: "Weekly",
        status: meets(t.engagement_rate, 4),
      },
      {
        name: "Reach / Impressions",
        value: fmtInt(t.reach_30d),
        target: "Video views · last 30d",
        freq: "Monthly",
        status: "na",
      },
      {
        name: "Share / Duet Rate",
        value: fmtPct(t.share_rate),
        target: "Shares ÷ views",
        freq: "Weekly",
        status: "na",
      },
      {
        name: "Content Cadence",
        value: t.cadence_per_week == null ? DASH : `${t.cadence_per_week}/wk`,
        target: "Posts per week · last 6 wks",
        freq: "Weekly",
        status: "na",
        chart: <WeeklyBars data={t.cadence_weekly} />,
      },
      {
        name: "Video Completion Rate",
        value: DASH,
        target: "Not available in API",
        freq: "Weekly",
        status: "na",
      },
      {
        name: "FYP Rate",
        value: DASH,
        target: "Not available in API",
        freq: "Weekly",
        status: "na",
      },
    ],
  };
}

function instagramKpis(ig: InstagramKpis): { primary: Kpi; secondary: Kpi[] } {
  return {
    primary: {
      name: "Follower Growth Rate",
      value: fmtPct(ig.follower_growth_pct, true),
      target: "Target ≥ +5% / month",
      freq: "Monthly",
      status: meets(ig.follower_growth_pct, 5),
      primary: true,
    },
    secondary: [
      {
        name: "Total Followers",
        value: fmtInt(ig.followers_total),
        target: "30-day reach trend",
        freq: "Monthly",
        status: "na",
        chart: <Sparkline data={ig.reach_trend} />,
      },
      {
        name: "Engagement Rate",
        value: fmtPct(ig.engagement_rate),
        target: "Target ≥ 4%",
        freq: "Weekly",
        status: meets(ig.engagement_rate, 4),
      },
      {
        name: "Reach / Impressions",
        value: fmtInt(ig.reach_30d),
        target: "Sum of daily reach · last 30d",
        freq: "Monthly",
        status: "na",
        chart: <Sparkline data={ig.reach_trend} />,
      },
      {
        name: "Saves per Post",
        value: ig.saves_per_post == null ? "N/A" : fmtInt(ig.saves_per_post),
        target: "Saves not exposed by API",
        freq: "Weekly",
        status: "na",
      },
      {
        name: "Reels Plays",
        value: fmtInt(ig.reels_count_30d),
        target: "Video posts · last 30d",
        freq: "Weekly",
        status: "na",
        note: "Plays unavailable — showing count of video/reel posts.",
      },
      {
        name: "Content Cadence",
        value: ig.cadence_per_week == null ? DASH : `${ig.cadence_per_week}/wk`,
        target: "Posts per week · last 6 wks",
        freq: "Weekly",
        status: "na",
        chart: <WeeklyBars data={ig.cadence_weekly} />,
      },
      {
        name: "Story Completion Rate",
        value: DASH,
        target: "Not available in API",
        freq: "Weekly",
        status: "na",
      },
    ],
  };
}

function facebookKpis(): { primary: Kpi; secondary: Kpi[] } {
  const soon = (name: string, freq: "Weekly" | "Monthly"): Kpi => ({
    name,
    value: DASH,
    target: "Data coming soon",
    freq,
    status: "na",
  });
  return {
    primary: {
      name: "Follower Growth Rate",
      value: DASH,
      target: "Data coming soon — page token pending",
      freq: "Monthly",
      status: "na",
      primary: true,
    },
    secondary: [
      soon("Total Followers", "Monthly"),
      soon("Engagement Rate", "Weekly"),
      soon("Reach / Impressions", "Monthly"),
      soon("Page Likes", "Monthly"),
      soon("Post Reactions", "Weekly"),
      soon("Content Cadence", "Weekly"),
      soon("Video Views", "Weekly"),
    ],
  };
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function MarketingKpis() {
  const [data, setData] = useState<SocialKpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSocialKpis()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      alive = false;
    };
  }, []);

  const tt = data ? tiktokKpis(data.tiktok) : null;
  const ig = data ? instagramKpis(data.instagram) : null;
  const fb = facebookKpis();

  return (
    /* Self-contained dark surface — overrides the light app shell for this page */
    <div className="-mx-6 -my-10 min-h-screen bg-[#0d0d0d] px-6 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-12">
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: RED }}>
            Marketing · Organic Social
          </span>
          <h1 className="mt-2 text-5xl font-bold tracking-tight">Social Media KPIs</h1>
          <p className="mt-3 max-w-2xl text-sm text-[#8a8a8a]">
            TikTok, Instagram and Facebook performance — followers, engagement, reach and cadence.
            Paid-ads metrics live in Promotions. Times in Asia/Tbilisi (GMT+4).
          </p>
          {error ? (
            <p className="mt-4 rounded-lg border border-[#3a1a1a] bg-[#1a1010] px-4 py-2 text-sm text-[#e53e3e]">
              Couldn’t load KPIs: {error}
            </p>
          ) : null}
        </header>

        {!data && !error ? (
          <div className="space-y-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl border border-[#1a1a1a] bg-[#111111]" />
            ))}
          </div>
        ) : null}

        {tt && ig ? (
          <>
            <PlatformSection kicker="Short Video · TikTok" name="TikTok" primary={tt.primary} secondary={tt.secondary} />
            <PlatformSection kicker="Visual · Instagram" name="Instagram" primary={ig.primary} secondary={ig.secondary} />
            <PlatformSection kicker="Social · Facebook" name="Facebook" primary={fb.primary} secondary={fb.secondary} />
          </>
        ) : null}
      </div>
    </div>
  );
}
