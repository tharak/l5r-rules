(() => {
  const UI = window.UI;
  const LEGACY_KEY = 'l5r-rules-character-v1';
  const ROSTER_KEY = 'l5r-rules-characters-v1';
  const ACTIVE_KEY = 'l5r-rules-active-character-v1';
  const MIGRATION_KEY = 'l5r-rules-characters-migrated-v1';
  const C = window.CharacterCatalog, R = window.CharacterRules;
  const {TRAIT_GROUPS, TRAIT_NAMES} = C;
  const sectionNames={identity:'Identity & training',traits:'Rings & traits',skills:'Skills',options:'Advantages & disadvantages',abilities:'Abilities',story:'Story & equipment',equipment:'Equipment',summary:'Summary & combat'};
  const resetDescriptions={identity:'the name, clan, family, school, and training choices',traits:'purchased Trait ranks',skills:'purchased Skills, emphases, Trait choices, and selectable school Skills',options:'advantages, disadvantages, and ancestors',abilities:'selected abilities',story:'story notes, heritage, personal equipment, outfit choices, money, standing, custom purchases, and modifiers',summary:'starting XP to 40, wounds taken, and mechanical modifiers'};
  const escapeHtml = UI.escape;
  const blank = () => R.normalize();
  let uiError = '';
  let emphasisSkill = '';
  let emphasisView = 'skills';
  let rollState = null;
  let xpAward = 0;
  let catalog, catalogPromise, sheet, root, activeId, external = null;
  let hideRankZeroSkills = true;
  // Start the updated filters checked, then retain subsequent user choices.
  const SKILL_FILTER_KEY = 'l5r-rules-character-rolls-hide-rank-zero-v2';
  const SKILL_CATEGORY_FILTER_KEY = 'l5r-rules-character-rolls-hidden-zero-categories-v2';
  const SKILL_FILTER_CATEGORIES = ['Artisan','Games','Perform','Lore','Weapons'];
  let hiddenZeroSkillCategories = new Set(SKILL_FILTER_CATEGORIES.map(category=>category.toLowerCase()));
  const sectionTitle = key => sectionNames[key];
  const editorRoute = () => location.hash.split('#').slice(0,2).join('#') === '#/create-character';
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
  const read = selector => root.querySelector(selector)?.value?.trim() || '';
  const newId = () => makeId();
  const abilityLabel = a => `${a.name} · ${a.kind}${a.ring ? ` · ${a.ring} ${a.mastery || ''}` : ''}`;
  function commitEdit() {
    save(); render();
  }
  const option = (value, label, selected) => UI.option({value,label,selected});

  function renderIdentity(data) {
    const clan = selectedClan();
    const clanOptions = ['Great Clans','Minor Clans','Other'].map(group => `<optgroup label="${group}">${catalog.clans.filter(clan => clan.group === group).map(clan => option(clan.name, clan.name, clan.name === sheet.clan)).join('')}</optgroup>`).join('');
    const familyOptions = (clan?.families || []).map(family => option(family.name, `${family.name}${family.kind==='order'?' Order':''}${family.parent?` (${family.parent})`:''} · +1 ${family.trait}`, family.name === sheet.family)).join('');
    const familyTraitChoice = data.family?.traitOptions ? UI.field({label:'Family benefit',attrs:{'data-field':'familyTrait'},kind:'select',optionsHtml:`${option('', 'Choose a physical trait', !data.familyTrait)}${data.family.traitOptions.map(trait=>option(trait,`+1 ${trait}`,trait===data.familyTrait)).join('')}`}) : '';
    const availableSchools=[...(sheet.advantages.some(a=>a.name==='Different School') ? C.schools(catalog) : clan?.schools || [])];
    const currentSchool=selectedSchool();if(currentSchool && !availableSchools.includes(currentSchool))availableSchools.push(currentSchool);
    const schoolOptions = availableSchools.filter(school=>!school.nonhuman || `${school.slug}#${school.anchor}`===sheet.school).map(school => option(`${school.slug}#${school.anchor}`, `${school.name}${school.benefit ? ` · +1 ${school.benefit}` : ''}`, `${school.slug}#${school.anchor}` === sheet.school)).join('');
    return UI.panel({attrs:{'class':'creator-panel creator-identity','id':'creator-identity'},bodyHtml:`${UI.sectionHeading({step:'01',title:'Identity & training',description:'Choose a clan, family, and starting school.'})}<div class="creator-fields">${UI.field({label:'Name',attrs:{'data-field':'name','type':'text','value':sheet.name,'placeholder':'Your character’s name'}})}${UI.field({label:'Clan',attrs:{'data-field':'clan'},kind:'select',optionsHtml:`${option('', 'Choose a clan', !sheet.clan)}${clanOptions}`})}${UI.field({label:'Family',attrs:{'data-field':'family','disabled':!(clan?.families.length)},kind:'select',optionsHtml:`${option('', clan?.families.length ? 'Choose a family' : 'No family benefit', !sheet.family)}${familyOptions}`})}${familyTraitChoice}${UI.field({label:'School',attrs:{'data-field':'school','disabled':!(clan)},kind:'select',optionsHtml:`${option('', clan?.schools.length ? 'Choose a school' : 'No starting school listed', !sheet.school)}${schoolOptions}`})}</div>${sheet.clan==='Imperial'?UI.field({label:'GM approval for Imperial family',labelAttrs:{'class':'creator-approval'},attrs:{'data-imperial-approval':true,'type':'text','value':sheet.exceptions.find(e=>e.code==='imperial')?.explanation || '','placeholder':'Record who approved this family'}}):''}${renderTraining(data)}${renderSchoolDecisions(data,'identity')}${renderCreationOptions(data)}${renderSection(renderSummary(data),'summary',data)}`});
  }

  function renderTraits(data,rolling = false) {
    const groups = rolling ? ['Void','Earth','Water','Air','Fire'].map(ring=>TRAIT_GROUPS.find(group=>group.ring===ring)) : TRAIT_GROUPS;
    const skills = rolling ? (hideRankZeroSkills ? data.skills : R.calculate(sheet,catalog,{untrainedSkills:skillOptions().untrainedSkills}).skills) : {};
    const skillNames = Object.keys(skills).filter(name=>skills[name].rank>0 || (!hideRankZeroSkills && !hiddenZeroSkillCategories.has(skillFilterCategory(name)))).sort((a,b)=>a.localeCompare(b));
    const renderTrait = trait => {
      const item = data.traits[trait], cost = (item.rank + 1) * (trait === 'Void' ? 6 : 4);
      const control = rolling ? `<button type="button" class="creator-rank-row creator-trait-display creator-roll-trait" data-action="open-roll" data-roll-kind="trait" data-roll-name="${trait}" aria-label="Roll ${trait} trait"><strong>${trait}</strong><output aria-label="${trait} rank">${item.rank}</output></button>` : `<div class="creator-rank-row"><span><strong>${trait}</strong></span>${UI.stepper({value:item.rank,size:'compact',attrs:{'aria-label':`${trait} rank`},outputAttrs:{'aria-label':`${trait} rank`},decrease:{'data-action':'trait','data-trait':trait,'data-delta':'-1','disabled':item.rank <= item.base,'aria-label':`Decrease ${trait}`},increase:{'data-action':'trait','data-trait':trait,'data-delta':'1','aria-label':`Increase ${trait} for ${cost} XP`}})}</div>`;
      if (!rolling) return control;
      return `<div class="creator-ring-trait-column" data-ring-trait="${trait}">${control}<ul class="creator-ring-skill-list creator-skill-list" aria-label="Skills using ${trait}">${skillNames.filter(name=>skills[name].trait===trait).map(name=>`<li data-ring-skill="${escapeHtml(name)}" data-trained="${skills[name].rank>0}">${renderSkillRow(name,skills[name],'rings')}</li>`).join('')}</ul></div>`;
    };
    return UI.panel({attrs:{'class':'creator-panel','id':rolling?'creator-rolls':'creator-traits'},bodyHtml:`${UI.sectionHeading({step:rolling?'00':'02',title:rolling?'Rolls':sectionTitle('traits')})}${rolling?renderSkillFilter():'<p class="creator-rule">A Trait costs 4 × its new rank in XP. Void costs 6 × its new rank. Creation limit: Rank 4. Maximum: Rank 5.</p>'}<div class="creator-ring-grid">${groups.map(group => { const traits=group.traits.map(renderTrait).join(''); return `<div class="creator-ring" data-ring="${group.ring}">${rolling?`<button type="button" class="creator-ring-head creator-roll-ring" data-action="open-roll" data-roll-kind="ring" data-roll-name="${group.ring}" aria-label="Roll ${group.ring} Ring">`:'<div class="creator-ring-head">'}${UI.ringMark({ring:group.ring,attrs:{class:'creator-ring-mark'}})}<${rolling?'span':'div'}><strong>${group.ring}</strong></${rolling?'span':'div'}><b>${data.rings[group.ring]}</b>${rolling?'</button>':'</div>'}${rolling?`<div class="creator-ring-traits">${traits}</div>`:traits}</div>`; }).join('')}</div>${rolling?`<div class="creator-roll-details">${renderWounds(data)}${renderCombat(data)}</div>`:''}`});
  }

  function renderSkillRoll(name, skill, view = 'skills') {
    const traits = C.skillTraitOptions(name,catalog);
    // Keep previously saved table-specific traits visible without changing the sheet.
    if (traits.length > 1 && skill.trait && !traits.includes(skill.trait)) traits.push(skill.trait);
    const traitControl = traits.length === 1
      ? `<div class="creator-skill-trait creator-skill-fixed-trait"><strong>${escapeHtml(skill.trait || traits[0])}</strong></div>`
      : `<div class="creator-skill-trait creator-skill-trait-choice">${UI.choiceGroup({radio:true,label:`Roll trait for ${name}`,name:`skill-trait-${view}-${encodeURIComponent(name)}`,value:skill.trait,attrs:{class:'creator-trait-segments'},choices:traits.map(trait=>({value:trait,label:trait,attrs:{'data-skill-trait':name}}))})}</div>`;
    return `${traitControl}<div class="creator-skill-roll">${skill.armorTNPenalty?`<small>Armor TN +${skill.armorTNPenalty}</small>`:''}<strong>${escapeHtml(skill.roll?.notation || '—')}</strong></div>`;
  }

  function renderSkillRank(name,skill) {
    const control = UI.stepper({value:skill.rank,attrs:{'aria-label':`${name} rank`},outputAttrs:{'aria-label':`${name} rank`},decrease:{'data-action':'skill','data-skill':name,'data-delta':'-1','disabled':skill.rank <= skill.base,'aria-label':`Decrease ${name}`},increase:{'data-action':'skill','data-skill':name,'data-delta':'1','aria-label':`Increase ${name} for ${skill.rank + 1} XP`}});
    return control;
  }

  function renderCompactSkillRow(name,skill) {
    const ring = TRAIT_GROUPS.find(group=>group.traits.includes(skill.trait))?.ring || '';
    return UI.recordRow({attrs:{'class':'creator-skill-row creator-skill-compact','data-ring':ring,'data-skill-name':name},bodyHtml:`<button type="button" class="creator-skill-name creator-roll-skill" data-action="open-roll" data-roll-kind="skill" data-roll-name="${escapeHtml(name)}" aria-label="Roll ${escapeHtml(name)}"><strong>${escapeHtml(name)}</strong></button><button type="button" class="creator-skill-roll creator-roll-skill" data-action="open-roll" data-roll-kind="skill" data-roll-name="${escapeHtml(name)}" aria-label="Roll ${escapeHtml(name)} dice pool"><strong>${escapeHtml(skill.roll?.notation || '—')}</strong></button>${skill.emphases.length ? `<span class="creator-skill-emphases" aria-label="${escapeHtml(name)} emphases">${skill.emphases.map(emphasis=>`<button type="button" class="creator-roll-emphasis" data-action="open-roll" data-roll-kind="emphasis" data-roll-skill="${escapeHtml(name)}" data-roll-name="${escapeHtml(emphasis)}" aria-label="Roll ${escapeHtml(name)} with ${escapeHtml(emphasis)} emphasis">${escapeHtml(emphasis)}</button>`).join(' ')}</span>` : ''}`});
  }

  function renderSkillRow(name,skill,view = 'skills') {
    if (view === 'rings') return renderCompactSkillRow(name,skill);
    const ring = TRAIT_GROUPS.find(group=>group.traits.includes(skill.trait))?.ring || '';
    const detail=[skill.base?'':skill.rank?'Purchased skill':'Untrained · Rank 0',skill.cost?`${skill.cost} XP spent`:'',skill.notes || ''].filter(Boolean).join(' · ');
    return UI.recordRow({attrs:{'class':'creator-skill-row','data-ring':ring,'data-skill-name':name},bodyHtml:`<div><div class="creator-skill-label"><strong>${escapeHtml(name)}</strong>${detail?`<small>${escapeHtml(detail)}</small>`:''}</div>${skill.emphases.length ? `<p class="creator-skill-emphases">Emphasis: ${escapeHtml(skill.emphases.join(', '))}</p>` : ''}${skill.masteries.map(m=>`<p class="creator-mastery">Rank ${m.rank}: ${escapeHtml(m.description)}</p>`).join('')}</div><div class="creator-skill-values">${renderSkillRoll(name,skill,view)}${renderSkillRank(name,skill)}${UI.button({text:'+emphasis',attrs:{'class':'creator-add-emphasis','data-action':'open-emphases','data-skill-view':view,'data-skill':name,'aria-label':`Add emphasis for ${name}`,'disabled':!(skill.rank)}})}</div>`});
  }

  function renderSkillFilter() {
    return `<div class="creator-skill-filters">${UI.checkbox({label:'Hide 0 rank skills',attrs:{'type':'checkbox','data-hide-zero-skills':true,'checked':hideRankZeroSkills},labelAttrs:{'class':'creator-check creator-skill-filter'}})}${SKILL_FILTER_CATEGORIES.map(category=>UI.checkbox({label:`Hide ${category}${category==='Weapons'?' 0':''}`,attrs:{'type':'checkbox','data-hide-zero-category':category.toLowerCase(),'checked':hiddenZeroSkillCategories.has(category.toLowerCase())},labelAttrs:{'class':'creator-check creator-skill-filter'}})).join('')}</div>`;
  }

  function skillFilterCategory(name) {
    const category = name.split(':')[0].trim();
    return C.WEAPON_SKILLS.includes(category) ? 'weapons' : category.toLowerCase();
  }

  function skillOptions() {
    const suggestions = [...new Set([...catalog.skills.map(skill => skill.name), ...catalog.clans.flatMap(clan => clan.schools.flatMap(school => school.skills.map(skill => skill.name))), 'Artisan: Painting', 'Artisan: Gardening', 'Artisan: Poetry', 'Craft: Carpentry', 'Lore: Gaijin', 'Perform: Dance', 'Perform: Song'])].sort((a,b) => a.localeCompare(b));
    const untrainedSkills = [...new Set([
      ...suggestions.filter(name=>!['Artisan','Craft','Games','Lore','Perform','Weapons'].includes(name)),
      ...catalog.skills.flatMap(skill=>Object.keys(skill.specialtyTraits || {}).map(specialty=>`${skill.name}: ${specialty}`)),
      ...Object.keys(sheet.skills),...Object.keys(sheet.skillTraits)
    ])];
    return {suggestions,untrainedSkills};
  }

  function renderSkills(data) {
    const {suggestions} = skillOptions();
    const skills = data.skills;
    const names = Object.keys(skills).sort((a,b)=>a.localeCompare(b));
    const choices = data.school?.skillChoices || [];
    const choicesComplete = choices.every((choice,index) => sheet.schoolChoices[index]?.trim() && !data.skillChoiceErrors[index]);
    return UI.panel({attrs:{'class':'creator-panel creator-skills','id':'creator-skills'},bodyHtml:`${UI.sectionHeading({step:'03',title:'Skills',description:'Rolls use Skill + Trait, keeping Trait. Choose the trait used for each task.'})}<p class="creator-rule">A Skill costs XP equal to its new rank. A new Skill at Rank 1 costs 1 XP. Creation limit: Rank 4. Maximum: Rank 10.</p>${renderSchoolDecisions(data,'skills')}${choices.length && !choicesComplete ? `<div class="creator-choice-grid">${choices.map((choice,index) => `<label>${escapeHtml(choice.prompt)} · ${choice.kind === 'emphasis' ? 'Free emphasis' : `School rank ${choice.rank}`}<input type="text" data-choice-index="${index}" ${choice.kind === 'skill' ? `list="school-suggestions-${index}"` : ''} value="${escapeHtml(sheet.schoolChoices[index] || '')}" placeholder="${choice.kind === 'emphasis' ? 'Choose an emphasis' : 'Choose a school skill'}" ${data.skillChoiceErrors[index] ? 'aria-invalid="true"' : ''}>${choice.kind === 'skill' ? `<datalist id="school-suggestions-${index}">${suggestions.filter(name => allowedSchoolSkill(choice, name)).map(name => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>` : ''}${data.skillChoiceErrors[index] ? `<small class="creator-choice-error">${escapeHtml(data.skillChoiceErrors[index])}</small>` : ''}</label>`).join('')}</div>` : ''}${UI.actionRow({attrs:{'class':'creator-add-row'},bodyHtml:`${UI.field({attrs:{'id':'new-skill','type':'text','list':'skill-suggestions','placeholder':'Add a skill, e.g. Courtier or Lore: History'}})}<datalist id="skill-suggestions">${suggestions.map(name => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>${UI.button({text:'Add skill',attrs:{'data-action':'add-skill'}})}`})}${names.length ? `<div class="creator-skill-list"><div class="creator-skill-table-head"><span>Skill name</span><span>Trait · Roll · Rank</span></div>${names.map(name=>renderSkillRow(name,skills[name])).join('')}</div>` : '<div class="creator-empty">Choose a school or add a skill to begin.</div>'}`});
  }

  function renderOptionChoice(kind,entry,index) {
    const rule=catalog[kind==='advantage'?'advantages':'disadvantages'].find(item=>item.name===entry.name);
    if (!R.optionNeedsChoice(entry,rule)) return '';
    const variants=R.optionVariants[entry.name], selected=entry.selection || '';
    if(variants)return UI.field({label:'Specific choice',labelAttrs:{'class':'creator-option-choice'},attrs:{'data-option-detail':kind,'data-index':index,'aria-label':`Specific choice for ${entry.name}`},kind:'select',optionsHtml:`${option('', 'Choose a variant', !selected)}${Object.keys(variants).map(name=>option(name,name,name===selected)).join('')}`});
    return UI.field({label:'Specific choice',labelAttrs:{'class':'creator-option-choice'},attrs:{'type':'text','data-option-detail':kind,'data-index':index,'value':selected,'placeholder':'Rank, skill, ally, or other choice','aria-label':`Specific choice for ${entry.name}`}});
  }
  function renderOptions(data) {
    const optionList = (kind) => {
      const entries = kind === 'advantage' ? catalog.advantages : catalog.disadvantages;
      const owned = kind === 'advantage' ? data.advantages : data.disadvantages;
      const totalPoints = kind === 'advantage' ? data.advantageTotal : data.disadvantageTotal;
      const limitMessage = kind === 'advantage' ? 'Up to 15 XP.' : 'Up to 10 XP.';
      const id = `${kind}-select`;
      return `<div class="creator-option-column"><div class="creator-option-heading"><h3>${kind === 'advantage' ? 'Advantages' : 'Disadvantages'} (${totalPoints})</h3><a class="creator-source" data-rule-reference href="${sourceLink(kind === 'advantage' ? 'advantages' : 'disadvantages')}">Read full ${kind === 'advantage' ? 'advantage' : 'disadvantage'} rules ↗</a></div><p class="creator-rule creator-option-limit">${limitMessage}</p>${UI.actionRow({attrs:{'class':'creator-add-row'},bodyHtml:`${UI.field({attrs:{'data-option-search':kind,'type':'search','placeholder':`Search ${kind}s`,'aria-label':`Search ${kind}s`}})}${UI.field({kind:'select',attrs:{'id':id},optionsHtml:`${option('', `Choose ${kind}`, true)}${entries.map(entry => option(entry.name, `${entry.name}${entry.costs.length ? ` · ${[...new Set(entry.costs.map(baseCost=>R.optionCost({name:entry.name,baseCost},sheet,data.school,catalog,kind==='disadvantage')))].join('/')} XP` : ' · variable'}`, false)).join('')}`})}${UI.button({text:'Add',attrs:{'data-action':`add-${kind}`}})}`})}${owned.length ? `<div class="creator-option-list">${owned.map((entry,index) => UI.recordRow({attrs:{'class':'creator-option-row'},bodyHtml:`<span>${escapeHtml(entry.name)}</span><div class="creator-option-cost"><span>XP cost</span>${UI.stepper({value:Number(entry.cost) || 0,attrs:{'aria-label':`${entry.name} XP cost`},outputAttrs:{'data-kind':kind,'data-index':index,'aria-label':`${entry.name} point cost`},decrease:{'data-action':'option-cost','data-kind':kind,'data-index':index,'data-delta':'-1','aria-label':`Decrease ${entry.name} cost`,'disabled':entry.cost<=0},increase:{'data-action':'option-cost','data-kind':kind,'data-index':index,'data-delta':'1','aria-label':`Increase ${entry.name} cost`}})}</div>${UI.button({text:'×',variant:'quiet',size:'compact',attrs:{'data-action':'remove-'+kind,'data-index':index,'aria-label':`Remove ${entry.name}`}})}${renderOptionChoice(kind,entry,index)}${catalog[kind==='advantage'?'advantages':'disadvantages'].find(a=>a.name===entry.name)?.description ? `<div class="creator-wide creator-option-rules"><p>${escapeHtml(catalog[kind==='advantage'?'advantages':'disadvantages'].find(a=>a.name===entry.name).description)}</p></div>` : ''}`})).join('')}</div>` : '<div class="creator-empty">None selected.</div>'}</div>`;
    };
    return UI.panel({attrs:{'class':'creator-panel','id':'creator-options'},bodyHtml:`${UI.sectionHeading({step:'04',title:'Advantages & disadvantages'})}${data.disadvantageTotal > 10 ? `<p class="creator-rule">You selected ${data.disadvantageTotal} disadvantage points; only 10 count toward your budget.</p>` : ''}<div class="creator-option-grid">${optionList('advantage')}${optionList('disadvantage')}</div>${renderAncestors(data)}`});
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
    if(!choices?.length)return UI.field({label:prompt,attrs:{'data-equipment-choice':entry.index,'type':'text','value':selected,'placeholder':'Choose your equipment'}});
    // Retain older custom choices while offering the catalog for new selections.
    if(selected && !choices.includes(selected))choices.push(selected);
    return UI.field({label:prompt,attrs:{'data-equipment-choice':entry.index},kind:'select',optionsHtml:`${option('', 'Choose an item', !selected)}${choices.map(name=>option(name,name,name===selected)).join('')}`});
  }

  function renderEquipment(data) {
    const rows = data.equipment.map(entry => UI.recordRow({attrs:{'class':'creator-equipment-row'},bodyHtml:`<div><strong>${escapeHtml(entry.name)}</strong>${entry.source==='personal' || entry.pending?`<small>${[entry.source==='personal'?'Personal equipment':'',entry.pending?'Choose an item':''].filter(Boolean).join(' · ')}</small>`:''}</div>${entry.source === 'school' && entry.choice ? renderEquipmentChoice(data,entry) : ''}${entry.source === 'personal' ? UI.button({text:'×',variant:'quiet',size:'compact',attrs:{'data-action':'remove-equipment','data-index':entry.index,'aria-label':`Remove ${entry.name}`}}) : ''}`})).join('');
    return UI.panel({attrs:{class:'creator-panel creator-equipment',id:'creator-equipment'},bodyHtml:`${UI.sectionHeading({step:'07',title:'Equipment'})}${UI.actionRow({attrs:{class:'creator-money-fields'},bodyHtml:['koku','bu','zeni'].map(k=>renderNumber(k,Number(data.money[k]) || 0,{label:k,step:1,min:0,action:'money-step',size:'compact'})).join('')})}${rows ? `<div class="creator-equipment-list">${rows}</div>` : '<div class="creator-empty">Choose a school to receive your starting outfit.</div>'}${UI.actionRow({attrs:{'class':'creator-add-row'},bodyHtml:`${UI.field({attrs:{'id':'new-equipment','list':'equipment-suggestions','type':'text','placeholder':'Equipment name','aria-label':'Equipment name'}})}<datalist id="equipment-suggestions">${[...catalog.weapons,...catalog.armors].map(e=>`<option value="${escapeHtml(e.name)}"></option>`).join('')}</datalist>${UI.button({text:'Add equipment',attrs:{'data-action':'add-equipment'}})}`})}`});
  }

  function renderTraining(data) {
    if (!data.school) return '';
    return `<div class="creator-purchases creator-training"><h3>School training</h3>${data.techniques.map(entry => `<div class="creator-training-entry"><strong>${escapeHtml(entry.name)}</strong><p>${escapeHtml(entry.description)}</p></div>`).join('')}${data.school.affinity ? `<div class="creator-training-entry"><strong>Affinity / Deficiency</strong><p>${escapeHtml(data.school.affinity)}</p></div>` : ''}${data.school.spells ? `<div class="creator-training-entry"><strong>Starting spells</strong><p>${escapeHtml(data.school.spells)}</p></div>` : ''}<a class="creator-source" data-rule-reference href="${sourceLink(data.school.slug, data.school.anchor)}">View school rules ↗</a></div>`;
  }

  const numericFields={woundsTaken:{label:'Wounds',step:1,min:0},honor:{label:'Honor',step:0.1,min:0,max:10},taint:{label:'Taint',step:0.1,min:0},status:{label:'Status',step:0.1,min:0,max:10},glory:{label:'Glory',step:0.1,min:0,max:10}};
  function renderNumber(key,value,config=numericFields[key]) {
    const {label,step,min,max=Infinity,action='number-step',size='regular',showLabel=true}=config;
    return `<div class="creator-number-field">${showLabel?`<span>${label}</span>`:''}${UI.stepper({value:step<1?Number(value).toFixed(1):value,size,attrs:{'aria-label':label},outputAttrs:{'aria-label':label},decrease:{'data-action':action,'data-field':key,'data-delta':'-1','aria-label':`Decrease ${label}`,'disabled':value<=min},increase:{'data-action':action,'data-field':key,'data-delta':'1','aria-label':`Increase ${label}`,'disabled':value>=max}})}</div>`;
  }
  function renderStory(data) {
    return UI.panel({attrs:{'class':'creator-panel','id':'creator-story'},bodyHtml:`${UI.sectionHeading({step:'06',title:'Story'})}<p class="creator-rule">For heritage and detailed background prompts, see <a data-rule-reference href="${sourceLink('heritage')}">Heritage</a> and <a data-rule-reference href="${sourceLink('chargen')}">Character Generation</a>.</p><div class="creator-fields">${UI.field({label:'Character concept',attrs:{'data-field':'concept','type':'text','value':sheet.concept,'placeholder':'A loyal yojimbo, an ambitious courtier…'}})}${UI.field({label:'Notes & heritage',labelAttrs:{'class':'creator-wide'},attrs:{'data-field':'notes','rows':'7','placeholder':'Add your heritage and story notes here.'},kind:'textarea',value:sheet.notes})}${UI.field({label:'Recorded heritage outcome',labelAttrs:{'class':'creator-wide'},attrs:{'data-field':'heritage','rows':'3'},kind:'textarea',value:sheet.heritage})}</div>${renderModifiers(data)}<div class="creator-purchases"><h3>Other XP purchases</h3><p>Record custom purchases with a name and paid XP cost. Use Skills for emphases and Abilities for catalog powers.</p>${UI.actionRow({attrs:{'class':'creator-add-row'},bodyHtml:`${UI.field({attrs:{'id':'purchase-name','type':'text','placeholder':'Purchase name'}})}${UI.field({attrs:{'id':'purchase-cost','type':'number','min':'0','max':'100','step':'1','placeholder':'XP'}})}${UI.button({text:'Add',attrs:{'data-action':'add-purchase'}})}`})}${sheet.purchases.length ? `<div class="creator-option-list">${sheet.purchases.map((entry,index) => UI.recordRow({attrs:{'class':'creator-option-row'},bodyHtml:`<span>${escapeHtml(entry.name)}</span><strong>${Number(entry.cost) || 0} XP</strong>${UI.button({text:'×',variant:'quiet',size:'compact',attrs:{'data-action':'remove-purchase','data-index':index,'aria-label':`Remove ${entry.name}`}})}`})).join('')}</div>` : ''}</div>`});
  }

  function renderWounds(data) {
    const wounds=data.combat.wounds, levelIndex=wounds.levels.findIndex(level=>wounds.current<=level.total);
    const severity=levelIndex<0?wounds.levels.length-1:levelIndex;
    const hue=Math.round(120*(1-severity/Math.max(1,wounds.levels.length-1)));
    return `<div class="creator-roll-wounds creator-ring" style="--wound-hue:${hue}" data-wound-level="${severity}" aria-label="Wound levels and current wounds"><div class="creator-ring-head"><strong>Wounds</strong>${renderNumber('woundsTaken',wounds.current,{...numericFields.woundsTaken,showLabel:false})}</div><div class="creator-wounds creator-value-tiles">${wounds.levels.map((level,index) => `<div${index===levelIndex?' aria-current="true"':''}><span${index===levelIndex?' class="creator-wound-status" role="status"':''}>${escapeHtml(level.label)}</span>: <strong>${level.total}</strong></div>`).join('')}<div${levelIndex<0?' aria-current="true"':''}><span${levelIndex<0?' class="creator-wound-status" role="status"':''}>Dead</span>: <strong>${Math.floor(wounds.maximum)+1}</strong></div>${UI.button({text:`Heal · ${data.combat.healing}`,variant:'secondary',size:'compact',attrs:{'data-action':'heal-wounds','aria-label':`Heal ${data.combat.healing} wounds`,'disabled':wounds.current<=0 || data.combat.healing<=0}})}</div></div>`;
  }

  function renderCombat(data) {
    return `<div class="creator-roll-combat creator-ring"><div class="creator-ring-head"><strong>Combat values</strong></div><div class="creator-combat creator-value-tiles"><div><button type="button" class="creator-roll-skill" data-action="open-roll" data-roll-kind="initiative" data-roll-name="Initiative" aria-label="Roll Initiative"><span>Initiative roll</span>: <strong>${data.combat.initiative.notation}</strong></button></div><div><span>Armor TN (equipped)</span>: <strong>${data.combat.armorTN}</strong></div><div><span>Reduction</span>: <strong>${data.combat.reduction}</strong></div></div></div>`;
  }

  function renderSummary(data) {
    const breakdown=data.insightBreakdown;
    const ringValues=Object.entries(data.rings).map(([ring,rank])=>`${ring} ${rank}`).join(' + ');
    const insightFormula=`(${ringValues}) × 10 + ${breakdown.skills} Skill ranks + ${breakdown.courtier} Courtier bonus + ${breakdown.etiquette} Etiquette bonus${breakdown.modifier?` ${breakdown.modifier>0?'+':'−'} ${Math.abs(breakdown.modifier)} modifier`:''}`;
    return `<aside class="creator-summary creator-record" id="creator-summary"><div class="creator-summary-inner"><div class="creator-record-header"><h3 class="creator-summary-kicker" id="creator-record-title">CHARACTER RECORD</h3></div><div class="creator-record-grid"><div class="creator-record-group"><div class="creator-xp ${data.xpRemaining < 0 ? 'over-budget' : ''}"><div class="creator-xp-total"><span>XP:</span><strong>${data.xpRemaining}</strong></div><small>${data.startingXP} starting + ${data.xpEarned} disadvantage + ${data.xpAwards} awarded − ${data.xpSpent} paid</small>${renderXPControls()}</div><div class="creator-standing-fields">${['honor','glory','status','taint'].map(key=>renderNumber(key,Number(data[key] ?? sheet[key]) || 0)).join('')}</div></div><div class="creator-xp creator-insight"><div class="creator-xp-total"><span>Insight:</span><strong>${data.insight}</strong></div><small>${escapeHtml(insightFormula)}</small></div></div><div class="creator-summary-links"><a data-rule-reference href="${sourceLink('chargen')}">Creation rules ↗</a><a data-rule-reference href="${sourceLink('families')}">Families ↗</a></div></div></aside>`;
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
        </div><div class="print-right"><div class="print-standing">${standing('Honor',data.honor)}${standing('Glory',data.glory)}${standing('Status',data.status)}${standing('Shadowlands Taint',data.taint)}</div>
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

  function renderNavigation() {
    const sections=[['rolls','Rolls'],['identity','Identity'],['traits','Traits'],['skills','Skills'],['options','Advantages'],['abilities','Abilities'],['story','Story'],['equipment','Equipment']];
    return `<nav class="creator-nav" aria-label="Character sections"><div class="creator-nav-sections">${sections.map(([key,label])=>UI.button({text:label,attrs:{'data-action':'section','data-section':key}})).join('')}</div>${UI.actionRow({attrs:{'class':'creator-header-actions'},bodyHtml:`<a href="${external?.returnHref || window.CampaignUI?.creatorReturn() || '#/characters'}">← ${external || window.CampaignUI?.creatorReturn() ? 'Campaign' : 'Characters'}</a>${UI.button({text:'Save PC',attrs:{'data-action':'save-close'}})}${UI.button({text:'Export JSON ↗',variant:'secondary',attrs:{'data-action':'export'}})}${UI.button({text:'Print sheet ↗',variant:'secondary',attrs:{'data-action':'print'}})}`})}</nav>${uiError?`<p class="creator-feedback" role="alert">${escapeHtml(uiError)}</p>`:''}`;
  }
  function violationSection(code) {
    if (/^(rank:trait:)/.test(code)) return 'traits';
    if (/^(rank:skill:|emphases:|school-choice:|chosen-art$|weapon-focus$)/.test(code)) return 'skills';
    if (/^(ability:|kiho-|tattoo-|spell-|affinity$|second-deficiency$)/.test(code)) return 'abilities';
    if (/^(equipment|armor$)/.test(code)) return 'equipment';
    if (code === 'modifiers') return 'story';
    if (/^(advantages$|disadvantages$|size$|multiple-schools$|cost:|advancement:|option-choice:|ancestor:|shinmaki-grant$)/.test(code)) return 'options';
    if (code === 'xp') return 'summary';
    return 'identity';
  }
  function renderSection(content,key,d) {
    const issues=d.blockers.filter(v=>violationSection(v.code)===key);
    const messages=issues.length?`<ul class="creator-validation" aria-label="${escapeHtml(sectionTitle(key) || 'Progression')} choices">${issues.map(v=>`<li>${escapeHtml(v.message)}</li>`).join('')}</ul>`:'';
    // Keep feedback visible in the section that contains the corresponding control.
    return content.replace(key==='summary'?'</aside>':'</section>',messages+(key==='summary'?'</aside>':'</section>'));
  }
  function renderCreationOptions(d) {
    return UI.disclosure({attrs:{'class':'creator-later-training'},titleHtml:`Later training`,bodyHtml:`${renderLaterTraining(d)}`});
  }
  function renderXPControls() {
    return `<div class="creator-xp-controls">${UI.stepper({value:xpAward,label:'XP to add',outputAttrs:{id:'xp-award','aria-live':'polite'},decrease:{'data-action':'xp-award-step','data-delta':'-1','aria-label':'Decrease XP to add'},increase:{'data-action':'xp-award-step','data-delta':'1','aria-label':'Increase XP to add'}})}${UI.button({text:'Add',attrs:{'class':'creator-primary','data-action':'award-xp','disabled':xpAward===0}})}</div>${sheet.progression.history.length?UI.disclosure({attrs:{'class':'creator-xp-history'},titleHtml:`XP history`,bodyHtml:`<ul>${sheet.progression.history.map(e=>`<li>${escapeHtml(e.label)} · ${Number(e.amount)} XP${e.explanation?` · ${escapeHtml(e.explanation)}`:''}</li>`).join('')}</ul>`}):''}`;
  }
  function renderLaterTraining(d) {
    const sources=[...C.schools(catalog).filter(s=>!s.nonhuman),...catalog.training];
    return `<div class="creator-purchases"><h3>Later training</h3><p>School Ranks are recorded separately from Insight. A new basic school starts at your next Insight Rank and grants techniques after learning its School Skills. Paths replace their printed technique rank. Advanced schools require their printed entry requirements.</p><p class="creator-rule">Nonhuman and foreign character systems remain available in Books and custom records.</p>${sheet.training.map((t,i)=>{const school=C.school(t.school || t.id,catalog);return UI.recordRow({attrs:{'class':'creator-option-row'},bodyHtml:`<span>${escapeHtml(school?.name || t.school)} · School Rank ${t.rank}${school?.kind?` · ${escapeHtml(school.kind)}`:''}</span>${school?.kind!=='path'?UI.stepper({value:t.rank,attrs:{'aria-label':`${school?.name || t.school} school rank`},outputAttrs:{'aria-label':'School rank'},decrease:{'data-action':'train-rank','data-index':i,'data-delta':'-1','disabled':t.rank<=1,'aria-label':`Decrease ${school?.name} school rank`},increase:{'data-action':'train-rank','data-index':i,'data-delta':'1','disabled':t.rank>=10,'aria-label':`Advance ${school?.name} school rank`}}):''}${UI.button({text:'×',variant:'quiet',size:'compact',attrs:{'data-action':'remove-training','data-index':i,'aria-label':'Remove training'}})}${school?`<a data-rule-reference href="${sourceLink(school.slug,school.anchor)}">Rules ↗</a>`:''}`});}).join('')}${UI.actionRow({attrs:{'class':'creator-add-row'},bodyHtml:`${UI.field({attrs:{'id':'training-school','list':'training-suggestions','placeholder':'Search a school, path, or advanced school','aria-label':'Later school'}})}<datalist id="training-suggestions">${sources.map(s=>`<option value="${escapeHtml(s.name+' · '+(s.kind || 'basic'))}"></option>`).join('')}</datalist>${UI.button({text:'Add training',attrs:{'data-action':'add-training'}})}`})}</div>`;
  }
  function renderSchoolDecisions(d,section) {
    const school=d.school;
    if(!school)return '';
    const select=(key,label,values)=>UI.field({label,attrs:{'data-school-decision':key},kind:'select',optionsHtml:`${option('','Choose',!sheet.schoolDecisions[key])}${values.map(v=>option(v,v,sheet.schoolDecisions[key]===v)).join('')}`});
    const elements=['Air','Earth','Fire','Water'], allElements=[...elements,'Void'];
    let fields='';
    if(section==='identity' && /Fudoist/.test(school.name))fields=select('fudoistFocus','Fudoist specialty',['Social','Attack'])+'<p>Set your chosen high or low starting Honor in Story & equipment.</p>';
    if(section==='skills') {
      const arts=Object.entries(d.skills).filter(([name,s])=>s.base && /^(Acting|Artisan:|Perform:)/.test(name)).map(([name])=>name);
      if(/Kakita Artisan/.test(school.name))fields+=select('chosenArt','Chosen art',arts);
      if(/Utaku Infantry/.test(school.name))fields+=select('weaponFocus','Chosen Weapon Skill',['Kenjutsu','Polearms','Spears'])+UI.field({label:'Free weapon emphasis',attrs:{'data-school-decision':'weaponEmphasis','value':sheet.schoolDecisions.weaponEmphasis || ''}});
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
    const optional=section==='abilities'?UI.disclosure({attrs:{'class':'creator-purchases'},titleHtml:`Optional ability training`,bodyHtml:UI.actionRow({attrs:{class:'creator-optional-ability-options'},bodyHtml:[['nonBrotherhoodKiho','Table permits optional non-Brotherhood Kiho'],['maho','Table permits forbidden maho training'],['shadowlands','Table permits recorded Shadowlands powers']].map(([key,label])=>UI.checkbox({label,attrs:{'type':'checkbox','data-school-decision':key,'checked':sheet.schoolDecisions[key]},labelAttrs:{'class':'creator-check'}})).join('')})}):'';
    return choices+optional;
  }
  function renderEmphases(name,skill) {
    const available=catalog.skills.find(s=>s.name===name.split(':')[0])?.emphases || [];
    const choices=available.some(e=>/^by animal/i.test(e)) ? ['Dogs','Horses','Falcons'] : available.filter(e=>!/^none$|varies/i.test(e));
    const purchased=sheet.emphases[name] || [];
    return UI.dialog({titleId:'emphasis-dialog-title',attrs:{class:'creator-emphasis-dialog'},headerHtml:`<h2 id="emphasis-dialog-title">${escapeHtml(name)} · Emphases</h2>${UI.button({text:'Close',variant:'secondary',attrs:{'data-action':'close-emphases','aria-label':'Close emphasis choices'}})}`,bodyClass:'creator-emphasis-body',bodyHtml:`<p>Rank ${skill.rank} · Emphases ${skill.emphases.length}/${Math.min(5,Math.ceil(skill.rank/2))} · 2 XP each</p>${uiError?`<p role="alert" class="creator-error">${escapeHtml(uiError)}</p>`:''}<div class="creator-emphasis-owned">${skill.emphases.map(e=>`<div><span>${escapeHtml(e)}</span>${purchased.includes(e)?UI.button({text:'×',variant:'quiet',size:'compact',attrs:{'data-action':'remove-emphasis','data-skill':name,'data-index':purchased.indexOf(e),'aria-label':`Remove ${e} emphasis`}}):'<small>School / saved grant</small>'}</div>`).join('')}</div><div class="creator-emphasis-choices">${choices.map(e=>UI.button({html:`${escapeHtml(e)} <small>${skill.emphases.includes(e)?'Selected':'2 XP'}</small>`,attrs:{'data-action':'add-emphasis','data-skill':name,'data-emphasis':e,'aria-label':`Buy ${e} emphasis for ${name}`,'disabled':skill.emphases.includes(e)}})).join('')}</div>${UI.actionRow({attrs:{'class':'creator-add-row'},bodyHtml:`${UI.field({attrs:{'data-emphasis-name':name,'placeholder':'Custom emphasis','aria-label':`New emphasis for ${name}`}})}${UI.button({text:'Buy emphasis · 2 XP',attrs:{'data-action':'add-emphasis','data-skill':name}})}`})}`});
  }

  function renderAncestors(d) {
    return `<div class="creator-purchases"><h3>Ancestors</h3><p>Ancestors are Spiritual Advantages with clan restrictions and demands. Their guidance is recorded here.</p>${UI.actionRow({attrs:{'class':'creator-add-row'},bodyHtml:`${UI.field({attrs:{'id':'ancestor-choice','list':'ancestor-suggestions','placeholder':'Search an ancestor','aria-label':'Ancestor'}})}<datalist id="ancestor-suggestions">${catalog.ancestors.map(a=>`<option value="${escapeHtml(a.name)}">${a.cost} XP · ${escapeHtml(a.clan)}</option>`).join('')}</datalist>${UI.button({text:'Add ancestor',attrs:{'data-action':'add-ancestor'}})}`})}${sheet.ancestors.map((a,i)=>{const rule=catalog.ancestors.find(e=>e.id===a.catalogId);return UI.disclosure({attrs:{},titleHtml:`${escapeHtml(a.name)} · ${a.cost} XP`,bodyHtml:`<p>${escapeHtml(rule?.description || a.description || '')}</p>${rule?`<a data-rule-reference href="${sourceLink(rule.slug,rule.anchor)}">Rules ↗</a>`:''}${UI.button({text:'Remove ancestor',variant:'quiet',size:'compact',attrs:{'data-action':'remove-ancestor','data-index':i}})}`});}).join('')}</div>`;
  }
  function renderAbility(a,d) {
    const summary = `${escapeHtml(a.name)} · ${escapeHtml(a.kind)}${a.ring?` · ${escapeHtml(a.ring)} ${a.mastery || ''}`:''} · ${a.cost} XP${a.grant?' · School grant':''}${a.memorized?' · Memorized':''}`;
    const rules = `${Object.keys(a.fields || {}).length?`<dl>${Object.entries(a.fields).map(([key,value])=>`<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>`:''}<p>${escapeHtml(a.description || '')}</p>${a.spellRoll?`<p>Spell Casting Roll: ${escapeHtml(a.spellRoll.notation)} · TN ${a.mastery*5+5}</p>`:''}${a.reasons?.length?`<p class="creator-error">${a.reasons.map(escapeHtml).join(' ')}</p>`:''}${UI.actionRow({attrs:{'class':'creator-header-actions'},bodyHtml:`<a data-rule-reference href="${sourceLink(a.slug || 'magic',a.anchor || '')}">Local rules ↗</a>${a.kind==='spell'?UI.button({text:a.memorized?'Remove memorization':'Memorize · '+a.mastery+' XP',attrs:{'data-action':'memorize','data-id':a.selectionId}}):''}${sheet.abilities.some(e=>e.id===a.selectionId)?UI.button({text:'Remove ability',variant:'quiet',size:'compact',attrs:{'data-action':'remove-ability','data-id':a.selectionId}}):''}`})}`;
    return UI.disclosure({attrs:{},titleHtml:`${summary}`,bodyHtml:`${rules}`});
  }

  const abilityKinds = [['spell','Spells','spell'],['kata','Kata','kata'],['kiho','Kiho','kiho'],['tattoo','Tattoos','tattoo'],['shadowlands','Shadowlands powers','Shadowlands power']];
  function renderAbilityPickers() {
    return `<div class="creator-ability-pickers">${abilityKinds.map(([kind,title,label])=>`<div class="creator-ability-picker" data-ability-kind="${kind}"><h3>${title}</h3>${UI.actionRow({attrs:{class:'creator-add-row'},bodyHtml:
      UI.field({label:title,kind:'select',attrs:{id:`ability-choice-${kind}`},options:[{value:'',label:`Choose a ${label}`},...catalog.abilities.filter(a=>a.kind===kind).map(a=>({value:a.id,label:abilityLabel(a)}))]})+
      UI.field({label:'Acquisition',kind:'select',attrs:{id:`ability-payment-${kind}`,'aria-label':`${title} acquisition`},options:[{value:'purchase',label:'Purchase / learn'},{value:'grant',label:'Free school choice'}]})+
      UI.button({text:`Add ${label}`,attrs:{'data-action':'add-ability','data-ability-kind':kind}})
    })}</div>`).join('')}</div>`;
  }
  function renderAbilities(d) {
    return UI.panel({attrs:{'class':'creator-panel','id':'creator-abilities'},bodyHtml:`${UI.sectionHeading({step:'05',title:'Abilities',description:'Search spells, kata, kiho, tattoos, and Shadowlands powers. School grants are free; memorizing a spell costs its Mastery Level.'})}${renderSchoolDecisions(d,'abilities')}${renderAbilityPickers()}<div class="creator-ability-list">${d.abilities.map(a=>renderAbility(a,d)).join('') || '<p class="creator-empty">No abilities selected.</p>'}</div>${UI.disclosure({attrs:{'class':'creator-purchases'},titleHtml:`Custom ability`,bodyHtml:`<div class="creator-fields">${UI.field({label:'Name',attrs:{'id':'custom-ability-name'}})}${UI.field({label:'XP cost',attrs:{'id':'custom-ability-cost','type':'number','min':'0','step':'1','value':'0'}})}${UI.field({label:'Description',labelAttrs:{'class':'creator-wide'},attrs:{'id':'custom-ability-description','rows':'3'},kind:'textarea',value:''})}</div>${UI.button({text:'Add custom ability',attrs:{'data-action':'add-custom-ability'}})}`})}`});
  }
  function renderModifiers(d) {
    const controls=[['armorTN','Armor TN'],['reduction','Reduction'],['initiativeRoll','Initiative rolled dice'],['initiativeKeep','Initiative kept dice'],['initiativeFlat','Initiative flat bonus'],['unarmedRoll','Unarmed rolled dice'],['unarmedKeep','Unarmed kept dice'],['healing','Healing per day'],['wounds','Wounds per level'],['insight','Insight bonus']];
    return UI.disclosure({attrs:{'class':'creator-purchases'},titleHtml:`Mechanical modifiers`,bodyHtml:`<p>Permanent effects supported by the rules are calculated automatically. Record a source and explanation for additional modifiers or active situational effects.</p><div class="creator-fields">${controls.map(([key,label])=>UI.field({label,attrs:{'type':'number','step':'1','data-modifier':key,'value':Number(sheet.modifiers[key]) || 0}})).join('')}${UI.field({label:'Modifier source / table approval',labelAttrs:{'class':'creator-wide'},attrs:{'data-modifier-reason':true,'value':sheet.modifierReason}})}</div>`});
  }
  function handleExtendedAction(action,button) {
    if(action==='section'){root.querySelector('#creator-'+button.dataset.section)?.scrollIntoView({behavior:'smooth',block:'start'});return true;}
    const actions=['reset-section','award-xp','add-emphasis','remove-emphasis','add-ability','remove-ability','memorize','add-custom-ability','add-ancestor','remove-ancestor','add-training','remove-training','train-rank'];
    if(!actions.includes(action))return false;
    if(action==='reset-section') {
      const key=button.dataset.section;
      if(!resetDescriptions[key] || !window.confirm(`Reset ${sectionTitle(key)}? This resets ${resetDescriptions[key]}. Fixed school grants are recalculated. The character ID and privacy settings are kept.`))return true;
      sheet=R.resetSection(sheet,key,catalog);
    } else if(action==='award-xp') {
      try {sheet=R.award(sheet,xpAward,'XP added from character editor.');xpAward=0;}catch(e){uiError=e.message;}
    } else if(action==='add-emphasis') {
      const name=button.dataset.skill,value=button.dataset.emphasis || read(`input[data-emphasis-name=${JSON.stringify(name)}]`);
      if(!value)uiError='Choose an emphasis.';
      else if(!build().skills[name].emphases.includes(value))(sheet.emphases[name] ||= []).push(value);
    } else if(action==='remove-emphasis')sheet.emphases[button.dataset.skill]?.splice(Number(button.dataset.index),1);
    else if(action==='add-ability') {
      const kind=button.dataset.abilityKind, value=read('#ability-choice-'+kind),a=catalog.abilities.find(a=>a.kind===kind && a.id===value);
      if(!a)uiError='Choose an ability from the catalog, or add a custom ability below.';
      else if(!sheet.abilities.some(e=>e.catalogId===a.id))sheet.abilities.push({id:newId(),catalogId:a.id,kind:a.kind,name:a.name,grant:read('#ability-payment-'+kind)==='grant',memorized:false});
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
    if(!uiError)commitEdit();else render();
    return true;
  }
  function handleExtendedChange(event) {
    const t=event.target,k=t.dataset;
    if(k.imperialApproval!==undefined){sheet.exceptions=sheet.exceptions.filter(e=>e.code!=='imperial');if(t.value.trim())sheet.exceptions.push({id:newId(),code:'imperial',label:'Imperial family approval',explanation:t.value.trim()});}
    else if(k.money!==undefined){sheet.money ||= {...build().money};sheet.money[k.money]=Math.max(0,Number(t.value)||0);}
    else if(k.modifier!==undefined)sheet.modifiers[k.modifier]=Number(t.value)||0;
    else if(k.modifierReason!==undefined)sheet.modifierReason=t.value;
    else if(k.schoolDecision!==undefined){sheet.schoolDecisions[k.schoolDecision]=t.type==='checkbox'?t.checked:t.value;
      if(k.schoolDecision==='affinity' && /opposing Element/i.test(build().school?.affinity || ''))sheet.schoolDecisions.deficiency={Air:'Earth',Earth:'Air',Fire:'Water',Water:'Fire'}[t.value] || '';
    }
    else return false;
    commitEdit();return true;
  }

  function renderLayout(data) {
    return `${renderTraits(data,true)}<div class="creator-layout"><div class="creator-main">${renderSection(renderIdentity(data),'identity',data)}${renderSection(renderTraits(data),'traits',data)}${renderSection(renderSkills(data),'skills',data)}${renderSection(renderOptions(data),'options',data)}${renderSection(renderAbilities(data),'abilities',data)}${renderSection(renderStory(data),'story',data)}${renderSection(renderEquipment(data),'equipment',data)}<div class="creator-bottom"><span data-save-status>${escapeHtml((external ? window.CampaignStorage?.status : window.CharacterStorage?.status) || 'Saved on this device')}</span>${UI.button({text:'Start over',attrs:{'data-action':'reset'}})}</div></div></div>`;
  }

  function render() {
    if (!root?.isConnected || !catalog || (!external && !editorRoute())) return;
    const openDetails = root.querySelectorAll ? Array.from(root.querySelectorAll('details[open]')).map(d=>d.querySelector('summary')?.textContent?.split(' ·')[0]) : [];
    const data = build();
    root.innerHTML = `<div class="creator-page">${renderNavigation()}${renderLayout(data)}${renderPrintSheet(data)}${emphasisSkill && data.skills[emphasisSkill]?.rank ? renderEmphases(emphasisSkill,data.skills[emphasisSkill]) : ''}${rollState?renderRollDialog():''}</div>`;
    const rollDialog = root.querySelector('.creator-roll-dialog');
    if (rollDialog) {
      rollDialog.oncancel = event => { event.preventDefault(); closeRoll(); };
      rollDialog.showModal();
    }
    const emphasisDialog = root.querySelector('.creator-emphasis-dialog');
    if (emphasisDialog) {
      emphasisDialog.oncancel = event => { event.preventDefault(); closeEmphases(); };
      emphasisDialog.showModal();
    }
    if (root.querySelectorAll) for (const details of root.querySelectorAll('details')) if(openDetails.includes(details.querySelector('summary')?.textContent?.split(' ·')[0])) details.open=true;
    const visibility = window.SheetSharing?.visibility(sheet) || sheet.visibility;
    if (visibility && root.querySelectorAll) {
      const ids = {identity:'creator-identity',traits:'creator-traits',skills:'creator-skills',options:'creator-options',story:'creator-story',summary:'creator-summary',abilities:'creator-abilities'};
      for (const [key,id] of Object.entries(ids)) {
        const panel = root.querySelector('#'+id);
        if (!panel) continue;
        const heading = panel.querySelector('.creator-panel-head');
        const title = heading?.querySelector('h2') || panel.querySelector('#creator-record-title');
        if (title) {
          const row = document.createElement('div');
          row.className = 'creator-section-title';
          title.replaceWith(row);
          row.append(title);
          row.insertAdjacentHTML('beforeend',UI.button({text:'Reset',variant:'quiet',size:'compact',attrs:{'class':'creator-reset-section','data-action':'reset-section','data-section':key,'aria-label':`Reset ${sectionTitle(key)}`}}));
        }
        const privacy = UI.actionRow({attrs:{'class':'creator-section-tools'},bodyHtml:UI.checkbox({label:key==='summary'?' Public summary & combat':key==='story'?' Public story & equipment':' Public',attrs:{'type':'checkbox','data-public':key,'checked':visibility[key],'disabled':external},labelAttrs:{'class':'section-public'}})});
        if (heading) heading.insertAdjacentHTML('beforeend',privacy);
        else panel.querySelector('.creator-summary-inner')?.insertAdjacentHTML('afterbegin',privacy);
      }
    }
  }

  function renderRollBody() {
    const pool = window.CharacterDice.adjustPool(rollState.base,rollState.bonuses);
    const result = rollState.result;
    const kept = result?.dice.filter(die=>die.kept).map(die=>die.total).join(' + ') || '0';
    const equation = result ? `${kept}${result.pool.bonus ? ` ${result.pool.bonus < 0 ? '−' : '+'} ${Math.abs(result.pool.bonus)}` : ''}` : '';
    return `<div class="creator-roll-fields" role="group" aria-label="Dice pool">${[['rolled','Rolled dice',''],['kept','Kept dice','k'],['bonus','Total bonus','+']].map(([key,label,separator])=>`${separator?`<span class="creator-roll-separator" aria-hidden="true">${separator}</span>`:''}${UI.stepper({value:pool[key],size:'compact',attrs:{'aria-label':label},outputAttrs:{'aria-label':label},decrease:{'data-action':'roll-bonus','data-roll-part':key,'data-delta':'-1','aria-label':`Decrease ${label}`,'disabled':key!=='bonus' && pool[key]===0},increase:{'data-action':'roll-bonus','data-roll-part':key,'data-delta':'1','aria-label':`Increase ${label}`}})}`).join('')}</div>${UI.actionRow({attrs:{'class':'creator-roll-actions'},bodyHtml:`${UI.button({text:'Roll',attrs:{'class':'creator-primary','data-action':'roll-dice'}})}${UI.button({text:'Reset bonuses',variant:'secondary',attrs:{'data-action':'reset-roll-bonuses'}})}`})}<div class="creator-roll-result" aria-live="polite" aria-atomic="true">${result?`<ol class="creator-roll-dice">${result.dice.map((die,index)=>`<li class="${die.kept?'kept':'discarded'}" aria-label="Die ${index+1}: ${die.total}, ${die.kept?'kept':'discarded'}"><strong>${die.total}</strong><span>${die.kept?'Kept':'Discarded'}</span>${die.faces.length>1 || die.rerolled?`<small>${die.rerolled?'1 → ':''}${die.faces.join(' + ')}</small>`:''}</li>`).join('')}</ol><div class="creator-roll-total"><span>${equation} =</span><strong>${result.total}</strong></div>`:''}</div>`;
  }

  function renderRollDialog() {
    return UI.dialog({title:rollState.title,titleId:'roll-dialog-title',attrs:{class:'creator-roll-dialog'},bodyClass:'creator-roll-dialog-body',bodyHtml:renderRollBody(),footerHtml:UI.button({text:'Close',variant:'secondary',attrs:{'data-action':'close-roll','aria-label':'Close roll'}})});
  }

  function refreshRollDialog(button) {
    const body = root.querySelector('.creator-roll-dialog-body');
    body.innerHTML = renderRollBody();
    Array.from(body.querySelectorAll('[data-action]')).find(target=>target.dataset.action===button.dataset.action && target.dataset.rollPart===button.dataset.rollPart && target.dataset.delta===button.dataset.delta)?.focus();
  }

  function closeRoll() {
    const trigger = rollState.trigger;
    rollState = null;
    render();
    Array.from(root.querySelectorAll('[data-action="open-roll"]')).find(button=>button.dataset.rollKind===trigger.kind && button.dataset.rollName===trigger.name && button.dataset.rollSkill===trigger.skill && button.getAttribute('aria-label')===trigger.label)?.focus();
  }

  function handleRollAction(action,button) {
    if (action === 'open-roll') {
      const kind = button.dataset.rollKind, name = button.dataset.rollName;
      const data = build();
      let base, title, explodes = true;
      if (kind === 'initiative') {
        base = data.combat.initiativeBase;
        title = 'Initiative';
      } else if (kind === 'ring' || kind === 'trait') {
        const rank = kind === 'ring' ? data.rings[name] : data.traits[name]?.rank;
        if (!rank) return true;
        base = {rolled:rank,kept:rank,bonus:0};
        title = `${name} · ${kind === 'ring'?'Ring':'Trait'}`;
      } else {
        const skillName = kind === 'emphasis' ? button.dataset.rollSkill : name;
        const skill = data.skills[skillName] || R.calculate(sheet,catalog,{untrainedSkills:skillOptions().untrainedSkills}).skills[skillName];
        if (!skill?.roll || (kind === 'emphasis' && !skill.emphases.includes(name))) return true;
        base = skill.rollBase || skill.roll;
        explodes = skill.rank > 0;
        title = kind === 'emphasis' ? `${skillName} · ${name}` : skillName;
      }
      rollState = {base,title,explodes,emphasis:kind==='emphasis',bonuses:{rolled:0,kept:0,bonus:0},trigger:{kind,name,skill:button.dataset.rollSkill,label:button.getAttribute('aria-label')}};
      rollState.result = window.CharacterDice.roll(window.CharacterDice.adjustPool(base),rollState);
      render();
      return true;
    }
    if (!['close-roll','roll-bonus','reset-roll-bonuses','roll-dice'].includes(action)) return false;
    if (!rollState) return true;
    if (action === 'close-roll') { closeRoll(); return true; }
    if (action === 'roll-bonus') {
      const part = button.dataset.rollPart;
      if (!Object.hasOwn(rollState.bonuses,part)) return true;
      rollState.bonuses[part] += Number(button.dataset.delta);
    } else if (action === 'reset-roll-bonuses') {
      rollState.bonuses = {rolled:0,kept:0,bonus:0};
      rollState.result = null;
    } else rollState.result = window.CharacterDice.roll(window.CharacterDice.adjustPool(rollState.base,rollState.bonuses),rollState);
    refreshRollDialog(button);
    return true;
  }

  function closeEmphases() {
    const name = emphasisSkill;
    emphasisSkill = '';
    render();
    root.querySelector(`[data-action="open-emphases"][data-skill-view="${emphasisView}"][data-skill=${JSON.stringify(name)}]`)?.focus();
  }

  function onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (handleRollAction(action,button)) return;
    if (action === 'xp-award-step') {
      const delta=Number(button.dataset.delta), next=xpAward+delta;
      if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(next)) return;
      xpAward=next; render();
      root.querySelector(`[data-action="xp-award-step"][data-delta="${delta}"]`)?.focus();
      return;
    }
    if (action === 'open-emphases') {
      if (!build().skills[button.dataset.skill]?.rank) return;
      emphasisSkill = button.dataset.skill; emphasisView = button.dataset.skillView; uiError = ''; render(); return;
    }
    if (action === 'close-emphases') { closeEmphases(); return; }
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
      const value=Math.max(0,(Number(entry.cost)||0)+Number(button.dataset.delta));
      onChange({target:{dataset:{kind,index:button.dataset.index},value:String(value)}});
      return;
    } else if (action === 'heal-wounds') {
      sheet.woundsTaken=Math.max(0,(Number(sheet.woundsTaken)||0)-Math.max(0,Number(build().combat.healing)||0));
    } else if (action === 'money-step') {
      const key=button.dataset.field, delta=Number(button.dataset.delta);
      if (!['koku','bu','zeni'].includes(key) || !Number.isInteger(delta)) return;
      sheet.money ||= {...build().money};
      sheet.money[key]=Math.max(0,(Number(sheet.money[key]) || 0)+delta);
    } else if (action === 'number-step') {
      const key=button.dataset.field, config=numericFields[key];
      if(!config)return;
      const value=Number(build()[key] ?? sheet[key]) || 0;
      const bonus=key==='status'?value-(Number(sheet.status)||0):0;
      sheet[key]=Math.round((Math.max(config.min,Math.min(config.max ?? Infinity,Math.round((value+Number(button.dataset.delta)*config.step)*10)/10))-bonus)*10)/10;
    } else if (action === 'trait') {
      const trait = button.dataset.trait, current = build().traits[trait];
      if (Number(button.dataset.delta) > 0) sheet.traitBuys[trait] = (Number(sheet.traitBuys[trait]) || 0) + 1;
      if (Number(button.dataset.delta) < 0 && current.rank > current.base) sheet.traitBuys[trait] = Math.max(0,(Number(sheet.traitBuys[trait]) || 0) - 1);
    } else if (action === 'skill') {
      const name = button.dataset.skill, current = build().skills[name];
      if (!current) return;
      if (Number(button.dataset.delta) > 0) sheet.skills[name] = current.rank + 1;
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
      const id=newId();sheet[kind === 'advantage' ? 'advantages' : 'disadvantages'].push({id,name,baseCost:choice.costs[0] || 0,cost:choice.costs[0] || 0});
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
    commitEdit();
  }

  function onChange(event) {
    if (event.target.dataset.hideZeroCategory !== undefined) {
      const category = event.target.dataset.hideZeroCategory;
      if (!SKILL_FILTER_CATEGORIES.some(name=>name.toLowerCase()===category)) return;
      if (event.target.checked) hiddenZeroSkillCategories.add(category);
      else hiddenZeroSkillCategories.delete(category);
      try { localStorage.setItem(SKILL_CATEGORY_FILTER_KEY,JSON.stringify([...hiddenZeroSkillCategories])); } catch {}
      render(); return;
    }
    if (event.target.dataset.hideZeroSkills !== undefined) {
      hideRankZeroSkills = event.target.checked;
      try { localStorage.setItem(SKILL_FILTER_KEY,String(hideRankZeroSkills)); } catch {}
      render(); return;
    }
    uiError = '';
    if (handleExtendedChange(event)) return;
    if (event.target.dataset.public) {
      if (external) return;
      sheet.visibility = {...window.SheetSharing.visibility(sheet),[event.target.dataset.public]:event.target.checked}; save(); render(); return;
    }
    const field = event.target.dataset.field;
    if (field === 'clan') { sheet.clan = event.target.value; sheet.family = ''; sheet.familyTrait = ''; sheet.school = ''; sheet.schoolChoices = []; sheet.equipmentChoices = []; sheet.status = sheet.clan === 'Ronin' ? 0 : 1; }
    else if (field === 'family') { sheet.family = event.target.value; sheet.familyTrait = ''; }
    else if (field === 'familyTrait') sheet.familyTrait = selectedFamily()?.traitOptions?.includes(event.target.value) ? event.target.value : '';
    else if (field === 'school') { sheet.disadvantages=sheet.disadvantages.filter(a=>!a.grantSchool || a.grantSchool!==sheet.school); sheet.school = event.target.value; sheet.schoolChoices = []; sheet.equipmentChoices = []; sheet.money = null;sheet.honor = null; const selected=C.school(sheet.school,catalog); if(selected?.brotherhood) sheet.status=0; if(/Shinmaki/i.test(selected?.name || '') && !sheet.disadvantages.some(a=>a.name==='Disturbing Countenance'))sheet.disadvantages.push({id:newId(),name:'Disturbing Countenance',cost:0,free:true,grantSchool:sheet.school}); }
    else if(field==='startingXP'){if(event.target.value.trim()===''){render();return;}sheet.startingXP=Math.max(0,Math.floor(Number(event.target.value)||0));}
    else if (['status','glory','honor','taint','woundsTaken'].includes(field)) sheet[field] = Math.max(0, Number(event.target.value) || 0);
    else if (event.target.dataset.skillTrait !== undefined) {
      const name = event.target.dataset.skillTrait;
      if (TRAIT_NAMES.includes(event.target.value)) sheet.skillTraits[name] = event.target.value;
      else delete sheet.skillTraits[name];
    }
    else if (event.target.dataset.choiceIndex !== undefined) sheet.schoolChoices[Number(event.target.dataset.choiceIndex)] = event.target.value.trim();
    else if (event.target.dataset.equipmentChoice !== undefined) sheet.equipmentChoices[Number(event.target.dataset.equipmentChoice)] = event.target.value.trim();
    else if(event.target.dataset.optionDetail){const collection=event.target.dataset.optionDetail==='advantage'?sheet.advantages:sheet.disadvantages;const entry=collection[Number(event.target.dataset.index)];if(entry){entry.selection=event.target.value;if(R.optionVariants[entry.name])delete entry.customCost;commitEdit();return;}}
    else if (event.target.dataset.kind) {
      const collection = event.target.dataset.kind === 'advantage' ? sheet.advantages : sheet.disadvantages;
      const entry = collection[Number(event.target.dataset.index)];
      if (entry) { entry.customCost=Math.max(0,Number(event.target.value)||0);commitEdit();return; }
    } else return;
    commitEdit();
  }

  function onInput(event) {
    const kind=event.target.dataset.optionSearch;
    if(kind){const select=root.querySelector('#'+kind+'-select');for(const option of select.options)option.hidden=!!option.value && !option.textContent.toLowerCase().includes(event.target.value.toLowerCase());return;}
    if(event.target.dataset.optionDetail){if(event.target.tagName==='SELECT')return;const collection=event.target.dataset.optionDetail==='advantage'?sheet.advantages:sheet.disadvantages;const entry=collection[Number(event.target.dataset.index)];if(entry){entry.selection=event.target.value;save();}return;}
    const field = event.target.dataset.field;
    if (!['name','concept','notes','heritage'].includes(field)) return;
    sheet[field] = event.target.value;
    save();
    root.querySelector('.creator-print-sheet').outerHTML = renderPrintSheet(build());
  }

  async function mount(element, shared = null) {
    hideRankZeroSkills = true;
    try { hideRankZeroSkills = localStorage.getItem(SKILL_FILTER_KEY) !== 'false'; } catch {}
    hiddenZeroSkillCategories = new Set(SKILL_FILTER_CATEGORIES.map(category=>category.toLowerCase()));
    try {
      const saved = JSON.parse(localStorage.getItem(SKILL_CATEGORY_FILTER_KEY));
      if (Array.isArray(saved)) hiddenZeroSkillCategories = new Set(saved.filter(category=>SKILL_FILTER_CATEGORIES.some(name=>name.toLowerCase()===category)));
    } catch {}
    external = shared;
    emphasisSkill = '';
    rollState = null;
    xpAward = 0;
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
    if (root?.isConnected && editorRoute()) {
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
