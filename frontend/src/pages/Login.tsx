import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!isSupabaseConfigured) {
        navigate("/");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-meama-espresso px-6">
      {/* Wordmark */}
      <div className="mb-14 text-center fade-in">
        <div className="font-display text-[72px] uppercase leading-none tracking-[0.1em] text-meama-brown">
          MEAMA PRMTR
        </div>
        <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.42em] text-meama-muted">
          {t("app.tagline")}
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={onSubmit}
        className="rise w-full max-w-xs border border-meama-charcoal bg-meama-ivory p-8"
        style={{ animationDelay: "0.15s" }}
      >
        <p className="mb-6 font-mono text-[9.5px] uppercase tracking-[0.28em] text-meama-muted">
          {t("pages.login.invite_only")}
        </p>

        <label className="mb-4 block">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-meama-muted">
            {t("pages.login.email")}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full border border-meama-charcoal bg-transparent px-3 py-2.5
                       font-mono text-sm text-meama-brown transition-colors duration-150
                       focus:border-meama-brown focus:outline-none"
          />
        </label>

        <label className="mb-6 block">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-meama-muted">
            {t("pages.login.password")}
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full border border-meama-charcoal bg-transparent px-3 py-2.5
                       font-mono text-sm text-meama-brown transition-colors duration-150
                       focus:border-meama-brown focus:outline-none"
          />
        </label>

        {error ? (
          <p className="mb-4 font-mono text-[10px] text-meama-red">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full border border-meama-brown bg-transparent py-3 font-display
                     text-[18px] uppercase tracking-[0.2em] text-meama-brown
                     transition-all duration-200 hover:bg-meama-brown hover:text-meama-espresso
                     disabled:opacity-40"
        >
          {loading ? "···" : t("pages.login.submit")}
        </button>
      </form>

      <div className="mt-10 font-mono text-[9px] uppercase tracking-[0.3em] text-meama-charcoal fade-in"
           style={{ animationDelay: "0.3s" }}>
        Meama Georgia · Confidential · 2026
      </div>
    </div>
  );
}
