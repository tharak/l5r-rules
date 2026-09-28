(() => {
  const STORAGE_KEY = 'last-haiku-character-v1';
  const TRAIT_GROUPS = [
    {ring:'Air', mark:'風', traits:['Reflexes','Awareness']},
    {ring:'Earth', mark:'地', traits:['Stamina','Willpower']},
    {ring:'Fire', mark:'火', traits:['Agility','Intelligence']},
    {ring:'Water', mark:'水', traits:['Strength','Perception']},
    {ring:'Void', mark:'空', traits:['Void']}
  ];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const blank = () => ({name:'', clan:'', family:'', school:'', concept:'', notes:'', traitBuys:{}, skills:{}, schoolChoices:[], advantages:[], disadvantages:[], purchases:[], status:1, glory:1});
  let catalog, catalogPromise, sheet, root;

  function loadSheet() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return stored && typeof stored === 'object' ? {...blank(),...stored,
        traitBuys:stored.traitBuys || {}, skills:stored.skills || {}, schoolChoices:stored.schoolChoices || [],
        advantages:stored.advantages || [], disadvantages:stored.disadvantages || [], purchases:stored.purchases || []} : blank();
    } catch { return blank(); }
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet)); } catch {} }
  function selectedClan() { return catalog.clans.find(clan => clan.name === sheet.clan); }
  function selectedFamily() { return selectedClan()?.families.find(family => family.name === sheet.family); }
  function selectedSchool() { return selectedClan()?.schools.find(school => `${school.slug}#${school.anchor}` === sheet.school); }
  function sourceLink(slug, anchor = '') { return `#/${encodeURIComponent(slug)}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`; }
  function purchasedRankCost(base, rank, multiplier = 1) {
    let cost = 0;
    for (let next = base + 1; next <= rank; next++) cost += next * multiplier;
    return cost;
  }
  function schoolSkills(school) {
    const result = {};
    for (const skill of school?.skills || []) result[skill.name] = Math.max(result[skill.name] || 0, skill.rank);
    if (school) for (const name of sheet.schoolChoices || []) if (name?.trim()) result[name.trim()] = Math.max(result[name.trim()] || 0, 1);
    return result;
  }
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
    const starting = schoolSkills(school), skills = {};
    for (const name of new Set([...Object.keys(starting), ...Object.keys(sheet.skills || {})])) {
      const base = starting[name] || 0;
      const rank = Math.min(4, Math.max(base, Number(sheet.skills?.[name]) || 0));
      if (rank) skills[name] = {base, rank, cost:purchasedRankCost(base, rank)};
    }
    const advantageCost = (sheet.advantages || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.cost) || 0), 0);
    const disadvantageTotal = (sheet.disadvantages || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.cost) || 0), 0);
    const purchaseCost = (sheet.purchases || []).reduce((sum, entry) => sum + Math.max(0, Number(entry.cost) || 0), 0);
    const roninFamilyCost = sheet.clan === 'Ronin' && family ? 5 : 0;
    const xpSpent = Object.values(traitCosts).reduce((a,b) => a+b,0) + Object.values(skills).reduce((sum,skill) => sum + skill.cost,0) + advantageCost + purchaseCost + roninFamilyCost;
    const xpEarned = Math.min(10, disadvantageTotal);
    const insight = Object.values(rings).reduce((a,b) => a+b,0) * 10 + Object.values(skills).reduce((sum,skill) => sum + skill.rank,0);
    const insightRank = insight < 150 ? 1 : insight <= 174 ? 2 : insight <= 199 ? 3 : insight <= 224 ? 4 : insight <= 250 ? 5 : 6 + Math.floor((insight - 251) / 25);
    return {family, school, traits, rings, traitCosts, skills, xpSpent, xpEarned, xpRemaining:40 + xpEarned - xpSpent, disadvantageTotal, roninFamilyCost, insight, insightRank};
  }
  const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  function renderIdentity(data) {
    const clan = selectedClan();
    const clanOptions = ['Great Clans','Minor Clans','Other'].map(group => `<optgroup label="${group}">${catalog.clans.filter(clan => clan.group === group).map(clan => option(clan.name, clan.name, clan.name === sheet.clan)).join('')}</optgroup>`).join('');
    const familyOptions = (clan?.families || []).map(family => option(family.name, `${family.name} · +1 ${family.trait}`, family.name === sheet.family)).join('');
    const schoolOptions = (clan?.schools || []).map(school => option(`${school.slug}#${school.anchor}`, `${school.name}${school.benefit ? ` · +1 ${school.benefit}` : ''}`, `${school.slug}#${school.anchor}` === sheet.school)).join('');
    return `<section class="creator-panel" id="creator-identity"><div class="creator-panel-head"><span class="creator-step">01</span><div><h2>Identity & training</h2><p>Choose a clan, family, and starting school.</p></div></div><div class="creator-fields"><label>Character name<input data-field="name" type="text" value="${escapeHtml(sheet.name)}" placeholder="Your character’s name"></label><label>Clan<select data-field="clan">${option('', 'Choose a clan', !sheet.clan)}${clanOptions}</select></label><label>Family<select data-field="family" ${clan ? '' : 'disabled'}>${option('', 'Choose a family', !sheet.family)}${familyOptions}</select></label><label>School<select data-field="school" ${clan ? '' : 'disabled'}>${option('', clan?.schools.length ? 'Choose a school' : 'No starting school listed', !sheet.school)}${schoolOptions}</select></label></div><div class="creator-bonuses"><div><small>FAMILY BENEFIT</small><strong>${data.family ? `+1 ${escapeHtml(data.family.trait)}` : 'Choose a family'}</strong>${data.family ? `<a href="${sourceLink(data.family.slug,data.family.anchor)}">View family ↗</a>` : ''}</div><div><small>SCHOOL BENEFIT</small><strong>${data.school?.benefit ? `+1 ${escapeHtml(data.school.benefit)}` : 'Choose a school'}</strong>${data.school ? `<a href="${sourceLink(data.school.slug,data.school.anchor)}">View school ↗</a>` : ''}</div></div>${data.school ? `<div class="creator-school-note"><strong>Starting school</strong><p><b>Honor:</b> ${data.school.honor ?? 'See school'} · <b>Skills:</b> ${escapeHtml(data.school.skillsRaw || 'See school')}</p>${data.school.choices.length ? `<p><b>Choose:</b> ${escapeHtml(data.school.choices.join('; '))}. Add your chosen skill below.</p>` : ''}<p><b>Outfit:</b> ${escapeHtml(data.school.outfit || 'See school description')}</p></div>` : ''}<p class="creator-rule">Imperial families require GM approval in the source rules. Selecting a Ronin family adds its required 5 XP cost automatically.</p></section>`;
  }

  function renderTraits(data) {
    return `<section class="creator-panel" id="creator-traits"><div class="creator-panel-head"><span class="creator-step">02</span><div><h2>Rings & traits</h2><p>All Rings begin at 2. Family and school benefits are applied automatically.</p></div></div><div class="creator-ring-grid">${TRAIT_GROUPS.map(group => `<div class="creator-ring"><div class="creator-ring-head"><span class="creator-ring-mark">${group.mark}</span><div><strong>${group.ring}</strong><small>${group.ring === 'Void' ? 'Void Points' : group.traits.join(' · ')}</small></div><b>${data.rings[group.ring]}</b></div>${group.traits.map(trait => { const item = data.traits[trait], next = item.rank + 1, cost = next * (trait === 'Void' ? 6 : 4); return `<div class="creator-rank-row"><span><strong>${trait}</strong><small>Base ${item.base}${data.traitCosts[trait] ? ` · ${data.traitCosts[trait]} XP spent` : ''}</small></span><div class="rank-control"><button type="button" data-action="trait" data-trait="${trait}" data-delta="-1" ${item.rank <= item.base ? 'disabled' : ''} aria-label="Decrease ${trait}">−</button><b>${item.rank}</b><button type="button" data-action="trait" data-trait="${trait}" data-delta="1" ${item.rank >= 4 ? 'disabled' : ''} aria-label="Increase ${trait} for ${cost} XP">+</button></div></div>`; }).join('')}</div>`).join('')}</div><p class="creator-rule">A Trait costs 4 × its new rank in XP. Void costs 6 × its new rank. Starting ranks cannot exceed 4.</p></section>`;
  }

  function renderSkills(data) {
    const names = Object.keys(data.skills).sort((a,b) => a.localeCompare(b));
    const suggestions = [...new Set(catalog.skills.map(skill => skill.name))].sort((a,b) => a.localeCompare(b));
    const choices = (data.school?.choices || []).flatMap(prompt => Array.from({length:/\bthree\b/i.test(prompt) ? 3 : /\btwo\b/i.test(prompt) ? 2 : 1}, () => prompt));
    return `<section class="creator-panel" id="creator-skills"><div class="creator-panel-head"><span class="creator-step">03</span><div><h2>Skills</h2><p>School skills start at their granted rank. Add other skills as needed.</p></div></div>${choices.length ? `<div class="creator-choice-grid">${choices.map((prompt,index) => `<label>${escapeHtml(prompt)}<input type="text" data-choice-index="${index}" list="skill-suggestions" value="${escapeHtml(sheet.schoolChoices[index] || '')}" placeholder="Choose a school skill"></label>`).join('')}</div>` : ''}<div class="creator-add-row"><input id="new-skill" type="text" list="skill-suggestions" placeholder="Add a skill, e.g. Courtier or Lore: History"><datalist id="skill-suggestions">${suggestions.map(name => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist><button type="button" data-action="add-skill">Add skill</button></div>${names.length ? `<div class="creator-skill-list">${names.map(name => { const skill = data.skills[name]; return `<div class="creator-skill-row"><div><strong>${escapeHtml(name)}</strong><small>${skill.base ? `School rank ${skill.base}` : 'Purchased skill'}${skill.cost ? ` · ${skill.cost} XP spent` : ''}</small></div><div class="rank-control"><button type="button" data-action="skill" data-skill="${escapeHtml(name)}" data-delta="-1" ${skill.rank <= skill.base ? 'disabled' : ''} aria-label="Decrease ${escapeHtml(name)}">−</button><b>${skill.rank}</b><button type="button" data-action="skill" data-skill="${escapeHtml(name)}" data-delta="1" ${skill.rank >= 4 ? 'disabled' : ''} aria-label="Increase ${escapeHtml(name)} for ${skill.rank + 1} XP">+</button></div></div>`; }).join('')}</div>` : '<div class="creator-empty">Choose a school or add a skill to begin.</div>'}<p class="creator-rule">A Skill costs XP equal to its new rank. A new Skill at Rank 1 costs 1 XP. Starting ranks cannot exceed 4.</p></section>`;
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

  function renderStory() {
    return `<section class="creator-panel" id="creator-story"><div class="creator-panel-head"><span class="creator-step">05</span><div><h2>Story & equipment</h2><p>Record your role in the Empire and any remaining choices.</p></div></div><div class="creator-fields"><label>Character concept<input data-field="concept" type="text" value="${escapeHtml(sheet.concept)}" placeholder="A loyal yojimbo, an ambitious courtier…"></label><label>Status<input data-field="status" type="number" min="0" max="10" step="0.1" value="${Number(sheet.status)}"></label><label>Glory<input data-field="glory" type="number" min="0" max="10" step="0.1" value="${Number(sheet.glory)}"></label><label class="creator-wide">Notes, Heritage, and outfit<textarea data-field="notes" rows="7" placeholder="Add your heritage, equipment, and story notes here.">${escapeHtml(sheet.notes)}</textarea></label></div><div class="creator-purchases"><h3>Other XP purchases</h3><p>Use this for Emphases (2 XP), kata, kiho, or other approved purchases.</p><div class="creator-add-row"><input id="purchase-name" type="text" placeholder="Purchase name"><input id="purchase-cost" type="number" min="0" max="100" step="1" placeholder="XP"><button type="button" data-action="add-purchase">Add</button></div>${sheet.purchases.length ? `<div class="creator-option-list">${sheet.purchases.map((entry,index) => `<div class="creator-option-row"><span>${escapeHtml(entry.name)}</span><strong>${Number(entry.cost) || 0} XP</strong><button type="button" data-action="remove-purchase" data-index="${index}" aria-label="Remove ${escapeHtml(entry.name)}">×</button></div>`).join('')}</div>` : ''}</div><p class="creator-rule">For heritage and detailed background prompts, see <a href="${sourceLink('heritage')}">Heritage</a> and <a href="${sourceLink('chargen')}">Character Generation</a>.</p></section>`;
  }

  function renderSummary(data) {
    const ringList = TRAIT_GROUPS.map(group => `<div><span>${group.mark} ${group.ring}</span><strong>${data.rings[group.ring]}</strong></div>`).join('');
    return `<aside class="creator-summary"><div class="creator-summary-inner"><div class="creator-summary-seal">五</div><small class="creator-summary-kicker">YOUR CHARACTER</small><h2 id="summary-name">${escapeHtml(sheet.name || 'Unnamed samurai')}</h2><p>${escapeHtml([sheet.clan, sheet.family, data.school?.name].filter(Boolean).join(' · ') || 'Choose a clan to begin')}</p><div class="creator-xp ${data.xpRemaining < 0 ? 'over-budget' : ''}"><span>XP REMAINING</span><strong>${data.xpRemaining}</strong><small>40 starting + ${data.xpEarned} disadvantage − ${data.xpSpent} spent</small></div><div class="creator-summary-rings">${ringList}</div><div class="creator-derived"><div><span>Insight</span><strong>${data.insight}</strong></div><div><span>Insight Rank</span><strong>${data.insightRank}</strong></div><div><span>Honor</span><strong>${data.school?.honor ?? '—'}</strong></div><div><span>Status</span><strong>${Number.isFinite(Number(sheet.status)) ? Number(sheet.status) : 1}</strong></div><div><span>Glory</span><strong>${Number.isFinite(Number(sheet.glory)) ? Number(sheet.glory) : 1}</strong></div></div><div class="creator-summary-links"><a href="${sourceLink('chargen')}">Creation rules ↗</a><a href="${sourceLink('families')}">Families ↗</a></div></div></aside>`;
  }

  function render() {
    if (!root?.isConnected || !catalog || !location.hash.startsWith('#/create-character')) return;
    const data = build();
    root.innerHTML = `<div class="creator-page"><div class="creator-header"><div class="eyebrow muted"><span class="eyebrow-line"></span> BOOK OF FIRE · CHARACTER CREATION</div><div class="creator-header-row"><div><h1>Create a character</h1><p>Shape a samurai of Rokugan. Your choices are saved automatically in this browser.</p></div><div class="creator-header-actions"><button type="button" data-action="export">Export JSON ↗</button><button type="button" data-action="print">Print sheet ↗</button></div></div></div><div class="creator-layout"><div class="creator-main">${renderIdentity(data)}${renderTraits(data)}${renderSkills(data)}${renderOptions(data)}${renderStory()}<div class="creator-bottom"><span>Saved on this device</span><button type="button" data-action="reset">Start over</button></div></div>${renderSummary(data)}</div></div>`;
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
      const name = root.querySelector('#new-skill').value.trim();
      if (!name) return;
      sheet.skills[name] = Math.max(1, Number(sheet.skills[name]) || 0);
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
      if (!window.confirm('Start a new character? This clears the character saved in this browser.')) return;
      sheet = blank();
    } else return;
    save(); render();
  }

  function onChange(event) {
    const field = event.target.dataset.field;
    if (field === 'clan') { sheet.clan = event.target.value; sheet.family = ''; sheet.school = ''; sheet.schoolChoices = []; sheet.status = sheet.clan === 'Ronin' ? 0 : 1; }
    else if (field === 'family') sheet.family = event.target.value;
    else if (field === 'school') { sheet.school = event.target.value; sheet.schoolChoices = []; }
    else if (field === 'status' || field === 'glory') sheet[field] = Math.max(0, Number(event.target.value) || 0);
    else if (event.target.dataset.choiceIndex !== undefined) sheet.schoolChoices[Number(event.target.dataset.choiceIndex)] = event.target.value.trim();
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
      render();
    } catch (error) {
      root.innerHTML = '<div class="not-found"><h1>Character data unavailable</h1><p>Please refresh the page.</p></div>';
      console.error(error);
    }
  }

  window.CharacterBuilder = { mount };
})();
