// Render the real app template into the development-only, offline design fixture.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..', import.meta.url)))
import vm from 'node:vm'
import ts from 'typescript'
const sandbox = {registerPlugin:()=>({}),BiometricLockState:class{},Capacitor:{isNativePlatform:()=>true},supabase:{auth:{onAuthStateChange:()=>({})}}}
function presentation(path) {
  const code=fs.readFileSync(path,'utf8').replace(/^import .*$/gm,'')
  const context={...sandbox,exports:{}}
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context)
  return context.exports
}
const source=fs.readFileSync('src/main.ts','utf8')
const previous=fs.readFileSync('design-review.html','utf8')
const cards=previous.slice(previous.indexOf('<div id="catalogGrid"'),previous.indexOf('\n    </section>',previous.indexOf('<div id="catalogGrid"')))
const context={...sandbox,...presentation('src/appleSignIn.ts'),...presentation('src/biometricUnlock.ts'),...presentation('src/icons.ts'),...presentation('src/avatar.ts'),...presentation('src/marketing.ts'),...presentation('src/push.ts'),...presentation('src/policies.ts'),app:{innerHTML:''},defaultProductImageUrl:'/science-by-hugs-vial-v3.png',ENABLE_TEST_PAYMENTS:false,hasValidEntryAcknowledgment:()=>false}
context.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]))
context.researchUsePolicy=context.nexusPolicies.find(p=>p.id==='research-use')
vm.createContext(context)
const policySource=source.slice(source.indexOf('const policyCardsMarkup ='),source.indexOf('app.innerHTML ='))
vm.runInContext(policySource,context)
const template=source.slice(source.indexOf('app.innerHTML ='),source.indexOf('\nconst discountCodeInput'))
vm.runInContext(template,context)
let markup=context.app.innerHTML
const a=markup.indexOf('<div id="catalogGrid"'),b=markup.indexOf('\n    </section>',a)
markup=markup.slice(0,a)+cards+markup.slice(b)
let prefix=previous.slice(0,previous.indexOf('<div id="app">'))
if(!prefix.includes('/src/refinement.css'))prefix=prefix.replace('<link rel="stylesheet" href="/src/fluid.css">','<link rel="stylesheet" href="/src/fluid.css"><link rel="stylesheet" href="/src/refinement.css">')
if(!prefix.includes('/src/appleSignIn.css'))prefix=prefix.replace('<link rel="stylesheet" href="/src/refinement.css">','<link rel="stylesheet" href="/src/refinement.css"><link rel="stylesheet" href="/src/appleSignIn.css">')
if(!prefix.includes('/src/biometricUnlock.css'))prefix=prefix.replace('<link rel="stylesheet" href="/src/refinement.css">','<link rel="stylesheet" href="/src/refinement.css"><link rel="stylesheet" href="/src/biometricUnlock.css">')
if(!prefix.includes('/src/compact.css'))prefix=prefix.replace('<link rel="stylesheet" href="/src/refinement.css">','<link rel="stylesheet" href="/src/refinement.css"><link rel="stylesheet" href="/src/compact.css">')
if(!prefix.includes('/src/authRedesign.css'))prefix=prefix.replace('</head>','<link rel="stylesheet" href="/src/authRedesign.css"></head>')
prefix=prefix.replace('<body>','<body class="native-app">').replace('.topbar{top:46px}','')
if(!prefix.includes('data-preview="Membership"'))prefix=prefix.replace('<button type="button" data-preview="Referrals">','<button type="button" data-preview="Membership">Membership</button><button type="button" data-preview="Referrals">')
if(!prefix.includes('data-preview="Home signed out"'))prefix=prefix.replace('<button type="button" data-preview="Home">Home</button>','<button type="button" data-preview="Home">Home</button><button type="button" data-preview="Home signed out">Home signed out</button>')
if(!prefix.includes('data-preview="Apple profile"'))prefix=prefix.replace('<button type="button" data-preview="Sign in">Sign in</button>','<button type="button" data-preview="Sign in">Sign in</button><button type="button" data-preview="Apple profile">Apple profile</button>')
fs.writeFileSync('design-review.html',prefix+'<div id="app">'+markup+'</div><script type="module" src="/design-review.ts"></script></body></html>')
console.log('Updated design fixture from current app template; no live account calls.')
