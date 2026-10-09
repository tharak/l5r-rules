(() => {
  const TRAIT_GROUPS = [
    {ring:'Earth', mark:'E', traits:['Stamina','Willpower']},
    {ring:'Air', mark:'A', traits:['Reflexes','Awareness']},
    {ring:'Water', mark:'W', traits:['Strength','Perception']},
    {ring:'Fire', mark:'F', traits:['Agility','Intelligence']},
    {ring:'Void', mark:'V', traits:['Void']}
  ];
  const TRAIT_NAMES = TRAIT_GROUPS.flatMap(group => group.traits);
  const WEAPON_SKILLS = ['Chain Weapons','Heavy Weapons','Kenjutsu','Knives','Kyujutsu','Ninjutsu','Polearms','Spears','Staves','War Fan'];
  const WOUND_LEVELS = ['Healthy (+0)','Nicked (+3)','Grazed (+5)','Hurt (+10)','Injured (+15)','Crippled (+20)','Down (+40)','Out'];
  function purchasedRankCost(base, rank, multiplier = 1) {
    let cost = 0;
    for (let next = base + 1; next <= rank; next++) cost += next * multiplier;
    return cost;
  }
  function skillIdentity(value, catalog) {
    const match = value.trim().match(/^(.*?)\s*\(([^)]+)\)$/);
    let name = (match ? match[1] : value).trim().replace(/:\s*/g, ': ');
    let emphases = match ? [match[2].trim()] : [];
    const known = catalog.skills.find(skill => skill.name.toLowerCase() === name.split(':')[0].toLowerCase());
    if (known) name = known.name + name.slice(name.split(':')[0].length);
    if (/^(Artisan|Craft|Games|Lore|Perform)$/.test(name) && emphases.length) {
      name += `: ${emphases[0]}`; emphases = [];
    }
    return {name, emphases};
  }
  function allowedSchoolSkill(choice, value, catalog) {
    const {name} = skillIdentity(value, catalog), category = name.split(':')[0];
    const entry = catalog.skills.find(skill => skill.name === category);
    if (!entry || ['Weapons','Artisan','Craft','Games','Lore','Perform'].includes(name)) return false;
    const prompt = choice.prompt;
    if (/following list/i.test(prompt)) return category === 'Acting' || /^(Artisan|Perform): /.test(name);
    if (/Weapon Skill/i.test(prompt)) return WEAPON_SKILLS.includes(category);
    const types = ['Artisan','Craft','Lore','Perform'].filter(type => new RegExp(`\\b${type}\\b`, 'i').test(prompt));
    const groups = ['High','Bugei','Merchant','Low'].filter(group => new RegExp(`\\b${group}\\b`, 'i').test(prompt));
    if (/non-High/i.test(prompt)) return entry.group !== 'High';
    if (/non-Low|not.*Low/i.test(prompt)) return entry.group !== 'Low';
    if (/either Gaijin or Shadowlands/i.test(prompt)) return ['Lore: Gaijin','Lore: Shadowlands'].includes(name);
    return !types.length && !groups.length || types.includes(category) || groups.includes(entry.group);
  }
  function schoolGrants(school, sheet, catalog) {
    const skills = {}, choices = school?.skillChoices || [];
    const grant = (name, rank, emphases = [], notes = '') => {
      const current = skills[name] ||= {base:0, emphases:[], notes:''};
      current.base = Math.max(current.base, rank);
      current.emphases = [...new Set([...current.emphases, ...emphases])];
      if (notes) current.notes = notes;
    };
    for (const skill of school?.skills || []) grant(skill.name, skill.rank, skill.emphases, skill.notes);
    const errors = {};
    choices.forEach((choice, index) => {
      const value = sheet.schoolChoices[index]?.trim();
      if (!value) return;
      if (choice.kind === 'emphasis') { grant(choice.skill, 0, [value]); return; }
      const {name, emphases} = skillIdentity(value, catalog);
      if (!allowedSchoolSkill(choice, value, catalog)) errors[index] = 'Choose a skill that matches this school option. Use a specialty such as Lore: History for grouped skills.';
      else if (emphases.length) errors[index] = 'This choice grants a skill rank. Add extra emphases under Other XP purchases.';
      else if (skills[name]) errors[index] = 'Choose a different skill; this school already grants that skill.';
      else grant(name, choice.rank, emphases);
    });
    if (/Utaku Infantry/i.test(school?.name || '') && sheet.schoolDecisions.weaponFocus && sheet.schoolDecisions.weaponEmphasis) {
      grant(sheet.schoolDecisions.weaponFocus,1,[sheet.schoolDecisions.weaponEmphasis]);
    }
    return {skills, errors};
  }
  function skillTrait(name, sheet, catalog) {
    const selected = sheet.skillTraits[name];
    if (TRAIT_NAMES.includes(selected)) return selected;
    const [category, specialty] = name.split(': ');
    const entry = catalog.skills.find(skill => skill.name === category);
    const specialtyTrait = Object.entries(entry?.specialtyTraits || {}).find(([name]) => name.toLowerCase() === specialty?.toLowerCase())?.[1];
    return specialtyTrait || entry?.traits?.[0] || '';
  }
  function skillTraitOptions(name, catalog) {
    const [category, specialty] = name.split(': ');
    const entry = catalog.skills.find(skill => skill.name === category);
    const specialtyTrait = Object.entries(entry?.specialtyTraits || {}).find(([name]) => name.toLowerCase() === specialty?.toLowerCase())?.[1];
    if (specialtyTrait) return [specialtyTrait];
    return entry?.traits?.length ? [...entry.traits] : [...TRAIT_NAMES];
  }
  const schools = catalog => catalog.clans.flatMap(clan => clan.schools);
  const school = (id,catalog) => [...schools(catalog), ...(catalog.training || [])].find(s => `${s.slug}#${s.anchor}` === id);
  const ability = (id,catalog) => catalog.abilities?.find(a => a.id === id);
  const item = (value,catalog) => [...(catalog.weapons || []),...(catalog.armors || [])].find(a => a.id === value || a.name.toLowerCase() === String(value).toLowerCase());
  const api = {TRAIT_GROUPS, TRAIT_NAMES, WEAPON_SKILLS, WOUND_LEVELS, purchasedRankCost, skillIdentity, allowedSchoolSkill, schoolGrants, skillTrait, skillTraitOptions, schools, school, ability, item};
  (globalThis.window || globalThis).CharacterCatalog = api;
})();
