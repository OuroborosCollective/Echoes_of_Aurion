#!/usr/bin/env python3
"""Aurion static website source checks. Preview validates; release fails on legal blockers."""
import argparse
import pathlib
from html.parser import HTMLParser
from urllib.parse import urlsplit

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.refs = []
        self.errors = []
        self.tags = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append(tag)
        if tag in ("script", "iframe", "form", "object", "embed"):
            self.errors.append(f"disallowed active or embedded element: {tag}")
        if a.get("id"):
            if a["id"] in self.ids:
                self.errors.append(f"duplicate id {a['id']}")
            self.ids.add(a["id"])
        if tag in ("a", "link", "img"):
            ref = a.get("href") if tag != "img" else a.get("src")
            if ref:
                self.refs.append((ref, a))

def validate(root, release=False):
    root = pathlib.Path(root).resolve()
    errors = []
    pages = {}
    for file in ("index.html","rechtliches.html","styles.css","media/aurion-realm.svg","media/sigil.svg"):
        p = root / file
        if not p.is_file() or p.stat().st_size == 0:
            errors.append(f"missing required asset: {file}")
    for file in root.glob("*.html"):
        txt = file.read_text(encoding="utf-8")
        parser = Page()
        parser.feed(txt)
        pages[file.name] = parser
        errors += [f"{file.name}: {e}" for e in parser.errors]
        if 'lang="de"' not in txt or 'name="viewport"' not in txt:
            errors.append(f"{file.name}: missing accessibility/mobile metadata")
        if release and ("PUBLICATION_BLOCKER" in txt or "[PFLICHTANGABE FEHLT]" in txt or 'name="robots" content="noindex' in txt):
            errors.append(f"{file.name}: legally blocked for publication")
    for source, parser in pages.items():
        for href, attrs in parser.refs:
            u = urlsplit(href)
            if u.scheme in ("https","http"):
                if u.scheme != "https":
                    errors.append(f"{source}: insecure external link")
                if attrs.get("target") == "_blank" and not {"noopener","noreferrer"}.issubset(set(attrs.get("rel","").split())):
                    errors.append(f"{source}: unsafe new tab")
                continue
            if u.scheme or u.netloc:
                errors.append(f"{source}: unsupported scheme in {href}")
                continue
            target = (root / source).parent / u.path if u.path else root / source
            target = target.resolve()
            if not target.is_relative_to(root) or not target.exists():
                errors.append(f"{source}: invalid path {href}")
            elif u.fragment and target.suffix == ".html":
                other = pages.get(target.name)
                if other is None or u.fragment not in other.ids:
                    errors.append(f"{source}: missing anchor {href}")
    index = (root/"index.html")
    if index.exists():
        txt = index.read_text(encoding="utf-8")
        for token in ("rechtliches.html","Echoes of Aurion","Projekt in Entwicklung","Konzeptillustration"):
            if token not in txt:
                errors.append(f"index missing: {token}")
    return errors

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("preview","release"), default="preview")
    args = parser.parse_args()
    errors = validate("public-site", release=args.mode == "release")
    for error in errors: print("ERROR:",error)
    if errors: raise SystemExit(1)
    print("AURION_SITE_OK", args.mode)
if __name__ == "__main__": main()
