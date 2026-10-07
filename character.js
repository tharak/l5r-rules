(() => {
  const LEGACY_KEY = 'l5r-rules-character-v1';
  const ROSTER_KEY = 'l5r-rules-characters-v1';
  const ACTIVE_KEY = 'l5r-rules-active-character-v1';
  const MIGRATION_KEY = 'l5r-rules-characters-migrated-v1';
  const C = window.CharacterCatalog, R = window.CharacterRules;
  const {TRAIT_GROUPS, TRAIT_NAMES} = C;
  const sectionNames={identity:'Identity & training',traits:'Rings & traits',skills:'Skills',options:'Advantages & disadvantages',abilities:'Abilities',story:'Story & equipment',summary:'Summary & combat'};
  const resetDescriptions={identity:'the name, clan, family, school, and training choices',traits:'purchased Trait ranks',skills:'purchased Skills, emphases, Trait choices, and selectable school Skills',options:'advantages, disadvantages, and ancestors',abilities:'selected abilities',story:'story notes, heritage, personal equipment, outfit choices, money, standing, custom purchases, and modifiers',summary:'starting XP to 40, wounds taken, and mechanical modifiers'};
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const blank = () => R.normalize();
  let uiError = '';
  let catalog, catalogPromise, sheet, root, activeId, external = null;
  const activeKey = () => window.CharacterStorage?.activeKey() || ACTIVE_KEY;

  function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function roster() {
    try {
      if (window.CharacterStorage?.accountId) return window.CharacterStorage.records();
      const saved = JSON.parse(localStorage.getItem(ROSTER_KEY) || localStorage.getItem('last-haiku-characters-v1'));
      if (saved && !localStorage.getItem(ROSTER_KEY)) { localStorage.setItem(ROSTER_KEY,JSON.stringify(saved)); localStorage.setItem(ACTIVE_KEY,localStorage.getItem('last-haiku-active-character-v1') || saved[0]?.id || ''); }
      if (Array.isArray(saved)) return saved;
      const legacy = localStorage.getItem(MIGRATION_KEY) ? null : JSON.parse(localStorage.getItem(LEGACY_KEY) || localStorage.getItem('last-haiku-character-v1'));
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
    } catch { window.alert?.('Your browser could not save this change. Export your character to keep a backup.'); return false; }
    window.dispatchEvent(new Event('characters-changed'));
    return true;
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
    if (external) { external.save(sheet); return true; }
    const records = roster(), record = records.find(item => item.id === activeId);
    if (record) { record.sheet = sheet; record.updatedAt = new Date().toISOString(); return storeRoster(records); }
    return false;
  }
  function selectedClan() { return catalog.clans.find(clan => clan.name === sheet.clan); }
  function selectedFamily() { return selectedClan()?.families.find(family => family.name === sheet.family); }
  function selectedSchool() { return C.school(sheet.school,catalog); }
  function sourceLink(slug, anchor = '') { return `#/${encodeURIComponent(slug)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`; }
  const skillIdentity = value => C.skillIdentity(value,catalog);
  const allowedSchoolSkill = (choice,value) => C.allowedSchoolSkill(choice,value,catalog);
  const build = () => R.calculate(sheet,catalog);
  const rankLimit = () => sheet.phase === 'advancement' || sheet.exceptions.some(e => String(e.code).startsWith('rank:') && String(e.explanation || '').trim()) ? 10 : 4;
  const read = selector => root.querySelector(selector)?.value?.trim() || '';
  const newId = () => makeId();
  const abilityLabel = a => `${a.name} · ${a.kind}${a.ring ? ` · ${a.ring} ${a.mastery || ''}` : ''}`;
  function commitEdit(before, explanation = '') {
    sheet = R.recordChange(before,sheet,catalog,explanation);
    save(); render();
  }
  const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  function renderIdentity(data) {
    const clan = selectedClan();
    const clanOptions = ['Great Clans','Minor Clans','Other'].map(group => `<optgroup label="${group}">${catalog.clans.filter(clan => clan.group === group).map(clan => option(clan.name, clan.name, clan.name === sheet.clan)).join('')}</optgroup>`).join('');
    const familyOptions = (clan?.families || []).map(family => option(family.name, `${family.name} · +1 ${family.trait}`, family.name === sheet.family)).join('');
    const availableSchools=[...(sheet.advantages.some(a=>a.name==='Different School') ? C.schools(catalog) : clan?.schools || [])];
    const currentSchool=selectedSchool();if(currentSchool && !availableSchools.includes(currentSchool))availableSchools.push(currentSchool);
    const schoolOptions = availableSchools.filter(school=>!school.nonhuman || `${school.slug}#${school.anchor}`===sheet.school).map(school => option(`${school.slug}#${school.anchor}`, `${school.name}${school.benefit ? ` · +1 ${school.benefit}` : ''}`, `${school.slug}#${school.anchor}` === sheet.school)).join('');
    return `<section class="creator-panel creator-identity" id="creator-identity"><div class="creator-panel-head"><span class="creator-step">01</span><div><h2>Identity & training</h2><p>Choose a clan, family, and starting school.</p></div></div><p class="creator-rule">Imperial families require GM approval in the source rules. Selecting a Ronin family adds its required 5 XP cost automatically.</p><div class="creator-fields"><label>Name<input data-field="name" type="text" value="${escapeHtml(sheet.name)}" placeholder="Your character’s name"></label><label>Clan<select data-field="clan">${option('', 'Choose a clan', !sheet.clan)}${clanOptions}</select></label><label>Family<select data-field="family" ${clan?.families.length ? '' : 'disabled'}>${option('', clan?.families.length ? 'Choose a family' : 'No family benefit', !sheet.family)}${familyOptions}</select></label><label>School<select data-field="school" ${clan ? '' : 'disabled'}>${option('', clan?.schools.length ? 'Choose a school' : 'No starting school listed', !sheet.school)}${schoolOptions}</select></label></div><div class="creator-bonuses"><div><small>FAMILY BENEFIT</small><strong>${data.family ? `+1 ${escapeHtml(data.family.trait)}` : 'Choose a family'}</strong>${data.family ? `<a data-rule-reference href="${sourceLink(data.family.slug,data.family.anchor)}">View family ↗</a>` : ''}</div><div><small>SCHOOL BENEFIT</small><strong>${data.school?.benefit ? `+1 ${escapeHtml(data.school.benefit)}` : 'Choose a school'}</strong>${data.school ? `<a data-rule-reference href="${sourceLink(data.school.slug,data.school.anchor)}">View school ↗</a>` : ''}</div></div>${data.school ? `<div class="creator-school-note"><strong>${sheet.phase==='creation'?'Starting school':'Starting school · creation grants retained'}</strong><p><b>Honor:</b> ${data.school.honor ?? 'See school'} · <b>Skills:</b> ${escapeHtml(data.school.skillsRaw || 'See school')}</p>${data.school.choices.length ? `<p><b>Choose:</b> ${escapeHtml([...new Set(data.school.choices)].join('; '))}. Complete your school choices in the Skills section.</p>` : ''}<p><b>Outfit:</b> ${escapeHtml(data.school.outfit || 'See school description')}</p></div>` : ''}${sheet.clan==='Imperial'?`<label class="creator-approval">GM approval for Imperial family<input data-imperial-approval type="text" value="${escapeHtml(sheet.exceptions.find(e=>e.code==='imperial')?.explanation || '')}" placeholder="Record who approved this family"></label>`:''}${renderTraining(data)}${renderSchoolDecisions(data,'identity')}${sheet.phase==='creation'?renderCreationOptions(data):''}</section>`;
  }

  function renderTraits(data) {
    return `<section class="creator-panel" id="creator-traits"><div class="creator-panel-head"><span class="creator-step">02</span><div><h2>Rings & traits</h2><p>All Rings begin at 2. Family and school benefits are applied automatically.</p></div></div><p class="creator-rule">A Trait costs 4 × its new rank in XP. Void costs 6 × its new rank. ${sheet.phase === 'creation' ? 'Creation ranks cannot exceed 4.' : 'Advancement ranks can reach 10.'}</p><div class="creator-ring-grid">${TRAIT_GROUPS.map(group => `<div class="creator-ring" data-ring="${group.ring}"><div class="creator-ring-head"><span class="creator-ring-mark">${group.mark}</span><div><strong>${group.ring}</strong><small>${group.ring === 'Void' ? 'Void Points' : group.traits.join(' · ')}</small></div><b>${data.rings[group.ring]}</b></div>${group.traits.map(trait => { const item = data.traits[trait], next = item.rank + 1, cost = next * (trait === 'Void' ? 6 : 4); return `<div class="creator-rank-row"><span><strong>${trait}</strong><small>Base ${item.base}${data.traitCosts[trait] ? ` · ${data.traitCosts[trait]} XP spent` : ''}</small></span><div class="rank-control" role="group" aria-label="${trait} rank"><button type="button" data-action="trait" data-trait="${trait}" data-delta="-1" ${item.rank <= item.base ? 'disabled' : ''} aria-label="Decrease ${trait}">−</button><output aria-label="${trait} rank">${item.rank}</output><button type="button" data-action="trait" data-trait="${trait}" data-delta="1" ${item.rank >= rankLimit() ? 'disabled' : ''} aria-label="Increase ${trait} for ${cost} XP">+</button></div></div>`; }).join('')}</div>`).join('')}</div></section>`;
  }

  function renderSkillRoll(name, skill) {
    return `<label class="creator-skill-trait"><span>Trait</span><select data-skill-trait="${escapeHtml(name)}" aria-label="Roll trait for ${escapeHtml(name)}">${option('', 'Choose trait', !skill.trait)}${TRAIT_NAMES.map(trait => option(trait, trait, trait === skill.trait)).join('')}</select></label><div class="creator-skill-roll"><small>Base roll${skill.armorTNPenalty?` · Armor TN +${skill.armorTNPenalty}`:''}</small><strong>${escapeHtml(skill.roll?.notation || '—')}</strong></div>`;
  }

  function renderSkills(data) {
    const names = Object.keys(data.skills).sort((a,b) => a.localeCompare(b));
    const suggestions = [...new Set([...catalog.skills.map(skill => skill.name), ...catalog.clans.flatMap(clan => clan.schools.flatMap(school => school.skills.map(skill => skill.name))), 'Artisan: Painting', 'Artisan: Gardening', 'Artisan: Poetry', 'Craft: Carpentry', 'Lore: Gaijin', 'Perform: Dance', 'Perform: Song'])].sort((a,b) => a.localeCompare(b));
    const choices = data.school?.skillChoices || [];
    return `<section class="creator-panel creator-skills" id="creator-skills"><div class="creator-panel-head"><span class="creator-step">03</span><div><h2>Skills</h2><p>Rolls use Skill + Trait, keeping Trait. Choose the trait used for each task.</p></div></div><p class="creator-rule">A Skill costs XP equal to its new rank. A new Skill at Rank 1 costs 1 XP. ${sheet.phase === 'creation' ? 'Creation ranks cannot exceed 4.' : 'Advancement ranks can reach 10.'}</p>${renderSchoolDecisions(data,'skills')}${choices.length ? `<div class="creator-choice-grid">${choices.map((choice,index) => `<label>${escapeHtml(choice.prompt)} · ${choice.kind === 'emphasis' ? 'Free emphasis' : `School rank ${choice.rank}`}<input type="text" data-choice-index="${index}" ${choice.kind === 'skill' ? `list="school-suggestions-${index}"` : ''} value="${escapeHtml(sheet.schoolChoices[index] || '')}" placeholder="${choice.kind === 'emphasis' ? 'Choose an emphasis' : 'Choose a school skill'}" ${data.skillChoiceErrors[index] ? 'aria-invalid="true"' : ''}>${choice.kind === 'skill' ? `<datalist id="school-suggestions-${index}">${suggestions.filter(name => allowedSchoolSkill(choice, name)).map(name => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>` : ''}${data.skillChoiceErrors[index] ? `<small class="creator-choice-error">${escapeHtml(data.skillChoiceErrors[index])}</small>` : ''}</label>`).join('')}</div>` : ''}<div class="creator-add-row"><input id="new-skill" type="text" list="skill-suggestions" placeholder="Add a skill, e.g. Courtier or Lore: History"><datalist id="skill-suggestions">${suggestions.map(name => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist><button type="button" data-action="add-skill">Add skill</button></div>${names.length ? `<div class="creator-skill-list"><div class="creator-skill-table-head"><span>Skill name</span><span>Trait · Roll · Rank</span></div>${names.map(name => { const skill = data.skills[name], ring = TRAIT_GROUPS.find(group=>group.traits.includes(skill.trait))?.ring || ''; return `<div class="creator-skill-row" data-ring="${ring}"><div><div class="creator-skill-label"><strong>${escapeHtml(name)}</strong><small>${skill.base ? `School rank ${skill.base} · Free` : 'Purchased skill'}${skill.emphases.length ? ` · Emphasis: ${escapeHtml(skill.emphases.join(', '))}` : ''}${skill.cost ? ` · ${skill.cost} XP spent` : ''}${skill.notes ? ` · ${escapeHtml(skill.notes)}` : ''}</small></div>${skill.masteries.map(m=>`<p class="creator-mastery">Rank ${m.rank}: ${escapeHtml(m.description)}</p>`).join('')}${renderEmphases(name,skill)}</div><div class="creator-skill-values">${renderSkillRoll(name,skill)}<div class="rank-control" role="group" aria-label="${escapeHtml(name)} rank"><button type="button" data-action="skill" data-skill="${escapeHtml(name)}" data-delta="-1" ${skill.rank <= skill.base ? 'disabled' : ''} aria-label="Decrease ${escapeHtml(name)}">−</button><output aria-label="${escapeHtml(name)} rank">${skill.rank}</output><button type="button" data-action="skill" data-skill="${escapeHtml(name)}" data-delta="1" ${skill.rank >= rankLimit() ? 'disabled' : ''} aria-label="Increase ${escapeHtml(name)} for ${skill.rank + 1} XP">+</button></div></div></div>`; }).join('')}</div>` : '<div class="creator-empty">Choose a school or add a skill to begin.</div>'}</section>`;
  }

  function renderOptions(data) {
    const optionList = (kind) => {
      const entries = kind === 'advantage' ? catalog.advantages : catalog.disadvantages;
      const owned = kind === 'advantage' ? data.advantages : data.disadvantages;
      const id = `${kind}-select`;
      return `<div class="creator-option-column"><h3>${kind === 'advantage' ? 'Advantages' : 'Disadvantages'}</h3><div class="creator-add-row"><input data-option-search="${kind}" type="search" placeholder="Search ${kind}s" aria-label="Search ${kind}s"><select id="${id}">${option('', `Choose ${kind}`, true)}${entries.map(entry => option(entry.name, `${entry.name}${entry.costs.length ? ` · ${entry.costs.join('/')} XP` : ' · variable'}`, false)).join('')}</select><button type="button" data-action="add-${kind}">Add</button></div>${owned.length ? `<div class="creator-option-list">${owned.map((entry,index) => `<div class="creator-option-row"><span>${escapeHtml(entry.name)}</span><div class="creator-option-cost"><span>XP cost</span><div class="rank-control" role="group" aria-label="${escapeHtml(entry.name)} XP cost"><button type="button" data-action="option-cost" data-kind="${kind}" data-index="${index}" data-delta="-1" aria-label="Decrease ${escapeHtml(entry.name)} cost" ${entry.cost<=0?'disabled':''}>−</button><output data-kind="${kind}" data-index="${index}" aria-label="${escapeHtml(entry.name)} point cost">${Number(entry.cost) || 0}</output><button type="button" data-action="option-cost" data-kind="${kind}" data-index="${index}" data-delta="1" aria-label="Increase ${escapeHtml(entry.name)} cost" ${entry.cost>=30?'disabled':''}>+</button></div></div><label>Specific choice<input type="text" data-option-detail="${kind}" data-index="${index}" value="${escapeHtml(entry.selection || '')}" placeholder="Rank, skill, ally, or other choice" aria-label="Specific choice for ${escapeHtml(entry.name)}"></label><button type="button" data-action="${sheet.phase==='advancement' && kind==='disadvantage' ? 'buyoff-disadvantage' : 'remove-'+kind}" data-index="${index}" aria-label="${sheet.phase==='advancement' && kind==='disadvantage' ? 'Buy off ' : 'Remove '}${escapeHtml(entry.name)}">${sheet.phase==='advancement' && kind==='disadvantage' ? 'Buy off' : '×'}</button>${catalog[kind==='advantage'?'advantages':'disadvantages'].find(a=>a.name===entry.name)?.description ? `<details class="creator-wide"><summary>Rules & restrictions</summary><p>${escapeHtml(catalog[kind==='advantage'?'advantages':'disadvantages'].find(a=>a.name===entry.name).description)}</p><a data-rule-reference href="${sourceLink(kind==='advantage'?'advantages':'disadvantages')}">Local rules ↗</a></details>` : ''}</div>`).join('')}</div>` : '<div class="creator-empty">None selected.</div>'}<a class="creator-source" data-rule-reference href="${sourceLink(kind === 'advantage' ? 'advantages' : 'disadvantages')}">Read full ${kind === 'advantage' ? 'advantage' : 'disadvantage'} rules ↗</a></div>`;
    };
    return `<section class="creator-panel" id="creator-options"><div class="creator-panel-head"><span class="creator-step">04</span><div><h2>Advantages & disadvantages</h2><p>Choose from the archive and adjust costs for variable or clan specific options.</p></div></div><p class="creator-rule">Disadvantages grant up to 10 bonus XP in total. The descriptions contain restrictions and clan specific costs, so check each entry before play.${data.disadvantageTotal > 10 ? ` You selected ${data.disadvantageTotal} points; only 10 count toward your budget.` : ''}</p><div class="creator-option-grid">${optionList('advantage')}${optionList('disadvantage')}</div>${renderAncestors(data)}</section>`;
  }

  function startingMoney(data) {
    return Object.entries(data.money).map(([currency, amount]) => `${amount} ${currency}`).join(' · ');
  }

  function schoolEquipmentOptions(prompt) {
    if(/any\s+2\s+weapons/i.test(prompt))return null;
    if(/armou?r/i.test(prompt))return catalog.armors.filter(item=>
      /light/i.test(prompt) && /Light/i.test(item.name) ||
      /heavy/i.test(prompt) && /Heavy/i.test(item.name) ||
      /ashigaru/i.test(prompt) && /Ashigaru/i.test(item.name) ||
      /riding|cavalry/i.test(prompt) && /Riding/i.test(item.name)
    ).map(item=>item.name);
    const anyWeapon=/any\s+(?:1|one)\s+(?:other\s+)?weapon/i.test(prompt);
    const types=[];
    if(/heavy/i.test(prompt))types.push('Heavy');
    if(/polearm/i.test(prompt))types.push('Polearm');
    if(/spear/i.test(prompt))types.push('Spear');
    if(/war fan/i.test(prompt))types.push('War Fan');
    if(/bow/i.test(prompt))types.push('Bow');
    if(/knife|knives/i.test(prompt))types.push('Knives');
    let names=catalog.weapons.filter(item=>item.type!=='Arrow' && (anyWeapon || types.includes(item.type) || prompt.toLowerCase().includes(item.name.toLowerCase()))).map(item=>item.name);
    if(/yumi and any 20 arrows/i.test(prompt))names=catalog.weapons.filter(item=>item.type==='Arrow').map(item=>`Yumi with 20 ${item.name} arrows`);
    else if(/6 Shuriken or Tsubute/i.test(prompt))names=['6 Shuriken','6 Tsubute'];
    if(/or 2 Knives/i.test(prompt))names.push('2 Knives');
    return [...new Set(names)].sort((a,b)=>a.localeCompare(b));
  }
  function renderEquipmentChoice(data,entry) {
    const prompt=data.school.equipment[entry.index].name;
    const selected=sheet.equipmentChoices[entry.index] || '';
    const choices=schoolEquipmentOptions(prompt);
    if(!choices?.length)return `<label>${escapeHtml(prompt)}<input data-equipment-choice="${entry.index}" type="text" value="${escapeHtml(selected)}" placeholder="Choose your equipment"></label>`;
    // Retain older custom choices while offering the catalog for new selections.
    if(selected && !choices.includes(selected))choices.push(selected);
    return `<label>${escapeHtml(prompt)}<select data-equipment-choice="${entry.index}">${option('', 'Choose an item', !selected)}${choices.map(name=>option(name,name,name===selected)).join('')}</select></label>`;
  }

  function renderEquipment(data) {
    const rows = data.equipment.map(entry => `<div class="creator-equipment-row"><div><strong>${escapeHtml(entry.name)}</strong>${entry.item ? `<label class="creator-check"><input type="checkbox" data-equipped="${escapeHtml(entry.key)}" ${entry.equipped ? 'checked' : ''}>Equipped · ${escapeHtml(entry.item.kind)}</label>` : ''}<small>${entry.source === 'school' ? 'School outfit · Free' : 'Personal equipment'}${entry.pending ? ' · Choose an item' : ''}</small></div>${entry.source === 'school' && entry.choice && sheet.phase==='creation' ? renderEquipmentChoice(data,entry) : ''}${entry.source === 'personal' ? `<button type="button" data-action="remove-equipment" data-index="${entry.index}" aria-label="Remove ${escapeHtml(entry.name)}">×</button>` : ''}</div>`).join('');
    return `<div class="creator-purchases creator-equipment" id="creator-equipment"><h3>Equipment</h3><p>Your school outfit is added automatically. Complete any equipment choices and add personal items below.</p>${startingMoney(data) ? `<p class="creator-starting-money"><strong>Starting money:</strong> ${escapeHtml(startingMoney(data))}</p>` : ''}<div class="creator-fields">${['koku','bu','zeni'].map(k=>`<label>${k}<input type="number" min="0" step="1" data-money="${k}" value="${Number(data.money[k]) || 0}"></label>`).join('')}<label>Arrow type<select data-arrow>${catalog.weapons.filter(w=>w.type==='Arrow').map(a=>option(a.id,a.name,sheet.equipped.arrow===a.id)).join('')}</select></label></div>${rows ? `<div class="creator-equipment-list">${rows}</div>` : '<div class="creator-empty">Choose a school to receive your starting outfit.</div>'}<div class="creator-add-row"><input id="new-equipment" list="equipment-suggestions" type="text" placeholder="Equipment name" aria-label="Equipment name"><datalist id="equipment-suggestions">${[...catalog.weapons,...catalog.armors].map(e=>`<option value="${escapeHtml(e.name)}"></option>`).join('')}</datalist><button type="button" data-action="add-equipment">Add equipment</button></div></div>`;
  }

  function renderTraining(data) {
    if (!data.school) return '';
    return `<div class="creator-purchases creator-training"><h3>School training</h3>${data.techniques.map(entry => `<div class="creator-training-entry"><strong>${escapeHtml(entry.name)}</strong><p>${escapeHtml(entry.description)}</p></div>`).join('')}${data.school.affinity ? `<div class="creator-training-entry"><strong>Affinity / Deficiency</strong><p>${escapeHtml(data.school.affinity)}</p></div>` : ''}${data.school.spells ? `<div class="creator-training-entry"><strong>Starting spells</strong><p>${escapeHtml(data.school.spells)}</p></div>` : ''}<a class="creator-source" data-rule-reference href="${sourceLink(data.school.slug, data.school.anchor)}">View school rules ↗</a></div>`;
  }

  const numericFields={woundsTaken:{label:'Wounds taken',step:1,min:0},honor:{label:'Honor',step:0.1,min:0,max:10},taint:{label:'Taint',step:0.1,min:0},status:{label:'Status',step:0.1,min:0,max:10},glory:{label:'Glory',step:0.1,min:0,max:10}};
  function renderNumber(key,value) {
    const {label,step,min,max=Infinity}=numericFields[key];
    return `<div class="creator-number-field"><span>${label}</span><div class="rank-control" role="group" aria-label="${label}"><button type="button" data-action="number-step" data-field="${key}" data-delta="-1" aria-label="Decrease ${label}" ${value<=min?'disabled':''}>−</button><output aria-label="${label}">${step<1?Number(value).toFixed(1):value}</output><button type="button" data-action="number-step" data-field="${key}" data-delta="1" aria-label="Increase ${label}" ${value>=max?'disabled':''}>+</button></div></div>`;
  }
  function renderStory(data) {
    return `<section class="creator-panel" id="creator-story"><div class="creator-panel-head"><span class="creator-step">05</span><div><h2>Story & equipment</h2><p>Record your role in the Empire and any remaining choices.</p></div></div><p class="creator-rule">For heritage and detailed background prompts, see <a data-rule-reference href="${sourceLink('heritage')}">Heritage</a> and <a data-rule-reference href="${sourceLink('chargen')}">Character Generation</a>.</p><div class="creator-fields"><label>Character concept<input data-field="concept" type="text" value="${escapeHtml(sheet.concept)}" placeholder="A loyal yojimbo, an ambitious courtier…"></label>${Object.keys(numericFields).map(key=>renderNumber(key,Number(data[key] ?? sheet[key]) || 0)).join('')}<label class="creator-wide">Notes & heritage<textarea data-field="notes" rows="7" placeholder="Add your heritage and story notes here.">
${escapeHtml(sheet.notes)}</textarea></label><label class="creator-wide">Recorded heritage outcome<textarea data-field="heritage" rows="3">${escapeHtml(sheet.heritage)}</textarea></label></div>${renderEquipment(data)}${renderModifiers(data)}<div class="creator-purchases"><h3>Other XP purchases</h3><p>Record custom purchases with a name and paid XP cost. Use Skills for emphases and Abilities for catalog powers.</p><div class="creator-add-row"><input id="purchase-name" type="text" placeholder="Purchase name"><input id="purchase-cost" type="number" min="0" max="100" step="1" placeholder="XP"><button type="button" data-action="add-purchase">Add</button></div>${sheet.purchases.length ? `<div class="creator-option-list">${sheet.purchases.map((entry,index) => `<div class="creator-option-row"><span>${escapeHtml(entry.name)}</span><strong>${Number(entry.cost) || 0} XP</strong><button type="button" data-action="remove-purchase" data-index="${index}" aria-label="Remove ${escapeHtml(entry.name)}">×</button></div>`).join('')}</div>` : ''}</div></section>`;
  }

  function renderSummary(data) {
    const ringList = TRAIT_GROUPS.map(group => `<div><span>${group.mark} ${group.ring}</span><strong>${data.rings[group.ring]}</strong></div>`).join('');
    const track = (label, value) => `<div class="creator-reputation-row"><div><span>${label}</span><strong>${value}</strong></div><div class="creator-track" aria-hidden="true">${Array.from({length:10},(_,index) => `<i class="${index < Math.floor(Number(value) || 0) ? 'filled' : ''}"></i>`).join('')}</div></div>`;
    return `<aside class="creator-summary" id="creator-summary"><div class="creator-summary-inner"><div class="creator-summary-seal" aria-hidden="true">◈</div><small class="creator-summary-kicker">CHARACTER RECORD</small><h2 id="summary-name">${escapeHtml(sheet.name || 'Unnamed samurai')}</h2><p>${escapeHtml([sheet.clan, sheet.family, data.school?.name].filter(Boolean).join(' · ') || 'Choose a clan to begin')}</p><div class="creator-xp ${data.xpRemaining < 0 ? 'over-budget' : ''}"><span>EXPERIENCE POINTS REMAINING</span><strong>${data.xpRemaining}</strong><small>${data.startingXP} starting + ${data.xpEarned} disadvantage + ${data.xpAwards} awarded − ${data.xpSpent} paid</small></div><div class="creator-ledger-heading">Honor & standing</div><div class="creator-reputation">${track('Honor', data.honor)}${track('Glory', data.glory)}${track('Status', sheet.status)}</div><div class="creator-ledger-heading">The five rings</div><div class="creator-summary-rings">${ringList}</div><div class="creator-ledger-heading">Insight</div><div class="creator-derived"><div><span>Rings × 10 + Skills</span><strong>${data.insight}</strong></div><div><span>Insight Rank</span><strong>${data.insightRank}</strong></div></div><div class="creator-ledger-heading">Combat values</div><div class="creator-derived creator-combat"><div><span>Initiative roll</span><strong>${data.combat.initiative.notation}</strong></div><div><span>Armor TN (equipped)</span><strong>${data.combat.armorTN}</strong></div><div><span>Healing / day</span><strong>${data.combat.healing}</strong></div><div><span>Unarmed damage</span><strong>${data.combat.unarmedDamage.notation}</strong></div><div><span>Void Points</span><strong>${data.combat.voidPoints}</strong></div><div><span>Reduction</span><strong>${data.combat.reduction}</strong></div><div><span>Wounds taken · ${escapeHtml(data.combat.wounds.currentLevel)}</span><strong>${sheet.woundsTaken}</strong></div><div><span>Wound capacity</span><strong>${data.combat.wounds.maximum}</strong></div></div><div class="creator-ledger-heading">Wounds · cumulative totals</div><div class="creator-wounds">${data.combat.wounds.levels.map(level => `<div><span>${level.label}</span><strong>${level.total}</strong></div>`).join('')}<small>Healthy: Earth × 5 · each further level adds Earth × 2</small></div><div class="creator-summary-links"><a data-rule-reference href="${sourceLink('chargen')}">Creation rules ↗</a><a data-rule-reference href="${sourceLink('families')}">Families ↗</a></div></div></aside>`;
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
      return `<div class="print-skill-row"><span class="print-skill-school">${skill?.base ? '○' : ''}</span><span>${value(name)}</span><b>${skill?.rank ?? ''}</b><span title="${value(skill?.trait)}">${value(skill?.trait?.slice(0,3))}</span><span>${value(skill?.roll?.notation)}</span><span>${value([...(skill?.emphases || []),...(skill?.masteries || []).map(m=>m.description)].join('; '))}</span></div>`;
    }).join('');
    const table = (title, rows) => `${bar(title)}<div class="print-stat-table">${rows.map(([label,item]) => `<div><span>${label}</span><strong>${value(item)}</strong></div>`).join('')}</div>`;
    const woundLevels = data.combat.wounds.levels;
    const weapon = title => `<div class="print-weapon">${bar(title)}${['Type','Attack Roll','Damage Roll','Bonus','Notes'].map(label => line(label,'')).join('')}</div>`;
    const list = entries => entries.length ? entries.map(entry => `<div class="print-extra-row"><span>${escapeHtml(entry.name)}</span><b>${Number(entry.cost) || 0} XP</b></div>`).join('') : '<div class="print-extra-row"></div>';
    const hasExtra = skills.length > 22 || sheet.advantages.length || sheet.disadvantages.length || sheet.purchases.length || sheet.notes || sheet.concept || data.equipment.length || data.techniques.length || data.school?.spells || data.abilities.length || sheet.ancestors.length || Object.keys(data.money).length;
    return `<div class="creator-print-sheet" aria-label="Printable character sheet">
      <div class="print-first-page">
        <header class="print-sheet-head"><div class="print-head-identity">${line('Name',sheet.name)}${line('Clan',sheet.clan)}${line('Family',sheet.family)}${line('School',data.school?.name)}</div><div class="print-head-ranks">${line('Rank',data.insightRank)}${line('Experience Points',data.xpRemaining)}${line('Insight',data.insight)}</div><div class="print-sheet-title"><span class="print-five">◯ ◯<br>◯ ◯<br> ◯</span><strong>Legend of the<br>Five Rings</strong></div></header>
        <div class="print-sheet-body"><div class="print-left">
          <div class="print-ring-map">${element('Earth','Stamina','Willpower','trait-left')}${element('Air','Reflexes','Awareness','trait-right')}${element('Water','Strength','Perception','trait-left')}${element('Fire','Agility','Intelligence','trait-right')}<div class="print-void"><div>Void</div><b>${data.rings.Void}</b><span>Void Points Spent</span><div class="print-void-circles">${circles(0)}</div></div></div>
          <div class="print-skills"><div class="print-skill-head"><span></span><span>Skill Name</span><span>Rank</span><span>Trait</span><span>Roll</span><span>Emphases & Mastery Abilities</span></div>${skillRows}</div>
        </div><div class="print-right"><div class="print-standing">${standing('Honor',data.honor)}${standing('Glory',data.glory)}${standing('Status',sheet.status)}${standing('Shadowlands Taint',data.taint)}</div>
          ${table('Initiative',[['Insight Rank / Reflexes',`${data.insightRank} / ${data.traits.Reflexes.rank}`],['Modifiers',''],['Initiative Roll',data.combat.initiative.notation]])}
          ${table('Armor TN',[['Type / Bonus',''],['Reduction',''],['Base TN (before bonuses)',data.combat.baseArmorTN]])}
          ${table('Armor',[['TN Bonus',data.combat.armorTN-data.combat.baseArmorTN],['Reduction',data.combat.reduction],['Notes',data.combat.armor]])}
          ${bar('Wounds')}<div class="print-wound-note">Cumulative totals · Healthy Earth × 5 · further levels Earth × 2</div><div class="print-wound-head"><span>Wound Level</span><span>Total</span><span>Current</span></div><div class="print-wound-table">${woundLevels.map(level => `<div><span>${level.label}</span><b>${level.total}</b><span></span></div>`).join('')}</div>
          ${table('Rate of Wound Heal',[['Stamina × 2 + Insight Rank',data.combat.healing],['Modifiers',''],['Wounds Healed / Day',data.combat.healing]])}
        </div></div>
        <div class="print-weapons">${data.combat.weapons.length ? data.combat.weapons.map(w => `<div class="print-weapon">${bar(value(w.name))}${line('Attack',w.attack.notation)}${line('Damage',w.damage?.notation)}${line('Notes',w.special)}</div>`).join('') : weapon('Weapon 1')+weapon('Weapon 2')}<div class="print-weapon">${bar('Arrows')}<div class="print-arrow-head"><span>Type</span><span>Damage</span><span>Quantity</span></div>${Array.from({length:5},() => '<div class="print-arrow-row"><span></span><span></span><span></span></div>').join('')}</div></div>
      </div>
      ${hasExtra ? `<div class="print-second-page"><header class="print-second-head"><span>${value(sheet.name) || 'Character'}</span><strong>Personal Record</strong></header><div class="print-extra-columns"><div>${skills.length > 22 ? `<section>${bar('Additional Skills')}${skills.slice(22).map(([name,skill]) => `<div class="print-extra-row"><span>${escapeHtml(name)}</span><b>${skill.rank} · ${value(skill.trait)} · ${value(skill.roll?.notation)}</b></div>`).join('')}</section>` : ''}<section>${bar('Advantages')}${list(data.advantages)}${sheet.ancestors.length ? bar('Ancestors')+list(sheet.ancestors) : ''}</section><section>${bar('Disadvantages')}${list(sheet.disadvantages)}</section></div><div><section>${bar('Character Concept')}<p>${value(sheet.concept)}</p></section><section>${bar('Notes & Heritage')}<p class="print-extra-notes">${value(sheet.notes)}</p></section><section>${bar('Equipment')}<ul>${data.equipment.map(entry => `<li>${value(entry.name)}${entry.pending ? ' (choose)' : ''}</li>`).join('')}</ul><p>${value(startingMoney(data))}</p></section><section>${bar('School Training')}${data.techniques.map(entry => `<p><strong>${value(entry.name)}</strong><br>${value(entry.description)}</p>`).join('')}${data.school?.affinity ? `<p><strong>Affinity / Deficiency:</strong> ${value(data.school.affinity)}</p>` : ''}${data.school?.spells ? `<p><strong>Starting spells:</strong> ${value(data.school.spells)}</p>` : ''}</section>${data.abilities.length ? `<section>${bar('Abilities')}${data.abilities.map(a=>`<p><strong>${value(a.name)}</strong> · ${value(a.kind)}${a.memorized ? ' · Memorized' : ''}<br>${value(a.description)}</p>`).join('')}</section>` : ''}${sheet.purchases.length ? `<section>${bar('Other Purchases')}${list(sheet.purchases)}</section>` : ''}</div></div></div>` : ''}
    </div>`;
  }

  function renderNavigation(d) {
    const sections=[['identity','Identity'],['traits','Traits'],['skills','Skills'],['options','Advantages'],['abilities','Abilities'],['story','Equipment']];
    if(sheet.phase==='advancement')sections.push(['progression','Progression']);
    return `<nav class="creator-nav" aria-label="Character sections">${sections.map(([key,label])=>`<button type="button" data-action="section" data-section="${key}">${label}</button>`).join('')}</nav><div class="creator-overview" aria-label="Character totals"><strong>${sheet.phase==='creation'?'Creation':'Advancement'}</strong><label class="creator-starting-xp">Starting XP<input type="number" min="0" step="1" data-field="startingXP" value="${d.startingXP}"></label><span>XP <b>${d.xpRemaining}</b></span><span>Insight <b>${d.insight}</b> · Rank <b>${d.insightRank}</b></span><span>School Rank <b>${d.schoolRank}</b></span>${sheet.phase==='creation'?'<button type="button" class="creator-primary" data-action="begin-play">Begin play</button>':''}</div>${sheet.phase==='creation' && uiError?`<p class="creator-feedback" role="alert">${escapeHtml(uiError)}</p>`:''}`;
  }
  function violationSection(code) {
    if (/^(rank:trait:)/.test(code)) return 'traits';
    if (/^(rank:skill:|emphases:|school-choice:|chosen-art$|weapon-focus$)/.test(code)) return 'skills';
    if (/^(ability:|kiho-|tattoo-|spell-|affinity$|second-deficiency$)/.test(code)) return 'abilities';
    if (/^(equipment|armor$|modifiers$)/.test(code)) return 'story';
    if (/^(disadvantages$|size$|multiple-schools$|cost:|advancement:|option-choice:|ancestor:|shinmaki-grant$)/.test(code)) return 'options';
    if (code === 'xp') return 'summary';
    if (/^training/.test(code) && sheet.phase === 'advancement') return 'progression';
    return 'identity';
  }
  function renderSection(content,key,d) {
    const issues=d.blockers.filter(v=>violationSection(v.code)===key);
    const messages=issues.length?`<ul class="creator-validation" aria-label="${escapeHtml(sectionNames[key] || 'Progression')} choices">${issues.map(v=>`<li>${escapeHtml(v.message)}</li>`).join('')}</ul>`:'';
    // Keep feedback visible in the section that contains the corresponding control.
    return content.replace(key==='summary'?'</aside>':'</section>',messages+(key==='summary'?'</aside>':'</section>'));
  }
  function renderCreationOptions(d) {
    return `<details class="creator-later-training"><summary>Later training</summary>${renderLaterTraining(d)}</details>`;
  }
  function renderProgression(d) {
    return `<section class="creator-panel" id="creator-progression"><div class="creator-panel-head"><div><h2>Advancement & XP</h2><p>Purchases record their paid costs. Removing a purchase records a refund of that amount.</p></div></div>${uiError?`<p class="creator-error" role="alert">${escapeHtml(uiError)}</p>`:''}<div class="creator-add-row"><input id="xp-award" type="number" step="1" placeholder="XP awarded" aria-label="XP awarded"><input id="xp-reason" placeholder="Session or correction explanation" aria-label="XP explanation"><button type="button" data-action="award-xp">Record XP</button></div><details><summary>Private XP history (${sheet.progression.history.length} entries)</summary><p>Creation baseline: ${sheet.progression.baseline?.spent || 0} paid, ${sheet.progression.baseline?.earned || 0} disadvantage XP. Historical transactions before Begin play are not invented.</p><ul>${sheet.progression.history.map(e=>`<li>${escapeHtml(e.kind)} · ${escapeHtml(e.label)} · ${Number(e.amount)} XP${e.explanation?` · ${escapeHtml(e.explanation)}`:''}</li>`).join('')}</ul></details>${renderLaterTraining(d)}</section>`;
  }
  function renderLaterTraining(d) {
    const sources=sheet.phase==='creation'?catalog.training.filter(s=>s.kind==='path'):[...C.schools(catalog).filter(s=>!s.nonhuman),...catalog.training];
    return `<div class="creator-purchases"><h3>Later training</h3><p>School Ranks are recorded separately from Insight. A new basic school starts at your next Insight Rank and grants techniques after learning its School Skills. Paths replace their printed technique rank. Advanced schools require their printed entry requirements.</p><p class="creator-rule">Nonhuman and foreign character systems remain available in Books and custom records.</p>${sheet.training.map((t,i)=>{const school=C.school(t.school || t.id,catalog);return `<div class="creator-option-row"><span>${escapeHtml(school?.name || t.school)} · School Rank ${t.rank}${school?.kind?` · ${escapeHtml(school.kind)}`:''}</span>${school?.kind!=='path'?`<div class="rank-control" role="group" aria-label="${escapeHtml(school?.name || t.school)} school rank"><button type="button" data-action="train-rank" data-index="${i}" data-delta="-1" ${t.rank<=1?'disabled':''} aria-label="Decrease ${escapeHtml(school?.name)} school rank">−</button><output aria-label="School rank">${t.rank}</output><button type="button" data-action="train-rank" data-index="${i}" data-delta="1" ${t.rank>=10?'disabled':''} aria-label="Advance ${escapeHtml(school?.name)} school rank">+</button></div>`:''}${sheet.phase==='creation' || i?`<button type="button" data-action="remove-training" data-index="${i}" aria-label="Remove training">×</button>`:''}${school?`<a data-rule-reference href="${sourceLink(school.slug,school.anchor)}">Rules ↗</a>`:''}</div>`;}).join('')}<div class="creator-add-row"><input id="training-school" list="training-suggestions" placeholder="Search a school, path, or advanced school" aria-label="Later school"><datalist id="training-suggestions">${sources.map(s=>`<option value="${escapeHtml(s.name+' · '+(s.kind || 'basic'))}"></option>`).join('')}</datalist><button type="button" data-action="add-training">Add training</button></div></div>`;
  }
  function renderSchoolDecisions(d,section) {
    const school=d.school;
    if(!school)return '';
    const select=(key,label,values)=>`<label>${label}<select data-school-decision="${key}">${option('','Choose',!sheet.schoolDecisions[key])}${values.map(v=>option(v,v,sheet.schoolDecisions[key]===v)).join('')}</select></label>`;
    const elements=['Air','Earth','Fire','Water'], allElements=[...elements,'Void'];
    let fields='';
    if(section==='identity' && /Fudoist/.test(school.name))fields=select('fudoistFocus','Fudoist specialty',['Social','Attack'])+'<p>Set your chosen high or low starting Honor in Story & equipment.</p>';
    if(section==='skills') {
      const arts=Object.entries(d.skills).filter(([name,s])=>s.base && /^(Acting|Artisan:|Perform:)/.test(name)).map(([name])=>name);
      if(/Kakita Artisan/.test(school.name))fields+=select('chosenArt','Chosen art',arts);
      if(/Utaku Infantry/.test(school.name))fields+=select('weaponFocus','Chosen Weapon Skill',['Kenjutsu','Polearms','Spears'])+`<label>Free weapon emphasis<input data-school-decision="weaponEmphasis" value="${escapeHtml(sheet.schoolDecisions.weaponEmphasis || '')}"></label>`;
    }
    if(section==='abilities') {
      if(school.discipline==='Shugenja') {
        const affinity=school.affinity || '', spells=school.spells || '';
        if(/choose|select|varies|any one non-Void/i.test(affinity)) {
          fields+=select('affinity','Elemental affinity',/including Void/i.test(affinity)?allElements:elements);
          if(!/opposing Element|do not have a Deficiency/i.test(affinity))fields+=select('deficiency','Elemental deficiency',elements);
        }
        if(/any one other Element/i.test(affinity))fields+=select('secondDeficiency','Additional elemental deficiency',elements);
        if(/3 spells of any one element/i.test(spells))for(const [i,count] of [3,2,1,1].entries())fields+=select('spellElement'+(i+1),`Starting spell element ${i+1} · ${count} spell${count===1?'':'s'}`,allElements);
        else {
          if(/2 spells of a non-Deficient/i.test(spells))fields+=select('spellElement1','Non-deficient element · 2 spells',elements);
          if(/second non-Deficient/i.test(spells))fields+=select('spellElement2','Second non-deficient element · 1 spell',elements);
        }
      }
      if(/Seven Thunders/.test(school.name))fields+=select('kihoElement','Starting Kiho element',allElements);
    }
    const choices=fields?`<div class="creator-purchases creator-school-choices"><h3>School choices</h3><div class="creator-fields">${fields}</div></div>`:'';
    const optional=section==='abilities'?`<details class="creator-purchases"><summary>Optional ability training</summary><div class="creator-fields">${[['nonBrotherhoodKiho','Table permits optional non-Brotherhood Kiho'],['maho','Table permits forbidden maho training'],['shadowlands','Table permits recorded Shadowlands powers']].map(([key,label])=>`<label class="creator-check"><input type="checkbox" data-school-decision="${key}" ${sheet.schoolDecisions[key]?'checked':''}>${label}</label>`).join('')}</div></details>`:'';
    return choices+optional;
  }
  function renderEmphases(name,skill) {
    const choices=catalog.skills.find(s=>s.name===name.split(':')[0])?.emphases || [];
    const id='emphasis-'+encodeURIComponent(name).replace(/%/g,'_');
    return `<details class="creator-emphases"><summary>Emphases · ${skill.emphases.length}/${Math.min(5,Math.ceil(skill.rank/2))}</summary><p>Each purchased emphasis costs 2 XP. Reroll initial 1s on matching skill rolls.</p>${(sheet.emphases[name] || []).map((e,i)=>`<div>${escapeHtml(e)} <button type="button" data-action="remove-emphasis" data-skill="${escapeHtml(name)}" data-index="${i}" aria-label="Remove emphasis">×</button></div>`).join('')}<div class="creator-add-row"><input data-emphasis-name="${escapeHtml(name)}" list="${id}" placeholder="Choose or enter an emphasis" aria-label="New emphasis for ${escapeHtml(name)}"><datalist id="${id}">${choices.map(e=>`<option value="${escapeHtml(e)}"></option>`).join('')}</datalist><button type="button" data-action="add-emphasis" data-skill="${escapeHtml(name)}">Buy emphasis · 2 XP</button></div></details>`;
  }
  function renderAncestors(d) {
    return `<div class="creator-purchases"><h3>Ancestors</h3><p>Ancestors are Spiritual Advantages with clan restrictions and demands. Their guidance is recorded here.</p><div class="creator-add-row"><input id="ancestor-choice" list="ancestor-suggestions" placeholder="Search an ancestor" aria-label="Ancestor"><datalist id="ancestor-suggestions">${catalog.ancestors.map(a=>`<option value="${escapeHtml(a.name)}">${a.cost} XP · ${escapeHtml(a.clan)}</option>`).join('')}</datalist><button type="button" data-action="add-ancestor">Add ancestor</button></div>${sheet.ancestors.map((a,i)=>{const rule=catalog.ancestors.find(e=>e.id===a.catalogId);return `<details><summary>${escapeHtml(a.name)} · ${a.cost} XP</summary><p>${escapeHtml(rule?.description || a.description || '')}</p>${rule?`<a data-rule-reference href="${sourceLink(rule.slug,rule.anchor)}">Rules ↗</a>`:''}<button type="button" data-action="remove-ancestor" data-index="${i}">Remove ancestor</button></details>`;}).join('')}</div>`;
  }
  function renderAbilities(d) {
    return `<section class="creator-panel" id="creator-abilities"><div class="creator-panel-head"><span class="creator-step">05</span><div><h2>Abilities</h2><p>Search spells, kata, kiho, tattoos, and Shadowlands powers. School grants are free; memorizing a spell costs its Mastery Level.</p></div></div><p class="creator-rule">Choose ${d.freeLimits.kiho} free Kiho and ${d.freeLimits.tattoos} tattoos${d.school?.spells?` · Starting spells: ${escapeHtml(d.school.spells)}`:''}. Kata, Kiho, tattoos and spells with activation or situational effects show their rules below. Use explicit modifiers when applying them.</p>${renderSchoolDecisions(d,'abilities')}<div class="creator-add-row"><input id="ability-choice" list="ability-suggestions" placeholder="Search ability name" aria-label="Ability"><datalist id="ability-suggestions">${catalog.abilities.map(a=>`<option value="${escapeHtml(abilityLabel(a))}"></option>`).join('')}</datalist><select id="ability-payment" aria-label="Ability acquisition"><option value="purchase">Purchase / learn</option><option value="grant">Free school choice</option></select><button type="button" data-action="add-ability">Add ability</button></div><div class="creator-ability-list">${d.abilities.map(a=>`<details><summary>${escapeHtml(a.name)} · ${escapeHtml(a.kind)}${a.ring?` · ${escapeHtml(a.ring)} ${a.mastery || ''}`:''} · ${a.cost} XP${a.grant?' · School grant':''}${a.memorized?' · Memorized':''}</summary>${Object.keys(a.fields || {}).length?`<dl>${Object.entries(a.fields).map(([key,value])=>`<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>`:''}<p>${escapeHtml(a.description || '')}</p>${a.spellRoll?`<p>Spell Casting Roll: ${escapeHtml(a.spellRoll.notation)} · TN ${a.mastery*5+5}</p>`:''}${a.reasons?.length?`<p class="creator-error">${a.reasons.map(escapeHtml).join(' ')}</p>`:''}<div class="creator-header-actions"><a data-rule-reference href="${sourceLink(a.slug || 'magic',a.anchor || '')}">Local rules ↗</a>${a.kind==='spell'?`<button type="button" data-action="memorize" data-id="${escapeHtml(a.selectionId)}">${a.memorized?'Remove memorization':'Memorize · '+a.mastery+' XP'}</button>`:''}${sheet.abilities.some(e=>e.id===a.selectionId)?`<button type="button" data-action="remove-ability" data-id="${escapeHtml(a.selectionId)}">Remove ability</button>`:''}</div></details>`).join('') || '<p class="creator-empty">No abilities selected.</p>'}</div><details class="creator-purchases"><summary>Custom ability</summary><div class="creator-fields"><label>Name<input id="custom-ability-name"></label><label>XP cost<input id="custom-ability-cost" type="number" min="0" step="1" value="0"></label><label class="creator-wide">Description<textarea id="custom-ability-description" rows="3"></textarea></label></div><button type="button" data-action="add-custom-ability">Add custom ability</button></details></section>`;
  }
  function renderModifiers(d) {
    const controls=[['armorTN','Armor TN'],['reduction','Reduction'],['initiativeRoll','Initiative rolled dice'],['initiativeKeep','Initiative kept dice'],['initiativeFlat','Initiative flat bonus'],['unarmedRoll','Unarmed rolled dice'],['unarmedKeep','Unarmed kept dice'],['healing','Healing per day'],['wounds','Wounds per level'],['insight','Insight bonus']];
    return `<details class="creator-purchases"><summary>Mechanical modifiers</summary><p>Permanent effects supported by the rules are calculated automatically. Record a source and explanation for additional modifiers or active situational effects.</p><div class="creator-fields">${controls.map(([key,label])=>`<label>${label}<input type="number" step="1" data-modifier="${key}" value="${Number(sheet.modifiers[key]) || 0}"></label>`).join('')}<label class="creator-wide">Modifier source / table approval<input data-modifier-reason value="${escapeHtml(sheet.modifierReason)}"></label></div></details>`;
  }
  function handleExtendedAction(action,button) {
    if(action==='section'){root.querySelector('#creator-'+button.dataset.section)?.scrollIntoView({behavior:'smooth',block:'start'});return true;}
    const actions=['reset-section','begin-play','buyoff-disadvantage','award-xp','add-emphasis','remove-emphasis','add-ability','remove-ability','memorize','add-custom-ability','add-ancestor','remove-ancestor','add-training','remove-training','train-rank'];
    if(!actions.includes(action))return false;
    const before=R.normalize(JSON.parse(JSON.stringify(sheet)));
    if(action==='reset-section') {
      const key=button.dataset.section;
      if(sheet.phase!=='creation' || !sectionNames[key] || !window.confirm(`Reset ${sectionNames[key]}? This resets ${resetDescriptions[key]}. Fixed school grants are recalculated. The character ID and privacy settings are kept.`))return true;
      sheet=R.resetSection(sheet,key,catalog);
    } else if(action==='begin-play') {
      const result=R.beginPlay(sheet,catalog);
      if(result.violations.length)uiError='Complete the choices highlighted in each section before beginning play.';
      else sheet=result.sheet;
    } else if(action==='buyoff-disadvantage') {
      const reason=window.prompt('Explain the table’s approval to buy off this disadvantage (Core p. 299):');
      if(!reason?.trim())return true;
      sheet=R.buyOff(sheet,Number(button.dataset.index),catalog,reason.trim());
    } else if(action==='award-xp') {
      try {sheet=R.award(sheet,read('#xp-award'),read('#xp-reason'));}catch(e){uiError=e.message;}
    } else if(action==='add-emphasis') {
      const name=button.dataset.skill,value=read(`input[data-emphasis-name=${JSON.stringify(name)}]`);
      if(!value)uiError='Choose an emphasis.';
      else if(!build().skills[name].emphases.includes(value))(sheet.emphases[name] ||= []).push(value);
    } else if(action==='remove-emphasis')sheet.emphases[button.dataset.skill]?.splice(Number(button.dataset.index),1);
    else if(action==='add-ability') {
      const value=read('#ability-choice'),a=catalog.abilities.find(a=>abilityLabel(a)===value || a.id===value || a.name===value);
      if(!a)uiError='Choose an ability from the catalog, or add a custom ability below.';
      else if(!sheet.abilities.some(e=>e.catalogId===a.id))sheet.abilities.push({id:newId(),catalogId:a.id,kind:a.kind,name:a.name,grant:read('#ability-payment')==='grant',memorized:false});
    } else if(action==='remove-ability')sheet.abilities=sheet.abilities.filter(e=>e.id!==button.dataset.id);
    else if(action==='memorize') {const a=sheet.abilities.find(e=>e.id===button.dataset.id);if(a)a.memorized=!a.memorized;else{const granted=build().abilities.find(e=>e.selectionId===button.dataset.id);if(granted?.kind==='spell')sheet.abilities.push({id:newId(),catalogId:granted.id,kind:'spell',name:granted.name,grant:true,memorized:true});}}
    else if(action==='add-custom-ability') {
      const name=read('#custom-ability-name');
      if(name)sheet.abilities.push({id:newId(),kind:'custom',name,cost:Math.max(0,Number(read('#custom-ability-cost')) || 0),description:read('#custom-ability-description')});else uiError='Enter a custom ability name.';
    } else if(action==='add-ancestor') {
      const a=catalog.ancestors.find(a=>a.name===read('#ancestor-choice'));
      if(a && !sheet.ancestors.some(e=>e.catalogId===a.id))sheet.ancestors.push({id:newId(),catalogId:a.id,name:a.name,cost:a.cost});else uiError='Choose an ancestor not already selected.';
    } else if(action==='remove-ancestor')sheet.ancestors.splice(Number(button.dataset.index),1);
    else if(action==='add-training') {
      const value=read('#training-school'),choice=[...C.schools(catalog).filter(s=>!s.nonhuman),...catalog.training].find(s=>s.name+' · '+(s.kind || 'basic')===value);
      if(choice && !sheet.training.some(t=>t.school===`${choice.slug}#${choice.anchor}`))sheet.training.push({school:`${choice.slug}#${choice.anchor}`,rank:1,enteredAtInsight:build().insightRank});else uiError='Choose training not already recorded.';
    } else if(action==='remove-training')sheet.training.splice(Number(button.dataset.index),1);
    else if(action==='train-rank') {const t=sheet.training[Number(button.dataset.index)];if(t)t.rank=Math.max(1,Math.min(10,t.rank+Number(button.dataset.delta || 1)));}
    if(!uiError)commitEdit(before);else render();
    return true;
  }
  function handleExtendedChange(event,before) {
    const t=event.target,k=t.dataset;
    if(k.imperialApproval!==undefined){sheet.exceptions=sheet.exceptions.filter(e=>e.code!=='imperial');if(t.value.trim())sheet.exceptions.push({id:newId(),code:'imperial',label:'Imperial family approval',explanation:t.value.trim()});}
    else if(k.equipped!==undefined)sheet.equipped[k.equipped]=t.checked;
    else if(k.arrow!==undefined)sheet.equipped.arrow=t.value;
    else if(k.money!==undefined){sheet.money ||= {...build().money};sheet.money[k.money]=Math.max(0,Number(t.value)||0);}
    else if(k.modifier!==undefined)sheet.modifiers[k.modifier]=Number(t.value)||0;
    else if(k.modifierReason!==undefined)sheet.modifierReason=t.value;
    else if(k.schoolDecision!==undefined){sheet.schoolDecisions[k.schoolDecision]=t.type==='checkbox'?t.checked:t.value;
      if(k.schoolDecision==='affinity' && /opposing Element/i.test(build().school?.affinity || ''))sheet.schoolDecisions.deficiency={Air:'Earth',Earth:'Air',Fire:'Water',Water:'Fire'}[t.value] || '';
    }
    else return false;
    commitEdit(before,k.modifier!==undefined?sheet.modifierReason:'');return true;
  }

  function render() {
    if (!root?.isConnected || !catalog || (!external && !location.hash.startsWith('#/create-character'))) return;
    const openDetails = root.querySelectorAll ? Array.from(root.querySelectorAll('details[open]')).map(d=>d.querySelector('summary')?.textContent?.split(' ·')[0]) : [];
    const data = build();
    root.innerHTML = `<div class="creator-page"><div class="creator-header"><div class="eyebrow muted"><span class="eyebrow-line"></span> l5r-rules</div><div class="creator-header-row"><div><h1>Character</h1><p>Changes save automatically.</p></div><div class="creator-header-actions"><a href="${external?.returnHref || window.CampaignUI?.creatorReturn() || '#/characters'}">← ${external || window.CampaignUI?.creatorReturn() ? 'Campaign' : 'Characters'}</a><button type="button" data-action="save-close">Save PC</button><button type="button" data-action="export">Export JSON ↗</button><button type="button" data-action="print">Print sheet ↗</button></div></div></div>${renderNavigation(data)}<div class="creator-layout"><div class="creator-main">${sheet.phase==='advancement'?renderSection(renderProgression(data),'progression',data):''}${renderSection(renderIdentity(data),'identity',data)}${renderSection(renderTraits(data),'traits',data)}${renderSection(renderSkills(data),'skills',data)}${renderSection(renderOptions(data),'options',data)}${renderSection(renderAbilities(data),'abilities',data)}${renderSection(renderStory(data),'story',data)}<div class="creator-bottom"><span data-save-status>${escapeHtml((external ? window.CampaignStorage?.status : window.CharacterStorage?.status) || 'Saved on this device')}</span><button type="button" data-action="reset">Start over</button></div></div>${renderSection(renderSummary(data),'summary',data)}</div>${renderPrintSheet(data)}</div>`;
    if (root.querySelectorAll) for (const details of root.querySelectorAll('details')) if(openDetails.includes(details.querySelector('summary')?.textContent?.split(' ·')[0])) details.open=true;
    const visibility = window.SheetSharing?.visibility(sheet) || sheet.visibility;
    if (visibility && root.querySelectorAll) {
      const ids = {identity:'creator-identity',traits:'creator-traits',skills:'creator-skills',options:'creator-options',story:'creator-story',summary:'creator-summary',abilities:'creator-abilities'};
      for (const [key,id] of Object.entries(ids)) {
        const panel = root.querySelector('#'+id);
        if (!panel) continue;
        const heading = panel.querySelector('.creator-panel-head');
        const title = heading?.querySelector('h2') || panel.querySelector('#summary-name');
        if (sheet.phase==='creation' && title) {
          const row = document.createElement('div');
          row.className = 'creator-section-title';
          title.replaceWith(row);
          row.append(title);
          row.insertAdjacentHTML('beforeend',`<button type="button" class="creator-reset-section" data-action="reset-section" data-section="${key}" aria-label="Reset ${sectionNames[key]}">Reset</button>`);
        }
        const privacy = `<div class="creator-section-tools"><label class="section-public"><input type="checkbox" data-public="${key}" ${visibility[key] ? 'checked' : ''} ${external ? 'disabled' : ''}> Public</label></div>`;
        if (heading) heading.insertAdjacentHTML('beforeend',privacy);
        else panel.querySelector('.creator-summary-inner')?.insertAdjacentHTML('afterbegin',privacy);
      }
    }
  }

  function onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const before = R.normalize(JSON.parse(JSON.stringify(sheet)));
    uiError = '';
    if (handleExtendedAction(action,button)) return;
    if (action === 'save-close') {
      const editing=external, returnHref=window.CampaignUI?.creatorReturn() || '#/characters';
      try {
        if(!save())return;
        if(editing) {window.CampaignStorage?.flush();editing.close();}
        else {window.CharacterStorage?.flush();location.hash=returnHref;}
      } catch { window.alert?.('Your browser could not save this change. Export your character to keep a backup.'); }
      return;
    }
    if (action === 'option-cost') {
      const kind=button.dataset.kind;
      if(!['advantage','disadvantage'].includes(kind))return;
      const entry=build()[kind==='advantage'?'advantages':'disadvantages'][Number(button.dataset.index)];
      if(!entry)return;
      const value=Math.max(0,Math.min(30,(Number(entry.cost)||0)+Number(button.dataset.delta)));
      onChange({target:{dataset:{kind,index:button.dataset.index},value:String(value)}});
      return;
    } else if (action === 'number-step') {
      const key=button.dataset.field, config=numericFields[key];
      if(!config)return;
      const value=Number(build()[key] ?? sheet[key]) || 0;
      sheet[key]=Math.max(config.min,Math.min(config.max ?? Infinity,Math.round((value+Number(button.dataset.delta)*config.step)*10)/10));
    } else if (action === 'trait') {
      const trait = button.dataset.trait, current = build().traits[trait];
      if (Number(button.dataset.delta) > 0 && current.rank < rankLimit()) sheet.traitBuys[trait] = (Number(sheet.traitBuys[trait]) || 0) + 1;
      if (Number(button.dataset.delta) < 0 && current.rank > current.base) sheet.traitBuys[trait] = Math.max(0,(Number(sheet.traitBuys[trait]) || 0) - 1);
    } else if (action === 'skill') {
      const name = button.dataset.skill, current = build().skills[name];
      if (Number(button.dataset.delta) > 0 && current.rank < rankLimit()) sheet.skills[name] = current.rank + 1;
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
      const item=C.item(name,catalog);sheet.equipment.push({id:newId(),name,catalogId:item?.id || ''});
    } else if (action === 'remove-equipment') {
      sheet.equipment.splice(Number(button.dataset.index),1);
    } else if (action === 'add-advantage' || action === 'add-disadvantage') {
      const kind = action.slice(4), name = root.querySelector(`#${kind}-select`).value;
      const choice = catalog[kind === 'advantage' ? 'advantages' : 'disadvantages'].find(entry => entry.name === name);
      if (!choice) return;
      let approval='';
      if(sheet.phase==='advancement' && kind==='advantage'){approval=window.prompt('Explain the table’s approval for this advantage gained during play:')?.trim() || '';if(!approval)return;}
      const id=newId();sheet[kind === 'advantage' ? 'advantages' : 'disadvantages'].push({id,name,baseCost:choice.costs[0] || 0,cost:choice.costs[0] || 0});
      if(approval){commitEdit(before);const payment=sheet.progression.history.find(e=>e.key===`advantage:${id}`);if(payment)payment.explanation=approval;save();render();return;}
    } else if (action === 'remove-advantage' || action === 'remove-disadvantage') {
      const collection = action === 'remove-advantage' ? 'advantages' : 'disadvantages';
      sheet[collection].splice(Number(button.dataset.index),1);
    } else if (action === 'add-purchase') {
      const name = root.querySelector('#purchase-name').value.trim();
      const cost = Math.max(0, Number(root.querySelector('#purchase-cost').value) || 0);
      if (!name) return;
      sheet.purchases.push({id:newId(),name,cost});
    } else if (action === 'remove-purchase') {
      sheet.purchases.splice(Number(button.dataset.index),1);
    } else if (action === 'export') {
      const data = {character:sheet, derived:build(), exportedAt:new Date().toISOString(), source:'l5r-rules'};
      const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${(sheet.name || 'rokugan-character').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-')}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
      return;
    } else if (action === 'print') { window.print(); return;
    } else if (action === 'reset') {
      if (!window.confirm('Clear this character and start over?')) return;
      const visibility = sheet.visibility;
      sheet = blank();
      if (external) sheet.visibility = visibility;
    } else return;
    commitEdit(before);
  }

  function onChange(event) {
    uiError = '';
    const before = R.normalize(JSON.parse(JSON.stringify(sheet)));
    if (handleExtendedChange(event,before)) return;
    if (event.target.dataset.public) {
      if (external) return;
      sheet.visibility = {...window.SheetSharing.visibility(sheet),[event.target.dataset.public]:event.target.checked}; save(); render(); return;
    }
    const field = event.target.dataset.field;
    if (field === 'clan') { sheet.clan = event.target.value; sheet.family = ''; sheet.school = ''; sheet.schoolChoices = []; sheet.equipmentChoices = []; sheet.status = sheet.clan === 'Ronin' ? 0 : 1; }
    else if (field === 'family') sheet.family = event.target.value;
    else if (field === 'school') { sheet.disadvantages=sheet.disadvantages.filter(a=>!a.grantSchool || a.grantSchool!==sheet.school); sheet.school = event.target.value; sheet.schoolChoices = []; sheet.equipmentChoices = []; if(sheet.phase==='creation'){sheet.money = null;sheet.honor = null;} const selected=C.school(sheet.school,catalog); if(selected?.brotherhood) sheet.status=0; if(/Shinmaki/i.test(selected?.name || '') && !sheet.disadvantages.some(a=>a.name==='Disturbing Countenance'))sheet.disadvantages.push({id:newId(),name:'Disturbing Countenance',cost:0,free:true,grantSchool:sheet.school}); }
    else if(field==='startingXP'){if(event.target.value.trim()===''){render();return;}sheet.startingXP=Math.max(0,Math.floor(Number(event.target.value)||0));}
    else if (['status','glory','honor','taint','woundsTaken'].includes(field)) sheet[field] = Math.max(0, Number(event.target.value) || 0);
    else if (event.target.dataset.skillTrait !== undefined) {
      const name = event.target.dataset.skillTrait;
      if (TRAIT_NAMES.includes(event.target.value)) sheet.skillTraits[name] = event.target.value;
      else delete sheet.skillTraits[name];
    }
    else if (event.target.dataset.choiceIndex !== undefined) sheet.schoolChoices[Number(event.target.dataset.choiceIndex)] = event.target.value.trim();
    else if (event.target.dataset.equipmentChoice !== undefined) sheet.equipmentChoices[Number(event.target.dataset.equipmentChoice)] = event.target.value.trim();
    else if(event.target.dataset.optionDetail){const collection=event.target.dataset.optionDetail==='advantage'?sheet.advantages:sheet.disadvantages;const entry=collection[Number(event.target.dataset.index)];if(entry)entry.selection=event.target.value;}
    else if (event.target.dataset.kind) {
      const collection = event.target.dataset.kind === 'advantage' ? sheet.advantages : sheet.disadvantages;
      const entry = collection[Number(event.target.dataset.index)];
      if (entry) { if (sheet.phase==='advancement') { const reason=window.prompt('Explain this cost correction:'); if(!reason?.trim()){render();return;} entry.customCost=Math.max(0,Number(event.target.value)||0);commitEdit(before,reason.trim());return;} entry.customCost=Math.max(0,Number(event.target.value)||0); }
    } else return;
    commitEdit(before);
  }

  function onInput(event) {
    const kind=event.target.dataset.optionSearch;
    if(kind){const select=root.querySelector('#'+kind+'-select');for(const option of select.options)option.hidden=!!option.value && !option.textContent.toLowerCase().includes(event.target.value.toLowerCase());return;}
    if(event.target.dataset.optionDetail){const collection=event.target.dataset.optionDetail==='advantage'?sheet.advantages:sheet.disadvantages;const entry=collection[Number(event.target.dataset.index)];if(entry){entry.selection=event.target.value;save();}return;}
    const field = event.target.dataset.field;
    if (!['name','concept','notes','heritage'].includes(field)) return;
    sheet[field] = event.target.value;
    save();
    if (field === 'name') root.querySelector('#summary-name').textContent = sheet.name || 'Unnamed samurai';
    root.querySelector('.creator-print-sheet').outerHTML = renderPrintSheet(build());
  }

  async function mount(element, shared = null) {
    external = shared;
    root = element;
    root.onclick = onClick;
    root.onchange = onChange;
    root.oninput = onInput;
    sheet = R.normalize(shared ? shared.sheet : loadSheet());
    try {
      catalogPromise ||= fetch('public/character-data.json').then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      catalog = await catalogPromise;
      const normalizedSkills = {};
      for (const [value, rank] of Object.entries(sheet.skills)) {
        const {name, emphases} = skillIdentity(value);
        if(emphases.length)sheet.legacyEmphases[name]=[...new Set([...(sheet.legacyEmphases[name] || []),...emphases])];
        normalizedSkills[name] = Math.max(normalizedSkills[name] || 0, Number(rank) || 0);
      }
      sheet.skills = normalizedSkills;
      render();
    } catch (error) {
      root.innerHTML = '<div class="not-found"><h1>Character data unavailable</h1><p>Please refresh the page.</p></div>';
      console.error(error);
    }
  }

  async function sections(input) {
    catalogPromise ||= fetch('public/character-data.json').then(r => r.json());
    catalog = await catalogPromise;
    const previous = sheet;
    try { sheet = R.normalize(input); return window.SheetSharing.sections(sheet,build()); }
    finally { sheet = previous; }
  }
  const readRecord = id => {const record=roster().find(r=>r.id===id);return record?structuredClone(record.sheet):null;};
  window.CharacterBuilder = { mount, list, create, open, remove, read:readRecord, sections, normalize:R.normalize };
  window.addEventListener?.('characters-remote-changed', () => {
    if (root?.isConnected && location.hash.startsWith('#/create-character')) {
      if (!roster().some(record => record.id === activeId)) { location.hash = '#/start'; return; }
      if (external) return;
      sheet = loadSheet(); render();
    }
    window.dispatchEvent(new Event('characters-changed'));
  });
  window.addEventListener?.('campaigns-changed', () => {
    if (!external) return;
    const label = root?.querySelector?.('[data-save-status]');
    if (label) label.textContent = window.CampaignStorage.status;
  });
  window.addEventListener?.('character-sync-changed', () => {
    const label = root?.querySelector?.('[data-save-status]');
    if (label && !external) label.textContent = window.CharacterStorage.status;
  });
})();
