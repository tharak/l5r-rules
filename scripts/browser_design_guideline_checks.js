async page => {
  // Run against a static root or built dist preview; no sign-in or emulators needed.
  const context = await page.context().browser().newContext({viewport:{width:1440,height:1000}});
  const guide = await context.newPage();
  const origin = page.url().split('#')[0].split('?')[0];
  const check = (condition,message) => {if(!condition)throw new Error(message);};
  const errors = [];
  guide.on('pageerror',error=>errors.push(error.message));
  try {
    await guide.goto(origin+'#/design-guideline');
    await guide.getByRole('heading',{name:'Design Guideline',exact:true}).waitFor();
    const before = await guide.evaluate(()=>JSON.stringify({...localStorage}));
    const audit = await guide.evaluate(async()=>{
      const wiki = await (await fetch('public/wiki.json')).json();
      const items = window.DesignGuideline.inventory(wiki);
      const coverage = [...document.querySelectorAll('.dg-coverage > ul > li')];
      const usedTags = new Set();
      for (const page of Object.values(wiki.pages)) {
        const doc = new DOMParser().parseFromString(page.html,'text/html');
        for (const tag of doc.querySelectorAll('*')) if(!['HTML','HEAD','BODY'].includes(tag.tagName))usedTags.add(tag.tagName);
      }
      const knownTags = ['DIV','H1','H2','H3','P','STRONG','EM','BR','SPAN','UL','LI','A','TABLE','TBODY','TR','TD','BLOCKQUOTE','IMG'];
      return {
        count:items.length,
        unique:new Set(items.map(item=>item.id)).size,
        pages:coverage.length,
        expectedPages:Object.keys(wiki.pages).length,
        unknownTags:[...usedTags].filter(tag=>!knownTags.includes(tag)),
        queries:items.filter(i=>i.query).map(i=>({id:i.id,matches:i.uses.filter(([slug])=>wiki.pages[slug]).length})),
        duplicateIds:[...document.querySelectorAll('[id]')].map(node=>node.id).filter((id,index,array)=>array.indexOf(id)!==index),
      };
    });
    check(audit.count===audit.unique,'Duplicate catalog IDs');
    check(audit.duplicateIds.length===0,'Duplicate host DOM IDs');
    check(audit.pages===audit.expectedPages,'Stored reference page omitted from coverage');
    check(audit.unknownTags.length===0,'Uncataloged article tags: '+audit.unknownTags.join(', '));
    check(audit.queries.every(item=>item.matches>0),'An article pattern has no usage matches');
    check(await guide.locator('#navigation a[aria-current]').count()===0,'Guide incorrectly selects a main tab');

    const filter = guide.getByRole('searchbox',{name:'Find a component by name, ID, page, or selector'});
    await filter.fill('UI-CAMPAIGN-CARD');
    check(await guide.locator('.dg-component:visible').count()===1,'ID filtering did not isolate campaign card');
    await filter.fill('no-such-ui-component');
    check(await guide.locator('#dg-empty').isVisible(),'Missing empty filter state');
    await filter.fill('combat');
    check(await guide.locator('#UI-ARTICLE-TABLE').isVisible(),'Page-usage filtering missed Combat tables');
    await filter.fill('');
    await filter.focus();
    await guide.keyboard.press('Tab');
    check(await guide.evaluate(()=>document.activeElement?.closest('.dg-nav')!==null),'Categories are not keyboard accessible');

    for (const width of [390,1440]) {
      await guide.setViewportSize({width,height:1000});
      check(await guide.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Guide overflows at '+width);
      await guide.locator('#UI-DICE-DIALOG .dg-id').click();
      await guide.waitForURL(/#\/design-guideline#UI-DICE-DIALOG$/);
      check(await guide.locator('#UI-DICE-DIALOG').isVisible(),'Component deep link failed');
      await guide.reload();
      await guide.locator('#UI-DICE-DIALOG').waitFor();
      check(await guide.evaluate(()=>location.hash.endsWith('#UI-DICE-DIALOG')),'Deep link lost on reload');
    }

    // Load offscreen specimens as well, then check isolated styling and interactions.
    await guide.evaluate(()=>document.querySelectorAll('iframe').forEach(frame=>frame.loading='eager'));
    await guide.waitForFunction(()=>[...document.querySelectorAll('iframe')].every(frame=>parseFloat(frame.style.height)>=100));
    const frames = await guide.evaluate(()=>[...document.querySelectorAll('iframe')].map(frame=>({
      id:frame.dataset.dgPreview,
      sandbox:frame.getAttribute('sandbox'),
      scripts:frame.contentDocument.querySelectorAll('script,[onclick],[onchange],[oninput]').length,
      palette:frame.contentWindow.getComputedStyle(frame.contentDocument.body).getPropertyValue('--paper').trim(),
      printVisible:!frame.dataset.dgPreview.startsWith('UI-PRINT-') || frame.contentDocument.querySelector('.creator-print-sheet').getBoundingClientRect().height>0,
    })));
    check(frames.every(frame=>frame.sandbox==='allow-same-origin' && frame.scripts===0),'Preview allows executable application actions');
    check(frames.every(frame=>frame.palette==='#eee5d3'),'Preview does not use the active site theme');
    check(frames.every(frame=>frame.printVisible),'Print specimen is invisible');
    const primary = guide.frameLocator('#UI-BUTTON-PRIMARY iframe');
    await primary.getByRole('button',{name:'Save session',exact:true}).first().click();
    const text = guide.frameLocator('#UI-FIELD-TEXT iframe');
    await text.getByLabel('Name',{exact:true}).fill('Preview only');
    const link = guide.frameLocator('#UI-LINK iframe');
    await link.getByRole('link',{name:'← Campaigns'}).click();
    check(await guide.evaluate(()=>JSON.stringify({...localStorage}))===before,'Guide interactions mutated stored data');
    check(await guide.locator('#dg-filter').count()===1,'Preview navigation escaped its frame');

    await guide.getByRole('navigation',{name:'Site',exact:true}).getByRole('link',{name:'Books',exact:true}).click();
    await guide.getByRole('heading',{name:'Books',exact:true}).waitFor();
    check(await guide.locator('.books-grid > section').count()===5,'Books regression');
    await guide.goto(origin+'#/combat');
    await guide.locator('.article-content').waitFor();
    await guide.getByRole('button',{name:'Search',exact:true}).click();
    await guide.locator('#search-input').fill('combat');
    await guide.locator('.search-result').first().waitFor();
    await guide.getByRole('button',{name:'Close search',exact:true}).click();
    await guide.getByRole('navigation',{name:'Site',exact:true}).getByRole('link',{name:'Characters',exact:true}).click();
    await guide.getByRole('heading',{name:'Characters',exact:true}).waitFor();
    await guide.getByRole('button',{name:'Create PC',exact:true}).click();
    await guide.locator('[data-field="name"]').fill('Guide regression PC');
    await guide.getByRole('button',{name:'Save PC',exact:true}).click();
    await guide.getByRole('heading',{name:'Guide regression PC',exact:true}).waitFor();
    await guide.getByRole('navigation',{name:'Site',exact:true}).getByRole('link',{name:'Campaigns',exact:true}).click();
    await guide.getByRole('heading',{name:'Campaigns',exact:true}).waitFor();
    check(errors.length===0,'Browser errors: '+errors.join('; '));
    return `Design Guideline checks passed: ${audit.count} unique components, ${audit.pages} reference pages, filtering, deep links, mobile/desktop, all previews, print styles, safe interactions, and existing navigation/search/character editing.`;
  } finally { await context.close(); }
}
