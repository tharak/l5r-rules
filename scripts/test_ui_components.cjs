const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../ui-components.js'),'utf8'),context);
const UI = context.window.UI;

test('shared controls escape user text and attributes exactly once',()=>{
  const text = `<Ren & "Courtier">`;
  const html = UI.button({text,attrs:{'data-id':text,disabled:true,'aria-pressed':false}});
  assert.match(html,/&lt;Ren &amp; &quot;Courtier&quot;&gt;/);
  assert.ok(!html.includes('&amp;lt;'));
  assert.match(html,/ disabled /);
  assert.match(html,/aria-pressed="false"/);
  assert.ok(!UI.button({attrs:{disabled:false}}).includes('disabled'));
  assert.match(UI.field({kind:'textarea',value:'\n'+text}),/>\n\n&lt;Ren/);
  assert.match(UI.link({text,href:'#/skills'}),/class="ui-link"/);
  assert.match(UI.option({value:text,selected:true}),/ selected>/);
});

test('shared attributes reject executable attributes and URL schemes',()=>{
  for (const attrs of [{onclick:'alert(1)'},{srcdoc:'<script>'},{srcDoc:'<script>'},{HREF:'javascript:alert(1)'},{'bad name':'x'},{href:'JaVaScRiPt:alert(1)'},{href:'java\nscript:alert(1)'},{src:'data:text/html,x'}]) assert.throws(()=>UI.attributes(attrs));
  assert.match(UI.attributes({'data-section':'skills',hidden:true,readonly:true}),/data-section="skills" hidden readonly/);
});

test('steppers preserve boundaries, labels and controller hooks',()=>{
  const html=UI.stepper({value:2,label:'Awareness rank',size:'compact',decrease:{disabled:true,'data-delta':-1,'aria-label':'Decrease Awareness'},increase:{'data-delta':1,'aria-label':'Increase Awareness'}});
  assert.match(html,/role="group" aria-label="Awareness rank"/);
  assert.match(html,/ui-stepper--compact/);
  assert.match(html,/disabled data-delta="-1" aria-label="Decrease Awareness"/);
  assert.match(html,/<output aria-label="Awareness rank">2<\/output>/);
});

test('record editor shares fields and actions without taking ownership of controllers',()=>{
  const html=UI.recordEditor({fields:[{label:'Title',value:'Winter & Court',attrs:{'data-entry-field':'title',readonly:true}},{label:'Notes',kind:'textarea',value:'first\nsecond'},{label:'Visibility',kind:'select',value:'private',options:[{value:'public',label:'Public'},{value:'private',label:'Private'}]}],actionsHtml:UI.button({text:'Save',attrs:{'data-campaign':'session-save',disabled:true}})});
  assert.match(html,/value="Winter &amp; Court"/);
  assert.match(html,/ readonly/);
  assert.match(html,/>\nfirst\nsecond<\/textarea>/);
  assert.match(html,/<option value="private" selected>Private/);
  assert.match(html,/ui-action-row/);
  assert.match(html,/data-campaign="session-save" disabled/);
});

test('ring images and icon placeholders use one elemental renderer',()=>{
  for(const ring of ['Air','Earth','Fire','Water','Void']) {
    const image=UI.ringMark({ring}),placeholder=UI.ringMark({ring,placeholder:true});
    assert.match(image,/ui-ring-placeholder/);
    assert.match(image,/creator-ring-symbol/);
    assert.match(placeholder,/ui-ring-placeholder/);
    assert.doesNotMatch(placeholder,/creator-ring-symbol/);
    assert.ok(image.includes(`data-ring="${ring}"`));
  }
});

test('portraits render only small inline images and offer Remove only when a picture exists',()=>{
  const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYwPRVdM7zQAAAABJRU5ErkJggg==';
  assert.ok(UI.isPortrait(picture));
  const html=UI.portrait({label:'NPC picture',name:'Ren <Doji>',src:picture,inputAttrs:{'data-npc-portrait':true},removeAttrs:{'data-campaign':'npc-portrait-remove'}});
  assert.match(html,/<img class="ui-portrait-image" src="data:image\/png;base64,/);
  assert.match(html,/alt="Picture of Ren &lt;Doji&gt;"/);
  assert.match(html,/type="file" accept="image\/\*"/);
  assert.match(html,/Change picture/);assert.match(html,/Remove picture/);
  const empty=UI.portrait({label:'NPC picture'});
  assert.ok(!empty.includes('<img'));assert.match(empty,/Add picture/);assert.ok(!empty.includes('Remove picture'));
  for(const src of ['javascript:alert(1)','https://example.test/a.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,AA" onerror="alert(1)','data:text/html;base64,PGI+','data:image/png;base64,'+'A'.repeat(UI.PORTRAIT_MAX_LENGTH)]) {
    assert.ok(!UI.isPortrait(src),src.slice(0,40));
    assert.ok(!UI.portrait({src}).includes('<img'),src.slice(0,40));
  }
});
