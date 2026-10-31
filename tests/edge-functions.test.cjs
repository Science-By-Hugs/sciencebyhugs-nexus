const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const dir=path.join(__dirname,'../supabase/functions')

// Regression guard for the Oct 30 production outage: a deploy shipped functions with
// their module-level helpers (money, getAccessToken, paypalBaseUrl, ...) missing, so
// every checkout threw ReferenceError. Each function must declare what it calls.
const functions=fs.readdirSync(dir).filter(f=>!f.startsWith('_')&&fs.existsSync(path.join(dir,f,'index.ts')))
const globals=new Set(['Deno','Response','Request','JSON','Number','String','Math','Date','Array','Map','Set','Promise','Object','Error','URL','URLSearchParams','crypto','fetch','btoa','atob','encodeURIComponent','decodeURIComponent','console','setTimeout','TextEncoder','TextDecoder','Uint8Array','Boolean','parseInt','parseFloat','isNaN','structuredClone','BigInt','Symbol','RegExp','Intl','queueMicrotask','CryptoKey','ReturnType','Record','Partial','Promise'])

for(const fn of functions){
 test(`${fn}: every called function is declared or imported`,()=>{
  const file=path.join(dir,fn,'index.ts')
  const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.ES2022,true)
  const declared=new Set()
  const called=new Set()
  const visit=node=>{
   if((ts.isFunctionDeclaration(node)||ts.isVariableDeclaration(node)||ts.isParameter(node)||ts.isClassDeclaration(node))&&node.name&&ts.isIdentifier(node.name))declared.add(node.name.text)
   if(ts.isImportDeclaration(node)&&node.importClause){const c=node.importClause;if(c.name)declared.add(c.name.text);const b=c.namedBindings;if(b&&ts.isNamedImports(b))b.elements.forEach(e=>declared.add(e.name.text));if(b&&ts.isNamespaceImport(b))declared.add(b.name.text)}
   if(ts.isBindingElement(node)&&ts.isIdentifier(node.name))declared.add(node.name.text)
   if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression))called.add(node.expression.text)
   ts.forEachChild(node,visit)
  }
  visit(sf)
  const missing=[...called].filter(n=>!declared.has(n)&&!globals.has(n))
  assert.deepEqual(missing,[],`${fn} calls undeclared: ${missing.join(', ')}`)
 })
}
test('production functions use the rotated service key',()=>{
 for(const fn of functions){
  const src=fs.readFileSync(path.join(dir,fn,'index.ts'),'utf8')
  assert.doesNotMatch(src,/secretKeys\.default\b/,`${fn} still uses the pre-rotation service key`)
 }
})
