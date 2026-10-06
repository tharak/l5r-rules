(() => {
  const C = (globalThis.window || globalThis).CharacterCatalog;
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const positive = value => Math.max(0,number(value));
  const integer = value => Math.floor(positive(value));
  const clone = value => JSON.parse(JSON.stringify(value));
  function normalize(input = {}) {
    const s = {...input,version:2,phase:input.phase === 'advancement' ? 'advancement' : 'creation'};
    for (const key of ['name','clan','family','school','concept','notes','heritage','modifierReason']) s[key] ??= '';
    for (const key of ['traitBuys','skills','skillTraits','emphases','legacyEmphases','equipped','modifiers','schoolDecisions']) s[key] = {...input[key]};
    for (const key of ['schoolChoices','equipmentChoices','equipment','advantages','disadvantages','purchases','abilities','ancestors','training','exceptions']) s[key] = (Array.isArray(input[key]) ? input[key] : []).map((e,i) => typeof e === 'object' && e ? {...e,id:e.id || `legacy-${key}-${i}`} : e);
    s.visibility = Object.fromEntries(['identity','traits','skills','options','story','summary','abilities'].map(k => [k,typeof input.visibility?.[k] === 'boolean' ? input.visibility[k] : k === 'identity']));
    s.status = input.status ?? (['Ronin','Brotherhood of Shinsei'].includes(s.clan)?0:1); s.glory = input.glory ?? 1; s.honor = input.honor ?? null; s.taint = input.taint ?? 0; s.woundsTaken=integer(input.woundsTaken);
    s.money = input.money == null ? null : {...input.money};
    s.progression = {...input.progression,history:(input.progression?.history || []).map(e => ({...e}))};
    return s;
  }
  function dicePool(rolled, kept, bonus = 0) {
    rolled = Math.max(0,integer(rolled)); kept = Math.max(0,integer(kept));
    // Core p. 77: each pair of rolled dice above ten becomes one kept die;
    // once keeping ten, each extra rolled/kept die becomes +2.
    if (rolled > 10) {
      const extra = rolled - 10; rolled = 10;
      if (kept < 10) { const converted = Math.min(10-kept,Math.floor(extra/2)); kept += converted; if (kept === 10) bonus += (extra-converted*2)*2; }
      else bonus += extra*2;
    }
    if (kept > 10) { bonus += (kept-10)*2; kept = 10; }
    kept = Math.min(kept,rolled);
    return {rolled,kept,bonus,notation:`${rolled}k${kept}${bonus ? `${bonus > 0 ? '+' : ''}${bonus}` : ''}`};
  }
  const insightRank = insight => insight < 150 ? 1 : 2 + Math.floor((insight-150)/25);
  const has = (s,name) => s.advantages.some(a => a.name.toLowerCase() === name.toLowerCase());
  const flaw = (s,name) => s.disadvantages.some(a => a.name.toLowerCase() === name.toLowerCase());
  const waived = (s,code) => s.exceptions.some(e => (e.code === code || e.code === '*') && String(e.explanation || '').trim());
  function optionCost(entry, s, school, catalog, disadvantage = false) {
    if (entry.free) return 0;
    if (entry.customCost != null) return positive(entry.customCost);
    // Legacy costs are explicit values. Structured selections keep their base price.
    if (entry.baseCost == null) return positive(entry.cost);
    const list = disadvantage ? catalog.disadvantages : catalog.advantages;
    const rule = list.find(a => a.name === entry.name), text = rule?.description || '';
    let cost = positive(entry.baseCost);
    const context = [s.clan,school?.discipline].filter(Boolean);
    for (const who of context) {
      const specific = text.match(new RegExp(`\\b${who} (?:characters|samurai|bushi|shugenja)[^.]*?(?:purchase|gain|worth)[^.]*?(?:for |additional |extra )(\\d+) (?:points?|point)`, 'i'));
      if (specific && !/additional|extra/i.test(specific[0]) && !/points? less/i.test(text.slice(specific.index,specific.index+specific[0].length+12))) cost = Math.min(cost,number(specific[1]));
      const reduction = text.match(new RegExp(`\\b${who} (?:characters|samurai|bushi|shugenja)[^.]*?(\\d+) points? less`, 'i'));
      if (reduction) cost = Math.max(1,cost-number(reduction[1]));
      if (disadvantage && new RegExp(`\\b${who}[^.]*?(?:additional|extra) point`, 'i').test(text)) cost += 1;
    }
    return cost;
  }
  function trainingState(s, school, rank, catalog) {
    const basic = {id:s.school,rank:1,kind:'basic'};
    const state = s.phase === 'advancement' ? (s.training.length ? s.training : [basic]) : [basic,...s.training.filter(t=>C.school(t.school || t.id,catalog)?.kind==='path')];
    const result = [];
    for (const entry of state) {
      const source = C.school(entry.school || entry.id,catalog);
      if (!source) continue;
      const sr = integer(entry.rank) || 1;
      result.push({...entry,school:source,rank:sr});
    }
    return result;
  }
  function spellElements(s, school) {
    const elements = ['Air','Earth','Fire','Water','Void'];
    const description = school?.affinity || '';
    const affinities = elements.filter(e => new RegExp(`Affinity (?:for|with|to) ${e}|${e}[^.]{0,18}Affinity`,'i').test(description));
    const deficiencies = elements.filter(e => new RegExp(`Deficiency (?:for|in|with|to) ${e}|${e}[^.]{0,18}Deficiency`,'i').test(description));
    const pair=description.match(/^\s*(Air|Earth|Fire|Water|Void)\s*\/\s*(Air|Earth|Fire|Water|Void)\s*$/i);
    if(pair){affinities.push(pair[1]);deficiencies.push(pair[2]);}
    if (s.schoolDecisions.affinity && !pair && /select|choose|choosing/i.test(description)) affinities.push(s.schoolDecisions.affinity);
    if (s.schoolDecisions.deficiency && !pair && !/do not have a Deficiency/i.test(description)) deficiencies.push(s.schoolDecisions.deficiency);
    if (s.schoolDecisions.secondDeficiency && /any one other Element/i.test(description)) deficiencies.push(s.schoolDecisions.secondDeficiency);
    return {affinities:[...new Set(affinities)],deficiencies:[...new Set(deficiencies)]};
  }
  function freeAbilityLimits(s, school, schoolRank) {
    const text = school?.techniques?.map(t => t.description).join(' ') || '';
    let kiho = school?.brotherhood ? 3 + Math.max(0,schoolRank-1)*2 : 0;
    if (/Thousand Fortunes/i.test(school?.name || '')) kiho++;
    if (/First Dawn/i.test(school?.name || '')) kiho++;
    if (/begin.*(?:2|two) Kiho/i.test(text)) kiho = 2;
    let tattoos = /Togashi Tattooed/i.test(school?.name || '') ? 2 + (schoolRank>=3 ? 2 : 0) + (schoolRank>=5 ? 2 : 0) : 0;
    if (/begin.*one Tattoo/i.test(text)) tattoos = 1 + (schoolRank>=4 ? 1 : 0);
    const raw = school?.spells || '', spells = {};
    for (const m of raw.matchAll(/(\d+)\s+(Air|Earth|Fire|Water|Void)/gi)) spells[m[2][0].toUpperCase()+m[2].slice(1).toLowerCase()] = number(m[1]);
    if (/affinity/i.test(raw) && s.schoolDecisions.affinity) spells[s.schoolDecisions.affinity] = 3;
    if (/second non-Deficient/i.test(raw) && s.schoolDecisions.spellElement2) spells[s.schoolDecisions.spellElement2] = 1;
    if (/2 spells of a non-Deficient/i.test(raw) && s.schoolDecisions.spellElement1) spells[s.schoolDecisions.spellElement1] = 2;
    if(/3 spells of any one element/i.test(raw)) {
      for(const [i,key] of ['spellElement1','spellElement2','spellElement3','spellElement4'].entries())if(s.schoolDecisions[key])spells[s.schoolDecisions[key]]=[3,2,1,1][i];
    }
    const wildcard = /any five|any 5/i.test(raw) ? 5 : /any six|six|6 spells of your choice/i.test(raw) ? 6 : 0;
    let spellTotal=Object.values(spells).reduce((a,b)=>a+b,0)+wildcard;
    if(/3 spells of any one element/i.test(raw))spellTotal=7;
    if(/3 spells of your elemental Affinity/i.test(raw) || /3 Ward Spells|3 Maho spells/i.test(raw))spellTotal=6;
    const extraSpells=school?.discipline==='Shugenja' && !/Self-Taught/.test(school?.name || '') ? Math.max(0,schoolRank-1)*3 : 0;
    return {kiho,tattoos,spells,wildcard,spellTotal,extraSpells};
  }
  function abilityQuote(entry, s, d, catalog) {
    const a = C.ability(entry.catalogId || entry.id,catalog) || entry;
    const reasons = [], mastery = integer(a.mastery), ring = a.ring;
    const school = d.school, sr = d.schoolRank || 1;
    let cost = 0;
    if (a.kind === 'kata') {
      cost = mastery;
      if (!['Bushi'].includes(school?.discipline)) reasons.push('Kata require a Bushi school, or table permission for another discipline.');
      const available = a.schools || a.fields?.schools || '';
      if (available && !/^Any\b/i.test(available) && !d.training.some(t => available.toLowerCase().includes(t.school.name.replace(/^The /i,'').replace(/ School$/i,'').toLowerCase()))) reasons.push(`Schools: ${available}`);
      const ringMinimum = /Hida Bushi/i.test(school?.name || '') ? (d.rings[ring] || 0)+1 : /Mirumoto Bushi/i.test(school?.name || '') ? Math.max(d.rings[ring] || 0,d.rings.Void) : d.rings[ring] || 0;
      if (ringMinimum < mastery) reasons.push(`${ring} ${mastery} required (including applicable school kata benefit).`);
    } else if (a.kind === 'kiho') {
      cost = mastery;
      let eligible = (d.rings[ring] || 0) + sr;
      if (!school?.brotherhood && !/Hoshi Tsurui/i.test(school?.name || '')) {
        if (school?.discipline === 'Monk') cost = Math.ceil(mastery*1.5);
        else if (school?.discipline === 'Shugenja') {cost=mastery*2;eligible=d.rings[ring] || 0;}
        else if (school?.discipline === 'Ninja') {cost=mastery*2;eligible=sr;}
        else reasons.push('Kiho require monk training or the optional non-Brotherhood rules.');
        if (!s.schoolDecisions.nonBrotherhoodKiho) reasons.push('Record table permission for the optional non-Brotherhood Kiho rules.');
      }
      if (/Seven Thunders/i.test(school?.name || '') && s.schoolDecisions.kihoElement===ring) eligible++;
      if (eligible < mastery) reasons.push(`Kiho Mastery ${mastery} exceeds your eligible ${ring} rank ${eligible}.`);
    } else if (a.kind === 'spell') {
      const maho = a.slug === 'maho';
      if (school?.discipline !== 'Shugenja' && !maho && !/Void Mystic/i.test(school?.name || '')) reasons.push('Spells require shugenja training.');
      const elements = spellElements(s,school);
      let effective = sr + number(elements.affinities.includes(ring)) - number(elements.deficiencies.includes(ring));
      if(/Yogo Wardmaster/i.test(school?.name || '')) {
        effective=sr+number(/Wards/i.test(a.fields?.['ring/mastery'] || ''))-number(/Travel|Craft/i.test(a.fields?.['ring/mastery'] || ''));
      }
      if(/Chuda Shugenja/i.test(school?.name || '') && maho && ring!=='Void')effective++;
      // Core p. 267: learned maho has no mastery restriction, even for a new caster.
      if(maho)effective=Infinity;
      if (/Self-Taught/i.test(school?.name || '') && elements.deficiencies.includes(ring) && s.phase==='creation')reasons.push('Self-Taught starting spells cannot use a Deficient element.');
      if (/Void Mystic/i.test(school?.name || '') && ring === 'Void') effective=Math.min(5,sr);
      if (mastery>effective) reasons.push(`${ring} Mastery ${mastery} exceeds effective School Rank ${effective}.`);
      if (ring==='Void' && !has(s,'Ishiken-Do') && !/Void Mystic/i.test(school?.name || '') && !maho) reasons.push('Void spells require Ishiken-Do.');
      if (maho && !s.schoolDecisions.maho) reasons.push('Maho requires recorded forbidden training and table permission.');
      cost = entry.memorized ? mastery : 0;
    } else if (a.kind === 'tattoo') {
      if (!d.freeLimits.tattoos) reasons.push('This school does not grant mystical tattoos.');
    } else if (a.kind === 'shadowlands') {
      if (!s.schoolDecisions.shadowlands) reasons.push('Record table permission and the acquired Taint power.');
      if (number(s.taint)<1) reasons.push('Shadowlands powers require Taint.');
    } else cost = positive(entry.cost);
    if (entry.grant && a.kind!=='spell' || entry.grant && !entry.memorized) cost=0;
    if (entry.customCost!=null) cost=positive(entry.customCost);
    const castRing=d.rings[ring],elements=spellElements(s,school);
    const castingRank=a.slug==='maho' ? d.insightRank : sr+number(elements.affinities.includes(ring))-number(elements.deficiencies.includes(ring));
    const spellRoll=a.kind==='spell' && castRing ? dicePool(castingRank+castRing+number(d.skills.Spellcraft?.rank>=5),castRing) : null;
    return {...a,spellRoll,selectionId:entry.id,memorized:!!entry.memorized,grant:!!entry.grant,cost,reasons};
  }
  function calculate(input, catalog) {
    const s = normalize(input);
    const clan = catalog.clans.find(c => c.name === s.clan), family = clan?.families.find(f => f.name === s.family), school=C.school(s.school,catalog);
    const baseline = s.phase==='advancement' ? s.progression.baseline : null;
    const traits={},rings={},traitCosts={},costItems={};
    const addCost=(id,cost,label)=>{costItems[id]={cost:positive(cost),label};};
    for (const group of C.TRAIT_GROUPS) {
      for (const trait of group.traits) {
        const base = baseline?.traitBases?.[trait] ?? (2+number(family?.trait===trait)+number(school?.benefit===trait)+number(trait==='Void' && !!school?.brotherhood));
        const rank=base+integer(s.traitBuys[trait]);
        traits[trait]={base,rank};traitCosts[trait]=C.purchasedRankCost(base,rank,trait==='Void'?6:4);
        for(let r=base+1;r<=rank;r++)addCost(`trait:${trait}:${r}`,r*(trait==='Void'?6:4),`${trait} ${r}`);
      }
      rings[group.ring]=group.ring==='Void'?traits.Void.rank:Math.min(...group.traits.map(t=>traits[t].rank));
    }
    const grants = C.schoolGrants(school,s,catalog), starting=baseline?.skillGrants || grants.skills, skills={},purchased={},legacyEmphases={...s.legacyEmphases};
    for(const [value,rank] of Object.entries(s.skills)) {
      const {name,emphases}=C.skillIdentity(value,catalog);purchased[name]=Math.max(purchased[name] || 0,integer(rank));
      if(emphases.length)legacyEmphases[name]=[...new Set([...(legacyEmphases[name] || []),...emphases])];
    }
    for(const name of new Set([...Object.keys(starting),...Object.keys(purchased)])) {
      const base=starting[name]?.base || 0,rank=Math.max(base,purchased[name] || 0);
      if(!rank)continue;
      const trait=C.skillTrait(name,s,catalog),traitRank=traits[trait]?.rank;
      const emphases=[...new Set([...(starting[name]?.emphases || []),...(legacyEmphases[name] || []),...(s.emphases[name] || [])])];
      const entry=catalog.skills.find(e=>e.name===name.split(':')[0]);
      const masteries=(entry?.masteries || []).filter(m=>m.rank<=rank);
      if(rank>=10)masteries.push({rank:10,description:'One Free Raise on all rolls using this skill.'});
      skills[name]={base,rank,trait,traitRank:traitRank ?? null,roll:traitRank?dicePool(rank+traitRank,traitRank):null,emphases,masteries,notes:starting[name]?.notes || '',cost:C.purchasedRankCost(base,rank),slug:entry?.slug || 'skills'};
      for(let r=base+1;r<=rank;r++)addCost(`skill:${name}:${r}`,r,`${name} ${r}`);
      for(const emphasis of s.emphases[name] || [])if(!(starting[name]?.emphases || []).includes(emphasis))addCost(`emphasis:${name}:${emphasis}`,2,`${name} (${emphasis})`);
    }
    const advantages=s.advantages.map(e=>({...e,cost:optionCost(e,s,school,catalog)}));
    const disadvantages=s.disadvantages.map(e=>({...e,cost:optionCost(e,s,school,catalog,true)}));
    for(const a of advantages)addCost(`advantage:${a.id}`,a.cost,a.name);
    for(const a of s.ancestors)addCost(`ancestor:${a.id}`,a.cost ?? catalog.ancestors?.find(e=>e.id===a.catalogId)?.cost,a.name);
    for(const a of s.purchases)addCost(`custom:${a.id}`,a.cost,a.name);
    const disadvantageTotal=disadvantages.reduce((sum,e)=>sum+e.cost,0),xpEarned=baseline?.earned ?? Math.min(10,disadvantageTotal);
    const roninFamilyCost=s.clan==='Ronin' && family?5:0;
    addCost('ronin-family',baseline?.roninFamilyCost ?? roninFamilyCost,'Ronin family');
    let masteryInsight=0;
    for(const [name,skill] of Object.entries(skills)) {
      if(['Courtier','Etiquette'].includes(name))masteryInsight+=(skill.rank>=3?3:0)+(skill.rank>=7?7:0);
    }
    const insight=Object.values(rings).reduce((a,b)=>a+b,0)*10+Object.values(skills).reduce((sum,e)=>sum+e.rank,0)+masteryInsight+number(s.modifiers.insight);
    const ir=insightRank(insight),training=trainingState(s,school,ir,catalog);
    const schoolRank=training.find(t=>t.school.slug===school?.slug && t.school.anchor===school?.anchor)?.rank || 1;
    const freeLimits=freeAbilityLimits(s,school,schoolRank);
    const d={family,school,traits,rings,traitCosts,skills,schoolRank,training,freeLimits,insight,insightRank:ir,masteryInsight,advantages,disadvantages,costItems,skillChoiceErrors:grants.errors,roninFamilyCost,disadvantageTotal,xpEarned};
    d.ancestors=s.ancestors.map(a=>({...catalog.ancestors?.find(e=>e.id===a.catalogId),...a}));
    const abilities=s.abilities.map(e=>abilityQuote(e,s,d,catalog));
    // Universal spells are free school grants, stored in the private Abilities section.
    if(school?.spells && /Sense|Commune|Summon/i.test(school.spells))for(const a of catalog.abilities || [])if(a.slug==='universal-spells' && /^(Sense|Commune|Summon)$/i.test(a.name) && !abilities.some(e=>e.id===a.id))abilities.push({...a,selectionId:`school-${a.id}`,grant:true,cost:0,reasons:[]});
    for(const a of abilities) {
      const memorization=a.kind==='spell' && a.memorized ? a.mastery : 0;
      addCost(`ability:${a.selectionId}`,Math.max(0,a.cost-memorization),a.name);
      if(memorization)addCost(`memorize:${a.selectionId}`,memorization,`${a.name} (memorized)`);
    }
    d.abilities=abilities;
    d.techniques=training.flatMap(t=>(t.school.techniques?.length ? t.school.techniques : t.school.kind==='path'?[{name:t.school.name,rank:1,description:t.school.description}]:[]).filter(e=>(e.rank || 1)<=t.rank).map(e=>({...e,school:t.school.name,schoolRank:t.rank})));
    // Alternate paths replace the specified rank of their original school.
    for(const t of training.filter(t=>t.school.kind==='path')) {
      const replacement=t.replaces || t.school.replaces || '';
      const replacements=[...replacement.matchAll(/([^,;]+?)\s+(?:School\s+)?(?:Rank\s+)?(\d+)\b/gi)];
      for(const match of replacements) {
        const names=match[1].replace(/^\s*(?:or|and)\s+/i,'').split(/\s+or\s+/i).map(name=>name.trim().replace(/ School$/i,'').toLowerCase());
        d.techniques=d.techniques.filter(e=>!(names.some(name=>e.school.toLowerCase().includes(name)) && e.rank===number(match[2])));
      }
    }
    const trained=(pattern,rank=1)=>d.techniques.some(t=>pattern.test(t.school) && (t.rank || 1)===rank);
    const outfit=baseline?.outfit || (school?.equipment || []).map((e,i)=>({name:e.choice?s.equipmentChoices[i]?.trim() || e.name:e.name,source:'school',choice:e.choice,pending:e.choice&&!s.equipmentChoices[i]?.trim(),index:i,key:`school:${i}`}));
    d.equipment=[...outfit,...s.equipment.map((e,i)=>({...e,source:'personal',index:i,key:e.id}))].map(e=>({...e,item:C.item(e.catalogId || e.name,catalog),equipped:!!s.equipped[e.key]}));
    // Daisho is two weapons, rather than an opaque equipment string.
    for(const e of [...d.equipment])if(/^daisho$/i.test(e.name))for(const name of ['Katana','Wakizashi'])d.equipment.push({...e,name,key:`${e.key}:${name}`,item:C.item(name,catalog),equipped:!!s.equipped[`${e.key}:${name}`]});
    d.money=s.money || baseline?.money || school?.money || {};
    d.honor=s.honor ?? (school?.honor ?? 0)+(has(s,'Virtuous')?1:0);
    d.glory=number(s.glory)+(s.phase==='creation'&&has(s,'Fame')?1:0);d.status=number(s.status);d.taint=number(s.taint);
    const mods=s.modifiers,armor=d.equipment.filter(e=>e.equipped && e.item?.kind==='armor'),activeArmor=armor[0]?.item;
    let initiativeFlat=number(mods.initiativeFlat)+(skills.Battle?.rank>=5?skills.Battle.rank:0);
    let tn=traits.Reflexes.rank*5+5+number(activeArmor?.tn)+number(mods.armorTN),reduction=number(activeArmor?.reduction)+number(mods.reduction);
    // These persistent school effects apply without activation.
    if(trained(/Kakita Bushi/i))initiativeFlat+=(skills.Iaijutsu?.rank || 0)*2;
    if(trained(/Kitsuki Investigator/i))tn+=traits.Perception.rank;
    if(trained(/Hida Bushi/i,2))reduction+=rings.Earth;
    const tattooNames=abilities.filter(a=>a.kind==='tattoo').map(a=>a.name.toLowerCase());
    const earth=Math.max(1,rings.Earth-number(flaw(s,'Bad Health')));
    const ironWarrior=/Daidoji Iron Warrior/.test(school?.name || '') ? Math.max(1,Math.floor(d.honor)-4) : 0;
    const woundExtra=abilities.some(a=>a.kind==='shadowlands' && /Blessing of The Dark One/i.test(a.name))?3:0;
    let woundTotal=0;
    const levels=C.WOUND_LEVELS.map((label,i)=>{const capacity=Math.max(1,earth*(i===0?5:2)+ironWarrior+woundExtra+number(mods.wounds)),start=i===0?0:woundTotal+1;woundTotal+=capacity;return {label,capacity,start,total:woundTotal};});
    const ancestorNames=s.ancestors.map(a=>a.name.toLowerCase());
    if(ancestorNames.includes('shiba'))tn+=traits.Intelligence.rank;
    const ancestorDamage=ancestorNames.includes('hida')?1:0;
    const jiujutsu=skills.Jiujutsu?.rank || 0;
    const togashiBonus=trained(/Togashi Tattooed/,2) ? 1 : 0;
    const unarmedRoll=traits.Strength.rank+ancestorDamage+togashiBonus+(jiujutsu>=3?1:0)-number(flaw(s,'Small'))+number(mods.unarmedRoll);
    const unarmedKeep=1+togashiBonus+(jiujutsu>=7?1:0)+number(trained(/Temple of Osano-Wo/i))+number(mods.unarmedKeep);
    const weapons=d.equipment.filter(e=>e.equipped && e.item?.kind==='weapon' && e.item.type!=='Arrow').map(e=>{
      const w=e.item,skill={Sword:'Kenjutsu',Knife:'Knives',Knives:'Knives',Bow:'Kyujutsu','Heavy Weapon':'Heavy Weapons',Heavy:'Heavy Weapons','Chain Weapon':'Chain Weapons',Chain:'Chain Weapons',Spear:'Spears',Polearm:'Polearms',Stave:'Staves','War Fan':'War Fan','Ninja Weapon':'Ninjutsu'}[w.type] || w.type;
      const sk=skills[skill],rank=sk?.rank || 0;
      const dr=(w.dr || '').match(/(\d+)k(\d+)/),bow=w.type==='Bow';
      const arrow=C.item(s.equipped.arrow,catalog),adr=(arrow?.dr || '2k2').match(/(\d+)k(\d+)/);
      const damage=bow?adr:dr;
      const strength=bow?Math.min(traits.Strength.rank,number(String(w.strength || '0').match(/\d+/)?.[0])+number(rank>=7)):traits.Strength.rank;
      const sword=skill==='Kenjutsu',ninja=skill==='Ninjutsu';
      const bonusRoll=ancestorDamage+(sword && rank>=3?1:0)+(ninja && rank>=3?1:0)+number(has(s,'Large') && /Large/.test(w.keywords || '') && !bow)-number(flaw(s,'Small') && !bow)+number(trained(/Hida Bushi/i) && skill==='Heavy Weapons');
      const attackTrait=traits[s.skillTraits[skill] || (bow?'Reflexes':ninja?'Reflexes':'Agility')]?.rank || traits.Agility.rank;
      return {name:e.name,skill,ignoreReduction:(ancestorNames.includes('hida')?4:0)+(skill==='Heavy Weapons'&&rank>=3?2:0),attack:dicePool(rank+attackTrait+number(has(s,'Prodigy') && sk?.base)+number(trained(/Utaku Infantry/) && skill===s.schoolDecisions.weaponFocus),attackTrait),damage:damage?dicePool(strength+number(damage[1])+bonusRoll,number(damage[2])+(ninja&&rank>=7?1:0)):null,special:w.special || '',explodes:!ninja || rank>=5,explodeOn:rank>=7&&['Kenjutsu','Heavy Weapons'].includes(skill)?9:10,untrained:!rank};
    });
    d.combat={initiative:dicePool(ir+traits.Reflexes.rank+number(trained(/Bayushi Bushi/))+number(mods.initiativeRoll),traits.Reflexes.rank+number(trained(/Bayushi Bushi/))+number(mods.initiativeKeep),initiativeFlat),baseArmorTN:traits.Reflexes.rank*5+5,armorTN:tn,reduction,armor:activeArmor?.name || '',armorPenalty:activeArmor?.special || '',healing:(traits.Stamina.rank+(has(s,'Quick Healer')?2:0))*2+ir+number(mods.healing),unarmedDamage:dicePool(unarmedRoll,unarmedKeep),unarmedAttack:dicePool(jiujutsu+traits.Agility.rank+togashiBonus,traits.Agility.rank+togashiBonus),voidPoints:rings.Void,wounds:{healthy:levels[0].capacity,perLevel:levels[1].capacity,maximum:woundTotal,current:s.woundsTaken,currentLevel:levels.find(e=>s.woundsTaken<=e.total)?.label || 'Dead',levels},woundPenaltyReduction:has(s,'Strength of the Earth')?3:0,movementWater:flaw(s,'Lame')?1:Math.max(1,rings.Water-number(flaw(s,'Small'))),weapons};
    for(const [name,skill] of Object.entries(skills)) {
      skill.armorTNPenalty=0;
      if(activeArmor?.name==='Light Armor' && ['Athletics','Stealth'].includes(name))skill.armorTNPenalty=5;
      if(activeArmor?.name==='Heavy Armor' && ['Agility','Reflexes'].includes(skill.trait) && (!trained(/Hida Bushi/) || name==='Stealth'))skill.armorTNPenalty=5;
      let bonus=0,kept=0;
      if(ancestorNames.includes('shiba') && skill.trait==='Intelligence'){bonus++;kept++;}
      if(name==='Forgery' && skill.rank>=3)bonus++;if(name==='Forgery' && skill.rank>=7)kept++;
      if(has(s,'Prodigy') && skill.base)bonus++;
      if(trained(/Kakita Artisan/) && name===s.schoolDecisions.chosenArt)bonus+=2;
      if(trained(/Otomo Diplomat/) && name==='Etiquette')bonus++;
      if(trained(/First Dawn Scholars/) && (name==='Etiquette' || name.startsWith('Lore:')))bonus++;
      const override=mods.skillRoll?.[name] || {};
      if(skill.traitRank)skill.roll=dicePool(skill.rank+skill.traitRank+bonus+number(override.rolled),skill.traitRank+kept+number(override.kept),number(override.bonus));
    }
    d.creationCost=Object.values(costItems).reduce((sum,e)=>sum+e.cost,0);
    const history=s.progression.history;
    d.xpAwards=history.filter(e=>e.kind==='award').reduce((sum,e)=>sum+number(e.amount),0);
    d.xpSpent=baseline ? number(baseline.spent)+history.filter(e=>['purchase','refund','correction'].includes(e.kind)).reduce((sum,e)=>sum+number(e.amount),0) : d.creationCost;
    d.xpRemaining=40+xpEarned+d.xpAwards-d.xpSpent;
    if(baseline) {
      const payments=paidItems(s);
      for(const a of d.advantages){a.quoteCost=a.cost;a.cost=payments[`advantage:${a.id}`]?.cost ?? a.cost;}
      for(const a of d.abilities){a.quoteCost=a.cost;a.cost=(payments[`ability:${a.selectionId}`]?.cost || 0)+(payments[`memorize:${a.selectionId}`]?.cost || 0);}
    }
    d.violations=validate(s,d,catalog,armor);
    d.blockers=d.violations.filter(v=>!v.approved);
    return d;
  }
  function validate(s,d,catalog,armor) {
    const violations=[];
    const issue=(code,message)=>violations.push({code,message,approved:waived(s,code),explanation:s.exceptions.find(e=>e.code===code || e.code==='*')?.explanation || ''});
    if(!s.name.trim())issue('name','Enter a character name.');
    if(!s.clan)issue('clan','Choose a clan or Brotherhood.');
    const clan=catalog.clans.find(c=>c.name===s.clan);
    if(clan?.families.length && !d.family)issue('family','Choose a family.');
    if(d.school && s.phase==='creation' && !clan?.schools.some(school=>`${school.slug}#${school.anchor}`===s.school) && !has(s,'Different School'))issue('different-school','A school outside your clan requires Different School or an explained table exception.');
    if(!d.school)issue('school','Choose a starting school.');
    if(d.school?.nonhuman)issue('nonhuman-system','This legacy sheet uses a nonhuman system. Continue with custom entries and its book reference.');
    if(s.clan==='Imperial')issue('imperial','Imperial families require table approval.');
    const limit=s.phase==='creation'?4:10;
    for(const [name,t] of Object.entries(d.traits))if(t.rank>limit)issue(`rank:trait:${name}`,`${name} ${t.rank} exceeds the ${s.phase} limit of ${limit}.`);
    for(const [name,k] of Object.entries(d.skills)) {
      if(k.rank>limit)issue(`rank:skill:${name}`,`${name} ${k.rank} exceeds the ${s.phase} limit of ${limit}.`);
      const max=Math.min(5,Math.ceil(k.rank/2));
      if(k.emphases.length>max)issue(`emphases:${name}`,`${name} permits ${max} emphasis${max===1?'':'es'} at Rank ${k.rank}, including free emphases.`);
    }
    for(const name of Object.keys(s.emphases))if(!d.skills[name] && s.emphases[name].length)issue(`emphases:${name}`,`${name} must have at least one rank before an emphasis can be purchased.`);
    if(d.xpRemaining<0)issue('xp',`XP budget exceeded by ${-d.xpRemaining}.`);
    if(s.phase==='creation' && d.disadvantageTotal>10)issue('disadvantages','Creation permits at most 10 XP from disadvantages. Excess disadvantages require table approval and grant no additional XP.');
    if(has(s,'Large') && flaw(s,'Small'))issue('size','Large and Small are incompatible.');
    if(s.phase==='creation' && has(s,'Multiple Schools'))issue('multiple-schools','Multiple Schools may only be purchased during play.');
    for(const [i,c] of (d.school?.skillChoices || []).entries()) {
      if(!s.schoolChoices[i]?.trim() && s.phase==='creation')issue(`school-choice:${i}`,`Complete school choice: ${c.prompt}.`);
      if(d.skillChoiceErrors[i])issue(`school-choice:${i}`,d.skillChoiceErrors[i]);
    }
    for(const e of d.equipment)if(e.pending)issue(`equipment:${e.key}`,`Choose equipment: ${e.name}.`);
    if(armor.length>1)issue('armor','Equip only one suit of armor.');
    for(const [key,a] of Object.entries(s.equipped))if(a && key!=='arrow' && !d.equipment.some(e=>e.key===key))issue(`equipment-missing:${key}`,'An equipped item is no longer in your outfit.');
    const counts={kiho:0,tattoo:0,spell:0},spellCounts={};
    for(const a of d.abilities) {
      for(const reason of a.reasons || [])issue(`ability:${a.selectionId}`,`${a.name}: ${reason}`);
      if(a.kind==='tattoo' && !a.grant)issue(`ability:${a.selectionId}`,`${a.name}: mystical tattoos must use a school tattoo grant.`);
      if(a.kind==='kata' && a.grant)issue(`ability:${a.selectionId}`,`${a.name}: kata cost their Mastery Rank in XP; explain a printed free grant or table exception.`);
      if(s.phase==='creation' && a.kind==='spell' && !a.grant && a.slug!=='universal-spells')issue(`ability:${a.selectionId}`,`${a.name}: additional learned scrolls at creation require a recorded source and table exception.`);
      if(a.grant && ['kiho','tattoo','spell'].includes(a.kind) && a.slug!=='universal-spells') {
        counts[a.kind]++;
        if(a.kind==='spell')spellCounts[a.ring]=(spellCounts[a.ring] || 0)+1;
      }
    }
    if(d.freeLimits.kiho!==counts.kiho && (d.freeLimits.kiho || counts.kiho))issue('kiho-grants',`Choose ${d.freeLimits.kiho} free Kiho; ${counts.kiho} selected.`);
    if(d.freeLimits.tattoos!==counts.tattoo && (d.freeLimits.tattoos || counts.tattoo))issue('tattoo-grants',`Choose ${d.freeLimits.tattoos} tattoos; ${counts.tattoo} selected.`);
    const paidKiho=d.abilities.filter(a=>a.kind==='kiho'&&!a.grant).length;
    const monkRank=d.training.filter(t=>t.school.discipline==='Monk').reduce((sum,t)=>sum+t.rank,0);
    if(paidKiho>monkRank && d.school?.discipline==='Monk')issue('kiho-purchases',`Purchased bonus Kiho cannot exceed cumulative Monk School Rank ${monkRank}.`);
    if(s.phase==='advancement' && d.school?.spells && counts.spell>d.freeLimits.spellTotal+d.freeLimits.extraSpells)issue('spell-grants',`School progression grants at most ${d.freeLimits.spellTotal+d.freeLimits.extraSpells} chosen spells; record additional acquired scrolls as learned spells.`);
    if(s.phase==='creation' && d.school?.spells) {
      if(counts.spell!==d.freeLimits.spellTotal)issue('spell-grants',`Select ${d.freeLimits.spellTotal} starting spells; ${counts.spell} selected. Universal spells are granted separately.`);
      if(!d.freeLimits.wildcard)for(const [ring,needed] of Object.entries(d.freeLimits.spells))if((spellCounts[ring] || 0)!==needed)issue(`spell-grants:${ring}`,`Choose ${needed} starting ${ring} spells.`);
      if(/choose|select|varies|any one non-Void/i.test(d.school.affinity || '') && !s.schoolDecisions.affinity)issue('affinity','Choose the school’s elemental affinity and deficiency.');
      if(/3 spells of any one element/i.test(d.school.spells)) {
        const choices=['spellElement1','spellElement2','spellElement3','spellElement4'].map(k=>s.schoolDecisions[k]);
        if(choices.some(v=>!v) || new Set(choices).size!==4)issue('spell-elements','Select four distinct starting spell elements (3, 2, 1, 1 spells).');
      }
      if(/3 Ward Spells/i.test(d.school.spells) && d.abilities.filter(a=>a.grant && /Wards/i.test(a.fields?.['ring/mastery'] || '')).length!==3)issue('spell-wards','Choose three starting spells with the Wards keyword.');
      if(/any one other Element/i.test(d.school.affinity) && !s.schoolDecisions.secondDeficiency)issue('second-deficiency','Choose the additional elemental deficiency.');
    }
    if(/Kakita Artisan/.test(d.school?.name || '')) {
      const chosen=s.schoolDecisions.chosenArt;
      if(!chosen || !d.skills[chosen]?.base || !/^(Acting|Artisan:|Perform:)/.test(chosen))issue('chosen-art','Select one granted art as the focus of your Kakita Artisan training.');
    }
    if(/Utaku Infantry/.test(d.school?.name || '') && (!['Kenjutsu','Polearms','Spears'].includes(s.schoolDecisions.weaponFocus) || !s.schoolDecisions.weaponEmphasis))issue('weapon-focus','Select Kenjutsu, Polearms, or Spears and the free emphasis for Utaku Infantry training.');
    if(/Fudoist/i.test(d.school?.name || '') && !s.schoolDecisions.fudoistFocus)issue('fudoist-choice','Choose the Fudoist social or attack specialty, and the school’s high or low starting Honor.');
    if(/Seven Thunders/i.test(d.school?.name || '')) {
      if(!s.schoolDecisions.kihoElement)issue('kiho-element','Choose the shrine’s Kiho element.');
      if(d.abilities.some(a=>a.kind==='kiho' && a.grant && a.ring!==s.schoolDecisions.kihoElement))issue('kiho-element','Starting Shrine Kiho must share the chosen element.');
    }
    if(/First Dawn/i.test(d.school?.name || '') && !d.abilities.some(a=>a.kind==='kiho' && a.grant && a.type==='Mystical'))issue('kiho-mystical','First Dawn Scholars grant one additional Mystical Kiho.');
    if(/Shinmaki/i.test(d.school?.name || '') && !flaw(s,'Disturbing Countenance'))issue('shinmaki-grant','Record Disturbing Countenance as a free disadvantage.');
    for(const [kind,entries] of [['advantage',s.advantages],['disadvantage',s.disadvantages]])for(const entry of entries) {
      const rule=catalog[kind==='advantage'?'advantages':'disadvantages'].find(a=>a.name===entry.name);
      if(entry.baseCost!=null && entry.customCost!=null && rule?.costs.length===1 && !/rank|varies|variable/i.test(rule.label)) {
        const expected=optionCost({...entry,customCost:null},s,d.school,catalog,kind==='disadvantage');
        if(s.phase==='creation' && entry.customCost!==expected)issue(`cost:${kind}:${entry.id}`,`${entry.name} costs ${expected} XP here; explain a different table price.`);
      }
      if(s.phase==='advancement' && !s.progression.baseline?.costItems?.[`${kind}:${entry.id}`] && kind==='advantage') {
        const payment=s.progression.history.find(e=>e.key===`${kind}:${entry.id}` && e.kind==='purchase');
        if(payment && !payment.explanation)issue(`advancement:${kind}:${entry.id}`,`${entry.name}: record table approval for gaining this ${rule?.label.match(/\[([^]]+)\]/)?.[1] || ''} advantage during play.`);
      }
      if(entry.baseCost!=null && rule?.costs.length===0 && !entry.customCost && !entry.baseCost)issue(`option-choice:${kind}:${entry.id}`,`Set the variable cost and specific choice for ${entry.name}.`);
      if(entry.baseCost!=null && /Great Potential|Different School|Chosen by the Oracles|Kharmic Tie|Sacred Weapon|Ally|Allies|Blackmail|Perceived Honor|Languages|Luck|Doubt|Phobia|Dark Secret/i.test(entry.name) && !String(entry.selection || '').trim())issue(`option-choice:${kind}:${entry.id}`,`Record the skill, rank, person, or specific choice required by ${entry.name}.`);
    }
    for(const a of s.ancestors) {
      const rule=catalog.ancestors?.find(e=>e.id===a.catalogId);
      if(rule?.clan && !rule.clan.toLowerCase().includes(s.clan.toLowerCase()))issue(`ancestor:${a.id}`,`${a.name} only advises members of ${rule.clan}.`);
    }
    const schools=d.training.filter(t=>t.school.kind!=='path');
    if(schools.reduce((sum,t)=>sum+t.rank,0)>d.insightRank)issue('training-ranks','Combined School Ranks cannot exceed Insight Rank.');
    if(schools.filter(t=>t.school.kind==='advanced').length>1)issue('training-advanced','A character may take ranks in only one Advanced School.');
    if(schools.length>1 && !has(s,'Multiple Schools') && !schools.some(t=>t.school.kind==='advanced') && s.clan!=='Ronin' && !d.school?.brotherhood)issue('training-multiple','A second basic school requires Multiple Schools.');
    if(schools.some(t=>t.school.discipline==='Bushi') && schools.some(t=>t.school.discipline==='Shugenja'))issue('training-disciplines','Bushi and Shugenja schools cannot be combined.');
    for(const t of d.training) {
      const id=t.school.slug+'#'+t.school.anchor;
      if(t.rank>5 && t.school.kind!=='path' && !['Shugenja','Monk'].includes(t.school.discipline))issue(`training:${id}:rank`,'Basic Bushi and Courtier schools have five ranks; choose another school for further techniques.');
      if(t.school.kind==='path') {
        if(t.rank!==1)issue(`training:${id}:rank`,'Alternate paths grant one replacement technique, rather than multiple School Ranks.');
        const replaces=t.school.replaces.match(/\b(?:Rank\s+)?(\d+)\b/i);
        if(replaces && d.insightRank<number(replaces[1]))issue(`training:${id}:rank`,`Path replaces Rank ${replaces[1]}.`);
        if(!t.school.replaces)issue(`training:${id}:requirements`,'Check this path’s replacement rank and school in its printed requirements.');
      }
      const requirements=t.school.requirements || '';
      const unknown=[];
      for(const part of requirements.split(/,|;/).map(p=>p.trim()).filter(Boolean)) {
        const m=part.match(/^([A-Za-z :]+)\s+(\d+(?:\.\d+)?)\b/);
        if(m) {
          const label=m[1].trim(),rank=number(m[2]),current=d.traits[label]?.rank ?? d.rings[label] ?? d.skills[label]?.rank ?? ({Honor:d.honor,Glory:d.glory,Status:d.status,'Insight Rank':d.insightRank})[label];
          if(current==null)unknown.push(part);
          else if(current<rank)issue(`training:${id}:requirements`,`${t.school.name} requires ${part}.`);
        } else unknown.push(part);
      }
      if(unknown.length)issue(`training:${id}:requirements`,`Confirm printed requirements for ${t.school.name}: ${unknown.join('; ')}.`);
      
      if(t.school.kind==='advanced' && t.rank>3)issue(`training:${id}:rank`,'Advanced Schools have three ranks.');
      if(t.school.kind==='advanced' && !requirements)issue(`training:${id}:requirements`,`Confirm the printed entry requirements for ${t.school.name}.`);
      if(id!==s.school && t.school.kind!=='path') {
        for(const skill of t.school.skills || [])if(!(d.skills[skill.name]?.rank>=(t.school.kind==='advanced'?skill.rank:1)))issue(`training:${id}:skills`,`Learn ${skill.name} before acquiring techniques from ${t.school.name}.`);
        if(t.school.skillChoices?.length)issue(`training:${id}:skills`,`Confirm one rank in each chosen School Skill for ${t.school.name}.`);
      }
    }
    if(Object.entries(s.modifiers).some(([k,v])=>k!=='notes' && typeof v==='number' && v!==0) && !s.modifierReason.trim())issue('modifiers','Explain the source or table approval for explicit mechanical modifiers.');
    for(const e of s.exceptions)if(!String(e.explanation || '').trim())issue('exception-explanation','Every exception needs an explanation recording table approval.');
    return violations;
  }
  function beginPlay(input,catalog) {
    const sheet=normalize(input),d=calculate(sheet,catalog);
    if(sheet.phase==='advancement')return {sheet,violations:[]};
    if(d.blockers.length)return {sheet,violations:d.blockers};
    sheet.phase='advancement';
    sheet.training=d.training.map(t=>({school:`${t.school.slug}#${t.school.anchor}`,rank:t.rank}));
    sheet.money={...d.money};sheet.honor=d.honor;sheet.glory=d.glory;sheet.status=d.status;
    sheet.progression={baseline:{spent:d.xpSpent,earned:d.xpEarned,costItems:clone(d.costItems),traitBases:Object.fromEntries(Object.entries(d.traits).map(([t,v])=>[t,v.base])),skillGrants:clone(C.schoolGrants(d.school,sheet,catalog).skills),disadvantageCosts:Object.fromEntries(d.disadvantages.map(a=>[a.id,a.cost])),outfit:clone(d.equipment.filter(e=>e.source==='school' && !e.key.endsWith(':Katana') && !e.key.endsWith(':Wakizashi')).map(({item,equipped,...e})=>e)),money:{...d.money},roninFamilyCost:d.roninFamilyCost},history:[],startedAt:new Date().toISOString()};
    return {sheet,violations:[]};
  }
  function paidItems(sheet) {
    const items=clone(sheet.progression?.baseline?.costItems || {});
    for(const e of sheet.progression?.history || []) {
      if(e.kind==='purchase')items[e.key]={cost:e.amount,label:e.label};
      if(e.kind==='refund')delete items[e.key];
      if(e.kind==='correction' && e.key && items[e.key])items[e.key].cost+=number(e.amount);
    }
    return items;
  }
  function recordChange(before, after, catalog, explanation = '') {
    if(before.phase!=='advancement')return after;
    const old=calculate(before,catalog),next=calculate(after,catalog),paid=paidItems(before);
    const now=new Date().toISOString(),history=after.progression.history;
    const append=e=>history.push({id:`xp-${now}-${history.length}`,at:now,...e});
    for(const [key,e] of Object.entries(next.costItems))if(!old.costItems[key])append({kind:'purchase',key,label:e.label,amount:e.cost});
    for(const [key,e] of Object.entries(old.costItems))if(!next.costItems[key])append({kind:'refund',key,label:e.label,amount:-(paid[key]?.cost ?? 0),explanation:explanation || 'Removed purchase; refunded its recorded paid cost.'});
    // Explicit price edits are corrections; a changed clan/discount never reprices an old purchase.
    if(explanation)for(const [key,e] of Object.entries(next.costItems))if(old.costItems[key] && e.cost!==old.costItems[key].cost)append({kind:'correction',key,label:e.label,amount:e.cost-(paid[key]?.cost ?? old.costItems[key].cost),explanation});
    const mechanical=['clan','family','school','training','schoolChoices','schoolDecisions','equipmentChoices','modifiers','disadvantages','honor','glory','status','taint'];
    if(mechanical.some(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])))append({kind:'correction',amount:0,label:'Sheet correction / training',explanation:explanation || 'Recorded change to training or mechanical choices.'});
    return after;
  }
  function buyOff(input,index,catalog,explanation) {
    const s=normalize(input),entry=s.disadvantages[index];
    if(s.phase!=='advancement' || !entry || !String(explanation || '').trim())throw new Error('Buying off a disadvantage requires an explanation of table approval.');
    const d=calculate(s,catalog),cost=s.progression.baseline?.disadvantageCosts?.[entry.id] ?? d.disadvantages[index].cost;
    s.disadvantages.splice(index,1);
    s.progression.history.push({id:`buyoff-${Date.now()}-${s.progression.history.length}`,at:new Date().toISOString(),kind:'purchase',key:`buyoff:${entry.id}`,amount:cost,label:`Buy off ${entry.name}`,explanation:String(explanation).trim()});
    return s;
  }
  function award(input,amount,explanation) {
    const s=normalize(input);
    if(s.phase!=='advancement' || String(amount).trim()==='' || !Number.isInteger(number(amount)) || !String(explanation).trim())throw new Error('Advancement XP awards or corrections need an integer amount and explanation.');
    s.progression.history.push({id:`award-${Date.now()}-${s.progression.history.length}`,at:new Date().toISOString(),kind:'award',amount:number(amount),label:'XP award / correction',explanation:String(explanation).trim()});
    return s;
  }
  (globalThis.window || globalThis).CharacterRules={normalize,calculate,dicePool,insightRank,optionCost,abilityQuote,freeAbilityLimits,spellElements,beginPlay,recordChange,award,buyOff,paidItems};
})();
