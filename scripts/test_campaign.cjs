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
test('all 128 visibility masks project only selected sections with matching revisions',()=>{
 const {window:w}=sandbox(['sheet-sharing.js']),api=w.SheetSharing;
 for(let bits=0;bits<128;bits++){
  const visibility=Object.fromEntries(api.keys.map((k,i)=>[k,!!(bits&(1<<i))]));
  const sections=Object.fromEntries(api.keys.map(k=>[k,{secret:k}]));
  const p=api.project({revision:'same',visibility,sections});
  assert.equal(p.revision,'same');
  assert.deepEqual(Object.keys(p.sections),Array.from(api.keys.filter(k=>visibility[k])));
  for(const k of api.keys)assert.equal(JSON.stringify(p).includes('"secret":"'+k+'"'),visibility[k]);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(api.visibility({}))),{identity:true,traits:false,skills:false,options:false,story:false,summary:false,abilities:false});
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
test('reload withholds cached text from other authors until privacy is confirmed',()=>{
 const storage=new Map([['l5r-rules-account-bob-campaign-cache-v1',JSON.stringify({
  'campaigns/c':{title:'Campaign'},
  'campaigns/c/plots/p':{creatorUid:'alice',public:true,text:'formerly public'},
  'campaigns/c/notes/n':{creatorUid:'alice',public:true,text:'formerly public note'},
  'campaigns/c/notes/own':{creatorUid:'bob',public:false,text:'own draft'}
 })]]);
 const d=campaigns(storage);d.connect('bob');
 assert.equal(d.api.get('campaigns/c/plots/p'),undefined);
 assert.equal(d.api.get('campaigns/c/notes/n'),undefined);
 assert.equal(d.api.get('campaigns/c/notes/own').text,'own draft');
 d.index(['c']);d.receive('campaigns/c/plots/p',{creatorUid:'alice',public:true,text:'confirmed public'});
 assert.equal(d.api.get('campaigns/c/plots/p').text,'confirmed public');
 d.receive('campaigns/c/plots/p',null);assert.equal(d.api.get('campaigns/c/plots/p'),undefined);
});
test('built web content has no source branding or source links and omits repository attribution',()=>{
 const data=JSON.parse(fs.readFileSync('public/wiki.json','utf8'));
 assert.equal(data.site,'l5r-rules');
 for(const page of Object.values(data.pages))assert.doesNotMatch(page.html,/Last Haiku|(?:href|src)=["'][^"']*lasthaiku/i);
 assert.ok(fs.readFileSync('ATTRIBUTION.md','utf8').includes('CC BY-SA 3.0'));
});

function campaignCards() {
 const data=new Map(),watches=[],listeners={},documentListeners={};let characters=[];
 const store={uid:'gm',status:'Connected',get:path=>data.get(path),drafts:()=>({}),
  list:prefix=>[...data].filter(([path])=>path.startsWith(prefix)&&!path.slice(prefix.length).includes('/')).map(([path,value])=>({id:path.slice(prefix.length),...value}))};
 store.backend={watchSheet:async(campaignId,pcId,full,receive,fail)=>{
  const item={campaignId,pcId,full,receive,fail,stopped:false};watches.push(item);
  return ()=>{item.stopped=true;};
 }};
 const window={CampaignStorage:store,CharacterBuilder:{list:()=>characters},addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent(){}};
 const location={hash:'#/campaigns',href:'http://localhost/#/campaigns'};
 vm.runInNewContext(fs.readFileSync('ui-components.js','utf8'),{window});
 vm.runInNewContext(fs.readFileSync('campaign-ui.js','utf8'),{window,document:{addEventListener:(name,fn)=>documentListeners[name]=fn},location,Event,console,setTimeout});
 const render=()=>window.CampaignUI.render('campaigns');
 return {data,store,watches,window,location,listeners,render,setCharacters:value=>characters=value,
  click:(action,id)=>documentListeners.click({target:{closest:()=>({dataset:{campaign:action,id}})}})};
}
test('removing read-only sheets retains campaign editing only for owners and the GM',()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/pcs/alice',{ownerUid:'alice',characterId:'alice-pc'});
 d.data.set('campaigns/c/pcs/bob',{ownerUid:'bob',characterId:'bob-pc'});
 d.window.CampaignUI.render('campaigns/c');d.click('section','pcs');
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 assert.equal((render().match(/data-campaign="pc-open"/g)||[]).length,2);
 assert.doesNotMatch(render(),/pc-view|readonly-sheet/);
 d.store.uid='alice';
 render();d.click('section','pcs');
 assert.equal((render().match(/data-campaign="pc-open"/g)||[]).length,1);
 d.click('pc-open','bob');assert.doesNotMatch(render(),/id="campaign-editor"/);
 d.store.uid='other';render();d.click('section','pcs');
 assert.doesNotMatch(render(),/data-campaign="pc-open"|pc-view|readonly-sheet/);
});
test('campaign cards display PC - player, escape names, and handle empty and private identities',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});d.data.set('campaigns/empty',{title:'Empty',gmUid:'gm'});
 d.data.set('campaigns/c/pcs/own',{ownerUid:'gm',characterId:'own'});
 d.data.set('campaigns/c/pcs/other',{ownerUid:'alice',characterId:'pc'});
 d.data.set('campaigns/c/members/gm',{displayName:'Game Master'});d.data.set('campaigns/c/members/alice',{displayName:'Alice & Bob'});
 d.setCharacters([{id:'own',name:'Hida <Kenta>'}]);
 let html=d.render();
 assert.match(html,/Hida &lt;Kenta&gt; - Game Master/);assert.match(html,/Private PC - Alice &amp; Bob/);assert.match(html,/No PCs linked yet/);
 assert.equal(d.watches.length,1);assert.equal(d.watches[0].full,false);
 d.watches[0].receive({sections:{identity:{name:'Doji Rei'}}},null,{fromCache:false});
 assert.match(d.render(),/Doji Rei - Alice &amp; Bob/);
 d.data.delete('campaigns/c/members/alice');assert.match(d.render(),/Doji Rei - Player/);
 d.setCharacters([{id:'own',name:'Hida Renamed'}]);assert.match(d.render(),/Hida Renamed - Game Master/);
});
test('campaign card names require server-confirmed public identity and disappear when access is revoked',async()=>{
 const d=campaignCards();d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});d.data.set('campaigns/c/pcs/p',{ownerUid:'alice',characterId:'pc'});d.render();
 const watch=d.watches[0];
 watch.receive({sections:{identity:{name:'Cached private name'}}},null,{fromCache:true});assert.doesNotMatch(d.render(),/Cached private name/);
 watch.receive({sections:{identity:{name:'Public name'}}},null,{fromCache:false});assert.match(d.render(),/Public name - Player/);
 watch.receive({sections:{}},null,{fromCache:false});assert.doesNotMatch(d.render(),/Public name/);
 watch.receive({sections:{identity:{name:'Pending name'}}},null,{fromCache:false,hasPendingWrites:true});assert.doesNotMatch(d.render(),/Pending name/);
 watch.receive({sections:{identity:{name:'Public name'}}},null,{fromCache:false});watch.fail({code:'permission-denied'});assert.doesNotMatch(d.render(),/Public name/);
 assert.equal(d.watches.length,1);
});
test('campaign cards share subscriptions, move to surviving associations, and reject stale callbacks after account changes',async()=>{
 const d=campaignCards();
 for(const c of ['one','two']){d.data.set('campaigns/'+c,{title:c,gmUid:'gm'});d.data.set('campaigns/'+c+'/pcs/p',{ownerUid:'alice',characterId:'pc'});}
 d.render();await Promise.resolve();assert.equal(d.watches.length,1);
 const first=d.watches[0];first.receive({sections:{identity:{name:'Shared'}}},null,{fromCache:false});assert.equal((d.render().match(/Shared - Player/g)||[]).length,2);
 d.data.delete('campaigns/one');d.data.delete('campaigns/one/pcs/p');d.render();await Promise.resolve();assert.equal(first.stopped,true);assert.equal(d.watches.length,2);assert.equal(d.watches[1].campaignId,'two');
 first.receive({sections:{identity:{name:'Stale first campaign'}}},null,{fromCache:false});assert.doesNotMatch(d.render(),/Stale first campaign/);
 const second=d.watches[1];second.receive({sections:{identity:{name:'Surviving'}}},null,{fromCache:false});assert.match(d.render(),/Surviving/);
 d.store.uid='bob';d.render();await Promise.resolve();assert.equal(second.stopped,true);assert.doesNotMatch(d.render(),/Surviving/);
 second.receive({sections:{identity:{name:'Old account secret'}}},null,{fromCache:false});assert.doesNotMatch(d.render(),/Old account secret/);
 d.location.hash='#/characters';d.listeners.hashchange();await Promise.resolve();assert.equal(d.watches[2].stopped,true);
 d.store.uid=null;d.store.backend=null;assert.doesNotMatch(d.render(),/campaign-card-pcs/);
});
