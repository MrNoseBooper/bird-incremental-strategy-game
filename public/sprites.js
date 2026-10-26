// Pixel art for Waxwing Grove. Every frame is a list of rows; each character is a palette key and
// '.' is transparent. Letters get an automatic dark outline, digits are drawn flat (legs, stems).
// Nothing here touches the DOM, so tools and tests can rasterize sprites outside a browser.

export const TILE = 16;
const OUTLINE = '#2a1f2d';

// Songbirds are assembled from parts, so every species shares the same poses and every pose is a
// hand-placed frame (no rotation). Part entries are [x, y, rows] in a 16x16 frame.
const PART = {
  tail: {
    normal: [0, 9, ['YwT', 'YwU']],
    up: [0, 6, ['Y..', 'Yw.', '.wT', '..T']],
  },
  body: [3, 7, [
    '.BBBBBB..',
    'BBBBBBBDD',
    'BBBBBBDDD',
    'UBBBBLLLL',
    'UULLLLLLL',
    '.LLLLLLL.',
    '..LLLLL..',
  ]],
  wing: {
    folded: [3, 8, [
      '.wWWW.',
      'wWWWWW',
      'ZXXWWw',
      'www...',
    ]],
    up: [2, 2, [
      'w.....',
      'wW....',
      'wWW...',
      'ZWWW..',
      '.XWWW.',
      '..XWWW',
      '...wWW',
    ]],
    down: [1, 9, [
      '..wWWWW',
      '.wZXWW.',
      'wZXW...',
      'ww.....',
    ]],
  },
  crest: {
    down: [5, 1, ['RR....', '.RRRRR', '...R..']],
    up: [8, 0, ['RR..', '.RRR', '.RRR']],
    back: [10, 1, ['....RR', 'RRRRR.', '..R...']],
  },
  head: {
    normal: [8, 3, [
      '.HHH...',
      'HHHHA..',
      'HMMEMA.',
      'HSSSMKK',
      '.SNNCK.',
      '..DN...',
    ]],
    sing: [8, 3, [
      '.HHH...',
      'HHHHA..',
      'HMMEMKK',
      'HSSSMk.',
      '.SNNCKK',
      '..DN...',
    ]],
    eat: [8, 3, [
      '.HHH....',
      'HHHHA...',
      'HMMEMA..',
      'HSSSMKKQ',
      '.SNNCK..',
      '..DN....',
    ]],
    gulp: [8, 3, [
      '.HHH.K.',
      'HHHHAK.',
      'HMMEMM.',
      'HSSSMC.',
      '.SNNC..',
      '..DN...',
    ]],
    down: [8, 3, [
      '.HHH..',
      'HHHHA.',
      'HMMEMA',
      'HSSSMK',
      '.SNNKK',
      '...KK.',
    ]],
    back: [6, 3, [
      '...HHH.',
      '..AHHHH',
      '.AMEMMH',
      'KKMSSSH',
      '.KCNNS.',
      '...ND..',
    ]],
    preen: [6, 4, [
      '..HHH..',
      '.HHHHH.',
      '.MEMMH.',
      'KMSSSH.',
      'KKNNS..',
    ]],
  },
  legs: {
    stand: [6, 14, ['1..1.', '11.11']],
    tucked: [6, 14, ['1.1', '...']],
  },
};
PART.head.blink = [8, 3, PART.head.normal[2].map(r => r.replaceAll('E', 'M'))];

// Pose recipes: part variants plus nudges for the head (hx, hy), crest (cx, cy) and wing (wy).
const POSE = {
  idle: {},
  blink: { head: 'blink' },
  breathe: { hy: 1, wy: 1 },
  peck1: { hx: 1, hy: 2, tail: 'up' },
  peck2: { head: 'down', hx: 1, hy: 4, tail: 'up' },
  flapA: { wing: 'up' },
  flapB: { wing: 'down' },
  look: { head: 'back', crest: 'back' },
  hop: { legs: 'tucked' },
  tail: { tail: 'up' },
  sing: { head: 'sing', hy: -1 },
  preen: { head: 'preen', crest: 'back', cx: -1, cy: 1 },
  eat: { head: 'eat' },
  gulp: { head: 'gulp', hy: -1 },
  crest: { crest: 'up' },
  flyA: { wing: 'up', legs: 'tucked' },
  flyB: { wing: 'down', legs: 'tucked' },
};

function compose(pose, palette) {
  const grid = Array.from({ length: TILE }, () => Array(TILE).fill('.'));
  const draw = ([x, y, rows], dx = 0, dy = 0) => rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
    // skip parts this species doesn't have (e.g. crest), so they never cover anything
    if (ch !== '.' && palette[ch] !== null && grid[y + dy + ry]?.[x + dx + rx] !== undefined) grid[y + dy + ry][x + dx + rx] = ch;
  }));
  const { hx = 0, hy = 0, cx = 0, cy = 0, wy = 0 } = pose;
  draw(PART.tail[pose.tail || 'normal']);
  draw(PART.body);
  draw(PART.wing[pose.wing || 'folded'], 0, wy);
  draw(PART.crest[pose.crest || 'down'], hx + cx, hy + cy);
  draw(PART.head[pose.head || 'normal'], hx, hy);
  draw(PART.legs[pose.legs || 'stand']);
  return grid.map(r => r.join(''));
}

// Letters: H crown, A forehead, M eye stripe, E eye, S cheek, N throat, C chin, K beak, k open mouth,
// R crest, B back, D breast, L belly, U undertail, W wing, w wing edge, X/Z wing marks, T tail, Y tail tip, Q food.
const bird = p => ({
  A: p.H, M: p.H, S: p.H, N: p.S || p.H, C: p.H, D: p.L, U: p.L, X: p.W, Z: p.W, Y: p.T, R: null,
  k: OUTLINE, Q: '#d9b77a', E: '#1c1412', ...p,
});

const PALETTES = {
  sparrow: bird({
    H: '#7d7f88', M: '#8a4b2a', S: '#dcd8cd', N: '#2b2421', C: '#2b2421', K: '#3d3634',
    B: '#9b6a3f', D: '#cfc6b5', L: '#ddd5c4', W: '#8c5a33', w: '#5c3a22', X: '#efe8d8', Z: '#b07a48',
    T: '#6e4b2e', 1: '#c08f72',
  }),
  chickadee: bird({
    H: '#262322', E: '#77706a', S: '#f4f0e7', N: '#262322', K: '#2c2826',
    B: '#8f939a', D: '#efe9dd', L: '#e2cfb2', U: '#efe9dd', W: '#80858d', w: '#5a5e66', X: '#d5d8dc', Z: '#c7cbd0',
    T: '#6e737a', 1: '#5d5f66',
  }),
  robin: bird({
    H: '#8a6d44', A: '#e2662c', M: '#e2662c', S: '#e2662c', C: '#e2662c', D: '#e2662c', K: '#3a2e27',
    B: '#8a6d44', L: '#f1e9db', W: '#7a5e3a', w: '#56412a', T: '#6f5636', 1: '#a3826c',
  }),
  goldfinch: bird({
    H: '#f4cb22', A: '#1f1c19', K: '#f0a25c',
    B: '#e9c021', D: '#f6d43c', L: '#f8e070', U: '#f4f0e6', W: '#25211d', w: '#3b352f', X: '#f4f0e6', Z: '#f4f0e6',
    T: '#25211d', 1: '#d1a585',
  }),
  cardinal: bird({
    R: '#cc2a2f', H: '#cc2a2f', M: '#1d1615', E: '#e9e1d6', S: '#cc2a2f', N: '#1d1615', C: '#1d1615', K: '#f0712f',
    B: '#b32428', D: '#d43431', L: '#c4292c', W: '#a3222a', w: '#781a1f', T: '#9c1f25', 1: '#b58272',
  }),
  waxwing: bird({
    R: '#b48f7a', H: '#b48f7a', A: '#b5583b', M: '#151214', E: '#efe6da', S: '#c48b70', C: '#151214', K: '#1d1a1c',
    B: '#a6897a', D: '#c09f8c', L: '#a8a2ab', U: '#a5452d', W: '#6c6a74', w: '#2a282f', X: '#e3262d', Z: '#f4efe2',
    T: '#4f4c56', Y: '#f2c522', Q: '#d9362b', 1: '#3b3539',
  }),
  goldwax: bird({ // the rare visitor
    R: '#f6d465', H: '#f6d465', A: '#f39b2f', M: '#5a3510', E: '#fffbe8', S: '#fbe08a', C: '#5a3510', K: '#5a3510',
    B: '#f1c040', D: '#fbe08a', L: '#fff0b0', U: '#f39b2f', W: '#e3a82b', w: '#a86f14', X: '#ff5a3a', Z: '#fffbe8',
    T: '#c98a1a', Y: '#fff6c8', 1: '#a86f14',
  }),
};

// Owl: a front-facing bird drawn as whole frames; `owl()` swaps the rows that change.
const OWL = [
  '................',
  '................',
  '.....WWWWWW.....',
  '...WWWWWWWWWW...',
  '..WWWWWWWWWWWW..',
  '..WGYYGWWGYYGW..',
  '..WGYPGWWGPYGW..',
  '..WWGGWKKWGGWW..',
  '..WWWWWWWWWWWW..',
  '.GWbWWWWWWWbWWG.',
  '.GWWWWbWWWWWWWG.',
  '.GWbWWWWWbWWbWG.',
  '..GWWWbWWWWWWG..',
  '..GWWWWWWbWWWG..',
  '...GGWWWWWWGG...',
  '....11....11....',
];
const owl = rows => OWL.map((r, i) => rows[i] ?? r);
// shift rows [from..to] one pixel left (dx < 0) or right (dx > 0)
const nudge = (rows, dx, from, to) => rows.map((r, i) => i < from || i > to ? r : dx > 0 ? '.' + r.slice(0, -1) : r.slice(1) + '.');

const FEEDER = [
  '................',
  '.......RR.......',
  '......RRRR......',
  '.....RRRRRR.....',
  '....rrrrrrrr....',
  '.....wGGGGw.....',
  '.....wSsSGw.....',
  '.....wsSsSw.....',
  '.....wSSsSw.....',
  '...wWWWWWWWWw...',
  '....wwwwwwww....',
  '.......12.......',
  '.......12.......',
  '.......12.......',
  '.......12.......',
  '......1122......',
];

const SUNFLOWER = [
  '................',
  '......yYYy......',
  '.....YYOOYY.....',
  '....yYOooOYy....',
  '....yYOooOYy....',
  '.....YYOOYY.....',
  '......yYYy......',
  '.......1........',
  '...lLL.1........',
  '..lLLLL1........',
  '...lL..1.LLl....',
  '.......1LLLLl...',
  '.......1..Ll....',
  '.......1........',
  '.......1........',
  '.......1........',
];

const BATH = [
  '................',
  '................',
  '................',
  '................',
  '..sSSSSSSSSSSs..',
  '.SBBBBBBBBBBBBS.',
  '.SBBBBBBBBBBBBS.',
  '..SBBBBBBBBBBS..',
  '...sSSSSSSSSs...',
  '....ssSSSSss....',
  '......sSSs......',
  '......sSSs......',
  '......sSSs......',
  '.....sSSSSs.....',
  '....ssSSSSss....',
  '................',
];
const bath = (a, b) => BATH.map((r, i) => i === 5 ? a : i === 6 ? b : r);

const ROWAN = [
  '.....LLLLG......',
  '...LLLGGGGGG....',
  '..LLGGGGgGGGG...',
  '.LLGGGgGGGGgGG..',
  '.LGGGGGGGgGGGG..',
  '.GGGgGGGGGGGgG..',
  '.GGGGGGgGGGGGg..',
  '..gGGGGGGGGGg...',
  '...ggGGTTGgg....',
  '......tTT.......',
  '.......TT.......',
  '.......TT.......',
  '.......TT.......',
  '.......TT.......',
  '......tTTt......',
  '................',
];

const NEST = [
  '................',
  '.......rR.......',
  '......rRRR......',
  '.....rRRRRR.....',
  '....rRRRRRRR....',
  '...rrrrrrrrrr...',
  '.....WWWWWW.....',
  '.....WWHHWW.....',
  '.....WHHHHW.....',
  '.....WWHHWW.....',
  '.....WWWWWW.....',
  '.....wwwwww.....',
  '.......12.......',
  '.......12.......',
  '.......12.......',
  '......1122......',
];

const FEEDER_PAL = { R: '#b5442f', r: '#7f2d22', W: '#c89a5b', w: '#8e6534', G: '#cfe8ef', S: '#d9b77a', s: '#7a5a3a', 1: '#5b5560', 2: '#8a8490' };

const birdFrames = palette => Object.fromEntries(Object.entries(POSE).map(([name, pose]) => [name, compose(pose, palette)]));

// Animation clips: [frame, seconds, dy]. Birds rest on 'idle' and play a random clip from their habits.
const BIRD_CLIPS = {
  blink: [['blink', 0.12]],
  breathe: [['breathe', 0.35], ['idle', 0.3], ['breathe', 0.35]],
  peck: [['peck1', 0.1], ['peck2', 0.15], ['peck1', 0.08], ['peck2', 0.15], ['peck1', 0.1]],
  flap: [['flapA', 0.07], ['flapB', 0.07], ['flapA', 0.07], ['flapB', 0.07], ['flapA', 0.07]],
  look: [['look', 1.2]],
  hop: [['breathe', 0.07], ['hop', 0.08, -2], ['hop', 0.1, -3], ['hop', 0.08, -2], ['breathe', 0.07]],
  tail: [['tail', 0.12], ['idle', 0.1], ['tail', 0.12]],
  sing: [['sing', 0.22], ['idle', 0.1], ['sing', 0.3]],
  preen: [['preen', 0.35], ['idle', 0.1], ['preen', 0.45]],
  eat: [['peck1', 0.1], ['peck2', 0.14], ['eat', 0.45], ['gulp', 0.25], ['idle', 0.1], ['gulp', 0.2]],
  crest: [['crest', 1.0]],
  pass: [['eat', 0.35]], // waxwing hands a berry to a flockmate (game.js sends the berry)
  catch: [['eat', 0.3], ['gulp', 0.25], ['idle', 0.1], ['gulp', 0.2]],
};

const songbird = (id, habits) => ({ palette: PALETTES[id], frames: birdFrames(PALETTES[id]), clips: BIRD_CLIPS, habits: { blink: 3, ...habits } });

export const SPRITES = {
  sparrow: songbird('sparrow', { peck: 4, hop: 3, tail: 2, breathe: 2, flap: 1, look: 1, sing: 1, preen: 1 }),
  chickadee: songbird('chickadee', { hop: 3, peck: 2, look: 2, sing: 2, flap: 1, tail: 1, breathe: 1 }),
  robin: songbird('robin', { sing: 3, look: 2, peck: 2, breathe: 2, tail: 1, hop: 1, preen: 1 }),
  goldfinch: songbird('goldfinch', { eat: 3, peck: 2, sing: 2, flap: 2, hop: 1, look: 1, breathe: 1 }),
  cardinal: songbird('cardinal', { sing: 3, crest: 2, eat: 2, look: 1, preen: 1, flap: 1, breathe: 1 }),
  waxwing: songbird('waxwing', { eat: 3, pass: 3, crest: 2, look: 2, preen: 2, breathe: 2, flap: 1, sing: 1, hop: 1, tail: 1 }),
  owl: {
    palette: { W: '#f6f6f2', G: '#c9ced6', b: '#3d3b44', Y: '#f2c530', P: '#1a1418', K: '#4a4446', k: OUTLINE, 1: '#9aa0a8' },
    frames: {
      idle: OWL,
      blink: owl({ 5: '..WGWWGWWGWWGW..', 6: '..WGGGGWWGGGGW..' }),
      half: owl({ 5: '..WGGGGWWGGGGW..' }),
      lookL: nudge(OWL, -1, 2, 8),
      lookR: nudge(OWL, 1, 2, 8),
      fluff: owl({ 8: '.WWWWWWWWWWWWWW.', 9: 'GWWbWWWWWWWbWWWG', 10: 'GWWWWWbWWWWWWWWG', 11: 'GWWbWWWWWbWWbWWG', 12: '.GWWWWbWWWWWWWG.', 13: '.GWWWWWWWbWWWWG.' }),
      stretch: owl({ 8: '..WWWWWWWWWWWWG.', 9: '.GWbWWWWWWWbWWGW', 10: '.GWWWWbWWWWWWWGW', 11: '.GWbWWWWWbWWbGWb', 12: '..GWWWbWWWWWWGW.' }),
      hoot: owl({ 5: '..WGGGGWWGGGGW..', 7: '..WWGGWKKWGGWW..', 8: '..WWWWWkkWWWWW..' }),
    },
    clips: {
      blink: [['half', 0.1], ['blink', 0.25], ['half', 0.1]],
      look: [['lookL', 0.9], ['idle', 0.3], ['lookR', 0.9]],
      fluff: [['fluff', 0.15], ['idle', 0.1], ['fluff', 0.15], ['idle', 0.1], ['fluff', 0.25]],
      stretch: [['stretch', 0.9]],
      hoot: [['hoot', 0.4], ['idle', 0.2], ['hoot', 0.5]],
    },
    habits: { blink: 4, look: 3, fluff: 1, stretch: 1, hoot: 1 },
  },
  feeder: { palette: FEEDER_PAL, frames: { idle: FEEDER } },
  goldfeeder: {
    palette: { R: '#f2c522', r: '#b8860b', W: '#f6dc6b', w: '#c9971c', G: '#fff6c8', S: '#f2c522', s: '#c9971c', 1: '#b8860b', 2: '#f6dc6b' },
    frames: { idle: FEEDER },
  },
  sunflower: {
    palette: { Y: '#f6c624', y: '#d99a16', O: '#6b4423', o: '#4a2e17', L: '#5f9e3c', l: '#43782a', 1: '#4f8a32' },
    frames: { a: nudge(SUNFLOWER, -1, 0, 6), b: SUNFLOWER, c: nudge(SUNFLOWER, 1, 0, 6) },
    loop: [['b', 0.7], ['a', 0.9], ['b', 0.7], ['c', 0.9]],
  },
  bath: {
    palette: { S: '#bdb8ae', s: '#8f8a82', B: '#5fa8d8', b: '#d6f0ff' },
    frames: {
      a: bath('.SBbbBBBBBBBBBS.', '.SBBBBBBBBbBBBS.'),
      b: bath('.SBBBbbBBBBBBBS.', '.SBBBBBBBBBbBBS.'),
      c: bath('.SBBBBBbbBBBBBS.', '.SBBbBBBBBBBBBS.'),
    },
    loop: [['a', 0.5], ['b', 0.5], ['c', 0.5]],
  },
  rowan: {
    palette: { G: '#4f8f3a', g: '#3a6e2b', L: '#74b04f', T: '#7a5233', t: '#55391f', B: '#e8452c', b: '#a82a1c', 1: '#4f8a32' },
    stages: ['sapling', 'young', 'mature', 'fruit'], // shown as the tree grows
    frames: {
      sapling: [
        '................', '................', '................', '................',
        '................', '................', '................', '................',
        '................',
        '.........LG.....',
        '.......L.GG.....',
        '......LGG1......',
        '.......G.1.LG...',
        '.........1GG....',
        '.........1......',
        '........t1t.....',
      ],
      young: [
        '................', '................', '................', '................',
        '.......LLG......',
        '.....LLGGGG.....',
        '....LGGgGGgG....',
        '....GGGGgGGg....',
        '.....gGGGGg.....',
        '.......gTg......',
        '........T.......',
        '........T.......',
        '........T.......',
        '........T.......',
        '.......tTt......',
        '................',
      ],
      mature: ROWAN,
      fruit: ROWAN.map((r, i) => ({
        2: '..LLGGBBgGGGG...',
        3: '.LLGGBbGGGBBGG..',
        4: '.LGGGGGGGBbGGG..',
        5: '.GGBBGGGGGGGgG..',
        6: '.GGBbGGgGGBBGg..',
        7: '..gGGGGGGGBbg...',
      })[i] ?? r),
    },
  },
  nest: {
    palette: { R: '#9b4b33', r: '#6d3122', W: '#c8955a', w: '#946a3a', H: '#3a2618', Q: '#f2c522', q: '#fff1a8', 1: '#6b5a4a', 2: '#8a7562' },
    frames: { idle: NEST, glow: NEST.map((r, i) => ({ 8: '.....WHqQHW.....', 9: '.....WWQQWW.....' })[i] ?? r) },
  },
  goldwax: songbird('goldwax', {}),
  // tiny flat sprites for effects and the UI
  note: { palette: { 1: OUTLINE }, frames: { idle: ['..11', '..1.', '..1.', '111.', '11..'] } },
  heart: { palette: { 1: '#ff5d7a', 2: '#ffc2cf' }, frames: { idle: ['.1.1.', '12111', '.111.', '..1..'] } },
  pip: { palette: { 1: '#b8893f', 2: '#f1dca2' }, frames: { idle: ['21', '11'] } },
  spark: { palette: { 1: '#f2c522', 2: '#ffffff' }, frames: { idle: ['.1.', '121', '.1.'] } },
  berry: { palette: { 1: '#d9362b', 2: '#ff8a7a' }, frames: { idle: ['21', '11'] } },
  feather: {
    palette: { G: '#f2c522', g: '#c9971c', W: '#fff1a8', q: '#8a6a1c' },
    frames: { idle: ['......G.', '.....GWG', '....GWGg', '...GWGg.', '..GWGg..', '..WGg...', '.q.g....', 'q.......'] },
  },
  seed: {
    palette: { S: '#efe6cf', s: '#3b3330' },
    frames: { idle: ['.sss.', 'sSsSs', 'sSsSs', 'sSsSs', '.SsS.', '.sSs.', '..s..'] },
  },
};

// Turn frame rows into RGBA pixels with a 1px outline margin on every side.
export function rasterize(rows, palette) {
  const w = rows[0].length, h = rows.length, W = w + 2, H = h + 2;
  const data = new Uint8ClampedArray(W * H * 4), casts = new Uint8Array(W * H);
  const put = (i, hex) => {
    data.set([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255], i * 4);
  };
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`sprite row ${y} is ${row.length} wide, expected ${w}: "${row}"`);
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      if (!(ch in palette)) throw new Error(`no colour for "${ch}" in row ${y}: "${row}"`);
      if (palette[ch] === null) return;
      const i = (y + 1) * W + x + 1;
      put(i, palette[ch]);
      casts[i] = ch < '0' || ch > '9' ? 1 : 2;
    });
  });
  for (let i = 0; i < W * H; i++) {
    if (casts[i]) continue;
    const x = i % W;
    if ((x > 0 && casts[i - 1] === 1) || (x < W - 1 && casts[i + 1] === 1) || casts[i - W] === 1 || casts[i + W] === 1) put(i, OUTLINE);
  }
  return { width: W, height: H, data };
}
