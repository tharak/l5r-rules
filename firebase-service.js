import {createCampaignBackend} from './campaign-service.js';
import {firebaseConfig} from './firebase-config.js';

const name = document.getElementById('account-name');
const status = document.getElementById('account-status');
const login = document.getElementById('account-sign-in');
const logout = document.getElementById('account-sign-out');
const copy = document.getElementById('account-import');
let busy = false, user = null;
const showError = error => {
  const messages = {
    'auth/popup-blocked':'Allow popups for this site, then try signing in again.',
    'auth/popup-closed-by-user':'Sign-in cancelled. Your characters remain saved on this device.',
    'auth/network-request-failed':'Unable to connect. Check your connection and try again.',
    'auth/unauthorized-domain':'Sign-in is unavailable on this address. Open l5r-rules.web.app.',
    'auth/operation-not-allowed':'Google sign-in has not been enabled for this site.'
  };
  status.textContent = messages[error.code] || 'Unable to sign in or sync. Your device saves are still available.';
  console.error('Firebase account error', error);
};
function update() {
  name.textContent = user?.displayName || user?.email || 'Device characters';
  status.textContent = window.CharacterStorage.status;
  login.hidden = !!user;
  logout.hidden = !user;
  copy.hidden = !user;
  login.disabled = logout.disabled = copy.disabled = busy;
}

try {
  const [appSDK, authSDK, dbSDK] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
  ]);
  const emulatorMode = ['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulators');
  const app = appSDK.initializeApp(emulatorMode ? {...firebaseConfig,projectId:'demo-l5r-rules'} : firebaseConfig);
  const auth = authSDK.getAuth(app);
  // Firestore keeps a copy on this device (shared by open tabs), so reopening a page within about
  // 30 minutes reads only what changed instead of every document again (the free plan allows
  // 50,000 reads a day). Live updates are unchanged. Signing out clears the copy.
  let db;
  try { db = emulatorMode ? dbSDK.getFirestore(app) : dbSDK.initializeFirestore(app,{localCache:dbSDK.persistentLocalCache({tabManager:dbSDK.persistentMultipleTabManager()})}); }
  catch (error) { console.warn('Firestore device cache unavailable',error); db = dbSDK.getFirestore(app); }
  const provider = new authSDK.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  // Emulator connections are opt-in and restricted to local development origins.
  if (emulatorMode) {
    authSDK.connectAuthEmulator(auth,'http://127.0.0.1:9099', {disableWarnings:true});
    dbSDK.connectFirestoreEmulator(db,'127.0.0.1',8080);
  }
  // Public character documents are readable signed out, for the #/pc/... public view.
  window.PublicSheets = {
    watch(owner,id,receive,fail) { return dbSDK.onSnapshot(dbSDK.doc(db,'users',owner,'publicCharacters',id),snapshot => receive(snapshot.exists() ? snapshot.data() : null),fail); }
  };
  // GM journal entries live beside the sheet, because only its owner can write the sheet.
  // Anyone may read entries marked public; the owner and the GM read them all.
  window.SheetJournal = {
    watch(owner,id,{publicOnly = false} = {},receive,fail = () => {}) {
      const entries = dbSDK.collection(db,'users',owner,'characters',id,'journal');
      const source = publicOnly ? dbSDK.query(entries,dbSDK.where('public','==',true)) : entries;
      return dbSDK.onSnapshot(source,snapshot => receive(snapshot.docs.map(entry => ({id:entry.id,...entry.data()}))),fail);
    },
    write(owner,id,entryId,data) {
      const ref = dbSDK.doc(db,'users',owner,'characters',id,'journal',entryId);
      return data ? dbSDK.setDoc(ref,data) : dbSDK.deleteDoc(ref);
    },
    get user() { const account = auth.currentUser; return account ? {uid:account.uid,name:account.displayName || 'GM'} : null; }
  };
  window.dispatchEvent(new Event('public-sheets-ready'));
  window.addEventListener('character-sync-changed', update);
  authSDK.onAuthStateChanged(auth, account => {
    user = account;
    if (!account) { window.CharacterStorage.connect(null); window.CampaignStorage.connect(null,null); }
    else {
      const backend = createCampaignBackend(db,dbSDK,account.uid,()=>account.displayName || 'Player');
      window.CampaignStorage.connect(account.uid,backend);
      const path = dbSDK.collection(db,'users',account.uid,'characters');
      window.CharacterStorage.connect(account.uid, (receive, fail) => dbSDK.onSnapshot(path, {includeMetadataChanges:true}, snapshot => {
        try {
          const records = snapshot.docs.map(doc => {
            const data = doc.data(), sheet = JSON.parse(data.sheetJson);
            if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) throw new Error('Invalid character data');
            return {id:doc.id, sheet, updatedAt:data.updatedAt};
          });
          receive(records, snapshot.metadata.fromCache);
        } catch (error) { fail(error); }
      }, fail), (id, record) => {
        const ref = dbSDK.doc(path,id);
        if (record) return backend.saveCharacter(account.uid,id,record.sheet,record.updatedAt);
        const batch = dbSDK.writeBatch(db); batch.delete(ref); batch.delete(dbSDK.doc(db,'users',account.uid,'publicCharacters',id)); return batch.commit();
      });
    }
    update();
  }, showError);
  login.addEventListener('click', async () => {
    busy = true; update(); status.textContent = 'Opening Google sign-in…';
    try { await authSDK.signInWithPopup(auth,provider); }
    catch (error) { showError(error); }
    finally { busy = false; login.disabled = logout.disabled = copy.disabled = false; }
  });
  logout.addEventListener('click', async () => {
    busy = true; update();
    try {
      await authSDK.signOut(auth);
      // Remove the campaign and character data cached on this device (another open tab keeps it).
      try { await dbSDK.terminate(db); await dbSDK.clearIndexedDbPersistence(db); } catch (error) { console.warn('Could not clear the device cache',error); }
      location.reload();
    }
    catch (error) { showError(error); }
    finally { busy = false; login.disabled = logout.disabled = copy.disabled = false; }
  });
  copy.addEventListener('click', () => {
    const count = window.CharacterStorage.importDevice();
    status.textContent = count ? `${count} device character${count === 1 ? '' : 's'} copied to your account.` : 'These device characters are already in your account.';
  });
} catch (error) {
  status.textContent = 'Saved on this device · Sign-in unavailable';
  console.error('Firebase initialization failed', error);
}
