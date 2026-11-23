// Lists the site's images for the media library, grouped by source.
// Run: node scripts/build_library.cjs  → public/assets/library.json
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname,'..'), assets = path.join(root,'public/assets');
// Official art is not kept on the site (it loads from its original file), so its paths come
// from official-images.js; the other pictures are the files under public/assets.
require(path.join(root,'official-images.js'));
const officialIn = dir => globalThis.OfficialImages.paths().map(p => path.join(root,p)).filter(p => path.dirname(p) === dir).map(p => path.basename(p));
const images = dir => [...new Set([...(fs.existsSync(dir) ? fs.readdirSync(dir) : []),...officialIn(dir)])].filter(f => /\.(webp|jpe?g|png|gif)$/i.test(f)).sort();
const title = file => file.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').replace(/\b(\w)/g,c => c.toUpperCase());
const from = (folder,files = images(path.join(assets,folder))) => files.map(f => ({src:`public/assets/${folder ? folder + '/' : ''}${f}`,title:title(f)}));
const groups = [
  {source:'Maps',items:[{src:'public/assets/rokugan-map.webp',title:'Rokugan'},{src:'public/assets/lore/shadowlands-map.webp',title:'Shadowlands'}]},
  {source:'Clan art',items:[...from('clans/covers'),...from('clans/illustrations'),...from('clans/banners').map(i => ({...i,title:`${i.title} banner`}))]},
  {source:'Clan mons',items:[...from('clans/official'),...from('clans/wiki'),...from('clans/mandala')]},
  {source:'Families',items:from('clans/families')},
  {source:'Lore',items:from('lore').filter(i => !/shadowlands-map/.test(i.src))},
  {source:'Rings',items:from('rings')},
  {source:'Site',items:from('').filter(i => !/rokugan-map/.test(i.src))},
];
fs.writeFileSync(path.join(assets,'library.json'),JSON.stringify({groups},null,1)+'\n');
console.log(groups.map(g => `${g.source}: ${g.items.length}`).join(', '));
