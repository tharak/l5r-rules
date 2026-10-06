const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
// Build only the allowlisted web assets, never repository files or the source PDF.
fs.rmSync(output, {recursive:true, force:true});
fs.mkdirSync(output, {recursive:true});
for (const file of ['sheet-sharing.js','campaign-storage.js','campaign-service.js','campaign-ui.js','campaign.css','index.html','app.js','character.js','character-storage.js','firebase-service.js','firebase-config.js','styles.css','dark-theme.css','character.css','dashboard.css','account.css']) {
  fs.copyFileSync(path.join(root,file), path.join(output,file));
}
fs.mkdirSync(path.join(output,'public'), {recursive:true});
fs.writeFileSync(path.join(output,'public','wiki.json'),JSON.stringify(require('./sanitize_content.cjs')(JSON.parse(fs.readFileSync(path.join(root,'public','wiki.json'),'utf8')))));
fs.copyFileSync(path.join(root,'public','character-data.json'),path.join(output,'public','character-data.json'));
fs.cpSync(path.join(root,'public','assets'),path.join(output,'public','assets'),{recursive:true});
console.log('Built Firebase Hosting assets in dist/');
