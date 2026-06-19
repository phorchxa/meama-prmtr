import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { isSupabaseConfigured, supabase } from "./lib/supabase";
import Actions from "./pages/Actions";
import Alerts from "./pages/Alerts";
import CommandCenter from "./pages/CommandCenter";
import CustomerDetail from "./pages/CustomerDetail";
import Customers from "./pages/Customers";
import Campaigns from "./pages/Campaigns";
import Login from "./pages/Login";
import MoneyHunter from "./pages/MoneyHunter";
import PortfolioDetail from "./pages/PortfolioDetail";
import Portfolios from "./pages/Portfolios";
import Sessions from "./pages/Sessions";
import ProductDetail from "./pages/ProductDetail";
import Products from "./pages/Products";
import Reports from "./pages/Reports";
import Stock from "./pages/Stock";

const NAV_ITEMS = [
  { to: "/", key: "command", end: true },
  { to: "/money-hunter", key: "moneyHunter" },
  { to: "/campaigns", key: "campaigns" },
  { to: "/actions", key: "actions" },
  { to: "/products", key: "products" },
  { to: "/customers", key: "customers" },
  { to: "/portfolios", key: "portfolios" },
  { to: "/sessions", key: "sessions" },
  { to: "/stock", key: "stock" },
  { to: "/reports", key: "reports" },
  { to: "/alerts", key: "alerts" },
] as const;

/* ── Custom cursor — plain 8px dot, no trailing ring ──────────── */
function CursorFollower() {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      dotRef.current && (dotRef.current.style.transform = `translate3d(${e.clientX - 4}px,${e.clientY - 4}px,0)`);
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  return <div ref={dotRef} className="cursor-dot" />;
}

/* ── Language toggle ─────────────────────────────────────────────── */
function LanguageToggle() {
  const { i18n } = useTranslation();
  const next = i18n.language === "ka" ? "en" : "ka";
  return (
    <button
      onClick={() => void i18n.changeLanguage(next)}
      className="font-mono text-[10px] uppercase tracking-[0.22em] text-meama-muted transition-colors hover:text-meama-brown"
      aria-label="toggle language"
    >
      {i18n.language === "ka" ? "EN" : "ქარ"}
    </button>
  );
}

/* ── Alerts bell ──────────────────────────────────────────────────── */
function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

/* ── Header ───────────────────────────────────────────────────────── */
function Header() {
  const { t } = useTranslation();
  const [criticalCount, setCriticalCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  // Fetch real alert count from API — non-blocking, fails silently
  useEffect(() => {
    const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
    fetch(`${BASE}/api/v1/alerts`)
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((data: { items: Array<{ severity: string }> }) => {
        setCriticalCount(data.items.filter((a) => a.severity === "critical").length);
      })
      .catch(() => { /* no API — badge stays at 0 */ });
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-meama-espresso transition-shadow duration-300 ${
        scrolled ? "shadow-[0_1px_0_#D8D4CE]" : "border-b border-meama-charcoal"
      }`}
    >
      {/* Top bar: wordmark + utils */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <NavLink to="/" className="group flex items-baseline gap-3">
          <span
            className="font-display text-[32px] uppercase leading-none tracking-[0.12em] text-meama-brown
                       transition-opacity duration-200 group-hover:opacity-70"
          >
            MEAMA PRMTR
          </span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.35em] text-meama-muted sm:block">
            {t("app.tagline")}
          </span>
        </NavLink>

        <div className="flex items-center gap-5">
          <LanguageToggle />
          <NavLink
            to="/alerts"
            aria-label={t("header.alerts")}
            className="relative text-meama-muted transition-colors hover:text-meama-brown"
          >
            <BellIcon />
            {criticalCount > 0 ? (
              <span
                className="tabular absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center
                           rounded-full bg-meama-red px-1 text-[9px] font-bold text-white"
              >
                {criticalCount}
              </span>
            ) : null}
          </NavLink>
        </div>
      </div>

      {/* Nav row */}
      <nav className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-1 px-6 pb-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            className={({ isActive }) =>
              `nav-underline pb-0.5 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors duration-150 ${
                isActive ? "active text-meama-brown" : "text-meama-muted hover:text-meama-brown"
              }`
            }
          >
            {t(`nav.${item.key}`)}
          </NavLink>
        ))}
      </nav>
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

/* ── Layout ───────────────────────────────────────────────────────── */
function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-meama-espresso">
      <Header />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-7xl">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <footer className="border-t border-meama-charcoal py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
          <span className="font-display text-[13px] uppercase tracking-[0.18em] text-meama-muted">
            Meama Georgia
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-meama-charcoal">
            Confidential · 2026
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ── Auth guard ────────────────────────────────────────────────────── */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) {
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-meama-espresso">
        <div className="pulse-live h-2 w-2 rounded-full bg-meama-brown" />
      </div>
    );
  }
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Layout>{children}</Layout>;
}

/* ── Root ────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <>
      <CursorFollower />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><CommandCenter /></ProtectedRoute>} />
        <Route path="/money-hunter" element={<ProtectedRoute><MoneyHunter /></ProtectedRoute>} />
        <Route path="/ads" element={<Navigate to="/campaigns" replace />} />
        <Route path="/discount-engine" element={<Navigate to="/campaigns" replace />} />
        <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
        <Route path="/actions" element={<ProtectedRoute><Actions /></ProtectedRoute>} />
        <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
        <Route path="/products/:sku" element={<ProtectedRoute><ProductDetail /></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
        <Route path="/portfolios" element={<ProtectedRoute><Portfolios /></ProtectedRoute>} />
        <Route path="/sessions" element={<ProtectedRoute><Sessions /></ProtectedRoute>} />
        <Route path="/portfolios/:id" element={<ProtectedRoute><PortfolioDetail /></ProtectedRoute>} />
        <Route path="/stock" element={<ProtectedRoute><Stock /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
