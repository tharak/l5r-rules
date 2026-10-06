(() => {
  const LEGACY_KEY = 'last-haiku-character-v1';
  const ROSTER_KEY = 'last-haiku-characters-v1';
  const ACTIVE_KEY = 'last-haiku-active-character-v1';
  const MIGRATION_KEY = 'last-haiku-characters-migrated-v1';
  const TRAIT_GROUPS = [
    {ring:'Earth', mark:'E', traits:['Stamina','Willpower']},
    {ring:'Air', mark:'A', traits:['Reflexes','Awareness']},
    {ring:'Water', mark:'W', traits:['Strength','Perception']},
    {ring:'Fire', mark:'F', traits:['Agility','Intelligence']},
    {ring:'Void', mark:'V', traits:['Void']}
  ];
  const TRAIT_NAMES = TRAIT_GROUPS.flatMap(group => group.traits);
  const WOUND_LEVELS = ['Healthy (+0)','Nicked (+3)','Grazed (+5)','Hurt (+10)','Injured (+15)','Crippled (+20)','Down (+40)','Out'];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const blank = () => ({name:'', clan:'', family:'', school:'', concept:'', notes:'', traitBuys:{}, skills:{}, skillTraits:{}, schoolChoices:[], equipmentChoices:[], equipment:[], advantages:[], disadvantages:[], purchases:[], status:1, glory:1});
  let catalog, catalogPromise, sheet, root, activeId;
  const activeKey = () => window.CharacterStorage?.activeKey() || ACTIVE_KEY;

  function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function roster() {
    try {
      if (window.CharacterStorage?.accountId) return window.CharacterStorage.records();
      const saved = JSON.parse(localStorage.getItem(ROSTER_KEY));
      if (Array.isArray(saved)) return saved;
      const legacy = localStorage.getItem(MIGRATION_KEY) ? null : JSON.parse(localStorage.getItem(LEGACY_KEY));
      const migrated = legacy && typeof legacy === 'object' ? [{id:makeId(),sheet:{...blank(),...legacy},updatedAt:new Date().toISOString()}] : [];
      localStorage.setItem(ROSTER_KEY,JSON.stringify(migrated));
      localStorage.setItem(MIGRATION_KEY,'1');
      if (migrated[0]) localStorage.setItem(ACTIVE_KEY,migrated[0].id);
      return migrated;
    } catch { return []; }
  }
  function storeRoster(records) {
    try {
      if (window.CharacterStorage) window.CharacterStorage.save(records);
      else localStorage.setItem(ROSTER_KEY,JSON.stringify(records));
    } catch { window.alert?.('Your browser could not save this change. Export your character to keep a backup.'); }
    window.dispatchEvent(new Event('characters-changed'));
  }
  function list() {
    return roster().map(record => ({id:record.id,name:record.sheet?.name || '',clan:record.sheet?.clan || '',family:record.sheet?.family || '',concept:record.sheet?.concept || '',updatedAt:record.updatedAt || ''})).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  function create() {
    const id = makeId(), records = roster();
    records.push({id,sheet:blank(),updatedAt:new Date().toISOString()});
    try { localStorage.setItem(activeKey(),id); } catch {}
    activeId = id; storeRoster(records);
    return id;
  }
  function open(id) {
    if (!roster().some(record => record.id === id)) return false;
    try { localStorage.setItem(activeKey(),id); } catch {}
    activeId = id;
    return true;
  }
  function remove(id) {
    const records = roster().filter(record => record.id !== id);
    if (records.length === roster().length) return;
    try {
      if (localStorage.getItem(activeKey()) === id) localStorage.setItem(activeKey(),records[0]?.id || '');
    } catch {}
    if (activeId === id) activeId = records[0]?.id;
    storeRoster(records);
  }

  function loadSheet() {
    try {
      const records = roster();
      activeId = localStorage.getItem(activeKey()) || records[0]?.id;
      if (!records.some(record => record.id === activeId)) activeId = records[0]?.id || create();
      const stored = roster().find(record => record.id === activeId)?.sheet;
      return stored && typeof stored === 'object' ? {...blank(),...stored,
        traitBuys:stored.traitBuys || {}, skills:stored.skills || {}, schoolChoices:stored.schoolChoices || [],
        skillTraits:stored.skillTraits || {},
        equipmentChoices:stored.equipmentChoices || [], equipment:stored.equipment || [],
        advantages:stored.advantages || [], disadvantages:stored.disadvantages || [], purchases:stored.purchases || []} : blank();
    } catch { return blank(); }
  }
  function save() {
    const records = roster(), record = records.find(item => item.id === activeId);
    if (record) { record.sheet = sheet; record.updatedAt = new Date().toISOString(); storeRoster(records); }
  }
  function selectedClan() { return catalog.clans.find(clan => clan.name === sheet.clan); }
  function selectedFamily() { return selectedClan()?.families.find(family => family.name === sheet.family); }
  function selectedSchool() { return selectedClan()?.schools.find(school => `${school.slug}#${school.anchor}` === sheet.school); }
  function sourceLink(slug, anchor = '') { return `#/${encodeURIComponent(slug)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`; }
  function purchasedRankCost(base, rank, multiplier = 1) {
    let cost = 0;
    for (let next = base + 1; next <= rank; next++) cost += next * multiplier;
    return cost;
  }
  function skillIdentity(value) {
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
  function allowedSchoolSkill(choice, value) {
    const {name} = skillIdentity(value), category = name.split(':')[0];
    const entry = catalog.skills.find(skill => skill.name === category);
    if (!entry || ['Weapons','Artisan','Craft','Games','Lore','Perform'].includes(name)) return false;
    const prompt = choice.prompt;
    if (/following list/i.test(prompt)) return category === 'Acting' || /^(Artisan|Perform): /.test(name);
    if (/Weapon Skill/i.test(prompt)) return ['Chain Weapons','Heavy Weapons','Kenjutsu','Knives','Kyujutsu','Ninjutsu','Polearms','Spears','Staves','War Fan'].includes(category);
    const types = ['Artisan','Craft','Lore','Perform'].filter(type => new RegExp(`\\b${type}\\b`, 'i').test(prompt));
    const groups = ['High','Bugei','Merchant','Low'].filter(group => new RegExp(`\\b${group}\\b`, 'i').test(prompt));
    if (/non-High/i.test(prompt)) return entry.group !== 'High';
    if (/non-Low|not.*Low/i.test(prompt)) return entry.group !== 'Low';
    if (/either Gaijin or Shadowlands/i.test(prompt)) return ['Lore: Gaijin','Lore: Shadowlands'].includes(name);
    return !types.length && !groups.length || types.includes(category) || groups.includes(entry.group);
  }
  function schoolGrants(school) {
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
      const {name, emphases} = skillIdentity(value);
      if (!allowedSchoolSkill(choice, value)) errors[index] = 'Choose a skill that matches this school option. Use a specialty such as Lore: History for grouped skills.';
      else if (emphases.length) errors[index] = 'This choice grants a skill rank. Add extra emphases under Other XP purchases.';
      else if (skills[name]) errors[index] = 'Choose a different skill; this school already grants that skill.';
      else grant(name, choice.rank, emphases);
    });
    return {skills, errors};
  }
  function skillTrait(name) {
    const selected = sheet.skillTraits[name];
    if (TRAIT_NAMES.includes(selected)) return selected;
    const [category, specialty] = name.split(': ');
    const entry = catalog.skills.find(skill => skill.name === category);
    const specialtyTrait = Object.entries(entry?.specialtyTraits || {}).find(([name]) => name.toLowerCase() === specialty?.toLowerCase())?.[1];
    return specialtyTrait || entry?.traits?.[0] || '';
  }
  function dicePool(rolled, kept) { return {rolled, kept, notation:`${rolled}k${kept}`}; }
  function build() {
    const family = selectedFamily(), school = selectedSchool();
    const traits = {}, rings = {}, traitCosts = {};
    for (const group of TRAIT_GROUPS) {
      for (const trait of group.traits) {
        const base = 2 + Number(family?.trait === trait) + Number(school?.benefit === trait);
        const rank = Math.min(4, base + Math.max(0, Number(sheet.traitBuys?.[trait]) || 0));
        traits[trait] = {base, rank};
        traitCosts[trait] = purchasedRankCost(base, rank, trait === 'Void' ? 6 : 4);
      }
      rings[group.ring] = group.ring === 'Void' ? traits.Void.rank : Math.min(...group.traits.map(trait => traits[trait].rank));
    }
    const grants = schoolGrants(school), starting = grants.skills, skills = {}, purchased = {};
    for (const [value, rank] of Object.entries(sheet.skills || {})) {
      const {name} = skillIdentity(value);
      purchased[name] = Math.max(purchased[name] || 0, Number(rank) || 0);
    }
    for (const name of new Set([...Object.keys(starting), ...Object.keys(purchased)])) {
      const base = starting[name]?.base || 0;
      const rank = Math.min(4, Math.max(base, purchased[name] || 0));
      if (rank) {
        const trait = skillTrait(name), traitRank = traits[trait]?.rank;
        skills[name] = {base, rank, trait, traitRank:traitRank ?? null, roll:traitRank ? dicePool(rank + traitRank, traitRank) : null, emphases:starting[name]?.emphases || [], notes:starting[name]?.notes || '', cost:purchasedRankCost(base, rank)};
      }
    }
    const equipment = (school?.equipment || []).map((entry,index) => ({name:entry.choice ? sheet.equipmentChoices[index]?.trim() || entry.name : entry.name, source:'school', choice:entry.choice, pending:entry.choice && !sheet.equipmentChoices[index]?.trim(), index}));
    equipment.push(...sheet.equipment.map((entry,index) => ({...entry,source:'personal',index})));
    const advantageCost = (sheet.advantages || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.cost) || 0), 0);
    const disadvantageTotal = (sheet.disadvantages || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.cost) || 0), 0);
    const purchaseCost = (sheet.purchases || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.cost) || 0), 0);
    const roninFamilyCost = sheet.clan === 'Ronin' && family ? 5 : 0;
    const xpSpent = Object.values(traitCosts).reduce((a,b) => a+b,0) + Object.values(skills).reduce((sum,skill) => sum + skill.cost,0) + advantageCost + purchaseCost + roninFamilyCost;
    const xpEarned = Math.min(10, disadvantageTotal);
    const insight = Object.values(rings).reduce((a,b) => a+b,0) * 10 + Object.values(skills).reduce((sum,skill) => sum + skill.rank,0);
    const insightRank = insight < 150 ? 1 : insight <= 174 ? 2 : insight <= 199 ? 3 : insight <= 224 ? 4 : insight <= 250 ? 5 : 6 + Math.floor((insight - 251) / 25);
    let woundTotal = 0;
    const woundLevels = WOUND_LEVELS.map((label,index) => {
      const capacity = rings.Earth * (index === 0 ? 5 : 2);
      const start = index === 0 ? 0 : woundTotal + 1;
      woundTotal += capacity;
      return {label, capacity, start, total:woundTotal};
    });
    const combat = {
      initiative:dicePool(insightRank + traits.Reflexes.rank, traits.Reflexes.rank),
      baseArmorTN:traits.Reflexes.rank * 5 + 5,
      healing:traits.Stamina.rank * 2 + insightRank,
      unarmedDamage:dicePool(traits.Strength.rank, 1),
      voidPoints:rings.Void,
      wounds:{healthy:woundLevels[0].capacity, perLevel:rings.Earth * 2, maximum:woundTotal, levels:woundLevels}
    };
    return {family, school, traits, rings, traitCosts, skills, combat, skillChoiceErrors:grants.errors, equipment, money:school?.money || {}, techniques:school?.techniques || [], xpSpent, xpEarned, xpRemaining:40 + xpEarned - xpSpent, disadvantageTotal, roninFamilyCost, insight, insightRank};
  }
  const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  function renderIdentity(data) {
    const clan = selectedClan();
    const clanOptions = ['Great Clans','Minor Clans','Other'].map(group => `<optgroup label="${group}">${catalog.clans.filter(clan => clan.group === group).map(clan => option(clan.name, clan.name, clan.name === sheet.clan)).join('')}</optgroup>`).join('');
    const familyOptions = (clan?.families || []).map(family => option(family.name, `${family.name} · +1 ${family.trait}`, family.name === sheet.family)).join('');
    const schoolOptions = (clan?.schools || []).map(school => option(`${school.slug}#${school.anchor}`, `${school.name}${school.benefit ? ` · +1 ${school.benefit}` : ''}`, `${school.slug}#${school.anchor}` === sheet.school)).join('');
    return `<section class="creator-panel creator-identity" id="creator-identity"><div class="creator-panel-head"><span class="creator-step">01</span><div><h2>Identity & training</h2><p>Choose a clan, family, and starting school.</p></div></div><div class="creator-fields"><label>Name<input data-field="name" type="text" value="${escapeHtml(sheet.name)}" placeholder="Your character’s name"></label><label>Clan<select data-field="clan">${option('', 'Choose a clan', !sheet.clan)}${clanOptions}</select></label><label>Family<select data-field="family" ${clan ? '' : 'disabled'}>${option('', 'Choose a family', !sheet.family)}${familyOptions}</select></label><label>School<select data-field="school" ${clan ? '' : 'disabled'}>${option('', clan?.schools.length ? 'Choose a school' : 'No starting school listed', !sheet.school)}${schoolOptions}</select></label></div><div class="creator-bonuses"><div><small>FAMILY BENEFIT</small><strong>${data.family ? `+1 ${escapeHtml(data.family.trait)}` : 'Choose a family'}</strong>${data.family ? `<a href="${sourceLink(data.family.slug,data.family.anchor)}">View family ↗</a>` : ''}</div><div><small>SCHOOL BENEFIT</small><strong>${data.school?.benefit ? `+1 ${escapeHtml(data.school.benefit)}` : 'Choose a school'}</strong>${data.school ? `<a href="${sourceLink(data.school.slug,data.school.anchor)}">View school ↗</a>` : ''}</div></div>${data.school ? `<div class="creator-school-note"><strong>Starting school</strong><p><b>Honor:</b> ${data.school.honor ?? 'See school'} · <b>Skills:</b> ${escapeHtml(data.school.skillsRaw || 'See school')}</p>${data.school.choices.length ? `<p><b>Choose:</b> ${escapeHtml([...new Set(data.school.choices)].join('; '))}. Complete your school choices in the Skills section.</p>` : ''}<p><b>Outfit:</b> ${escapeHtml(data.school.outfit || 'See school description')}</p></div>` : ''}<p class="creator-rule">Imperial families require GM approval in the source rules. Selecting a Ronin family adds its required 5 XP cost automatically.</p></section>`;
  }

  function renderTraits(data) {
    return `<section class="creator-panel" id="creator-traits"><div class="creator-panel-head"><span class="creator-step">02</span><div><h2>Rings & traits</h2><p>All Rings begin at 2. Family and school benefits are applied automatically.</p></div></div><div class="creator-ring-grid">${TRAIT_GROUPS.map(group => `<div class="creator-ring"><div class="creator-ring-head"><span class="creator-ring-mark">${group.mark}</span><div><strong>${group.ring}</strong><small>${group.ring === 'Void' ? 'Void Points' : group.traits.join(' · ')}</small></div><b>${data.rings[group.ring]}</b></div>${group.traits.map(trait => { const item = data.traits[trait], next = item.rank + 1, cost = next * (trait === 'Void' ? 6 : 4); return `<div class="creator-rank-row"><span><strong>${trait}</strong><small>Base ${item.base}${data.traitCosts[trait] ? ` · ${data.traitCosts[trait]} XP spent` : ''}</small></span><div class="rank-control"><button type="button" data-action="trait" data-trait="${trait}" data-delta="-1" ${item.rank <= item.base ? 'disabled' : ''} aria-label="Decrease ${trait}">−</button><b>${item.rank}</b><button type="button" data-action="trait" data-trait="${trait}" data-delta="1" ${item.rank >= 4 ? 'disabled' : ''} aria-label="Increase ${trait} for ${cost} XP">+</button></div></div>`; }).join('')}</div>`).join('')}</div><p class="creator-rule">A Trait costs 4 × its new rank in XP. Void costs 6 × its new rank. Starting ranks cannot exceed 4.</p></section>`;
  }

  function renderSkillRoll(name, skill) {
    return `<label class="creator-skill-trait"><span>Trait</span><select data-skill-trait="${escapeHtml(name)}" aria-label="Roll trait for ${escapeHtml(name)}">${option('', 'Choose trait', !skill.trait)}${TRAIT_NAMES.map(trait => option(trait, trait, trait === skill.trait)).join('')}</select></label><div class="creator-skill-roll"><small>Base roll</small><strong>${escapeHtml(skill.roll?.notation || '—')}</strong></div>`;
  }

  function renderSkills(data) {
    const names = Object.keys(data.skills).sort((a,b) => a.localeCompare(b));
    const suggestions = [...new Set([...catalog.skills.map(skill => skill.name), ...catalog.clans.flatMap(clan => clan.schools.flatMap(school => school.skills.map(skill => skill.name))), 'Artisan: Painting', 'Artisan: Gardening', 'Artisan: Poetry', 'Craft: Carpentry', 'Lore: Gaijin', 'Perform: Dance', 'Perform: Song'])].sort((a,b) => a.localeCompare(b));
    const choices = data.school?.skillChoices || [];
    return `<section class="creator-panel creator-skills" id="creator-skills"><div class="creator-panel-head"><span class="creator-step">03</span><div><h2>Skills</h2><p>Rolls use Skill + Trait, keeping Trait. Choose the trait used for each task.</p></div></div>${choices.length ? `<div class="creator-choice-grid">${choices.map((choice,index) => `<label>${escapeHtml(choice.prompt)} · ${choice.kind === 'emphasis' ? 'Free emphasis' : `School rank ${choice.rank}`}<input type="text" data-choice-index="${index}" ${choice.kind === 'skill' ? `list="school-suggestions-${index}"` : ''} value="${escapeHtml(sheet.schoolChoices[index] || '')}" placeholder="${choice.kind === 'emphasis' ? 'Choose an emphasis' : 'Choose a school skill'}" ${data.skillChoiceErrors[index] ? 'aria-invalid="true"' : ''}>${choice.kind === 'skill' ? `<datalist id="school-suggestions-${index}">${suggestions.filter(name => allowedSchoolSkill(choice, name)).map(name => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>` : ''}${data.skillChoiceErrors[index] ? `<small class="creator-choice-error">${escapeHtml(data.skillChoiceErrors[index])}</small>` : ''}</label>`).join('')}</div>` : ''}<div class="creator-add-row"><input id="new-skill" type="text" list="skill-suggestions" placeholder="Add a skill, e.g. Courtier or Lore: History"><datalist id="skill-suggestions">${suggestions.map(name => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist><button type="button" data-action="add-skill">Add skill</button></div>${names.length ? `<div class="creator-skill-list"><div class="creator-skill-table-head"><span>Skill name</span><span>Trait · Roll · Rank</span></div>${names.map(name => { const skill = data.skills[name]; return `<div class="creator-skill-row"><div><strong>${escapeHtml(name)}</strong><small>${skill.base ? `School rank ${skill.base} · Free` : 'Purchased skill'}${skill.emphases.length ? ` · Emphasis: ${escapeHtml(skill.emphases.join(', '))}` : ''}${skill.cost ? ` · ${skill.cost} XP spent` : ''}${skill.notes ? ` · ${escapeHtml(skill.notes)}` : ''}</small></div><div class="creator-skill-values">${renderSkillRoll(name,skill)}<div class="rank-control"><button type="button" data-action="skill" data-skill="${escapeHtml(name)}" data-delta="-1" ${skill.rank <= skill.base ? 'disabled' : ''} aria-label="Decrease ${escapeHtml(name)}">−</button><b>${skill.rank}</b><button type="button" data-action="skill" data-skill="${escapeHtml(name)}" data-delta="1" ${skill.rank >= 4 ? 'disabled' : ''} aria-label="Increase ${escapeHtml(name)} for ${skill.rank + 1} XP">+</button></div></div></div>`; }).join('')}</div>` : '<div class="creator-empty">Choose a school or add a skill to begin.</div>'}<p class="creator-rule">A Skill costs XP equal to its new rank. A new Skill at Rank 1 costs 1 XP. Starting ranks cannot exceed 4.</p></section>`;
  }

  function renderOptions(data) {
    const optionList = (kind) => {
      const entries = kind === 'advantage' ? catalog.advantages : catalog.disadvantages;
      const owned = kind === 'advantage' ? sheet.advantages : sheet.disadvantages;
      const id = `${kind}-select`;
      return `<div class="creator-option-column"><h3>${kind === 'advantage' ? 'Advantages' : 'Disadvantages'}</h3><div class="creator-add-row"><select id="${id}">${option('', `Choose ${kind}`, true)}${entries.map(entry => option(entry.name, `${entry.name}${entry.costs.length ? ` · ${entry.costs.join('/')} XP` : ' · variable'}`, false)).join('')}</select><button type="button" data-action="add-${kind}">Add</button></div>${owned.length ? `<div class="creator-option-list">${owned.map((entry,index) => `<div class="creator-option-row"><span>${escapeHtml(entry.name)}</span><label><input type="number" min="0" max="30" step="1" value="${Number(entry.cost) || 0}" data-kind="${kind}" data-index="${index}" aria-label="${escapeHtml(entry.name)} point cost"> XP</label><button type="button" data-action="remove-${kind}" data-index="${index}" aria-label="Remove ${escapeHtml(entry.name)}">×</button></div>`).join('')}</div>` : '<div class="creator-empty">None selected.</div>'}<a class="creator-source" href="${sourceLink(kind === 'advantage' ? 'advantages' : 'disadvantages')}">Read full ${kind === 'advantage' ? 'advantage' : 'disadvantage'} rules ↗</a></div>`;
    };
    return `<section class="creator-panel" id="creator-options"><div class="creator-panel-head"><span class="creator-step">04</span><div><h2>Advantages & disadvantages</h2><p>Choose from the archive and adjust costs for variable or clan specific options.</p></div></div><div class="creator-option-grid">${optionList('advantage')}${optionList('disadvantage')}</div><p class="creator-rule">Disadvantages grant up to 10 bonus XP in total. The descriptions contain restrictions and clan specific costs, so check each entry before play.${data.disadvantageTotal > 10 ? ` You selected ${data.disadvantageTotal} points; only 10 count toward your budget.` : ''}</p></section>`;
  }

  function startingMoney(data) {
    return Object.entries(data.money).map(([currency, amount]) => `${amount} ${currency}`).join(' · ');
  }

  function renderEquipment(data) {
    const rows = data.equipment.map(entry => `<div class="creator-equipment-row"><div><strong>${escapeHtml(entry.name)}</strong><small>${entry.source === 'school' ? 'School outfit · Free' : 'Personal equipment'}${entry.pending ? ' · Choose an item' : ''}</small></div>${entry.source === 'school' && entry.choice ? `<label>${escapeHtml(data.school.equipment[entry.index].name)}<input data-equipment-choice="${entry.index}" type="text" value="${escapeHtml(sheet.equipmentChoices[entry.index] || '')}" placeholder="Choose your equipment"></label>` : ''}${entry.source === 'personal' ? `<button type="button" data-action="remove-equipment" data-index="${entry.index}" aria-label="Remove ${escapeHtml(entry.name)}">×</button>` : ''}</div>`).join('');
    return `<div class="creator-purchases creator-equipment" id="creator-equipment"><h3>Equipment</h3><p>Your school outfit is added automatically. Complete any equipment choices and add personal items below.</p>${startingMoney(data) ? `<p class="creator-starting-money"><strong>Starting money:</strong> ${escapeHtml(startingMoney(data))}</p>` : ''}${rows ? `<div class="creator-equipment-list">${rows}</div>` : '<div class="creator-empty">Choose a school to receive your starting outfit.</div>'}<div class="creator-add-row"><input id="new-equipment" type="text" placeholder="Equipment name" aria-label="Equipment name"><button type="button" data-action="add-equipment">Add equipment</button></div></div>`;
  }

  function renderTraining(data) {
    if (!data.school) return '';
    return `<div class="creator-purchases creator-training"><h3>School training</h3>${data.techniques.map(entry => `<div class="creator-training-entry"><strong>${escapeHtml(entry.name)}</strong><p>${escapeHtml(entry.description)}</p></div>`).join('')}${data.school.affinity ? `<div class="creator-training-entry"><strong>Affinity / Deficiency</strong><p>${escapeHtml(data.school.affinity)}</p></div>` : ''}${data.school.spells ? `<div class="creator-training-entry"><strong>Starting spells</strong><p>${escapeHtml(data.school.spells)}</p></div>` : ''}<a class="creator-source" href="${sourceLink(data.school.slug, data.school.anchor)}">View school rules ↗</a></div>`;
  }

  function renderStory(data) {
    return `<section class="creator-panel" id="creator-story"><div class="creator-panel-head"><span class="creator-step">05</span><div><h2>Story & equipment</h2><p>Record your role in the Empire and any remaining choices.</p></div></div><div class="creator-fields"><label>Character concept<input data-field="concept" type="text" value="${escapeHtml(sheet.concept)}" placeholder="A loyal yojimbo, an ambitious courtier…"></label><label>Status<input data-field="status" type="number" min="0" max="10" step="0.1" value="${Number(sheet.status)}"></label><label>Glory<input data-field="glory" type="number" min="0" max="10" step="0.1" value="${Number(sheet.glory)}"></label><label class="creator-wide">Notes & heritage<textarea data-field="notes" rows="7" placeholder="Add your heritage and story notes here.">${escapeHtml(sheet.notes)}</textarea></label></div>${renderEquipment(data)}${renderTraining(data)}<div class="creator-purchases"><h3>Other XP purchases</h3><p>Use this for Emphases (2 XP), kata, kiho, or other approved purchases.</p><div class="creator-add-row"><input id="purchase-name" type="text" placeholder="Purchase name"><input id="purchase-cost" type="number" min="0" max="100" step="1" placeholder="XP"><button type="button" data-action="add-purchase">Add</button></div>${sheet.purchases.length ? `<div class="creator-option-list">${sheet.purchases.map((entry,index) => `<div class="creator-option-row"><span>${escapeHtml(entry.name)}</span><strong>${Number(entry.cost) || 0} XP</strong><button type="button" data-action="remove-purchase" data-index="${index}" aria-label="Remove ${escapeHtml(entry.name)}">×</button></div>`).join('')}</div>` : ''}</div><p class="creator-rule">For heritage and detailed background prompts, see <a href="${sourceLink('heritage')}">Heritage</a> and <a href="${sourceLink('chargen')}">Character Generation</a>.</p></section>`;
  }

  function renderSummary(data) {
    const ringList = TRAIT_GROUPS.map(group => `<div><span>${group.mark} ${group.ring}</span><strong>${data.rings[group.ring]}</strong></div>`).join('');
    const track = (label, value) => `<div class="creator-reputation-row"><div><span>${label}</span><strong>${value}</strong></div><div class="creator-track" aria-hidden="true">${Array.from({length:10},(_,index) => `<i class="${index < Math.floor(Number(value) || 0) ? 'filled' : ''}"></i>`).join('')}</div></div>`;
    return `<aside class="creator-summary"><div class="creator-summary-inner"><div class="creator-summary-seal" aria-hidden="true">◈</div><small class="creator-summary-kicker">CHARACTER RECORD</small><h2 id="summary-name">${escapeHtml(sheet.name || 'Unnamed samurai')}</h2><p>${escapeHtml([sheet.clan, sheet.family, data.school?.name].filter(Boolean).join(' · ') || 'Choose a clan to begin')}</p><div class="creator-xp ${data.xpRemaining < 0 ? 'over-budget' : ''}"><span>EXPERIENCE POINTS REMAINING</span><strong>${data.xpRemaining}</strong><small>40 starting + ${data.xpEarned} disadvantage − ${data.xpSpent} spent</small></div><div class="creator-ledger-heading">Honor & standing</div><div class="creator-reputation">${track('Honor', data.school?.honor ?? '—')}${track('Glory', sheet.glory)}${track('Status', sheet.status)}</div><div class="creator-ledger-heading">The five rings</div><div class="creator-summary-rings">${ringList}</div><div class="creator-ledger-heading">Insight</div><div class="creator-derived"><div><span>Rings × 10 + Skills</span><strong>${data.insight}</strong></div><div><span>Insight Rank</span><strong>${data.insightRank}</strong></div></div><div class="creator-ledger-heading">Combat values</div><div class="creator-derived creator-combat"><div><span>Initiative roll</span><strong>${data.combat.initiative.notation}</strong></div><div><span>Armor TN (base)</span><strong>${data.combat.baseArmorTN}</strong></div><div><span>Healing / day</span><strong>${data.combat.healing}</strong></div><div><span>Unarmed damage</span><strong>${data.combat.unarmedDamage.notation}</strong></div><div><span>Void Points</span><strong>${data.combat.voidPoints}</strong></div><div><span>Wound capacity</span><strong>${data.combat.wounds.maximum}</strong></div></div><div class="creator-ledger-heading">Wounds · cumulative totals</div><div class="creator-wounds">${data.combat.wounds.levels.map(level => `<div><span>${level.label}</span><strong>${level.total}</strong></div>`).join('')}<small>Healthy: Earth × 5 · each further level adds Earth × 2</small></div><div class="creator-summary-links"><a href="${sourceLink('chargen')}">Creation rules ↗</a><a href="${sourceLink('families')}">Families ↗</a></div></div></aside>`;
  }

  function renderPrintSheet(data) {
    const value = item => item === '' || item == null ? '' : escapeHtml(item);
    const line = (label, item) => `<div class="print-line"><span>${label}</span><strong>${value(item)}</strong></div>`;
    const bar = title => `<div class="print-bar">${title}</div>`;
    const circles = item => Array.from({length:10}, (_,index) => `<span>${index < Math.floor(Number(item) || 0) ? '●' : '○'}</span>`).join('');
    const standing = (label, item) => `<div class="print-standing-row"><div>${label}<b>${value(item)}</b></div><div class="print-circles">${circles(item)}</div></div>`;
    const element = (ring, first, second, side) => `<div class="print-element print-element-${ring.toLowerCase()} ${side}"><div class="print-element-name">${ring}</div><div class="print-element-body"><div class="print-element-traits">${[first,second].map(trait => `<div><span>${trait}</span><b>${data.traits[trait].rank}</b></div>`).join('')}</div><div class="print-ring-disc">${data.rings[ring]}</div></div></div>`;
    const skills = Object.entries(data.skills).sort(([a],[b]) => a.localeCompare(b));
    const skillRows = Array.from({length:22}, (_,index) => {
      const [name,skill] = skills[index] || [];
      return `<div class="print-skill-row"><span class="print-skill-school">${skill?.base ? '○' : ''}</span><span>${value(name)}</span><b>${skill?.rank ?? ''}</b><span title="${value(skill?.trait)}">${value(skill?.trait?.slice(0,3))}</span><span>${value(skill?.roll?.notation)}</span><span>${value(skill?.emphases.join(', '))}</span></div>`;
    }).join('');
    const table = (title, rows) => `${bar(title)}<div class="print-stat-table">${rows.map(([label,item]) => `<div><span>${label}</span><strong>${value(item)}</strong></div>`).join('')}</div>`;
    const woundLevels = data.combat.wounds.levels;
    const weapon = title => `<div class="print-weapon">${bar(title)}${['Type','Attack Roll','Damage Roll','Bonus','Notes'].map(label => line(label,'')).join('')}</div>`;
    const list = entries => entries.length ? entries.map(entry => `<div class="print-extra-row"><span>${escapeHtml(entry.name)}</span><b>${Number(entry.cost) || 0} XP</b></div>`).join('') : '<div class="print-extra-row"></div>';
    const hasExtra = skills.length > 22 || sheet.advantages.length || sheet.disadvantages.length || sheet.purchases.length || sheet.notes || sheet.concept || data.equipment.length || data.techniques.length || data.school?.spells || Object.keys(data.money).length;
    return `<div class="creator-print-sheet" aria-label="Printable character sheet">
      <div class="print-first-page">
        <header class="print-sheet-head"><div class="print-head-identity">${line('Name',sheet.name)}${line('Clan',sheet.clan)}${line('Family',sheet.family)}${line('School',data.school?.name)}</div><div class="print-head-ranks">${line('Rank',data.insightRank)}${line('Experience Points',data.xpRemaining)}${line('Insight',data.insight)}</div><div class="print-sheet-title"><span class="print-five">◯ ◯<br>◯ ◯<br> ◯</span><strong>Legend of the<br>Five Rings</strong></div></header>
        <div class="print-sheet-body"><div class="print-left">
          <div class="print-ring-map">${element('Earth','Stamina','Willpower','trait-left')}${element('Air','Reflexes','Awareness','trait-right')}${element('Water','Strength','Perception','trait-left')}${element('Fire','Agility','Intelligence','trait-right')}<div class="print-void"><div>Void</div><b>${data.rings.Void}</b><span>Void Points Spent</span><div class="print-void-circles">${circles(0)}</div></div></div>
          <div class="print-skills"><div class="print-skill-head"><span></span><span>Skill Name</span><span>Rank</span><span>Trait</span><span>Roll</span><span>Emphases & Mastery Abilities</span></div>${skillRows}</div>
        </div><div class="print-right"><div class="print-standing">${standing('Honor',data.school?.honor)}${standing('Glory',sheet.glory)}${standing('Status',sheet.status)}${standing('Shadowlands Taint',null)}</div>
          ${table('Initiative',[['Insight Rank / Reflexes',`${data.insightRank} / ${data.traits.Reflexes.rank}`],['Modifiers',''],['Initiative Roll',data.combat.initiative.notation]])}
          ${table('Armor TN',[['Type / Bonus',''],['Reduction',''],['Base TN (before bonuses)',data.combat.baseArmorTN]])}
          ${table('Armor',[['TN Bonus',''],['Quality',''],['Notes','']])}
          ${bar('Wounds')}<div class="print-wound-note">Cumulative totals · Healthy Earth × 5 · further levels Earth × 2</div><div class="print-wound-head"><span>Wound Level</span><span>Total</span><span>Current</span></div><div class="print-wound-table">${woundLevels.map(level => `<div><span>${level.label}</span><b>${level.total}</b><span></span></div>`).join('')}</div>
          ${table('Rate of Wound Heal',[['Stamina × 2 + Insight Rank',data.combat.healing],['Modifiers',''],['Wounds Healed / Day',data.combat.healing]])}
        </div></div>
        <div class="print-weapons">${weapon('Weapon 1')}${weapon('Weapon 2')}<div class="print-weapon">${bar('Arrows')}<div class="print-arrow-head"><span>Type</span><span>Damage</span><span>Quantity</span></div>${Array.from({length:5},() => '<div class="print-arrow-row"><span></span><span></span><span></span></div>').join('')}</div></div>
      </div>
      ${hasExtra ? `<div class="print-second-page"><header class="print-second-head"><span>${value(sheet.name) || 'Character'}</span><strong>Personal Record</strong></header><div class="print-extra-columns"><div>${skills.length > 22 ? `<section>${bar('Additional Skills')}${skills.slice(22).map(([name,skill]) => `<div class="print-extra-row"><span>${escapeHtml(name)}</span><b>${skill.rank} · ${value(skill.trait)} · ${value(skill.roll?.notation)}</b></div>`).join('')}</section>` : ''}<section>${bar('Advantages')}${list(sheet.advantages)}</section><section>${bar('Disadvantages')}${list(sheet.disadvantages)}</section></div><div><section>${bar('Character Concept')}<p>${value(sheet.concept)}</p></section><section>${bar('Notes & Heritage')}<p class="print-extra-notes">${value(sheet.notes)}</p></section><section>${bar('Equipment')}<ul>${data.equipment.map(entry => `<li>${value(entry.name)}${entry.pending ? ' (choose)' : ''}</li>`).join('')}</ul><p>${value(startingMoney(data))}</p></section><section>${bar('School Training')}${data.techniques.map(entry => `<p><strong>${value(entry.name)}</strong><br>${value(entry.description)}</p>`).join('')}${data.school?.affinity ? `<p><strong>Affinity / Deficiency:</strong> ${value(data.school.affinity)}</p>` : ''}${data.school?.spells ? `<p><strong>Starting spells:</strong> ${value(data.school.spells)}</p>` : ''}</section>${sheet.purchases.length ? `<section>${bar('Other Purchases')}${list(sheet.purchases)}</section>` : ''}</div></div></div>` : ''}
    </div>`;
  }

  function render() {
    if (!root?.isConnected || !catalog || !location.hash.startsWith('#/create-character')) return;
    const data = build();
    root.innerHTML = `<div class="creator-page"><div class="creator-header"><div class="eyebrow muted"><span class="eyebrow-line"></span> BOOK OF FIRE · CHARACTER CREATION</div><div class="creator-header-row"><div><h1>Create a character</h1><p>Shape a samurai of Rokugan. Your choices are saved automatically. Sign in to keep them across devices.</p></div><div class="creator-header-actions"><a href="#/start">← Characters</a><button type="button" data-action="export">Export JSON ↗</button><button type="button" data-action="print">Print sheet ↗</button></div></div></div><div class="creator-layout"><div class="creator-main">${renderIdentity(data)}${renderTraits(data)}${renderSkills(data)}${renderOptions(data)}${renderStory(data)}<div class="creator-bottom"><span data-save-status>${escapeHtml(window.CharacterStorage?.status || 'Saved on this device')}</span><button type="button" data-action="reset">Start over</button></div></div>${renderSummary(data)}</div>${renderPrintSheet(data)}</div>`;
  }

  function onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'trait') {
      const trait = button.dataset.trait, current = build().traits[trait];
      if (Number(button.dataset.delta) > 0 && current.rank < 4) sheet.traitBuys[trait] = (Number(sheet.traitBuys[trait]) || 0) + 1;
      if (Number(button.dataset.delta) < 0 && current.rank > current.base) sheet.traitBuys[trait] = Math.max(0,(Number(sheet.traitBuys[trait]) || 0) - 1);
    } else if (action === 'skill') {
      const name = button.dataset.skill, current = build().skills[name];
      if (Number(button.dataset.delta) > 0 && current.rank < 4) sheet.skills[name] = current.rank + 1;
      if (Number(button.dataset.delta) < 0 && current.rank > current.base) {
        if (current.rank - 1) sheet.skills[name] = current.rank - 1; else delete sheet.skills[name];
      }
    } else if (action === 'add-skill') {
      const name = skillIdentity(root.querySelector('#new-skill').value).name;
      if (!name) return;
      if (build().skills[name]) return;
      sheet.skills[name] = Math.max(1, Number(sheet.skills[name]) || 0);
    } else if (action === 'add-equipment') {
      const name = root.querySelector('#new-equipment').value.trim();
      if (!name) return;
      sheet.equipment.push({name});
    } else if (action === 'remove-equipment') {
      sheet.equipment.splice(Number(button.dataset.index),1);
    } else if (action === 'add-advantage' || action === 'add-disadvantage') {
      const kind = action.slice(4), name = root.querySelector(`#${kind}-select`).value;
      const choice = catalog[kind === 'advantage' ? 'advantages' : 'disadvantages'].find(entry => entry.name === name);
      if (!choice) return;
      sheet[kind === 'advantage' ? 'advantages' : 'disadvantages'].push({name, cost:choice.costs[0] || 0});
    } else if (action === 'remove-advantage' || action === 'remove-disadvantage') {
      const collection = action === 'remove-advantage' ? 'advantages' : 'disadvantages';
      sheet[collection].splice(Number(button.dataset.index),1);
    } else if (action === 'add-purchase') {
      const name = root.querySelector('#purchase-name').value.trim();
      const cost = Math.max(0, Number(root.querySelector('#purchase-cost').value) || 0);
      if (!name) return;
      sheet.purchases.push({name,cost});
    } else if (action === 'remove-purchase') {
      sheet.purchases.splice(Number(button.dataset.index),1);
    } else if (action === 'export') {
      const data = {character:sheet, derived:build(), exportedAt:new Date().toISOString(), source:'Last Haiku'};
      const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${(sheet.name || 'rokugan-character').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-')}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
      return;
    } else if (action === 'print') { window.print(); return;
    } else if (action === 'reset') {
      if (!window.confirm('Clear this character and start over?')) return;
      sheet = blank();
    } else return;
    save(); render();
  }

  function onChange(event) {
    const field = event.target.dataset.field;
    if (field === 'clan') { sheet.clan = event.target.value; sheet.family = ''; sheet.school = ''; sheet.schoolChoices = []; sheet.equipmentChoices = []; sheet.status = sheet.clan === 'Ronin' ? 0 : 1; }
    else if (field === 'family') sheet.family = event.target.value;
    else if (field === 'school') { sheet.school = event.target.value; sheet.schoolChoices = []; sheet.equipmentChoices = []; }
    else if (field === 'status' || field === 'glory') sheet[field] = Math.max(0, Number(event.target.value) || 0);
    else if (event.target.dataset.skillTrait !== undefined) {
      const name = event.target.dataset.skillTrait;
      if (TRAIT_NAMES.includes(event.target.value)) sheet.skillTraits[name] = event.target.value;
      else delete sheet.skillTraits[name];
    }
    else if (event.target.dataset.choiceIndex !== undefined) sheet.schoolChoices[Number(event.target.dataset.choiceIndex)] = event.target.value.trim();
    else if (event.target.dataset.equipmentChoice !== undefined) sheet.equipmentChoices[Number(event.target.dataset.equipmentChoice)] = event.target.value.trim();
    else if (event.target.dataset.kind) {
      const collection = event.target.dataset.kind === 'advantage' ? sheet.advantages : sheet.disadvantages;
      const entry = collection[Number(event.target.dataset.index)];
      if (entry) entry.cost = Math.max(0, Math.min(30, Number(event.target.value) || 0));
    } else return;
    save(); render();
  }

  function onInput(event) {
    const field = event.target.dataset.field;
    if (!['name','concept','notes'].includes(field)) return;
    sheet[field] = event.target.value;
    save();
    if (field === 'name') root.querySelector('#summary-name').textContent = sheet.name || 'Unnamed samurai';
    root.querySelector('.creator-print-sheet').outerHTML = renderPrintSheet(build());
  }

  async function mount(element) {
    root = element;
    root.onclick = onClick;
    root.onchange = onChange;
    root.oninput = onInput;
    sheet = loadSheet();
    try {
      catalogPromise ||= fetch('public/character-data.json').then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      catalog = await catalogPromise;
      const normalizedSkills = {};
      for (const [value, rank] of Object.entries(sheet.skills)) {
        const {name} = skillIdentity(value);
        normalizedSkills[name] = Math.max(normalizedSkills[name] || 0, Number(rank) || 0);
      }
      sheet.skills = normalizedSkills;
      render();
    } catch (error) {
      root.innerHTML = '<div class="not-found"><h1>Character data unavailable</h1><p>Please refresh the page.</p></div>';
      console.error(error);
    }
  }

  window.CharacterBuilder = { mount, list, create, open, remove };
  window.addEventListener?.('characters-remote-changed', () => {
    if (root?.isConnected && location.hash.startsWith('#/create-character')) {
      if (!roster().some(record => record.id === activeId)) { location.hash = '#/start'; return; }
      sheet = loadSheet(); render();
    }
    window.dispatchEvent(new Event('characters-changed'));
  });
  window.addEventListener?.('character-sync-changed', () => {
    const label = root?.querySelector?.('[data-save-status]');
    if (label) label.textContent = window.CharacterStorage.status;
  });
})();
