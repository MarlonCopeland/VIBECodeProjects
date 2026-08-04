# Next steps — where we left off

_Last updated: 2026-08-03_

**Supabase is connected.** The app runs on `APP_BACKEND=supabase` against the
live project **`VendorFinderApp`** (ref `dpavkiyozlamuqhdemmr`, us-east-1), the
schema is applied, and the CRUD/RLS smoke test passes end to end.

Full reference lives in **[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)**.

---

## ✅ Done

- `.env` created (gitignored) with `APP_BACKEND=supabase`, project URL, anon key,
  and `WEB_BASE_URL=http://localhost:8081`.
- CLI linked to the project; `supabase db push` applied
  `supabase/migrations/0001_init.sql` — `profiles`, `vendors`, `favorites`,
  `notifications`, `push_tokens`, RLS policies, the `handle_new_user` trigger,
  and avatar storage all live.
- `npm run smoke:supabase` passes: create → read → update → follow → unfollow →
  delete, plus the negative RLS check (non-owner update is blocked).
- App verified in the browser: bundles clean (1385 modules), renders the sign-in
  screen, and reaches Supabase Auth with the anon key from its own bundle.
- **"Confirm email" was left ON** — the app's verification gate depends on it.

## ▶ What to do next

```bash
nvm use              # Node 20 — required by the Expo CLI
npm run web          # or: npm start (press w / i / a)
```

There are **no seeded accounts on Supabase** (the `admin`/`admin123` demo user
only exists in the `local` backend). Sign up a fresh account and click the
confirmation email to get in — or sign up a Vendor to exercise Vendor Tools.

### ⚠ Blocking: custom SMTP (decided 2026-08-03, not started)

**Account sign-up currently fails** with *"Too many attempts. Please wait a
moment and try again."* That is not a login throttle — it is Supabase
`over_email_send_rate_limit` (HTTP 429). "Confirm email" is ON, so every sign-up
sends a confirmation email, and the built-in SMTP allows only **~2 emails per
hour**. `src/lib/errors.ts` maps any "rate limit" error to that friendly text,
which hides the real cause.

**Decision: wire up a real SMTP provider** (Resend, SendGrid, Postmark, SES)
under **Authentication → SMTP Settings**, then raise the email rate limit under
**Authentication → Rate Limits**. The SMTP credentials must be entered in the
dashboard by hand. This is the next thing to do.

Until then, to test without email: create pre-confirmed accounts with the Admin
API (`email_confirm: true`) exactly as `scripts/supabase-smoke.mjs` does — no
mail is sent and no project settings change.

### Other follow-ups
- **OAuth** (Google/Apple) buttons are visible but the providers are not
  configured in the dashboard yet — `SUPABASE_SETUP.md` Part 2.
- **Stripe subscriptions + Edge Functions** — `SUPABASE_SETUP.md` Part 3.
- **Ship it** (Web/PWA, iOS TestFlight) — [`DEPLOYMENT.md`](./DEPLOYMENT.md).

### Gotchas worth remembering

- Run `npm run smoke:supabase` under **Node 22+** (`supabase-js` needs a native
  `WebSocket`); the Expo CLI still needs Node 20.
- Never save `.env` as UTF-8 **with BOM** — the Supabase CLI's dotenv parser
  rejects it.
