# Credits & licences

Every bundled game is open source and redistributed under its own licence. The
full licence text ships inside each game's folder.

| Game | Author(s) | Licence | Source |
| --- | --- | --- | --- |
| 2048 | Gabriele Cirulli | MIT (`games/2048/LICENSE.txt`) | https://github.com/gabrielecirulli/2048 |
| Hextris | Logan Engstrom, Garrett Finucane, Noah Moroze, Michael Yang | GPL-3.0 (`games/hextris/LICENSE.md`) | https://github.com/Hextris/hextris |
| Radius Raid | Jack Rugile | MIT (`games/radius-raid/LICENSE.md`) | https://github.com/jackrugile/radius-raid-js13k |
| Astray | Rye Terrell | Public domain / Unlicense (`games/astray/License.md`) | https://github.com/wwwtyro/Astray |
| Slingstone | this project | original | uses matter.js (MIT, `games/slingstone/vendor/matter-LICENSE.txt`) |
| Emberwake | this project | original | uses three.js (MIT) |

## Changes made to the bundled games

- All: loads `shared/arcade-input.js` (controller, trackpad and touch support, "back to arcade" button) and a mobile viewport.
- 2048: removed the "official version" note and outbound app-store links; updated the how-to-play text.
- Hextris: removed ads, analytics, the remote score beacon and a remotely loaded script; iPad is treated as a touch device.
- Radius Raid: scales to fit any screen; right-stick / touch-stick aiming; touch and controller menu input.
- Astray: fixed asset paths for sub-folder hosting; analog stick and touch stick steering.

Hextris is GPL-3.0; the modified source is this repository.
