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
  return {
    get,commit,saveCharacter,
    async syncPlayerName(c) {
      const membership=await get(memberPath(c));
      if(membership && membership.displayName!==playerName())await sdk.updateDoc(ref(memberPath(c)),{displayName:playerName()});
    },
    write:(path,data)=> path.includes('/sheetEdits/') ? saveCharacter(data.ownerUid,data.characterId,data.sheet,data.updatedAt) : data === null ? sdk.deleteDoc(ref(path)) : sdk.setDoc(ref(path),data),
    subscribe(events) {
      const subscriptions = new Map();
      const cancel = id => { subscriptions.get(id)?.forEach(stop=>stop()); subscriptions.delete(id); events.revoked(id); };
      const stopIndex = sdk.onSnapshot(sdk.collection(db,`users/${uid}/campaigns`),{includeMetadataChanges:true},snapshot=>{
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        const ids = snapshot.docs.map(d=>d.id);
        for (const id of subscriptions.keys()) if (!ids.includes(id)) cancel(id);
        for (const id of ids) if (!subscriptions.has(id)) {
          const stops = []; subscriptions.set(id,stops);
          let profileSynced=false;
          const fail = error => { if (error.code === 'permission-denied') cancel(id); else events.error(error); };
          const watch = path => stops.push(sdk.onSnapshot(ref(path),s=>events.receive(path,s.exists()?s.data():null),fail));
          watch(`campaigns/${id}`);
          const collections = ['members','sessions','pcs'];
          // The immutable GM identifier is available on the private membership index.
          if (snapshot.docs.find(d=>d.id===id).data().gmUid === uid) { collections.push('npcs'); watch(`campaigns/${id}/private/invitation`); }
          for (const collection of collections) {
            const path = `campaigns/${id}/${collection}`;
            stops.push(sdk.onSnapshot(sdk.collection(db,path),s=>{
              for (const d of s.docChanges()) {
                events.receive(`${path}/${d.doc.id}`,d.type==='removed'?null:d.doc.data());
                // Existing memberships acquire their owner's Google display name on sign-in.
                if(collection==='members' && d.doc.id===uid && d.type!=='removed' && !profileSynced) {
                  // Sync once per sign-in so an older tab cannot undo a newer profile name.
                  profileSynced=true;
                  if(d.doc.data().displayName!==playerName())sdk.updateDoc(ref(`${path}/${uid}`),{displayName:playerName()}).catch(events.error);
                }
              }
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
      for (let offset=0;offset<pcs.length;offset+=400) await commit(pcs.slice(offset,offset+400).map(pc=>[`campaigns/${c}/pcs/${pc.id}`,null]));
      await commit([[memberPath(c,target),null],[indexPath(c,target),null]]);
    },
    async deleteCampaign(c) {
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
