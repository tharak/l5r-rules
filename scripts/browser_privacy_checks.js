async page => {
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const browser=page.context().browser(),ownerContext=await browser.newContext(),playerContext=await browser.newContext();
  const owner=await ownerContext.newPage(),player=await playerContext.newPage();
  const errors=[];for(const p of [owner,player])p.on('pageerror',e=>errors.push(e.message));
  const signIn=async(p,label)=>{
    await p.goto('http://127.0.0.1:5000/?emulators#/campaigns');
    await p.waitForFunction(()=>document.getElementById('account-sign-in')?.disabled===false);
    await p.evaluate(async label=>{
      const auth=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
      const account=await auth.createUserWithEmailAndPassword(auth.getAuth(),label+'-'+Date.now()+'@example.test','test-password-123');
      await auth.updateProfile(account.user,{displayName:label});
    },label);
    await p.waitForFunction(()=>window.CampaignStorage?.backend);
  };
  try {
    await signIn(owner,'mask-owner');await signIn(player,'mask-player');
    const setup=await owner.evaluate(async()=>{
      const b=CampaignStorage.backend,c=await b.create('All privacy masks'),id=crypto.randomUUID();
      window.maskSheet=CharacterRules.normalize({name:'MASK IDENTITY',concept:'MASK STORY',notes:'MASK NOTES',skills:{Athletics:1},abilities:[{id:'private-ability',kind:'custom',name:'MASK ABILITY',description:'MASK ABILITY DESCRIPTION'}],exceptions:[{code:'school',explanation:'PRIVATE APPROVAL EXPLANATION'}],progression:{history:[{kind:'award',amount:0,explanation:'PRIVATE XP HISTORY'}]}});
      await b.saveCharacter(CampaignStorage.uid,id,maskSheet,new Date().toISOString());
      window.maskCharacterId=id;window.maskCampaign=c;
      return {c,id,uid:CampaignStorage.uid,token:await b.invite(c)};
    });
    await owner.waitForFunction(id=>CharacterBuilder.list().some(c=>c.id===id),setup.id);
    const pcId=await owner.evaluate(async({c,id})=>CampaignStorage.backend.link(c,id),setup);
    await player.evaluate(async({token})=>CampaignStorage.backend.join(token),setup);
    await player.goto('http://127.0.0.1:5000/?emulators#/campaigns/'+setup.c);
    await player.getByRole('button',{name:'PC',exact:true}).click();
    check(await player.getByRole('button',{name:'View',exact:true}).count()===0,'Removed sheet view remains');
    await player.evaluate(async({c,pcId})=>{window.privacyDocument=null;window.stopPrivacyWatch=await CampaignStorage.backend.watchSheet(c,pcId,false,data=>window.privacyDocument=data,()=>{});},{c:setup.c,pcId});
    for(let mask=0;mask<128;mask++) {
      const revision=await owner.evaluate(async mask=>{
        maskSheet.visibility=Object.fromEntries(SheetSharing.keys.map((key,i)=>[key,!!(mask&(1<<i))]));
        await CampaignStorage.backend.saveCharacter(CampaignStorage.uid,maskCharacterId,maskSheet,new Date().toISOString());
        return (await CampaignStorage.backend.get('users/'+CampaignStorage.uid+'/publicCharacters/'+maskCharacterId)).revision;
      },mask);
      await player.waitForFunction(rev=>window.privacyDocument?.revision===rev,revision);
      const response=await player.evaluate(()=>JSON.stringify(privacyDocument));
      const abilities=!!(mask&64),story=!!(mask&16);
      check(response.includes('MASK ABILITY')===abilities,'Abilities leaked/absent in response for mask '+mask);
      check(response.includes('MASK NOTES')===story,'Notes leaked/absent in response for mask '+mask);
      check(!response.includes('sheetJson'),'Full sheet leaked in response for mask '+mask);
      for(const text of ['PRIVATE APPROVAL EXPLANATION','PRIVATE XP HISTORY'])check(!response.includes(text),'Private audit information leaked for mask '+mask);
    }
    await owner.evaluate(async uid=>CampaignStorage.backend.removeMember(maskCampaign,uid),await player.evaluate(()=>CampaignStorage.uid));
    await player.waitForFunction(()=>document.querySelector('#app').textContent.includes('Campaign unavailable'));
    await player.evaluate(()=>window.stopPrivacyWatch());
    const denied=await player.evaluate(async({uid,id})=>{
      const sdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      try {await sdk.getDocFromServer(sdk.doc(sdk.getFirestore(),'users/'+uid+'/publicCharacters/'+id));return false;}
      catch(e){if(e.code!=='permission-denied')throw e;return true;}
    },setup);
    const diagnostic=denied ? null : await player.evaluate(async({c,uid,id})=>{
      const sdk=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      const auth=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
      const db=sdk.getFirestore();
      let member;try{member=(await sdk.getDocFromServer(sdk.doc(db,'campaigns/'+c+'/members/'+CampaignStorage.uid))).exists();}catch(e){member=e.code;}
      return {owner:uid,player:CampaignStorage.uid,auth:auth.getAuth().currentUser.uid,member,project:db.app.options.projectId,id};
    },setup);
    check(denied,'Revoked player retained server access to Abilities: '+JSON.stringify(diagnostic));
    check(errors.length===0,'Privacy browser errors: '+errors.join('; '));
    return 'All 128 privacy masks passed live player responses; private history/exceptions excluded and membership revocation enforced.';
  } finally {await ownerContext.close();await playerContext.close();}
}
