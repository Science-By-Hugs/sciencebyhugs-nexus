const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const main=fs.readFileSync(path.join(__dirname,'../src/main.ts'),'utf8')
const refresh=main.slice(main.indexOf('async function refreshAccount'),main.indexOf('productDialog.addEventListener'))

test('session refresh keeps Order Activity / Manage Account open instead of resetting to the hub',()=>{
 assert.match(refresh,/const viewingAccountSubpage = accountDialog\.open && \(!accountOrdersView\.hidden \|\| !accountManageView\.hidden\)/)
 assert.match(refresh,/if \(viewingAccountSubpage\) \{\n    refreshAccountHubData\(\)\n    if \(!accountOrdersView\.hidden\) void refreshOrderHistory\(\)\n  \} else showAccountHub\(\)/)
 assert.equal((refresh.match(/showAccountHub\(\)/g)||[]).length,1,'no unconditional hub reset left')
})
test('a notification tap before sign-in is queued and applied after the profile loads',()=>{
 assert.match(main,/pendingPushRoute = route/)
 assert.match(refresh,/if \(webPushRoute \|\| pendingPushRoute === 'orders'\) \{\n    pendingPushRoute = null\n    openPushRoute\('orders'\)/)
})
test('sign-out resets to the hub and drops any queued route (no cross-customer view)',()=>{
 const signedOut=refresh.slice(refresh.indexOf('if (!user) {'),refresh.indexOf('return',refresh.indexOf('if (!user) {')))
 for(const line of ['accountHubView.hidden = false','accountManageView.hidden = true','accountOrdersView.hidden = true','pendingPushRoute = null','accountHistory = []'])
  assert.ok(signedOut.includes(line),line)
})
