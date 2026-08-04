# Supabase setup

The UnjadedDigital template talks to Supabase only through the backend facade
(`src/backend`), so wiring up a project is a small, well-defined checklist.

## 1. Create a project

1. Create a project at [supabase.com](https://supabase.com).
2. Copy **Project URL** and **anon public key** from *Project Settings → API*.
3. Put them in your `.env` (see `.env.example`) and set `APP_BACKEND=supabase`.

## 2. Apply the schema

Using the CLI (recommended):

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Or paste `migrations/0001_init.sql` into the SQL editor.

This creates:

- `public.profiles` — 1:1 with `auth.users`, auto-created by a trigger on
  sign-up. RLS restricts every row to its owner.
- `public.push_tokens` — Expo push tokens, owner-scoped.
- A public `avatars` storage bucket with owner-scoped write policies.
- `delete_own_account()` RPC for self-service account deletion.

## 3. Configure auth

- **Email**: enable "Confirm email" (Authentication → Providers → Email) to
  match the template's verification flow.
- **OAuth**: enable Google / Apple under Authentication → Providers, then add
  the redirect URL `unjadeddigital://` (your app scheme) to the allow list.
- **Redirect URLs**: add your app scheme (`unjadeddigital://`) and, for web,
  your `WEB_BASE_URL`.

## 4. (Optional) Payments

The Stripe provider calls Supabase Edge Functions so the secret key never
ships in the app. Create these functions in your project:

- `create-checkout-session` → returns `{ url }`
- `create-portal-session` → returns `{ url }`
- `get-subscription` → returns the current `Subscription`

Until they exist (or if you leave `APP_BACKEND=local`), the app uses the local
mock payment provider.
