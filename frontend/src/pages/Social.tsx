import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchSocialTikTokOverview,
  fetchSocialTikTokVideos,
  fetchSocialTikTokVideoHistory,
  fetchSocialTikTokAiReport,
  fetchSocialMetaOverview,
  fetchSocialMetaPosts,
  fetchSocialMetaCampaigns,
  fetchSocialMetaAiReport,
  type AiReport,
  type MetaCampaignBrief,
  type MetaCampaignsResponse,
  type MetaIgInsightPoint,
  type MetaIgPost,
  type MetaOverview,
  type TikTokOverview,
  type TikTokSnapshotPoint,
  type TikTokVideoSnap,
  type TikTokVideosResponse,
} from "../lib/api";

/* ── design tokens ────────────────────────────────────────────────────────────
   Matches dark-surface style of SocialKpis.tsx
   bg #0a0a0a · card #111 · border #1e1e1e · surface2 #161616
   gold #C8963E · green #2D6A4F · red #C0392B · amber #B87333 · muted #6B6B6B
   ─────────────────────────────────────────────────────────────────────────── */
const GOLD  = "#C8963E";
const GREEN = "#2D6A4F";
const RED   = "#C0392B";
const AMBER = "#B87333";
const MUTED = "#6B6B6B";
const DASH  = "—";

/* ── formatters ──────────────────────────────────────────────────────────────*/
const nf = new Intl.NumberFormat("en-US");
const fmt   = (v: number | null | undefined) => v == null ? DASH : nf.format(Math.round(v));
const fmtK  = (v: number | null | undefined) => {
  if (v == null) return DASH;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return nf.format(Math.round(v));
};
const fmtPct = (v: number | null | undefined) =>
  v == null ? DASH : `${v.toFixed(1)}%`;
const fmtDur = (s: number | null | undefined) => {
  if (!s) return DASH;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return DASH;
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return DASH; }
};
const relDate = (iso: string | null | undefined) => {
  if (!iso) return DASH;
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
};

/* ── inline SVG polyline sparkline ──────────────────────────────────────────*/
function LineChart({
  data,
  color = GOLD,
  w = 80,
  h = 32,
}: {
  data: number[];
  color?: string;
  w?: number;
  h?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const sx = w / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * sx).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Area chart for trend sections ───────────────────────────────────────── */
function AreaChart({
  data,
  color = GOLD,
  w = 240,
  h = 60,
}: {
  data: number[];
  color?: string;
  w?: number;
  h?: number;
}) {
  if (!data || data.length < 2) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: MUTED, fontSize: 11 }}>
        Not enough data
      </div>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const sx = w / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * sx).toFixed(1)},${(h - ((v - min) / span) * (h - 8) - 4).toFixed(1)}`)
    .join(" ");
  const first = pts.split(" ")[0];
  const last  = pts.split(" ").pop() ?? "0,0";
  const [lx] = last.split(",");
  const fillPts = `${first} ${pts} ${lx},${h} 0,${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden preserveAspectRatio="none">
      <defs>
        <linearGradient id={`ag-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#ag-${color.replace("#", "")})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Skeleton block ──────────────────────────────────────────────────────── */
function Skel({ h, className = "" }: { h?: string; className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ background: "#1a1a1a", height: h ?? "100%" }}
    />
  );
}

/* ── Stat chip ───────────────────────────────────────────────────────────── */
function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "#161616", border: "1px solid #2a2a2a" }}>
      <div className="text-[9px] font-bold uppercase tracking-[0.25em] mb-1" style={{ color: MUTED }}>{label}</div>
      <div className="text-[15px] font-bold tabular-nums text-white leading-none">{value}</div>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <span className="text-2xl" style={{ color: "#2a2a2a" }}>◌</span>
      <p className="text-sm" style={{ color: MUTED }}>{text}</p>
    </div>
  );
}

/* ── Error banner ─────────────────────────────────────────────────────────── */
function ErrBanner({ msg }: { msg: string }) {
  return (
    <p className="rounded-lg px-4 py-2.5 text-sm" style={{ background: "#1a0a0a", border: "1px solid #3a1a1a", color: RED }}>
      {msg}
    </p>
  );
}

/* ── Tab switcher ─────────────────────────────────────────────────────────── */
type TopTab = "tiktok" | "meta";
function TabBar({ tab, setTab }: { tab: TopTab; setTab: (t: TopTab) => void }) {
  const tabs: { key: TopTab; label: string; dot: string }[] = [
    { key: "tiktok", label: "TikTok", dot: "#e5e5e5" },
    { key: "meta", label: "Meta", dot: "#7C3AED" },
  ];
  return (
    <div className="flex gap-1 rounded-lg p-1" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className="flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold transition-colors"
          style={{
            background: tab === t.key ? "#1e1e1e" : "transparent",
            color: tab === t.key ? "#fff" : MUTED,
            border: tab === t.key ? "1px solid #2a2a2a" : "1px solid transparent",
          }}
        >
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: t.dot }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── AI report panel ─────────────────────────────────────────────────────── */
function AiReportPanel({
  platform,
  fetcher,
}: {
  platform: string;
  fetcher: (refresh?: boolean) => Promise<AiReport>;
}) {
  const [report, setReport] = useState<AiReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = (refresh = false) => {
    setLoading(true);
    setErr(null);
    fetcher(refresh)
      .then((r) => { if (mounted.current) { setReport(r); setLoading(false); } })
      .catch((e: unknown) => { if (mounted.current) { setErr(e instanceof Error ? e.message : "Error"); setLoading(false); } });
  };

  return (
    <div className="rounded-xl p-5" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] mb-1" style={{ color: GOLD }}>
            AI Analysis
          </div>
          <h3 className="text-[13px] font-bold text-white">{platform} · Claude Analysis</h3>
        </div>
        <div className="flex gap-2">
          {report && (
            <button
              onClick={() => load(true)}
              disabled={loading}
              className="rounded px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50 transition-colors"
              style={{ background: "#1a1a1a", color: MUTED, border: "1px solid #2a2a2a" }}
            >
              ↻ Refresh
            </button>
          )}
          {!report && (
            <button
              onClick={() => load(false)}
              disabled={loading}
              className="rounded px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50 transition-colors"
              style={{ background: "#1c1100", color: GOLD, border: "1px solid #3a2a00" }}
            >
              {loading ? "Generating…" : "Generate Analysis"}
            </button>
          )}
        </div>
      </div>

      {err && <ErrBanner msg={err} />}

      {loading && (
        <div className="space-y-2">
          {[80, 90, 70, 85].map((w, i) => (
            <div key={i} className="h-3 animate-pulse rounded" style={{ background: "#1a1a1a", width: `${w}%` }} />
          ))}
        </div>
      )}

      {report && !loading && (
        <div>
          <div
            className="text-[13px] leading-relaxed whitespace-pre-wrap"
            style={{ color: "#c0c0c0", fontFamily: "Inter, sans-serif" }}
          >
            {report.report}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[10px]" style={{ color: "#333" }}>
              {report.cached ? "⚡ Cached" : "✦ Fresh"} · Generated {fmtDate(report.generated_at)}
            </span>
          </div>
        </div>
      )}

      {!report && !loading && !err && (
        <p className="text-[12px]" style={{ color: MUTED }}>
          Click "Generate Analysis" to get a written summary from Claude based on your real aggregated stats.
        </p>
      )}
    </div>
  );
}

/* ══════════════════════ TIKTOK TAB ════════════════════════════════════════ */

/* Snapshot sparkline inside expanded card */
function SnapSparkline({ snaps }: { snaps: TikTokSnapshotPoint[] }) {
  if (snaps.length === 0) return null;
  if (snaps.length === 1) {
    return (
      <p className="text-[10px] mt-1" style={{ color: AMBER }}>
        ⏳ Only 1 snapshot — not enough history for a trend line
      </p>
    );
  }
  return (
    <div className="mt-2 flex gap-6">
      <div>
        <div className="text-[9px] mb-1" style={{ color: MUTED }}>Views trend</div>
        <LineChart data={snaps.map((s) => s.view_count)} w={100} h={28} />
      </div>
      <div>
        <div className="text-[9px] mb-1" style={{ color: MUTED }}>Likes trend</div>
        <LineChart data={snaps.map((s) => s.like_count)} color={RED} w={100} h={28} />
      </div>
    </div>
  );
}

/* Individual TikTok video card */
function TikTokCard({ video }: { video: TikTokVideoSnap }) {
  const [expanded, setExpanded] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [snaps, setSnaps] = useState<TikTokSnapshotPoint[] | null>(null);
  const [snapLoading, setSnapLoading] = useState(false);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && snaps === null && !snapLoading) {
      setSnapLoading(true);
      fetchSocialTikTokVideoHistory(video.video_id)
        .then((h) => { setSnaps(h.snapshots); setSnapLoading(false); })
        .catch(() => { setSnaps([]); setSnapLoading(false); });
    }
  };

  const hasCover = video.cover_image_url && !imgErr;

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{ background: "#111", border: "1px solid #1e1e1e" }}
    >
      {/* Cover image / fallback */}
      <div
        className="relative flex-shrink-0"
        style={{ aspectRatio: "16/9", background: "#0d0d0d", overflow: "hidden" }}
      >
        {hasCover ? (
          <img
            src={video.cover_image_url!}
            alt={video.title ?? "TikTok video"}
            onError={() => setImgErr(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          /* Gradient placeholder with play icon — onError fallback */
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="#2a2a2a" strokeWidth="1.5" />
              <path d="M10 8l6 4-6 4V8z" fill="#3a3a3a" />
            </svg>
          </div>
        )}
        {video.duration != null && (
          <span
            className="absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{ background: "rgba(0,0,0,0.75)", color: "#e5e5e5" }}
          >
            {fmtDur(video.duration)}
          </span>
        )}
        {video.video_url && (
          <a
            href={video.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0"
            aria-label="Open video on TikTok"
          />
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 p-3 gap-2">
        {/* Title */}
        {video.title && (
          <p className="text-[12px] font-semibold text-white leading-snug line-clamp-2">
            {video.title}
          </p>
        )}

        {/* Hashtags */}
        {video.hashtags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {video.hashtags.slice(0, 6).map((h) => (
              <span
                key={h}
                className="rounded-full px-2 py-0.5 text-[9px] font-medium"
                style={{ background: "#1c1100", color: AMBER }}
              >
                #{h}
              </span>
            ))}
            {video.hashtags.length > 6 && (
              <span className="text-[9px]" style={{ color: MUTED }}>+{video.hashtags.length - 6}</span>
            )}
          </div>
        ) : (
          <span className="text-[10px] italic" style={{ color: "#333" }}>no hashtags</span>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[11px] tabular-nums" style={{ color: "#a0a0a0" }}>
          <span title="Views">👁 {fmtK(video.view_count)}</span>
          <span title="Likes">❤ {fmtK(video.like_count)}</span>
          <span title="Comments">💬 {fmtK(video.comment_count)}</span>
          <span title="Shares">↗ {fmtK(video.share_count)}</span>
        </div>

        <div className="flex items-center justify-between text-[10px]" style={{ color: MUTED }}>
          <span>
            {video.engagement_rate != null ? (
              <span style={{ color: video.engagement_rate >= 4 ? GREEN : "#a0a0a0" }}>
                ER {fmtPct(video.engagement_rate)}
              </span>
            ) : (
              <span>ER {DASH}</span>
            )}
          </span>
          <span title={fmtDate(video.published_at)}>{relDate(video.published_at)}</span>
        </div>

        {/* Expand / collapse button */}
        <button
          onClick={handleExpand}
          className="mt-1 text-left text-[10px] font-medium transition-colors"
          style={{ color: expanded ? GOLD : MUTED }}
        >
          {expanded ? "▲ Hide history" : "▼ View snapshot history"}
        </button>

        {expanded && (
          <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: 8 }}>
            {snapLoading && <Skel h="36px" />}
            {!snapLoading && snaps !== null && <SnapSparkline snaps={snaps} />}
          </div>
        )}
      </div>
    </div>
  );
}

/* TikTok overview stats bar */
function TikTokStatsBar({ overview }: { overview: TikTokOverview }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
      <Chip label="Videos" value={fmt(overview.total_videos)} />
      <Chip label="Total Views" value={fmtK(overview.total_views)} />
      <Chip label="Total Likes" value={fmtK(overview.total_likes)} />
      <Chip label="Total Comments" value={fmtK(overview.total_comments)} />
      <Chip label="Total Shares" value={fmtK(overview.total_shares)} />
      <Chip label="Avg Engagement" value={fmtPct(overview.avg_engagement_rate)} />
    </div>
  );
}

/* Follower trend card */
function TikTokFollowerCard({ overview }: { overview: TikTokOverview }) {
  const trend = overview.follower_growth_trend;
  return (
    <div className="rounded-xl p-4" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
      <div className="text-[9px] font-bold uppercase tracking-[0.3em] mb-1" style={{ color: GOLD }}>
        Followers
      </div>
      <div className="text-2xl font-bold text-white tabular-nums mb-3">
        {overview.followers_count != null ? fmt(overview.followers_count) : DASH}
      </div>
      {trend.length >= 2 ? (
        <div className="w-full" style={{ height: 48 }}>
          <AreaChart data={trend.map((p) => p.followers_count)} w={220} h={48} />
        </div>
      ) : (
        <p className="text-[10px]" style={{ color: AMBER }}>
          ⏳ {trend.length < 2 ? "Not enough history for a trend" : ""}
        </p>
      )}
    </div>
  );
}

/* Top hashtags card */
function TikTokHashtagsCard({ overview }: { overview: TikTokOverview }) {
  const tags = overview.top_hashtags.slice(0, 12);
  return (
    <div className="rounded-xl p-4" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
      <div className="text-[9px] font-bold uppercase tracking-[0.3em] mb-3" style={{ color: GOLD }}>
        Top Hashtags
      </div>
      {tags.length === 0 ? (
        <p className="text-[11px]" style={{ color: MUTED }}>No hashtag data yet</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((h) => (
            <div
              key={h.hashtag}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
              style={{ background: "#1c1100", color: AMBER, border: "1px solid #2a1800" }}
            >
              <span>#{h.hashtag}</span>
              <span
                className="rounded-full px-1 text-[9px]"
                style={{ background: "#2a1800", color: AMBER }}
              >
                {h.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* TikTok full tab */
function TikTokTab({ lang }: { lang: string }) {
  const [overview, setOverview] = useState<TikTokOverview | null>(null);
  const [videos, setVideos] = useState<TikTokVideosResponse | null>(null);
  const [overviewErr, setOverviewErr] = useState<string | null>(null);
  const [videosErr, setVideosErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSocialTikTokOverview()
      .then((d) => { if (alive) setOverview(d); })
      .catch((e: unknown) => { if (alive) setOverviewErr(e instanceof Error ? e.message : "Load failed"); });
    fetchSocialTikTokVideos()
      .then((d) => { if (alive) setVideos(d); })
      .catch((e: unknown) => { if (alive) setVideosErr(e instanceof Error ? e.message : "Load failed"); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-6">
      {/* Overview section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>
            Account Overview · @meamabackstage
          </span>
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
        </div>

        {overviewErr && <ErrBanner msg={overviewErr} />}
        {!overview && !overviewErr && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
            {[0,1,2,3,4,5].map((i) => <Skel key={i} h="64px" />)}
          </div>
        )}

        {overview && (
          <>
            <TikTokStatsBar overview={overview} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <TikTokFollowerCard overview={overview} />
              <TikTokHashtagsCard overview={overview} />

              {/* Top 5 by views */}
              <div className="rounded-xl p-4" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
                <div className="text-[9px] font-bold uppercase tracking-[0.3em] mb-3" style={{ color: GOLD }}>
                  Top 5 · Views
                </div>
                {overview.top_5_by_views.length === 0 ? (
                  <p className="text-[11px]" style={{ color: MUTED }}>No data</p>
                ) : (
                  <ol className="space-y-2">
                    {overview.top_5_by_views.map((v, i) => (
                      <li key={v.video_id} className="flex items-start gap-2">
                        <span className="text-[10px] font-bold w-4 flex-shrink-0" style={{ color: i === 0 ? GOLD : MUTED }}>
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-white truncate leading-tight">
                            {v.title ?? v.video_id}
                          </p>
                          <p className="text-[10px] tabular-nums" style={{ color: MUTED }}>
                            {fmtK(v.view_count)} views
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Video grid */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>
            Video Library · {videos ? `${videos.total} videos` : "…"}
          </span>
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
        </div>

        {videosErr && <ErrBanner msg={videosErr} />}
        {!videos && !videosErr && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {[0,1,2,3,4].map((i) => <Skel key={i} h="280px" />)}
          </div>
        )}
        {videos && videos.videos.length === 0 && (
          <Empty text="No TikTok videos found" />
        )}
        {videos && videos.videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {videos.videos.map((v) => <TikTokCard key={v.video_id} video={v} />)}
          </div>
        )}
      </section>

      {/* AI report */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>
            AI Analysis
          </span>
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
        </div>
        <AiReportPanel
          platform="TikTok @meamabackstage"
          fetcher={(refresh) => fetchSocialTikTokAiReport(lang, refresh)}
        />
      </section>
    </div>
  );
}

/* ══════════════════════ META TAB ═══════════════════════════════════════════ */

/* Meta IG post card */
function MetaPostCard({ post }: { post: MetaIgPost }) {
  const [imgErr, setImgErr] = useState(false);
  const mt = post.media_type.toUpperCase();
  const hasThumbnail = mt === "VIDEO" && post.thumbnail_url && !imgErr;

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{ background: "#111", border: "1px solid #1e1e1e" }}
    >
      {/* Media preview */}
      <div
        className="relative flex-shrink-0 flex items-center justify-center"
        style={{ aspectRatio: "1/1", background: "#0d0d0d", overflow: "hidden" }}
      >
        {hasThumbnail ? (
          <img
            src={post.thumbnail_url!}
            alt="post thumbnail"
            onError={() => setImgErr(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)" }}
          >
            {mt === "CAROUSEL_ALBUM" ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="6" width="14" height="14" rx="1" stroke="#3a3a3a" strokeWidth="1.5" />
                <rect x="7" y="3" width="14" height="14" rx="1" stroke="#2a2a2a" strokeWidth="1.5" />
              </svg>
            ) : mt === "VIDEO" ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="#3a3a3a" strokeWidth="1.5" />
                <path d="M10 9l5 3-5 3V9z" fill="#3a3a3a" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#3a3a3a" strokeWidth="1.5" />
                <circle cx="8.5" cy="8.5" r="1.5" fill="#3a3a3a" />
                <path d="M3 15l5-5 4 4 3-3 6 5" stroke="#3a3a3a" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </div>
        )}
        {/* Media type badge */}
        <span
          className="absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{
            background: mt === "VIDEO" ? "#0d1a2a" : mt === "CAROUSEL_ALBUM" ? "#1a0d2a" : "#1a1a1a",
            color: mt === "VIDEO" ? "#4a90d9" : mt === "CAROUSEL_ALBUM" ? "#9b59b6" : MUTED,
          }}
        >
          {mt === "CAROUSEL_ALBUM" ? "CAROUSEL" : mt}
        </span>
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0"
            aria-label="View on Instagram"
          />
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 p-3 gap-2">
        {post.caption && (
          <p className="text-[11px] leading-snug line-clamp-3" style={{ color: "#c0c0c0" }}>
            {post.caption}
          </p>
        )}
        <div className="flex items-center gap-3 text-[11px] tabular-nums mt-auto" style={{ color: "#a0a0a0" }}>
          <span title="Likes">❤ {fmt(post.likes)}</span>
          <span title="Comments">💬 {fmt(post.comments)}</span>
        </div>
        <div className="text-[10px]" style={{ color: "#555" }}>
          {fmtDate(post.timestamp)}
        </div>
      </div>
    </div>
  );
}

/* IG account trend charts */
function MetaTrendCharts({ trend }: { trend: MetaIgInsightPoint[] }) {
  if (trend.length === 0) {
    return <Empty text="No insights data yet" />;
  }

  const followers = trend.map((p) => p.total_followers ?? 0);
  const reach     = trend.map((p) => p.reach ?? 0);
  const engaged   = trend.map((p) => p.accounts_engaged ?? 0);
  const dates     = trend.map((p) => p.date.slice(5)); // "MM-DD"

  const lastDate = dates[dates.length - 1] ?? "";
  const firstDate = dates[0] ?? "";
  const dateRange = firstDate && lastDate ? `${firstDate} → ${lastDate}` : "";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[
        { label: "Followers", data: followers, color: GOLD },
        { label: "Reach", data: reach, color: "#4a90d9" },
        { label: "Accounts Engaged", data: engaged, color: GREEN },
      ].map(({ label, data, color }) => {
        const latest = data[data.length - 1] ?? 0;
        const hasData = data.some((v) => v > 0);
        return (
          <div key={label} className="rounded-xl p-4" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
            <div className="text-[9px] font-bold uppercase tracking-[0.25em] mb-0.5" style={{ color: MUTED }}>{label}</div>
            <div className="text-xl font-bold tabular-nums text-white mb-2">{hasData ? fmtK(latest) : DASH}</div>
            <div style={{ height: 48, width: "100%" }}>
              {hasData ? (
                <AreaChart data={data} color={color} w={200} h={48} />
              ) : (
                <p className="text-[10px]" style={{ color: MUTED }}>No data</p>
              )}
            </div>
            <div className="text-[9px] mt-2" style={{ color: "#333" }}>{dateRange}</div>
          </div>
        );
      })}
    </div>
  );
}

/* Meta overview stats */
function MetaStatsBar({ overview }: { overview: MetaOverview }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
      <Chip label="Total Posts" value={fmt(overview.total_posts)} />
      <Chip label="Total Likes" value={fmtK(overview.total_likes)} />
      <Chip label="Total Comments" value={fmtK(overview.total_comments)} />
      <Chip label="Followers" value={overview.current_followers != null ? fmt(overview.current_followers) : DASH} />
    </div>
  );
}

/* Meta Ads browser — structure only, no performance data */
function MetaAdsBrowser({ campaigns }: { campaigns: MetaCampaignsResponse }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <div className="space-y-2">
      {/* Header stats */}
      <div className="flex gap-3 mb-4 text-[11px]" style={{ color: MUTED }}>
        <span>{campaigns.total_campaigns} campaigns</span>
        <span>·</span>
        <span>{campaigns.total_ad_sets} ad sets</span>
        <span>·</span>
        <span>{campaigns.total_ads} ads</span>
        {!campaigns.performance_data_available && (
          <>
            <span>·</span>
            <span style={{ color: AMBER }}>⚠ No performance data synced yet</span>
          </>
        )}
      </div>

      {campaigns.campaigns.length === 0 && (
        <Empty text="No campaigns found" />
      )}

      {campaigns.campaigns.slice(0, 50).map((c) => (
        <CampaignRow
          key={c.campaign_id}
          campaign={c}
          expanded={expanded.has(c.campaign_id)}
          onToggle={() => toggle(c.campaign_id)}
        />
      ))}

      {campaigns.campaigns.length > 50 && (
        <p className="text-[11px] text-center py-3" style={{ color: MUTED }}>
          Showing 50 of {campaigns.campaigns.length} campaigns
        </p>
      )}
    </div>
  );
}

function CampaignRow({
  campaign,
  expanded,
  onToggle,
}: {
  campaign: MetaCampaignBrief;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColor = campaign.status === "ACTIVE" ? GREEN : MUTED;
  const budget = campaign.daily_budget
    ? `$${campaign.daily_budget.toFixed(0)}/day`
    : campaign.lifetime_budget
    ? `$${campaign.lifetime_budget.toFixed(0)} lifetime`
    : null;

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #1e1e1e" }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#161616]"
        style={{ background: "#111" }}
      >
        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
        <span className="flex-1 text-[13px] font-semibold text-white truncate">
          {campaign.name ?? campaign.campaign_id}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {campaign.objective && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ background: "#1a1a1a", color: MUTED }}>
              {campaign.objective}
            </span>
          )}
          {budget && <span className="text-[10px] tabular-nums" style={{ color: MUTED }}>{budget}</span>}
          <span className="text-[10px]" style={{ color: MUTED }}>
            {campaign.ad_sets_count} ad {campaign.ad_sets_count === 1 ? "set" : "sets"}
          </span>
          <span style={{ color: MUTED, fontSize: 10 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div
          className="px-4 py-3"
          style={{ background: "#0d0d0d", borderTop: "1px solid #1a1a1a" }}
        >
          {/* Performance data empty state */}
          <div
            className="rounded-lg px-4 py-3 text-[12px] text-center"
            style={{ background: "#161616", border: "1px dashed #2a2a2a", color: MUTED }}
          >
            No performance data synced yet —{" "}
            <span style={{ color: "#555" }}>
              meta_insights table is empty. Data will appear here once the sync backfills it.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* Meta full tab */
function MetaTab({ lang }: { lang: string }) {
  const [overview, setOverview] = useState<MetaOverview | null>(null);
  const [posts, setPosts] = useState<{ posts: MetaIgPost[]; total: number } | null>(null);
  const [campaigns, setCampaigns] = useState<MetaCampaignsResponse | null>(null);
  const [overviewErr, setOverviewErr] = useState<string | null>(null);
  const [postsErr, setPostsErr] = useState<string | null>(null);
  const [campaignsErr, setCampaignsErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSocialMetaOverview()
      .then((d) => { if (alive) setOverview(d); })
      .catch((e: unknown) => { if (alive) setOverviewErr(e instanceof Error ? e.message : "Load failed"); });
    fetchSocialMetaPosts(60)
      .then((d) => { if (alive) setPosts(d); })
      .catch((e: unknown) => { if (alive) setPostsErr(e instanceof Error ? e.message : "Load failed"); });
    fetchSocialMetaCampaigns()
      .then((d) => { if (alive) setCampaigns(d); })
      .catch((e: unknown) => { if (alive) setCampaignsErr(e instanceof Error ? e.message : "Load failed"); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-6">
      {/* IG organic overview */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>
            Instagram Organic · @meama
          </span>
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
        </div>

        {overviewErr && <ErrBanner msg={overviewErr} />}
        {!overview && !overviewErr && <Skel h="160px" />}
        {overview && (
          <>
            <MetaStatsBar overview={overview} />

            {/* Media type breakdown */}
            {overview.by_media_type.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {overview.by_media_type.map((s) => (
                  <div
                    key={s.media_type}
                    className="rounded-lg px-3 py-2 text-[11px]"
                    style={{ background: "#161616", border: "1px solid #2a2a2a" }}
                  >
                    <span className="font-semibold text-white">{s.media_type}</span>
                    <span style={{ color: MUTED }}> · {s.post_count} posts · avg ❤ {s.avg_likes.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Trend charts */}
            <MetaTrendCharts trend={overview.insights_trend} />

            {/* Top 5 by likes */}
            {overview.top_5_by_likes.length > 0 && (
              <div className="mt-4 rounded-xl p-4" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
                <div className="text-[9px] font-bold uppercase tracking-[0.3em] mb-3" style={{ color: GOLD }}>
                  Top 5 Posts · Likes
                </div>
                <ol className="space-y-2">
                  {overview.top_5_by_likes.map((p, i) => (
                    <li key={p.media_id} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold w-4 flex-shrink-0" style={{ color: i === 0 ? GOLD : MUTED }}>
                        {i + 1}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] uppercase"
                        style={{ background: "#1a1a1a", color: MUTED, flexShrink: 0 }}
                      >
                        {p.media_type}
                      </span>
                      <p className="text-[11px] text-white truncate flex-1 min-w-0">
                        {(p.caption ?? "").slice(0, 60) || "—"}
                      </p>
                      <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "#a0a0a0" }}>
                        ❤ {fmt(p.likes)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </section>

      {/* Post grid */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>
            Posts · {posts ? `${posts.total} total` : "…"}
          </span>
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
        </div>

        {postsErr && <ErrBanner msg={postsErr} />}
        {!posts && !postsErr && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {[0,1,2,3,4,5].map((i) => <Skel key={i} h="200px" />)}
          </div>
        )}
        {posts && posts.posts.length === 0 && <Empty text="No Instagram posts found" />}
        {posts && posts.posts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {posts.posts.map((p) => <MetaPostCard key={p.media_id} post={p} />)}
          </div>
        )}
      </section>

      {/* Meta Ads browser */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>
            Meta Ads Structure
          </span>
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
        </div>

        {campaignsErr && <ErrBanner msg={campaignsErr} />}
        {!campaigns && !campaignsErr && <Skel h="120px" />}
        {campaigns && <MetaAdsBrowser campaigns={campaigns} />}
      </section>

      {/* AI report — organic IG only */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: MUTED }}>
            AI Analysis
          </span>
          <span className="h-px flex-1" style={{ background: "#1e1e1e" }} />
        </div>
        <AiReportPanel
          platform="Instagram @meama · Organic"
          fetcher={(refresh) => fetchSocialMetaAiReport(lang, refresh)}
        />
      </section>
    </div>
  );
}

/* ══════════════════════ PAGE ═══════════════════════════════════════════════ */

export default function Social() {
  const { i18n } = useTranslation();
  const [tab, setTab] = useState<TopTab>("tiktok");
  const lang = i18n.language === "ka" ? "ka" : "en";

  return (
    <div className="-mx-6 -my-10 min-h-screen px-6 py-8" style={{ background: "#0a0a0a" }}>
      <div className="mx-auto max-w-[1600px]">

        {/* Page header */}
        <header className="mb-6 rounded-xl px-6 py-5" style={{ background: "#111", border: "1px solid #1e1e1e" }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: GOLD }}>
                Social Media
              </span>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white">
                Content Browser · TikTok + Meta
              </h1>
              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed" style={{ color: MUTED }}>
                Organic video and post performance. Paid-ads spend data syncing in progress.
                Times in Asia/Tbilisi (GMT+4).
              </p>
            </div>
            <TabBar tab={tab} setTab={setTab} />
          </div>
        </header>

        {/* Tab content */}
        <div style={{ display: tab === "tiktok" ? "block" : "none" }}>
          <TikTokTab lang={lang} />
        </div>
        <div style={{ display: tab === "meta" ? "block" : "none" }}>
          <MetaTab lang={lang} />
        </div>

        {/* Security note */}
        <p className="mt-8 text-[10px]" style={{ color: "#2a2a2a" }}>
          ⚠ RLS is disabled on social tables (meta_ig_insights, meta_ig_posts, tiktok_*). Enable policies before granting wider access.
        </p>
      </div>
    </div>
  );
}
