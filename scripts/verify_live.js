async page => {
  const context=await page.context().browser().newContext({viewport:{width:1440,height:1000}});
  const live=await context.newPage(),errors=[];live.on('pageerror',e=>errors.push(e.message));
  const check=(value,message)=>{if(!value)throw new Error(message);};
  try {
    const response=await live.goto('https://l5r-rules.web.app/#/start');
    check(response.ok(),'Hosting response failed');
    await live.waitForURL(/#\/campaigns$/);
    await live.waitForFunction(()=>document.getElementById('account-sign-in')?.disabled===false);
    await live.getByRole('link',{name:'Characters',exact:true}).click();
    await live.getByRole('button',{name:'Create PC',exact:true}).click();
    await live.locator('[data-field="name"]').waitFor();
    await live.locator('[data-field="name"]').fill('Live device PC');
    check(await live.locator('[data-public]').count()===6,'Privacy controls missing');
    const exportPromise=live.waitForEvent('download');
    await live.getByRole('button',{name:'Export JSON ↗',exact:true}).click();
    const exported=await exportPromise,stream=await exported.createReadStream();let text='';for await(const part of stream)text+=part;
    check(JSON.parse(text).source==='l5r-rules','Export branding is incorrect');
    await live.getByRole('button',{name:'Save PC',exact:true}).click();
    await live.waitForURL(/#\/characters$/);
    await live.getByRole('heading',{name:'Live device PC',exact:true}).waitFor();
    await live.getByRole('link',{name:'Books',exact:true}).click();
    await live.getByRole('heading',{name:'Books',exact:true}).waitFor();
    check(await live.locator('.books-grid > section').count()===5,'Books missing');
    await live.screenshot({path:'output/playwright/l5r-live-desktop.png',fullPage:true});
    const snapshot=await live.evaluate(async()=>await(await fetch('public/wiki.json')).json());
    check(snapshot.site==='l5r-rules'&&!snapshot.source,'Import metadata is deployed');
    check(Object.values(snapshot.pages).every(p=>!p.source&&!/Last Haiku|(?:href|src)=["'][^"']*lasthaiku/i.test(p.html)),'Source branding or links are deployed');
    await live.goto('https://l5r-rules.web.app/#/combat');
    await live.locator('.article h1').first().waitFor();
    check(await live.locator('.article-content a[href^="#/"]').count()>0,'Old article references failed');
    await live.locator('.inline-contents summary').click();
    check(await live.locator('.inline-contents nav a').first().isVisible(),'Inline contents missing');
    await live.getByRole('button',{name:'Search',exact:true}).click();
    await live.locator('#search-input').fill('combat');await live.locator('.search-result').first().waitFor();
    await live.getByRole('button',{name:'Close search',exact:true}).click();
    await live.setViewportSize({width:390,height:844});
    await live.getByRole('link',{name:'Books',exact:true}).click();
    await live.getByRole('heading',{name:'Books',exact:true}).waitFor();
    for(const tab of ['Campaigns','Characters','Books'])check(await live.getByRole('link',{name:tab,exact:true}).isVisible(),'Mobile tab missing: '+tab);
    check(await live.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
    await live.screenshot({path:'output/playwright/l5r-live-mobile.png',fullPage:true});
    check(errors.length===0,'Live browser errors: '+errors.join('; '));
    return 'Live site passed: home redirect, Google sign-in availability, device PCs and export, five books, article references, inline contents, full-text search, source cleanup and mobile navigation.';
  } finally {await context.close();}
}
