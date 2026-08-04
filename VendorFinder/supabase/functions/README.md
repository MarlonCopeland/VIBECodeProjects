# Edge Functions

| Function | Purpose | Deploy |
|----------|---------|--------|
| `send-notification` | Server-authoritative typed notification send with weekly quota enforcement + Expo Push fan-out. | `supabase functions deploy send-notification` |
| `create-checkout-session` | Creates a Stripe Checkout session for a tier upgrade. | `supabase functions deploy create-checkout-session` |
| `customer-portal` | Opens the Stripe billing portal (manage/cancel). | `supabase functions deploy customer-portal` |
| `stripe-webhook` | Persists `subscription_tier`/status from Stripe events. Must be public. | `supabase functions deploy stripe-webhook --no-verify-jwt` |

Shared:
- `_shared/tiers.ts` — Deno port of the quota engine. **Keep in sync with
  `src/features/payments/tiers.ts`.**
- `_shared/cors.ts` — CORS headers + JSON helper.

Secrets (set via `supabase secrets set NAME=value`):
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_TIER1`, `STRIPE_PRICE_TIER2`, `STRIPE_PRICE_TIER3`

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically.

See [`../../SUPABASE_SETUP.md`](../../SUPABASE_SETUP.md) for the full walkthrough.
