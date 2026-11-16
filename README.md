# claude-games

Browser games built with Claude, plus a cross-device arcade that bundles them with
open-source classics.

**[`index.html`](index.html) is the arcade hub** — an installable web app (PWA) that
runs on iPhone, iPad, Android, Mac, Windows, Linux and Steam Deck / SteamOS, and
works offline once installed.

| Game | What it is |
| --- | --- |
| [`games/slingstone/`](games/slingstone/) | Original physics slingshot game |
| [`emberwake/`](emberwake/) | Original atmospheric action-platformer in Three.js |
| [`games/2048/`](games/2048/) | 2048 (MIT) |
| [`games/hextris/`](games/hextris/) | Hextris (GPL-3.0) |
| [`games/radius-raid/`](games/radius-raid/) | Radius Raid (MIT) |
| [`games/astray/`](games/astray/) | Astray (public domain) |

See [`CREDITS.md`](CREDITS.md) for authors, licences and what was changed.

## Input support

[`shared/arcade-input.js`](shared/arcade-input.js) gives every game the same coverage:

- **Controller** (Steam Deck, Xbox, PlayStation, Switch Pro…): d-pad / sticks / face
  buttons; hold View/Select to return to the hub.
- **Trackpad**: two-finger swipes act as moves (2048, Hextris); Slingstone pans with
  two-finger scroll and zooms with pinch.
- **Touch**: on-screen sticks and buttons where a game needs them.
- **Keyboard and mouse**: unchanged from each original.

## Run it

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/. Emberwake needs a build first
(`cd emberwake && npm ci && npm run build`); the Pages workflow does that
automatically.

Full-screen kiosk launch on Linux / Steam Deck / macOS:

```bash
launchers/arcade.sh
```

## Hosting

`.github/workflows/pages.yml` builds and deploys the arcade to GitHub Pages on every
push to `main` (enable Pages → "GitHub Actions" in the repository settings once).

## Adding a game

1. Put it in `games/<id>/` with its licence file.
2. Before `</body>` add a `window.ARCADE = {...}` config and
   `<script src="../../shared/arcade-input.js"></script>` (options are documented at
   the top of that file).
3. Add an entry to `GAMES` in `index.html`, a row in `CREDITS.md`, and a screenshot
   at `shared/shots/<id>.jpg`.
