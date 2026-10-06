const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
function sandbox(files,storage=new Map()) {
 const listeners={};const window={addEventListener:(n,f)=>listeners[n]=f,dispatchEvent(){}};
 const localStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const context={window,localStorage,crypto:{randomUUID},Event,TextEncoder,setTimeout:()=>1,clearTimeout(){},console:{error(){}},location:{hash:''}};
 for(const file of files)vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
 return {window,storage};
}
test('all 64 visibility masks project only selected sections with matching revisions',()=>{
 const {window:w}=sandbox(['sheet-sharing.js']),api=w.SheetSharing;
 for(let bits=0;bits<64;bits++){
  const visibility=Object.fromEntries(api.keys.map((k,i)=>[k,!!(bits&(1<<i))]));
  const sections=Object.fromEntries(api.keys.map(k=>[k,{secret:k}]));
  const p=api.project({revision:'same',visibility,sections});
  assert.equal(p.revision,'same');
  assert.deepEqual(Object.keys(p.sections),Array.from(api.keys.filter(k=>visibility[k])));
  for(const k of api.keys)assert.equal(JSON.stringify(p).includes('"secret":"'+k+'"'),visibility[k]);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(api.visibility({}))),{identity:true,traits:false,skills:false,options:false,story:false,summary:false});
});
test('migration preserves device and account IDs, active selection and durable pending edits',()=>{
 const storage=new Map([
 ['last-haiku-characters-v1','[{"id":"pc","sheet":{"name":"PC"}}]'],
 ['last-haiku-active-character-v1','pc'],
 ['last-haiku-account-alice-characters-v1','[]'],
 ['last-haiku-account-alice-active-v1','same-id'],
 ['last-haiku-account-alice-pending-v1','{"same-id":{"record":{"id":"same-id","sheet":{"name":"Draft"}},"token":"old-token"}}']]);
 const {window:w}=sandbox(['character-storage.js'],storage);
 assert.equal(w.CharacterStorage.records()[0].id,'pc');
 assert.equal(storage.get('l5r-rules-active-character-v1'),'pc');
 w.CharacterStorage.connect('alice',()=>()=>{},async()=>{});
 assert.equal(w.CharacterStorage.records()[0].sheet.name,'Draft');
 assert.equal(storage.get(w.CharacterStorage.activeKey()),'same-id');
 assert.ok(storage.get('l5r-rules-account-alice-pending-v1').includes('old-token'));
});
function campaigns(storage) {
 const {window:w,storage:map}=sandbox(['campaign-storage.js'],storage);
 let events,writes=[];const api=w.CampaignStorage;
 const connect=(uid='gm',write=async(path,data)=>writes.push([path,data]))=>api.connect(uid,{write,subscribe:e=>{events=e;return()=>{};}});
 return {api,storage:map,connect,writes,receive:(path,data)=>events.receive(path,data),index:ids=>events.index(ids),revoke:id=>events.revoked(id)};
}
test('campaign session drafts preserve line breaks, survive reload and retry connection errors',async()=>{
 const d=campaigns();d.connect('gm',async()=>{throw new Error('offline');});d.index(['c']);
 const draft={title:'Session',text:'a\n\nb\n',updatedAt:'now'};d.api.queue('campaigns/c/sessions/s',draft);await d.api.flush();
 assert.equal(d.api.get('campaigns/c/sessions/s').text,draft.text);
 const reload=campaigns(d.storage);reload.connect();reload.index(['c']);reload.receive('campaigns/c/sessions/s',{...draft,text:'old'});await reload.api.flush();
 assert.equal(reload.writes[0][1].text,draft.text);
});
test('oversized sessions keep unsaved drafts without uploading',async()=>{
 const d=campaigns();d.connect();d.index(['c']);d.api.queue('campaigns/c/sessions/s',{title:'Long',text:'x'.repeat(1000000),updatedAt:'now'});await d.api.flush();
 assert.equal(d.writes.length,0);assert.match(d.api.status,/Too large/);assert.equal(d.api.get('campaigns/c/sessions/s').text.length,1000000);
});
test('membership loss and sign-out clear shared caches; denied writes stop retries and retain detached drafts',async()=>{
 const d=campaigns();let count=0;d.connect('gm',async()=>{count++;throw Object.assign(new Error('denied'),{code:'permission-denied'});});d.index(['c']);
 d.receive('campaigns/c',{title:'Campaign',gmUid:'gm'});d.api.queue('campaigns/c/sessions/s',{title:'Draft',text:'private draft'});await d.api.flush();await d.api.flush();
 assert.equal(count,1);assert.equal(d.api.get('campaigns/c'),undefined);assert.equal(d.api.drafts()['campaigns/c/sessions/s'].text,'private draft');
 d.receive('campaigns/c',{title:'Campaign'});d.revoke('c');assert.equal(d.api.get('campaigns/c'),undefined);
 d.receive('campaigns/c',{title:'Campaign'});d.api.connect(null,null);assert.equal(d.api.get('campaigns/c'),undefined);assert.equal(d.storage.get('l5r-rules-account-gm-campaign-cache-v1'),undefined);
});
test('built web content has no source branding or source links and omits repository attribution',()=>{
 const data=JSON.parse(fs.readFileSync('public/wiki.json','utf8'));
 assert.equal(data.site,'l5r-rules');
 for(const page of Object.values(data.pages))assert.doesNotMatch(page.html,/Last Haiku|(?:href|src)=["'][^"']*lasthaiku/i);
 assert.ok(fs.readFileSync('ATTRIBUTION.md','utf8').includes('CC BY-SA 3.0'));
});
