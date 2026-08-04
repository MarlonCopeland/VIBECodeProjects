// supabase/functions/stripe-webhook/index.ts
// Receives Stripe events and persists the vendor's subscription tier/status.
// This is the ONLY place subscription_tier is set from a real payment.
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
//   (must be public — Stripe calls it without a Supabase JWT)
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//
// In Stripe Dashboard add a webhook endpoint pointing to this function URL and
// subscribe to: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted.

import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Map a Stripe Price ID back to our tier id via env vars.
function tierForPrice(priceId: string | null): string | null {
  if (!priceId) return null;
  const map: Record<string, string> = {
    [Deno.env.get("STRIPE_PRICE_TIER1") ?? ""]: "tier1",
    [Deno.env.get("STRIPE_PRICE_TIER2") ?? ""]: "tier2",
    [Deno.env.get("STRIPE_PRICE_TIER3") ?? ""]: "tier3",
  };
  return map[priceId] ?? null;
}

async function setVendorTier(vendorId: string, tier: string, status: string, subId?: string) {
  const patch: Record<string, unknown> = {
    subscription_tier: tier,
    subscription_status: status,
  };
  if (subId) patch.stripe_subscription_id = subId;
  await admin.from("vendors").update(patch).eq("id", vendorId);
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, webhookSecret);
  } catch (e) {
    return new Response(`Webhook signature error: ${e.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const vendorId = s.metadata?.vendorId;
        const tierId = s.metadata?.tierId;
        if (vendorId && tierId) {
          await setVendorTier(vendorId, tierId, "active", s.subscription as string);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const vendorId = sub.metadata?.vendorId;
        const priceId = sub.items.data[0]?.price?.id ?? null;
        const tier = sub.metadata?.tierId || tierForPrice(priceId);
        if (vendorId && tier) {
          const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status;
          await setVendorTier(vendorId, tier, status, sub.id);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const vendorId = sub.metadata?.vendorId;
        if (vendorId) await setVendorTier(vendorId, "free", "active");
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(`Handler error: ${e.message}`, { status: 500 });
  }
});
