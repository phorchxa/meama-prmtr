import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AlertBell } from "./components/AlertBadge";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import Actions from "./pages/Actions";
import Ads from "./pages/Ads";
import Alerts from "./pages/Alerts";
import Campaigns from "./pages/Campaigns";
import CustomerDetail from "./pages/CustomerDetail";
import Customers from "./pages/Customers";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Products from "./pages/Products";
import Reports from "./pages/Reports";
import Stock from "./pages/Stock";

const NAV_ITEMS = [
  { to: "/", key: "overview", icon: "📊", end: true },
  { to: "/customers", key: "customers", icon: "👥" },
  { to: "/products", key: "products", icon: "📦" },
  { to: "/stock", key: "stock", icon: "🏷️" },
  { to: "/campaigns", key: "campaigns", icon: "📣" },
  { to: "/ads", key: "ads", icon: "💸" },
  { to: "/reports", key: "reports", icon: "📑" },
  { to: "/alerts", key: "alerts", icon: "🔔" },
  { to: "/actions", key: "actions", icon: "✅" },
] as const;

function LanguageToggle() {
  const { i18n } = useTranslation();
  const next = i18n.language === "ka" ? "en" : "ka";
  return (
    <button
      onClick={() => void i18n.changeLanguage(next)}
      className="rounded border border-meama-gold/40 px-2 py-1 text-xs font-medium text-meama-brown hover:bg-meama-cream"
      aria-label="toggle language"
    >
      {i18n.language === "ka" ? "EN" : "ქარ"}
    </button>
  );
}

function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-meama-gold/30 bg-meama-brown text-meama-cream">
      <div className="px-5 py-5">
        <div className="text-lg font-bold tracking-wide">{t("app.name")}</div>
        <div className="text-xs text-meama-gold">{t("app.tagline")}</div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded px-3 py-2 text-sm ${
                isActive
                  ? "bg-meama-gold text-meama-brown font-semibold"
                  : "text-meama-cream/90 hover:bg-white/10"
              }`
            }
          >
            <span aria-hidden="true">{item.icon}</span>
            {t(`nav.${item.key}`)}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function Header() {
  const { t } = useTranslation();
  return (
    <header className="flex items-center justify-between border-b border-meama-gold/30 bg-white px-6 py-3">
      <div className="text-sm font-medium text-meama-muted">{t("app.name")}</div>
      <div className="flex items-center gap-4">
        <LanguageToggle />
        <NavLink to="/alerts" aria-label={t("header.alerts")}>
          <AlertBell count={0} />
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
        <main className="flex-1 overflow-auto p-6">{children}</main>
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
      <Route path="/" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
      <Route path="/stock" element={<ProtectedRoute><Stock /></ProtectedRoute>} />
      <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
      <Route path="/ads" element={<ProtectedRoute><Ads /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
      <Route path="/actions" element={<ProtectedRoute><Actions /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
