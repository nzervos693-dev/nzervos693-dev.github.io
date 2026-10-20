# Bug List

> Filed by qa-tester. Format: ID · title · severity · steps · expected · actual · likely file.

## Open

### BUG-010 · New home buildSpots layout in floors.json is not supported by the code: Rain collector cannot be built, spots sit on furniture, 5 unit tests red · major (found piece 3a, uncommitted level-designer edit, 21:32)
- **Steps:** Take the working tree with the changed `public/data/levels/floors.json` (home `buildSpots`: `"window": []`, floor spots s1 x168 / s2 x270, plus new `f15_right.buildSpots` with `availableWhen`, `countsAsHome`, `requiresEmptySlot`). `npm run build:e2e`, open `?debug`, give 3 plastic + 2 metal, open the workbench.
- **Expected:** every placeable recipe has a spot (GDD 5.6: 2 window + 4 floor home spots); spots only usable once the furniture in that slot is gone (`requiresEmptySlot`), spots in the right flat only once it is cleared (`availableWhen`).
- **Actual:** Rain collector greyed "No free window spot" (0 window spots exist), so a Milestone 1 recipe cannot be crafted. `homeSpots()` reads only the home apartment, ignores `requiresEmptySlot`/`availableWhen`/`countsAsHome`: Planter or Filter can be placed on the standing chair (x168) and table (x270) (screenshot `qa3/j-new-spots-chair-still-there-360x800.png`). Only 2 floor spots reachable, so Water filter + Planter + Survivor bed cannot all be built. `npm test`: 5 failures in `tests/crafting.test.js` (home has 2 window and 4 floor spots, places a rain collector, survivor bed counts, dismantle refunds, offline catch-up produces) and 1 in `tests/qa-piece3a.test.js` (regression guard "every placeable recipe has a spot"); `npm run test:e2e` craft.mjs fails at the rain collector step (FAIL rain_collector: craft button enabled / placement mode starts / two window spots are highlighted). With the previous floors.json (committed version) everything passes at 360x800 and 412x915.
- **Likely file:** `src/gameplay/building.js` `homeSpots` / `freeSpots` (needs to read `countsAsHome` apartments, `availableWhen: apartment_cleared`, `requiresEmptySlot` against `state.objects[..].dismantled`) AND `public/data/levels/floors.json` (window list is empty: the rule text says no free window room in the left flat, but window_pane x468 / curtains x570 are only usable after f15_right is cleared and dismantled). Producer decision needed: either the programmer implements the new schema or the level-designer reverts to the old positions.

### BUG-011 · Craft panel: last status message hides the greyed reason and the Build button stays grey with no explanation · minor (cosmetic, piece 3a)
- **Steps:** Craft Barricade Lv1 in the workbench panel. Stay on that recipe.
- **Expected:** detail pane explains why Build is grey ("Already built").
- **Actual:** the detail pane keeps showing the amber status "Barricade Lv1 built." (screenshot `qa3/b-barricade-damaged-412x915.png`) while the button is greyed; the red reason ("Already built") shows only in the row. The status also survives panel paging.
- **Likely file:** `src/scenes/CraftPanel.js` `addDetail` (`msg = this.status || reason`; show the reason when the button is disabled, or clear status after the redraw).

### BUG-012 · Loaded saves are not clamped: barricade HP above max, unknown level, negative HP, producer stored above maxStored · minor (robustness, piece 3a)
- **Steps:** Put `build.barricade = {level: 1, hp: 9999}` (or `level: 7`, or `hp: -20`) or a planter record `stored: 99, progress: -5` into the save, reload. Same happens when the designer lowers a barricade HP in balance.json for an existing save. Unit tests in `tests/qa-piece3a.test.js` (marked `it.fails` until fixed).
- **Expected:** `normalizeGameState` clamps hp to 0..max of the level, drops unknown levels, clamps stored to maxStored and progress to >= 0.
- **Actual:** values are kept as they are: the HUD shows e.g. "9999/100", Repair says "full HP", level 7 gives a barricade that blocks zombies but has 0 max HP and 0 defense; the `barricade_lv7` frame name has no art (frame -1).
- **Likely file:** `src/gameplay/gameState.js` `normalizeBuild`.

### BUG-013 · Craft panel keeps a recipe selected that is on another page · minor (UX, piece 3a)
- **Steps:** Open the workbench (first recipe Spiked bat is selected), tap Next twice.
- **Expected:** the detail pane and Craft button refer to something visible, or paging selects the first recipe of the page.
- **Actual:** the page shows Water filter / Purify water / Planter while the detail pane and the Craft button are for the off-screen Spiked bat (`qa3/f-craft-p3-360x800.png`). Works, but a tap on Craft after paging crafts a recipe the player is not looking at.
- **Likely file:** `src/scenes/CraftPanel.js` `turn` / `open`.

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
