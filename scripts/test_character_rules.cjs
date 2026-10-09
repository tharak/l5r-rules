const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const catalog=JSON.parse(fs.readFileSync('public/character-data.json','utf8'));
const window={};const context=vm.createContext({window,console,Date,crypto:{randomUUID},structuredClone});
for(const file of ['character-catalog.js','character-rules.js','sheet-sharing.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const R=window.CharacterRules,C=window.CharacterCatalog,S=window.SheetSharing;
const plain=v=>JSON.parse(JSON.stringify(v));
const calc=s=>R.calculate(s,catalog);
const starting=(clan='Crab',name='Hida Bushi')=>R.normalize({name:'Test PC',clan,family:catalog.clans.find(c=>c.name===clan).families[0]?.name || '',school:C.schools(catalog).find(s=>s.name===name).slug+'#'+C.schools(catalog).find(s=>s.name===name).anchor});
const grant=(kind,name,extra={})=>{const a=catalog.abilities.find(a=>a.kind===kind&&(a.name===name || a.name.startsWith(name+' (')));assert.ok(a,`${kind}: ${name}`);return {id:'selected-'+a.id,catalogId:a.id,kind,name,grant:true,...extra};};
function play(s) {s=R.normalize(s);s.exceptions=calc(s).blockers.map(v=>({code:v.code,explanation:'Approved by our table for this test.'}));const result=R.beginPlay(s,catalog);assert.equal(result.violations.length,0);return result.sheet;}
function change(s,fn,explanation='') {const next=R.normalize(plain(s));fn(next);return R.recordChange(s,next,catalog,explanation);}

test('Dragon orders and Spider Monks grant their book-listed family benefit alongside school benefits',()=>{
 for(const [clan,family,trait] of [['Dragon','Togashi','Reflexes'],['Dragon','Hitomi','Strength'],['Dragon','Hoshi','Void'],['Spider','Spider Monks','Reflexes']]) {
  const s=R.normalize({clan,family}),d=calc(s);
  assert.equal(d.familyTrait,trait,family);
  for(const name of C.TRAIT_NAMES)assert.equal(d.traits[name].base,name===trait?3:2,`${family}: ${name}`);
  assert.equal(d.xpSpent,0);assert.equal(d.roninFamilyCost,0);
  if(clan==='Dragon') {
   assert.equal(d.family.anchor,'toc3');assert.equal(d.family.kind,'order');
   const school=C.schools(catalog).find(s=>s.name==='The Togashi Tattooed Order');
   s.school=`${school.slug}#${school.anchor}`;
   const trained=calc(s);
   for(const name of C.TRAIT_NAMES)assert.equal(trained.traits[name].base,2+Number(name===trait)+Number(name===school.benefit),`${family} and school: ${name}`);
   assert.equal(trained.school.brotherhood,undefined);
  }
 }
});
test('all listed Great Clan vassal families are selectable with source sections and one free benefit',()=>{
 for(const [name,count] of [['Crab',10],['Crane',6],['Dragon',6],['Lion',9],['Mantis',7],['Phoenix',8],['Scorpion',7],['Unicorn',8]]) {
  const clan=catalog.clans.find(c=>c.name===name),vassals=clan.families.filter(f=>f.parent);
  assert.equal(vassals.length,count,name);
  assert.equal(new Set(clan.families.map(f=>f.name)).size,clan.families.length);
  for(const f of vassals) {
   assert.equal(f.slug,clan.familySource);assert.ok(f.anchor);
   if(f.traitOptions)continue;
   const d=calc({clan:name,family:f.name});
   assert.equal(d.traits[f.trait].base,3,f.name);assert.equal(d.xpSpent,0);
   assert.equal(Object.values(d.traits).filter(t=>t.base===3).length,1,f.name);
  }
 }
 // Names recurring in different clans retain the appropriate source and benefit.
 assert.equal(calc({clan:'Crane',family:'Tsume'}).familyTrait,'Agility');
 assert.equal(calc({clan:'Ronin',family:'Tsume'}).familyTrait,'Reflexes');
 assert.equal(calc({clan:'Ronin',family:'Tsume'}).roninFamilyCost,5);
});
test('Moshibaru chooses exactly one physical trait; invalid choices grant no benefit',()=>{
 const s=R.normalize({clan:'Crab',family:'Moshibaru'});
 assert.ok(calc(s).blockers.some(v=>v.code==='family-trait'));
 for(const trait of ['Stamina','Reflexes','Strength','Agility']) {
  s.familyTrait=trait;const d=calc(s);
  assert.equal(d.traits[trait].base,3);assert.equal(d.xpSpent,0);
  assert.equal(Object.values(d.traits).filter(t=>t.base===3).length,1);
  assert.ok(!d.blockers.some(v=>v.code==='family-trait'));
 }
 for(const trait of ['Void','Intelligence','Awareness','Willpower','Perception','Unknown']) {
  s.familyTrait=trait;const d=calc(s);
  assert.ok(d.blockers.some(v=>v.code==='family-trait'));
  assert.ok(Object.values(d.traits).every(t=>t.base===2));
 }
 s.family='Hida';assert.equal(calc(s).familyTrait,'Strength');
 assert.equal(R.resetSection(s,'identity',catalog).familyTrait,'');
});

test('creation benefits, trait/skill prices, rank caps and 40 XP; out of range drafts are not truncated',()=>{
 const s=starting();s.family='Hida';s.traitBuys.Strength=1;s.skills.Defense=3;
 const d=calc(s);assert.equal(d.traits.Strength.base,3);assert.equal(d.traits.Stamina.base,3);
 assert.equal(d.traitCosts.Strength,16);assert.equal(d.skills.Defense.cost,5);assert.equal(d.xpRemaining,19);
 s.traitBuys.Strength=2;s.skills.Defense=5;const draft=calc(s);
 assert.equal(draft.traits.Strength.rank,5);assert.equal(draft.skills.Defense.rank,5);
 assert.ok(draft.blockers.some(v=>v.code==='rank:trait:Strength'));
 assert.ok(draft.blockers.some(v=>v.code==='rank:skill:Defense'));
});
test('Insight boundaries include 250 and all later ranks; Courtier and Etiquette mastery add Insight',()=>{
 for(const [insight,rank] of [[149,1],[150,2],[174,2],[175,3],[199,3],[200,4],[224,4],[225,5],[249,5],[250,6],[274,6],[275,7],[300,8],[325,9]])assert.equal(R.insightRank(insight),rank);
 const s=R.normalize({skills:{Courtier:3,Etiquette:7}}),d=calc(s);assert.equal(d.insight,123);assert.equal(d.masteryInsight,13);
});
test('optional untrained skill display preserves purchases, totals and normal calculations',()=>{
 const s=starting();s.skills.Defense=3;s.ancestors=[{id:'ancestor-shiba',name:'Shiba',cost:0}];
 const original=JSON.stringify(s),normal=calc(s);
 const display=R.calculate(s,catalog,{untrainedSkills:['Defense','Calligraphy','Games: Go','Unknown skill']});
 assert.equal(normal.skills.Calligraphy,undefined);
 assert.equal(display.skills.Calligraphy.rank,0);assert.equal(display.skills.Calligraphy.cost,0);
 assert.equal(display.skills.Calligraphy.roll.notation,'3k3'); // Intelligence 2 plus Shiba's 1k1.
 assert.equal(display.skills['Games: Go'].trait,'Intelligence');
 assert.equal(display.skills['Unknown skill'].roll,null);
 assert.deepEqual(plain(display.skills.Defense),plain(normal.skills.Defense));
 for(const key of ['insight','insightRank','schoolRank','xpRemaining','xpSpent','creationCost'])assert.equal(display[key],normal[key],key);
 for(const key of ['costItems','combat','blockers'])assert.deepEqual(plain(display[key]),plain(normal[key]),key);
 assert.equal(JSON.stringify(s),original,'Untrained display mutated the saved character');
 assert.equal(calc(s).skills.Calligraphy,undefined);
});
test('editable starting XP defaults to 40 and survives advancement without repricing purchases',()=>{
 const legacy=starting();assert.equal(calc(legacy).startingXP,40);
 const s=starting();s.startingXP=75;s.skills.Defense=3;let d=calc(s);assert.equal(d.xpRemaining,70);
 let p=play(s);assert.equal(p.progression.baseline.startingXP,75);
 p=R.award(p,10,'Session award');const spent=calc(p).xpSpent;
 p=change(p,s=>s.startingXP=100);d=calc(p);assert.equal(d.xpSpent,spent);assert.equal(d.xpRemaining,105);
 assert.ok(p.progression.history.some(e=>e.kind==='correction'&&e.label==='Starting XP 75 → 100'));
 const again=R.normalize(plain(p));assert.equal(calc(again).xpRemaining,105);
 s.startingXP=0;assert.equal(calc(s).xpRemaining,-5);
 assert.equal(R.normalize({startingXP:-5}).startingXP,0);
});
test('creation section resets preserve identity, privacy and unrelated purchases while recalculating school grants',()=>{
 const s=starting();s.id='preserved-sheet-id';s.startingXP=80;s.notes='Keep my notes';s.traitBuys.Strength=1;s.skills.Defense=3;
 s.advantages=[{id:'large',name:'Large',baseCost:4}];s.purchases=[{id:'custom',name:'Other purchase',cost:2}];s.abilities=[{id:'power',kind:'custom',name:'Custom power',cost:3}];
 s.exceptions=[{id:'trait-approval',code:'rank:trait:Strength',explanation:'Old trait approval'},{id:'power-approval',code:'ability:power',explanation:'Keep power approval'}];
 const original=JSON.stringify(s),visibility=plain(s.visibility);
 const traits=R.resetSection(s,'traits',catalog);assert.equal(calc(traits).traits.Strength.rank,3);assert.equal(calc(traits).xpSpent,calc(s).xpSpent-16);assert.equal(traits.notes,s.notes);assert.equal(traits.skills.Defense,3);assert.deepEqual(plain(traits.exceptions),[plain(s.exceptions[1])]);
 const skills=R.resetSection(s,'skills',catalog);assert.equal(calc(skills).skills.Defense.rank,1);assert.equal(calc(skills).skills['Heavy Weapons'].rank,1);assert.equal(calc(skills).xpSpent,calc(s).xpSpent-5);assert.equal(skills.traitBuys.Strength,1);
 const options=R.resetSection(s,'options',catalog);assert.equal(calc(options).xpSpent,calc(s).xpSpent-3);assert.equal(options.purchases[0].name,'Other purchase');
 const abilities=R.resetSection(s,'abilities',catalog);assert.equal(abilities.abilities.length,0);assert.equal(calc(abilities).xpSpent,calc(s).xpSpent-3);assert.equal(abilities.notes,s.notes);
 const story=R.resetSection(s,'story',catalog);assert.equal(story.notes,'');assert.equal(story.purchases.length,0);assert.equal(story.startingXP,80);assert.ok(calc(story).equipment.some(e=>e.source==='school'));
 const identity=R.resetSection(s,'identity',catalog);assert.equal(identity.school,'');assert.equal(identity.notes,s.notes);assert.equal(identity.skills.Defense,3);
 const summary=R.resetSection(s,'summary',catalog);assert.equal(summary.startingXP,40);assert.equal(summary.notes,s.notes);assert.equal(summary.school,s.school);
 for(const reset of [traits,skills,options,abilities,story,identity,summary]){assert.equal(reset.id,s.id);assert.deepEqual(plain(reset.visibility),visibility);}
 assert.equal(JSON.stringify(s),original,'Reset mutated the original sheet');
 const nextSchool=starting('Crane','Kakita Bushi');const changed=R.normalize({...s,clan:nextSchool.clan,family:nextSchool.family,school:nextSchool.school});
 const reset=R.resetSection(changed,'skills',catalog);assert.equal(calc(reset).skills.Iaijutsu.rank,1);assert.ok(!calc(reset).skills['Heavy Weapons']);
});
test('creation resets retain automatic spells and required school disadvantages; advancement history is preserved',()=>{
 const shugenja=starting('Crab','Kuni Shugenja');shugenja.abilities=[{id:'custom',name:'Custom',kind:'custom',cost:3}];
 assert.equal(calc(R.resetSection(shugenja,'abilities',catalog)).abilities.filter(a=>a.slug==='universal-spells').length,3);
 const monk=C.schools(catalog).find(s=>/Shinmaki/.test(s.name));assert.ok(monk);
 const s=R.normalize({clan:'Brotherhood of Shinsei',school:monk.slug+'#'+monk.anchor});const reset=R.resetSection(s,'options',catalog);
 assert.ok(reset.disadvantages.some(a=>a.name==='Disturbing Countenance'&&a.free&&a.cost===0));
 const p=play(starting());p.skills.Defense=3;assert.deepEqual(plain(R.resetSection(p,'skills',catalog)),plain(R.normalize(p)));
});
test('free school skills/emphases and purchased emphases are separate; mastery benefits affect unarmed damage',()=>{
 const s=starting();s.emphases['Heavy Weapons']=['Tetsubo'];
 assert.equal(calc(s).creationCost,0); // Already a free school emphasis.
 s.emphases.Defense=['Dodge','Guard'];let d=calc(s);
 assert.equal(d.creationCost,4);assert.ok(d.blockers.some(v=>v.code==='emphases:Defense'));
 s.skills.Defense=3;s.skills.Jiujutsu=7;d=calc(s);
 assert.ok(!d.blockers.some(v=>v.code==='emphases:Defense'));assert.equal(d.combat.unarmedDamage.notation,'4k2');
 assert.ok(d.skills.Jiujutsu.masteries.some(m=>m.rank===7));
});
test('clan and discipline discounts, explicit legacy costs, and disadvantage XP cap',()=>{
 const s=starting();s.advantages=[{name:'Large',baseCost:4},{name:'Strength of the Earth',baseCost:3}];
 assert.deepEqual(plain(calc(s).advantages.map(a=>a.cost)),[3,2]);
 s.clan='Crane';s.advantages=[{name:'Allies',baseCost:4}];assert.equal(calc(s).advantages[0].cost,3);
 s.advantages=[{name:'Large',cost:9}];assert.equal(calc(s).advantages[0].cost,9);
 s.disadvantages=[{name:'Doubt',cost:8},{name:'Bad Health',cost:4}];const d=calc(s);
 assert.equal(d.xpEarned,10);assert.ok(d.blockers.some(v=>v.code==='disadvantages'));
});
test('Brotherhood starts with Void 3, Status 0 through UI, three free kiho and school-specific grants',()=>{
 const s=starting('Brotherhood of Shinsei','Four Temples Monk');let d=calc(s);
 assert.equal(d.traits.Void.base,3);assert.equal(d.freeLimits.kiho,3);assert.equal(d.money.zeni,2);
 s.abilities=[grant('kiho','Air Fist'),grant('kiho','Ride the Water Dragon'),grant('kiho','The Great Silence')];d=calc(s);
 assert.equal(d.abilities[0].cost,0);assert.ok(!d.blockers.some(v=>v.code==='kiho-grants'));
 const more=starting('Brotherhood of Shinsei','Temples of the Thousand Fortunes Monk');assert.equal(calc(more).freeLimits.kiho,4);
});
test('Togashi tattoo progression grants two at ranks 1, 3 and 5, with permanent unarmed school effect',()=>{
 const s=starting('Dragon','The Togashi Tattooed Order');assert.equal(calc(s).freeLimits.tattoos,2);
 const p=play(s);p.training[0].rank=3;assert.equal(calc(p).freeLimits.tattoos,4);assert.equal(calc(p).combat.unarmedDamage.notation,'3k2');
 p.training[0].rank=5;assert.equal(calc(p).freeLimits.tattoos,6);
});
test('kata and kiho eligibility use printed mastery, school requirements, and optional non-Brotherhood costs',()=>{
 const s=starting();s.abilities=[grant('kata','Striking as Earth',{grant:false})];let d=calc(s);
 assert.equal(d.abilities[0].cost,3);assert.equal(d.abilities[0].reasons.length,0); // Hida reduces Kata requirement by 1.
 const monk=starting('Brotherhood of Shinsei','Four Temples Monk');monk.abilities=[grant('kiho','Air Fist',{grant:false})];d=calc(monk);
 assert.equal(d.abilities[0].cost,3);assert.equal(d.abilities[0].reasons.length,0);
 const shugenja=starting('Crab','Kuni Shugenja');shugenja.abilities=[grant('kiho','Air Fist',{grant:false})];d=calc(shugenja);
 assert.equal(d.abilities[0].cost,6);assert.ok(d.abilities[0].reasons.length);
 const tattooed=starting('Dragon','The Togashi Tattooed Order');tattooed.abilities=[grant('kiho','Air Fist',{grant:false})];assert.equal(calc(tattooed).abilities[0].cost,5);
});
test('affinity/deficiency, Void permission, and memorization have separate rules and costs',()=>{
 const s=starting('Crab','Kuni Shugenja');assert.deepEqual(plain(R.spellElements(s,calc(s).school)),{affinities:['Earth'],deficiencies:['Air']});
 const air=catalog.abilities.find(a=>a.kind==='spell'&&a.ring==='Air'&&a.mastery===1);
 s.abilities=[{id:'air',catalogId:air.id,kind:'spell',grant:true}];assert.ok(calc(s).abilities.find(a=>a.selectionId==='air').reasons.length);
 const earth=catalog.abilities.find(a=>a.kind==='spell'&&a.ring==='Earth'&&a.mastery===2);
 s.abilities=[{id:'earth',catalogId:earth.id,kind:'spell',grant:true,memorized:true}];assert.equal(calc(s).abilities.find(a=>a.selectionId==='earth').cost,2);
 const voidSpell=catalog.abilities.find(a=>a.kind==='spell'&&a.ring==='Void'&&a.mastery===1);
 s.abilities=[{id:'void',catalogId:voidSpell.id,kind:'spell',grant:true}];assert.ok(calc(s).abilities.find(a=>a.selectionId==='void').reasons.some(r=>r.includes('Ishiken')));
 const universal=calc(s).abilities.filter(a=>a.slug==='universal-spells');assert.equal(universal.length,3);assert.ok(universal.every(a=>a.cost===0));
});
test('free acquisition cannot bypass kata prices, tattoo progression, or starting spell grants',()=>{
 const bushi=starting();bushi.abilities=[grant('kata','Striking as Earth')];assert.ok(calc(bushi).blockers.some(v=>v.code.startsWith('ability:')));
 const tattooed=starting('Dragon','The Togashi Tattooed Order');const tattoos=catalog.abilities.filter(a=>a.kind==='tattoo').slice(0,3);
 tattooed.abilities=tattoos.map((a,i)=>({id:'tattoo-'+i,catalogId:a.id,kind:'tattoo',grant:i<2}));assert.ok(calc(tattooed).blockers.some(v=>v.code==='ability:tattoo-2'));
 const shugenja=starting('Crab','Kuni Shugenja');const spell=catalog.abilities.find(a=>a.kind==='spell'&&a.ring==='Earth'&&a.mastery===1);
 shugenja.abilities=[{id:'extra',catalogId:spell.id,kind:'spell',grant:false}];assert.ok(calc(shugenja).blockers.some(v=>v.code==='ability:extra'));
});
test('Begin play requires missing choices or explained approval; baseline contains no invented transactions',()=>{
 const s=starting();assert.ok(R.beginPlay(s,catalog).violations.length);
 s.exceptions=[{code:'*',explanation:''}];assert.ok(R.beginPlay(s,catalog).violations.length);
 const p=play(s);assert.equal(p.phase,'advancement');assert.equal(p.progression.history.length,0);assert.equal(p.progression.baseline.spent,calc(s).xpSpent);
 assert.equal(R.beginPlay(p,catalog).sheet.progression.history.length,0);
});
test('maho has no mastery restriction and casts with Insight Rank rather than Taint or shugenja rank',()=>{
 const s=starting();s.schoolDecisions.maho=true;
 const spell=catalog.abilities.find(a=>a.slug==='maho'&&a.mastery===5&&['Air','Earth','Fire','Water'].includes(a.ring));assert.ok(spell);
 s.abilities=[{id:'maho',catalogId:spell.id,kind:'spell'}];
 let d=calc(s),a=d.abilities.find(a=>a.selectionId==='maho');assert.equal(a.reasons.length,0);
 assert.equal(a.spellRoll.notation,R.dicePool(d.insightRank+d.rings[a.ring],d.rings[a.ring]).notation);
 s.taint=6;assert.equal(calc(s).abilities.find(a=>a.selectionId==='maho').spellRoll.notation,a.spellRoll.notation);
});
test('advancement records new rank payments and refunds their paid costs while later discounts stay nonretroactive',()=>{
 let p=play(starting());p=R.award(p,100,'Session 1');p=change(p,s=>s.traitBuys.Strength=1);
 assert.equal(p.progression.history.at(-1).amount,16);assert.equal(calc(p).xpRemaining,124);
 p=change(p,s=>s.skills.Defense=2);assert.equal(p.progression.history.at(-1).amount,2);
 p=change(p,s=>s.skills.Defense=1);assert.equal(p.progression.history.at(-1).kind,'refund');assert.equal(p.progression.history.at(-1).amount,-2);
 p=change(p,s=>s.advantages.push({id:'large',name:'Large',baseCost:4}));assert.equal(p.progression.history.at(-1).amount,3);
 const spent=calc(p).xpSpent;p=change(p,s=>s.clan='Crane');assert.equal(calc(p).xpSpent,spent);
 p=change(p,s=>s.advantages=[]);assert.equal(p.progression.history.at(-1).amount,-3);
});
test('memorization in play charges once and refunds the stored payment; baseline grants remain free after school changes',()=>{
 let p=play(starting('Crab','Kuni Shugenja'));
 const a=catalog.abilities.find(a=>a.kind==='spell'&&a.ring==='Earth'&&a.mastery===1);
 p=change(p,s=>s.abilities.push({id:'spell',catalogId:a.id,kind:'spell'}));assert.equal(p.progression.history.at(-1).amount,0);
 p=change(p,s=>s.abilities[0].memorized=true);assert.equal(p.progression.history.at(-1).amount,1);
 const count=p.progression.history.length;p=change(p,s=>s.notes='changed');assert.equal(p.progression.history.length,count);
 p=change(p,s=>s.abilities[0].memorized=false);assert.equal(p.progression.history.at(-1).amount,-1);
 const base=calc(p).traits.Stamina.base;p=change(p,s=>s.school=starting('Crane','Kakita Bushi').school);assert.equal(calc(p).traits.Stamina.base,base);
});
test('legacy migration preserves selections, custom charges, notes and six privacy choices without duplicate costs',()=>{
 const original={name:'Legacy',school:'sccrab#toc1',clan:'Crab',notes:'a\n\nb',skills:{'Lore:Shadowlands':3},schoolChoices:['Battle'],equipmentChoices:['Light Armor','Tetsubo'],purchases:[{name:'Kenjutsu emphasis',cost:2}],visibility:{identity:false,traits:true,skills:false,options:false,story:false,summary:true},customLegacyField:'keep'};
 const s=R.normalize(original),again=R.normalize(plain(s));assert.deepEqual(plain(s),plain(again));assert.equal(s.customLegacyField,'keep');assert.equal(s.phase,'creation');assert.equal(s.visibility.abilities,false);assert.equal(s.notes,original.notes);
 const p=play(s);assert.equal(calc(p).xpSpent,calc(s).xpSpent);assert.deepEqual(plain(p.purchases),plain(s.purchases));assert.equal(calc(p).xpSpent,7);
});
test('equipment applies armor, weapon skills/masteries, bow strength and arrows without charging XP',()=>{
 const s=starting();s.family='Hida';s.skills.Kenjutsu=3;s.equipment=[{id:'armor',name:'Heavy Armor'},{id:'blade',name:'Katana'},{id:'bow',name:'Yumi'}];s.equipped={armor:true,blade:true,bow:true,arrow:'weapon:Armor Piercing'};
 const d=calc(s);assert.equal(d.combat.armorTN,d.combat.baseArmorTN+10);assert.equal(d.combat.reduction,5);
 const katana=d.combat.weapons.find(w=>w.name==='Katana');assert.equal(katana.damage.notation,'7k2');
 const bow=d.combat.weapons.find(w=>w.name==='Yumi');assert.equal(bow.damage.notation,'4k1');
 assert.equal(d.creationCost,5);
});
test('legacy emphases embedded in skill names survive migration without an invented purchase',()=>{
 const s=R.normalize({skills:{'Kenjutsu (Katana)':3},purchases:[{name:'Katana emphasis',cost:2}]});
 const d=calc(s);assert.deepEqual(plain(d.skills.Kenjutsu.emphases),['Katana']);assert.equal(d.creationCost,8);
 const p=play(s);assert.equal(calc(p).xpSpent,8);assert.equal(p.progression.history.length,0);
});
test('permanent effects and explicit modifiers explain their source',()=>{
 const s=starting();s.advantages=[{name:'Quick Healer',cost:3}];s.disadvantages=[{name:'Bad Health',cost:4}];s.modifiers={armorTN:2,healing:1};
 let d=calc(s);assert.equal(d.combat.wounds.maximum,19);assert.equal(d.combat.healing,12);assert.equal(d.combat.armorTN,17);
 assert.ok(d.blockers.some(v=>v.code==='modifiers'));s.modifierReason='GM approved blessing';assert.ok(!calc(s).blockers.some(v=>v.code==='modifiers'));
});
test('bow attacks use Reflexes and mastery increases bow Strength without exceeding character Strength',()=>{
 const s=starting();s.traitBuys.Reflexes=1;s.skills.Kyujutsu=7;s.equipment=[{id:'bow',name:'Yumi'}];s.equipped={bow:true};
 const d=calc(s),bow=d.combat.weapons[0];assert.equal(bow.attack.notation,'10k3');assert.equal(bow.damage.notation,'5k2');
 s.traitBuys.Strength=2;assert.equal(calc(s).combat.weapons[0].damage.notation,'6k2');
});
test('school ranks are independent; paths replace techniques and advanced schools check printed prerequisites',()=>{
 const creation=starting();creation.modifiers.insight=75;assert.equal(calc(creation).insightRank,3);assert.equal(calc(creation).schoolRank,1);
 const p=play(starting());p.training[0].rank=2;p.skills.Iaijutsu=4;p.traitBuys.Awareness=1;p.traitBuys.Agility=1;
 const path=catalog.training.find(t=>t.name==='Crab Defender');p.training.push({school:path.slug+'#'+path.anchor,rank:1});let d=calc(p);
 assert.ok(d.techniques.some(t=>t.name==='Starting technique'&&t.school==='Crab Defender'));
 assert.ok(!d.techniques.some(t=>t.school==='Hida Bushi'&&t.rank===2));
 assert.equal(d.combat.reduction,0,'A replaced Hida rank-2 technique cannot still grant Reduction');
 p.training[1].rank=2;assert.ok(calc(p).blockers.some(v=>v.message.includes('one replacement technique')));p.training[1].rank=1;
 const advanced=catalog.training.find(t=>t.name==='Defender of the Wall');p.training.push({school:advanced.slug+'#'+advanced.anchor,rank:1});d=calc(p);
 assert.ok(d.blockers.some(v=>v.code.startsWith('training:')&&v.message.includes('Earth 4')));
 p.advantages.push({name:'Multiple Schools',cost:10});assert.ok(!d.abilities.length);
});
test('all 128 masks exclude hidden selected abilities and private history/exceptions from projections, exports and shared print source',()=>{
 const s=starting();s.abilities=[{id:'secret',kind:'custom',name:'SECRET ABILITY',description:'SECRET POWER'}];s.exceptions=[{code:'*',explanation:'PRIVATE APPROVAL'}];s.progression.history=[{kind:'award',amount:10,explanation:'PRIVATE HISTORY'}];
 const d=calc(s),sections=S.sections(s,d);
 assert.ok(!JSON.stringify(sections.identity).includes('SECRET'));assert.ok(!JSON.stringify(sections).includes('PRIVATE'));
 for(let mask=0;mask<128;mask++) {
  const visibility=Object.fromEntries(S.keys.map((k,i)=>[k,!!(mask&(1<<i))]));
  const p=S.project({revision:'r',visibility,sections}),json=JSON.stringify(p);
  assert.equal(json.includes('SECRET ABILITY'),visibility.abilities);
  assert.ok(!json.includes('PRIVATE APPROVAL'));assert.ok(!json.includes('PRIVATE HISTORY'));assert.ok(!json.includes('sheetJson'));
  assert.deepEqual(Object.keys(p.sections),Array.from(S.keys.filter(k=>visibility[k])));
 }
});
test('ten-dice rule describes capped pools without executing dice rolls',()=>{
 for(const [rolled,kept,expected] of [[12,4,'10k5'],[13,9,'10k10+2'],[11,10,'10k10+2'],[10,11,'10k10+2'],[20,10,'10k10+20']])assert.equal(R.dicePool(rolled,kept).notation,expected);
});
test('Kakita, Bayushi, and Daidoji permanent benefits use their printed mechanics',()=>{
 const kakita=starting('Crane','Kakita Bushi');kakita.skills.Iaijutsu=3;assert.equal(calc(kakita).combat.initiative.bonus,6);
 const bayushi=starting('Scorpion','Bayushi Bushi');const d=calc(bayushi);assert.equal(d.combat.initiative.rolled,d.insightRank+d.traits.Reflexes.rank+1);assert.equal(d.combat.initiative.kept,d.traits.Reflexes.rank+1);
 const daidoji=starting('Crane','Daidoji Iron Warrior');daidoji.honor=6.5;assert.equal(calc(daidoji).combat.wounds.healthy,12);assert.equal(calc(daidoji).combat.wounds.maximum,54);
});
test('buying off disadvantages costs the original points and requires explained table permission',()=>{
 const s=starting();s.disadvantages=[{id:'brash',name:'Brash',cost:3}];let p=play(s);
 assert.throws(()=>R.buyOff(p,0,catalog,''));const budget=calc(p).xpRemaining;
 p=R.buyOff(p,0,catalog,'GM approved after months of character growth');assert.equal(p.disadvantages.length,0);
 assert.equal(p.progression.history.at(-1).amount,3);assert.equal(calc(p).xpRemaining,budget-3);assert.equal(calc(p).xpEarned,3);
});
test('explicit price corrections use amounts paid rather than a later quoted discount',()=>{
 let p=play(starting());p=change(p,s=>s.advantages.push({id:'large',name:'Large',baseCost:4}));
 p=change(p,s=>s.clan='Crane');assert.equal(calc(p).advantages[0].cost,3);
 p=change(p,s=>s.advantages[0].customCost=5,'Table corrected the purchase price');assert.equal(calc(p).advantages[0].cost,5);assert.equal(p.progression.history.at(-1).amount,2);
});

// Price facts cross-checked against the old Swift Resources/Advantages.json and
// Resources/Disadvantages.json in tharak/LegendOfTheFiveRings. Consumed's Crane
// price belongs specifically to Perfection, rather than every Shourido variant.
test('clan, family and discipline prices agree with the old Swift rules data',()=>{
 const cases=[
  ["advantages", "Allies", "Crane", 4, 3],
  ["advantages", "Blackmail", "Scorpion", 4, 3],
  ["advantages", "Blood of Osano-Wo", "Crab", 4, 3],
  ["advantages", "Blood of Osano-Wo", "Mantis", 4, 3],
  ["advantages", "Clear Thinker", "Dragon", 3, 2],
  ["advantages", "Crab Hands", "Crab", 3, 2],
  ["advantages", "Crab Hands", "bushi", 3, 2],
  ["advantages", "Crafty", "Scorpion", 3, 2],
  ["advantages", "Crafty", "Spider", 3, 2],
  ["advantages", "Crafty", "ninja", 3, 2],
  ["advantages", "Dangerous Beauty", "Scorpion", 3, 2],
  ["advantages", "Daredevil", "Mantis", 3, 2],
  ["advantages", "Dark Paragon", "Spider", 5, 4],
  ["advantages", "Darling of the Court", "Courtier", 2, 1],
  ["advantages", "Elemental Blessing", "Phoenix", 4, 3],
  ["advantages", "Enlightened", "Dragon", 6, 5],
  ["advantages", "Enlightened", "monk", 6, 5],
  ["advantages", "Friend of the Brotherhood", "Dragon", 5, 4],
  ["advantages", "Friend of the Elements", "Shugenja", 4, 3],
  ["advantages", "Gaijin Gear", "Mantis", 5, 4],
  ["advantages", "Gaijin Gear", "Unicorn", 5, 4],
  ["advantages", "Hands of Stone", "Monk", 6, 5],
  ["advantages", "Heart of Vengeance", "Spider", 5, 4],
  ["advantages", "Irreproachable", "Imperial", 2, 1],
  ["advantages", "Ishiken-Do", "Phoenix", 8, 6],
  ["advantages", "Large", "Crab", 4, 3],
  ["advantages", "Leadership", "Lion", 6, 5],
  ["advantages", "Paragon", "Lion", 7, 6],
  ["advantages", "Quick", "Ninja", 6, 5],
  ["advantages", "Read Lips", "Courtier", 4, 3],
  ["advantages", "Sacrosanct", "Imperial", 4, 3],
  ["advantages", "Sage", "Phoenix", 4, 3],
  ["advantages", "Sage", "shugenja", 4, 3],
  ["advantages", "Silent", "Ninja", 3, 2],
  ["advantages", "Soul of Artistry", "Crane", 4, 3],
  ["advantages", "Soul of Artistry", "courtier", 4, 3],
  ["advantages", "Strength of the Earth", "Bushi", 3, 2],
  ["advantages", "Tactician", "Lion", 4, 3],
  ["advantages", "Tactician", "bushi", 4, 3],
  ["advantages", "Touch of the Spirit Realms", "Shugenja", 5, 4],
  ["advantages", "Way of the Land", "Unicorn", 2, 1],
  ["advantages", "Wealthy", "Crane", 1, 1],
  ["advantages", "Wealthy", "Unicorn", 1, 1],
  ["advantages", "Wealthy", "Imperial", 1, 1],
  ["advantages", "Spy Network", "Daidoji", 8, 7],
  ["advantages", "Spy Network", "Scorpion", 8, 6],
  ["advantages", "Spy Network", "and Kolat", 8, 5],
  ["disadvantages", "Antisocial", "Crab", 2, 3],
  ["disadvantages", "Ascetic", "Dragon", 2, 3],
  ["disadvantages", "Ascetic", "monk", 2, 3],
  ["disadvantages", "Bitter Betrothal", "Imperial", 2, 3],
  ["disadvantages", "Brash", "Lion", 3, 4],
  ["disadvantages", "Consumed", "Spider", 4, 5],
  ["disadvantages", "Consumed", "Crane", 5, 6, "Perfection"],
  ["disadvantages", "Contrary", "Imperial", 3, 4],
  ["disadvantages", "Contrary", "courtier", 3, 4],
  ["disadvantages", "Cursed by the Realm", "shugenja", 4, 5],
  ["disadvantages", "Dark Secret", "ninja", 4, 5],
  ["disadvantages", "Disturbing Countenance", "Spider", 3, 4],
  ["disadvantages", "Epilepsy", "Crane", 4, 5],
  ["disadvantages", "Failure of Bushido", "ninja", 4, 5],
  ["disadvantages", "Forced Retirement", "monk", 4, 5],
  ["disadvantages", "Gaijin Name", "Unicorn", 1, 2],
  ["disadvantages", "Greedy", "Mantis", 3, 4],
  ["disadvantages", "Idealistic", "Lion", 2, 3],
  ["disadvantages", "Insensitive", "Scorpion", 2, 3],
  ["disadvantages", "Obtuse", "Crab", 3, 4],
  ["disadvantages", "Obtuse", "bushi", 3, 4],
  ["disadvantages", "Overconfident", "Lion", 3, 4],
  ["disadvantages", "Overconfident", "Mantis", 3, 4],
  ["disadvantages", "Permanent Wound", "bushi", 4, 5],
  ["disadvantages", "Rumormonger", "courtier", 4, 5],
  ["disadvantages", "Soft-Hearted", "Phoenix", 2, 3],
  ["disadvantages", "Touch of the Void", "Phoenix", 3, 4],
  ["disadvantages", "Wrath of the Kami", "shugenja", 3, 4],
 ];
 for(const [kind,name,who,baseCost,expected,selection] of cases){
  const discipline=['Bushi','Courtier','Monk','Ninja','Shugenja'].find(d=>d.toLowerCase()===who.toLowerCase()) || '';
  const sheet=R.normalize({clan:discipline?'Ronin':who,family:who});
  assert.equal(R.optionCost({name,baseCost,selection},sheet,{discipline},catalog,kind==='disadvantages'),expected,`${name}: ${who}`);
 }
});

test('one adjustment applies once when both clan and discipline qualify, including compound schools',()=>{
 const s=R.normalize({clan:'Crane'});
 assert.equal(R.optionCost({name:'Allies',baseCost:4},s,{discipline:'Courtier'},catalog),3);
 assert.equal(R.optionCost({name:'Soul of Artistry',baseCost:4},s,{discipline:'Courtier'},catalog),3);
 s.clan='Spider';assert.equal(R.optionCost({name:'Crafty',baseCost:3},s,{discipline:'Ninja'},catalog),2);
 s.clan='Crab';assert.equal(R.optionCost({name:'Antisocial',baseCost:4},s,{discipline:'Bushi'},catalog,true),5);
 s.clan='Crane';assert.equal(R.optionCost({name:'Crab Hands',baseCost:3},s,{discipline:'Artisan, Bushi'},catalog),2);
});

test('supplemental label prices, per-rank discounts, and monk affiliations use the printed context',()=>{
 const s=R.normalize({clan:'Spider'});
 assert.equal(R.optionCost({name:'Stolen Identity',baseCost:6},s,null,catalog),5);
 assert.equal(R.optionCost({name:'Student of Shourido',baseCost:9},s,null,catalog),6);
 s.clan='Crane';assert.equal(R.optionCost({name:'Stolen Identity',baseCost:6},s,null,catalog),6);
 assert.equal(R.optionCost({name:'Wealthy',baseCost:5},s,null,catalog),4);
 assert.equal(R.optionCost({name:'Wealthy',baseCost:1},s,null,catalog),1);
 assert.equal(R.optionCost({name:'Well-Connected',baseCost:6},s,{discipline:'Courtier'},catalog),5);
 assert.equal(R.optionCost({name:'Sage of the Sword and Fan',baseCost:7},s,{discipline:'Courtier'},catalog),6);
 assert.equal(R.optionCost({name:'Debt',baseCost:4},s,{discipline:'Courtier'},catalog,true),5);
 assert.equal(R.optionCost({name:'Uncentered',baseCost:2},s,{discipline:'Monk',brotherhood:false},catalog,true),2);
 s.clan='Brotherhood of Shinsei';assert.equal(R.optionCost({name:'Uncentered',baseCost:2},s,{discipline:'Monk',brotherhood:true},catalog,true),4);
});

test('Consumed has variant prices and the Crane bonus applies only to Perfection',()=>{
 const s=R.normalize({clan:'Crane'});
 assert.equal(R.optionCost({name:'Consumed',baseCost:0,selection:'Control'},s,null,catalog,true),4);
 assert.equal(R.optionCost({name:'Consumed',baseCost:0,selection:'Perfection'},s,null,catalog,true),6);
 s.clan='Spider';assert.equal(R.optionCost({name:'Consumed',baseCost:0,selection:'Perfection'},s,null,catalog,true),6);
 assert.equal(R.optionCost({name:'Consumed',baseCost:0,selection:'Determination'},s,null,catalog,true),7);
 s.clan='Crab';assert.equal(R.optionCost({name:'Consumed',baseCost:0,selection:'Perfection'},s,null,catalog,true),5);
});

test('a legitimate Greedy Mantis price has no price blocker and advancement retains paid amounts',()=>{
 const s=starting('Mantis','Yoritomo Courtier');s.disadvantages=[{id:'greedy',name:'Greedy',baseCost:3,customCost:4}];
 let d=calc(s);assert.equal(d.disadvantages[0].cost,4);assert.equal(d.xpEarned,4);
 assert.ok(!d.blockers.some(v=>v.code==='cost:disadvantage:greedy'));
 delete s.disadvantages[0].customCost;const p=play(s);
 const changed=change(p,next=>next.clan='Crab');d=calc(changed);
 assert.equal(changed.progression.baseline.disadvantageCosts.greedy,4);
 assert.equal(d.xpEarned,4);
 const bought=R.buyOff(changed,0,catalog,'GM approved buyoff');assert.equal(bought.progression.history.at(-1).amount,4);
 const legacy=R.normalize({clan:'Mantis',disadvantages:[{name:'Greedy',cost:3}]});
 assert.equal(calc(legacy).disadvantages[0].cost,3);
});
