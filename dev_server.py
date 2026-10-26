"""Run Waxwing Grove locally the way Vercel serves it: public/ as static files plus the /api functions.

    python dev_server.py [port]      ->  http://127.0.0.1:8000
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from api import catalog

ROUTES = {"/api/catalog": catalog.handler}


class DevHandler(SimpleHTTPRequestHandler):
    # Windows can map .js to text/plain via the registry, which browsers refuse for ES modules
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def do_GET(self):
        route = ROUTES.get(self.path.split("?")[0])
        if route:
            return route.do_GET(self)
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # always serve fresh files while developing
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    public = Path(__file__).parent / "public"
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(DevHandler, directory=str(public)))
    print(f"Waxwing Grove is running at http://127.0.0.1:{port}  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
