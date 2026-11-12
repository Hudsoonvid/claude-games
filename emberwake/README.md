# Emberwake

*A small light in a deep dark.*

An original, atmospheric 2.5D action-platformer (metroidvania-style) built with **Three.js**.
You are the Wick — a lantern-headed kindling — descending through three biomes to relight the Great Kiln.

Everything is generated at runtime: every sprite and backdrop is painted procedurally with Canvas2D,
terrain is shaped by a custom shader, and all sound effects and music are synthesized with WebAudio.
There are no image or audio files in the project.

## Play

```bash
npm install
```

```bash
npm run dev
```

Then open the printed local URL. `npm run build` produces a single self-contained `dist/index.html`.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | ← → / A D | Left stick / D-pad |
| Jump (hold for height) | Space / Z | A |
| Strike (aim with ↑ / ↓) | X / J | X |
| Gust Step (dash) | C / K / Shift | RT / RB |
| Mend (hold) | F / V | B |
| Cast flare | Q / L | Y |
| Rest / Read | ↑ / W | Up |
| Drop through a plank | ↓ + Jump | Down + A |
| Pause | Esc / P | Start |

Touch devices get on-screen buttons. Controllers rumble on hits where the browser supports it.

## What's in it

- **Movement**: variable-height jump with coyote time and input buffering, air dash, wall cling and wall jump, drop-through planks.
- **Combat**: four-direction strikes, downward-strike bouncing off thorns and foes, hit-stop, recoil, screen shake.
- **Cinder**: landing hits fills a gauge you spend to mend a flame (heal) or cast a flare (ranged).
- **World**: seven interconnected rooms across three biomes, two ability shrines that gate progress, a hidden flame upgrade, hearths that save and respawn, lore tablets.
- **Creatures**: four enemy types and a multi-phase boss with leap slams, shockwaves, sweeping strikes and ember rain.
- **Presentation**: parallax layers painted per room, light pools, bloom, vignette and grading, ambient particles, cloth-simulated scarf, generative score per biome.

## Layout

```
src/main.js      game loop, rooms, camera, saving
src/player.js    controller + procedurally animated puppet
src/entities.js  creatures, boss, pickups, props
src/world.js     collision grid and room visuals
src/rooms.js     level data (carving DSL)
src/art.js       shaders, parallax painters, decor
src/sprites.js   character / object textures
src/fx.js        particles, shake, hit-stop
src/post.js      bloom + grade pass
src/audio.js     synthesized SFX and music
src/hud.js       HUD, menus, touch controls
```
