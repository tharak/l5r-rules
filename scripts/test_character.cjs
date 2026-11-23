const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, 'public/character-data.json')));
const source = fs.readFileSync(path.join(rootDir, 'character.js'), 'utf8');

async function character(saved,preferences = {}) {
  const storage = new Map(Object.entries(preferences));
  if (saved) {
    storage.set('l5r-rules-characters-v1', JSON.stringify([{id:'saved', sheet:saved}]));
    storage.set('l5r-rules-active-character-v1', 'saved');
  }
  const inputs = {};
  const root = {isConnected:true, innerHTML:'', querySelector:selector => inputs[selector]};
  let renders = 0, html = '';
  Object.defineProperty(root,'innerHTML',{get:()=>html,set:value=>{html=value;renders++;}});
  root.contains = node => Object.values(inputs).includes(node);
  let exported;
  const listeners = {}, timers = [];
  const window = {addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent:event=>listeners[event.type]?.(event)};
  const document = {activeElement:null,createElement:() => ({click(){}})};
  const context = vm.createContext({window, console, Event, Blob,
    localStorage:{getItem:key => storage.get(key) || null, setItem:(key,value) => storage.set(key,value)},
    location:{hash:'#/create-character'},
    fetch:async () => ({ok:true, json:async () => catalog}),
    URL:{createObjectURL(blob){exported = blob; return 'blob:test';}, revokeObjectURL(){}},
    document, setTimeout:fn=>timers.push(fn)});
  for (const file of ['official-images.js','ui-components.js','routes.js','character-catalog.js','character-rules.js']) vm.runInContext(fs.readFileSync(path.join(rootDir,file),'utf8'),context);
  vm.runInContext(source, context);
  await window.CharacterBuilder.mount(root);
  const change = (dataset,value,extra={}) => root.onchange({target:{dataset,value,...extra}});
  const click = dataset => root.onclick({target:{closest:() => ({dataset})}});
  return {
    root, inputs, change, click, window, document, context,
    renders:()=>renders,
    records:()=>JSON.parse(storage.get('l5r-rules-characters-v1')),
    remote(records) {
      storage.set('l5r-rules-characters-v1',JSON.stringify(records));
      window.dispatchEvent(new Event('characters-remote-changed'));
    },
    focusout() {root.onfocusout();while(timers.length)timers.shift()();},
    route:() => context.location.hash,
    school(clan,name) {
      change({field:'clan'},clan);
      const school = catalog.clans.find(entry => entry.name === clan).schools.find(entry => entry.name === name);
      assert.ok(school, name);
      change({field:'school'}, `${school.slug}#${school.anchor}`);
    },
    async data() {click({action:'export'}); return JSON.parse(await exported.text());},
    async reload() {
      const id = storage.get('l5r-rules-active-character-v1');
      return character(JSON.parse(storage.get('l5r-rules-characters-v1')).find(entry => entry.id === id).sheet,Object.fromEntries(storage));
    }
  };
}

test('save echoes and updates to other characters leave the editor and picker drafts intact',async()=>{
  const c=await character({name:'Active'});
  const count=c.renders();
  const records=c.records();
  // Firestore returns visibility maps in a different property order.
  records[0].sheet.visibility={abilities:false,identity:true,options:false,skills:false,story:false,summary:false,traits:false};
  records[0].updatedAt='2026-10-14T20:00:00Z';
  records.push({id:'other',sheet:{name:'Another PC'}});
  c.inputs['#new-skill']={tagName:'INPUT',value:'Lore: Unfinished'};
  c.document.activeElement=c.inputs['#new-skill'];
  c.remote(records);
  assert.equal(c.renders(),count);
  c.document.activeElement=null;c.focusout();
  assert.equal(c.renders(),count);
  assert.equal(c.inputs['#new-skill'].value,'Lore: Unfinished');
});

test('remote sheet changes wait until editing finishes, then show the latest saved sheet',async()=>{
  const c=await character({name:'Active'}),count=c.renders();
  const input={tagName:'TEXTAREA',value:'Typing notes',selectionStart:3,selectionEnd:8};
  c.inputs['[data-field="notes"]']=input;c.document.activeElement=input;
  const records=c.records();records[0].sheet.name='Remote name';c.remote(records);
  assert.equal(c.renders(),count);
  assert.equal(c.document.activeElement,input);
  assert.equal(input.selectionStart,3);assert.equal(input.selectionEnd,8);
  const next={tagName:'INPUT',value:'Unfinished equipment'};
  c.inputs['#new-equipment']=next;c.document.activeElement=next;c.focusout();
  assert.equal(c.renders(),count);
  c.document.activeElement=null;c.focusout();
  assert.equal(c.renders(),count+1);
  assert.match(c.root.innerHTML,/value="Remote name"/);
});

test('a local edit supersedes a deferred remote refresh and remote deletion still closes the editor',async()=>{
  const c=await character({name:'Active'}),count=c.renders();
  const input={tagName:'INPUT',dataset:{field:'name'},value:'Local name'};
  c.inputs['[data-field="name"]']=input;c.inputs['.creator-print-sheet']={outerHTML:''};c.document.activeElement=input;
  const records=c.records();records[0].sheet.name='Remote name';c.remote(records);
  c.root.oninput({target:input});
  c.document.activeElement=null;c.focusout();
  assert.equal(c.renders(),count);
  assert.equal(c.records()[0].sheet.name,'Local name');
  c.document.activeElement=input;c.remote([]);
  assert.equal(c.route(),'#/characters');
});

test('Save PC preserves personal edits and closes the sheet to Characters',async()=>{
  const c=await character();
  c.inputs['.creator-print-sheet']={outerHTML:''};
  c.root.oninput({target:{dataset:{field:'name'},value:'Saved PC'}});
  c.root.oninput({target:{dataset:{field:'concept'},value:'Personal concept'}});
  c.click({action:'save-close'});
  assert.equal(c.route(),'#/characters');
  const restored=await c.reload();
  const data=await restored.data();
  assert.equal(data.character.name,'Saved PC');
  assert.equal(data.character.concept,'Personal concept');
});

test('family selector includes orders, monks and vassals, and persists the selectable physical benefit',async()=>{
 const c=await character();c.change({field:'clan'},'Dragon');
 for(const [name,trait] of [['Togashi','Reflexes'],['Hitomi','Strength'],['Hoshi','Void']]) {
  assert.match(c.root.innerHTML,new RegExp(`${name} Order · \\+1 ${trait}`));
  c.change({field:'family'},name);assert.equal((await c.data()).derived.traits[trait].base,3);
 }
 c.change({field:'clan'},'Spider');assert.match(c.root.innerHTML,/Spider Monks · \+1 Reflexes/);
 c.change({field:'clan'},'Crab');assert.match(c.root.innerHTML,/Moshibaru \(Hida\) · \+1 any Physical/);
 c.change({field:'family'},'Moshibaru');assert.match(c.root.innerHTML,/data-field="familyTrait"/);
 c.change({field:'familyTrait'},'Reflexes');
 const restored=await c.reload(),saved=await restored.data();
 assert.equal(saved.character.family,'Moshibaru');assert.equal(saved.character.familyTrait,'Reflexes');
 assert.equal(saved.derived.traits.Reflexes.base,3);
 restored.change({field:'family'},'Hida');
 assert.equal((await restored.data()).character.familyTrait,'');
 assert.equal((await restored.data()).derived.traits.Reflexes.base,2);
 assert.ok(!restored.root.innerHTML.includes('data-field="familyTrait"'));
 restored.change({field:'family'},'Moshibaru');restored.change({field:'familyTrait'},'Strength');
 restored.change({field:'clan'},'Dragon');assert.equal((await restored.data()).character.familyTrait,'');
});

test('Rolls macro filter covers all six categories at rank zero and preserves trained skills',async()=>{
 const school=catalog.clans.find(c=>c.name==='Crab').schools.find(s=>s.name==='Hida Bushi');
 const trained=['Artisan: Painting','Craft: Carpentry','Games: Go','Lore: History','Perform: Song','Knives'];
 const zero=['Artisan: Origami','Craft: Brewing','Games: Shogi','Lore: Bushido','Perform: Dance','Weapons: Custom'];
 const c=await character({clan:'Crab',family:'Hida',school:`${school.slug}#${school.anchor}`,skills:Object.fromEntries([...trained.map(name=>[name,2]),...zero.map(name=>[name,0])]),skillTraits:{'Weapons: Custom':'Agility','Craft: Brewing':'Intelligence','Craft: Carpentry':'Intelligence'},emphases:{Knives:['Tanto']}},{
  'l5r-rules-character-lab-hide-rank-zero':'false',
  'l5r-rules-character-rolls-hidden-zero-categories':'[]'
 });
 const rows=instance=>instance.root.innerHTML.split('id="creator-rolls"')[1].split('</section>')[0];
 const toggle=(instance,dataset,checked)=>instance.root.onchange({target:{dataset,checked}});
 assert.match(rows(c),/data-hide-zero-skills="true" checked/);
 assert.match(rows(c),/data-hide-zero-macro-skills="true" checked/);
 assert.doesNotMatch(rows(c),/data-hide-zero-category=/);
 const before=(await c.data()).derived;
 toggle(c,{hideZeroSkills:''},false);
 assert.ok(rows(c).includes('data-ring-skill="Courtier"'));
 for(const name of c.window.CharacterCatalog.WEAPON_SKILLS)assert.equal(rows(c).includes(`data-ring-skill="${name}"`),(before.skills[name]?.rank || 0)>0,name);
 for(const name of zero)assert.ok(!rows(c).includes(`data-ring-skill="${name}"`),name);
 for(const name of trained)assert.ok(rows(c).includes(`data-ring-skill="${name}"`),name);
 assert.match(rows(c),/Tanto/);
 toggle(c,{hideZeroMacroSkills:''},false);
 for(const name of [...c.window.CharacterCatalog.WEAPON_SKILLS,...zero])assert.ok(rows(c).includes(`data-ring-skill="${name}"`),name);
 toggle(c,{hideZeroSkills:''},true);
 for(const name of zero)assert.ok(!rows(c).includes(`data-ring-skill="${name}"`),name);
 assert.ok(!rows(c).includes('data-ring-skill="Courtier"'));
 for(const name of trained)assert.ok(rows(c).includes(`data-ring-skill="${name}"`),name);
 toggle(c,{hideZeroSkills:''},false);
 const restored=await c.reload();
 assert.match(rows(restored),/data-hide-zero-skills="true" aria-label="Hide 0 rank skills">Rank 0/);
 assert.match(rows(restored),/data-hide-zero-macro-skills="true" aria-label="Hide macro-skills 0">Macro 0/);
 assert.ok(rows(restored).includes('data-ring-skill="War Fan"'));
 toggle(restored,{hideZeroMacroSkills:''},true);
 assert.ok(!rows(restored).includes('data-ring-skill="War Fan"'));
 assert.ok(rows(restored).includes('data-ring-skill="Knives"'));
 assert.ok(rows(restored).includes('data-ring-skill="Heavy Weapons"'));
 for(const name of zero)assert.ok(!rows(restored).includes(`data-ring-skill="${name}"`),name);
 for(const name of trained)assert.ok(rows(restored).includes(`data-ring-skill="${name}"`),name);
 const after=(await restored.data()).derived;
 for(const key of ['xpRemaining','xpSpent','insight','schoolRank'])assert.equal(after[key],before[key],key);
 assert.deepEqual(after.skills,before.skills);
});

test('combined macro filter migrates old category preferences and prioritizes its saved value',async()=>{
 const oldKey='l5r-rules-character-rolls-hidden-zero-categories-v2',newKey='l5r-rules-character-rolls-hide-zero-macro-skills-v1';
 const all=JSON.stringify(['artisan','games','perform','lore','weapons']);
 for(const [preferences,checked] of [[{},true],[{[oldKey]:all},true],[{[oldKey]:'["weapons"]'},false],[{[oldKey]:'[]'},false],[{[oldKey]:'invalid'},true],[{[oldKey]:all,[newKey]:'false'},false],[{[oldKey]:'[]',[newKey]:'true'},true]]) {
  const c=await character(undefined,preferences);
  const state=instance=>/data-hide-zero-macro-skills="true" checked/.test(sectionHtml(instance,'rolls'));
  assert.equal(state(c),checked,JSON.stringify(preferences));
  assert.equal(state(await c.reload()),checked,'Preference changed on reload');
 }
});

test('the continuous editor adds XP before a school is chosen, persists awards, and permits ranks through 10',async()=>{
  const c=await character();
  c.click({action:'xp-award-step',delta:'500'});
  c.click({action:'award-xp'});
  assert.equal((await c.data()).derived.xpRemaining,540);
  for(let i=0;i<8;i++)c.click({action:'trait',trait:'Strength',delta:'1'});
  const data=await c.data();
  assert.equal(data.derived.traits.Strength.rank,10);
  assert.ok(data.derived.blockers.some(v=>v.code==='rank:trait:Strength'));
  const restored=await c.reload(),saved=await restored.data();
  assert.equal(saved.derived.xpAwards,500);
  assert.equal(saved.derived.traits.Strength.rank,10);
  assert.equal(saved.character.progression.history[0].explanation,'XP added from character editor.');
  restored.click({action:'xp-award-step',delta:'1.5'});
  restored.click({action:'award-xp'});
  assert.equal((await restored.data()).derived.xpAwards,500);
  restored.click({action:'xp-award-step',delta:'-2'});
  assert.equal((await restored.data()).derived.xpAwards,500,'Stepper drafts must not award XP');
  restored.click({action:'award-xp'});
  assert.equal((await restored.data()).derived.xpAwards,498);
  assert.match(restored.root.innerHTML,/<output[^>]*id="xp-award"[^>]*>0<\/output>/);
});

test('catalog emphasis choices charge once, persist, and refund when removed',async()=>{
  const c=await character();
  c.inputs['#new-skill']={value:'Heavy Weapons'};c.click({action:'add-skill'});
  const before=(await c.data()).derived.xpRemaining;
  c.click({action:'add-emphasis',skill:'Heavy Weapons',emphasis:'Tetsubo'});
  c.click({action:'add-emphasis',skill:'Heavy Weapons',emphasis:'Tetsubo'});
  assert.equal((await c.data()).derived.xpRemaining,before-2);
  const restored=await c.reload();
  assert.deepEqual((await restored.data()).derived.skills['Heavy Weapons'].emphases,['Tetsubo']);
  restored.click({action:'remove-emphasis',skill:'Heavy Weapons',index:'0'});
  assert.equal((await restored.data()).derived.xpRemaining,before);
});

test('reducing a skill to zero clears paid and legacy emphases, refunds XP and survives relearning',async()=>{
  const c=await character({skills:{'Heavy Weapons (Tetsubo)':2,Knives:1},emphases:{'Heavy Weapons':['Masakari'],Knives:['Tanto']},legacyEmphases:{'Heavy Weapons':['Dai Tsuchi']}});
  c.root.onchange({target:{dataset:{hideZeroSkills:''},checked:false}});
  c.click({action:'skill',skill:'Heavy Weapons',delta:'-1'});
  let data=await c.data();
  assert.deepEqual(data.derived.skills['Heavy Weapons'].emphases,['Dai Tsuchi','Tetsubo','Masakari']);
  assert.equal(data.derived.xpSpent,6);
  c.click({action:'skill',skill:'Heavy Weapons',delta:'-1'});
  data=await c.data();
  assert.equal(data.character.skills['Heavy Weapons'],undefined);
  assert.equal(data.character.emphases['Heavy Weapons'],undefined);
  assert.equal(data.character.legacyEmphases['Heavy Weapons'],undefined);
  assert.equal(data.derived.xpSpent,3);
  assert.deepEqual(data.derived.skills.Knives.emphases,['Tanto']);
  for(const section of ['rolls','skills'])assert.doesNotMatch(sectionHtml(c,section),/Tetsubo|Masakari|Dai Tsuchi/);
  const restored=await c.reload();
  restored.inputs['#new-skill']={value:'Heavy Weapons'};
  restored.click({action:'add-skill'});
  data=await restored.data();
  assert.deepEqual(data.derived.skills['Heavy Weapons'].emphases,[]);
  assert.equal(data.derived.xpSpent,4);
});

test('trait choices respect fixed catalog traits and specialties, with choices for varying and custom skills',async()=>{
  const c=await character(),options=name=>Array.from(c.window.CharacterCatalog.skillTraitOptions(name,catalog));
  assert.deepEqual(options('Heavy Weapons'),['Agility']);
  assert.deepEqual(options('Sailing'),['Agility','Intelligence']);
  assert.deepEqual(options('Ninjutsu'),['Agility','Reflexes']);
  assert.deepEqual(options('Games: Go'),['Intelligence']);
  assert.deepEqual(options('Perform: Dance'),['Agility']);
  assert.equal(options('Craft: Carpentry').length,9);
  assert.equal(options('Custom skill').length,9);
});

test('paragraph-formatted schools appear in starting and later school picks with their grants', async () => {
  const c = await character(); c.change({field:'clan'},'Mantis');
  assert.match(c.root.innerHTML,/<option value="scmantis#toc6">Yoritomo Bushi · \+1 Strength<\/option>/);
  assert.match(c.root.innerHTML,/<option value="Yoritomo Bushi · basic">/);
  assert.match(c.root.innerHTML,/<option value="scmantis#toc2">Mantis Brawler · \+1 Agility<\/option>/);
  c.school('Mantis','Yoritomo Bushi');
  const {derived:d} = await c.data();
  assert.equal(d.traits.Strength.base,3);
  assert.equal(d.school.honor,3.5);
  for (const name of ['Commerce','Defense','Jiujutsu','Kenjutsu','Knives','Sailing']) assert.equal(d.skills[name].rank,1,name);
  assert.deepEqual(d.skills.Jiujutsu.emphases,['Improvised Weapons']);
  assert.deepEqual(d.skills.Knives.emphases,['Kama']);
  assert.equal(d.school.skillChoices.length,1);
  assert.equal(d.money.koku,10);
  assert.ok(d.equipment.some(entry => entry.name === 'Light Armor'));
  assert.ok(d.equipment.some(entry => entry.name === 'Daisho'));
  assert.deepEqual(d.school.techniques.map(t => t.rank),[1,2,3,4,5]);
  assert.match(d.techniques[0].name,/The Way of the Mantis/);
  assert.equal(d.xpRemaining,40);
  assert.equal((await (await c.reload()).data()).derived.school.name,'Yoritomo Bushi');
  c.change({field:'clan'},'Dragon');
  assert.match(c.root.innerHTML,/<option value="scdragon#toc7">The Hitomi Kikage Zumi Order · \+1 Reflexes<\/option>/);
  c.change({field:'clan'},'Firefly');
  assert.match(c.root.innerHTML,/<option value="sclost#toc14">Hotaru Bushi School · \+1 Awareness<\/option>/);
});

test('school skill ranks, emphases, trait, honor, outfit and training are free grants', async () => {
  const c = await character(); c.school('Crab','Hida Pragmatist');
  const {derived:d} = await c.data();
  assert.equal(d.skills.Jiujutsu.rank,2);
  assert.deepEqual(d.skills.Jiujutsu.emphases,['Improvised Weapons']);
  assert.equal(d.traits.Agility.rank,3);
  assert.equal(d.school.honor,2.5);
  assert.equal(d.xpRemaining,40);
  assert.equal(d.money.koku,3);
  assert.ok(d.equipment.some(entry => entry.name === 'Daisho'));
  assert.match(d.techniques[0].name,/Eternal Stone/);
  assert.doesNotMatch(c.root.innerHTML,/School rank \d+ · Free/);
});

test('skill upgrades cost only ranks above the school grant and cannot remove it', async () => {
  const c = await character(); c.school('Crab','Hida Pragmatist');
  c.click({action:'skill',skill:'Jiujutsu',delta:'1'});
  assert.equal((await c.data()).derived.xpRemaining,37);
  c.click({action:'skill',skill:'Jiujutsu',delta:'-1'});
  c.click({action:'skill',skill:'Jiujutsu',delta:'-1'});
  assert.equal((await c.data()).derived.skills.Jiujutsu.rank,2);
  assert.equal((await c.data()).derived.xpRemaining,40);
});

test('chosen craft skill receives two free ranks; invalid categories and duplicates do not grant ranks', async () => {
  const c = await character(); c.school('Oriole','Oriole Clan - Tsi Smith');
  c.change({choiceIndex:'1'},'Craft: Weaponsmithing');
  let d = (await c.data()).derived;
  assert.equal(d.skills['Craft: Weaponsmithing'].base,2);
  assert.equal(d.xpRemaining,40);
  c.change({choiceIndex:'0'},'Defense');
  c.change({choiceIndex:'2'},'Courtier');
  assert.equal(Object.keys((await c.data()).derived.skillChoiceErrors).length,2);
  c.change({choiceIndex:'2'},'Kenjutsu');
  c.change({choiceIndex:'3'},'Kenjutsu');
  d = (await c.data()).derived;
  assert.match(d.skillChoiceErrors[3],/already grants/);
  assert.equal(d.skills.Kenjutsu.rank,1);
  c.change({choiceIndex:'2'},'Kenjutsu (Katana)');
  assert.match((await c.data()).derived.skillChoiceErrors[2],/extra emphases/);
  assert.match(c.root.innerHTML,/id="school-choice-2"/);
});

test('multi-skill and emphasis choices keep their correct counts', async () => {
  const c = await character(); c.school('Crane','Kakita Artisan');
  assert.equal((await c.data()).derived.school.skillChoices.length,3);
  c.change({choiceIndex:'0'},'Acting');
  c.change({choiceIndex:'1'},'Artisan: Painting');
  assert.match(c.root.innerHTML,/id="school-choice-2"/);
  c.change({choiceIndex:'2'},'Perform: Song');
  assert.doesNotMatch(c.root.innerHTML,/id="school-choice-\d/);
  assert.equal(Object.keys((await c.data()).derived.skills).length,7);
  const restored = await c.reload();
  assert.doesNotMatch(restored.root.innerHTML,/id="school-choice-\d/);
  assert.equal((await restored.data()).derived.skills['Perform: Song'].base,1);
  c.school('Crab','Kaiu Engineer');
  assert.match(c.root.innerHTML,/id="school-choice-0"/);
  c.change({choiceIndex:'0'},'Siege');
  assert.doesNotMatch(c.root.innerHTML,/id="school-choice-\d/);
  assert.deepEqual((await c.data()).derived.skills.Engineering.emphases,['Siege']);
  assert.equal((await c.data()).derived.xpRemaining,40);
});

test('changing school replaces grants and choices while preserving personal equipment, skills and notes', async () => {
  const c = await character(); c.school('Crab','Hida Bushi');
  c.change({equipmentChoice:'0'},'Heavy Armor');
  c.inputs['#new-equipment'] = {value:'Jade finger'}; c.click({action:'add-equipment'});
  c.inputs['#new-skill'] = {value:'Medicine'}; c.click({action:'add-skill'});
  c.change({field:'school'},'sccrab#toc6');
  const {character:s,derived:d} = await c.data();
  assert.equal(d.skills['Heavy Weapons'],undefined);
  assert.equal(d.skills['Lore: Shadowlands'].rank,2);
  assert.equal(d.skills.Medicine.rank,1);
  assert.deepEqual(s.equipmentChoices,[]);
  assert.ok(d.equipment.some(entry => entry.name === 'Jade finger'));
  assert.ok(!d.equipment.some(entry => entry.name === 'Heavy Armor'));
  assert.equal(d.xpRemaining,39);
  assert.match(d.school.spells,/Sense/);
  assert.ok(d.school.affinity);
});

test('saved legacy ranks merge with canonical school skill names and survive reload', async () => {
  const c = await character({clan:'Crab',school:'sccrab#toc1',skills:{'Heavy Weapons (Tetsubo)':2},notes:'My heritage'});
  let d = (await c.data()).derived;
  assert.equal(d.skills['Heavy Weapons'].rank,2);
  assert.equal(d.skills['Heavy Weapons (Tetsubo)'],undefined);
  assert.equal(d.xpRemaining,38);
  c.change({equipmentChoice:'0'},'Light Armor');
  const loaded = await c.reload(); d = (await loaded.data()).derived;
  assert.equal(d.skills['Heavy Weapons'].rank,2);
  assert.equal(d.equipment[0].name,'Light Armor');
  assert.equal((await loaded.data()).character.journal[0].text,'My heritage');
  assert.match(loaded.root.innerHTML,/print-second-page/);
  assert.match(loaded.root.innerHTML,/The Way of the Crab/);
});

test('every catalog school has canonical skill grants; malformed wiki labels are recovered', () => {
  const known = new Set(catalog.skills.map(skill => skill.name));
  for (const clan of catalog.clans) for (const school of clan.schools) {
    assert.ok(school.skills.length, school.name);
    for (const skill of school.skills) assert.ok(known.has(skill.name.split(':')[0]), `${school.name}: ${skill.name}`);
  }
  const soshi = catalog.clans.find(c => c.name === 'Scorpion').schools.find(s => s.name === 'Soshi Magistrate');
  assert.equal(soshi.honor,2.5);
  assert.equal(soshi.skills.length,6);
  const ogre = catalog.clans.find(c => c.name === 'Spider').schools.find(s => s.name === 'Free Ogre Bushi');
  assert.equal(ogre.skills.length,7);
  assert.equal(ogre.skillChoices.length,0);
  assert.match(ogre.skills.find(s => s.name === 'Heavy Weapons').notes,/ogres treat/);
});

test('Reflexes changes update skill dice, initiative and base Armor TN in screen, print and export', async () => {
  const c = await character(); c.school('Crab','Hida Bushi');
  let d = (await c.data()).derived;
  assert.equal(d.skills.Defense.roll.notation,'3k2');
  assert.equal(d.combat.initiative.notation,'3k2');
  assert.equal(d.combat.baseArmorTN,15);
  c.click({action:'trait',trait:'Reflexes',delta:'1'});
  d = (await c.data()).derived;
  assert.equal(d.skills.Defense.rank,1);
  assert.equal(d.skills.Defense.traitRank,3);
  assert.equal(d.skills.Defense.roll.notation,'4k3');
  assert.equal(d.combat.initiative.notation,'4k3');
  assert.equal(d.combat.baseArmorTN,20);
  assert.match(c.root.innerHTML, /Base TN \(before bonuses\)<\/span><strong>20/);
  assert.match(c.root.innerHTML, /<span title="Reflexes">Ref<\/span><span>4k3<\/span>/);
  c.click({action:'trait',trait:'Reflexes',delta:'-1'});
  d = (await c.data()).derived;
  assert.equal(d.skills.Defense.roll.notation,'3k2');
  assert.equal(d.combat.initiative.notation,'3k2');
  assert.equal(d.combat.baseArmorTN,15);
});

test('Earth uses its lower trait and wound totals, healing, Strength and Void recalculate', async () => {
  const c = await character();
  c.click({action:'trait',trait:'Stamina',delta:'1'});
  let d = (await c.data()).derived;
  assert.equal(d.rings.Earth,2);
  assert.equal(d.combat.wounds.maximum,38);
  assert.equal(d.combat.healing,7);
  c.click({action:'trait',trait:'Willpower',delta:'1'});
  d = (await c.data()).derived;
  assert.equal(d.rings.Earth,3);
  assert.deepEqual(d.combat.wounds.levels.map(level => level.total),[15,21,27,33,39,45,51,57]);
  assert.equal(d.combat.wounds.healthy,15);
  assert.equal(d.combat.wounds.maximum,57);
  c.click({action:'trait',trait:'Stamina',delta:'-1'});
  assert.equal((await c.data()).derived.combat.wounds.maximum,38);
  assert.equal((await c.data()).derived.combat.healing,5);
  c.click({action:'trait',trait:'Strength',delta:'1'});
  assert.equal((await c.data()).derived.combat.unarmedDamage.notation,'3k1');
  c.click({action:'trait',trait:'Void',delta:'1'});
  assert.equal((await c.data()).derived.combat.voidPoints,3);
});

test('skill trait overrides persist and follow trait, skill rank and family changes', async () => {
  const c = await character(); c.school('Crab','Hida Bushi');
  c.change({skillTrait:'Athletics'},'Agility');
  c.click({action:'trait',trait:'Agility',delta:'1'});
  assert.equal((await c.data()).derived.skills.Athletics.roll.notation,'4k3');
  c.click({action:'skill',skill:'Athletics',delta:'1'});
  assert.equal((await c.data()).derived.skills.Athletics.roll.notation,'5k3');
  const loaded = await c.reload();
  assert.equal((await loaded.data()).derived.skills.Athletics.roll.notation,'5k3');
  c.change({skillTrait:'Athletics'},'');
  c.change({field:'family'},'Hida');
  assert.equal((await c.data()).derived.skills.Athletics.trait,'Strength');
  assert.equal((await c.data()).derived.skills.Athletics.roll.notation,'5k3');
});

test('macro skills use specialty traits, varying skills ask for a trait and custom skills can set one', async () => {
  const c = await character(); c.school('Crane','Kakita Artisan');
  c.change({choiceIndex:'0'},'Perform: Dance');
  c.change({choiceIndex:'1'},'Perform: Song');
  let d = (await c.data()).derived;
  assert.equal(d.skills['Games: Sadane'].trait,'Awareness');
  assert.equal(d.skills['Perform: Dance'].trait,'Agility');
  assert.equal(d.skills['Perform: Song'].trait,'Awareness');
  c.inputs['#new-skill'] = {value:'Craft: Carpentry'}; c.click({action:'add-skill'});
  assert.equal((await c.data()).derived.skills['Craft: Carpentry'].roll,null);
  c.change({skillTrait:'Craft: Carpentry'},'Intelligence');
  assert.equal((await c.data()).derived.skills['Craft: Carpentry'].roll.notation,'3k2');
  c.inputs['#new-skill'] = {value:'Custom skill'}; c.click({action:'add-skill'});
  c.change({skillTrait:'Custom skill'},'Perception');
  assert.equal((await c.data()).derived.skills['Custom skill'].roll.notation,'3k2');
});

test('macro-skills require a nonempty subtype while ordinary and custom skills remain valid',async()=>{
  const c=await character();
  for(const name of ['Artisan','Craft','Games','Lore','Perform','Weapons','lore: ','Games :']) {
    c.inputs['#new-skill']={value:name};c.click({action:'add-skill'});
    assert.deepEqual((await c.data()).character.skills,{});
    assert.match(c.root.innerHTML,/aria-label="Choose [^"]+ subskill"/);
    assert.match(c.root.innerHTML,/creator-subskill-dialog/);
    c.click({action:'close-subskills'});
  }
  const suggestions=c.root.innerHTML.match(/<select[^>]*id="skill-choice"[^>]*>([\s\S]*?)<\/select>/)[1];
  for(const name of ['Artisan','Craft','Games','Lore','Perform','Weapons'])assert.ok(!suggestions.includes(`value="${name}"`),name);
  for(const name of ['Lore: History','Games: Go','Artisan: Custom art','Craft: Custom craft','Perform: Custom performance','Courtier','Custom skill','Games (Shogi)','Weapons (Crossbow)']) {
    c.inputs['#new-skill']={value:name};c.click({action:'add-skill'});
  }
  const d=(await c.data()).derived;
  for(const name of ['Lore: History','Games: Go','Artisan: Custom art','Craft: Custom craft','Perform: Custom performance','Courtier','Custom skill','Games: Shogi','Weapons: Crossbow'])assert.equal(d.skills[name].rank,1,name);
  const legacy=await character({skills:{Lore:2}});
  assert.match(sectionHtml(legacy,'skills'),/Lore requires a subtype/);
});

test('section 03 lists every skill without charging XP and rank zero controls can purchase a rank',async()=>{
  const c=await character(),html=sectionHtml(c,'skills');
  assert.match(html,/creator-skill-grid/);
  for(const skill of catalog.skills)assert.ok(html.includes(`data-skill-name="${skill.name}"`),skill.name);
  let data=await c.data();
  assert.deepEqual(data.character.skills,{});assert.equal(data.derived.xpSpent,0);
  c.click({action:'skill',skill:'Courtier',delta:'1'});
  data=await c.data();assert.equal(data.derived.skills.Courtier.rank,1);assert.equal(data.derived.xpSpent,1);
  c.click({action:'skill',skill:'Courtier',delta:'-1'});
  data=await c.data();assert.equal(data.derived.xpSpent,0);
  assert.ok(sectionHtml(c,'skills').includes('data-skill-name="Courtier"'));
});

test('macro skill popup buys separate catalog and custom subskills, avoids duplicates, and persists them',async()=>{
  const c=await character();
  c.click({action:'open-subskills',skill:'Lore'});
  assert.match(c.root.innerHTML,/data-skill="Lore: History"/);
  c.click({action:'choose-subskill',skill:'Lore: History'});
  assert.doesNotMatch(c.root.innerHTML,/creator-subskill-dialog/);
  c.click({action:'open-subskills',skill:'Lore'});
  assert.match(c.root.innerHTML,/data-skill="Lore: History" disabled/);
  c.inputs['#custom-subskill']={value:'Local legends'};
  c.click({action:'choose-subskill'});
  c.click({action:'open-subskills',skill:'Lore'});
  c.inputs['#custom-subskill']={value:'  '};c.click({action:'choose-subskill'});
  assert.match(c.root.innerHTML,/creator-subskill-dialog/);
  c.inputs['#custom-subskill']={value:'History'};c.click({action:'choose-subskill'});
  const data=await c.data();
  assert.deepEqual(data.character.skills,{'Lore: History':1,'Lore: Local legends':1});
  assert.equal(data.derived.xpSpent,2);
  assert.equal((await (await c.reload()).data()).derived.skills['Lore: Local legends'].rank,1);
});

test('section 03 filters independently hide rank zero and macro skills, retain trained skills, and persist',async()=>{
  const c=await character({skills:{Courtier:2,'Lore: History':1,Kenjutsu:1}});
  const before=await c.data(),rolls=sectionHtml(c,'rolls');
  const rows=()=>sectionHtml(c,'skills');
  const has=name=>rows().includes(`data-skill-name="${name}"`);
  const toggle=(macro,checked)=>c.root.onchange({target:{dataset:{skillFilterView:'skills',[macro?'hideZeroMacroSkills':'hideZeroSkills']:''},checked}});
  assert.match(rows(),/data-hide-zero-skills="true" aria-label="Hide 0 rank skills">Rank 0/);
  assert.match(rows(),/data-hide-zero-macro-skills="true" aria-label="Hide macro-skills 0">Macro 0/);
  for(const [hideZero,hideMacro] of [[false,true],[true,false],[true,true],[false,false]]) {
    toggle(false,hideZero);toggle(true,hideMacro);
    for(const name of ['Courtier','Lore: History','Kenjutsu'])assert.ok(has(name),name);
    assert.equal(has('Defense'),!hideZero);
    for(const name of ['Lore','Craft','Weapons','Heavy Weapons'])assert.equal(has(name),!hideZero&&!hideMacro,name);
    assert.equal(sectionHtml(c,'rolls'),rolls);
  }
  toggle(false,true);toggle(true,true);
  const reloaded=await c.reload();
  assert.match(sectionHtml(reloaded,'skills'),/data-hide-zero-skills="true" checked/);
  assert.match(sectionHtml(reloaded,'skills'),/data-hide-zero-macro-skills="true" checked/);
  assert.deepEqual((await reloaded.data()).character,before.character);
  assert.deepEqual((await reloaded.data()).derived,before.derived);
  const empty=await character();
  empty.root.onchange({target:{dataset:{skillFilterView:'skills',hideZeroSkills:''},checked:true}});
  assert.match(sectionHtml(empty,'skills'),/Choose a school or add a skill to begin/);
});

test('both sets of skill filter checkboxes keep keyboard focus after re-rendering',async()=>{
  const c=await character();
  let focused='';
  for(const view of ['rolls','skills'])for(const [kind,attr] of [['zero','hideZeroSkills'],['macro','hideZeroMacroSkills']]){
    c.inputs[`#creator-${view} [data-hide-zero-${kind==='macro'?'macro-skills':'skills'}]`]={focus(){focused=`${view}-${kind}`;}};
    c.root.onchange({target:{dataset:{skillFilterView:view,[attr]:''},checked:true}});
    assert.equal(focused,`${view}-${kind}`);
  }
});

test('skill rank steppers keep keyboard focus, even when the filters remove the changed row',async()=>{
  const c=await character({skills:{Defense:1}});
  let focused='';
  const target=(name,attrs={})=>({...attrs,focus(){focused=name;}});
  const step=delta=>`#creator-skills [data-action="skill"][data-skill="Defense"][data-delta="${delta}"]`;
  c.inputs[step('1')]=target('increase');
  c.click({action:'skill',skill:'Defense',delta:'1'});
  assert.equal(focused,'increase');
  c.root.onchange({target:{dataset:{skillFilterView:'skills',hideZeroSkills:''},checked:true}});
  delete c.inputs[step('1')];
  c.inputs['#creator-skills [data-hide-zero-skills]']=target('filter');
  c.click({action:'skill',skill:'Defense',delta:'-1'});
  c.click({action:'skill',skill:'Defense',delta:'-1'});
  assert.equal((await c.data()).derived.skills.Defense,undefined);
  assert.equal(focused,'filter');
});

test('a character picture is added, kept across reloads, removed, and cleared by an Identity reset',async()=>{
  const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYwPRVdM7zQAAAABJRU5ErkJggg==';
  const c=await character({name:'Ren'});
  assert.match(sectionHtml(c,'identity'),/Add picture/);
  c.window.UI.readPortrait=async()=>picture;
  await c.root.onchange({target:{dataset:{portrait:''},files:[{type:'image/png'}]}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await c.data()).character.portrait,picture);
  const reloaded=await c.reload();
  assert.match(sectionHtml(reloaded,'identity'),/<img class="ui-portrait-image" src="data:image\/png;base64,/);
  // Cancelling the cropper keeps the current picture.
  reloaded.window.UI.readPortrait=async()=>null;
  const input={dataset:{portrait:''},files:[{type:'image/png'}],value:'C:\\fakepath\\a.png'};
  await reloaded.root.onchange({target:input});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await reloaded.data()).character.portrait,picture);
  assert.equal(input.value,'','the file input is cleared so the same file can be chosen again');
  // The characters list carries the picture so it can be shown before the name.
  assert.equal(reloaded.window.CharacterBuilder.list()[0].portrait,picture);
  reloaded.click({action:'remove-portrait'});
  assert.equal((await reloaded.data()).character.portrait,'');
  assert.equal(reloaded.window.CharacterBuilder.list()[0].portrait,'');
  c.window.UI.readPortrait=async()=>{throw new Error('Choose an image file.');};
  await c.root.onchange({target:{dataset:{portrait:''},files:[{type:'text/plain'}]}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(c.root.innerHTML,/Choose an image file\./);
});

test('Create picture hands the sheet to the portrait creator and saves its picture and choices back',async()=>{
  const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYwPRVdM7zQAAAABJRU5ErkJggg==';
  const c=await character({name:'Hida Kenta',clan:'Crab',portraitRecipe:{gender:'male',layers:{hair:'topknot'}}});
  assert.match(sectionHtml(c,'identity'),/data-action="create-portrait"/);
  let request;
  c.window.PortraitCreator={open:next=>{request=next;}};
  c.click({action:'create-portrait'});
  assert.equal(request.title,'Hida Kenta');assert.equal(request.clan,'Crab');assert.match(request.returnHref,/^#\/characters\/hida-kenta-[\w-]{4,}$/);
  assert.equal(request.recipe.layers.hair,'topknot');
  request.onUse(picture,{gender:'female',age:'young',body:'slim',layers:{hair:'bun'},mon:true});
  const saved=(await c.data()).character;
  assert.equal(saved.portrait,picture);assert.equal(saved.portraitRecipe.gender,'female');
  assert.equal(c.window.CharacterBuilder.setPortrait('missing',picture),false);
  assert.equal(c.window.CharacterBuilder.setPortrait(c.window.CharacterBuilder.list()[0].id,'javascript:alert(1)'),false);
  c.click({action:'remove-portrait'});
  assert.equal((await c.data()).character.portraitRecipe,null);
});

test('Public checkboxes and the journal save to the sheet; entries start private',async()=>{
  const c=await character({name:'Ren',advantages:[{name:'Fame',cost:3}],disadvantages:[{name:'Dark Secret',cost:4}]});
  const html=()=>c.root.innerHTML;
  assert.match(html(),/data-public-stat="glory"/);assert.match(html(),/data-option-public="advantage"/);
  c.root.onchange({target:{dataset:{publicStat:'glory'},checked:true}});
  c.root.onchange({target:{dataset:{optionPublic:'advantage',index:'0'},checked:true}});
  c.click({action:'journal-new'});
  assert.match(html(),/data-journal-text/);
  c.root.oninput({target:{dataset:{journalText:''},value:'We reached Kyuden Doji.'}});
  c.click({action:'journal-save'});
  let sheet=(await c.data()).character;
  assert.equal(sheet.publicStats.glory,true);assert.equal(sheet.publicStats.taint,false);
  assert.equal(sheet.advantages[0].public,true);assert.equal(sheet.disadvantages[0].public,false);
  assert.equal(sheet.journal.length,1);assert.equal(sheet.journal[0].text,'We reached Kyuden Doji.');assert.equal(sheet.journal[0].public,false);
  const id=sheet.journal[0].id;
  c.root.onchange({target:{dataset:{journalPublic:id},checked:true}});
  c.click({action:'journal-edit',id});
  c.root.oninput({target:{dataset:{journalText:''},value:'Edited entry'}});
  c.click({action:'journal-save'});
  sheet=(await c.data()).character;
  assert.equal(sheet.journal.length,1);assert.equal(sheet.journal[0].text,'Edited entry');assert.equal(sheet.journal[0].public,true);
  c.window.confirm=()=>true;c.click({action:'journal-delete',id});
  assert.equal((await c.data()).character.journal.length,0);
  assert.doesNotMatch(html(),/creator-journal-entry/);
});

test('View public previews exactly the shared profile from the sheet as it is now',async()=>{
  const c=await character({name:'Doji Ren',clan:'Crane',advantages:[{name:'Fame',cost:3,public:true},{name:'Allies',cost:2}],publicStats:{glory:true},journal:[{id:'a',text:'Public news',createdAt:'2026-11-02T10:00:00Z',public:true},{id:'b',text:'SECRET PLAN',createdAt:'2026-11-03T10:00:00Z',public:false}]});
  c.context.PublicCharacter=undefined;
  for(const file of ['sheet-sharing.js','character-public.js'])require('node:vm').runInContext(fs.readFileSync(path.join(rootDir,file),'utf8'),c.context);
  assert.match(c.root.innerHTML,/data-action="preview-public"/);
  c.click({action:'preview-public'});
  const html=c.root.innerHTML;
  assert.match(html,/creator-public-preview/);assert.match(html,/Doji Ren/);assert.match(html,/Fame/);assert.match(html,/Public news/);assert.match(html,/Glory/);
  for(const secret of ['SECRET PLAN','Allies'])assert.ok(!html.slice(html.indexOf('creator-public-preview')).includes(secret),secret);
  assert.match(html,/Sign in to share it with a link/);
  c.click({action:'close-public-preview'});
  assert.doesNotMatch(c.root.innerHTML,/creator-public-preview"/);
});

test('the GM sees the player\'s journal read-only and adds, edits and deletes only their own entries',async()=>{
  const c=await character();
  let receive,writes=[];
  c.window.SheetJournal={watch:(owner,id,options,callback)=>{assert.equal(owner,'alice');assert.equal(id,'pc');receive=callback;return()=>{};},write:async(owner,id,entryId,data)=>{writes.push([entryId,data]);},user:{uid:'gm',name:'Game Master'}};
  let html='';const root={isConnected:true,querySelector:()=>null,get innerHTML(){return html;},set innerHTML(value){html=value;}};
  await c.window.CharacterBuilder.mount(root,{sheet:{name:'Alice PC',journal:[{id:'p',text:'Player entry',createdAt:'2026-11-01',public:false}]},readOnly:true,journal:{owner:'alice',characterId:'pc'},save(){},close(){}});
  receive([{id:'g',authorUid:'gm',authorName:'Game Master',text:'GM entry',public:false,createdAt:'2026-11-02',updatedAt:'2026-11-02'},{id:'o',authorUid:'other',authorName:'Other',text:'Other GM',public:true,createdAt:'2026-11-03'}]);
  // The fake root has no journal panel to patch in place, so re-render through Cancel.
  root.onclick({target:{closest:()=>({dataset:{action:'journal-cancel',journalGm:''}})}});
  assert.match(html,/Player entry/);assert.match(html,/GM entry/);
  assert.ok(html.indexOf('Player entry')<html.indexOf('GM entry'),'oldest first, 1..n');
  // Only the GM's own entry has controls; the player's entry and another author's do not.
  const controls=[...html.matchAll(/data-action="journal-(edit|delete)" data-id="([^"]+)"/g)].map(m=>m[2]);
  assert.deepEqual([...new Set(controls)],['g']);
  root.onclick({target:{closest:()=>({dataset:{action:'journal-new',journalGm:''}})}});
  root.oninput({target:{dataset:{journalText:'',journalGm:''},value:'New GM note'}});
  root.onclick({target:{closest:()=>({dataset:{action:'journal-save',journalGm:''}})}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,1);assert.equal(writes[0][1].authorUid,'gm');assert.equal(writes[0][1].text,'New GM note');assert.equal(writes[0][1].public,false);
  c.window.confirm=()=>true;
  root.onclick({target:{closest:()=>({dataset:{action:'journal-delete',id:'g',journalSource:'gm',journalGm:''}})}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(writes[1],['g',null]);
});

test('a school macro-skill grants a chosen subtype rather than a bare skill or emphasis',async()=>{
  const c=await character();c.school('Peacock','New Basic School: Kujaku Bushi School');
  let d=(await c.data()).derived;
  assert.equal(d.skills.Perform,undefined);
  assert.match(c.root.innerHTML,/Choose a Perform subtype/);
  c.change({choiceIndex:'0'},'Courtier');
  assert.match((await c.data()).derived.skillChoiceErrors[0],/matches this school option/);
  c.change({choiceIndex:'0'},'Perform: Song');
  d=(await c.data()).derived;
  assert.equal(d.skills['Perform: Song'].base,1);
  assert.deepEqual(d.skills['Perform: Song'].emphases,[]);
  assert.equal(d.xpSpent,0);
  const saved=(await c.data()).character;
  saved.schoolChoices=['Song'];
  const legacy=await character(saved);
  assert.equal((await legacy.data()).derived.skills['Perform: Song'].base,1);
});

test('all listed macro specialties appear in skill suggestions and eligible school choices',async()=>{
  const c=await character();c.school('Crane','Kakita Artisan');
  const suggestions=c.root.innerHTML.match(/<select[^>]*id="skill-choice"[^>]*>([\s\S]*?)<\/select>/)[1];
  const schoolSuggestions=c.root.innerHTML.match(/<select[^>]*id="school-choice-0"[^>]*>([\s\S]*?)<\/select>/)[1];
  for(const [name,count] of [['Artisan',8],['Craft',18],['Games',6],['Lore',19],['Perform',9]]) {
    const skill=catalog.skills.find(s=>s.name===name);
    assert.equal(skill.specialties.length,count,name);
    for(const specialty of skill.specialties) {
      const value=`${name}: ${specialty}`.replaceAll('&','&amp;');
      assert.ok(suggestions.includes(`value="${value}"`),value);
      if(['Artisan','Perform'].includes(name))assert.ok(schoolSuggestions.includes(`value="${value}"`),value);
    }
  }
  c.inputs['#new-skill']={value:'Artisan: Origami'};c.click({action:'add-skill'});
  c.inputs['#new-skill']={value:'Lore: Bushido'};c.click({action:'add-skill'});
  c.inputs['#new-skill']={value:'Perform: Biwa'};c.click({action:'add-skill'});
  c.inputs['#new-skill']={value:'Games: Shogi'};c.click({action:'add-skill'});
  const d=(await c.data()).derived;
  for(const [name,trait] of [['Artisan: Origami','Awareness'],['Lore: Bushido','Intelligence'],['Perform: Biwa','Agility'],['Games: Shogi','Intelligence']])assert.equal(d.skills[name].trait,trait,name);
});

test('Insight Rank changes propagate to initiative and healing', async () => {
  const c = await character({traitBuys:{Stamina:1,Willpower:1,Reflexes:1,Awareness:1,Strength:1,Perception:1,Agility:1,Intelligence:1,Void:1}});
  let d = (await c.data()).derived;
  assert.equal(d.insightRank,2);
  assert.equal(d.combat.initiative.notation,'5k3');
  assert.equal(d.combat.healing,8);
  c.click({action:'trait',trait:'Awareness',delta:'-1'});
  d = (await c.data()).derived;
  assert.equal(d.insightRank,1);
  assert.equal(d.combat.initiative.notation,'4k3');
  assert.equal(d.combat.healing,7);
});

function sectionHtml(c,key) {
  return c.root.innerHTML.match(new RegExp(`<section[^>]*id="creator-${key}"[\\s\\S]*?</section>`))?.[0] || '';
}

test('required art and spell choices appear visibly in their own sections',async()=>{
  const c=await character();
  c.school('Crane','Kakita Artisan');
  assert.match(sectionHtml(c,'skills'),/data-school-decision="chosenArt"/);
  assert.match(sectionHtml(c,'skills'),/Select one granted art/);
  assert.doesNotMatch(sectionHtml(c,'identity'),/data-school-decision="chosenArt"|Select one granted art/);
  assert.doesNotMatch(c.root.innerHTML,/Rules &amp; table exceptions|Rules & table exceptions|creator-exceptions|Record exception/);
  ['Acting','Artisan: Painting','Perform: Song'].forEach((value,index)=>c.change({choiceIndex:String(index)},value));
  c.change({schoolDecision:'chosenArt'},'Acting');
  assert.doesNotMatch(sectionHtml(c,'skills'),/Select one granted art/);
  c.school('Phoenix','Isawa Shugenja');
  const abilities=sectionHtml(c,'abilities');
  assert.match(abilities,/data-school-decision="affinity"/);
  for(let i=1;i<=4;i++)assert.match(abilities,new RegExp(`data-school-decision="spellElement${i}"`));
  assert.match(abilities,/Select four distinct starting spell elements/);
  assert.doesNotMatch(abilities,/data-school-decision="deficiency"|data-school-decision="secondDeficiency"/);
  assert.doesNotMatch(sectionHtml(c,'identity'),/data-school-decision="affinity"|Select four distinct/);
  c.change({schoolDecision:'affinity'},'Fire');
  ['Air','Earth','Fire','Water'].forEach((value,index)=>c.change({schoolDecision:'spellElement'+(index+1)},value));
  assert.doesNotMatch(sectionHtml(c,'abilities'),/Select four distinct starting spell elements|Choose the school’s elemental affinity/);
});

test('fixed-affinity schools show only the choices they actually need',async()=>{
  const c=await character();c.school('Crab','Kuni Shugenja');
  assert.doesNotMatch(sectionHtml(c,'abilities'),/data-school-decision="affinity"|data-school-decision="deficiency"|data-school-decision="spellElement/);
  assert.match(sectionHtml(c,'abilities'),/starting .* spells/);
});

test('advantage and disadvantage cost steppers use displayed costs and persist XP changes',async()=>{
  const c=await character();c.school('Crab','Hida Bushi');
  c.inputs['#advantage-select']={value:'Large'};c.click({action:'add-advantage'});
  assert.equal((await c.data()).derived.advantages[0].cost,3);
  assert.match(sectionHtml(c,'options'),/<output[^>]*aria-label="Large point cost">3<\/output>/);
  c.click({action:'option-cost',kind:'advantage',index:'0',delta:'1'});
  assert.equal((await c.data()).derived.advantages[0].cost,4);
  c.click({action:'option-cost',kind:'advantage',index:'0',delta:'-1'});
  assert.equal((await c.data()).derived.advantages[0].cost,3);
  c.inputs['#disadvantage-select']={value:'Doubt'};c.click({action:'add-disadvantage'});
  const before=(await c.data()).derived;
  c.click({action:'option-cost',kind:'disadvantage',index:'0',delta:'1'});
  const after=(await c.data()).derived;
  assert.equal(after.disadvantages[0].cost,before.disadvantages[0].cost+1);
  assert.equal(after.xpRemaining,before.xpRemaining+1);
  const loaded=await c.reload();assert.equal((await loaded.data()).derived.disadvantages[0].cost,after.disadvantages[0].cost);
  for(let i=0;i<40;i++)c.click({action:'option-cost',kind:'advantage',index:'0',delta:'-1'});
  assert.equal((await c.data()).derived.advantages[0].cost,0);
  for(let i=0;i<40;i++)c.click({action:'option-cost',kind:'advantage',index:'0',delta:'1'});
  assert.equal((await c.data()).derived.advantages[0].cost,40);
});

test('old advancement sheets allow ordinary option edits and removal without approval or buyoff',async()=>{
  const c=await character({phase:'advancement',advantages:[{id:'large',name:'Large',baseCost:4,cost:4}]});
  c.window.prompt=()=>{throw new Error('A justification prompt must not appear');};
  c.click({action:'option-cost',kind:'advantage',index:'0',delta:'1'});
  const {character:s,derived:d}=await c.data();
  assert.equal(d.advantages[0].cost,5);
  assert.equal(s.phase,undefined);assert.equal(s.progression.history.length,0);
  c.inputs['#advantage-select']={value:'Luck'};c.click({action:'add-advantage'});
  c.change({optionDetail:'advantage',index:'1'},'1');
  assert.equal((await c.data()).character.advantages[1].selection,'1');
  assert.ok(!(await c.data()).derived.blockers.some(e=>e.code.startsWith('advancement:advantage:')));
  c.click({action:'remove-advantage',index:'1'});
  c.inputs['#disadvantage-select']={value:'Brash'};c.click({action:'add-disadvantage'});
  c.click({action:'option-cost',kind:'disadvantage',index:'0',delta:'1'});
  assert.equal((await c.data()).derived.disadvantages[0].cost,4);
  assert.ok(!c.root.innerHTML.includes('buyoff-disadvantage'));
  c.click({action:'remove-disadvantage',index:'0'});
  const saved=await (await c.reload()).data();
  assert.equal(saved.character.advantages.length,1);
  assert.equal(saved.derived.advantages[0].cost,5);
  assert.equal(saved.character.disadvantages.length,0);
  assert.equal(saved.character.progression.history.length,0);
});

test('Social Position updates displayed and printed Status, persists, and permits manual adjustments',async()=>{
  const c=await character();
  c.inputs['#advantage-select']={value:'Social Position'};
  c.click({action:'add-advantage'});
  assert.equal((await c.data()).derived.status,2);
  assert.match(c.root.innerHTML,/<output[^>]*aria-label="Status"[^>]*>2\.0<\/output>/);
  assert.match(c.root.innerHTML,/<div>Status<b>2<\/b>/);
  c.click({action:'number-step',field:'status',delta:'1'});
  c.click({action:'number-step',field:'status',delta:'1'});
  assert.equal((await c.data()).derived.status,2.2);
  c.click({action:'number-step',field:'status',delta:'-1'});
  const restored=await c.reload();
  assert.equal((await restored.data()).derived.status,2.1);
  assert.equal((await restored.data()).character.status,1.1);
  restored.click({action:'remove-advantage',index:'0'});
  assert.equal((await restored.data()).derived.status,1.1);
});

test('numeric steppers preserve decimal precision, bounds and saved values',async()=>{
  const c=await character();c.school('Crab','Hida Bushi');
  const initial=(await c.data()).derived.honor;
  c.click({action:'number-step',field:'honor',delta:'1'});
  assert.equal((await c.data()).derived.honor,Number((initial+0.1).toFixed(1)));
  c.click({action:'number-step',field:'honor',delta:'-1'});
  assert.equal((await c.data()).derived.honor,initial);
  c.click({action:'number-step',field:'woundsTaken',delta:'-1'});
  assert.equal((await c.data()).character.woundsTaken,0);
  c.click({action:'number-step',field:'woundsTaken',delta:'1'});
  assert.equal((await (await c.reload()).data()).character.woundsTaken,1);
  c.change({field:'honor'},'10');c.click({action:'number-step',field:'honor',delta:'1'});
  assert.equal((await c.data()).derived.honor,10);
});

test('Wounds card follows wound thresholds and recalculates its status when Earth changes',async()=>{
  const c=await character();
  for(const [value,status,hue] of [[0,'Healthy',120],[10,'Healthy',120],[11,'Nicked',103],[14,'Nicked',103],[15,'Grazed',86],[19,'Hurt',69],[23,'Injured',51],[27,'Crippled',34],[31,'Down',17],[35,'Out',0],[38,'Out',0],[39,'Dead',0]]) {
    c.change({field:'woundsTaken'},String(value));
    const html=sectionHtml(c,'rolls');
    assert.match(html,new RegExp(`--wound-hue:${hue}"`));
    assert.match(html,new RegExp(`role="status">${status}(?: \\(\\+\\d+\\))?</span>`));
    assert.doesNotMatch(html,/Wounds taken/);
    assert.equal((html.match(/aria-current="true"/g)||[]).length,1);
  }
  c.change({field:'woundsTaken'},'11');
  for(const trait of ['Stamina','Willpower'])c.click({action:'trait',trait,delta:'1'});
  assert.match(sectionHtml(c,'rolls'),/role="status">Healthy \(\+0\)<\/span>/);
  const card=sectionHtml(c,'rolls').split('aria-label="Wound levels and current wounds">')[1].split('<div class="creator-roll-combat')[0];
  assert.match(card,/<div class="creator-ring-head"><strong>Wounds<\/strong><div class="creator-number-field">/);
  assert.doesNotMatch(card,/<span>Wounds<\/span>|<small>|Earth ×/);
  assert.match(card,/role="status">Healthy \(\+0\)<\/span>: <strong>15<\/strong>/);
  assert.match(card,/Nicked \(\+3\)<\/span>: <strong>21<\/strong>/);
  assert.match(card,/Nicked \(\+3\)/);
  assert.match(card,/Down \(\+40\)/);
  assert.doesNotMatch(sectionHtml(c,'rolls'),/Unarmed damage|Void Points|Wounds ·|Wound capacity/);
  const loaded=await c.reload();
  assert.equal((await loaded.data()).character.woundsTaken,11);
  assert.match(sectionHtml(loaded,'rolls'),/--wound-hue:120/);
  assert.match(sectionHtml(loaded,'rolls'),/Dead<\/span>: <strong>58<\/strong>/);
  const beforeHeal=await loaded.data();
  assert.equal(beforeHeal.derived.combat.healing,7);
  loaded.click({action:'heal-wounds'});
  assert.equal((await loaded.data()).character.woundsTaken,4);
  loaded.click({action:'heal-wounds'});
  const healed=await (await loaded.reload()).data();
  assert.equal(healed.character.woundsTaken,0);
  assert.equal(healed.derived.xpRemaining,beforeHeal.derived.xpRemaining);
  assert.match(sectionHtml(loaded,'rolls'),/aria-label="Heal 7 wounds" disabled/);
});

test('legacy approvals remain saved and Imperial family approval lives in Identity',async()=>{
  const c=await character({exceptions:[{id:'legacy',code:'rank:skill:Defense',explanation:'Existing approval'}]});
  c.change({field:'clan'},'Imperial');
  assert.match(sectionHtml(c,'identity'),/data-imperial-approval/);
  c.change({imperialApproval:''},'GM approves this Imperial family');
  const saved=(await (await c.reload()).data()).character;
  assert.equal(saved.exceptions.find(e=>e.id==='legacy').explanation,'Existing approval');
  assert.equal(saved.exceptions.find(e=>e.code==='imperial').explanation,'GM approves this Imperial family');
});

function equipmentSelect(c,index) {
  const select=sectionHtml(c,'equipment').match(new RegExp(`<select[^>]*data-equipment-choice="${index}"[^>]*>([\\s\\S]*?)</select>`));
  assert.ok(select,`Equipment choice ${index} must be a dropdown`);
  return select[1];
}

test('any one weapon outfit choices list catalog weapons and stay free and equippable',async()=>{
  const c=await character();c.school('Crab','Toritaka Bushi');
  const choices=equipmentSelect(c,3);
  assert.match(choices,/<option value="Katana"/);
  assert.match(choices,/<option value="Tetsubo"/);
  assert.match(choices,/<option value="Yumi"/);
  assert.doesNotMatch(choices,/value="Light Armor"|value="Willow Leaf"/);
  const before=(await c.data()).derived.xpRemaining;
  c.change({equipmentChoice:'3'},'Tetsubo');
  const restored=await c.reload(),{derived:d}=await restored.data();
  const weapon=d.equipment.find(e=>e.key==='school:3');
  assert.equal(weapon.name,'Tetsubo');assert.equal(weapon.pending,false);
  assert.equal(weapon.item.kind,'weapon');assert.equal(weapon.source,'school');
  assert.equal(d.xpRemaining,before);
  assert.match(equipmentSelect(restored,3),/<option value="Tetsubo" selected>/);
});

test('specific outfit dropdowns restrict armor and weapon categories and retain legacy choices',async()=>{
  const c=await character();c.school('Crab','Hida Bushi');
  const {derived:d}=await c.data();
  const armorIndex=d.school.equipment.findIndex(e=>e.name==='Light or Heavy Armor');
  const weaponIndex=d.school.equipment.findIndex(e=>e.name==='Heavy Weapon or Polearm');
  const armor=equipmentSelect(c,armorIndex),weapons=equipmentSelect(c,weaponIndex);
  assert.match(armor,/value="Light Armor"/);assert.match(armor,/value="Heavy Armor"/);
  assert.doesNotMatch(armor,/value="Ashigaru Armor"|value="Katana"/);
  assert.match(weapons,/value="Tetsubo"/);assert.match(weapons,/value="Naginata"/);
  assert.doesNotMatch(weapons,/value="Katana"|value="Yumi"|value="Light Armor"/);
  c.change({equipmentChoice:String(weaponIndex)},'Family heirloom weapon');
  const restored=await c.reload();
  assert.match(equipmentSelect(restored,weaponIndex),/<option value="Family heirloom weapon" selected>/);
});

test('the options menu and added Greedy show the Mantis price without a false price blocker',async()=>{
 const c=await character();c.school('Mantis','Yoritomo Courtier');
 assert.match(sectionHtml(c,'options'),/<option value="Greedy"[^>]*>Greedy · 4 XP<\/option>/);
 c.inputs['#disadvantage-select']={value:'Greedy'};c.click({action:'add-disadvantage'});
 let d=(await c.data()).derived;assert.equal(d.disadvantages[0].cost,4);
 assert.match(sectionHtml(c,'options'),/<output[^>]*aria-label="Greedy point cost">4<\/output>/);
 c.change({kind:'disadvantage',index:'0'},'4');d=(await c.data()).derived;
 assert.ok(!d.blockers.some(v=>v.code.startsWith('cost:disadvantage:')));
 c.inputs['#disadvantage-select']={value:'Consumed'};c.click({action:'add-disadvantage'});
 assert.match(sectionHtml(c,'options'),/<select data-option-detail="disadvantage" data-index="1"/);
 c.change({optionDetail:'disadvantage',index:'1'},'Determination');
 assert.equal((await c.data()).derived.disadvantages[1].cost,6);
 const result=await c.data();assert.ok(!result.derived.blockers.some(v=>v.code==='option-choice:disadvantage:'+result.character.disadvantages[1].id));
});


test('specific choice is shown only for parameterized options and variants',async()=>{
  const c=await character({advantages:[{id:'simple',name:'Large',cost:3,selection:'Legacy detail'},{id:'ally',name:'Ally',cost:2}],disadvantages:[{id:'greedy',name:'Greedy',cost:4},{id:'consumed',name:'Consumed',cost:4,selection:'Knowledge'}]});
  const html=sectionHtml(c,'options');
  assert.doesNotMatch(html,/Specific choice for Large|Specific choice for Greedy/);
  assert.match(html,/Specific choice for Ally/);
  assert.match(html,/Specific choice for Consumed/);
  assert.equal((await (await c.reload()).data()).character.advantages[0].selection,'Legacy detail');
});

test('the Traveling Pack offers its book list; ten picks, a pet as two; misc equipment is in the Add picker with prices',async()=>{
  const c=await character();c.school('Crab','Hida Bushi');
  let html=sectionHtml(c,'equipment');
  assert.match(html,/creator-pack" open><summary>Traveling Pack items <small class="creator-pack-count creator-pack-count-short">0\/10<\/small>/);
  assert.match(html,/data-pack-item="Pet \(dog, cat, monkey, songbird\)"[^>]*>Pet \(dog, cat, monkey, songbird\) \(counts as 2\) · 1 koku/);
  assert.match(html,/>Candles \(6\) · 6 bu \(1 bu each\)</);assert.match(html,/>Smoking pipe · 3 zeni</);assert.match(html,/>Straw cloak</,'no book price, none shown');
  assert.match(html,/<option value="Tea Set"[^>]*>Tea Set · 1 koku<\/option>/);assert.match(html,/Clothing &amp; Accessories|Clothing & Accessories/);assert.match(html,/Utaku War Horse · 250 koku/);
  const names=(await c.data()).derived.travelingPack.options.map(o=>o.name).filter(n=>!n.startsWith('Pet'));
  for(const name of names.slice(0,8))c.change({packItem:name},'on',{checked:true});
  c.change({packItem:'Pet (dog, cat, monkey, songbird)'},'on',{checked:true});
  let d=(await c.data()).derived;assert.equal(d.travelingPack.count,10);assert.ok(!d.violations.some(v=>v.code==='equipment:traveling-pack'));
  html=sectionHtml(c,'equipment');
  assert.match(html,/<ul class="creator-wide creator-pack-list"><li class="creator-pack-chosen"><span>Basket<\/span><small>1 to 5 zeni<\/small><label class="ui-checkbox creator-check creator-public-check"><input type="checkbox" data-pack-public="Basket"/,'ten chosen: listed with price and a Public box');
  assert.equal((html.match(/class="creator-pack-chosen"/g)||[]).length,9,'nine items (the pet counts twice)');
  assert.match(html,/creator-pack"><summary>Change items <small class="creator-pack-count">10\/10<\/small><\/summary>/,'the checklist folds under Change items');
  c.change({packPublic:'Basket'},'on',{checked:true});
  d=(await c.data()).derived;assert.equal(d.travelingPack.publicItems.join(),'Basket');
  assert.match(sectionHtml(c,'equipment'),/data-pack-public="Basket"[^>]*checked/);
  assert.match(html,new RegExp(`data-pack-item="${names[9]}" disabled`),'a full pack disables the rest');
  c.change({packItem:names[0]},'on',{checked:false});
  assert.equal((await c.data()).derived.travelingPack.count,9);
  assert.equal((await c.data()).character.packPublic.Basket,undefined,'an item taken out is no longer public');
  assert.doesNotMatch(sectionHtml(c,'equipment'),/creator-pack-list/,'the list shows only with all ten');
  html=sectionHtml(c,'equipment');assert.ok(html.indexOf('>Basket ·')<html.indexOf('>Wig ·'),'A–Z by default');
  c.change({packSort:''},'price');html=sectionHtml(c,'equipment');
  assert.match(html,/<option value="price" selected/);
  const at=name=>html.indexOf(`data-pack-item="${name}"`);
  assert.ok(at('Bucket')<at('Coin purse')&&at('Coin purse')<at('Blanket')&&at('Blanket')<at('Tea set')&&at('Tea set')<at('Candles (6)')&&at('Candles (6)')<at('Straw cloak'),'cheapest first (zeni < bu < koku), no price last');
  c.change({packSort:''},'name');
  c.inputs['#new-equipment']={value:'Tea Set'};c.click({action:'add-equipment'});
  assert.match(sectionHtml(c,'equipment'),/<strong>Tea Set<\/strong><small>Personal equipment · 1 koku<\/small>/);
  // Every item in 07 has a Public box: outfit and personal items alike.
  html=sectionHtml(c,'equipment');
  const keyOf=async name=>(await c.data()).derived.equipment.find(e=>e.name===name).key;
  const daisho=await keyOf('Daisho'),tea=await keyOf('Tea Set');
  assert.match(html,new RegExp(`data-equipment-public="${daisho}"`));assert.match(html,new RegExp(`data-equipment-public="${tea}"`));
  c.change({equipmentPublic:daisho},'on',{checked:true});c.change({equipmentPublic:tea},'on',{checked:true});
  let result=await c.data();assert.ok(result.derived.equipment.find(e=>e.name==='Daisho').public);
  assert.match(sectionHtml(c,'equipment'),new RegExp(`data-equipment-public="${tea}"[^>]*checked`));
  const teaIndex=result.character.equipment.findIndex(e=>e.name==='Tea Set');c.click({action:'remove-equipment',index:String(teaIndex)});
  assert.equal((await c.data()).character.equipmentPublic[tea],undefined,'a removed item leaves no Public mark');
  c.school('Crane','Kakita Bushi');
  assert.deepEqual(Object.keys((await c.data()).character.equipmentPublic),[],'a new school\'s outfit starts private');
});

test('separate equipment list preserves saved gear and money without equipped controls',async()=>{
  const c=await character();c.school('Crab','Hida Bushi');
  const armorIndex=(await c.data()).derived.school.equipment.findIndex(e=>e.name==='Light or Heavy Armor');
  c.change({equipmentChoice:String(armorIndex)},'Light Armor');
  const before=await c.data(),armor=before.derived.equipment.find(entry=>entry.item?.kind==='armor');
  const loaded=await character({...before.character,equipped:{[armor.key]:true},money:{koku:7,bu:2,zeni:1}});
  const html=sectionHtml(loaded,'equipment');
  assert.doesNotMatch(html,/Starting money:|School outfit|data-equipped|toggle-equipped|Equip<|Equipped</);
  assert.match(html,/Light Armor/);
  assert.doesNotMatch(sectionHtml(loaded,'story'),/creator-equipment-list|creator-standing-fields/);
  assert.match(sectionHtml(loaded,'identity'),/creator-standing-fields/);
  loaded.click({action:'money-step',field:'koku',delta:'1'});
  loaded.click({action:'money-step',field:'zeni',delta:'-1'});
  loaded.click({action:'money-step',field:'zeni',delta:'-1'});
  loaded.inputs['#new-equipment']={value:'Rope'};loaded.click({action:'add-equipment'});
  const saved=await (await loaded.reload()).data();
  assert.equal(saved.character.equipment[0].name,'Rope');
  assert.equal(saved.character.equipped[armor.key],true);
  assert.deepEqual(saved.derived.money,{koku:8,bu:2,zeni:0});
  assert.equal(saved.derived.xpRemaining,before.derived.xpRemaining,'Money changes must not spend XP');
  assert.ok(saved.derived.combat.armorTN>before.derived.combat.armorTN);
  loaded.click({action:'remove-equipment',index:'0'});
  assert.equal((await loaded.data()).character.equipment.length,0);
});


test('cost guidance shows limits while trait, skill, and option edits remain available',async()=>{
 const c=await character({phase:'advancement',traitBuys:{Strength:8},skills:{Defense:10},advantages:[{id:'large',name:'Large',cost:40}],disadvantages:[{id:'doubt',name:'Doubt',cost:8},{id:'health',name:'Bad Health',cost:4}]});
 // Each option column shows XP used against its limit.
 assert.match(c.root.innerHTML,/Advantages <small[^>]*>40\/15<\/small>/);assert.match(c.root.innerHTML,/Disadvantages <small[^>]*>12\/10<\/small>/);
 c.click({action:'trait',trait:'Strength',delta:'1'});c.click({action:'skill',skill:'Defense',delta:'1'});
 const {character:s,derived:d}=await c.data();assert.equal(d.traits.Strength.rank,11);assert.equal(d.skills.Defense.rank,11);
 assert.ok(d.blockers.some(e=>e.code==='rank:trait:Strength'));assert.ok(d.blockers.some(e=>e.code==='rank:skill:Defense'));
 assert.equal(s.phase,undefined);assert.equal(d.xpEarned,10);
 const restored=await c.reload();assert.equal((await restored.data()).derived.skills.Defense.rank,11);
});

test('Later training always shows the starting school, current training and the existing picker',async()=>{
 const c=await character();
 assert.match(c.root.innerHTML,/<div class="creator-later-training">/);
 assert.doesNotMatch(c.root.innerHTML,/<details[^>]*class="creator-later-training"/);
 assert.match(c.root.innerHTML,/id="training-school"/);
 c.school('Crab','Hida Bushi');
 const list=instance=>instance.root.innerHTML.split('<div class="creator-later-training">')[1].split('<aside')[0];
 assert.match(list(c),/Hida Bushi · School Rank 1/);
 assert.equal((list(c).match(/data-training-index=/g)||[]).length,1);
 assert.equal((await c.data()).character.training.length,0,'Displaying the starting school must not change saved training');
 c.click({action:'train-rank',index:'-1',delta:'1'});
 assert.equal((await c.data()).derived.schoolRank,2);
 assert.equal((await c.data()).character.training.length,1);
 assert.match(list(c),/Hida Bushi · School Rank 2/);
 assert.equal((list(c).match(/data-training-index=/g)||[]).length,1,'Starting school must not appear twice');
 c.inputs['#training-school']={value:'Crab Defender · path'};c.click({action:'add-training'});
 c.inputs['#training-school']={value:'Kakita Bushi · basic'};c.click({action:'add-training'});
 assert.match(list(c),/Crab Defender · School Rank 1 · path/);
 assert.match(list(c),/Kakita Bushi · School Rank 1/);
 assert.equal((list(c).match(/data-training-index=/g)||[]).length,3);
 assert.doesNotMatch(list(c),/data-action="train-rank" data-index="1"/,'Paths do not have rank controls');
 const restored=await c.reload();
 assert.equal((await restored.data()).derived.schoolRank,2);
 assert.equal((list(restored).match(/data-training-index=/g)||[]).length,3);
 restored.click({action:'remove-training',index:'1'});
 assert.doesNotMatch(list(restored),/<span>Crab Defender · School Rank/);
 assert.match(list(restored),/id="training-school"/);
});

test('old advancement sheets can change outfit choices and remove their first training entry',async()=>{
 const school=catalog.clans.find(c=>c.name==='Crab').schools.find(s=>s.name==='Hida Bushi');
 const id=school.slug+'#'+school.anchor;
 const c=await character({phase:'advancement',clan:'Crab',family:'Hida',school:id,training:[{school:id,rank:2}],progression:{baseline:{outfit:[{name:'Frozen outfit',key:'old'}]},history:[{kind:'award',amount:15}]}});
 assert.match(c.root.innerHTML,/data-equipment-choice=/);assert.match(c.root.innerHTML,/data-action="remove-training" data-index="0"/);
 c.click({action:'remove-training',index:'0'});
 const saved=await (await c.reload()).data();assert.equal(saved.character.training.length,0);assert.equal(saved.derived.schoolRank,1);
 assert.equal(saved.character.progression.history[0].amount,15);
});


test('Insight card shows the current formula and cumulative Courtier and Etiquette bonuses',async()=>{
 const c=await character({skills:{Courtier:7,Etiquette:7}});
 const card=()=>c.root.innerHTML.split('class="creator-xp creator-insight"')[1].split('</small>')[0];
 assert.match(card(),/<span>Insight:<\/span><strong>134<\/strong>/);
 for(const ring of ['Earth','Air','Water','Fire','Void'])assert.ok(card().includes(`${ring} 2`));
 assert.match(card(),/× 10 \+ 14 Skill ranks \+ 10 Courtier bonus \+ 10 Etiquette bonus/);
 c.click({action:'skill',skill:'Courtier',delta:'-1'});
 assert.match(card(),/<strong>126<\/strong>/);assert.match(card(),/13 Skill ranks \+ 3 Courtier bonus \+ 10 Etiquette bonus/);
 c.click({action:'trait',trait:'Stamina',delta:'1'});c.click({action:'trait',trait:'Willpower',delta:'1'});
 assert.match(card(),/Earth 3/);assert.match(card(),/<strong>136<\/strong>/);
 c.change({modifier:'insight'},'-2');assert.match(card(),/− 2 modifier/);assert.match(card(),/<strong>134<\/strong>/);
 assert.equal((await c.data()).derived.insight,134);
 const restored=await c.reload();assert.match(restored.root.innerHTML,/Insight:<\/span><strong>134<\/strong>/);
});

test('every ability is its own catalog entry: no merged spells, no paragraphs read as titles',()=>{
  for (const ability of catalog.abilities) {
    assert.ok(ability.name.length <= 45, `name looks like a paragraph: ${ability.name.slice(0,60)}`);
    assert.ok(ability.description.trim(), `${ability.id} has no rules text`);
    assert.doesNotMatch(ability.description,/\[(CR|IH)\]|Ring\s*\/\s*Master/,`${ability.id} contains another entry`);
    assert.ok(!('ring/master' in (ability.fields || {})),ability.id);
  }
  const byId = id => catalog.abilities.find(ability => ability.id === id);
  assert.match(byId('spell:universal-spells:Commune').description,/Water spirits communicate/);
  assert.doesNotMatch(byId('spell:universal-spells:Sense').description,/Summon/);
  assert.equal(byId('spell:water-spells:Hands of the Tides').fields.duration,'Instantaneous');
  assert.match(byId('kata:katas:Art of Ninjutsu').description,/Stealth Skill Rank/);
});

test('skills use the shared picker: search, a list grouped by skill type, Add; typed text still adds a custom skill',async()=>{
  const c=await character({skills:{Courtier:1}});
  let html=sectionHtml(c,'skills');
  const list=html.match(/<select[^>]*id="skill-choice"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...list.matchAll(/<optgroup label="([^"]+)"/g)].map(m=>m[1]),['High','Bugei','Merchant','Low']);
  assert.match(html,/<input[^>]*id="new-skill"[^>]*data-search-target="skill-choice"/);
  assert.match(list,/value="Courtier" disabled title="Already known"/);
  c.inputs['#skill-choice']={value:'Etiquette'};c.inputs['#new-skill']={value:''};c.click({action:'add-skill'});
  assert.equal((await c.data()).character.skills.Etiquette,1);
  c.inputs['#skill-choice']={value:''};c.inputs['#new-skill']={value:'Custom skill'};c.click({action:'add-skill'});
  assert.equal((await c.data()).character.skills['Custom skill'],1);
});

test('free school skill choices use the picker: Add fills the slot, × clears it, emphases list their options',async()=>{
  const c=await character();c.school('Crane','Kakita Artisan');
  let html=sectionHtml(c,'skills');
  assert.match(html,/<input[^>]*id="school-choice-search-0"[^>]*data-search-target="school-choice-0"/);
  assert.match(html,/data-action="set-school-choice" data-index="0"/);
  c.inputs['#school-choice-0']={value:'Acting'};c.click({action:'set-school-choice',index:'0'});
  assert.equal((await c.data()).character.schoolChoices[0],'Acting');
  assert.match(sectionHtml(c,'skills'),/creator-choice-set"><span>[^<]*<\/span><strong>Acting<\/strong>/);
  c.click({action:'clear-school-choice',index:'0'});
  assert.equal((await c.data()).character.schoolChoices[0],'');
  const kaiu=await character();kaiu.school('Crab','Kaiu Engineer');
  const index=(await kaiu.data()).derived.school.skillChoices.findIndex(choice=>choice.kind==='emphasis');
  html=sectionHtml(kaiu,'skills');
  const list=html.match(new RegExp(`<select[^>]*id="school-choice-${index}"[^>]*>([\\s\\S]*?)</select>`))[1];
  assert.match(list,/value="Construction"/);assert.match(list,/value="Siege"/);
});

test('optional ability permissions sit in the subsection they open; closed reasons share the heading line',async()=>{
  const c=await character();c.school('Crab','Hida Bushi');
  let html=sectionHtml(c,'abilities');
  assert.doesNotMatch(html,/Optional ability training/);
  const part=kind=>html.split(`data-ability-kind="${kind}"><div class="creator-option-heading">`)[1].split('creator-purchases creator-ability-kind')[0];
  assert.match(part('kata'),/^<h3>Kata<\/h3><a /,'open: no reason on the heading');
  assert.match(part('spell'),/^<h3>Spells<\/h3><span class="creator-ability-locked">Shugenja only\.<\/span>/);
  assert.match(part('spell'),/data-school-decision="maho"/);
  assert.match(part('shadowlands'),/data-school-decision="shadowlands"/);
  assert.doesNotMatch(part('kiho'),/data-school-decision/,'a bushi cannot use the non-Brotherhood Kiho rules');
  // Ticking the Shadowlands permission opens that subsection.
  c.change({schoolDecision:'shadowlands'},true);
  html=sectionHtml(c,'abilities');
  assert.match(html,/creator-purchases creator-ability-kind" data-ability-kind="shadowlands"/);
  const shugenja=await character();shugenja.school('Crab','Kuni Shugenja');
  assert.match(sectionHtml(shugenja,'abilities').split('data-ability-kind="kiho"><div class="creator-option-heading">')[1],/^[\s\S]*?data-school-decision="nonBrotherhoodKiho"/);
});


test('abilities are button lists: bought, then available, then unavailable; click buys, click again sells',async()=>{
  const id=(kind,name)=>catalog.abilities.find(a=>a.kind===kind&&a.name===name).id;
  const buy=(c,kind,value)=>c.click({action:'buy-ability',abilityKind:kind,id:value});
  const sell=(c,kind,value)=>c.click({action:'sell-ability',abilityKind:kind,id:value});
  const section=(c,kind)=>sectionHtml(c,'abilities').split(new RegExp(`creator-ability-kind[^"]*" data-ability-kind="${kind}"`))[1].split(/creator-purchases creator-ability-kind/)[0];
  const buttons=html=>[...html.matchAll(/<button type="button"[^>]*data-action="(buy|sell)-ability" data-id="([^"]+)"[^>]*aria-pressed="(true|false)"([^>]*)>/g)].map(m=>({id:m[2],bought:m[3]==='true',disabled:/ disabled/.test(m[4])}));
  const order=list=>list.map(b=>b.bought?0:b.disabled?2:1);
  // No school: every type is shown, every button disabled, the reason on the heading line.
  const blank=await character();
  for(const kind of ['spell','kata','kiho','tattoo','shadowlands']){
    const html=section(blank,kind);
    assert.match(html,/creator-ability-locked">Choose a school first\.</,kind);
    assert.ok(buttons(html).length && buttons(html).every(b=>b.disabled),kind);
  }
  // Shugenja: spells split by ring x Mastery; buying makes the button bought and first in its row.
  const c=await character();c.school('Crane','Asahina Shugenja');
  let html=section(c,'spell');
  const air1=html.split('data-ability-group="Air"><h4>Air</h4>')[1].split('data-ability-level="2"')[0];
  assert.match(air1,/data-ability-level="1"><h5>Mastery 1<\/h5>/);
  buy(c,'spell',id('spell','Blessed Wind'));
  let saved=(await c.data()).character.abilities;
  assert.equal(saved.length,1);assert.equal(saved[0].grant,true,'a free school pick while one remains');
  html=section(c,'spell');
  const row=buttons(html.split('data-ability-group="Air"><h4>Air</h4>')[1].split('data-ability-level="2"')[0]);
  assert.equal(row[0].id,id('spell','Blessed Wind'));assert.equal(row[0].bought,true);
  assert.deepEqual(order(row),[...order(row)].sort((a,b)=>a-b),'bought, available, unavailable');
  assert.match(html,/creator-ability-locked">Air Mastery 3 exceeds effective School Rank 2\./);
  // Universal spells granted by the school show as bought but cannot be sold.
  const universal=buttons(html.split('data-ability-group="All"')[1].split('creator-ability-group')[0]);
  assert.ok(universal.filter(b=>b.bought).every(b=>b.disabled));
  // A blocked spell cannot be bought; clicking a bought one sells it.
  buy(c,'spell',id('spell','Everburning Rage'));assert.equal((await c.data()).character.abilities.length,1);
  sell(c,'spell',id('spell','Blessed Wind'));assert.equal((await c.data()).character.abilities.length,0);
  // No Details list under the buttons.
  buy(c,'spell',id('spell','Blessed Wind'));
  assert.doesNotMatch(section(c,'spell'),/ability-details/);
  // Greyed-out buttons fold behind "N unavailable"; a closed type folds behind "Show all (N)".
  assert.match(section(c,'spell'),/<details[^>]*class="ui-disclosure creator-ability-more"[^>]*id="ability-more-spell-Air-3"[^>]*><summary>\d+ unavailable · <span class="creator-ability-locked">Air Mastery 3 exceeds/,'a level with nothing to buy folds into one line with its reason');
  const inView=section(c,'spell').split('id="ability-more-spell-Air-1"')[0].split('data-ability-group="Air"')[1];
  assert.ok(buttons(inView).every(b=>b.bought || !b.disabled),'only bought and available buttons stay in view');
  assert.match(section(c,'kata'),/id="ability-more-kata"[^>]*><summary>Show all \(\d+\)<\/summary>/);
  // Kata are closed for a shugenja: all disabled under "Bushi only.".
  html=section(c,'kata');
  assert.match(html,/<h3>Kata<\/h3><span class="creator-ability-locked">Bushi only\.<\/span>/);
  assert.ok(buttons(html).every(b=>b.disabled));
  // A bushi buys kata with XP; their price is on the button; one row per ring.
  const bushi=await character();bushi.school('Crab','Hida Bushi');
  html=section(bushi,'kata');
  assert.deepEqual([...html.matchAll(/data-ability-group="([^"]+)"/g)].map(m=>m[1]),['Air','Earth','Fire','Water','Void']);
  assert.match(html,/Striking as Earth · 3 · 3 XP/);
  buy(bushi,'kata',id('kata','Striking as Earth'));
  saved=(await bushi.data()).character.abilities;assert.equal(saved[0].grant,false);
  // Search scope and Shadowlands lists are still there.
  assert.match(sectionHtml(bushi,'abilities'),/<input[^>]*data-search-scope="kata"/);
  const tainted=await character({taint:1,schoolDecisions:{shadowlands:true}});tainted.school('Crab','Hida Bushi');
  assert.deepEqual([...section(tainted,'shadowlands').matchAll(/data-ability-group="([^"]+)"/g)].map(m=>m[1]),['mutations','minor-shadowlands-powers','major-shadowlands-powers','akutenshi-powers']);
});

test('bought abilities appear in Rolls: spells in their ring card; kata, kiho, tattoos and Shadowlands powers in their own cards',async()=>{
  const id=(kind,name)=>catalog.abilities.find(a=>a.kind===kind&&a.name===name).id;
  const c=await character();c.school('Crane','Asahina Shugenja');
  c.click({action:'buy-ability',abilityKind:'spell',id:id('spell','Blessed Wind')});
  const rolls=sectionHtml(c,'rolls');
  const air=rolls.split('ring-watermark" data-ring="Air"')[1].split('creator-ring ring-watermark')[0];
  const derived=(await c.data()).derived,blessed=derived.abilities.find(a=>a.name==='Blessed Wind');
  assert.match(air,new RegExp(`data-roll-kind="spell" data-roll-name="${blessed.selectionId}" data-roll-skill="Air"[^>]*>[^]*?${blessed.spellRolls.Air.notation} · TN 10`));
  // Universal spells (school grants) can be cast in each of the four elements.
  for(const ring of ['Air','Earth','Fire','Water'])assert.match(rolls.split(`ring-watermark" data-ring="${ring}"`)[1].split('creator-ring ring-watermark')[0],/aria-label="Cast Commune \(/,ring);
  assert.doesNotMatch(rolls.split('ring-watermark" data-ring="Void"')[1].split('creator-ring ring-watermark')[0].split('creator-roll-details')[0],/Cast Commune/);
  // Kata, kiho, tattoos and Shadowlands powers each get their own card; kata link to their rules.
  const bushi=await character({taint:1,schoolDecisions:{shadowlands:true}});bushi.school('Crab','Hida Bushi');
  bushi.click({action:'buy-ability',abilityKind:'kata',id:id('kata','Striking as Earth')});
  bushi.click({action:'buy-ability',abilityKind:'shadowlands',id:catalog.abilities.find(a=>a.kind==='shadowlands').id});
  const rollsHtml=sectionHtml(bushi,'rolls');
  assert.doesNotMatch(rollsHtml.split('ring-watermark" data-ring="Earth"')[1].split('creator-ring ring-watermark')[0],/Striking as Earth/,'not in the ring card');
  assert.match(rollsHtml,/data-ability-kind="kata"><div class="creator-ring-head"><strong>Kata<\/strong><\/div>[^]*?<a class="creator-roll-ability" data-ring="Earth" data-rule-reference href="#\/katas#[^"]*"><span>Striking as Earth<\/span><small>Earth 3<\/small>/);
  assert.match(rollsHtml,/data-ability-kind="shadowlands"><div class="creator-ring-head"><strong>Shadowlands powers<\/strong>/);
  assert.doesNotMatch(rollsHtml,/data-ability-kind="kiho"|data-ability-kind="tattoo"/,'no empty cards');
});

test('rings are ordered by value in Rolls and ability blocks; section 02 keeps its layout',async()=>{
  const c=await character();c.school('Crane','Asahina Shugenja');
  // Raise Water (Strength and Perception) to 3 and Fire (Agility and Intelligence) to 3, Fire more.
  for(const trait of ['Strength','Perception','Agility','Intelligence','Agility','Intelligence'])c.click({action:'trait',trait,delta:'1'});
  const rings=(await c.data()).derived.rings;
  assert.ok(rings.Fire>rings.Water && rings.Water>rings.Earth,JSON.stringify(rings));
  const cards=html=>[...html.matchAll(/class="creator-ring ring-watermark" data-ring="([^"]+)"/g)].map(m=>m[1]);
  const order=cards(sectionHtml(c,'rolls'));
  assert.deepEqual(order.slice(0,2),['Fire','Water']);
  for(let i=1;i<order.length;i++)assert.ok(rings[order[i-1]]>=rings[order[i]],order.join());
  const traitCards=[...sectionHtml(c,'traits').matchAll(/class="creator-ring[^"]*" data-ring="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(traitCards.join(),c.window.CharacterCatalog.TRAIT_GROUPS.map(group=>group.ring).join(),'02 keeps its fixed order');
  const spellBlocks=[...sectionHtml(c,'abilities').split('data-ability-kind="spell"><div class="creator-option-heading">')[1].split('creator-purchases creator-ability-kind')[0].matchAll(/data-ability-group="([^"]+)"><h4>/g)].map(m=>m[1]);
  assert.equal(spellBlocks[0],'All','Universal first');
  assert.deepEqual(spellBlocks.slice(1,3),['Fire','Water']);
});

test('character toolbar: Save, Public view and Delete only; Delete asks, removes the PC and goes to Start',async()=>{
  const c=await character({name:'Ren'});
  const nav=c.root.innerHTML.match(/<nav class="creator-nav"[^]*?<\/nav>/)[0];
  assert.doesNotMatch(nav,/← Characters|← Campaign|Copy link|JSON|Print/);
  assert.match(nav,/data-action="save-close"[^>]*>Save</);assert.match(nav,/data-action="preview-public"/);
  assert.match(nav,/data-action="delete-character" aria-label="Delete character"/);
  c.window.confirm=()=>false;c.click({action:'delete-character'});
  assert.equal(c.records().length,1,'cancel keeps the character');
  c.window.confirm=()=>true;c.click({action:'delete-character'});
  assert.equal(c.records().length,0);assert.equal(c.route(),'#/start');
});
