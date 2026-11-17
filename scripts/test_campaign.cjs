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
test('public names come from the profile, falling back to older section-based documents',()=>{
 const {window:w}=sandbox(['sheet-sharing.js']),api=w.SheetSharing;
 assert.equal(api.publicName({profile:{name:'Doji Ren'}}),'Doji Ren');
 assert.equal(api.publicName({sections:{identity:{name:'Old Format'}}}),'Old Format');
 assert.equal(api.publicName(null),'');
 assert.deepEqual([...api.STATS],['honor','glory','status','taint']);
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
 const store={uid:'gm',status:'Connected',get:path=>data.get(path),drafts:()=>({}),queue:(path,value)=>value===null?data.delete(path):data.set(path,value),flush:async()=>{},
  list:prefix=>[...data].filter(([path])=>path.startsWith(prefix)&&!path.slice(prefix.length).includes('/')).map(([path,value])=>({id:path.slice(prefix.length),...value}))};
 store.backend={watchSheet:async(campaignId,pcId,full,receive,fail)=>{
  const item={campaignId,pcId,full,receive,fail,stopped:false};watches.push(item);
  return ()=>{item.stopped=true;};
 }};
 const window={CampaignStorage:store,CharacterBuilder:{list:()=>characters},addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent(){}};
 const location={hash:'#/campaigns',href:'http://localhost/#/campaigns'};
 vm.runInNewContext(fs.readFileSync('ui-components.js','utf8'),{window});vm.runInNewContext(fs.readFileSync('sheet-sharing.js','utf8'),{window,structuredClone,crypto:require('node:crypto')});
 vm.runInNewContext(fs.readFileSync('campaign-ui.js','utf8'),{window,document:{addEventListener:(name,fn)=>documentListeners[name]=fn,querySelector:()=>null},location,Event,console,setTimeout,crypto:require('node:crypto')});
 const render=()=>window.CampaignUI.render('campaigns');
 return {data,store,watches,window,location,listeners,documentListeners,render,setCharacters:value=>characters=value,
  click:(action,id)=>documentListeners.click({target:{closest:()=>({dataset:{campaign:action,id}})}})};
}
test('only a PC\'s creator edits it; the GM views the full sheet and players open the public view',()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/pcs/alice',{ownerUid:'alice',characterId:'alice-pc'});
 d.data.set('campaigns/c/pcs/bob',{ownerUid:'bob',characterId:'bob-pc'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 const buttons=()=>[...render().matchAll(/data-campaign="pc-open" data-id="([^"]+)"[^>]*>([^<]+)</g)].map(m=>m[1]+':'+m[2]);
 render();d.click('section','pcs');
 assert.deepEqual(buttons(),['alice:Full sheet','bob:Full sheet']);
 d.click('pc-open','bob');assert.match(render(),/id="campaign-editor"/);
 assert.ok(d.watches.some(w=>w.pcId==='bob'&&w.full),'the GM watches the full sheet');
 d.click('close-sheet');
 d.store.uid='alice';render();d.click('section','pcs');
 assert.deepEqual(buttons(),['alice:Edit','bob:Open']);
 d.click('pc-open','bob');
 assert.doesNotMatch(render(),/id="campaign-editor"/);
 assert.equal(d.location.hash,'#/pc/bob/bob-pc');
 assert.ok(!d.watches.some(w=>w.full&&w.pcId==='bob'&&w!==d.watches.find(x=>x.full)),'players never watch a full sheet');
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

test('the GM adds, keeps and removes NPC pictures for new and existing NPCs',async()=>{
 const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYwPRVdM7zQAAAABJRU5ErkJggg==';
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 const pick=()=>d.documentListeners.change({target:{dataset:{npcPortrait:''},files:[{type:'image/png'}]}});
 d.window.UI.readPortrait=async()=>picture;
 render();d.click('section','npcs');
 await d.click('npc-new');
 assert.match(render(),/Add picture/);
 await pick();
 assert.match(render(),/<img class="ui-portrait-image"/);
 d.documentListeners.input({target:{dataset:{campaignField:'npc-name'},value:'Court messenger'}});
 await d.click('npc-save');
 const [id]=[...d.data.keys()].filter(path=>path.startsWith('campaigns/c/npcs/'));
 assert.equal(d.data.get(id).portrait,picture);
 await d.click('npc-open',id.split('/').pop());
 d.documentListeners.input({target:{dataset:{campaignField:'npc-notes'},value:'Carries a sealed letter.'}});
 assert.equal(d.data.get(id).portrait,picture,'editing notes kept the picture');
 await d.click('npc-portrait-remove');
 assert.equal(d.data.get(id).portrait,undefined);
 assert.equal(d.data.get(id).notes,'Carries a sealed letter.');
 await pick();
 assert.equal(d.data.get(id).portrait,picture);
 // Create picture hands the NPC to the portrait creator and saves its result.
 let request;d.window.PortraitCreator={open:next=>{request=next;}};
 await d.click('npc-portrait-remove');
 await d.click('npc-portrait-create');
 assert.equal(request.title,'Court messenger');assert.equal(request.returnHref,'#/campaigns/c');
 request.onUse(picture);
 assert.equal(d.data.get(id).portrait,picture);
});
test('the public view shows the profile, escapes text, and handles missing or old documents',()=>{
 const window={addEventListener(){}};
 for(const file of ['ui-components.js','character-catalog.js','sheet-sharing.js','character-public.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,structuredClone,crypto:require('node:crypto')});
 const P=window.PublicCharacter;
 const html=P.page({revision:'r',profile:{name:'Doji <Ren>',portrait:'javascript:alert(1)',clan:'Crane',family:'Doji',school:'Kakita Bushi',insightRank:2,gear:['Katana'],stats:{glory:2.5},advantages:[{name:'Fame',selection:''}],disadvantages:[],journal:[{id:'a',text:'Old <b>entry</b>',createdAt:'2026-11-01'},{id:'b',text:'New entry',createdAt:'2026-11-05'}]}});
 assert.match(html,/Doji &lt;Ren&gt;/);assert.ok(!html.includes('javascript:'));
 assert.match(html,/public\/assets\/clans\/official\/crane\.webp/,'falls back to the clan mon without a valid picture');
 assert.match(html,/Glory<\/span><strong>2\.5/);assert.match(html,/Carries<\/h2><p>Katana/);assert.match(html,/Fame/);
 assert.ok(!html.includes('Disadvantages'),'empty sections are left out');
 assert.ok(html.indexOf('New entry')<html.indexOf('Old &lt;b&gt;entry'),'newest journal entry first');
 assert.match(P.page(null),/Character unavailable/);
 assert.match(P.page({sections:{identity:{name:'Old Format'}}}),/Old Format[\s\S]*saves it again/);
});

test('the GM adds and removes session images; plot drafts carry their images to the save',async()=>{
 const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYwPRVdM7zQAAAABJRU5ErkJggg==';
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/sessions/s',{title:'Session one',text:'',createdAt:'2026-11-01',updatedAt:'2026-11-01'});
 d.window.UI.readPortrait=async()=>picture;
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 render();
 await d.click('session-open','s');
 assert.match(render(),/data-entry-image="session"/);
 await d.documentListeners.change({target:{dataset:{entryImage:'session'},files:[{type:'image/png'}],value:'x'}});
 assert.equal(JSON.stringify(d.data.get('campaigns/c/sessions/s').images),JSON.stringify([picture]));
 assert.match(render(),/campaign-image"><img src="data:image\/png/);
 await d.click('image-remove','session:0');
 assert.equal(JSON.stringify(d.data.get('campaigns/c/sessions/s').images),'[]');
 render();d.click('section','plots');await d.click('plot-new');
 await d.documentListeners.change({target:{dataset:{entryImage:'plot'},files:[{type:'image/png'}],value:'x'}});
 assert.match(render(),/data-campaign="image-remove" data-id="plot:0"/);
});

test('read marks: "!" on unread entries, tabs and cards; Mark as read clears it; everyone sees who read',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/members/gm',{displayName:'Game Master'});d.data.set('campaigns/c/members/alice',{displayName:'Alice'});
 d.data.set('campaigns/c/sessions/s',{title:'Session one',text:'Hi',createdAt:'2026-11-01',updatedAt:'2026-11-01T10:00:00Z'});
 d.store.uid='alice';
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 assert.match(d.window.CampaignUI.render('campaigns'),/campaign-unread/);
 let html=render();
 assert.match(html,/Sessions !/);assert.match(html,/Session one<\/span>(<small[^>]*>[^<]*<\/small>)?<span class="campaign-unread"/);assert.match(html,/Not read yet/);
 await d.click('mark-read','sessions:s');
 assert.equal(d.data.get('campaigns/c/reads/alice').marks['sessions:s'],'2026-11-01T10:00:00Z');
 html=render();
 assert.doesNotMatch(html,/Sessions !/);assert.doesNotMatch(html,/campaign-unread/);assert.match(html,/Read by Alice/);
 // A new note on the session makes it unread again.
 d.data.set('campaigns/c/notes/n',{creatorUid:'gm',targetKind:'sessions',targetId:'s',text:'More',createdAt:'2026-11-02',updatedAt:'2026-11-02T10:00:00Z'});
 assert.match(render(),/Sessions !/);assert.match(render(),/Not read yet/);
});

test('timeline: newest sessions first, an always-visible map, entries chosen with selectors, used entries disabled, and a popup',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 render();await d.click('section','timeline');
 let html=render();
 assert.match(html,/timeline-map/);assert.match(html,/Sessions appear here once the GM adds them/);
 assert.doesNotMatch(html,/<h2>Timeline<\/h2>/,'no Timeline heading');
 d.data.set('campaigns/c/sessions/s1',{title:'First session',text:'',createdAt:'2026-11-01',updatedAt:'2026-11-20'});
 d.data.set('campaigns/c/sessions/s2',{title:'Second session',text:'',createdAt:'2026-11-08',updatedAt:'2026-11-08'});
 d.data.set('campaigns/c/npcs/n',{name:'Court messenger',notes:''});
 d.data.set('campaigns/c/notes/note1',{creatorUid:'gm',targetKind:'npcs',targetId:'n',text:'Carries a sealed letter\nFrom the Emerald Champion.',createdAt:'2026-11-08',updatedAt:'2026-11-08'});
 html=render();
 assert.ok(html.indexOf('Second session')<html.indexOf('First session'),'newest first');
 assert.match(html,/data-timeline-map="s2"/,'newest session selected');
 assert.match(html,/data-campaign="timeline-target" data-id="npcs:n"/);
 await d.click('timeline-target','npcs:n');
 assert.match(render(),/data-campaign="timeline-entry" data-id="note1"/);
 await d.click('timeline-entry','note1');
 assert.match(render(),/timeline-map-placing/);
 const map={dataset:{timelineMap:'s2'},getBoundingClientRect:()=>({left:0,top:0,width:200,height:400})};
 d.documentListeners.click({target:{closest:selector=>selector==='[data-campaign]'?null:selector==='[data-timeline-map]'?map:null},clientX:100,clientY:100});
 const [key]=[...d.data.keys()].filter(k=>k.startsWith('campaigns/c/timeline/'));
 assert.equal(d.data.get(key).noteId,'note1');assert.equal(d.data.get(key).sessionId,'s2');
 html=render();
 assert.match(html,/timeline-pin" style="left:50%;top:25%"[\s\S]*Carries a sealed letter/);
 // The pinned entry is now disabled for every session.
 await d.click('timeline-session','s1');await d.click('timeline-target','npcs:n');
 assert.match(render(),/data-campaign="timeline-entry" data-id="note1"[^>]*disabled/);
 await d.click('timeline-session','s2');
 await d.click('note-popup',key.split('/').pop());
 assert.match(render(),/role="dialog"[\s\S]*From the Emerald Champion/);
 await d.click('note-popup-close');
 d.store.uid='alice';
 assert.doesNotMatch(render(),/timeline-target|timeline-unpin/);
});
test('timeline entries for a PC include the public entries of the character journal',()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/sessions/s',{title:'Session',text:'',createdAt:'2026-11-01'});
 d.data.set('campaigns/c/pcs/p',{ownerUid:'alice',characterId:'a-pc'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 render();d.click('section','timeline');render();
 const watch=d.watches.find(w=>w.pcId==='p'&&!w.full);
 watch.receive({profile:{name:'Doji Ren',journal:[{id:'j1',text:'Reached the capital',createdAt:'2026-11-02'}]}},null,{fromCache:false});
 d.click('timeline-target','pcs:p');
 assert.match(render(),/data-campaign="timeline-entry" data-id="journal:j1"[^>]*>Reached the capital/);
});
