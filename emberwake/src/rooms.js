// World layout. Rooms are built with a small carving DSL rather than ASCII so that
// coordinates stay readable. Grid origin is bottom-left, y grows upward, 1 tile = 1 unit.
export const T = { EMPTY: 0, SOLID: 1, PLAT: 2, THORN: 3 };

function build(id, name, biome, w, h, fn) {
  const t = new Uint8Array(w * h).fill(T.SOLID);
  const marks = [];
  const exits = [];
  const set = (x, y, v) => {
    if (x >= 0 && y >= 0 && x < w && y < h) t[y * w + x] = v;
  };
  const rect = (x, y, rw, rh, v) => {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, v);
  };
  const g = {
    w,
    h,
    carve: (x, y, rw, rh) => rect(x, y, rw, rh, T.EMPTY),
    solid: (x, y, rw, rh) => rect(x, y, rw, rh, T.SOLID),
    // one-way platform whose walkable surface is at `surfaceY`
    plat: (x, surfaceY, len) => rect(x, surfaceY - 1, len, 1, T.PLAT),
    // thorns sitting on the floor whose top is `floorY`
    thorns: (x, floorY, len) => rect(x, floorY, len, 1, T.THORN),
    mark: (type, x, y, props = {}) => marks.push({ type, x, y, ...props }),
    exit(key, side, y, to, at, hgt = 4) {
      const x0 = side === 'left' ? 0 : w - 3;
      rect(x0, y, 3, hgt, T.EMPTY);
      exits.push({ key, side, y, h: hgt, to, at });
    },
  };
  fn(g);
  return { id, name, biome, w, h, tiles: t, marks, exits };
}

export const ROOMS = {};
const add = (r) => (ROOMS[r.id] = r);

// ───────────────────────── The Cold Kiln (start) ─────────────────────────
add(build('kiln1', 'The Cold Kiln', 'kiln', 74, 26, (g) => {
  g.carve(2, 3, 70, 19);
  g.solid(2, 17, 12, 5);
  g.solid(28, 18, 12, 4);
  g.solid(60, 16, 12, 6);
  g.mark('kiln', 7, 3);
  g.mark('start', 9, 3);
  g.mark('hearth', 14, 3);
  g.mark('hint', 11, 3, { text: 'move', r: 6 });
  // steps that teach jumping
  g.solid(19, 3, 5, 1);
  g.solid(24, 3, 8, 2);
  g.mark('hint', 20, 4, { text: 'jump', r: 4 });
  g.mark('pot', 26.5, 5);
  g.mark('pot', 28, 5);
  g.mark('pot', 29.2, 5);
  g.mark('hint', 27, 5, { text: 'attack', r: 3.5 });
  // a small thorn bed
  g.thorns(35, 3, 3);
  g.mark('hint', 33, 3, { text: 'thorns', r: 3 });
  g.mark('enemy', 44, 3, { kind: 'potling' });
  g.mark('enemy', 50, 3, { kind: 'potling' });
  // optional climb to a shelf
  g.plat(41, 6, 4);
  g.plat(47, 9, 4);
  g.solid(53, 11, 8, 1);
  g.mark('pot', 55, 12);
  g.mark('pot', 56.4, 12);
  g.mark('tablet', 58.5, 12, { text: 'When the Great Kiln cooled, its makers lay down in their own ash.\nOnly the smallest wick kept burning.' });
  g.mark('lantern', 17, 3);
  g.mark('lantern', 39, 3);
  g.mark('lantern', 64, 3);
  g.mark('hint', 62, 3, { text: 'focus', r: 5 });
  g.exit('a', 'right', 3, 'kiln2', 'a');
}));

// ───────────────────────── Ashfall Gallery ─────────────────────────
add(build('kiln2', 'Ashfall Gallery', 'kiln', 86, 30, (g) => {
  g.carve(2, 3, 82, 24);
  g.exit('a', 'left', 3, 'kiln1', 'a');
  g.exit('b', 'right', 3, 'root1', 'a');
  g.mark('hearth', 8, 3);
  g.mark('lantern', 12, 3);
  // thorn pit with stepping platforms
  g.thorns(16, 3, 12);
  g.plat(18, 6, 3);
  g.plat(23, 6, 3);
  // climb toward the high ledge (the last gap needs the Gust Step)
  g.plat(28, 9, 3);
  g.plat(23, 12, 3);
  g.plat(19, 15, 3);
  g.solid(2, 15, 10, 1);
  g.mark('ember', 5.5, 17);
  g.mark('lantern', 8, 16);
  // low gallery with a brute
  g.solid(33, 12, 20, 15);
  g.mark('enemy', 43, 3, { kind: 'brute' });
  g.mark('lantern', 34, 3);
  g.mark('lantern', 52, 3);
  // rising and falling steps
  g.solid(57, 3, 5, 2);
  g.solid(62, 3, 5, 4);
  g.solid(67, 3, 6, 2);
  g.mark('enemy', 64.5, 7, { kind: 'potling' });
  g.mark('enemy', 72, 10, { kind: 'wisp' });
  g.mark('pot', 69, 5);
  g.mark('pot', 70.5, 5);
  g.mark('tablet', 77, 3, { text: 'Below the galleries the roots drank the last of the warmth.\nThey remember it still. Go down, little wick.' });
  g.mark('lantern', 80, 3);
}));

// ───────────────────────── Rootdeep Descent (vertical) ─────────────────────────
add(build('root1', 'Rootdeep Descent', 'root', 40, 60, (g) => {
  g.carve(2, 3, 36, 54);
  g.exit('a', 'left', 50, 'kiln2', 'b');
  g.exit('b', 'right', 3, 'root2', 'a');
  g.exit('c', 'left', 3, 'root3', 'a');
  // alternating ledges, 6 apart, with a stepping plank in each opening
  g.solid(2, 46, 12, 4); // top 50 (L)
  g.plat(14, 47, 3);
  g.solid(18, 42, 20, 2); // top 44 (R)
  g.plat(14, 41, 3);
  g.solid(2, 36, 22, 2); // top 38 (L)
  g.plat(25, 35, 3);
  g.solid(16, 30, 22, 2); // top 32 (R)
  g.plat(11, 29, 3);
  g.solid(2, 24, 22, 2); // top 26 (L)
  g.plat(25, 23, 3);
  g.solid(16, 18, 22, 2); // top 20 (R)
  g.plat(11, 17, 3);
  g.solid(2, 12, 20, 2); // top 14 (L)
  g.plat(24, 12, 3);
  g.plat(29, 9, 4);
  g.plat(24, 6, 4);
  g.mark('lantern', 6, 50);
  g.mark('enemy', 28, 44, { kind: 'potling' });
  g.mark('enemy', 9, 38, { kind: 'spitter' });
  g.mark('enemy', 30, 37, { kind: 'wisp' });
  g.mark('enemy', 26, 32, { kind: 'potling' });
  g.mark('pot', 34, 32);
  g.mark('pot', 35.3, 32);
  g.mark('enemy', 8, 30, { kind: 'wisp' });
  g.mark('enemy', 6, 26, { kind: 'spitter' });
  g.mark('enemy', 30, 20, { kind: 'brute' });
  g.mark('lantern', 20, 20);
  g.mark('enemy', 8, 14, { kind: 'potling' });
  g.mark('pot', 4, 14);
  g.mark('enemy', 32, 13, { kind: 'wisp' });
  g.mark('lantern', 10, 3);
  g.mark('lantern', 30, 3);
  g.mark('tablet', 16, 3, { text: 'West: a shrine where the wind was taught to carry fire.\nEast: the grotto, and thorns too wide for small legs.' });
}));

// ───────────────────────── Shrine of the Gust ─────────────────────────
add(build('root3', 'Shrine of the Gust', 'root', 48, 24, (g) => {
  g.carve(2, 3, 44, 18);
  g.exit('a', 'right', 3, 'root1', 'c');
  g.solid(2, 3, 10, 2);
  g.mark('shrine', 6.5, 5, { ability: 'dash' });
  g.thorns(20, 3, 7);
  // the high road in; the way back needs the Gust Step
  g.plat(31, 6, 3);
  g.plat(25, 9, 4);
  g.mark('lantern', 14, 3);
  g.mark('lantern', 36, 3);
  g.mark('enemy', 39, 3, { kind: 'potling' });
  g.mark('enemy', 30, 12, { kind: 'wisp' });
  g.solid(2, 15, 14, 6);
  g.solid(34, 16, 12, 5);
}));

// ───────────────────────── Glimmer Grotto ─────────────────────────
add(build('root2', 'Glimmer Grotto', 'root', 92, 28, (g) => {
  g.carve(2, 3, 88, 22);
  g.exit('a', 'left', 3, 'root1', 'b');
  g.exit('b', 'right', 12, 'root4', 'a');
  // the gap that demands a dash
  g.thorns(14, 3, 7);
  g.mark('hint', 10, 3, { text: 'dashgap', r: 4 });
  g.mark('hearth', 27, 3);
  g.mark('lantern', 24, 3);
  g.mark('enemy', 31, 8, { kind: 'wisp' });
  // islands over a thorn bed
  g.thorns(35, 3, 25);
  g.solid(39, 3, 3, 2);
  g.solid(49, 3, 3, 3);
  g.mark('enemy', 45, 10, { kind: 'wisp' });
  g.mark('enemy', 55, 11, { kind: 'wisp' });
  g.mark('pot', 50.5, 6);
  g.mark('enemy', 63, 3, { kind: 'potling' });
  g.mark('lantern', 61, 3);
  // climb to the vault door
  g.solid(67, 3, 6, 3);
  g.solid(73, 3, 6, 6);
  g.solid(79, 3, 11, 9);
  g.mark('enemy', 70, 6, { kind: 'spitter' });
  g.mark('enemy', 76, 9, { kind: 'potling' });
  g.mark('enemy', 84, 12, { kind: 'brute' });
  g.mark('lantern', 81, 12);
  g.solid(2, 18, 20, 7);
  g.solid(60, 20, 30, 5);
}));

// ───────────────────────── Glasswater Vaults ─────────────────────────
add(build('vault1', 'Glasswater Vaults', 'vault', 60, 38, (g) => {
  g.carve(2, 3, 56, 6); // lower chamber
  g.carve(27, 9, 4, 20); // the shaft
  g.carve(2, 29, 56, 7); // upper chamber
  g.exit('a', 'left', 3, 'root4', 'b');
  g.exit('b', 'right', 29, 'vault3', 'a');
  g.mark('lantern', 7, 3);
  g.mark('enemy', 14, 3, { kind: 'potling' });
  g.mark('enemy', 19, 3, { kind: 'spitter' });
  // two planks step up into the mouth of the shaft
  g.plat(22, 5, 3);
  g.plat(27, 7, 4);
  g.plat(27, 19, 2); // a place to catch your breath halfway up
  g.mark('hint', 28.5, 5, { text: 'shaft', r: 6 });
  g.mark('lantern', 25.2, 3);
  g.mark('lantern', 32.2, 3);
  g.mark('enemy', 40, 3, { kind: 'brute' });
  g.mark('pot', 44, 3);
  g.mark('pot', 45.4, 3);
  g.solid(48, 3, 9, 1);
  g.mark('shrine', 52.5, 4, { ability: 'grip' });
  // upper chamber
  g.mark('lantern', 24, 29);
  g.mark('enemy', 14, 29, { kind: 'potling' });
  g.mark('pot', 5, 29);
  g.mark('pot', 6.5, 29);
  g.mark('tablet', 9, 29, { text: 'The Warden was built to keep the Kiln\'s heart from thieves.\nNo one told it the heart had already gone.' });
  g.mark('enemy', 40, 33, { kind: 'wisp' });
  g.mark('enemy', 46, 29, { kind: 'spitter' });
  g.mark('lantern', 52, 29);
}));

// Boss rooms share one shape: a hearth antechamber, a gated arena, and a way onward.
function arenaRoom(id, name, biome, opts) {
  const { from, to, boss, sub = {}, tall = 0, planks = [], heart = false } = opts;
  const w = to ? 70 : 64;
  return build(id, name, biome, w, 26 + tall, (g) => {
    g.carve(2, 3, w - 4, 20 + tall);
    g.exit('a', 'left', 3, from[0], from[1]);
    g.solid(2, 12, 18, 11 + tall); // low antechamber roof
    g.solid(20, 12, 3, 11 + tall); // lintel over the first gate
    g.solid(23, 18 + tall, 35, 5); // arena roof
    g.mark('hearth', 8, 3);
    g.mark('lantern', 5, 3);
    if (sub.tablet) g.mark('tablet', 14, 3, { text: sub.tablet });
    g.mark('gate', 21, 3, { h: 9 });
    g.mark('bossTrigger', 27, 3);
    if (to) {
      g.solid(58, 12, 3, 11 + tall);
      g.solid(61, 12, w - 63, 11 + tall);
      g.mark('gate', 59, 3, { h: 9 });
      g.exit('b', 'right', 3, to[0], to[1]);
      g.mark('lantern', 64, 3);
      if (sub.after) g.mark('tablet', 66.5, 3, { text: sub.after });
    } else {
      g.solid(58, 3, 4, 20 + tall);
    }
    for (const [x, y, len] of planks) g.plat(x, y, len);
    if (heart) g.mark('heart', 52, 3);
    if (sub.kiln) g.mark('kiln', sub.kiln, 3, { size: 12 });
    g.mark('boss', boss[1], 3, { kind: boss[0], x0: 23.6, x1: 57.4 });
    g.mark('lantern', 26, 3);
    g.mark('lantern', 40, 3);
    g.mark('lantern', 55, 3);
  });
}

// ───────────────────────── Briar Hollow (boss) ─────────────────────────
add(arenaRoom('root4', 'Briar Hollow', 'root', {
  from: ['root2', 'b'], to: ['vault1', 'a'], boss: ['briar', 44],
  sub: { tablet: 'She was a seed the makers planted for shade.\nShe grew toward the only warm thing left: them.' },
}));

// ───────────────────────── Prism Walk ─────────────────────────
add(build('vault3', 'Prism Walk', 'vault', 70, 34, (g) => {
  g.carve(2, 3, 40, 7); // lower hall
  g.carve(18, 10, 4, 12); // shaft
  g.carve(18, 22, 50, 8); // upper hall
  g.exit('a', 'left', 3, 'vault1', 'b');
  g.exit('b', 'right', 22, 'vault2', 'a');
  g.mark('lantern', 6, 3);
  g.mark('enemy', 9, 3, { kind: 'potling' });
  g.plat(13, 5, 3);
  g.plat(18, 7, 4);
  g.mark('lantern', 16.3, 3);
  // optional: a long thorn bed guards a kiln ember
  g.thorns(25, 3, 11);
  g.mark('ember', 39, 5);
  g.mark('lantern', 23, 3);
  // upper hall
  g.mark('lantern', 24, 22);
  g.mark('enemy', 26, 25, { kind: 'wisp' });
  g.thorns(29, 22, 7);
  g.mark('enemy', 40, 22, { kind: 'spitter' });
  g.mark('enemy', 46, 22, { kind: 'brute' });
  g.mark('pot', 52, 22);
  g.mark('pot', 53.4, 22);
  g.mark('enemy', 57, 26, { kind: 'wisp' });
  g.mark('lantern', 62, 22);
}));

// ───────────────────────── The Warden's Vigil (boss) ─────────────────────────
add(arenaRoom('vault2', "The Warden's Vigil", 'vault', {
  from: ['vault3', 'b'], to: ['forge1', 'a'], boss: ['warden', 46],
  sub: {
    kiln: 49.5,
    tablet: 'Rest. Mend. Beyond this gate the cold has a shape,\nand it has been waiting a very long time.',
    after: 'The Kiln stands whole, and empty. Its First Ember was carried off:\ndown through the slag, then up into the frost.',
  },
}));

// ───────────────────────── Slagworks Descent ─────────────────────────
add(build('forge1', 'Slagworks Descent', 'forge', 84, 30, (g) => {
  g.carve(2, 3, 80, 24);
  g.exit('a', 'left', 20, 'vault2', 'b');
  g.exit('b', 'right', 3, 'forge2', 'a');
  g.solid(2, 3, 16, 17); // entry ledge, top 20
  g.mark('lantern', 8, 20);
  g.thorns(18, 3, 14);
  g.plat(20, 17, 5);
  g.plat(26, 14, 4);
  g.solid(32, 3, 8, 8); // top 11
  g.mark('enemy', 36, 11, { kind: 'emberling' });
  g.mark('lantern', 33.5, 11);
  g.thorns(40, 3, 10);
  g.plat(42, 8, 3);
  g.plat(47, 6, 3);
  g.mark('enemy', 54, 3, { kind: 'emberling' });
  g.solid(56, 10, 16, 17); // low roof with crucibles
  g.mark('enemy', 60, 10, { kind: 'dripper' });
  g.mark('enemy', 66, 10, { kind: 'dripper' });
  g.mark('enemy', 63, 3, { kind: 'potling' });
  g.mark('pot', 70, 3);
  g.mark('pot', 71.4, 3);
  g.mark('enemy', 76, 3, { kind: 'emberling' });
  g.mark('lantern', 52, 3);
  g.mark('lantern', 79, 3);
  g.mark('tablet', 74, 3, { text: 'Here the makers poured their mistakes.\nThe slag never forgave them, and never cooled.' });
}));

// ───────────────────────── The Tempering Hall ─────────────────────────
add(build('forge2', 'The Tempering Hall', 'forge', 70, 34, (g) => {
  g.carve(2, 3, 66, 28);
  g.exit('a', 'left', 3, 'forge1', 'b');
  g.exit('b', 'right', 20, 'forge3', 'a');
  g.solid(2, 14, 14, 17);
  g.mark('hearth', 7, 3);
  g.mark('lantern', 4.5, 3);
  g.mark('enemy', 13, 3, { kind: 'emberling' });
  g.solid(18, 3, 9, 1);
  g.mark('shrine', 22.5, 4, { ability: 'wing' });
  // the climb: every rise is taller than a single jump
  g.solid(40, 3, 28, 17); // cliff, top 20
  g.solid(37, 19, 3, 1); // overhanging lip
  g.plat(32, 8, 4);
  g.plat(26, 13, 4);
  g.plat(33, 18, 4);
  g.mark('hint', 33, 3, { text: 'wing', r: 5 });
  g.mark('lantern', 30, 3);
  g.mark('enemy', 48, 20, { kind: 'emberling' });
  g.mark('enemy', 56, 20, { kind: 'brute' });
  g.mark('lantern', 44, 20);
  g.mark('lantern', 62, 20);
}));

// ───────────────────────── The Long Pour ─────────────────────────
add(build('forge3', 'The Long Pour', 'forge', 96, 30, (g) => {
  g.carve(2, 3, 92, 24);
  g.exit('a', 'left', 10, 'forge2', 'b');
  g.exit('b', 'right', 14, 'forge4', 'a');
  g.solid(2, 3, 10, 7); // entry ledge, top 10
  g.mark('lantern', 6, 10);
  g.thorns(12, 3, 68);
  g.solid(23, 3, 3, 7); // top 10
  g.solid(36, 3, 3, 9); // top 12
  g.solid(49, 3, 4, 7); // top 10
  g.mark('enemy', 51, 10, { kind: 'emberling' });
  g.plat(58, 13, 3);
  g.plat(66, 16, 3);
  g.solid(80, 3, 14, 11); // far bank, top 14
  g.solid(26, 19, 14, 8); // low roof with crucibles
  g.mark('enemy', 30.5, 19, { kind: 'dripper' });
  g.solid(60, 22, 14, 5);
  g.mark('enemy', 63.5, 22, { kind: 'dripper' });
  g.mark('enemy', 43, 15, { kind: 'wisp' });
  g.mark('lantern', 84, 14);
  g.mark('pot', 88, 14);
  g.mark('pot', 89.4, 14);
}));

// ───────────────────────── The Bellows' Lair (boss) ─────────────────────────
add(arenaRoom('forge4', "The Bellows' Lair", 'forge', {
  from: ['forge3', 'b'], to: ['rime1', 'a'], boss: ['bellows', 40], tall: 3,
  planks: [[28, 6, 4], [49, 6, 4]],
  sub: {
    tablet: 'It was built to breathe for the furnaces.\nWhen the furnaces died, it kept breathing. It does not know how to stop.',
    after: 'Above the slag the air turns thin and white.\nSomething carried the First Ember up there, and sat down beside it.',
  },
}));

// ───────────────────────── Rimestair (vertical) ─────────────────────────
add(build('rime1', 'Rimestair', 'rime', 44, 64, (g) => {
  g.carve(2, 3, 40, 58);
  g.exit('a', 'left', 3, 'forge4', 'b');
  g.exit('b', 'right', 56, 'rime2', 'a');
  g.mark('lantern', 6, 3);
  g.plat(10, 8, 5);
  g.solid(20, 10, 8, 3); // top 13
  g.plat(32, 18, 5);
  g.solid(20, 20, 8, 3); // top 23
  g.plat(12, 23, 4);
  // a shaft between two ice masses
  g.solid(2, 26, 10, 18);
  g.solid(16, 26, 10, 18); // tops 44
  g.plat(12, 35, 2);
  g.plat(29, 48, 5);
  g.plat(21, 52, 5);
  g.solid(32, 53, 10, 3); // top 56
  g.mark('enemy', 24, 13, { kind: 'potling' });
  g.mark('enemy', 34, 12, { kind: 'lancer' });
  g.mark('enemy', 8, 20, { kind: 'lancer' });
  g.mark('enemy', 34, 30, { kind: 'lancer' });
  g.mark('lantern', 22, 23);
  g.mark('lantern', 6, 44);
  g.mark('pot', 20, 44);
  g.mark('pot', 21.4, 44);
  g.mark('enemy', 36, 50, { kind: 'wisp' });
  g.mark('lantern', 38, 56);
}));

// ───────────────────────── The Still Gallery ─────────────────────────
add(build('rime2', 'The Still Gallery', 'rime', 90, 28, (g) => {
  g.carve(2, 3, 86, 22);
  g.exit('a', 'left', 3, 'rime1', 'b');
  g.exit('b', 'right', 3, 'rime3', 'a');
  g.mark('hearth', 8, 3);
  g.mark('lantern', 5, 3);
  g.mark('tablet', 14, 3, { text: 'They walked up here to bring the fire home, and stopped.\nNot one of them fell. They are all still standing.' });
  g.thorns(20, 3, 31);
  g.solid(30, 3, 3, 3); // top 6
  g.solid(42, 3, 3, 5); // top 8
  g.mark('enemy', 26, 10, { kind: 'lancer' });
  g.mark('enemy', 38, 13, { kind: 'lancer' });
  g.mark('enemy', 55, 3, { kind: 'brute' });
  g.plat(59, 7, 3);
  g.solid(64, 3, 4, 8); // wall, top 11
  g.plat(70, 7, 3);
  g.mark('enemy', 61, 14, { kind: 'lancer' });
  g.mark('enemy', 74, 3, { kind: 'spitter' });
  g.mark('enemy', 80, 8, { kind: 'wisp' });
  g.mark('lantern', 53, 3);
  g.mark('lantern', 70, 3);
  g.mark('lantern', 84, 3);
  g.solid(2, 17, 16, 8);
  g.solid(52, 19, 20, 6);
}));

// ───────────────────────── The Snuffed Crown (final boss) ─────────────────────────
add(arenaRoom('rime3', 'The Snuffed Crown', 'rime', {
  from: ['rime2', 'b'], boss: ['wick', 44], heart: true,
  sub: { tablet: 'The first wick the makers ever lit climbed up here with the Ember, to keep it safe.\nIt kept it so safe that it let its own light go out.' },
}));

export const START_ROOM = 'kiln1';
