const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const path=require('node:path')
const root=path.join(__dirname,'..')
const source=fs.readFileSync(path.join(root,'src/services/nativePayPal.ts'),'utf8').replace(/^import [\s\S]*?from .*$/gm,'')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const context={exports:{},Error,Promise,setTimeout,console:{error(){}},registerPlugin:()=>({checkout:async()=>({status:'cancelled'})}),getPayPalConfig:null,createPayPalOrder:null,capturePayPalOrder:null}
vm.runInNewContext(code,context)
const {payWithNativePayPal,PaymentStatusUnknownError}=context.exports

function deps({approval={status:'approved',orderId:'PP-1',payerId:'PAYER'},captures=[{orderNumber:'SBH-1001'}],merchantId='MERCHANT1'}={}){
 const calls=[]
 let i=0
 return {calls,deps:{
  getConfig:async()=>({configured:true,environment:'live',clientId:'CLIENT',merchantId}),
  createOrder:async(id,method)=>{calls.push(['create',id,method]);return {success:true,orderId:'PP-1'}},
  checkout:async opts=>{calls.push(['checkout',opts]);return approval},
  capture:async(id,pp,method)=>{calls.push(['capture',id,pp,method]);const r=captures[Math.min(i++,captures.length-1)];if(r instanceof Error)throw r;return r},
  wait:async()=>{},
 }}
}

test('approved checkout captures server-side once and returns the order number',async()=>{
 const {calls,deps:d}=deps()
 const result=await payWithNativePayPal('nexus-order',d)
 assert.equal(result.status,'paid');assert.equal(result.orderNumber,'SBH-1001')
 assert.deepEqual(calls.map(c=>c[0]),['create','checkout','capture'])
 assert.equal(JSON.stringify(calls[1][1]),JSON.stringify({clientId:'CLIENT',merchantId:'MERCHANT1',environment:'live',orderId:'PP-1'}))
 assert.deepEqual(calls[2].slice(1),['nexus-order','PP-1','PayPal'])
})
test('cancelled approval never captures',async()=>{
 const {calls,deps:d}=deps({approval:{status:'cancelled'}})
 assert.equal((await payWithNativePayPal('o',d)).status,'cancelled')
 assert.ok(!calls.some(c=>c[0]==='capture'))
})
test('approval for a different PayPal order is rejected without capture',async()=>{
 const {calls,deps:d}=deps({approval:{status:'approved',orderId:'PP-OTHER',payerId:'X'}})
 await assert.rejects(payWithNativePayPal('o',d),/different order/)
 assert.ok(!calls.some(c=>c[0]==='capture'))
})
test('a lost capture response is retried idempotently instead of starting a new purchase',async()=>{
 const {calls,deps:d}=deps({captures:[new Error('Failed to fetch'),{orderNumber:'SBH-2'}]})
 const result=await payWithNativePayPal('o',d)
 assert.equal(result.status,'paid')
 assert.equal(calls.filter(c=>c[0]==='create').length,1)
 assert.equal(calls.filter(c=>c[0]==='checkout').length,1)
 assert.equal(calls.filter(c=>c[0]==='capture').length,2)
})
test('repeated capture failure reports unknown status and tells the customer not to pay again',async()=>{
 const {calls,deps:d}=deps({captures:[new Error('timeout')]})
 await assert.rejects(payWithNativePayPal('o',d),err=>err instanceof PaymentStatusUnknownError&&/Do not pay again/.test(err.message))
 assert.equal(calls.filter(c=>c[0]==='capture').length,3)
})
test('amount mismatch is not retried',async()=>{
 const {calls,deps:d}=deps({captures:[new Error('PayPal capture did not match the expected order total')]})
 await assert.rejects(payWithNativePayPal('o',d),/did not match/)
 assert.equal(calls.filter(c=>c[0]==='capture').length,1)
})
test('missing merchant ID stops before any PayPal order is created',async()=>{
 const {calls,deps:d}=deps({merchantId:null})
 await assert.rejects(payWithNativePayPal('o',d),/not configured/)
 assert.equal(calls.length,0)
})
test('app checkout uses the native path and the website keeps the web SDK',()=>{
 const main=fs.readFileSync(path.join(root,'src/main.ts'),'utf8')
 assert.match(main,/if \(isNativeApp\) setupNativeCartWallets\(\)\n  else try \{\n    const sdk = await getPayPalSdk\(\)/)
 assert.match(main,/if \(isNativeApp\) \{\n    setupNativeOrderPayPal\(paypalButtons, venmoButtons\)\n    return\n  \}/)
 assert.match(main,/currentAccountIsActive\(\) && !isNativeApp\)/)
})
test('native shell registers PayPal, routes universal links and pins SDK 3.1.1 on iOS 16',()=>{
 const swift=fs.readFileSync(path.join(root,'ios/App/App/AppDelegate.swift'),'utf8')
 assert.match(swift,/registerPluginInstance\(NexusPayPalPlugin\(\)\)/)
 assert.equal((swift.match(/NexusPayPalPlugin\.handleReturn/g)||[]).length,3)
 const pbx=fs.readFileSync(path.join(root,'ios/App/App.xcodeproj/project.pbxproj'),'utf8')
 assert.match(pbx,/repositoryURL = "https:\/\/github\.com\/paypal\/paypal-ios";\n\t\t\trequirement = \{\n\t\t\t\tkind = exactVersion;\n\t\t\t\tversion = 3\.1\.1;/)
 assert.doesNotMatch(pbx,/IPHONEOS_DEPLOYMENT_TARGET = 15\.0/)
 const ent=fs.readFileSync(path.join(root,'ios/App/App/App.entitlements'),'utf8')
 assert.match(ent,/applinks:nexus\.sciencebyhugs\.com/)
})
