# Task Board

> Maintained by the Producer (main Claude Code session).

## Milestone 1 – Playable on your phone
- [x] Interview the Creative Director and fill GDD sections 1–12 (game-designer)
- [ ] Creative Director: answer GDD section 12 open questions
- [x] Set up Vite + Phaser, folder layout, scaling, core systems (engine-programmer)
- [x] Unit tests and browser smoke test set up (qa-tester)
- [x] GitHub Pages auto-deploy, share playtest link (engine-programmer) — live at https://nzervos693-dev.github.io, confirmed on phone
- [x] Core loop with touch controls (gameplay-programmer)
  - [x] Piece 1: tower, movement, salvage, inventory, needs, offline
  - [x] Piece 2: zombies, tap combat, door hits, sound
  - [x] Piece 3: crafting, barricades, attacks, Mara, tutorial
- [x] Floors 13–17 and loot tables (level-designer)
- [x] Placeholder art (art-generator)
- [x] Sounds and ambience (audio-designer)
- [x] QA pass (qa-tester)
- [ ] Creative Director playtest on phone

## Milestone 2 – "The tower breathes" (atmosphere + tower rework, from M1 playtest)
Delivered in playable stages; work lives on the dev branch until each stage is playable, then merges to main.
- [x] Record CD answers in GDD: double-tap run, silhouettes in unexplored rooms, staged delivery (game-designer)
### Stage 1 – Mood, UI, sound, attack cue
- [x] Darker desaturated art pass, moodle icons, 5-stage barricade damage, light-pool sprites (art-generator)
- [x] Quiet creepy soundscape: wind/creaks, distant groans, stairwell banging, sparse music; remove UI blips (audio-designer)
- [x] Moodles replace bars/numbers; no floating text or HP labels; diegetic 15 s attack cue; zombie rebalance + stealth hits; scarcer loot; double-tap run; balance v2 keys (gameplay-programmer)
- [x] Review + QA, merge to main
- [x] CD playtest of stage 1 (creepier, cue fine, 13/17 fair, icons never show text)
- [x] Blood splash + weapon hit sounds (CD request)
### Isometric rebuild (CD direction change: Zomboid-like iso view, vision cone, claustrophobia)
Side-view Stage 2 archived on branch archive/m2-side-view-stage2.
- [x] Iso GDD, balance keys, iso core (projection, grid, A*, vision, camera)
- [x] Iso art Stage A, blueprints + authored floor 15
- [x] Stage A: playable isometric floor 15 (review + QA passed, fixes merged)
- [x] CD playtest of Stage A (controls hard → joystick)
- [x] Floating joystick: creep/walk/run, turn in place, wall slide (CD: "much much better")
- [x] Natural audio: no hum, one-shot ambience, surface footsteps
- [x] More human-like zombies (art)
- [x] Context buttons (Main/Secondary/Attack/Quick-use), no world taps (on main 7e9c982)
- [x] HQ direction recorded in GDD 5.19–5.21 (sandbox floor 15, structures/traps, firearms) + balance keys
- [x] HQ art: wall/door/window tiers, damage overlays, traps, rubble, shoot anim, muzzle flash, icons
- [ ] Stage C2: HQ building on floor 15 (build/demolish/upgrade walls, doors, windows; claim floor; attacks probe weak spots)
  - [x] Piece 1: structure model + build/demolish/upgrade rules, save
  - [x] Piece 2: build mode, edge targeting, ghost, claim the floor, structure art (BUG-051 fixed)
  - [ ] CD playtest of HQ building
  - [ ] Piece 3: attacks on floor 15 probe weak spots (incl. partial wall re-bake on HP hits; door art on structures.damageStages)
  - [ ] Leftovers for piece 3: vault/climb broken windows, barricade in picker, heart in HQ, merged-unit stash + pooled HQ stash, zombie damage on built doors/walls → gap
  - [ ] Minor: rebuilt-to-block wall art changes on reload (genTier); broken glass loads at 1 HP
- [ ] Follow-ups: close BUG-050 in QA e2e; move stairs-blocked 0.5 to balance; fallback tests for craftingPanel
- [ ] Stage B: floors 13–17, stairs, attacks, Mara, tutorial
- [ ] Stage C: generator + claiming homes
- [ ] Stage C3: traps + firearms (pistol, shotgun; hunting rifle M3)
- [ ] Stage D: lighting, notes, tutorial polish

### Stage 2 – Wide floors + horizontal camera (superseded by isometric rebuild)
- [ ] Engine/camera for 3120 px floors, axis-locked drag (engine-programmer + gameplay-programmer)
### Stage 3 – Random apartments + claiming homes
- [x] templates.json, room types, new objects, loot tables (level-designer)
- [ ] Seeded generator, save v2, claim any cleared unit, per-home barricade, attacks target main home (gameplay-programmer)
### Stage 4 – Lighting + polish
- [ ] Room lighting, oil lamp, silhouettes, notes/flavour text, arrow-free tutorial

## Milestone 3 – Ready for testers
- [ ] PWA: manifest, icons, offline service worker (engine-programmer, art-generator)
- [ ] Title screen, settings (sound on/off), save high score/progress (gameplay-programmer)
- [ ] Write docs/RELEASE.md: PWABuilder → Android package steps (engine-programmer)
- [ ] Creative Director: create Google Play developer account ($25)
- [ ] Creative Director: package with PWABuilder, add assetlinks.json, upload to a closed test
- [ ] Recruit at least 12 testers who stay opted in for 14 days in a row
- [ ] Optional: publish the web version on itch.io for early feedback

## Milestone 4 – Release on Google Play
- [ ] Fix tester feedback and bugs
- [ ] Store listing: icon, feature graphic, screenshots, description (art-generator, game-designer)
- [ ] Privacy policy page (required by Google Play; the game collects no data in v1)
- [ ] Final QA pass (qa-tester)
- [ ] Creative Director: apply for production access and publish

## Done
