(() => {
  const store = () => window.CampaignStorage;
  const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let accountUid = null, active = '', section = 'sessions', sessionId = '', npcId = '', npcDraft = null, sheetId = '', picking = false, error = '', busy = false, invite = null, inviteLoaded = '', editor = null, creatorCampaign = null, renderAgain, watchGeneration = 0;
  const sheets = new Map(), stops = new Map();
  const changed = () => window.dispatchEvent(new Event('campaign-sheet-changed'));
  const button = (action,text,id='',disabled=false) => `<button type="button" data-campaign="${action}" data-id="${e(id)}" ${busy||disabled?'disabled':''}>${text}</button>`;
  const path = (kind,id) => `campaigns/${active}/${kind}/${id}`;
  const own = pc => pc.ownerUid === store().uid;
  const gm = () => store().get(`campaigns/${active}`)?.gmUid === store().uid;
  function reset(next) {
    if (next === active) return;
    watchGeneration++;
    for (const stop of stops.values()) stop?.(); stops.clear(); sheets.clear();
    active = next; section = 'sessions'; sessionId = npcId = sheetId = ''; npcDraft = null; picking = false; editor = null; error = '';
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
  const fields = value => {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.length ? `<ul>${value.map(v=>`<li>${fields(v)}</li>`).join('')}</ul>` : '—';
    if (typeof value === 'object') return `<dl>${Object.entries(value).map(([k,v])=>`<dt>${e(k.replace(/([A-Z])/g,' $1'))}</dt><dd>${fields(v)}</dd>`).join('')}</dl>`;
    return e(value);
  };
  function sharedSheet(pc) {
    const data = sheets.get(pc.id+':public')?.data;
    if (!data) return '<p>Loading shared sheet…</p>';
    return `<section class="panel shared-sheet"><div class="workspace-head"><h2>${e(label(pc))}</h2>${button('close-sheet','Close')}${button('print-shared','Print')}${button('export-shared','Export JSON')}</div>${Object.entries(data.sections).map(([key,value])=>`<section><h3>${e(window.SheetSharing.labels[window.SheetSharing.keys.indexOf(key)])}</h3>${fields(value)}</section>`).join('') || '<p>This PC has no public sections.</p>'}</section>`;
  }
  function render(slug) {
    renderAgain ||= () => {};
    if (accountUid !== store().uid) { active = '!'; reset(''); accountUid = store().uid; inviteLoaded = ''; }
    if (!store().uid) { reset(''); return `<div class="workspace"><h1>Campaigns</h1><p>Sign in with Google to create or join shared campaigns.</p>${button('sign-in','Sign in with Google')}<p><a href="#/characters">Open device characters</a></p></div>`; }
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
      return `<div class="workspace"><div class="workspace-head"><h1>Campaigns</h1>${button('create','Create campaign')}</div><p role="status">${e(error || store().status)}</p><div class="campaign-list">${store().list('campaigns/').map(c=>`<a class="panel" href="#/campaigns/${e(c.id)}"><h2>${e(c.title)}</h2><p>${c.gmUid===store().uid?'GM':'Player'}</p></a>`).join('') || '<p>No campaigns yet.</p>'}</div>${Object.keys(store().drafts()).length ? `<details><summary>Retained drafts</summary>${Object.entries(store().drafts()).map(([path,data])=>`<h3>${e(path)}</h3><pre>${e(data?.text || data?.notes || JSON.stringify(data))}</pre>`).join('')}</details>` : ''}</div>`;
    }
    reset(slug.slice('campaigns/'.length));
    const c = store().get(`campaigns/${active}`);
    if (!c) { reset(''); return '<div class="workspace"><h1>Campaign unavailable</h1><p>Loading, or membership is no longer active.</p><a href="#/campaigns">Campaigns</a></div>'; }
    const isGM = gm(), sessions = store().list(path('sessions','')), npcs = isGM ? store().list(path('npcs','')) : [], pcs = store().list(path('pcs','')), members = store().list(path('members',''));
    if (!isGM && section === 'npcs') section = 'sessions';
    if (!sessionId || !sessions.some(s=>s.id===sessionId)) sessionId = sessions[0]?.id || '';
    const s = sessions.find(s=>s.id===sessionId), n = npcDraft || npcs.find(n=>n.id===npcId);
    for (const pc of pcs) if (!own(pc)) watch(pc);
    for (const [key,stop] of stops) if (!pcs.some(pc=>key.startsWith(pc.id+':'))) { stop?.(); stops.delete(key); sheets.delete(key); }
    const selectedPC = pcs.find(pc=>pc.id===sheetId);
    if (selectedPC && isGM && !own(selectedPC)) watch(selectedPC,true);
    const invitation = isGM ? store().get(path('private','invitation')) : null;
    return `<div class="workspace campaign-workspace"><a href="#/campaigns">← Campaigns</a><div class="workspace-head">${isGM?`<label class="campaign-title">Campaign title<input data-campaign-field="title" maxlength="200" value="${e(c.title)}"></label>`:`<h1>${e(c.title)}</h1>`}${isGM?button('delete-campaign','Delete campaign'):button('leave','Leave campaign')}</div><p class="campaign-status" role="status">${e(error || store().status)}</p>
      <div class="campaign-grid"><section class="panel campaign-content"><div class="campaign-segments" role="group" aria-label="Campaign sections">${[['sessions','Sessions'],['pcs','PC'],...(isGM?[['npcs','NPC']]:[])].map(([key,label])=>`<button type="button" data-campaign="section" data-id="${key}" aria-pressed="${section===key}" ${busy?'disabled':''}>${label}</button>`).join('')}</div>
      ${section==='sessions'?`<div class="workspace-head"><h2>Sessions</h2>${isGM?button('session-new','+ Session'):''}</div><div class="session-list">${sessions.map(s=>button('session-open',e(s.title || 'Untitled session'),s.id)).join('')}</div>${s?`<label>Title<input data-campaign-field="session-title" value="${e(s.title)}" maxlength="200" ${isGM?'':'readonly'}></label><label>Session notes<textarea class="session-text" data-campaign-field="session-text" ${isGM?'':'readonly'}>
${e(s.text)}</textarea></label>${isGM?button('session-delete','Delete session',s.id):''}`:'<p>No sessions yet.</p>'}`:''}
      ${section==='pcs'?`<div class="workspace-head"><h2>PC roster</h2>${button('pc-picker','+PC')}</div>${pcs.map(pc=>`<div class="roster-row"><span>${e(label(pc))}</span>${button('pc-open',own(pc)||isGM?'Edit':'View',pc.id)}${isGM||own(pc)?button('pc-remove','Remove',pc.id):''}</div>`).join('') || '<p>No PCs linked yet.</p>'}${picking?`<div class="pc-picker"><h3>Add a personal PC</h3>${window.CharacterBuilder.list().filter(personal=>!pcs.some(pc=>own(pc)&&pc.characterId===personal.id)).map(pc=>button('pc-link',e(pc.name||'Unnamed PC'),pc.id)).join('')}${button('pc-create','Create PC')}</div>`:''}`:''}
      ${section==='npcs'&&isGM?`<div class="workspace-head"><h2>NPCs</h2>${button('npc-new','+NPC')}</div><div class="npc-list">${npcs.map(n=>button('npc-open',e(n.name||'Unnamed NPC'),n.id)).join('')}</div>${n?`<label>Name<input data-campaign-field="npc-name" maxlength="200" value="${e(n.name)}"></label><label>Notes<textarea data-campaign-field="npc-notes">
${e(n.notes)}</textarea></label>${button('npc-save','Save NPC','',!n.name.trim())}${npcId?button('npc-delete','Delete NPC',npcId):''}`:''}`:''}</section>
      <section class="panel campaign-members"><h2>Members</h2>${members.map(m=>`<div class="roster-row"><span>${m.id===c.gmUid?'GM':m.id===store().uid?'You':`Player ${e(m.id.slice(0,8))}`}</span>${isGM&&m.id!==c.gmUid?button('member-remove','Remove',m.id):''}</div>`).join('')}
      ${isGM?`<h3>Invitation</h3><p>Invite links expire after seven days.</p>${button('invite',invitation?'Replace invite link':'Create invite link')}${invitation?`<label>Invite link<input readonly value="${e(location.href.split('#')[0]+'#/invite/'+invitation.token)}"></label>${button('copy-invite','Copy link',invitation.token)}${button('revoke','Revoke invite')}`:''}`:''}</section></div>${section==='pcs'&&selectedPC?(isGM&&!own(selectedPC)?'<div id="campaign-editor"></div>':sharedSheet(selectedPC)):''}</div>`;
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
    }});
    editor = data.revision;
  }
  function refresh(renderPage) {
    renderAgain = renderPage;
    const focused = document.activeElement;
    if (focused && document.getElementById('app')?.contains(focused) && ['INPUT','TEXTAREA','SELECT'].includes(focused.tagName)) {
      const status = document.querySelector('.campaign-status'); if(status)status.textContent=error||store().status;
      return;
    }
    renderPage();
  }
  async function act(action,id) {
    const backend = store().backend;
    error = ''; busy = true;
    try {
      if (action==='sign-in') { document.getElementById('account-sign-in').click(); return; }
      if (!backend) throw new Error('Sign in first.');
      if (action==='create') {
        const title = window.prompt('Campaign title'); if (!title?.trim()) return;
        location.hash = '#/campaigns/'+await backend.create(title.trim().slice(0,200));
      } else if (action==='join') location.hash='#/campaigns/'+await backend.join(id);
      else if (action==='section') {if(['sessions','pcs','npcs'].includes(id) && (id!=='npcs'||gm()))section=id;}
      else if (action==='session-new') { sessionId=crypto.randomUUID();store().queue(path('sessions',sessionId),{title:'New session',text:'',updatedAt:new Date().toISOString()}); }
      else if (action==='session-open') sessionId=id;
      else if (action==='session-delete') {if(window.confirm('Delete this session?'))store().queue(path('sessions',id),null);}
      else if (action==='npc-new') {npcId='';npcDraft={name:'',notes:''};}
      else if (action==='npc-open') {npcId=id;npcDraft=null;}
      else if (action==='npc-save') {
        const draft=npcDraft || store().get(path('npcs',npcId));
        if (!gm() || !draft || !draft.name.trim()) return;
        store().queue(path('npcs',npcId || crypto.randomUUID()),{name:draft.name.trim(),notes:draft.notes,updatedAt:new Date().toISOString()});
        npcId='';npcDraft={name:'',notes:''};
        store().flush();
      }
      else if (action==='npc-delete') {if(window.confirm('Delete this NPC?'))store().queue(path('npcs',id),null);}
      else if (action==='pc-picker') picking=!picking;
      else if (action==='pc-link') {await backend.link(active,id);picking=false;}
      else if (action==='pc-create') {const campaign=active;const id=window.CharacterBuilder.create();await backend.link(campaign,id);creatorCampaign=campaign;location.hash='#/create-character';}
      else if (action==='pc-open') {
        const pc=store().get(path('pcs',id));
        if (own(pc)) {window.CharacterBuilder.open(pc.characterId);creatorCampaign=active;location.hash='#/create-character';}
        else {sheetId=id;editor=null;}
      } else if (action==='pc-remove') {store().queue(path('pcs',id),null);sheetId='';}
      else if (action==='close-sheet') {sheetId='';editor=null;}
      else if (action==='invite') await backend.invite(active);
      else if (action==='revoke') await backend.revoke(active);
      else if (action==='copy-invite') {await navigator.clipboard.writeText(location.href.split('#')[0]+'#/invite/'+id);error='Invite link copied.';}
      else if (action==='member-remove'||action==='leave') {
        if (!window.confirm(action==='leave'?'Leave this campaign?':'Remove this member and their PC associations?'))return;
        await backend.removeMember(active,action==='leave'?store().uid:id);
        if(action==='leave')location.hash='#/campaigns';
      } else if (action==='delete-campaign') {
        if(!window.confirm('Delete this campaign, its sessions, NPCs, and memberships? Personal PCs are preserved.'))return;
        await store().flush();await backend.deleteCampaign(active);location.hash='#/campaigns';
      } else if (action==='print-shared') window.print();
      else if (action==='export-shared') {
        const data=sheets.get(sheetId+':public')?.data;if(!data)return;
        const url=URL.createObjectURL(new Blob([JSON.stringify({source:'l5r-rules',...data},null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='l5r-rules-shared-pc.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    } catch(err) {error=err.code==='permission-denied'?'Access denied. Check membership or invitation expiry.':err.message;}
    finally {busy=false;changed();}
  }
  document.addEventListener('click',event=>{const b=event.target.closest('[data-campaign]');if(b)act(b.dataset.campaign,b.dataset.id);});
  document.addEventListener('input',event=>{
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
  window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#/invite/')) {inviteLoaded='';invite=null;} if(!location.hash.startsWith('#/create-character')&&!location.hash.startsWith('#/campaigns/'+creatorCampaign))creatorCampaign=null;});
  window.CampaignUI={render,refresh,mountEditor,creatorReturn:()=>creatorCampaign?'#/campaigns/'+creatorCampaign:null};
})();
