(() => {
  // What other players and anyone with a character's link can see. Always public: name,
  // picture, clan, family, school, Insight Rank and equipped weapons/armour. Honor, Glory,
  // Status, Taint, advantages, disadvantages, equipment, Traveling Pack items and journal entries appear only when ticked
  // Public. The GM reads the full sheet instead.
  const STATS = ['honor','glory','status','taint'];
  const option = entry => ({name:entry.name,selection:(window.CharacterRules?.optionLabel ? window.CharacterRules.optionLabel(entry) : entry.selection) || ''});
  const profile = (s,d) => ({
    name:s.name || '',
    portrait:s.portrait || '',
    clan:s.clan || '',
    family:s.family || '',
    school:d.school?.name || '',
    insightRank:d.insightRank,
    gear:[...new Set([...d.equipment.filter(e => (e.equipped && ['weapon','armor'].includes(e.item?.kind)) || (e.public && !e.pending)).map(e => e.name),...(d.travelingPack?.publicItems || [])])],
    stats:Object.fromEntries(STATS.filter(key => s.publicStats?.[key]).map(key => [key,Number(d[key] ?? s[key]) || 0])),
    advantages:d.advantages.filter(a => a.public).map(option),
    disadvantages:d.disadvantages.filter(a => a.public).map(option),
    journal:(s.journal || []).filter(e => e.public).map(e => ({id:e.id,title:e.title || '',text:e.text,createdAt:e.createdAt}))
  });
  const encode = async (sheet,updatedAt = new Date().toISOString()) => {
    sheet = window.CharacterBuilder.normalize?.(structuredClone(sheet)) || structuredClone(sheet);
    const shared = await window.CharacterBuilder.profile(sheet);
    const full = {sheetJson:JSON.stringify(sheet),updatedAt,revision:crypto.randomUUID(),profile:shared};
    return {full,public:{revision:full.revision,profile:shared}};
  };
  // Older public documents carried sections instead of a profile.
  const publicName = data => data?.profile?.name ?? data?.sections?.identity?.name ?? '';
  window.SheetSharing = {STATS,profile,encode,publicName};
})();
