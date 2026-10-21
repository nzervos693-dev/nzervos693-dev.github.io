# Bug List

> Filed by qa-tester. Format: ID · title · severity · steps · expected · actual · likely file.

## Open

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
