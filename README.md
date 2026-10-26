# Waxwing Grove

A cozy pixel-art bird incremental strategy game. Your birds gather seeds every second, and where you place them decides how
many: sparrows love company, robins want room, chickadees lead mixed flocks, and Bohemian waxwings chain into great flocks
around fruiting rowan trees. Rare Golden Feathers hatch from nest boxes kept warm by the birds around them, and buy the best
upgrades.

## Play locally

```
python dev_server.py        # then open http://127.0.0.1:8000
```

No dependencies: Python 3.9+ standard library only. The dev server mirrors Vercel's routing (static `public/` plus `/api`).

## Tests

```
node --test tests/
python -m unittest discover tests
```

## Deploy to Vercel

Import the repository in Vercel (no build step or settings needed), or run `vercel` / `vercel --prod` with the Vercel CLI.

- `public/` is served as static files (`vercel.json` sets it as the output directory).
- `api/catalog.py` becomes the Python serverless function at `/api/catalog`.

## Where things live

| File | What it holds |
| --- | --- |
| `api/catalog.py` | Every bird, item, price and bonus. Edit numbers here to rebalance. |
| `public/rules.js` | How bonuses combine: production, purchases, offline progress, save validation. |
| `public/sprites.js` | Pixel art and animation clips (every pose is its own frame). |
| `public/game.js` | Drawing, input, shop and info panels, autosave. |
| `dev_server.py` | Local server for development. |

## Saving

Progress autosaves to the browser's local storage every 5 seconds and whenever the tab is hidden or closed. Your flock keeps
gathering for up to 12 hours while you're away.
