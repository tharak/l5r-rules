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
