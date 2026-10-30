import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const allowedOrigins = new Set([
  "https://nexus.sciencebyhugs.com",
  "capacitor://localhost",
]);

function paypalBaseUrl() {
  return (Deno.env.get("PAYPAL_ENV") || "sandbox").toLowerCase() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET") || "";
  if (!clientId || !secret) throw new Error("PayPal credentials are not configured");

  const auth = btoa(`${clientId}:${secret}`);
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error("Could not authenticate with PayPal");
  }

  return data.access_token as string;
}

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
    secretKeys.default,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Invalid session" }, 401);

  let body: { orderId?: string; paymentMethod?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const orderId = String(body.orderId || "").trim();
  const requestedMethod = String(body.paymentMethod || "PayPal").trim();
  const requestedProvider = requestedMethod.toLowerCase();
  const provider =
    requestedProvider === "venmo" ? "Venmo" :
    requestedProvider === "apple pay" || requestedProvider === "applepay" ? "Apple Pay" :
    "PayPal";

  if (!orderId) return json({ error: "Order ID is required" }, 400);
  if (!["PayPal", "Venmo", "Apple Pay"].includes(provider)) {
    return json({ error: "Unsupported payment method" }, 400);
  }

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

  const directCheckout =
    invoice?.status === "direct_checkout" ||
    (!invoice && String(order.status || "").toLowerCase() === "checkout_pending");

  if (!directCheckout && (!invoice || invoice.send_status !== "sent")) {
    return json({ error: "Invoice must be sent before pay-later checkout" }, 409);
  }

  if (order.payment_status === "paid") {
    return json({ error: "Order is already paid" }, 409);
  }

  const { data: existingPayment } = await admin
    .from("payments")
    .select("id,status,provider,provider_order_id")
    .eq("order_id", order.id)
    .maybeSingle();

  if (
    existingPayment?.provider === provider &&
    existingPayment?.provider_order_id &&
    ["paypal_created", "venmo_created", "applepay_created", "submitted"].includes(String(existingPayment.status))
  ) {
    return json({
      success: true,
      orderId: existingPayment.provider_order_id,
      reused: true,
    });
  }

  const accessToken = await getAccessToken();

  const amount = Number(order.total || 0).toFixed(2);

  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `sbh-create-${order.id}-${provider.toLowerCase()}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: order.id,
          custom_id: order.order_number || order.id,
          ...(directCheckout ? {} : { invoice_id: invoice!.invoice_number }),
          description: directCheckout
            ? `Science By HUGs order ${order.order_number || order.id}`
            : `Science By HUGs invoice ${invoice!.invoice_number}`,
          amount: {
            currency_code: "USD",
            value: amount,
          },
        },
      ],
    }),
  });

  const paypalOrder = await response.json();

  if (!response.ok || !paypalOrder?.id) {
    return json({
      error: paypalOrder?.message || "PayPal order creation failed",
    }, 502);
  }

  const now = new Date().toISOString();

  const { error: paymentError } = await admin
    .from("payments")
    .upsert(
      {
        order_id: order.id,
        customer_id: order.customer_id,
        provider,
        provider_order_id: paypalOrder.id,
        provider_capture_id: null,
        payment_reference: null,
        amount: Number(order.total || 0),
        status:
          provider === "Venmo" ? "venmo_created" :
          provider === "Apple Pay" ? "applepay_created" :
          "paypal_created",
        updated_at: now,
      },
      { onConflict: "order_id" },
    );

  if (paymentError) {
    return json({ error: "PayPal order created, but payment tracking could not be saved" }, 500);
  }

  await admin
    .from("orders")
    .update({
      payment_method: provider,
      payment_status:
        provider === "Venmo" ? "venmo_pending" :
        provider === "Apple Pay" ? "applepay_pending" :
        "paypal_pending",
      updated_at: now,
    })
    .eq("id", order.id);

  return json({
    success: true,
    orderId: paypalOrder.id,
    provider,
  });
});
