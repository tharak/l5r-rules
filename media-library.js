// Media library: pictures every signed-in player can browse and pick instead of uploading.
// Grouped by where they come from: pictures players added (an upload: a small thumbnail record
// plus the full image loaded only when picked; or a link: just the address, the picture stays
// on its own site), then the images listed with the site (public/assets/library.json, built by
// scripts/build_library.cjs). Official art there loads from its original file (official-images.js).
// Each player can hide pictures from their own library (saved with their account).
(() => {
  const UI = window.UI, e = UI.escape;
  let uploads = [], stop = null, stopHidden = null, watched = null, builtIn = null, loading = false, busy = false, message = '', hidden = new Set(), showHidden = false;
  const fullCache = new Map();
  const store = () => window.CampaignStorage;
  const changed = () => window.dispatchEvent(new Event('library-changed'));

  // Start listening for uploads (per signed-in account) and load the bundled catalog once.
  function ensure() {
    const backend = store()?.backend || null;
    if (backend !== watched) {
      stop?.(); stopHidden?.(); watched = backend; uploads = []; hidden = new Set();
      stop = backend?.watchLibrary?.(list => { uploads = list; changed(); }, () => {}) || null;
      stopHidden = backend?.watchLibraryHidden?.(list => { hidden = new Set(list); changed(); }, () => {}) || null;
    }
    if (!builtIn && !loading) {
      loading = true;
      fetch('public/assets/library.json').then(r => r.json()).then(data => { builtIn = data.groups || []; changed(); }).catch(() => { builtIn = []; }).finally(() => { loading = false; });
    }
  }
  // A listed picture's id is asset:<path>; official art loads from its original file.
  const official = () => window.OfficialImages || {src:path => path,original:() => ''};
  const assetSrc = id => official().src(String(id).slice(6));
  // Every picture as {id, title, thumb, note, own, original}, grouped by source; uploads first.
  // Hidden pictures are left out unless asked for ({hidden:true} lists only those).
  function groups({hidden:onlyHidden = false} = {}) {
    ensure();
    const uid = store()?.uid;
    const uploaded = {source:'Added by players',items:uploads.map(item => ({id:item.id,title:item.title,thumb:item.url || item.thumb,note:`${item.url ? 'Link · ' : ''}${item.uploaderName || ''}`,own:item.uploaderUid === uid,original:item.url || ''}))};
    const bundled = (builtIn || []).map(group => ({source:group.source,items:group.items.map(item => {
      const original = official().original(item.src);
      return {id:`asset:${item.src}`,title:item.title,thumb:original || item.src,note:original ? 'legendofthefiverings.com' : '',own:false,original};
    })}));
    return [uploaded,...bundled].map(group => ({...group,items:group.items.filter(item => hidden.has(item.id) === onlyHidden)})).filter(group => group.items.length);
  }
  const find = id => groups().concat(groups({hidden:true})).flatMap(group => group.items).find(item => item.id === id);
  // Hide a picture from this player's library, or bring it back.
  async function setHidden(id,hide) {
    const next = new Set(hidden); if (hide) next.add(id); else next.delete(id);
    const before = hidden; hidden = next; changed();
    try { await store().backend.setLibraryHidden([...next]); message = ''; } catch (error) { hidden = before; message = error.message || 'That could not be saved.'; }
    changed();
  }
  // A picture's full image: a listed file (or its original), or an uploaded image (loaded once, then cached).
  const linkOf = id => uploads.find(item => item.id === id)?.url || '';
  async function imageSrc(id) {
    if (String(id).startsWith('asset:')) return assetSrc(id);
    if (linkOf(id)) return linkOf(id);
    if (fullCache.has(id)) return fullCache.get(id);
    const src = await store()?.backend?.libraryImage(id);
    if (src) fullCache.set(id,src);
    return src || '';
  }
  // The cached full image if it is already loaded (for drawing a map without waiting).
  const cachedSrc = id => String(id).startsWith('asset:') ? assetSrc(id) : linkOf(id) || fullCache.get(id) || '';
  async function toFile(id) {
    const src = await imageSrc(id);
    if (!src) throw new Error('This picture could not be loaded.');
    let blob;
    // A linked picture is copied from its site; some sites do not allow that.
    try { const response = await fetch(src); if (!response.ok) throw new Error(); blob = await response.blob(); }
    catch { throw new Error('That site does not let its picture be copied here. Save it and use Upload instead.'); }
    if (!/^image\//.test(blob.type || 'image/')) throw new Error('That link is not a picture.');
    return new File([blob],'library-picture',{type:blob.type || 'image/jpeg'});
  }

  const tile = (item,{pick = false} = {}) => `<figure class="library-tile">${pick
    ? `<button type="button" class="library-tile-pick" data-library-choose="${e(item.id)}" title="${e(item.title)}"><img src="${e(item.thumb)}" alt="" loading="lazy"><figcaption>${e(item.title)}</figcaption></button>`
    : `<button type="button" class="library-tile-pick" data-library-open="${e(item.id)}" aria-label="Open ${e(item.title)}"><img src="${e(item.thumb)}" alt="${e(item.title)}" loading="lazy"><figcaption>${e(item.title)}${item.note ? `<small>${e(item.note)}</small>` : ''}</figcaption></button>${removeButton(item)}`}</figure>`;
  // Your own upload is deleted from the library; any other picture is hidden for you alone.
  const removeButton = item => hidden.has(item.id)
    ? UI.button({text:'Restore',variant:'quiet',size:'compact',attrs:{'data-library-restore':item.id,'aria-label':`Show ${item.title} again`}})
    : item.own ? UI.button({text:'Delete',variant:'quiet',size:'compact',attrs:{'data-library-delete':item.id,'aria-label':`Delete ${item.title}`,title:'Delete from the library'}})
    : UI.button({text:'Remove',variant:'quiet',size:'compact',attrs:{'data-library-hide':item.id,'aria-label':`Remove ${item.title} from your library`,title:'Hide from your library (only for you)'}});
  const grid = (list,options) => list.map(group => `<section class="library-group"><h2>${e(group.source)} <small>${group.items.length}</small></h2><div class="library-grid">${group.items.map(item => tile(item,options)).join('')}</div></section>`).join('');
  // The pictures this player hid, folded at the end of the library page.
  const hiddenSection = () => {
    const list = groups({hidden:true}), count = list.reduce((n,group) => n + group.items.length,0);
    return count ? `<details class="library-hidden"${showHidden ? ' open' : ''} data-library-hidden><summary>Hidden by you <small>${count}</small></summary>${grid(list)}</details>` : '';
  };
  const uploadControl = () => `<label class="ui-button ui-button--primary ui-button--compact library-upload">${busy ? 'Uploading…' : 'Upload'}<input type="file" accept="image/*" class="ui-portrait-input" data-library-upload ${busy ? 'disabled' : ''} aria-label="Upload a picture"></label>`
    + `<form class="library-link" data-library-link>${UI.field({attrs:{type:'url',name:'url',placeholder:'or paste an image link (https://…)','aria-label':'Image link',required:true,pattern:'https://.+'}})}${UI.button({text:'Add link',variant:'secondary',size:'compact',attrs:{type:'submit',disabled:busy}})}</form>`;

  // The library page.
  function render() {
    if (!store()?.uid) return `<div class="workspace library"><h1>Library</h1><p class="campaign-invite-note">Sign in to see and add pictures.</p></div>`;
    const list = groups();
    return `<div class="workspace library"><div class="library-head"><h1>Library</h1>${uploadControl()}${UI.field({attrs:{type:'search','data-library-search':true,placeholder:'Search pictures','aria-label':'Search pictures'}})}</div>${message ? `<p class="campaign-invite-note" role="status">${e(message)}</p>` : ''}${list.length ? grid(list) : '<p class="campaign-invite-note">Loading pictures…</p>'}${hiddenSection()}</div>`;
  }
  function mount(root) {
    root.onchange = async event => {
      if (event.target.dataset.libraryUpload === undefined) return;
      const file = event.target.files?.[0]; event.target.value = '';
      if (file) await upload(file);
    };
    root.oninput = event => { if (event.target.dataset.librarySearch !== undefined) filter(root,event.target.value); };
    root.onsubmit = async event => {
      const form = event.target.closest('[data-library-link]');
      if (!form) return;
      event.preventDefault();
      await addLink(form.elements.url.value);
    };
    root.addEventListener('toggle',event => { if (event.target.dataset?.libraryHidden !== undefined) showHidden = event.target.open; },true);
    root.onclick = async event => {
      const open = event.target.closest('[data-library-open]'), hide = event.target.closest('[data-library-hide]'), restore = event.target.closest('[data-library-restore]'), del = event.target.closest('[data-library-delete]');
      if (open) return detail(open.dataset.libraryOpen);
      if (hide) return setHidden(hide.dataset.libraryHide,true);
      if (restore) return setHidden(restore.dataset.libraryRestore,false);
      if (del) return remove(del.dataset.libraryDelete);
    };
  }
  async function remove(id) {
    const item = uploads.find(u => u.id === id);
    if (!item || item.uploaderUid !== store()?.uid || !window.confirm(`Delete "${item.title}" from the library?`)) return false;
    try { await store().backend.deleteLibrary(item.id,{link:!!item.url}); message = ''; } catch (error) { message = error.message || 'It could not be deleted.'; changed(); return false; }
    changed(); return true;
  }
  // A picture's detail view: the full image, where it comes from, and its actions.
  function detail(id) {
    const item = find(id);
    if (!item) return;
    const host = document.createElement('div');
    const actions = () => {
      const isHidden = hidden.has(item.id);
      return `${item.original ? `<a class="ui-button ui-button--secondary ui-button--compact" href="${e(item.original)}" target="_blank" rel="noopener">Original ↗</a>` : ''}${item.own
        ? UI.button({text:'Delete',variant:'quiet',size:'compact',attrs:{'data-library-delete':item.id}})
        : UI.button({text:isHidden ? 'Restore' : 'Remove',variant:'quiet',size:'compact',attrs:{[isHidden ? 'data-library-restore' : 'data-library-hide']:item.id,title:isHidden ? 'Show it in your library again' : 'Hide from your library (only for you)'}})}${UI.button({text:'Close',variant:'secondary',size:'compact',attrs:{'data-library-close':true}})}`;
    };
    host.innerHTML = UI.dialog({titleId:'library-detail-title',attrs:{class:'library-detail'},headerHtml:`<h2 id="library-detail-title">${e(item.title)}</h2><div class="library-detail-actions" data-library-actions>${actions()}</div>`,
      bodyHtml:`<img class="library-detail-image" src="${e(item.thumb)}" alt="${e(item.title)}">${item.note ? `<p class="library-detail-note">${e(item.note)}</p>` : ''}`});
    const dialog = host.firstElementChild;
    document.body.append(dialog);
    // The full image replaces the thumbnail once loaded (uploads keep a small thumbnail).
    imageSrc(item.id).then(src => { const img = dialog.querySelector('.library-detail-image'); if (src && img) img.src = src; }).catch(() => {});
    const close = () => { if (dialog.open) dialog.close(); dialog.remove(); };
    dialog.addEventListener('close',() => dialog.remove());
    dialog.addEventListener('click',async event => {
      if (event.target === dialog || event.target.closest('[data-library-close]')) return close();
      const hide = event.target.closest('[data-library-hide]'), restore = event.target.closest('[data-library-restore]'), del = event.target.closest('[data-library-delete]');
      if (hide || restore) { await setHidden(item.id,!!hide); const box = dialog.querySelector('[data-library-actions]'); if (box) box.innerHTML = actions(); }
      if (del && await remove(item.id)) close();
    });
    dialog.showModal();
  }
  function filter(root,query) {
    const q = String(query || '').toLowerCase();
    for (const fig of root.querySelectorAll('.library-tile')) fig.hidden = !!q && !fig.textContent.toLowerCase().includes(q);
    for (const group of root.querySelectorAll('.library-group')) group.hidden = ![...group.querySelectorAll('.library-tile')].some(fig => !fig.hidden);
  }

  // Shrink an image to a data URL that fits (largest side `max`, lowering quality as needed).
  async function shrink(file,max,limit) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1,max/Math.max(bmp.width,bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width*scale); c.height = Math.round(bmp.height*scale);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    for (const q of [0.85,0.75,0.65,0.5,0.4]) { const out = c.toDataURL('image/jpeg',q); if (out.length <= limit) return {src:out,width:c.width,height:c.height}; }
    throw new Error('This picture is too large, even after shrinking.');
  }
  // A link: checked to be an https address that loads as a picture, then saved as-is.
  async function addLink(value) {
    const url = String(value || '').trim();
    let id = '';
    if (busy) return id;
    if (!/^https:\/\/[^\s"<>]+$/.test(url) || url.length > 2000) { message = 'Use an https:// image address.'; changed(); return; }
    busy = true; message = ''; changed();
    try {
      await new Promise((resolve,reject) => { const img = new Image(); img.onload = resolve; img.onerror = () => reject(new Error('That link does not load as a picture.')); img.src = url; });
      const title = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'Picture').replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').trim().slice(0,200) || 'Picture';
      id = await store().backend.addLibraryLink({title,url});
      fullCache.set(id,url);
      message = `Added "${title}".`;
    } catch (error) { message = error.message || 'The link could not be added.'; }
    busy = false; changed();
    return id;
  }
  // Both resolve with the new picture's id ('' when it was not added).
  async function upload(file) {
    let id = '';
    if (busy) return id;
    busy = true; message = ''; changed();
    try {
      const full = await shrink(file,1600,950000), thumb = await shrink(file,320,110000);
      const title = String(file.name || 'Picture').replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').trim() || 'Picture';
      id = await store().backend.addLibrary({title,thumb:thumb.src,image:full.src,width:full.width,height:full.height});
      fullCache.set(id,full.src);
      message = `Added "${title}".`;
    } catch (error) { message = error.message || 'The picture could not be uploaded.'; }
    busy = false; changed();
    return id;
  }

  // Pick a picture in a dialog. Resolves with its id, or null when closed. Signed-in players can
  // also upload a picture or add a link there; what they add is picked at once.
  function pickId(title = 'Choose a picture') {
    return new Promise(resolve => {
      const host = document.createElement('div');
      const controls = () => store()?.uid ? `${uploadControl()}${message ? `<p class="library-dialog-status" role="status">${e(message)}</p>` : ''}` : '';
      const body = () => grid(groups(),{pick:true}) || '<p>Loading pictures…</p>';
      message = '';
      host.innerHTML = UI.dialog({titleId:'library-pick-title',attrs:{class:'library-dialog'},headerHtml:`<h2 id="library-pick-title">${e(title)}</h2>${UI.field({attrs:{type:'search','data-library-search':true,placeholder:'Search pictures','aria-label':'Search pictures'}})}${UI.button({text:'Close',variant:'secondary',attrs:{'data-library-close':true}})}<div class="library-dialog-add" data-library-controls>${controls()}</div>`,bodyHtml:`<div class="library-dialog-body">${body()}</div>`});
      const dialog = host.firstElementChild;
      document.body.append(dialog);
      let done = false;
      // New uploads, links and the bundled catalog arriving refresh the dialog in place.
      const refresh = () => {
        const add = dialog.querySelector('[data-library-controls]'), url = add?.querySelector('input[name="url"]')?.value || '';
        if (add) { add.innerHTML = controls(); const input = add.querySelector('input[name="url"]'); if (input && !busy) input.value = url; }
        dialog.querySelector('.library-dialog-body').innerHTML = body();
        filter(dialog,dialog.querySelector('[data-library-search]')?.value);
      };
      window.addEventListener('library-changed',refresh);
      const finish = value => { if (done) return; done = true; window.removeEventListener('library-changed',refresh); dialog.close(); dialog.remove(); resolve(value); };
      dialog.addEventListener('click',event => {
        if (event.target.closest('[data-library-close]') || event.target === dialog) return finish(null);
        const choice = event.target.closest('[data-library-choose]');
        if (choice) finish(choice.dataset.libraryChoose);
      });
      dialog.addEventListener('change',async event => {
        if (event.target.dataset.libraryUpload === undefined) return;
        const file = event.target.files?.[0]; event.target.value = '';
        const id = file && await upload(file);
        if (id) finish(id);
      });
      dialog.addEventListener('submit',async event => {
        const form = event.target.closest('[data-library-link]');
        if (!form) return;
        event.preventDefault();
        const id = await addLink(form.elements.url.value);
        if (id) finish(id);
      });
      dialog.addEventListener('input',event => { if (event.target.dataset.librarySearch !== undefined) filter(dialog,event.target.value); });
      dialog.addEventListener('close',() => finish(null));
      dialog.showModal();
    });
  }
  // Pick a picture and get it as a file, to go through the usual picture cropper.
  async function pickFile(title) { const id = await pickId(title); return id ? toFile(id) : null; }

  // Start page: a few recent uploads (or bundled art) and a link to the library.
  function homeTiles(count = 8) {
    const list = groups().flatMap(group => group.items).slice(0,count);
    return list.map(item => `<a class="home-tile library-home-tile" href="#/library" title="${e(item.title)}"><img src="${e(item.thumb)}" alt="" loading="lazy"><span><strong>${e(item.title)}</strong></span></a>`).join('');
  }

  window.MediaLibrary = {render,mount,pickId,pickFile,imageSrc,cachedSrc,toFile,homeTiles,groups,ensure,detail};
})();
