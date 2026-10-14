async page => {
  const check = (condition,message) => { if (!condition) throw Error(message); };
  const context = await page.context().browser().newContext({viewport:{width:1440,height:1000}});
  const p = await context.newPage(), errors = [];
  p.on('pageerror',error=>errors.push(error.message));
  // Exercise the production outbox and cloud encoder with deterministic save echoes.
  await context.route('**/firebase-service.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  try {
    await p.goto('http://127.0.0.1:5000/#/characters');
    await p.getByRole('button',{name:'Create PC',exact:true}).waitFor();
    await p.evaluate(()=>{
      window.focusUploads = 0;
      CharacterStorage.connect('focus-check',receive=>{
        window.receiveFocusRecords=receive;receive([],false);return ()=>{};
      },async(id,record)=>{
        const encoded=await SheetSharing.encode(record.sheet,record.updatedAt);
        const sheet=JSON.parse(encoded.full.sheetJson);
        sheet.visibility=Object.fromEntries(Object.entries(encoded.full.visibility).sort());
        window.focusUploads++;
        window.receiveFocusRecords([{id,sheet,updatedAt:record.updatedAt},{id:'other',sheet:{name:'Other '+window.focusUploads},updatedAt:record.updatedAt}],false);
      });
    });
    await p.getByRole('button',{name:'Create PC',exact:true}).click();
    await p.locator('#creator-skills').waitFor();
    const allSkills=await p.evaluate(async()=>{
      const catalog=await(await fetch('public/character-data.json')).json();
      return catalog.skills.every(skill=>[...document.querySelectorAll('#creator-skills [data-skill-name]')].some(node=>node.dataset.skillName===skill.name));
    });
    check(allSkills,'Section 03 omits catalog skills');
    await p.locator('[data-field="name"]').fill('Focus check');
    await p.evaluate(()=>{window.originalNameField=document.querySelector('[data-field="name"]');originalNameField.setSelectionRange(2,7);});
    await p.evaluate(()=>CharacterStorage.flush());
    check(await p.evaluate(()=>document.activeElement===originalNameField&&originalNameField.isConnected&&originalNameField.selectionStart===2&&originalNameField.selectionEnd===7),'Save echo replaced the name field or selection');
    await p.locator('[data-field="notes"]').fill('First line\nSecond line');
    await p.evaluate(()=>{window.originalNotes=document.querySelector('[data-field="notes"]');originalNotes.setSelectionRange(4,4);});
    await p.evaluate(()=>CharacterStorage.flush());
    await p.keyboard.type(' continued');
    check(await p.locator('[data-field="notes"]').inputValue()==='Firs continuedt line\nSecond line','Typing after save lost its caret');
    await p.evaluate(()=>CharacterStorage.flush());
    await p.locator('#new-skill').fill('Unfinished custom skill');
    await p.evaluate(()=>{
      window.originalPicker=document.querySelector('#new-skill');
      const records=CharacterStorage.records();records.find(r=>r.id==='other').sheet.name='Remote unrelated update';
      receiveFocusRecords(records,false);
    });
    check(await p.evaluate(()=>document.activeElement===originalPicker&&originalPicker.isConnected&&originalPicker.value==='Unfinished custom skill'),'Unrelated update discarded a picker draft');
    await p.getByRole('button',{name:'Increase Courtier for 1 XP',exact:true}).click();
    check(await p.locator('#creator-skills [data-skill-name="Courtier"] output').innerText()==='1','Rank zero skill cannot be purchased');
    await p.getByRole('button',{name:'Choose Lore subskill',exact:true}).click();
    await p.getByRole('dialog',{name:'Lore · Choose subskill',exact:true}).waitFor();
    await p.getByRole('button',{name:'History',exact:true}).click();
    check(await p.locator('#creator-skills [data-skill-name="Lore: History"] output').innerText()==='1','Catalog subskill was not purchased');
    await p.getByRole('button',{name:'Choose Lore subskill',exact:true}).click();
    await p.getByRole('textbox',{name:'Custom subskill',exact:true}).fill('Local legends');
    await p.getByRole('button',{name:'Add subskill · 1 XP',exact:true}).click();
    check(await p.locator('#creator-skills [data-skill-name="Lore: Local legends"] output').innerText()==='1','Custom subskill was not purchased');
    await p.getByRole('button',{name:'Choose Lore subskill',exact:true}).click();
    await p.keyboard.press('Escape');
    check(await p.getByRole('button',{name:'Choose Lore subskill',exact:true}).evaluate(node=>node===document.activeElement),'Escape did not restore popup trigger focus');
    for (const width of [1440,390]) {
      await p.setViewportSize({width,height:1000});
      const layout=await p.locator('.creator-skill-grid').evaluate(node=>({columns:getComputedStyle(node).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth}));
      check(!layout.overflow,'Skill grid overflows at '+width);
      check(width===390||layout.columns>1,'Desktop skills are not horizontal');
      await p.locator('#creator-skills').screenshot({path:'output/playwright/skills-'+width+'.png'});
      await p.getByRole('button',{name:'Choose Craft subskill',exact:true}).click();
      check(await p.locator('.creator-subskill-dialog').evaluate(node=>node.getBoundingClientRect().right<=innerWidth),'Subskill popup overflows at '+width);
      await p.keyboard.press('Escape');
    }
    await p.evaluate(()=>CharacterStorage.flush());
    check(await p.evaluate(()=>{
      const record=CharacterStorage.records().find(r=>r.id!=='other');
      return record.sheet.skills.Courtier===1&&record.sheet.skills['Lore: History']===1&&record.sheet.skills['Lore: Local legends']===1;
    }),'Skill purchases were not persisted');
    check(errors.length===0,'Browser errors: '+errors.join('; '));
    return 'Passed: save focus, cursor/selection, continued typing, unrelated updates, every skill, rank zero purchases, catalog/custom subskill popups, Escape focus, desktop/mobile layout, and persisted purchases.';
  } finally { await context.close(); }
}
