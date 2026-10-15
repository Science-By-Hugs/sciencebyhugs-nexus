const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const path=require('node:path')
const source=fs.readFileSync(path.join(__dirname,'../src/push.ts'),'utf8').replace(/^import .*$/gm,'')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const tick=()=>new Promise(resolve=>setImmediate(resolve))
async function setup({enabled=false,statusError=false,permission='default',userId='user-one',dismissed=false}={}){
 const nodes=new Map()
 const node=key=>{if(!nodes.has(key))nodes.set(key,{dataset:{},hidden:true,disabled:false,textContent:'',events:{},addEventListener(event,fn){this.events[event]=fn},querySelector:node});return nodes.get(key)}
 const panel=node('.push-panel'),prompt=node('[data-push-prompt]')
 panel.hidden=false
 const calls=[]
 const subscription={toJSON(){return {endpoint:'https://push.example/sub'}},async unsubscribe(){calls.push('unsubscribe')}}
 let hasSubscription=enabled
 const notification={permission:enabled?'granted':permission,async requestPermission(){calls.push('permission');notification.permission='granted';return 'granted'}}
 const memory=new Map(dismissed?[['nexus-push-prompt-dismissed:'+userId,'true']]:[])
 const context={sessionStorage:{getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)},exports:{},Error,Response,Uint8Array,atob,setTimeout:()=>0,navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{async getSubscription(){return hasSubscription?subscription:null},async subscribe(){hasSubscription=true;calls.push('subscribe');return subscription}}})}},window:{PushManager:{},Notification:notification},Notification:notification,document:{querySelector:node},supabase:{functions:{async invoke(_name,{body}){calls.push(body.action);if(body.action==='status'&&statusError)return {error:new Error('Offline')};return {data:body.action==='status'?{enabled}:body.action==='config'?{publicKey:'AQID'}:{sent:true}}}}}}
 vm.runInNewContext(code,context)
 await context.exports.bindPushPanel(userId)
 return {node,calls,prompt,memory,api:context.exports}
}
test('enabled users never see the enable prompt',async()=>{
 const s=await setup({enabled:true});assert.equal(s.prompt.hidden,true);assert.equal(s.node('[data-push-test]').hidden,false)
})
test('disabled users see prompt; enabling requests permission on click and hides prompt',async()=>{
 const s=await setup();assert.equal(s.prompt.hidden,false)
 s.node('[data-push-enable]').onclick()
 assert.equal(s.calls[0],'permission')
 await tick();assert.equal(s.prompt.hidden,true);assert.equal(s.node('[data-push-toggle]').textContent,'Turn off on this device')
})
test('unknown server status does not falsely advertise disabled notifications',async()=>{
 const s=await setup({enabled:true,statusError:true});assert.equal(s.prompt.hidden,true);assert.match(s.node('[data-push-status]').textContent,/Offline/)
})
test('disabling from settings makes prompt visible again',async()=>{
 const s=await setup({enabled:true});s.node('[data-push-toggle]').events.click();await tick();assert.equal(s.prompt.hidden,false);assert.ok(s.calls.includes('unsubscribe'))
})
test('photo and notification controls are placed inside Manage Account',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/main.ts'),'utf8')
 const hub=main.slice(main.indexOf('<div id="accountHubView"'),main.indexOf('<div id="accountManageView"'))
 const manage=main.slice(main.indexOf('<div id="accountManageView"'),main.indexOf('<div id="accountOrdersView"'))
 assert.ok(!hub.includes('${pushPrompt()}'));assert.ok(main.indexOf('${pushPrompt()}')<main.indexOf('<main class="shell">'));assert.ok(!hub.includes('${avatarPanel()}'));assert.ok(!hub.includes('${pushPanel()}'))
 assert.ok(manage.includes('${avatarPanel()}'));assert.ok(manage.includes('${pushPanel()}'))
})

test('signed-out visitors never see popup or call push status',async()=>{
 const s=await setup({enabled:true,userId:''});assert.equal(s.prompt.hidden,true);assert.equal(s.calls.length,0)
})
test('Not now dismisses the popup for this signed-in account and session',async()=>{
 const s=await setup();s.node('[data-push-dismiss]').onclick();assert.equal(s.prompt.hidden,true);assert.equal(s.memory.get('nexus-push-prompt-dismissed:user-one'),'true')
 const dismissed=await setup({dismissed:true});assert.equal(dismissed.prompt.hidden,true)
})
