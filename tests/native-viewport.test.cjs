const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const path=require('node:path')
const root=path.join(__dirname,'..')
const source=fs.readFileSync(path.join(root,'src/nativeViewport.ts'),'utf8').replace(/^import .*$/gm,'')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const context={exports:{},Number,Math,Boolean}
vm.runInNewContext(code,context)
const api=context.exports
const target=()=>{const props={};return {props,style:{setProperty:(k,v)=>{props[k]=v}}}}

test('measured insets are written as native CSS variables',()=>{
 const t=target()
 assert.equal(api.applySafeAreaInsets(t,{top:59,right:0,bottom:34,left:0}),true)
 assert.deepEqual({...t.props},{'--native-safe-top':'59px','--native-safe-right':'0px','--native-safe-bottom':'34px','--native-safe-left':'0px'})
})
test('small-screen and landscape insets are not forced to a 48px floor',()=>{
 const se=target();api.applySafeAreaInsets(se,{top:20,right:0,bottom:0,left:0});assert.equal(se.props['--native-safe-top'],'20px')
 const land=target();api.applySafeAreaInsets(land,{top:0,right:59,bottom:21,left:59});assert.equal(land.props['--native-safe-top'],'0px');assert.equal(land.props['--native-safe-left'],'59px')
})
test('implausible or missing insets keep the env() fallback',()=>{
 const t=target()
 assert.equal(api.applySafeAreaInsets(t,{top:Number.NaN,bottom:-4,left:9999,right:'12'}),false)
 assert.deepEqual({...t.props},{})
 assert.equal(api.applySafeAreaInsets(t,null),false)
})
test('visible viewport follows the keyboard-shrunk visual viewport',()=>{
 const t=target();api.applyVisibleViewport(t,{height:412.6,offsetTop:118.2},844)
 assert.equal(t.props['--visible-height'],'413px');assert.equal(t.props['--visible-top'],'118px')
 const f=target();api.applyVisibleViewport(f,undefined,844)
 assert.equal(f.props['--visible-height'],'844px');assert.equal(f.props['--visible-top'],'0px')
})
test('text fields count as editing; checkboxes and buttons do not',()=>{
 let selector=''
 assert.equal(api.isEditingControl(null),false)
 assert.equal(api.isEditingControl({matches:s=>{selector=s;return true}}),true)
 assert.equal(api.isEditingControl({matches:()=>false}),false)
 for(const excluded of ['checkbox','radio','button','submit'])assert.match(selector,new RegExp(`:not\\(\\[type="${excluded}"\\]\\)`))
 assert.match(selector,/textarea/);assert.match(selector,/select/)
})
test('stylesheets no longer hard-code a 48px native top inset and use measured insets',()=>{
 const slate=fs.readFileSync(path.join(root,'src/slate.css'),'utf8')
 const store=fs.readFileSync(path.join(root,'src/storefront.css'),'utf8')
 assert.doesNotMatch(slate,/48px\)\s*}/)
 assert.match(slate,/--app-safe-top:var\(--native-safe-top,env\(safe-area-inset-top/)
 const nativeSheets=store.slice(store.indexOf('/* Native iPhone sheet-safe layout.'))
 assert.doesNotMatch(nativeSheets.split('/* Native receipt overlay')[0].split('@media (min-width: 601px)')[0],/env\(safe-area-inset-bottom\)|height: 100dvh/)
})
test('main.ts installs the native viewport bridge only for the installed app',()=>{
 const main=fs.readFileSync(path.join(root,'src/main.ts'),'utf8')
 assert.match(main,/if \(isNativeApp\) installNativeViewport\(\)/)
})
test('native shell registers the safe-area plugin and publishes inset changes',()=>{
 const swift=fs.readFileSync(path.join(root,'ios/App/App/AppDelegate.swift'),'utf8')
 assert.match(swift,/registerPluginInstance\(safeAreaPlugin\)/)
 assert.match(swift,/viewSafeAreaInsetsDidChange[\s\S]*publish\(view\.safeAreaInsets\)/)
 assert.match(swift,/jsName = "NexusSafeArea"/)
})
