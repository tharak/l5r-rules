const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails} = require('@firebase/rules-unit-testing');
const {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,writeBatch,Timestamp} = require('firebase/firestore');
let env;
const projectId='demo-l5r-rules-rules-tests';
const sections={identity:{name:'PC'},traits:{rings:{Earth:2},traits:{}},skills:{skills:{}},options:{advantages:[],disadvantages:[]},story:{notes:'SECRET'},summary:{insight:100,combat:{}}};
const mask={identity:true,traits:false,skills:false,options:false,story:false,summary:false};
const full={sheetJson:JSON.stringify({name:'PC',notes:'SECRET'}),updatedAt:'now',revision:'r1',visibility:mask,sections};
const projection={revision:'r1',sections:{identity:sections.identity}};
const db=u=>u?env.authenticatedContext(u).firestore():env.unauthenticatedContext().firestore();
const r=(d,path)=>doc(d,path);
const batch=(d,changes)=>{const b=writeBatch(d);for(const [path,data]of changes)data===null?b.delete(r(d,path)):b.set(r(d,path),data);return b.commit();};
before(async()=>{
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore();
  await batch(d,[['campaigns/c',{title:'Campaign',gmUid:'gm'}],...['gm','alice','bob'].flatMap(u=>[[`campaigns/c/members/${u}`,{gmUid:'gm',membershipId:u+'-membership',inviteToken:''}],[`users/${u}/campaigns/c`,{gmUid:'gm',membershipId:u+'-membership'}]]),['campaigns/c/pcs/alice_pc',{ownerUid:'alice',characterId:'pc',membershipId:'alice-membership'}],['users/alice/characters/pc',full],['users/alice/publicCharacters/pc',projection],['campaigns/c/sessions/s',{title:'Session',text:'Line one\nLine two',updatedAt:'now'}],['campaigns/c/npcs/n',{name:'Secret NPC',notes:'SECRET',updatedAt:'now'}]]);
 });
});
after(async()=>{await env?.cleanup();});
test('owner full access and atomic projection writes; hidden sections never enter the public document',async()=>{
 const d=db('alice');await assertSucceeds(getDoc(r(d,'users/alice/characters/pc')));
 await assertFails(setDoc(r(d,'users/alice/characters/pc'),{...full,revision:'r2'}));
 await assertFails(batch(d,[['users/alice/characters/pc',{...full,revision:'r2'}],['users/alice/publicCharacters/pc',{revision:'r2',sections}]]));
 await assertSucceeds(batch(d,[['users/alice/characters/pc',{...full,revision:'r2'}],['users/alice/publicCharacters/pc',{...projection,revision:'r2'}]]));
 await assertFails(batch(d,[['users/alice/characters/pc',{...full,revision:'forged',sections:{...sections,identity:{...sections.identity,notes:'SECRET'}}}],['users/alice/publicCharacters/pc',{revision:'forged',sections:{identity:{...sections.identity,notes:'SECRET'}}}]]));
 const publicData=(await getDoc(r(d,'users/alice/publicCharacters/pc'))).data();assert.ok(!JSON.stringify(publicData).includes('SECRET'));
});
test('privacy is paused: anyone reads a sheet by its path, only its owner writes it, nobody lists it',async()=>{
 for(const u of ['gm','bob','outsider',null]) {
  await assertSucceeds(getDoc(r(db(u),'users/alice/characters/pc')));
  await assertSucceeds(getDoc(r(db(u),'users/alice/publicCharacters/pc')));
  await assertFails(getDocs(collection(db(u),'users/alice/characters')));
  await assertFails(getDocs(collection(db(u),'users/alice/publicCharacters')));
 }
 for(const u of ['outsider',null])await assertFails(getDoc(r(db(u),'campaigns/c')));
 // Older clients still request grants; forged grants stay rejected.
 await assertSucceeds(setDoc(r(db('bob'),'users/alice/characters/pc/grants/public_bob'),{campaignId:'c',pcId:'alice_pc',membershipId:'bob-membership'}));
 await assertFails(setDoc(r(db('bob'),'users/alice/characters/pc/grants/full_bob'),{campaignId:'c',pcId:'alice_pc',membershipId:'bob-membership'}));
 await assertFails(setDoc(r(db('outsider'),'users/alice/characters/pc/grants/public_outsider'),{campaignId:'c',pcId:'alice_pc',membershipId:'outsider-membership'}));
 await assertFails(setDoc(r(db('bob'),'users/alice/characters/pc/grants/public_outsider'),{campaignId:'c',pcId:'alice_pc',membershipId:'bob-membership'}));
 await assertFails(setDoc(r(db('bob'),'users/alice/characters/pc/grants/public_bob'),{campaignId:'c',pcId:'missing',membershipId:'bob-membership'}));
 const changed={...full,revision:'r3',sheetJson:'{"notes":"Someone else edit"}'};
 for(const u of ['gm','bob','outsider',null])await assertFails(batch(db(u),[['users/alice/characters/pc',changed],['users/alice/publicCharacters/pc',{...projection,revision:'r3'}]]));
 await assertSucceeds(batch(db('alice'),[['users/alice/characters/pc',changed],['users/alice/publicCharacters/pc',{...projection,revision:'r3'}]]));
});
test('all 128 seven-section masks exclude hidden abilities from player responses and reject private metadata in public sections',async()=>{
 const allSections={...sections,abilities:{abilities:[{name:'SECRET POWER',kind:'custom',description:'private ability'}]}};
 for(let bits=0;bits<128;bits++) {
  const visibility=Object.fromEntries(Object.keys(allSections).map((key,i)=>[key,!!(bits&(1<<i))]));
  const f={...full,revision:'mask-'+bits,visibility,sections:allSections,sheetJson:JSON.stringify({progression:{history:[{explanation:'PRIVATE HISTORY'}]},exceptions:[{explanation:'PRIVATE APPROVAL'}]})};
  const p={revision:f.revision,sections:Object.fromEntries(Object.entries(allSections).filter(([key])=>visibility[key]))};
  await assertSucceeds(batch(db('alice'),[['users/alice/characters/masks',f],['users/alice/publicCharacters/masks',p]]));
  if(bits===0) {
   await assertSucceeds(setDoc(r(db('alice'),'campaigns/c/pcs/masks_pc'),{ownerUid:'alice',characterId:'masks',membershipId:'alice-membership'}));
   await assertSucceeds(setDoc(r(db('bob'),'users/alice/characters/masks/grants/public_bob'),{campaignId:'c',pcId:'masks_pc',membershipId:'bob-membership'}));
  }
  const response=(await assertSucceeds(getDoc(r(db('bob'),'users/alice/publicCharacters/masks')))).data();
  assert.equal(JSON.stringify(response).includes('SECRET POWER'),visibility.abilities);
  assert.ok(!JSON.stringify(response).includes('PRIVATE HISTORY'));
  assert.ok(!JSON.stringify(response).includes('PRIVATE APPROVAL'));
  assert.equal(Object.keys(response.sections).length,Object.values(visibility).filter(Boolean).length);
 }
 await assertSucceeds(getDoc(r(db('bob'),'users/alice/characters/masks')));
 const bad={...full,revision:'private-fields',visibility:{...mask,abilities:true},sections:{...allSections,abilities:{abilities:[],exceptions:['PRIVATE']}}};
 await assertFails(batch(db('alice'),[['users/alice/characters/bad',bad],['users/alice/publicCharacters/bad',{revision:bad.revision,sections:{identity:sections.identity,abilities:bad.sections.abilities}}]]));
});
test('legacy six-section documents are upgraded to Abilities only by their owner',async()=>{
 await assertSucceeds(batch(db('alice'),[['users/alice/characters/legacy7',full],['users/alice/publicCharacters/legacy7',projection]]));
 const next={...full,revision:'v2',visibility:{...mask,abilities:true},sections:{...sections,abilities:{abilities:[{name:'Ability'}]}}};
 const p={revision:'v2',sections:{...projection.sections,abilities:next.sections.abilities}};
 for(const u of ['gm','bob'])await assertFails(batch(db(u),[['users/alice/characters/legacy7',next],['users/alice/publicCharacters/legacy7',p]]));
 await assertSucceeds(batch(db('alice'),[['users/alice/characters/legacy7',next],['users/alice/publicCharacters/legacy7',p]]));
});
test('campaign, session, NPC and membership permissions',async()=>{
 for(const u of ['alice','bob']){await assertSucceeds(getDoc(r(db(u),'campaigns/c/sessions/s')));await assertFails(getDoc(r(db(u),'campaigns/c/npcs/n')));await assertFails(setDoc(r(db(u),'campaigns/c/sessions/s'),{title:'Forged',text:'',updatedAt:'now'}));}
 await assertSucceeds(getDoc(r(db('gm'),'campaigns/c/npcs/n')));
 await assertSucceeds(setDoc(r(db('gm'),'campaigns/c/sessions/s'),{title:'Edited',text:'a\nb',updatedAt:'now'}));
 await assertFails(setDoc(r(db('gm'),'campaigns/c'),{title:'Edited',gmUid:'alice'}));
 await assertSucceeds(setDoc(r(db('gm'),'campaigns/c'),{title:'Edited',gmUid:'gm'}));
 await assertFails(setDoc(r(db('outsider'),'campaigns/c/members/outsider'),{gmUid:'gm',membershipId:'new',inviteToken:''}));
 await assertFails(deleteDoc(r(db('alice'),'campaigns/c/members/bob')));
 await assertFails(deleteDoc(r(db('gm'),'campaigns/c/members/gm')));
});
test('members publish only their own display names without changing membership authority',async()=>{
 const own=r(db('alice'),'campaigns/c/members/alice');
 await assertSucceeds(updateDoc(own,{displayName:'Alice'}));
 assert.equal((await getDoc(r(db('bob'),'campaigns/c/members/alice'))).data().displayName,'Alice');
 for(const u of ['gm','bob','outsider',null])await assertFails(updateDoc(r(db(u),'campaigns/c/members/alice'),{displayName:'Forged'}));
 await assertFails(updateDoc(own,{displayName:123}));
 await assertFails(updateDoc(own,{displayName:'x'.repeat(201)}));
 await assertFails(updateDoc(own,{displayName:'Alice',membershipId:'forged'}));
 await assertFails(updateDoc(own,{displayName:'Alice',gmUid:'alice'}));
 await assertFails(updateDoc(own,{displayName:'Alice',inviteToken:'forged'}));
 await assertFails(updateDoc(own,{displayName:'Alice',email:'private@example.test'}));
});
test('plots and attached notes are readable by every member and writable only by their creator',async()=>{
 const metadata=(creatorUid,isPublic,revision,extra={})=>({creatorUid,public:isPublic,revision,createdAt:'now',updatedAt:'now',...extra});
 const writeEntry=(u,kind,id,m,text='TEXT',title='A plot')=>batch(db(u),[
  [`campaigns/c/${kind}/${id}`,m],
  [`campaigns/c/${kind}/${id}/content/body`,{text,revision:m.revision,...(kind==='plots'?{title}:{})}]
 ]);
 const plotPath='campaigns/c/plots/alice_plot',bodyPath=plotPath+'/content/body';
 // An entry saved as private before privacy was paused is shared with every member too.
 const m=metadata('alice',false,'p1');
 await assertSucceeds(writeEntry('alice','plots','alice_plot',m));
 for(const u of ['alice','gm','bob'])await assertSucceeds(getDoc(r(db(u),bodyPath)));
 for(const u of ['outsider',null])await assertFails(getDoc(r(db(u),bodyPath)));
 const catalog=(await getDocs(collection(db('bob'),'campaigns/c/plots'))).docs.map(d=>d.data());
 assert.ok(!JSON.stringify(catalog).includes('TEXT'));
 await assertFails(getDocs(collection(db('bob'),plotPath+'/content')));
 await assertFails(writeEntry('bob','plots','alice_plot',{...m,public:true,revision:'forged'}));
 await assertFails(writeEntry('gm','plots','alice_plot',{...m,creatorUid:'gm',public:true,revision:'forged'}));
 await assertFails(writeEntry('alice','plots','forged_owner',{...m,creatorUid:'bob'}));
 await assertFails(setDoc(r(db('alice'),plotPath),{...m,title:'Leaked title'}));
 await assertFails(setDoc(r(db('alice'),plotPath),{...m,revision:'not-atomic'}));
 await assertSucceeds(writeEntry('alice','plots','alice_plot',{...m,public:true,revision:'p2'},'UPDATED','Updated plot'));
 const target={targetKind:'plots',targetId:'alice_plot',targetCreatorUid:'alice'};
 await assertSucceeds(writeEntry('bob','notes','bob_plot_note',metadata('bob',true,'n1',target)));
 const notePath='campaigns/c/notes/bob_plot_note/content/body';
 for(const u of ['alice','bob','gm'])await assertSucceeds(getDoc(r(db(u),notePath)));
 await assertFails(writeEntry('alice','notes','bob_plot_note',metadata('bob',true,'n2',target)));
 await assertFails(writeEntry('bob','notes','bob_plot_note',metadata('bob',true,'n2',{targetKind:'sessions',targetId:'s'})));
 for(const [targetKind,targetId] of [['sessions','s'],['pcs','alice_pc']]) {
  const id='note_'+targetKind;
  await assertSucceeds(writeEntry('alice','notes',id,metadata('alice',true,'n1',{targetKind,targetId})));
  for(const u of ['bob','gm'])await assertSucceeds(getDoc(r(db(u),`campaigns/c/notes/${id}/content/body`)));
 }
 // NPCs stay a GM-only section, so their notes do too.
 await assertSucceeds(writeEntry('gm','notes','npc_note',metadata('gm',true,'n1',{targetKind:'npcs',targetId:'n'})));
 await assertFails(getDoc(r(db('alice'),'campaigns/c/notes/npc_note/content/body')));
 await assertFails(writeEntry('alice','notes','npc_attack',metadata('alice',true,'n1',{targetKind:'npcs',targetId:'n'})));
 await assertFails(writeEntry('alice','notes','missing_target',metadata('alice',true,'n1',{targetKind:'sessions',targetId:'missing'})));
 await assertFails(writeEntry('outsider','plots','outside',metadata('outsider',true,'p1')));
 await assertFails(deleteDoc(r(db('alice'),plotPath)));
 await assertSucceeds(batch(db('alice'),[[bodyPath,null],[plotPath,null]]));
 await assertFails(getDoc(r(db('gm'),notePath)));
 // A different member cannot revive attached notes by reusing a deleted plot ID.
 await assertSucceeds(writeEntry('bob','plots','alice_plot',metadata('bob',true,'replacement')));
 await assertFails(getDoc(r(db('bob'),notePath)));
 await env.withSecurityRulesDisabled(c=>deleteDoc(r(c.firestore(),'campaigns/c/members/alice')));
 await assertFails(getDoc(r(db('alice'),'campaigns/c/notes/note_sessions/content/body')));
 await env.withSecurityRulesDisabled(c=>setDoc(r(c.firestore(),'campaigns/c/members/alice'),{gmUid:'gm',membershipId:'alice-membership',inviteToken:''}));
});
test('invitations require explicit joining, expire after seven days, and revoke immediately',async()=>{
 const d=db('gm'),now=Timestamp.now();
 const invitation={campaignId:'c',gmUid:'gm',createdAt:Timestamp.fromMillis(now.toMillis()-1000),expiresAt:Timestamp.fromMillis(now.toMillis()+7*86400000-1000)};
 await assertSucceeds(batch(d,[['invites/token',invitation],['campaigns/c/private/invitation',{token:'token'}]]));
 await assertFails(getDocs(collection(db('alice'),'invites')));
 await assertSucceeds(getDoc(r(db('outsider'),'invites/token')));
 await assertFails(getDoc(r(db(null),'invites/token')));
 await assertFails(batch(d,[['invites/long',{...invitation,expiresAt:Timestamp.fromMillis(now.toMillis()+8*86400000)}],['campaigns/c/private/invitation',{token:'long'}]]));
 await assertSucceeds(batch(db('joiner'),[['campaigns/c/members/joiner',{gmUid:'gm',membershipId:'joiner-1',inviteToken:'token'}],['users/joiner/campaigns/c',{gmUid:'gm',membershipId:'joiner-1'}]]));
 await assertSucceeds(batch(d,[['invites/token',null],['campaigns/c/private/invitation',null]]));
 await assertFails(batch(db('late'),[['campaigns/c/members/late',{gmUid:'gm',membershipId:'late',inviteToken:'token'}],['users/late/campaigns/c',{gmUid:'gm',membershipId:'late'}]]));
 await env.withSecurityRulesDisabled(c=>setDoc(r(c.firestore(),'invites/expired'),{...invitation,expiresAt:Timestamp.fromMillis(now.toMillis()-1000)}));
 await assertFails(getDoc(r(db('late'),'invites/expired')));
 await assertFails(batch(db('late'),[['campaigns/c/members/late',{gmUid:'gm',membershipId:'late',inviteToken:'expired'}],['users/late/campaigns/c',{gmUid:'gm',membershipId:'late'}]]));
});
test('leaving a campaign or unlinking a PC removes campaign access but not shared sheet reads',async()=>{
 await assertSucceeds(batch(db('gm'),[['campaigns/c/members/bob',null],['users/bob/campaigns/c',null]]));
 await assertFails(getDoc(r(db('bob'),'campaigns/c')));
 await assertSucceeds(getDoc(r(db('bob'),'users/alice/publicCharacters/pc')));
 await env.withSecurityRulesDisabled(c=>batch(c.firestore(),[['campaigns/c/members/bob',{gmUid:'gm',membershipId:'bob-new',inviteToken:''}],['users/bob/campaigns/c',{gmUid:'gm',membershipId:'bob-new'}]]));
 await assertSucceeds(deleteDoc(r(db('alice'),'campaigns/c/pcs/alice_pc')));
 await assertSucceeds(getDoc(r(db('gm'),'users/alice/characters/pc')));
 await assertSucceeds(getDoc(r(db('alice'),'users/alice/characters/pc')));
});
test('campaign creation makes sole GM and index atomically, players cannot forge PC ownership',async()=>{
 const d=db('creator');await assertSucceeds(batch(d,[['campaigns/new',{title:'New',gmUid:'creator'}],['campaigns/new/members/creator',{gmUid:'creator',membershipId:'epoch',inviteToken:''}],['users/creator/campaigns/new',{gmUid:'creator',membershipId:'epoch'}]]));
 await assertFails(setDoc(r(db('alice'),'campaigns/c/pcs/forged'),{ownerUid:'bob',characterId:'pc',membershipId:'bob-new'}));
 await assertSucceeds(setDoc(r(db('alice'),'campaigns/c/pcs/alice_pc'),{ownerUid:'alice',characterId:'pc',membershipId:'alice-membership'}));
 await assertFails(deleteDoc(r(db('bob'),'campaigns/c/pcs/alice_pc')));
 await assertSucceeds(deleteDoc(r(db('gm'),'campaigns/c/pcs/alice_pc')));
 await assertSucceeds(batch(d,[['campaigns/new/members/creator',null],['users/creator/campaigns/new',null],['campaigns/new',null]]));
 await assertSucceeds(getDoc(r(db('alice'),'users/alice/characters/pc')));
});
