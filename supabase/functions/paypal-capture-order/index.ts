import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

// Google exit (2026-10-27): branded invoice / Apps Script / Drive PDF step removed.
// Order number is assigned in Supabase via public.assign_order_number() (idempotent).
// Payment capture and verification logic unchanged from deployed version 17.

const allowedOrigins = new Set([
  "https://nexus.sciencebyhugs.com",
  "capacitor://localhost",
]);


async function qualifyReferral(
  admin: ReturnType<typeof createClient>,
  customerId: string | null,
  orderNumber: string | null,
) {
  if (!customerId) return;

  const { data: referral } = await admin
    .from("referrals")
    .select("id,referrer_id,qualified_at")
    .eq("referred_customer_id", customerId)
    .maybeSingle();

  if (!referral || referral.qualified_at) return;

  const qualifiedAt = new Date().toISOString();

  const { error: qualifyError } = await admin
    .from("referrals")
    .update({
      status: "qualified",
      qualified_at: qualifiedAt,
      converted_at: qualifiedAt,
      qualifying_order_number: orderNumber || null,
      updated_at: qualifiedAt,
    })
    .eq("id", referral.id)
    .is("qualified_at", null);

  if (qualifyError) return;

  const { count } = await admin
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", referral.referrer_id)
    .not("qualified_at", "is", null);

  if ((count || 0) >= 20) {
    const { data: membership } = await admin
      .from("memberships")
      .select("id")
      .eq("name", "Principal Scientist")
      .maybeSingle();

    if (membership?.id) {
      await admin
        .from("profiles")
        .update({ membership_id: membership.id })
        .eq("id", referral.referrer_id);
    }
  }
}


async function ensureOrderNumber(
  admin: ReturnType<typeof createClient>,
  order: { id: string; order_number: string | null },
): Promise<string | null> {
  if (order.order_number) return order.order_number;
  const { data, error } = await admin.rpc("assign_order_number", { p_order_id: order.id });
  if (error || !data) {
    await admin
      .from("orders")
      .update({
        admin_notes: "Payment captured successfully; order number assignment needs review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    return null;
  }
  return String(data);
}

// PayPal's 3D Secure recommended actions (Advanced Checkout "3D Secure response parameters").
// No authentication_result: the issuer did not require 3D Secure (SCA_WHEN_REQUIRED).
function threeDSecureDecision(auth: any): "continue" | "retry" | "stop" {
  if (!auth) return "continue";
  const liability = String(auth.liability_shift || "").toUpperCase();
  const enrollment = String(auth.three_d_secure?.enrollment_status || "").toUpperCase();
  const status = String(auth.three_d_secure?.authentication_status || "").toUpperCase();
  if (enrollment === "Y") {
    if ((status === "Y" || status === "A") && liability === "POSSIBLE") return "continue";
    if (status === "N" || status === "R") return "stop";
    return "retry";
  }
  if (enrollment === "N" || enrollment === "B") return "continue";
  if (enrollment === "U") return liability === "NO" ? "continue" : "retry";
  if (liability === "UNKNOWN") return "retry";
  return "continue";
}

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
  if (!response.ok || !data.access_token) throw new Error("Could not authenticate with PayPal");
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
    secretKeys.nexus_rotation_20261023,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Invalid session" }, 401);

  let body: { orderId?: string; paypalOrderId?: string; paymentMethod?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const orderId = String(body.orderId || "").trim();
  const paypalOrderId = String(body.paypalOrderId || "").trim();
  const requestedMethod = String(body.paymentMethod || "PayPal").trim();
  const requestedProvider = requestedMethod.toLowerCase();
  const provider =
    requestedProvider === "venmo" ? "Venmo" :
    requestedProvider === "card" ? "Card" :
    requestedProvider === "apple pay" || requestedProvider === "applepay" ? "Apple Pay" :
    "PayPal";

  if (!orderId || !paypalOrderId) {
    return json({ error: "Order ID and PayPal order ID are required" }, 400);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id,customer_number,first_name,last_name,email,phone,account_status,memberships(name)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) return json({ error: "Customer profile not found" }, 403);

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,order_number,customer_id,subtotal,discount_total,shipping_total,processing_fee_total,tax_total,total,payment_status,customer_notes,contact_method")
    .eq("id", orderId)
    .eq("customer_id", profile.id)
    .single();

  if (orderError || !order) return json({ error: "Order not found" }, 404);

  if (order.payment_status === "paid") {
    const existingNumber = await ensureOrderNumber(admin, order);
    return json({ success: true, alreadyPaid: true, orderId: order.id, orderNumber: existingNumber });
  }

  const { data: payment } = await admin
    .from("payments")
    .select("id,provider,provider_order_id,status")
    .eq("order_id", order.id)
    .maybeSingle();

  if (!payment || payment.provider !== provider || payment.provider_order_id !== paypalOrderId) {
    return json({ error: provider + " order does not match this Science By HUGs order" }, 409);
  }

  const accessToken = await getAccessToken();

  if (provider === "Card") {
    // Cards: the SDK reports success after 3D Secure whatever the bank decided, so check
    // PayPal's authentication result here, and only capture the total the customer
    // confirmed (card-checkout-quote sets it, including any credit-card surcharge).
    const detailsResponse = await fetch(
      `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const details = await detailsResponse.json();
    if (!detailsResponse.ok) return json({ error: "Could not verify this card payment. Please try again." }, 502);
    const decision = threeDSecureDecision(details?.payment_source?.card?.authentication_result);
    if (decision !== "continue") {
      return json({
        error: decision === "retry"
          ? "Your bank could not verify this card. Please try again."
          : "Your bank did not approve this card. Please use another card.",
        retry: decision === "retry",
      }, 402);
    }
    const held = Number(details?.purchase_units?.[0]?.amount?.value || 0);
    if (Math.abs(held - Number(order.total || 0)) > 0.001) {
      return json({ error: "Your total changed. Review it and confirm again." }, 409);
    }
  }

  const response = await fetch(
    `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        // Each card attempt is its own PayPal order, so key captures per PayPal order
        // (a retry with a new card must not replay the first card's decline).
        "PayPal-Request-Id": provider === "Card"
          ? `sbh-capture-${order.id}-${paypalOrderId}`
          : `sbh-capture-${order.id}`,
      },
      body: "{}",
    },
  );

  const captured = await response.json();

  if (!response.ok || captured?.status !== "COMPLETED") {
    return json({
      error: captured?.message || "PayPal capture was not completed",
    }, 502);
  }

  const capture =
    captured?.purchase_units?.[0]?.payments?.captures?.[0];

  const capturedValue = Number(capture?.amount?.value || 0);
  const currency = String(capture?.amount?.currency_code || "");
  const expectedValue = Number(order.total || 0);

  if (
    capture?.status !== "COMPLETED" ||
    currency !== "USD" ||
    Math.abs(capturedValue - expectedValue) > 0.001
  ) {
    return json({ error: "PayPal capture did not match the expected order total" }, 409);
  }

  const now = new Date().toISOString();
  const captureId = String(capture.id || "");

  const { error: paymentError } = await admin
    .from("payments")
    .update({
      provider_capture_id: captureId || null,
      payment_reference: captureId || paypalOrderId,
      status: "verified",
      submitted_at: now,
      verified_at: now,
      verified_by: user.id,
      paid_at: now,
      updated_at: now,
    })
    .eq("id", payment.id);

  if (paymentError) {
    return json({ error: "Payment captured, but Science By HUGs payment sync needs review" }, 500);
  }

  await admin
    .from("orders")
    .update({
      payment_method: provider,
      payment_status: "paid",
      paid_at: now,
      status: "processing",
      updated_at: now,
    })
    .eq("id", order.id);

  const orderNumber = await ensureOrderNumber(admin, order);

  await qualifyReferral(admin, order.customer_id, orderNumber);

  // Legacy: keep historical invoice rows in step if one already exists. No new invoices are created.
  const { data: invoice } = await admin
    .from("invoices")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();

  if (invoice?.id) {
    await admin
      .from("invoices")
      .update({ payment_method: provider, paid_at: now })
      .eq("id", invoice.id);

    await admin
      .from("invoice_events")
      .insert({
        invoice_id: invoice.id,
        event_type:
          provider === "Venmo" ? "venmo_payment_captured" :
          provider === "Card" ? "card_payment_captured" :
          provider === "Apple Pay" ? "apple_pay_payment_captured" :
          "paypal_payment_captured",
        description: provider + " payment captured in Nexus and order moved to processing.",
        metadata: {
          source:
            provider === "Venmo" ? "nexus_venmo" :
            provider === "Card" ? "nexus_card" :
            provider === "Apple Pay" ? "nexus_apple_pay" :
            "nexus_paypal",
          provider,
          paypalOrderId,
          captureId,
          amount: capturedValue,
          currency,
        },
      });
  }

  return json({
    success: true,
    orderId: order.id,
    paypalOrderId,
    captureId,
    amount: capturedValue,
    currency,
    status: "paid",
    provider,
    orderNumber,
    invoicePdfReady: false,
    invoiceSyncError: null,
  });
});
