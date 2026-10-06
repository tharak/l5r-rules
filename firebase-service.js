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
  const app = appSDK.initializeApp(firebaseConfig);
  const auth = authSDK.getAuth(app), db = dbSDK.getFirestore(app);
  const provider = new authSDK.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  // Emulator connections are opt-in and restricted to local development origins.
  if (['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulators')) {
    authSDK.connectAuthEmulator(auth,'http://127.0.0.1:9099', {disableWarnings:true});
    dbSDK.connectFirestoreEmulator(db,'127.0.0.1',8080);
  }
  window.addEventListener('character-sync-changed', update);
  authSDK.onAuthStateChanged(auth, account => {
    user = account;
    if (!account) window.CharacterStorage.connect(null);
    else {
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
        return record ? dbSDK.setDoc(ref,{sheetJson:JSON.stringify(record.sheet),updatedAt:record.updatedAt}) : dbSDK.deleteDoc(ref);
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
    try { await authSDK.signOut(auth); }
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
