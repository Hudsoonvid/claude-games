# Brimful

*A pocket world in a clay planter.*

An original 3D god-game sandbox built with **Three.js**. Shape a voxel landscape, pour water that really flows,
grow forests, raise villages and call down storms — all inside a terracotta planter. Mind the rim: anything that
rises above it spills over the side. There are no goals and no score.

Everything is generated at runtime: the terrain is a voxel cellular simulation, the water is a shallow-water fluid
simulation, the look comes from custom shaders and all sound is synthesised. There are no image or audio files.

## Play

```bash
npm install
```

```bash
npm run dev
```

Then open the printed local URL. `npm run build` produces a single self-contained `dist/index.html`.

## Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Use the selected tool | Hold left button | One finger |
| Orbit | Right-drag (or the Look tool) | Two fingers (or the Look tool) |
| Zoom / pan | Scroll / Shift-drag | Pinch |
| Pick a tool | Earth / Life / Powers tabs, 1–9 | Tap |
| Brush size | `[` `]` | + / − |
| Pause, rain, help | P, R, H | Top bar |
| Ride along: steer a creature | WASD, Space, Shift, V first person, Esc | Stick and ▲ ▼ |

## What's in it

- **Water** is not voxels. It is a virtual-pipes shallow-water simulation on a grid twice as fine as the terrain:
  it has momentum, makes waves, runs downhill as streams, pools, is displaced by anything dropped in and spills
  over the rim. It is drawn as one smooth surface with reflections, depth colour, foam and caustics beneath.
- **Earth**: sand, soil, stone, lava, ice, seeds; raise, lower and smooth the land; paint any of nine biomes.
- **Reactions**: lava boils water to steam and freezes to basalt; steam condenses and rains back; fire spreads
  through trees, grass and huts; water puts it out; ice melts by heat.
- **Growth**: soil near water turns to turf with real blade grass, flowers and trees in each biome's colours;
  waterweed takes root on lake beds.
- **Life**: minnows, ducks, frogs, mossbacks, rabbits, butterflies, songbirds, glimmers and villagers. Animals graze,
  hunt and multiply; villagers fell trees, replant, build huts and raise families. Ride along with any of them in
  third or first person.
- **Powers**: spark, lightning, meteor, quake, downpour, dry up, freeze, thaw, bloom and hut.
- **Worlds**: ten world types (valley, atoll, archipelago, canyon, highlands, marsh, dunes, patchwork, volcano, bare
  tray) at any size from 32 to 160 blocks a side, with generated villages. Save as many named worlds as the
  browser's storage holds; the current one also autosaves.
- **Graphics**: Auto measures real frame times and moves between Low, Medium, High and Ultra; every setting
  (resolution, shadows, grass density, bloom, light shafts, miniature blur, water detail, anti-aliasing) can also be
  set by hand.

## Layout

```
src/world.js     voxel grid and rules, shallow-water simulation, growth, huts, save format
src/gen.js       world types, biomes, village placement
src/mesher.js    chunk meshing: cubes with ambient occlusion, grass blades, lava
src/gfx.js       shaders: water surface, sky, underwater light, grass, post-processing
src/critters.js  creature models and behaviour
src/fx.js        particles
src/audio.js     synthesised sound
src/main.js      renderer, camera, tools and powers, settings, saved worlds, UI, main loop
```
