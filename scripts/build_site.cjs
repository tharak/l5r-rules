const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
// Build only the allowlisted web assets, never repository files or the source PDF.
fs.rmSync(output, {recursive:true, force:true});
fs.mkdirSync(output, {recursive:true});
for (const file of ['index.html','app.js','character.js','character-storage.js','firebase-service.js','firebase-config.js','styles.css','dark-theme.css','character.css','dashboard.css','account.css']) {
  fs.copyFileSync(path.join(root,file), path.join(output,file));
}
fs.mkdirSync(path.join(output,'public'), {recursive:true});
for (const file of ['wiki.json','character-data.json']) fs.copyFileSync(path.join(root,'public',file),path.join(output,'public',file));
fs.cpSync(path.join(root,'public','assets'),path.join(output,'public','assets'),{recursive:true});
console.log('Built Firebase Hosting assets in dist/');
