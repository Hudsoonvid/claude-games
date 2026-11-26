# Emberwake: handoff notes for a new session

Paste this into a new Claude session (or point it at this file) to pick up where we left off.

## What this is
An original 2.5D action-platformer in Three.js, inspired by atmospheric metroidvanias but with its own
hero (the Wick, a lantern-headed kindling), world, enemies and name. Everything is generated in code:
sprites and backdrops are painted with Canvas2D at startup, terrain and mist use custom shaders, and all
sound and music are synthesized with WebAudio. There are no image or audio files.

## Run it
```
npm install
npm run dev      # local dev server
npm run build    # one self-contained dist/index.html
```
`emberwake-playable.html` in this zip is a prebuilt copy you can open directly in a browser.

## Current state
- 16 rooms across 5 biomes: Cold Kiln, Rootdeep, Glasswater Vaults, Slagworks, Rime.
- Abilities, gated in order: Gust Step (dash, Shrine of the Gust), Ember Grip (wall cling, Glasswater
  Vaults), Kindled Leap (double jump, Tempering Hall).
- Bosses in order: Briar Queen (root4), Cold Warden (vault2), Bellows (forge4), Cold Wick (rime3, final).
- 7 enemy types, hearth saves, 2 hidden health upgrades, lore tablets.
- Input: keyboard, gamepad (with rumble), touch (floating stick + roll-across buttons).
- Three save slots in localStorage. Slot 1 uses key `emberwake.save.v1`; slots 2 and 3 add `.slot2` / `.slot3`.

## Things the user asked for, already done
- Briar Queen attacks are colour coded: red = spikes from the ground, gold = seeds from above,
  with cue icons over her head and floor warnings.
- Final boss (Cold Wick) was softened: 40 HP, longer wind-ups and recoveries, staggers after 10 hits.
- Hidden help menu (for a younger sibling). Unadvertised on purpose; keep it that way.
  Open the pause menu, then type `kindle`, or press Up Up Down Down Left Right Left Right,
  or tap the word PAUSED 7 times. Toggles: cannot be hurt, mighty blade (5x damage),
  endless Cinder, unlock all abilities, mend all flames. Saved per slot.

## Debug URL parameters
`?room=<id>&x=<n>&y=<n>&dash=1&grip=1&wing=1&cinder=1` starts in any room with any abilities.
Room ids are in `src/rooms.js`. `window.__game.step(n)` advances n frames for scripted tests.

## Code map
| File | Purpose |
| --- | --- |
| src/main.js | game loop, state machine, rooms, camera, saves and slots, hidden menu |
| src/player.js | player controller and procedural puppet animation |
| src/entities.js | enemies, the Warden boss, pickups, props, gates |
| src/bosses.js | Briar Queen, Bellows, Cold Wick |
| src/rooms.js | all level layouts (small carving DSL, y grows upward) |
| src/world.js | collision grid, room visuals, decor scatter |
| src/art.js | biome palettes, shaders, parallax painters |
| src/sprites.js | character / object textures painted with Canvas2D |
| src/fx.js | particles, shake, hit-stop |
| src/post.js | bloom and colour grade |
| src/audio.js | synthesized SFX and per-biome generative music |
| src/hud.js | HUD, menus, touch controls |
| src/input.js | keyboard / gamepad / touch mapping |

## Ideas the user raised but not started
- Porting to Roblox (Luau). Logic ports directly; art, shaders and audio would need remaking.
  Suggested first step: player controller, one room, one enemy and the HUD.

## Known limits
Tested with scripted headless playthroughs and emulated touch, never by hand on real hardware,
so difficulty, audio and controller feel are untuned by a human.
