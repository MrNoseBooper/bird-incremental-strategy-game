// Waxwing Grove client: drawing, animation, input, shop UI and autosave. Rules live in rules.js, pixel
// art in sprites.js, and the birds, prices and effects come from the Python API at /api/catalog.
import { SPRITES, TILE, rasterize } from './sprites.js';
import * as R from './rules.js';

const SAVE_KEY = 'waxwing-grove-save';
const CATALOG_KEY = 'waxwing-grove-catalog';
const MARGIN = 6; // art pixels of hedge around the grid, so hopping birds aren't clipped
const ICON_FRAME = { sunflower: 'b', bath: 'a', rowan: 'fruit' };
const CURRENCY = { seeds: 'seeds', feathers: 'Golden Feathers' };
const MUTE_KEY = 'waxwing-grove-muted';
const DAY = 480; // seconds for one day/night cycle
const FLY = 0.7; // seconds a newly bought bird takes to swoop in
const $ = sel => document.querySelector(sel);

async function loadCatalog() {
  try {
    const res = await fetch('/api/catalog');
    if (!res.ok) throw new Error(`catalog request failed: ${res.status}`);
    const data = await res.json();
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify(data)); } catch {}
    return data;
  } catch (err) {
    // offline or the API hiccuped: fall back to the last catalog this browser saw
    let cached = null;
    try { cached = localStorage.getItem(CATALOG_KEY); } catch {}
    if (cached) return JSON.parse(cached);
    throw err;
  }
}

let cat;
try {
  cat = R.prepare(await loadCatalog());
} catch (err) {
  $('#boot').textContent = "The grove couldn't load its bird guide. Check your connection and reload the page.";
  throw err;
}
$('#boot').remove();

const N = cat.maxSize, SIDE = N * TILE + 2 * MARGIN;
const art = buildArt();
const icons = { seeds: art.seed.idle.toDataURL(), feathers: art.feather.idle.toDataURL() };
const iconUrl = Object.fromEntries(cat.pieces.map(p => [p.id, art[p.id][ICON_FRAME[p.id] || 'idle'].toDataURL()]));
const view = $('#grove'), ctx = view.getContext('2d');
const mascot = { id: 'waxwing' }, mascotCtx = $('#mascot').getContext('2d');
const anims = new WeakMap(), ghosts = {}, particles = [];
const butterflies = ['#f4efe2', '#f2a03a', '#8fc3f0'].map(color => ({ color, x: Math.random() * SIDE, y: Math.random() * SIDE, tx: SIDE / 2, ty: SIDE / 2, t: 0 }));
const fireflies = Array.from({ length: 12 }, () => ({ x: Math.random() * SIDE, y: Math.random() * SIDE, t: Math.random() * 9 }));
let state = load(), last = state.savedAt || Date.now(), lastUi = 0;
let tab = 'birds', placing = null, selected = null, hover = null, drag = null, ground = null, groundSize = 0, saveFailed = false;
let visitor = null, visitorAt = Date.now() + 30e3, goalHtml = '', audio = null, muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch {}

function buildArt() {
  const out = {};
  for (const [id, def] of Object.entries(SPRITES)) {
    out[id] = {};
    for (const [name, rows] of Object.entries(def.frames)) {
      const { width, height, data } = rasterize(rows, def.palette);
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      c.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
      out[id][name] = c;
    }
  }
  return out;
}

// ---------- saving ----------

function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch {}
  if (!raw) return R.newState(cat);
  try {
    return R.fromSave(JSON.parse(raw), cat);
  } catch {
    try { localStorage.setItem(`${SAVE_KEY}-unreadable`, raw); } catch {} // keep a copy rather than overwrite it
    return R.newState(cat);
  }
}

function save() {
  state.savedAt = last; // how far the simulation got, so time spent in a hidden tab still counts as away time
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(R.toSave(state, cat)));
    saveFailed = false;
  } catch {
    if (!saveFailed) toast('This browser is blocking saves, so progress will be lost when you leave.');
    saveFailed = true;
  }
}

// ---------- drawing ----------

const tileXY = i => [MARGIN + (i % N) * TILE, MARGIN + Math.floor(i / N) * TILE];

function fit() {
  const dpr = devicePixelRatio || 1;
  const room = Math.min($('#field').clientWidth, innerHeight - $('header').offsetHeight - 48, 760);
  const scale = Math.max(1, Math.floor((room * dpr) / SIDE)); // whole device pixels per art pixel keeps it crisp
  view.style.width = view.style.height = `${(SIDE * scale) / dpr}px`;
}

const mulberry = a => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function paintGround(size) {
  const g = document.createElement('canvas');
  g.width = g.height = SIDE;
  const c = g.getContext('2d');
  const dot = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  dot(0, 0, SIDE, SIDE, '#23421f');
  const r0 = mulberry(99); // the thicket: overlapping round bushes, a few with berries
  for (let k = 0; k < (SIDE * SIDE) / 14; k++) {
    const x = Math.floor(r0() * SIDE) - 3, y = Math.floor(r0() * SIDE) - 2, leaf = ['#3b6a32', '#447639', '#335e2c'][Math.floor(r0() * 3)];
    dot(x + 1, y, 5, 5, leaf);
    dot(x, y + 1, 7, 3, leaf);
    dot(x + 1, y + 4, 5, 1, '#284d25');
    dot(x + 2, y + 1, 2, 1, '#5d9248');
    if (r0() < 0.12) dot(x + 4, y + 2, 1, 1, '#c0392b');
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const rand = mulberry(y * N + x + 1), ox = MARGIN + x * TILE, oy = MARGIN + y * TILE; // seeded per tile: stable look
    const spot = (h, color) => dot(ox + Math.floor(rand() * TILE), oy + Math.floor(rand() * (TILE - h + 1)), 1, h, color);
    dot(ox, oy, TILE, TILE, (x + y) % 2 ? '#86b95e' : '#7db257');
    for (let k = 0; k < 8; k++) spot(rand() < 0.4 ? 2 : 1, rand() < 0.6 ? '#689b48' : '#a3d277');
    if (rand() < 0.3) spot(1, ['#f4efe2', '#f2c522', '#e98fb4'][Math.floor(rand() * 3)]);
  }
  return g;
}

function animOf(c) {
  if (!anims.has(c)) anims.set(c, { clip: null, k: 0, t: 0, wait: Math.random() * 2, ox: 0 });
  return anims.get(c);
}

function frameOf(c) {
  const def = SPRITES[c.id], p = cat.piece[c.id], a = animOf(c);
  if (def.stages) return [def.stages[Math.floor(Math.min(1, (c.age || 0) / p.grow) * (def.stages.length - 1))], 0];
  if (p.incubate) return [(c.egg || 0) >= 0.8 ? 'glow' : 'idle', 0];
  if (def.loop) return [def.loop[a.k][0], 0];
  if (a.fly) return [Math.floor(a.fly.t * 12) % 2 ? 'flyA' : 'flyB', 0];
  return a.clip ? [a.clip[a.k][0], a.clip[a.k][2] || 0] : ['idle', 0];
}

function drawPiece(c, i, alpha = 1) {
  const [x, y] = tileXY(i), a = animOf(c), [frame, dy] = frameOf(c);
  const k = a.fly ? (1 - a.fly.t / FLY) ** 2 : 0; // eases the swoop-in down to the tile
  ctx.globalAlpha = alpha;
  if (SPRITES[c.id].habits) { // soft shadow, smaller mid-hop or mid-flight
    const w = dy || a.fly ? 6 : 10;
    ctx.fillStyle = 'rgba(25, 45, 20, 0.3)';
    ctx.fillRect(x + a.ox + 8 - w / 2, y + 14, w, 2);
  }
  ctx.drawImage(art[c.id][frame], Math.round(x - 1 + a.ox + (a.fly?.dx || 0) * k), Math.round(y - 1 + dy + (a.fly?.dy || 0) * k));
  if (cat.piece[c.id].incubate) { // warmth gauge beside the nest box
    const h = Math.round((c.egg || 0) * 10);
    ctx.fillStyle = '#3a2618';
    ctx.fillRect(x + 1, y + 4, 2, 10);
    ctx.fillStyle = '#f2c522';
    ctx.fillRect(x + 1, y + 14 - h, 2, h);
  }
  ctx.globalAlpha = 1;
}

function shade(i, color) {
  const [x, y] = tileXY(i);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, TILE, TILE);
}

function corners(i, color) {
  const [x, y] = tileXY(i), e = TILE - 1;
  ctx.fillStyle = color;
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + e, y, -1, 1], [x, y + e, 1, -1], [x + e, y + e, -1, -1]]) {
    ctx.fillRect(Math.min(cx, cx + 2 * sx), cy, 3, 1);
    ctx.fillRect(cx, Math.min(cy, cy + 2 * sy), 1, 3);
  }
}

// Tiles a piece's auras would reach from tile i, with the bonus each gives.
function auraTiles(id, i) {
  const x = i % N, y = Math.floor(i / N), size = R.gridSize(state, cat);
  return cat.piece[id].effects.filter(e => e.type === 'aura').flatMap(e => R.SHAPES[e.shape]
    .map(([dx, dy]) => [x + dx, y + dy])
    .filter(([a, b]) => a >= 0 && b >= 0 && a < size && b < size)
    .map(([a, b]) => [b * N + a, e.amount]));
}

// The piece being placed or dragged, if it is over a tile it could go on.
function ghostPiece() {
  if (hover == null || !R.isOpen(state, cat, hover)) return null;
  if (placing && !state.cells[hover]) return { id: placing, at: hover, cell: (ghosts[placing] ||= { id: placing }) };
  if (drag?.moved) return { id: state.cells[drag.from].id, at: hover, cell: state.cells[drag.from] };
  return null;
}

function render(dt) {
  const size = R.gridSize(state, cat);
  if (size !== groundSize) [ground, groundSize] = [paintGround(size), size];
  ctx.drawImage(ground, 0, 0);
  const ghost = ghostPiece(), focus = ghost || (selected != null && { id: state.cells[selected].id, at: selected });
  if (focus) for (const [j, amount] of auraTiles(focus.id, focus.at)) shade(j, amount > 0 ? 'rgba(255, 236, 140, 0.4)' : 'rgba(220, 50, 40, 0.35)');
  state.cells.forEach((c, i) => c && !(drag?.moved && drag.from === i) && drawPiece(c, i));
  if (ghost) drawPiece(ghost.cell, ghost.at, 0.65);
  const night = nightness();
  if (night < 0.5) for (const b of butterflies) drawButterfly(b, dt);
  if (visitor) ctx.drawImage(art.goldwax[Math.floor(visitor.t * 10) % 2 ? 'flyA' : 'flyB'], Math.round(visitor.x) - 1, Math.round(visitor.y) - 1);
  if (state.frenzy > 0 && Math.random() < dt * 10) sparkle(Math.floor(Math.random() * N * N));
  drawParticles(dt);
  if (night > 0) {
    ctx.fillStyle = `rgba(18, 22, 64, ${0.4 * night})`;
    ctx.fillRect(0, 0, SIDE, SIDE);
    drawFireflies(dt, night);
  }
  if (hover != null) corners(hover, placing && !ghost ? '#ff6b5a' : '#fff6d8');
  if (selected != null) corners(selected, '#f2c522');
  const [frame, dy] = frameOf(mascot);
  mascotCtx.clearRect(0, 0, 18, 21);
  mascotCtx.drawImage(art.waxwing[frame], 0, 3 + dy);
}

// 0 by day, rising to 1 at midnight; day comes first after every page load.
const nightness = () => Math.max(0, Math.min(1, (0.5 - 0.5 * Math.cos((2 * Math.PI * performance.now()) / 1000 / DAY)) * 1.6 - 0.6));

function drawButterfly(b, dt) {
  b.t += dt;
  const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
  if (d < 2) [b.tx, b.ty] = [Math.random() * SIDE, Math.random() * SIDE];
  else {
    b.x += (dx / d) * 10 * dt;
    b.y += (dy / d) * 10 * dt + Math.sin(b.t * 6) * 8 * dt;
  }
  const x = Math.round(b.x), y = Math.round(b.y), shut = Math.floor(b.t * 9) % 2; // two-frame wing flutter
  ctx.fillStyle = b.color;
  ctx.fillRect(x - 2 + shut, y - 1, 2 - shut, 2);
  ctx.fillRect(x + 1, y - 1, 2 - shut, 2);
  ctx.fillStyle = '#2a1f2d';
  ctx.fillRect(x, y - 1, 1, 2);
}

function drawFireflies(dt, night) {
  for (const f of fireflies.slice(0, Math.round(night * fireflies.length))) {
    f.t += dt;
    f.x = (f.x + Math.sin(f.t * 0.7) * 4 * dt + SIDE) % SIDE;
    f.y = (f.y + Math.cos(f.t * 0.9) * 4 * dt + SIDE) % SIDE;
    if (Math.sin(f.t * 2.3) < 0) continue; // blinking off
    const x = Math.round(f.x), y = Math.round(f.y);
    ctx.fillStyle = 'rgba(220, 255, 120, 0.35)';
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = '#f4ffa8';
    ctx.fillRect(x, y, 1, 1);
  }
}

// ---------- the Golden Waxwing visitor ----------

function tickVisitor(dt) {
  if (!visitor && Date.now() >= visitorAt) {
    visitor = { t: 0, x: -18, y: 0, y0: MARGIN + 4 + Math.random() * (SIDE - 40) };
    sound('gold');
    if (!state.stats.caught) toast('A Golden Waxwing is flying by. Tap it before it leaves!');
  }
  if (!visitor) return;
  visitor.t += dt;
  const k = visitor.t / cat.visitor.stay;
  visitor.x = -18 + (SIDE + 20) * k;
  visitor.y = visitor.y0 + Math.sin(visitor.t * 2.4) * 5;
  if (Math.random() < dt * 10) {
    const sx = visitor.x + 2, sy = visitor.y + 8 + Math.random() * 4;
    spawn(art.spark.idle, 0.5, () => [sx, sy], true);
  }
  if (k >= 1) visitorLeaves();
}

function visitorLeaves() {
  const [lo, hi] = cat.visitor.every;
  visitor = null;
  visitorAt = Date.now() + (lo + Math.random() * (hi - lo)) * 1000;
}

function overVisitor(e) {
  if (!visitor) return false;
  const r = view.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * SIDE, y = ((e.clientY - r.top) / r.height) * SIDE;
  return Math.abs(x - visitor.x - 8) < 13 && Math.abs(y - visitor.y - 8) < 13; // generous: it's a moving target
}

function catchVisitor() {
  const { x, y } = visitor, reward = R.catchVisitor(state, cat, Math.random());
  visitorLeaves();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * 2 * Math.PI;
    spawn(art.spark.idle, 0.7, t => [x + 7 + Math.cos(a) * 14 * t, y + 7 + Math.sin(a) * 14 * t], true);
  }
  sound('catch');
  const text = reward.kind === 'seeds' ? `+${fmt(reward.amount)} seeds`
    : reward.kind === 'frenzy' ? `Frenzy! ×${reward.amount} seeds for ${cat.frenzy.seconds}s` : '+1 Golden Feather';
  floatAt(x + 8, y, text);
  toast(`You caught the Golden Waxwing: ${text}!`);
}

// ---------- sound: tiny synthesized tones, no audio files ----------

const SOUNDS = {
  chirp: (tone, p) => { tone(2400 * p, 3600 * p, 0, 0.06); tone(3200 * p, 2400 * p, 0.08, 0.07); },
  trill: (tone, p) => [0, 0.05, 0.1, 0.15, 0.2].forEach(at => tone(4600 * p, 5600 * p, at, 0.035, 0.035)), // waxwings: thin, high
  hoot: tone => { tone(440, 380, 0, 0.22, 0.09); tone(420, 340, 0.3, 0.32, 0.09); },
  sing: (tone, p) => tone(3000 * p, 3600 * p, 0, 0.05, 0.012),
  buy: tone => { tone(520, 700, 0, 0.07, 0.05, 'triangle'); tone(780, 1040, 0.07, 0.09, 0.05, 'triangle'); },
  nope: tone => tone(220, 160, 0, 0.12, 0.06, 'triangle'),
  gold: tone => [0, 1, 2, 3].forEach(k => tone(1320 * 1.26 ** k, 1320 * 1.26 ** k, k * 0.07, 0.14, 0.04, 'triangle')),
  catch: tone => [523, 659, 784, 1047, 1319].forEach((f, k) => tone(f, f, k * 0.06, 0.16, 0.06, 'triangle')),
  goal: tone => [392, 523, 659, 784].forEach((f, k) => tone(f, f, k * 0.1, 0.2, 0.07, 'triangle')),
};

// Browsers only allow audio after the player taps or presses a key, so the context is made then.
function unlockAudio() {
  try {
    audio ||= new AudioContext();
  } catch {
    return; // no Web Audio here: stay silent
  }
  if (audio.state === 'suspended') audio.resume();
}

function sound(kind) {
  if (muted || audio?.state !== 'running') return;
  const t0 = audio.currentTime;
  SOUNDS[kind]((from, to, at, len, vol = 0.06, type = 'sine') => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t0 + at);
    o.frequency.exponentialRampToValueAtTime(to, t0 + at + len);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    o.connect(g).connect(audio.destination);
    o.start(t0 + at);
    o.stop(t0 + at + len + 0.05);
  }, 0.9 + Math.random() * 0.2);
}

function setMuted(on) {
  muted = on;
  $('#mute').textContent = on ? 'Sound: off' : 'Sound: on';
  $('#mute').setAttribute('aria-pressed', String(!on));
  try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch {}
}

// ---------- animation and effects ----------

function pick(habits) {
  const list = Object.entries(habits);
  let r = Math.random() * list.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, w] of list) if ((r -= w) <= 0) return name;
  return list[0][0];
}

const neighbours = i => R.SHAPES.cross
  .map(([dx, dy]) => [(i % N) + dx, Math.floor(i / N) + dy])
  .filter(([x, y]) => x >= 0 && y >= 0 && x < N && y < N)
  .map(([x, y]) => y * N + x);

function play(c, i, name) {
  const a = animOf(c);
  if (name === 'pass') { // waxwings hand berries down the flock
    const mates = i < 0 ? [] : neighbours(i).filter(j => state.cells[j]?.id === c.id);
    if (mates.length) passBerry(i, mates[Math.floor(Math.random() * mates.length)]);
    else name = 'eat';
  }
  if (name === 'sing' && i >= 0) {
    note(i);
    if (Math.random() < 0.3) sound('sing');
  }
  if (name === 'hop') a.ox = Math.max(-2, Math.min(2, a.ox + (Math.random() < 0.5 ? -1 : 1)));
  Object.assign(a, { clip: SPRITES[c.id].clips[name], k: 0, t: 0 });
}

function tickAnim(c, i, dt) {
  const def = SPRITES[c.id], p = cat.piece[c.id], a = animOf(c);
  if (def.loop) {
    for (a.t += dt; a.t >= def.loop[a.k][1]; a.k = (a.k + 1) % def.loop.length) a.t -= def.loop[a.k][1];
  } else if (a.clip) {
    for (a.t += dt; a.clip && a.t >= a.clip[a.k][1];) {
      a.t -= a.clip[a.k][1];
      if (++a.k === a.clip.length) Object.assign(a, { clip: null, k: 0, t: 0, wait: 0.6 + Math.random() * 2.6 });
    }
  } else if (def.habits && (a.wait -= dt) <= 0) play(c, i, pick(def.habits));
  if (a.fly && (a.fly.t += dt) >= FLY) {
    a.fly = null;
    play(c, i, 'flap');
  }
  if (i >= 0 && p.kind === 'item' && p.currency === 'feathers' && Math.random() < dt * 1.2) sparkle(i);
  if (i >= 0 && p.rate > 0 && (a.pop = (a.pop ?? Math.random() * 4) - dt) <= 0) { // a seed pops up as the bird earns
    const [x, y] = tileXY(i), ox = a.ox;
    a.pop = 2.5 + Math.random() * 3;
    spawn(art.pip.idle, 0.9, t => [x + 7 + ox, y + 1 - 8 * t], true);
  }
}

const spawn = (img, life, path, fade, done) => particles.push({ img, life, path, fade, done, t: 0 });

function drawParticles(dt) {
  for (const p of [...particles]) {
    p.t += dt;
    const k = Math.min(1, p.t / p.life), [x, y] = p.path(k);
    ctx.globalAlpha = p.fade ? Math.min(1, 3 - 3 * k) : 1;
    ctx.drawImage(p.img, Math.round(x), Math.round(y));
    if (k === 1) {
      particles.splice(particles.indexOf(p), 1);
      p.done?.();
    }
  }
  ctx.globalAlpha = 1;
}

function note(i) {
  const [x, y] = tileXY(i);
  spawn(art.note.idle, 1.4, k => [x + 13 + 4 * k, y - 2 - 12 * k + Math.sin(k * 10)], true);
}

function sparkle(i) {
  const [x, y] = tileXY(i), sx = x + Math.random() * 14, sy = y + Math.random() * 12;
  spawn(art.spark.idle, 0.6, () => [sx, sy], true);
}

function passBerry(from, to) {
  const [x0, y0] = tileXY(from), [x1, y1] = tileXY(to), id = state.cells[from].id;
  spawn(art.berry.idle, 0.45, k => [x0 + 14 + (x1 - x0) * k, y0 + 5 + (y1 - y0) * k - 8 * Math.sin(Math.PI * k)], false, () => {
    if (state.cells[to]?.id === id) play(state.cells[to], to, 'catch');
  });
}

function hatch(i) {
  const [x, y] = tileXY(i);
  spawn(art.feather.idle, 1.8, k => [x + 4, y - 14 * k], true);
  floatText(i, '+1 Golden Feather');
  sound('gold');
}

// ---------- text helpers ----------

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (n < 10) return String(Math.floor(n * 10) / 10);
  if (n < 1000) return String(Math.floor(n));
  const e = Math.floor(Math.log10(n) / 3), v = n / 1000 ** e, d = v < 10 ? 2 : v < 100 ? 1 : 0; // 3 significant digits
  return e < UNITS.length ? (Math.floor(v * 10 ** d) / 10 ** d).toFixed(d) + UNITS[e] : n.toExponential(2);
}
const fmtTime = s => (s < 60 ? `${Math.ceil(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
const pct = v => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 4500);
}

// Rising text over the grove at art-pixel position (x, y).
function floatAt(x, y, text) {
  const k = view.clientWidth / SIDE, f = document.createElement('div');
  f.className = 'float';
  f.textContent = text;
  f.style.left = `${x * k}px`;
  f.style.top = `${y * k}px`;
  $('#grove-wrap').append(f);
  setTimeout(() => f.remove(), 1800);
}

function floatText(i, text) {
  const [x, y] = tileXY(i);
  floatAt(x + TILE / 2, y, text);
}

const rewardText = r => [r.seeds && `+${fmt(r.seeds)} seeds`, r.feathers && `+${r.feathers} Golden Feather${r.feathers > 1 ? 's' : ''}`].filter(Boolean).join(' ');

function bought(text) {
  sound('buy');
  toast(text);
}

function broke(wallet) {
  sound('nope');
  toast(`Not enough ${CURRENCY[wallet]}.`);
}
const overgrown = () => toast('That corner is still thicket. Clear it with Golden Feathers in the Golden shop.');

// ---------- shop, info panel and HUD ----------

function entries() {
  const golden = p => R.wallet(p) === 'feathers';
  const piece = p => ({
    icon: iconUrl[p.id], name: p.name, desc: p.desc, wallet: R.wallet(p), cost: R.price(p, R.owned(state, p.id)),
    note: `×${R.owned(state, p.id)}`, active: placing === p.id, act: () => setPlacing(placing === p.id ? null : p.id),
  });
  if (tab === 'birds') return cat.pieces.filter(p => p.kind === 'bird' && !golden(p)).map(piece);
  if (tab === 'garden') return cat.pieces.filter(p => p.kind === 'item' && !golden(p)).map(piece);
  if (tab === 'treats') {
    return cat.pieces.filter(p => p.treat && (R.owned(state, p.id) || state.treats[p.id])).map(p => {
      const level = state.treats[p.id] || 0;
      return {
        icon: iconUrl[p.id], name: p.treat, desc: `×${cat.treat.mult} seeds from every ${p.name}.`, wallet: 'seeds',
        cost: R.treatPrice(cat, p, level), note: `Lv ${level}`,
        act: () => (R.buyTreat(state, cat, p.id) ? bought(`${p.name}s now earn ×${fmt(cat.treat.mult ** (level + 1))}.`) : broke('seeds')),
      };
    });
  }
  return [
    ...cat.pieces.filter(golden).map(piece),
    ...cat.upgrades.map(u => {
      const level = state.upgrades[u.id] || 0, cost = R.upgradePrice(u, level);
      return {
        icon: icons.feathers, name: u.name, desc: u.desc, wallet: 'feathers', cost, note: `Lv ${level}`,
        act: () => cost !== undefined && (R.buyUpgrade(state, cat, u.id) ? bought(`${u.name} is now level ${level + 1}.`) : broke('feathers')),
      };
    }),
  ];
}

function renderShop() {
  const list = entries();
  $('#shop').replaceChildren(...list.map((e, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.innerHTML = '<img alt=""><span class="name"></span><span class="note"></span><span class="cost"><img><b></b></span><span class="desc"></span>';
    b.querySelector('img').src = e.icon;
    b.querySelector('.cost img').src = icons[e.wallet];
    b.querySelector('.cost img').alt = CURRENCY[e.wallet];
    b.querySelector('.name').textContent = e.name;
    b.querySelector('.desc').textContent = e.desc;
    b.addEventListener('click', () => {
      entries()[k]?.act();
      refreshShop();
    });
    return b;
  }));
  if (!list.length) $('#shop').innerHTML = '<p class="hint">Treats appear here for each kind of bird living in your grove.</p>';
  refreshShop(list);
}

function refreshShop(list = entries()) {
  const cards = $('#shop').querySelectorAll('.card');
  if (cards.length !== list.length) return renderShop();
  list.forEach((e, k) => {
    const b = cards[k], maxed = e.cost === undefined;
    b.querySelector('.note').textContent = e.note;
    b.querySelector('.cost b').textContent = maxed ? 'MAX' : fmt(e.cost);
    b.querySelector('.cost img').hidden = maxed;
    b.classList.toggle('poor', !maxed && state[e.wallet] < e.cost);
    b.classList.toggle('maxed', maxed);
    b.classList.toggle('active', !!e.active);
  });
}

function setPlacing(id) {
  placing = id;
  $('#placing').hidden = !id;
  if (id) {
    $('#placing b').textContent = cat.piece[id].name;
    select(null);
    $('#field').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // on phones the shop sits below the grove
  }
  refreshShop();
  updateTip();
}

function select(i) {
  selected = i != null && state.cells[i] ? i : null;
  const c = selected != null && state.cells[selected], el = $('#info');
  if (!c) {
    el.innerHTML = '<p class="hint">Tap a bird to say hello and see what it earns and why. Drag pieces to rearrange them; moving is free.</p>';
    return;
  }
  const p = cat.piece[c.id];
  el.innerHTML = '<div class="head"><img alt=""><h2></h2></div><div class="stats"></div><p class="fact"></p><button type="button" class="sell"></button>';
  el.querySelector('img').src = iconUrl[c.id];
  el.querySelector('h2').textContent = p.name;
  el.querySelector('.fact').textContent = p.fact || '';
  el.querySelector('.sell').addEventListener('click', () => {
    const refund = R.sell(state, cat, selected);
    toast(`Sold ${p.name} for ${fmt(refund)} ${CURRENCY[R.wallet(p)]}.`);
    select(null);
    refreshShop();
  });
  refreshInfo(R.evaluate(state, cat));
}

function refreshInfo(ev) {
  const c = selected != null && state.cells[selected];
  if (!c) return;
  const p = cat.piece[c.id], o = ev.cells[selected], lines = [p.desc];
  if (p.kind === 'bird' && p.rate) {
    lines.push(`Earning <b>${fmt(o.rate)}</b> seeds/s (×${o.mult.toFixed(2)} from placement)`);
    for (const [label, v] of Object.entries(o.parts)) lines.push(`<span class="${v > 0 ? 'up' : 'down'}">${pct(v)}</span> ${label}`);
    if (state.treats[c.id]) lines.push(`${p.treat}: ×${fmt(cat.treat.mult ** state.treats[c.id])}`);
  }
  if (p.grow) {
    const g = Math.min(1, (c.age || 0) / p.grow);
    lines.push(g < 1 ? `Growing: ${Math.floor(g * 100)}% strength, fully grown in ${fmtTime(p.grow - (c.age || 0))}` : 'Fully grown and fruiting!');
  }
  if (p.incubate) {
    lines.push(o.egg ? `Egg ${Math.floor((c.egg || 0) * 100)}% warm, hatches in ${fmtTime((1 - (c.egg || 0)) / o.egg)}` : 'The egg is cold. Put birds around this box.');
  }
  $('#info .stats').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
  const refund = Math.floor(R.price(p, R.owned(state, c.id) - 1) * cat.sellBack);
  $('#info .sell').textContent = `Sell for ${fmt(refund)} ${CURRENCY[R.wallet(p)]}`;
}

function hud(ev) {
  $('#seeds').textContent = fmt(state.seeds);
  $('#rate').textContent = `+${fmt(ev.total)}/s${state.frenzy > 0 ? ` · Frenzy ×${cat.frenzy.mult} ${Math.ceil(state.frenzy)}s` : ''}`;
  $('#rate').classList.toggle('frenzy', state.frenzy > 0);
  $('#feathers').textContent = fmt(state.feathers);
  const waits = state.cells.flatMap((c, i) => (ev.cells[i].egg ? [(1 - (c.egg || 0)) / ev.cells[i].egg] : []));
  const nests = state.cells.some(c => c && cat.piece[c.id].incubate);
  $('#next').textContent = waits.length ? `next in ${fmtTime(Math.min(...waits))}` : nests ? 'nest is cold' : 'needs a Nest Box';
}

// Pay out a finished goal, then show the current one with a progress meter.
function goals(ev) {
  const done = R.claimGoal(state, cat, ev);
  if (done) {
    toast(`Goal complete: ${done.text}! ${rewardText(done.reward)}`);
    sound('goal');
    for (let k = 0; k < 16; k++) sparkle(Math.floor(Math.random() * N * N));
  }
  const g = cat.goals[state.goal], p = R.goalProgress(state, cat, ev);
  const html = g
    ? `<b>Goal ${state.goal + 1} of ${cat.goals.length}:</b> ${g.text} <span class="meter"><i style="width:${Math.min(100, (100 * p[0]) / p[1])}%"></i></span> `
      + `${fmt(Math.min(p[0], p[1]))}/${fmt(p[1])} <span class="reward">${rewardText(g.reward)}</span>`
    : '<b>Every goal complete!</b> Your grove is a wonder. Keep it growing.';
  if (html !== goalHtml) $('#goal').innerHTML = goalHtml = html;
}

const birdsAround = (i, skip) => R.SHAPES.ring.filter(([dx, dy]) => {
  const x = (i % N) + dx, y = Math.floor(i / N) + dy, j = y * N + x;
  return x >= 0 && y >= 0 && x < N && y < N && j !== skip && state.cells[j] && cat.piece[state.cells[j].id].kind === 'bird';
}).length;

// Floating preview above the hovered tile: how seeds/s would change if the piece went there.
function updateTip() {
  const tip = $('#tip'), g = ghostPiece();
  tip.hidden = !g;
  if (!g) return;
  const p = cat.piece[g.id];
  const gain = drag
    ? R.gainIf(state, cat, cells => { [cells[drag.from], cells[g.at]] = [cells[g.at], cells[drag.from]]; })
    : R.gainIf(state, cat, cells => { cells[g.at] = { id: g.id, age: p.grow }; });
  let text = `${gain < -1e-9 ? '−' : '+'}${fmt(Math.abs(gain))} seeds/s`;
  if (p.grow && !drag) text += ' once grown';
  if (p.incubate) text += ` · ${birdsAround(g.at, drag?.from)}/8 birds to warm the egg`;
  tip.textContent = text;
  tip.className = gain < -1e-9 ? 'down' : 'up';
  const [x, y] = tileXY(g.at), k = view.clientWidth / SIDE;
  tip.style.left = `${(x + TILE / 2) * k}px`;
  tip.style.top = `${y * k}px`;
}

// ---------- input ----------

function tileAt(e) {
  const r = view.getBoundingClientRect();
  const x = Math.floor((((e.clientX - r.left) / r.width) * SIDE - MARGIN) / TILE);
  const y = Math.floor((((e.clientY - r.top) / r.height) * SIDE - MARGIN) / TILE);
  return x >= 0 && y >= 0 && x < N && y < N ? y * N + x : null;
}

function setHover(i) {
  if (i === hover) return;
  hover = i;
  if (drag && i !== drag.from) drag.moved = true;
  updateTip();
}

function place(i) {
  const p = cat.piece[placing];
  if (!R.isOpen(state, cat, i)) return overgrown();
  if (state.cells[i]) return toast('That spot is taken. Drag pieces around to rearrange them.');
  if (!R.buy(state, cat, placing, i)) return broke(R.wallet(p));
  if (art[placing].flyA) animOf(state.cells[i]).fly = { t: 0, dx: -24 - Math.random() * 24, dy: -36 }; // swoops in from the upper left
  sparkle(i);
  sound('buy');
  refreshShop();
  updateTip();
}

// Tapping a bird: it reacts, and once per cooldown it shakes loose a few seconds of its seeds.
function touch(i) {
  select(i);
  const c = state.cells[i];
  if (!c || cat.piece[c.id].kind !== 'bird') return;
  const a = animOf(c), [x, y] = tileXY(i);
  play(c, i, c.id === 'owl' ? 'hoot' : Math.random() < 0.5 ? 'sing' : 'hop');
  sound(c.id === 'owl' ? 'hoot' : c.id === 'waxwing' ? 'trill' : 'chirp');
  spawn(art.heart.idle, 1, k => [x + 5, y - 3 - 10 * k], true);
  if (performance.now() < (a.tapReady || 0)) return;
  a.tapReady = performance.now() + cat.tap.cooldown * 1000;
  floatText(i, `+${fmt(R.tap(state, cat, i))}`);
}

view.addEventListener('pointerdown', e => {
  if (overVisitor(e)) return catchVisitor();
  const i = tileAt(e);
  setHover(i);
  if (i == null) return;
  if (placing) place(i);
  else if (state.cells[i]) {
    drag = { from: i, moved: false };
    view.setPointerCapture(e.pointerId);
  } else if (!R.isOpen(state, cat, i)) overgrown();
  else select(null);
});
view.addEventListener('pointermove', e => setHover(tileAt(e)));
view.addEventListener('pointerup', e => {
  if (!drag) return;
  const { from, moved } = drag, to = tileAt(e);
  drag = null;
  if (!moved) touch(from);
  else if (to != null && to !== from) R.move(state, cat, from, to) ? select(to) : overgrown();
  updateTip();
});
view.addEventListener('pointercancel', () => { drag = null; });
view.addEventListener('pointerleave', () => drag || setHover(null));
view.addEventListener('contextmenu', e => {
  e.preventDefault();
  setPlacing(null);
});

// Keyboard: arrows move the cursor; Enter places, selects, or moves the selected piece to the cursor.
view.addEventListener('keydown', e => {
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (d) {
    e.preventDefault();
    const i = hover ?? selected ?? 0, clamp = v => Math.max(0, Math.min(N - 1, v));
    setHover(clamp(Math.floor(i / N) + d[1]) * N + clamp((i % N) + d[0]));
  } else if ((e.key === 'Enter' || e.key === ' ') && hover != null) {
    e.preventDefault();
    if (placing) place(hover);
    else if (selected != null && hover !== selected) R.move(state, cat, selected, hover) ? select(hover) : overgrown();
    else touch(hover);
  }
});
addEventListener('keydown', e => {
  if ((e.key === 'c' || e.key === 'C') && visitor) catchVisitor();
  if (e.key !== 'Escape') return;
  setPlacing(null);
  select(null);
});
addEventListener('pointerdown', unlockAudio, true); // capture: runs before the grove's own handlers
addEventListener('keydown', unlockAudio, true);
$('#mute').addEventListener('click', () => setMuted(!muted));

$('#stop').addEventListener('click', () => setPlacing(null));
$('#tabs').addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (!t) return;
  tab = t.dataset.tab;
  for (const b of $('#tabs').children) b.setAttribute('aria-selected', b === t);
  renderShop();
});

// ---------- main loop ----------

function frame() {
  const now = Date.now(), dt = Math.max(0, Math.min(now - last, cat.offlineHours * 3600e3)) / 1000;
  last = now;
  if (dt > 0) {
    const before = state.seeds, hatched = R.advance(state, cat, dt);
    if (dt > 60) {
      const extra = hatched.length ? ` and hatched ${hatched.length} Golden Feather${hatched.length > 1 ? 's' : ''}` : '';
      toast(`Welcome back! While you were away (${fmtTime(dt)}) your flock gathered ${fmt(state.seeds - before)} seeds${extra}.`);
    } else hatched.forEach(hatch);
  }
  const anim = Math.min(dt, 0.25);
  state.cells.forEach((c, i) => c && tickAnim(c, i, anim));
  tickAnim(mascot, -1, anim);
  tickVisitor(anim);
  render(anim);
  if (now - lastUi > 150) {
    lastUi = now;
    const ev = R.evaluate(state, cat);
    goals(ev);
    hud(ev);
    refreshShop();
    refreshInfo(ev);
    updateTip();
  }
  requestAnimationFrame(frame);
}

view.width = view.height = SIDE;
document.querySelectorAll('img[data-icon]').forEach(img => { img.src = icons[img.dataset.icon]; });
$('link[rel="icon"]').href = art.waxwing.idle.toDataURL();
addEventListener('resize', fit);
setInterval(save, 5000);
document.addEventListener('visibilitychange', () => document.hidden && save());
addEventListener('pagehide', save);
fit();
setMuted(muted);
renderShop();
select(null);
if (!state.savedAt) toast('Welcome to Waxwing Grove! Pick a House Sparrow from the shop and place it in your grove.');
requestAnimationFrame(frame);
