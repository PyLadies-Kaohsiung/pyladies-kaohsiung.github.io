#!/usr/bin/env python3
"""
Static dev server that tells the browser not to cache anything, so a plain
reload always picks up edited HTML / CSS / JS on the same port.

Usage:
    python3 scripts/dev_server.py [PORT] [HOST]   # default 8000 127.0.0.1
"""

from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # Never answer 304 Not Modified: always send the current file.
    def send_head(self):
        for h in ("If-Modified-Since", "If-None-Match"):
            if h in self.headers:
                del self.headers[h]
        return super().send_head()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with ThreadingHTTPServer((host, port), handler) as httpd:
        print(f"Serving {ROOT} at http://{host}:{port}/ (no-cache)", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
