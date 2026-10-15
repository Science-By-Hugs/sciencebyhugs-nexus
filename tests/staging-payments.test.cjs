const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
function harness(file, {enabled = false, environment = 'sandbox'} = {}) {
  const calls=[]
  const ctx={exports:{}, assertTestPaymentsEnabled(){if(!enabled)throw new Error('Test payments disabled')},
    supabase:{functions:{async invoke(name){calls.push(name);return {data:{success:true,configured:true,clientId:'test-client',environment,orderId:'test-order'},error:null}}}},
  }
  const source=fs.readFileSync('src/services/'+file,'utf8').replace(/^import .*$/gm,'')
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx)
  return {api:ctx.exports,calls}
}
test('disabled test payments cannot create checkout orders or call payment APIs',async()=>{
 const checkout=harness('checkout.ts');await assert.rejects(checkout.api.createCheckoutOrder([],{}),/disabled/);assert.equal(checkout.calls.length,0)
 const paypal=harness('paypal.ts')
 for(const call of [()=>paypal.api.getPayPalConfig(),()=>paypal.api.createPayPalOrder('order'),()=>paypal.api.capturePayPalOrder('order','provider-order')])await assert.rejects(call(),/disabled/)
 assert.equal(paypal.calls.length,0)
})
test('live provider configuration blocks both direct creation and capture',async()=>{
 const h=harness('paypal.ts',{enabled:true,environment:'live'})
 await assert.rejects(h.api.createPayPalOrder('order'),/Live PayPal/)
 await assert.rejects(h.api.capturePayPalOrder('order','provider-order'),/Live PayPal/)
 assert.deepEqual(h.calls,['paypal-config','paypal-config'])
})
test('sandbox config allows only explicitly enabled test payment calls',async()=>{
 const h=harness('paypal.ts',{enabled:true});const result=await h.api.createPayPalOrder('order')
 assert.equal(result.orderId,'test-order');assert.deepEqual(h.calls,['paypal-config','paypal-create-order'])
})
test('real Zelle instructions and submissions remain unavailable',async()=>{
 const h=harness('zelle.ts',{enabled:true})
 await assert.rejects(h.api.getZelleConfig(),/Real Zelle transfers are disabled/)
 await assert.rejects(h.api.submitZellePayment('order'),/Real Zelle transfers are disabled/)
 assert.equal(h.calls.length,0)
})
