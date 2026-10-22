# Bug List

> Filed by qa-tester. Format: ID · title · severity · steps · expected · actual · likely file.

## Open

### Context-button controls QA (commit d68d4ad, e2e build, 360x800 and 412x915, real multi-touch via CDP, 2026-10-22)

### BUG-050 · The "stairs are blocked" and other bump thoughts only show when the hero does not move at all · minor
- **Steps:** `?debug`, wait 4 s, hero at (12.5, 6.6) next to the down flight, push the stick straight into the flight (grid -y). At 360x800 the toast "The stairs are blocked." shows. At 412x915 it never shows: the pushed direction has a 1e-5 sideways part from the pixel scaling, so the hero "slides" by 0.000016 tiles per frame and `r.moved` stays true (`tests/e2e/iso-qa.mjs`, KNOWN BUG-050, 412 only). Pushing at a slight angle slides him along the flight with no thought at all.
- **Expected:** GDD 4: pushing into a blocked flight shows the thought on the first bump.
- **Actual:** `if (!r.moved && r.code === STICK.MOVING && this.bumpedStairs(...))` needs zero movement.
- **Likely file:** `src/scenes/IsoGameScene.js` `updateStick` (use a displacement threshold, for example moved less than a quarter of the step, or show the thought whenever the probe tile is a stair tile and the forward component is blocked).

### Context-button controls notes (not bugs)
- Layout at both sizes: all hit circles at least 96 game px (Main 128, Attack 104, Secondary 96, Quick-use 96, top bar 96 = 48 css px at 360, 55 at 412), no overlap (closest gap 7.2 game px, Attack-Secondary), the arc's left edge (Attack 398) is right of the stick zone edge (396), Main is 66 px from the right edge, top bar and moodle column do not meet. The hero's feet always sit at x 440, y 458 of 1280 when standing (36% from the top, a little more while moving: up to 566), never under the thumbs or the top bar (checked on all 481 walkable tiles x 4 facings).
- Target flicker: with finger tremor of +-6 to +-10 degrees every 40-60 ms the target between two neighbouring units changed at most twice in 5 s (hysteresis works). A deliberate +-15 degree swing every 100 ms between the drawer and the cupboard switched 8 times in 5 s, one switch per swing: expected.
- Close on an open door is greyed ("Something's in the way.") while the hero's circle is within 0.3 tiles of the door edge, not only when his centre is on a door tile (GDD 4 says "centre on one of its two tiles", which would always grey it when standing beside the door). He can close from 0.35 tiles away. Sensible; the GDD wording could follow.
- `main.js` still has `activePointers: 3`, the GDD says 2. Harmless.
- Floor 15 has 3 zombies (2 crawlers, 1 walker); the id hash gave all three the base look, so the two crawlers look identical. Variants work: 5 walker and 2 crawler sheets exist and render, picks are even over 100 ids (17-23 per walker look, 50/50 crawler) and the same after a reload.
- `tests/e2e/iso.mjs` combat part was flaky (about half of the runs): it moved the walker to y 19 but left its x where it had wandered, so it was outside the target cone. It now also sets x, mode and path (5/5 runs pass). That is the uncommitted edit in the tree.
- `tests/e2e/iso-qa.mjs` edits by the programmer reviewed: fine (world takes no touches, front door targeted from 4 spots, Home pressed look and auto-walk, turn band vs creep). The stairs check now waits for the opening thought and is KNOWN BUG-050.

### Joystick controls QA (uncommitted working tree on ccd185d, e2e build, 360x800 and 412x915, real multi-touch via CDP, 2026-10-22)

### BUG-047 · The hero can end up 0.15 tiles inside a wall corner after leaving a doorway sideways · minor · FIXED (verified: the hero now stops at the wall corner)
- **Steps:** pure logic, `stepStickMove` with the real floor 15 grid (`/tmp/.../scratchpad/rep.mjs`). The west door `f15NE-4.2.W` (open, tile (22,2)) is a doorway; wall on the west edge of (22,1). Hero at (22.15, 2.55) (standing half in the doorway) pushes straight up (0, -1) for 2 s. A fuzz of 300 random 60 s walks over floor 15 (150,000 steps) found 59 such cases (and no hero in an unwalkable tile, none through a wall, none stuck).
- **Expected:** GDD 4: the hero is a circle of radius 0.3 against wall edges; never overlapping them.
- **Actual:** he ends at (22.15, 1.30): 0.15 tiles (about 14 px) inside the wall line, so the sprite overlaps the jamb a little. The sideways check in `moveAxis` (`clipsSideways`) only looks at the crossing edge of the neighbouring tile, not at the wall edge that starts on the new row (west edge of (22,1)). He can always walk out again.
- **Likely file:** `src/gameplay/isoStick.js` `clipsSideways` / `moveAxis` (also test the edge of the target row on the side the circle leans to).

### BUG-048 · Walking the stick into the stairs gives no feedback · minor · FIXED (toast shows when the push is exact; see BUG-050)
- **Steps:** `?debug`, hero at (12.5, 6.6) next to the down flight of the stairs, push the stick toward screen up-right (grid -y) for 1.5 s.
- **Expected:** GDD 4/5.3: pushing into the flight shows a thought (Stage A: the stairs are blocked; taps already show "The stairs are blocked.").
- **Actual:** the hero stops silently at the flight (no toast). The tap path still shows the toast.
- **Likely file:** `src/scenes/IsoGameScene.js` `updateStick` (detect a bump into `world.stairs` tiles and toast with the existing cooldown).

### BUG-049 · Audio files are still the generated ones, the room-tone loop is still shipped, no CREDITS.md (GDD 10 rule zero) · minor (audio-designer, not the programmer) · FIXED (room tone and lamp hiss deleted, CREDITS.md exists; gust sound quality still needs a phone)
- **Steps:** `public/assets/audio/`: `amb_room_tone.ogg` (not played any more), `lamp_hiss` loop and `amb_wind`/`amb_rain` loops are still in `manifest.json` (`loop: true`); `scripts/make-audio.mjs` still generates them; `public/assets/audio/CREDITS.md` does not exist; `balance.json` has `audio.continuousLoops: false` and `synthesizedSounds: false` but the files are synthesized.
- **Expected:** GDD 10: everything is a real CC0/public-domain recording with a CREDITS.md line; no continuous tonal sound.
- **Actual:** the code now plays wind and rain only as gusts (idle sample over 170 s: signal in 32% of the time, first wind gust at 37 s, rain at 78 s, then a thud, a groan and a pipe knock, nothing continuous, no loops playing between gusts). But the gust content is the old generated wind and rain loops, and they only count as a hum if the generated noise has a tonal character: needs a human ear on a phone.
- **Likely file:** `public/assets/audio/*`, `scripts/make-audio.mjs`, `public/assets/audio/manifest.json` (audio-designer).

### Joystick notes (not bugs)
- The Menu button reads "Joystick: left/right"; GDD 4 says "Stick: Left / Right". `main.js` has `activePointers: 3`, GDD 4 says 2 (`addPointer(1)`). Harmless.
- A tap in the stick zone counts only if the finger is up within 0.25 s; a 0.3 s press on an object in the zone does nothing (by spec). Headless touches are slower than a finger, so only a phone tells whether 0.25 s feels right.
- Doorway assist: 637 start positions inside the stated 0.35-tile window and up to 55 degrees off the door normal: 99% got through (the misses are at the window edge at 40 degrees). Outside the window he slides along the wall as specified.
- `tests/e2e/smoke.mjs` creep check was flaky (it measured speed over CDP latency); changed to use in-page timestamps (0.99 tiles/s). `tests/e2e/iso-qa.mjs` BUG-042 check read `pending`, which is already cleared once the hero stands at the door; it now records `handleInteract` calls.

### Isometric Stage A QA (committed be69415, e2e build, 360x800 and 412x915, touch, 2026-10-21)

### BUG-042 · Tapping the left part of the home front door opens the stash; doors lose taps to furniture drawn behind them · major (tap accuracy, Stage A "9 of 10 taps" check) · FIXED (verified joystick QA: 4/4 touches across the home front door open it; stash moved)
- **Steps:** New game (`?debug` build). `g.debugGoto(6, 8)` (kitchen, next to the front door at tile (6,9) south edge) or walk there. Tap the front door 6-7 CSS px left of its centre (360x800; `__floor15.debugClientOf('f15NW-6.9.S')`, x - 7). Then tap its centre and 7 px right of it. Whole floor: set `__floor15.vision.seen.fill(1)`, then call `onWorldTap` on every pixel of the door art that differs from the plain wall frame (28 doors).
- **Expected:** a tap on the visible door opens it (GDD 4 step 4: front-most wins; "the right menu opens on 9 of 10 taps").
- **Actual:** left of centre the stash toolbox (tile (5,9), only 24 px left of the door centre) takes the tap: the hero walks to the stash and opens the stash panel. Real touches at 360x800: centre -14 px and -8 px open the stash, 0 and +8 px open the door (flaky between 360 and 412 because of sub-pixel rounding: at 412x915 the centre tap itself went to the stash once). Across all doors only 72% of door-art pixels reach the door; most of the rest go to furniture drawn BEHIND the door (examples: f15SE-7.7.W 32% stolen by the chair f15SE-5.6, f15NE-9.4.S 33% stolen by the chair f15NE-8.3, f15S-1.5.S 40% stolen by the utility shelf f15S-0.4, f15NE-4.9.S 29% by the laundry basket f15NE-3.9). A chair has a single action, so a mis-tap on a door starts dismantling the chair (quiet, but it destroys it) with no menu. Objects themselves are fine: 99.9% of 2520 sampled visible art pixels of all 83 objects hit the right object.
- **Likely file:** `src/gameplay/isoTap.js` `pickInteractable` (rule "furniture before doors, then front-most" ignores depth: let the door win when its sprite is drawn in front of the furniture, i.e. higher `depth`, and the pixel under the finger is door art) and `public/data/levels/floors_iso.json` (stash tile next to the front door).

### BUG-043 · A corpse stays drawn for about 2 s after the hero turns away from it · minor · FIXED (verified joystick QA: no corpse drawn after turning away)
- **Steps:** `?debug`. Hero at (3,17) facing south, walker at (3,19) in view. `__floor15.zombies.hurt(__floor15.zombies.get('f15SW-z1'), 999, false)`, then `__floor15.hero.facing = 270; __floor15.updateVision(true)`. Wait 0.7 s.
- **Expected:** GDD 5.17: corpses are never drawn on tiles that are not Visible.
- **Actual:** the death-animation sprite is still visible and alpha 1 on a tile that is no longer Visible, for the 1.5 s corpse time plus the 0.8 s fade. Same for a kill followed by walking away.
- **Likely file:** `src/scenes/IsoActors.js` `die` (visibility is decided once; re-check `vision.isVisible` every frame like `syncZombie`/decals do) and `src/scenes/IsoZombies.js` `kill` (removes the runtime from the list, so nothing syncs it afterwards).

### BUG-044 · Too dark to read: remembered areas are almost the background colour, visible dim rooms are very dark · major (readability, needs a phone check and a Creative Director call) · FIXED (verified joystick QA: remembered areas mean luminance 42 against 13 before, visible 60 against 30)
- **Steps:** New game, screenshots at 360x800 and 412x915 (`qa-isoA/occ-4-2.png`, `vis-corr-east-closeddoors.png`, `cd-*.png`). Measured mean luminance (0-255) of the rendered pixels: visible grey or dim floor around the hero 26-35 (95th percentile 67-81); a remembered flat 13-14 against the unknown background `#0b0c0e` (about 11).
- **Expected:** GDD 11.3 Stage A: "claustrophobic but readable"; GDD 5.17: Remembered is "drawn darkened and desaturated" and "remembered areas ... readable".
- **Actual:** the memory (`vision.overlayAlpha.memory` 0.82, so brightness 0.18, plus a base art that is already dark) is only 2-3 grey levels above the unknown colour. Doors, walls and furniture of a place you have been to are outlines you can only find if you know they are there. In the corridor (light dim, overlay 0.5, cone 90 degrees, range 4) and in the laundry and janitor rooms (dark, range 2.5, cone 70) the visible area is a few tiles. In a bright room or outdoors on a phone at normal brightness this will probably read as black. The rest of the look (vignette, cone, stubs) works.
- **Likely file:** `public/data/balance.json` (`vision.overlayAlpha.memory` 0.82 -> about 0.6, `dim` 0.5, `edge` 0.8, `unknown`) and the tint in `src/scenes/IsoWorldView.js` `applyTints` / `src/gameplay/isoView.js` `tintOf`. Needs game-designer (numbers) and a decision after a phone playtest at real brightness.

### BUG-045 · Zombie voices are almost inaudible (volume applied twice) and the aggro groan ignores distance and walls · major (audio, confirm on a phone) · FIXED (verified joystick QA: voices 0.09 behind walls at 10 tiles, 0.44 at 3 tiles with a clear line; far aggro groan is silent)
- **Steps:** `?debug`, tap once (unlocks audio), hook `__floor15.sound.play` and log (volume 4th column). Hero in the corridor at (7,11), SW walker 10 tiles away behind walls: all 8 voices in 30 s had volume 0.01. Hero at (3,17), walker 3 tiles away with a clear line: breath 0.08, shuffle 0.09.
- **Expected:** GDD 5.17 and 11.3 Stage A: a zombie heard behind a door is scary; muffled means x0.5, not silent. The room-tone bed plays at 0.1, wind 0.22, rain 0.18, footsteps 0.45.
- **Actual:** `IsoSoundscape.zombieSounds` passes `ZOMBIE_MAX_VOLUME` 0.3 x falloff x occlusion to `playSfx`, which multiplies it by the manifest volume of the voice (0.3) again: 0.09 at point blank, about 0.027 at 5 tiles behind a wall and 0.009 at 10 tiles: below the ambient beds at every distance. Separately `IsoGameScene.onZombieAggro` plays `zombie_groan_1/2` at a fixed 0.7 x 0.55 whatever the distance, the walls or the direction (a zombie woken by a noise 40 tiles away groans at full volume, centred), and sound-off players get a ripple for it.
- **Likely file:** `src/scenes/IsoSoundscape.js` (`ZOMBIE_MAX_VOLUME`: drop it or raise it to 1 since the manifest already scales; check `a.fullVolumeTiles` 2), `src/scenes/IsoGameScene.js` `onZombieAggro` (pass distance falloff, pan and occlusion like `onZombieDoorHit` does).

### BUG-046 · Sound ripple is a light grey full ring, not a soft dark 40 degree arc, and is faint · minor (design deviation, needs a human look) · FIXED (ripple changed in feb6409; not re-inspected, see the stage A human playtest list)
- **Steps:** `?debug`, hero at (14,10) facing west, then `__floor15.soundEvent('a', {x:22, y:9}, 'loud', 15)` (screenshots `ripple-peak-2.png`, `ripple-behind-loud.png`).
- **Expected:** GDD 5.17: "a soft dark arc (overlay colour, no icon, no text)", arc width 40 degrees, 0.4 tile thick, at the edge of the vision area, peak alpha 0.25 noisy / 0.4 loud (x0.6 beyond 8 tiles).
- **Actual:** the sprite is `iso_fx ripple_2` scaled 4.8x and tinted `0xa09a8c` (light grey): a full ellipse outline, no 40 degree arc, visible as a faint ring around 0.13-0.48 alpha (far loud: 0.24 x 2). The behaviour is right (quiet never, out of range never, a Visible source never, same source at most once per 1.5 s, at most 2 on screen, behind the cone sits on the 1.5 tile circle, in the cone at the range edge). Whether the faint ring is enough for a sound-off player is a phone question.
- **Likely file:** `src/scenes/IsoFx.js` `SoundRipples` (tint, arc frame or mask, `setAlpha(... * 2)`).

### Isometric Stage A notes (not bugs, for the Producer)
- `/.well-known/assetlinks.json` is still not in `dist/` (expected until the PWABuilder key exists).
- Tapping a tile directly up-screen from the hero (one step NW/N/NE in screen terms) hits the hero's 96x96 body rect and turns him around instead of walking (GDD 4 order: the hero before the floor). To step one tile up-screen the player must tap two tiles away. By the spec; worth asking the Creative Director on a phone.
- Only 3 zombies are on floor 15 (GDD 11.3 says 3-5): f15NE-z1 crawler, f15SW-z1 walker, f15S-z1 crawler; all 8 facings drawn.
- The old side-view code (`GameScene.js`, `Zombies.js`, `TowerView.js` and so on) and its data (`floors.json`, `tower_m2.json`) are no longer used by the game but are still in the repo and precached; 138 precache entries, dist is 3.3 MB.
- GDD 5.18 says a door cannot close while "anyone (hero ...) stands on one of the two tiles it touches"; the code only checks zombies, because the hero must stand next to the door to close it. Probably the GDD wording; no action unless the game-designer disagrees.
- A door being closed behind a zombie that stands in the doorway tile gives "Something's in the way." (tested).

### Milestone 2 stage 2 QA (wide floors, uncommitted working tree, e2e build, 360x800 and 412x915, 2026-10-21)

### BUG-036 · "Tap an empty spot to walk" only works in a thin band: object hit areas tile the whole floor · major (UX, confirm on a phone)
- **Steps:** Floor 15 (any floor), start flat. Tap on the floor at about the hero's feet or body height between two pieces of furniture. Measured in the e2e build with `view.hitTest` along every x of the 13-17 floors (landing excluded).
- **Expected:** GDD 4: a tap on an empty spot in a room walks the hero there; objects only take taps that are on them.
- **Actual:** the 96x96 object hit areas (floor objects cover y = line-96..line, wall objects line-156..line-60, 96 px apart per slot) leave only 10-18% of the floor length as a plain walk tap at body height (percent free by floor 13/14/15/16/17: 18/18/17/10/15 at the floor line, 11/15/11/10/12 at line-96). The only fully free strip is the floor slab below the line: 30 game px = 15 CSS px tall at 360 wide (100% free), and the upper wall above line-120 (43-53% free). A tap that lands on an object opens its menu instead (the second tap then closes the menu and may hit the next object). The e2e tests had to tap `lineY + 20` to walk.
- **Why it matters:** the stage 2 level data fills almost every slot (16-21 objects per 1440 px wing), so the main control is hard to use in dense rooms. The 96 px minimum for objects and walkable gaps conflict.
- **Likely file:** `src/scenes/TowerView.js` `hitTest` / `targetsOnFloor` (for example hit area = sprite bounds clipped to 96 px only where no neighbour is closer, make the slab band taller, or treat taps above and below the sprite as ground) and/or the level density in `public/data/levels/tower_m2.json`. Needs a decision from game-designer and the Creative Director after a phone playtest.

### BUG-037 · Tutorial arrow points off-screen at the chair and the door, with no direction hint · major (UX)
- **Steps:** `?debug&story`, new game, finish the fridge (hero stands at x 648, camera 127..847). The step becomes "Tap the chair to take it apart." and the arrow is at x 1128. Same at the "Open the door: walk out." step after Barricade Lv1: hero at the workbench (x 888, camera 367..1087), door/arrow at x 1440.
- **Expected:** a first-time player can see what the hint is about (M1 tutorial with arrows stays until stage 4).
- **Actual:** the arrow is a world object, so it is simply off-screen (281 px and 353 px past the view edge). The hint text names the thing but nothing says where; the player has to guess to drag sideways. The other steps (fridge, table, drawer, workbench) are in view. `tests/e2e/story.mjs` does not notice because its helper pans the camera to the target before every tap.
- **Likely file:** `src/scenes/TutorialView.js` (clamp the arrow to the screen edge pointing the right way, or pan the camera to the target when the step changes) and `src/scenes/GameScene.js` `updateTutorial`.

### BUG-038 · The start flat's workbench floats in mid-air · minor (art/data)
- **Steps:** Floor 15, living room, x 888 (screenshot `render-f15-x500-360x800.png`, `crop-workbench.png`).
- **Expected:** a workbench stands on the floor like the table next to it.
- **Actual:** it is hung at wall height (84 px up), legs in the air, with a sofa below it. Data: `f15L-1-wall2`, `"layer": "wall"`, `fixture: true`.
- **Likely file:** `public/data/levels/tower_m2.json` (f15L-1-wall2 layer and slot; moving it to a floor slot also changes the build spots `f15L-spot-living-floor2` x 888) or the fixture drawing in `src/scenes/TowerView.js` (`fx.layer === 'wall' ? WALL_LIFT`).

### BUG-039 · After the app is hidden and shown again the camera stays where it was while the hero is sent home · minor
- **Steps:** `?debug`, go to floor 17 far right (x 2800, camera 2440). Hide the page (visibilitychange hidden), then show it.
- **Expected:** resume cleanly (CLAUDE.md): the player sees their hero.
- **Actual:** `onHide` moves the hero to the bed (floor 15, x 408) but nothing moves the camera: it stays on floor 17 at scrollX 2440 and `following` is false, so the hero is off-screen with no cue. The Home button recovers it. It was already true on 720 px floors for the vertical axis; with 3120 px floors the player lands in an unrelated part of the building.
- **Likely file:** `src/scenes/GameScene.js` `onHide` / the resume handler (call `jumpCameraToHero()` after placing the hero).

### BUG-040 · Padlocked cage menu: the two greyed "Needs crowbar" labels overlap · minor (cosmetic)
- **Steps:** Floor 17 right wing, tap a storage cage with no crowbar (screenshot `loot-cage-padlocked-412x915.png`).
- **Expected:** readable labels.
- **Actual:** both buttons (Search and Dismantle) are greyed with "Needs crowbar" and the two red labels run into each other ("Needs crowtNeeds crowbar"). Search does nothing (correct), the cage stays closed (correct).
- **Likely file:** `src/scenes/ActionMenu.js` (shorten the reason to "Crowbar", or show it once under the header when both buttons share the same reason).

### BUG-041 · Camera numbers in balance.json are not read: `controls.cameraEdgePadPx`; momentum and vertical follow constants are hard-coded · minor
- **Steps:** change `controls.cameraEdgePadPx` (48) in `public/data/balance.json`; nothing changes. The code uses `CAMERA_EDGE_PAD_PX = 48` from `src/gameplay/camera.js`. Also hard-coded: momentum decay `Math.exp(-3.5 * dt)`, minimum speed 8, vertical follow `-6 * dt` (`GameScene.updateCamera`). `cameraDeadzoneXPx`, `cameraLerp`, `cameraFollowPauseSeconds`, `dragThresholdPx` are read correctly.
- **Expected:** CLAUDE.md: numbers live in balance.json (same family as BUG-021 / BUG-030).
- **Likely file:** `src/gameplay/camera.js`, `src/scenes/GameScene.js` (`setScrollX`, `jumpCameraToHero`, `updateCamera`).

### Stage 2 notes (not bugs, for the Producer)
- `/.well-known/assetlinks.json` is not in `dist/` (no `public/.well-known`). Expected until the Creative Director has the PWABuilder key; needed before release.
- `public/data/levels/floors.json` (the M1 layout, 20 KB) is no longer read by any code but is still shipped and precached. Delete when stage 3 is in.
- Floor 17 right wing has 8 padlocked storage cages (`f17R-0-floor0..5`, `f17R-2-floor1/2`): this is the "wall of locks" in GDD 12 open question 3. Each opens only with a crowbar (the crowbar breaks after 20 uses) and one cage in the test rolled "Empty. Someone ate well here once." (a normal-condition empty line on a storage cage reads oddly).
- Placement mode (`Placement.start`) only outlines the spots; it centres the camera on the hero, so spots 300+ px away (start flat: x 1368 and the bedroom window x 312 when the hero is at the workbench; after f15R is cleared: up to 1500 px away) are off-screen with no hint. The player must pan during placement.
- Cleared f15R offers build spots only for slots whose object has been dismantled (by design of `requiresEmptySlot`): none at first.

### Milestone 2 stage 1 QA (uncommitted working tree, e2e build, 360x800 and 412x915, 2026-10-21)

### BUG-028 · Moodle cue sounds never play (wrong sound keys) · major
- **Steps:** `?debug`, tap once, set `__floor15.state.needs.food = 50` (moodle appears and wobbles). Log `scene.sound.play` calls.
- **Expected:** GDD 5.2: each moodle that appears or changes level plays one soft body cue (stomach growl, dry swallow, yawn, pained breath, sigh).
- **Actual:** `MoodleView.wobble` calls `playSfx(scene, 'moodle_' + id)` = `moodle_hungry`, `moodle_thirsty`, `moodle_tired`, `moodle_injured`, `moodle_depressed`. The manifest and files are `moodle_stomach`, `moodle_swallow`, `moodle_yawn`, `moodle_pain`, `moodle_sigh`. `playSfx` skips missing keys silently, so nothing plays and no error shows. Panic (fast heartbeat cue) has no sound at all. Test `it.fails` in `tests/qa-m2s1.test.js`.
- **Likely file:** `src/scenes/MoodleView.js` line 126 (add an id-to-key map).

### BUG-029 · Zombies are not heard before seen: breath/shuffle sounds are never played · major
- **Steps:** `?debug`, tap, go to floor 14 with the crawlers within 600 px, log sound calls for a minute.
- **Expected:** GDD 10: each zombie on the hero's floor within 600 px (`audio.zombieHearRadiusPx`) makes occasional shuffles and low breaths, panned by position, also through walls.
- **Actual:** `zombie_breath_1/2` and `zombie_shuffle` exist but no code requests them; `audio.zombieHearRadiusPx` is read nowhere. Only a groan on aggro plays. Also unused: `amb_rain`, `lamp_hiss`. This is the main creepy-sound promise of stage 1 ("heard before seen"). Test `it.fails` in `tests/qa-m2s1.test.js`.
- **Likely file:** `src/scenes/Soundscape.js` / `src/scenes/Zombies.js` (new positional zombie audio).

### BUG-030 · New attack cue keys in balance.json are ignored · minor
- **Actual:** `attacks.cue.secondGroanAtSeconds` (12), `bangBeatsSeconds` ([8,5,2.5]) and `fightBangGapSeconds` ([2,3]) are in balance.json but `AttackDirector.js` hard-codes `SECOND_GROAN_AT = 12`, `BANG_BEATS` and `2 + rng()` in `Soundscape.updateStair`. Changing the numbers does nothing (same family as BUG-021). Test `it.fails` in `tests/qa-m2s1.test.js`.
- **Likely file:** `src/scenes/AttackDirector.js`, `src/scenes/Soundscape.js`.

### BUG-031 · The x3 unaware hit cannot be reached by sneaking up on a zombie · major (design vs implementation, ask game-designer)
- **Steps:** floor 14, idle crawler at x 330, walk toward it with real taps and tap it when in range.
- **Expected:** GDD 5.4: "the first hit on a zombie that has not noticed the hero deals x3. This is the main tool for thinning rooms."
- **Actual:** sight is 180 px (110 on the landing) in every direction with no facing or sneaking rule, so the zombie always notices the hero 125 px before fist range (40) or 130 px before bat range (55). Measured: first hit does 5 (crawler 20 -> 15, `noticed: true`). The x3 only works on a zombie lured by noise that does not see the hero, which a player cannot set up on purpose (and with sight radius forced to 0 it works: 20 -> 5). The core stealth fantasy of the stage is therefore missing; combat is always the fair fight. Test `it.fails` in `tests/qa-m2s1.test.js`.
- **Likely file:** `src/gameplay/zombies.js` `sees` / `sightRadius` (facing cone, shorter sight when the hero is still or at the zombie's back) or a GDD change.

### BUG-032 · Music after an attack almost never plays · minor
- **Steps:** `?debug&attacks`, let an attack arrive near the hero, kill the attackers (or let the barricade hold). Count `music_sad_*` requests.
- **Expected:** GDD 10: sad music may play after an attack ends.
- **Actual:** `attack-end` calls `soundscape.moment(this.inDanger(), now())` once. `inDanger()` includes `panic.level > 0`, and panic is still 2 at that instant (decays 5 s per level), so the moment is refused and never retried. 0 music plays in 3 runs (`panic 2, danger true`). Music before danger (never during) is respected: none played during the cue or fight. The survivor-recruited moment has the same one-shot check.
- **Likely file:** `src/scenes/GameScene.js` lines 206-207 (wait until danger is over, then try), `src/scenes/Soundscape.js` `moment`.

### BUG-033 · Mara's flat (floor 13) and floor 17 are deadly with fists and very hard with a bat · major (balance, needs game-designer and a human playtest)
- **Steps:** `?debug`, go to floor 13, open the jammed door (3 taps), fight the two walkers behind it by tapping (bot: tap the nearest zombie every 160 ms, step back 50 px when a zombie is within 41 px). Same on floor 17 left (3 walkers at x 280/315/350).
- **Measured (real game loop, 360x800):** floor 13 left, fists: dead 5 of 5 in 8-10 s. Spiked bat: won 5 of 5 but ended with 16, 16, 30, 44, 44 health. Floor 17 left (door open, walkers 150-220 px from the door, so the hero is seen as soon as he steps in), fists: dead 3 of 3 in about 11 s; bat: dead 5 of 6 (one kiting run ended at 100 health). Floor 17 right, bat: won with 16 and 8 health. Floors 14 and 16 with fists: won 3 of 4 with 68-84 health left (one floor 16 run died: two crawlers).
- **Expected:** GDD 5.4 danger check: two walkers with a spiked bat cost about 25-45 health; three aware walkers with fists likely death. Floor 13 is required for the Mara story and comes with the new level-designer groups (2 + 2 walkers + crawler).
- **Actual:** matches the GDD numbers only for the bat on 13. A player who reaches Mara's door with fists (first outing) has no safe plan: running away works (170 vs 26 px/s) but there is no way to separate the two walkers. Floor 17 left cannot be passed at all without a way to split the group, and its right wing (the richest metal) lies behind it.
- **Notes:** a bat needs 3 wood + 1 metal; the tutorial path leaves 1 wood after Barricade Lv1, so the bat needs scavenging first (expected loot on floors 14/16 is about 2 wood-equivalent, see the human playtest list). Two tests were stale after the group change (`tests/combat.test.js`, `tests/e2e/combat.mjs`, `tests/e2e/story.mjs`); QA fixed them to read the authored counts.
- **Likely file:** `public/data/levels/floors.json` (group sizes/positions on 13 and 17) or `balance.json` zombies.

### BUG-034 · No feedback when a double tap falls back to walking (energy below 5) · minor
- **Steps:** set energy 4, double tap the floor.
- **Expected:** GDD 5.4: the hero walks and thinks "I can't run anymore." (once per 20 s).
- **Actual:** he just walks, no line, no sound (verified: speed 76-84 px/s, no text). Thoughts are scheduled for stage 4 (11.3), so this may be intended for now.
- **Likely file:** `src/scenes/GameScene.js` `goTo` (`canRun`).

### BUG-035 · Deprecated sounds are still downloaded and precached (93 KB) · minor
- **Actual:** `queueAudio` loads every manifest key, including `siren`, `alert_sting`, `survivor_blip`, `error`, `amb_tower`, `heartbeat`. They never play (verified in the sound log), they only cost 93 KB of download and cache. (`ui_tap` is not deprecated; it is a soft touch at volume 0.14.)
- **Likely file:** `src/scenes/sfx.js` `queueAudio` (skip `deprecated`), `public/assets/audio/` (delete the files, audio-designer).

### Piece 3b QA (full M1 playthrough, 360x800 and 412x915, e2e build, 2026-10-20/21)

### BUG-014 · A loot pile on the same x as a floor object cannot be picked up · minor
- **Steps:** Floor 16 right flat: dismantle the curtains (f16R-06, x672, wall) with a full bag so the cloth spills as a pile; the wardrobe (f16R-03, x672, floor) still stands (needs crowbar). Tap the pile.
- **Expected:** the pile is picked up.
- **Actual:** hit-test picks the wardrobe (same centre), menu shows "Dismantle / Needs crowbar"; the pile is unreachable until a crowbar is made (screenshot `qa4/shots/17-pile-under-wardrobe-360x800.png`). Wall and floor objects share slot x by design, so this is common.
- **Likely file:** `src/scenes/TowerView.js` `hitTest` (prefer piles over objects, or offset the pile x).

### BUG-015 · Crew and Sound buttons touch each other (0 px gap) · minor (also known from review)
- **Steps:** recruit Mara, look at the bottom bar at 360x800 or 412x915.
- **Actual:** Crew 504..600, Sound 600..696 game px: no gap, a mis-tap toggles sound instead of opening Crew. Other buttons have 24 px gaps.
- **Likely file:** `src/scenes/Hud.js` layout (crewBtn at left+48+8+480).

### BUG-016 · Action-menu reason text "Needs crowbar" runs off the right screen edge · minor
- **Steps:** tap an object at x672 that needs a tool (16R wardrobe).
- **Actual:** red reason text is cut at the screen edge (`qa4/shots/17-pile-under-wardrobe-360x800.png`).
- **Likely file:** `src/scenes/ActionMenu.js` (clamp the label x to the screen).

### BUG-017 · Toast covers the Close button of the Crew panel · minor
- **Steps:** Crew panel, tap Talk. Toast "You talk with Mara. +5 morale" is drawn over Close (`qa4/shots/34-crew-talked-360x800.png`).
- **Likely file:** `src/scenes/Toast.js` / `Hud.js` toastY (same family as fixed BUG-004).

### BUG-018 · Attack countdown banner is hidden while the workbench or bag is open · minor
- **Steps:** during the 60 s warning open the workbench (`qa4/shots/80-warning-with-craft-360x800.png`).
- **Actual:** the panel covers the banner; only a red edge tint shows. The player cannot see the countdown.
- **Likely file:** `src/scenes/AttackDirector.js` depth (above panels) or show the time in the HUD.

### BUG-019 · New game asks "Your saved game will be deleted" after game over · minor
- **Steps:** die, reload the page, tap New game on the title (Continue is correctly hidden).
- **Actual:** the confirm dialog appears for a dead save that cannot be continued.
- **Likely file:** `src/scenes/TitleScene.js` (skip the confirm when `flags.heroDead`).

### BUG-020 · Crew screen has no Treat button (GDD 5.7 Survivor healing, uncommitted GDD edit) · major
- **Expected:** a 96 px Treat button per survivor below 100 health using bandage/medkit.
- **Actual:** only Guard/Scavenger/Tender, Talk, Close. `survivors.treatItems` and `survivors.joinMinMorale` in balance.json are never read. Together with BUG-025 a hurt Mara can never be healed.
- **Likely file:** `src/scenes/SurvivorsPanel.js`, `src/gameplay/survivors.js`.

### BUG-021 · `attacks.tuning.arrivalXRange` is ignored · minor
- **Actual:** code reads `spawnXMin/spawnXMax` (defaults 16/70); the balance.json key does nothing. Test `it.fails` in `tests/qa-piece3b.test.js`.
- **Likely file:** `src/gameplay/attacks.js` `ATTACK_TUNE_DEFAULTS` / `attackTuning`.

### BUG-022 · Away-report attack line is wider than the popup · minor
- **Steps:** away 12 h with an attack at 11 h 30 min: "Attack 11 h 30 min in: strength 150 vs defense 40" spans x6..714 on a 596 px panel (`qa4/shots/51-offline-long-line-360x800.png`). With "defense 100" it is cut by the screen edge. Even "Attack 2 h in: strength 112 vs defense 40" touches the panel border.
- **Likely file:** `src/gameplay/report.js` `attackLines` (split into two lines) or Popup word wrap. Test `it.fails` in `tests/qa-piece3b.test.js`.

### BUG-023 · Interrupted (hidden mid-attack) strength is not "remaining attackers x 10", and it does not count toward maxOfflineResolves · minor
- **Actual:** `round(strength x left/total)`: scheduled 25 with 1 of 3 killed gives 17, GDD gives 20. `settleInterrupted` runs outside `makeAttackHook`, so it never counts toward the max of 2.
- **Likely file:** `src/gameplay/attacks.js`, `GameScene.applyOffline`.

### BUG-024 · Mara takes the Medical bag even with no free Survivor bed (GDD 5.7 hand-over, uncommitted GDD edit) · minor
- **Actual:** bag consumed, quest +10, she says "I need somewhere to sleep." GDD: she says "I need a bed first." and the bag stays; hand-over is an explicit Use. Test name in `tests/survivors.test.js` ("keeps the bag") contradicts its own asserts. Also: picking the bag up before ever talking to her works and the first talk hands it over at once.
- **Likely file:** `src/gameplay/survivors.js` `interactSurvivor`.

### BUG-025 · Survivors never regain health (GDD 5.7 Survivor healing) · major (also known from review)
- **Steps:** Mara at 10 health after a breach, wait 4 h offline: still 10, while the hero regenerated +8. `healthRegenPerHour` is never read.
- **Likely file:** `src/gameplay/survivors.js` (`tickUpkeep`/catch-up and online tick).

### BUG-026 · Pass the torch: Mara keeps the dead hero's food/water/energy · minor (also known from review)
- **Steps:** hero dies at food 12 / water 14 / energy 33. Mara continues with exactly those, and gets "You're parched" at once. GDD: start values 80/80/100.
- **Likely file:** `src/gameplay/survivors.js` `passTorch`.

### BUG-027 · e2e flakiness · minor (test infra)
- `npm run test:e2e` once failed `craft` with EADDRINUSE on port 4181 and once reported a 404 console error in `combat` (both passed on rerun, 3 of 3). `story.mjs` failed once ("scripted attack was repelled", then every later Mara check): the barricade broke while tapping was slow (known, ~12 s). Fix: let the test raise the barricade HP/strength or wait for fps, and use random free ports.
- **Likely file:** `tests/e2e/*.mjs`.


### BUG-012 · Loaded saves are not clamped: barricade HP above max, unknown level, negative HP, producer stored above maxStored · minor (robustness, piece 3a)
- **Steps:** Put `build.barricade = {level: 1, hp: 9999}` (or `level: 7`, or `hp: -20`) or a planter record `stored: 99, progress: -5` into the save, reload. Same happens when the designer lowers a barricade HP in balance.json for an existing save. Unit tests in `tests/qa-piece3a.test.js` (marked `it.fails` until fixed).
- **Expected:** `normalizeGameState` clamps hp to 0..max of the level, drops unknown levels, clamps stored to maxStored and progress to >= 0.
- **Actual:** values are kept as they are: the HUD shows e.g. "9999/100", Repair says "full HP", level 7 gives a barricade that blocks zombies but has 0 max HP and 0 defense; the `barricade_lv7` frame name has no art (frame -1).
- **Likely file:** `src/gameplay/gameState.js` `normalizeBuild`.

### BUG-006 · Throwing a molotov cancels a dismantle/search that is past 50% · minor
- **Steps:** `?debug&give=molotov:2` on floor 14, dismantle the sofa (f14L-01, 4 s). At about 85% progress tap Throw, then tap the floor inside the circle.
- **Expected:** GDD 4 rules: a new tap cancels the current action except a search or dismantle past 50%, which completes first.
- **Actual:** `throwing.handleTap` calls `s.cancelAction()` unconditionally; the dismantle is lost (sofa not dismantled, no yield) and the molotov is used.
- **Likely file:** `src/scenes/Throwing.js` `handleTap` (use `interruptAction`-style check or queue the tap like `onWorldTap` does) and the order in `GameScene.onWorldTap` (throw check runs before the 50% rule).

### BUG-007 · Wanderers can spawn inside the home apartment · minor (known from code review, confirmed in code, not played)
- **Steps:** Clear floor 15, wait 12 h (or `state.wanderAt[15]` in debug).
- **Expected:** a wandering walker should not appear in the player's home (GDD 5.3 gives no exception, so ask game-designer; Secure floor is the intended fix).
- **Actual:** `pickSpawnX` range is stairwell+60 .. width-40, which includes the home apartment (x 120-420).
- **Likely file:** `src/gameplay/wanderers.js` `pickSpawnX`; design decision needed.

### BUG-008 · tests/e2e/combat.mjs flaky: first bite wait times out · minor (test bug, fixed)
- **Steps:** run `npm run test:e2e` right after a build in headless Chromium (software GL, ~15 fps). Once: "crawler floor 14: zombie bit the hero" FAIL.
- **Cause:** Phaser clamps frame delta to 16.7 ms for the first 120 frames (`loop._coolDown`), so at 15 fps game time runs at ~27% of wall time and the crawler needs far longer than the 12 s wait.
- **Fix applied in tests/:** wait for `game.loop._coolDown <= 0` before starting. Passed 3 of 3 runs afterwards.
- **Note:** same slow-motion happens on a real slow phone for the first 2 s to 8 s after load or after returning from background; human should check it does not feel odd.

### BUG-009 · `?debug&give=` works in the production build · minor (known, confirmed)
- **Steps:** open the built `npm run preview` page with `?debug&give=molotov:3`; items appear and `window.__floor15` exists.
- **Expected:** debug hooks only in dev builds (or a hidden switch).
- **Actual:** `location.search.includes('debug')` enables them in production; the items are re-granted on every reload.
- **Likely file:** `src/scenes/GameScene.js` (`import.meta.env.DEV || location.search...`).

### BUG-005 · Buttons fall below 48 CSS px on phones narrower than 360 px · minor
- **Steps:** Open the game at 320x568 (small Android) in portrait.
- **Expected:** tap targets at least 48x48 CSS px (CLAUDE.md).
- **Actual:** the 720x1280 canvas scales to 0.444, so the 96 game px buttons are 42.7 CSS px. At 360 wide they are exactly 48; at 393 52; at 412 55 (all fine).
- **Likely file:** `src/main.js` (fixed 720x1280 logical size) / `src/scenes/ui.js` (button size). Low priority, tell the producer; could be handled by larger buttons when the scale is below 0.5.

## Fixed
### BUG-013 · Craft panel keeps a recipe selected that is on another page · minor (UX, piece 3a) · FIXED (verified piece 3b: paging clears the selection)
- **Steps:** Open the workbench (first recipe Spiked bat is selected), tap Next twice.
- **Expected:** the detail pane and Craft button refer to something visible, or paging selects the first recipe of the page.
- **Actual:** the page shows Water filter / Purify water / Planter while the detail pane and the Craft button are for the off-screen Spiked bat (`qa3/f-craft-p3-360x800.png`). Works, but a tap on Craft after paging crafts a recipe the player is not looking at.
- **Likely file:** `src/scenes/CraftPanel.js` `turn` / `open`.

### BUG-011 · Craft panel: last status message hides the greyed reason and the Build button stays grey with no explanation · minor (cosmetic, piece 3a) · FIXED (verified piece 3b: reason now shown under the status)
- **Steps:** Craft Barricade Lv1 in the workbench panel. Stay on that recipe.
- **Expected:** detail pane explains why Build is grey ("Already built").
- **Actual:** the detail pane keeps showing the amber status "Barricade Lv1 built." (screenshot `qa3/b-barricade-damaged-412x915.png`) while the button is greyed; the red reason ("Already built") shows only in the row. The status also survives panel paging.
- **Likely file:** `src/scenes/CraftPanel.js` `addDetail` (`msg = this.status || reason`; show the reason when the button is disabled, or clear status after the redraw).

### BUG-010 · New home buildSpots layout in floors.json is not supported by the code: Rain collector cannot be built, spots sit on furniture, 5 unit tests red · major (found piece 3a, uncommitted level-designer edit, 21:32) · FIXED (verified piece 3b: rain collector built on window spot w1 after f15_right cleared and window pane dismantled; 2 window + 4 floor spots; unit tests green)
- **Steps:** Take the working tree with the changed `public/data/levels/floors.json` (home `buildSpots`: `"window": []`, floor spots s1 x168 / s2 x270, plus new `f15_right.buildSpots` with `availableWhen`, `countsAsHome`, `requiresEmptySlot`). `npm run build:e2e`, open `?debug`, give 3 plastic + 2 metal, open the workbench.
- **Expected:** every placeable recipe has a spot (GDD 5.6: 2 window + 4 floor home spots); spots only usable once the furniture in that slot is gone (`requiresEmptySlot`), spots in the right flat only once it is cleared (`availableWhen`).
- **Actual:** Rain collector greyed "No free window spot" (0 window spots exist), so a Milestone 1 recipe cannot be crafted. `homeSpots()` reads only the home apartment, ignores `requiresEmptySlot`/`availableWhen`/`countsAsHome`: Planter or Filter can be placed on the standing chair (x168) and table (x270) (screenshot `qa3/j-new-spots-chair-still-there-360x800.png`). Only 2 floor spots reachable, so Water filter + Planter + Survivor bed cannot all be built. `npm test`: 5 failures in `tests/crafting.test.js` (home has 2 window and 4 floor spots, places a rain collector, survivor bed counts, dismantle refunds, offline catch-up produces) and 1 in `tests/qa-piece3a.test.js` (regression guard "every placeable recipe has a spot"); `npm run test:e2e` craft.mjs fails at the rain collector step (FAIL rain_collector: craft button enabled / placement mode starts / two window spots are highlighted). With the previous floors.json (committed version) everything passes at 360x800 and 412x915.
- **Likely file:** `src/gameplay/building.js` `homeSpots` / `freeSpots` (needs to read `countsAsHome` apartments, `availableWhen: apartment_cleared`, `requiresEmptySlot` against `state.objects[..].dismantled`) AND `public/data/levels/floors.json` (window list is empty: the rule text says no free window room in the left flat, but window_pane x468 / curtains x570 are only usable after f15_right is cleared and dismantled). Producer decision needed: either the programmer implements the new schema or the level-designer reverts to the old positions.

### BUG-001 · Jammed door tap area is 72x96 game px, below the 96 px minimum · minor · FIXED (verified piece 2 in Chromium 360x800 and 412x915)
- **Steps:** `?debug` on floor 15. In the console: `__floor15.view.targetsOnFloor(15).find(t => t.type === 'door')` and read `halfW`. Or tap 40 game px left or right of the door centre (x=430) on a 360x800 phone.
- **Expected:** every tap target is at least 96x96 game px (`controls.minHitAreaPx`, GDD 5 / CLAUDE.md 48x48 CSS px).
- **Actual:** door targets have `halfW: 36`, so the hit area is 72x96 game px = 36x48 CSS px at 360 px wide. Same for f13_left, f14_right, f17_right. Taps near the edge of the visible door (sprite is 48 wide) fall through to ground-walk or to a neighbouring object.
- **Likely file:** `src/scenes/TowerView.js` (`targetsOnFloor`, door entry `halfW: 36`; use 48).

### BUG-002 · Long frame gap path applies offline catch-up without the 12 h cap · minor · FIXED (verified piece 2 in Chromium 360x800 and 412x915)
- **Steps:** `?debug`. Move the clock forward 20 h without any visibilitychange (for example Chrome DevTools clock override, or phone clock changed while the page stays "visible"). Wait 2 s.
- **Expected:** elapsed time is capped at `time.offlineCapHours` (12 h) and the popup says "Only the first 12 h counted" (GDD 5.1).
- **Actual:** popup says "Away for 20 h", food 80 -> 20, water 80 -> 0, no cap notice. The whole gap is applied.
- **Likely file:** `src/scenes/GameScene.js` `tickClock()` (`if (gap > 30000) { this.applyOffline(gap, false); ... }`). Cap with `offlineCapMs()` and pass `capped = gap > cap`.
- **Note:** the normal background -> resume path IS capped correctly (tested 30 h away -> 12 h, 3 h, 12 h, starving).

### BUG-003 · Clock moved backwards freezes needs until the clock catches up · minor · FIXED (verified piece 2 in Chromium 360x800 and 412x915)
- **Steps:** `?debug`. Move the clock back 1 h (DevTools override or system clock) while the game is running. Watch `__floor15.state.needs` for a minute.
- **Expected:** a backwards clock is treated as 0 elapsed (GDD 5.1) and ticking continues from the new time.
- **Actual:** `state.times.lastTickAt` stays 1 h in the future, so the gap is negative on every frame and needs stop draining for the next hour (and for N hours if the clock moved back N hours). Setting the phone clock back is a trivial way to freeze hunger and thirst.
- **Likely file:** `src/scenes/GameScene.js` `tickClock()`. The `if (gap < 0) { state.times.lastTickAt = t; return; }` branch is unreachable because `if (gap < tickSeconds * 1000) return;` runs first and is true for negative gaps. Swap the order.

### BUG-004 · Toast draws on top of the Bag / Stockpile panel and hides item slots · minor · FIXED (verified piece 2 in Chromium 360x800 and 412x915)
- **Steps:** Go home. Open Bag, tap the Stockpile tab (40 slots, panel is tallest). Tap Store all, or use an item, so a toast appears.
- **Expected:** the toast does not cover slots or the item description while the panel is open (or the toast moves above the panel).
- **Actual:** the toast (depth 3000, y = bottom bar - 200) is drawn over the last grid rows of the stockpile (the 7th row of slots is half covered, see `stockpile.png`). The toast text itself is readable but the slots are hidden for 2.6 s.
- **Likely file:** `src/scenes/Toast.js` / `src/scenes/Hud.js` (`toastY`), or `src/scenes/InventoryPanel.js` panel height.


## Piece 2 QA result (Chromium 360x800 and 412x915, touch)
Passed: zombies on 13/14/16/17 present and animated (idle/walk/attack); sight aggro 200 px inclusive, none through jammed doors; noisy 400 px (399 yes, 402 no), loud whole floor, never other floors, quiet none; bite <50% cancels, >=50% completes; one tap = one swing, cooldown 0.4/0.35/0.5 s, 1 buffered tap; damage fists 5, knife 10, bat 14, low energy 4; energy 0.5/swing; knockback 12; bites crawler 5 and walker 8 every 1.5 s; equip/unequip via real bag taps; durability counts and breaks to fists with toast; molotov arm/cancel/out-of-range/other floor/Home, 300 px range, 120 px patch, 4 s, kills zombies, 10/s on hero, loud noise; jammed door 3 hits cost 1.5 energy; CLEARED needs zombies dead and all containers; wanderers 1-2 walkers per 12 h, cap 3, online and offline; hide mid-throw and mid-melee (hero home, bottle returned, zombies reset); death -> game over -> reload still game over -> New game fresh (no leftover zombies, items, listeners, objects over 7 restarts); reload keeps dead zombies dead and hp; zombie in front of an object takes the tap; two fingers, drag on zombie, rotation; lethal bite plus killing blow in same frame shows game over once; 0 console errors. FPS in software GL is ~16 with or without 8 zombies; AI update costs 0.03 ms/frame.
Not covered: scripted tutorial crawler (nothing emits `tutorial_open_door` yet), real phone feel.

## Checked and fine (no bug)
- Boot to home on floor 15 at 360x800, 393x873, 412x915 with no console errors (only Chromium software WebGL warnings in headless).
- Tap-walk, chair/table dismantle (wood 2 + 4), fridge search (fixed loot), drawer menu, stairs between floors (1.2 s per floor), vertical drag scroll with inertia and 2 s follow pause, jammed door (3 hits, crowbar pry 1 s), bag panel Use item, Store all at home only, sleep (tap to wake, auto-wake at full), double-tap Home within 1 s, reload keeps inventory, objects, doors, rooms and mute.
- Offline math matches balance.json: 3 h -> food 71, water 68, morale 57; 12 h from 80/80 -> food 44, water 32 (auto-use of a water bottle once below 40 gives 67), morale 48, energy +10/h; starving 12 h -> health floors at 10; 30 h away is capped to 12 h with the notice; under 60 s no popup.
- Rapid taps (15 taps on one chair, 20 alternating ground taps, 8 menu taps) produce no duplicate loot or errors; two-finger tap and pinch do not zoom or break input; 10 quick reloads fine; rotating to landscape and back keeps the canvas fitted and input working.
- PWA: manifest linked and valid, three icons exist at listed sizes, service worker registers and controls the page, 29 files precached (art, data, JS), game boots offline.

## Piece 3a QA result (Chromium 360x800 and 412x915, touch, e2e build)
Tested against the committed floors.json layout (window w1 x230 / w2 x350, floor s1-s4) because floors.json was changed mid-test (BUG-010).
All 14 recipes craft with correct output/effect via real taps; greyed reasons exact; bag-then-stockpile payment; placement and cancel free; persistence across reload; producers online and offline (12 h cap, maxStored, planter water from stockpile only, dirty first, filter queue 6); Use/Collect/Load/Dismantle refunds; barricade block/damage/damaged sprite/break/repair/hero passes; Secure floor stops wanderers online and offline; craft panel and floor picker have no overlap and all targets >= 96 game px (48 CSS px at 360); tutorial path (chair + table + drawer -> Barricade Lv1, no debug items); double/triple tap, hide during placement/picker, rotation, repeated new game; no console errors. Scripts are not kept in the repo (scratch); `tests/e2e/craft.mjs` and `tests/qa-piece3a.test.js` stay.

## Piece 3b QA result (Chromium 360x800 and 412x915, touch, e2e build, no debug items)
Full ?debug&story playthrough with real taps took about 20 min wall time in software GL (~16 fps): title, 3 intro cards, tutorial (all 8 hints readable, never block taps, Skip 130x96 works and starts the 10 min clock), tutorial crawler, scripted attack online (warning banner with countdown, flicker, 2 attackers, repelled), 16/14/13 explored, Mara talked to, bag, Survivor bed, she joins, Crew jobs/Talk, Steady hands +22, f15_right cleared, rain collector on a window spot, floor 16 Secured. Offline: breach (112 vs 40, hero and Mara floored at 10, 7 stacks lost, report lines), 12 h cap, upkeep consumed/missed (-10, floor 10), scavenger 6 rolls in 12 h, hide mid-attack settles remainder. Pass the torch: card, bag pile and body at death spot, Mara controllable, Mara dead -> game over -> New game -> intro. Reload resumes at tutorial walk/chair/workbench/door/fight, warning and mid-fight. All hit areas >= 96 game px. 0 console errors (only software WebGL warnings). `npm test`: 317 passed + 6 expected-fail (new `tests/qa-piece3b.test.js`).

## Milestone 2 stage 1 QA result (Chromium 360x800 and 412x915, touch, e2e build)
Passed: no need bars or numbers in HUD, panels, toasts, away report, barricade, zombies (only wall-painted floor numbers, bag slot count "1/10" and craft material counts "0/3"); 4 moodle levels exact at every threshold, worst first, wobble 0.5 s, tap card with one line, Eat / Drink / Use bandage work; attack cue timeline measured against fake arrival: groans T-14.3 and T-11.9, shuffle and first bang T-7.9, bangs T-4.9 / T-2.5, flicker from T-7.9, no banner/countdown text or object; attack ends silently when attackers die; nap cancelled at T-8 with no cooldown; run by double tap (153 px/s, 0.16-0.2 energy/s, noise aggroes a zombie 240 px away and not one 270 px away, stops below 5, walks at energy 4); unaware hit x3 (20 -> 5 when lured); lose track after 8 s and 500 px; barricade 5 distinct visual stages and word toasts; prose away report; "Nothing."/"Someone got here first." on empty containers; no music during the cue or fight; deprecated sounds never played; no sound before the first tap; context suspends on hide; save survives reload; 4 h hidden applied on resume; 40 rapid taps, two fingers, rotation, 4 quick reloads fine; 0 console errors. `npm test` 377 passed + 4 expected fail; `npm run test:e2e` green twice (after fixing three stale hard-coded zombie counts).
Note: headless Chromium runs the game at a few fps while driven by CDP, so a real 0.3 s double tap could only be tested by queuing both taps in one frame; the timing window itself is covered by unit tests only.

## Milestone 2 stage 2 QA result (Chromium 360x800 and 412x915, touch, e2e build)
Passed: `npm run build`, `npm test` (433 passed incl. new `tests/qa-m2s2.test.js` data checks), existing `npm run test:e2e` (smoke, combat, craft, story: 188 checks green) and story.mjs again at 412x915 (107 green; `E2E_VIEW=412x915`). New scripts `tests/e2e/s2-*.mjs` (helper `tests/e2e/stage2.mjs`, not in run.mjs): stale M1 save popup (v1, v1 without game.v; corrupt and empty saves give no popup; popup does not return after reload), spawn at the bed with camera centred, tap-walk with dead zone (camera starts moving at hero offset 163-169, never past 171, speed 100 px/s), horizontal pan bounds -48 and 2448, momentum respects both bounds (fling injected, see limits below), axis lock (x-dominant diagonal moves only x, y-dominant only y, a drag that turns horizontal stays on y), follow pause 1.9 s after a drag then follow resumes, vertical scroll range is only 300 px (whole 5-floor tower fits the 720x1280 view), every floor 13-17 and both units screenshot at 7 scroll positions (wall modules per room type, burned f16R, ransacked f13R/f14L, doorways, windows with rain, shaft with light and floor numbers all draw), jammed front doors (f13L, f15R, f16R) and the interior bathroom door stop the hero from both sides and block chasing zombies from both sides (landing side too), 3 taps open a door, crowbar pry works, empty containers show prose by condition, fixedLoot (fridge, drawer), notes on first search (empty and normal containers), padlocked cage greyed without crowbar and opens with one, tutorial chain through Barricade Lv1 and the landing crawler (story.mjs), attack on the wide layout (shaft light flickers, attackers appear on the stairs, walk to the home door at x 1440, stop at 1452, hit the barricade), Mara path (jammed bathroom door, Novak wardrobe bag, bed, recruit; story.mjs), f15R cleared becomes home (latched, Store all works, survivor bed placed there after a slot is freed), wanderers online and after 12 h offline (inside the wings, cap 3), edge slots x 72 and 3048 are tappable, the menu stays on screen and the hero walks to x 30, two fingers (second finger ignored), 30 rapid taps, rotation to landscape and back, 5 New games and 5 reloads (no leaked sprites, zombies or listeners), no console errors anywhere, PWA (manifest linked, 126 precache entries, boots offline in the production build).
Walk times (hero 100 px/s, run 170, stairs 1.4 s per floor): far end of a wing to the stairs 15.0 s (9.0 s running); floor 13 far right to floor 17 far left 35.7 s.
FPS: software GL headless runs the whole 5-floor tower (468 of 698 objects rendered every frame) at 12-25 fps, same as the stage 1 baseline (~16); not a phone number.
Limits: CDP touch events arrive about 3 per second in this environment, so real fling feel, smoothness of the lerp and thumb ergonomics cannot be judged here; momentum was checked by injecting velocity and with in-page TouchEvents (works, clamps at both bounds).


## Isometric Stage A QA result (Chromium 360x800 and 412x915, touch, e2e build, software GL, 2026-10-21)
Passed: `npm run build`, `npm test` (518 tests: 497 existing + 21 new in `tests/qa-isoA.test.js`), `npm run test:e2e` (smoke, iso, new `tests/e2e/iso-qa.mjs`). New unit tests: Grid.hasLOS equals an independent doubled-integer segment test for 131,212 tile pairs of the real floor 15 (0 differences, corners block as the GDD says); the visible set equals close circle (1.5) or cone by the hero's light and range by the target's light, with LOS, for 1.2 million tile/facing combinations (0 differences); Panic and Tired L3 shrink the view; memory persists and round-trips, a wrong size is ignored; sound ripple limits; floor 15 data (3 zombies on walkable room tiles, bed/workbench/front door, every object has a balance entry and loot table, no overlaps, every door has furniture-free tiles on both sides, front doors closed or jammed, 25-80% of interior doors closed, every walkable tile reachable from the bed when doors are forced, every object has a free neighbour tile, light values known); iso save (stale flag, junk repaired, hero on void moved back, door state and damage round trip, fresh state flags).
Browser (real touches, CDP touches for hold and drag): start in the bedroom with "Dark in here."; tap to walk (2 tiles/s), double tap runs (needs two taps within 0.3 s, the second after the first started a walk), hold 0.5 s then slide turns the hero and release keeps the facing, drag pans in both axes and clamps at the floor box, tap the hero turns 180, Home once re-centres and twice walks to the bed through the front door; fridge Search (about 3 s, +1 canned food), chair (+2 wood, no menu) and table (+4 wood) dismantle, drawer (+2 metal), workbench opens the craft panel, Barricade Lv1 (5 wood, 2 metal, hp 120) shows planks on the home front door, front door opens, corridor; Hollis NE door jammed: Force with 3 hits (noisy, radius 8) or 1.4 s with a crowbar (20 uses left of 20-1); sneak up on the walker facing away: first fist hit 15 (x3) from 1.44 tiles before it notices; interior door dismantle with a crowbar (+5 wood, +1 metal, loud: all three zombies hunt), broken door not tappable; stash panel; bed menu Sleep/Nap (nap +30 energy, food -5), sleep wakes on tap; hold-to-look while searching keeps the search running; stairs: "The stairs are blocked."; hide (visibilitychange) sends zombies home and resets chases, 2-3 h away counted with the popup; reload keeps hero tile and facing, inventory, searched/dismantled objects, all door states, vision memory, zombie hp and deaths, needs; old side-view save shows "The building has changed." once and drops the game; Continue works after a real session; game over, New game, Intro, game again 3 times with no leaked objects (1390 scene objects every time); killing the last zombie and dying in the same frame gives one game over, floor Cleared; a dead save reloads to game over and has no Continue.
Vision: zombies are drawn only on Visible tiles with line of sight (5 soak runs of 25-70 s with random teleports, door toggles and noise: 0 violations in about 350 zombie draws; screenshots from 8 positions in `qa-isoA/vis-*.png`); a closed door hides the room behind it (`cd-3-closed-door.png`); remembered tiles draw no zombies, decals or fire (corpse exception: BUG-043); walls never cover the hero (sweep of all 481 walkable tiles with the game's own occluder test: 0 hidden; bounds-based sweep only touches wall corners) or a visible zombie (70 random hero/zombie pairs: 0 covered); depth order checked at the table, chair, bed, wardrobe, sofa (hero behind a table gets covered, in front is not); stubs for south/east walls of every active room (`occ-4-2.png`, `c1-living-east.png`); doors in stub walls stay tappable.
Zombies (step simulation with the real AI): a loud noise 12+ tiles away makes the walker walk through the flat, bang the closed front door for about 10 s (120 -> 92 hp, x0.4 per hit) and go home; a hunting walker breaks a 60 hp interior door in 24 s and then bites 14 every 2.2 s; it loses track 8 s after the hero is out of sight and 8 tiles away; zombies never open doors; pop-in is a 0.15 s fade; closing a door with a zombie in the doorway: "Something's in the way."
Input and mobile: 40 random rapid taps, 6 rapid Search taps (no duplicate loot), two-finger pinch (no zoom, no pan, input still works), second finger during a hold, rotation to landscape (canvas letterboxed 202x360, back to portrait fits 360x640 centred, taps work), `touch-action: none` and `maximum-scale=1`, audio suspended and locked before the first tap and running after it, bottom bar buttons 48x48 CSS px at 360 and 55 at 412 (hit area), action menu buttons 48x48 / 55x55, hero never under the bottom bar. PWA: manifest linked, icons 192/512/maskable exist, service worker registers and controls the page, loads offline; dist 3.3 MB.
Tap accuracy: 99.9% of 2520 visible art pixels of all 83 objects open the right target; 93% of 161 real touches on random visible art pixels of the start flat's objects at both sizes (the misses were pixels of an object partly hidden behind a nearer one, which rightly goes to the nearer one: 99.9% when those are excluded); doors: BUG-042.
FPS: software GL runs 19-27 fps (idle and walking, 412x915), JS frame cost avg 0.2 ms idle / 0.33 ms walking (max 2.8 ms) of `update`; 1390 display objects. This says nothing about a phone's GPU: needs a phone check (GDD: 30+ fps).
Not covered: real feel, brightness on a real screen, sound, performance on a phone, Android back-swipe zone, notch.


## Joystick QA result (Chromium 360x800 and 412x915, real multi-touch via CDP, e2e build, 2026-10-22)
Passed: `npm run build`; `npm test` 537; `npm run test:e2e` (smoke, iso, iso-qa) after the two test fixes above; no console errors in any run.
Stick zone: a touch in the lower-left 55% x 55% above the bottom bar starts the stick (checked at the edges: x 390 yes / 410 no, y 582 yes / 570 no, 8 px above the bar yes); the right side, the Home and Bag buttons and the action-menu buttons do not; the ring appears under the thumb (alpha 0.89 after 25 ms, 1.0 after 50 ms) and is gone 120 ms after release (0.66, 0.35, 0.07, 0); the ring is drawn inside the screen near edges. 8 directions: screen right/down-right/down/down-left/left/up-left/up/up-right move the hero exactly that way on screen (0, 45, 90, 135, 180, -135, -90, -45 degrees) with the right 8-direction sprite. Bands (measured with in-page timestamps, open corridor): below 0.15 nothing; 0.20 and 0.375 creep 1.00-1.01 tiles/s; 0.43 and 0.67 walk 1.97-2.01; 0.72, 0.8, 1.0 and beyond run 3.36-3.41 (0.2 energy/s). Footsteps: creep one step per 0.62 s at volume 0.13, walk 0.46 s at 0.32 (ratio 0.4), run 0.34 s at 0.72. Noise: creep and walk emit none; run emits Noisy radius 5 once per second only while moving. Stealth: a creeping hero walked up to 0.80 tiles behind an idle walker without being noticed, walking was noticed at 0.80 (behind radius 0.9), running woke it from 2.3 tiles by its noise. Tired: at energy 3 a run push walks and shows "I can't run anymore." once. Release stops at once (no glide); he keeps his facing. Doors: walk or creep into a closed door opens it after 0.18 s; running into it bursts it open at once with Noisy radius 4; a jammed door shows "It's stuck." (repeats at most every 1.5 s). Sliding along walls, the sofa and the stairs flight works; he stops 0.8 tiles from a zombie (circles). Short tap in the zone still acts (door taps 4/4 in the zone); a drag outside the zone starts Look and does not pan; stick push cancels an auto-walk to a door (walk and pending cleared); with the stick held a second finger on a zombie in reach swings (unaware x3: 45 -> 30), on a zombie out of reach (2.2 tiles) or on an object does nothing; Menu Joystick side toggle mirrors the zone (right zone sticks, left does not), look-drag then works on the left half, the setting `joystickSide` is saved, survives reload and New game; hide (visibilitychange) during a run push clears the stick (hero stops, a ghost finger move after resume does nothing, a new touch works); opening the bag mid-push and dying mid-push both stop the hero.
Doorway assist and collision: 637 in-window doorway approaches 99%; fuzz of 150,000 random stick steps on floor 15: never in an unwalkable tile, never through a wall, no jumps (the wall-corner clip is BUG-047).
Sound: 170 s idle: no looping sound playing at the end and none between gusts; `sound.play/add` calls: wind loop at 37 s (a gust), muffled thud 71 s, rain gust 78 s, distant groan 91 s, pipe knock 140 s; RMS above -80 dBFS in 32% of the samples. The earlier zombie voice problem is fixed (0.09 behind walls, 0.44 at 3 tiles).
Edits to the tests by the programmer: `stage1.test.js` bounds 25-70 match `audio.ambientGapSeconds` [25, 70] in balance.json and the code (fine). `iso-qa.mjs` look-drag edit is correct (moves 60 px, inside the right half) but once failed in a full run (the search had already finished before the drag; timing); it passed in 3 other runs.


## Context-button controls QA result (Chromium 360x800 and 412x915, real multi-touch via CDP, 2026-10-22)
Passed: `npm run build`, `npm test` (600), `npm run test:e2e` (smoke, iso, iso-qa; iso-qa at 412x915 has one KNOWN), no console errors in any script.
Controls: the world takes no touches (taps, double taps, a drag and a 1 s press on a zombie, the hero and empty floor changed nothing: no action, walk, swing, turn, camera move; both sizes); a quick double tap in the stick zone turns 180 degrees (0 -> 180), two taps 0.6 s apart do nothing; the turn band (d 0.2) turns to 90 degrees with no step, no footstep, no noise and does not open a door, creep (d 0.3) into the door opens it; the Home first tap only presses, the second walks, the stick (even the turn band) cancels it; a turn-band push does not cancel a search, creep does before 50%; fridge target gives Search on Main and a greyed Dismantle (needs a wrench), after the search Main is the greyed empty icon ("Nothing left.") and 6 rapid Main taps start nothing and make no noise; a chair shows Dismantle on Main and 3 rapid taps start one dismantle; a zombie coming into reach steals the target from the fridge within 114 ms and shows Attack and Shove; Attack at the air costs 0.5 energy, no noise; stick held plus Attack held: the stick keeps moving the hero and swings repeat (3 in 1.5 s); Main/Secondary/Attack/Quick-use pressed while the stick is held work; iso.mjs covers shove (0.5 tiles, 2.5 s cooldown, "Not yet."), hold repeat, quick-use "Not now.", long-press picker, molotov arm and throw, doors Open/Close/Force x3 and "It's stuck.", barricade ghost Place/Cancel; Menu "Stick: Right" mirrors the arc exactly and the stick zone, Attack works there with the stick held, and it survives a reload; footsteps follow the floor (tile in kitchens and bathrooms, wood in bedrooms, concrete in the corridor), search and door sounds play, ambient is one-shots only.
Not covered: feel of the button arc under a real thumb, outline visibility on the phone, whether a 0.25 s tap window for the double tap suits real fingers, performance.
