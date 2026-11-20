(() => {
  const UI = window.UI;
  const store = () => window.CampaignStorage;
  const e = UI.escape;
  let accountUid = null, active = '', section = 'timeline', sessionId = '', npcId = '', npcDraft = null, sheetId = '', picking = false, error = '', busy = false, editor = null, creatorCampaign = null, renderAgain, watchGeneration = 0;
  let plotId='', plotDraft=null, sessionDraft=null, noteId='', noteDraft=null, noteTarget=null, pcNotesId='';
  let timelineSession='', notePopup='', clanPopup='', focusPopup=false;
  const trayClosed=new Set();
  // Handovers: live PC offers to and from this account, and which handover popup is open
  // ('campaign' for the GM handover, or 'pc:<pcId>' for a PC offer).
  let transfers=[], transferPopup='', stopTransfers=null, transfersBackend=null;
  const cleaning=new Set();
  const sheets = new Map(), stops = new Map();
  const cardSheets = new Map();
  const changed = () => window.dispatchEvent(new Event('campaign-sheet-changed'));
  const button = (action,text,id='',disabled=false) => UI.button({text,variant:action!=='pc-picker'&&/cancel|close|edit|open|notes|link|picker|delete-campaign|leave|invite|entry-close|revoke|handover|transfer|decline|withdraw|library|map-|arrange/.test(action)?'secondary':'primary',attrs:{'data-campaign':action,'data-id':id,disabled:busy||disabled}});
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
    // Eight id characters, so the public campaign lookup can find a shared link (see notInvited).
    return window.Routes && campaign ? window.Routes.segment(campaign.title || 'campaign',id,campaigns.map(item => item.id),8) : id;
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
  // Apps that open links in their own browser (WhatsApp, Instagram, Facebook, Line, TikTok…),
  // where Google refuses to sign in.
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
  const unreadMark = '<span class="campaign-unread" title="Updated since you last opened it" aria-label="Unread update">!</span>';
  // "Read by" names, visible to everyone. Opening a session or plot marks it read.
  function readStatus(kind,item) {
    const readers = readersOf(active,kind,item);
    return readers.length ? `<p class="campaign-read-status"><small title="Read by" aria-label="Read by ${e(readers.join(', '))}">✓ ${readers.map(e).join(', ')}</small></p>` : '';
  }
  function markOpenRead() {
    for (const key of openEntries) {
      const [kind,id] = key.split(':'), item = READ_KINDS.includes(kind) && store().get(path(kind,id));
      if (item && isUnread(active,kind,{...item,id})) markRead(kind,id);
    }
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
    plotId=noteId=pcNotesId='';plotDraft=sessionDraft=noteDraft=noteTarget=null;
    timelineSession='';notePopup='';clanPopup='';transferPopup='';
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
    const thumbs = list.map((src,index) => `<figure class="campaign-image"><img src="${UI.imageLink(src)}" alt="Image ${index+1}">${editable ? button('image-remove','Remove',`${kind}:${index}`) : ''}</figure>`).join('');
    // Pictures come from the library, where an image can also be uploaded or linked.
    const add = editable && list.length < MAX_IMAGES ? button('image-library','Add image',kind) : '';
    return thumbs || add ? `<div class="campaign-images">${thumbs}${add}</div>` : '';
  }
  // Sessions and plots share one editor: a title, a first entry when new, pictures, and
  // Save, Cancel and (for one that exists) Delete. kind is 'plot' or 'session'.
  function entryEditor(kind,draft) {
    const editingId=kind==='plot'?plotId:sessionId,name=kind==='plot'?'plot':'session';
    const attrs = key => ({'data-entry-field':key,'data-entry-kind':kind});
    return UI.recordEditor({attrs:{class:'entry-editor','data-entry-editor':kind},fields:[
      {label:kind==='plot'?'Plot title':'Session title',value:draft.title,attrs:{...attrs('title'),maxlength:200}},
      // A new one can start its journal at once; later entries come from "Add Entry".
      ...(!editingId?[{label:'First entry',kind:'textarea',value:draft.firstEntry||'',attrs:{...attrs('firstEntry'),rows:6,maxlength:20000,placeholder:`What is this ${name} about?`}}]:[]),
    ],extraHtml:gallery(draft.images,{kind,editable:true}),actionsHtml:button(kind+'-save',`Save ${name}`,'',!String(draft.title||'').trim())+button(kind+'-cancel','Cancel')+(editingId?button(kind+'-delete',`Delete ${name}`,editingId):'')});
  }
  function npcEditor(npc) {
    const picture = UI.portrait({label:'NPC picture',src:npc.portrait,name:npc.name,attrs:{class:'npc-portrait'},inputAttrs:{'data-npc-portrait':true},removeAttrs:{'data-campaign':'npc-portrait-remove','aria-label':'Remove NPC picture'},actionsHtml:button('npc-portrait-create','Create picture')+(window.MediaLibrary?button('npc-portrait-library','Library'):'')});
    return picture+UI.recordEditor({fields:[
      {label:'Name',value:npc.name,attrs:{'data-campaign-field':'npc-name',maxlength:200}},
      {label:'Role',value:npc.role || '',attrs:{'data-campaign-field':'npc-role',maxlength:200,placeholder:'e.g. Magistrate of the Lion'}},
      {label:'Description',kind:'textarea',value:npc.description || '',attrs:{'data-campaign-field':'npc-description',maxlength:20000,rows:4}},
    ],extraHtml:UI.checkbox({label:'Place (a location, not a person)',attrs:{'data-npc-place':true,checked:isPlace(npc)}}),actionsHtml:button('npc-save','Save','',!npc.name.trim())});
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
  // The GM's older clan NPCs, named "- Crab" (or "- Clã do Caranguejo"…): their journal entries
  // are copied once into the matching built-in clan, keeping their dates (so their order). A copy
  // has a fixed id, so it is never made twice; this device remembers what it copied, so a copy
  // that is deleted does not come back.
  const CLAN_WORDS = {Crab:/\b(crab|caranguejo)\b/,Crane:/\b(crane|garca)\b/,Dragon:/\b(dragon|dragao)\b/,Lion:/\b(lion|leao)\b/,Mantis:/\b(mantis|louva.a.deus)\b/,Phoenix:/\b(phoenix|fenix)\b/,Scorpion:/\b(scorpion|escorpiao)\b/,Unicorn:/\b(unicorn|unicornio)\b/,Imperial:/\b(imperial|imperiais|imperio)\b/};
  const clanOfNPC = npc => { const name = String(npc.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if (!/^\s*[-–—]/.test(name)) return ''; const found = CLANS.filter(c => CLAN_WORDS[c].test(name)); return found.length === 1 ? found[0] : ''; };
  // Characters already in the campaign go into their clan once, on the GM's device: a PC by the
  // clan on its sheet, an NPC that sat under an older "- Crab" NPC into that clan, any other
  // person by a family name in their name (Kuni → Crab). Places and unknown families stay put,
  // and anything moved or taken out by hand afterwards is left alone.
  const FAMILIES = {Crab:'Hida Hiruma Kaiu Kuni Yasuki Toritaka',Crane:'Doji Daidoji Kakita Asahina',Dragon:'Mirumoto Togashi Kitsuki Tamori',Lion:'Akodo Ikoma Kitsu Matsu',
    Mantis:'Yoritomo Moshi Tsuruchi',Phoenix:'Shiba Isawa Asako Agasha',Scorpion:'Bayushi Shosuro Soshi Yogo',Unicorn:'Shinjo Utaku Moto Iuchi Ide Horiuchi',Imperial:'Otomo Seppun Miya Toturi Hantei'};
  const FAMILY_CLAN = new Map(Object.entries(FAMILIES).flatMap(([clan,names]) => names.toLowerCase().split(' ').map(name => [name,clan])));
  const clanByFamily = text => { const found = new Set(String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z]+/).map(word => FAMILY_CLAN.get(word)).filter(Boolean)); return found.size === 1 ? [...found][0] : ''; };
  const clanFromSheet = profile => CLANS.find(clan => clan.toLowerCase() === String(profile?.clan || '').trim().toLowerCase()) || (profile?.clan ? '' : clanByFamily(profile?.family));
  // What this device already did once, kept in memory too when browser storage is unavailable.
  const rememberedSets = new Map();
  const remembered = key => { if (!rememberedSets.has(key)) { let list = []; try { list = JSON.parse(localStorage.getItem(key)) || []; } catch {} rememberedSets.set(key,new Set(list)); } return rememberedSets.get(key); };
  function placeInClans() {
    const uid = store().uid; if (!gm() || !uid) return;
    const doneKey = `l5r-rules-account-${uid}-clan-places-v1`, done = remembered(doneKey);
    const before = done.size, now = new Date().toISOString();
    const place = (key,clan) => { const mark = `${active}/${key}`; if (!clan || done.has(mark)) return; done.add(mark);
      store().queue(path('tree',key),{parentKind:'clans',parentId:clan,updatedAt:now}); };
    const linkOf = key => store().get(path('tree',key));
    for (const pc of store().list(path('pcs',''))) { const key = `pcs:${pc.id}`, profile = sheets.get(pc.id+':public')?.data?.profile;
      if (profile && !linkOf(key)) place(key,clanFromSheet(profile)); }
    for (const npc of store().list(path('npcs',''))) { const key = `npcs:${npc.id}`, link = linkOf(key);
      if (clanOfNPC(npc) || isPlace(npc)) continue;
      if (link?.parentKind === 'npcs') { const old = store().get(path('npcs',link.parentId)); if (old && clanOfNPC(old)) place(key,clanOfNPC(old)); }
      else if (!link) place(key,clanByFamily(npc.name)); }
    if (done.size !== before) try { localStorage.setItem(doneKey,JSON.stringify([...done])); } catch {}
  }
  function copyClanNPCNotes() {
    const uid = store().uid; if (!gm() || !uid) return;
    const doneKey = `l5r-rules-account-${uid}-clan-copies-v1`, done = remembered(doneKey);
    const before = done.size;
    for (const npc of store().list(path('npcs',''))) { const clan = clanOfNPC(npc); if (!clan) continue;
      for (const note of store().list(path('notes','')).filter(n => n.targetKind === 'npcs' && n.targetId === npc.id && n.creatorUid === uid && String(n.text || '').trim())) {
        const copyId = `clan_${note.id}`.slice(0,120), mark = `${active}/${copyId}`;
        if (done.has(mark)) continue;
        done.add(mark);
        if (store().get(path('notes',copyId))) continue;
        const now = new Date().toISOString();
        store().queue(path('notes',copyId),{title:note.title || '',text:note.text,public:true,creatorUid:uid,createdAt:note.createdAt || note.updatedAt || now,updatedAt:now,revision:crypto.randomUUID(),targetKind:'clans',targetId:clan});
      } }
    if (done.size !== before) try { localStorage.setItem(doneKey,JSON.stringify([...done])); } catch {}
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
    if (kind === 'clans') return CLANS.includes(id);
    if (kind === 'npcs') return gm();
    if (kind === 'plots') return gm() || store().get(path('plots',id))?.creatorUid === store().uid;
    return false;
  }
  // Sessions, plots and NPCs use the same journal as characters (UI.journal): titled entries.
  // addInRow: "Add Entry" sits in the panel's own button row (entryActions) instead of the journal head.
  function notesFor(kind,id,{addInRow = false} = {}) {
    const notes=store().list(path('notes','')).filter(n=>n.targetKind===kind&&n.targetId===id);
    const drafting=noteTarget?.kind===kind&&noteTarget?.id===id&&noteDraft;
    const canAdd=canAddEntry(kind,id)&&!addInRow;
    if(!notes.length&&!canAdd&&!drafting)return '';
    const numbers=numberedNotes();
    const entries=notes.map(n=>({id:n.id,number:numbers.get(noteKey(kind,id,n.id))?.number,toolsHtml:['npcs','pcs','clans'].includes(kind)?unpinButton(noteKey(kind,id,n.id),true):'',title:n.title||'',text:n.text||'',date:n.createdAt||n.updatedAt||'',author:entryAuthor(n),canEdit:entryOwner(n),canDelete:entryOwner(n)}));
    const control=(name,entryId)=>({'data-campaign':`note-${name}`,'data-id':name==='new'?`${kind}:${id}`:entryId,disabled:busy});
    const field=name=>({'data-entry-field':name,'data-entry-kind':'note'});
    return `<div class="campaign-notes" data-note-target-kind="${kind}" data-note-target-id="${e(id)}">${UI.journal({entries,draft:drafting?{...noteDraft,id:noteId}:null,canAdd,control,field})}</div>`;
  }
  // A session's or plot's panel: Edit and "Add Entry" in one row (Delete shows while editing).
  function entryActions(kind,id,editHtml) {
    const drafting=noteTarget?.kind===kind&&noteTarget?.id===id&&noteDraft;
    const add=canAddEntry(kind,id)&&!drafting?UI.button({text:'Add Entry',attrs:{'data-campaign':'note-new','data-id':`${kind}:${id}`,disabled:busy}}):'';
    return editHtml||add?UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:editHtml+add}):'';
  }
  function renderPlots(plots) {
    // A new plot is drafted above the list; an existing one is edited inside its entry.
    const fresh = '';
    const list = [...plots].sort(byNewest).map(plot => entry(`plots:${plot.id}`,`${entryTitle(plot.title || 'Untitled plot',`${e(entryAuthor(plot))}${plot.updatedAt?` · ${day(plot.updatedAt)}`:''}`)}${isUnread(active,'plots',plot) ? unreadMark : ''}`,
      plotDraft && plotId === plot.id ? entryEditor('plot',plotDraft)
        : `<article class="campaign-plot">${gallery(plot.images)}${readStatus('plots',plot)}${entryActions('plots',plot.id,entryOwner(plot) ? button('plot-edit','Edit plot',plot.id) : '')}${notesFor('plots',plot.id,{addInRow:true})}</article>`)).join('');
    return `${sectionBar('Plots')}${fresh}<div class="campaign-entries">${addTile(button('plot-new','Add Plot'))}${list || ''}</div>`;
  }
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
    if (drag) { endDrag(); return; }
    if (notePopup) { notePopup = ''; changed(); return; }
    if (newOpen()) { if (!plotId) plotDraft = null; if (!sessionId) sessionDraft = null; if (!npcId) npcDraft = null; picking = false; changed(); return; }
    closeEntry(document.querySelector('.campaign-entry[open]'));
  });
  document.addEventListener('click',event => { if (event.target?.matches?.('.campaign-entry[open]')) closeEntry(event.target); });
  const day = value => { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) : ''; };
  // Each entry is a tile; opened, its body is a panel over the page with its own title and close.
  const entry = (key,summaryHtml,bodyHtml,tileAttrs = '') => `<details class="campaign-entry" data-entry="${e(key)}"${openEntries.has(key)?' open':''}${tileAttrs}><summary>${summaryHtml}</summary><div class="campaign-entry-body" role="dialog" aria-modal="true"><div class="campaign-entry-panel-head">${summaryHtml}${button('entry-close','✕',key)}</div>${bodyHtml}</div></details>`;
  const entryTitle = (title,meta) => `<span class="campaign-entry-title">${e(title)}</span>${meta?`<small class="campaign-entry-meta">${meta}</small>`:''}`;
  const byNewest = (a,b) => (b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || '');
  // Note numbers: every note in the campaign is numbered, oldest first — session, plot, NPC
  // and PC notes and the public entries of PC journals — so the notes read in order without
  // picking a session or plot. Keys are "<kind>:<targetId>:<noteId>".
  const noteKey = (kind,targetId,noteId) => `${kind}:${targetId}:${noteId}`;
  const splitKey = key => { const [kind,targetId,...rest] = key.split(':'); return {kind,targetId,noteId:rest.join(':')}; };
  function numberedNotes() {
    const exists = (kind,id) => kind === 'clans' ? CLANS.includes(id) : ['sessions','plots','npcs','pcs'].includes(kind) && !!store().get(path(kind,id));
    const notes = store().list(path('notes','')).filter(n => exists(n.targetKind,n.targetId)).map(n => ({kind:n.targetKind,targetId:n.targetId,id:n.id,title:UI.entryTitle(n),text:n.text || '',author:entryAuthor(n),date:n.createdAt || n.updatedAt || ''}));
    const journals = store().list(path('pcs','')).flatMap(pc => (sheets.get(pc.id+':public')?.data?.profile?.journal || []).map(j => ({kind:'pcs',targetId:pc.id,id:`journal:${j.id}`,title:UI.entryTitle(j),text:j.text || '',author:j.authorName || playerName(pc),date:j.createdAt || ''})));
    const list = [...notes,...journals].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map((n,i) => ({...n,number:i + 1}));
    // A PC's private journal entries, for its player and the GM only: numbered P1, P2… per PC,
    // so the shared numbers stay the same for everyone.
    const privates = store().list(path('pcs','')).flatMap(pc => privateJournal(pc).sort((a,b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id))
      .map((j,i) => ({kind:'pcs',targetId:pc.id,id:`journal:${j.id}`,title:UI.entryTitle(j),text:j.text || '',author:playerName(pc),date:j.createdAt || '',number:`P${i + 1}`,private:true,order:list.length + 1 + i})));
    return new Map([...list,...privates].map(n => [noteKey(n.kind,n.targetId,n.id),n]));
  }
  // The entries a PC's sheet keeps private: the player reads their own sheet, the GM the full sheet.
  const parsedSheets = new Map();
  function privateJournal(pc) {
    let journal = null;
    if (own(pc)) journal = window.CharacterBuilder?.read?.(pc.characterId)?.journal;
    else if (gm()) {
      const data = sheets.get(pc.id+':full')?.data;
      if (data?.sheetJson) {
        const cached = parsedSheets.get(pc.id);
        if (cached?.revision !== data.revision) { try { parsedSheets.set(pc.id,{revision:data.revision,journal:JSON.parse(data.sheetJson).journal}); } catch { parsedSheets.set(pc.id,{revision:data.revision,journal:[]}); } }
        journal = parsedSheets.get(pc.id).journal;
      }
    }
    return (Array.isArray(journal) ? journal : []).filter(j => j && j.id && !j.public && String(j.text || j.title || '').trim());
  }
  // The map: PC and NPC tokens, each either the character itself or one of its numbered notes.
  // Members drag them from the tray; a hex grid shows while dragging and the token snaps to the
  // hex under it; dragging a token off the map takes it off. Positions are stored in percent.
  const pinTarget = (kind,id) => {
    if (kind === 'pcs') { const pc = store().get(path('pcs',id)); if (!pc) return null; const profile = sheets.get(id+':public')?.data?.profile; return {name:label(pc),image:UI.isPortrait(profile?.portrait) ? profile.portrait : window.CharacterCatalog?.clanMon(profile?.clan || '') || ''}; }
    if (kind === 'npcs') { const npc = store().get(path('npcs',id)); return npc ? {name:npc.name || 'Unnamed NPC',image:UI.isPortrait(npc.portrait) ? npc.portrait : '',place:isPlace(npc)} : null; }
    if (kind === 'clans') return CLANS.includes(id) ? {name:clanName(id),image:window.CharacterCatalog?.clanMon(id) || '',clan:true} : null;
    return null;
  };
  const newestFirst = (a,b) => (b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || '');
  // Pins still pointing at an existing PC or NPC (and note); one per character or note. Older
  // pins from the session maps collapse into the latest one.
  function mapPins(numbers) {
    const seen = new Set();
    return store().list(path('timeline','')).sort((a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map(item => {
      const target = ['pcs','npcs','clans'].includes(item.kind) && pinTarget(item.kind,item.targetId);
      const key = item.noteId ? noteKey(item.kind,item.targetId,item.noteId) : `${item.kind}:${item.targetId}`, note = item.noteId ? numbers.get(key) : null;
      if (!target || (item.noteId && !note) || seen.has(key)) return null;
      seen.add(key);
      return {...item,target,note,key};
    }).filter(Boolean).sort((a,b) => (a.note?.order || a.note?.number || 0) - (b.note?.order || b.note?.number || 0));
  }
  const tokenClass = (kind,target) => target?.clan ? 'clans' : target?.place ? 'place' : kind;
  const tokenFace = target => target.image ? `<img src="${UI.imageLink(target.image)}" alt="" draggable="false">` : '<span class="timeline-pin-dot" aria-hidden="true"></span>';
  const numberBadge = note => note ? `<b class="timeline-pin-number${note.private ? ' timeline-pin-private' : ''}"${note.private ? ' title="Private: only its player and the GM see it"' : ''}>${note.number}</b>` : '';
  // Clans and family trees: campaigns/<c>/tree/<kind>:<id> puts a PC or NPC under a clan or
  // under another PC or NPC. Links to something gone, or that loop back, are ignored.
  const CLANS = ['Crab','Crane','Dragon','Lion','Mantis','Phoenix','Scorpion','Unicorn','Imperial'];
  const clanName = clan => clan === 'Imperial' ? 'Imperial Families' : clan;
  // Each clan's colour, used on its members' map pins, tray names and note numbers.
  const CLAN_COLORS = {Crab:'#4b6a88',Crane:'#5aa9d6',Dragon:'#3e9a4f',Lion:'#d9a514',Mantis:'#1f8f8f',Phoenix:'#e06a1b',Scorpion:'#b3202a',Unicorn:'#7d4aa6',Imperial:'#b5862a'};
  const treeLinks = () => new Map(store().list(path('tree','')).filter(t => t && ['pcs','npcs','clans'].includes(t.parentKind) && t.parentId).map(t => [t.id,`${t.parentKind}:${t.parentId}`]));
  function treeParents(existing) {
    const links = new Map([...treeLinks()].filter(([key,parent]) => existing.has(key) && existing.has(parent) && key !== parent)), parents = new Map();
    for (const [key,parent] of links) { const seen = new Set([key]); let at = parent;
      while (at && !seen.has(at)) { seen.add(at); at = links.get(at); }
      if (!at) parents.set(key,parent); }
    return parents;
  }
  // Whether `key` sits somewhere under `ancestor` (so dropping the ancestor on it would loop).
  const isUnder = (key,ancestor) => { const links = treeLinks(), seen = new Set(); for (let at = links.get(key); at && !seen.has(at); at = links.get(at)) { if (at === ancestor) return true; seen.add(at); } return false; };
  // A token's clan: the clan it sits under (through any parents), else the clan on the sheet of
  // the PC at the top of its tree. A clan's own notes take its colour.
  function clanColors(pcs,npcs) {
    const parents = treeParents(new Set([...pcs.map(pc => `pcs:${pc.id}`),...npcs.map(n => `npcs:${n.id}`),...CLANS.map(c => `clans:${c}`)]));
    const clanOf = key => { const {kind,targetId} = splitKey(key); let at = `${kind}:${targetId}`;
      while (parents.has(at)) at = parents.get(at);
      if (at.startsWith('clans:')) return at.slice(6);
      return at.startsWith('pcs:') ? clanFromSheet(sheets.get(at.slice(4)+':public')?.data?.profile) : ''; };
    const color = key => CLAN_COLORS[clanOf(key)] || '';
    return {parents,color,cls:key => color(key) ? ' has-clan' : '',style:key => color(key) ? `--clan:${color(key)}` : ''};
  }
  function renderTimeline(isGM,pcs,npcs) {
    const numbers = numberedNotes(), pins = mapPins(numbers), clan = clanColors(pcs,npcs);
    const pinHtml = pins.map(item => { const movable = canMovePin(item), label = item.note ? `#${item.note.number} ${item.target.name}: ${item.note.title}` : item.target.name;
      return `<span class="timeline-pin timeline-pin-${tokenClass(item.kind,item.target)}${item.note ? ' timeline-pin-note' : ''}${movable ? ' timeline-pin-movable' : ''}${clan.cls(item.key)}" data-pin-id="${e(item.id)}" style="left:${Number(item.x)}%;top:${Number(item.y)}%;${clan.style(item.key)}">${UI.button({html:`${tokenFace(item.target)}${numberBadge(item.note)}<span class="timeline-pin-name"><span>${e(item.target.name)}</span>${item.note ? `<small class="timeline-pin-entry">${e(item.note.title)}</small>` : ''}</span>`,variant:'quiet',attrs:{class:'timeline-pin-open','data-campaign':item.note ? 'note-popup' : 'entry-open','data-id':item.note ? item.key : `${item.kind}:${item.targetId}`,'aria-label':label,title:movable ? `${label} · drag to move, or off the map to remove` : label}})}</span>`; }).join('');
    // The tray: the clans, then each PC, person and place, followed by its note numbers; any
    // character can be dragged onto the map. Those already on it are marked. Members drop a
    // name on another name (or on a clan) to put it under it; nested names fold with their parent.
    const placed = new Set(pins.map(p => p.key));
    const items = [...pcs.map(pc => ['pcs',pc.id]),...npcs.map(n => ['npcs',n.id])].map(([kind,id]) => ({kind,id,key:`${kind}:${id}`,target:pinTarget(kind,id)})).filter(item => item.target).sort((a,b) => a.target.name.localeCompare(b.target.name));
    const byKey = new Map(items.map(item => [item.key,item]));
    const parents = clan.parents;
    const kids = new Map();
    for (const item of items) { const parent = parents.get(item.key); if (parent) kids.set(parent,[...(kids.get(parent) || []),item]); }
    const rootOf = key => { while (parents.has(key)) key = parents.get(key); return key; };
    const notesOf = item => [...numbers.values()].filter(n => n.kind === item.kind && n.targetId === item.id);
    const noteChips = item => notesOf(item).map(n => { const noteKeyValue = noteKey(item.kind,item.id,n.id);
      return `<button type="button" class="map-tray-note map-tray-note-${tokenClass(item.kind,item.target)}${n.private ? ' map-tray-private' : ''}${placed.has(noteKeyValue) ? ' map-tray-placed' : ''}${clan.cls(noteKeyValue)}"${clan.style(noteKeyValue) ? ` style="${clan.style(noteKeyValue)}"` : ''} data-tray-token="${e(noteKeyValue)}" data-campaign="note-popup" data-id="${e(noteKeyValue)}" title="#${n.number} ${e(n.title)}${n.private ? ' · private: only you and the GM see it' : ''} · drag onto the map">${n.number}</button>`; }).join('');
    const countUnder = key => (kids.get(key) || []).reduce((sum,child) => sum + 1 + countUnder(child.key),0);
    const branch = (key,name) => { const list = kids.get(key) || []; if (!list.length) return '';
      return `<details class="map-tray-branch" data-tray-group="${e(key)}"${trayClosed.has(key) ? '' : ' open'}><summary class="map-tray-branch-title" aria-label="${e(name)}: ${countUnder(key)} under">${countUnder(key)}</summary><div class="map-tray-children">${list.map(row).join('')}</div></details>`; };
    function row(item) { const key = item.key;
      const chip = `<button type="button" class="map-tray-token map-tray-${tokenClass(item.kind,item.target)}${placed.has(key) ? ' map-tray-placed' : ''}${clan.cls(key)}"${clan.style(key) ? ` style="${clan.style(key)}"` : ''} data-tray-token="${e(key)}" data-campaign="entry-open" data-id="${e(key)}" title="${e(item.target.name)} · drag onto the map, or onto another name or clan to put it under it">${tokenFace(item.target)}<span>${e(item.target.name)}</span></button>`;
      const notes = noteChips(item);
      return `<div class="map-tray-row" data-tray-row>${chip}${notes}${branch(key,item.target.name)}</div>`; }
    // A clan opens its panel (notes and members); its note numbers follow; members are dropped onto it.
    const clanRow = clan => { const key = `clans:${clan}`, item = {kind:'clans',id:clan,key,target:pinTarget('clans',clan)};
      return `<div class="map-tray-row" data-tray-row><button type="button" class="map-tray-token map-tray-clan has-clan" style="--clan:${CLAN_COLORS[clan]}" data-tray-clan="${e(clan)}" data-campaign="clan-open" data-id="${e(clan)}" title="${e(clanName(clan))} · open its notes; drop a name here to put it in this clan">${tokenFace(item.target)}<span>${e(clanName(clan))}</span></button>${noteChips(item)}${branch(key,clanName(clan))}</div>`; };
    // Each group (Clans, PCs, People, Places) folds, and so does Campaign around them all; the
    // choice is kept while the page redraws.
    const group = (title,list,body = list.map(row).join(''),count = list.length) => body ? `<details class="map-tray-group" data-tray-group="${title}"${trayClosed.has(title) ? '' : ' open'}><summary class="map-tray-title" title="Drop a name here to take it out of its clan or parent">${title} <small>${count}</small></summary><div class="map-tray-group-body" role="group" aria-label="${title}">${body}</div></details>` : '';
    const top = items.filter(item => !parents.has(item.key)), inGroup = test => items.filter(item => { const root = byKey.get(rootOf(item.key)); return root && test(root); }).length;
    const groups = !items.length ? '' : group('Clans',[],CLANS.map(clanRow).join(''),items.filter(item => rootOf(item.key).startsWith('clans:')).length)
      +group('PCs',top.filter(i => i.kind === 'pcs'),undefined,inGroup(i => i.kind === 'pcs'))
      +group('People',top.filter(i => i.kind === 'npcs' && !i.target.place),undefined,inGroup(i => i.kind === 'npcs' && !i.target.place))
      +group('Places',top.filter(i => i.kind === 'npcs' && i.target.place),undefined,inGroup(i => i.kind === 'npcs' && i.target.place));
    // Folding the groups reaches pins under the tray; a pin dropped on the tray is taken off the map.
    const tray = !groups ? '' : `<div class="timeline-pin-controls map-tray" aria-label="Drag PCs, NPCs and their numbered notes onto the map; drop a name on another name or a clan to put it under it, or on a group title to take it out">${items.length > 8 ? `<div class="map-tray-head">${UI.field({attrs:{type:'search','data-tray-search':true,placeholder:'Find','aria-label':'Find a PC or NPC'}})}</div>` : ''}<details class="map-tray-group map-tray-root" data-tray-group="Campaign"${trayClosed.has('Campaign') ? '' : ' open'}><summary class="map-tray-title" title="Fold or open everything; drop a name here to take it out of its clan or parent">Campaign <small>${items.length}</small></summary><div class="map-tray-root-body">${groups}</div></details></div>`;
    const mapActions = isGM ? `<div class="timeline-map-actions">${button('map-pick','Map')}</div>` : '';
    const mapView = mapSrc(), map = `<div class="timeline-stage">${tray}${mapActions}${mapView.loading ? '<div class="timeline-map timeline-map-blank timeline-map-loading" aria-busy="true"><span>Loading map…</span></div>' : `<div class="timeline-map${mapView.src ? '' : ' timeline-map-blank'}" data-timeline-map>${mapView.src ? `<img src="${e(UI.imageLink(mapView.src))}" alt="Campaign map" draggable="false">` : ''}${pinHtml}</div>`}</div>`;
    return `<div class="timeline"><article class="timeline-detail">${map}<div class="timeline-arrows"></div></article></div>${renderNotePopup(numbers)}${renderClanPopup(numbers,kids)}`;
  }
  // A clan's panel: its mon and name, who is in it, and its journal (any member adds entries).
  function renderClanPopup(numbers,kids) {
    if (!CLANS.includes(clanPopup)) return '';
    const mon = window.CharacterCatalog?.clanMon(clanPopup) || '', members = kids.get(`clans:${clanPopup}`) || [];
    const list = members.length ? `<p class="campaign-clan-members">${members.map(m => UI.button({text:m.target.name,variant:'quiet',size:'compact',attrs:{'data-campaign':'entry-open','data-id':m.key}})).join(' ')}</p>` : '<p class="campaign-clan-members">Nobody yet: drop a name on the clan in the tray.</p>';
    return `<div class="timeline-popup-backdrop" data-campaign="clan-popup-close"></div><div class="timeline-popup campaign-clan-popup" role="dialog" aria-modal="true" aria-labelledby="clan-popup-title" tabindex="-1"><header>${mon ? `<img src="${e(UI.imageLink(mon))}" alt="">` : ''}<div><h3 id="clan-popup-title">${e(clanName(clanPopup))}</h3><small>${members.length} in the clan</small></div></header>${list}${notesFor('clans',clanPopup)}${UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:button('clan-popup-close','Close')})}</div>`;
  }
  // A numbered note in a popup: from a pin, or from its number in the tray.
  function renderNotePopup(numbers) {
    const note = notePopup && numbers.get(notePopup), target = note && pinTarget(note.kind,note.targetId), pin = note && mapPins(numbers).find(p => p.key === notePopup);
    if (!note || !target) return '';
    return `<div class="timeline-popup-backdrop" data-campaign="note-popup-close"></div><div class="timeline-popup" role="dialog" aria-modal="true" aria-labelledby="timeline-popup-title" tabindex="-1"><header>${target.image ? `<img src="${UI.imageLink(target.image)}" alt="">` : ''}<div><h3 id="timeline-popup-title"><span class="creator-journal-number">#${note.number}</span> ${e(note.title)}</h3><small>${e(target.name)} · ${e(note.author)}${note.date ? ` · ${e(day(note.date))}` : ''}</small></div></header><p class="entry-text">${e(note.text)}</p>${UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:(note.kind === 'clans' ? button('clan-open','Open clan',note.targetId) : button('entry-open',`Open ${note.kind === 'pcs' ? 'PC' : 'NPC'}`,`${note.kind}:${note.targetId}`))+(pin && canMovePin(pin) ? button('pin-remove','Remove pin',pin.id) : '')+button('note-popup-close','Close')})}</div>`;
  }
  // The campaign map: a media library picture the GM chose. Without one (or if it fails to load)
  // the map is an empty frame the shape of the old Rokugan map, so the page's own Rokugan
  // background shows through and pins keep their places. While the campaign or its picture
  // loads, the frame shows "Loading map…" and no pins.
  const loadingMaps = new Set(), failedMaps = new Set();
  function mapSrc() {
    const campaign = store().get(`campaigns/${active}`);
    if (!campaign) return {loading:true};
    const id = campaign.mapId;
    if (!id || !window.MediaLibrary || failedMaps.has(id)) return {};
    const src = window.MediaLibrary.cachedSrc(id);
    if (src) return {src};
    if (!loadingMaps.has(id)) { loadingMaps.add(id); window.MediaLibrary.imageSrc(id).then(() => changed()).catch(() => { failedMaps.add(id); changed(); }); }
    return {loading:true};
  }
  // The full entry behind a timeline event, in an overlay dialog.
  // The + buttons open their form in the same popup as Invite (new plot, new NPC, add a PC).
  const popup = (id,title,bodyHtml,closeAction) => `<div class="timeline-popup-backdrop" data-campaign="${closeAction}"></div><div class="timeline-popup campaign-popup" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1"><header><div><h3 id="${id}">${e(title)}</h3></div>${button(closeAction,'✕')}</header>${bodyHtml}</div>`;
  const newOpen = () => (plotDraft && !plotId) || (sessionDraft && !sessionId) || (npcDraft && !npcId) || picking;
  // "Edit list" in the Add PC and Add NPC popups: everything in the campaign, each with Remove.
  // The GM removes any PC or NPC; a player removes only their own PCs. Removing a PC only
  // unlinks it (the sheet stays with its player); removing an NPC deletes it and its journal.
  function listEditor(kind,items) {
    const pcList=kind==='pcs';
    const rows=items.map(item=>({item,name:pcList?label(item):item.name||'Unnamed NPC',meta:pcList?playerName(item):isPlace(item)?'Place':item.role||'',canRemove:pcList?gm()||own(item):gm()}))
      .sort((a,b)=>a.name.localeCompare(b.name)).map(({item,name,meta,canRemove})=>`<li class="campaign-list-row"><span><strong>${e(name)}</strong>${meta?` <small>${e(meta)}</small>`:''}</span>${canRemove?UI.button({text:'Remove',variant:'secondary',size:'compact',attrs:{'data-campaign':pcList?'pc-remove':'npc-delete','data-id':item.id,disabled:busy,'aria-label':`Remove ${name}`}}):''}</li>`).join('');
    return rows?`<details class="campaign-list-editor"><summary>Edit list (${items.length})</summary><ul>${rows}</ul></details>`:'';
  }
  function renderNewPopup(pcs) {
    if (plotDraft && !plotId) return popup('new-popup-title','New plot',entryEditor('plot',plotDraft),'new-close');
    if (sessionDraft && !sessionId && gm()) return popup('new-popup-title','New session',entryEditor('session',sessionDraft),'new-close');
    if (npcDraft && !npcId && gm()) return popup('new-popup-title','New NPC',npcEditor(npcDraft)+listEditor('npcs',store().list(path('npcs',''))),'new-close');
    if (picking) return popup('new-popup-title','Add a PC',`<div class="pc-picker">${window.CharacterBuilder.list().filter(personal=>!pcs.some(pc=>own(pc)&&pc.characterId===personal.id)).map(pc=>button('pc-link',pc.name||'Unnamed PC',pc.id)).join('')}${button('pc-create','Create PC')}</div>${listEditor('pcs',pcs)}${gm() ? playersSection(pcs) : ''}`,'new-close');
    return '';
  }
  // Offers made to you in this campaign (accept saves the PC to your account and links it), and,
  // for the GM, requests to join from people who opened a link without an invitation.
  function renderOffers() {
    const mine = transfers.filter(t => t.toUid === store().uid && t.status === 'offered' && t.campaignId === active);
    const requests = gm() ? openRequests() : [];
    // A player who joined but has no PC here yet is invisible to the others until they add one.
    const noPC = !gm() && !store().list(path('pcs','')).some(pc => pc.ownerUid === store().uid);
    const rows = [
      ...(noPC ? [`<div class="campaign-offer"><span>You joined this campaign. Create your character so the GM and the other players see you (or link one you already have with <strong>Add PC</strong>).</span>${button('pc-create','Create PC')}</div>`] : []),
      ...mine.map(t => `<div class="campaign-offer"><span><strong>${e(memberName(active,t.fromUid))}</strong> offers you <strong>${e(t.name)}</strong></span>${button('transfer-accept','Accept',t.id)}${button('transfer-decline','Decline',t.id)}</div>`),
      ...requests.map(r => `<div class="campaign-offer"><span><strong>${e(r.displayName || 'Someone')}</strong> asks to join${r.inviteToken ? ' · approved, waiting for them to join' : ''}</span>${r.inviteToken ? '' : button('request-approve','Approve',r.id)}${button('request-decline',r.inviteToken ? 'Withdraw' : 'Decline',r.id)}</div>`),
    ];
    return rows.length ? `<div class="campaign-offers">${rows.join('')}</div>` : '';
  }
  // Opened a campaign link without being a member: name the campaign (from the public lookup) and
  // offer to ask the GM for an invitation; once approved, a Join button appears.
  let lookup = {segment:'',state:'',campaign:null};
  const published = new Map();
  // Your own request to join each campaign you are not in. Once the GM approves it, you join at
  // once (no button to press); the campaign then appears among yours.
  let requestsBackend = null;
  const myRequests = new Map();
  function myRequest(c) {
    const backend = store().backend;
    if (requestsBackend !== backend) { for (const r of myRequests.values()) r.stop?.(); myRequests.clear(); requestsBackend = backend; }
    if (!myRequests.has(c)) {
      const entry = {data:null,loaded:false,joining:false,error:'',stop:null};
      myRequests.set(c,entry);
      entry.stop = backend?.watchRequest?.(c,data => {
        if (myRequests.get(c) !== entry) return;
        entry.data = data; entry.loaded = true;
        if (data?.inviteToken && !entry.joining && !store().get(`campaigns/${c}`)) {
          entry.joining = true; entry.error = '';
          backend.join(data.inviteToken).catch(err => { entry.joining = false; entry.error = err.code === 'permission-denied' ? 'Could not join: the approval was withdrawn or the invitation replaced. Ask again.' : `Could not join: ${err.message}`; changed(); });
        }
        changed();
      }) || null;
    }
    return myRequests.get(c);
  }
  function notInvited(segment) {
    const backend = store().backend;
    if (lookup.segment !== segment) {
      lookup = {segment,state:'loading',campaign:null};
      (backend?.lookupCampaign?.(segment) || Promise.resolve(null)).then(found => { if (lookup.segment === segment) { lookup = {segment,state:found?'found':'missing',campaign:found}; changed(); } });
    }
    const found = lookup.campaign, title = found?.title;
    const mine = found ? myRequest(found.campaignId) : null, request = mine?.data;
    const action = !found ? '' : request?.inviteToken ? (mine.error ? `<p>${e(mine.error)}</p>${button('join','Join campaign',request.inviteToken)}` : '<p>Your request was approved · joining the campaign…</p>')
      : request ? `<p class="campaign-invite-note">Request sent · waiting for the GM.</p>${button('request-withdraw','Withdraw request',found.campaignId)}`
      : button('request-invite','Ask to be invited',found.campaignId);
    if (lookup.state === 'loading') return '<div class="workspace"><p class="campaign-invite-note">Looking up the campaign…</p></div>';
    return `<div class="workspace campaign-not-invited"><h1>You were not invited to ${title ? `the campaign <em>${e(title)}</em>` : 'this campaign'}</h1>${found ? '' : '<p class="campaign-invite-note">Check the address, or find the campaign on the <a href="#/start">start page</a>.</p>'}${action}</div>`;
  }
  // Pick a member: the new GM, or who receives a PC.
  function renderTransferPopup(pcs) {
    if (!transferPopup) return '';
    const others = store().list(path('members','')).filter(m => m.id !== store().uid);
    const list = others.length ? `<div class="campaign-transfer-list">${others.map(m => button(transferPopup === 'campaign' ? 'handover-to' : 'pc-transfer-to',m.displayName || 'Player',m.id)).join('')}</div>` : '<p class="campaign-invite-note">No other players yet.</p>';
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
  // Who is in the campaign (for the GM, in the Add PC popup): each player who joined and the
  // PCs they linked, "no PC yet" until they add one with Add PC, and anyone asking to join.
  // Requests from people not yet in the campaign (a joined player's request is removed as stale).
  const staleRequests = new Set();
  function openRequests() {
    const members = new Set(store().list(path('members','')).map(m => m.id));
    return store().list(path('requests','')).filter(r => {
      if (!members.has(r.id)) return true;
      if (!staleRequests.has(active+'/'+r.id)) { staleRequests.add(active+'/'+r.id); store().backend?.answerRequest?.(active,r.id,false).catch(()=>{}); }
      return false;
    });
  }
  function playersSection(pcs) {
    const campaign = store().get(`campaigns/${active}`);
    const members = store().list(path('members','')).filter(m => m.id !== campaign?.gmUid).sort((a,b) => (a.displayName || '').localeCompare(b.displayName || ''));
    const requests = openRequests();
    const rows = members.map(m => { const theirs = pcs.filter(pc => pc.ownerUid === m.id).map(pc => label(pc));
      return `<li class="campaign-list-row"><span><strong>${e(m.displayName || 'Player')}</strong> <small>${theirs.length ? e(theirs.join(', ')) : 'joined · no PC yet'}</small></span></li>`; })
      .concat(requests.map(r => `<li class="campaign-list-row"><span><strong>${e(r.displayName || 'Someone')}</strong> <small>${r.inviteToken ? 'approved · has not joined yet' : 'asks to join'}</small></span>${r.inviteToken ? '' : button('request-approve','Approve',r.id)}</li>`));
    return `<div class="campaign-players"><h4>Players <small>${members.length}</small></h4>${rows.length ? `<ul>${rows.join('')}</ul>` : '<p class="campaign-invite-note">Nobody has joined yet. Players find the campaign on the start page and ask to be invited; you approve them here or on the campaign page.</p>'}</div>`;
  }
  // Places are NPC records too: the GM ticks Place, and older records are guessed from the name (or a role like "O Castelo…" / "Onde…").
  const PLACE_WORDS = /(^|[^\p{L}])(shiro|kyuden|mura|toshi|koku|toi|jinja|dojo|village|vila|aldeia|cidade|city|castle|castelo|pal[aá]cio|palace|posto|templo|temple|santu[aá]rio|shrine|ponte|bridge|prov[ií]ncia|province|estrada|road|porto|port|floresta|forest|monte|mountain|rio|river|casa de ch[aá]|tea ?house)(?=$|[^\p{L}])/iu;
  const isPlace = npc => typeof npc.place === 'boolean' ? npc.place : PLACE_WORDS.test(npc.name || '') || /^(onde\b|(o|a|the) )/i.test(npc.role || '') && PLACE_WORDS.test(npc.role) || /^onde\b/i.test(npc.role || '');
  // The map is the sessions and plots view: their + buttons, the selected session, and every plot.
  // The map head: the + buttons, then every session (newest first) and plot; each opens its panel.
  function renderMapHead(isGM,sessions,plots) {
    const chip = (kind,item,title) => UI.button({text:title,variant:'quiet',size:'compact',attrs:{class:`map-head-${kind === 'plots' ? 'plot' : 'session'}`,'data-campaign':'entry-open','data-id':`${kind}:${item.id}`}});
    const sessionChips = [...sessions].sort(newestFirst).map(item => chip('sessions',item,item.title || 'Untitled session')).join('');
    const plotChips = [...plots].sort(byNewest).map(item => chip('plots',item,item.title || 'Untitled plot')).join('');
    return `<div class="map-head">${isGM ? button('session-new','Add Session') : ''}${button('plot-new','Add Plot')}${isGM ? button('npc-new','Add NPC') : ''}${button('pc-picker','Add PC')}${sessionChips ? `<span class="map-head-plots" aria-label="Sessions">${sessionChips}</span>` : ''}${plotChips ? `<span class="map-head-plots" aria-label="Plots">${plotChips}</span>` : ''}</div>`;
  }
  // A pin is moved or removed by whoever placed it, or by the GM (older pins count as the GM's).
  const canMovePin = item => !!item && (gm() || (!!item.creatorUid && item.creatorUid === store().uid));
  // Section titles are visually hidden; the tabs already name the section. Actions sit on top.
  // Each kind is a grid of tiles with no visible title: its add button is the first tile.
  // The title stays for screen readers; unread entries keep their own "!".
  const sectionBar = title => `<h2 class="visually-hidden">${e(title)}</h2>`;
  const addTile = actionsHtml => actionsHtml ? `<div class="campaign-add-tile">${actionsHtml}</div>` : '';
  function renderSessions(sessions,isGM) {
    const list = [...sessions].sort(byNewest).map(session => entry(`sessions:${session.id}`,`${entryTitle(session.title || 'Untitled session',day(session.updatedAt))}${isUnread(active,'sessions',session) ? unreadMark : ''}`,
      isGM && sessionDraft && sessionId === session.id ? entryEditor('session',sessionDraft)
        : `${gallery(session.images)}${readStatus('sessions',session)}${entryActions('sessions',session.id,isGM ? button('session-open','Edit',session.id) : '')}${notesFor('sessions',session.id,{addInRow:true})}`)).join('');
    return `${sectionBar('Sessions')}<div class="campaign-entries">${addTile(isGM?button('session-new','Add Session'):'')}${list}</div>`;
  }
  function renderNPCs(npcs,isGM) {
    const fresh = '';
    const list = [...npcs].sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(npc => entry(`npcs:${npc.id}`,UI.characterTileBody({portrait:npc.portrait,name:npc.name || 'Unnamed NPC',meta:npc.role || ''}),
      isGM && npcId === npc.id ? `${npcEditor(npcDraft || npc)}${notesFor('npcs',npc.id)}`
        : `<div class="campaign-npc">${UI.isPortrait(npc.portrait) ? `<img class="public-pc-picture" src="${UI.imageLink(npc.portrait)}" alt="Picture of ${e(npc.name || 'this NPC')}">` : ''}${npc.role ? `<p class="campaign-npc-role">${e(npc.role)}</p>` : ''}${npc.description ? `<p class="campaign-npc-description entry-text">${e(npc.description)}</p>` : ''}</div>${isGM ? UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:button('npc-open','Edit',npc.id)+unpinButton(`npcs:${npc.id}`)}) : unpinButton(`npcs:${npc.id}`) ? UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:unpinButton(`npcs:${npc.id}`)}) : ''}${notesFor('npcs',npc.id)}`,UI.tileArtStyle(UI.isPortrait(npc.portrait) ? npc.portrait : 'public/assets/l5r-mark.webp'))).join('');
    return `${sectionBar('NPCs')}${fresh}<div class="campaign-entries">${addTile(isGM?button('npc-new','Add NPC'):'')}${list}</div>`;
  }
  // "Remove from map" for a character's token or one of its notes, when it is pinned and this
  // member may move it (their own pin, or any as GM).
  function unpinButton(key,compact = false) {
    const pin = mapPins(numberedNotes()).find(p => p.key === key);
    if (!pin || !canMovePin(pin)) return '';
    return compact ? UI.button({text:'Remove from map',variant:'quiet',size:'compact',attrs:{'data-campaign':'pin-remove','data-id':pin.id}}) : button('pin-remove','Remove from map',pin.id);
  }
  // A PC's public journal entries carry their campaign note numbers.
  function withNumbers(pc,data) {
    const journal = data?.profile?.journal;
    if (!journal?.length) return data;
    const numbers = numberedNotes();
    return {...data,profile:{...data.profile,journal:journal.map(j => ({...j,number:numbers.get(noteKey('pcs',pc.id,`journal:${j.id}`))?.number,toolsHtml:unpinButton(noteKey('pcs',pc.id,`journal:${j.id}`),true)}))}};
  }
  function renderPCs(pcs,isGM,invitation) {
    const list = pcs.map(pc => {
      const data = sheets.get(pc.id+':public')?.data, profile = data?.profile;
      const pending = transfers.find(t => t.pcId === pc.id && t.fromUid === store().uid && t.status === 'offered');
      const handover = own(pc) ? (pending ? `<span class="campaign-transfer-pending">Offered to ${e(memberName(active,pending.toUid))}</span>${button('transfer-cancel','Cancel offer',pending.id)}` : button('pc-transfer','Transfer',pc.id)) : '';
      const actions = `${button('pc-open',own(pc)?'Edit':isGM?'Full sheet':'Open',pc.id)}${handover}${unpinButton(`pcs:${pc.id}`)}`;
      // Your own PC falls back to its local sheet until its public profile arrives.
      const mine = own(pc) ? window.CharacterBuilder.list().find(c => c.id === pc.characterId) : null;
      return entry(`pcs:${pc.id}`,UI.characterTileBody({portrait:profile?.portrait || mine?.portrait,clan:profile?.clan || mine?.clan,name:label(pc),meta:profile?.family || mine?.family || ''}),
        `${window.PublicCharacter ? window.PublicCharacter.page(withNumbers(pc,data),[],{compact:true}) : ''}${UI.actionRow({attrs:{class:'campaign-actions'},bodyHtml:actions})}${notesFor('pcs',pc.id)}`,UI.clanTileStyle(profile?.clan || mine?.clan));
    }).join('');
    const picker = '';
    return `${sectionBar('PCs')}<div class="campaign-entries">${addTile(button('pc-picker','Add PC'))}${list}</div>${picker}`;
  }
  function render(slug) {
    renderAgain ||= () => {};
    if (accountUid !== store().uid) { clearCardSheets(); active = '!'; reset(''); accountUid = store().uid; }
    if (slug !== 'campaigns') clearCardSheets();
    if (store().uid) watchTransfers();
    // Invite links are gone: players find a campaign on the start page and ask to be invited.
    if (slug.startsWith('invite/')) { reset(''); return '<div class="workspace"><h1>Invite links are no longer used</h1><p>Find the campaign on the <a href="#/start">start page</a> and ask to be invited; you join as soon as the GM approves.</p></div>'; }
    if (!store().uid) { reset(''); return `<div class="workspace"><h1 class="visually-hidden">Campaigns</h1>${button('sign-in','Sign in with Google')}</div>`; }
    if (slug === 'campaigns') {
      reset('');
      const campaigns = store().list('campaigns/');
      watchCardSheets(campaigns);
      return `<div class="workspace"><h1 class="visually-hidden">Campaigns</h1><div class="campaign-toolbar">${button('create','Create campaign')}</div>${statusPanel()}<div class="campaign-list">${campaigns.map(campaignCard).join('')+otherCampaigns() || '<p>No campaigns yet.</p>'}</div>${Object.keys(store().drafts()).length ? UI.disclosure({attrs:{},titleHtml:`Retained drafts`,bodyHtml:`${Object.entries(store().drafts()).map(([path,data])=>`<h3>${e(path)}</h3><pre>${e(data?.text || data?.notes || JSON.stringify(data))}</pre>`).join('')}`}) : ''}</div>`;
    }
    const [campaignPart = '',routeSection = '',itemPart = ''] = slug.slice('campaigns/'.length).split('/');
    reset(resolveCampaign(campaignPart));
    // A new address picks the section and the item it names; later renders keep the state.
    if (slug !== appliedRoute) {
      appliedRoute = slug;
      section = SECTIONS.includes(routeSection) ? routeSection : 'timeline';
      pendingItem = SECTIONS.includes(routeSection) && itemPart ? {kind:routeSection === 'timeline' ? 'sessions' : routeSection,segment:itemPart} : null;
    }
    if (pendingItem && window.Routes) {
      const found = window.Routes.resolve(pendingItem.segment,store().list(path(pendingItem.kind,'')));
      if (found) {
        // A session link (timeline/<session>) opens that session's panel over the map.
        { openEntries.add(`${pendingItem.kind}:${found.id}`); scrollEntry = `${pendingItem.kind}:${found.id}`; }
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
    if (c && store().uid) markOpenRead();
    if (!c) { reset(''); return store().ready ? notInvited(campaignPart) : '<div class="workspace"><p class="campaign-invite-note">Loading campaign…</p></div>'; }
    // The GM keeps the public lookup current so shared links can name this campaign.
    if (gm() && published.get(active) !== c.title) { published.set(active,c.title); store().backend?.publishDirectory?.(active,c.title).catch(()=>{}); }
    const isGM = gm(), sessions = store().list(path('sessions','')), npcs = store().list(path('npcs','')), pcs = store().list(path('pcs',''));
    migratePCNotes();
    migrateDescriptions();
    copyClanNPCNotes();
    placeInClans();
    const plots=store().list(path('plots',''));
    if(plotId&&!plots.some(p=>p.id===plotId)){plotId='';plotDraft=null;if(noteTarget?.kind==='plots'){noteTarget=noteDraft=null;noteId='';}}
    if (sessionId && !sessions.some(s=>s.id===sessionId)) { sessionId = ''; sessionDraft = null; if (noteTarget?.kind==='sessions') { noteTarget=noteDraft=null; noteId=''; } }
    const s = sessions.find(s=>s.id===sessionId), n = npcDraft || npcs.find(n=>n.id===npcId);
    for (const pc of pcs) watch(pc);
    for (const [key,stop] of stops) if (!pcs.some(pc=>key.startsWith(pc.id+':'))) { stop?.(); stops.delete(key); sheets.delete(key); }
    const selectedPC = pcs.find(pc=>pc.id===sheetId);
    // The GM reads every PC's full sheet for its private notes on the map.
    if (isGM) for (const pc of pcs) if (!own(pc)) watch(pc,true);
    const invitation = isGM ? store().get(path('private','invitation')) : null;
    return `<div class="workspace campaign-workspace campaign-workspace-wide"><div class="workspace-head" data-topbar-head>${isGM?UI.field({labelAttrs:{'class':'campaign-title'},attrs:{'data-campaign-field':'title','maxlength':'200','value':c.title,'aria-label':'Campaign title'}}):`<h1>${e(c.title)}</h1>`}${isGM?button('handover','Hand over')+button('delete-campaign','Delete campaign'):button('leave','Leave campaign')}</div>${statusPanel()}
      ${renderOffers()}<div class="campaign-rows">
      <section class="home-row campaign-row campaign-row-hidden" data-campaign-row="sessions">${renderSessions(sessions,isGM)}</section>
      <section class="home-row campaign-row campaign-row-hidden" data-campaign-row="plots">${renderPlots(plots)}</section>
      <section class="home-row campaign-row campaign-row-hidden" data-campaign-row="npcs">${renderNPCs(npcs,isGM)}</section>
      <section class="home-row campaign-row campaign-row-hidden" data-campaign-row="pcs">${renderPCs(pcs,isGM,invitation)}</section>
      <section class="campaign-row campaign-timeline-row" data-campaign-row="timeline">${UI.panel({attrs:{'class':'panel campaign-content'},bodyHtml:`<h2 class="visually-hidden">Timeline</h2>${renderMapHead(isGM,sessions,plots)}${renderTimeline(isGM,pcs,npcs)}`})}</section>
      </div>${renderTransferPopup(pcs)}${renderNewPopup(pcs)}${selectedPC&&isGM&&!own(selectedPC)?'<div id="campaign-editor"></div>':''}</div>`;
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
      else if (action==='section') {if(SECTIONS.includes(id)){section=id;go(id==='timeline'&&timelineSession?campaignHref(active,'timeline','sessions',timelineSession):campaignHref(active,id));}}
      else if (action==='pc-notes') pcNotesId=pcNotesId===id?'':id;
      else if (action==='plot-new') {plotId='';plotDraft={title:'',text:'',public:true};focusPopup=true;}
      else if (action==='plot-open') {plotId=id;plotDraft=null;openEntries.add(`plots:${id}`);}
      else if (action==='plot-edit') {const data=store().get(path('plots',id));if(data&&entryOwner(data)){plotId=id;plotDraft={...data};openEntries.add(`plots:${id}`);}}
      else if (action==='plot-cancel') plotDraft=null;
      else if (action==='timeline-session') {timelineSession=id;go(campaignHref(active,'timeline','sessions',id));}
      else if (action==='image-remove') {
        const [kind,index]=id.split(':');
        if (kind==='plot' && plotDraft) plotDraft.images=(plotDraft.images||[]).filter((_,i)=>i!==Number(index));
        if (kind==='session' && sessionDraft) sessionDraft.images=(sessionDraft.images||[]).filter((_,i)=>i!==Number(index));
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
        delete data.id;const firstEntry=plot&&!plotId?String(data.firstEntry||'').trim():'';delete data.firstEntry;
        store().queue(path(plot?'plots':'notes',entryId),data);
        // The new plot's first entry is saved after the plot, as its first journal note.
        if(firstEntry)store().queue(path('notes',crypto.randomUUID()),{title:'',text:firstEntry,public:true,creatorUid:store().uid,createdAt:now,updatedAt:now,revision:crypto.randomUUID(),targetKind:'plots',targetId:entryId,targetCreatorUid:store().uid});
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
      else if (action==='session-new') {if(!gm())return;sessionId='';sessionDraft={title:'',firstEntry:'',images:[]};focusPopup=true;}
      else if (action==='session-open') {const data=store().get(path('sessions',id));if(data&&gm()){sessionId=id;sessionDraft={...data};openEntries.add(`sessions:${id}`);}}
      else if (action==='session-cancel') sessionDraft=null;
      else if (action==='session-save') {
        const draft=sessionDraft;
        if(!gm()||!draft?.title?.trim())return;
        const now=new Date().toISOString(),entryId=sessionId||crypto.randomUUID(),firstEntry=sessionId?'':String(draft.firstEntry||'').trim();
        // A session keeps only its title, text, dates and pictures.
        store().queue(path('sessions',entryId),{title:draft.title.trim(),text:draft.text||'',createdAt:draft.createdAt||now,updatedAt:now,images:(draft.images||[]).slice(0,MAX_IMAGES)});
        if(firstEntry)store().queue(path('notes',crypto.randomUUID()),{title:'',text:firstEntry,public:true,creatorUid:store().uid,createdAt:now,updatedAt:now,revision:crypto.randomUUID(),targetKind:'sessions',targetId:entryId});
        markRead('sessions',entryId);
        sessionId=entryId;sessionDraft=null;openEntries.add(`sessions:${entryId}`);store().flush();
      }
      else if (action==='session-delete') {if(gm()&&window.confirm('Delete this session?')){store().queue(path('sessions',id),null);store().flush();if(sessionId===id){sessionId='';sessionDraft=null;}}}
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
        store().queue(path('npcs',npcId || crypto.randomUUID()),{name:draft.name.trim(),role:String(draft.role || '').trim().slice(0,200),description:String(draft.description || '').slice(0,20000),notes:'',place:isPlace(draft),...(UI.isPortrait(draft.portrait)?{portrait:draft.portrait}:{}),updatedAt:new Date().toISOString()});
        npcId='';npcDraft=null;
        store().flush();
      }
      else if (action==='npc-delete') {const npc=store().get(path('npcs',id));if(gm()&&npc&&window.confirm(`Remove ${npc.name||'this NPC'} from the campaign? Its journal goes with it.`)){store().queue(path('npcs',id),null);if(store().get(path('tree',`npcs:${id}`)))store().queue(path('tree',`npcs:${id}`),null);store().flush();if(npcId===id){npcId='';npcDraft=null;}}}
      else if (action==='pc-picker') {
        picking=!picking;focusPopup=picking;
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
      } else if (action==='pc-remove') {const pc=store().get(path('pcs',id));if(pc&&(gm()||own(pc))&&window.confirm(`Remove ${label({...pc,id})} from the campaign? The sheet stays with its player.`)){store().queue(path('pcs',id),null);if(store().get(path('tree',`pcs:${id}`)))store().queue(path('tree',`pcs:${id}`),null);store().flush();if(sheetId===id)sheetId='';}}
      else if (action==='close-sheet') {sheetId='';editor=null;}
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
      else if (action==='request-invite') await backend.requestInvite(id);
      else if (action==='note-popup') {notePopup=id;focusPopup=true;}
      else if (action==='note-popup-close') notePopup='';
      else if (action==='clan-open') {if(CLANS.includes(id)){clanPopup=id;notePopup='';focusPopup=true;}}
      else if (action==='clan-popup-close') {clanPopup='';if(noteTarget?.kind==='clans'){noteTarget=noteDraft=null;noteId='';}}
      else if (action==='pin-remove') {const item=store().get(path('timeline',id));if(canMovePin(item)){store().queue(path('timeline',id),null);notePopup='';}}
      else if (action==='request-withdraw') await backend.withdrawRequest(id);
      else if (action==='request-approve'||action==='request-decline') { if (gm()) await backend.answerRequest(active,id,action==='request-approve'); }
      else if (action==='entry-open') {
        // Open a PC, NPC, session or plot as its panel (from a token, a popup or the map head).
        const [kind,targetId]=id.split(':');notePopup='';clanPopup='';
        openEntries.clear();openEntries.add(`${kind}:${targetId}`);section=kind;go(campaignHref(active,kind,kind,targetId),false);
      }
      else if (action==='npc-portrait-library') {
        const editing=npcDraft || npcId, file=await window.MediaLibrary?.pickFile('Choose a picture');
        const url=file && await UI.readPortrait(file);
        if (url && (npcDraft || npcId) === editing) setNPCPortrait(url);
      }
      else if (action==='image-library') {
        const file=await window.MediaLibrary?.pickFile('Choose an image'), picture=file && await UI.readPortrait(file);
        if (picture) addEntryImage(id,picture);
      }
      else if (action==='map-pick'||action==='map-reset') {
        if (!gm()) return;
        const c=store().get(`campaigns/${active}`), mapId=action==='map-pick' ? await window.MediaLibrary?.pickId('Choose a map') : '';
        if (action==='map-pick' && !mapId) return;
        const {mapId:previous,...rest}=c;
        store().queue(`campaigns/${active}`,mapId ? {...rest,mapId} : rest);
      }
      else if (action==='new-close') {if(!plotId)plotDraft=null;if(!sessionId)sessionDraft=null;if(!npcId)npcDraft=null;picking=false;}
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
  // Dragging a token: from the tray or from the map (yours, or any as GM). While dragging, a
  // hex grid covers the map and the hex under the pointer is outlined; the token lands on its
  // centre. Dropped off the map, a placed token is removed. A drag suppresses the click after it.
  const HEX = 1/64; // a hex's radius, as a share of the map's width
  function snapHex(px,py,width) {
    const r = width * HEX, w = Math.sqrt(3) * r, h = 1.5 * r, row0 = Math.round(py / h);
    let best = null;
    for (let row = row0 - 1; row <= row0 + 1; row++) {
      const offset = Math.abs(row) % 2 ? w / 2 : 0, cx = Math.round((px - offset) / w) * w + offset, cy = row * h, d = (cx - px) ** 2 + (cy - py) ** 2;
      if (!best || d < best.d) best = {x:cx,y:cy,d};
    }
    return best;
  }
  const hexPath = (cx,cy,r) => 'M'+[0,1,2,3,4,5].map(i => { const a = Math.PI / 3 * i - Math.PI / 2; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join('L')+'Z';
  function showHexes(map) {
    map.classList.add('timeline-map-dragging');
    const width = map.clientWidth, r = width * HEX, w = Math.sqrt(3) * r, h = 1.5 * r;
    const svg = map.querySelector('.map-hexes');
    if (svg && svg.dataset.width === String(width)) return svg;
    svg?.remove();
    map.insertAdjacentHTML('beforeend',`<svg class="map-hexes" data-width="${width}" aria-hidden="true"><defs><pattern id="map-hex-grid" width="${w}" height="${2 * h}" patternUnits="userSpaceOnUse"><path d="${[[0,0],[w,0],[w / 2,h],[0,2 * h],[w,2 * h]].map(([x,y]) => hexPath(x,y,r)).join('')}"/></pattern></defs><rect width="100%" height="100%" fill="url(#map-hex-grid)"/><path class="map-hex-target" d=""/></svg>`);
    return map.querySelector('.map-hexes');
  }
  let drag=null, swallowClick=false;
  const mapElement=()=>document.querySelector('[data-timeline-map]');
  function endDrag() {
    if(!drag)return;
    drag.ghost?.remove();drag.source.classList?.remove('timeline-pin-dragging');drag.dropOn?.classList?.remove('map-tray-drop');
    const map=mapElement();map?.classList.remove('timeline-map-dragging');map?.querySelector('.map-hexes')?.remove();
    drag=null;
  }
  document.addEventListener('pointerdown',event=>{
    const source=event.target.closest?.('[data-tray-token],.timeline-pin[data-pin-id]'), map=mapElement();
    if(!source||!map||event.button!==0)return;
    let item=null,key=source.dataset.trayToken;
    if(!key){item=store().get(path('timeline',source.dataset.pinId));if(!item)return;item={...item,id:source.dataset.pinId};key=item.noteId?noteKey(item.kind,item.targetId,item.noteId):`${item.kind}:${item.targetId}`;}
    else item=mapPins(numberedNotes()).find(p=>p.key===key)||null;
    if(item&&!canMovePin(item))return;
    drag={source,key,item,x0:event.clientX,y0:event.clientY,moved:false,ghost:null,at:null};
  });
  document.addEventListener('pointermove',event=>{
    if(!drag)return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.x0,event.clientY-drag.y0)<5)return;
    event.preventDefault?.();
    const map=mapElement();
    if(!map){endDrag();return;}
    if(!drag.moved){
      drag.moved=true;
      drag.ghost=document.createElement('div');
      drag.ghost.className=`map-drag-ghost ${drag.source.className.match(/(map-tray|timeline-pin)-(pcs|npcs|place)/)?.[0].replace(/^map-tray/,'timeline-pin')||''}`;
      // The ghost is the character's face, with the note's number when it is a note.
      const {kind,targetId,noteId}=splitKey(drag.key),target=pinTarget(kind,targetId),note=noteId&&numberedNotes().get(drag.key);
      const color=drag.source.style?.getPropertyValue?.('--clan')||'';
      drag.ghost.className=`map-drag-ghost timeline-pin-${tokenClass(kind,target)}${color?' has-clan':''}`;if(color)drag.ghost.style.setProperty?.('--clan',color);
      drag.ghost.innerHTML=(target?tokenFace(target):'<span class="timeline-pin-dot"></span>')+numberBadge(note);
      document.body.append(drag.ghost);
      if(drag.source.dataset.pinId)drag.source.classList.add('timeline-pin-dragging');
    }
    drag.ghost.style.left=`${event.clientX}px`;drag.ghost.style.top=`${event.clientY}px`;
    // Over another name or a clan, the dragged character goes under it; over a group title, it
    // comes out of its clan or parent. Notes are only for the map.
    drag.dropOn?.classList?.remove('map-tray-drop');drag.dropOn=null;drag.nest=undefined;
    const hit=drag.source.dataset?.trayToken&&!splitKey(drag.key).noteId&&document.elementFromPoint?.(event.clientX,event.clientY)?.closest?.('.map-tray-token,.map-tray-title');
    if(hit){
      const into=hit.dataset?.trayClan?`clans:${hit.dataset.trayClan}`:hit.dataset?.trayToken||'';
      if(hit.classList?.contains('map-tray-title')||(into&&splitKey(into).noteId===''&&into!==drag.key&&!isUnder(into,drag.key))){
        drag.nest=hit.classList?.contains('map-tray-title')?'':into;drag.dropOn=hit;hit.classList?.add('map-tray-drop');
        drag.at=null;showHexes(map)?.querySelector('.map-hex-target')?.setAttribute('d','');drag.ghost.classList.toggle('map-drag-ghost-off',false);return;
      }
    }
    const svg=showHexes(map),rect=map.getBoundingClientRect(),px=event.clientX-rect.left,py=event.clientY-rect.top;
    // Over the tray counts as off the map (dropping there takes a pin off), so nothing hides under it.
    const tray=document.querySelector('.map-tray')?.getBoundingClientRect?.(),overTray=!!tray&&event.clientX>=tray.left&&event.clientX<=tray.right&&event.clientY>=tray.top&&event.clientY<=tray.bottom;
    const inside=!overTray&&px>=0&&py>=0&&px<=rect.width&&py<=rect.height;
    const hex=inside&&snapHex(px,py,rect.width);
    drag.at=hex?{x:Math.min(100,Math.max(0,Math.round(hex.x/rect.width*1000)/10)),y:Math.min(100,Math.max(0,Math.round(hex.y/rect.height*1000)/10))}:null;
    svg?.querySelector('.map-hex-target')?.setAttribute('d',hex?hexPath(hex.x,hex.y,rect.width*HEX):'');
    drag.ghost.classList.toggle('map-drag-ghost-off',!hex);
  });
  document.addEventListener('pointercancel',endDrag);
  document.addEventListener('pointerup',()=>{
    if(!drag)return;
    const done=drag;endDrag();
    if(!done.moved)return;
    swallowClick=true;setTimeout(()=>{swallowClick=false;},400);
    const {kind,targetId,noteId}=splitKey(done.key),now=new Date().toISOString();
    if(done.nest!==undefined){
      const link=path('tree',done.key),parent=done.nest&&splitKey(done.nest);
      if(parent)store().queue(link,{parentKind:parent.kind,parentId:parent.targetId,updatedAt:now});
      else if(store().get(link))store().queue(link,null);
    } else if(done.at){
      const {id,target:_t,note:_n,key:_k,sessionId:_s,noteId:_o,...previous}=done.item||{};
      store().queue(path('timeline',id||crypto.randomUUID()),{...previous,kind,targetId,...(noteId?{noteId}:{}),x:done.at.x,y:done.at.y,createdAt:previous.createdAt||now,updatedAt:now,creatorUid:previous.creatorUid||store().uid});
    } else if(done.item?.id) store().queue(path('timeline',done.item.id),null);
    changed();
  });
  document.addEventListener('click',event=>{if(swallowClick){event.preventDefault();event.stopPropagation();swallowClick=false;}},true);
  document.addEventListener('click',event=>{const b=event.target.closest('[data-campaign]');
    if(b?.dataset.campaign==='timeline-arrow'){const pin=document.querySelector(`.timeline-pin[data-pin-id="${CSS.escape(b.dataset.id)}"]`);if(pin){const r=pin.getBoundingClientRect();window.scrollTo({top:window.scrollY+r.top+r.height/2-window.innerHeight/2,left:window.scrollX+r.left+r.width/2-document.documentElement.clientWidth/2,behavior:'smooth'});}return;}
    if(b)act(b.dataset.campaign,b.dataset.id);});
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
  // An image added to the plot or session being drafted; it is saved with the rest.
  function addEntryImage(kind,picture) {
    const draft=kind==='plot'?plotDraft:kind==='session'?sessionDraft:null;
    if (draft) draft.images=[...(draft.images||[]),picture].slice(0,MAX_IMAGES);
  }
  document.addEventListener('input',event=>{
    if(event.target.dataset?.traySearch===undefined)return;
    const query=event.target.value.trim().toLowerCase();
    // A row shows when its name, a name under it, or a name above it matches.
    const matches=row=>!!row.querySelector('.map-tray-token')?.textContent.toLowerCase().includes(query),selfMatch=new Set();
    for(const row of event.target.closest('.map-tray')?.querySelectorAll('[data-tray-row]')||[]){
      const above=row.parentElement?.closest?.('[data-tray-row]'),own=!!query&&matches(row);
      if(own||(above&&selfMatch.has(above)))selfMatch.add(row);
      row.hidden=!!query&&!selfMatch.has(row)&&![...row.querySelectorAll('.map-tray-token')].some(t=>t.textContent.toLowerCase().includes(query));
    }
  });
  // Tray groups fold (toggle does not bubble, so listen in the capture phase).
  document.addEventListener('toggle',event=>{const name=event.target?.dataset?.trayGroup;if(name){if(event.target.open)trayClosed.delete(name);else trayClosed.add(name);}},true);
  document.addEventListener('change',async event=>{
    if (event.target.dataset?.npcPlace !== undefined && gm()) {
      const place=event.target.checked;
      if (npcDraft) npcDraft.place=place;
      else {const data=store().get(path('npcs',npcId));if(data)store().queue(path('npcs',npcId),{...data,place,updatedAt:new Date().toISOString()});}
      return;
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
      const kind=event.target.dataset.entryKind,draft=kind==='plot'?plotDraft:kind==='session'?sessionDraft:noteDraft;
      if(!draft)return;
      draft[entryField]=event.target.value;
      // Plots and sessions need a title; journal entries need text.
      const save=document.querySelector(`[data-campaign="${kind}-save"]`);
      if(save)save.disabled=busy||(kind==='note'?!String(draft.text||'').trim():!String(draft.title||'').trim());
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
  window.addEventListener('hashchange',()=>{if(location.hash!=='#/campaigns')clearCardSheets();if(!location.hash.startsWith('#/create-character')&&!location.hash.startsWith('#/characters/')&&!(decodedRoute().startsWith('campaigns/')&&resolveCampaign(decodedRoute().split('/')[1])===creatorCampaign))creatorCampaign=null;});
  // Start page row: the campaign cards (or Sign in).
  // Every campaign is listed for anyone signed in (from the public lookup: id and title only).
  // One you are not in opens its page, where you ask to be invited.
  let directory = {backend:null,list:[],stop:null};
  function otherCampaigns() {
    const backend = store().backend;
    if (directory.backend !== backend) {
      directory.stop?.();
      directory = {backend,list:[],stop:null};
      directory.stop = backend?.watchDirectory?.(list => { if (directory.backend === backend) { directory.list = list; changed(); } }) || null;
    }
    // The GM keeps the lookup current for each of their campaigns, so all of them are listed.
    for (const c of store().list('campaigns/')) if (c.gmUid === store().uid && published.get(c.id) !== c.title) { published.set(c.id,c.title); backend?.publishDirectory?.(c.id,c.title).catch(()=>{}); }
    const mine = new Set(store().list('campaigns/').map(c => c.id));
    return directory.list.filter(d => d.campaignId && !mine.has(d.campaignId)).sort((a,b) => (a.title || '').localeCompare(b.title || ''))
      .map(d => UI.card({attrs:{'class':'panel campaign-card campaign-card-other'},href:'#/campaigns/'+encodeURIComponent(`${window.Routes?.slugify(d.title || 'campaign') || 'campaign'}-${d.campaignId.slice(0,8)}`),bodyHtml:`<h2>${e(d.title || 'Campaign')}</h2><p class="campaign-card-role">${otherState(d.campaignId)}</p>`})).join('');
  }
  function otherState(c) {
    const r = myRequest(c);
    return r.data?.inviteToken ? (r.error ? 'Approved · could not join, open to retry' : 'Approved · joining…') : r.data ? 'Request sent · waiting for the GM' : 'Not joined · ask to be invited';
  }
  function homeCampaigns() {
    if (!store().uid) return {signedIn:false,html:button('sign-in','Sign in with Google')};
    const campaigns = store().list('campaigns/');
    watchCardSheets(campaigns);
    return {signedIn:true,html:campaigns.map(campaignCard).join('')+otherCampaigns(),create:button('create','Add Campaign')};
  }
  window.CampaignUI={render,refresh,mountEditor,homeCampaigns,creatorReturn:()=>creatorCampaign?campaignHref(creatorCampaign,'pcs'):null};
})();
