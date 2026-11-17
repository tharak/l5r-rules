// Lists the images bundled with the site for the media library, grouped by source.
// Run: node scripts/build_library.cjs  → public/assets/library.json
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname,'..'), assets = path.join(root,'public/assets');
const images = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(webp|jpe?g|png|gif)$/i.test(f)).sort() : [];
const title = file => file.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').replace(/\b(\w)/g,c => c.toUpperCase());
const from = (folder,files = images(path.join(assets,folder))) => files.map(f => ({src:`public/assets/${folder ? folder + '/' : ''}${f}`,title:title(f)}));
const groups = [
  {source:'Maps',items:[{src:'public/assets/rokugan-map.webp',title:'Rokugan'},{src:'public/assets/lore/shadowlands-map.webp',title:'Shadowlands'}]},
  {source:'Clan art',items:[...from('clans/covers'),...from('clans/illustrations'),...from('clans/banners').map(i => ({...i,title:`${i.title} banner`}))]},
  {source:'Clan mons',items:[...from('clans/official'),...from('clans/wiki'),...from('clans/mandala')]},
  {source:'Families',items:from('clans/families')},
  {source:'Lore',items:from('lore').filter(i => !/shadowlands-map/.test(i.src))},
  {source:'Rings',items:from('rings')},
  {source:'Site',items:from('').filter(i => !/rokugan-map|parchment/.test(i.src))},
];
fs.writeFileSync(path.join(assets,'library.json'),JSON.stringify({groups},null,1)+'\n');
console.log(groups.map(g => `${g.source}: ${g.items.length}`).join(', '));
