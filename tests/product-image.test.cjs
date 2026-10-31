const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/productImage.ts'), 'utf8')
const context = {exports:{}}
vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, context)
const {productLabel, productImageMarkup, hasCustomProductImage} = context.exports

test('extracts actual amounts without consuming product identifiers or guessing', () => {
  for (const [name, expectedName, strength] of [
    ['IGF-1 LR3 1MG','IGF-1 LR3','1 mg'], ['TESAMORELIN (10 mg)','TESAMORELIN','10 mg'],
    ['BPC-157 500mcg','BPC-157','500 mcg'], ['TEST-C 250 mg/ml','TEST-C','250 mg/ml'],
    ['BAC WATER 3ML','BAC WATER','3 ml'], ['MOTS-C','MOTS-C',''],
    ['18G Luer Lock Needle - 100pk','18G LUER LOCK NEEDLE - 100PK',''],
    ['BPC-157 5mg + TB-500 5mg','BPC-157 5MG + TB-500 5MG',''],
  ]) {
    const result = productLabel({name})
    assert.equal(result.name, expectedName); assert.equal(result.strength, strength)
  }
})

test('supplies never inherit powder vials; water and concentrations use liquid artwork', () => {
  assert.equal(productLabel({name:'18G Luer Lock Needle - 100pk',product_type:'Supply'}).kind,'supply')
  assert.equal(productLabel({name:'BAC WATER 3ML',product_categories:{name:'Supplies'}}).kind,'liquid')
  assert.equal(productLabel({name:'TEST-E 250mg/ml'}).kind,'liquid')
  const powder = productLabel({name:'IGF-1 LR3 1MG',product_categories:{name:'Lyophilized Powders'}})
  assert.equal(powder.kind,'powder'); assert.equal(powder.descriptor,'Lyophilized Peptide')
})

test('keeps custom images while upgrading old placeholders and empty values', () => {
  for (const value of [null,'','  ','/default-product-vial.webp','https://example.test/default-product-vial-slate.webp?v=2','/brand/default-product-vial-slate.svg']) assert.equal(hasCustomProductImage(value),false)
  const photo = productImageMarkup({id:'a',name:'Example',image_url:'https://example.test/photo.webp'},'/nexus/')
  assert.match(photo,/<img /); assert.match(photo,/data-catalog-photo="a"/)
  assert.doesNotMatch(photo,/<svg/)
  const fallback = productImageMarkup({name:'Example 10mg',image_url:'/default-product-vial.webp'},'/nexus/')
  assert.match(fallback,/href="\/nexus\/products\/vial-powder.webp"/)
  assert.match(fallback,/>10 mg<\/text>/)
})

test('escapes catalog strings, fits long names and keeps missing strength blank', () => {
  const svg = productImageMarkup({name:'Very long research compound <script>alert("x")</script> & more 80mg'},'/')
  assert.doesNotMatch(svg,/<script>/); assert.match(svg,/&lt;SCRIPT&gt;/)
  for (const text of svg.matchAll(/<text[^>]+font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) assert.ok(Number(text[1]) > 0)
  assert.match(svg,/>80 mg<\/text>/)
  const noStrength = productImageMarkup({name:'MOTS-C'},'/')
  assert.doesNotMatch(noStrength,/>\d+ mg<\/text>/)
  assert.match(noStrength,/role="img"/); assert.match(noStrength,/illustrated product image/)
})

test('photo templates are shipped and precached for offline/PWA use', () => {
  const path = require('node:path')
  const config = fs.readFileSync(path.join(__dirname,'../vite.config.ts'),'utf8')
  for (const file of ['vial-powder.webp','vial-liquid.webp']) {
    assert.ok(fs.statSync(path.join(__dirname,'../public/products',file)).size > 1000)
    assert.ok(config.includes('products/'+file))
  }
})
