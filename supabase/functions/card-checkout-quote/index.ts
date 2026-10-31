import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

// card-checkout-quote — final total for an in-app card payment, shown to the customer
// before anything is charged.
//
// Flow: create-checkout-order (Card, no fee) -> paypal-create-order (Card) -> the app
// approves the card with the PayPal iOS SDK (incl. 3D Secure) -> THIS FUNCTION ->
// customer confirms -> paypal-capture-order (Card).
//
// A credit-card surcharge applies to CREDIT cards only (never DEBIT, PREPAID or unknown
// types) and is the lower of SURCHARGE_RATE and PayPal's actual card cost to the
// merchant, so it never exceeds the cost of acceptance. Tax is computed exactly as
// create-checkout-order does (on merchandise + fee). The PayPal order amount is
// replaced with the new total while the order is APPROVED and not yet captured.

const allowedOrigins = new Set([
  "https://nexus.sciencebyhugs.com",
  "capacitor://localhost",
]);

const SURCHARGE_RATE = 0.03;
// PayPal Advanced Credit and Debit Card Payments, US (paypal.com/us/business/paypal-business-fees, Oct 2026).
const PAYPAL_CARD_RATE = 0.0289;
const PAYPAL_CARD_FIXED = 0.29;
const TAX_RATE = 0.08;

const money = (value: number) => Math.round(value * 100) / 100;

function creditCardSurcharge(taxableMerchandise: number): number {
  if (taxableMerchandise <= 0) return 0;
  return money(Math.min(
    taxableMerchandise * SURCHARGE_RATE,
    taxableMerchandise * PAYPAL_CARD_RATE + PAYPAL_CARD_FIXED,
  ));
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

  const userClient = createClient(supabaseUrl, publishableKeys.default, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, secretKeys.nexus_rotation_20261023, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Invalid session" }, 401);

  let body: { orderId?: string; paypalOrderId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  const orderId = String(body.orderId || "").trim();
  const paypalOrderId = String(body.paypalOrderId || "").trim();
  if (!orderId || !paypalOrderId) return json({ error: "Order ID and PayPal order ID are required" }, 400);

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!profile) return json({ error: "Customer profile not found" }, 403);

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,order_number,customer_id,subtotal,discount_total,shipping_total,processing_fee_total,tax_total,total,payment_status")
    .eq("id", orderId)
    .eq("customer_id", profile.id)
    .single();
  if (orderError || !order) return json({ error: "Order not found" }, 404);
  if (order.payment_status === "paid") return json({ error: "Order is already paid" }, 409);

  const { data: payment } = await admin
    .from("payments")
    .select("id,provider,provider_order_id,status")
    .eq("order_id", order.id)
    .maybeSingle();
  if (!payment || payment.provider !== "Card" || payment.provider_order_id !== paypalOrderId) {
    return json({ error: "Card payment does not match this Science By HUGs order" }, 409);
  }

  const accessToken = await getAccessToken();
  const detailsResponse = await fetch(
    `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const details = await detailsResponse.json();
  if (!detailsResponse.ok) return json({ error: "Could not verify this card. Please try again." }, 502);
  if (details?.status !== "APPROVED") {
    return json({ error: "This card was not approved. Please enter it again.", retry: true }, 409);
  }

  const card = details?.payment_source?.card || {};
  const decision = threeDSecureDecision(card.authentication_result);
  if (decision !== "continue") {
    return json({
      error: decision === "retry"
        ? "Your bank could not verify this card. Please try again."
        : "Your bank did not approve this card. Please use another card.",
      retry: decision === "retry",
    }, 402);
  }

  const cardType = String(card.type || "UNKNOWN").toUpperCase();
  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount_total || 0);
  const shipping = Number(order.shipping_total || 0);
  const taxableMerchandise = money(Math.max(0, subtotal - discount));
  const surcharge = cardType === "CREDIT" ? creditCardSurcharge(taxableMerchandise) : 0;
  const tax = money((taxableMerchandise + surcharge) * TAX_RATE);
  const total = money(subtotal - discount + shipping + surcharge + tax);

  const held = Number(details?.purchase_units?.[0]?.amount?.value || 0);
  if (Math.abs(held - total) > 0.001) {
    const patch = await fetch(
      `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify([{
          op: "replace",
          path: `/purchase_units/@reference_id=='${order.id}'/amount`,
          value: { currency_code: "USD", value: total.toFixed(2) },
        }]),
      },
    );
    if (!patch.ok) return json({ error: "Could not prepare your card total. Please try again." }, 502);
  }

  const now = new Date().toISOString();
  const { error: orderUpdateError } = await admin
    .from("orders")
    .update({ processing_fee_total: surcharge, tax_total: tax, total, updated_at: now })
    .eq("id", order.id)
    .neq("payment_status", "paid");
  if (orderUpdateError) return json({ error: "Could not save your card total. Please try again." }, 500);
  await admin.from("payments").update({ amount: total, updated_at: now }).eq("id", payment.id);

  return json({
    success: true,
    orderId: order.id,
    orderNumber: order.order_number || "",
    card: {
      brand: String(card.brand || ""),
      lastDigits: String(card.last_digits || ""),
      type: cardType,
    },
    totals: { subtotal, discount, shipping, surcharge, tax, total },
  });
});
