// supabase/functions/create-checkout-session/index.ts
// Creates a Stripe Checkout Session for a vendor's subscription. Returns a
// hosted URL the client opens. Tier is recorded in session metadata so the
// webhook can persist it after payment.
//
// Deploy: supabase functions deploy create-checkout-session
// Secrets: STRIPE_SECRET_KEY (+ auto SUPABASE_URL, SERVICE_ROLE_KEY, ANON_KEY)

import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    const { vendorId, priceId, tierId, successUrl, cancelUrl } = await req.json();

    const { data: vendor } = await admin
      .from("vendors").select("*").eq("id", vendorId).maybeSingle();
    if (!vendor) return json({ error: "Vendor not found" }, 404);
    if (vendor.owner_id !== uid) return json({ error: "Not your vendor" }, 403);

    // Reuse or create a Stripe customer.
    let customerId = vendor.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { vendorId, ownerId: uid },
      });
      customerId = customer.id;
      await admin.from("vendors").update({ stripe_customer_id: customerId }).eq("id", vendorId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || "https://example.com/billing/success",
      cancel_url: cancelUrl || "https://example.com/billing/cancel",
      metadata: { vendorId, tierId },
      subscription_data: { metadata: { vendorId, tierId } },
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
