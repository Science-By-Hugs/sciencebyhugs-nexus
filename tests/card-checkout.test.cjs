const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const path=require('node:path')
const root=path.join(__dirname,'..')
const read=f=>fs.readFileSync(path.join(root,f),'utf8')

// Load the pure helpers straight out of the edge function source.
function helpers(file,names){
 const src=read(file)
 const pick=name=>{
  const start=src.search(new RegExp(`(^|\\n)(const ${name} =|function ${name}\\()`))
  assert.ok(start>=0,`${name} not found in ${file}`)
  let i=src.indexOf('{',src.indexOf(name,start)),depth=0
  if(src.slice(start).trimStart().startsWith('const')&&!src.slice(start,src.indexOf('\n',start+1)).includes('{')) return src.slice(start,src.indexOf('\n',start+1))
  for(;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&--depth===0)break}
  return src.slice(start,i+1)
 }
 const consts=src.match(/^const (SURCHARGE_RATE|PAYPAL_CARD_RATE|PAYPAL_CARD_FIXED|TAX_RATE) = [^\n]+$/gm)||[]
 const code=ts.transpileModule(consts.join('\n')+'\n'+names.map(pick).join('\n')+'\n;({'+names.join(',')+'})',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
 return vm.runInNewContext(code,{Math,String,Number})
}
const quote=helpers('supabase/functions/card-checkout-quote/index.ts',['money','creditCardSurcharge','threeDSecureDecision'])
const capture=helpers('supabase/functions/paypal-capture-order/index.ts',['threeDSecureDecision'])

test('credit surcharge is 3% but never more than PayPal’s actual card cost',()=>{
 assert.equal(quote.creditCardSurcharge(4.32),0.13)   // 3% of $4.32
 assert.equal(quote.creditCardSurcharge(100),3)      // 3% < 2.89%+0.29 (3.18)
 assert.equal(quote.creditCardSurcharge(263),7.89)   // still 3%
 assert.equal(quote.creditCardSurcharge(1000),29.19) // capped at cost: 28.90+0.29 (3% would be 30.00)
 assert.equal(quote.creditCardSurcharge(0),0)
})
test('only CREDIT cards are surcharged (debit, prepaid and unknown are not)',()=>{
 const src=read('supabase/functions/card-checkout-quote/index.ts')
 assert.match(src,/const surcharge = cardType === "CREDIT" \? creditCardSurcharge\(taxableMerchandise\) : 0;/)
 assert.match(src,/const tax = money\(\(taxableMerchandise \+ surcharge\) \* TAX_RATE\);/)
})

const cases=[
 ['3DS not required (no result)',undefined,'continue'],
 ['Y/Y POSSIBLE',{liability_shift:'POSSIBLE',three_d_secure:{enrollment_status:'Y',authentication_status:'Y'}},'continue'],
 ['Y/A POSSIBLE',{liability_shift:'POSSIBLE',three_d_secure:{enrollment_status:'Y',authentication_status:'A'}},'continue'],
 ['Y/N NO',{liability_shift:'NO',three_d_secure:{enrollment_status:'Y',authentication_status:'N'}},'stop'],
 ['Y/R NO',{liability_shift:'NO',three_d_secure:{enrollment_status:'Y',authentication_status:'R'}},'stop'],
 ['Y/U UNKNOWN',{liability_shift:'UNKNOWN',three_d_secure:{enrollment_status:'Y',authentication_status:'U'}},'retry'],
 ['Y/U NO',{liability_shift:'NO',three_d_secure:{enrollment_status:'Y',authentication_status:'U'}},'retry'],
 ['Y/C UNKNOWN',{liability_shift:'UNKNOWN',three_d_secure:{enrollment_status:'Y',authentication_status:'C'}},'retry'],
 ['Y/- NO',{liability_shift:'NO',three_d_secure:{enrollment_status:'Y'}},'retry'],
 ['N NO',{liability_shift:'NO',three_d_secure:{enrollment_status:'N'}},'continue'],
 ['U NO',{liability_shift:'NO',three_d_secure:{enrollment_status:'U'}},'continue'],
 ['U UNKNOWN',{liability_shift:'UNKNOWN',three_d_secure:{enrollment_status:'U'}},'retry'],
 ['B NO',{liability_shift:'NO',three_d_secure:{enrollment_status:'B'}},'continue'],
 ['UNKNOWN only',{liability_shift:'UNKNOWN'},'retry'],
]
for(const [name,auth,expected] of cases){
 test(`3D Secure ${name} -> ${expected} (quote and capture agree)`,()=>{
  assert.equal(quote.threeDSecureDecision(auth),expected)
  assert.equal(capture.threeDSecureDecision(auth),expected)
 })
}

test('capture checks 3D Secure and the confirmed total before capturing a card',()=>{
 const src=read('supabase/functions/paypal-capture-order/index.ts')
 const card=src.indexOf('if (provider === "Card") {'),cap=src.indexOf('/capture`,')
 assert.ok(card>0&&card<cap,'card checks run before the capture call')
 assert.match(src.slice(card,cap),/threeDSecureDecision\(details\?\.payment_source\?\.card\?\.authentication_result\)/)
 assert.match(src.slice(card,cap),/Math\.abs\(held - Number\(order\.total \|\| 0\)\) > 0\.001/)
})
test('Card is accepted end to end by the server functions',()=>{
 assert.match(read('supabase/functions/create-checkout-order/index.ts'),/requestedPaymentMethod === "card" \? "Card"/)
 assert.match(read('supabase/functions/paypal-create-order/index.ts'),/\["PayPal", "Venmo", "Apple Pay", "Card"\]/)
 assert.match(read('supabase/functions/paypal-capture-order/index.ts'),/requestedProvider === "card" \? "Card"/)
 // Wallet fee stays exactly as before; cards start with no fee.
 assert.match(read('supabase/functions/create-checkout-order/index.ts'),/paymentMethod === "PayPal" \|\| paymentMethod === "Venmo" \|\| paymentMethod === "Apple Pay"\n\s+\? money\(taxableMerchandise \* 0\.05\)/)
})
