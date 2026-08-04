// supabase/functions/send-notification/index.ts
// Server-authoritative typed notification sender.
//
// Flow:
//   1. Authenticate the caller (must own the vendor).
//   2. Compute this week's usage from `vendor_weekly_usage`.
//   3. Enforce the tier quota (canSend). Reject with 429 if over limit.
//   4. Insert the notification row (service role; bypasses RLS insert block).
//   5. Fan out to followers' Expo push tokens.
//
// Deploy: supabase functions deploy send-notification
// Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import {
  canSend, bucketsForSend, getNotificationType, getTier,
} from "../_shared/tiers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client bound to the caller's JWT (to resolve auth.uid()).
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    // Service client for privileged writes.
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    const { vendorId, type, title, body } = await req.json();
    const nType = getNotificationType(type);
    if (!nType) return json({ error: "Unknown notification type" }, 400);

    // Load vendor + verify ownership.
    const { data: vendor, error: vErr } = await admin
      .from("vendors").select("*").eq("id", vendorId).maybeSingle();
    if (vErr || !vendor) return json({ error: "Vendor not found" }, 404);
    if (vendor.owner_id !== uid) return json({ error: "Not your vendor" }, 403);

    const tierId = vendor.subscription_tier ?? "free";

    // Current weekly usage.
    const { data: usageRows } = await admin
      .from("vendor_weekly_usage").select("bucket, count").eq("vendor_id", vendorId);
    const usage: Record<string, number> = {};
    (usageRows ?? []).forEach((r: any) => { usage[r.bucket] = Number(r.count); });

    // Enforce quota.
    const decision = canSend(tierId, type, usage);
    if (!decision.allowed) {
      return json({ error: decision.reason, decision }, 429);
    }

    // Followers.
    const { data: favRows } = await admin
      .from("favorites").select("user_id").eq("vendor_id", vendorId);
    const recipientIds = (favRows ?? []).map((r: any) => r.user_id);

    // Insert notification (counts against quota via buckets).
    const buckets = bucketsForSend(tierId, type);
    const finalTitle = title || nType.defaultTitle(vendor.name);
    const { data: inserted, error: iErr } = await admin
      .from("notifications")
      .insert({
        vendor_id: vendorId,
        type,
        buckets,
        title: finalTitle,
        body: body ?? "",
        recipient_ids: recipientIds,
      })
      .select("*").single();
    if (iErr) return json({ error: iErr.message }, 500);

    // Fan out via Expo Push.
    let sent = 0;
    if (recipientIds.length) {
      const { data: tokenRows } = await admin
        .from("push_tokens").select("token").in("user_id", recipientIds);
      const tokens = (tokenRows ?? []).map((r: any) => r.token).filter(Boolean);
      if (tokens.length) {
        const messages = tokens.map((to: string) => ({
          to,
          sound: "default",
          title: finalTitle,
          body: body ?? "",
          data: { vendorId, type },
        }));
        // Expo accepts batches of up to 100.
        for (let i = 0; i < messages.length; i += 100) {
          const batch = messages.slice(i, i + 100);
          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(batch),
          });
          sent += batch.length;
        }
      }
    }

    return json({
      notification: inserted,
      followers: recipientIds.map((id: string) => ({ id })),
      remaining: decision.remaining,
      pushed: sent,
    });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
