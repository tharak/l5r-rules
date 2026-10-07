async page => {
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const browser=page.context().browser(),contexts=[],errors=[];
  const signIn=async label=>{
    const context=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(context);
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto('http://127.0.0.1:5000/?emulators#/campaigns');
    await p.waitForFunction(()=>document.getElementById('account-sign-in')?.disabled===false);
    await p.evaluate(async label=>{
      const sdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
      const account=await sdk.createUserWithEmailAndPassword(sdk.getAuth(),label+'-'+crypto.randomUUID()+'@example.test','test-password-123');
      await sdk.updateProfile(account.user,{displayName:label});
    },label);
    await p.waitForFunction(()=>window.CampaignStorage?.backend);return p;
  };
  const saved=p=>p.waitForFunction(()=>CampaignStorage.status==='Saved to campaign');
  const plot=async(p,title,text,isPublic=false)=>{
    await p.getByRole('button',{name:'Plots',exact:true}).click();
    await p.getByRole('button',{name:'+ Plot',exact:true}).click();
    check(await p.locator('[data-entry-field="public"]').inputValue()==='private','New plot did not default to private');
    await p.locator('[data-entry-field="title"]').fill(title);
    await p.locator('[data-entry-field="text"]').fill(text);
    if(isPublic)await p.locator('[data-entry-field="public"]').selectOption('public');
    await p.getByRole('button',{name:'Save plot',exact:true}).click();await saved(p);
    await p.getByRole('heading',{name:title,exact:true}).waitFor();
    return p.evaluate(title=>CampaignStorage.list('campaigns/'+location.hash.split('/')[2]+'/plots/').find(p=>p.title===title).id,title);
  };
  const note=async(p,text,isPublic=false)=>{
    await p.getByRole('button',{name:'+ Note',exact:true}).click();
    check(await p.locator('[data-entry-kind="note"][data-entry-field="public"]').inputValue()==='private','New note did not default to private');
    await p.locator('[data-entry-kind="note"][data-entry-field="text"]').fill(text);
    if(isPublic)await p.locator('[data-entry-kind="note"][data-entry-field="public"]').selectOption('public');
    await p.getByRole('button',{name:'Save note',exact:true}).click();await saved(p);
    await p.getByText(text,{exact:true}).waitFor();
  };
  try {
    const gm=await signIn('Plot GM'),alice=await signIn('Plot Alice'),bob=await signIn('Plot Bob');
    const setup=await gm.evaluate(async()=>{
      const backend=CampaignStorage.backend,c=await backend.create('Plots and notes browser campaign');
      await backend.write(`campaigns/${c}/sessions/s`,{title:'Prologue',text:'A public opening.',updatedAt:'now'});
      await backend.write(`campaigns/${c}/npcs/n`,{name:'Shrine keeper',notes:'An NPC description.',updatedAt:'now'});
      const id=CharacterBuilder.create();await backend.link(c,id);
      return {c,token:await backend.invite(c)};
    });
    for(const p of [alice,bob])await p.evaluate(token=>CampaignStorage.backend.join(token),setup.token);
    for(const p of [gm,alice,bob]) {
      await p.goto('http://127.0.0.1:5000/?emulators#/campaigns/'+setup.c);
      await p.getByRole('button',{name:'Plots',exact:true}).waitFor();
    }
    await plot(gm,'GM SECRET TITLE','GM SECRET CONTENT');
    const privateId=await plot(alice,'ALICE PRIVATE TITLE','ALICE PRIVATE CONTENT');
    await gm.getByRole('button',{name:'ALICE PRIVATE TITLE · Private',exact:true}).waitFor();
    await gm.getByRole('button',{name:'ALICE PRIVATE TITLE · Private',exact:true}).click();
    await gm.getByText('ALICE PRIVATE CONTENT',{exact:true}).waitFor();
    check(await gm.getByRole('button',{name:'Edit plot',exact:true}).count()===0,'GM can change another creator plot');
    const publicId=await plot(alice,'Shared clue','The ferry tracks lead downstream.',true);
    await note(alice,'PRIVATE PLOT NOTE');await note(alice,'PUBLIC PLOT NOTE',true);
    await bob.getByRole('button',{name:'Plots',exact:true}).click();
    await bob.getByRole('button',{name:'Shared clue · Public',exact:true}).click();
    await bob.getByText('PUBLIC PLOT NOTE',{exact:true}).waitFor();
    check(!(await bob.locator('#app').innerText()).includes('PRIVATE'),'A private plot or note leaked into the player view');
    const playerCache=await bob.evaluate(()=>JSON.stringify(localStorage));
    check(!playerCache.includes('GM SECRET')&&!playerCache.includes('ALICE PRIVATE')&&!playerCache.includes('PRIVATE PLOT NOTE'),'Secret text reached the player cache');
    await note(bob,'BOB PRIVATE PLOT NOTE');
    await gm.getByRole('button',{name:'Shared clue · Public',exact:true}).click();
    await gm.getByText('BOB PRIVATE PLOT NOTE',{exact:true}).waitFor();
    for(const p of [alice,bob]) {
      await p.getByRole('button',{name:'Sessions',exact:true}).click();
      await p.getByRole('button',{name:'Prologue',exact:true}).click();
    }
    await note(alice,'PRIVATE SESSION NOTE');await note(alice,'PUBLIC SESSION NOTE',true);
    await bob.getByText('PUBLIC SESSION NOTE',{exact:true}).waitFor();
    check(!(await bob.locator('#app').innerText()).includes('PRIVATE SESSION NOTE'),'Private session note leaked');
    await note(bob,'BOB SESSION NOTE',true);
    await alice.getByText('BOB SESSION NOTE',{exact:true}).waitFor();
    await alice.getByRole('button',{name:'PC',exact:true}).click();
    await alice.getByRole('button',{name:'Notes',exact:true}).click();
    await note(alice,'PRIVATE PC NOTE');await note(alice,'PUBLIC PC NOTE',true);
    await bob.getByRole('button',{name:'PC',exact:true}).click();
    await bob.getByRole('button',{name:'Notes',exact:true}).click();
    await bob.getByText('PUBLIC PC NOTE',{exact:true}).waitFor();
    check(!(await bob.locator('#app').innerText()).includes('PRIVATE PC NOTE'),'Private PC note leaked');
    await gm.getByRole('button',{name:'NPC',exact:true}).click();
    await gm.getByRole('button',{name:'Shrine keeper',exact:true}).click();
    await note(gm,'PRIVATE NPC NOTE');await note(gm,'NPC NOTE WITH PUBLIC SETTING',true);
    check(await bob.getByRole('button',{name:'NPC',exact:true}).count()===0,'Player can access GM-only NPCs');
    // Public note privacy can be tightened by its creator without affecting the shared session.
    await alice.getByRole('button',{name:'Sessions',exact:true}).click();
    const publicNote=alice.locator('.campaign-note').filter({hasText:'PUBLIC SESSION NOTE'});
    await publicNote.getByRole('button',{name:'Edit note',exact:true}).click();
    await alice.locator('[data-entry-kind="note"][data-entry-field="public"]').selectOption('private');
    await alice.getByRole('button',{name:'Save note',exact:true}).click();await saved(alice);
    await bob.getByRole('button',{name:'Sessions',exact:true}).click();
    await bob.waitForFunction(()=>!document.querySelector('#app').textContent.includes('PUBLIC SESSION NOTE'));
    // Making the parent plot private removes other players' access to its notes, too.
    await alice.getByRole('button',{name:'Plots',exact:true}).click();
    await alice.getByRole('button',{name:'Shared clue · Public',exact:true}).click();
    await alice.getByRole('button',{name:'Edit plot',exact:true}).click();
    await alice.locator('[data-entry-kind="plot"][data-entry-field="public"]').selectOption('private');
    await alice.getByRole('button',{name:'Save plot',exact:true}).click();await saved(alice);
    await bob.getByRole('button',{name:'Plots',exact:true}).click();
    await bob.waitForFunction(()=>!document.querySelector('#app').textContent.includes('Shared clue'));
    await bob.waitForFunction(c=>!CampaignStorage.list('campaigns/'+c+'/notes/').some(n=>n.targetKind==='plots'),setup.c);
    await bob.reload();await bob.getByRole('button',{name:'Plots',exact:true}).click();
    check(!(await bob.locator('#app').innerText()).includes('SECRET')&&!(await bob.locator('#app').innerText()).includes('Shared clue'),'Reload restored revoked plot text');
    await alice.setViewportSize({width:390,height:844});
    await alice.screenshot({path:'output/playwright/plots-privacy-mobile.png',fullPage:true});
    check(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile plot view overflows');
    const forbidden=await bob.evaluate(async({c,privateId,publicId})=>{
      const sdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      for(const id of [privateId,publicId]) {
        try{await sdk.getDocFromServer(sdk.doc(sdk.getFirestore(),`campaigns/${c}/plots/${id}/content/body`));return false;}
        catch(e){if(e.code!=='permission-denied')throw e;}
      }
      return true;
    },{c:setup.c,privateId,publicId});
    check(forbidden,'Direct player reads bypassed plot privacy');
    alice.once('dialog',dialog=>dialog.accept());
    await alice.getByRole('button',{name:'Delete plot',exact:true}).click();await saved(alice);
    await gm.waitForFunction(({c,id})=>!CampaignStorage.list('campaigns/'+c+'/notes/').some(n=>n.targetKind==='plots'&&n.targetId===id),{c:setup.c,id:publicId});
    const deletedNotes=await gm.evaluate(async({c,id})=>{
      const sdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      const docs=await sdk.getDocsFromServer(sdk.collection(sdk.getFirestore(),`campaigns/${c}/notes`));
      return !docs.docs.some(doc=>doc.data().targetKind==='plots'&&doc.data().targetId===id);
    },{c:setup.c,id:publicId});
    check(deletedNotes,'Plot deletion left attached note documents');
    check(errors.length===0,'Browser errors: '+errors.join('; '));
    await page.evaluate(()=>window.plotBrowserCheckResult='Passed: GM/creator privacy, public plots and notes, all four note targets, creator-only editing, revocation, reload, direct server denials, deletion cleanup, and mobile layout.');
  } finally {for(const context of contexts)await context.close();}
}
