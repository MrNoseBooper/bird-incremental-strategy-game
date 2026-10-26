"""Run with: python -m unittest discover tests"""
import json
import threading
import unittest
import urllib.request
from http.server import HTTPServer

from api import catalog

EFFECTS = {"aura", "flock", "chain", "space", "rivals", "mate"}  # the types public/rules.js understands
SHAPES = {"ring", "cross", "plus2", "area2", "line"}
GOALS = {"place", "rate", "flock", "stat", "size", "grown"}
STATS = {"taps", "caught", "hatched"}


class CatalogTest(unittest.TestCase):
    def test_pieces_are_well_formed(self):
        ids = [p["id"] for p in catalog.CATALOG["pieces"]]
        self.assertEqual(len(ids), len(set(ids)))
        for p in catalog.CATALOG["pieces"]:
            self.assertIn(p["kind"], {"bird", "item"})
            self.assertGreater(p["cost"], 0)
            self.assertGreater(p["growth"], 1)
            self.assertIn(p.get("currency", "seeds"), {"seeds", "feathers"})
            if p["kind"] == "bird":
                self.assertGreaterEqual(p["rate"], 0)
            for e in p["effects"]:
                self.assertIn(e["type"], EFFECTS)
                if e["type"] == "aura":
                    self.assertIn(e["shape"], SHAPES)
                    self.assertTrue(e["target"] in ("birds", "others") or set(e["target"]) <= set(ids), e)

    def test_goals_are_well_formed(self):
        ids = {p["id"] for p in catalog.CATALOG["pieces"]}
        for g in catalog.CATALOG["goals"]:
            self.assertIn(g["type"], GOALS, g)
            self.assertGreater(g["need"], 0, g)
            self.assertTrue(g["reward"].get("seeds", 0) > 0 or g["reward"].get("feathers", 0) > 0, g)
            if "id" in g:
                self.assertIn(g["id"], ids, g)
            if g["type"] == "stat":
                self.assertIn(g["stat"], STATS, g)

    def test_endpoint_serves_the_catalog_as_json(self):
        server = HTTPServer(("127.0.0.1", 0), catalog.handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{server.server_port}/api/catalog") as res:
                self.assertEqual(res.headers["Content-Type"], "application/json")
                self.assertEqual(json.load(res), catalog.CATALOG)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
