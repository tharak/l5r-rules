const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const context = {window:{}};
for(const file of ['ui-components.js','design-guideline.js']) vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const {entries,examples} = context.window.DesignGuideline;

test('36 families retain all 111 permanent example IDs exactly once',()=>{
  assert.equal(entries.length,36);
  assert.equal(examples.length,111);
  assert.equal(new Set(entries.map(item=>item.id)).size,entries.length);
  const mapped=entries.flatMap(item=>item.exampleIds);
  assert.equal(mapped.length,examples.length);
  assert.equal(new Set(mapped).size,examples.length);
  assert.deepEqual([...mapped].sort(),[...examples].map(item=>item.id).sort());
  for (const id of ['UI-CAMPAIGN-CARD','UI-RANK-STEPPER','UI-SKILL-ROW','UI-PRINT-IDENTITY']) assert.ok(mapped.includes(id),id);
  for (const id of ['UI-BUTTON','UI-FIELD','UI-CARD','UI-RECORD-EDITOR']) assert.ok(entries.some(item=>item.id===id),id);
});

test('every variant has a script-free preview and traceable sources',()=>{
  for (const item of examples) {
    assert.match(item.id,/^UI-[A-Z]+(?:-[A-Z]+)*$/);
    for (const field of ['name','purpose','selectors','variants','preview','source']) assert.ok(item[field]?.trim(),`${item.id}: missing ${field}`);
    for (const file of item.source.split(', ')) assert.ok(fs.existsSync(path.join(root,file)),`${item.id}: source ${file} does not exist`);
    assert.ok(!/<script\b|\bon\w+\s*=|javascript:/i.test(item.preview),`${item.id}: preview must not execute scripts`);
  }
});

test('active domain classes remain represented in the inventory',()=>{
  const documented = examples.map(item=>item.selectors+' '+item.context+' '+item.preview).join(' ');
  for (const file of ['index.html','app.js','character.js','campaign-ui.js']) {
    const html = fs.readFileSync(path.join(root,file),'utf8');
    const classes = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap(match=>match[1].replace(/\$\{[^}]*\}/g,'').split(/\s+/)).filter(name=>/^[a-z][a-z0-9-]+$/.test(name)));
    for (const cls of classes) if(!cls.startsWith('ui-')) assert.ok(documented.includes(cls),`${file}: document the active .${cls} pattern`);
  }
});

test('shared components load before consumers and are included in production builds',()=>{
  const index = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const build = fs.readFileSync(path.join(root,'scripts/build_site.cjs'),'utf8');
  for (const file of ['ui-components.js','ui-components.css','design-guideline.js','design-guideline.css']) {
    assert.ok(index.includes(file),`${file}: missing HTML asset`);
    assert.ok(build.includes(`'${file}'`),`${file}: missing build asset`);
  }
  for(const file of ['character.js','campaign-ui.js','design-guideline.js','app.js']) assert.ok(index.indexOf('src="ui-components.js"')<index.indexOf(`src="${file}"`),file);
  assert.ok(index.indexOf('href="ui-components.css"')>index.indexOf('href="rokugan-theme.css"'));
  assert.ok(index.includes('href="#/design-guideline"'));
});
