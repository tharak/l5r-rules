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
test('GM and player grants, outsiders, anonymous reads, forged grants, and visibility changes',async()=>{
 for(const u of ['gm','bob'])await assertSucceeds(setDoc(r(db(u),`users/alice/characters/pc/grants/${u==='gm'?'full_gm':'public_bob'}`),{campaignId:'c',pcId:'alice_pc',membershipId:u+'-membership'}));
 await assertSucceeds(getDoc(r(db('gm'),'users/alice/characters/pc')));
 await assertSucceeds(getDoc(r(db('bob'),'users/alice/publicCharacters/pc')));
 await assertFails(getDoc(r(db('bob'),'users/alice/characters/pc')));
 await assertFails(getDocs(collection(db('bob'),'users/alice/publicCharacters')));
 for(const u of ['outsider',null]){await assertFails(getDoc(r(db(u),'users/alice/publicCharacters/pc')));await assertFails(getDoc(r(db(u),'campaigns/c')));}
 await assertFails(setDoc(r(db('outsider'),'users/alice/characters/pc/grants/public_outsider'),{campaignId:'c',pcId:'alice_pc',membershipId:'outsider-membership'}));
 await assertFails(setDoc(r(db('bob'),'users/alice/characters/pc/grants/public_outsider'),{campaignId:'c',pcId:'alice_pc',membershipId:'bob-membership'}));
 await assertFails(setDoc(r(db('bob'),'users/alice/characters/pc/grants/public_bob'),{campaignId:'c',pcId:'missing',membershipId:'bob-membership'}));
 const changed={...full,revision:'r3',sheetJson:'{"notes":"GM edit"}'};
 await assertSucceeds(batch(db('gm'),[['users/alice/characters/pc',changed],['users/alice/publicCharacters/pc',{...projection,revision:'r3'}]]));
 const forged={...changed,revision:'r4',visibility:{...mask,story:true}};
 await assertFails(batch(db('gm'),[['users/alice/characters/pc',forged],['users/alice/publicCharacters/pc',{revision:'r4',sections:{identity:sections.identity,story:sections.story}}]]));
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
 await assertFails(getDoc(r(db('bob'),'users/alice/characters/masks')));
 const bad={...full,revision:'private-fields',visibility:{...mask,abilities:true},sections:{...allSections,abilities:{abilities:[],exceptions:['PRIVATE']}}};
 await assertFails(batch(db('alice'),[['users/alice/characters/bad',bad],['users/alice/publicCharacters/bad',{revision:bad.revision,sections:{identity:sections.identity,abilities:bad.sections.abilities}}]]));
});
test('legacy six-section documents accept GM migration with Abilities private; only owners can publish Abilities',async()=>{
 await assertSucceeds(batch(db('alice'),[['users/alice/characters/legacy7',full],['users/alice/publicCharacters/legacy7',projection]]));
 await assertSucceeds(setDoc(r(db('alice'),'campaigns/c/pcs/legacy7_pc'),{ownerUid:'alice',characterId:'legacy7',membershipId:'alice-membership'}));
 await assertSucceeds(setDoc(r(db('gm'),'users/alice/characters/legacy7/grants/full_gm'),{campaignId:'c',pcId:'legacy7_pc',membershipId:'gm-membership'}));
 const next={...full,revision:'v2',visibility:{...mask,abilities:false},sections:{...sections,abilities:{abilities:[{name:'Secret'}]}}};
 await assertSucceeds(batch(db('gm'),[['users/alice/characters/legacy7',next],['users/alice/publicCharacters/legacy7',{...projection,revision:'v2'}]]));
 const published={...next,revision:'v3',visibility:{...next.visibility,abilities:true}},p={revision:'v3',sections:{...projection.sections,abilities:next.sections.abilities}};
 await assertFails(batch(db('gm'),[['users/alice/characters/legacy7',published],['users/alice/publicCharacters/legacy7',p]]));
 await assertFails(batch(db('bob'),[['users/alice/characters/legacy7',published],['users/alice/publicCharacters/legacy7',p]]));
 await assertSucceeds(batch(db('alice'),[['users/alice/characters/legacy7',published],['users/alice/publicCharacters/legacy7',p]]));
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
test('removing membership or PC associations invalidates stale grants, including after rejoining',async()=>{
 await assertSucceeds(batch(db('gm'),[['campaigns/c/members/bob',null],['users/bob/campaigns/c',null]]));
 await assertFails(getDoc(r(db('bob'),'users/alice/publicCharacters/pc')));
 await env.withSecurityRulesDisabled(c=>batch(c.firestore(),[['campaigns/c/members/bob',{gmUid:'gm',membershipId:'bob-new',inviteToken:''}],['users/bob/campaigns/c',{gmUid:'gm',membershipId:'bob-new'}]]));
 await assertFails(getDoc(r(db('bob'),'users/alice/publicCharacters/pc')));
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
