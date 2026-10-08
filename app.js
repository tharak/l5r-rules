const state = { data: null, searchMatches: [], activeMatch: 0, navExpanded: new Set() };
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pageHref = slug => `#/${encodeURIComponent(slug)}`;

function currentSlug() {
  const hash = location.hash.slice(2).split('#')[0];
  try { return decodeURIComponent(hash || 'start'); } catch { return 'start'; }
}

function allNav() {
  return [...state.data.navigation, ...state.data.more];
}

function bookSections() { return state.data.navigation.filter(section => section.slug.startsWith('book-of-')); }
function isBookPage(slug) { return bookSections().some(section => section.slug === slug); }

function pageSection(slug) {
  const walk = (items, parents = []) => {
    for (const item of items) {
      if (item.slug === slug) return parents.length ? parents.join(' / ') : item.title;
      const found = walk(item.children || [], [...parents, item.title]);
      if (found) return found;
    }
    return null;
  };
  const section = walk(state.data.navigation);
  if (section) return section;
  return state.data.more.some(item => item.slug === slug) ? 'More pages' : 'The archive';
}

function headingMenu(page) {
  const document = new DOMParser().parseFromString(page.html, 'text/html');
  const roots = [], stack = [];
  [...document.querySelectorAll('h1, h2, h3')].forEach((heading, index) => {
    const level = Number(heading.tagName.slice(1));
    const node = { title: heading.textContent.trim(), slug: page.slug, anchor: heading.id || `section-${index + 1}`, children: [] };
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ level, node });
  });
  return roots;
}

function linkedPages(page) {
  const document = new DOMParser().parseFromString(page.html, 'text/html');
  const seen = new Set();
  return [...document.querySelectorAll('a[href^="#/"]')].flatMap(link => {
    const match = /^#\/([^#]+)$/.exec(link.getAttribute('href'));
    if (!match) return [];
    const slug = decodeURIComponent(match[1]);
    if (seen.has(slug) || !state.data.pages[slug]) return [];
    seen.add(slug);
    const title = link.textContent.trim();
    return [{ title: /^Page \d+$/i.test(title) ? state.data.pages[slug].title : title, slug, children: headingMenu(state.data.pages[slug]) }];
  });
}

function addDeepNavigation() {
  const earth = state.data.navigation.find(section => section.slug === 'book-of-earth');
  if (earth) earth.children = linkedPages(state.data.pages[earth.slug]);
  const fire = state.data.navigation.find(section => section.slug === 'book-of-fire');
  if (fire) {
    fire.children = linkedPages(state.data.pages[fire.slug]);
    for (const entry of fire.children) {
      if (['families', 'schools', 'skills'].includes(entry.slug)) entry.children = linkedPages(state.data.pages[entry.slug]);
    }
  }
  const water = state.data.navigation.find(section => section.slug === 'book-of-water');
  if (water) water.children = linkedPages(state.data.pages[water.slug]);
  const voidBook = state.data.navigation.find(section => section.slug === 'book-of-the-void');
  if (voidBook) {
    const existing = new Set(voidBook.children.map(entry => entry.slug));
    voidBook.children.forEach(entry => { entry.children = headingMenu(state.data.pages[entry.slug]); });
    voidBook.children.push(...linkedPages(state.data.pages[voidBook.slug]).filter(entry => !existing.has(entry.slug)));
  }
}

function navKey(entry) { return entry.anchor ? `${entry.slug}#${entry.anchor}` : entry.slug; }
function navHref(entry) { return pageHref(entry.slug) + (entry.anchor ? `#${encodeURIComponent(entry.anchor)}` : ''); }

function expandActivePath(entries, slug, fragment) {
  let found = false;
  for (const entry of entries) {
    const childActive = expandActivePath(entry.children || [], slug, fragment);
    const selfActive = entry.slug === slug && (!entry.anchor || entry.anchor === fragment);
    if ((childActive || selfActive) && entry.children?.length) state.navExpanded.add(navKey(entry));
    found ||= childActive || selfActive;
  }
  return found;
}

function renderNavigation() {
  const slug = currentSlug();
  document.querySelectorAll('#navigation a').forEach(a => {
    const selected = slug.startsWith('campaigns') || slug.startsWith('invite/') ? a.hash === '#/campaigns' : slug === 'characters' || slug.startsWith('characters/') || ['create-character','create-character-lab'].includes(slug) ? a.hash === '#/characters' : a.hash === '#/books';
    if (selected) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
}
function renderBooks() {
  const entries = items => `<ul>${items.map(item => `<li><a href="${navHref(item)}">${esc(item.title)}</a>${item.children?.length ? `<details><summary>Sections</summary>${entries(item.children)}</details>` : ''}</li>`).join('')}</ul>`;
  return `<div class="workspace"><h1>Books</h1><div class="books-grid">${bookSections().map(book => `<section class="panel"><h2>${bookMark(book.slug)}<a href="${pageHref(book.slug)}">${esc(book.title)}</a></h2>${entries(book.children)}</section>`).join('')}</div><a href="#/all-pages">All pages</a></div>`;
}

function bookMark(slug) {
  const marks = {
    'book-of-air': '<path d="M5 12h15c7 0 7-8 2-8-3 0-4 2-4 3M5 17h23M5 22h13c7 0 7 8 2 8-3 0-4-2-4-3"/>',
    'book-of-earth': '<path d="m4 27 12-21 12 21ZM11 15l5 4 5-4M8 27h16"/>',
    'book-of-fire': '<path d="M17 3c2 8 11 12 10 20-1 6-5 8-11 8S5 27 5 21c0-5 4-8 6-11 0 5 1 7 3 8 4-4 4-10 3-15Z"/>',
    'book-of-water': '<path d="M4 12c4-6 8 6 12 0s8 6 12 0M4 19c4-6 8 6 12 0s8 6 12 0M4 26c4-6 8 6 12 0s8 6 12 0"/>',
    'book-of-the-void': '<circle cx="16" cy="17" r="12"/><circle cx="16" cy="17" r="7"/><circle cx="16" cy="17" r="1"/>'
  };
  return `<svg class="book-mark" viewBox="0 0 32 34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${marks[slug] || ''}</svg>`;
}

function card(entry, eyebrow = 'REFERENCE') {
  const page = state.data.pages[entry.slug];
  const description = entry.slug === 'create-character' ? 'Build your samurai with clans, schools, skills, and a live XP budget.' : page?.excerpt || 'Explore this section of the archive.';
  return `<a class="page-card" href="${pageHref(entry.slug)}"><span class="card-top"><span class="card-icon" aria-hidden="true">${iconFor(entry.title)}</span><span class="card-arrow" aria-hidden="true">↗</span></span><span class="card-eyebrow">${esc(eyebrow)}</span><strong>${esc(entry.title)}</strong><span class="card-description">${esc(description)}</span></a>`;
}

function iconFor(title) {
  const icons = {'Book of Air':'風','Book of Earth':'地','Book of Fire':'火','Book of Water':'水','Book of the Void':'空'};
  return icons[title] || '◈';
}

function renderCharacters() {
  const characters = window.CharacterBuilder.list();
  return `<div class="workspace"><div class="workspace-head"><h1>Characters</h1><button data-dashboard="new">Create PC</button></div><div class="character-list">${characters.map(c => `<article class="character-tile"><div class="character-info"><h2>${esc(c.name || 'Unnamed PC')}</h2><p>${esc([c.clan,c.family].filter(Boolean).join(' · '))}</p></div><div class="character-actions"><button data-dashboard="view" data-id="${esc(c.id)}">View</button><button data-dashboard="open" data-id="${esc(c.id)}">Edit</button><button data-dashboard="remove" data-id="${esc(c.id)}">Delete</button></div></article>`).join('') || '<p>No personal PCs yet. Create a PC to start.</p>'}</div></div>`;
}

function renderCharacterView(id) {
  const sheet=window.CharacterBuilder.read(id),target=$('#app'),account=window.CharacterStorage.accountId;
  const back='<a href="#/characters">← Characters</a>';
  if(!sheet){target.innerHTML=`<div class="workspace"><h1>Character unavailable</h1>${back}</div>`;return;}
  target.innerHTML=`<div class="workspace personal-sheet">${back}<div class="loading">Loading character sheet…</div></div>`;
  window.CharacterSheetView.fromSheet(sheet).then(data=>{
    if(currentSlug()!=='characters/'+id||account!==window.CharacterStorage.accountId)return;
    target.innerHTML=`<div class="workspace personal-sheet"><section class="panel shared-sheet readonly-sheet" aria-label="Read-only character sheet"><div class="workspace-head"><h2>${esc(sheet.name||'Unnamed PC')}</h2><div class="sheet-actions"><a href="#/characters">Close</a><button data-dashboard="print-view">Print</button><button data-dashboard="export-view" data-id="${esc(id)}">Export JSON</button></div></div><p class="sheet-mode">Read-only character sheet</p>${window.CharacterSheetView.render(data.sections)}</section></div>`;
  }).catch(()=>{if(currentSlug()==='characters/'+id&&account===window.CharacterStorage.accountId)target.innerHTML=`<div class="workspace"><h1>Character sheet unavailable</h1>${back}</div>`;});
}

function renderArticle(page) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = page.html;
  const headings = [...wrapper.querySelectorAll('h1, h2, h3')];
  const toc = headings.map((heading, index) => {
    const id = heading.id || `section-${index + 1}`;
    heading.id = id;
    return {id, title: heading.textContent.trim(), level: heading.tagName};
  });
  const findParent = (items, parent = null) => {
    for (const item of items) {
      if (item.slug === page.slug) return parent;
      const found = findParent(item.children || [], item);
      if (found) return found;
    }
    return null;
  };
  const relatedSection = findParent(state.data.navigation);
  const related = relatedSection?.children.filter(x => x.slug !== page.slug).slice(0, 3) || [];
  for (const link of wrapper.querySelectorAll('a[href]')) {
    if (/^https?:/.test(link.getAttribute('href'))) {
      const url = new URL(link.href);
      const slug = url.pathname.replace(/^\//,'');
      if (/lasthaiku/i.test(url.hostname) && state.data.pages[slug]) link.setAttribute('href',pageHref(slug)+url.hash);
      else link.replaceWith(document.createTextNode(link.textContent));
    }
  }
  return `<div class="article-layout"><article class="article"><div class="article-intro"><h1>${esc(page.title)}</h1></div>${toc.length ? `<details class="inline-contents"><summary>Contents</summary><nav class="toc">${toc.map(x => `<a href="#/${encodeURIComponent(page.slug)}#${encodeURIComponent(x.id)}">${esc(x.title)}</a>`).join('')}</nav></details>` : ''}<div class="article-content">${wrapper.innerHTML}</div>${related.length ? `<div class="related"><h2>Continue reading</h2><div class="related-grid">${related.map(x => card(x, relatedSection.title.toUpperCase())).join('')}</div></div>` : ''}</article></div>`;

}

let rulesDialog;
function openRules(href) {
  const match=/^#\/([^#]+)(?:#(.*))?$/.exec(href);
  if(!match || !state.data)return;
  let slug,anchor;
  try {slug=decodeURIComponent(match[1]);anchor=decodeURIComponent(match[2] || '');}catch{return;}
  if(!rulesDialog) {
    rulesDialog=document.createElement('dialog');
    rulesDialog.className='rules-popup';
    rulesDialog.setAttribute('aria-labelledby','rules-popup-title');
    rulesDialog.innerHTML='<div class="rules-popup-header"><h2 id="rules-popup-title"></h2><button type="button" aria-label="Close rules" autofocus>Close</button></div><div class="rules-popup-body"></div>';
    document.body.append(rulesDialog);
    rulesDialog.querySelector('button').addEventListener('click',()=>rulesDialog.close());
    rulesDialog.addEventListener('close',()=>{
      document.body.classList.remove('rules-open');
      rulesDialog.querySelector('.rules-popup-body').replaceChildren();
    });
    rulesDialog.addEventListener('click',event=>{
      if(event.target!==rulesDialog)return;
      const box=rulesDialog.getBoundingClientRect();
      if(event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom)rulesDialog.close();
    });
  }
  const page=state.data.pages[slug],body=rulesDialog.querySelector('.rules-popup-body');
  rulesDialog.dataset.slug=slug;
  rulesDialog.querySelector('h2').textContent=page?.title || 'Rules unavailable';
  body.innerHTML=page ? renderArticle(page) : '<p>This rule reference is unavailable.</p>';
  if(!rulesDialog.open){rulesDialog.showModal();document.body.classList.add('rules-open');}
  body.scrollTop=0;
  if(anchor)requestAnimationFrame(()=>{
    const target=Array.from(body.querySelectorAll('[id]')).find(node=>node.id===anchor);
    if(target)body.scrollTop+=target.getBoundingClientRect().top-body.getBoundingClientRect().top;
  });
}

document.addEventListener('click',event=>{
  const link=event.target.closest('a[data-rule-reference], .rules-popup a[href^="#"]');
  if(!link || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
  event.preventDefault();
  const href=link.getAttribute('href');
  openRules(href.startsWith('#/') ? href : pageHref(rulesDialog.dataset.slug)+href);
});

function renderDirectory() {
  const pages = Object.values(state.data.pages).filter(page => !isBookPage(page.slug) && page.slug !== 'start').sort((a,b) => a.title.localeCompare(b.title));
  const groups = pages.reduce((result, page) => { const letter = (page.title[0] || '#').toUpperCase(); (result[letter] ||= []).push(page); return result; }, {});
  return `<div class="directory"><div class="eyebrow muted"><span class="eyebrow-line"></span> THE COMPLETE ARCHIVE</div><h1>All pages</h1><p>Browse rules and reference pages.</p><div class="directory-count">${pages.length} PAGES</div><div class="directory-groups">${Object.entries(groups).map(([letter, entries]) => `<section class="directory-group"><h2>${esc(letter)}</h2><div>${entries.map(page => `<a href="${pageHref(page.slug)}"><span>${esc(page.title)}</span><small>${esc(pageSection(page.slug))}</small><b>↗</b></a>`).join('')}</div></section>`).join('')}</div></div>`;
}

function render() {
  if (!state.data) return;
  const slug = currentSlug();
  if (slug === 'start') { location.replace('#/campaigns'); return; }
  const page = state.data.pages[slug];
  const campaignRoute = slug === 'campaigns' || slug.startsWith('campaigns/') || slug.startsWith('invite/');
  const characterView = slug.startsWith('characters/');
  const characterEditor = ['create-character','create-character-lab'].includes(slug);
  document.body.dataset.overview = ['campaigns', 'characters', 'books'].includes(slug);
  const title = campaignRoute ? 'Campaigns' : characterView ? 'Character sheet' : slug === 'characters' ? 'Characters' : slug === 'books' ? 'Books' : characterEditor ? (slug === 'create-character-lab' ? 'Character · Experimental layout' : 'Character') : page?.title || (slug === 'all-pages' ? 'All pages' : 'Page unavailable');
  $('#breadcrumb').textContent = title;
  document.title = `${title} · l5r-rules`;
  // Remove creator handlers before rendering a different workspace.
  $('#app').onclick = $('#app').onchange = $('#app').oninput = null;
  $('#app').innerHTML = campaignRoute ? window.CampaignUI.render(slug) : slug === 'characters' ? renderCharacters() : slug === 'books' ? renderBooks() : slug === 'all-pages' ? renderDirectory() : characterEditor ? '<div class="loading">Opening character…</div>' : page ? renderArticle(page) : '<div class="not-found"><h1>Page unavailable</h1><a href="#/books">Books</a></div>';
  if (characterEditor) window.CharacterBuilder.mount($('#app'),null,{layout:slug === 'create-character-lab' ? 'lab' : 'current'});
  if (characterView) renderCharacterView(slug.slice('characters/'.length));
  renderNavigation();
  if (campaignRoute) window.CampaignUI.mountEditor();
  const fragment = location.hash.split('#').slice(2).join('#');
  if (fragment) requestAnimationFrame(() => document.getElementById(decodeURIComponent(fragment))?.scrollIntoView());
  else window.scrollTo(0, 0);
}

function normalize(s) { return s.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function search(query) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return Object.values(state.data.pages).filter(page => !isBookPage(page.slug) && page.slug !== 'start').map(page => {
    const title = normalize(page.title), body = normalize(page.html.replace(/<[^>]+>/g, ' '));
    if (!words.every(word => title.includes(word) || body.includes(word))) return null;
    const score = words.reduce((sum, word) => sum + (title.includes(word) ? 10 : 0) + (body.includes(word) ? 1 : 0), 0);
    return {...page, score};
  }).filter(Boolean).sort((a,b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 30);
}

function renderSearchResults() {
  const query = $('#search-input').value;
  const box = $('#search-results');
  state.searchMatches = search(query);
  state.activeMatch = 0;
  if (!query.trim()) { box.innerHTML = `<div class="search-empty"><span>◈</span><strong>What are you looking for?</strong><p>Try “combat”, “shugenja”, or “fire spells”.</p></div>`; return; }
  if (!state.searchMatches.length) { box.innerHTML = `<div class="search-empty"><span>⌕</span><strong>No pages found</strong><p>Try a different word or a shorter phrase.</p></div>`; return; }
  box.innerHTML = `<div class="results-count">${state.searchMatches.length} RESULTS</div>` + state.searchMatches.map((page,i) => `<a class="search-result ${i===0?'selected':''}" href="${pageHref(page.slug)}"><span class="result-icon">◈</span><span><strong>${esc(page.title)}</strong><small>${esc(pageSection(page.slug))} · ${esc(page.excerpt)}</small></span><span class="result-arrow">↗</span></a>`).join('');
}

function openSearch() { $('#search-overlay').hidden = false; document.body.classList.add('search-open'); $('#search-input').focus(); renderSearchResults(); }
function closeSearch() { $('#search-overlay').hidden = true; document.body.classList.remove('search-open'); $('#search-input').value = ''; }
function closeMenu() {}

$('#search-button').addEventListener('click', openSearch);
$('#search-close').addEventListener('click', closeSearch);
$('#search-backdrop').addEventListener('click', closeSearch);
$('#search-input').addEventListener('input', renderSearchResults);
$('#search-results').addEventListener('click', event => { if (event.target.closest('a')) closeSearch(); });
$('#app').addEventListener('click', async event => {
  const button = event.target.closest('[data-dashboard]');
  if (!button) return;
  const action = button.dataset.dashboard;
  if (action === 'new') { window.CharacterBuilder.create(); location.hash = pageHref('create-character'); }
  if (action === 'open' && window.CharacterBuilder.open(button.dataset.id)) location.hash = pageHref('create-character');
  if (action === 'view') location.hash = '#/characters/'+encodeURIComponent(button.dataset.id);
  if (action === 'print-view') window.print();
  if (action === 'export-view') {
    const sheet=window.CharacterBuilder.read(button.dataset.id);if(!sheet)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(await window.CharacterSheetView.exportSheet(sheet),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='l5r-rules-character.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if (action === 'remove') {
    const character = window.CharacterBuilder.list().find(item => item.id === button.dataset.id);
    if (character && window.confirm(`Delete ${character.name || 'this character'}${window.CharacterStorage?.accountId ? ' from your account and synced devices' : ' from this browser'}?`)) {
      window.CharacterBuilder.remove(button.dataset.id);
    }
  }
});
window.addEventListener('characters-changed', () => { if (state.data && (currentSlug() === 'characters'||currentSlug().startsWith('characters/'))) render();
  else if (state.data && (currentSlug()==='campaigns' || currentSlug().startsWith('campaigns/') || currentSlug().startsWith('invite/'))) window.CampaignUI.refresh(render); });
window.addEventListener('campaigns-changed', () => { if (state.data && /^(campaigns|invite\/)/.test(currentSlug())) window.CampaignUI.refresh(render); });
window.addEventListener('campaign-sheet-changed', () => { if (state.data && (currentSlug()==='campaigns' || currentSlug().startsWith('campaigns/') || currentSlug().startsWith('invite/'))) window.CampaignUI.refresh(render); });
window.addEventListener('hashchange', () => {if(rulesDialog?.open)rulesDialog.close();render();});
document.addEventListener('keydown', event => {
  if(rulesDialog?.open)return;
  const overlayOpen = !$('#search-overlay').hidden;
  if (event.key === 'Escape') { closeSearch(); closeMenu(); return; }
  if ((event.key === '/' || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); openSearch(); return; }
  if (!overlayOpen || !state.searchMatches.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    state.activeMatch = (state.activeMatch + (event.key === 'ArrowDown' ? 1 : -1) + state.searchMatches.length) % state.searchMatches.length;
    document.querySelectorAll('.search-result').forEach((el,i) => el.classList.toggle('selected', i === state.activeMatch));
    document.querySelectorAll('.search-result')[state.activeMatch]?.scrollIntoView({block:'nearest'});
  }
  if (event.key === 'Enter') { location.hash = pageHref(state.searchMatches[state.activeMatch].slug); closeSearch(); }
});

fetch('public/wiki.json').then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }).then(data => { state.data = data; addDeepNavigation(); render(); }).catch(error => { $('#app').innerHTML = `<div class="not-found"><h1>Archive unavailable</h1><p>The content could not be loaded. Please refresh the page.</p></div>`; console.error(error); });
