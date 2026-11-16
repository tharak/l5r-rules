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
  const plot=async(p,title,text)=>{
    await p.getByRole('button',{name:'Plots',exact:true}).click();
    await p.getByRole('button',{name:'+ Plot',exact:true}).click();
    check(await p.locator('[data-entry-field="public"]').count()===0,'Paused plot privacy control is still shown');
    await p.locator('[data-entry-field="title"]').fill(title);
    await p.locator('[data-entry-field="text"]').fill(text);
    await p.getByRole('button',{name:'Save plot',exact:true}).click();await saved(p);
    await p.getByRole('heading',{name:title,exact:true}).waitFor();
    return p.evaluate(title=>CampaignStorage.list('campaigns/'+location.hash.split('/')[2]+'/plots/').find(p=>p.title===title).id,title);
  };
  const note=async(p,text)=>{
    await p.getByRole('button',{name:'+ Note',exact:true}).click();
    check(await p.locator('[data-entry-kind="note"][data-entry-field="public"]').count()===0,'Paused note privacy control is still shown');
    await p.locator('[data-entry-kind="note"][data-entry-field="text"]').fill(text);
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
    // Privacy is paused: every plot and note is visible to every campaign member.
    await plot(gm,'GM PLOT TITLE','GM PLOT CONTENT');
    const sharedId=await plot(alice,'Shared clue','The ferry tracks lead downstream.');
    await note(alice,'ALICE PLOT NOTE');
    await bob.getByRole('button',{name:'Plots',exact:true}).click();
    await bob.getByRole('button',{name:'GM PLOT TITLE',exact:true}).click();
    await bob.getByText('GM PLOT CONTENT',{exact:true}).waitFor();
    await bob.getByRole('button',{name:'Shared clue',exact:true}).click();
    await bob.getByText('ALICE PLOT NOTE',{exact:true}).waitFor();
    check(await bob.getByRole('button',{name:'Edit plot',exact:true}).count()===0,'A player can change another creator plot');
    check(await bob.getByRole('button',{name:'Edit note',exact:true}).count()===0,'A player can change another creator note');
    await note(bob,'BOB PLOT NOTE');
    await gm.getByRole('button',{name:'Shared clue',exact:true}).click();
    await gm.getByText('BOB PLOT NOTE',{exact:true}).waitFor();
    check(await gm.getByRole('button',{name:'Edit plot',exact:true}).count()===0,'GM can change another creator plot');
    for(const p of [alice,bob]) {
      await p.getByRole('button',{name:'Sessions',exact:true}).click();
      await p.getByRole('button',{name:'Prologue',exact:true}).click();
    }
    await note(alice,'ALICE SESSION NOTE');
    await bob.getByText('ALICE SESSION NOTE',{exact:true}).waitFor();
    await alice.getByRole('button',{name:'PC',exact:true}).click();
    await alice.getByRole('button',{name:'Notes',exact:true}).click();
    await note(alice,'ALICE PC NOTE');
    await bob.getByRole('button',{name:'PC',exact:true}).click();
    await bob.getByRole('button',{name:'Notes',exact:true}).click();
    await bob.getByText('ALICE PC NOTE',{exact:true}).waitFor();
    // NPCs stay a GM-only section, so their notes do too.
    await gm.getByRole('button',{name:'NPC',exact:true}).click();
    await gm.getByRole('button',{name:'Shrine keeper',exact:true}).click();
    await note(gm,'GM NPC NOTE');
    check(await bob.getByRole('button',{name:'NPC',exact:true}).count()===0,'Player can access GM-only NPCs');
    await bob.reload();await bob.getByRole('button',{name:'Plots',exact:true}).click();
    await bob.getByRole('button',{name:'GM PLOT TITLE',exact:true}).waitFor();
    await alice.getByRole('button',{name:'Plots',exact:true}).click();
    await alice.getByRole('button',{name:'Shared clue',exact:true}).click();
    await alice.setViewportSize({width:390,height:844});
    await alice.screenshot({path:'output/playwright/plots-mobile.png',fullPage:true});
    check(await alice.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile plot view overflows');
    const readable=await bob.evaluate(async({c,id})=>{
      const sdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      return (await sdk.getDocFromServer(sdk.doc(sdk.getFirestore(),`campaigns/${c}/plots/${id}/content/body`))).exists();
    },{c:setup.c,id:sharedId});
    check(readable,'A campaign member cannot read a plot body from the server');
    alice.once('dialog',dialog=>dialog.accept());
    await alice.getByRole('button',{name:'Delete plot',exact:true}).click();await saved(alice);
    await gm.waitForFunction(({c,id})=>!CampaignStorage.list('campaigns/'+c+'/notes/').some(n=>n.targetKind==='plots'&&n.targetId===id),{c:setup.c,id:sharedId});
    const deletedNotes=await gm.evaluate(async({c,id})=>{
      const sdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      const docs=await sdk.getDocsFromServer(sdk.collection(sdk.getFirestore(),`campaigns/${c}/notes`));
      return !docs.docs.some(doc=>doc.data().targetKind==='plots'&&doc.data().targetId===id);
    },{c:setup.c,id:sharedId});
    check(deletedNotes,'Plot deletion left attached note documents');
    check(errors.length===0,'Browser errors: '+errors.join('; '));
    await page.evaluate(()=>window.plotBrowserCheckResult='Passed: shared plots and notes, all four note targets, GM-only NPCs, creator-only editing, reload, direct server reads, deletion cleanup, and mobile layout.');
  } finally {for(const context of contexts)await context.close();}
}
