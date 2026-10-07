(() => {
  let uid = null, adapter = null, stop, generation = 0, cache = {}, outbox = {}, timer, running = false, ready = false;
  const read = (key,fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  const key = suffix => `l5r-rules-account-${uid}-campaign-${suffix}-v1`;
  const announce = () => window.dispatchEvent(new Event('campaigns-changed'));
  const persist = () => { if (uid) { localStorage.setItem(key('cache'),JSON.stringify(cache)); localStorage.setItem(key('pending'),JSON.stringify(outbox)); } };
  let status = 'Sign in with Google to use shared campaigns.';
  function clearCampaign(id) {
    for (const path of Object.keys(cache)) if (path === `campaigns/${id}` || path.startsWith(`campaigns/${id}/`)) delete cache[path];
    const drafts = read(key('drafts'),{});
    for (const path of Object.keys(outbox)) if (path === `campaigns/${id}` || path.startsWith(`campaigns/${id}/`)) { if (outbox[path].data) drafts[path] = outbox[path].data; delete outbox[path]; }
    if (uid) localStorage.setItem(key('drafts'),JSON.stringify(drafts));
    persist();
  }
  function merge(path,data) {
    if (data === null) delete cache[path]; else cache[path] = data;
    if (outbox[path]) { if (outbox[path].data === null) delete cache[path]; else cache[path] = outbox[path].data; }
    persist(); announce();
  }
  function queue(path,data) {
    if (!uid || !adapter) throw new Error('Sign in to edit campaigns.');
    outbox[path] = {data,token:crypto.randomUUID()};
    merge(path,data);
    status = 'Draft saved on this device · Cloud save pending';
    clearTimeout(timer); timer = setTimeout(flush,700);
  }
  async function flush() {
    if (!uid || !adapter || !ready || running) return;
    const session = generation, writer = adapter;
    running = true;
    try {
      for (const [path,change] of Object.entries(outbox)) {
        if (session !== generation) return;
        if (outbox[path]?.token !== change.token) continue;
        // Leave oversized drafts intact, without sending a document Firestore rejects.
        if (change.data && new TextEncoder().encode(JSON.stringify(change.data)).length > 900000) {
          status = 'Draft saved on this device · Too large for cloud storage'; continue;
        }
        try {
          await writer.write(path,change.data);
          if (session !== generation) return;
          if (outbox[path]?.token === change.token) { delete outbox[path]; if (path.includes('/sheetEdits/')) delete cache[path]; }
          persist(); status = Object.keys(outbox).length ? status : 'Saved to campaign';
        } catch (error) {
          if (session !== generation) return;
          if (error.code === 'permission-denied' || error.code === 'not-found') {
            // Do not retry unauthorized writes. A failed edit is kept as a detached draft.
            const drafts = read(key('drafts'),{}); drafts[path] = change.data;
            localStorage.setItem(key('drafts'),JSON.stringify(drafts));
            clearCampaign(path.split('/')[1]);
            status = 'Access revoked · Draft retained on this device';
          } else { status = 'Draft saved on this device · Connection unavailable'; break; }
        }
      }
    } finally { if (session === generation) { running = false; announce(); if (Object.keys(outbox).length) timer = setTimeout(flush,10000); } }
  }
  function connect(accountId,backend) {
    generation++; stop?.(); clearTimeout(timer);
    // Shared data is only cached while this account is active.
    if (uid && uid !== accountId) localStorage.removeItem(key('cache'));
    uid = accountId; adapter = backend; running = false; ready = false; cache = uid ? read(key('cache'),{}) : {};
    // A previously public entry may now be private. Restore other authors only after access is confirmed.
    for (const [path,data] of Object.entries(cache)) if (/\/((plots)|(notes))\//.test(path) && data.creatorUid !== uid) delete cache[path];
    outbox = uid ? read(key('pending'),{}) : {};
    for (const [path,change] of Object.entries(outbox)) { if (change.data === null) delete cache[path]; else cache[path] = change.data; }
    status = uid ? 'Loading campaigns…' : 'Sign in with Google to use shared campaigns.';
    const session = generation;
    if (uid) stop = backend.subscribe({
      index(ids) {
        if (session !== generation) return;
        const allowed = new Set(ids);
        for (const path of new Set([...Object.keys(cache),...Object.keys(outbox)])) if (!allowed.has(path.split('/')[1])) clearCampaign(path.split('/')[1]);
        ready = true; status = 'Connected'; announce(); flush();
      },
      receive(path,data) { if (session === generation) merge(path,data); },
      revoked(id) { if (session === generation) { clearCampaign(id); announce(); } },
      error(error) { if (session === generation) { status = error.message || 'Connection unavailable'; announce(); } }
    });
    announce();
  }
  const api = {connect,queue,flush,get:path=>cache[path],list:prefix=>Object.entries(cache).filter(([path])=>path.startsWith(prefix) && !path.slice(prefix.length).includes('/')).map(([path,data])=>({id:path.slice(prefix.length),...data})),
    get uid(){return uid;},get status(){return status;},get backend(){return adapter;},
    drafts:()=>uid ? read(key('drafts'),{}) : {}};
  window.CampaignStorage = api;
  window.addEventListener('online',flush);
})();
