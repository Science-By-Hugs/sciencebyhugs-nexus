const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/nativePush.ts'),'utf8').replace(/^import .*$/gm,'')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function setup({configured=true,enabled=false,permission='prompt',registrationError=false,serverError=false}={}){
 const calls=[],listeners=new Map(),memory=new Map();let removed=0
 const PushNotifications={
  async checkPermissions(){calls.push('check');return{receive:permission}},
  async requestPermissions(){calls.push('permission');permission='granted';return{receive:permission}},
  async addListener(name,fn){listeners.set(name,fn);return{async remove(){listeners.delete(name);removed++}}},
  async register(){calls.push('apple-register');const fn=listeners.get(registrationError?'registrationError':'registration');fn(registrationError?{error:'failed'}:{value:'a'.repeat(64)})},
  async unregister(){calls.push('apple-unregister')},async removeAllDeliveredNotifications(){calls.push('clear-alerts')}
 }
 const context={exports:{},Error,Response,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},document:{querySelector(){return null}},PushNotifications,supabase:{functions:{async invoke(name,{body}){assert.equal(name,'native-push');calls.push(body.action);assert.match(body.installationId,/^[a-f0-9-]{36}$/);if(body.action==='register'&&serverError)return{data:{error:'Offline'}};return{data:body.action==='config'?{configured}:body.action==='status'?{configured,enabled}:{sent:true}}}}}}
 vm.runInNewContext(code,context)
 return{api:context.exports,calls,listeners,memory,removed:()=>removed}
}
test('native permission is only requested on enable, then Apple token is saved',async()=>{
 const s=setup();assert.equal((await s.api.nativePushStatus()).enabled,false)
 assert.ok(!s.calls.includes('permission'));s.calls.length=0
 await s.api.enableNativePush()
 assert.deepEqual(s.calls,['config','check','permission','apple-register','register'])
 assert.equal(s.listeners.size,0);assert.equal(s.removed(),2)
})
test('blocked permission and unconfigured backend never register a token',async()=>{
 const blocked=setup({permission:'denied'});await assert.rejects(blocked.api.enableNativePush(),/iPhone Settings/)
 assert.ok(!blocked.calls.includes('apple-register'))
 const unavailable=setup({configured:false});await assert.rejects(unavailable.api.enableNativePush(),/being configured/)
 assert.deepEqual(unavailable.calls,['config'])
})
test('registration failure removes listeners and never calls backend registration',async()=>{
 const s=setup({registrationError:true});await assert.rejects(s.api.enableNativePush(),/could not register/)
 assert.ok(!s.calls.includes('register'));assert.equal(s.listeners.size,0)
})
test('failed server registration remains a failure rather than reporting enabled',async()=>{
 const s=setup({serverError:true});await assert.rejects(s.api.enableNativePush(),/Offline/)
})
test('sign-out clears backend registration before Apple registration and delivered alerts',async()=>{
 const s=setup();await s.api.disableNativePush()
 assert.deepEqual(s.calls,['unregister','apple-unregister','clear-alerts'])
})
test('previously consented device refreshes its Apple token without another permission prompt',async()=>{
 const s=setup({permission:'granted',enabled:true});assert.equal((await s.api.nativePushStatus()).enabled,true)
 assert.deepEqual(s.calls,['status','check','apple-register','register'])
})
