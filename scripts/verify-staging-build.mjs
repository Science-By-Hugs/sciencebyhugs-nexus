import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { loadEnv } from 'vite'

const env = loadEnv('staging', process.cwd(), 'VITE_')
assert.equal(env.VITE_APP_ENV, 'staging', 'Expected staging environment')
assert.equal(env.VITE_PAYMENT_ENV, 'sandbox', 'Live payment environment forbidden')
for (const name of Object.keys(env)) {
  assert.ok(!/SECRET|PASSWORD|SERVICE_ROLE|TOKEN|PRIVATE_KEY/.test(name), 'Secret-like VITE variable is forbidden: ' + name)
}
assert.ok(!fs.existsSync('public/CNAME') && !fs.existsSync('dist/CNAME'), 'Production CNAME must not exist in staging')
const config = fs.readFileSync('src/config.ts', 'utf8')
assert.ok(config.includes('validateV2Environment') && config.includes('assertV2RuntimeOrigin'), 'Build and runtime guards required')
assert.ok(!config.includes('tkhcvmkejzaoervocnzk') && !config.includes('sb_publishable_Ecfr'), 'Configuration must not fall back to production')
const workflows = fs.readdirSync('.github/workflows').filter(file => /\.ya?ml$/.test(file))
assert.deepEqual(workflows, ['v2-ci.yml'], 'Development branch must contain only non-deploying CI')
const ci = fs.readFileSync('.github/workflows/v2-ci.yml', 'utf8')
assert.ok(!/pages:\s*write|id-token:\s*write|deploy-pages|supabase.*deploy|workflow_dispatch/.test(ci), 'CI must not deploy or grant deployment permissions')
assert.ok(ci.includes('contents: read') && ci.includes('npm test') && ci.includes('verify:staging'))
const html = fs.readFileSync('dist/index.html', 'utf8')
assert.ok(html.includes('noindex,nofollow'), 'Staging must be marked noindex')
const manifest = JSON.parse(fs.readFileSync('dist/manifest.webmanifest', 'utf8'))
assert.match(manifest.name, /Internal Staging/, 'Staging PWA identity required')
const sources = fs.readdirSync('dist/assets').filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join('dist/assets', file), 'utf8')).join('\n')
assert.ok(sources.includes('INTERNAL STAGING'), 'Visible staging label missing')
assert.ok(sources.includes('sbh-') && sources.includes('-v2-staging-auth'), 'Isolated auth storage key missing')
assert.ok(sources.includes(env.VITE_SUPABASE_URL), 'Artifact does not contain configured staging backend')
console.log('Staging configuration, artifact identity, auth isolation and non-deploying CI verified.')
