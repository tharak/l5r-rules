const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');
function library({uid='me',uploads=[]} = {}) {
  const events = [], calls = [];
  const backend = {watchLibrary:receive => { receive(uploads); return () => {}; },libraryImage:async id => { calls.push(['full',id]); return 'data:image/jpeg;base64,AAAA'; },deleteLibrary:async (id,opts) => calls.push(['delete',id,opts])};
  const catalog = JSON.parse(fs.readFileSync(path.join(root,'public/assets/library.json'),'utf8'));
  const window = {CampaignStorage:{uid,backend},dispatchEvent:e => events.push(e.type)};
  const context = {window,Event:class { constructor(type) { this.type = type; } },fetch:async () => ({json:async () => catalog}),console};
  vm.runInNewContext(fs.readFileSync(path.join(root,'ui-components.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(path.join(root,'media-library.js'),'utf8'),context);
  return {L:window.MediaLibrary,window,events,calls,catalog};
}
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

test('the bundled catalog lists every site image once, grouped by source',()=>{
  const {catalog} = library();
  const sources = catalog.groups.map(g => g.source);
  assert.deepEqual(sources,['Maps','Clan art','Clan mons','Families','Lore','Rings','Site']);
  const srcs = catalog.groups.flatMap(g => g.items.map(i => i.src));
  assert.equal(new Set(srcs).size,srcs.length,'no image twice');
  for (const src of srcs) assert.ok(fs.existsSync(path.join(root,src)),src);
  assert.ok(srcs.includes('public/assets/rokugan-map.webp'));
});
test('pictures players added come first; links show from their address; only your own can be deleted',async()=>{
  const {L,calls} = library({uploads:[
    {id:'u1',title:'My map',thumb:'data:image/jpeg;base64,AAAA',uploaderUid:'me',uploaderName:'Tharak'},
    {id:'l1',title:'Official art',url:'https://example.com/art.webp',uploaderUid:'other',uploaderName:'Alice'},
  ]});
  L.ensure();await settle();
  const groups = L.groups();
  assert.equal(groups[0].source,'Added by players');assert.equal(groups[1].source,'Maps');
  const html = L.render();
  assert.match(html,/<img src="https:\/\/example\.com\/art\.webp"[^>]*>[^]*Official art<small>Link · Alice<\/small>/);
  assert.match(html,/data-library-delete="u1"/);assert.doesNotMatch(html,/data-library-delete="l1"/);
  assert.match(html,/class="library-link" data-library-link/);
  assert.equal(await L.imageSrc('l1'),'https://example.com/art.webp');
  assert.equal(await L.imageSrc('asset:public/assets/rings/air.webp'),'public/assets/rings/air.webp');
  assert.equal(await L.imageSrc('u1'),'data:image/jpeg;base64,AAAA');
  assert.equal(L.cachedSrc('u1'),'data:image/jpeg;base64,AAAA','the full image is loaded once, then cached');
  assert.deepEqual(calls,[['full','u1']]);
});
test('signed out: the library asks you to sign in',()=>{
  const {L} = library({uid:null});
  assert.match(L.render(),/Sign in to see and add pictures/);
});
