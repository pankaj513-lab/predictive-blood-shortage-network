/**
 * Vercel Serverless Function: GET /api/config
 * Exposes ONLY public client-side Supabase config from Vercel Environment Variables.
 * NEVER expose SUPABASE_SERVICE_ROLE_KEY or private secrets here.
 */
module.exports = function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || "").trim();
  const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({
      error: "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in Vercel Environment Variables."
    });
  }

  return res.status(200).json({
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey
  });
};
