"""
Keep shared copy (e.g. the "who we are" intro) identical across hand-written
pages. The text lives once in data/site-copy.json; a page marks where it goes:

    <!-- site-copy:intro -->
    ...replaced on every build...
    <!-- /site-copy:intro -->

Each entry in the JSON is a list of paragraphs (HTML allowed). They are written
as <p> elements; add a class after the key to style them per page:

    <!-- site-copy:intro class="hero-text" -->
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COPY_FILE = ROOT / "data" / "site-copy.json"

# Generated or third-party trees never carry markers.
SKIP_DIRS = {".git", ".venv", "node_modules", "events", "__pycache__"}

BLOCK = re.compile(
    r"(?P<indent>[ \t]*)<!-- site-copy:(?P<key>[\w-]+)(?P<attrs>[^>]*?) -->\n"
    r".*?"
    r"[ \t]*<!-- /site-copy:(?P=key) -->",
    re.S,
)
CLASS_ATTR = re.compile(r'class="([^"]*)"')


def load_copy() -> dict[str, list[str]]:
    with COPY_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def html_pages() -> list[Path]:
    pages = []
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT)
        if not SKIP_DIRS.intersection(rel.parts):
            pages.append(path)
    return pages


def render(text: str, copy: dict[str, list[str]], where: str, errors: list[str]) -> str:
    def replace(m: re.Match) -> str:
        key, indent, attrs = m["key"], m["indent"], m["attrs"]
        if key not in copy:
            errors.append(f"[{where}] unknown site-copy key '{key}' (not in data/site-copy.json)")
            return m.group(0)
        cls = CLASS_ATTR.search(attrs)
        p_open = f'<p class="{cls.group(1)}">' if cls else "<p>"
        body = "".join(f"{indent}{p_open}{para}</p>\n" for para in copy[key])
        return (
            f"{indent}<!-- site-copy:{key}{attrs} -->\n"
            f"{body}"
            f"{indent}<!-- /site-copy:{key} -->"
        )

    return BLOCK.sub(replace, text)


def build_site_copy() -> tuple[dict[Path, str], list[str]]:
    """Return {page: expected text} for every page with markers, plus errors."""
    copy = load_copy()
    errors: list[str] = []
    out: dict[Path, str] = {}
    for path in html_pages():
        text = path.read_text(encoding="utf-8")
        if "<!-- site-copy:" not in text:
            continue
        where = str(path.relative_to(ROOT))
        opened = len(re.findall(r"<!-- site-copy:", text))
        closed = len(re.findall(r"<!-- /site-copy:", text))
        if opened != closed or opened != len(BLOCK.findall(text)):
            errors.append(f"[{where}] unbalanced site-copy markers")
            continue
        out[path] = render(text, copy, where, errors)
    return out, errors
