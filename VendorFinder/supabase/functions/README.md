# Edge Functions

| Function | Purpose | Deploy |
|----------|---------|--------|
| `send-notification` | Server-authoritative typed notification send with weekly quota enforcement + Expo Push fan-out. | `supabase functions deploy send-notification` |
| `create-checkout-session` | Creates a Stripe Checkout session for a tier upgrade. | `supabase functions deploy create-checkout-session` |
| `customer-portal` | Opens the Stripe billing portal (manage/cancel). | `supabase functions deploy customer-portal` |
| `stripe-webhook` | Persists `subscription_tier`/status from Stripe events. Must be public. | `supabase functions deploy stripe-webhook --no-verify-jwt` |

Shared:
- `_shared/quotaEngine.ts` — the quota engine itself: tier limits plus the
  `canSend` decision. Imported by BOTH this function and the app
  (`src/features/payments/tiers.ts` wraps it with UI metadata), so server and
  client enforcement cannot drift. It has no imports on purpose — keep it
  runtime-agnostic so both Deno and Metro can load it.
- `_shared/cors.ts` — CORS headers + JSON helper.

Secrets (set via `supabase secrets set NAME=value`):
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_TIER1`, `STRIPE_PRICE_TIER2`, `STRIPE_PRICE_TIER3`

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically.

See [`../../SUPABASE_SETUP.md`](../../SUPABASE_SETUP.md) for the full walkthrough.
