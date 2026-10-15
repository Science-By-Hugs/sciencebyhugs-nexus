const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = ts.transpileModule(fs.readFileSync('src/appLinks.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
function links(href) {
  const context = {exports: {}, URL, window: {location: {href}}}
  vm.runInNewContext(source, context)
  return context.exports
}
test('referral links use the hosted app from native, local and untrusted page addresses', () => {
  for (const href of ['capacitor://localhost/', 'http://localhost:5173/?mode=recovery#access_token=secret', 'https://untrusted.example/path']) {
    const {buildReferralLink} = links(href)
    const url = new URL(buildReferralLink(' SBH A&?/# '))
    assert.equal(url.origin, 'https://sbh-nexus-v2-staging.pages.dev')
    assert.equal(url.pathname, '/')
    assert.equal(url.searchParams.get('ref'), 'SBH A&?/#')
    assert.equal([...url.searchParams].length, 1)
    assert.equal(url.hash, '')
    assert.throws(() => buildReferralLink('  '))
  }
})
test('confirmation and recovery returns use HTTPS and never the WebView origin', () => {
  const {buildAuthReturnUrl} = links('capacitor://localhost/')
  assert.equal(buildAuthReturnUrl(), 'https://sbh-nexus-v2-staging.pages.dev/')
  assert.equal(buildAuthReturnUrl('recovery'), 'https://sbh-nexus-v2-staging.pages.dev/?mode=recovery')
})
