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

    const loc = global.location || { protocol: "http:", hostname: "localhost" };
    const isHttp = String(loc.protocol || "").startsWith("http");
    const isLocalHost =
      !isHttp ||
      loc.hostname === "localhost" ||
      loc.hostname === "127.0.0.1";

    const candidates = isHttp
      ? isLocalHost
        ? ["/api/config", "http://127.0.0.1:5173/api/config", "http://localhost:5173/api/config"]
        : ["/api/config"]
      : ["http://127.0.0.1:5173/api/config", "http://localhost:5173/api/config"];

    const fetchFn = global.fetch;
    if (typeof fetchFn !== "function") {
      throw new Error("Fetch API unavailable in current runtime.");
    }

    let lastErr = null;
    for (const url of candidates) {
      try {
        const res = await fetchFn(url, { cache: "no-store" });
        if (!res.ok) {
          let errBody = "";
          try {
            const j = await res.json();
            if (j && j.error) errBody = j.error;
          } catch {}
          lastErr = new Error(errBody || `HTTP ${res.status} from ${url}`);
          continue;
        }
        const cfg = await res.json();
        if (!cfg.VITE_SUPABASE_URL || !cfg.VITE_SUPABASE_ANON_KEY) {
          lastErr = new Error("VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in environment config.");
          continue;
        }
        global.__PBSN_ENV__ = cfg;
        return cfg;
      } catch (err) {
        lastErr = err;
      }
    }

    throw new Error(
      isLocalHost
        ? `Unable to load Supabase runtime config (${lastErr ? lastErr.message : "Failed to fetch"}). Start PBSN with start_pbsn.bat and open http://localhost:5173.`
        : `Unable to load Supabase runtime config (${lastErr ? lastErr.message : "Failed to fetch"}). Ensure /api/config returns VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`
    );
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
            detectSessionInUrl: true
          }
        });
      })().catch((err) => {
        clientPromise = null;
        throw err;
      });
    }
    return clientPromise;
  }

  function resetClientForTests() {
    clientPromise = null;
    delete global.__PBSN_ENV__;
  }

  global.PBSN_SUPABASE = { getSupabase, loadConfig, resetClientForTests };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.PBSN_SUPABASE;
  }
})(typeof window !== "undefined" ? window : globalThis);
