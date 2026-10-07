(() => {
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const value=item=>item?.notation || (item===null||item===undefined||item===''?'—':item);
  const stats=rows=>`<dl class="sheet-stats">${rows.map(([label,item])=>`<div><dt>${e(label)}</dt><dd>${e(value(item))}</dd></div>`).join('')}</dl>`;
  const text=item=>item?`<p class="sheet-text">${e(item)}</p>`:'';
  const entries=(items,empty)=>items?.length?items.map(item=>`<article class="sheet-entry"><h4>${e(item.name)}</h4>${item.cost!==undefined?`<small>${e(item.cost)} XP</small>`:''}${text(item.selection)}${text(item.description)}</article>`).join(''):`<p>${e(empty)}</p>`;
  let catalogPromise;
  async function fromSheet(input) {
    catalogPromise ||= fetch('public/character-data.json').then(r=>{if(!r.ok)throw Error('Character data unavailable');return r.json();});
    const catalog=await catalogPromise,sheet=window.CharacterRules.normalize(structuredClone(input)),d=window.CharacterRules.calculate(sheet,catalog);
    const sections=window.SheetSharing.sections(sheet,d);
    sections.skills.skills=Object.fromEntries(Object.entries(d.skills).map(([name,skill])=>[name,{...sections.skills.skills[name],trait:skill.trait,roll:skill.roll}]));
    sections.summary.combat={...sections.summary.combat,armor:d.combat.armor,weapons:d.combat.weapons};
    return {sections,character:sheet,derived:d};
  }
  function section(key,data) {
    if(key==='identity')return stats(['name','clan','family','school'].map(k=>[k,data[k]]))+entries(data.training,'No school techniques recorded.')+text(data.affinity)+text(data.spells);
    if(key==='traits')return `<div class="sheet-rings">${Object.entries(data.rings||{}).map(([name,rank])=>`<div><span>${e(name)}</span><strong>${e(rank)}</strong></div>`).join('')}</div>`+stats(Object.entries(data.traits||{}).map(([name,t])=>[name,t.rank]));
    if(key==='skills') {
      const skills=Object.entries(data.skills||{}),rolls=skills.some(([,s])=>s.trait||s.roll);
      if(!skills.length)return '<p>No skills recorded.</p>';
      return `<div class="sheet-table-wrap"><table class="sheet-table"><thead><tr><th>Skill</th><th>Rank</th>${rolls?'<th>Trait</th><th>Roll</th>':''}<th>Emphases and mastery</th></tr></thead><tbody>${skills.map(([name,s])=>`<tr><th scope="row">${e(name)}</th><td>${e(s.rank)}</td>${rolls?`<td>${e(value(s.trait))}</td><td>${e(value(s.roll))}</td>`:''}<td>${text((s.emphases||[]).join(', '))}${(s.masteries||[]).map(m=>`<p>${e(m.description)}</p>`).join('')}${text(s.notes)}</td></tr>`).join('')}</tbody></table></div>`;
    }
    if(key==='options')return `<h4>Advantages</h4>${entries(data.advantages,'None recorded.')}<h4>Disadvantages</h4>${entries(data.disadvantages,'None recorded.')}<h4>Ancestors</h4>${entries(data.ancestors,'None recorded.')}`;
    if(key==='abilities')return data.abilities?.length?data.abilities.map(a=>`<article class="sheet-entry"><h4>${e(a.name)}</h4><small>${e([a.kind,a.ring&&`${a.ring} ${a.mastery}`,a.memorized?'Memorized':'',a.grant?'School grant':''].filter(Boolean).join(' · '))}</small>${text(a.description)}</article>`).join(''):'<p>No abilities recorded.</p>';
    if(key==='story')return text(data.concept)+stats(['honor','glory','status','taint'].map(k=>[k,data[k]]))+text(data.notes)+text(data.heritage)+`<h4>Equipment</h4>${data.equipment?.length?`<ul>${data.equipment.map(item=>`<li>${e(item.name)}${item.equipped?' · Equipped':''}</li>`).join('')}</ul>`:'<p>No equipment recorded.</p>'}${stats(Object.entries(data.money||{}))}${data.purchases?.length?'<h4>Other purchases</h4>'+entries(data.purchases,''):''}`;
    if(key==='summary') {
      const combat=data.combat||{};
      return stats([['Insight',data.insight],['Insight rank',data.insightRank],['School rank',data.schoolRank],['XP spent',data.xpSpent],['XP remaining',data.xpRemaining],['XP earned',data.xpEarned]])+`<h4>Combat</h4>`+stats([['Initiative',combat.initiative],['Armor TN',combat.armorTN],['Armor',combat.armor],['Reduction',combat.reduction],['Healing per day',combat.healing],['Unarmed attack',combat.unarmedAttack],['Unarmed damage',combat.unarmedDamage],['Void points',combat.voidPoints],['Movement Water',combat.movementWater],['Wound penalty reduction',combat.woundPenaltyReduction]])+(combat.wounds?`<h4>Wounds</h4>${stats([['Wounds taken',combat.wounds.current],['Current level',combat.wounds.currentLevel],['Wound capacity',combat.wounds.maximum]])}${stats((combat.wounds.levels||[]).map(level=>[level.label,level.total]))}`:'')+(combat.weapons?.length?`<h4>Weapons</h4>${combat.weapons.map(w=>`<article class="sheet-entry"><h4>${e(w.name)}</h4>${stats([['Attack',w.attack],['Damage',w.damage]])}${text(w.special)}</article>`).join('')}`:'');
    }
    return '';
  }
  function render(sections) {
    return window.SheetSharing.keys.filter(key=>sections[key]).map(key=>`<section class="sheet-section" data-sheet-section="${key}"><h3>${e(window.SheetSharing.labels[window.SheetSharing.keys.indexOf(key)])}</h3>${section(key,sections[key])}</section>`).join('')||'<p>This PC has no public sections.</p>';
  }
  async function exportSheet(input) {
    const {character,derived}=await fromSheet(input);
    return {character,derived,exportedAt:new Date().toISOString(),source:'l5r-rules'};
  }
  window.CharacterSheetView={fromSheet,render,exportSheet};
})();
