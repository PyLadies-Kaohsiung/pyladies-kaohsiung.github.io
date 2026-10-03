# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10"]
# ///
"""
Resize chapter logos for the logo game into game/logos/{id}.webp.

Source files are named after the chapter `name` in game/chapters.json
(e.g. "Kaohsiung, Taiwan.png"), as downloaded from pyladies/pyladies.

Usage:
    uv run scripts/game_logos.py SOURCE_DIR              # convert all logos
    uv run scripts/game_logos.py SOURCE_DIR --only manila-philippines
"""

import argparse
import html
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "game"
MAX_SIZE = 480
QUALITY = 82


def find_sources(source_dir: Path) -> dict[str, Path]:
    """Map unescaped file stem -> path ("CDMX, M&eacute;xico.png" -> "CDMX, México")."""
    return {
        html.unescape(p.stem): p
        for p in source_dir.iterdir()
        if p.is_file() and not p.name.startswith(".")
    }


def convert(src: Path, dst: Path) -> None:
    with Image.open(src) as im:
        im = im.convert("RGBA")
        im.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, "WEBP", quality=QUALITY, method=6)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--only", nargs="+", metavar="ID", help="chapter ids to convert")
    args = parser.parse_args()

    chapters = json.loads((GAME / "chapters.json").read_text(encoding="utf-8"))
    sources = find_sources(args.source_dir)

    missing = []
    for ch in chapters:
        if args.only and ch["id"] not in args.only:
            continue
        src = sources.get(ch["name"])
        if src is None:
            missing.append(ch["name"])
            continue
        convert(src, GAME / ch["logo"])

    total = sum(p.stat().st_size for p in (GAME / "logos").glob("*.webp"))
    print(f"game/logos: {total / 1024 / 1024:.1f} MB")
    if missing:
        raise SystemExit("missing source logos:\n  " + "\n  ".join(missing))


if __name__ == "__main__":
    main()
