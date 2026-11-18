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
 const doc={addEventListener:(name,fn)=>documentListeners[name]=fn,querySelector:()=>null};
 vm.runInNewContext(fs.readFileSync('campaign-ui.js','utf8'),{window,document:doc,location,Event,console,setTimeout,crypto:require('node:crypto')});
 // Like the app, render the address a click moved to (a section or item inside this campaign).
 const renderSlug=window.CampaignUI.render;
 window.CampaignUI.render=slug=>{const here=location.hash.slice(2).split('/').map(decodeURIComponent).join('/');return renderSlug(slug.startsWith('campaigns/')&&here.startsWith(slug+'/')?here:slug);};
 const render=()=>window.CampaignUI.render('campaigns');
 return {data,store,watches,window,location,listeners,documentListeners,doc,render,setCharacters:value=>characters=value,
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
 const gmWatches=d.watches.length;
 d.store.uid='alice';render();d.click('section','pcs');
 assert.deepEqual(buttons(),['alice:Edit','bob:Open']);
 d.click('pc-open','bob');
 assert.doesNotMatch(render(),/id="campaign-editor"/);
 assert.equal(d.location.hash,'#/pc/bob/bob-pc');
 assert.ok(!d.watches.slice(gmWatches).some(w=>w.full),'players never watch a full sheet');
});
test('campaign cards display PC - player, escape names, and handle empty and private identities',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});d.data.set('campaigns/empty',{title:'Empty',gmUid:'gm'});
 d.data.set('campaigns/c/pcs/own',{ownerUid:'gm',characterId:'own'});
 d.data.set('campaigns/c/pcs/other',{ownerUid:'alice',characterId:'pc'});
 d.data.set('campaigns/c/members/gm',{displayName:'Game Master'});d.data.set('campaigns/c/members/alice',{displayName:'Alice & Bob'});
 d.setCharacters([{id:'own',name:'Hida <Kenta>'}]);
 let html=d.render();
 assert.match(html,/Hida &lt;Kenta&gt; - Game Master/);assert.match(html,/Private PC - Alice &amp; Bob/);
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
 d.documentListeners.input({target:{dataset:{campaignField:'npc-name'},value:'Court envoy'}});
 assert.equal(d.data.get(id).portrait,picture,'editing the name kept the picture');
 await d.click('npc-portrait-remove');
 assert.equal(d.data.get(id).portrait,undefined);
 assert.equal(d.data.get(id).name,'Court envoy');
 await pick();
 assert.equal(d.data.get(id).portrait,picture);
 // Create picture hands the NPC to the portrait creator and saves its result.
 let request;d.window.PortraitCreator={open:next=>{request=next;}};
 await d.click('npc-portrait-remove');
 await d.click('npc-portrait-create');
 assert.equal(request.title,'Court envoy');assert.equal(request.returnHref,'#/campaigns/c/npcs');
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
 assert.ok(html.indexOf('Old &lt;b&gt;entry')<html.indexOf('New entry'),'journal entries run oldest first, 1..n');assert.match(html,/data-journal-jump="a"[^>]*>1<[\s\S]*data-journal-jump="b"[^>]*>2</,'jump buttons numbered 1..n');
 assert.match(P.page(null),/Character unavailable/);
 assert.match(P.page({sections:{identity:{name:'Old Format'}}}),/Old Format[\s\S]*saves it again/);
});

test('the GM adds and removes session images from the library; session and plot drafts carry their images to the save',async()=>{
 const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYwPRVdM7zQAAAABJRU5ErkJggg==';
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/sessions/s',{title:'Session one',text:'',createdAt:'2026-11-01',updatedAt:'2026-11-01'});
 d.window.UI.readPortrait=async()=>picture;
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 let view=render();await d.click('section','sessions');view=render();
 assert.match(view,/class="[^"]*campaign-actions[^"]*"[^>]*>[^]*?data-campaign="session-open"[^]*?data-campaign="note-new" data-id="sessions:s"[^>]*>\+ Entry</,'Edit and + Entry share one row');
 assert.doesNotMatch(view,/data-campaign="session-delete"/,'Delete only while editing');assert.doesNotMatch(view,/creator-journal-head/,'no second + Entry in the journal');
 await d.click('session-open','s');
 assert.match(render(),/data-campaign="session-delete"/);
 d.window.MediaLibrary={pickFile:async()=>({type:'image/png'})};
 let html=render();
 assert.match(html,/data-campaign="image-library" data-id="session"[^>]*>Add image</,'pictures come from the library');assert.doesNotMatch(html,/type="file"/,'no file chooser');
 d.click('image-library','session');await new Promise(r=>setTimeout(r));
 assert.match(render(),/campaign-image"><img src="data:image\/png/);
 assert.equal(d.data.get('campaigns/c/sessions/s').images,undefined,'pictures wait for Save, like a plot');
 await d.click('session-save');
 assert.equal(JSON.stringify(d.data.get('campaigns/c/sessions/s').images),JSON.stringify([picture]));
 await d.click('session-open','s');await d.click('image-remove','session:0');await d.click('session-save');
 assert.equal(JSON.stringify(d.data.get('campaigns/c/sessions/s').images),'[]');
 render();d.click('section','plots');await d.click('plot-new');
 d.click('image-library','plot');await new Promise(r=>setTimeout(r));
 assert.match(render(),/data-campaign="image-remove" data-id="plot:0"/);
});

test('read marks: "!" on unread entries, tabs and cards; opening the entry marks it read; everyone sees who read',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/members/gm',{displayName:'Game Master'});d.data.set('campaigns/c/members/alice',{displayName:'Alice'});
 d.data.set('campaigns/c/sessions/s',{title:'Session one',text:'Hi',createdAt:'2026-11-01',updatedAt:'2026-11-01T10:00:00Z'});
 d.store.uid='alice';
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 assert.match(d.window.CampaignUI.render('campaigns'),/campaign-unread/);
 render();await d.click('section','sessions');
 let html=render();
 assert.match(html,/Session one<\/span>(<small[^>]*>[^<]*<\/small>)?<span class="campaign-unread"/);assert.doesNotMatch(html,/mark-read/,'no Mark read button');
 await d.click('entry-open','sessions:s');render();
 assert.equal(d.data.get('campaigns/c/reads/alice').marks['sessions:s'],'2026-11-01T10:00:00Z');
 html=render();
 assert.doesNotMatch(html,/campaign-unread/);assert.match(html,/aria-label="Read by Alice"/);
 // A new note on the session makes it unread; while it is open, the next render reads it.
 d.data.set('campaigns/c/notes/n',{creatorUid:'gm',targetKind:'sessions',targetId:'s',text:'More',createdAt:'2026-11-02',updatedAt:'2026-11-02T10:00:00Z'});
 assert.doesNotMatch(render(),/campaign-unread/);assert.equal(d.data.get('campaigns/c/reads/alice').marks['sessions:s'],'2026-11-02T10:00:00Z');
});

// A fake map 640×400 and pointer events for dragging tokens.
function dragOnMap(d,sessionId){
 const nothing={add(){},remove(){},toggle(){}};
 const map={dataset:{timelineMap:sessionId},clientWidth:640,getBoundingClientRect:()=>({left:0,top:0,width:640,height:400}),classList:nothing,querySelector:()=>null,insertAdjacentHTML(){}};
 d.doc.querySelector=selector=>selector==='[data-timeline-map]'?map:null;
 d.doc.createElement=()=>({className:'',innerHTML:'',style:{},classList:nothing,remove(){}});d.doc.body={append(){}};
 const L=d.documentListeners;
 return (source,from,to)=>{L.pointerdown({button:0,clientX:from[0],clientY:from[1],target:{closest:()=>source}});L.pointermove({clientX:to[0],clientY:to[1]});L.pointerup({});};
}
const trayToken=key=>({dataset:{trayToken:key},className:`map-tray-token map-tray-${key.split(':')[0]}`,querySelector:()=>null,classList:{add(){},remove(){}}});
const mapToken=id=>({dataset:{pinId:id},className:'timeline-pin timeline-pin-npcs',querySelector:()=>null,classList:{add(){},remove(){}}});
test('map: a player\'s private journal entries (P1…) go on the map for that player and the GM only',async()=>{
 const sheet={journal:[{id:'x',title:'Secret plan',text:'Hidden',public:false,createdAt:'2026-11-01'},{id:'y',title:'Open',text:'Shared',public:true,createdAt:'2026-11-02'}]};
 const setup=uid=>{const d=campaignCards();d.store.uid=uid;
  d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});d.data.set('campaigns/c/pcs/bob',{ownerUid:'bob',characterId:'bob-pc'});
  d.data.set('campaigns/c/timeline/t',{kind:'pcs',targetId:'bob',noteId:'journal:x',x:20,y:20,creatorUid:'bob',createdAt:'now',updatedAt:'now'});
  d.window.CharacterBuilder.read=id=>id==='bob-pc'&&uid==='bob'?structuredClone(sheet):null;return d;};
 const render=d=>d.window.CampaignUI.render('campaigns/c');
 // The GM reads the full sheet.
 const gm=setup('gm');render(gm);await new Promise(r=>setTimeout(r));
 const full=gm.watches.find(w=>w.pcId==='bob'&&w.full);assert.ok(full,'the GM watches every PC\'s full sheet');
 full.receive({sheetJson:JSON.stringify(sheet),revision:'r1'},{ownerUid:'bob',characterId:'bob-pc'});
 let html=render(gm);
 assert.match(html,/data-tray-token="pcs:bob:journal:x"[^>]*>P1</,'the GM sees P1 in the tray');
 assert.match(html,/timeline-pin-private[^]*Secret plan/,'and its pin on the map');
 // The player reads their own sheet.
 const bob=setup('bob');html=render(bob);
 assert.match(html,/map-tray-private[^>]*data-tray-token="pcs:bob:journal:x"[^>]*>P1</);assert.match(html,/Secret plan/);
 // Another player sees neither the entry nor its pin.
 const alice=setup('alice');html=render(alice);
 assert.doesNotMatch(html,/Secret plan|journal:x|>P1</);
 assert.ok(!alice.watches.some(w=>w.full),'players never watch a full sheet');
});

test('map: notes are numbered oldest first; characters and their note numbers drag onto the map, snap to a hex, and leave it when dragged off',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 let html=render();
 assert.match(html,/timeline-map/);
 assert.match(html,/<h2 class="visually-hidden">Timeline<\/h2>/,'the map row has no visible title');
 d.data.set('campaigns/c/sessions/s1',{title:'First session',text:'',createdAt:'2026-11-01'});
 d.data.set('campaigns/c/sessions/s2',{title:'Second session',text:'',createdAt:'2026-11-08'});
 d.data.set('campaigns/c/npcs/n',{name:'Court messenger',notes:''});
 d.data.set('campaigns/c/npcs/k',{name:'Shiro Kitsuki',role:'O Castelo da Pergunta',notes:''});
 const note=(id,kind,target,title,at)=>d.data.set(`campaigns/c/notes/${id}`,{creatorUid:'gm',public:true,targetKind:kind,targetId:target,title,text:`${title} text`,createdAt:at,updatedAt:at,revision:'r'});
 note('a','sessions','s1','We arrive','2026-11-01');note('b','npcs','n','Carries a letter','2026-11-02');note('c','npcs','k','The gate is shut','2026-11-03');note('d','npcs','n','Flees north','2026-11-04');
 html=render();
 assert.ok(html.indexOf('Second session')<html.indexOf('First session'),'sessions newest first on the map head');
 assert.match(html,/map-head[^]*data-campaign="npc-new"[^]*data-campaign="pc-picker"/,'+ NPC and + PC sit on the map');
 assert.doesNotMatch(html,/timeline-session|timeline-list/,'no session picker for pins');
 assert.match(html,/data-tray-token="npcs:n"[^]*?data-tray-token="npcs:n:b"[^>]*>2<[^]*?data-tray-token="npcs:n:d"[^>]*>4</,'each character is followed by its note numbers');
 assert.match(html,/aria-label="Places"[^]*data-tray-token="npcs:k:c"[^>]*>3</);
 await d.click('entry-open','npcs:n');
 assert.match(render(),/creator-journal-number" title="Note number">#2<\/span>[^]*Carries a letter/,'the numbers show in the journals too');
 await d.click('entry-close','npcs:n');
 const drag=dragOnMap(d,'');
 drag(trayToken('npcs:n:d'),[10,500],[100,100]);
 const [key]=[...d.data.keys()].filter(k=>k.startsWith('campaigns/c/timeline/'));
 const pin=d.data.get(key);
 assert.equal(`${pin.kind}:${pin.targetId}:${pin.noteId} ${pin.creatorUid} ${'sessionId' in pin}`,'npcs:n:d gm false');
 assert.equal(pin.x,14.9,'snapped to the hex centre, not the pointer');assert.ok(Math.abs(pin.y-26.25)<0.1);
 html=render();
 assert.match(html,/class="timeline-pin timeline-pin-npcs timeline-pin-note timeline-pin-movable" data-pin-id="[^"]+" style="left:14.9%;[^]*data-campaign="note-popup" data-id="npcs:n:d"[^]*timeline-pin-number">4</);
 assert.match(html,/map-tray-placed" data-tray-token="npcs:n:d"/,'marked as on the map in the tray');
 drag(trayToken('npcs:n'),[10,500],[300,200]);
 assert.equal([...d.data.keys()].filter(k=>k.startsWith('campaigns/c/timeline/')).length,2,'the character itself is a separate token');
 drag(trayToken('npcs:n:d'),[10,500],[400,300]);
 assert.equal([...d.data.keys()].filter(k=>k.startsWith('campaigns/c/timeline/')).length,2,'dragging the note again moves its pin');
 assert.ok(d.data.get(key).x>50);
 await d.click('note-popup','npcs:n:d');
 assert.match(render(),/role="dialog"[^]*#4<\/span> Flees north[^]*Flees north text[^]*data-campaign="entry-open" data-id="npcs:n"/,'a numbered pin opens its note');
 assert.match(render(),/data-campaign="pin-remove" data-id="[^"]+"/,'the popup offers Remove pin');
 await d.click('note-popup-close');
 await d.click('entry-open','npcs:n');
 html=render();
 assert.match(html,/creator-journal-number" title="Note number">#4<\/span>(?:(?!<\/header>)[^])*data-campaign="pin-remove" data-id="[^"]+"[^>]*>Remove from map</,'the pinned note has Remove from map in the NPC panel');
 assert.match(html,/campaign-actions[^]*data-campaign="pin-remove"[^>]*>Remove from map</,'and the NPC token too');
 await d.click('entry-close','npcs:n');
 await d.click('note-popup','npcs:n:d');
 await d.click('note-popup-close');
 // Hiding the tray reaches pins under it; a drop over the tray takes the pin off the map.
 await d.click('tray-toggle');
 assert.match(render(),/map-tray map-tray-hidden[^]*data-campaign="tray-toggle"[^>]*>PCs &amp; NPCs</);assert.doesNotMatch(render(),/data-tray-token/);
 await d.click('tray-toggle');
 const pinsBefore=[...d.data.keys()].filter(k=>k.startsWith('campaigns/c/timeline/')).length;
 const query=d.doc.querySelector;d.doc.querySelector=selector=>selector==='.map-tray'?{getBoundingClientRect:()=>({left:0,top:0,right:200,bottom:300})}:query(selector);
 drag(trayToken('npcs:k:c'),[10,500],[100,100]);
 assert.equal([...d.data.keys()].filter(k=>k.startsWith('campaigns/c/timeline/')).length,pinsBefore,'nothing is dropped under the tray');
 d.doc.querySelector=query;
 drag(mapToken(key.split('/').pop()),[400,300],[700,500]);
 assert.equal(d.data.has(key),false,'off the map, it is removed');
});
test('map: players place tokens too; they move only their own, the GM moves any',()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/npcs/n',{name:'Mario',notes:''});
 d.data.set('campaigns/c/timeline/mine',{kind:'npcs',targetId:'n',x:10,y:10,createdAt:'1',updatedAt:'1',creatorUid:'alice'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 const drag=dragOnMap(d,'s');
 d.store.uid='bob';assert.doesNotMatch(render(),/timeline-pin-movable/);
 drag(mapToken('mine'),[64,40],[700,500]);
 assert.ok(d.data.has('campaigns/c/timeline/mine'),'not someone else\'s');
 d.store.uid='alice';assert.match(render(),/timeline-pin-movable" data-pin-id="mine"/);
 drag(mapToken('mine'),[64,40],[300,300]);
 assert.ok(d.data.get('campaigns/c/timeline/mine').x>40);assert.equal(d.data.get('campaigns/c/timeline/mine').creatorUid,'alice');
 d.store.uid='gm';render();drag(mapToken('mine'),[300,300],[-5,10]);
 assert.equal(d.data.has('campaigns/c/timeline/mine'),false,'the GM removes any');
});
test('one campaign view: a row per kind, the add button as the first tile, no visible titles, no selector',()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 const html=d.window.CampaignUI.render('campaigns/c');
 assert.doesNotMatch(html,/campaign-segments|data-campaign="section"/);
 const rows=[...html.matchAll(/data-campaign-row="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(rows.join(),'sessions,plots,npcs,pcs,timeline','rows first, the map last');
 for(const [title,action] of [['Sessions','session-new'],['Plots','plot-new'],['NPCs','npc-new'],['PCs','pc-picker']])assert.match(html,new RegExp(`<h2 class="visually-hidden">${title}</h2><div class="campaign-entries"><div class="campaign-add-tile"><button[^>]*data-campaign="${action}"`),title);
 assert.doesNotMatch(html,/home-row-head|invite-settings/);
 assert.doesNotMatch(html,/entry-help|Add clues and plans/);
});
test('journals: anyone adds to sessions, the GM to NPCs, the GM or creator to plots, nobody to PCs from the campaign',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/sessions/s',{title:'Session',text:'',createdAt:'2026-11-01'});
 d.data.set('campaigns/c/npcs/n',{name:'Court messenger',notes:''});
 d.data.set('campaigns/c/plots/p',{title:'Seal',text:'',creatorUid:'alice',createdAt:'2026-11-01'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 const canAdd=(kind,id)=>new RegExp(`data-campaign="note-new" data-id="${kind}:${id}"`).test(render());
 for(const [uid,expected] of [['gm',{sessions:true,npcs:true,plots:true}],['alice',{sessions:true,npcs:false,plots:true}],['bob',{sessions:true,npcs:false,plots:false}]]) {
  d.store.uid=uid;
  for(const [section,kind,id] of [['sessions','sessions','s'],['npcs','npcs','n'],['plots','plots','p']]) {
   render();await d.click('section',section);
   assert.equal(canAdd(kind,id),expected[kind],`${uid} ${kind}`);
  }
 }
});
test('old campaign notes about a PC move into its journal, then the note is removed',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/members/gm',{displayName:'Game Master'});
 d.data.set('campaigns/c/pcs/p',{ownerUid:'alice',characterId:'a-pc'});
 d.data.set('campaigns/c/notes/own',{creatorUid:'alice',targetKind:'pcs',targetId:'p',text:'My own note',createdAt:'2026-11-01',updatedAt:'2026-11-01'});
 d.data.set('campaigns/c/notes/gmnote',{creatorUid:'gm',targetKind:'pcs',targetId:'p',text:'GM note',createdAt:'2026-11-02',updatedAt:'2026-11-02'});
 let added=[],written=[];
 d.window.CharacterBuilder.addJournalEntries=(id,entries)=>{added.push([id,entries]);return true;};
 d.window.SheetJournal={write:async(owner,id,entryId,data)=>{written.push([owner,id,entryId,data]);}};
 d.store.uid='alice';d.window.CampaignUI.render('campaigns/c');
 await new Promise(r=>setImmediate(r));
 assert.equal(added.length,1);assert.equal(added[0][0],'a-pc');assert.equal(added[0][1][0].text,'My own note');assert.equal(added[0][1][0].public,true);
 assert.equal(d.data.has('campaigns/c/notes/own'),false);assert.equal(d.data.has('campaigns/c/notes/gmnote'),true,'not moved by another member');
 d.store.uid='gm';d.window.CampaignUI.render('campaigns/c');
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 assert.equal(written.length,1);assert.deepEqual([written[0][0],written[0][1],written[0][2]],['alice','a-pc','gmnote']);
 assert.equal(written[0][3].authorUid,'gm');assert.equal(written[0][3].text,'GM note');
 assert.ok(d.watches.some(w=>w.pcId==='p'&&w.full),'the GM requested a full grant first');
 assert.equal(d.data.has('campaigns/c/notes/gmnote'),false);
});

test('the map comes first by default',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/sessions/s',{title:'New session 1',text:'',createdAt:'2026-10-08'});
 d.data.set('campaigns/c/npcs/n',{name:'Old rival',notes:''});
 d.data.set('campaigns/c/pcs/p',{ownerUid:'alice',characterId:'a-pc'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 let html=render();
 assert.ok(html.indexOf('>Sessions</h2>')<html.indexOf('>Timeline</h2>'),'the map comes after the rows');
 assert.match(html,/data-timeline-map>/,'the map is open by default');
 assert.doesNotMatch(html.slice(html.indexOf('timeline-detail')),/<h3>New session 1<\/h3>/,'no session heading above the map');
 assert.match(html,/data-id="npcs:n"/);
});
test('campaign links open a section and item by name + short ID, and clicks move the address',async()=>{
 const d=campaignCards();
 const routes={window:{}};vm.runInNewContext(fs.readFileSync('routes.js','utf8'),routes);d.window.Routes=routes.window.Routes;
 d.data.set('campaigns/camp1234',{title:'Emerald Dawn',gmUid:'gm'});
 d.data.set('campaigns/camp1234/sessions/ses45678',{title:'Session 1',text:'',createdAt:'2026-11-01'});
 d.data.set('campaigns/camp1234/sessions/ses00000',{title:'Session 2',text:'',createdAt:'2026-11-02'});
 d.data.set('campaigns/camp1234/npcs/npc98765',{name:'Mario',notes:''});
 // Cards link to the readable address.
 assert.match(d.render(),/href="#\/campaigns\/emerald-dawn-camp1234"/);
 // The name part is decoration: an old name still opens the NPC.
 let html=d.window.CampaignUI.render('campaigns/emerald-dawn-camp1234/npcs/old-name-npc9');
 assert.match(html,/data-entry="npcs:npc98765" open/,'the NPC opens as a panel');
 assert.match(html,/data-entry="npcs:npc98765" open[^>]*><summary>[^]*?<div class="campaign-entry-body" role="dialog" aria-modal="true"><div class="campaign-entry-panel-head">[^]*?data-campaign="entry-close" data-id="npcs:npc98765"/);
 // Closing the panel returns the address to the campaign.
 d.location.hash='#/campaigns/emerald-dawn-camp1234/npcs/mario-npc9';
 await d.click('entry-close','npcs:npc98765');
 d.location.hash='#/campaigns/emerald-dawn-camp1234'; // what history.replaceState does in a browser
 assert.doesNotMatch(d.window.CampaignUI.render('campaigns/emerald-dawn-camp1234'),/data-entry="npcs:npc98765" open/);
 html=d.window.CampaignUI.render('campaigns/camp1234/timeline/session-1-ses4');
 assert.match(html,/data-entry="sessions:ses45678" open/,'a session link opens that session');
 assert.match(html,/class="[^"]*map-head-session"[^>]*data-campaign="entry-open" data-id="sessions:ses00000"/,'every session is on the map head');
 await d.click('entry-close','sessions:ses45678');
 // An unknown item opens nothing and does not fail.
 html=d.window.CampaignUI.render('campaigns/emerald-dawn-camp1234/plots/nobody-zzzz');
 assert.doesNotMatch(html,/class="campaign-entry" data-entry="[^"]+" open/);
});
test('session, plot and NPC descriptions become their first journal entry; entries carry titles',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/sessions/s',{title:'Session one',text:'We met at the inn.',createdAt:'2026-11-01'});
 d.data.set('campaigns/c/plots/p',{title:'Seal',text:'Someone stole the seal.',creatorUid:'gm',createdAt:'2026-11-02'});
 d.data.set('campaigns/c/plots/q',{title:'Other',text:'Not mine.',creatorUid:'alice',createdAt:'2026-11-02'});
 d.data.set('campaigns/c/npcs/n',{name:'Shrine keeper',notes:'Keeps the old shrine.',portrait:'x',updatedAt:'2026-11-03'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 render();
 assert.equal(d.data.get('campaigns/c/notes/desc_sessions_s').text,'We met at the inn.');
 assert.equal(d.data.get('campaigns/c/sessions/s').text,'');
 assert.equal(d.data.get('campaigns/c/notes/desc_plots_p').targetCreatorUid,'gm');
 assert.equal(d.data.get('campaigns/c/plots/p').text,'');
 assert.equal(d.data.has('campaigns/c/notes/desc_plots_q'),false,'only the creator moves a plot description');
 const npcNote=d.data.get('campaigns/c/notes/desc_npcs_n');
 assert.equal(npcNote.text,'Keeps the old shrine.');assert.equal(npcNote.targetKind,'npcs');assert.equal('targetCreatorUid' in npcNote,false);
 const npc=d.data.get('campaigns/c/npcs/n');assert.equal(npc.notes,'');assert.equal(npc.name,'Shrine keeper');assert.equal(npc.portrait,'x');
 await d.click('section','sessions');await d.click('note-new','sessions:s');
 let html=render();
 assert.match(html,/data-entry-field="title"/);
 for(const [entryField,value] of [['title','Arrival'],['text','The rain had stopped.']])d.documentListeners.input({target:{dataset:{entryField,entryKind:'note'},value}});
 await d.click('note-save','');
 const saved=[...d.data].find(([k,v])=>k.startsWith('campaigns/c/notes/')&&v.title==='Arrival');
 assert.ok(saved,'title saved');
 html=render();
 assert.match(html,/<h4 class="creator-journal-title">Arrival<\/h4>/);
 assert.match(html,/<h4 class="creator-journal-title">We met at the inn.<\/h4>/,'untitled entries use their first line');
});
test('start page row: campaign cards, + Campaign, or Sign in',()=>{
 const d=campaignCards();
 const routes={window:{}};vm.runInNewContext(fs.readFileSync('routes.js','utf8'),routes);d.window.Routes=routes.window.Routes;
 d.data.set('campaigns/camp1234',{title:'Emerald Dawn',gmUid:'gm'});
 const home=d.window.CampaignUI.homeCampaigns();
 assert.equal(home.signedIn,true);assert.match(home.html,/href="#\/campaigns\/emerald-dawn-camp1234"/);assert.match(home.create,/data-campaign="create"/);
 d.store.uid='';
 assert.match(d.window.CampaignUI.homeCampaigns().html,/data-campaign="sign-in"/);
});
test('the + PC popup holds the invite link (GM): Copy link, Replace link, Revoke; no separate Invite button',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 Object.assign(d.store.backend,{get:async()=>null,invitation:async()=>({}),invite:async()=>'tok123',revoke:async()=>{}});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
 assert.doesNotMatch(render(),/data-campaign="share-invite"/);
 await d.click('pc-picker');await settle();
 let html=render();
 const popup=html.split('<div class="timeline-popup campaign-popup"')[1] || '';
 assert.match(popup,/<h3 id="new-popup-title">Add a PC<\/h3>[^]*data-campaign="pc-create"[^]*<h4>Invite players<\/h4>/);
 assert.match(popup,/value="http:\/\/localhost\/#\/invite\/tok123"/);
 assert.match(popup,/data-campaign="invite-copy"[^>]*>Copy link</);
 assert.match(popup,/data-campaign="invite"[^>]*>Replace link</);assert.match(popup,/data-campaign="revoke"[^>]*>Revoke</);
 await d.click('revoke');await settle();
 assert.match(render(),/No active invite link\.[^]*data-campaign="invite"[^>]*>New link</);
 await d.click('new-close');
 assert.doesNotMatch(render(),/campaign-popup/);
 // A player's + PC popup has no invite section.
 d.store.uid='alice';render();await d.click('pc-picker');await settle();
 assert.doesNotMatch(render(),/Invite players/);
});
test('+ Plot, + NPC and + PC open their form in a popup, not inline; the close button discards the draft',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 const popupOf=html=>html.match(/<div class="timeline-popup campaign-popup"[^]*$/)?.[0] || '';
 for(const [action,title,field] of [['plot-new','New plot','data-entry-field="title"'],['npc-new','New NPC','data-campaign-field="npc-name"'],['pc-picker','Add a PC','data-campaign="pc-create"']]){
  render();await d.click(action);
  const html=render();
  assert.match(popupOf(html),new RegExp(`<h3 id="new-popup-title">${title}</h3>[^]*${field}`),title);
  assert.doesNotMatch(html.split('<div class="timeline-popup campaign-popup"')[0],new RegExp(field),`${title}: nothing inline`);
  await d.click('new-close');
  assert.doesNotMatch(render(),/campaign-popup/,`${title} closes`);
 }
});
test('+ Plot and + Session share one form: a title and a first entry; saving makes the item, then that entry as its first note',async()=>{
 for(const [kind,single,uid] of [['plots','plot','alice'],['sessions','session','gm']]){
  const d=campaignCards();
  d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});d.store.uid=uid;
  const render=()=>d.window.CampaignUI.render('campaigns/c');
  render();await d.click(`${single}-new`);
  let html=render();
  assert.match(html,new RegExp(`<h3 id="new-popup-title">New ${single}</h3>[^]*data-entry-field="title"[^]*data-entry-field="firstEntry"[^]*data-campaign="image-library"`),`${single}: one form`);
  assert.match(html,new RegExp(`data-campaign="${single}-save"[^>]*disabled`),'Save waits for a title');
  const input=(name,value)=>d.documentListeners.input({target:{dataset:{entryField:name,entryKind:single},value}});
  input('title',`The ${single}`);input('firstEntry','  It begins at dawn.  ');
  await d.click(`${single}-save`);
  const items=[...d.data].filter(([k])=>k.startsWith(`campaigns/c/${kind}/`)),notes=[...d.data].filter(([k])=>k.startsWith('campaigns/c/notes/'));
  assert.equal(items.length,1);assert.equal(items[0][1].title,`The ${single}`);assert.ok(!('firstEntry' in items[0][1]),'the item does not keep the draft field');
  if(kind==='sessions')assert.deepEqual(Object.keys(items[0][1]).sort(),['createdAt','images','text','title','updatedAt'],'a session keeps only the fields its rules allow');
  const id=items[0][0].split('/').pop();
  assert.equal(notes.length,1);assert.deepEqual([notes[0][1].text,notes[0][1].targetKind,notes[0][1].targetId],['It begins at dawn.',kind,id]);
  assert.equal(notes[0][1].targetCreatorUid,kind==='plots'?uid:undefined);
  await d.click(kind==='plots'?'plot-edit':'session-open',id);
  html=render();
  assert.doesNotMatch(html,/data-entry-field="firstEntry"/,'editing keeps the journal for entries');
  assert.match(html,new RegExp(`data-campaign="${single}-delete" data-id="${id}"`),'Delete while editing');
 }
});
test('PC and NPC panels have no Remove; the + PC and + NPC popups edit the list instead',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/members/alice',{displayName:'Alice'});
 d.data.set('campaigns/c/pcs/alice',{ownerUid:'alice',characterId:'alice-pc'});d.data.set('campaigns/c/pcs/bob',{ownerUid:'bob',characterId:'bob-pc'});
 d.data.set('campaigns/c/npcs/n',{name:'Shrine keeper',role:'Priest',notes:''});
 d.window.confirm=()=>true;
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 const popupOf=html=>html.match(/<div class="timeline-popup campaign-popup"[^]*$/)?.[0] || '';
 let html=render();
 assert.doesNotMatch(html,/data-campaign="pc-remove"|data-campaign="npc-delete"/,'no Remove on the panels');
 await d.click('npc-open','n');assert.doesNotMatch(render(),/data-campaign="npc-delete"/,'nor in the NPC editor');
 // The GM: every NPC and PC is listed with Remove.
 render();await d.click('npc-new');html=popupOf(render());
 assert.match(html,/campaign-list-editor"><summary>Edit list \(1\)<\/summary>[^]*Shrine keeper[^]*data-campaign="npc-delete" data-id="n"/);
 await d.click('npc-delete','n');assert.equal(d.data.get('campaigns/c/npcs/n'),undefined,'Remove deletes the NPC');
 await d.click('new-close');render();await d.click('pc-picker');html=popupOf(render());
 assert.match(html,/Edit list \(2\)[^]*data-campaign="pc-remove" data-id="alice"[^]*data-campaign="pc-remove" data-id="bob"|Edit list \(2\)[^]*data-campaign="pc-remove" data-id="bob"[^]*data-campaign="pc-remove" data-id="alice"/);
 await d.click('new-close');
 // A player removes only their own PC.
 d.store.uid='alice';render();await d.click('pc-picker');html=popupOf(render());
 assert.match(html,/data-campaign="pc-remove" data-id="alice"/);assert.doesNotMatch(html,/data-campaign="pc-remove" data-id="bob"/);
 await d.click('pc-remove','bob');assert.ok(d.data.get('campaigns/c/pcs/bob'),'not another player\'s PC');
 await d.click('pc-remove','alice');assert.equal(d.data.get('campaigns/c/pcs/alice'),undefined);
});
test('NPCs have a name, role, description and a notes list (journal entries)',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 render();await d.click('npc-new');
 let html=render();
 for(const field of ['npc-name','npc-role','npc-description'])assert.match(html,new RegExp(`data-campaign-field="${field}"`),field);
 for(const [campaignField,value] of [['npc-name','Doji Hayaku'],['npc-role','Magistrate'],['npc-description','Keeps the old shrine.']])d.documentListeners.input({target:{dataset:{campaignField},value}});
 await d.click('npc-save');
 const [id]=[...d.data.keys()].filter(path=>path.startsWith('campaigns/c/npcs/'));
 const npc=d.data.get(id);
 assert.equal(npc.name,'Doji Hayaku');assert.equal(npc.role,'Magistrate');assert.equal(npc.description,'Keeps the old shrine.');
 html=render();
 assert.match(html,/<strong>Doji Hayaku<\/strong><small>Magistrate<\/small>/,'the tile shows the role under the name');
 assert.match(html,/class="campaign-npc-role">Magistrate<[^]*class="campaign-npc-description entry-text">Keeps the old shrine\.</);
 assert.match(html,new RegExp(`data-campaign="note-new" data-id="npcs:${id.split('/').pop()}"`),'notes are its journal entries');
 // Editing an existing NPC updates the role live.
 await d.click('npc-open',id.split('/').pop());
 d.documentListeners.input({target:{dataset:{campaignField:'npc-role'},value:'Former magistrate'}});
 await d.click('npc-save');
 assert.equal(d.data.get(id).role,'Former magistrate');
});
test('GM handover: the GM picks a member, confirms, and the service makes them GM',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/members/gm',{displayName:'Tharak'});d.data.set('campaigns/c/members/alice',{displayName:'Alice'});
 const calls=[];Object.assign(d.store.backend,{handOver:async(c,to)=>calls.push([c,to]),watchTransfers:()=>()=>{}});
 d.window.confirm=()=>true;
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 assert.match(render(),/data-campaign="handover"[^>]*>Hand over</);
 await d.click('handover');
 const html=render();
 assert.match(html,/Hand over the campaign[^]*data-campaign="handover-to" data-id="alice"[^>]*>Alice</);
 assert.doesNotMatch(html,/data-campaign="handover-to" data-id="gm"/,'not to yourself');
 await d.click('handover-to','alice');
 assert.deepEqual(calls,[['c','alice']]);
 d.store.uid='alice';assert.doesNotMatch(render(),/data-campaign="handover"/,'players have no Hand over');
});
test('PC handover: the owner offers to a member; the member accepts into their account; the owner\'s copy is then removed',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/members/gm',{displayName:'Tharak'});d.data.set('campaigns/c/members/alice',{displayName:'Alice'});
 d.data.set('campaigns/c/pcs/p1',{ownerUid:'gm',characterId:'isamu',membershipId:'m'});
 d.setCharacters([{id:'isamu',name:'Hoshi Isamu'}]);
 let push=null;const calls=[];
 Object.assign(d.store.backend,{
  watchTransfers:receive=>{push=receive;return()=>{};},
  offerPC:async(...args)=>calls.push(['offer',...args.slice(0,3)]),
  dropTransfer:async id=>calls.push(['drop',id]),
  link:async(c,id)=>{calls.push(['link',c,id]);return 'newpc';},
  acceptPC:async(id,pcId)=>calls.push(['accept',id,pcId]),
  write:async(p,v)=>calls.push(['write',p,v]),
 });
 Object.assign(d.window.CharacterBuilder,{adopt:sheet=>{calls.push(['adopt',sheet.name]);return 'copy';},remove:id=>calls.push(['remove',id])});
 d.window.CharacterStorage={records:()=>[{id:'isamu',sheet:{name:'Hoshi Isamu'}}]};
 const render=()=>d.window.CampaignUI.render('campaigns/c');
 assert.match(render(),/data-campaign="pc-transfer" data-id="p1"[^>]*>Transfer</);
 await d.click('pc-transfer','p1');
 assert.match(render(),/Transfer Hoshi Isamu[^]*data-campaign="pc-transfer-to" data-id="alice"/);
 await d.click('pc-transfer-to','alice');for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls[0],['offer','c','p1','alice']);
 // While offered, the owner sees it pending with Cancel.
 push([{id:'t1',fromUid:'gm',toUid:'alice',campaignId:'c',pcId:'p1',characterId:'isamu',name:'Hoshi Isamu',sheetJson:JSON.stringify({name:'Hoshi Isamu'}),status:'offered'}]);
 assert.match(render(),/Offered to Alice[^]*data-campaign="transfer-cancel" data-id="t1"/);
 // The recipient sees the offer and accepts it.
 d.store.uid='alice';
 assert.match(render(),/<strong>Tharak<\/strong> offers you <strong>Hoshi Isamu<\/strong>[^]*data-campaign="transfer-accept" data-id="t1"/);
 await d.click('transfer-accept','t1');for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls.slice(1),[['adopt','Hoshi Isamu'],['link','c','copy'],['accept','t1','newpc']]);
 // Back on the owner's side, an accepted offer removes the original link and character.
 d.store.uid='gm';calls.length=0;
 push([{id:'t1',fromUid:'gm',toUid:'alice',campaignId:'c',pcId:'p1',characterId:'isamu',name:'Hoshi Isamu',status:'accepted',newPcId:'newpc'}]);
 for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,[['write','campaigns/c/pcs/p1',null],['remove','isamu'],['drop','t1']]);
});
test('a link to a campaign you are not in: "You were not invited to the campaign X", ask to be invited, then join once approved',async()=>{
 const d=campaignCards();
 let watchCb=null;const calls=[];
 Object.assign(d.store,{ready:true});
 Object.assign(d.store.backend,{
  lookupCampaign:async seg=>seg.endsWith('-b8cd98e4')?{campaignId:'b8cd98e4-5ba6',title:'O Silêncio do Crisântemo'}:null,
  watchRequest:(c,cb)=>{watchCb=cb;return()=>{};},
  requestInvite:async c=>calls.push(['request',c]),
  watchTransfers:()=>()=>{},
 });
 const render=slug=>d.window.CampaignUI.render(slug);
 render('campaigns/o-silencio-do-crisantemo-b8cd98e4');
 for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
 let html=render('campaigns/o-silencio-do-crisantemo-b8cd98e4');
 assert.match(html,/You were not invited to the campaign <em>O Silêncio do Crisântemo<\/em>/);
 assert.match(html,/data-campaign="request-invite" data-id="b8cd98e4-5ba6"[^>]*>Ask to be invited</);
 await d.click('request-invite','b8cd98e4-5ba6');assert.deepEqual(calls,[['request','b8cd98e4-5ba6']]);
 watchCb({displayName:'Alice',createdAt:'now'});
 assert.match(render('campaigns/o-silencio-do-crisantemo-b8cd98e4'),/Request sent · waiting for the GM/);
 watchCb({displayName:'Alice',createdAt:'now',inviteToken:'tok9'});
 assert.match(render('campaigns/o-silencio-do-crisantemo-b8cd98e4'),/Your request was approved[^]*data-campaign="join" data-id="tok9"/);
 // An unknown link still says so, without a request button.
 render('campaigns/unknown-zzzzzzzz');for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
 html=render('campaigns/unknown-zzzzzzzz');
 assert.match(html,/You were not invited to this campaign/);assert.doesNotMatch(html,/request-invite/);
});
test('the GM sees join requests and approves or declines them',async()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/requests/alice',{displayName:'Alice',createdAt:'now'});
 const calls=[];Object.assign(d.store.backend,{answerRequest:async(c,who,ok)=>calls.push([c,who,ok]),publishDirectory:async(c,t)=>calls.push(['publish',c,t]),watchTransfers:()=>()=>{}});
 const html=d.window.CampaignUI.render('campaigns/c');
 assert.match(html,/<strong>Alice<\/strong> asks to join[^]*data-campaign="request-approve" data-id="alice"[^]*data-campaign="request-decline" data-id="alice"/);
 await d.click('request-approve','alice');for(let i=0;i<3;i++)await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,[['publish','c','Campaign'],['c','alice',true]]);
});
test('older session pins all show on the map; repeats of one character collapse into the latest',()=>{
 const d=campaignCards();
 d.data.set('campaigns/c',{title:'Campaign',gmUid:'gm'});
 d.data.set('campaigns/c/npcs/n',{name:'Mario',notes:''});
 d.data.set('campaigns/c/timeline/p1',{sessionId:'s1',kind:'npcs',targetId:'n',x:10,y:10,createdAt:'1',updatedAt:'1'});
 d.data.set('campaigns/c/timeline/p2',{sessionId:'s2',kind:'npcs',targetId:'n',x:20,y:20,createdAt:'2',updatedAt:'2'});
 const html=d.window.CampaignUI.render('campaigns/c');
 assert.match(html,/data-pin-id="p2"/);assert.doesNotMatch(html,/data-pin-id="p1"/);assert.doesNotMatch(html,/timeline-pin-other/);
});
