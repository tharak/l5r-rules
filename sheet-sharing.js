(() => {
  const keys = ['identity','traits','skills','options','story','summary'];
  const labels = ['Identity and training','Rings and traits','Skills','Advantages and disadvantages','Story and equipment','Summary and combat'];
  const visibility = sheet => Object.fromEntries(keys.map(key => [key,typeof sheet.visibility?.[key] === 'boolean' ? sheet.visibility[key] : key === 'identity']));
  const sections = (s,d) => ({
    identity:{name:s.name,clan:s.clan,family:s.family,school:d.school?.name || '',training:d.techniques,affinity:d.school?.affinity || '',spells:d.school?.spells || ''},
    traits:{rings:d.rings,traits:d.traits},
    // Skill roll pools expose trait ranks, so only include them when traits are public.
    skills:{skills:Object.fromEntries(Object.entries(d.skills).map(([name,v]) => [name,{rank:v.rank,base:v.base,emphases:v.emphases,notes:v.notes}]))},
    options:{advantages:s.advantages,disadvantages:s.disadvantages},
    story:{concept:s.concept,notes:s.notes,equipment:d.equipment,money:d.money,glory:s.glory,status:s.status,purchases:s.purchases},
    summary:{insight:d.insight,insightRank:d.insightRank,xpSpent:d.xpSpent,xpRemaining:d.xpRemaining,xpEarned:d.xpEarned,combat:d.combat}
  });
  const project = (full) => ({revision:full.revision,sections:Object.fromEntries(keys.filter(key => full.visibility[key]).map(key => [key,full.sections[key]]))});
  const encode = async (sheet,updatedAt = new Date().toISOString()) => {
    sheet = structuredClone(sheet);
    const full = {sheetJson:JSON.stringify(sheet),updatedAt,revision:crypto.randomUUID(),visibility:visibility(sheet),sections:await window.CharacterBuilder.sections(sheet)};
    return {full,public:project(full)};
  };
  window.SheetSharing = {keys,labels,visibility,sections,project,encode};
})();
