(() => {
  const keys = ['identity','traits','skills','options','story','summary','abilities'];
  const labels = ['Identity and training','Rings and traits','Skills','Advantages and disadvantages','Story and equipment','Summary and combat','Abilities'];
  const visibility = sheet => Object.fromEntries(keys.map(key => [key,typeof sheet.visibility?.[key] === 'boolean' ? sheet.visibility[key] : key === 'identity']));
  const sections = (s,d) => ({
    identity:{name:s.name,clan:s.clan,family:s.family,school:d.school?.name || '',training:d.techniques,affinity:d.school?.affinity || ''},
    traits:{rings:d.rings,traits:d.traits},
    skills:{skills:Object.fromEntries(Object.entries(d.skills).map(([name,v]) => [name,{rank:v.rank,base:v.base,emphases:v.emphases,masteries:v.masteries,notes:v.notes}]))},
    options:{advantages:d.advantages.map(a=>({name:a.name,cost:a.cost,selection:a.selection || ''})),disadvantages:d.disadvantages.map(a=>({name:a.name,cost:a.cost,selection:a.selection || ''})),ancestors:d.ancestors.map(a=>({name:a.name,cost:a.cost,description:a.description || ''}))},
    story:{concept:s.concept,notes:s.notes,heritage:s.heritage,equipment:d.equipment.map(({item,...e})=>e),money:d.money,honor:d.honor,glory:d.glory,status:d.status,taint:d.taint,purchases:s.purchases.map(a=>({name:a.name,cost:a.cost}))},
    summary:{insight:d.insight,insightRank:d.insightRank,schoolRank:d.schoolRank,xpSpent:d.xpSpent,xpRemaining:d.xpRemaining,xpEarned:d.xpEarned,combat:Object.fromEntries(['initiative','baseArmorTN','armorTN','reduction','healing','unarmedDamage','unarmedAttack','voidPoints','wounds','woundPenaltyReduction','movementWater'].map(k=>[k,d.combat[k]]))},
    abilities:{abilities:d.abilities.map(a=>({name:a.name,kind:a.kind,ring:a.ring || '',mastery:a.mastery || 0,description:a.description || '',memorized:!!a.memorized,grant:!!a.grant,cost:a.cost,slug:a.slug || '',anchor:a.anchor || ''}))}
  });
  const project = full => ({revision:full.revision,sections:Object.fromEntries(keys.filter(key => full.visibility[key] && full.sections[key]).map(key => [key,full.sections[key]]))});
  const encode = async (sheet,updatedAt = new Date().toISOString()) => {
    sheet = window.CharacterBuilder.normalize?.(structuredClone(sheet)) || structuredClone(sheet);
    const full = {sheetJson:JSON.stringify(sheet),updatedAt,revision:crypto.randomUUID(),visibility:visibility(sheet),sections:await window.CharacterBuilder.sections(sheet)};
    return {full,public:project(full)};
  };
  window.SheetSharing = {keys,labels,visibility,sections,project,encode};
})();
