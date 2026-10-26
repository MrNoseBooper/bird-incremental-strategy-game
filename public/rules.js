// Waxwing Grove rules: production, placement and saves. Pure functions (no DOM) so they can be tested
// with `node --test tests/`. The numbers and text come from the catalog served by api/catalog.py.

const around = (r, keep) => {
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if ((dx || dy) && keep(dx, dy)) out.push([dx, dy]);
  return out;
};
const straight = (dx, dy) => !dx || !dy;

export const SHAPES = {
  ring: around(1, () => true),
  cross: around(1, straight),
  plus2: around(2, straight),
  area2: around(2, () => true),
  line: around(11, straight), // whole row and column on grids up to 12 wide
};

export function prepare(cat) {
  cat.piece = Object.fromEntries(cat.pieces.map(p => [p.id, p]));
  return cat;
}

export const newState = cat => ({
  seeds: cat.start.seeds, earned: 0, feathers: 0,
  cells: Array(cat.maxSize ** 2).fill(null), treats: {}, upgrades: {}, savedAt: 0,
  frenzy: 0, goal: 0, stats: { taps: 0, caught: 0, hatched: 0 },
});

const bonus = (s, cat, effect) =>
  cat.upgrades.reduce((sum, u) => sum + (u.effect === effect ? (s.upgrades[u.id] || 0) * (u.amount ?? 1) : 0), 0);

export const gridSize = (s, cat) => Math.min(cat.maxSize, cat.start.size + bonus(s, cat, 'size'));
export const isOpen = (s, cat, i) => i % cat.maxSize < gridSize(s, cat) && Math.floor(i / cat.maxSize) < gridSize(s, cat);
export const wallet = p => p.currency || 'seeds';
export const owned = (s, id) => s.cells.filter(c => c?.id === id).length;
export const price = (p, n) => Math.ceil(p.cost * p.growth ** n);
export const treatPrice = (cat, p, level) => Math.ceil(p.cost * cat.treat.cost * cat.treat.growth ** level);
// undefined once a fixed-price upgrade is maxed out
export const upgradePrice = (u, level) => (u.costs ? u.costs[level] : Math.ceil(u.cost * u.growth ** level));

// Size of the connected same-species group (up/down/left/right) each cell belongs to.
function groupSizes(cells, N, at) {
  const size = cells.map(() => 0);
  cells.forEach((c, i) => {
    if (!c || size[i]) return;
    const members = [i];
    size[i] = -1;
    for (let k = 0; k < members.length; k++) {
      const x = members[k] % N, y = (members[k] - x) / N;
      for (const [dx, dy] of SHAPES.cross) {
        const j = (y + dy) * N + x + dx;
        if (at(x + dx, y + dy)?.id === c.id && !size[j]) {
          size[j] = -1;
          members.push(j);
        }
      }
    }
    for (const j of members) size[j] = members.length;
  });
  return size;
}

// Lookup for the open grove: undefined off-grid or in the thicket, null for an empty tile.
function cellAt(s, cat) {
  const N = cat.maxSize, size = gridSize(s, cat);
  return (x, y) => (x >= 0 && y >= 0 && x < size && y < size ? s.cells[y * N + x] : undefined);
}

export const largestFlock = (s, cat, id) =>
  Math.max(0, ...groupSizes(s.cells, cat.maxSize, cellAt(s, cat)).filter((n, i) => s.cells[i]?.id === id));

// Seeds per second for every cell, with a labelled breakdown of where each bird's bonuses come from.
export function evaluate(s, cat) {
  const N = cat.maxSize, cells = s.cells, at = cellAt(s, cat);
  const isBird = c => !!c && cat.piece[c.id].kind === 'bird';
  const out = cells.map(() => ({ rate: 0, mult: 1, parts: {}, egg: 0 }));
  const add = (i, label, amount) => {
    if (amount) out[i].parts[label] = (out[i].parts[label] || 0) + amount;
  };
  const flock = groupSizes(cells, N, at);
  cells.forEach((c, i) => {
    if (!c) return;
    const p = cat.piece[c.id], x = i % N, y = (i - x) / N;
    const grown = p.grow ? Math.min(1, (c.age || 0) / p.grow) : 1;
    const near = shape => SHAPES[shape].map(([dx, dy]) => [(y + dy) * N + x + dx, at(x + dx, y + dy)]).filter(([, t]) => t !== undefined);
    const count = (shape, test) => near(shape).filter(([, t]) => test(t)).length;
    const same = t => t?.id === c.id;
    for (const e of p.effects) {
      if (e.type === 'aura') {
        for (const [j, t] of near(e.shape))
          if (isBird(t) && (e.target === 'birds' || (e.target === 'others' ? t.id !== c.id : e.target.includes(t.id)))) add(j, p.name, e.amount * grown);
      } else if (e.type === 'flock') add(i, 'Flockmates', e.amount * count('cross', same));
      else if (e.type === 'chain') add(i, `Flock of ${flock[i]}`, e.amount * (flock[i] - 1));
      else if (e.type === 'space') add(i, 'Open space', e.amount * count('ring', t => t === null));
      else if (e.type === 'rivals') add(i, 'Rivals', e.amount * count('ring', same));
      else if (e.type === 'mate') add(i, 'Mate', count('ring', same) === 1 ? e.amount : 0);
    }
    if (p.incubate) out[i].egg = (count('ring', isBird) / 8 / p.incubate) * (1 + bonus(s, cat, 'incubate'));
  });
  const seedMult = (1 + bonus(s, cat, 'seeds')) * (s.frenzy > 0 ? cat.frenzy.mult : 1);
  let total = 0;
  cells.forEach((c, i) => {
    if (!isBird(c)) return;
    const o = out[i];
    o.mult = Math.max(0, 1 + Object.values(o.parts).reduce((a, b) => a + b, 0));
    o.rate = cat.piece[c.id].rate * o.mult * cat.treat.mult ** (s.treats[c.id] || 0) * seedMult;
    total += o.rate;
  });
  return { total, cells: out };
}

// Advance one tick: earn seeds, grow trees, warm eggs. Returns the cells whose eggs hatched.
export function step(s, cat, dt) {
  const { total, cells } = evaluate(s, cat), hatched = [];
  s.seeds += total * dt;
  s.earned += total * dt;
  s.frenzy = Math.max(0, s.frenzy - dt);
  s.cells.forEach((c, i) => {
    const p = c && cat.piece[c.id];
    if (p?.grow) c.age = Math.min(p.grow, (c.age || 0) + dt);
    if (p?.incubate) {
      c.egg = (c.egg || 0) + cells[i].egg * dt;
      for (; c.egg >= 1; c.egg--) {
        s.feathers++;
        s.stats.hatched++;
        hatched.push(i);
      }
    }
  });
  return hatched;
}

// Long gaps (offline time) run in chunks so trees that mature part-way through still count.
export function advance(s, cat, seconds) {
  const hatched = [];
  for (let left = seconds; left > 0;) {
    const dt = Math.min(left, 10, s.frenzy > 0 ? s.frenzy : Infinity); // split exactly where a frenzy ends
    hatched.push(...step(s, cat, dt));
    left -= dt;
  }
  return hatched;
}

// Tapping a bird shakes loose a few seconds of its seeds (the per-bird cooldown is the game's pacing).
export function tap(s, cat, i) {
  const c = s.cells[i];
  if (!c || cat.piece[c.id].kind !== 'bird') return 0;
  const gain = Math.max(cat.tap.min, evaluate(s, cat).cells[i].rate * cat.tap.seconds);
  s.seeds += gain;
  s.earned += gain;
  s.stats.taps++;
  return gain;
}

// Catching the Golden Waxwing: `roll` in [0, 1) picks a reward by weight.
export function catchVisitor(s, cat, roll) {
  const list = cat.visitor.rewards;
  let r = roll * list.reduce((sum, x) => sum + x.weight, 0);
  const reward = list.find(x => (r -= x.weight) < 0) || list[list.length - 1];
  s.stats.caught++;
  if (reward.kind === 'frenzy') {
    s.frenzy = cat.frenzy.seconds;
    return { kind: 'frenzy', amount: cat.frenzy.mult };
  }
  if (reward.kind === 'feather') {
    s.feathers++;
    return { kind: 'feather', amount: 1 };
  }
  const gain = Math.max(reward.min, evaluate(s, cat).total * reward.seconds);
  s.seeds += gain;
  s.earned += gain;
  return { kind: 'seeds', amount: gain };
}

// [have, need] for the current goal, or null once every goal is done.
export function goalProgress(s, cat, ev) {
  const g = cat.goals[s.goal];
  if (!g) return null;
  const have = {
    place: () => owned(s, g.id),
    rate: () => ev.total,
    flock: () => largestFlock(s, cat, g.id),
    stat: () => s.stats[g.stat],
    size: () => gridSize(s, cat),
    grown: () => s.cells.filter(c => c?.id === g.id && c.age >= cat.piece[g.id].grow).length,
  }[g.type]();
  return [have, g.need];
}

// Pay out and move on if the current goal is met; returns the finished goal.
export function claimGoal(s, cat, ev) {
  const p = goalProgress(s, cat, ev);
  if (!p || p[0] < p[1]) return null;
  const g = cat.goals[s.goal++];
  s.seeds += g.reward.seeds || 0;
  s.feathers += g.reward.feathers || 0;
  return g;
}

export function buy(s, cat, id, i) {
  const p = cat.piece[id], cost = price(p, owned(s, id));
  if (!isOpen(s, cat, i) || s.cells[i] || s[wallet(p)] < cost) return false;
  s[wallet(p)] -= cost;
  s.cells[i] = { id };
  return true;
}

export function sell(s, cat, i) {
  const c = s.cells[i];
  if (!c) return 0;
  const p = cat.piece[c.id];
  s.cells[i] = null;
  const refund = Math.floor(price(p, owned(s, c.id)) * cat.sellBack);
  s[wallet(p)] += refund;
  return refund;
}

// Move a piece; if the target is occupied the two swap places.
export function move(s, cat, from, to) {
  if (from === to || !s.cells[from] || !isOpen(s, cat, to)) return false;
  [s.cells[from], s.cells[to]] = [s.cells[to], s.cells[from]];
  return true;
}

export function buyTreat(s, cat, id) {
  const level = s.treats[id] || 0, cost = treatPrice(cat, cat.piece[id], level);
  if (s.seeds < cost) return false;
  s.seeds -= cost;
  s.treats[id] = level + 1;
  return true;
}

export function buyUpgrade(s, cat, id) {
  const u = cat.upgrades.find(u => u.id === id), level = s.upgrades[id] || 0, cost = upgradePrice(u, level);
  if (cost === undefined || s.feathers < cost) return false;
  s.feathers -= cost;
  s.upgrades[id] = level + 1;
  return true;
}

// How much seeds/s would change if `change` were applied to a copy of the grid.
export function gainIf(s, cat, change) {
  const trial = { ...s, cells: [...s.cells] };
  change(trial.cells);
  return evaluate(trial, cat).total - evaluate(s, cat).total;
}

export function toSave(s, cat) {
  const N = cat.maxSize;
  const pieces = s.cells.flatMap((c, i) => (c ? [{ ...c, x: i % N, y: Math.floor(i / N) }] : []));
  const { seeds, earned, feathers, treats, upgrades, savedAt, frenzy, goal, stats } = s;
  return { seeds, earned, feathers, treats, upgrades, savedAt, frenzy, goal, stats, pieces };
}

// Saves come from the player's browser storage, so rebuild the state field by field and drop anything odd.
export function fromSave(data, cat) {
  const s = newState(cat), N = cat.maxSize;
  if (!data || typeof data !== 'object') return s;
  const num = v => (Number.isFinite(v) && v >= 0 ? v : 0);
  s.seeds = num(data.seeds);
  s.earned = num(data.earned);
  s.feathers = num(data.feathers);
  s.savedAt = num(data.savedAt);
  s.frenzy = Math.min(num(data.frenzy), cat.frenzy.seconds);
  s.goal = Math.min(Math.floor(num(data.goal)), cat.goals.length);
  for (const k in s.stats) s.stats[k] = Math.floor(num(data.stats?.[k]));
  for (const p of cat.pieces) if (p.kind === 'bird' && data.treats?.[p.id]) s.treats[p.id] = Math.floor(num(data.treats[p.id]));
  for (const u of cat.upgrades) {
    if (data.upgrades?.[u.id]) s.upgrades[u.id] = Math.min(Math.floor(num(data.upgrades[u.id])), u.costs?.length ?? Infinity);
  }
  const size = gridSize(s, cat), onGrid = v => Number.isInteger(v) && v >= 0 && v < size;
  for (const p of Array.isArray(data.pieces) ? data.pieces : []) {
    if (!cat.piece[p?.id] || !onGrid(p.x) || !onGrid(p.y) || s.cells[p.y * N + p.x]) continue;
    const c = { id: p.id };
    if ('age' in p) c.age = num(p.age);
    if ('egg' in p) c.egg = Math.min(num(p.egg), 1);
    s.cells[p.y * N + p.x] = c;
  }
  return s;
}
