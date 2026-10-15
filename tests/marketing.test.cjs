const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/marketing.ts'),'utf8').replace(/^import .*$/gm,'')
function setup(user={id:'owner',email:'owner@example.com'},insertError=null){
 const calls=[];const context={exports:{},Error,supabase:{auth:{async getUser(){return{data:{user},error:null}}},from(table){assert.equal(table,'marketing_consent_events');return{async insert(row){calls.push(row);return{error:insertError}}}}}}
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context)
 return{api:context.exports,calls}
}
function fields(email=false,sms=false,phone=''){const nodes={'[data-email-consent]':{checked:email},'[data-sms-consent]':{checked:sms},'[data-marketing-phone]':{value:phone}};return{querySelector:key=>nodes[key]}}
test('signup consent is optional and neither channel is prechecked',()=>{const{api}=setup();assert.doesNotMatch(api.marketingFields('signup'),/checked|type="checkbox"[^>]*required/);const c=api.readMarketing(fields());assert.equal(c.email_opt_in,false);assert.equal(c.sms_opt_in,false);assert.equal(c.phone,null)})
test('SMS requires an explicit valid destination; email does not imply SMS',()=>{const{api}=setup();assert.throws(()=>api.readMarketing(fields(false,true,'')));assert.equal(api.readMarketing(fields(false,true,'7025551234')).phone,'+17025551234');assert.equal(api.readMarketing(fields(false,true,'+1 (702) 555-1234')).phone,'+17025551234');assert.equal(api.readMarketing(fields(true,false)).sms_opt_in,false)})
test('choices and withdrawals use authenticated identity, version, and server timestamp',async()=>{const{api,calls}=setup();await api.saveMarketing(fields(true,true,'7025551234'),'nexus','activation');await api.saveMarketing(fields(),'nexus');assert.equal(calls[0].phone,'+17025551234');assert.equal(calls[0].user_id,'owner');assert.equal(calls[0].email,'owner@example.com');assert.equal(calls[0].disclosure_version,'2026-10-01');assert.equal(calls[0].recorded_at,undefined);assert.equal(calls[1].sms_opt_in,false);assert.equal(calls[1].email_opt_in,false)})
test('signed-out and failed writes cannot report saved consent',async()=>{const s=setup(null);await assert.rejects(s.api.saveMarketing(fields(),'pulse'));assert.equal(s.calls.length,0);const e=setup(undefined,new Error('offline'));await assert.rejects(e.api.saveMarketing(fields(),'pulse'),/offline/)})

test('US local, formatted, leading 1 and international numbers normalize without changing destination',()=>{
 const{api}=setup()
 for(const value of ['7025551234','(702) 555-1234','702.555.1234','1 702 555 1234','+1 (702) 555-1234']) assert.equal(api.readMarketing(fields(false,true,value)).phone,'+17025551234')
 assert.equal(api.readMarketing(fields(false,true,'+44 7700 900123')).phone,'+447700900123')
 for(const value of ['702555123','702555123456','702abc1234','7025551234 ext 1']) assert.throws(()=>api.readMarketing(fields(false,true,value)))
 assert.equal(api.displayMarketingPhone('+17025551234'),'7025551234')
 assert.equal(api.displayMarketingPhone('+447700900123'),'+447700900123')
})
