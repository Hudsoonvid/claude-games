# Brimful

*A pocket world in a clay planter.*

An original 3D "falling sand" ecosystem sandbox built with **Three.js**. Pour sand, soil, water and lava into a
terracotta planter and watch them settle, flow, boil and grow — and mind the rim: anything that piles above it
spills over the side. There are no goals and no score.

Everything is generated at runtime: terrain is a voxel cellular simulation meshed on the fly, the look comes from
custom shaders, and all sound is synthesised with WebAudio. There are no image or audio files.

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
| Pick a tool | 1–9 | Tap the toolbar |
| Brush size | `[` `]` | + / − |
| Pause, rain, help | P, R, H | Top bar |
| Ride along: steer a creature | WASD, Space, Shift, Esc to let go | Stick and ▲ ▼ |

## What's in it

- **Materials**: sand (slides into dunes), soil (holds steeper slopes), stone, water (finite, levels out, soaks away
  in thin films), lava (viscous, crusts into basalt), steam (rises, gathers, rains back down), fire, seeds.
- **Reactions**: lava boils water into steam and freezes into basalt; fire spreads through trees and tufts and
  scorches turf; water puts fire out.
- **Growth**: soil near water turns to turf, turf sprouts tufts and flowers, seeds grow into trees that drop more
  seeds, waterweed takes root on lake beds.
- **Creatures**: minnows graze waterweed, mossbacks graze tufts, glimmers drift about and light up at night. Fed
  creatures multiply. *Ride along* lets you steer any of them, including underwater.
- **Worlds**: valley, atoll, volcano or a bare tray; your world autosaves in the browser.
- **Rendering**: procedural sky with sun, moon, stars and clouds; animated caustics on everything under water;
  rippling fresnel water; churning HDR lava; swaying plants whose blossoms glow after dark; drifting motes; bloom,
  light shafts, chromatic fringe, vignette and grain; an underwater lens when you swim. *Effects off* in the top
  bar drops the post-processing for slower devices.

## Layout

```
src/world.js     voxel grid, cellular simulation, growth, save format
src/gen.js       starting dioramas
src/mesher.js    chunk meshing (solid / flora / fluid / glow buffers, ambient occlusion)
src/gfx.js       shaders: sky, material patches, motes, post-processing
src/critters.js  creature models and behaviour
src/fx.js        particles
src/audio.js     synthesised sound
src/main.js      renderer, camera, tools, UI, main loop
```
