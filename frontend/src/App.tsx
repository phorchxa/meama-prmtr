import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";

import Actions from "./pages/Actions";
import KpiDashboard from "./pages/KpiDashboard";
import Alerts from "./pages/Alerts";
import CommandCenter from "./pages/CommandCenter";
import CustomerDetail from "./pages/CustomerDetail";
import Customers from "./pages/Customers";
import Campaigns from "./pages/Campaigns";
import MarketingKpis from "./pages/MarketingKpis";
import Social from "./pages/Social";
import SocialKpis from "./pages/SocialKpis";
import MoneyHunter from "./pages/MoneyHunter";
import PortfolioDetail from "./pages/PortfolioDetail";
import Portfolios from "./pages/Portfolios";
import Sessions from "./pages/Sessions";
import ProductDetail from "./pages/ProductDetail";
import Products from "./pages/Products";
import Reports from "./pages/Reports";
import Stock from "./pages/Stock";

/* ── Cursor follower (stub — full impl in components/CursorFollower) ── */
function CursorFollower() { return null; }

/* ── Icons (Lucide-style line, 1.7px stroke, square) ──────────────── */
type IconProps = { className?: string };
const I = ({ d, children, size = 19 }: { d?: string; children?: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {d ? <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /> : children}
  </svg>
);

const Icons = {
  grid: () => (
    <I><rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="1.7" /></I>
  ),
  queue: () => (
    <I><path d="M11 6h9M11 12h9M11 18h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M3.5 6l1.2 1.2L7 4.8M3.5 12l1.2 1.2L7 10.8M3.5 18l1.2 1.2L7 16.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></I>
  ),
  target: () => (
    <I><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.7" /></I>
  ),
  user: () => (
    <I><circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></I>
  ),
  box: () => (
    <I><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M4 7.5l8 4.5 8-4.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></I>
  ),
  tag: () => (
    <I><path d="M7 17L17 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="6" y="6" width="4" height="4" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="14" width="4" height="4" stroke="currentColor" strokeWidth="1.7" /></I>
  ),
  layers: () => (
    <I><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3 13l9 5 9-5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></I>
  ),
  activity: () => <I d="M3 12h4l3 8 4-16 3 8h4" />,
  signal: () => (
    <I><path d="M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M5 12c0-3.87 3.13-7 7-7s7 3.13 7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" fill="currentColor" /></I>
  ),
  play: () => (
    <I><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 9l5 3-5 3V9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></I>
  ),
  kpi: () => (
    <I><rect x="3" y="12" width="4" height="9" stroke="currentColor" strokeWidth="1.7" />
      <rect x="10" y="7" width="4" height="14" stroke="currentColor" strokeWidth="1.7" />
      <rect x="17" y="3" width="4" height="18" stroke="currentColor" strokeWidth="1.7" /></I>
  ),
  package: () => (
    <I><path d="M4 7l8-4 8 4v10l-8 4-8-4V7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M4 7l8 4 8-4M12 11v10" stroke="currentColor" strokeWidth="1.7" /></I>
  ),
  alert: () => (
    <I><path d="M12 3l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 10v4M12 16.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></I>
  ),
  report: () => (
    <I><rect x="4" y="3" width="16" height="18" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></I>
  ),
  search: (p: IconProps) => (
    <svg className={p.className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
};

type NavItem = {
  to: string;
  key: string;
  icon: () => ReactNode;
  end?: boolean;
  badge?: "alerts";
};
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Command",
    items: [
      { to: "/", key: "command", icon: Icons.grid, end: true },
      { to: "/kpi", key: "kpi", icon: Icons.kpi },
      { to: "/actions", key: "actions", icon: Icons.queue },
      { to: "/money-hunter", key: "moneyHunter", icon: Icons.target },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/customers", key: "customers", icon: Icons.user },
      { to: "/products", key: "products", icon: Icons.box },
      { to: "/campaigns", key: "campaigns", icon: Icons.tag },
      { to: "/portfolios", key: "portfolios", icon: Icons.layers },
      { to: "/sessions", key: "sessions", icon: Icons.activity },
    ],
  },
  {
    label: "Marketing",
    items: [
      { to: "/social-kpis", key: "socialKpis", icon: Icons.signal },
      { to: "/social", key: "social", icon: Icons.play },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/stock", key: "stock", icon: Icons.package },
      { to: "/alerts", key: "alerts", icon: Icons.alert, badge: "alerts" },
      { to: "/reports", key: "reports", icon: Icons.report },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/* ── Live critical-alert count (shared by sidebar badge + page title) ─── */
function useCriticalCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const BASE = import.meta.env.VITE_API_BASE_URL ?? "";
    fetch(`${BASE}/api/v1/alerts`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: Array<{ severity: string }> }) => {
        setCount(data.items.filter((a) => a.severity === "critical").length);
      })
      .catch(() => { /* no API — badge stays at 0 */ });
  }, []);
  return count;
}

/* ── Language toggle ─────────────────────────────────────────────── */
function LanguageToggle() {
  const { i18n } = useTranslation();
  const next = i18n.language === "ka" ? "en" : "ka";
  return (
    <button
      onClick={() => void i18n.changeLanguage(next)}
      className="flex h-9 items-center border border-meama-charcoal bg-white px-3 font-mono text-[11px] font-semibold text-meama-cream transition-colors hover:bg-meama-roast hover:text-meama-brown"
      aria-label="toggle language"
    >
      {i18n.language === "ka" ? "EN" : "ქარ"}
    </button>
  );
}

/* ── Sidebar ─────────────────────────────────────────────────────── */
function Sidebar({ criticalCount }: { criticalCount: number }) {
  const { t } = useTranslation();
  return (
    <aside className="flex h-full w-[268px] flex-none flex-col border-r border-meama-charcoal bg-white">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-meama-roast px-[18px] py-4">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center bg-meama-brown">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 19V8.5a2 2 0 0 1 2-2h3l2-2.5 2 2.5h3a2 2 0 0 1 2 2V19" stroke="var(--signal-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="10" y="11" width="4" height="4" fill="var(--signal-500)" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold leading-none tracking-[-0.01em] text-meama-brown">PRMTR</div>
          <div className="mt-0.5 text-[11px] font-medium text-meama-muted">MEAMA Georgia</div>
        </div>
        <span className="border border-meama-charcoal px-1.5 py-0.5 font-mono text-[10px] font-semibold text-meama-muted">v2</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3.5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-meama-muted">
              {group.label}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const badgeCount = item.badge === "alerts" ? criticalCount : 0;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex h-10 items-center gap-3 border-l-2 px-3 text-[14px] font-semibold transition-colors ${
                      isActive
                        ? "border-green-600 bg-meama-roast text-meama-brown"
                        : "border-transparent text-meama-cream hover:bg-meama-espresso"
                    }`
                  }
                >
                  <Icon />
                  <span className="flex-1 truncate">{t(`nav.${item.key}`)}</span>
                  {badgeCount > 0 ? (
                    <span className="tabular bg-critical-500 px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none text-white">
                      {badgeCount}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Margin-floor footer */}
      <div className="border-t border-meama-roast p-3">
        <div className="flex items-center gap-2 bg-meama-espresso px-2.5 py-2">
          <div className="h-2 w-2 flex-none bg-green-500" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-meama-brown">Margin floor 40% · cap 25%</div>
            <div className="text-[11px] text-meama-muted">Enforced on all promos</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ── Top bar ─────────────────────────────────────────────────────── */
function TopBar() {
  const { t } = useTranslation();
  const location = useLocation();

  // Active page label for the breadcrumb (longest matching route).
  const active = [...ALL_ITEMS]
    .filter((i) => (i.to === "/" ? location.pathname === "/" : location.pathname.startsWith(i.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const pageTitle = active ? t(`nav.${active.key}`) : "";

  return (
    <header className="flex h-16 flex-none items-center gap-4 border-b border-meama-charcoal bg-white px-7">
      <div className="flex items-center gap-2.5 text-[14px] font-medium text-meama-muted">
        <span>MEAMA</span>
        <span className="text-meama-sand">/</span>
        <span className="font-semibold text-meama-brown">{pageTitle}</span>
      </div>

      <div className="flex-1" />

      {/* Search (command palette trigger — visual) */}
      <div className="hidden h-10 w-[300px] items-center gap-2 border border-meama-charcoal bg-meama-espresso px-3 lg:flex">
        <Icons.search className="text-meama-muted" />
        <span className="flex-1 text-[13px] text-meama-muted">Search customers, SKUs, orders…</span>
        <span className="border border-meama-charcoal bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-meama-muted">⌘K</span>
      </div>

      {/* Live badge */}
      <div className="hidden items-center gap-2 border border-signal-300 bg-signal-100 px-2.5 py-2 md:flex">
        <span className="pulse-live h-[7px] w-[7px] bg-signal-600" />
        <span className="text-[12px] font-semibold text-meama-brown">Live</span>
      </div>

      <LanguageToggle />

      {/* Account */}
      <div className="flex items-center gap-2.5 pl-1">
        <div className="flex h-9 w-9 flex-none items-center justify-center bg-green-700 text-[13px] font-bold text-white">
          MP
        </div>
      </div>
    </header>
  );
}

/* ── Page transition wrapper ─────────────────────────────────────── */
function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="rise">
      {children}
    </div>
  );
}

/* ── Layout — sidebar shell (shell A) ────────────────────────────── */
function Layout({ children }: { children: ReactNode }) {
  const criticalCount = useCriticalCount();
  return (
    <div className="flex h-screen w-full overflow-hidden bg-meama-espresso">
      <Sidebar criticalCount={criticalCount} />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="flex-1 overflow-y-auto px-7 py-7 pb-14">
          <div className="mx-auto max-w-[1440px]">
            <PageTransition>{children}</PageTransition>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Root ────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <>
      <CursorFollower />
      <Routes>
        <Route path="/" element={<Layout><CommandCenter /></Layout>} />
        <Route path="/kpi" element={<Layout><KpiDashboard /></Layout>} />
        <Route path="/money-hunter" element={<Layout><MoneyHunter /></Layout>} />
        <Route path="/ads" element={<Navigate to="/campaigns" replace />} />
        <Route path="/discount-engine" element={<Navigate to="/campaigns" replace />} />
        <Route path="/campaigns" element={<Layout><Campaigns /></Layout>} />
        <Route path="/marketing/kpis" element={<Layout><MarketingKpis /></Layout>} />
        <Route path="/social-kpis" element={<Layout><SocialKpis /></Layout>} />
        <Route path="/social" element={<Layout><Social /></Layout>} />
        <Route path="/actions" element={<Layout><Actions /></Layout>} />
        <Route path="/products" element={<Layout><Products /></Layout>} />
        <Route path="/products/:sku" element={<Layout><ProductDetail /></Layout>} />
        <Route path="/customers" element={<Layout><Customers /></Layout>} />
        <Route path="/customers/:id" element={<Layout><CustomerDetail /></Layout>} />
        <Route path="/portfolios" element={<Layout><Portfolios /></Layout>} />
        <Route path="/sessions" element={<Layout><Sessions /></Layout>} />
        <Route path="/portfolios/:id" element={<Layout><PortfolioDetail /></Layout>} />
        <Route path="/stock" element={<Layout><Stock /></Layout>} />
        <Route path="/reports" element={<Layout><Reports /></Layout>} />
        <Route path="/alerts" element={<Layout><Alerts /></Layout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
