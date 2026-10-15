# NEXUS — Approved celestial design

Approved by Anthony on October 14, 2026. Reference: `design/approved-orbit-v3.png`. CORE is outside this redesign.

The app uses the lowercase `nexus.` wordmark with a cyan dot. Research vial labels use **Science By Hugs**, white labels, black lettering, blue Hugs and blue rules, plus a research-use-only footer. Generic imagery contains no invented compound names or strengths. Existing product-specific images remain authoritative when provided.

Original generated assets live in `public/orbit-horizon-v3.png` and `public/science-by-hugs-vial-v3.png`. The approved mockup is a reference, not a rendered app screen. Live UI is HTML/CSS with the existing catalog, cart, authenticated profile and order history.

Palette: background `#020b16`, surface `#091827`, raised surface `#102235`, borders `#2b4053`, primary text `#f4f6fb`, secondary text `#a4b9d8`, cyan action `#00d3ec`. Status dots always accompany text.

Home contains a personal greeting (or a signed-out welcome), latest order, Catalog and Orders shortcuts, and one accessible catalog preview. Latest order uses actual server status and has loading, empty, failed and signed-out states. Late order responses cannot replace another profile's history. Catalog has search, category filters, and stacked horizontal cards on phones; desktop uses two columns. Restricted-product filtering is shared by Home and Catalog.

Primary navigation: Home, Catalog, Orders, Account. Cart and Menu remain reachable in the header; Menu includes Support. Orders opens existing authenticated history or the sign-in sheet. Native push continues to use the existing Account controls.

System typography, visible form labels, password visibility, autofill, device zoom, reduced-motion support, CSS safe-area padding and keyboard-aware sheet heights remain. Cyan actions use dark text.

`src/orbit.css` is loaded after the existing styles and shared component styles. The development-only `design-review.html` and `design-review.ts` show fictional data without authentication or writes; they are excluded from the default Vite build and native bundle. Visual evidence lives in `../evidence/` at the v2 level.

## Build 4 consistency pass

`src/fluid.css` is the final shared layer after orbit.css. It removes excessive text tracking and legacy referral reordering, normalizes card/form spacing, wraps long names and links, and carries the celestial background through secondary views. Mobile dialogs use the full visible viewport with safe-area padding. Desktop keeps bounded sheets. The public policy page shares the same palette and typography. Customer URLs come from appLinks.ts, never from the current WebView address.
