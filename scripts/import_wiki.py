"""Import public Last Haiku pages into a static, searchable content snapshot."""

from __future__ import annotations

import json
import re
import sys
import time
from collections import deque
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen

sys.path.insert(0, "/tmp/l5r-deps")
from bs4 import BeautifulSoup


ROOT = "https://lasthaiku.wikidot.com/"
OUT = Path(__file__).resolve().parents[1] / "public"
EXCLUDED = ("admin:", "nav:", "system:", "forum:", "search:", "local--", "module:")


def get(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "LastHaikuStaticArchive/1.0 (public site migration)"})
    with urlopen(request, timeout=30) as response:
        return response.read()


def slug_for(href: str) -> str | None:
    parsed = urlparse(urljoin(ROOT, href))
    if parsed.netloc not in ("lasthaiku.wikidot.com", "www.lasthaiku.wikidot.com"):
        return None
    slug = unquote(parsed.path.strip("/")) or "start"
    if slug.startswith(EXCLUDED) or "/" in slug or slug.endswith((".jpg", ".png", ".gif", ".pdf")):
        return None
    return slug


def nav_items(ul):
    items = []
    for li in ul.find_all("li", recursive=False):
        a = li.find("a", recursive=False)
        if not a:
            continue
        slug = slug_for(a.get("href", ""))
        if slug is None:
            continue
        nested = li.find("ul", recursive=False)
        items.append({"title": a.get_text(" ", strip=True), "slug": slug,
                      "children": nav_items(nested) if nested else []})
    return items


def fetch_page(slug: str):
    try:
        raw = get(urljoin(ROOT, slug))
    except (HTTPError, URLError, TimeoutError) as exc:
        print(f"skip {slug}: {exc}", flush=True)
        return None
    soup = BeautifulSoup(raw, "html.parser")
    main = soup.select_one("#page-content")
    title = soup.select_one("#page-title")
    if not main or not title or "page does not exist" in main.get_text(" ", strip=True).lower():
        print(f"skip {slug}: no page content", flush=True)
        return None
    return soup, main, title.get_text(" ", strip=True)


def main():
    OUT.mkdir(exist_ok=True)
    assets = OUT / "assets"
    assets.mkdir(exist_ok=True)
    first = fetch_page("start")
    if not first:
        raise SystemExit("Source home page unavailable")
    soup, _, _ = first
    top = soup.select_one("#top-bar > ul")
    side = soup.select_one("#side-bar > ul:last-of-type")
    navigation = nav_items(top) if top else []
    more = nav_items(side) if side else []
    seeds = ["start"] + [x["slug"] for x in navigation + more]
    for section in navigation:
        seeds.extend(x["slug"] for x in section["children"])
    queue = deque(dict.fromkeys(seeds))
    seen = set()
    pages = {}
    image_urls = set()
    while queue and len(seen) < 500:
        slug = queue.popleft()
        if slug in seen:
            continue
        seen.add(slug)
        result = first if slug == "start" else fetch_page(slug)
        if not result:
            continue
        _, content, title = result
        for bad in content.select("script, style, .edit-section-button, .collapsible-block-folded, .collapsible-block-unfolded"):
            bad.decompose()
        for a in content.select("a[href]"):
            href = a["href"]
            if href.startswith("#"):
                a["href"] = "#/" + slug + href
                continue
            target = slug_for(href)
            if target:
                queue.append(target)
                parsed = urlparse(href)
                a["href"] = "#/" + target + ("#" + parsed.fragment if parsed.fragment else "")
            elif href.startswith("/"):
                a["href"] = urljoin(ROOT, href)
            elif href.startswith("javascript:"):
                a.unwrap()
        for img in content.select("img[src]"):
            url = urljoin(ROOT, img["src"])
            if urlparse(url).netloc.endswith("wdfiles.com"):
                image_urls.add(url)
                suffix = Path(urlparse(url).path).suffix.lower() or ".jpg"
                name = re.sub(r"[^a-z0-9]+", "-", slug).strip("-") + "-" + str(len(image_urls)) + suffix
                img["src"] = "public/assets/" + name
                try:
                    (assets / name).write_bytes(get(url))
                except (HTTPError, URLError, TimeoutError) as exc:
                    print(f"image failed {url}: {exc}", flush=True)
                    img["src"] = url
        for el in content.select("[onclick], [onmouseover], [onmouseout]"):
            for attr in ("onclick", "onmouseover", "onmouseout"):
                el.attrs.pop(attr, None)
        text = content.get_text(" ", strip=True)
        info = soup.select_one("#page-info")
        pages[slug] = {"slug": slug, "title": title, "html": str(content),
                       "excerpt": text[:220], "words": len(text.split()),
                       "source": urljoin(ROOT, slug),
                       "revision": info.get_text(" ", strip=True) if info else ""}
        print(f"{len(pages):3} {slug}: {len(text.split())} words", flush=True)
        time.sleep(0.08)
    result = {"site": "Last Haiku", "source": ROOT, "license": "CC BY-SA 3.0",
              "navigation": navigation, "more": more, "pages": pages}
    (OUT / "wiki.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(f"Saved {len(pages)} pages, {len(image_urls)} images", flush=True)


if __name__ == "__main__":
    main()
