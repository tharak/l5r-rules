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
  let exported;
  const window = {dispatchEvent(){}};
  const context = vm.createContext({window, console, Event, Blob,
    localStorage:{getItem:key => storage.get(key) || null, setItem:(key,value) => storage.set(key,value)},
    location:{hash:'#/create-character'},
    fetch:async () => ({ok:true, json:async () => catalog}),
    URL:{createObjectURL(blob){exported = blob; return 'blob:test';}, revokeObjectURL(){}},
    document:{createElement:() => ({click(){}})}, setTimeout(){}});
  for (const file of ['ui-components.js','character-catalog.js','character-rules.js']) vm.runInContext(fs.readFileSync(path.join(rootDir,file),'utf8'),context);
  vm.runInContext(source, context);
  await window.CharacterBuilder.mount(root);
  const change = (dataset,value) => root.onchange({target:{dataset,value}});
  const click = dataset => root.onclick({target:{closest:() => ({dataset})}});
  return {
    root, inputs, change, click, window,
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

test('Save PC preserves personal edits and closes the sheet to Characters',async()=>{
  const c=await character();
  c.inputs['.creator-print-sheet']={outerHTML:''};
  c.root.oninput({target:{dataset:{field:'name'},value:'Saved PC'}});
  c.root.oninput({target:{dataset:{field:'notes'},value:'Personal notes'}});
  c.click({action:'save-close'});
  assert.equal(c.route(),'#/characters');
  const restored=await c.reload();
  const data=await restored.data();
  assert.equal(data.character.name,'Saved PC');
  assert.equal(data.character.notes,'Personal notes');
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

test('all Rolls hide filters start checked; weapon filter hides only zero ranks and persists user changes',async()=>{
 const school=catalog.clans.find(c=>c.name==='Crab').schools.find(s=>s.name==='Hida Bushi');
 const c=await character({clan:'Crab',family:'Hida',school:`${school.slug}#${school.anchor}`,skills:{Knives:2,'Weapons: Custom':0},skillTraits:{'Weapons: Custom':'Agility'},emphases:{Knives:['Tanto']}},{
  'l5r-rules-character-lab-hide-rank-zero':'false',
  'l5r-rules-character-rolls-hidden-zero-categories':'[]'
 });
 const rows=instance=>instance.root.innerHTML.split('id="creator-rolls"')[1].split('</section>')[0];
 const toggle=(instance,dataset,checked)=>instance.root.onchange({target:{dataset,checked}});
 assert.match(rows(c),/data-hide-zero-skills="true" checked/);
 for(const category of ['artisan','games','perform','lore','weapons'])assert.match(rows(c),new RegExp(`data-hide-zero-category="${category}" checked`));
 assert.match(rows(c),/Hide Weapons 0/);
 const before=(await c.data()).derived;
 toggle(c,{hideZeroSkills:''},false);
 assert.ok(rows(c).includes('data-ring-skill="Athletics"'));
 for(const name of c.window.CharacterCatalog.WEAPON_SKILLS)assert.equal(rows(c).includes(`data-ring-skill="${name}"`),(before.skills[name]?.rank || 0)>0,name);
 assert.ok(!rows(c).includes('data-ring-skill="Weapons: Custom"'));
 assert.match(rows(c),/Tanto/);
 toggle(c,{hideZeroCategory:'weapons'},false);
 for(const name of [...c.window.CharacterCatalog.WEAPON_SKILLS,'Weapons: Custom'])assert.ok(rows(c).includes(`data-ring-skill="${name}"`),name);
 const restored=await c.reload();
 assert.match(rows(restored),/data-hide-zero-skills="true">Hide 0 rank skills/);
 assert.match(rows(restored),/data-hide-zero-category="weapons">Hide Weapons 0/);
 assert.ok(rows(restored).includes('data-ring-skill="War Fan"'));
 toggle(restored,{hideZeroCategory:'weapons'},true);
 assert.ok(!rows(restored).includes('data-ring-skill="War Fan"'));
 assert.ok(rows(restored).includes('data-ring-skill="Knives"'));
 assert.ok(rows(restored).includes('data-ring-skill="Heavy Weapons"'));
 const after=(await restored.data()).derived;
 for(const key of ['xpRemaining','xpSpent','insight','schoolRank'])assert.equal(after[key],before[key],key);
 assert.deepEqual(after.skills,before.skills);
});

test('the continuous editor adds XP before a school is chosen, persists awards, and permits ranks through 10',async()=>{
  const c=await character();
  c.click({action:'xp-award-step',delta:'500'});
  c.click({action:'award-xp'});
  assert.equal((await c.data()).derived.xpRemaining,540);
  for(let i=0;i<8;i++)c.click({action:'trait',trait:'Strength',delta:'1'});
  const data=await c.data();
  assert.equal(data.derived.traits.Strength.rank,10);
  assert.ok(!data.derived.blockers.some(v=>v.code==='rank:trait:Strength'));
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
});

test('multi-skill and emphasis choices keep their correct counts', async () => {
  const c = await character(); c.school('Crane','Kakita Artisan');
  assert.equal((await c.data()).derived.school.skillChoices.length,3);
  for (const [index,value] of ['Acting','Artisan: Painting','Perform: Song'].entries()) c.change({choiceIndex:String(index)},value);
  assert.equal(Object.keys((await c.data()).derived.skills).length,7);
  c.school('Crab','Kaiu Engineer');
  c.change({choiceIndex:'0'},'Siege');
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
  assert.equal((await loaded.data()).character.notes,'My heritage');
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

test('each ability picker adds only its own catalog type and preserves acquisition',async()=>{
  const c=await character();
  for (const kind of ['spell','kata','kiho','tattoo','shadowlands']) {
    const a=catalog.abilities.find(a=>a.kind===kind);
    const html=sectionHtml(c,'abilities');
    const picker=html.match(new RegExp(`<select[^>]*id="ability-choice-${kind}"[^>]*>([\\s\\S]*?)</select>`));
    assert.ok(picker,kind);
    assert.match(picker[1],new RegExp(`value="${a.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"`));
    c.inputs['#ability-choice-'+kind]={value:a.id};
    c.inputs['#ability-payment-'+kind]={value:kind==='tattoo'?'grant':'purchase'};
    c.click({action:'add-ability',abilityKind:kind});
  }
  const saved=(await (await c.reload()).data()).character.abilities;
  assert.deepEqual(saved.map(a=>a.kind).sort(),['kata','kiho','shadowlands','spell','tattoo']);
  assert.equal(saved.find(a=>a.kind==='tattoo').grant,true);
  const spell=catalog.abilities.find(a=>a.kind==='spell');
  c.inputs['#ability-choice-kata']={value:spell.id};
  c.click({action:'add-ability',abilityKind:'kata'});
  assert.equal((await c.data()).character.abilities.length,5);
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
 assert.match(c.root.innerHTML,/Creation limit: Rank 4\. Maximum: Rank 10\./);
 assert.match(c.root.innerHTML,/Advantages \(40\)/);assert.match(c.root.innerHTML,/Disadvantages \(12\)/);
 assert.match(c.root.innerHTML,/No total point limit\./);
 assert.match(c.root.innerHTML,/Up to 10 XP from disadvantages count toward your budget\./);
 c.click({action:'trait',trait:'Strength',delta:'1'});c.click({action:'skill',skill:'Defense',delta:'1'});
 const {character:s,derived:d}=await c.data();assert.equal(d.traits.Strength.rank,11);assert.equal(d.skills.Defense.rank,11);
 assert.ok(d.blockers.some(e=>e.code==='rank:trait:Strength'));assert.ok(d.blockers.some(e=>e.code==='rank:skill:Defense'));
 assert.equal(s.phase,undefined);assert.equal(d.xpEarned,10);
 const restored=await c.reload();assert.equal((await restored.data()).derived.skills.Defense.rank,11);
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
