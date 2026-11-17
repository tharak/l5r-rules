const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails} = require('@firebase/rules-unit-testing');
const {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,writeBatch,Timestamp} = require('firebase/firestore');
let env;
const projectId='demo-l5r-rules-rules-tests';
const profile={name:'PC',portrait:'',clan:'Crab',family:'Hida',school:'Hida Bushi',insightRank:1,gear:[],stats:{},advantages:[],disadvantages:[],journal:[]};
const full={sheetJson:JSON.stringify({name:'PC',journal:[{id:'s',text:'SECRET',public:false}]}),updatedAt:'now',revision:'r1',profile};
const projection={revision:'r1',profile};
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
test('owners write the sheet and its matching public profile atomically',async()=>{
 const d=db('alice');await assertSucceeds(getDoc(r(d,'users/alice/characters/pc')));
 await assertFails(setDoc(r(d,'users/alice/characters/pc'),{...full,revision:'r2'}));
 await assertFails(batch(d,[['users/alice/characters/pc',{...full,revision:'r2'}],['users/alice/publicCharacters/pc',{revision:'r2',profile:{...profile,name:'Different'}}]]));
 await assertFails(batch(d,[['users/alice/characters/pc',{...full,revision:'r2',visibility:{}}],['users/alice/publicCharacters/pc',{...projection,revision:'r2'}]]));
 await assertFails(batch(d,[['users/alice/characters/pc',{...full,revision:'r2',profile:{...profile,secret:'x'}}],['users/alice/publicCharacters/pc',{revision:'r2',profile:{...profile,secret:'x'}}]]));
 await assertSucceeds(batch(d,[['users/alice/characters/pc',{...full,revision:'r2'}],['users/alice/publicCharacters/pc',{...projection,revision:'r2'}]]));
 const publicData=(await getDoc(r(d,'users/alice/publicCharacters/pc'))).data();assert.ok(!JSON.stringify(publicData).includes('SECRET'));
});
test('anyone reads the public profile; only the owner and the GM read the full sheet; nobody lists',async()=>{
 for(const u of ['gm','bob','outsider',null]) {
  await assertSucceeds(getDoc(r(db(u),'users/alice/publicCharacters/pc')));
  await assertFails(getDocs(collection(db(u),'users/alice/characters')));
  await assertFails(getDocs(collection(db(u),'users/alice/publicCharacters')));
 }
 // Without a full grant even the GM is refused; with one, only the GM reads the sheet.
 await assertFails(getDoc(r(db('gm'),'users/alice/characters/pc')));
 await assertSucceeds(setDoc(r(db('gm'),'users/alice/characters/pc/grants/full_gm'),{campaignId:'c',pcId:'alice_pc',membershipId:'gm-membership'}));
 await assertSucceeds(getDoc(r(db('gm'),'users/alice/characters/pc')));
 for(const u of ['bob','outsider',null])await assertFails(getDoc(r(db(u),'users/alice/characters/pc')));
 await assertFails(setDoc(r(db('bob'),'users/alice/characters/pc/grants/full_bob'),{campaignId:'c',pcId:'alice_pc',membershipId:'bob-membership'}));
 await assertFails(getDoc(r(db('bob'),'users/alice/characters/pc')));
 for(const u of ['outsider',null])await assertFails(getDoc(r(db(u),'campaigns/c')));
 await assertFails(setDoc(r(db('outsider'),'users/alice/characters/pc/grants/public_outsider'),{campaignId:'c',pcId:'alice_pc',membershipId:'outsider-membership'}));
 const changed={...full,revision:'r3',sheetJson:'{"name":"Someone else edit"}'};
 for(const u of ['gm','bob','outsider',null])await assertFails(batch(db(u),[['users/alice/characters/pc',changed],['users/alice/publicCharacters/pc',{...projection,revision:'r3'}]]));
 await assertSucceeds(batch(db('alice'),[['users/alice/characters/pc',changed],['users/alice/publicCharacters/pc',{...projection,revision:'r3'}]]));
});
test('campaign, session, NPC and membership permissions',async()=>{
 for(const u of ['alice','bob']){await assertSucceeds(getDoc(r(db(u),'campaigns/c/sessions/s')));await assertSucceeds(getDoc(r(db(u),'campaigns/c/npcs/n')));await assertFails(setDoc(r(db(u),'campaigns/c/npcs/n'),{name:'Forged',notes:'',updatedAt:'now'}));await assertFails(setDoc(r(db(u),'campaigns/c/sessions/s'),{title:'Forged',text:'',updatedAt:'now'}));}
 await assertSucceeds(getDoc(r(db('gm'),'campaigns/c/npcs/n')));
 const npc={name:'NPC',notes:'',updatedAt:'now'},picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYwPRVdM7zQAAAABJRU5ErkJggg==';
 await assertSucceeds(setDoc(r(db('gm'),'campaigns/c/npcs/pictured'),{...npc,portrait:picture}));
 // Role and description are optional strings within limits; other fields are refused.
 await assertSucceeds(setDoc(r(db('gm'),'campaigns/c/npcs/described'),{...npc,role:'Magistrate',description:'Keeps the old shrine.'}));
 await assertFails(setDoc(r(db('gm'),'campaigns/c/npcs/described'),{...npc,role:'x'.repeat(201)}));
 await assertFails(setDoc(r(db('gm'),'campaigns/c/npcs/described'),{...npc,description:'x'.repeat(20001)}));
 await assertFails(setDoc(r(db('gm'),'campaigns/c/npcs/described'),{...npc,clan:'Crab'}));
 for(const portrait of ['https://example.test/a.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,AA" onerror="x','data:image/png;base64,'+'A'.repeat(120000),42])
  await assertFails(setDoc(r(db('gm'),'campaigns/c/npcs/pictured'),{...npc,portrait}));
 await assertFails(setDoc(r(db('alice'),'campaigns/c/npcs/pictured'),{...npc,portrait:picture}));
 await assertSucceeds(deleteDoc(r(db('gm'),'campaigns/c/npcs/pictured')));
 await assertSucceeds(setDoc(r(db('gm'),'campaigns/c/sessions/s'),{title:'Edited',text:'a\nb',createdAt:'then',updatedAt:'now'}));
 await assertSucceeds(setDoc(r(db('gm'),'campaigns/c/sessions/s'),{title:'Edited',text:'',createdAt:'then',updatedAt:'now',images:['a','b','c','d']}));
 await assertFails(setDoc(r(db('gm'),'campaigns/c/sessions/s'),{title:'Edited',text:'',createdAt:'then',updatedAt:'now',images:['a','b','c','d','e']}));
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
 // Only the GM or the plot's creator adds entries to a plot's journal.
 await assertFails(writeEntry('bob','notes','bob_plot_note',metadata('bob',true,'n1',target)));
 await assertSucceeds(writeEntry('alice','notes','bob_plot_note',metadata('alice',true,'n1',target)));
 const notePath='campaigns/c/notes/bob_plot_note/content/body';
 for(const u of ['alice','bob','gm'])await assertSucceeds(getDoc(r(db(u),notePath)));
 await assertFails(writeEntry('bob','notes','bob_plot_note',metadata('alice',true,'n2',target)));
 await assertFails(writeEntry('alice','notes','bob_plot_note',metadata('alice',true,'n2',{targetKind:'sessions',targetId:'s'})));
 // Any member writes in a session's journal; PC journals live with the character.
 await assertFails(writeEntry('alice','notes','note_pcs',metadata('alice',true,'n1',{targetKind:'pcs',targetId:'alice_pc'})));
 for(const [targetKind,targetId] of [['sessions','s']]) {
  const id='note_'+targetKind;
  await assertSucceeds(writeEntry('alice','notes',id,metadata('alice',true,'n1',{targetKind,targetId})));
  for(const u of ['bob','gm'])await assertSucceeds(getDoc(r(db(u),`campaigns/c/notes/${id}/content/body`)));
 }
 // NPCs stay a GM-only section, so their notes do too.
 await assertSucceeds(writeEntry('gm','notes','npc_note',metadata('gm',true,'n1',{targetKind:'npcs',targetId:'n'})));
 // NPCs and their notes are public to every member; members may add notes to them.
 await assertSucceeds(getDoc(r(db('alice'),'campaigns/c/notes/npc_note/content/body')));
 await assertFails(writeEntry('alice','notes','npc_member_note',metadata('alice',true,'n1',{targetKind:'npcs',targetId:'n'})));
 for(const u of ['outsider',null])await assertFails(getDoc(r(db(u),'campaigns/c/notes/npc_note/content/body')));
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
test('leaving a campaign keeps the public profile readable; unlinking a PC ends the GM\'s full read',async()=>{
 await assertSucceeds(batch(db('gm'),[['campaigns/c/members/bob',null],['users/bob/campaigns/c',null]]));
 await assertFails(getDoc(r(db('bob'),'campaigns/c')));
 await assertSucceeds(getDoc(r(db('bob'),'users/alice/publicCharacters/pc')));
 await env.withSecurityRulesDisabled(c=>batch(c.firestore(),[['campaigns/c/members/bob',{gmUid:'gm',membershipId:'bob-new',inviteToken:''}],['users/bob/campaigns/c',{gmUid:'gm',membershipId:'bob-new'}]]));
 await assertSucceeds(getDoc(r(db('gm'),'users/alice/characters/pc')));
 await assertSucceeds(deleteDoc(r(db('alice'),'campaigns/c/pcs/alice_pc')));
 await assertFails(getDoc(r(db('gm'),'users/alice/characters/pc')));
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
test('GM journal entries: public ones are readable by anyone, private ones by the owner and GM only',async()=>{
 await env.withSecurityRulesDisabled(c=>batch(c.firestore(),[
  ['campaigns/c/pcs/journal_pc',{ownerUid:'alice',characterId:'journaled',membershipId:'alice-membership'}],
  ['users/alice/characters/journaled',{...full,revision:'j1'}],['users/alice/publicCharacters/journaled',{...projection,revision:'j1'}],
  ['users/alice/characters/journaled/grants/full_gm',{campaignId:'c',pcId:'journal_pc',membershipId:'gm-membership'}]]));
 const entry=(text,isPublic,author='gm')=>({authorUid:author,authorName:'Game Master',text,public:isPublic,createdAt:'2026-11-16',updatedAt:'2026-11-16'});
 const path=id=>`users/alice/characters/journaled/journal/${id}`;
 await assertSucceeds(setDoc(r(db('gm'),path('private')),entry('PRIVATE NOTE',false)));
 await assertSucceeds(setDoc(r(db('gm'),path('public')),entry('Public note',true)));
 for(const u of ['bob','outsider'])await assertFails(setDoc(r(db(u),path('forged')),entry('x',true,u)));
 await assertFails(setDoc(r(db('gm'),path('forged')),entry('x',true,'alice')));
 await assertFails(setDoc(r(db('gm'),path('extra')),{...entry('x',true),extra:1}));
 for(const u of ['bob','outsider',null]) {
  await assertSucceeds(getDoc(r(db(u),path('public'))));
  await assertFails(getDoc(r(db(u),path('private'))));
 }
 for(const u of ['alice','gm'])await assertSucceeds(getDoc(r(db(u),path('private'))));
 const {query,where}=require('firebase/firestore');
 await assertSucceeds(getDocs(query(collection(db(null),'users/alice/characters/journaled/journal'),where('public','==',true))));
 await assertFails(getDocs(collection(db('bob'),'users/alice/characters/journaled/journal')));
 await assertSucceeds(getDocs(collection(db('alice'),'users/alice/characters/journaled/journal')));
 await assertSucceeds(updateDoc(r(db('gm'),path('private')),{text:'Edited',public:true,updatedAt:'2026-11-17'}));
 await assertFails(updateDoc(r(db('alice'),path('public')),{text:'Owner edit',updatedAt:'2026-11-17'}));
 await assertFails(updateDoc(r(db('gm'),path('public')),{createdAt:'2000-01-01'}));
 await assertSucceeds(deleteDoc(r(db('alice'),path('public'))));
 await assertSucceeds(deleteDoc(r(db('gm'),path('private'))));
});
test('read marks: members read everyone\'s marks and write only their own',async()=>{
 await assertSucceeds(setDoc(r(db('alice'),'campaigns/c/reads/alice'),{name:'Alice',marks:{'sessions:s':'2026-11-01'}}));
 await assertFails(setDoc(r(db('bob'),'campaigns/c/reads/alice'),{name:'Forged',marks:{}}));
 await assertFails(setDoc(r(db('alice'),'campaigns/c/reads/alice'),{name:'Alice',marks:{},extra:true}));
 for(const u of ['gm','bob'])await assertSucceeds(getDoc(r(db(u),'campaigns/c/reads/alice')));
 for(const u of ['outsider',null])await assertFails(getDoc(r(db(u),'campaigns/c/reads/alice')));
 await assertSucceeds(deleteDoc(r(db('gm'),'campaigns/c/reads/alice')));
});
test('timeline events: members read them, only the GM writes them',async()=>{
 const event={sessionId:'s',kind:'npcs',targetId:'n',noteId:'note',x:50,y:25,createdAt:'now',updatedAt:'now'};
 await assertSucceeds(setDoc(r(db('gm'),'campaigns/c/timeline/t'),event));
 for(const u of ['alice','bob'])await assertSucceeds(getDoc(r(db(u),'campaigns/c/timeline/t')));
 for(const u of ['outsider',null])await assertFails(getDoc(r(db(u),'campaigns/c/timeline/t')));
 await assertFails(setDoc(r(db('alice'),'campaigns/c/timeline/t'),{...event,x:10}));
 for(const bad of [{...event,kind:'sessions'},{...event,x:120},{...event,extra:1}])await assertFails(setDoc(r(db('gm'),'campaigns/c/timeline/t'),bad));
 await assertSucceeds(deleteDoc(r(db('gm'),'campaigns/c/timeline/t')));
});
