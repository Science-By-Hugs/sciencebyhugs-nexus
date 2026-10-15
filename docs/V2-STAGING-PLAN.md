# Staging environment and Day 2 provisioning contract

Status: planned; no hosted staging project, DNS record, preview deployment, Drive folder or Apple app record was created on Day 1.

## Branches and local previews

- Integration branch: `codex/v2-development`, starting from the recorded production commit.
- Day 1 feature branch: `codex/v2-staging-foundation`, reviewed into the integration branch only.
- Do not merge these staging-only changes into production `main`.
- NEXUS local preview: `http://localhost:5173`.
- CORE local preview: `http://localhost:5174`.
- Proposed remote addresses: `https://nexus-staging.sciencebyhugs.com` and `https://core-staging.sciencebyhugs.com`. These are proposed names, not provisioned addresses. Hosting must provide an authenticated private preview or restrict staging data to synthetic authenticated testers; noindex is not an access-control mechanism.

## Backend boundary

Create one separate staging Supabase project for both apps, preferably us-west-2 to match production. Project name proposal: Science By Hugs — NEXUS/CORE 2.0 Staging. Its actual project reference, publishable key and preview origin become explicit frontend configuration after provisioning. No production fallback is allowed.

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

The connected Science By Hugs organization currently lists two active healthy projects (shared NEXUS/CORE and PULSE). The baseline dashboard reports Free. Supabase lists a limit of two active free projects, so a third managed staging project needs a capacity/billing decision. Do not pause either live project to make room. No plan change is authorized by this document.

Possible paths: approve a paid organization with a separately priced staging project, or use a local isolated backend initially while resolving remote capacity. Local development is not a substitute for the remotely reachable backend needed for shared TestFlight testing. Get the actual organization quote before provisioning; public pricing starts at $25/month for Pro with additional projects from $10/month and may affect the existing project charges.

Sources: https://supabase.com/pricing and https://vite.dev/guide/env-and-mode.html, checked October 13, 2026.

## Apple readiness

An individual Apple Developer membership is user-reported. Xcode 27.0 (27A266a) is installed. App Store Connect app records, team access, signing identities, device provisioning and tester permissions have not yet been verified. Do not request credentials in plain-text chat. Verify through the signed-in tooling on Day 2. Internal-only testing does not establish public App Store approval.

## Day 2 acceptance checklist

- [ ] Resolve hosted staging capacity/cost and choose private preview hosting.
- [ ] Create the separate project; record and validate its reference.
- [ ] Reconstruct full schema and audit the staged policies.
- [ ] Seed synthetic records; confirm customer isolation and CORE roles.
- [ ] Configure auth email/redirects for staging only.
- [ ] Verify all server-side outbound targets before enabling any writes/jobs.
- [ ] Confirm Apple team/signing and upload a minimal device build.
- [ ] Test native login return, wallet feasibility, push registration and PDF sharing.
