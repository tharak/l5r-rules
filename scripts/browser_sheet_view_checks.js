async page => {
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const contexts=[],errors=[],browser=page.context().browser();
  const signIn=async label=>{
    const context=await browser.newContext();contexts.push(context);
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto('http://127.0.0.1:5000/?emulators#/campaigns');
    await p.waitForFunction(()=>document.getElementById('account-sign-in')?.disabled===false);
    await p.evaluate(async label=>{
      const sdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
      await sdk.createUserWithEmailAndPassword(sdk.getAuth(),label+'-'+crypto.randomUUID()+'@example.test','test-password-123');
    },label);
    await p.waitForFunction(()=>CampaignStorage.backend);return p;
  };
  const immutable=p=>p.evaluate(()=>({records:CharacterStorage.records(),active:localStorage.getItem(CharacterStorage.activeKey())}));
  const readonly=async p=>{
    await p.locator('.readonly-sheet [data-sheet-section]').first().waitFor();
    check(await p.locator('.readonly-sheet input,.readonly-sheet textarea,.readonly-sheet select,.readonly-sheet [contenteditable],.readonly-sheet [data-action]').count()===0,'View has editable controls');
  };
  try {
    const gm=await signIn('view-gm'),owner=await signIn('view-owner'),player=await signIn('view-player');
    const setup=await gm.evaluate(async()=>{const c=await CampaignStorage.backend.create('Read-only sheet checks');return {c,token:await CampaignStorage.backend.invite(c)};});
    for(const p of [owner,player])await p.evaluate(t=>CampaignStorage.backend.join(t),setup.token);
    const character=await owner.evaluate(async c=>{
      const catalog=await (await fetch('public/character-data.json')).json(),school=CharacterCatalog.schools(catalog).find(s=>s.name==='Hida Bushi');
      const id=crypto.randomUUID(),sheet=CharacterRules.normalize({name:'View Samurai',clan:'Crab',family:'Hida',school:school.slug+'#'+school.anchor,notes:'PRIVATE VIEW NOTES',skills:{Athletics:3},visibility:{identity:true,traits:false,skills:true,options:false,story:false,summary:false,abilities:false}});
      await CampaignStorage.backend.saveCharacter(CampaignStorage.uid,id,sheet,new Date().toISOString());
      const view=await CharacterSheetView.fromSheet(sheet);
      return {id,uid:CampaignStorage.uid,pc:await CampaignStorage.backend.link(c,id),roll:view.sections.skills.skills.Athletics.roll.notation};
    },setup.c);
    await owner.waitForFunction(id=>CharacterBuilder.list().some(c=>c.id===id),character.id);
    const before=await immutable(owner);
    const revision=await owner.evaluate(async id=>(await CampaignStorage.backend.get('users/'+CampaignStorage.uid+'/characters/'+id)).revision,character.id);
    for(const p of [owner,gm,player]) {
      await p.goto('http://127.0.0.1:5000/?emulators#/campaigns/'+setup.c);
      await p.getByRole('button',{name:'PC',exact:true}).click();
      await p.getByRole('button',{name:'View',exact:true}).waitFor();
      check(await p.getByRole('button',{name:'Edit',exact:true}).count()===(p===player?0:1),'Incorrect Edit permission');
      await p.getByRole('button',{name:'View',exact:true}).click();await readonly(p);
      const visible=await p.locator('.readonly-sheet').innerText();
      check(visible.includes('PRIVATE VIEW NOTES')===(p!==player),'Incorrect private section access');
      check(await p.locator('.readonly-sheet > section').count()===(p===player?2:7),'Incorrect sheet section count');
      if(p!==player)check(visible.includes('Roll')&&visible.includes(character.roll),'Derived skill dice missing');
    }
    check(JSON.stringify(before)===JSON.stringify(await immutable(owner)),'Campaign View changed personal sheet or selection');
    check(revision===await owner.evaluate(async id=>(await CampaignStorage.backend.get('users/'+CampaignStorage.uid+'/characters/'+id)).revision,character.id),'View wrote to Firestore');
    check(await gm.locator('#campaign-editor').count()===0,'GM View mounted editor');
    await owner.evaluate(async id=>{const sheet=CharacterBuilder.read(id);sheet.notes='UPDATED PRIVATE VIEW NOTES';await CampaignStorage.backend.saveCharacter(CampaignStorage.uid,id,sheet,new Date().toISOString());},character.id);
    await gm.locator('.readonly-sheet').getByText('UPDATED PRIVATE VIEW NOTES',{exact:true}).waitFor();
    check(!(await player.locator('.readonly-sheet').innerText()).includes('UPDATED PRIVATE'),'Live update leaked private story');
    await gm.locator('.readonly-sheet').getByRole('button',{name:'Close',exact:true}).click();
    await gm.getByRole('button',{name:'Edit',exact:true}).click();
    await gm.locator('#campaign-editor input').first().waitFor();
    await gm.getByRole('button',{name:'View',exact:true}).click();await readonly(gm);
    check(await gm.locator('#campaign-editor').count()===0,'View failed to leave GM editor');
    await owner.goto('http://127.0.0.1:5000/?emulators#/characters');
    const personalBefore=await immutable(owner);
    await owner.getByRole('button',{name:'View',exact:true}).click();await readonly(owner);
    check(JSON.stringify(personalBefore)===JSON.stringify(await immutable(owner)),'Personal View changed stored sheet or selection');
    const downloadPromise=owner.waitForEvent('download');
    await owner.getByRole('button',{name:'Export JSON',exact:true}).click();
    const stream=await (await downloadPromise).createReadStream();let exported='';for await(const chunk of stream)exported+=chunk;
    const json=JSON.parse(exported);
    check(json.character.notes==='UPDATED PRIVATE VIEW NOTES'&&json.derived.combat&&json.source==='l5r-rules','Full view export omitted saved character or derived stats');
    await owner.setViewportSize({width:390,height:844});
    check(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile view overflows viewport');
    await owner.screenshot({path:'output/playwright/read-only-character-mobile.png',fullPage:true});
    await owner.emulateMedia({media:'print'});
    check(await owner.locator('.sheet-actions').isVisible()===false,'Print includes view controls');
    await owner.emulateMedia({media:'screen'});
    await owner.getByRole('link',{name:'Close',exact:true}).click();
    await owner.getByRole('button',{name:'Edit',exact:true}).click();
    await owner.locator('[data-save-status]').waitFor();
    const deviceContext=await browser.newContext();contexts.push(deviceContext);
    const device=await deviceContext.newPage();device.on('pageerror',e=>errors.push(e.message));
    await device.goto('http://127.0.0.1:5000/?emulators#/characters');
    await device.waitForFunction(()=>window.CharacterBuilder);
    await device.evaluate(()=>{
      CharacterStorage.save([{id:'device-sheet',sheet:CharacterRules.normalize({name:'Device Samurai',notes:'DEVICE STORY'}),updatedAt:'now'}]);
      CharacterBuilder.create(); // Keep another character selected while viewing this one.
    });
    await device.reload();
    const deviceBefore=await device.evaluate(()=>JSON.stringify(localStorage));
    await device.locator('.character-tile').filter({hasText:'Device Samurai'}).getByRole('button',{name:'View',exact:true}).click();await readonly(device);
    check((await device.locator('.readonly-sheet').innerText()).includes('DEVICE STORY'),'Device sheet not displayed');
    check(deviceBefore===await device.evaluate(()=>JSON.stringify(localStorage)),'Signed-out View changed storage or active selection');
    check(errors.length===0,'Browser errors: '+errors.join('; '));
    return 'Read-only owner, GM and player views passed; no writes/selection changes; privacy, live updates, separate editing, mobile and print verified.';
  } finally {for(const context of contexts)await context.close();}
}
