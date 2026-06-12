import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { ALERTS } from "./lib/mock";
import Actions from "./pages/Actions";
import Ads from "./pages/Ads";
import Alerts from "./pages/Alerts";
import CommandCenter from "./pages/CommandCenter";
import Customers from "./pages/Customers";
import DiscountEngine from "./pages/DiscountEngine";
import Login from "./pages/Login";
import MoneyHunter from "./pages/MoneyHunter";
import PortfolioDetail from "./pages/PortfolioDetail";
import Portfolios from "./pages/Portfolios";
import ProductCategory from "./pages/ProductCategory";
import Products from "./pages/Products";
import Reports from "./pages/Reports";
import Stock from "./pages/Stock";

const NAV_ITEMS = [
  { to: "/", key: "command", icon: "command", end: true },
  { to: "/money-hunter", key: "moneyHunter", icon: "target" },
  { to: "/ads", key: "ads", icon: "megaphone" },
  { to: "/discount-engine", key: "discount", icon: "percent" },
  { to: "/actions", key: "actions", icon: "check" },
  { to: "/products", key: "products", icon: "box" },
  { to: "/customers", key: "customers", icon: "chart" },
  { to: "/portfolios", key: "portfolios", icon: "people" },
  { to: "/stock", key: "stock", icon: "layers" },
  { to: "/reports", key: "reports", icon: "doc" },
  { to: "/alerts", key: "alerts", icon: "bell" },
] as const;

const ICON_PATHS: Record<string, ReactNode> = {
  command: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 10l9-5v14l-9-5v-4z" />
      <path d="M12 8c4 0 7 1.5 9 4-2 2.5-5 4-9 4" />
    </>
  ),
  percent: (
    <>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
    </>
  ),
  check: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
  box: (
    <>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </>
  ),
  chart: (
    <>
      <rect x="4" y="12" width="3.5" height="8" rx="0.5" />
      <rect x="10.25" y="7" width="3.5" height="13" rx="0.5" />
      <rect x="16.5" y="3" width="3.5" height="17" rx="0.5" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M21 19c0-2.5-1.7-4.5-4-5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 17l9 5 9-5" />
    </>
  ),
  doc: (
    <>
      <path d="M6 2h9l4 4v16H6V2z" />
      <path d="M15 2v4h4" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
};

function NavIcon({ name }: { name: string }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

function LanguageToggle() {
  const { i18n } = useTranslation();
  const next = i18n.language === "ka" ? "en" : "ka";
  return (
    <button
      onClick={() => void i18n.changeLanguage(next)}
      className="rounded-full border border-meama-gold/40 px-3 py-1 text-xs font-semibold text-meama-brown transition-colors hover:bg-meama-gold/10"
      aria-label="toggle language"
    >
      {i18n.language === "ka" ? "EN" : "ქარ"}
    </button>
  );
}

function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside className="flex w-60 shrink-0 flex-col bg-meama-charcoal text-meama-cream">
      <div className="border-b border-meama-gold/15 px-5 py-5">
        <div className="text-base font-extrabold tracking-[0.12em] text-meama-gold">
          {t("app.name")}
        </div>
        <div className="mt-1 text-[11px] leading-snug text-meama-cream/50">{t("app.tagline")}</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-meama-gold/15 text-meama-gold"
                  : "text-meama-cream/70 hover:bg-white/5 hover:text-meama-cream"
              }`
            }
          >
            <NavIcon name={item.icon} />
            {t(`nav.${item.key}`)}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-meama-gold/15 px-5 py-3 text-[10px] uppercase tracking-wider text-meama-cream/35">
        Meama Georgia · Confidential
      </div>
    </aside>
  );
}

function Header() {
  const { t } = useTranslation();
  const criticalCount = ALERTS.filter((a) => a.severity === "critical").length;
  return (
    <header className="flex items-center justify-between border-b border-meama-brown/10 bg-white px-6 py-3">
      <div className="text-xs text-meama-muted">
        {t("header.lastSync")}:{" "}
        <span className="tabular font-medium text-meama-charcoal">12.06.2026, 02:11</span>
        <span className="mx-2 text-meama-gold">·</span>
        <span className="tabular">121,384 orders</span>
      </div>
      <div className="flex items-center gap-5">
        <LanguageToggle />
        <NavLink to="/alerts" aria-label={t("header.alerts")} className="relative text-meama-brown">
          <NavIcon name="bell" />
          {criticalCount > 0 ? (
            <span className="tabular absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-meama-red px-1 text-[10px] font-bold text-white">
              {criticalCount}
            </span>
          ) : null}
        </NavLink>
      </div>
    </header>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <div className="rise mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  // null = unknown (checking), true/false = resolved.
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
      // Dev shell with no Supabase configured — allow access to explore the UI.
      setAuthed(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthed(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setAuthed(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (authed === null) {
    return <div className="p-6 text-meama-muted">…</div>;
  }
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><CommandCenter /></ProtectedRoute>} />
      <Route path="/money-hunter" element={<ProtectedRoute><MoneyHunter /></ProtectedRoute>} />
      <Route path="/ads" element={<ProtectedRoute><Ads /></ProtectedRoute>} />
      <Route path="/discount-engine" element={<ProtectedRoute><DiscountEngine /></ProtectedRoute>} />
      <Route path="/campaigns" element={<Navigate to="/discount-engine" replace />} />
      <Route path="/actions" element={<ProtectedRoute><Actions /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
      <Route path="/products/:categoryId" element={<ProtectedRoute><ProductCategory /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/customers/:id" element={<Navigate to="/portfolios" replace />} />
      <Route path="/portfolios" element={<ProtectedRoute><Portfolios /></ProtectedRoute>} />
      <Route path="/portfolios/:id" element={<ProtectedRoute><PortfolioDetail /></ProtectedRoute>} />
      <Route path="/stock" element={<ProtectedRoute><Stock /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
