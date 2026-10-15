const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const context = { exports: {}, URL }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/environment.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context)
const { validateV2Environment: validate, assertV2RuntimeOrigin } = context.exports
const fixture = {
  appEnv: 'staging', supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  expectedProjectRef: 'abcdefghijklmnopqrst', publishableKey: 'sb_publishable_staging_fixture',
  appOrigin: 'https://nexus-staging.sciencebyhugs.com', paymentEnv: 'sandbox',
}
test('staging configuration requires explicit project identity and publishable key', () => {
  const result = validate(fixture)
  assert.equal(result.projectRef, fixture.expectedProjectRef)
  assert.equal(result.enableTestPayments, false)
  for (const field of ['appEnv', 'supabaseUrl', 'expectedProjectRef', 'publishableKey', 'appOrigin', 'paymentEnv']) {
    assert.throws(() => validate({ ...fixture, [field]: undefined }))
  }
})
test('production and mismatched database targets are refused', () => {
  for (const ref of ['tkhcvmkejzaoervocnzk', 'pspiqukuhtazmkyfleii']) {
    assert.throws(() => validate({ ...fixture, expectedProjectRef: ref, supabaseUrl: `https://${ref}.supabase.co` }), /Production/)
  }
  assert.throws(() => validate({ ...fixture, supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co.attacker.example' }), /match/)
  assert.throws(() => validate({ ...fixture, supabaseUrl: 'https://differentprojecthere.supabase.co' }), /match/)
  assert.throws(() => validate({ ...fixture, supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co:9443' }), /match/)
})
test('secrets and production keys cannot be used as frontend keys', () => {
  for (const publishableKey of ['sb_secret_example', 'eyJhbGciOiJIUzI1NiJ9.example.signature', 'sb_publishable_EcfrlkNHkSfJWgeSWjH2LA_3yDFTtBE']) {
    assert.throws(() => validate({ ...fixture, publishableKey }), /publishable key/)
  }
})
test('live origins, credentials in URLs and insecure remote origins are refused', () => {
  for (const appOrigin of ['https://nexus.sciencebyhugs.com', 'https://core.sciencebyhugs.com', 'https://sciencebyhugs.github.io', 'https://user:pass@preview.example', 'http://preview.example', 'https://preview.example/path', 'https://preview.example/?token=secret']) {
    assert.throws(() => validate({ ...fixture, appOrigin }))
  }
})
test('live payment mode is refused and test payment flags are explicit', () => {
  assert.throws(() => validate({ ...fixture, paymentEnv: 'live' }), /sandbox/)
  assert.throws(() => validate({ ...fixture, enableTestPayments: 'yes' }), /true or false/)
  assert.equal(validate({ ...fixture, enableTestPayments: 'true' }).enableTestPayments, true)
})
test('local build fixtures work without granting access to production', () => {
  const result = validate({ ...fixture, expectedProjectRef: 'local', supabaseUrl: 'http://127.0.0.1:54321', appOrigin: 'http://localhost:5173' })
  assert.equal(result.supabaseUrl, 'http://127.0.0.1:54321')
})
test('runtime refuses an artifact served on a different or production origin', () => {
  assert.doesNotThrow(() => assertV2RuntimeOrigin(fixture.appOrigin, fixture.appOrigin))
  assert.throws(() => assertV2RuntimeOrigin(fixture.appOrigin, 'https://nexus.sciencebyhugs.com'))
  assert.throws(() => assertV2RuntimeOrigin(fixture.appOrigin, 'https://other-preview.example'))
})

test('native staging allows only the exact bundled Capacitor origin, never as a backend', () => {
  assert.equal(validate({ ...fixture, appOrigin: 'capacitor://localhost' }).appOrigin, 'capacitor://localhost')
  for (const appOrigin of ['capacitor://attacker', 'capacitor://localhost/path', 'capacitor://localhost?token=x', 'capacitor://user@localhost', 'capacitor://localhost:1234', 'file:///']) {
    assert.throws(() => validate({ ...fixture, appOrigin }))
  }
  assert.throws(() => validate({ ...fixture, supabaseUrl: 'capacitor://localhost' }))
  assert.doesNotThrow(() => assertV2RuntimeOrigin('capacitor://localhost', 'capacitor://localhost'))
  assert.throws(() => assertV2RuntimeOrigin('capacitor://localhost', 'http://localhost:5173'))
})
