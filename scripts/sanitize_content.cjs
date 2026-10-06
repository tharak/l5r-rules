// Keep import metadata in ATTRIBUTION.md and localize links before deployment.
module.exports = function sanitize(data) {
  data = structuredClone(data);
  delete data.source; data.site = 'l5r-rules';
  for (const [slug,page] of Object.entries(data.pages)) {
    delete page.source;
    page.html = page.html.replace(/<a\b[^>]*?href=(["'])(https?:\/\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi,(_,quote,href,body) => {
      const url = new URL(href), target = decodeURIComponent(url.pathname.replace(/^\//,''));
      return /lasthaiku/i.test(url.hostname) && data.pages[target] ? `<a href="#/${encodeURIComponent(target)}${url.hash}">${body}</a>` : body;
    }).replace(/<img\b[^>]*src=["']https?:\/\/[^"']*lasthaiku[^"']*["'][^>]*>/gi,'').replace(/Last Haiku/gi,'l5r-rules');
    if (slug === 'start') { page.html = ''; page.title = 'Campaigns'; page.excerpt = ''; }
  }
  return data;
};
