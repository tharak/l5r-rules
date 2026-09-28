const state = { data: null, searchMatches: [], activeMatch: 0, navExpanded: new Set(), selectedBook: 'book-of-air' };
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
    fire.children = linkedPages(state.data.pages[fire.slug]).filter(entry => entry.slug !== 'character-creation');
    for (const entry of fire.children) {
      if (['families', 'schools', 'skills'].includes(entry.slug)) entry.children = linkedPages(state.data.pages[entry.slug]);
    }
    fire.children.unshift({ title: 'Create character', slug: 'create-character', children: [] });
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
  const active = currentSlug();
  const fragment = location.hash.split('#').slice(2).join('#');
  const books = bookSections();
  expandActivePath(books, active, fragment);
  const covered = new Set();
  const collect = entries => entries.forEach(entry => { covered.add(entry.slug); collect(entry.children || []); });
  collect(books);
  const more = state.data.more.filter(entry => !covered.has(entry.slug));
  let counter = 0;
  const item = (entry, depth = 0) => {
    const key = navKey(entry), children = entry.children || [], hasChildren = children.length > 0;
    const expanded = state.navExpanded.has(key), id = `nav-group-${counter++}`;
    const selected = entry.slug === active && (!entry.anchor || entry.anchor === fragment);
    const bookButton = depth === 0 && isBookPage(entry.slug);
    const row = bookButton ? `<button class="nav-toggle nav-book-toggle" type="button" data-key="${esc(key)}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${esc(entry.title)}" aria-controls="${id}" aria-expanded="${expanded}"><span class="nav-indicator"></span><span class="nav-text">${esc(entry.title)}</span><span class="nav-chevron" aria-hidden="true">⌄</span></button>` : `<a class="nav-link ${selected ? 'active' : ''}" href="${navHref(entry)}" title="${esc(entry.title)}"><span class="nav-indicator"></span><span class="nav-text">${esc(entry.title)}</span></a>${hasChildren ? `<button class="nav-toggle" type="button" data-key="${esc(key)}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${esc(entry.title)}" aria-controls="${id}" aria-expanded="${expanded}"><span class="nav-chevron" aria-hidden="true">⌄</span></button>` : ''}`;
    return `<div class="nav-item depth-${Math.min(depth,4)}"><div class="nav-row">${row}</div>${hasChildren ? `<div class="nav-children" id="${id}" ${expanded ? '' : 'hidden'}>${children.map(child => item(child, depth + 1)).join('')}</div>` : ''}</div>`;
  };
  $('#navigation').innerHTML = `<div class="nav-label">EXPLORE THE ARCHIVE</div>${item({slug:'start', title:'Overview'})}${item({slug:'create-character', title:'Create character'})}${item({slug:'all-pages', title:'All pages'})}` +
    books.map(section => `<div class="nav-section">${item(section)}</div>`).join('') +
    `${more.length ? `<div class="nav-label more-label">ADDITIONAL RULES</div><div class="nav-more">${more.map(entry => item(entry)).join('')}</div>` : ''}`;
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

function renderBookPreview(book) {
  return `<div class="book-preview" id="book-preview" aria-live="polite"><div class="book-preview-heading"><span class="book-preview-symbol">${iconFor(book.title)}</span><div><span class="card-eyebrow">EXPLORE THE BOOK</span><h3>${esc(book.title)}</h3></div></div><div class="book-preview-links">${book.children.map(entry => `<a href="${pageHref(entry.slug)}"><span>${esc(entry.title)}</span><small>${entry.children?.length ? `${entry.children.length} topics` : 'Read section'}</small><b>↗</b></a>`).join('')}</div></div>`;
}

function renderHome() {
  const books = bookSections();
  const selectedBook = books.find(book => book.slug === state.selectedBook) || books[0];
  const quick = ['create-character','schools','combat','magic'].map(slug =>
    allNav().flatMap(x => [x,...x.children]).find(x => x.slug === slug)).filter(Boolean);
  return `<section class="home-hero"><div class="hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span> THE LAST HAIKU ARCHIVE</div><h1>Enter the world<br>of <em>Rokugan.</em></h1><p>A home for the Last Haiku campaign and a complete guide to the lore, characters, and rules of Legend of the Five Rings.</p><div class="hero-actions"><a class="primary-button" href="${pageHref('create-character')}">Create a character <span>↗</span></a><button class="text-button" id="hero-search" type="button">Search the archive <span>⌕</span></button></div></div><div class="hero-art" aria-hidden="true"><div class="art-sun"></div><div class="art-mountain one"></div><div class="art-mountain two"></div><div class="art-mountain three"></div><div class="art-kanji">五</div><div class="art-caption">THE FIVE RINGS</div></div></section>
  <section class="home-section"><div class="section-heading"><div><div class="eyebrow muted">THE FIVE BOOKS</div><h2>Find your path</h2></div><p>Five elements. One living world.</p></div><div class="book-grid">${books.map((book,i) => `<button class="book-card book-${i} ${book.slug === selectedBook.slug ? 'selected' : ''}" type="button" data-book="${book.slug}" aria-pressed="${book.slug === selectedBook.slug}"><span class="book-number">0${i+1} / 05</span><span class="book-symbol">${iconFor(book.title)}</span><span class="book-name">${esc(book.title)}</span><span class="book-detail">${book.children.length} sections <span>⌄</span></span></button>`).join('')}</div>${renderBookPreview(selectedBook)}</section>
  <section class="home-section quick-section"><div class="section-heading"><div><div class="eyebrow muted">GOOD PLACES TO BEGIN</div><h2>Explore the essentials</h2></div></div><div class="card-grid">${quick.map(x => card(x, 'POPULAR REFERENCE')).join('')}</div></section>
  <section class="archive-note"><div class="note-symbol">◈</div><div><h2>A world shaped by honor</h2><p>Browse ${Object.keys(state.data.pages).filter(slug => !isBookPage(slug) && slug !== 'character-creation').length} pages of campaign material, rules, and lore. Every page links back to its source on the original Last Haiku wiki.</p></div><a href="https://lasthaiku.wikidot.com/" target="_blank" rel="noopener noreferrer">Visit the original <span>↗</span></a></section>`;
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
  return `<div class="article-layout"><article class="article"><div class="article-intro"><div class="eyebrow muted"><span class="eyebrow-line"></span> ${esc(pageSection(page.slug).toUpperCase())}</div><h1>${esc(page.title)}</h1><div class="article-meta"><span>LAST HAIKU REFERENCE</span><span class="meta-divider"></span><span>${page.words.toLocaleString()} WORDS</span></div></div><div class="article-content">${wrapper.innerHTML}</div><div class="article-end"><div class="end-mark">◈</div><p>From the Last Haiku archive. ${esc(page.revision)}</p><a href="${esc(page.source)}" target="_blank" rel="noopener noreferrer">View original page ↗</a></div>${related.length ? `<div class="related"><h2>Continue reading</h2><div class="related-grid">${related.map(x => card(x, relatedSection.title.toUpperCase())).join('')}</div></div>` : ''}</article><aside class="article-aside"><div class="aside-inner">${toc.length ? `<div class="aside-label">ON THIS PAGE</div><nav class="toc">${toc.map(x => `<a class="toc-${x.level.toLowerCase()}" href="#/${encodeURIComponent(page.slug)}#${encodeURIComponent(x.id)}">${esc(x.title)}</a>`).join('')}</nav>` : ''}<div class="aside-source"><span class="aside-source-icon">↗</span><strong>Source material</strong><p>Read this page on the original Last Haiku wiki.</p><a href="${esc(page.source)}" target="_blank" rel="noopener noreferrer">Open original ↗</a></div></div></aside></div>`;
}

function renderDirectory() {
  const pages = Object.values(state.data.pages).filter(page => !isBookPage(page.slug) && page.slug !== 'character-creation').sort((a,b) => a.title.localeCompare(b.title));
  const groups = pages.reduce((result, page) => { const letter = (page.title[0] || '#').toUpperCase(); (result[letter] ||= []).push(page); return result; }, {});
  return `<div class="directory"><div class="eyebrow muted"><span class="eyebrow-line"></span> THE COMPLETE ARCHIVE</div><h1>All pages</h1><p>Browse every page imported from the Last Haiku wiki.</p><div class="directory-count">${pages.length} PAGES</div><div class="directory-groups">${Object.entries(groups).map(([letter, entries]) => `<section class="directory-group"><h2>${esc(letter)}</h2><div>${entries.map(page => `<a href="${pageHref(page.slug)}"><span>${esc(page.title)}</span><small>${esc(pageSection(page.slug))}</small><b>↗</b></a>`).join('')}</div></section>`).join('')}</div></div>`;
}

function render() {
  if (!state.data) return;
  const slug = currentSlug();
  if (slug === 'character-creation') { location.replace(pageHref('create-character')); return; }
  const book = bookSections().find(section => section.slug === slug);
  if (book) { location.replace(pageHref(book.children[0]?.slug || 'start')); return; }
  const page = state.data.pages[slug];
  $('#breadcrumb').textContent = slug === 'start' ? 'The archive / Overview' : slug === 'all-pages' ? 'The archive / All pages' : slug === 'create-character' ? 'Book of Fire / Create character' : `${pageSection(slug)} / ${page?.title || 'Page unavailable'}`;
  document.title = slug === 'start' ? 'Last Haiku — Legend of the Five Rings' : `${page?.title || (slug === 'all-pages' ? 'All pages' : slug === 'create-character' ? 'Create character' : 'Page unavailable')} — Last Haiku`;
  $('#app').innerHTML = slug === 'start' ? renderHome() : slug === 'all-pages' ? renderDirectory() : slug === 'create-character' ? '<div class="loading">Opening character creator…</div>' : page ? renderArticle(page) : `<div class="not-found"><span>◈</span><h1>Page unavailable</h1><p>This page was not found in the source archive.</p><a class="primary-button" href="#/start">Return to overview ↗</a></div>`;
  if (slug === 'create-character') window.CharacterBuilder.mount($('#app'));
  renderNavigation();
  $('#hero-search')?.addEventListener('click', openSearch);
  $('#app').querySelectorAll('[data-book]').forEach(button => button.addEventListener('click', () => {
    const selected = bookSections().find(section => section.slug === button.dataset.book);
    if (!selected) return;
    state.selectedBook = selected.slug;
    $('#book-preview').outerHTML = renderBookPreview(selected);
    $('#app').querySelectorAll('[data-book]').forEach(card => { card.classList.toggle('selected', card.dataset.book === selected.slug); card.setAttribute('aria-pressed', String(card.dataset.book === selected.slug)); });
  }));
  closeMenu();
  const fragment = location.hash.split('#').slice(2).join('#');
  if (fragment) requestAnimationFrame(() => document.getElementById(decodeURIComponent(fragment))?.scrollIntoView());
  else window.scrollTo(0, 0);
}

function normalize(s) { return s.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function search(query) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return Object.values(state.data.pages).filter(page => !isBookPage(page.slug) && page.slug !== 'character-creation').map(page => {
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
function closeMenu() { document.body.classList.remove('menu-open'); $('#menu-button').setAttribute('aria-expanded', 'false'); }

$('#sidebar-search').addEventListener('click', openSearch);
$('#search-button').addEventListener('click', openSearch);
$('#search-close').addEventListener('click', closeSearch);
$('#search-backdrop').addEventListener('click', closeSearch);
$('#search-input').addEventListener('input', renderSearchResults);
$('#search-results').addEventListener('click', event => { if (event.target.closest('a')) closeSearch(); });
$('#menu-button').addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); $('#menu-button').setAttribute('aria-expanded', String(open)); });
$('#mobile-shade').addEventListener('click', closeMenu);
$('#navigation').addEventListener('click', event => {
  const toggle = event.target.closest('.nav-toggle');
  if (toggle) {
    const key = toggle.dataset.key;
    const expanded = state.navExpanded.has(key);
    if (expanded) state.navExpanded.delete(key); else state.navExpanded.add(key);
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.setAttribute('aria-label', `${expanded ? 'Expand' : 'Collapse'} ${toggle.closest('.nav-row').querySelector('.nav-text').textContent}`);
    toggle.closest('.nav-row').nextElementSibling.hidden = expanded;
  } else if (event.target.closest('a')) closeMenu();
});
window.addEventListener('hashchange', render);
document.addEventListener('keydown', event => {
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
