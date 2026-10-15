const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
test('keyboard resize keeps focused input visible and restores navigation state after dismissal',()=>{
 const handlers={},state={height:844,keyboard:false,scrolled:0,css:''}
 const viewport={get height(){return state.height},addEventListener:(name,fn)=>handlers[name]=fn}
 const context={exports:{},window:{innerHeight:844,visualViewport:viewport,addEventListener:()=>{}},requestAnimationFrame:fn=>fn(),document:{documentElement:{style:{setProperty:(k,v)=>state.css=v}},body:{classList:{toggle:(k,v)=>state.keyboard=v}},activeElement:{matches:()=>true,scrollIntoView:()=>state.scrolled++}}}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/viewport.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context)
 context.exports.bindVisibleViewport();assert.equal(state.keyboard,false)
 state.height=480;handlers.resize();assert.equal(state.keyboard,true);assert.equal(state.css,'480px');assert.equal(state.scrolled,1)
 state.height=844;handlers.resize();assert.equal(state.keyboard,false);assert.equal(state.css,'844px')
})
