const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const path=require('node:path')
const root=path.join(__dirname,'..')
const read=file=>fs.readFileSync(path.join(root,file),'utf8')
const tick=()=>new Promise(resolve=>setImmediate(resolve))

function loadPush({native=true}={}){
 const source=read('src/push.ts').replace(/^import .*$/gm,'')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const listeners={},invokes=[],memory=new Map()
 const PushNotifications={
  async addListener(name,fn){listeners[name]=fn;return {remove(){}}},
  async checkPermissions(){return {receive:'granted'}},async requestPermissions(){return {receive:'granted'}},
  async register(){setImmediate(()=>listeners.registration&&listeners.registration({value:'ab'.repeat(32)}))},async unregister(){},
 }
 const context={exports:{},Object,Error,Promise,Response,setImmediate,
  Capacitor:{isNativePlatform:()=>native,getPlatform:()=>native?'ios':'web'},PushNotifications,
  registerPlugin:()=>({get:async()=>({apnsEnvironment:'production',bundleId:'com.sciencebyhugs.nexus.staging'})}),
  crypto:{randomUUID:()=>'11111111-2222-4333-8444-555555555555'},
  window:{localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},setTimeout:(fn,ms)=>{if(ms<1000)setImmediate(fn);return 0}},
  supabase:{functions:{async invoke(name,{body}){invokes.push({name,body});return {data:{registered:true,enabled:true,sent:true}}}}},
  document:{querySelector:()=>null},navigator:{},atob,Uint8Array}
 vm.runInNewContext(code,context)
 return {api:context.exports,listeners,invokes,memory}
}

test('notification taps only open allow-listed in-app routes',()=>{
 const {api}=loadPush()
 assert.equal(api.nativePushRoute({url:'?push=orders'}),'orders')
 for(const bad of [{url:'https://evil.example'},{url:'?push=orders&x=1'},{url:'toString'},{url:'__proto__'},{},null,undefined,{url:42}])
  assert.equal(api.nativePushRoute(bad),null)
})
test('tapping an order notification calls the open-orders handler once',async()=>{
 const {api,listeners}=loadPush();const opened=[]
 api.installNativePushHandlers(route=>opened.push(route));await tick()
 listeners.pushNotificationActionPerformed({notification:{data:{url:'?push=orders'}}})
 listeners.pushNotificationActionPerformed({notification:{data:{url:'javascript:alert(1)'}}})
 assert.deepEqual([...opened],['orders'])
})
test('native registration sends installation, token, APNs environment and bundle ID',async()=>{
 const {api,invokes}=loadPush()
 await api.enablePush()
 const call=invokes.find(c=>c.name==='native-push')
 assert.ok(call,'native-push was called')
 assert.equal(call.body.action,'register')
 assert.equal(call.body.environment,'production')
 assert.equal(call.body.bundleId,'com.sciencebyhugs.nexus.staging')
 assert.match(call.body.installationId,/^[0-9a-f-]{36}$/)
 assert.equal(call.body.token,'ab'.repeat(32))
 assert.ok(!invokes.some(c=>c.name==='app-push'),'native path never touches web push')
})
test('a rotated APNs token is re-registered; an unchanged token is not',async()=>{
 const {api,listeners,invokes,memory}=loadPush()
 api.installNativePushHandlers(()=>{});await tick()
 memory.set('nexus-native-push-token:ios','ab'.repeat(32))
 listeners.registration({value:'ab'.repeat(32)});await tick()
 assert.equal(invokes.length,0)
 listeners.registration({value:'cd'.repeat(32)});await tick();await tick()
 assert.equal(invokes.length,1);assert.equal(invokes[0].body.token,'cd'.repeat(32))
 assert.equal(memory.get('nexus-native-push-token:ios'),'cd'.repeat(32))
})

test('native-push is scoped to the signed-in customer and never trusts client user ids',()=>{
 const fn=read('supabase/functions/native-push/index.ts')
 assert.match(fn,/userClient\.auth\.getUser\(\)/)
 assert.doesNotMatch(fn,/body\.userId|body\.user_id/)
 for(const q of fn.match(/from public\.native_push_devices[\s\S]*?`/g)||[])
  if(!/installation_id <> \$\{installationId\}/.test(q)) assert.match(q,/user_id = \$\{user\.id\}/,'every device read/delete is owner-scoped')
 assert.match(fn,/LIMITS = \{ writes: 30, reads: 300, windowMinutes: 60, tests: 5, testMinutes: 10 \}/)
 assert.match(fn,/bundleId !== config\.bundleId/)
 assert.match(fn,/APNS_TOKEN = \/\^\[0-9a-f\]\{64,200\}\$\//)
})
test('APNs credentials come only from secrets and full tokens are never logged',()=>{
 const apns=read('supabase/functions/_shared/apns.ts'),fn=read('supabase/functions/native-push/index.ts'),dispatch=read('supabase/functions/app-push/index.ts')
 assert.match(apns,/Deno\.env\.get\('APNS_PRIVATE_KEY'\)/)
 assert.doesNotMatch(apns+fn+dispatch,/BEGIN PRIVATE KEY-----\s*\n?\s*[A-Za-z0-9+/]{20}/)
 for(const src of [apns,fn,dispatch]) for(const line of src.split('\n').filter(l=>/console\.(log|error|info)/.test(l)))
  assert.doesNotMatch(line,/token|privateKey|jwt/i,line)
 assert.match(fn,/token_hint/);assert.match(apns,/slice\(-6\)/)
 assert.equal(fs.readdirSync(root,{recursive:true}).filter(f=>/\.p8$/.test(String(f))&&!String(f).includes('node_modules')).length,0)
})
test('dispatcher sends queued NEXUS events to native devices without double delivery',()=>{
 const dispatch=read('supabase/functions/app-push/index.ts')
 assert.match(dispatch,/event\.app === 'nexus' && apnsConfig\(\)\.configured/)
 assert.match(dispatch,/if \(nativeDevices\.length && isAppleWebPush\(sub\.endpoint\)\) \{/)
 assert.match(dispatch,/hostname\.endsWith\('\.push\.apple\.com'\)/)
 assert.match(dispatch,/delivered_endpoints \|\| \[\]\)\.includes\(device\.id\)/)
 assert.match(dispatch,/invalidToken\) await sql`update public\.native_push_devices set invalidated_at=now\(\)/)
 assert.match(dispatch,/keys\.nexus_rotation_20261023/)
})
test('migration keeps device tokens unreadable by clients and queues native-only customers',()=>{
 const m=read('supabase/migrations/20261030230000_native_push_devices.sql')
 assert.match(m,/alter table public\.native_push_devices enable row level security;/)
 assert.match(m,/revoke all on public\.native_push_devices from anon, authenticated;/)
 assert.doesNotMatch(m,/create policy[\s\S]*native_push_devices/i)
 assert.match(m,/or exists \(select 1 from public\.native_push_devices d where d\.app='nexus' and d\.user_id=customer_auth and d\.invalidated_at is null\)/)
})
test('customer order alerts: internal steps silent, milestones name the order, repeats dropped',()=>{
 const m=read('supabase/migrations/20261031150000_customer_order_push_tightening.sql')
 assert.match(m,/internal_statuses text\[\] := array\['checkout_pending', 'checkout_error'\]/)
 assert.match(m,/if old_status = 'checkout_pending' and new_status = 'processing' then return null; end if;/)
 assert.match(m,/q\.payload->>'body' = nexus_body\n\s+and q\.created_at > now\(\) - interval '10 minutes'/)
 assert.match(m,/'CORE · Order alert'/)
})
