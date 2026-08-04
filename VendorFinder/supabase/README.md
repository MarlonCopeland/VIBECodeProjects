# supabase/

Backend assets for Vendor Finder:

- **`migrations/0001_init.sql`** — the full schema: `profiles`, `vendors`,
  `favorites`, `notifications`, `push_tokens`, the `vendor_weekly_usage` view,
  the `handle_new_user` trigger, Row-Level Security, the `avatars` storage
  bucket, and the `delete_own_account()` RPC.
- **`functions/`** — Edge Functions: `send-notification` (server-side quota
  enforcement + Expo Push fan-out), `create-checkout-session`, `customer-portal`,
  and `stripe-webhook`. `functions/_shared/tiers.ts` mirrors the app's quota
  engine so enforcement is identical on both sides.
- **`config.toml`** — minimal Supabase CLI config.

**Don't follow instructions here — there's one complete, step-by-step guide for
connecting a project, applying this schema, wiring auth/OAuth, and deploying the
functions:**

➡️ **[`../SUPABASE_SETUP.md`](../SUPABASE_SETUP.md)**
