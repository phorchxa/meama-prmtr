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
import ProductDetail from "./pages/ProductDetail";
import Products from "./pages/Products";
import Reports from "./pages/Reports";
import Stock from "./pages/Stock";

const NAV_ITEMS = [
  { to: "/", key: "command", end: true },
  { to: "/money-hunter", key: "moneyHunter" },
  { to: "/ads", key: "ads" },
  { to: "/discount-engine", key: "discount" },
  { to: "/actions", key: "actions" },
  { to: "/products", key: "products" },
  { to: "/customers", key: "customers" },
  { to: "/portfolios", key: "portfolios" },
  { to: "/stock", key: "stock" },
  { to: "/reports", key: "reports" },
  { to: "/alerts", key: "alerts" },
] as const;

function BellIcon() {
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
    >
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

/** Animated coffee steam, floating above the wordmark. */
function Steam() {
  return (
    <svg
      className="steam mx-auto block"
      width="44"
      height="22"
      viewBox="0 0 44 22"
      fill="none"
      stroke="var(--meama-gold)"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M10 20 q 4 -5 0 -9 q -4 -5 0 -9" opacity="0.5" />
      <path d="M22 20 q 4 -5 0 -9 q -4 -5 0 -9" opacity="0.7" />
      <path d="M34 20 q 4 -5 0 -9 q -4 -5 0 -9" opacity="0.5" />
    </svg>
  );
}

function LanguageToggle() {
  const { i18n } = useTranslation();
  const next = i18n.language === "ka" ? "en" : "ka";
  return (
    <button
      onClick={() => void i18n.changeLanguage(next)}
      className="rounded-full border border-meama-gold/40 px-3 py-1 text-xs font-semibold text-meama-goldsoft transition-colors hover:bg-meama-gold/15"
      aria-label="toggle language"
    >
      {i18n.language === "ka" ? "EN" : "ქარ"}
    </button>
  );
}

function Header() {
  const { t } = useTranslation();
  const criticalCount = ALERTS.filter((a) => a.severity === "critical").length;
  return (
    <header className="relative border-b border-meama-gold/20 bg-meama-espresso/80 pb-4 pt-5 backdrop-blur">
      {/* Utility corner — language + alerts. */}
      <div className="absolute right-5 top-5 flex items-center gap-4">
        <LanguageToggle />
        <NavLink to="/alerts" aria-label={t("header.alerts")} className="relative text-meama-goldsoft hover:text-meama-gold">
          <BellIcon />
          {criticalCount > 0 ? (
            <span className="tabular absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-meama-red px-1 text-[10px] font-bold text-white">
              {criticalCount}
            </span>
          ) : null}
        </NavLink>
      </div>

      {/* Centered wordmark. */}
      <div className="text-center">
        <Steam />
        <NavLink to="/" className="inline-block">
          <span className="font-display text-[28px] font-bold tracking-[0.18em] text-meama-gold">
            MEAMA PRMTR
          </span>
        </NavLink>
        <div className="mt-0.5 text-[11px] italic tracking-wide text-meama-cream/45">
          {t("app.tagline")}
        </div>
      </div>

      {/* Centered tab navigation. */}
      <nav className="mx-auto mt-4 flex max-w-5xl flex-wrap items-center justify-center gap-1.5 px-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            className={({ isActive }) =>
              `rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all duration-200 ${
                isActive
                  ? "bg-meama-gold text-meama-espresso shadow-[0_6px_18px_rgba(200,150,62,0.35)]"
                  : "text-meama-cream/65 hover:bg-meama-gold/15 hover:text-meama-goldsoft"
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

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 px-5 py-8">
        <div className="rise mx-auto max-w-6xl">{children}</div>
      </main>
      <footer className="border-t border-meama-gold/15 py-4 text-center text-[10px] uppercase tracking-[0.2em] text-meama-cream/30">
        Meama Georgia · Confidential · 2026
      </footer>
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
    return <div className="p-6 text-meama-cream/50">…</div>;
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
      <Route path="/products/:sku" element={<ProtectedRoute><ProductDetail /></ProtectedRoute>} />
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
