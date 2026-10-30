import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const allowedOrigins = new Set([
  "https://nexus.sciencebyhugs.com",
  "capacitor://localhost",
]);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = {
    ...(allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!);

  const client = createClient(
    supabaseUrl,
    publishableKeys.default,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return json({ error: "Invalid session" }, 401);

  const displayName = (Deno.env.get("ZELLE_DISPLAY_NAME") || "").trim();
  const contact = (Deno.env.get("ZELLE_CONTACT") || "").trim();
  const qrUrl = (Deno.env.get("ZELLE_QR_URL") || "").trim();

  if (!contact) {
    return json({
      success: false,
      configured: false,
      error: "Zelle is not configured yet",
    }, 503);
  }

  return json({
    success: true,
    configured: true,
    displayName: displayName || "Science By HUGs",
    contact,
    qrUrl: qrUrl || null,
  });
});
