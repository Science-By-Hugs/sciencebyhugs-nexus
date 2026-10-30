import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

// Google exit (2026-10-27): new checkout orders no longer get a Google invoice row,
// so Zelle submission no longer requires one. Legacy invoice-based orders keep
// their original rules. Base: deployed version 11.

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
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!);

  const userClient = createClient(
    supabaseUrl,
    publishableKeys.default,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const admin = createClient(
    supabaseUrl,
    secretKeys.nexus_rotation_20261023,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Invalid session" }, 401);

  let body: { orderId?: string; confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const orderId = String(body.orderId || "").trim();
  const confirmation = String(body.confirmation || "").trim();

  if (!orderId) return json({ error: "Order ID is required" }, 400);

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) return json({ error: "Customer profile not found" }, 403);

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,order_number,customer_id,total,status,payment_status")
    .eq("id", orderId)
    .eq("customer_id", profile.id)
    .single();

  if (orderError || !order) return json({ error: "Order not found" }, 404);

  const { data: invoice } = await admin
    .from("invoices")
    .select("id,invoice_number,send_status,status")
    .eq("order_id", order.id)
    .maybeSingle();

  if (invoice) {
    // Legacy invoice-based orders: unchanged rule.
    const directCheckout = invoice.status === "direct_checkout";
    if (!directCheckout && invoice.send_status !== "sent") {
      return json({ error: "Invoice must be sent before Zelle pay-later submission" }, 409);
    }
  } else if (order.status !== "checkout_pending") {
    // New receipt-era orders: only an order created by checkout can take a Zelle submission.
    return json({ error: "This order is not awaiting a Zelle payment" }, 409);
  }

  if (order.payment_status === "paid") {
    return json({ error: "Order is already paid" }, 409);
  }

  const { data: existing } = await admin
    .from("payments")
    .select("id,status,provider")
    .eq("order_id", order.id)
    .maybeSingle();

  if (existing?.status === "verified") {
    return json({ error: "Verified payment cannot be replaced" }, 409);
  }

  const now = new Date().toISOString();

  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .upsert(
      {
        order_id: order.id,
        customer_id: order.customer_id,
        provider: "Zelle",
        provider_order_id: null,
        provider_capture_id: null,
        payment_reference: confirmation || null,
        amount: Number(order.total || 0),
        status: "submitted",
        notes: "Customer reported Zelle payment sent through Nexus.",
        submitted_at: now,
        verified_at: null,
        verified_by: null,
        paid_at: null,
        updated_at: now,
      },
      { onConflict: "order_id" },
    )
    .select("id,order_id,provider,payment_reference,amount,status,submitted_at")
    .single();

  if (paymentError || !payment) {
    return json({ error: "Could not record Zelle payment submission" }, 500);
  }

  await admin
    .from("orders")
    .update({
      payment_method: "Zelle",
      payment_status: "submitted",
      updated_at: now,
    })
    .eq("id", order.id);

  if (invoice?.id) {
    await admin
      .from("invoices")
      .update({ payment_method: "Zelle" })
      .eq("id", invoice.id);

    await admin
      .from("invoice_events")
      .insert({
        invoice_id: invoice.id,
        event_type: "zelle_payment_submitted",
        description: "Customer reported Zelle payment sent through Nexus.",
        metadata: {
          source: "nexus_zelle",
          submittedBy: user.id,
          hasConfirmation: Boolean(confirmation),
        },
      });
  }

  return json({
    success: true,
    orderId: order.id,
    orderNumber: order.order_number || null,
    payment,
  });
});
