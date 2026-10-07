const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const sdk=require('firebase/firestore');
test('campaign service CRUD, invitation replacement, linking, editing, leaving and deletion',{timeout:20000},async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-l5r-rules-service-tests',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')}});
 const gmDB=env.authenticatedContext('gm').firestore(),aliceDB=env.authenticatedContext('alice').firestore(),bobDB=env.authenticatedContext('bob').firestore();
 const sheet={name:'Alice PC',notes:'PRIVATE',visibility:{identity:true,traits:false,skills:false,options:false,story:false,summary:false}};
 const sections=s=>({identity:{name:s.name},traits:{},skills:{},options:{},story:{notes:s.notes},summary:{}});
 global.window={CharacterStorage:{records:()=>[{id:'pc',sheet,updatedAt:'now'}]},SheetSharing:{encode:async(s,updatedAt)=>{
  const full={sheetJson:JSON.stringify(s),updatedAt,revision:randomUUID(),visibility:s.visibility,sections:sections(s)};
  return {full,public:{revision:full.revision,sections:Object.fromEntries(Object.entries(full.sections).filter(([k])=>s.visibility[k]))}};
 }}};
 const {createCampaignBackend}=await import('../campaign-service.js');
 const gm=createCampaignBackend(gmDB,sdk,'gm','Game Master'),alice=createCampaignBackend(aliceDB,sdk,'alice','Alice'),bob=createCampaignBackend(bobDB,sdk,'bob','Bob');
 let stop;
 try {
  await env.clearFirestore();
  let received;const loaded=new Promise(resolve=>received=resolve);
  stop=gm.subscribe({index(){},receive(path,data){if(/^campaigns\/[^/]+$/.test(path)&&data)received(data);},revoked(){},error(e){throw e;}});
  const c=await gm.create('Service campaign');
  assert.equal((await loaded).title,'Service campaign');
  await gm.write(`campaigns/${c}`,{title:'Renamed',gmUid:'gm'});
  const token=await gm.invite(c);await alice.join(token);assert.equal(await alice.join(token),c);
  assert.equal((await gm.get(`campaigns/${c}/members/gm`)).displayName,'Game Master');
  assert.equal((await gm.get(`campaigns/${c}/members/alice`)).displayName,'Alice');
  await sdk.updateDoc(sdk.doc(aliceDB,`campaigns/${c}/members/alice`),{displayName:sdk.deleteField()});
  await alice.syncPlayerName(c);
  assert.equal((await gm.get(`campaigns/${c}/members/alice`)).displayName,'Alice');
  await alice.saveCharacter('alice','pc',sheet,'now');
  const pcId=await alice.link(c,'pc');
  await gm.write(`campaigns/${c}/sessions/s`,{title:'Session',text:'a\n\nb',updatedAt:'now'});
  await gm.write(`campaigns/${c}/npcs/n`,{name:'NPC',notes:'SECRET',updatedAt:'now'});
  assert.equal((await alice.get(`campaigns/${c}/sessions/s`)).text,'a\n\nb');
  await assertFails(alice.get(`campaigns/${c}/npcs/n`));
  const replacement=await gm.invite(c);
  await assertFails(bob.invitation(token));
  await bob.join(replacement);
  const watch=(backend,full,campaign=c,pc=pcId)=>new Promise(async(resolve,reject)=>{let unsubscribe;try{unsubscribe=await backend.watchSheet(campaign,pc,full,data=>{if(data){resolve(data);queueMicrotask(()=>unsubscribe?.());}},reject);}catch(e){reject(e);}});
  const publicDoc=await watch(bob,false);assert.ok(!JSON.stringify(publicDoc).includes('PRIVATE'));
  const secondCampaign=await alice.create('Another campaign');
  await gm.join(await alice.invite(secondCampaign));
  const secondRef=await alice.link(secondCampaign,'pc');
  assert.equal((await gm.get(`campaigns/${secondCampaign}/pcs/${secondRef}`)).characterId,'pc');
  const fullDoc=await watch(gm,true);assert.ok(fullDoc.sheetJson.includes('PRIVATE'));
  await watch(gm,false,secondCampaign,secondRef);
  assert.ok((await gm.get('users/alice/characters/pc')).sheetJson.includes('PRIVATE'));
  await gm.saveCharacter('alice','pc',{...sheet,name:'GM edit'},'later');
  assert.equal(JSON.parse((await alice.get('users/alice/characters/pc')).sheetJson).name,'GM edit');
  assert.equal((await gm.get(`campaigns/${secondCampaign}/pcs/${secondRef}`)).characterId,'pc');
  await alice.deleteCampaign(secondCampaign);
  assert.ok(await alice.get('users/alice/characters/pc'));
  await gm.write(`campaigns/${c}/pcs/${pcId}`,null);
  await assertFails(gm.get('users/alice/characters/pc'));
  const newPCId=await alice.link(c,'pc');assert.notEqual(newPCId,pcId);
  await assertFails(gm.get('users/alice/characters/pc'));
  await gm.removeMember(c,'alice');
  assert.equal(await gm.get(`campaigns/${c}/pcs/${newPCId}`),null);
  assert.ok(await alice.get('users/alice/characters/pc'));
  await bob.removeMember(c,'bob');
  await gm.revoke(c);await assertFails(alice.invitation(replacement));
  await gm.deleteCampaign(c);
  assert.ok(await alice.get('users/alice/characters/pc'));
  assert.equal(await gm.get('users/gm/campaigns/'+c),null);
 } finally {stop?.();await env.cleanup();delete global.window;}
});
test('plot and note subscriptions revoke private content and campaign deletion removes every body',{timeout:20000},async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-l5r-rules-entry-service-tests',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')}});
 const {createCampaignBackend}=await import('../campaign-service.js');
 const backends=Object.fromEntries(['gm','alice','bob'].map(u=>[u,createCampaignBackend(env.authenticatedContext(u).firestore(),sdk,u,u)]));
 const {gm,alice,bob}=backends;
 const caches={gm:new Map(),bob:new Map()},errors=[],stops=[];
 const until=async check=>{for(let i=0;i<150;i++){if(check())return;await new Promise(r=>setTimeout(r,20));}throw Error('Subscription did not reach expected state: '+JSON.stringify({gm:[...caches.gm.keys()],bob:[...caches.bob.keys()],errors:errors.map(e=>e.message)}));};
 const entry=(creatorUid,isPublic,text,extra={})=>({creatorUid,public:isPublic,text,title:'A plot',createdAt:'now',updatedAt:'now',revision:randomUUID(),...extra});
 try {
  await env.clearFirestore();const c=await gm.create('Privacy lifecycle');const token=await gm.invite(c);await alice.join(token);await bob.join(token);
  for(const u of ['gm','bob'])stops.push(backends[u].subscribe({index(){},receive(path,data){data===null?caches[u].delete(path):caches[u].set(path,data);},revoked(){caches[u].clear();},error(e){errors.push(e);}}));
  const p=`campaigns/${c}/plots/p`,n=`campaigns/${c}/notes/n`;
  const privatePlot=entry('alice',false,'PRIVATE PLOT');await alice.write(p,privatePlot);
  assert.equal((await gm.get(p+'/content/body')).text,'PRIVATE PLOT');
  await until(()=>caches.gm.get(p)?.text==='PRIVATE PLOT');assert.equal(caches.bob.has(p),false);
  const publicPlot={...privatePlot,public:true,revision:randomUUID()};await alice.write(p,publicPlot);
  await until(()=>caches.bob.get(p)?.text==='PRIVATE PLOT');
  const note=entry('bob',true,'PUBLIC NOTE',{targetKind:'plots',targetId:'p',targetCreatorUid:'alice'});delete note.title;await bob.write(n,note);
  assert.equal((await bob.get(n+'/content/body')).text,'PUBLIC NOTE');
  await until(()=>caches.gm.get(n)?.text==='PUBLIC NOTE'&&caches.bob.has(n));
  await alice.write(p,{...privatePlot,revision:randomUUID()});
  await until(()=>!caches.bob.has(p)&&!caches.bob.has(n));
  assert.equal(caches.gm.get(p).text,'PRIVATE PLOT');assert.equal(caches.gm.get(n).text,'PUBLIC NOTE');
  await assertFails(bob.get(p+'/content/body'));
  const privateNote=entry('alice',false,'PRIVATE SESSION NOTE',{targetKind:'sessions',targetId:'s'});delete privateNote.title;
  await gm.write(`campaigns/${c}/sessions/s`,{title:'Session',text:'Public',updatedAt:'now'});
  await alice.write(`campaigns/${c}/notes/private`,privateNote);
  await until(()=>caches.gm.get(`campaigns/${c}/notes/private`)?.text==='PRIVATE SESSION NOTE');
  assert.equal(caches.bob.has(`campaigns/${c}/notes/private`),false);
  await alice.write(p,null);
  await env.withSecurityRulesDisabled(async context=>{
   for(const path of [n,n+'/content/body'])assert.equal((await sdk.getDoc(sdk.doc(context.firestore(),path))).exists(),false);
  });
  // Reusing a deleted parent ID must not resurrect another creator's previous notes.
  await alice.write(p,{...privatePlot,revision:randomUUID()});
  await until(()=>caches.gm.get(p)?.revision!==privatePlot.revision&&caches.gm.has(p)&&!caches.gm.has(n));
  await gm.removeMember(c,'bob');await until(()=>caches.bob.size===0);
  await gm.deleteCampaign(c);
  await env.withSecurityRulesDisabled(async context=>{
   const db=context.firestore();
   for(const path of [p,n,`campaigns/${c}/notes/private`]) {
    assert.equal((await sdk.getDoc(sdk.doc(db,path))).exists(),false);
    assert.equal((await sdk.getDoc(sdk.doc(db,path+'/content/body'))).exists(),false);
   }
  });
  assert.deepEqual(errors,[]);
 } finally {stops.forEach(stop=>stop());await env.cleanup();}
});
