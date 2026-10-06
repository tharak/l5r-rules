(() => {
  const GUEST_KEY = 'last-haiku-characters-v1';
  let uid = null, pending = {}, write, unsubscribe, timer, generation = 0, ready = false, running = false;
  let status = 'Saved on this device';
  const key = () => uid ? `last-haiku-account-${uid}-characters-v1` : GUEST_KEY;
  const pendingKey = () => `last-haiku-account-${uid}-pending-v1`;
  const read = (name, fallback) => {
    try { return JSON.parse(localStorage.getItem(name)) ?? fallback; } catch { return fallback; }
  };
  const announce = () => window.dispatchEvent(new Event('character-sync-changed'));
  const setStatus = value => { status = value; announce(); };
  const records = () => read(key(), []);
  const persistPending = () => localStorage.setItem(pendingKey(), JSON.stringify(pending));
  function replace(next) {
    const ordered = items => [...items].sort((a,b) => a.id.localeCompare(b.id));
    if (JSON.stringify(ordered(records())) === JSON.stringify(ordered(next))) return;
    localStorage.setItem(key(), JSON.stringify(next));
    window.dispatchEvent(new Event('characters-remote-changed'));
  }
  function schedule() {
    clearTimeout(timer);
    if (uid) timer = setTimeout(flush, 700);
  }
  function save(next) {
    const previous = records();
    // Persist the outbox before the cache so an interrupted save can be recovered.
    if (uid) {
      pending = read(pendingKey(), {});
      for (const record of next) {
        if (JSON.stringify(record) !== JSON.stringify(previous.find(item => item.id === record.id))) {
          pending[record.id] = {record, token:crypto.randomUUID()};
        }
      }
      for (const record of previous) {
        if (!next.some(item => item.id === record.id)) pending[record.id] = {record:null, token:crypto.randomUUID()};
      }
      persistPending();
    }
    localStorage.setItem(key(), JSON.stringify(next));
    if (uid && Object.keys(pending).length) { setStatus('Saved on this device · Cloud save pending'); schedule(); }
  }
  async function flush() {
    if (!uid || !ready || !write || running || !Object.keys(pending).length) return;
    const session = generation, writer = write;
    running = true;
    setStatus('Saving to your account…');
    try {
      for (const [id, change] of Object.entries(pending)) {
        if (session !== generation) return;
        await writer(id, change.record);
        if (session !== generation) return;
        pending = read(pendingKey(), {});
        if (pending[id]?.token === change.token) { delete pending[id]; persistPending(); }
      }
      setStatus(Object.keys(pending).length ? 'Saved on this device · Cloud save pending' : 'Saved to your account');
    } catch (error) {
      if (session === generation) {
        console.error('Character sync failed', error);
        setStatus('Saved on this device · Cloud sync unavailable');
      }
    } finally {
      if (session === generation) { running = false; if (Object.keys(pending).length) timer = setTimeout(flush, 10000); }
    }
  }
  function connect(accountId, subscribe, writer) {
    generation++;
    const session = generation;
    unsubscribe?.(); clearTimeout(timer);
    uid = accountId || null; write = writer; running = false; ready = false;
    pending = uid ? read(pendingKey(), {}) : {};
    setStatus(uid ? 'Loading your cloud characters…' : 'Saved on this device');
    // Recover a durable outbox after a reload, including deletions.
    if (uid) {
      const recovered = new Map(records().map(record => [record.id, record]));
      for (const [id, change] of Object.entries(pending)) {
        if (change.record) recovered.set(id,change.record); else recovered.delete(id);
      }
      replace([...recovered.values()]);
    }
    window.dispatchEvent(new Event('characters-remote-changed'));
    if (!uid) return;
    unsubscribe = subscribe((remote, fromCache) => {
      if (session !== generation || fromCache) return;
      pending = read(pendingKey(), {});
      const merged = new Map(remote.map(record => [record.id,record]));
      for (const [id, change] of Object.entries(pending)) {
        if (change.record) merged.set(id,change.record); else merged.delete(id);
      }
      replace([...merged.values()].sort((a,b) => a.id.localeCompare(b.id)));
      ready = true;
      if (!running) setStatus(Object.keys(pending).length ? 'Saved on this device · Cloud save pending' : 'Saved to your account');
      schedule();
    }, error => {
      if (session !== generation) return;
      console.error('Character subscription failed', error);
      setStatus('Saved on this device · Cloud sync unavailable');
    });
  }
  function importDevice() {
    if (!uid) return;
    const existing = records(), ids = new Set(existing.map(record => record.id));
    // Keep IDs stable so repeating an import does not duplicate or overwrite sheets.
    const imported = read(GUEST_KEY, []).filter(record => !ids.has(record.id));
    save([...existing,...imported]);
    window.dispatchEvent(new Event('characters-remote-changed'));
    return imported.length;
  }
  window.CharacterStorage = {records, save, connect, importDevice, flush,
    activeKey:() => uid ? `last-haiku-account-${uid}-active-v1` : 'last-haiku-active-character-v1',
    get accountId() { return uid; }, get status() { return status; }
  };
  window.addEventListener('online', flush);
  window.addEventListener('storage', event => {
    if (event.key !== key() && event.key !== pendingKey()) return;
    if (uid) pending = read(pendingKey(), {});
    window.dispatchEvent(new Event('characters-remote-changed'));
    schedule();
  });
})();
