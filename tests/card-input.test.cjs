const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const path=require('node:path')
const root=path.join(__dirname,'..')
const load=(file,ctx={})=>{
 const src=fs.readFileSync(path.join(root,file),'utf8').replace(/^import [\s\S]*?from .*$/gm,'')
 const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const context={exports:{},Error,Promise,setTimeout,Date,Number,String,console:{error(){}},...ctx}
 vm.runInNewContext(code,context);return context.exports
}
const card=load('src/services/cardInput.ts')

test('Luhn check accepts real test numbers and rejects typos',()=>{
 for(const n of ['4111 1111 1111 1111','5555555555554444','378282246310005','6011111111111117'])assert.equal(card.passesLuhn(n),true,n)
 for(const n of ['4111111111111112','1234','','4111 1111 1111 111'])assert.equal(card.passesLuhn(n),false,n)
})
test('brand detection and number grouping (Amex 4-6-5)',()=>{
 assert.equal(card.cardBrand('4242'),'visa');assert.equal(card.cardBrand('5555'),'mastercard');assert.equal(card.cardBrand('2221000000000009'),'mastercard')
 assert.equal(card.cardBrand('3782'),'amex');assert.equal(card.cardBrand('6011'),'discover')
 assert.equal(card.formatCardNumber('4242424242424242'),'4242 4242 4242 4242')
 assert.equal(card.formatCardNumber('378282246310005'),'3782 822463 10005')
})
test('expiry formatting and validation',()=>{
 assert.equal(card.formatExpiry('4'),'04');assert.equal(card.formatExpiry('12'),'12');assert.equal(card.formatExpiry('123'),'12 / 3');assert.equal(card.formatExpiry('1228'),'12 / 28')
 const now=new Date(2026,9,31)
 assert.equal(JSON.stringify(card.parseExpiry('10 / 26',now)),JSON.stringify({month:'10',year:'2026'}))
 assert.equal(card.parseExpiry('09 / 26',now),null)
 assert.equal(card.parseExpiry('13 / 28',now),null)
 assert.equal(card.parseExpiry('1',now),null)
})
test('security code length depends on brand; ZIP must be US 5 or 9 digit',()=>{
 assert.equal(card.validSecurityCode('123','4242424242424242'),true);assert.equal(card.validSecurityCode('1234','4242424242424242'),false)
 assert.equal(card.validSecurityCode('1234','378282246310005'),true);assert.equal(card.validSecurityCode('123','378282246310005'),false)
 assert.equal(card.validPostalCode('89101'),true);assert.equal(card.validPostalCode('89101-1234'),true);assert.equal(card.validPostalCode('8910'),false)
})

function cardService({approval={status:'approved',orderId:'PP-9'},quote={orderId:'o',orderNumber:'ANHU0030',card:{brand:'VISA',lastDigits:'4242',type:'CREDIT'},totals:{total:10}},capture=[{orderNumber:'ANHU0030'}]}={}){
 const calls=[];let i=0
 class PaymentStatusUnknownError extends Error{}
 const svc=load('src/services/nativeCard.ts',{registerPlugin:()=>({}),supabase:{},createPayPalOrder:null,getPayPalConfig:null,PaymentStatusUnknownError})
 const deps={
  getConfig:async()=>({clientId:'C',merchantId:'M',environment:'live'}),
  createOrder:async(id,m)=>{calls.push(['create',id,m]);return {orderId:'PP-9'}},
  approve:async o=>{calls.push(['approve',Object.keys(o).sort().join(',')]);return approval},
  invoke:async(name,body)=>{calls.push([name,body]);if(name==='card-checkout-quote')return quote;const r=capture[Math.min(i++,capture.length-1)];if(r instanceof Error)throw r;return r},
  wait:async()=>{},
 }
 return {svc,deps,calls,PaymentStatusUnknownError}
}
test('card approval creates a Card PayPal order, approves natively, then quotes',async()=>{
 const {svc,deps,calls}=cardService()
 const r=await svc.approveCard('o',{number:'4242424242424242',expirationMonth:'12',expirationYear:'2028',securityCode:'123',postalCode:'89101'},deps)
 assert.equal(r.status,'quoted');assert.equal(r.quote.paypalOrderId,'PP-9')
 assert.deepEqual(calls.map(c=>c[0]),['create','approve','card-checkout-quote'])
 assert.equal(calls[0][2],'Card')
 assert.equal(calls[1][1],'clientId,environment,expirationMonth,expirationYear,merchantId,number,orderId,postalCode,securityCode')
})
test('cancelled 3D Secure never quotes or captures',async()=>{
 const {svc,deps,calls}=cardService({approval:{status:'cancelled'}})
 assert.equal((await svc.approveCard('o',{number:'4',expirationMonth:'1',expirationYear:'2',securityCode:'3'},deps)).status,'cancelled')
 assert.ok(!calls.some(c=>c[0]==='card-checkout-quote'||c[0]==='paypal-capture-order'))
})
test('a server decline is shown, never retried; a lost response is retried then reported unknown',async()=>{
 const captures=[]
 const d=cardService({capture:captures})
 captures.push(new d.svc.CardPaymentError('Your bank did not approve this card.',false))
 await assert.rejects(d.svc.confirmCardPayment({orderId:'o',paypalOrderId:'PP-9'},d.deps),/did not approve/)
 assert.equal(d.calls.filter(c=>c[0]==='paypal-capture-order').length,1)
 const n=cardService({capture:[new Error('Failed to fetch')]})
 await assert.rejects(n.svc.confirmCardPayment({orderId:'o',paypalOrderId:'PP-9'},n.deps),e=>e instanceof n.PaymentStatusUnknownError)
 assert.equal(n.calls.filter(c=>c[0]==='paypal-capture-order').length,3)
 const ok=cardService({capture:[new Error('timeout'),{orderNumber:'ANHU0031'}]})
 const paid=await ok.svc.confirmCardPayment({orderId:'o',paypalOrderId:'PP-9',orderNumber:''},ok.deps)
 assert.equal(paid.orderNumber,'ANHU0031')
})
test('card UI: disclosure before entry, secrets cleared, surcharge labelled, native only',()=>{
 const main=fs.readFileSync(path.join(root,'src/main.ts'),'utf8')
 assert.match(main,/Credit cards include a surcharge of up to 3%, never more than our cost to accept the card\. Debit and prepaid cards have no surcharge\./)
 const submit=main.slice(main.indexOf("cartCardForm.addEventListener('submit'"),main.indexOf("cardPayNowButton.addEventListener('click'"))
 assert.ok((submit.match(/clearCardSecrets\(\)/g)||[]).length>=2,'card number/CVC cleared on success and failure')
 assert.doesNotMatch(main,/localStorage[^\n]*card|console\.[a-z]+\([^)]*cardNumber/i)
 assert.match(main,/t\.surcharge > 0 \? row\('Credit card surcharge', money\(t\.surcharge\)\) : ''/)
 assert.match(main,/return paymentMethod === 'Card' \? 'Credit card surcharge' : 'Processing fee'/)
 assert.match(main,/cartNativeCardButton\.hidden = false\n  bindNativeCardCheckout\(\)/)
 const swift=fs.readFileSync(path.join(root,'ios/App/App/NexusPayPal.swift'),'utf8')
 assert.match(swift,/registerPluginInstance|NexusCardPlugin/)
 assert.doesNotMatch(swift.slice(swift.indexOf('class NexusCardPlugin')),/print\(|NSLog|os_log/)
})
