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
| Pick a tool | Earth / Life / Build / Powers tabs, 1–9 | Tap |
| Brush size | `[` `]` | + / − |
| Pause, rain, help | P, R, H | Top bar |
| Cinematic orbit (also starts after two idle minutes) | C, any input to stop | — |
| Undo / redo a stroke or power | Ctrl/Cmd + Z, Shift + Ctrl/Cmd + Z | ↶ ↷ in the top bar |
| Ride along: steer a creature | WASD, Space, Shift, V first person, Esc | Stick and ▲ ▼ |

## What's in it

- **Water** is not voxels. It is a virtual-pipes shallow-water simulation on a grid twice as fine as the terrain:
  it has momentum, makes waves, runs downhill as streams, pools, is displaced by anything dropped in and spills
  over the rim. It is drawn as one smooth surface with reflections, depth colour, foam and caustics beneath.
- **Earth**: sand, soil, stone, lava, ice, seeds, springs that well up water and drains that swallow it; raise, lower and smooth the land; paint any of 56 biomes (each with its own colours, tree shapes and habits: conifers, palms, willows,
  bamboo, giant mushrooms, dead snags and more).
- **Reactions**: lava boils water to steam and freezes to basalt; steam condenses and rains back; fire spreads
  through trees, grass and huts; water puts it out; ice melts by heat.
- **Growth**: soil near water turns to turf with real blade grass, flowers and trees in each biome's colours;
  waterweed takes root on lake beds, cattails stand in the shallows and mushrooms come up in forest shade.
- **Life**: 33 creatures — moose, pandas, crocodiles, parrots, minnows, koi, ducks, turtles, seals, herons, flamingos, penguins, camels, goats, squirrels, hedgehogs, boar, frogs, crabs, beavers, mossbacks, rabbits, sheep,
  deer, foxes, wolves, bears, bees, butterflies, songbirds, owls, glimmers and villagers. Wolves hunt in packs at
  night, bears fish the shallows, and beavers fell trees and build stick dams that hold back the water. Animals graze, hunt, pollinate and multiply; villagers fell trees, replant, farm fields, build
  lantern-lit huts and raise families. Every village has a name and a coloured pennant by its hearth, its people wear
  footpaths into the grass, and settlers who build far from home found new villages. The menu under the title lists
  each village and its population. Ride along with any of them in
  third or first person.
- **Build**: huts, wells, lookout towers, windmills, lighthouses, town halls, footpaths that stay, crop fields, planks, thatch, fence posts and lanterns,
  so you can lay out villages yourself.
- **Powers**: spark, lightning, meteor, meteor shower, quake, tornado, surge, mountain, volcano, sinkhole, forest, wither, downpour, dry up, freeze, thaw, bloom,
  hut, settlers (a band who found a new village) and harvest gift.
- **Chronicle**: a running history with a calendar (day, season and year): villages founded, births, new huts, losses,
  foxes hunting, weather, seasons and every disaster, in the menu under the title and saved with the world. Voxel clouds drift over the world casting shadows, gather and darken before rain, and rain or snow from
  beneath. Weather steps from clear
  to rain, storm (overcast, lightning) and snow, which settles in drifts and skins lakes with ice. Also tornado
  and surge. U hides the interface for photos.
- **Containers**: keep the clay planter, or switch to a glass tank that shows the ground and water in cross-section,
  a wooden crate, or nothing at all (Settings).
- **Sound**: everything is synthesised. A soundscape follows the camera: wind over high ground and in storms, waves by
  big water, rain, crackling fire and lava, and birdsong among trees by day and loudest at dawn; plus running water,
  crickets, croaking frogs, hooting owls and howling wolves at night.
- **Seasons**: the year turns through spring, summer, autumn and winter, tinting grass and broadleaf trees, and
  weather comes and goes by itself (showers, summer storms, winter snow). It can be switched off in Settings.
- **Worlds**: 101 world types in five groups (gentle, water, rugged, wild and special), from orchard hills and lake
  districts to fjords, mesas, crater lakes, twin volcanoes, glaciers, fungal wilds, a volcanic island, stone pillars, a bayou and a moonlit glade, plus a
  biome checkerboard and *Surprise me*. Type any
  width and depth from 16 to 256 blocks (in steps of 16). Villages are generated where there is room. Every world has a seed (shown in the menu under the
  title); type the same seed, type and size to make the same world again. Save as many named worlds as the
  browser's storage holds; the current one also autosaves.
- **Graphics**: Auto measures real frame times and moves between Low, Medium, High and Ultra; every setting
  (resolution, shadows, grass density, bloom, light shafts, miniature blur, water detail, anti-aliasing) can also be
  set by hand.

## Creature models

The creatures are modelled procedurally in Blender by `tools/make_animals.py` and exported as one GLB that
is embedded in the build. To regenerate them after editing the script:

```bash
pip install bpy
```

```bash
python tools/make_animals.py
```

## Layout

```
src/world.js     voxel grid and rules, shallow-water simulation, growth, huts, save format
src/gen.js       world types, biomes, village placement
src/mesher.js    chunk meshing: cubes with ambient occlusion, grass blades, lava
src/gfx.js       shaders: water surface, sky, underwater light, grass, post-processing
src/critters.js  creature behaviour; loads the Blender-made models
src/animals.glb  the creature models (generated, do not edit by hand)
tools/make_animals.py  models every creature in Blender and exports animals.glb
src/fx.js        particles
src/audio.js     synthesised sound
src/main.js      renderer, camera, tools and powers, settings, saved worlds, UI, main loop
```
