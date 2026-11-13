// supabase/functions/send-download-link
// POST (user JWT). Re-sends the desktop download email to the signed-in
// account, if it owns an active Full Suite purchase. Rate-limited.

import { CORS, HttpError, admin, callerOf, handleError, json } from '../_shared/common.ts';
import { emailGrant, ensureGrant } from '../_shared/delivery.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const user = await callerOf(req);
    if (!user.email) throw new HttpError(400, 'Your account has no email address.');
    const db = admin();
    const { data: purchase } = await db
      .from('purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('product', 'full_suite')
      .eq('status', 'active')
      .order('purchased_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!purchase) throw new HttpError(404, 'This account does not own Legend Full Suite yet.');

    const grant = await ensureGrant(db, user.id, purchase.id);
    const { to } = await emailGrant(db, grant, user.email, { force: true });
    return json({ sent: true, emailedTo: to });
  } catch (e) {
    return handleError(e);
  }
});
