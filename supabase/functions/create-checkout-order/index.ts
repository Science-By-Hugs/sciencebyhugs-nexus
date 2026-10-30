import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

// Google exit (2026-10-27): no Apps Script / Sheets / Drive calls.
// Order numbers are assigned in Supabase via public.assign_order_number().
// Base: deployed version 14.

const allowedOrigins = new Set([
  "https://nexus.sciencebyhugs.com",
  "capacitor://localhost",
]);

const money = (value: number) => Math.round(value * 100) / 100;

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

  const { data: runtimeConfigRow, error: runtimeConfigError } = await admin
    .from("internal_runtime_config")
    .select("value")
    .eq("key", "checkout")
    .single();

  if (runtimeConfigError || !runtimeConfigRow?.value) {
    return json({ error: "Checkout configuration unavailable" }, 503);
  }

  const runtimeConfig = runtimeConfigRow.value as {
    shippingRates?: Record<string, number>;
    foundingMemberFreeShippingSource?: string;
  };
  const SHIPPING_RATES = runtimeConfig.shippingRates || {};
  const FREE_SHIPPING_SOURCE = String(runtimeConfig.foundingMemberFreeShippingSource || "").trim();

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Invalid session" }, 401);
  if (!user.email_confirmed_at) return json({ error: "Verified email required" }, 403);

  let body: {
    items?: Array<{ productId?: string; quantity?: number }>;
    policyAcknowledged?: boolean;
    contactMethod?: string | null;
    customerNotes?: string | null;
    discountCode?: string | null;
    paymentMethod?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  if (body.policyAcknowledged !== true) {
    return json({ error: "Policy acknowledgment is required" }, 400);
  }

  const requestedPaymentMethod = String(body.paymentMethod || "").trim().toLowerCase();
  const paymentMethod =
    requestedPaymentMethod === "paypal" ? "PayPal" :
    requestedPaymentMethod === "venmo" ? "Venmo" :
    requestedPaymentMethod === "apple pay" || requestedPaymentMethod === "applepay" ? "Apple Pay" :
    requestedPaymentMethod === "zelle" ? "Zelle" :
    null;

  if (!paymentMethod) {
    return json({ error: "Choose PayPal, Venmo, Apple Pay, or Zelle before starting checkout" }, 400);
  }

  const requestedItems = Array.isArray(body.items) ? body.items : [];
  if (!requestedItems.length) return json({ error: "Your cart is empty" }, 400);
  if (requestedItems.length > 5) {
    return json({ error: "Please limit an order to 5 different products" }, 400);
  }

  const quantityById = new Map<string, number>();
  for (const item of requestedItems) {
    const id = String(item.productId || "").trim();
    const quantity = Number(item.quantity);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return json({ error: "Invalid cart item" }, 400);
    }
    quantityById.set(id, (quantityById.get(id) || 0) + quantity);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,customer_number,first_name,last_name,email,phone,account_status,memberships(name)")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profile) return json({ error: "Customer profile not found" }, 404);
  if (String(profile.account_status || "").toLowerCase() !== "active") {
    return json({ error: "This customer account is not active" }, 403);
  }

  const productIds = [...quantityById.keys()];
  const { data: products, error: productError } = await admin
    .from("products")
    .select("id,name,product_code,price,active,storefront_status,shipping_from")
    .in("id", productIds);

  if (productError) return json({ error: "Catalog validation failed" }, 500);
  if (!products || products.length !== productIds.length) {
    return json({ error: "One or more products are no longer available" }, 409);
  }

  const validatedItems = [];
  for (const product of products) {
    if (!product.active || String(product.storefront_status || "").toLowerCase() !== "available") {
      return json({ error: `${product.name} is no longer available` }, 409);
    }

    const quantity = quantityById.get(product.id)!;
    const unitPrice = Number(product.price || 0);
    validatedItems.push({
      productId: product.id,
      productCode: product.product_code,
      productName: product.name,
      quantity,
      unitPrice,
      lineTotal: money(unitPrice * quantity),
      shippingFrom: product.shipping_from || "",
    });
  }

  const subtotal = money(validatedItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const membershipName = String(profile.memberships?.name || "");
  const isFoundingMember = membershipName.trim().toLowerCase() === "founding member";

  const shippingSources = new Set(
    validatedItems.map(item => item.shippingFrom.trim()).filter(Boolean),
  );

  let shipping = 0;
  for (const source of shippingSources) {
    if (isFoundingMember && FREE_SHIPPING_SOURCE && source.toLowerCase() === FREE_SHIPPING_SOURCE.toLowerCase()) continue;
    shipping += SHIPPING_RATES[source] || 0;
  }
  shipping = money(shipping);

  let discount = 0;
  let shippingDiscountApplied = 0;
  let discountCodeId: string | null = null;
  let discountCodeValue: string | null = null;
  let discountOneTime = false;
  const requestedDiscountCode = String(body.discountCode || "").trim();

  if (requestedDiscountCode) {
    const { data: discountEval, error: discountError } = await admin.rpc("evaluate_discount_code", {
      p_code: requestedDiscountCode,
      p_profile_id: profile.id,
      p_subtotal: subtotal,
      p_shipping: shipping,
    });
    if (discountError) return json({ error: "Could not validate discount code" }, 500);
    if (!discountEval?.valid) return json({ error: discountEval?.error || "Discount code is not valid" }, 409);

    discount = money(Number(discountEval.merchandiseDiscount || 0));
    shippingDiscountApplied = money(Number(discountEval.shippingDiscount || 0));
    shipping = money(Math.max(0, shipping - shippingDiscountApplied));
    discountCodeId = String(discountEval.id || "") || null;
    discountCodeValue = String(discountEval.code || "") || null;
    discountOneTime = discountEval.oneTime === true;
  }

  const taxableMerchandise = money(Math.max(0, subtotal - discount));
  const processingFee =
    paymentMethod === "PayPal" || paymentMethod === "Venmo" || paymentMethod === "Apple Pay"
      ? money(taxableMerchandise * 0.05)
      : 0;
  const tax = money((taxableMerchandise + processingFee) * 0.08);
  const total = money(subtotal - discount + shipping + processingFee + tax);
  const now = new Date().toISOString();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_id: profile.id,
      status: "checkout_pending",
      subtotal,
      discount_total: discount,
      shipping_discount_total: shippingDiscountApplied,
      discount_code_id: discountCodeId,
      discount_code: discountCodeValue,
      shipping_total: shipping,
      tax_total: tax,
      processing_fee_total: processingFee,
      total,
      payment_method: paymentMethod,
      payment_status: "pending",
      customer_notes: body.customerNotes?.trim() || null,
      contact_method: body.contactMethod?.trim() || null,
      submitted_at: now,
      admin_notes: "Nexus Pay Now checkout",
    })
    .select("id,created_at")
    .single();

  if (orderError || !order) return json({ error: "Could not create checkout order" }, 500);

  if (discountOneTime && discountCodeId) {
    const { data: claimed, error: claimError } = await admin.rpc("claim_one_time_discount_code", {
      p_discount_id: discountCodeId,
      p_profile_id: profile.id,
      p_order_id: order.id,
    });
    if (claimError || claimed !== true) {
      await admin.from("orders").delete().eq("id", order.id);
      return json({ error: "This one-time discount code was already used." }, 409);
    }
  }

  const orderItems = validatedItems.map(item => ({
    order_id: order.id,
    product_id: item.productId,
    product_code: item.productCode,
    product_name: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    line_total: item.lineTotal,
  }));

  const { error: itemsError } = await admin.from("order_items").insert(orderItems);
  if (itemsError) {
    await admin.from("orders").update({
      status: "checkout_error",
      admin_notes: "Nexus Pay Now checkout: order item insert failed",
    }).eq("id", order.id);
    return json({ error: "Could not save checkout items" }, 500);
  }

  // Supabase-native order number (replaces the Google invoice number).
  // A numbering failure must never block checkout; capture/Core can assign it later.
  let orderNumber = "";
  const { data: assigned, error: numberError } = await admin.rpc("assign_order_number", {
    p_order_id: order.id,
  });
  if (!numberError && assigned) {
    orderNumber = String(assigned);
  } else {
    await admin.from("orders").update({
      admin_notes: "Nexus Pay Now checkout: order number assignment needs review",
    }).eq("id", order.id);
  }

  return json({
    success: true,
    orderId: order.id,
    orderNumber,
    invoicePdfReady: false,
    discountCode: discountCodeValue,
    totals: { subtotal, discount, shippingDiscount: shippingDiscountApplied, totalSavings: money(discount + shippingDiscountApplied), shipping, processingFee, tax, total },
  });
});
