const UI = window.UI;
const state = { data: null, searchMatches: [], activeMatch: 0, navExpanded: new Set() };
const $ = (selector) => document.querySelector(selector);
const esc = UI.escape;
// Rule pages that sit in a book live at their place in it: #/books/water/maho.
// Built from the book tree once the wiki loads; other slugs stay flat (#/equipment).
const bookPaths = new Map(), BOOK_RINGS = {'book-of-air':'air','book-of-earth':'earth','book-of-fire':'fire','book-of-water':'water','book-of-the-void':'void'};
const pageHref = slug => `#/${(bookPaths.get(slug) || slug).split('/').map(encodeURIComponent).join('/')}`;

// A route path (books/water/maho) or a flat slug, to the page slug it shows.
function slugFromPath(path) {
  if (!path.startsWith('books/')) return path;
  const parts = path.split('/');
  if (parts.length === 2) return Object.keys(BOOK_RINGS).find(slug => BOOK_RINGS[slug] === parts[1]) || path;
  return parts[parts.length - 1];
}
function routePath() {
  const hash = location.hash.slice(2).split('#')[0];
  try { return hash.split('/').map(decodeURIComponent).join('/') || 'start'; } catch { return 'start'; }
}
function currentSlug() { return slugFromPath(routePath()); }

function buildBookPaths() {
  bookPaths.clear();
  // Breadth-first, so a page listed in several places keeps its shallowest one.
  let level = bookSections().filter(book => BOOK_RINGS[book.slug]).map(book => ({entry:book,path:`books/${BOOK_RINGS[book.slug]}`}));
  while (level.length) {
    const next = [];
    for (const {entry,path} of level) {
      if (entry.anchor || bookPaths.has(entry.slug) || !state.data.pages[entry.slug]) continue;
      bookPaths.set(entry.slug,path);
      for (const child of entry.children || []) if (!child.anchor) next.push({entry:child,path:`${path}/${child.slug}`});
    }
    level = next;
  }
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
    const selected = slug === 'design-guideline' ? false : slug.startsWith('campaigns') || slug.startsWith('invite/') ? a.hash === '#/campaigns' : slug === 'characters' || slug.startsWith('characters/') || slug === 'create-character' || slug === 'portrait-creator' || slug.startsWith('pc/') ? a.hash === '#/characters' : a.hash === '#/books';
    if (selected) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
}
// A book's sections as a nested list; deeper sections fold under their parent. The Books page
// and each book's own page show the same tree.
function bookTree(items, open = false) {
  return `<ul>${items.map(item => `<li>${UI.link({href:navHref(item),text:item.title})}${item.children?.length ? `<details class="book-sections"${open ? ' open' : ''}><summary aria-label="${esc(item.title)} sections"></summary>${bookTree(item.children)}</details>` : ''}</li>`).join('')}</ul>`;
}
function renderBooks() {
  return `<div class="workspace"><h1>Books</h1><div class="books-grid">${bookSections().map(book => UI.panel({attrs:{'class':'panel'},bodyHtml:`<h2>${bookMark(book.slug)}<a href="${pageHref(book.slug)}">${esc(book.title)}</a></h2>${bookTree(book.children)}`})).join('')}</div><a href="#/all-pages">All pages</a></div>`;
}

function bookMark(slug) {
  const ring = {'book-of-air':'Air','book-of-earth':'Earth','book-of-fire':'Fire','book-of-water':'Water','book-of-the-void':'Void'}[slug];
  return UI.ringMark({ring,attrs:{class:'book-mark'}});
}

function card(entry, eyebrow = 'REFERENCE') {
  const page = state.data.pages[entry.slug];
  const description = entry.slug === 'create-character' ? 'Build your samurai with clans, schools, skills, and a live XP budget.' : page?.excerpt || 'Explore this section of the archive.';
  return UI.card({attrs:{'class':'page-card'},href:pageHref(entry.slug),bodyHtml:`<span class="card-top"><span class="card-icon" aria-hidden="true">${iconFor(entry.title)}</span><span class="card-arrow" aria-hidden="true">↗</span></span><span class="card-eyebrow">${esc(eyebrow)}</span><strong>${esc(entry.title)}</strong><span class="card-description">${esc(description)}</span>`});
}

function iconFor(title) {
  const icons = {'Book of Air':'風','Book of Earth':'地','Book of Fire':'火','Book of Water':'水','Book of the Void':'空'};
  return icons[title] || '◈';
}

// The saved picture, else the clan's mon, else the name's first letter. The name
// and clan follow in the tile, so the image itself is decorative.
function characterAvatar(character) { return UI.characterAvatar(character); }

// Debug page (#/clan-mons): every catalog clan with the mon assigned to it, its source,
// and the mandala mons that were not matched, so assignments can be checked by eye.
async function mountClanMons(element) {
  const C = window.CharacterCatalog;
  let clans = [];
  try { clans = (await (await fetch('public/character-data.json')).json()).clans; } catch { element.innerHTML = '<p>The clan list could not be loaded.</p>'; return; }
  if (currentSlug() !== 'clan-mons') return;
  const card = ({src,title,lines,flag}) => `<article class="mon-debug-card${flag?' mon-debug-flag':''}">${src?`<img src="${src}" alt="">`:'<span class="mon-debug-none" aria-hidden="true">—</span>'}<div><h3>${esc(title)}</h3>${lines.filter(Boolean).map(line=>`<p>${line}</p>`).join('')}</div></article>`;
  const source = info => `<a href="${info.source.href}" target="_blank" rel="noopener">${esc(info.source.label)}</a>`;
  const position = info => info.position ? `Mandala position: ${info.position}` : '';
  const alternatives = info => info.alternatives.length ? `Also available: ${info.alternatives.map(alt=>`<img class="mon-debug-alt" src="${alt.src}" alt="" title="${esc(alt.source.label)}">${esc(alt.source.label)}${alt.position?` (${alt.position})`:''}`).join(', ')}` : '';
  const names = new Set(clans.map(clan => clan.name));
  const entries = [...clans.map(clan => ({name:clan.name,group:clan.group})),...C.CLAN_MONS.filter(name => !names.has(name)).map(name => ({name,group:'Not a catalog clan'}))];
  const sections = C.MON_PRIORITY.map(kind => {
    const cards = entries.map(entry => ({entry,info:C.clanMonInfo(entry.name)})).filter(({info}) => info?.kind === kind)
      .map(({entry,info}) => card({src:info.src,title:entry.name,flag:info.guess,lines:[esc(entry.group),position(info),info.guess?'<strong>Best guess</strong>':'',alternatives(info)]})).join('');
    return `<h2>${esc(C.MON_SOURCES[kind].label)}</h2>${cards ? `<div class="mon-debug-grid">${cards}</div>` : '<p>No mons used from this source yet.</p>'}`;
  }).join('');
  const missing = clans.filter(clan => !C.clanMonInfo(clan.name)).map(clan => card({src:C.DEFAULT_MON,title:clan.name,lines:[esc(clan.group),'Default five-rings mon']})).join('');
  element.innerHTML = `<div class="workspace mon-debug">${UI.sectionHeading({title:'Clan mons',level:1,description:'Debug view: which image each clan uses. Sources are used in priority order: the official site, l5r.wiki, the mandala, then l5r.fandom.com. Mandala positions are clock positions in Shin-Ian\'s artwork, with 12:00 at the top.'})}
    <p class="mon-debug-priority">Priority: ${C.MON_PRIORITY.map(kind => esc(C.MON_SOURCES[kind].label)).join(' → ')}</p>
    <p class="mon-debug-priority">Cover art, family art, and the other images from the official site are on <a href="#/official-images">Official images</a>.</p>
    ${sections}
    <h2>Clans without a mon (default five-rings mon)</h2><div class="mon-debug-grid">${missing}</div></div>`;
}

// Official images from the site's lore sections. The Shadowlands and Realm groupings are
// based on what the images show (the site reuses file numbers across sections).
const OFFICIAL_CDN = 'https://cdn.svc.asmodee.net/production-l5r/uploads/image-converter/2023/';
const OFFICIAL_LORE = [
  {title:'The Shadowlands',note:'The mon, cover, and map are named Shadowlands on the site; the illustrations are placed here by their content.',items:[
    ['shadowlands-mon.webp','Shadowlands mon',OFFICIAL_CDN+'06/00_Clan_Icon-1-900x900.webp'],
    ['shadowlands-cover.webp','Shadowlands cover',OFFICIAL_CDN+'07/01_Cover_ShadowlandsOni-v3-1900x1781.webp',true],
    ['shadowlands-map.webp','Map of the Shadowlands',OFFICIAL_CDN+'07/03_Background_ShadowlandsMap-1900x2477.webp',true],
    ...['a','b','c','d','e'].map(l => [`shadowlands-${l}.webp`,`Illustration ${l}`,OFFICIAL_CDN+`06/04${l}_Clan_Squared_Illustrations-1-1200x1200.webp`]),
    ['shadowlands-05a.webp','Illustration 05a',OFFICIAL_CDN+'06/05a_Clan_Families-1-900x900.webp']]},
  {title:'The Realm of Rokugan',note:'Placed here by their content: places, palaces, and the wiki thumbnails.',items:[
    ...['a','b','c'].map(l => [`realm-wiki-${l}.webp`,`Wiki thumbnail ${l}`,OFFICIAL_CDN+`06/02${l}_Wiki_Thumbnails-1900x1900.webp`]),
    ...['a','b','c','d','e'].map(l => [`realm-${l}.webp`,`Illustration ${l}`,OFFICIAL_CDN+`06/04${l}_Clan_Squared_Illustrations-1200x1200.webp`]),
    ...['a','b','c','d'].map(l => [`realm-05${l}.webp`,`Illustration 05${l}`,OFFICIAL_CDN+`06/05${l}_Clan_Families-900x900.webp`]),
    ['clan-landscape.webp','Landscape background',OFFICIAL_CDN+'06/06_Clan_Landscape_Background_Bottom-1900x2019.webp',true]]}
];

// Every image used from legendofthefiverings.com (loaded from its original file, not kept
// on this site), grouped by Great Clan, each linked to its original file. Family art shows which family each image was matched to.
async function mountOfficialImages(element) {
  const C = window.CharacterCatalog;
  let clans = [];
  try { clans = (await (await fetch('public/character-data.json')).json()).clans; } catch { element.innerHTML = '<p>The clan list could not be loaded.</p>'; return; }
  if (currentSlug() !== 'official-images') return;
  const original = href => href ? `<a href="${href}" target="_blank" rel="noopener">Original file ↗</a>` : '';
  const tile = ({src,title,lines,flag,wide}) => `<figure class="official-tile${wide?' official-tile-wide':''}${flag?' mon-debug-flag':''}"><img src="${esc(window.OfficialImages.src(src))}" alt="${esc(title)}" loading="lazy"><figcaption><strong>${esc(title)}</strong>${lines.filter(Boolean).map(line => `<small>${line}</small>`).join('')}</figcaption></figure>`;
  const path = src => `<code>${esc(src)}</code>`;
  const clanBlock = clan => {
    const known = new Set((clans.find(c => c.name === clan)?.families || []).map(f => f.name));
    const art = [
      tile({src:C.clanMon(clan),title:'Mon',lines:[path(C.clanMon(clan)),original(C.officialSourceUrl('mon',clan))]}),
      tile({src:C.clanCover(clan),title:'Cover',wide:true,lines:[path(C.clanCover(clan)),original(C.officialSourceUrl('cover',clan))]}),
      tile({src:C.clanCover(clan,{tall:true}),title:'Tall cover',lines:[path(C.clanCover(clan,{tall:true})),original(C.officialSourceUrl('tall',clan))]}),
      tile({src:C.clanBanner(clan),title:'Banner',lines:[path(C.clanBanner(clan)),original(C.officialSourceUrl('banner',clan))]}),
      ...C.clanIllustrations(clan).map(item => tile({src:item.src,title:`Illustration ${item.letter}`,lines:[path(item.src),original(C.officialSourceUrl('illustration',clan,item.letter))]})),
      ...C.familyArtList(clan).map(item => tile({src:item.src,title:item.family ? `${item.family} family` : 'Unidentified family',flag:item.guess,
        lines:[item.guess ? '<b>Best guess</b>' : '',item.family && !known.has(item.family) ? 'Not a family in the character catalog' : '',path(item.src),original(C.officialSourceUrl('family',clan,item.letter))]}))
    ].join('');
    return `<section class="official-clan"><h2>${esc(clan)}</h2><div class="official-art">${art}</div></section>`;
  };
  const site = [
    tile({src:'public/assets/clans/covers/clans.webp',title:'Clans cover',wide:true,lines:['Cover of the clans overview page',path('public/assets/clans/covers/clans.webp'),original('https://cdn.svc.asmodee.net/production-l5r/uploads/image-converter/2023/06/00_Clans_Cover-1-1900x1781.webp')]}),
    tile({src:'public/assets/clans/covers/clans-tall.webp',title:'Clans tall cover',lines:[path('public/assets/clans/covers/clans-tall.webp'),original('https://cdn.svc.asmodee.net/production-l5r/uploads/image-converter/2023/06/UI_L5R_Lore_Cover_Clans-1.webp')]}),
    tile({src:'public/assets/l5r-mark.webp',title:'Five-rings mark',lines:['Site logo, favicon, and the mon for clans without one',path('public/assets/l5r-mark.webp'),original('https://cdn.svc.asmodee.net/production-l5r/uploads/image-converter/2025/05/L5R-Favicon_05-16-25.webp')]}),
    tile({src:'public/assets/rokugan-map.webp',title:'Map of Rokugan',wide:true,lines:['Campaign page background',path('public/assets/rokugan-map.webp'),original('https://cdn.svc.asmodee.net/production-l5r/uploads/image-converter/2023/06/03_Map_Background-Rokugan-1900x2755.webp')]})
  ].join('');
  element.innerHTML = `<div class="workspace mon-debug official-images">${UI.sectionHeading({title:'Official images',level:1})}
    <p class="mon-debug-priority">Images used from <a href="https://www.legendofthefiverings.com/" target="_blank" rel="noopener">legendofthefiverings.com</a> (© Legend of the Five Rings / Asmodee). The site does not label the family art; each image is matched to a family by its content, and red outlines mark guesses. Clan mons for every clan are on <a href="#/clan-mons">Clan mons</a>.</p>
    ${C.CLAN_COVERS.map(clanBlock).join('')}
    <section class="official-clan"><h2>Site images</h2><div class="official-art">${site}</div></section>
    ${OFFICIAL_LORE.map(group => `<section class="official-clan"><h2>${esc(group.title)}</h2><p class="mon-debug-priority">${esc(group.note)}</p><div class="official-art">${group.items.map(([file,title,url,wide]) => tile({src:`public/assets/lore/${file}`,title,wide,lines:[path(`public/assets/lore/${file}`),original(url)]})).join('')}</div></section>`).join('')}</div>`;
}

// The start page: a row each for campaigns, characters (your PCs, most recently updated
// first) and books.
const OLD_LIST_PAGES = ['campaigns','characters','books'];
let homeRow = '';
function renderHome() {
  // Row titles are plain headings: the rows are the navigation (the old list pages are gone).
  const row = (title,href,items,action = '') => `<section class="home-row" aria-labelledby="home-${title.toLowerCase()}"><div class="home-row-head"><h2 id="home-${title.toLowerCase()}">${href ? `<a href="${href}">${title}</a>` : title}</h2>${action}</div><div class="home-row-items">${items}</div></section>`;
  const campaigns = window.CampaignUI.homeCampaigns();
  const byUpdated = (a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  const pcs = window.CharacterBuilder.list().sort(byUpdated).map(c => `<a class="home-tile" href="${esc(window.CharacterBuilder.href(c.id))}"${UI.clanTileStyle(c.clan)}>${UI.characterTileBody({portrait:c.portrait,clan:c.clan,name:c.name || 'Unnamed PC',meta:c.family})}</a>`);
  // Book tiles carry just their ring ("Air"); the mark already says it is a book.
  const ringName = slug => { const ring = BOOK_RINGS[slug]; return ring ? ring[0].toUpperCase()+ring.slice(1) : ''; };
  const books = bookSections().map(book => `<a class="home-tile home-book" href="${pageHref(book.slug)}" aria-label="${esc(book.title)}"${UI.tileArtStyle(BOOK_RINGS[book.slug] ? `public/assets/rings/${BOOK_RINGS[book.slug]}.webp` : '')}>${bookMark(book.slug)}<span><strong>${esc(ringName(book.slug) || book.title)}</strong></span></a>`);
  return `<div class="workspace home"><h1 class="visually-hidden">l5r-rules</h1>${
    row('Campaigns','',campaigns.html,campaigns.create || '')}${
    row('Characters','',pcs.join(''),UI.button({text:'Add PC',size:'compact',attrs:{'data-dashboard':'new','aria-label':'Create PC'}}))}${
    row('Books','',books.join(''),'<a class="home-row-link" href="#/all-pages">All pages</a>')}${
    window.CampaignStorage?.uid ? row('Library','#/library',window.MediaLibrary.homeTiles()) : ''}</div>`;
}

function renderCharacters() {
  const characters = window.CharacterBuilder.list();
  return `<div class="workspace">${UI.sectionHeading({title:'Characters',level:1,actionsHtml:UI.button({text:'Add PC',attrs:{'data-dashboard':'new','aria-label':'Create PC'}})})}<div class="character-list">${characters.map(c => UI.card({attrs:{'class':'character-tile'},bodyHtml:`${characterAvatar(c)}<div class="character-info"><h2><button type="button" class="character-open" data-dashboard="open" data-id="${esc(c.id)}">${esc(c.name || 'Unnamed PC')}</button></h2><p>${esc([c.clan,c.family].filter(Boolean).join(' · '))}</p></div>${UI.actionRow({attrs:{'class':'character-actions'},bodyHtml:`${UI.button({text:'Delete',variant:'secondary',attrs:{'data-dashboard':'remove','data-id':c.id}})}`})}`})).join('') || '<p>No personal PCs yet. Create a PC to start.</p>'}</div></div>`;
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
  // A book page is its own table of contents: a short lead and a card per section. The wiki's
  // book pages are only an image and a bare list of links (Air has no links at all), so the
  // link lists and empty image boxes are dropped in favour of the cards.
  const book = bookSections().find(entry => entry.slug === page.slug);
  if (book) {
    for (const block of wrapper.querySelectorAll('p, ul, ol')) {
      const links = [...block.querySelectorAll('a')].map(a => a.textContent).join('').replace(/\s+/g,'');
      if (links && links === block.textContent.replace(/\s+/g,'')) block.remove();
    }
    // The wiki's old book pictures go too; the ring mark beside the title replaces them.
    for (const box of wrapper.querySelectorAll('.image-container')) box.remove();
    for (const image of wrapper.querySelectorAll('img')) image.remove();
  }
  // The full tree, as on the Books page, with each top section's subsections unfolded.
  const bookContents = book?.children?.length ? `<nav class="book-contents" aria-label="${esc(book.title)} sections">${bookTree(book.children, true)}</nav>` : '';
  const relatedSection = book ? null : findParent(state.data.navigation);
  const related = relatedSection?.children.filter(x => x.slug !== page.slug).slice(0, 3) || [];
  for (const link of wrapper.querySelectorAll('a[href]')) {
    if (/^https?:/.test(link.getAttribute('href'))) {
      const url = new URL(link.href);
      const slug = url.pathname.replace(/^\//,'');
      if (/lasthaiku/i.test(url.hostname) && state.data.pages[slug]) link.setAttribute('href',pageHref(slug)+url.hash);
      else link.replaceWith(document.createTextNode(link.textContent));
    }
  }
  return `<div class="article-layout"><article class="article"><div class="article-intro"><h1${book ? ' class="book-title"' : ''}>${book ? bookMark(book.slug) : ''}${esc(page.title)}</h1></div>${toc.length ? UI.disclosure({attrs:{'class':'inline-contents'},titleHtml:`Contents`,bodyHtml:`<nav class="toc">${toc.map(x => `<a href="#/${encodeURIComponent(page.slug)}#${encodeURIComponent(x.id)}">${esc(x.title)}</a>`).join('')}</nav>`}) : ''}<div class="article-content">${wrapper.innerHTML}</div>${bookContents}${related.length ? `<div class="related"><h2>Continue reading</h2><div class="related-grid">${related.map(x => card(x, relatedSection.title.toUpperCase())).join('')}</div></div>` : ''}</article></div>`;

}

let rulesDialog;
function openRules(href) {
  const match=/^#\/([^#]+)(?:#(.*))?$/.exec(href);
  if(!match || !state.data)return;
  let slug,anchor;
  try {slug=slugFromPath(match[1].split('/').map(decodeURIComponent).join('/'));anchor=decodeURIComponent(match[2] || '');}catch{return;}
  if(!rulesDialog) {
    const template=document.createElement('template');
    template.innerHTML=UI.dialog({title:'',titleId:'rules-popup-title',attrs:{class:'rules-popup'},headerClass:'rules-popup-header',bodyClass:'rules-popup-body',headerHtml:`<h2 id="rules-popup-title"></h2>${UI.button({text:'Close',variant:'secondary',attrs:{'aria-label':'Close rules',autofocus:true}})}`});
    rulesDialog=template.content.firstElementChild;
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
  if(state.data.pages[slug] && !hasText(slug)){loadPageText(slug).then(()=>openRules(href)).catch(console.error);return;}
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

let lastRenderedHash = null, characterMissing = false;
// One background image per page (over the default map), or none.
function setPageArt(src,wash = '') {
  if (src) { document.body.style.setProperty('--page-art',`url('${src}')`); document.body.dataset.pageArt = ''; }
  else { document.body.style.removeProperty('--page-art'); delete document.body.dataset.pageArt; }
  if (wash) document.body.style.setProperty('--page-wash',wash); else document.body.style.removeProperty('--page-wash');
}
window.setPageArt = setPageArt;
function render() {
  if (!state.data) return;
  const slug = currentSlug();
  // The old editor address opens the current character at its own link.
  if (slug === 'create-character' || slug === 'create-character-lab') {
    if (!window.CharacterBuilder.list().length) window.CharacterBuilder.create();
    location.replace(window.CharacterBuilder.href()); return;
  }
  // #/characters/<name>-<id>: open that character (the roster may still be syncing).
  const characterRoute = slug.startsWith('characters/');
  const character = characterRoute ? window.Routes.resolve(slug.slice('characters/'.length),window.CharacterBuilder.list()) : null;
  if (character) window.CharacterBuilder.open(character.id);
  characterMissing = characterRoute && !character;
  // Old flat links to a page that lives in a book move to its book path, keeping the anchor.
  if (bookPaths.has(slug) && routePath() !== bookPaths.get(slug)) {
    const fragment = location.hash.split('#').slice(2).join('#');
    location.replace(pageHref(slug) + (fragment ? `#${fragment}` : '')); return;
  }
  // The old Campaigns, Characters and Books list pages now open Start at that row.
  if (OLD_LIST_PAGES.includes(slug)) { homeRow = slug; location.replace('#/'); return; }
  const page = state.data.pages[slug];
  const campaignRoute = slug === 'campaigns' || slug.startsWith('campaigns/') || slug.startsWith('invite/');
  const characterEditor = !!character;
  const designGuide = slug === 'design-guideline';
  const portraitCreator = slug === 'portrait-creator';
  const clanMons = slug === 'clan-mons';
  const officialImages = slug === 'official-images';
  const publicPC = /^pc\/[^/]+\/[^/]+$/.test(slug);
  // Campaign pages show the map of Rokugan behind their content.
  document.body.classList.toggle('route-campaigns', campaignRoute);
  // Official art behind some pages: the start landscape and the Shadowlands map on its rule
  // pages. The character page sets its own clan art (CharacterBuilder.render).
  const SHADOWLANDS_PAGES = ['shadowlands-taint','maho','mutations','minor-shadowlands-powers','major-shadowlands-powers','akutenshi-powers','the-nothing'];
  // The start landscape is already pale, so it takes a lighter wash.
  if (slug === 'start') setPageArt(window.OfficialImages.src('public/assets/lore/clan-landscape.webp'),'#f2e9d659');
  else setPageArt(SHADOWLANDS_PAGES.includes(slug) ? window.OfficialImages.src('public/assets/lore/shadowlands-map.webp') : '');
  const title = slug === 'start' ? 'Start' : slug === 'library' ? 'Library' : designGuide ? 'Design Guideline' : campaignRoute ? 'Campaigns' : slug === 'characters' ? 'Characters' : slug === 'books' ? 'Books' : characterEditor || characterMissing ? 'Character' : portraitCreator ? 'Portrait creator' : clanMons ? 'Clan mons' : officialImages ? 'Official images' : publicPC ? 'Character' : page?.title || (slug === 'all-pages' ? 'All pages' : 'Page unavailable');
  $('#breadcrumb').textContent = title;
  // The page label only appears on rule pages; elsewhere the heading and nav already say it.
  $('#breadcrumb').hidden = !page || slug === 'start' || isBookPage(slug);
  document.title = `${title} · l5r-rules`;
  // Remove creator handlers before rendering a different workspace.
  $('#app').onclick = $('#app').onchange = $('#app').oninput = null;
  window.DesignGuideline.unmount();
  // Rule pages and the design guide wait for the full text (the index only has headings).
  if (designGuide ? state.data.partial : page && !campaignRoute && slug !== 'start' && !hasText(slug)) { $('#app').innerHTML = '<div class="loading">Opening page…</div>'; renderNavigation(); loadTextFor(slug); return; }
  $('#app').innerHTML = designGuide ? window.DesignGuideline.render(state.data) : slug === 'start' ? renderHome() : slug === 'library' ? window.MediaLibrary.render() : campaignRoute ? window.CampaignUI.render(slug) : slug === 'characters' ? renderCharacters() : slug === 'books' ? renderBooks() : slug === 'all-pages' ? renderDirectory() : characterEditor ? '<div class="loading">Opening character…</div>' : characterMissing ? '<div class="workspace"><h1>Character not found</h1><a href="#/characters">Characters</a></div>' : portraitCreator ? '' : clanMons ? '<p class="workspace">Loading clan mons…</p>' : officialImages ? '<p class="workspace">Loading official images…</p>' : publicPC ? '' : page ? renderArticle(page) : '<div class="not-found"><h1>Page unavailable</h1><a href="#/books">Books</a></div>';
  if (designGuide) window.DesignGuideline.mount($('#app'));
  if (slug === 'library') window.MediaLibrary.mount($('#app'));
  if (characterEditor) window.CharacterBuilder.mount($('#app'));
  if (portraitCreator) window.PortraitCreator.mount($('#app'));
  if (clanMons) mountClanMons($('#app'));
  if (officialImages) mountOfficialImages($('#app'));
  if (publicPC) { const [,owner,id] = slug.split('/'); window.PublicCharacter.mount($('#app'),decodeURIComponent(owner),decodeURIComponent(id)); } else window.PublicCharacter?.unmount();
  renderNavigation();
  // A page can lift its heading row (title and actions) into the top strip, beside "← Start".
  const topbarHead = $('#app [data-topbar-head]');
  $('#topbar-page').replaceChildren(...(topbarHead ? [topbarHead] : []));
  // The top strip links back to Start everywhere except on Start itself.
  $('#home-link').hidden = slug === 'start';
  if (campaignRoute) window.CampaignUI.mountEditor();
  // Scroll only when navigating to a different page; live updates (a new pin, a synced edit)
  // re-render in place and must keep the reader's position.
  // Within one campaign, changing section or item keeps the position (the item scrolls itself).
  const scrollKey = campaignRoute ? routePath().split('/').slice(0,2).join('/') : location.hash;
  if (scrollKey === lastRenderedHash) return;
  lastRenderedHash = scrollKey;
  const fragment = location.hash.split('#').slice(2).join('#');
  if (fragment) requestAnimationFrame(() => document.getElementById(decodeURIComponent(fragment))?.scrollIntoView());
  else if (slug === 'start' && homeRow) { const row = homeRow; homeRow = ''; requestAnimationFrame(() => document.getElementById(`home-${row}`)?.closest('.home-row')?.scrollIntoView({block:'start'})); }
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
  // Search reads every page: the index answers by titles and headings until the full text is in.
  if (state.data.partial && query.trim()) loadFull().then(() => { if ($('#search-input').value === query) renderSearchResults(); }).catch(console.error);
  state.searchMatches = search(query);
  state.activeMatch = 0;
  if (!query.trim()) { box.innerHTML = `<div class="search-empty"><span>◈</span><strong>What are you looking for?</strong><p>Try “combat”, “shugenja”, or “fire spells”.</p></div>`; return; }
  if (!state.searchMatches.length) { box.innerHTML = `<div class="search-empty"><span>⌕</span><strong>No pages found</strong><p>Try a different word or a shorter phrase.</p></div>`; return; }
  box.innerHTML = `<div class="results-count">${state.searchMatches.length} RESULTS</div>` + state.searchMatches.map((page,i) => `<a class="search-result ${i===0?'selected':''}" href="${pageHref(page.slug)}"><span class="result-icon">◈</span><span><strong>${esc(page.title)}</strong><small>${esc(pageSection(page.slug))} · ${esc(page.excerpt)}</small></span><span class="result-arrow">↗</span></a>`).join('');
}

function openSearch() { $('#search-overlay').hidden = false; document.body.classList.add('search-open'); $('#search-input').focus(); renderSearchResults(); }
function closeSearch() { $('#search-overlay').hidden = true; document.body.classList.remove('search-open'); $('#search-input').value = ''; }
function closeMenu() {}

// Search has no button; it opens with / or Ctrl+K.
$('#search-button')?.addEventListener('click', openSearch);
$('#search-close').addEventListener('click', closeSearch);
$('#search-backdrop').addEventListener('click', closeSearch);
$('#search-input').addEventListener('input', renderSearchResults);
$('#search-results').addEventListener('click', event => { if (event.target.closest('a')) closeSearch(); });
$('#app').addEventListener('click', async event => {
  const button = event.target.closest('[data-dashboard]');
  if (!button) return;
  const action = button.dataset.dashboard;
  if (action === 'new') location.hash = window.CharacterBuilder.href(window.CharacterBuilder.create());
  if (action === 'open' && window.CharacterBuilder.open(button.dataset.id)) location.hash = window.CharacterBuilder.href(button.dataset.id);
  if (action === 'remove') {
    const character = window.CharacterBuilder.list().find(item => item.id === button.dataset.id);
    if (character && window.confirm(`Delete ${character.name || 'this character'}${window.CharacterStorage?.accountId ? ' from your account and synced devices' : ' from this browser'}?`)) {
      window.CharacterBuilder.remove(button.dataset.id);
    }
  }
});
window.addEventListener('characters-changed', () => { if (state.data && (['characters','start'].includes(currentSlug()) || characterMissing)) render();
  else if (state.data && (currentSlug()==='campaigns' || currentSlug().startsWith('campaigns/') || currentSlug().startsWith('invite/'))) window.CampaignUI.refresh(render); });
// The library page and the start page's Library row follow new and removed pictures.
window.addEventListener('library-changed', () => { if (state.data && ['library','start'].includes(currentSlug())) render(); });
window.addEventListener('campaigns-changed', () => { if (state.data && /^(start$|campaigns|invite\/)/.test(currentSlug())) window.CampaignUI.refresh(render); });
window.addEventListener('campaign-sheet-changed', () => { if (state.data && (currentSlug()==='campaigns' || currentSlug()==='start' || currentSlug().startsWith('campaigns/') || currentSlug().startsWith('invite/'))) window.CampaignUI.refresh(render); });
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

// The small index (built by scripts/build_site.cjs) draws the page at once. A rule page then
// loads its own text (public/pages/<its address>.json, named in the index); search and the design guide, which read every
// page, load the full wiki.json when first used. Serving the repository root has no index or
// page files, so it loads wiki.json straight away.
const loadJson = url => fetch(url).then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); });
const archiveUnavailable = error => { $('#app').innerHTML = `<div class="not-found"><h1>Archive unavailable</h1><p>The content could not be loaded. Please refresh the page.</p></div>`; console.error(error); };
const loadedText = new Set(), pageLoads = new Map();
let fullWiki = null;
const hasText = slug => !state.data.partial || loadedText.has(slug);
// The menus are already built from the index; only the page text changes.
const loadFull = () => fullWiki ||= loadJson('public/wiki.json').then(full => {
  if (state.data?.partial) state.data = {...full,navigation:state.data.navigation};
  return full;
});
function loadPageText(slug) {
  if (!pageLoads.has(slug)) pageLoads.set(slug,loadJson(`public/${state.data.pages[slug].file.split('/').map(encodeURIComponent).join('/')}`)
    .then(({html}) => { state.data.pages[slug] = {...state.data.pages[slug],html}; loadedText.add(slug); })
    .catch(() => loadFull()));
  return pageLoads.get(slug);
}
// Text that a page waiting on "Opening page…" needs: its own, or every page for the design guide.
function loadTextFor(slug) {
  const load = slug === 'design-guideline' ? loadFull() : loadPageText(slug);
  load.then(() => { if (currentSlug() === slug) render(); }).catch(archiveUnavailable);
}
loadJson('public/wiki-index.json').catch(() => loadFull()).then(data => {
  state.data = data; addDeepNavigation(); buildBookPaths(); render();
}).catch(archiveUnavailable);
