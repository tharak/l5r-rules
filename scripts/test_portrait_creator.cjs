const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname,'..');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'portrait-creator.js'),'utf8'),context);
const P = context.window.PortraitCreator;
const shipped = JSON.parse(fs.readFileSync(path.join(root,'public/assets/portrait-creator/manifest.json'),'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

const small = () => ({
  version:1,canvas:256,
  attributes:{gender:[{id:'male',label:'Male'},{id:'female',label:'Female'}],age:[{id:'young',label:'Young'},{id:'adult',label:'Adult'},{id:'elder',label:'Elder'}],body:[{id:'slim',label:'Slim'},{id:'heavy',label:'Heavy'}]},
  slots:[
    {id:'background',label:'Background',required:true,options:[{id:'paper',label:'Paper',files:{'*/*/*':'layers/bg.svg'}}]},
    {id:'body',label:null,required:true,options:[{id:'base',label:'Body',files:{'*/*/slim':'layers/body-slim.png','*/*/heavy':'layers/body-heavy.png'}}]},
    {id:'hair',label:'Hair',options:[
      {id:'topknot',label:'Topknot',files:{'male/*/*':'layers/topknot.png','male/elder/*':'layers/topknot-grey.png'}},
      {id:'bun',label:'Bun',files:{'female/*/*':'layers/bun.png'}}]}
  ],
  mon:{'*/*/slim':{x:10,y:20,size:30},'*/*/heavy':{x:40,y:20,size:30,opacity:0.5}}
});

test('the shipped manifest is valid and every combination draws every required layer from a real file',()=>{
  assert.deepEqual(plain(P.validateManifest(shipped)),[]);
  const {gender,age,body} = shipped.attributes;
  for (const g of gender) for (const a of age) for (const b of body) {
    const recipe = P.normalizeRecipe(shipped,{gender:g.id,age:a.id,body:b.id});
    const stack = P.layerStack(shipped,recipe);
    for (const slot of shipped.slots.filter(slot=>slot.required)) assert.ok(stack.some(layer=>layer.slot===slot.id),`${g.id}/${a.id}/${b.id} is missing ${slot.id}`);
    for (const layer of stack) assert.ok(fs.existsSync(path.join(root,P.ROOT,layer.file)),layer.file);
    assert.ok(P.monPlacement(shipped,recipe),`${g.id}/${a.id}/${b.id} has no mon placement`);
  }
});

test('files resolve to the most specific matching key, and unmatched options are hidden',()=>{
  const m = small();
  const files = m.slots[2].options[0].files;
  assert.equal(P.resolve(files,{gender:'male',age:'adult',body:'slim'}),'layers/topknot.png');
  assert.equal(P.resolve(files,{gender:'male',age:'elder',body:'slim'}),'layers/topknot-grey.png');
  assert.equal(P.resolve(files,{gender:'female',age:'elder',body:'slim'}),null);
  assert.equal(P.resolve({'*/*/*':'a','*/*/*b':'never'},{gender:'x',age:'y',body:'z'}),'a');
  const hair = m.slots[2];
  assert.deepEqual(plain(P.availableOptions(m,hair,{gender:'female',age:'adult',body:'slim'}).map(o=>o.id)),['bun']);
  assert.deepEqual(plain(P.availableOptions(m,hair,{gender:'male',age:'adult',body:'slim'}).map(o=>o.id)),['topknot']);
});

test('recipes fill defaults, keep valid choices, allow None only for optional slots, and drop the rest',()=>{
  const m = small();
  const defaults = P.normalizeRecipe(m,{});
  assert.deepEqual(plain(defaults),{layers:{background:'paper',body:'base',hair:'topknot'},mon:true,gender:'male',age:'adult',body:'slim'});
  // Switching gender swaps to an option that exists for it.
  assert.equal(P.normalizeRecipe(m,{...defaults,gender:'female'}).layers.hair,'bun');
  assert.equal(P.normalizeRecipe(m,{gender:'female',layers:{hair:'none'}}).layers.hair,'none');
  assert.equal(P.normalizeRecipe(m,{layers:{background:'none'}}).layers.background,'paper');
  const junk = P.normalizeRecipe(m,{gender:'robot',age:7,layers:{hair:'mohawk',extra:'x'},mon:false});
  assert.deepEqual(plain(junk),{layers:{background:'paper',body:'base',hair:'topknot'},mon:false,gender:'male',age:'adult',body:'slim'});
});

test('layers stack bottom first and the mon follows the body type or can be hidden',()=>{
  const m = small();
  const recipe = P.normalizeRecipe(m,{gender:'male',age:'elder',body:'heavy'});
  assert.deepEqual(plain(P.layerStack(m,recipe).map(layer=>layer.file)),['layers/bg.svg','layers/body-heavy.png','layers/topknot-grey.png']);
  assert.deepEqual(plain(P.layerStack(m,{...recipe,layers:{...recipe.layers,hair:'none'}}).map(layer=>layer.slot)),['background','body']);
  assert.deepEqual(plain(P.monPlacement(m,recipe)),{x:40,y:20,size:30,opacity:0.5});
  assert.equal(P.monPlacement(m,{...recipe,mon:false}),null);
});

test('random recipes are always valid for the manifest',()=>{
  let seed = 1;
  const random = () => (seed = (seed*16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 200; i++) {
    const recipe = P.randomRecipe(shipped,random);
    assert.deepEqual(plain(P.normalizeRecipe(shipped,recipe)),plain(recipe));
  }
});

test('manifest validation rejects unsafe paths, unknown attributes, and malformed entries',()=>{
  const broken = (change) => { const m = small(); change(m); return P.validateManifest(m); };
  assert.deepEqual(plain(P.validateManifest(small())),[]);
  for (const file of ['../secret.png','https://example.test/a.png','data:image/png;base64,AA','/layers/a.png','layers/a.gif','layers/../a.png','layers/A B.png'])
    assert.ok(broken(m=>{m.slots[0].options[0].files['*/*/*']=file;}).length,file);
  assert.ok(broken(m=>{m.slots[2].options[0].files={'robot/*/*':'layers/a.png'};}).length);
  assert.ok(broken(m=>{m.slots[2].options[0].files={'male/*':'layers/a.png'};}).length);
  assert.ok(broken(m=>{m.slots[2].options.push({id:'topknot',label:'Again',files:{'*/*/*':'layers/a.png'}});}).length);
  assert.ok(broken(m=>{m.slots[2].options[0].id='none';}).length);
  assert.ok(broken(m=>{m.attributes.age=[];}).length);
  assert.ok(broken(m=>{m.mon['*/*/slim'].opacity=2;}).length);
  assert.ok(broken(m=>{m.version=2;}).length);
});
