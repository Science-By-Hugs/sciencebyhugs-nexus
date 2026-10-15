# Day 1 implementation

These changes are on a staging development branch only. Production main and active deployments remain unchanged.

Implemented: explicit staging config, build/runtime validation, separate auth storage, visible staging identification, staging PWA identity, removal of production CNAME/deployment workflows on this development branch, a build/test-only CI workflow, and regression tests. NEXUS additionally routes verification/password-reset returns to its configured staged origin, blocks test payments until enabled, refuses live PayPal config, and disables real Zelle transfers.

The CI workflow has contents:read only, no deployment credentials, no deployment job and loopback fixture settings. It does not provision or host an environment. Both the build config and browser config enforce isolation. The existing production repository snapshots and earlier local shipping/catalog experiments remain separate.

Configuration:

```sh
cp .env.example .env.staging.local
# Replace all project/origin/key placeholders with approved staging values.
npm ci
npm test
npm run build
npm run verify:staging
```

Without real staging settings the app is intentionally not runnable. For build verification only, CI supplies a loopback URL/non-working key; never use those fixtures as an actual TestFlight backend. No native shell or new business workflow is implemented by Day 1.

See V2-BETA-SCOPE.md and V2-STAGING-PLAN.md for scope, outstanding owner choices, hosting/capacity and Day 2 acceptance gates.
