// Readable, rename-proof URL segments: "<name>-<short id>" (e.g. "mario-c4d5").
// Only the ID part finds the item; the name is decoration, so renaming never breaks a link.
(() => {
  const MIN = 4;
  function slugify(name) {
    const slug = String(name || '').toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
    return slug || 'item';
  }
  // The shortest ID prefix (at least MIN characters) that no sibling ID shares.
  function shortId(id, siblingIds = []) {
    id = String(id);
    const others = siblingIds.map(String).filter(other => other !== id);
    for (let length = MIN; length < id.length; length++) {
      const prefix = id.slice(0,length);
      if (!others.some(other => other.startsWith(prefix))) return prefix;
    }
    return id;
  }
  function segment(name, id, siblingIds = []) {
    return `${slugify(name)}-${shortId(id,siblingIds)}`;
  }
  // Finds the item a segment names: a bare full ID, or the part after the last "-" as an
  // ID prefix. Ambiguous or unknown segments find nothing.
  function resolve(segmentText, items, idOf = item => item.id) {
    const text = String(segmentText || '');
    if (!text) return null;
    const exact = items.find(item => String(idOf(item)) === text);
    if (exact) return exact;
    const suffix = text.slice(text.lastIndexOf('-') + 1);
    if (suffix.length < MIN) return null;
    const matches = items.filter(item => String(idOf(item)).startsWith(suffix));
    return matches.length === 1 ? matches[0] : null;
  }
  window.Routes = {slugify, shortId, segment, resolve};
})();
