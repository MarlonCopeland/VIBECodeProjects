// supabase/functions/verify-purchase
// POST { platform: 'ios'|'android', productId, purchaseToken } with the
// user's JWT. Verifies the Full Suite purchase with Apple/Google, records it
// (service role — clients can't write purchases), and on the FIRST verified
// purchase emails the desktop download links. Idempotent: restores and
// replayed transactions just return { owned: true }.

import { CORS, HttpError, admin, callerOf, fullSuiteProductIds, handleError, json } from '../_shared/common.ts';
import { acknowledgeGoogle, verifyApple, verifyGoogle, type StorePurchase } from '../_shared/stores.ts';
import { emailGrant, ensureGrant } from '../_shared/delivery.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const user = await callerOf(req);
    const body = (await req.json()) as { platform?: string; productId?: string; purchaseToken?: string };
    if (!body.purchaseToken || (body.platform !== 'ios' && body.platform !== 'android')) {
      throw new HttpError(400, 'Missing purchase details.');
    }

    let p: StorePurchase;
    if (body.platform === 'ios') {
      p = await verifyApple(body.purchaseToken);
    } else {
      if (!body.productId) throw new HttpError(400, 'Missing product id.');
      p = await verifyGoogle(body.productId, body.purchaseToken);
    }

    if (!fullSuiteProductIds().includes(p.productId)) throw new HttpError(400, 'That purchase is not Legend Full Suite.');
    if (!p.valid) throw new HttpError(402, 'That purchase was refunded or is still pending.');
    // Purchases are bound to the Legend account that started them. A store
    // account can restore on a DIFFERENT Legend login — refuse that, or one
    // purchase could unlock any number of accounts.
    if (p.accountToken && p.accountToken !== user.id.toLowerCase()) {
      throw new HttpError(403, 'This purchase belongs to a different Legend account. Sign in with the account you bought it on.');
    }

    const db = admin();
    const { data: existing } = await db
      .from('purchases')
      .select('id, user_id, status')
      .eq('platform', p.platform)
      .eq('store_transaction_id', p.transactionId)
      .maybeSingle();
    if (existing && existing.user_id !== user.id) {
      throw new HttpError(403, 'This purchase is already linked to a different Legend account.');
    }

    const row = {
      user_id: user.id,
      product: 'full_suite',
      platform: p.platform,
      store_transaction_id: p.transactionId,
      store_product_id: p.productId,
      purchase_token: p.platform === 'android' ? body.purchaseToken : null,
      environment: p.environment,
      status: 'active',
      purchased_at: p.purchasedAt,
      revoked_at: null,
    };
    const { data: purchase, error } = await db
      .from('purchases')
      .upsert(row, { onConflict: 'platform,store_transaction_id' })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    if (p.platform === 'android' && p.needsAck) await acknowledgeGoogle(p.productId, body.purchaseToken);

    const grant = await ensureGrant(db, user.id, purchase.id);
    let emailedTo: string | null = grant.emailed_to;
    let emailError: string | null = null;
    if (user.email) {
      try {
        const sent = await emailGrant(db, grant, user.email, { force: false });
        emailedTo = sent.to;
      } catch (e) {
        // The purchase is recorded either way; the app offers "email me again".
        emailError = e instanceof Error ? e.message : String(e);
      }
    }

    return json({ owned: true, firstTime: !existing, emailedTo, emailError });
  } catch (e) {
    return handleError(e);
  }
});
