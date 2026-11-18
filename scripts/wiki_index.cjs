// The wiki without page text: each page keeps its h1–h3 headings and its links to other pages,
// in document order, so the book menus (headingMenu, linkedPages in app.js) build the same.
const skeleton = html => (String(html || '').match(/<h([1-3])\b[^>]*>[\s\S]*?<\/h\1>|<a\b[^>]*href="#\/[^"]*"[^>]*>[\s\S]*?<\/a>/gi) || []).join('');
module.exports = wiki => ({...wiki,partial:true,pages:Object.fromEntries(Object.entries(wiki.pages).map(([slug,page]) => [slug,{...page,html:skeleton(page.html)}]))});
