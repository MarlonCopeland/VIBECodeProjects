// supabase/functions/customer-portal/index.ts
// Opens the Stripe Billing Portal so a vendor can update/cancel their plan.
//
// Deploy: supabase functions deploy customer-portal
// Secrets: STRIPE_SECRET_KEY

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

    const { vendorId, returnUrl } = await req.json();
    const { data: vendor } = await admin
      .from("vendors").select("*").eq("id", vendorId).maybeSingle();
    if (!vendor) return json({ error: "Vendor not found" }, 404);
    if (vendor.owner_id !== uid) return json({ error: "Not your vendor" }, 403);
    if (!vendor.stripe_customer_id) return json({ error: "No billing account yet" }, 400);

    const session = await stripe.billingPortal.sessions.create({
      customer: vendor.stripe_customer_id,
      return_url: returnUrl || "https://example.com/billing",
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
