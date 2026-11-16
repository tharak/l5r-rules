/* Public view of a character (#/pc/<ownerUid>/<characterId>): what other players and anyone
 * with the link can see. It reads only the public document, which holds the always-public
 * details and the items the owner ticked Public, so it works signed out. */
(() => {
  const UI = window.UI, esc = UI.escape;
  const STAT_LABELS = {honor:'Honor',glory:'Glory',status:'Status',taint:'Taint'};
  let stop = null, stopJournal = null, root = null;
  const date = value => {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) : 'Earlier notes';
  };
  const options = (title,items) => items?.length ? `<section class="public-pc-block"><h2>${title}</h2><ul>${items.map(item => `<li>${esc(item.name)}${item.selection ? ` <small>(${esc(item.selection)})</small>` : ''}</li>`).join('')}</ul></section>` : '';
  // Journal entries from the player (in the profile) and the GM (added later), newest first.
  function journal(entries) {
    const sorted = [...entries].sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return `<section class="public-pc-block public-pc-journal"><h2>Journal</h2>${sorted.length ? sorted.map(entry => `<article class="creator-journal-entry"><header><time>${esc(date(entry.createdAt))}</time>${entry.authorName ? `<span class="creator-journal-visibility">${esc(entry.authorName)}</span>` : ''}</header><p class="creator-journal-text">${esc(entry.text)}</p></article>`).join('') : '<p class="creator-empty">No public journal entries yet.</p>'}</section>`;
  }
  function page(data,extraJournal = []) {
    const p = data?.profile;
    if (!data) return '<div class="workspace public-pc"><h1>Character unavailable</h1><p>This character does not exist or has not been shared yet.</p></div>';
    if (!p) return `<div class="workspace public-pc"><h1>${esc(window.SheetSharing.publicName(data) || 'Character')}</h1><p>This character has not been saved since public views were added. It appears here once its owner saves it again.</p></div>`;
    const mon = window.CharacterCatalog?.clanMon(p.clan);
    const picture = UI.isPortrait(p.portrait) ? `<img class="public-pc-picture" src="${p.portrait}" alt="Picture of ${esc(p.name || 'this character')}">` : mon ? `<img class="public-pc-picture public-pc-mon" src="${mon}" alt="">` : '';
    const stats = Object.entries(p.stats || {}).map(([key,value]) => `<div><span>${STAT_LABELS[key] || esc(key)}</span><strong>${Number(value).toFixed(1)}</strong></div>`).join('');
    return `<div class="workspace public-pc${mon ? ' creator-identity-mon' : ''}"${mon ? ` style="--clan-mon:url('${mon}')"` : ''}>
      <header class="public-pc-head">${picture}<div><h1>${esc(p.name || 'Unnamed character')}</h1><p>${[p.clan,p.family,p.school].filter(Boolean).map(esc).join(' · ')}</p><p class="public-pc-rank">Insight Rank <strong>${esc(p.insightRank ?? '—')}</strong></p></div></header>
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
      stopJournal = window.SheetJournal?.watch(owner,id,{publicOnly:true},entries => { gm = entries.map(entry => ({id:entry.id,text:entry.text,createdAt:entry.createdAt,authorName:entry.authorName || 'GM'})); show(); },() => {}) || null;
      return true;
    };
    if (!start()) window.addEventListener('public-sheets-ready',start,{once:true});
  }
  window.PublicCharacter = {mount,unmount,page};
})();
