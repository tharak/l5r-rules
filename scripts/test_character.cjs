const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, 'public/character-data.json')));
const source = fs.readFileSync(path.join(rootDir, 'character.js'), 'utf8');

async function character(saved) {
  const storage = new Map();
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
  for (const file of ['character-catalog.js','character-rules.js']) vm.runInContext(fs.readFileSync(path.join(rootDir,file),'utf8'),context);
  vm.runInContext(source, context);
  await window.CharacterBuilder.mount(root);
  const change = (dataset,value) => root.onchange({target:{dataset,value}});
  const click = dataset => root.onclick({target:{closest:() => ({dataset})}});
  return {
    root, inputs, change, click,
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
      return character(JSON.parse(storage.get('l5r-rules-characters-v1')).find(entry => entry.id === id).sheet);
    }
  };
}

test('Save PC preserves personal edits and closes the sheet to Characters',async()=>{
  const c=await character();
  c.inputs['#summary-name']={textContent:''};
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
  assert.match(c.root.innerHTML,/School rank 2 · Free/);
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
