// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as R from '../public/rules.js';
import { SPRITES } from '../public/sprites.js';

const bird = (id, effects = []) => ({ id, name: id, kind: 'bird', cost: 10, growth: 1.5, rate: 1, effects });
const aura = (shape, amount, target = 'birds') => ({ type: 'aura', shape, amount, target });
const cat = R.prepare({
  start: { seeds: 100, size: 6 }, maxSize: 6, sellBack: 0.5, treat: { cost: 40, growth: 9, mult: 2 },
  pieces: [
    bird('sparrow', [{ type: 'flock', amount: 0.25 }]),
    bird('chickadee', [aura('ring', 0.25, 'others')]),
    bird('robin', [{ type: 'space', amount: 0.3 }, { type: 'rivals', amount: -0.5 }]),
    bird('cardinal', [{ type: 'mate', amount: 0.75 }]),
    bird('waxwing', [{ type: 'chain', amount: 0.2 }]),
    { id: 'feeder', name: 'Feeder', kind: 'item', cost: 10, growth: 2, effects: [aura('ring', 0.3), aura('ring', 0.8, ['cardinal'])] },
    { id: 'rowan', name: 'Rowan', kind: 'item', cost: 10, growth: 2, grow: 100, effects: [aura('ring', 1, ['waxwing'])] },
    { id: 'nest', name: 'Nest', kind: 'item', cost: 10, growth: 2, incubate: 80, effects: [] },
  ],
  upgrades: [
    { id: 'thicket', costs: [3, 10], effect: 'size' },
    { id: 'sunny', cost: 2, growth: 2, effect: 'seeds', amount: 0.25 },
  ],
  tap: { seconds: 3, min: 1, cooldown: 5 },
  frenzy: { mult: 3, seconds: 30 },
  visitor: { every: [60, 150], stay: 9, rewards: [{ kind: 'seeds', seconds: 90, min: 30, weight: 6 }, { kind: 'frenzy', weight: 3 }, { kind: 'feather', weight: 1 }] },
  goals: [
    { text: 'Own 2 sparrows', type: 'place', id: 'sparrow', need: 2, reward: { seeds: 10 } },
    { text: 'Flock of 3 waxwings', type: 'flock', id: 'waxwing', need: 3, reward: { feathers: 1 } },
    { text: 'Tap a bird', type: 'stat', stat: 'taps', need: 1, reward: { seeds: 5 } },
  ],
});

// Build a grove from a little map, one letter per tile.
const KEY = { s: 'sparrow', c: 'chickadee', r: 'robin', d: 'cardinal', w: 'waxwing', f: 'feeder', t: 'rowan', n: 'nest' };
function grove(...rows) {
  const s = R.newState(cat);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (KEY[ch]) s.cells[y * 6 + x] = { id: KEY[ch] }; }));
  return s;
}
const mult = (s, x, y) => R.evaluate(s, cat).cells[y * 6 + x].mult;

test('sparrows get +25% per side neighbour, diagonals do not count', () => {
  const s = grove('ss', '.s');
  assert.equal(mult(s, 0, 0), 1.25);
  assert.equal(mult(s, 1, 0), 1.5);
});

test('chickadees boost other species only', () => {
  const s = grove('cs', 'cc');
  assert.equal(mult(s, 1, 0), 1.75);
  assert.equal(mult(s, 0, 0), 1);
});

test('robins want empty space and dislike rivals', () => {
  assert.equal(mult(grove('r'), 0, 0), 1.9);
  assert.ok(Math.abs(mult(grove('rr'), 0, 0) - 1.1) < 1e-9);
});

test('cardinals need exactly one partner', () => {
  assert.equal(mult(grove('dd'), 0, 0), 1.75);
  assert.equal(mult(grove('ddd'), 1, 0), 1);
});

test('waxwings chain through connected flockmates but not diagonals', () => {
  assert.ok(Math.abs(mult(grove('www', '..w'), 0, 0) - 1.6) < 1e-9);
  assert.equal(mult(grove('w.', '.w'), 0, 0), 1);
});

test('auras stack and can target one species', () => {
  assert.equal(mult(grove('sf'), 0, 0), 1.3);
  assert.equal(mult(grove('df'), 0, 0), 2.1);
});

test('rowan boost scales with growth', () => {
  const s = grove('wt');
  s.cells[1].age = 50;
  assert.equal(mult(s, 0, 0), 1.5);
  R.advance(s, cat, 500);
  assert.equal(s.cells[1].age, 100);
  assert.equal(mult(s, 0, 0), 2);
});

test('nests hatch golden feathers faster with more birds around', () => {
  const full = grove('sss', 'sns', 'sss');
  assert.deepEqual(R.advance(full, cat, 80), [7]);
  assert.equal(full.feathers, 1);
  const sparse = grove('sn');
  R.advance(sparse, cat, 80 * 8 - 1);
  assert.equal(sparse.feathers, 0);
});

test('treats and upgrades multiply seed income', () => {
  const s = grove('s');
  s.treats.sparrow = 2;
  s.upgrades.sunny = 1;
  assert.equal(R.evaluate(s, cat).total, 5);
  R.step(s, cat, 2);
  assert.equal(s.seeds, 110);
});

test('buying raises the price, selling refunds half, bad placements fail', () => {
  const s = R.newState(cat);
  assert.ok(R.buy(s, cat, 'sparrow', 0));
  assert.ok(R.buy(s, cat, 'sparrow', 1));
  assert.equal(s.seeds, 75);
  assert.equal(R.sell(s, cat, 1), 7);
  assert.equal(s.seeds, 82);
  assert.equal(R.buy(s, cat, 'sparrow', 0), false);
  s.seeds = 0;
  assert.equal(R.buy(s, cat, 'sparrow', 2), false);
});

test('the grove starts small and the thicket upgrade opens it up', () => {
  const small = { ...cat, start: { seeds: 100, size: 4 } };
  const s = R.newState(small);
  assert.equal(R.buy(s, small, 'sparrow', 4), false);
  s.feathers = 3;
  assert.ok(R.buyUpgrade(s, small, 'thicket'));
  assert.ok(R.buy(s, small, 'sparrow', 4));
  s.feathers = 99;
  assert.ok(R.buyUpgrade(s, small, 'thicket'));
  assert.equal(R.buyUpgrade(s, small, 'thicket'), false);
  assert.equal(R.gridSize(s, small), 6);
});

test('moving swaps pieces and previews report the change', () => {
  const s = grove('s.s');
  assert.equal(R.gainIf(s, cat, cells => { cells[1] = { id: 'sparrow' }; }), 2);
  assert.ok(R.move(s, cat, 2, 1));
  assert.equal(s.cells[2], null);
  assert.equal(mult(s, 1, 0), 1.25);
});

test('tapping a bird shakes loose a few seconds of its seeds', () => {
  const s = grove('ssf');
  assert.equal(R.tap(s, cat, 0), 3.75);
  assert.equal(R.tap(s, cat, 2), 0);
  assert.equal(s.seeds, 103.75);
  assert.equal(s.stats.taps, 1);
});

test('a frenzy multiplies income and ends exactly on time, even offline', () => {
  const s = grove('s');
  s.frenzy = 25;
  assert.equal(R.evaluate(s, cat).total, 3);
  R.advance(s, cat, 40);
  assert.equal(s.frenzy, 0);
  assert.equal(s.seeds, 100 + 25 * 3 + 15);
});

test('catching the visitor picks a reward by weight', () => {
  const s = grove('s');
  assert.deepEqual(R.catchVisitor(s, cat, 0), { kind: 'seeds', amount: 90 });
  assert.deepEqual(R.catchVisitor(s, cat, 0.65), { kind: 'frenzy', amount: 3 });
  assert.equal(s.frenzy, 30);
  assert.deepEqual(R.catchVisitor(s, cat, 0.95), { kind: 'feather', amount: 1 });
  assert.equal(s.feathers, 1);
  assert.equal(s.stats.caught, 3);
});

test('goals track progress and pay out in order', () => {
  const s = grove('s'), ev = () => R.evaluate(s, cat);
  assert.deepEqual(R.goalProgress(s, cat, ev()), [1, 2]);
  assert.equal(R.claimGoal(s, cat, ev()), null);
  s.cells[1] = { id: 'sparrow' };
  assert.equal(R.claimGoal(s, cat, ev()).text, 'Own 2 sparrows');
  assert.equal(s.seeds, 110);
  s.cells[6] = { id: 'waxwing' };
  s.cells[7] = { id: 'waxwing' };
  s.cells[14] = { id: 'waxwing' }; // diagonal, not part of the flock
  assert.deepEqual(R.goalProgress(s, cat, ev()), [2, 3]);
  s.cells[13] = { id: 'waxwing' };
  assert.ok(R.claimGoal(s, cat, ev()));
  assert.equal(s.feathers, 1);
  R.tap(s, cat, 0);
  assert.ok(R.claimGoal(s, cat, ev()));
  assert.equal(R.goalProgress(s, cat, ev()), null);
});

test('saves round-trip and junk is dropped', () => {
  const s = grove('sw', '.t');
  s.seeds = 12.5;
  s.cells[7].age = 30;
  s.upgrades.sunny = 2;
  Object.assign(s, { frenzy: 12, goal: 2, stats: { taps: 4, caught: 1, hatched: 3 } });
  const back = R.fromSave(JSON.parse(JSON.stringify(R.toSave(s, cat))), cat);
  assert.deepEqual(back, s);

  const junk = R.fromSave({
    seeds: -5, feathers: 'lots', upgrades: { thicket: 99 }, treats: { feeder: 3 },
    frenzy: 1e9, goal: 99, stats: { taps: -3, caught: 2.7 },
    pieces: [{ id: 'dragon', x: 0, y: 0 }, { id: 'sparrow', x: 9, y: 0 }, { id: 'sparrow', x: 1.5, y: 0 }, null,
      { id: 'sparrow', x: 2, y: 2, age: -1 }, { id: 'robin', x: 2, y: 2 }],
  }, cat);
  assert.equal(junk.seeds, 0);
  assert.equal(junk.feathers, 0);
  assert.equal(junk.frenzy, 30);
  assert.equal(junk.goal, 3);
  assert.deepEqual(junk.stats, { taps: 0, caught: 2, hatched: 0 });
  assert.deepEqual(junk.upgrades, { thicket: 2 });
  assert.deepEqual(junk.treats, {});
  assert.deepEqual(junk.cells.filter(Boolean), [{ id: 'sparrow', age: 0 }]);
  assert.deepEqual(R.fromSave('garbage', cat), R.newState(cat));
});

test('real catalog: every piece has art and a packed grove gives finite income', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const json = execFileSync(process.env.PYTHON || 'python', ['-c', 'import json; from api.catalog import CATALOG; print(json.dumps(CATALOG))'], { cwd: root });
  const real = R.prepare(JSON.parse(json));
  for (const p of real.pieces) assert.ok(SPRITES[p.id], `missing sprite for ${p.id}`);
  const s = R.newState(real);
  s.upgrades.thicket = 2;
  s.cells = s.cells.map((_, i) => ({ id: real.pieces[i % real.pieces.length].id, age: 1e9 }));
  const ev = R.evaluate(s, real);
  assert.ok(Number.isFinite(ev.total) && ev.total > 0);
  assert.ok(ev.cells.every(c => Number.isFinite(c.mult) && c.mult >= 0));
  for (s.goal = 0; s.goal < real.goals.length; s.goal++) {
    const [have, need] = R.goalProgress(s, real, ev);
    assert.ok(Number.isFinite(have) && need > 0, real.goals[s.goal].text);
  }
});
