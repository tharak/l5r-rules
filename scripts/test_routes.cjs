const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../routes.js'),'utf8'),context);
const R = context.window.Routes;

test('slugs are readable, accent-free and never empty',()=>{
  assert.equal(R.slugify('Bayushi Yoén'),'bayushi-yoen');
  assert.equal(R.slugify('  Session #1: The Inn!  '),'session-1-the-inn');
  assert.equal(R.slugify(''),'item');
  assert.equal(R.slugify('漢字'),'item');
  assert.ok(R.slugify('x'.repeat(80)).length<=40);
});
test('segments carry the shortest unique ID prefix',()=>{
  assert.equal(R.segment('Mario','c4d5e6f7',[]),'mario-c4d5');
  assert.equal(R.segment('Mario','c4d5e6f7',['c4d5e6f7','c4d5aaaa']),'mario-c4d5e');
  assert.equal(R.segment('Short','ab',[]),'short-ab');
});
test('segments resolve by ID only, so renames keep links working',()=>{
  const items=[{id:'c4d5e6f7'},{id:'c4d5aaaa'},{id:'x7q2zzzz'}];
  assert.equal(R.resolve('old-name-x7q2',items).id,'x7q2zzzz');
  assert.equal(R.resolve('c4d5e6f7',items).id,'c4d5e6f7','a bare full ID');
  assert.equal(R.resolve('mario-c4d5e',items).id,'c4d5e6f7');
  assert.equal(R.resolve('mario-c4d5',items),null,'ambiguous');
  assert.equal(R.resolve('mario-zzzz',items),null,'unknown');
  assert.equal(R.resolve('mario-c4',items),null,'too short');
  assert.equal(R.resolve('',items),null);
  assert.equal(R.resolve('n-abcd',[{key:'abcdef'}],item=>item.key).key,'abcdef');
});
