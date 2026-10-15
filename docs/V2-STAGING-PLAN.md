# Staging environment and Day 2 provisioning contract

Status: Day 1 foundation verified. The separately connected NEXUS 2.0 Supabase project now exists; this closeout did not provision it. Preview hosting, test Drive and Apple app records remain unverified.

## Branches and local previews

- Integration branch: `codex/v2-development`, starting from the recorded production commit.
- Day 1 feature branch: `codex/v2-staging-foundation`, reviewed into the integration branch only.
- Do not merge these staging-only changes into production `main`.
- NEXUS local preview: `http://localhost:5173`.
- CORE local preview: `http://localhost:5174`.
- Proposed remote addresses: `https://nexus-staging.sciencebyhugs.com` and `https://core-staging.sciencebyhugs.com`. These are proposed names, not provisioned addresses. Hosting must provide an authenticated private preview or restrict staging data to synthetic authenticated testers; noindex is not an access-control mechanism.

## Backend boundary

Use the separate NEXUS 2.0 project for both staged apps: `evyssawhlarqqhgyswhz`, region `ca-central-1`, verified ACTIVE_HEALTHY through the Nexus 2.0 connection. It currently has no public tables, recorded migrations or deployed Edge Functions. Auth, Storage, secrets, billing and scheduler configuration have not been verified. Frontend publishable keys and hosting origins are not configured by this closeout. No production fallback is allowed.

Use the full schema baseline to reconstruct staging, not only the small migration subsets in these repositories. Seed synthetic customers with synthetic verification state, memberships, products, orders, invoices and administrator roles. Deny customer access to other customers’ rows and require owner/admin app_metadata for CORE.

Frontend variables are documented in .env.example. Copy it to .env.staging.local and replace every placeholder. Only publishable keys belong in VITE_* variables. Missing settings, known production project references, production keys/origins, mismatched staging URL/reference, remote HTTP URLs and live payment mode fail validation.

CI uses a loopback backend address and a non-working fixture key for compilation only. It does not provision a database, run application HTTP calls, deploy a preview or prove end-to-end backend integration. Runtime origin checks stop a staged bundle running at an unexpected host before Supabase initialization. Auth storage is explicitly separate for each staged app. Native origins need an explicit reviewed design after the framework is selected.

## Outbound integrations: disabled until verified

| Integration | Day 2 staging requirement |
| --- | --- |
| Payments | Separate sandbox credentials; PAYPAL_ENV=sandbox; test payments stay disabled until verified. Never copy production payment secrets. |
| Zelle | No real recipient or transfer; implement clearly labeled synthetic confirmation later. |
| Invoice PDF | Dedicated staged generator and test artifacts; never the existing Apps Script production invoice routes. |
| Drive | Dedicated test folder and narrowly scoped server-side authorization. Folder ownership and write permissions must be checked before enabling jobs. |
| Email | Capture mailbox or explicitly approved tester-only recipients. No production customer email destinations. |
| Push | Separate native/web credentials, subscriptions and queues; synthetic/tester devices only. |
| Vendor imports | Existing authorized vendor feed read-only; staged catalog writes only. Do not edit the vendor workbook. |
| Cron | Initially disabled; enable each staged job only after integration targets pass validation. |

Server-side configuration is not created by frontend environment guards. Before enabling writes, verify the actual staged Edge Function secrets, internal_runtime_config and delivery job targets. Source code still inherited from 1.0 includes production-origin CORS/auth values; adjust/review those server functions before any staging deployment. Do not deploy the inherited backend blindly.

## Capacity and billing

The earlier capacity concern predates the separate NEXUS 2.0 project, which is now accessible in a different organization (`ezfzuzvmtoeokrsleiom`). No additional project is needed for the next backend setup step. Its subscription and costs have not been checked; project availability does not establish a billing decision. This closeout made no billing changes.

## Apple readiness

An individual Apple Developer membership is user-reported. Xcode 27.0 (27A266a) is installed. App Store Connect app records, team access, signing identities, device provisioning and tester permissions have not yet been verified. Do not request credentials in plain-text chat. Verify through the signed-in tooling on Day 2. Internal-only testing does not establish public App Store approval.

## Day 2 acceptance checklist

- [ ] Verify the existing staging project configuration/billing and choose private preview hosting.
- [x] Record and validate the existing separate project identity/health.
- [ ] Reconstruct full schema and audit the staged policies.
- [ ] Seed synthetic records; confirm customer isolation and CORE roles.
- [ ] Configure auth email/redirects for staging only.
- [ ] Verify all server-side outbound targets before enabling any writes/jobs.
- [ ] Confirm Apple team/signing and upload a minimal device build.
- [ ] Test native login return, wallet feasibility, push registration and PDF sharing.

## Day 2 engineering update

The shared staging schema is now installed: 19 application tables, relationships, 12 routines, baseline triggers and row policies, private avatar/invoice buckets and a follow-up hardening migration. Three synthetic Auth identities, three test products and two synthetic order/payment/invoice examples are present. Fourteen guarded read functions restore NEXUS and CORE read paths; the one-time identity bootstrap is closed. This is not a production-data copy.

Hosted previews use separate Cloudflare Pages projects: `https://sbh-nexus-v2-staging.pages.dev` and `https://sbh-core-v2-staging.pages.dev`. Static shells are public, marked noindex, and contain synthetic catalog fixtures. Customer data remains protected by authenticated ownership policies and CORE roles; no customer data is imported. No production DNS/custom domains changed.

Both local `.env.staging.local` files point to the staging project with publishable keys only. Hosted build commands must override the exact app origin; native `npm run ios:sync` rebuilds for `capacitor://localhost`. Pinned Capacitor shells exist under `ios/`, using separate staging bundle identifiers. The templates include UIKit scene lifecycle adoption required by iOS 27. These shells are not yet signed for a physical device or uploaded to TestFlight.

No staged outbound integrations or scheduler are deployed; payments remain disabled. Supabase Auth site URL, redirect allowlist, email settings, leaked-password protection and billing have not been verified because the available browser account cannot access the new organization. Signup, recovery and email-change flows must wait for that configuration. Apple team/signing, native returns, wallet eligibility, APNs and native PDF sharing remain acceptance work.

Authoritative backend source and verification: `../backend/` from this checkout's root, or `v2/backend/` from the parent workspace. See `v2/DAY-2-DEBRIEF.md` for the final validation status.
