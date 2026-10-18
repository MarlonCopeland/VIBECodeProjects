// supabase/functions/store-notifications
// Refunds and revocations from the stores (no JWT; the stores call it).
//
//   Apple: App Store Server Notifications V2 — POST { signedPayload }.
//     URL to set in App Store Connect: …/functions/v1/store-notifications
//   Google: Real-time developer notifications via a Pub/Sub PUSH
//     subscription — POST { message: { data: base64 } }.
//     URL: …/functions/v1/store-notifications?key=<STORE_WEBHOOK_SECRET>
//
// Notification bodies are NOT trusted: they only say which purchase to
// re-check, and the decision comes from Apple/Google's API (stores.ts).
// A refunded purchase is marked refunded and its download grant revoked,
// which kills the emailed links and the desktop sign-in gate.

import { admin, json } from '../_shared/common.ts';
import { appleTransaction, decodeJwsPayload, verifyGoogle } from '../_shared/stores.ts';

async function setStatus(match: Record<string, string>, active: boolean, reason: 'refunded' | 'revoked') {
  const db = admin();
  let q = db.from('purchases').select('id');
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data: rows } = await q;
  for (const row of rows ?? []) {
    await db
      .from('purchases')
      .update({ status: active ? 'active' : reason, revoked_at: active ? null : new Date().toISOString() })
      .eq('id', row.id);
    await db.from('download_grants').update({ revoked: !active }).eq('purchase_id', row.id);
  }
}

async function handleApple(signedPayload: string) {
  const n = decodeJwsPayload<{ notificationType: string; data?: { signedTransactionInfo?: string } }>(signedPayload);
  const relevant = ['REFUND', 'REVOKE', 'REFUND_REVERSED'];
  if (!relevant.includes(n.notificationType) || !n.data?.signedTransactionInfo) return;
  const { transactionId } = decodeJwsPayload<{ transactionId: string }>(n.data.signedTransactionInfo);
  const t = await appleTransaction(transactionId); // authoritative
  await setStatus({ platform: 'ios', store_transaction_id: t.transactionId }, t.valid, n.notificationType === 'REVOKE' ? 'revoked' : 'refunded');
}

async function handleGoogle(data: {
  oneTimeProductNotification?: { purchaseToken: string; sku: string };
  voidedPurchaseNotification?: { purchaseToken: string; orderId: string };
}) {
  const voided = data.voidedPurchaseNotification;
  if (voided) {
    // Voided = refunded/charged back; Google's own notification is the record.
    // It's still only acted on for a token we already hold.
    await setStatus({ platform: 'android', purchase_token: voided.purchaseToken }, false, 'refunded');
    return;
  }
  const one = data.oneTimeProductNotification;
  if (one) {
    const p = await verifyGoogle(one.sku, one.purchaseToken);
    await setStatus({ platform: 'android', purchase_token: one.purchaseToken }, p.valid, 'revoked');
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  try {
    const body = (await req.json()) as { signedPayload?: string; message?: { data?: string } };
    if (body.signedPayload) {
      await handleApple(body.signedPayload);
    } else if (body.message?.data) {
      const secret = Deno.env.get('STORE_WEBHOOK_SECRET');
      if (!secret || new URL(req.url).searchParams.get('key') !== secret) return json({ error: 'forbidden' }, 403);
      await handleGoogle(JSON.parse(atob(body.message.data)));
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    // 500 makes Apple/Pub/Sub retry later, which is what we want on a transient failure.
    return json({ error: e instanceof Error ? e.message : 'error' }, 500);
  }
});
