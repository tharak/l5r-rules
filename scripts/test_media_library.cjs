const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');
function library({uid='me',uploads=[],hidden=[]} = {}) {
  const events = [], calls = [];
  const backend = {watchLibrary:receive => { receive(uploads); return () => {}; },libraryImage:async id => { calls.push(['full',id]); return 'data:image/jpeg;base64,AAAA'; },deleteLibrary:async (id,opts) => calls.push(['delete',id,opts]),
    watchLibraryHidden:receive => { receive(hidden); return () => {}; },setLibraryHidden:async list => calls.push(['hidden',[...list]])};
  const catalog = JSON.parse(fs.readFileSync(path.join(root,'public/assets/library.json'),'utf8'));
  const window = {CampaignStorage:{uid,backend},dispatchEvent:e => events.push(e.type)};
  const context = {window,Event:class { constructor(type) { this.type = type; } },fetch:async () => ({json:async () => catalog}),console};
  vm.runInNewContext(fs.readFileSync(path.join(root,'official-images.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(path.join(root,'ui-components.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(path.join(root,'media-library.js'),'utf8'),context);
  return {L:window.MediaLibrary,window,events,calls,catalog,O:window.OfficialImages};
}
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };

test('the catalog lists every image once, grouped by source; official art loads from its original file, the rest from the site',async()=>{
  const {catalog,O,L} = library();
  const sources = catalog.groups.map(g => g.source);
  assert.deepEqual(sources,['Maps','Clan art','Clan mons','Families','Lore','Rings','Site']);
  const srcs = catalog.groups.flatMap(g => g.items.map(i => i.src));
  assert.equal(new Set(srcs).size,srcs.length,'no image twice');
  for (const src of srcs) {
    if (O.original(src)) assert.ok(!fs.existsSync(path.join(root,src)),'no copy kept: '+src);
    else assert.ok(fs.existsSync(path.join(root,src)),src);
  }
  for (const src of O.paths()) assert.ok(srcs.includes(src),'every official picture is listed: '+src);
  // The cut and recoloured mons stay on the site.
  for (const src of ['public/assets/clans/mandala/fox.webp','public/assets/clans/wiki/mantis.webp']) { assert.ok(srcs.includes(src));assert.equal(O.original(src),''); }
  // Saved ids keep their old path; they load from the original.
  const map = O.original('public/assets/rokugan-map.webp');
  assert.match(map,/^https:\/\/cdn\.svc\.asmodee\.net\/production-l5r\/uploads\/image-converter\/2023\/06\/03_Map_Background-Rokugan/);
  assert.equal(await L.imageSrc('asset:public/assets/rokugan-map.webp'),map);assert.equal(L.cachedSrc('asset:public/assets/rokugan-map.webp'),map);
});
test('Remove hides a picture for this player only (Restore brings it back); your own uploads are deleted instead',async()=>{
  const {L,calls,O} = library({uploads:[{id:'u1',title:'My map',thumb:'data:image/jpeg;base64,AAAA',uploaderUid:'me',uploaderName:'Tharak'},{id:'o1',title:'Their art',url:'https://example.com/a.webp',uploaderUid:'other',uploaderName:'Alice'}],hidden:['asset:public/assets/rings/air.webp']});
  L.ensure();await settle();
  let html = L.render();
  // Every tile opens its detail view and has its remove button.
  assert.match(html,/data-library-open="u1"[^]*data-library-delete="u1"/);assert.doesNotMatch(html,/data-library-hide="u1"/);
  assert.match(html,/data-library-open="o1"[^]*data-library-hide="o1"/);
  assert.match(html,/data-library-hide="asset:public\/assets\/rokugan-map\.webp"/);
  assert.ok(html.includes(`src="${O.original('public/assets/rokugan-map.webp')}"`),'official art shows from its original file');
  // Hidden pictures leave the lists and the pickers, and wait in "Hidden by you".
  assert.ok(!L.groups().flatMap(g => g.items).some(i => i.id === 'asset:public/assets/rings/air.webp'));
  assert.match(html,/<details class="library-hidden" data-library-hidden><summary>Hidden by you <small>1<\/small>[^]*data-library-restore="asset:public\/assets\/rings\/air\.webp"/);
  const root = {querySelectorAll:() => [],addEventListener(){}};L.mount(root);
  const click = attrs => root.onclick({target:{closest:sel => { const key = sel.slice(1,-1); return key in attrs ? {dataset:{[key.replace('data-','').replace(/-(\w)/g,(_,c) => c.toUpperCase())]:attrs[key]}} : null; }}});
  await click({'data-library-hide':'o1'});
  assert.deepEqual(calls.at(-1),['hidden',['asset:public/assets/rings/air.webp','o1']]);
  assert.ok(!L.groups().flatMap(g => g.items).some(i => i.id === 'o1'),'gone from this player\'s lists at once');
  await click({'data-library-restore':'asset:public/assets/rings/air.webp'});
  assert.deepEqual(calls.at(-1),['hidden',['o1']]);
  assert.ok(L.groups().flatMap(g => g.items).some(i => i.id === 'asset:public/assets/rings/air.webp'));
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
