/**
 * PBSN — Supabase Client Initializer
 * Loads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY dynamically from /api/config
 * (backed by .env) — zero keys or secrets hardcoded in frontend source files.
 */
(function (global) {
  "use strict";

  let clientPromise = null;

  async function loadConfig() {
    if (global.__PBSN_ENV__ && global.__PBSN_ENV__.VITE_SUPABASE_URL && global.__PBSN_ENV__.VITE_SUPABASE_ANON_KEY) {
      return global.__PBSN_ENV__;
    }
    const base = window.location.protocol.startsWith("http") ? "" : "http://127.0.0.1:8000";
    const res = await fetch(`${base}/api/config`);
    if (!res.ok) {
      throw new Error("Unable to load Supabase runtime config from /api/config.");
    }
    const cfg = await res.json();
    if (!cfg.VITE_SUPABASE_URL || !cfg.VITE_SUPABASE_ANON_KEY) {
      throw new Error("VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in .env.");
    }
    global.__PBSN_ENV__ = cfg;
    return cfg;
  }

  async function getSupabase() {
    if (!clientPromise) {
      clientPromise = (async () => {
        if (!global.supabase || !global.supabase.createClient) {
          throw new Error("Supabase JS SDK not loaded. Check internet access or script tag.");
        }
        const cfg = await loadConfig();
        return global.supabase.createClient(cfg.VITE_SUPABASE_URL, cfg.VITE_SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
          }
        });
      })().catch((err) => {
        clientPromise = null;
        throw err;
      });
    }
    return clientPromise;
  }

  global.PBSN_SUPABASE = { getSupabase, loadConfig };
})(window);
