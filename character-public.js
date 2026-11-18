/* Public view of a character (#/pc/<ownerUid>/<characterId>): what other players and anyone
 * with the link can see. It reads only the public document, which holds the always-public
 * details and the items the owner ticked Public, so it works signed out. */
(() => {
  const UI = window.UI, esc = UI.escape;
  const STAT_LABELS = {honor:'Honor',glory:'Glory',status:'Status',taint:'Taint'};
  let stop = null, stopJournal = null, root = null;
  const options = (title,items) => items?.length ? `<section class="public-pc-block"><h2>${title}</h2><ul>${items.map(item => `<li>${esc(item.name)}${item.selection ? ` <small>(${esc(item.selection)})</small>` : ''}</li>`).join('')}</ul></section>` : '';
  // Journal entries from the player (in the profile) and the GM (added later), newest first.
  function journal(entries) {
    const list = entries.map(entry => ({id:entry.id,number:entry.number,toolsHtml:entry.toolsHtml,title:entry.title,text:entry.text,date:entry.createdAt,author:entry.authorName || ''}));
    return `<section class="public-pc-block public-pc-journal"><h2>Journal</h2>${UI.journal({entries:list,emptyText:'No public journal entries yet.'})}</section>`;
  }
  // `compact` renders the profile without the page wrapper and title, for campaign lists.
  function page(data,extraJournal = [],{compact = false} = {}) {
    const p = data?.profile;
    if (!data) return compact ? '<p class="creator-empty">This character has not been shared yet.</p>' : '<div class="workspace public-pc"><h1>Character unavailable</h1><p>This character does not exist or has not been shared yet.</p></div>';
    if (!p) return compact ? '<p class="creator-empty">Shared details appear once the owner saves this character again.</p>' : `<div class="workspace public-pc"><h1>${esc(window.SheetSharing.publicName(data) || 'Character')}</h1><p>This character has not been saved since public views were added. It appears here once its owner saves it again.</p></div>`;
    const mon = window.CharacterCatalog?.clanMon(p.clan);
    const picture = UI.isPortrait(p.portrait) ? `<img class="public-pc-picture" src="${p.portrait}" alt="Picture of ${esc(p.name || 'this character')}">` : mon ? `<img class="public-pc-picture public-pc-mon" src="${mon}" alt="">` : '';
    const stats = Object.entries(p.stats || {}).map(([key,value]) => `<div><span>${STAT_LABELS[key] || esc(key)}</span><strong>${Number(value).toFixed(1)}</strong></div>`).join('');
    const heading = compact ? '' : `<h1>${esc(p.name || 'Unnamed character')}</h1>`;
    return `<div class="${compact ? 'public-pc public-pc-compact' : 'workspace public-pc'}${mon && !compact ? ' creator-identity-mon' : ''}"${mon && !compact ? ` style="--clan-mon:url('${mon}')"` : ''}>
      <header class="public-pc-head">${picture}<div>${heading}<p>${[p.clan,p.family,p.school].filter(Boolean).map(esc).join(' · ')}</p><p class="public-pc-rank">Insight Rank <strong>${esc(p.insightRank ?? '—')}</strong></p></div></header>
      ${stats ? `<section class="public-pc-block"><h2>Standing</h2><div class="public-pc-stats">${stats}</div></section>` : ''}
      ${p.gear?.length ? `<section class="public-pc-block"><h2>Carries</h2><p>${p.gear.map(esc).join(', ')}</p></section>` : ''}
      ${options('Advantages',p.advantages)}${options('Disadvantages',p.disadvantages)}
      ${journal([...(p.journal || []),...extraJournal])}
    </div>`;
  }
  function unmount() { stop?.(); stopJournal?.(); stop = stopJournal = null; root = null; }
  function mount(element,owner,id) {
    unmount(); root = element;
    element.innerHTML = '<p class="workspace">Loading character…</p>';
    const start = () => {
      if (root !== element) return true;
      if (!window.PublicSheets) return false;
      // The profile and the GM's public journal entries arrive separately; render both.
      let data, gm = [], loaded = false;
      const show = () => { if (root === element && loaded) element.innerHTML = page(data,gm); };
      stop = window.PublicSheets.watch(owner,id,next => { data = next; loaded = true; show(); },() => { data = null; loaded = true; show(); });
      stopJournal = window.SheetJournal?.watch(owner,id,{publicOnly:true},entries => { gm = entries.map(entry => ({id:entry.id,title:entry.title || '',text:entry.text,createdAt:entry.createdAt,authorName:entry.authorName || 'GM'})); show(); },() => {}) || null;
      return true;
    };
    if (!start()) window.addEventListener('public-sheets-ready',start,{once:true});
  }
  window.PublicCharacter = {mount,unmount,page};
})();
