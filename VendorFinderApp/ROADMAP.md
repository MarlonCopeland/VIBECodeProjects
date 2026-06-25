# Vendor Finder — Daily Roadmap to Launch

A working checklist organized by phase. Pick a few items each day. Items are
roughly ordered, but parallel tracks (design, legal, marketing) can run
alongside engineering.

---

## Phase 0 — Foundation (current state)
- [x] Scaffold Expo app (web/iOS/Android)
- [x] Backend abstraction (`localBackend` + `firebaseBackend` stub)
- [x] Vendor list, search, favorites, register, alerts
- [x] Location service with mock fallback
- [x] Local notifications

---

## Phase 1 — Engineering Hardening

### Code quality
- [ ] Add ESLint + Prettier config and run on save
- [ ] Add TypeScript (or JSDoc types) — start with `services/` and `context/`
- [ ] Set up Jest + React Native Testing Library
- [ ] Unit tests: `locationService.distanceKm`, `localBackend` CRUD, alert dedupe logic
- [ ] Component tests: `VendorCard`, `SearchBar`
- [ ] E2E with Detox (native) and Playwright (web) for the core flows
- [ ] GitHub Actions CI: install → lint → test on PR
- [ ] Add error boundary at navigator root
- [ ] Centralized logger (`src/services/logger.js`) wrapping `console.*` so it can later send to Sentry
- [ ] Sentry integration (`sentry-expo`) for crash reporting

### UX polish
- [ ] Replace emoji tab icons with `@expo/vector-icons` (Ionicons)
- [ ] Add app icon + splash screen (`assets/icon.png`, `assets/splash.png`)
- [ ] Empty states with illustrations
- [ ] Skeleton loaders instead of `ActivityIndicator`
- [ ] Pull-to-refresh on Search and Favorites
- [ ] Dark mode (use `useColorScheme`)
- [ ] Accessibility audit: roles, labels, contrast, dynamic font sizes
- [ ] Internationalization scaffold (i18next) — start with en/es

### Features (v1.1)
- [ ] Map view (react-native-maps on native, react-leaflet on web) showing vendor pins
- [ ] Vendor photos (camera + image upload, with local cache)
- [ ] Multi-day schedule editor on register screen
- [ ] "Currently here" geofence: vendor app auto-marks open when within X m of scheduled spot
- [ ] User reviews and ratings
- [ ] Categories/tags with chip filters
- [ ] Share vendor link (deep link)

### Features (v1.2)
- [ ] In-app chat between user and vendor (text only)
- [ ] Vendor analytics dashboard (views, favorites, peak times)
- [ ] Push to favorites broadcast: vendor sends "we're open" blast
- [ ] Subscriptions for vendors (paid tier with promoted listings)

---

## Phase 2 — Backend Migration to Firebase
- [ ] Create Firebase project (dev + prod)
- [ ] Enable Firestore, Auth, Cloud Messaging, Storage, Functions
- [ ] Implement `firebaseBackend.js` (reference impl is in the file as comments)
- [ ] Firestore security rules (vendors readable by all, writable by owner)
- [ ] Auth: email/password + Google + Apple sign-in via `expo-auth-session`
- [ ] Replace `LOCAL_USER_ID` with real `auth.currentUser.uid`
- [ ] Migrate favorites to per-user Firestore doc
- [ ] Cloud Function: nightly cleanup of stale `currentLocation`
- [ ] Cloud Function: geo-queries (use GeoFirestore or Algolia for geo-search)
- [ ] FCM push for nearby/open alerts (replaces client-side polling on native)
- [ ] Image uploads → Firebase Storage with signed URLs
- [ ] Move `BACKEND='firebase'` in `src/config.js`; smoke test all screens

---

## Phase 2.5 — SaaS Infrastructure (Scale-Up Path)
When the local/Firebase backend is no longer enough, this is the production-grade
stack that turns Vendor Finder into a true SaaS platform. Work through these
sections in order — each builds on the previous one.

### 2.5.1 Core Infrastructure (The Foundation)
- [ ] Pick cloud provider: **AWS**, **GCP**, or **Azure** (recommend AWS for breadth, GCP if staying close to Firebase)
- [ ] Set up org / billing accounts (separate dev, staging, prod)
- [ ] Infrastructure-as-code with Terraform or Pulumi (commit to repo)
- [ ] Containerize backend services with **Docker** (one Dockerfile per service)
- [ ] Container registry (ECR / Artifact Registry / ACR)
- [ ] Orchestration with **Kubernetes** (EKS / GKE / AKS) — or start simpler with ECS Fargate / Cloud Run
- [ ] Helm charts for repeatable deployments
- [ ] **CDN** for frontend assets: Cloudflare or AWS CloudFront
- [ ] DNS + TLS (Cloudflare or Route 53 + ACM)
- [ ] WAF rules + DDoS protection
- [ ] Secrets manager (AWS Secrets Manager / GCP Secret Manager / HashiCorp Vault)

### 2.5.2 Frontend (The Visual Experience)
- [ ] Decide on web stack for marketing + dashboard: **Next.js** (recommended, shares React with the mobile app)
- [ ] Component library — extract shared UI between web + mobile into a workspace (`packages/ui`)
- [ ] State management upgrade: **Zustand** for client state, **TanStack Query** for server state (or Redux Toolkit if team prefers)
- [ ] Responsive design via **Tailwind CSS** (web) and consistent design tokens shared with the RN app
- [ ] Storybook for component documentation
- [ ] Bundle analysis + code-splitting per route
- [ ] Image optimization pipeline (Next.js Image / Cloudinary)
- [ ] SEO meta tags + structured data on marketing pages

### 2.5.3 Backend & Data Layer (The Engine)
- [ ] Choose primary backend language: **Node.js (NestJS)**, **Python (FastAPI)**, **Go**, or **Ruby on Rails**
- [ ] Application server behind a load balancer (ALB / GCLB)
- [ ] **Relational DB**: managed **PostgreSQL** (RDS / Cloud SQL) for users, billing, vendors, schedules
- [ ] **NoSQL / cache**: **Redis** (ElastiCache / Memorystore) for sessions, rate limits, hot queries
- [ ] Optional: **MongoDB** or DynamoDB for high-volume unstructured data (e.g. activity logs)
- [ ] Search: Algolia, Typesense, or OpenSearch for vendor full-text + geo search
- [ ] **REST API** (OpenAPI spec) — or **GraphQL** (Apollo) if frontend teams prefer flexibility
- [ ] API versioning strategy (`/v1`, `/v2`)
- [ ] Background job queue: BullMQ (Node) / Celery (Python) / Sidekiq (Rails)
- [ ] Migrate Firestore data → Postgres via export + ETL script
- [ ] Update `src/services/backend/` with a new `apiBackend.js` that implements the same facade

### 2.5.4 SaaS-Specific Layer (The Management Office)

**Multi-Tenancy Architecture**
- [ ] Decide model: **shared DB with `tenant_id` column** (cheaper, default) vs **isolated DB per tenant** (enterprise)
- [ ] Add `tenant_id` to every table; enforce via Postgres Row-Level Security (RLS)
- [ ] Middleware that resolves tenant from subdomain or JWT claim
- [ ] Tenant onboarding flow (auto-provision workspace, seed data)
- [ ] Tenant admin console (suspend, impersonate, export, delete)
- [ ] Data export endpoint per tenant (GDPR)

**Subscription & Billing Engine**
- [ ] Integrate **Stripe** (or Paddle / Chargebee) — Stripe Billing is the default
- [ ] Define plan matrix: Free / Pro / Business / Enterprise (per-seat or usage-based)
- [ ] Stripe Customer Portal for self-serve plan changes
- [ ] Webhooks: `invoice.paid`, `customer.subscription.updated`, `invoice.payment_failed`
- [ ] Dunning logic: retry schedule, in-app banners, suspension after N failures
- [ ] Proration on upgrade/downgrade
- [ ] Usage metering pipeline (events → aggregated → reported to Stripe)
- [ ] Tax handling: Stripe Tax or Avalara
- [ ] Promo codes / referral discounts

**Authentication & Authorization (AuthN / AuthZ)**
- [ ] Identity provider: **Auth0**, **Clerk**, **WorkOS**, or roll-your-own with Cognito / Firebase Auth
- [ ] Email + password, Google, Apple, Magic Link
- [ ] **MFA** (TOTP + SMS fallback)
- [ ] **RBAC** roles: Owner, Admin, Editor, Viewer, Vendor — matrix of permissions
- [ ] Attribute-Based Access Control (ABAC) for fine-grained vendor data
- [ ] Audit log of privileged actions
- [ ] **SSO** via SAML / OIDC for enterprise (WorkOS makes this fast)
- [ ] SCIM for enterprise user provisioning
- [ ] Session security: refresh-token rotation, device list, revoke-all
- [ ] Replace local `LOCAL_USER_ID` with real auth claims everywhere in the RN app

### 2.5.5 Operations, Security, & Analytics (The Control Room)

**Monitoring & Logging**
- [ ] APM: **Datadog**, **New Relic**, or **Grafana Cloud**
- [ ] Centralized logs: Datadog Logs / CloudWatch / Loki
- [ ] Frontend session replay: **LogRocket** or **FullStory**
- [ ] Error tracking: **Sentry** (already on the v1 roadmap — extend to backend)
- [ ] Synthetic uptime checks (Checkly / Pingdom)
- [ ] On-call rotation + PagerDuty (or Opsgenie)
- [ ] Define and publish SLOs (uptime, latency, error rate)
- [ ] Runbooks for top 10 incident types

**Security**
- [ ] Threat model the app (STRIDE)
- [ ] Dependency scanning: Dependabot / Snyk
- [ ] SAST: GitHub CodeQL or Semgrep in CI
- [ ] Container scanning: Trivy
- [ ] Penetration test before public launch
- [ ] SOC 2 readiness program (Vanta or Drata) if pursuing enterprise
- [ ] Encryption at rest (default on managed services) + in transit (TLS 1.2+)
- [ ] Backups: automated DB snapshots, cross-region replication, tested restores
- [ ] Bug bounty program (HackerOne or self-hosted)

**Product Analytics**
- [ ] Pick one: **PostHog** (open source, self-host option), **Mixpanel**, or **Amplitude**
- [ ] Event taxonomy doc (signed-up, vendor_registered, favorited, alert_received, …)
- [ ] Funnels: install → signup → first favorite → return D7
- [ ] Feature flags + A/B testing (PostHog, LaunchDarkly, or Statsig)
- [ ] North-star metric dashboard
- [ ] Cohort retention dashboards

**CI/CD Pipeline**
- [ ] **GitHub Actions** (or GitLab CI / CircleCI) workflows: lint → test → build → deploy
- [ ] Preview environments per PR (Vercel for web, Expo PR builds for mobile)
- [ ] Trunk-based development + required PR reviews
- [ ] Blue/green or canary deploys on Kubernetes
- [ ] Database migrations gated by manual approval in prod
- [ ] Automated mobile builds via **EAS Build** + **EAS Submit**
- [ ] Rollback strategy documented and rehearsed

---

## Phase 3 — Design & Branding
- [ ] Brand: name lock-in, domain purchase, social handles (IG/TikTok/X)
- [ ] Logo (vector) + color palette + type system
- [ ] App icon set (1024 master + Expo `expo-icon` generation)
- [ ] Marketing site (Next.js or Astro on Vercel) — landing + privacy + terms
- [ ] App Store screenshots (6.7", 6.5", 5.5", iPad, Android phone/tablet)
- [ ] Promo video (~30s) for socials and store listings

---

## Phase 4 — Legal, Privacy, Compliance
- [ ] Choose an entity (LLC / sole prop) and register
- [ ] EIN + business bank account
- [ ] Trademark search; file if available
- [ ] Privacy Policy (covers location, push tokens, analytics, ads if any)
- [ ] Terms of Service (vendor obligations, user conduct, dispute resolution)
- [ ] Cookie banner on web build
- [ ] GDPR / CCPA data-export and deletion endpoints
- [ ] Apple App Tracking Transparency prompt (if using IDFA-based analytics)
- [ ] Vendor agreement (what they can/can't post, content moderation policy)
- [ ] Insurance quote (general liability — usually needed for marketplaces)

---

## Phase 5 — Backend Ops & Reliability
- [ ] Staging vs production Firebase projects
- [ ] Environment variables via `.env` + `app.config.js` (no secrets in git)
- [ ] Backup strategy: scheduled Firestore export to Cloud Storage
- [ ] Monitoring dashboards (Firebase console + Sentry alerts)
- [ ] Rate limiting on registration (Cloud Function check)
- [ ] Abuse/spam moderation queue
- [ ] Email service (Postmark/SendGrid) for transactional mail
- [ ] Status page (statuspage.io or hosted)

---

## Phase 6 — Beta & QA
- [ ] Create TestFlight build (`eas build -p ios --profile preview`)
- [ ] Create Google Play internal track build (`eas build -p android --profile preview`)
- [ ] Recruit 10–20 beta users (mix of vendors + customers)
- [ ] Recruit 5–10 real pop-up vendors locally (markets, food trucks)
- [ ] In-app feedback button (mailto or Canny/Featurebase)
- [ ] Bug triage board (GitHub Projects or Linear)
- [ ] Weekly beta release cadence
- [ ] Track: DAU, session length, vendor-registration completion rate, favorites/user

---

## Phase 7 — Store Submission
### Apple
- [ ] Apple Developer Program enrollment ($99/yr)
- [ ] App Store Connect: create app record
- [ ] Listing copy: title (30 chars), subtitle (30), keywords (100), description
- [ ] Screenshots (per device class)
- [ ] App preview videos (optional but boosts conversion)
- [ ] Privacy nutrition label
- [ ] Submit via `eas submit -p ios`
- [ ] Respond to review feedback

### Google
- [ ] Google Play Console enrollment ($25 one-time)
- [ ] Data safety section
- [ ] Content rating questionnaire
- [ ] Store listing (short + full description, feature graphic 1024x500)
- [ ] Submit via `eas submit -p android`

### Web
- [ ] `eas build` web export or Expo Router static export
- [ ] Deploy to Vercel/Netlify with custom domain
- [ ] PWA manifest + service worker (Workbox)
- [ ] Lighthouse audit (target 90+ on perf, a11y, SEO)

---

## Phase 8 — Marketing & Launch
### Pre-launch
- [ ] Landing page with email waitlist (ConvertKit/Beehiiv)
- [ ] Build in public: Twitter/X, IG Reels, TikTok of build progress
- [ ] Reach out to 3–5 niche newsletters (food trucks, makers markets, local events)
- [ ] Partner with 1–2 local market organizers for a launch event

### Launch week
- [ ] Product Hunt launch (Tuesday/Wednesday, midnight PT)
- [ ] Reddit posts (r/foodtrucks, r/SideProject, r/<your-city>)
- [ ] Hacker News "Show HN" post
- [ ] Press release to local food/lifestyle blogs
- [ ] Push to email waitlist with onboarding video
- [ ] Paid: $200 test budget on Meta Ads targeting local food-truck followers

### Post-launch (weekly)
- [ ] Monitor ratings and respond to every review (first 30 days)
- [ ] Ship one user-visible improvement per week
- [ ] Publish a "vendor of the week" feature on socials
- [ ] Newsletter with new vendor highlights

---

## Phase 9 — Monetization
- [ ] Define free vs paid vendor tiers
- [ ] Stripe Connect for vendor payouts (if you add in-app ordering later)
- [ ] In-app purchases (RevenueCat) for vendor Pro subscription
- [ ] Featured-listing slot pricing
- [ ] Affiliate revenue (e.g. event-ticket links)
- [ ] Track LTV, CAC, payback period in a simple spreadsheet

---

## Phase 10 — Growth
- [ ] Referral program (give-3-get-3 favorites unlock)
- [ ] Vendor self-onboarding email sequence
- [ ] Localized city pages on the marketing site for SEO ("food trucks in <city>")
- [ ] Embeddable "where am I today" widget vendors can put on their own sites
- [ ] Slack/Discord community for vendors
- [ ] Geographic expansion: city #2 playbook (partner, seed vendors, local press)

---

## Daily routine suggestion
- **Mon:** Engineering — ship one feature task
- **Tue:** Engineering — testing / bug fixes
- **Wed:** Beta feedback review + product decisions
- **Thu:** Marketing / content — one piece of content out
- **Fri:** Vendor outreach — 5 cold contacts, 1 demo
- **Sat:** Optional design / polish day
- **Sun:** Off — or weekly review (metrics, plan next week)

---

## Key metrics to track from day 1
- Vendor registrations / week
- % of vendors who post a schedule
- % of vendors active in the last 7 days
- DAU, WAU, MAU
- Favorites per user
- Alert open rate (notifications → app open)
- 7-day and 30-day user retention
- App-store rating + review velocity
