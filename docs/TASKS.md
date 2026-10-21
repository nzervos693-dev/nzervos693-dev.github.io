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
- [ ] Record CD answers in GDD: double-tap run, silhouettes in unexplored rooms, staged delivery (game-designer)
### Stage 1 – Mood, UI, sound, attack cue
- [ ] Darker desaturated art pass, moodle icons, 5-stage barricade damage, light-pool sprites (art-generator)
- [ ] Quiet creepy soundscape: wind/creaks, distant groans, stairwell banging, sparse music; remove UI blips (audio-designer)
- [ ] Moodles replace bars/numbers; no floating text or HP labels; diegetic 15 s attack cue; zombie rebalance + stealth hits; scarcer loot; double-tap run; balance v2 keys (gameplay-programmer)
- [ ] Review + QA, merge to main, CD playtest
### Stage 2 – Wide floors + horizontal camera
- [ ] Engine/camera for 3120 px floors, axis-locked drag (engine-programmer + gameplay-programmer)
### Stage 3 – Random apartments + claiming homes
- [ ] templates.json, room types, new objects, loot tables (level-designer)
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
