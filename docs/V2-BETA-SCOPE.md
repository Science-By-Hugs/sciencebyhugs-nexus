# 2.0 internal beta scope — Day 1

## October 14 scope update

Anthony explicitly added a full NEXUS visual redesign before the next internal build. The approved direction is minimal, dark space-themed, with faint stars and planet shading. NEXUS build 2 shipped that redesign plus native notification registration and test delivery, which Anthony confirmed on his iPhone. CORE visual redesign is deferred. Capacitor is the selected native shell; the older Day 1 framework decision below is historical. Automatic order alerts, purchasing/receipts/fulfillment workflows and remaining device checks still need implementation or verification.

Target: October 26, 2026, internal TestFlight for NEXUS and CORE. The production apps remain unchanged. This document records the requested scope and provisional defaults; it does not claim that the 2.0 business features have been implemented.

## Included

- Preserve the production Supabase project, verified auth identities, membership relationships, customer profiles, order history and current domains at the eventual live cutover.
- Build with synthetic identities/orders in a separate staging project. Do not copy production users into ordinary development or reset anyone’s verification status.
- Import selected products from the already connected vendor workbook, keyed by a stable vendor SKU/ID where available. Imported cost remains read-only; a percentage markup is a separate CORE setting. Selling price = vendor cost × (1 + markup / 100), followed by an explicitly selected rounding rule.
- Manual products have their own editable pricing, description and fulfillment settings. Imports cannot remove or overwrite those products.
- CORE can assign Gigi $20, EZ $30, EMLIN $70, ELLA $70 or Amazon $5 to any product. Orders charge once per distinct shipper; existing membership benefits are retained explicitly. An unassigned or invalid shipper must surface an actionable exception, not silently become free shipping.
- NEXUS supports browsing/search, verified-account purchasing, truthful payment-method totals, cancellation/retry/resume, and consistent membership access enforcement.
- Preserve PayPal, Venmo, Apple Pay and Zelle as the intended payment choices. Staging uses provider sandbox flows and synthetic Zelle confirmation. Actual wallet/device behavior is tested early on iOS before enabling a test payment path.
- Confirmed payments generate receipts; invoice requests remain distinguishable from paid receipts. A Zelle submission is not itself payment confirmation.
- Generate branded PDFs directly from immutable invoice/order data and archive them through a retryable job into a separate test Drive folder. Old receipts retain their original totals. Retries must not issue duplicate documents.
- CORE updates delivery dates and status on individual orders; NEXUS displays them. Native notification registration, permission denial and notification taps are tested on physical devices.
- Show customer receipts consistently across payment/order paths, including a clear pending-generation state.

## Outside the internal-beta milestone

Production cutover, customer migration, external TestFlight/public App Store release, advanced analytics, new campaign automation, a broad visual redesign, and multiple new vendor integrations. Only the existing vendor feed is in the initial beta.

## Decisions / defaults

- Percentage markup is the pricing model, not gross margin. Vendor cost itself is never edited in CORE.
- A new vendor cost should provisionally generate a reviewed price change before publication; the owner’s preference is pending. This protects against unexpected customer price changes and does not overwrite imported cost.
- The markup percentage and rounding policy must be selected during the pricing implementation. Do not assume a global 14% markup merely because the old sheet uses ×1.14 and rounds up.
- Native framework choice is not committed by Day 1. Day 2 evaluates the existing TypeScript UI path against Expo/React Native using login, wallet return, native push and PDF sharing on a real device. Backend and account contracts remain framework-independent. If a substantial native UI rewrite is chosen, revisit the sprint estimate rather than silently reducing payment correctness.
- Production backup preference is pending. Manual encrypted backups are the no-new-billing provisional path; no backup export or upgrade has occurred.

## Definition of done

Designated internal testers can install both beta apps, authenticate with staging identities, complete the documented test purchase/receipt/fulfillment flows, and report issues. The beta cannot connect to the existing production Supabase projects, initiate a real Zelle transfer or use live PayPal configuration. Publishing or migrating production requires a separate release decision, a tested recoverable backup and a compatible rollback plan.

## Owner decisions — Day 1 closeout

Anthony authorized proceeding with this beta scope in the build chat. The iOS customer catalog will be limited to selected peptides; the full web catalog remains available subject to its own product eligibility requirements. CORE will manage explicit web/iOS availability and restriction reasons. The iOS subset must be consistent for customers and reviewers, disclosed in review notes, and enforced by backend catalog and purchase endpoints. These controls are requirements for implementation, not completed features.

Use the proposed notice: “For laboratory research use only. Not for human or veterinary use. Educational information is not medical advice and does not provide diagnosis, treatment, or dosing recommendations.” Descriptions and features must match actual intended use; omit human-use instructions, dosing protocols and therapeutic claims. Review individual product eligibility before distribution. Disclaimer wording and comparable apps do not guarantee approval or establish lawful sale. Internal TestFlight does not establish public App Store approval.

Backup preference, vendor-price publication preference, markup/rounding and native framework remain open. The provisional reviewed-price and encrypted-manual-backup approach remains documented without treating it as owner approval.
