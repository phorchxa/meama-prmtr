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
        // Dev shell: no Supabase configured — allow entry to explore the UI.
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
    <div className="flex min-h-screen items-center justify-center bg-meama-cream p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-meama-gold/30 bg-white p-8 shadow"
      >
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-meama-brown">MEAMA PRMTR</div>
          <p className="mt-1 text-sm text-meama-muted">{t("pages.login.invite_only")}</p>
        </div>
        <label className="mb-3 block text-sm">
          <span className="text-meama-muted">{t("pages.login.email")}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-meama-gold/40 px-3 py-2"
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="text-meama-muted">{t("pages.login.password")}</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-meama-gold/40 px-3 py-2"
          />
        </label>
        {error ? <p className="mb-3 text-sm text-meama-red">⚠️ {error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-meama-brown px-4 py-2 font-medium text-meama-cream hover:bg-meama-brown/90 disabled:opacity-60"
        >
          {loading ? t("common.loading") : t("pages.login.submit")}
        </button>
      </form>
    </div>
  );
}
