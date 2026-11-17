(() => {
  const UI = window.UI;
  const store = () => window.CampaignStorage;
  const e = UI.escape;
  let accountUid = null, active = '', section = 'timeline', sessionId = '', npcId = '', npcDraft = null, sheetId = '', picking = false, error = '', busy = false, invite = null, inviteLoaded = '', editor = null, creatorCampaign = null, renderAgain, watchGeneration = 0;
  let plotId='', plotDraft=null, noteId='', noteDraft=null, noteTarget=null, pcNotesId='';
  let timelineSession='', pickTarget='', pickNote='', notePopup='', focusPopup=false;
  // The GM's invite popup: the current invite link while it is open.
  let inviteLink='', inviteCopied=false;
  // Handovers: live PC offers to and from this account, and which handover popup is open
  // ('campaign' for the GM handover, or 'pc:<pcId>' for a PC offer).
  let transfers=[], transferPopup='', stopTransfers=null, transfersBackend=null;
  const cleaning=new Set();
  const sheets = new Map(), stops = new Map();
  const cardSheets = new Map();
  const changed = () => window.dispatchEvent(new Event('campaign-sheet-changed'));
  const button = (action,text,id='',disabled=false) => UI.button({text,variant:action!=='pc-picker'&&/cancel|close|edit|open|notes|link|picker|delete-campaign|leave|mark-read|invite|entry-close|revoke|handover|transfer|decline/.test(action)?'secondary':'primary',attrs:{'data-campaign':action,'data-id':id,disabled:busy||disabled}});
  const statusMessage = () => error || (store().status === 'Connected' ? '' : store().status);
  const statusPanel = () => UI.feedback({text:statusMessage(),kind:error?'error':'status',attrs:{class:'campaign-status',hidden:!statusMessage()}});
  const path = (kind,id) => `campaigns/${active}/${kind}/${id}`;
  // Links: #/campaigns/<title>-<id>[/<section>[/<item name>-<id>]]. Only the ID parts find
  // things, so renames keep links working; a bare full ID (older links) still resolves.
  const SECTIONS = ['timeline','sessions','plots','npcs','pcs'];
  const hasHistory = () => typeof history !== 'undefined' && typeof history.replaceState === 'function';
  const decodedRoute = () => { try { return location.hash.slice(2).split('#')[0].split('/').map(decodeURIComponent).join('/'); } catch { return ''; } };
  function campaignSegment(id) {
    const campaigns = store().list('campaigns/'), campaign = campaigns.find(item => item.id === id);
    return window.Routes && campaign ? window.Routes.segment(campaign.title || 'campaign',id,campaigns.map(item => item.id)) : id;
  }
  function itemName(kind,item) {
    if (kind === 'pcs') return sheets.get(item.id+':public')?.data?.profile?.name || window.CharacterBuilder?.list().find(c => c.id === item.characterId)?.name || 'pc';
    return (kind === 'npcs' ? item.name : item.title) || kind.slice(0,-1);
  }
  function itemSegment(kind,id) {
    const items = store().list(path(kind,'')), item = items.find(entry => entry.id === id);
    return window.Routes && item ? window.Routes.segment(itemName(kind,item),id,items.map(entry => entry.id)) : id;
  }
  function campaignHref(id = active, sectionName = '', kind = '', itemId = '') {
    let href = '#/campaigns/'+encodeURIComponent(campaignSegment(id));
    if (sectionName) href += '/'+sectionName;
    if (sectionName && itemId) href += '/'+encodeURIComponent(itemSegment(kind,itemId));
    return href;
  }
  const resolveCampaign = segment => window.Routes?.resolve(segment,store().list('campaigns/'))?.id || segment;
  // The route last applied to the page state, and an item still waiting for its data.
  let appliedRoute = '', pendingItem = null, scrollEntry = '';
  // Move to a campaign address. Push adds a Back step; otherwise the address is replaced quietly.
  function go(href,push = true) {
    if (push) { location.hash = href; appliedRoute = decodedRoute(); return; }
    if (!hasHistory()) return;
    history.replaceState(history.state,'',href); appliedRoute = decodedRoute();
  }
  const inviteURL = token => location.href.split('#')[0]+'#/invite/'+token;
  const own = pc => pc.ownerUid === store().uid;
  const gm = () => store().get(`campaigns/${active}`)?.gmUid === store().uid;
  const cardKey = pc => `${pc.ownerUid}/${pc.characterId}`;
  // Read marks: campaigns/{c}/reads/{uid} keeps, per member, the update each session or plot
  // was last read at. An entry's update time is the latest of its own and its notes'.
  const READ_KINDS = ['sessions','plots'];
  const readKey = (kind,id) => `${kind}:${id}`;
  function entryStamp(campaign,kind,item) {
    const notes = store().list(`campaigns/${campaign}/notes/`).filter(n => n.targetKind === kind && n.targetId === item.id);
    return [item.updatedAt || '',...notes.map(n => n.updatedAt || '')].sort().pop() || '';
  }
  const readsOf = campaign => store().list(`campaigns/${campaign}/reads/`);
  const myMarks = campaign => readsOf(campaign).find(r => r.id === store().uid)?.marks || {};
  const isUnread = (campaign,kind,item) => { const stamp = entryStamp(campaign,kind,item); return !!stamp && !((myMarks(campaign)[readKey(kind,item.id)] || '') >= stamp); };
  const unreadIn = (campaign,kind) => store().list(`campaigns/${campaign}/${kind}/`).some(item => isUnread(campaign,kind,item));
  const memberName = (campaign,uid) => store().get(`campaigns/${campaign}/members/${uid}`)?.displayName || 'Player';
  const readersOf = (campaign,kind,item) => { const stamp = entryStamp(campaign,kind,item); return readsOf(campaign).filter(r => stamp && (r.marks?.[readKey(kind,item.id)] || '') >= stamp).map(r => r.name || memberName(campaign,r.id)); };
  function markRead(kind,id) {
    const item = store().get(path(kind,id));
    if (!item || !store().uid) return;
    const marks = {...myMarks(active),[readKey(kind,id)]:entryStamp(active,kind,{...item,id})};
    store().queue(path('reads',store().uid),{name:memberName(active,store().uid),marks});
  }
  const unreadMark = '<span class="campaign-unread" title="Updated since you last marked it read" aria-label="Unread update">!</span>';
  // "Read by" names (visible to everyone) and a Mark as read button while it is unread.
  function readStatus(kind,item) {
    const readers = readersOf(active,kind,item), unread = isUnread(active,kind,item);
    return `${readers.length || unread ? `<p class="campaign-read-status">${readers.length ? `<small title="Read by" aria-label="Read by ${e(readers.join(', '))}">✓ ${readers.map(e).join(', ')}</small>` : ''}${unread ? button('mark-read','Mark read',readKey(kind,item.id)) : ''}</p>` : ''}`;
  }
  function clearCardSheets() {
    for (const item of cardSheets.values()) item.stop?.();
    cardSheets.clear();
  }
  function watchCardSheets(campaigns) {
    const backend = store().backend, uid = store().uid, wanted = new Map();
    for (const campaign of campaigns) for (const pc of store().list(`campaigns/${campaign.id}/pcs/`)) {
      if (!own(pc) && !wanted.has(cardKey(pc))) wanted.set(cardKey(pc), {campaignId:campaign.id,pcId:pc.id});
    }
    for (const [key,item] of cardSheets) {
      const reference = wanted.get(key);
      if (!reference || reference.campaignId !== item.campaignId || reference.pcId !== item.pcId || item.backend !== backend) {
        item.stop?.(); cardSheets.delete(key);
      }
    }
    if (!backend) return;
    for (const [key,reference] of wanted) {
      if (cardSheets.has(key)) continue;
      const item = {...reference,backend,name:'',stop:null};
      cardSheets.set(key,item);
      const current = () => cardSheets.get(key) === item && store().uid === uid && store().backend === backend;
      // Share one public subscription across cards and keep only the name in memory.
      const receive = (data,pc,metadata) => {
        if (!current()) return;
        const name = metadata?.fromCache || metadata?.hasPendingWrites ? '' : window.SheetSharing.publicName(data);
        if (item.name !== name) {item.name=name;changed();}
      };
      const fail = () => {if (current()) {item.name='';changed();}};
      backend.watchSheet(item.campaignId,item.pcId,false,receive,fail).then(stop=>{
        if (current()) item.stop=stop; else stop();
      }).catch(fail);
    }
  }
  function campaignCard(campaign) {
    const pcs = store().list(`campaigns/${campaign.id}/pcs/`);
    const names = pcs.map(pc=>{
      const name = own(pc) ? window.CharacterBuilder.list().find(c=>c.id===pc.characterId)?.name : cardSheets.get(cardKey(pc))?.name;
      const player = store().get(`campaigns/${campaign.id}/members/${pc.ownerUid}`)?.displayName || 'Player';
      return `<li>${e(name || 'Private PC')} - ${e(player)}</li>`;
    }).join('');
    return UI.card({attrs:{'class':'panel campaign-card'},href:campaignHref(campaign.id),bodyHtml:`<h2>${e(campaign.title)}${READ_KINDS.some(kind => unreadIn(campaign.id,kind)) ? ` ${unreadMark}` : ''}</h2><p class="campaign-card-role">${campaign.gmUid===store().uid?'GM':'Player'}</p>${pcs.length?`<ul class="campaign-card-pcs" aria-label="Player characters">${names}</ul>`:''}`});
  }
  function reset(next) {
    if (next === active) return;
    watchGeneration++;
    for (const stop of stops.values()) stop?.(); stops.clear(); sheets.clear();
    active = next; section = 'timeline'; sessionId = npcId = sheetId = ''; npcDraft = null; picking = false; editor = null; error = '';
    plotId=noteId=pcNotesId='';plotDraft=noteDraft=noteTarget=null;
    timelineSession='';pickTarget='';pickNote='';notePopup='';inviteLink='';inviteCopied=false;transferPopup='';
    appliedRoute='';pendingItem=null;scrollEntry='';
  }
  async function watch(pc,full=false) {
    const key = pc.id+(full?':full':':public');
    if (stops.has(key) || !store().backend) return;
    stops.set(key,null);
    const generation = watchGeneration, c = active;
    try {
      const stop = await store().backend.watchSheet(c,pc.id,full,(data,reference)=> {
        if (generation !== watchGeneration) return;
        sheets.set(key,{data,pc:reference}); changed();
      },err=>{
        if (generation !== watchGeneration) return;
        sheets.delete(key); sheetId = ''; editor = null; error = 'Sheet access is no longer available.'; changed();
      });
      if (generation !== watchGeneration) stop(); else stops.set(key,stop);
    } catch { if (generation === watchGeneration) { stops.delete(key); error = 'This character is unavailable.'; changed(); } }
  }
  function label(pc) {
    if (own(pc)) return window.CharacterBuilder.list().find(c=>c.id===pc.characterId)?.name || 'Private PC';
    return window.SheetSharing.publicName(sheets.get(pc.id+':public')?.data) || 'Private PC';
  }
  function playerName(pc) {
    return store().get(path('members',pc.ownerUid))?.displayName || 'Player';
  }
  const entryOwner = entry => entry.creatorUid === store().uid;
  const entryAuthor = entry => store().get(path('members',entry.creatorUid))?.displayName || 'Player';
  // Up to four images per session or plot, cropped and stored like character pictures.
  const MAX_IMAGES = 4;
  function gallery(images,{kind = '',editable = false} = {}) {
    const list = (images || []).filter(UI.isPortrait);
    const thumbs = list.map((src,index) => `<figure class="campaign-image"><img src="${src}" alt="Image ${index+1}">${editable ? button('image-remove','Remove',`${kind}:${index}`) : ''}</figure>`).join('');
    const add = editable && list.length < MAX_IMAGES ? `<label class="campaign-image-add ui-button ui-button--secondary ui-button--compact">Add image<input type="file" accept="image/*" class="ui-portrait-input" data-entry-image="${kind}" aria-label="Add image"></label>` : '';
    return thumbs || add ? `<div class="campaign-images">${thumbs}${add}</div>` : '';
  }
  function entryEditor(kind,draft) {
    const plot=kind==='plot';
    const attrs = key => ({'data-entry-field':key,'data-entry-kind':kind});
    return UI.recordEditor({attrs:{class:'entry-editor','data-entry-editor':kind},fields:[
      {label:'Plot title',value:draft.title,attrs:{...attrs('title'),maxlength:200}},
    ],extraHtml:gallery(draft.images,{kind:'plot',editable:true}),actionsHtml:button(kind+'-save','Save plot','',!draft.title.trim())+button(kind+'-cancel','Cancel')});
  }
  function sessionEditor(session,isGM) {
    return UI.recordEditor({fields:[
      {label:'Title',value:session.title,attrs:{'data-campaign-field':'session-title',maxlength:200,readonly:!isGM}},
    ],extraHtml:gallery(session.images,{kind:'session',editable:isGM}),actionsHtml:isGM?button('session-save','Save')+button('session-delete','Delete',session.id):button('session-close','Close')});
  }
  function npcEditor(npc) {
    const picture = UI.portrait({label:'NPC picture',src:npc.portrait,name:npc.name,attrs:{class:'npc-portrait'},inputAttrs:{'data-npc-portrait':true},removeAttrs:{'data-campaign':'npc-portrait-remove','aria-label':'Remove NPC picture'},actionsHtml:button('npc-portrait-create','Create picture')});
    return picture+UI.recordEditor({fields:[
      {label:'Name',value:npc.name,attrs:{'data-campaign-field':'npc-name',maxlength:200}},
      {label:'Role',value:npc.role || '',attrs:{'data-campaign-field':'npc-role',maxlength:200,placeholder:'e.g. Magistrate of the Lion'}},
      {label:'Description',kind:'textarea',value:npc.description || '',attrs:{'data-campaign-field':'npc-description',maxlength:20000,rows:4}},
    ],actionsHtml:button('npc-save','Save','',!npc.name.trim())+(npcId?button('npc-delete','Delete',npcId):'')});
  }
  // Sessions, NPCs and plots each have a journal of entries (stored as campaign notes).
  // Any member writes in a session's journal; the GM writes NPC journals; the GM or the
  // plot's creator writes a plot's. A PC's journal is the character's own journal.
  // Older campaign notes about a PC move into that character's journal: the owner moves their
  // own notes into the sheet, the GM moves theirs into the GM entries beside it. Notes by other
  // players stay as read-only entries. Each note is moved once, then deleted.
  const movingNotes = new Set();
  async function migratePCNotes() {
    const backend = store().backend, uid = store().uid, campaign = active;
    if (!backend || !uid || !campaign) return;
    for (const note of store().list(path('notes','')).filter(n => n.targetKind === 'pcs' && n.creatorUid === uid && !movingNotes.has(n.id))) {
      const pc = store().get(path('pcs',note.targetId));
      if (!pc || note.text == null) continue;
      movingNotes.add(note.id);
      const entry = {text:note.text,createdAt:note.createdAt || note.updatedAt || new Date().toISOString(),updatedAt:note.updatedAt || note.createdAt || new Date().toISOString()};
      try {
        if (pc.ownerUid === uid) {
          if (!window.CharacterBuilder?.addJournalEntries(pc.characterId,[{id:note.id,...entry,public:true}])) continue;
        } else if (gm()) {
          // A full grant authorises the GM's journal entries on this sheet.
          const stop = await backend.watchSheet(campaign,note.targetId,true,() => {},() => {});
          stop?.();
          await window.SheetJournal.write(pc.ownerUid,pc.characterId,note.id,{authorUid:uid,authorName:memberName(campaign,uid),...entry,public:true});
        } else continue;
        store().queue(`campaigns/${campaign}/notes/${note.id}`,null);
      } catch (error) { movingNotes.delete(note.id); }
    }
  }
  // Session, plot and NPC descriptions used to be a text field; each moves once into the
  // first entry of its journal (written by the GM for sessions and NPCs, by the creator for plots).
  function migrateDescriptions() {
    const uid = store().uid, now = new Date().toISOString();
    const move = (kind,item,clear) => {
      const noteId = `desc_${kind}_${item.id}`;
      if (!store().get(path('notes',noteId))) store().queue(path('notes',noteId),{title:'',text:item.text,public:true,creatorUid:uid,
        createdAt:item.createdAt || item.updatedAt || now,updatedAt:now,revision:crypto.randomUUID(),targetKind:kind,targetId:item.id,
        ...(kind === 'plots' ? {targetCreatorUid:item.creatorUid} : {})});
      clear();
    };
    if (gm()) for (const session of store().list(path('sessions',''))) if (String(session.text || '').trim()) {
      const {id,...rest} = session;
      move('sessions',session,() => store().queue(path('sessions',id),{...rest,text:'',updatedAt:rest.updatedAt || now}));
    }
    if (gm()) for (const npc of store().list(path('npcs',''))) if (String(npc.notes || '').trim()) {
      const {id,text,...rest} = npc;
      move('npcs',{...npc,text:npc.notes},() => store().queue(path('npcs',id),{...rest,notes:''}));
    }
    for (const plot of store().list(path('plots',''))) if (plot.creatorUid === uid && String(plot.text || '').trim()) {
      const {id,...rest} = plot;
      move('plots',plot,() => store().queue(path('plots',id),{...rest,text:'',revision:crypto.randomUUID()}));
    }
  }
  function canAddEntry(kind,id) {
    if (kind === 'sessions') return true;
    if (kind === 'npcs') return gm();
    if (kind === 'plots') return gm() || store().get(path('plots',id))?.creatorUid === store().uid;
    return false;
  }
  // Sessions, plots and NPCs use the same journal as characters (UI.journal): titled entries.
  function notesFor(kind,id) {
    const notes=store().list(path('notes','')).filter(n=>n.targetKind===kind&&n.targetId===id);
    const drafting=noteTarget?.kind===kind&&noteTarget?.id===id&&noteDraft;
    const canAdd=canAddEntry(kind,id);
    if(!notes.length&&!canAdd&&!drafting)return '';
    const entries=notes.map(n=>({id:n.id,title:n.title||'',text:n.text||'',date:n.createdAt||n.updatedAt||'',author:entryAuthor(n),canEdit:entryOwner(n),canDelete:entryOwner(n)}));
    const control=(name,entryId)=>({'data-campaign':`note-${name}`,'data-id':name==='new'?`${kind}:${id}`:entryId,disabled:busy});
    const field=name=>({'data-entry-field':name,'data-entry-kind':'note'});
    return `<div class="campaign-notes" data-note-target-kind="${kind}" data-note-target-id="${e(id)}">${UI.journal({entries,draft:drafting?{...noteDraft,id:noteId}:null,canAdd,control,field})}</div>`;
  }
  function renderPlots(plots) {
    // A new plot is drafted above the list; an existing one is edited inside its entry.
    const fresh = '';
    const list = [...plots].sort(byNewest).map(plot => entry(`plots:${plot.id}`,`${entryTitle(plot.title || 'Untitled plot',`${e(entryAuthor(plot))}${plot.updatedAt?` · ${day(plot.updatedAt)}`:''}`)}${isUnread(active,'plots',plot) ? unreadMark : ''}`,
      plotDraft && plotId === plot.id ? entryEditor('plot',plotDraft)
        : `<article class="campaign-plot">${gallery(plot.images)}${readStatus('plots',plot)}${entryOwner(plot) ? UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:button('plot-edit','Edit plot',plot.id)+button('plot-delete','Delete plot',plot.id)}) : ''}${notesFor('plots',plot.id)}</article>`)).join('');
    return `${sectionBar('Plots')}${fresh}<div class="campaign-entries">${addTile(button('plot-new','+ Plot'))}${list || ''}</div>`;
  }
  // The GM can keep PCs and NPCs off the timeline picker (their existing pins stay).
  const hiddenOnPicker = () => new Set(store().get(`campaigns/${active}`)?.timelineHidden || []);
  const onPicker = (kind,id) => !hiddenOnPicker().has(`${kind}:${id}`);
  const pickerToggle = (kind,id) => gm() ? UI.checkbox({label:'Timeline',attrs:{type:'checkbox','data-campaign':'timeline-visibility','data-id':`${kind}:${id}`,checked:onPicker(kind,id),disabled:busy},labelAttrs:{class:'creator-check campaign-picker-toggle'}}) : '';
  // Sessions, plots, NPCs and PCs are lists of collapsible entries; remember which are open
  // across re-renders (toggle events do not bubble, so listen in the capture phase).
  const openEntries = new Set();
  document.addEventListener('toggle',event => {
    const details = event.target;
    if (!details?.dataset?.entry) return;
    // A re-render that restores an already open entry also fires "toggle"; only real changes move the address.
    if (details.open === openEntries.has(details.dataset.entry)) return;
    // One entry opens at a time, as a panel over the page.
    if (details.open) {
      for (const key of openEntries) document.querySelector(`.campaign-entry[data-entry="${key}"]`)?.removeAttribute('open');
      openEntries.clear(); openEntries.add(details.dataset.entry);
    } else openEntries.delete(details.dataset.entry);
    // The address names the open entry, so it can be copied and shared.
    const [kind,id] = details.dataset.entry.split(':');
    if (!active || !decodedRoute().startsWith('campaigns/')) return;
    if (details.open) section = kind;
    go(details.open ? campaignHref(active,kind,kind,id) : campaignHref(active),false);
  },true);
  // Escape, or a click on the dimmed page around the panel, closes the open entry.
  const closeEntry = details => { if (details?.open) details.open = false; };
  document.addEventListener('keydown',event => {
    if (event.key !== 'Escape') return;
    if (transferPopup) { transferPopup = ''; changed(); return; }
    if (newOpen()) { if (!plotId) plotDraft = null; if (!npcId) npcDraft = null; picking = false; inviteLink = ''; inviteCopied = false; changed(); return; }
    closeEntry(document.querySelector('.campaign-entry[open]'));
  });
  document.addEventListener('click',event => { if (event.target?.matches?.('.campaign-entry[open]')) closeEntry(event.target); });
  const day = value => { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) : ''; };
  // Each entry is a tile; opened, its body is a panel over the page with its own title and close.
  const entry = (key,summaryHtml,bodyHtml,tileAttrs = '') => `<details class="campaign-entry" data-entry="${e(key)}"${openEntries.has(key)?' open':''}${tileAttrs}><summary>${summaryHtml}</summary><div class="campaign-entry-body" role="dialog" aria-modal="true"><div class="campaign-entry-panel-head">${summaryHtml}${button('entry-close','✕',key)}</div>${bodyHtml}</div></details>`;
  const entryTitle = (title,meta) => `<span class="campaign-entry-title">${e(title)}</span>${meta?`<small class="campaign-entry-meta">${meta}</small>`:''}`;
  const byNewest = (a,b) => (b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || '');
  // Timeline: dated events, each with a map of Rokugan and pins for PCs, NPCs or plots.
  // Everyone reads it; the GM adds events, orders them, and places pins by clicking the map.
  const pinTarget = (kind,id) => {
    if (kind === 'pcs') { const pc = store().get(path('pcs',id)); if (!pc) return null; const profile = sheets.get(id+':public')?.data?.profile; return {name:label(pc),image:UI.isPortrait(profile?.portrait) ? profile.portrait : window.CharacterCatalog?.clanMon(profile?.clan || '') || ''}; }
    if (kind === 'npcs') { const npc = store().get(path('npcs',id)); return npc ? {name:npc.name || 'Unnamed NPC',image:UI.isPortrait(npc.portrait) ? npc.portrait : ''} : null; }
    if (kind === 'plots') { const plot = store().get(path('plots',id)); return plot ? {name:plot.title || 'Untitled plot',image:(plot.images || []).find(UI.isPortrait) || ''} : null; }
    return null;
  };
  // A note's or journal entry's title is its first line; the popup shows the whole text.
  const noteTitle = note => UI.entryTitle(note);
  const notesOf = (kind,id) => store().list(path('notes','')).filter(n => n.targetKind === kind && n.targetId === id);
  // Entries that can be pinned for a plot, PC or NPC: its campaign notes and, for a PC, the
  // public entries of the character's journal (ids prefixed "journal:").
  function entriesOf(kind,id) {
    const notes = notesOf(kind,id).map(n => ({id:n.id,title:noteTitle(n),text:n.text || '',author:entryAuthor(n),date:n.updatedAt || n.createdAt || ''}));
    const journal = kind === 'pcs' ? (sheets.get(id+':public')?.data?.profile?.journal || []).map(j => ({id:`journal:${j.id}`,title:noteTitle(j),text:j.text || '',author:playerName(store().get(path('pcs',id)) || {}),date:j.createdAt || ''})) : [];
    return [...journal,...notes].sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  }
  const newestFirst = (a,b) => (b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || '');
  // Timeline events still pointing at an existing session, item and entry.
  function timelineEvents(sessionId) {
    return store().list(path('timeline','')).filter(item => !sessionId || item.sessionId === sessionId).map(item => {
      const target = pinTarget(item.kind,item.targetId), note = target && entriesOf(item.kind,item.targetId).find(entry => entry.id === item.noteId);
      return target && note ? {...item,target,note} : null;
    }).filter(Boolean).sort((a,b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }
  // The timeline is the game's sessions, newest first in a scrolling row; each session's events
  // pin entries about PCs, NPCs or plots on the always-visible map. Only the GM edits it.
  function renderTimeline(isGM,pcs,npcs,plots) {
    const sessions = store().list(path('sessions','')).sort(newestFirst);
    if (timelineSession && !sessions.some(item => item.id === timelineSession)) timelineSession = '';
    const selected = sessions.find(item => item.id === timelineSession) || sessions[0] || null;
    const events = selected ? timelineEvents(selected.id) : [];
    const list = sessions.map(session => { const count = timelineEvents(session.id).length; return `<li>${UI.button({html:`<small>${e(day(session.createdAt || session.updatedAt))}</small><span>${e(session.title || 'Untitled session')}</span>${count ? `<b class="timeline-count" title="Pins" aria-label="${count} pin${count===1?'':'s'}">${count}</b>` : ''}`,variant:'quiet',attrs:{class:'timeline-event','data-campaign':'timeline-session','data-id':session.id,'aria-current':selected?.id === session.id ? 'true' : false}})}</li>`; }).join('');
    const pinHtml = events.map(item => `<span class="timeline-pin timeline-pin-${item.kind}" data-pin-id="${e(item.id)}" style="left:${Number(item.x)}%;top:${Number(item.y)}%">${UI.button({html:`${item.target.image ? `<img src="${item.target.image}" alt="">` : '<span class="timeline-pin-dot" aria-hidden="true"></span>'}<span class="timeline-pin-name">${e(item.note.title)}</span>`,variant:'quiet',attrs:{class:'timeline-pin-open','data-campaign':'note-popup','data-id':item.id,'aria-label':`${item.target.name}: ${item.note.title}`}})}${isGM ? UI.button({text:'×',variant:'quiet',size:'compact',attrs:{class:'timeline-pin-remove','data-campaign':'timeline-unpin','data-id':item.id,'aria-label':`Remove ${item.note.title} from the map`}}) : ''}</span>`).join('');
    let controls = '';
    if (isGM && selected) {
      // An entry already pinned in any session cannot be added again.
      const used = new Set(store().list(path('timeline','')).map(item => `${item.kind}:${item.targetId}:${item.noteId}`));
      // Plots on one row; PCs and NPCs share the next, told apart by colour.
      const chip = (kind,id,name) => UI.button({text:`${name} (${entriesOf(kind,id).length})`,variant:'quiet',size:'compact',attrs:{class:`timeline-target timeline-target-${kind}`,'data-campaign':'timeline-target','data-id':`${kind}:${id}`,'aria-pressed':pickTarget === `${kind}:${id}`,'aria-label':`${{plots:'Plot',pcs:'PC',npcs:'NPC'}[kind]}: ${name}, ${entriesOf(kind,id).length} entries`}});
      const characters = [...pcs.map(pc => ['pcs',pc.id,label(pc)]),...npcs.map(n => ['npcs',n.id,n.name || 'Unnamed NPC'])].filter(([kind,id]) => onPicker(kind,id)).sort((a,b) => a[2].localeCompare(b[2]));
      const groups = [plots.length ? `<div class="timeline-target-group" role="group" aria-label="Plots">${plots.map(p => chip('plots',p.id,p.title || 'Untitled plot')).join('')}</div>` : '',
        characters.length ? `<div class="timeline-target-group" role="group" aria-label="PCs and NPCs">${characters.map(([kind,id,name]) => chip(kind,id,name)).join('')}</div>` : ''].join('');
      const [kind,id] = pickTarget.split(':'), entries = pickTarget ? entriesOf(kind,id) : [];
      const entryButtons = entries.map(entry => UI.button({text:entry.title,variant:'quiet',size:'compact',attrs:{class:'timeline-entry','data-campaign':'timeline-entry','data-id':entry.id,'aria-pressed':pickNote === entry.id,disabled:used.has(`${kind}:${id}:${entry.id}`),title:used.has(`${kind}:${id}:${entry.id}`) ? 'Already on the timeline' : ''}})).join('');
      controls = `<div class="timeline-pin-controls">${groups ? `<div class="timeline-targets" role="group" aria-label="Plots, PCs and NPCs">${groups}</div>` : ''}${entryButtons ? `<div class="timeline-entries" role="group" aria-label="Entries">${entryButtons}</div>` : ''}</div>`;
    }
    const placing = isGM && selected && pickTarget && pickNote;
    const eventList = events.length ? `<ul class="timeline-notes">${events.map(item => `<li>${UI.button({text:`${item.target.name}: ${item.note.title}`,variant:'quiet',size:'compact',attrs:{'data-campaign':'note-popup','data-id':item.id}})}</li>`).join('')}</ul>` : '';
    // The selectors float over the map's top-left corner (above it on narrow screens).
    const map = `<div class="timeline-stage">${controls}<div class="timeline-map${placing ? ' timeline-map-placing' : ''}"${selected ? ` data-timeline-map="${e(selected.id)}"` : ''}><img src="public/assets/rokugan-map.webp" alt="Map of Rokugan">${pinHtml}</div></div>`;
    return `<div class="timeline">${sessions.length ? `<ol class="timeline-list" aria-label="Sessions">${list}</ol>` : ''}<article class="timeline-detail">${map}<div class="timeline-arrows"></div>${eventList}</article></div>${renderNotePopup()}`;
  }
  // The full entry behind a timeline event, in an overlay dialog.
  // The + buttons open their form in the same popup as Invite (new plot, new NPC, add a PC).
  const popup = (id,title,bodyHtml,closeAction) => `<div class="timeline-popup-backdrop" data-campaign="${closeAction}"></div><div class="timeline-popup campaign-popup" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1"><header><div><h3 id="${id}">${e(title)}</h3></div>${button(closeAction,'✕')}</header>${bodyHtml}</div>`;
  const newOpen = () => (plotDraft && !plotId) || (npcDraft && !npcId) || picking;
  function renderNewPopup(pcs) {
    if (plotDraft && !plotId) return popup('new-popup-title','New plot',entryEditor('plot',plotDraft),'new-close');
    if (npcDraft && !npcId && gm()) return popup('new-popup-title','New NPC',npcEditor(npcDraft),'new-close');
    if (picking) return popup('new-popup-title','Add a PC',`<div class="pc-picker">${window.CharacterBuilder.list().filter(personal=>!pcs.some(pc=>own(pc)&&pc.characterId===personal.id)).map(pc=>button('pc-link',pc.name||'Unnamed PC',pc.id)).join('')}${button('pc-create','Create PC')}</div>${gm() ? inviteSection() : ''}`,'new-close');
    return '';
  }
  // Offers made to you in this campaign: accept saves the PC to your account and links it.
  function renderOffers() {
    const mine = transfers.filter(t => t.toUid === store().uid && t.status === 'offered' && t.campaignId === active);
    return mine.length ? `<div class="campaign-offers">${mine.map(t => `<div class="campaign-offer"><span><strong>${e(memberName(active,t.fromUid))}</strong> offers you <strong>${e(t.name)}</strong></span>${button('transfer-accept','Accept',t.id)}${button('transfer-decline','Decline',t.id)}</div>`).join('')}</div>` : '';
  }
  // Pick a member: the new GM, or who receives a PC.
  function renderTransferPopup(pcs) {
    if (!transferPopup) return '';
    const others = store().list(path('members','')).filter(m => m.id !== store().uid);
    const list = others.length ? `<div class="campaign-transfer-list">${others.map(m => button(transferPopup === 'campaign' ? 'handover-to' : 'pc-transfer-to',m.displayName || 'Player',m.id)).join('')}</div>` : '<p class="campaign-invite-note">Invite another player first.</p>';
    if (transferPopup === 'campaign') return gm() ? popup('transfer-popup-title','Hand over the campaign',`<p class="campaign-invite-note">The member you pick becomes GM at once. You stay in the campaign as a player.</p>${list}`,'transfer-close') : '';
    const pc = pcs.find(item => `pc:${item.id}` === transferPopup);
    return pc && own(pc) ? popup('transfer-popup-title',`Transfer ${label(pc)}`,`<p class="campaign-invite-note">They accept it into their account; then it leaves yours.</p>${list}`,'transfer-close') : '';
  }
  // Keep the live offers, and finish handovers you made once they are accepted.
  function watchTransfers() {
    const backend = store().backend;
    if (backend === transfersBackend) return;
    stopTransfers?.(); transfersBackend = backend; transfers = [];
    stopTransfers = backend?.watchTransfers?.(list => {
      transfers = list;
      for (const t of list) if (t.fromUid === store().uid && t.status === 'accepted' && !cleaning.has(t.id)) {
        cleaning.add(t.id);
        (async () => {
          try {
            await backend.write(`campaigns/${t.campaignId}/pcs/${t.pcId}`,null).catch(() => {});
            window.CharacterBuilder?.remove(t.characterId);
            await backend.dropTransfer(t.id);
          } catch (err) { cleaning.delete(t.id); }
        })();
      }
      changed();
    }) || null;
  }
  // Invite settings (in the + PC popup): the link, Copy link, Replace link and Revoke.
  function inviteSection() {
    if (!inviteLink) return `<div class="campaign-invite"><h4>Invite players</h4><p class="campaign-invite-note">${busy ? 'Preparing the invite link…' : 'No active invite link.'}</p>${busy ? '' : button('invite','New link')}</div>`;
    return `<div class="campaign-invite"><h4>Invite players</h4>
      <div class="campaign-invite-link">${UI.field({attrs:{type:'text',readonly:true,value:inviteLink,'aria-label':'Invite link','data-invite-link':true}})}${UI.button({text:inviteCopied?'Copied':'Copy link',attrs:{'data-campaign':'invite-copy','data-id':'',disabled:busy}})}</div>
      <p class="campaign-invite-note">Expires after seven days.</p>${UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:button('invite','Replace link')+button('revoke','Revoke')})}</div>`;
  }
  const renderInvitePopup = () => '';
  function renderNotePopup() {
    if (!notePopup) return '';
    const item = store().get(path('timeline',notePopup)), target = item && pinTarget(item.kind,item.targetId), note = target && entriesOf(item.kind,item.targetId).find(entry => entry.id === item.noteId);
    if (!note) return '';
    const sectionName = {plots:'Plots',npcs:'NPC',pcs:'PC'}[item.kind];
    return `<div class="timeline-popup-backdrop" data-campaign="note-popup-close"></div><div class="timeline-popup" role="dialog" aria-modal="true" aria-labelledby="timeline-popup-title" tabindex="-1"><header>${target.image ? `<img src="${target.image}" alt="">` : ''}<div><h3 id="timeline-popup-title">${e(note.title)}</h3><small>${e(target.name)} · ${e(note.author)}${note.date ? ` · ${e(day(note.date))}` : ''}</small></div></header><p class="entry-text">${e(note.text)}</p>${UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:button('section',`Open ${sectionName}`,item.kind)+button('note-popup-close','Close')})}</div>`;
  }
  // Section titles are visually hidden; the tabs already name the section. Actions sit on top.
  // Each kind is a grid of tiles with no visible title: its add button is the first tile.
  // The title stays for screen readers; unread entries keep their own "!".
  const sectionBar = title => `<h2 class="visually-hidden">${e(title)}</h2>`;
  const addTile = actionsHtml => actionsHtml ? `<div class="campaign-add-tile">${actionsHtml}</div>` : '';
  function renderSessions(sessions,isGM) {
    const list = [...sessions].sort(byNewest).map(session => entry(`sessions:${session.id}`,`${entryTitle(session.title || 'Untitled session',day(session.updatedAt))}${isUnread(active,'sessions',session) ? unreadMark : ''}`,
      isGM && sessionId === session.id ? `${sessionEditor(session,true)}${notesFor('sessions',session.id)}`
        : `${gallery(session.images)}${readStatus('sessions',session)}${isGM ? UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:button('session-open','Edit',session.id)+button('session-delete','Delete',session.id)}) : ''}${notesFor('sessions',session.id)}`)).join('');
    return `${sectionBar('Sessions')}<div class="campaign-entries">${addTile(isGM?button('session-new','+ Session'):'')}${list}</div>`;
  }
  function renderNPCs(npcs,isGM) {
    const fresh = '';
    const list = [...npcs].sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(npc => entry(`npcs:${npc.id}`,UI.characterTileBody({portrait:npc.portrait,name:npc.name || 'Unnamed NPC',meta:npc.role || ''}),
      isGM && npcId === npc.id ? `${npcEditor(npcDraft || npc)}${notesFor('npcs',npc.id)}`
        : `<div class="campaign-npc">${UI.isPortrait(npc.portrait) ? `<img class="public-pc-picture" src="${npc.portrait}" alt="Picture of ${e(npc.name || 'this NPC')}">` : ''}${npc.role ? `<p class="campaign-npc-role">${e(npc.role)}</p>` : ''}${npc.description ? `<p class="campaign-npc-description entry-text">${e(npc.description)}</p>` : ''}</div>${isGM ? UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:button('npc-open','Edit',npc.id)+button('npc-delete','Delete',npc.id)+pickerToggle('npcs',npc.id)}) : ''}${notesFor('npcs',npc.id)}`,UI.tileArtStyle(UI.isPortrait(npc.portrait) ? npc.portrait : 'public/assets/l5r-mark.webp'))).join('');
    return `${sectionBar('NPCs')}${fresh}<div class="campaign-entries">${addTile(isGM?button('npc-new','+ NPC'):'')}${list}</div>`;
  }
  function renderPCs(pcs,isGM,invitation) {
    const list = pcs.map(pc => {
      const data = sheets.get(pc.id+':public')?.data, profile = data?.profile;
      const pending = transfers.find(t => t.pcId === pc.id && t.fromUid === store().uid && t.status === 'offered');
      const handover = own(pc) ? (pending ? `<span class="campaign-transfer-pending">Offered to ${e(memberName(active,pending.toUid))}</span>${button('transfer-cancel','Cancel offer',pending.id)}` : button('pc-transfer','Transfer',pc.id)) : '';
      const actions = `${button('pc-open',own(pc)?'Edit':isGM?'Full sheet':'Open',pc.id)}${handover}${isGM||own(pc)?button('pc-remove','Remove',pc.id):''}${pickerToggle('pcs',pc.id)}`;
      // Your own PC falls back to its local sheet until its public profile arrives.
      const mine = own(pc) ? window.CharacterBuilder.list().find(c => c.id === pc.characterId) : null;
      return entry(`pcs:${pc.id}`,UI.characterTileBody({portrait:profile?.portrait || mine?.portrait,clan:profile?.clan || mine?.clan,name:label(pc),meta:profile?.family || mine?.family || ''}),
        `${window.PublicCharacter ? window.PublicCharacter.page(data,[],{compact:true}) : ''}${UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:actions})}${notesFor('pcs',pc.id)}`,UI.clanTileStyle(profile?.clan || mine?.clan));
    }).join('');
    const picker = '';
    return `${sectionBar('PCs')}<div class="campaign-entries">${addTile(button('pc-picker','+ PC'))}${list}</div>${picker}`;
  }
  function render(slug) {
    renderAgain ||= () => {};
    if (accountUid !== store().uid) { clearCardSheets(); active = '!'; reset(''); accountUid = store().uid; inviteLoaded = ''; }
    if (slug !== 'campaigns') clearCardSheets();
    if (store().uid) watchTransfers();
    if (!store().uid) { reset(''); return `<div class="workspace"><h1 class="visually-hidden">Campaigns</h1>${button('sign-in','Sign in with Google')}</div>`; }
    if (slug.startsWith('invite/')) {
      reset(''); const token = slug.slice(7);
      if (inviteLoaded !== token) {
        inviteLoaded = token; invite = null; error = '';
        const backend = store().backend;
        backend.invitation(token).then(data=>{if(inviteLoaded===token && store().backend===backend){invite=data;changed();}}).catch(err=>{if(inviteLoaded===token){error='This invitation has expired or was revoked.';changed();}});
      }
      return `<div class="workspace"><h1>Campaign invitation</h1><p>${e(error || (invite ? 'Join this campaign with your signed-in account.' : 'Checking invitation…'))}</p>${invite?button('join','Join campaign',token):''}<a href="#/campaigns">Campaigns</a></div>`;
    }
    if (slug === 'campaigns') {
      reset('');
      const campaigns = store().list('campaigns/');
      watchCardSheets(campaigns);
      return `<div class="workspace"><h1 class="visually-hidden">Campaigns</h1><div class="campaign-toolbar">${button('create','Create campaign')}</div>${statusPanel()}<div class="campaign-list">${campaigns.map(campaignCard).join('') || '<p>No campaigns yet.</p>'}</div>${Object.keys(store().drafts()).length ? UI.disclosure({attrs:{},titleHtml:`Retained drafts`,bodyHtml:`${Object.entries(store().drafts()).map(([path,data])=>`<h3>${e(path)}</h3><pre>${e(data?.text || data?.notes || JSON.stringify(data))}</pre>`).join('')}`}) : ''}</div>`;
    }
    const [campaignPart = '',routeSection = '',itemPart = ''] = slug.slice('campaigns/'.length).split('/');
    reset(resolveCampaign(campaignPart));
    // A new address picks the section and the item it names; later renders keep the state.
    if (slug !== appliedRoute) {
      appliedRoute = slug;
      section = SECTIONS.includes(routeSection) ? routeSection : 'timeline';
      notePopup = '';
      pendingItem = SECTIONS.includes(routeSection) && itemPart ? {kind:routeSection === 'timeline' ? 'sessions' : routeSection,segment:itemPart} : null;
    }
    if (pendingItem && window.Routes) {
      const found = window.Routes.resolve(pendingItem.segment,store().list(path(pendingItem.kind,'')));
      if (found) {
        if (section === 'timeline') { timelineSession = found.id; pickTarget = pickNote = ''; }
        else { openEntries.add(`${pendingItem.kind}:${found.id}`); scrollEntry = `${pendingItem.kind}:${found.id}`; }
        pendingItem = null;
      }
    }
    const c = store().get(`campaigns/${active}`);
    // Older or raw-ID links settle on the readable address once the campaign is known.
    if (c && hasHistory() && campaignPart !== campaignSegment(active)) {
      const rest = slug.split('/').slice(2).map(encodeURIComponent).join('/');
      go(campaignHref(active)+(rest ? '/'+rest : ''),false);
    }
    if (scrollEntry) { const key = scrollEntry; scrollEntry = ''; setTimeout(() => document.querySelector(`.campaign-entry[data-entry="${key}"]`)?.scrollIntoView({block:'start'}),0); }
    if (!c) { reset(''); return '<div class="workspace"><h1>Campaign unavailable</h1><p>Loading, or membership is no longer active.</p><a href="#/campaigns">Campaigns</a></div>'; }
    const isGM = gm(), sessions = store().list(path('sessions','')), npcs = store().list(path('npcs','')), pcs = store().list(path('pcs',''));
    migratePCNotes();
    migrateDescriptions();
    const plots=store().list(path('plots',''));
    if(plotId&&!plots.some(p=>p.id===plotId)){plotId='';plotDraft=null;if(noteTarget?.kind==='plots'){noteTarget=noteDraft=null;noteId='';}}
    if (sessionId && !sessions.some(s=>s.id===sessionId)) sessionId = '';
    const s = sessions.find(s=>s.id===sessionId), n = npcDraft || npcs.find(n=>n.id===npcId);
    for (const pc of pcs) watch(pc);
    for (const [key,stop] of stops) if (!pcs.some(pc=>key.startsWith(pc.id+':'))) { stop?.(); stops.delete(key); sheets.delete(key); }
    const selectedPC = pcs.find(pc=>pc.id===sheetId);
    if (selectedPC && isGM && !own(selectedPC)) watch(selectedPC,true);
    const invitation = isGM ? store().get(path('private','invitation')) : null;
    return `<div class="workspace campaign-workspace campaign-workspace-wide"><div class="workspace-head" data-topbar-head>${isGM?UI.field({labelAttrs:{'class':'campaign-title'},attrs:{'data-campaign-field':'title','maxlength':'200','value':c.title,'aria-label':'Campaign title'}}):`<h1>${e(c.title)}</h1>`}${isGM?button('handover','Hand over')+button('delete-campaign','Delete campaign'):button('leave','Leave campaign')}</div>${statusPanel()}
      ${renderOffers()}<div class="campaign-rows">
      <section class="home-row campaign-row" data-campaign-row="sessions">${renderSessions(sessions,isGM)}</section>
      <section class="home-row campaign-row" data-campaign-row="plots">${renderPlots(plots)}</section>
      <section class="home-row campaign-row" data-campaign-row="npcs">${renderNPCs(npcs,isGM)}</section>
      <section class="home-row campaign-row" data-campaign-row="pcs">${renderPCs(pcs,isGM,invitation)}</section>
      <section class="campaign-row campaign-timeline-row" data-campaign-row="timeline">${UI.panel({attrs:{'class':'panel campaign-content'},bodyHtml:`<h2 class="visually-hidden">Timeline</h2>${renderTimeline(isGM,pcs,npcs,plots)}`})}</section>
      </div>${renderTransferPopup(pcs)}${renderNewPopup(pcs)}${renderInvitePopup()}${selectedPC&&isGM&&!own(selectedPC)?'<div id="campaign-editor"></div>':''}</div>`;
  }
  // Pins scrolled out of view get an arrow at the window's edge pointing toward them;
  // clicking an arrow brings its pin into view. Arrows show only while the map is on screen.
  let arrowFrame = 0;
  function updatePinArrows() {
    arrowFrame = 0;
    const layer = document.querySelector('.timeline-arrows'), map = document.querySelector('.timeline-map');
    const width = document.documentElement.clientWidth, height = window.innerHeight;
    document.documentElement.style.setProperty('--page-width',`${width}px`);
    if (!layer || !map) return;
    const box = map.getBoundingClientRect(), pad = 28;
    const html = box.bottom <= 0 || box.top >= height ? '' : [...map.querySelectorAll('.timeline-pin')].map(pin => {
      const r = pin.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x >= 0 && x <= width && y >= 0 && y <= height) return '';
      const cx = Math.min(width - pad,Math.max(pad,x)), cy = Math.min(height - pad,Math.max(pad,y));
      const angle = Math.round(Math.atan2(y - cy,x - cx) * 180 / Math.PI);
      const image = pin.querySelector('img')?.getAttribute('src');
      const kind = [...pin.classList].find(name => name.startsWith('timeline-pin-') && name !== 'timeline-pin-open')?.slice(13) || '';
      const name = pin.querySelector('.timeline-pin-open')?.getAttribute('aria-label') || '';
      return `<button type="button" class="timeline-arrow timeline-arrow-${e(kind)}" data-campaign="timeline-arrow" data-id="${e(pin.dataset.pinId)}" style="left:${Math.round(cx)}px;top:${Math.round(cy)}px" title="${e(name)}" tabindex="-1" aria-hidden="true"><span class="timeline-arrow-head" style="transform:rotate(${angle}deg)"></span>${image ? `<img src="${e(image)}" alt="">` : '<span class="timeline-arrow-dot"></span>'}</button>`;
    }).join('');
    if (layer.dataset.html !== html) { layer.dataset.html = html; layer.innerHTML = html; }
  }
  const schedulePinArrows = () => { if (!arrowFrame) arrowFrame = requestAnimationFrame(updatePinArrows); };
  window.addEventListener('scroll',schedulePinArrows,{passive:true});
  window.addEventListener('resize',schedulePinArrows);
  function mountEditor() {
    schedulePinArrows();
    const mapImage = document.querySelector('.timeline-map>img');
    if (mapImage && !mapImage.complete) mapImage.addEventListener('load',schedulePinArrows,{once:true});
    // Move focus into a timeline note popup once, right after it opens.
    if (focusPopup) { focusPopup=false; document.querySelector('.timeline-popup')?.focus(); }
    const target = document.getElementById('campaign-editor');
    if (!target || !sheetId) return;
    const item = sheets.get(sheetId+':full');
    if (!item?.data) { target.textContent = 'Loading full sheet…'; return; }
    // Only a sheet's creator edits it; the GM gets a read-only copy of the full sheet.
    window.CharacterBuilder.mount(target,{sheet:JSON.parse(item.data.sheetJson),readOnly:true,journal:{owner:item.pc.ownerUid,characterId:item.pc.characterId},returnHref:campaignHref(active,'pcs'),save(){},close(){sheetId='';editor=null;changed();}});
    editor = item.data.revision;
  }
  function refresh(renderPage) {
    renderAgain = renderPage;
    const focused = document.activeElement;
    // The title field may sit in the top strip; keep typing there undisturbed too.
    if (focused && (document.getElementById('app')?.contains(focused) || document.getElementById('topbar-page')?.contains(focused)) && ['INPUT','TEXTAREA','SELECT'].includes(focused.tagName)) {
      const status = document.querySelector('.campaign-status'); if(status){status.textContent=statusMessage();status.hidden=!statusMessage();}
      return;
    }
    renderPage();
  }
  // The campaign's current invite link (reusing a still-valid one unless a fresh one is asked for).
  async function loadInvite(backend,fresh) {
    const campaign=active;
    let token=fresh?null:(await backend.get(path('private','invitation')))?.token;
    if (token) {
      try {await backend.invitation(token);}
      catch (err) {
        if(err.code!=='permission-denied' && err.message!=='This invitation has expired or was revoked.')throw err;
        token=null;
      }
    }
    token ||= await backend.invite(campaign);
    if(active!==campaign || store().backend!==backend || !gm())return;
    inviteLink=inviteURL(token);inviteCopied=false;
  }
  async function act(action,id) {
    if (busy) return;
    // Signed out: use the account menu's own sign-in (open the menu if it isn't ready yet).
    if (action === 'sign-in') { const signIn = document.getElementById('account-sign-in'); if (signIn && !signIn.disabled) signIn.click(); else document.querySelector('.account-menu')?.setAttribute('open',''); return; }
    const backend = store().backend;
    error = ''; busy = true;
    try {
      if (!backend) throw new Error('Sign in first.');
      if (action==='create') {
        const title = window.prompt('Campaign title'); if (!title?.trim()) return;
        location.hash = '#/campaigns/'+await backend.create(title.trim().slice(0,200));
      } else if (action==='join') location.hash='#/campaigns/'+await backend.join(id);
      else if (action==='entry-close') {openEntries.delete(id);go(campaignHref(active),false);}
      else if (action==='section') {if(SECTIONS.includes(id)){section=id;notePopup='';go(id==='timeline'&&timelineSession?campaignHref(active,'timeline','sessions',timelineSession):campaignHref(active,id));}}
      else if (action==='pc-notes') pcNotesId=pcNotesId===id?'':id;
      else if (action==='plot-new') {plotId='';plotDraft={title:'',text:'',public:true};focusPopup=true;}
      else if (action==='plot-open') {plotId=id;plotDraft=null;openEntries.add(`plots:${id}`);}
      else if (action==='plot-edit') {const data=store().get(path('plots',id));if(data&&entryOwner(data)){plotId=id;plotDraft={...data};openEntries.add(`plots:${id}`);}}
      else if (action==='plot-cancel') plotDraft=null;
      else if (action==='timeline-visibility' && gm()) {
        const c=store().get(`campaigns/${active}`),hidden=new Set(c?.timelineHidden||[]);
        if(hidden.has(id))hidden.delete(id);else hidden.add(id);
        store().queue(`campaigns/${active}`,{...c,timelineHidden:[...hidden]});
        if(!onPicker(...id.split(':'))&&pickTarget===id){pickTarget='';pickNote='';}
      }
      else if (action==='timeline-session') {timelineSession=id;pickTarget='';pickNote='';go(campaignHref(active,'timeline','sessions',id));}
      else if (action==='timeline-target' && gm()) {pickTarget=pickTarget===id?'':id;pickNote='';}
      else if (action==='timeline-entry' && gm()) pickNote=pickNote===id?'':id;
      else if (action==='note-popup') {notePopup=id;focusPopup=true;}
      else if (action==='note-popup-close') {const back=notePopup;notePopup='';setTimeout(()=>document.querySelector(`[data-campaign="note-popup"][data-id="${back}"]`)?.focus(),0);}
      else if (action==='timeline-unpin' && gm()) {if(window.confirm('Remove this event from the map?'))store().queue(path('timeline',id),null);}
      else if (action==='mark-read') {const [kind,entryId]=id.split(':');if(READ_KINDS.includes(kind))markRead(kind,entryId);}
      else if (action==='image-remove') {
        const [kind,index]=id.split(':');
        if (kind==='plot' && plotDraft) plotDraft.images=(plotDraft.images||[]).filter((_,i)=>i!==Number(index));
        if (kind==='session' && gm()) { const session=store().get(path('sessions',sessionId)); if(session) store().queue(path('sessions',sessionId),{...session,images:(session.images||[]).filter((_,i)=>i!==Number(index)),updatedAt:new Date().toISOString()}); }
      }
      else if (action==='note-new') {const [kind,targetId]=id.split(':');if(!canAddEntry(kind,targetId))return;noteId='';noteTarget={kind,id:targetId};noteDraft={title:'',text:'',public:true};}
      else if (action==='note-edit') {const data=store().get(path('notes',id));if(data&&entryOwner(data)){noteId=id;noteTarget={kind:data.targetKind,id:data.targetId};noteDraft={...data};}}
      else if (action==='note-cancel') {noteDraft=noteTarget=null;noteId='';}
      else if (action==='plot-save'||action==='note-save') {
        const plot=action==='plot-save',draft=plot?plotDraft:noteDraft;
        if(plot?!draft?.title?.trim():!draft?.text?.trim())return;
        const now=new Date().toISOString(),entryId=(plot?plotId:noteId)||crypto.randomUUID();
        // Privacy is paused: every plot and note is shared, including ones saved as private before.
        const data={...draft,public:true,creatorUid:store().uid,createdAt:draft.createdAt||now,updatedAt:now,revision:crypto.randomUUID()};
        data.title=(data.title||'').trim();data.text=data.text||'';
        if(plot){} else {
          Object.assign(data,{targetKind:noteTarget.kind,targetId:noteTarget.id});
          if(noteTarget.kind==='plots')data.targetCreatorUid=store().get(path('plots',noteTarget.id))?.creatorUid;
        }
        delete data.id;
        store().queue(path(plot?'plots':'notes',entryId),data);
        // Your own changes count as read by you.
        if(plot)markRead('plots',entryId);else if(READ_KINDS.includes(noteTarget.kind))markRead(noteTarget.kind,noteTarget.id);
        if(plot){plotId=entryId;plotDraft=null;openEntries.add(`plots:${entryId}`);}else{noteId='';noteDraft=noteTarget=null;}
        store().flush();
      }
      else if(action==='plot-delete'||action==='note-delete') {
        const kind=action==='plot-delete'?'plots':'notes',data=store().get(path(kind,id));
        if(data&&entryOwner(data)&&window.confirm(`Delete this ${kind==='plots'?'plot point and its journal':'journal entry'}?`)) {
          store().queue(path(kind,id),null);store().flush();
          if(kind==='plots'){plotId='';plotDraft=null;}else if(noteId===id){noteId='';noteDraft=noteTarget=null;}
        }
      }
      else if (action==='session-new') { const now=new Date().toISOString();sessionId=crypto.randomUUID();openEntries.add(`sessions:${sessionId}`);store().queue(path('sessions',sessionId),{title:'New session',text:'',createdAt:now,updatedAt:now}); }
      else if (action==='session-open') {sessionId=id;openEntries.add(`sessions:${id}`);}
      else if (action==='session-save') {
        const session=store().get(path('sessions',sessionId));
        if(!gm() || !session)return;
        store().queue(path('sessions',sessionId),{...session,updatedAt:new Date().toISOString()});
        markRead('sessions',sessionId);
        sessionId='';store().flush();
      }
      else if (action==='session-close') sessionId='';
      else if (action==='session-delete') {if(window.confirm('Delete this session?'))store().queue(path('sessions',id),null);}
      else if (action==='npc-new') {npcId='';npcDraft={name:'',role:'',description:'',notes:''};focusPopup=true;}
      else if (action==='npc-open') {npcId=id;npcDraft=null;openEntries.add(`npcs:${id}`);}
      else if (action==='npc-portrait-remove') setNPCPortrait('');
      else if (action==='npc-portrait-create' && gm() && window.PortraitCreator?.open) {
        const npc=npcDraft || store().get(path('npcs',npcId));
        window.PortraitCreator.open({title:npc?.name || 'this NPC',returnHref:campaignHref(active,'npcs'),onUse:picture=>setNPCPortrait(picture)});
      }
      else if (action==='npc-save') {
        const draft=npcDraft || store().get(path('npcs',npcId));
        if (!gm() || !draft || !draft.name.trim()) return;
        store().queue(path('npcs',npcId || crypto.randomUUID()),{name:draft.name.trim(),role:String(draft.role || '').trim().slice(0,200),description:String(draft.description || '').slice(0,20000),notes:'',...(UI.isPortrait(draft.portrait)?{portrait:draft.portrait}:{}),updatedAt:new Date().toISOString()});
        npcId='';npcDraft=null;
        store().flush();
      }
      else if (action==='npc-delete') {if(window.confirm('Delete this NPC?'))store().queue(path('npcs',id),null);}
      else if (action==='pc-picker') {
        picking=!picking;focusPopup=picking;
        // The GM's + PC popup also holds the invite link, so players can be invited from it.
        if (picking && gm()) { changed(); await loadInvite(backend,false); }
      }
      else if (action==='pc-link') {await backend.link(active,id);picking=false;}
      else if (action==='pc-create') {const campaign=active;const id=window.CharacterBuilder.create();await backend.link(campaign,id);picking=false;creatorCampaign=campaign;location.hash=window.CharacterBuilder.href(id);}
      else if (action==='pc-open') {
        const pc=store().get(path('pcs',id));
        if(!pc)return;
        if (own(pc)) {window.CharacterBuilder.open(pc.characterId);creatorCampaign=active;location.hash=window.CharacterBuilder.href(pc.characterId);}
        // The GM reads the full sheet; other players see the public view.
        else if (gm()) {sheetId=id;editor=null;}
        else location.hash=`#/pc/${encodeURIComponent(pc.ownerUid)}/${encodeURIComponent(pc.characterId)}`;
      } else if (action==='pc-remove') {store().queue(path('pcs',id),null);sheetId='';}
      else if (action==='close-sheet') {sheetId='';editor=null;}
      else if (action==='share-invite'||action==='invite') {
        if (!gm()) return;
        await loadInvite(backend,action==='invite');
      }
      else if (action==='invite-copy') {
        try { await navigator.clipboard.writeText(inviteLink); inviteCopied=true; }
        catch { window.prompt('Copy this invite link:',inviteLink); }
      }
      else if (action==='invite-close') {inviteLink='';inviteCopied=false;}
      else if (action==='handover') {transferPopup='campaign';focusPopup=true;}
      else if (action==='pc-transfer') {transferPopup=`pc:${id}`;focusPopup=true;}
      else if (action==='transfer-close') transferPopup='';
      else if (action==='handover-to') {
        if (!gm() || !window.confirm(`Make ${memberName(active,id)} the GM? You stay in the campaign as a player.`)) return;
        await backend.handOver(active,id);transferPopup='';
      }
      else if (action==='pc-transfer-to') {
        const pc=store().get(path('pcs',transferPopup.slice(3)));
        if (!pc || !own(pc)) return;
        const record=window.CharacterStorage.records().find(r=>r.id===pc.characterId);
        if (!record) throw new Error('This PC is not in this browser yet.');
        await backend.offerPC(active,transferPopup.slice(3),id,record.sheet,label({...pc,id:transferPopup.slice(3)}));transferPopup='';
      }
      else if (action==='transfer-cancel'||action==='transfer-decline') await backend.dropTransfer(id);
      else if (action==='transfer-accept') {
        const t=transfers.find(item=>item.id===id && item.toUid===store().uid && item.status==='offered');
        if (!t) return;
        const characterId=window.CharacterBuilder.adopt(JSON.parse(t.sheetJson));
        const pcId=await backend.link(t.campaignId,characterId);
        await backend.acceptPC(t.id,pcId);
      }
      else if (action==='new-close') {if(!plotId)plotDraft=null;if(!npcId)npcDraft=null;picking=false;inviteLink='';inviteCopied=false;}
      else if (action==='revoke') {await backend.revoke(active);inviteLink='';inviteCopied=false;}
      else if (action==='member-remove'||action==='leave') {
        if (!window.confirm(action==='leave'?'Leave this campaign?':'Remove this member and their PC associations?'))return;
        await backend.removeMember(active,action==='leave'?store().uid:id);
        if(action==='leave')location.hash='#/campaigns';
      } else if (action==='delete-campaign') {
        if(!window.confirm('Delete this campaign, its sessions, NPCs, plots, notes, and memberships? Personal PCs are preserved.'))return;
        await store().flush();await backend.deleteCampaign(active);location.hash='#/campaigns';
      }
    } catch(err) {error=err.code==='permission-denied'?'Access denied. Check membership or invitation expiry.':err.message;}
    finally {busy=false;changed();}
  }
  document.addEventListener('click',event=>{const b=event.target.closest('[data-campaign]');
    if(b?.dataset.campaign==='timeline-arrow'){const pin=document.querySelector(`.timeline-pin[data-pin-id="${CSS.escape(b.dataset.id)}"]`);if(pin){const r=pin.getBoundingClientRect();window.scrollTo({top:window.scrollY+r.top+r.height/2-window.innerHeight/2,left:window.scrollX+r.left+r.width/2-document.documentElement.clientWidth/2,behavior:'smooth'});}return;}
    if(b)act(b.dataset.campaign,b.dataset.id);else placePin(event);});
  // A new NPC keeps its picture in the draft until saved; an existing NPC saves it at once.
  function setNPCPortrait(url) {
    if (!gm()) return;
    if (npcDraft) { if (url) npcDraft.portrait=url; else delete npcDraft.portrait; return; }
    const data=store().get(path('npcs',npcId));
    if (!data) return;
    const next={...data,updatedAt:new Date().toISOString()};
    if (url) next.portrait=url; else delete next.portrait;
    store().queue(path('npcs',npcId),next);
  }
  // Placing pins: choose a PC, NPC or plot, then click the map; the pin is stored in percent.
  // Placing an event: choose a plot, PC or NPC and one of its notes, then click the map.
  // Choosing a note already on this session's map moves it. Positions are stored in percent.
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&notePopup){event.preventDefault();act('note-popup-close');}});
  function placePin(event) {
    const map=event.target.closest?.('[data-timeline-map]');
    if(!map||!pickTarget||!pickNote||!gm()||event.target.closest('.timeline-pin')||event.target.closest('.timeline-pin-controls'))return;
    const sessionId=map.dataset.timelineMap,[kind,targetId]=pickTarget.split(':');
    const rect=map.getBoundingClientRect(),x=Math.round((event.clientX-rect.left)/rect.width*1000)/10,y=Math.round((event.clientY-rect.top)/rect.height*1000)/10;
    const now=new Date().toISOString(),existing=store().list(path('timeline','')).find(item=>item.kind===kind&&item.targetId===targetId&&item.noteId===pickNote);
    store().queue(path('timeline',existing?.id||crypto.randomUUID()),{sessionId,kind,targetId,noteId:pickNote,x:Math.min(100,Math.max(0,x)),y:Math.min(100,Math.max(0,y)),createdAt:existing?.createdAt||now,updatedAt:now});
    pickTarget='';pickNote='';changed();
  }
  document.addEventListener('change',async event=>{
    const imageKind=event.target.dataset?.entryImage;
    if (imageKind) {
      const file=event.target.files?.[0]; event.target.value='';
      if (!file) return;
      try {
        const picture=await UI.readPortrait(file);
        if (!picture) return;
        if (imageKind==='plot' && plotDraft) plotDraft.images=[...(plotDraft.images||[]),picture].slice(0,MAX_IMAGES);
        if (imageKind==='session' && gm()) { const session=store().get(path('sessions',sessionId)); if(session) store().queue(path('sessions',sessionId),{...session,images:[...(session.images||[]),picture].slice(0,MAX_IMAGES),updatedAt:new Date().toISOString()}); }
      } catch (err) { error=err.message || 'This image could not be read.'; }
      changed(); return;
    }
    if (event.target.dataset?.npcPortrait === undefined) return;
    const file=event.target.files?.[0], editing=npcDraft || npcId;
    // Clear the input so choosing the same file again still opens the cropper.
    event.target.value='';
    if (!file) return;
    try {
      const url=await UI.readPortrait(file);
      // Ignore a picture chosen after another NPC was opened; Cancel keeps the current one.
      if (!url || (npcDraft || npcId) !== editing) return;
      setNPCPortrait(url);
    } catch (err) { error=err.message || 'This picture could not be read.'; }
    changed();
  });
  document.addEventListener('input',event=>{
    const entryField=event.target.dataset.entryField;
    if(entryField) {
      const kind=event.target.dataset.entryKind,draft=kind==='plot'?plotDraft:noteDraft;
      if(!draft)return;
      draft[entryField]=event.target.value;
      const save=document.querySelector(`[data-campaign="${kind}-save"]`);
      if(save)save.disabled=busy||!draft.text.trim()||(kind==='plot'&&!draft.title.trim());
      return;
    }
    const field=event.target.dataset.campaignField;if(!field||!gm())return;
    if (field==='npc-name') {
      const save=document.querySelector('[data-campaign="npc-save"]');
      if(save)save.disabled=busy || !event.target.value.trim();
    }
    if (field.startsWith('npc-') && npcDraft) {
      npcDraft[field.slice(4)]=event.target.value;
      return;
    }
    if(field==='title') {const c=store().get(`campaigns/${active}`);if(event.target.value.trim())store().queue(`campaigns/${active}`,{...c,title:event.target.value});return;}
    const kind=field.startsWith('session-')?'sessions':'npcs',id=kind==='sessions'?sessionId:npcId;
    const key={title:'title',text:'text',name:'name',role:'role',description:'description'}[field.split('-')[1]] || 'notes';
    const data=store().get(path(kind,id));if(data)store().queue(path(kind,id),{...data,[key]:event.target.value,updatedAt:new Date().toISOString()});
  });
  document.addEventListener('focusout',event=>{
    if (event.relatedTarget?.closest('[data-campaign]') || (event.target.dataset.campaignField?.startsWith('npc-') && npcDraft)) return;
    if(event.target.dataset.campaignField)setTimeout(()=>{if(renderAgain)refresh(renderAgain);},0);
  });
  window.addEventListener('hashchange',()=>{if(location.hash!=='#/campaigns')clearCardSheets();if(!location.hash.startsWith('#/invite/')) {inviteLoaded='';invite=null;} if(!location.hash.startsWith('#/create-character')&&!location.hash.startsWith('#/characters/')&&!(decodedRoute().startsWith('campaigns/')&&resolveCampaign(decodedRoute().split('/')[1])===creatorCampaign))creatorCampaign=null;});
  // Start page row: the campaign cards (or Sign in).
  function homeCampaigns() {
    if (!store().uid) return {signedIn:false,html:button('sign-in','Sign in with Google')};
    const campaigns = store().list('campaigns/');
    watchCardSheets(campaigns);
    return {signedIn:true,html:campaigns.map(campaignCard).join(''),create:button('create','+ Campaign')};
  }
  window.CampaignUI={render,refresh,mountEditor,homeCampaigns,creatorReturn:()=>creatorCampaign?campaignHref(creatorCampaign,'pcs'):null};
})();
