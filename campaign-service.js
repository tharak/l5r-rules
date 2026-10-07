export function createCampaignBackend(db,sdk,uid,displayName='') {
  const playerName = () => String((typeof displayName==='function'?displayName():displayName) || '').trim().slice(0,200) || 'Player';
  const ref = path => sdk.doc(db,path);
  const get = async path => { const s = await sdk.getDoc(ref(path)); return s.exists() ? s.data() : null; };
  const commit = async changes => {
    // Lifecycle operations are atomic. Limit membership/PC counts to keep batches reviewable.
    const batch = sdk.writeBatch(db);
    for (const [path,data] of changes) if (data === null) batch.delete(ref(path)); else batch.set(ref(path),data);
    await batch.commit();
  };
  const memberPath = (c,u=uid) => `campaigns/${c}/members/${u}`;
  const indexPath = (c,u=uid) => `users/${u}/campaigns/${c}`;
  const records = async path => (await sdk.getDocs(sdk.collection(db,path))).docs.map(d=>({id:d.id,...d.data()}));
  async function saveCharacter(owner,id,sheet,updatedAt) {
    const encoded = await window.SheetSharing.encode(sheet,updatedAt);
    await commit([[`users/${owner}/characters/${id}`,encoded.full],[`users/${owner}/publicCharacters/${id}`,encoded.public]]);
  }
  async function write(path,data) {
    if (path.includes('/sheetEdits/')) return saveCharacter(data.ownerUid,data.characterId,data.sheet,data.updatedAt);
    const target=path.match(/^campaigns\/([^/]+)\/(sessions|pcs|npcs|plots)\/([^/]+)$/);
    if(data===null && target) {
      // Delete attached bodies without reading them, before a parent ID could be reused.
      const notes=(await records(`campaigns/${target[1]}/notes`)).filter(n=>n.targetKind===target[2]&&n.targetId===target[3]);
      for(let offset=0;offset<notes.length;offset+=200)await commit(notes.slice(offset,offset+200).flatMap(n=>[
        [`campaigns/${target[1]}/notes/${n.id}/content/body`,null],[`campaigns/${target[1]}/notes/${n.id}`,null]
      ]));
    }
    const entry = path.match(/^campaigns\/([^/]+)\/(plots|notes)\/([^/]+)$/);
    if (!entry) return data === null ? sdk.deleteDoc(ref(path)) : sdk.setDoc(ref(path),data);
    const bodyPath = `${path}/content/body`;
    if (data === null) return commit([[bodyPath,null],[path,null]]);
    const {creatorUid,public:isPublic,createdAt,updatedAt,targetKind,targetId,targetCreatorUid} = data;
    const revision = data.revision || crypto.randomUUID();
    const metadata = {creatorUid,public:isPublic,createdAt,updatedAt,revision};
    if (entry[2] === 'notes') {
      Object.assign(metadata,{targetKind,targetId});
      if(targetKind==='plots')metadata.targetCreatorUid=targetCreatorUid;
    }
    const body = {text:data.text,revision};
    if (entry[2] === 'plots') body.title = data.title;
    return commit([[path,metadata],[bodyPath,body]]);
  }
  return {
    get,commit,saveCharacter,
    async syncPlayerName(c) {
      const membership=await get(memberPath(c));
      if(membership && membership.displayName!==playerName())await sdk.updateDoc(ref(memberPath(c)),{displayName:playerName()});
    },
    write,
    subscribe(events) {
      const subscriptions = new Map();
      const cancel = id => { subscriptions.get(id)?.forEach(stop=>stop()); subscriptions.delete(id); events.revoked(id); };
      const stopIndex = sdk.onSnapshot(sdk.collection(db,`users/${uid}/campaigns`),{includeMetadataChanges:true},snapshot=>{
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        const ids = snapshot.docs.map(d=>d.id);
        for (const id of subscriptions.keys()) if (!ids.includes(id)) cancel(id);
        for (const id of ids) if (!subscriptions.has(id)) {
          const stops = []; subscriptions.set(id,stops);
          const catalogs = {sessions:new Map(),pcs:new Map(),npcs:new Map(),plots:new Map(),notes:new Map()};
          const contentStops = new Map();
          const isGM = snapshot.docs.find(d=>d.id===id).data().gmUid === uid;
          stops.push(()=>{for(const item of contentStops.values())item.stop();contentStops.clear();});
          const canRead = data => data.public || data.creatorUid === uid || isGM;
          const targetVisible = data => {
            const target=catalogs[data.targetKind]?.get(data.targetId);
            return !!target && (data.targetKind!=='npcs'||isGM) && (data.targetKind!=='plots'||(target.creatorUid===data.targetCreatorUid&&canRead(target)));
          };
          const refreshContent = () => {
            for (const kind of ['plots','notes']) {
              for(const [entryId,metadata] of catalogs[kind]) {
                const path=`campaigns/${id}/${kind}/${entryId}`, previous=contentStops.get(path);
                const allowed=canRead(metadata) && (kind==='plots'||targetVisible(metadata));
                if(previous && (!allowed || previous.revision!==metadata.revision)) {
                  previous.stop();contentStops.delete(path);if(!allowed)events.receive(path,null);
                }
                if(!allowed || contentStops.has(path))continue;
                const item={revision:metadata.revision,stop:()=>{}};
                contentStops.set(path,item);
                item.stop=sdk.onSnapshot(ref(`${path}/content/body`),body=>{
                  if(contentStops.get(path)!==item)return;
                  const data=body.exists()?body.data():null;
                  if(data?.revision===metadata.revision)events.receive(path,{...metadata,...data});
                },error=>{
                  if(contentStops.get(path)!==item)return;
                  events.receive(path,null);
                  if(error.code!=='permission-denied')events.error(error);
                });
              }
            }
          };
          let profileSynced=false;
          const fail = error => { if (error.code === 'permission-denied') cancel(id); else events.error(error); };
          const watch = path => stops.push(sdk.onSnapshot(ref(path),s=>events.receive(path,s.exists()?s.data():null),fail));
          watch(`campaigns/${id}`);
          const collections = ['members','sessions','pcs'];
          // The immutable GM identifier is available on the private membership index.
          if (isGM) { collections.push('npcs'); watch(`campaigns/${id}/private/invitation`); }
          collections.push('plots','notes');
          for (const collection of collections) {
            const path = `campaigns/${id}/${collection}`;
            stops.push(sdk.onSnapshot(sdk.collection(db,path),{includeMetadataChanges:true},s=>{
              // Confirm privacy against the server before restoring another member's text.
              if(['plots','notes'].includes(collection) && (s.metadata.fromCache || s.metadata.hasPendingWrites))return;
              const entries=['plots','notes'].includes(collection);
              const ids=new Set(s.docs.map(doc=>doc.id));
              const changes=entries ? [
                ...[...catalogs[collection].keys()].filter(key=>!ids.has(key)).map(key=>({type:'removed',doc:{id:key}})),
                ...s.docs.map(doc=>({type:'modified',doc}))
              ] : s.docChanges();
              for (const d of changes) {
                const entryPath=`${path}/${d.doc.id}`;
                if(catalogs[collection]) {
                  if(d.type==='removed')catalogs[collection].delete(d.doc.id);
                  else catalogs[collection].set(d.doc.id,d.doc.data());
                }
                if(['plots','notes'].includes(collection)) {
                  if(d.type==='removed') {
                    contentStops.get(entryPath)?.stop();contentStops.delete(entryPath);events.receive(entryPath,null);
                  }
                } else events.receive(entryPath,d.type==='removed'?null:d.doc.data());
                // Existing memberships acquire their owner's Google display name on sign-in.
                if(collection==='members' && d.doc.id===uid && d.type!=='removed' && !profileSynced) {
                  // Sync once per sign-in so an older tab cannot undo a newer profile name.
                  profileSynced=true;
                  if(d.doc.data().displayName!==playerName())sdk.updateDoc(ref(`${path}/${uid}`),{displayName:playerName()}).catch(events.error);
                }
              }
              refreshContent();
            },fail));
          }
        }
        events.index(ids);
      },events.error);
      return () => { stopIndex(); for (const stops of subscriptions.values()) stops.forEach(stop=>stop()); subscriptions.clear(); };
    },
    async create(title) {
      const id = crypto.randomUUID(), membershipId = crypto.randomUUID();
      await commit([[`campaigns/${id}`,{title,gmUid:uid}],[memberPath(id),{gmUid:uid,membershipId,inviteToken:'',displayName:playerName()}],[indexPath(id),{gmUid:uid,membershipId}]]);
      return id;
    },
    async invite(c) {
      const previous = await get(`campaigns/${c}/private/invitation`);
      const token = crypto.randomUUID(), createdAt = sdk.serverTimestamp(), expiresAt = sdk.Timestamp.fromMillis(Date.now()+7*86400000-60000);
      const changes = [[`invites/${token}`,{campaignId:c,gmUid:uid,createdAt,expiresAt}],[`campaigns/${c}/private/invitation`,{token}]];
      if (previous) changes.push([`invites/${previous.token}`,null]);
      await commit(changes); return token;
    },
    async revoke(c) {
      const previous = await get(`campaigns/${c}/private/invitation`);
      if (previous) await commit([[`invites/${previous.token}`,null],[`campaigns/${c}/private/invitation`,null]]);
    },
    async invitation(token) {
      const invite = await get(`invites/${token}`);
      if (!invite || invite.expiresAt.toMillis() <= Date.now()) throw new Error('This invitation has expired or was revoked.');
      return invite;
    },
    async join(token) {
      const invite = await this.invitation(token), c = invite.campaignId;
      // gmUid is copied from the invitation's campaign by rules; the invite includes no member data.
      if (await get(indexPath(c))) {await this.syncPlayerName(c);return c;}
      const membershipId = crypto.randomUUID();
      await sdk.runTransaction(db,async transaction=>{
        const invitation = await transaction.get(ref(`invites/${token}`));
        if (!invitation.exists()) throw new Error('Invitation revoked.');
        const gmUid = invitation.data().gmUid;
        const membership = {gmUid,membershipId,inviteToken:token,displayName:playerName()};
        transaction.set(ref(memberPath(c)),membership);
        transaction.set(ref(indexPath(c)),{gmUid,membershipId});
      });
      return c;
    },
    async link(c,id) {
      const own = window.CharacterStorage.records().find(r=>r.id===id);
      if (!own) throw new Error('Choose one of your personal PCs.');
      await saveCharacter(uid,id,own.sheet,own.updatedAt);
      const member = await get(memberPath(c));
      if (!member) throw new Error('Campaign membership is no longer active.');
      await this.syncPlayerName(c);
      const pcId = crypto.randomUUID();
      await commit([[`campaigns/${c}/pcs/${pcId}`,{ownerUid:uid,characterId:id,membershipId:member.membershipId}]]);
      return pcId;
    },
    async removeMember(c,target) {
      const pcs = (await records(`campaigns/${c}/pcs`)).filter(pc=>pc.ownerUid===target);
      for (const pc of pcs) await write(`campaigns/${c}/pcs/${pc.id}`,null);
      await commit([[memberPath(c,target),null],[indexPath(c,target),null]]);
    },
    async deleteCampaign(c) {
      // Metadata contains no secret text, so the GM can clean up every body without reading it.
      for (const kind of ['notes','plots']) {
        const items=await records(`campaigns/${c}/${kind}`);
        for(let offset=0;offset<items.length;offset+=200)await commit(items.slice(offset,offset+200).flatMap(d=>[[`campaigns/${c}/${kind}/${d.id}/content/body`,null],[`campaigns/${c}/${kind}/${d.id}`,null]]));
      }
      for (const collection of ['sessions','npcs','pcs']) {
        const items = await records(`campaigns/${c}/${collection}`);
        for (let offset=0;offset<items.length;offset+=400) await commit(items.slice(offset,offset+400).map(d=>[`campaigns/${c}/${collection}/${d.id}`,null]));
      }
      await this.revoke(c);
      const members = await records(`campaigns/${c}/members`);
      // Delete players before the GM; GM rights stay active until the final batch.
      for (const member of members.filter(m=>m.id!==uid)) await this.removeMember(c,member.id);
      await commit([[memberPath(c),null],[indexPath(c),null],[`campaigns/${c}`,null]]);
    },
    async watchSheet(c,pcId,full,receive,fail) {
      const pc = await get(`campaigns/${c}/pcs/${pcId}`);
      if (!pc) throw new Error('This PC is no longer linked.');
      const member = await get(memberPath(c));
      if (pc.ownerUid !== uid) await commit([[`users/${pc.ownerUid}/characters/${pc.characterId}/grants/${full?'full_':'public_'}${uid}`,{campaignId:c,pcId,membershipId:member.membershipId}]]);
      const path = `users/${pc.ownerUid}/${full?'characters':'publicCharacters'}/${pc.characterId}`;
      return sdk.onSnapshot(ref(path),s=>receive(s.exists()?s.data():null,pc),fail);
    }
  };
}
