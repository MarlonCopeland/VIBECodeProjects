// Parity check: the unified quota engine must behave exactly like the two
// forked copies it replaced. Values below are transcribed from the ORIGINAL
// src/features/payments/tiers.ts + supabase/functions/_shared/tiers.ts.
//
// Run: node --experimental-strip-types scripts/quota-parity.mts

import {
  FOLLOWER_GATE,
  TIER_QUOTAS,
  canSend,
  bucketsForSend,
  getNotificationType,
  getTier,
  requiresSubscription,
  startOfWeek,
} from '../supabase/functions/_shared/quotaEngine.ts';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`  FAIL ${label}\n       expected ${e}\n       actual   ${a}`);
    failures++;
  }
}

console.log('== tier tables ==');
check('FOLLOWER_GATE', FOLLOWER_GATE, 10);
check('free.weeklyQuota', TIER_QUOTAS.free.weeklyQuota, { open_for_business: 1, promotions: 0 });
check('tier1.weeklyQuota', TIER_QUOTAS.tier1.weeklyQuota, { open_for_business: 7, promotions: 0 });
check('tier2.weeklyQuota', TIER_QUOTAS.tier2.weeklyQuota, { open_for_business: 7, promotions: 2 });
check('tier3.weeklyQuota', TIER_QUOTAS.tier3.weeklyQuota, {
  open_for_business: 15,
  promotions: 15,
  combined: 15,
});
check('prices', [
  TIER_QUOTAS.free.priceMonthly,
  TIER_QUOTAS.tier1.priceMonthly,
  TIER_QUOTAS.tier2.priceMonthly,
  TIER_QUOTAS.tier3.priceMonthly,
], [0, 9.99, 19.99, 39.99]);
check('unknown tier falls back to free', getTier('nope').id, 'free');

console.log('== notification types ==');
check('open_for_business bucket', getNotificationType('open_for_business')!.quotaKey, 'open_for_business');
check('sale bucket', getNotificationType('sale')!.quotaKey, 'promotions');
check('stock_update bucket', getNotificationType('stock_update')!.quotaKey, 'promotions');
check('unknown type', getNotificationType('bogus'), null);
check('default title', getNotificationType('sale')!.defaultTitle('Tacos'), 'Tacos is having a sale!');

console.log('== canSend ==');
check('free: first open alert allowed', canSend('free', 'open_for_business', {}), {
  allowed: true, bucket: 'open_for_business', remaining: 0, limit: 1,
});
check('free: second open alert blocked', canSend('free', 'open_for_business', { open_for_business: 1 }), {
  allowed: false,
  reason: 'Weekly limit reached for this alert type (1/week).',
  bucket: 'open_for_business',
  remaining: 0,
  limit: 1,
});
check('free: sale not included', canSend('free', 'sale', {}), {
  allowed: false,
  reason: 'Your plan does not include Sale alerts.',
  bucket: 'promotions',
  remaining: 0,
  limit: 0,
});
check('tier1: 7 open alerts, 3 used', canSend('tier1', 'open_for_business', { open_for_business: 3 }), {
  allowed: true, bucket: 'open_for_business', remaining: 3, limit: 7,
});
check('tier2: promotions allowed', canSend('tier2', 'sale', { promotions: 1 }), {
  allowed: true, bucket: 'promotions', remaining: 0, limit: 2,
});
check('tier2: promotions exhausted', canSend('tier2', 'stock_update', { promotions: 2 }), {
  allowed: false,
  reason: 'Weekly limit reached for this alert type (2/week).',
  bucket: 'promotions',
  remaining: 0,
  limit: 2,
});
check('tier3: combined cap hit', canSend('tier3', 'sale', { combined: 15 }), {
  allowed: false,
  reason: 'Weekly limit reached (15 of any type).',
  bucket: 'combined',
  remaining: 0,
  limit: 15,
});
check('tier3: under combined cap', canSend('tier3', 'sale', { combined: 4, promotions: 4 }), {
  allowed: true, bucket: 'promotions', remaining: 10, limit: 15,
});
check('unknown type rejected', canSend('tier3', 'bogus', {}), {
  allowed: false, reason: 'Unknown notification type', bucket: null, remaining: 0, limit: 0,
});

console.log('== bucketsForSend ==');
check('free open', bucketsForSend('free', 'open_for_business'), ['open_for_business']);
check('tier2 sale', bucketsForSend('tier2', 'sale'), ['promotions']);
check('tier3 sale adds combined', bucketsForSend('tier3', 'sale'), ['promotions', 'combined']);
check('tier3 open adds combined', bucketsForSend('tier3', 'open_for_business'), [
  'open_for_business', 'combined',
]);
check('unknown type', bucketsForSend('tier3', 'bogus'), []);

console.log('== gating ==');
check('under gate on free', requiresSubscription(9, 'free'), false);
check('at gate on free', requiresSubscription(10, 'free'), true);
check('at gate on tier1', requiresSubscription(10, 'tier1'), false);

console.log('== startOfWeek ==');
// 2026-08-06 is a Thursday; the window must start on Monday 2026-08-03 at 00:00.
const thursday = new Date(2026, 7, 6, 15, 30, 0).getTime();
const monday = new Date(2026, 7, 3, 0, 0, 0, 0).getTime();
check('Thursday -> Monday 00:00', startOfWeek(thursday), monday);
const sunday = new Date(2026, 7, 9, 23, 59, 0).getTime();
check('Sunday -> same Monday', startOfWeek(sunday), monday);

console.log('');
if (failures) {
  console.error(`${failures} PARITY FAILURE(S)`);
  process.exit(1);
}
console.log('✅ quota engine parity: all checks passed');
