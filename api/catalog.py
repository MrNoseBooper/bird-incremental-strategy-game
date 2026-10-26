"""Waxwing Grove content and balance, served to the game at GET /api/catalog.

Tweak numbers here; public/rules.js decides how they combine. Effect types:
  aura    boosts birds in `shape` around the piece (target: "birds", "others" = other species, or a list of ids)
  flock   + per same-species bird directly beside it (up, down, left, right)
  chain   + per other member of its connected same-species flock
  space   + per empty tile touching it
  rivals  + (negative) per same-species bird touching it
  mate    + when exactly one same-species bird touches it
Shapes: ring (the 8 touching tiles), cross (4 sides), plus2 (straight lines 2 tiles out), area2 (5x5), line (row and column).
Items with `grow` reach full strength after that many seconds; `incubate` is seconds per Golden Feather with 8 birds around.
"""
import json
from http.server import BaseHTTPRequestHandler


def aura(shape, amount, target="birds"):
    return {"type": "aura", "shape": shape, "amount": amount, "target": target}


CATALOG = {
    "start": {"seeds": 25, "size": 4},
    "maxSize": 6,
    "offlineHours": 12,
    "sellBack": 0.5,
    "treat": {"cost": 40, "growth": 9, "mult": 2},
    "pieces": [
        {"id": "sparrow", "name": "House Sparrow", "kind": "bird", "cost": 10, "growth": 1.15, "rate": 0.5,
         "treat": "Millet Spray", "effects": [{"type": "flock", "amount": 0.25}],
         "desc": "+25% for each sparrow right beside it (up, down, left, right).",
         "fact": "House sparrows have lived alongside people for at least 10,000 years."},
        {"id": "chickadee", "name": "Black-capped Chickadee", "kind": "bird", "cost": 120, "growth": 1.15, "rate": 4,
         "treat": "Suet Cake", "effects": [aura("ring", 0.25, "others")],
         "desc": "Flock leader: +25% to every touching bird of another species (diagonals count).",
         "fact": "Chickadees hide thousands of seeds each autumn and remember where they put them."},
        {"id": "robin", "name": "European Robin", "kind": "bird", "cost": 1300, "growth": 1.15, "rate": 30,
         "treat": "Mealworms", "effects": [{"type": "space", "amount": 0.3}, {"type": "rivals", "amount": -0.5}],
         "desc": "Likes room: +30% per empty touching tile, but -50% per touching robin.",
         "fact": "Robins guard their patch all year and are among the few birds that sing through winter."},
        {"id": "goldfinch", "name": "American Goldfinch", "kind": "bird", "cost": 14000, "growth": 1.15, "rate": 200,
         "treat": "Nyjer Seed", "effects": [],
         "desc": "Seed lover: every touching Sunflower Patch gives it +100% more.",
         "fact": "Goldfinches are strict vegetarians; even their chicks are raised on seeds."},
        {"id": "cardinal", "name": "Northern Cardinal", "kind": "bird", "cost": 160000, "growth": 1.15, "rate": 1500,
         "treat": "Safflower Seed", "effects": [{"type": "mate", "amount": 0.75}],
         "desc": "+75% when exactly one other cardinal touches it. Feeders give cardinals extra.",
         "fact": "Cardinal pairs stay together all year, and the male often feeds his mate beak to beak."},
        {"id": "waxwing", "name": "Bohemian Waxwing", "kind": "bird", "cost": 2000000, "growth": 1.15, "rate": 11000,
         "treat": "Juniper Berries", "effects": [{"type": "chain", "amount": 0.2}],
         "desc": "+20% for every other waxwing in its connected flock. Fruiting rowans give +100%.",
         "fact": "Named for the red, wax-like tips on its wing feathers. In lean winters, huge flocks "
                 "'irrupt' far south in search of berries, passing them beak to beak."},
        {"id": "owl", "name": "Snowy Owl", "kind": "bird", "currency": "feathers", "cost": 6, "growth": 2, "rate": 0,
         "effects": [aura("line", 0.6), aura("ring", -0.5)],
         "desc": "+60% to every bird in its row and column, but -50% to birds touching it. They're nervous.",
         "fact": "Snowy owls hunt by day in the endless light of the Arctic summer."},
        {"id": "feeder", "name": "Bird Feeder", "kind": "item", "cost": 300, "growth": 1.6,
         "effects": [aura("ring", 0.3), aura("ring", 0.8, ["cardinal"])],
         "desc": "+30% to every touching bird. Cardinals get +80% more."},
        {"id": "nest", "name": "Nest Box", "kind": "item", "cost": 2500, "growth": 8, "incubate": 900, "effects": [],
         "desc": "Touching birds keep its egg warm. It hatches a Golden Feather every 15 min with 8 birds around it."},
        {"id": "sunflower", "name": "Sunflower Patch", "kind": "item", "cost": 4000, "growth": 1.6,
         "effects": [aura("ring", 0.15), aura("ring", 1.0, ["goldfinch"])],
         "desc": "+15% to touching birds. Goldfinches get +100% more."},
        {"id": "bath", "name": "Birdbath", "kind": "item", "cost": 30000, "growth": 1.6,
         "effects": [aura("plus2", 0.4)],
         "desc": "+40% to birds up to 2 tiles away in a straight line."},
        {"id": "rowan", "name": "Rowan Tree", "kind": "item", "cost": 600000, "growth": 1.6, "grow": 600,
         "effects": [aura("ring", 1.0, ["waxwing"]), aura("ring", 0.3, ["robin"])],
         "desc": "Grows for 10 min, then fruits: +100% to touching waxwings and +30% to robins. Weaker while young."},
        {"id": "goldfeeder", "name": "Golden Feeder", "kind": "item", "currency": "feathers", "cost": 4, "growth": 2,
         "effects": [aura("area2", 0.5)],
         "desc": "+50% to every bird within 2 tiles."},
    ],
    "upgrades": [
        {"id": "thicket", "name": "Clear the Thicket", "costs": [2, 8], "effect": "size",
         "desc": "Push back the brambles: the grove grows to 5x5, then 6x6."},
        {"id": "sunny", "name": "Sunny Days", "cost": 2, "growth": 2, "effect": "seeds", "amount": 0.25,
         "desc": "+25% seeds from every bird."},
        {"id": "warm", "name": "Warm Nests", "cost": 3, "growth": 2.5, "effect": "incubate", "amount": 0.5,
         "desc": "Eggs hatch 50% faster."},
    ],
}

BODY = json.dumps(CATALOG).encode()


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(BODY)))
        self.send_header("Cache-Control", "public, max-age=0, s-maxage=3600")  # edge-cached; redeploys clear it
        self.end_headers()
        self.wfile.write(BODY)
