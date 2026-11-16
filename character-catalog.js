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
  const MACRO_SKILLS = ['Artisan','Craft','Games','Lore','Perform','Weapons'];
  const WOUND_LEVELS = ['Healthy (+0)','Nicked (+3)','Grazed (+5)','Hurt (+10)','Injured (+15)','Crippled (+20)','Down (+40)','Out'];
  function purchasedRankCost(base, rank, multiplier = 1) {
    let cost = 0;
    for (let next = base + 1; next <= rank; next++) cost += next * multiplier;
    return cost;
  }
  function skillIdentity(value, catalog) {
    const match = value.trim().match(/^(.*?)\s*\(([^)]+)\)$/);
    let name = (match ? match[1] : value).trim().replace(/\s*:\s*/g, ': ');
    let emphases = match ? [match[2].trim()] : [];
    const known = catalog.skills.find(skill => skill.name.toLowerCase() === name.split(':')[0].toLowerCase());
    if (known) name = known.name + name.slice(name.split(':')[0].length);
    if (MACRO_SKILLS.includes(name) && emphases.length) {
      name += `: ${emphases[0]}`; emphases = [];
    }
    return {name, emphases};
  }
  function requiresSkillSubtype(name) {
    const [category,...subtype] = name.split(':');
    return MACRO_SKILLS.includes(category.trim()) && !subtype.join(':').trim();
  }
  function allowedSchoolSkill(choice, value, catalog) {
    const {name} = skillIdentity(value, catalog), category = name.split(':')[0];
    const entry = catalog.skills.find(skill => skill.name === category);
    const specialty = name.split(': ').slice(1).join(': ');
    const group = Object.entries(entry?.specialtyGroups || {}).find(([name]) => name.toLowerCase() === specialty.toLowerCase())?.[1] || entry?.group;
    if (!entry || requiresSkillSubtype(name)) return false;
    if (choice.subtype && category !== choice.subtype) return false;
    const prompt = choice.prompt;
    if (/following list/i.test(prompt)) return category === 'Acting' || /^(Artisan|Perform): /.test(name);
    if (/Weapon Skill/i.test(prompt)) return WEAPON_SKILLS.includes(category);
    const types = ['Artisan','Craft','Lore','Perform'].filter(type => new RegExp(`\\b${type}\\b`, 'i').test(prompt));
    const groups = ['High','Bugei','Merchant','Low'].filter(group => new RegExp(`\\b${group}\\b`, 'i').test(prompt));
    if (/non-High/i.test(prompt)) return group !== 'High';
    if (/non-Low|not.*Low/i.test(prompt)) return group !== 'Low';
    if (/either Gaijin or Shadowlands/i.test(prompt)) return ['Lore: Gaijin','Lore: Shadowlands'].includes(name);
    return !types.length && !groups.length || types.includes(category) || groups.includes(group);
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
      // Older subtype choices were saved as emphasis text, e.g. "Song".
      const oldSubtype = choice.subtype && !value.includes(':') && !catalog.skills.some(skill=>skill.name.toLowerCase()===value.toLowerCase());
      const selected = oldSubtype ? `${choice.subtype}: ${value}` : value;
      const {name, emphases} = skillIdentity(selected, catalog);
      if (!allowedSchoolSkill(choice, selected, catalog)) errors[index] = 'Choose a skill that matches this school option. Use a specialty such as Lore: History for grouped skills.';
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
  // Clan mons live in public/assets/clans/<source>/<clan>.webp (sources in ATTRIBUTION.md).
  // A clan uses the highest-priority source that has its mon: the official site, then
  // l5r.wiki, then Shin-Ian's mandala, then l5r.fandom.com. Add a file to a source by
  // listing the clan under it; lower sources never override higher ones.
  const MON_PRIORITY = ['official','wiki','mandala','fandom'];
  const MON_FILES = {
    official:['Crab','Crane','Dragon','Lion','Phoenix','Scorpion','Unicorn'],
    wiki:['Mantis','Spider','Imperial'],
    mandala:['Badger','Bat','Boar','Dragonfly','Falcon','Fox','Hare','Mantis','Monkey','Nezumi','Ox','Raven','Snake','Sparrow','Tiger','Tortoise'],
    fandom:[]
  };
  const MON_SOURCES = {
    official:{label:'legendofthefiverings.com',href:'https://www.legendofthefiverings.com/lore/clans/the-crane-clan/'},
    wiki:{label:'l5r.wiki (recoloured)',href:'https://l5r.wiki/clans'},
    mandala:{label:'Shin-Ian, "The Clans of Rokugan" (DeviantArt)',href:'https://www.deviantart.com/shin-ian/art/The-Clans-of-Rokugan-721225095'},
    fandom:{label:'l5r.fandom.com',href:'https://l5r.fandom.com/wiki/Legend_of_the_Five_Rings_Wiki'}
  };
  // Clock positions in the mandala (12:00 at the top), and identifications that are guesses.
  const MANDALA = {Raven:'11:30',Dragonfly:'12:30',Tortoise:'1:00',Monkey:'2:00',Tiger:'2:30',Bat:'3:30',Mantis:'4:00',Badger:'5:00',Falcon:'5:30',Nezumi:'6:30',Snake:'7:00',Hare:'8:00',Sparrow:'8:30',Boar:'9:30',Ox:'10:00',Fox:'11:00'};
  const MON_GUESSES = {mandala:['Badger','Hare','Sparrow','Tiger']};
  const monFile = (kind,name) => `public/assets/clans/${kind}/${name.toLowerCase()}.webp`;
  // Every available mon for a clan, best first.
  const clanMonCandidates = name => MON_PRIORITY.filter(kind => MON_FILES[kind].includes(name)).map(kind => ({
    kind,src:monFile(kind,name),source:MON_SOURCES[kind],position:kind === 'mandala' ? MANDALA[name] || '' : '',guess:!!MON_GUESSES[kind]?.includes(name)
  }));
  const CLAN_MONS = [...new Set(MON_PRIORITY.flatMap(kind => MON_FILES[kind]))];
  // Clans without a mon from any source use the official five-rings mark (also the site
  // logo and favicon); no clan, no mon.
  const DEFAULT_MON = 'public/assets/l5r-mark.webp';
  const clanMon = name => clanMonCandidates(name)[0]?.src || (typeof name === 'string' && name.trim() ? DEFAULT_MON : '');
  // Official clan cover art from legendofthefiverings.com: a wide image (1200×1125) and a
  // tall one (780×2000) per Great Clan; other clans have none.
  const CLAN_COVERS = ['Crab','Crane','Dragon','Lion','Phoenix','Scorpion','Unicorn'];
  const clanCover = (name,{tall = false} = {}) => CLAN_COVERS.includes(name) ? `public/assets/clans/covers/${name.toLowerCase()}${tall ? '-tall' : ''}.webp` : '';
  // Five square illustrations per Great Clan (03a–03e on the site), 600px.
  const clanIllustrations = name => CLAN_COVERS.includes(name) ? ['a','b','c','d','e'].map(letter => ({letter,src:`public/assets/clans/illustrations/${name.toLowerCase()}-${letter}.webp`})) : [];
  // Tall brush-edged hero banner from the clans pages (500×1000, transparent edges).
  const clanBanner = name => CLAN_COVERS.includes(name) ? `public/assets/clans/banners/${name.toLowerCase()}.webp` : '';
  // Official family art from the Great Clan pages of legendofthefiverings.com, saved as
  // public/assets/clans/families/<clan>-<letter>.webp in the site's file order (04a, 04b…).
  // The site does not label them, so each letter is matched to a family by its content;
  // FAMILY_ART_GUESSES lists the uncertain matches and '' marks an unidentified image.
  const FAMILY_ART = {
    Crab:{a:'Hida',b:'Hiruma',c:'Kaiu',d:'Yasuki',e:'Kuni'},
    Crane:{a:'Doji',b:'Daidoji',c:'Kakita',d:'Asahina'},
    Dragon:{a:'Mirumoto',b:'Togashi',c:'Kitsuki',d:'Agasha'},
    Lion:{a:'Matsu',b:'Kitsu',c:'Akodo',d:'Ikoma'},
    Phoenix:{a:'Shiba',b:'Isawa',c:'Kaito',d:'Asako'},
    Scorpion:{a:'Yogo',b:'Shosuro',c:'Bayushi',d:'Soshi',e:''},
    Unicorn:{a:'Shinjo',b:'Utaku',c:'Moto',d:'Iuchi'}
  };
  const FAMILY_ART_GUESSES = {Crane:['Doji','Kakita','Asahina'],Lion:['Matsu','Akodo','Ikoma'],Phoenix:['Shiba','Kaito'],Unicorn:['Utaku','Moto']};
  const familyArtFile = (clan,letter) => `public/assets/clans/families/${clan.toLowerCase()}-${letter}.webp`;
  const familyArt = (clan,family) => {
    const letter = Object.entries(FAMILY_ART[clan] || {}).find(([,name]) => name && name === family)?.[0];
    return letter ? familyArtFile(clan,letter) : '';
  };
  // Every family image of a clan, for the debug page.
  const familyArtList = clan => Object.entries(FAMILY_ART[clan] || {}).map(([letter,family]) => ({letter,family,src:familyArtFile(clan,letter),guess:!family || !!FAMILY_ART_GUESSES[clan]?.includes(family)}));
  // The site's per-clan file number, used to link each bundled image to its original file.
  const OFFICIAL_CLAN_NUMBERS = {Crab:1,Phoenix:2,Lion:3,Dragon:4,Unicorn:5,Crane:6,Scorpion:''};
  const OFFICIAL_CDN = 'https://cdn.svc.asmodee.net/production-l5r/uploads/image-converter/2023/06/';
  function officialSourceUrl(kind,clan,letter = 'a') {
    if (!(clan in OFFICIAL_CLAN_NUMBERS)) return '';
    const n = OFFICIAL_CLAN_NUMBERS[clan] === '' ? '' : `-${OFFICIAL_CLAN_NUMBERS[clan]}`;
    if (kind === 'mon') return `${OFFICIAL_CDN}05a_Clan_Icon${n}-${clan === 'Crab' ? '900x900' : '900x845'}.webp`;
    if (kind === 'cover') return `${OFFICIAL_CDN}01_Clan_Cover${n}-1900x1781.webp`;
    if (kind === 'tall') return `${OFFICIAL_CDN}UI_L5R_Clan_Cover_${clan}_Mobile.webp`;
    if (kind === 'family') return `${OFFICIAL_CDN}04${letter}_Clan_Families${n}-900x900.webp`;
    if (kind === 'banner') return `${OFFICIAL_CDN}01_Clans_Page_${clan}-1.webp`;
    if (kind === 'illustration') return `${OFFICIAL_CDN}03${letter}_Clan_Squared_Illustrations${n}-1200x1200.webp`;
    return '';
  }
  // The chosen mon plus any lower-priority alternatives, for the #/clan-mons debug page.
  function clanMonInfo(name) {
    const [chosen,...alternatives] = clanMonCandidates(name);
    return chosen ? {...chosen,alternatives} : null;
  }
  const api = {TRAIT_GROUPS, TRAIT_NAMES, WEAPON_SKILLS, MACRO_SKILLS, WOUND_LEVELS, CLAN_MONS, MON_PRIORITY, MON_SOURCES, DEFAULT_MON, CLAN_COVERS, clanCover, clanBanner, clanIllustrations, FAMILY_ART, familyArt, familyArtList, OFFICIAL_CLAN_NUMBERS, officialSourceUrl, clanMon, clanMonInfo, clanMonCandidates, purchasedRankCost, skillIdentity, requiresSkillSubtype, allowedSchoolSkill, schoolGrants, skillTrait, skillTraitOptions, schools, school, ability, item};
  (globalThis.window || globalThis).CharacterCatalog = api;
})();
