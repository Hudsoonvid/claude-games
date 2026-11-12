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
  g.plat(23, 7, 3);
  // climb toward the high ledge (the last gap needs the Gust Step)
  g.plat(28, 10, 3);
  g.plat(23, 13, 3);
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
  g.exit('b', 'right', 12, 'vault1', 'a');
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
  g.exit('a', 'left', 3, 'root2', 'b');
  g.exit('b', 'right', 29, 'vault2', 'a');
  g.mark('lantern', 7, 3);
  g.mark('enemy', 14, 3, { kind: 'potling' });
  g.mark('enemy', 20, 3, { kind: 'spitter' });
  g.plat(27, 7, 4);
  g.mark('enemy', 38, 3, { kind: 'brute' });
  g.mark('pot', 44, 3);
  g.mark('pot', 45.4, 3);
  g.solid(48, 3, 9, 1);
  g.mark('shrine', 52.5, 4, { ability: 'grip' });
  g.mark('lantern', 34, 3);
  // upper chamber
  g.mark('lantern', 24, 29);
  g.mark('enemy', 14, 29, { kind: 'potling' });
  g.mark('pot', 5, 29);
  g.mark('pot', 6.5, 29);
  g.mark('tablet', 9, 29, { text: 'The Warden was built to keep the Kiln\'s heart from thieves.\nNo one told it the heart had already gone out.' });
  g.mark('enemy', 40, 33, { kind: 'wisp' });
  g.mark('enemy', 46, 29, { kind: 'spitter' });
  g.mark('lantern', 52, 29);
}));

// ───────────────────────── The Warden's Vigil (boss) ─────────────────────────
add(build('vault2', "The Warden's Vigil", 'vault', 64, 26, (g) => {
  g.carve(2, 3, 60, 20);
  g.exit('a', 'left', 3, 'vault1', 'b');
  g.solid(2, 12, 18, 11);
  g.solid(20, 12, 3, 11); // lintel above the gate
  g.solid(23, 18, 39, 5);
  g.solid(56, 3, 6, 15);
  g.mark('hearth', 8, 3);
  g.mark('lantern', 5, 3);
  g.mark('tablet', 14, 3, { text: 'Rest. Mend. Beyond this gate the cold has a shape,\nand it has been waiting a very long time.' });
  g.mark('gate', 21, 3, { h: 9 });
  g.mark('bossTrigger', 27, 3);
  g.mark('heart', 49.5, 3);
  g.mark('boss', 46, 3);
  g.mark('lantern', 26, 3);
  g.mark('lantern', 38, 3);
}));

export const START_ROOM = 'kiln1';
