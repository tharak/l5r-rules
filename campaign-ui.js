(() => {
  const UI = window.UI;
  const store = () => window.CampaignStorage;
  const e = UI.escape;
  let accountUid = null, active = '', section = 'sessions', sessionId = '', npcId = '', npcDraft = null, sheetId = '', picking = false, error = '', busy = false, invite = null, inviteLoaded = '', editor = null, creatorCampaign = null, renderAgain, watchGeneration = 0;
  let plotId='', plotDraft=null, noteId='', noteDraft=null, noteTarget=null, pcNotesId='';
  const sheets = new Map(), stops = new Map();
  const cardSheets = new Map();
  const changed = () => window.dispatchEvent(new Event('campaign-sheet-changed'));
  const button = (action,text,id='',disabled=false) => UI.button({text,variant:/cancel|close|edit|open|notes|link|picker/.test(action)?'secondary':'primary',attrs:{'data-campaign':action,'data-id':id,disabled:busy||disabled}});
  const statusMessage = () => error || (store().status === 'Connected' ? '' : store().status);
  const statusPanel = () => UI.feedback({text:statusMessage(),kind:error?'error':'status',attrs:{class:'campaign-status',hidden:!statusMessage()}});
  const path = (kind,id) => `campaigns/${active}/${kind}/${id}`;
  const inviteURL = token => location.href.split('#')[0]+'#/invite/'+token;
  const own = pc => pc.ownerUid === store().uid;
  const gm = () => store().get(`campaigns/${active}`)?.gmUid === store().uid;
  const cardKey = pc => `${pc.ownerUid}/${pc.characterId}`;
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
        const name = metadata?.fromCache || metadata?.hasPendingWrites ? '' : data?.sections?.identity?.name || '';
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
    return UI.card({attrs:{'class':'panel campaign-card'},href:`#/campaigns/${campaign.id}`,bodyHtml:`<h2>${e(campaign.title)}</h2><p class="campaign-card-role">${campaign.gmUid===store().uid?'GM':'Player'}</p>${pcs.length?`<ul class="campaign-card-pcs" aria-label="Player characters">${names}</ul>`:'<p class="campaign-card-empty">No PCs linked yet.</p>'}`});
  }
  function reset(next) {
    if (next === active) return;
    watchGeneration++;
    for (const stop of stops.values()) stop?.(); stops.clear(); sheets.clear();
    active = next; section = 'sessions'; sessionId = npcId = sheetId = ''; npcDraft = null; picking = false; editor = null; error = '';
    plotId=noteId=pcNotesId='';plotDraft=noteDraft=noteTarget=null;
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
    return sheets.get(pc.id+':public')?.data?.sections?.identity?.name || 'Private PC';
  }
  function playerName(pc) {
    return store().get(path('members',pc.ownerUid))?.displayName || 'Player';
  }
  const entryOwner = entry => entry.creatorUid === store().uid;
  const visibilityLabel = entry => entry.public ? 'Public · Campaign members' : 'Private · Creator and GM';
  const entryAuthor = entry => store().get(path('members',entry.creatorUid))?.displayName || 'Player';
  function entryEditor(kind,draft) {
    const plot=kind==='plot';
    const attrs = key => ({'data-entry-field':key,'data-entry-kind':kind});
    return UI.recordEditor({attrs:{class:'entry-editor','data-entry-editor':kind},fields:[
      ...(plot?[{label:'Plot title',value:draft.title,attrs:{...attrs('title'),maxlength:200}}]:[]),
      {label:plot?'Plot point':'Note',kind:'textarea',value:draft.text,attrs:{...attrs('text'),maxlength:400000}},
      {label:'Visibility',kind:'select',value:draft.public?'public':'private',attrs:attrs('public'),options:[{value:'private',label:'Private — creator and GM'},{value:'public',label:'Public — campaign members'}]},
    ],actionsHtml:button(kind+'-save',plot?'Save plot':'Save note','',!draft.text.trim()||(plot&&!draft.title.trim()))+button(kind+'-cancel','Cancel')});
  }
  function sessionEditor(session,isGM) {
    return UI.recordEditor({fields:[
      {label:'Title',value:session.title,attrs:{'data-campaign-field':'session-title',maxlength:200,readonly:!isGM}},
      {label:'Session notes',kind:'textarea',value:session.text,attrs:{class:'session-text','data-campaign-field':'session-text',readonly:!isGM}},
    ],actionsHtml:isGM?button('session-save','Save session')+button('session-delete','Delete session',session.id):button('session-close','Close')});
  }
  function npcEditor(npc) {
    return UI.recordEditor({fields:[
      {label:'Name',value:npc.name,attrs:{'data-campaign-field':'npc-name',maxlength:200}},
      {label:'Notes',kind:'textarea',value:npc.notes,attrs:{'data-campaign-field':'npc-notes'}},
    ],actionsHtml:button('npc-save','Save NPC','',!npc.name.trim())+(npcId?button('npc-delete','Delete NPC',npcId):'')});
  }
  function notesFor(kind,id) {
    const notes=store().list(path('notes','')).filter(n=>n.targetKind===kind&&n.targetId===id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    const drafting=noteTarget?.kind===kind&&noteTarget?.id===id&&noteDraft;
    return `<section class="campaign-notes" data-note-target-kind="${kind}" data-note-target-id="${e(id)}">${UI.sectionHeading({title:'Notes',level:3,actionsHtml:`${button('note-new','+ Note',kind+':'+id)}`})}${notes.map(n=>`<article class="campaign-note"><div class="workspace-head"><small>${e(entryAuthor(n))} · ${visibilityLabel(n)}</small>${entryOwner(n)?UI.actionRow({attrs:{'class':'campaign-actions'},bodyHtml:`${button('note-edit','Edit note',n.id)}${button('note-delete','Delete note',n.id)}`}):''}</div><p class="entry-text">${e(n.text)}</p></article>`).join('')||'<p>No notes yet.</p>'}${drafting?entryEditor('note',noteDraft):''}</section>`;
  }
  function renderPlots(plots) {
    const selected=plots.find(p=>p.id===plotId);
    return `${UI.sectionHeading({title:'Plots',level:2,actionsHtml:`${button('plot-new','+ Plot')}`})}<p class="entry-help">Add clues, plans, or secrets. You choose whether your plot points and notes are public or private.</p><div class="plot-list">${plots.map(p=>button('plot-open',p.title+' · '+(p.public?'Public':'Private'),p.id)).join('')||'<p>No plot points yet.</p>'}</div>${plotDraft?entryEditor('plot',plotDraft):selected?`<article class="campaign-plot"><h3>${e(selected.title)}</h3><small>${e(entryAuthor(selected))} · ${visibilityLabel(selected)}</small><p class="entry-text">${e(selected.text)}</p>${entryOwner(selected)?button('plot-edit','Edit plot',selected.id)+button('plot-delete','Delete plot',selected.id):''}${notesFor('plots',selected.id)}</article>`:''}`;
  }
  function render(slug) {
    renderAgain ||= () => {};
    if (accountUid !== store().uid) { clearCardSheets(); active = '!'; reset(''); accountUid = store().uid; inviteLoaded = ''; }
    if (slug !== 'campaigns') clearCardSheets();
    if (!store().uid) { reset(''); return `<div class="workspace"><h1>Campaigns</h1><p>Use Account in the top right to sign in and create or join shared campaigns.</p><p><a href="#/characters">Open device characters</a></p></div>`; }
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
      return `<div class="workspace">${UI.sectionHeading({title:'Campaigns',level:1,actionsHtml:`${button('create','Create campaign')}`})}${statusPanel()}<div class="campaign-list">${campaigns.map(campaignCard).join('') || '<p>No campaigns yet.</p>'}</div>${Object.keys(store().drafts()).length ? UI.disclosure({attrs:{},titleHtml:`Retained drafts`,bodyHtml:`${Object.entries(store().drafts()).map(([path,data])=>`<h3>${e(path)}</h3><pre>${e(data?.text || data?.notes || JSON.stringify(data))}</pre>`).join('')}`}) : ''}</div>`;
    }
    reset(slug.slice('campaigns/'.length));
    const c = store().get(`campaigns/${active}`);
    if (!c) { reset(''); return '<div class="workspace"><h1>Campaign unavailable</h1><p>Loading, or membership is no longer active.</p><a href="#/campaigns">Campaigns</a></div>'; }
    const isGM = gm(), sessions = store().list(path('sessions','')), npcs = isGM ? store().list(path('npcs','')) : [], pcs = store().list(path('pcs',''));
    const plots=store().list(path('plots',''));
    if(plotId&&!plots.some(p=>p.id===plotId)){plotId='';plotDraft=null;if(noteTarget?.kind==='plots'){noteTarget=noteDraft=null;noteId='';}}
    if (!isGM && section === 'npcs') section = 'sessions';
    if (sessionId && !sessions.some(s=>s.id===sessionId)) sessionId = '';
    const s = sessions.find(s=>s.id===sessionId), n = npcDraft || npcs.find(n=>n.id===npcId);
    for (const pc of pcs) if (!own(pc)) watch(pc);
    for (const [key,stop] of stops) if (!pcs.some(pc=>key.startsWith(pc.id+':'))) { stop?.(); stops.delete(key); sheets.delete(key); }
    const selectedPC = pcs.find(pc=>pc.id===sheetId);
    if (selectedPC && isGM && !own(selectedPC)) watch(selectedPC,true);
    const invitation = isGM ? store().get(path('private','invitation')) : null;
    return `<div class="workspace campaign-workspace"><a href="#/campaigns">← Campaigns</a><div class="workspace-head">${isGM?UI.field({label:'Campaign title',labelAttrs:{'class':'campaign-title'},attrs:{'data-campaign-field':'title','maxlength':'200','value':c.title}}):`<h1>${e(c.title)}</h1>`}${isGM?button('delete-campaign','Delete campaign'):button('leave','Leave campaign')}</div>${statusPanel()}
      <div class="campaign-grid">${UI.panel({attrs:{'class':'panel campaign-content'},bodyHtml:`${UI.choiceGroup({label:'Campaign sections',value:section,attrs:{class:'campaign-segments'},choices:[['sessions','Sessions'],['pcs','PC'],...(isGM?[['npcs','NPC']]:[]),['plots','Plots']].map(([value,label])=>({value,label,attrs:{'data-campaign':'section','data-id':value,disabled:busy}}))})}
      ${section==='sessions'?`${UI.sectionHeading({title:'Sessions',level:2,actionsHtml:`${isGM?button('session-new','+ Session'):''}`})}<div class="session-list">${sessions.map(s=>button('session-open',s.title || 'Untitled session',s.id)).join('')}</div>${s?`${sessionEditor(s,isGM)}${notesFor('sessions',s.id)}`:sessions.length?'':'<p>No sessions yet.</p>'}`:''}
      ${section==='pcs'?`${UI.sectionHeading({title:'PC roster',level:2,actionsHtml:UI.actionRow({attrs:{'class':'campaign-actions'},bodyHtml:`${button('pc-picker','+PC')}${isGM?button('share-invite','Invite link'):''}`})})}${pcs.map(pc=>`${UI.recordRow({attrs:{'class':'roster-row'},bodyHtml:`<span>${e(label(pc))} (${e(playerName(pc))})</span>${own(pc)||isGM?button('pc-open','Edit',pc.id):''}${button('pc-notes','Notes',pc.id)}${isGM||own(pc)?button('pc-remove','Remove',pc.id):''}`})}${pcNotesId===pc.id?`<h3>${e(label(pc))}</h3>${notesFor('pcs',pc.id)}`:''}`).join('') || '<p>No PCs linked yet.</p>'}${picking?`<div class="pc-picker"><h3>Add a personal PC</h3>${window.CharacterBuilder.list().filter(personal=>!pcs.some(pc=>own(pc)&&pc.characterId===personal.id)).map(pc=>button('pc-link',pc.name||'Unnamed PC',pc.id)).join('')}${button('pc-create','Create PC')}</div>`:''}${invitation?UI.disclosure({attrs:{'class':'invite-settings'},titleHtml:`Invite settings`,bodyHtml:`<p>Invite links expire after seven days.</p>${button('invite','Replace invite link')}${button('revoke','Revoke invite')}`}):''}`:''}
      ${section==='npcs'&&isGM?`${UI.sectionHeading({title:'NPCs',level:2,actionsHtml:`${button('npc-new','+NPC')}`})}<div class="npc-list">${npcs.map(n=>button('npc-open',n.name||'Unnamed NPC',n.id)).join('')}</div>${n?`${npcEditor(n)}${npcId?notesFor('npcs',npcId):''}`:''}`:''}
      ${section==='plots'?renderPlots(plots):''}`})}
      </div>${section==='pcs'&&selectedPC&&isGM&&!own(selectedPC)?'<div id="campaign-editor"></div>':''}</div>`;
  }
  function mountEditor() {
    const target = document.getElementById('campaign-editor');
    if (!target || !sheetId) return;
    const item = sheets.get(sheetId+':full');
    if (!item?.data) { target.textContent = 'Loading full sheet…'; return; }
    const data = item.data, pc = item.pc;
    const pending = store().get(path('sheetEdits',sheetId));
    const sheet = pending?.sheet || JSON.parse(data.sheetJson); sheet.visibility = data.visibility || window.SheetSharing.visibility(sheet);
    window.CharacterBuilder.mount(target,{sheet,returnHref:`#/campaigns/${active}`,save(next){
      // Shared edits use the same durable campaign outbox and atomic sheet writer.
      const fullPath = path('sheetEdits',sheetId);
      store().queue(fullPath,{ownerUid:pc.ownerUid,characterId:pc.characterId,sheet:next,updatedAt:new Date().toISOString()});
    },close(){sheetId='';editor=null;changed();}});
    editor = data.revision;
  }
  function refresh(renderPage) {
    renderAgain = renderPage;
    const focused = document.activeElement;
    if (focused && document.getElementById('app')?.contains(focused) && ['INPUT','TEXTAREA','SELECT'].includes(focused.tagName)) {
      const status = document.querySelector('.campaign-status'); if(status){status.textContent=statusMessage();status.hidden=!statusMessage();}
      return;
    }
    renderPage();
  }
  async function act(action,id) {
    if (busy) return;
    const backend = store().backend;
    error = ''; busy = true;
    try {
      if (!backend) throw new Error('Sign in first.');
      if (action==='create') {
        const title = window.prompt('Campaign title'); if (!title?.trim()) return;
        location.hash = '#/campaigns/'+await backend.create(title.trim().slice(0,200));
      } else if (action==='join') location.hash='#/campaigns/'+await backend.join(id);
      else if (action==='section') {if(['sessions','pcs','npcs','plots'].includes(id) && (id!=='npcs'||gm()))section=id;}
      else if (action==='pc-notes') pcNotesId=pcNotesId===id?'':id;
      else if (action==='plot-new') {plotId='';plotDraft={title:'',text:'',public:false};}
      else if (action==='plot-open') {plotId=id;plotDraft=null;}
      else if (action==='plot-edit') {const data=store().get(path('plots',id));if(data&&entryOwner(data)){plotId=id;plotDraft={...data};}}
      else if (action==='plot-cancel') plotDraft=null;
      else if (action==='note-new') {const [kind,targetId]=id.split(':');noteId='';noteTarget={kind,id:targetId};noteDraft={text:'',public:false};}
      else if (action==='note-edit') {const data=store().get(path('notes',id));if(data&&entryOwner(data)){noteId=id;noteTarget={kind:data.targetKind,id:data.targetId};noteDraft={...data};}}
      else if (action==='note-cancel') {noteDraft=noteTarget=null;noteId='';}
      else if (action==='plot-save'||action==='note-save') {
        const plot=action==='plot-save',draft=plot?plotDraft:noteDraft;
        if(!draft?.text.trim()||(plot&&!draft.title.trim()))return;
        const now=new Date().toISOString(),entryId=(plot?plotId:noteId)||crypto.randomUUID();
        const data={...draft,creatorUid:store().uid,createdAt:draft.createdAt||now,updatedAt:now,revision:crypto.randomUUID()};
        if(plot)data.title=data.title.trim();else {
          Object.assign(data,{targetKind:noteTarget.kind,targetId:noteTarget.id});
          if(noteTarget.kind==='plots')data.targetCreatorUid=store().get(path('plots',noteTarget.id))?.creatorUid;
        }
        delete data.id;
        store().queue(path(plot?'plots':'notes',entryId),data);
        if(plot){plotId=entryId;plotDraft=null;}else{noteId='';noteDraft=noteTarget=null;}
        store().flush();
      }
      else if(action==='plot-delete'||action==='note-delete') {
        const kind=action==='plot-delete'?'plots':'notes',data=store().get(path(kind,id));
        if(data&&entryOwner(data)&&window.confirm(`Delete this ${kind==='plots'?'plot point and its attached notes':'note'}?`)) {
          store().queue(path(kind,id),null);store().flush();
          if(kind==='plots'){plotId='';plotDraft=null;}else if(noteId===id){noteId='';noteDraft=noteTarget=null;}
        }
      }
      else if (action==='session-new') { sessionId=crypto.randomUUID();store().queue(path('sessions',sessionId),{title:'New session',text:'',updatedAt:new Date().toISOString()}); }
      else if (action==='session-open') sessionId=id;
      else if (action==='session-save') {
        const session=store().get(path('sessions',sessionId));
        if(!gm() || !session)return;
        store().queue(path('sessions',sessionId),{...session,updatedAt:new Date().toISOString()});
        sessionId='';store().flush();
      }
      else if (action==='session-close') sessionId='';
      else if (action==='session-delete') {if(window.confirm('Delete this session?'))store().queue(path('sessions',id),null);}
      else if (action==='npc-new') {npcId='';npcDraft={name:'',notes:''};}
      else if (action==='npc-open') {npcId=id;npcDraft=null;}
      else if (action==='npc-save') {
        const draft=npcDraft || store().get(path('npcs',npcId));
        if (!gm() || !draft || !draft.name.trim()) return;
        store().queue(path('npcs',npcId || crypto.randomUUID()),{name:draft.name.trim(),notes:draft.notes,updatedAt:new Date().toISOString()});
        npcId='';npcDraft=null;
        store().flush();
      }
      else if (action==='npc-delete') {if(window.confirm('Delete this NPC?'))store().queue(path('npcs',id),null);}
      else if (action==='pc-picker') picking=!picking;
      else if (action==='pc-link') {await backend.link(active,id);picking=false;}
      else if (action==='pc-create') {const campaign=active;const id=window.CharacterBuilder.create();await backend.link(campaign,id);picking=false;creatorCampaign=campaign;location.hash='#/create-character';}
      else if (action==='pc-open') {
        const pc=store().get(path('pcs',id));
        if(!pc||(!own(pc)&&!gm()))return;
        if (own(pc)) {window.CharacterBuilder.open(pc.characterId);creatorCampaign=active;location.hash='#/create-character';}
        else {sheetId=id;editor=null;}
      } else if (action==='pc-remove') {store().queue(path('pcs',id),null);sheetId='';}
      else if (action==='close-sheet') {sheetId='';editor=null;}
      else if (action==='share-invite'||action==='invite') {
        if (!gm()) return;
        const campaign=active;
        changed();
        let token=action==='share-invite'?(await backend.get(path('private','invitation')))?.token:null;
        if (token) {
          try {await backend.invitation(token);}
          catch (err) {
            if(err.code!=='permission-denied' && err.message!=='This invitation has expired or was revoked.')throw err;
            token=null;
          }
        }
        token ||= await backend.invite(campaign);
        if(active!==campaign || store().backend!==backend || !gm())return;
        const url=inviteURL(token);
        try {
          await navigator.clipboard.writeText(url);
          error='Invite link copied.';
        } catch {
          window.prompt('Copy this invite link:',url);
        }
      }
      else if (action==='revoke') await backend.revoke(active);
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
  document.addEventListener('click',event=>{const b=event.target.closest('[data-campaign]');if(b)act(b.dataset.campaign,b.dataset.id);});
  document.addEventListener('input',event=>{
    const entryField=event.target.dataset.entryField;
    if(entryField) {
      const kind=event.target.dataset.entryKind,draft=kind==='plot'?plotDraft:noteDraft;
      if(!draft)return;
      draft[entryField]=entryField==='public'?event.target.value==='public':event.target.value;
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
    const data=store().get(path(kind,id));if(data)store().queue(path(kind,id),{...data,[field.split('-')[1]==='title'?'title':field.split('-')[1]==='text'?'text':field.split('-')[1]==='name'?'name':'notes']:event.target.value,updatedAt:new Date().toISOString()});
  });
  document.addEventListener('focusout',event=>{
    if (event.relatedTarget?.closest('[data-campaign]') || (event.target.dataset.campaignField?.startsWith('npc-') && npcDraft)) return;
    if(event.target.dataset.campaignField)setTimeout(()=>{if(renderAgain)refresh(renderAgain);},0);
  });
  window.addEventListener('hashchange',()=>{if(location.hash!=='#/campaigns')clearCardSheets();if(!location.hash.startsWith('#/invite/')) {inviteLoaded='';invite=null;} if(!location.hash.startsWith('#/create-character')&&!location.hash.startsWith('#/campaigns/'+creatorCampaign))creatorCampaign=null;});
  window.CampaignUI={render,refresh,mountEditor,creatorReturn:()=>creatorCampaign?'#/campaigns/'+creatorCampaign:null};
})();
