#!/usr/bin/env bash
# Local dev server for the PyLadies Kaohsiung site.
#
# Usage:
#     ./scripts/serve.sh                  # serve on http://127.0.0.1:8000
#     PORT=9000 ./scripts/serve.sh        # custom port
#     PAGE=events.html ./scripts/serve.sh # open a specific page in the browser
#
# Press Ctrl-C to stop. Re-running while another server holds the port
# will exit with an "Address already in use" error -- kill the old one
# first (lsof -i :PORT).

set -euo pipefail

PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"
PAGE="${PAGE:-index.html}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://${HOST}:${PORT}/${PAGE}"

cd "$ROOT"

echo "Serving ${ROOT}"
echo "        ${URL}"
echo "Press Ctrl-C to stop."

# macOS: open URL after the server has had a moment to bind.
if command -v open >/dev/null 2>&1; then
  ( sleep 1 && open "$URL" ) &
fi

exec python3 -m http.server "$PORT" --bind "$HOST"
