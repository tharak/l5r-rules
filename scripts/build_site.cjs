const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
// Build only the allowlisted web assets, never repository files or the source PDF.
fs.rmSync(output, {recursive:true, force:true});
fs.mkdirSync(output, {recursive:true});
for (const file of ['official-images.js','ui-components.js','ui-components.css','routes.js','character-catalog.js','character-rules.js','character-dice.js','sheet-sharing.js','campaign-storage.js','campaign-service.js','campaign-ui.js','media-library.js','campaign.css','index.html','app.js','character.js','portrait-creator.js','character-public.js','character-storage.js','firebase-service.js','firebase-config.js','styles.css','dark-theme.css','character.css','dashboard.css','account.css','rokugan-theme.css','design-guideline.js','design-guideline.css']) {
  fs.copyFileSync(path.join(root,file), path.join(output,file));
}
fs.mkdirSync(path.join(output,'public'), {recursive:true});
const wiki = require('./sanitize_content.cjs')(JSON.parse(fs.readFileSync(path.join(root,'public','wiki.json'),'utf8')));
fs.writeFileSync(path.join(output,'public','wiki.json'),JSON.stringify(wiki));
// The first load reads a small index: each page keeps only its headings and page links (enough for
// the book menus); app.js loads a page's text from its own file, and wiki.json for search.
// Each page's text on its own, loaded when that page opens, in folders that mirror its address
// (pages/books/fire/schools/scrane.json); the index names each page's file.
const pagePath = require('./wiki_paths.cjs')(wiki), index = require('./wiki_index.cjs')(wiki);
for (const [slug,page] of Object.entries(wiki.pages)) {
  const file = path.join(output,'public','pages',`${pagePath(slug)}.json`);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify({html:page.html}));
  index.pages[slug].file = `pages/${pagePath(slug)}.json`;
}
fs.writeFileSync(path.join(output,'public','wiki-index.json'),JSON.stringify(index));
fs.copyFileSync(path.join(root,'public','character-data.json'),path.join(output,'public','character-data.json'));
fs.cpSync(path.join(root,'public','assets'),path.join(output,'public','assets'),{recursive:true});
console.log('Built Firebase Hosting assets in dist/');
