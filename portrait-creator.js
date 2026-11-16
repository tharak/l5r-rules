/* Portrait creator: players pick gender, age, body type and layers (outfit,
 * hair, background…) and the page stacks the matching images into a square
 * picture, like a game character creator. Which layers exist, and which file
 * each one uses for each gender/age/body combination, comes entirely from
 * public/assets/portrait-creator/manifest.json, so new art needs no code.
 * The pure helpers at the top have no DOM access and are unit-tested. */
(() => {
  const ROOT = 'public/assets/portrait-creator/';
  const ATTRIBUTES = ['gender','age','body'];
  const ID = /^[a-z0-9_-]{1,40}$/;
  const KEY = /^(\*|[a-z0-9_-]+)\/(\*|[a-z0-9_-]+)\/(\*|[a-z0-9_-]+)$/;
  // Layer files stay inside the manifest folder: same origin, never a URL.
  const PATH = /^layers\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\.(?:png|webp|svg)$/;

  function validateManifest(m) {
    const errors = [], fail = message => errors.push(message);
    if (!m || typeof m !== 'object') return ['Manifest is not an object'];
    if (m.version !== 1) fail('version must be 1');
    if (!Number.isInteger(m.canvas) || m.canvas < 64 || m.canvas > 2048) fail('canvas must be an integer from 64 to 2048');
    const ids = {};
    for (const name of ATTRIBUTES) {
      const list = m.attributes?.[name];
      if (!Array.isArray(list) || !list.length) { fail(`attributes.${name} must be a non-empty list`); continue; }
      ids[name] = new Set();
      for (const item of list) {
        if (!ID.test(item?.id || '') || typeof item.label !== 'string') fail(`attributes.${name} has an invalid entry`);
        else if (ids[name].has(item.id)) fail(`attributes.${name} repeats ${item.id}`);
        else ids[name].add(item.id);
      }
    }
    const checkMap = (map,where,check) => {
      if (!map || typeof map !== 'object' || Array.isArray(map) || !Object.keys(map).length) { fail(`${where} must map gender/age/body keys`); return; }
      for (const [key,value] of Object.entries(map)) {
        const parts = key.match(KEY);
        if (!parts) { fail(`${where} key ${key} is not gender/age/body`); continue; }
        ATTRIBUTES.forEach((name,i) => { if (parts[i+1] !== '*' && ids[name] && !ids[name].has(parts[i+1])) fail(`${where} key ${key} uses unknown ${name} ${parts[i+1]}`); });
        check(value,`${where}[${key}]`);
      }
    };
    if (!Array.isArray(m.slots) || !m.slots.length) fail('slots must be a non-empty list');
    const slotIds = new Set();
    for (const slot of m.slots || []) {
      if (!ID.test(slot?.id || '') || slotIds.has(slot.id)) { fail(`slot ${slot?.id} has a missing or repeated id`); continue; }
      slotIds.add(slot.id);
      if (slot.label !== null && typeof slot.label !== 'string') fail(`slot ${slot.id} label must be text or null`);
      if (!Array.isArray(slot.options) || !slot.options.length) { fail(`slot ${slot.id} needs options`); continue; }
      const optionIds = new Set();
      for (const option of slot.options) {
        if (!ID.test(option?.id || '') || option.id === 'none' || optionIds.has(option.id)) { fail(`slot ${slot.id} has an invalid or repeated option id`); continue; }
        optionIds.add(option.id);
        if (typeof option.label !== 'string') fail(`${slot.id}.${option.id} needs a label`);
        checkMap(option.files,`${slot.id}.${option.id}.files`,(value,where) => { if (typeof value !== 'string' || !PATH.test(value) || value.includes('..')) fail(`${where} must be a layers/… .png, .webp or .svg path`); });
      }
    }
    if (m.mon !== undefined) checkMap(m.mon,'mon',(value,where) => {
      const ok = value && ['x','y','size'].every(k => Number.isFinite(value[k])) && value.size > 0 && (value.opacity === undefined || (value.opacity >= 0 && value.opacity <= 1));
      if (!ok) fail(`${where} needs numeric x, y, size and an optional opacity from 0 to 1`);
    });
    return errors;
  }

  // The most specific key wins (fewest wildcards); ties go to the first listed.
  function resolve(map,attrs) {
    let best = null, bestScore = -1;
    for (const [key,value] of Object.entries(map || {})) {
      const parts = key.split('/');
      if (!ATTRIBUTES.every((name,i) => parts[i] === '*' || parts[i] === attrs[name])) continue;
      const score = parts.filter(part => part !== '*').length;
      if (score > bestScore) { best = value; bestScore = score; }
    }
    return best;
  }

  const pickable = slot => slot.label !== null;
  const availableOptions = (manifest,slot,attrs) => slot.options.filter(option => resolve(option.files,attrs));

  // Fill defaults and drop anything the manifest does not offer for these attributes.
  function normalizeRecipe(manifest,recipe = {}) {
    const next = {layers:{},mon:recipe?.mon !== false};
    for (const name of ATTRIBUTES) {
      const list = manifest.attributes[name];
      // Default to the middle choice: Male, Adult, Average with the shipped manifest.
      next[name] = list.some(item => item.id === recipe?.[name]) ? recipe[name] : list[Math.floor((list.length-1)/2)].id;
    }
    for (const slot of manifest.slots) {
      const options = availableOptions(manifest,slot,next), wanted = recipe?.layers?.[slot.id];
      if (!pickable(slot)) { if (options[0]) next.layers[slot.id] = options[0].id; continue; }
      if (wanted === 'none' && !slot.required) next.layers[slot.id] = 'none';
      else if (options.some(option => option.id === wanted)) next.layers[slot.id] = wanted;
      else next.layers[slot.id] = options[0]?.id || 'none';
    }
    return next;
  }

  // Ordered files to draw, bottom first.
  function layerStack(manifest,recipe) {
    return manifest.slots.flatMap(slot => {
      const option = slot.options.find(item => item.id === recipe.layers[slot.id]);
      const file = option && resolve(option.files,recipe);
      return file ? [{slot:slot.id,option:option.id,file}] : [];
    });
  }

  const monPlacement = (manifest,recipe) => recipe.mon ? resolve(manifest.mon,recipe) : null;

  function randomRecipe(manifest,random = Math.random) {
    const pick = list => list[Math.floor(random()*list.length)];
    const recipe = {layers:{},mon:true};
    for (const name of ATTRIBUTES) recipe[name] = pick(manifest.attributes[name]).id;
    for (const slot of manifest.slots.filter(pickable)) {
      const ids = availableOptions(manifest,slot,recipe).map(option => option.id);
      recipe.layers[slot.id] = pick(slot.required || !ids.length ? ids.length ? ids : ['none'] : [...ids,'none']);
    }
    return normalizeRecipe(manifest,recipe);
  }

  const api = {ROOT,ATTRIBUTES,validateManifest,resolve,availableOptions,normalizeRecipe,layerStack,monPlacement,randomRecipe};
  const scope = globalThis.window || globalThis;
  scope.PortraitCreator = api;
  if (typeof document === 'undefined') return;

  /* ---- Page ---- */
  const UI = window.UI;
  const LABELS = {gender:'Gender',age:'Age',body:'Body type'};
  let manifestPromise = null, manifest = null, loadError = '';
  let request = null, recipe = null, root = null, target = '', status = '';
  const images = new Map();

  const loadManifest = () => manifestPromise ||= fetch(ROOT+'manifest.json').then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }).then(data => {
    const errors = validateManifest(data);
    if (errors.length) throw new Error(errors.join('; '));
    return data;
  });
  function image(file) {
    if (!images.has(file)) images.set(file,new Promise((resolve,reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Missing layer ${file}`));
      img.src = file.startsWith('public/') ? file : ROOT+file;
    }));
    return images.get(file);
  }

  // Draw every chosen layer, then the clan mon, onto a square canvas.
  async function draw(canvas,data,current,clan) {
    const size = data.canvas, context = canvas.getContext('2d');
    canvas.width = canvas.height = size;
    const stack = layerStack(data,current);
    const mon = window.CharacterCatalog?.clanMon(clan || '');
    const placement = mon && monPlacement(data,current);
    const loaded = await Promise.all([...stack.map(layer => image(layer.file)),placement ? image(mon) : null]);
    context.clearRect(0,0,size,size);
    context.fillStyle = '#efe2c6'; context.fillRect(0,0,size,size);
    stack.forEach((layer,index) => context.drawImage(loaded[index],0,0,size,size));
    if (placement) {
      context.globalAlpha = placement.opacity ?? 0.9;
      context.drawImage(loaded[stack.length],placement.x-placement.size/2,placement.y-placement.size/2,placement.size,placement.size);
      context.globalAlpha = 1;
    }
  }

  // Start the creator for one character or NPC, then come back to `returnHref`.
  function open(next) {
    request = {title:next.title || '',clan:next.clan || '',recipe:next.recipe || null,returnHref:next.returnHref || '#/characters',onUse:next.onUse};
    recipe = null; status = '';
    location.hash = '#/portrait-creator';
  }

  function controls() {
    const segments = (label,name,value,choices) => `<fieldset class="portrait-creator-field"><legend>${UI.escape(label)}</legend>${UI.choiceGroup({radio:true,label,name:`portrait-${name}`,value,attrs:{class:'creator-trait-segments'},choices:choices.map(choice => ({value:choice.id,label:choice.label,attrs:{'data-portrait-choice':name}}))})}</fieldset>`;
    const attributes = ATTRIBUTES.map(name => segments(LABELS[name],name,recipe[name],manifest.attributes[name])).join('');
    const slots = manifest.slots.filter(pickable).map(slot => {
      const choices = availableOptions(manifest,slot,recipe).map(option => ({id:option.id,label:option.label}));
      if (!slot.required) choices.push({id:'none',label:'None'});
      return choices.length ? segments(slot.label,`layer-${slot.id}`,recipe.layers[slot.id],choices) : '';
    }).join('');
    const clan = request?.clan || window.CharacterBuilder?.list().find(c => c.id === target)?.clan || '';
    const mon = window.CharacterCatalog?.clanMon(clan) && manifest.mon ? UI.checkbox({label:`Show the ${clan} Clan mon`,attrs:{type:'checkbox','data-portrait-mon':true,checked:recipe.mon},labelAttrs:{class:'creator-check'}}) : '';
    const characters = window.CharacterBuilder?.list() || [];
    const saveTo = request ? '' : UI.field({label:'Save to',kind:'select',attrs:{'data-portrait-target':true},optionsHtml:`${UI.option({value:'',label:characters.length?'Choose a character':'No characters yet',selected:!target})}${characters.map(c => UI.option({value:c.id,label:c.name || 'Unnamed PC',selected:c.id===target})).join('')}`});
    return `${attributes}${slots}${mon}${saveTo}${status?`<p class="portrait-creator-status" role="alert">${UI.escape(status)}</p>`:''}${UI.actionRow({attrs:{class:'portrait-creator-actions'},bodyHtml:`${UI.button({text:'Randomize',variant:'secondary',attrs:{'data-portrait-action':'random'}})}${UI.button({text:'Cancel',variant:'secondary',attrs:{'data-portrait-action':'cancel'}})}${UI.button({text:'Use picture',attrs:{'data-portrait-action':'use',disabled:!request && !target}})}`})}`;
  }

  function page() {
    const heading = UI.sectionHeading({title:'Portrait creator',level:1,description:request?.title ? `Picture for ${request.title}` : 'Build a picture from ready-made layers.'});
    if (loadError) return `<div class="workspace portrait-creator">${heading}<p class="portrait-creator-status" role="alert">The portrait layers could not be loaded: ${UI.escape(loadError)}</p></div>`;
    if (!manifest) return `<div class="workspace portrait-creator">${heading}<p>Loading layers…</p></div>`;
    const note = manifest.placeholder ? '<p class="portrait-creator-note">Placeholder art: these simple layers will be replaced by illustrated ones.</p>' : '';
    return `<div class="workspace portrait-creator">${heading}${note}<div class="portrait-creator-grid"><div class="portrait-creator-preview"><canvas class="portrait-creator-canvas" width="${manifest.canvas}" height="${manifest.canvas}" role="img" aria-label="Preview of the picture"></canvas></div><div class="portrait-creator-options">${controls()}</div></div></div>`;
  }

  let drawing = 0;
  function redraw() {
    const canvas = root?.querySelector('.portrait-creator-canvas');
    if (!canvas) return;
    const run = ++drawing, clan = request?.clan || window.CharacterBuilder?.list().find(c => c.id === target)?.clan || '';
    // Draw off-screen and copy, so a slow image never shows a half-built picture.
    const buffer = document.createElement('canvas');
    draw(buffer,manifest,recipe,clan).then(() => {
      if (run !== drawing) return;
      canvas.width = canvas.height = buffer.width;
      canvas.getContext('2d').drawImage(buffer,0,0);
    }).catch(error => { status = error.message; renderControls(); });
  }
  function renderControls() {
    const panel = root?.querySelector('.portrait-creator-options');
    if (!panel) return;
    const focused = document.activeElement, key = focused?.name ? `[name="${focused.name}"][value="${focused.value}"]` : focused?.dataset?.portraitAction ? `[data-portrait-action="${focused.dataset.portraitAction}"]` : focused?.dataset?.portraitMon !== undefined ? '[data-portrait-mon]' : '';
    panel.innerHTML = controls();
    if (key) panel.querySelector(key)?.focus();
  }
  function renderAll() { if (!root) return; root.innerHTML = page(); if (manifest) redraw(); }

  async function finish(use) {
    const back = request?.returnHref || '#/characters', current = request;
    if (use) {
      const canvas = document.createElement('canvas');
      const clan = current?.clan || window.CharacterBuilder?.list().find(c => c.id === target)?.clan || '';
      try {
        await draw(canvas,manifest,recipe,clan);
        const picture = UI.encodePortrait(canvas);
        if (current) current.onUse?.(picture,structuredClone(recipe));
        else if (!window.CharacterBuilder?.setPortrait(target,picture,structuredClone(recipe))) throw new Error('Choose a character to save the picture to.');
      } catch (error) { status = error.message; renderControls(); return; }
    }
    request = null; recipe = null; target = '';
    location.hash = current ? back : '#/characters';
  }

  function mount(element) {
    root = element; status = '';
    // The manifest loads asynchronously; never draw over a page the player has left.
    const stillHere = () => root === element && location.hash.split('#')[1] === '/portrait-creator';
    root.onclick = event => {
      const action = event.target.closest('[data-portrait-action]')?.dataset.portraitAction;
      if (!action || !manifest) return;
      if (action === 'random') { recipe = randomRecipe(manifest); renderControls(); redraw(); }
      else finish(action === 'use');
    };
    root.onchange = event => {
      const data = event.target.dataset;
      if (!manifest || !recipe) return;
      if (data.portraitChoice) {
        const name = data.portraitChoice;
        if (name.startsWith('layer-')) recipe.layers[name.slice(6)] = event.target.value;
        else recipe[name] = event.target.value;
        recipe = normalizeRecipe(manifest,recipe);
      } else if (data.portraitMon !== undefined) recipe.mon = event.target.checked;
      else if (data.portraitTarget !== undefined) target = event.target.value;
      else return;
      status = '';
      renderControls(); redraw();
    };
    root.oninput = null;
    if (manifest) recipe ||= normalizeRecipe(manifest,request?.recipe || {});
    renderAll();
    loadManifest().then(data => {
      manifest = data; loadError = '';
      recipe ||= normalizeRecipe(manifest,request?.recipe || {});
      if (stillHere()) renderAll();
    }).catch(error => { loadError = error.message; manifestPromise = null; if (stillHere()) renderAll(); });
  }

  Object.assign(api,{open,mount,draw,loadManifest});
})();
