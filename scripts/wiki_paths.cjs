// Each page's place in the books (books/fire/schools/scrane), as app.js builds it for addresses
// (addDeepNavigation, then buildBookPaths); pages outside the books keep their slug. The build
// stores page text at public/pages/<path>.json, so the files mirror the page addresses.
const BOOK_RINGS = {'book-of-air':'air','book-of-earth':'earth','book-of-fire':'fire','book-of-water':'water','book-of-the-void':'void'};
module.exports = wiki => {
  const linked = slug => {
    const seen = new Set(), out = [];
    for (const [,href] of String(wiki.pages[slug]?.html || '').matchAll(/<a\b[^>]*?\bhref="#\/([^"#]+)"/gi)) {
      let target; try { target = decodeURIComponent(href); } catch { continue; }
      if (seen.has(target) || !wiki.pages[target]) continue;
      seen.add(target); out.push({slug:target,children:[]});
    }
    return out;
  };
  const books = wiki.navigation.filter(section => section.slug.startsWith('book-of-')).map(book => ({...book,children:(book.children || []).filter(c => !c.anchor).map(c => ({slug:c.slug,children:[]}))}));
  for (const book of books) {
    if (['book-of-earth','book-of-water'].includes(book.slug)) book.children = linked(book.slug);
    if (book.slug === 'book-of-fire') { book.children = linked(book.slug); for (const entry of book.children) if (['families','schools','skills'].includes(entry.slug)) entry.children = linked(entry.slug); }
    if (book.slug === 'book-of-the-void') { const existing = new Set(book.children.map(e => e.slug)); book.children.push(...linked(book.slug).filter(e => !existing.has(e.slug))); }
  }
  const paths = new Map();
  let level = books.filter(book => BOOK_RINGS[book.slug]).map(book => ({entry:book,path:`books/${BOOK_RINGS[book.slug]}`}));
  while (level.length) {
    const next = [];
    for (const {entry,path} of level) {
      if (paths.has(entry.slug) || !wiki.pages[entry.slug]) continue;
      paths.set(entry.slug,path);
      for (const child of entry.children) next.push({entry:child,path:`${path}/${child.slug}`});
    }
    level = next;
  }
  return slug => paths.get(slug) || slug;
};
