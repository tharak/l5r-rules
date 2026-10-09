const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'design-guideline.js'),'utf8');
const context = {window:{}};
vm.runInNewContext(source,context);
const entries = context.window.DesignGuideline.entries;

test('catalog IDs are unique and every component has a preview and traceable sources',()=>{
  assert.equal(new Set(entries.map(item=>item.id)).size,entries.length);
  for (const item of entries) {
    assert.match(item.id,/^UI-[A-Z]+(?:-[A-Z]+)*$/);
    for (const field of ['name','purpose','selectors','variants','preview','source']) assert.ok(item[field]?.trim(),`${item.id}: missing ${field}`);
    for (const file of item.source.split(', ')) assert.ok(fs.existsSync(path.join(root,file)),`${item.id}: source ${file} does not exist`);
    assert.ok(!/<script\b|\bon\w+\s*=|javascript:/i.test(item.preview),`${item.id}: preview must not execute scripts`);
  }
  for (const id of ['UI-CAMPAIGN-CARD','UI-RANK-STEPPER','UI-SKILL-ROW']) assert.ok(entries.some(item=>item.id===id),id);
});

test('active screen classes remain represented in the inventory',()=>{
  const documented = entries.map(item=>item.selectors+' '+item.context+' '+item.preview).join(' ');
  for (const file of ['index.html','app.js','character.js','campaign-ui.js']) {
    const html = fs.readFileSync(path.join(root,file),'utf8');
    const classes = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap(match=>match[1].replace(/\$\{[^}]*\}/g,'').split(/\s+/)).filter(name=>/^[a-z][a-z0-9-]+$/.test(name)));
    for (const cls of classes) assert.ok(documented.includes(cls),`${file}: document the active .${cls} pattern`);
  }
});

test('all catalog assets are wired into the page and production build',()=>{
  const index = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const build = fs.readFileSync(path.join(root,'scripts/build_site.cjs'),'utf8');
  for (const file of ['design-guideline.js','design-guideline.css']) {
    assert.ok(index.includes(file),`${file}: missing HTML asset`);
    assert.ok(build.includes(`'${file}'`),`${file}: missing build asset`);
  }
  assert.ok(index.includes('href="#/design-guideline"'));
});
