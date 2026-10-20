# Game Design Document

> Owned by the game-designer agent. The Creative Director has final say.
> Working title: **"Floor 15"** (placeholder, see Open questions).
> Items marked **[ASSUMPTION]** are designer proposals awaiting Creative
> Director sign-off.

## 1. Pitch
A post-apocalyptic zombie survival sandbox seen as a side cutaway of a
30-story apartment tower. You wake up in your apartment in the middle of an
outbreak; tap to scavenge neighbouring apartments, fight zombies with quick
taps, keep yourself fed, rested and sane, take in a few survivors, and
reclaim the tower floor by floor. Time keeps passing while you're away, and
your barricades must hold.

## 2. Platform
- Android phones (PWA + PWABuilder -> Google Play); also any phone browser.
- Orientation: **portrait**, locked.
- Base game resolution: **720x1280**, Phaser `Scale.FIT`, centered,
  `pixelArt: true`. HUD respects safe-area insets (notches): top HUD and
  bottom bar are offset by `env(safe-area-inset-*)`.
- Typical session: **1-5 minutes** (check needs, one scavenging run or one
  attack, assign survivors, close). Designed for 3-6 check-ins per day.
- Tap targets: at least 48x48 CSS px. On a typical 400 CSS px wide phone,
  1 game px is about 0.55 CSS px, so every tappable thing has a hit area of
  at least **96x96 game px** (sprites smaller than that get a padded,
  invisible hit area).
- Audio starts only after the first tap (the title screen "Tap to start").
- Download target under 20 MB (expected under 5 MB: code-made/pixel art,
  compressed audio).

## 3. Core loop
1. **Check in**: read the "While you were away" report (needs, production,
   attacks resolved offline).
2. **Tend**: eat, drink, sleep, collect production (rain water, planters),
   build/repair barricades at the workbench.
3. **Scavenge**: tap a room on another floor; the hero walks there, fights
   zombies by tapping them, searches containers, carries loot home.
4. **Grow**: recruit survivors through their quests, clear and secure
   floors, unlock new builds.
5. **Defend**: when an attack is telegraphed, fight it at the stairwell
   barricade; or let defenses auto-resolve it while you're offline.

## 4. Touch controls
One thumb, taps and vertical drags only. No hold-to-act, no multi-touch.

| Gesture | Where | Result |
|---|---|---|
| Tap | Empty spot in a room | Hero walks there (pathing via stairwell if on another floor). |
| Tap | Object (container, bed, fridge, workbench, door, survivor) | Hero walks to it and interacts automatically on arrival. |
| Tap | Zombie | If in weapon range: attack now. If out of range: walk toward it, attack once on arrival. |
| Vertical drag | Anywhere on the tower | Scrolls the camera between floors. A drag over 16 game px is a scroll, not a tap. Momentum scrolling, clamped to floors 1-30. |
| Tap | "Home" button (bottom bar) | Camera jumps to the hero; second tap within 1 s sends the hero home. |
| Tap | Bottom bar buttons | Inventory, Build, Survivors, Pause/Settings. |

Rules and edge cases:
- A new tap cancels the current walk/interaction (except a search already
  past 50% completes, to avoid accidental loss).
- Attack taps during weapon cooldown are buffered: at most **1** buffered
  attack.
- Taps on dark (unexplored) rooms move the hero to that room's door.
- Taps on rooms of a floor behind an intact barricade the hero hasn't opened
  are ignored and show a small "Barricaded" label.
- The camera auto-follows the hero while walking unless the player dragged
  in the last 2 s.

## 5. Mechanics
All numbers below are starting values and **will move to
`public/data/balance.json`** (key in brackets). Programmers must not
hard-code them.

### 5.1 Time and the idle simulation
- Game time = real time. Simulation is computed from elapsed real time
  (`Date.now()` deltas), never from frame counts.
- Online: simulation ticks every **1 s** (`time.tickSeconds`).
- On resume/launch: elapsed = now - lastSaveTime. If elapsed < 0 (clock
  changed backward) treat as 0. Elapsed is capped at **12 h**
  (`time.offlineCapHours`) **[ASSUMPTION]**; time beyond the cap is simply
  lost (the world "pauses").
- Offline catch-up runs in **10-minute steps** (`time.offlineStepMinutes`)
  so stockpile auto-use and attacks resolve in order. Max 72 steps, fast.
- When the app goes to background (`visibilitychange` hidden): save
  immediately; any fight in progress is abandoned, the hero and survivors
  are moved home, zombies keep their current HP and return to their rooms.
- Autosave every **10 s** (`time.autosaveSeconds`) and on every floor change,
  build, and attack end. Save is localStorage, one slot.

### 5.2 Needs (hero and the active character)
Each need is 0-100. Drain is per real hour.

| Need | Start | Drain/h online | Drain/h offline | Restored by |
|---|---|---|---|---|
| Health | 100 | 0 (see below) | 0 | Bandage +15, Medkit +40, regen |
| Food | 80 | 3 (`needs.food.drain`) | 3 | Canned food +30, Dry snack +15, Planter crop +20 |
| Water | 80 | 4 (`needs.water.drain`) | 4 | Water bottle +35, Rain water +20 |
| Energy | 100 | 6 awake (`needs.energy.drain`) | -10 (regen, asleep) | Bed: +25/h online |
| Morale | 60 | 1 (`needs.morale.drain`) | 1 | Events (see below) |

- **Health regen**: +2/h (`needs.health.regen`) while food, water > 50 and
  energy > 20.
- **Empty need**: each need at 0 (food, water, energy) costs **5 health/h**
  (`needs.emptyNeedDamage`), stacking.
- **Low energy** (< 20): move speed and damage -30% (`needs.energy.lowPenalty`).
- **Morale effects**: < 25 -> damage -20% and energy drain x1.5; survivors
  refuse quests. > 75 -> damage +10%.
- **Morale events**: survivor recruited +15, quest done +10, talk to a
  survivor +5 (once per survivor per 12 h), "comfort" item (cigarettes,
  chocolate, radio battery) +10, attack repelled +5, barricade breached -10,
  survivor dies -20.
- **Auto-use offline**: during catch-up, when food or water drops below
  **40** (`needs.autoUseThreshold`) the character consumes the smallest item
  from the home stockpile that restores it. Online there is no auto-use
  except a one-time "You're starving: eat?" prompt.
- **Offline safety [ASSUMPTION]**: offline simulation never kills a
  character. Health cannot drop below **10** (`needs.offlineHealthFloor`)
  during catch-up. Death only happens while the player is watching.
- Fairness check: with full stockpile neglect, 12 h offline drains at most
  36 food / 48 water, so a player at 80/80 never wakes to an empty need.
- **Sleep**: tap bed -> hero sleeps (+25 energy/h); any tap wakes him.
  While the app is closed, characters at home count as asleep.

### 5.3 Movement and the tower
- 30 floors, each **720x240 game px**: stairwell (120 px wide, left) + two
  apartments (300 px each). About 5 floors are visible at once.
- Hero walk speed **120 px/s** (`hero.walkSpeed`); stairs take **1.2 s per
  floor** (`hero.stairSecondsPerFloor`).
- Hero's apartment is on **floor 15** **[ASSUMPTION]**.
- Floor states: **Infested** (zombies, dark rooms) -> **Cleared** (no
  zombies, all containers searched) -> **Secured** (stairwell doors
  barricaded via build). Unexplored rooms are drawn dark until entered.
- Cleared-but-unsecured floors get **1-2 wandering walkers every 12 h**
  (`world.wandererIntervalHours`). Secured floors never respawn zombies.
  Infested floors do not respawn; killed zombies stay dead.
- Some apartment doors are jammed: **3 hits** (`world.jammedDoorHits`) to open.

### 5.4 Combat
- Each tap on a zombie in range = one attack. Damage and range come from
  the equipped weapon; there's a cooldown between attacks.
- Hits knock the zombie back **12 px** and flash it white for 80 ms.
- Zombies aggro when the hero enters their room or comes within **200 px**
  (`zombies.aggroRadius`) on the same floor; they never use stairs except
  during attacks.

| Weapon | Damage | Range px | Cooldown s | Durability (hits) |
|---|---|---|---|---|
| Fists | 5 | 40 | 0.4 | infinite |
| Kitchen knife | 10 | 45 | 0.35 | 40 |
| Lead pipe | 16 | 60 | 0.6 | 60 |
| Fire axe | 30 | 65 | 0.9 | 80 |

| Zombie | HP | Speed px/s | Damage | Attack interval s | In milestone 1 |
|---|---|---|---|---|---|
| Crawler | 15 | 25 | 5 | 1.5 | yes |
| Walker | 30 | 40 | 8 | 1.5 | yes |
| Runner | 20 | 110 | 6 | 1.0 | no |
| Brute | 120 | 25 | 20 | 2.0 | no |

- Zombie attack range: 30 px (`zombies.attackRange`).
- Each hero swing costs **0.5 energy** (`combat.energyPerSwing`).
- Broken weapon reverts to fists; a "weapon broke" toast shows.

### 5.5 Scavenging and inventory
- Containers (fridge, cupboard, wardrobe, desk, bathroom cabinet) have 1-3
  loot rolls from a per-container table (owned by level-designer).
- Tap container -> hero searches for **2 s** (`scavenge.searchSeconds`),
  progress ring shown; costs **1 energy**. A zombie aggroing interrupts it.
- Hero carries **8 slots** (`inventory.carrySlots`); items stack to 10.
- Home stockpile: **40 slots** (`inventory.stockpileSlots`), +20 per
  storage shelf built. Entering the home apartment offers "Store all".
- Full inventory: loot stays in the container, marked with a dot.

### 5.6 Building (workbench in the home apartment)
| Build | Cost | Effect |
|---|---|---|
| Barricade Lv1 / Lv2 / Lv3 | 5 wood + 2 nails / 10 wood + 5 nails + 3 scrap / 15 scrap + 8 nails | Home-floor stairwell barricade, HP 100 / 250 / 500, defense +10 / +25 / +50 |
| Barricade repair | 1 wood per 20 HP | Restores HP |
| Rain collector | 4 scrap + 2 plastic sheet | +1 Rain water every 3 h (max 4 stored) |
| Planter | 3 wood + 1 seeds | +1 Planter crop every 6 h (max 3 stored) |
| Storage shelf | 6 wood + 2 nails | +20 stockpile slots |
| Survivor bed | 6 wood + 1 cloth | Needed for each survivor to move in |
| Secure floor | 8 wood + 4 nails + 2 scrap | Cleared floor -> Secured; defense +5 each |

Building is instant once the hero is at the workbench.

### 5.7 Survivors
- Few, named, hand-written characters (dialogue, one personality trait,
  one recruitment quest each). They live on specific floors.
- Recruit: talk -> complete their quest -> they need a free Survivor bed,
  then move into the home apartment.
- Each survivor has Health (0-100) and shares the home stockpile: they eat
  **1 food item + 1 water item every 12 h** (`survivors.upkeepHours`). If
  unavailable, they lose 10 health and household morale -5.
- Jobs (assign from the Survivors screen, one job each):
  - **Guard**: +15 defense (`survivors.guardDefense`).
  - **Scavenger**: offline only, 1 loot roll from a cleared floor every
    2 h (`survivors.scavengeIntervalHours`).
  - **Tender**: rain collector and planter output +50%.
- **Pass the torch**: when the active character dies, the player picks a
  living survivor who becomes the active character (same needs, controls,
  inventory slots; the dead character's carried items drop as a bag at the
  death spot). No survivors left = game over.

### 5.8 Attacks
- Scheduled every **8 h +/- 2 h** (`attacks.intervalHours`,
  `attacks.jitterHours`). First attack is scripted, **10 min** after the
  tutorial ends.
- Attack strength A = **30 + 3 x days survived**, capped at **150**
  (`attacks.baseStrength`, `attacks.perDay`, `attacks.cap`).
- **Online (telegraphed)**: 60 s before (`attacks.warningSeconds`), a red
  banner with countdown, a distant moan sound and flickering lights. Then
  A / 10 zombies (rounded up, walkers; runners/brutes later) climb the
  stairwell to the home floor and hit the barricade. The player fights them.
  Attack ends when all are dead. If the barricade falls, zombies enter the
  apartment.
- **Offline (auto-resolve)**: defense D = barricade defense + guards x 15 +
  secured floors x 5 + 10 (the active character).
  - D >= A: repelled. Barricade loses A x 0.5 HP.
  - D < A: breached. Barricade HP -> 0, shortfall S = A - D. Each resident
    takes S / 2 damage (health floor 10), and S / 10 random stockpile
    stacks are lost (rounded down).
  - At most **2** attacks resolve per catch-up (`attacks.maxOfflineResolves`).
- Report lists each attack: time, strength vs defense, damage, losses.

### 5.9 Death and game over
- Online death -> pass the torch screen (5.7). Game over screen shows days
  survived, floors reclaimed, zombies killed; "New game" deletes the save.

## 6. Progression and difficulty
- **Long-term goal**: reclaim all 30 floors (all Secured) -> "Stronghold"
  celebration screen; the sandbox continues afterwards with attacks still
  running.
- Difficulty rises with distance from floor 15: floors 13-17 crawlers and
  walkers; 8-12 and 18-22 add runners; 1-7 and 23-30 add brutes and more
  zombies per room. Better loot (axes, medkits) deeper/higher.
- Attack strength grows with days survived (5.8); defenses grow with
  barricade levels, secured floors and guards.
- Unlocks: builds unlock as their materials are first found; survivors
  unlock jobs.
- Saved: full world state, timestamp, settings (sound, music), stats.

## 7. Content
| | Milestone 1 (slice) | Version 1 (release) |
|---|---|---|
| Floors | 5 (13-17), hero on 15 | 30 |
| Zombie types | Crawler, Walker | + Runner, Brute |
| Weapons | Fists, knife, pipe | + Fire axe |
| Items | ~12 (canned food, dry snack, water bottle, rain water, bandage, medkit, wood, nails, scrap, plastic sheet, cloth, chocolate) | ~25 |
| Builds | Barricade Lv1-2, repair, rain collector, survivor bed, secure floor | All in 5.6 |
| Survivors | 1 | 4 |
| Attacks | 1 scripted + scheduled walker attacks | Full scaling |

Survivor names, personalities and quests are written by game-designer and
level-designer; placeholder for milestone 1: **"Mara", floor 13, a nurse
hiding in a bathroom; quest: fetch her medical bag from floor 14**
**[ASSUMPTION]**.

## 8. Screens and flow
1. **Title**: logo, "Tap to start" (unlocks audio).
2. **New game**: 3 short text lines over the dark apartment ("You wake up.
   Sirens. Something is scratching at the door."), then play.
3. **Tutorial by doing (first ~60 s)**: arrow points at the fridge (tap ->
   find canned food) -> at the door (tap -> corridor) -> a crawler appears
   (tap it to hit) -> at the workbench (build Barricade Lv1 from wood +
   nails placed in the apartment). One-line hints only, no text walls.
4. **Returning**: "While you were away" report (skippable with one tap),
   then the tower.
5. **Play**: tower view, top HUD (5 need bars, day counter, attack timer
   when telegraphed), bottom bar (Home, Inventory, Build, Survivors, Menu).
6. **Pause/Menu**: sound on/off, music on/off, resume. Note: pausing does
   not stop real time.
7. **Pass the torch** -> pick survivor -> play.
8. **Game over** -> stats -> New game.
9. **Stronghold** (all 30 floors secured) -> continue sandbox.

## 9. Art style
- Pixel art, gritty, dark and muted; flickering lights (random 50-150 ms
  dips on corridor lamps, more during attacks).
- Art drawn on a 3x grid: 1 art pixel = 3 game px.
- Sprites: characters **16x24** art px (48x72 game px); zombies 16x24
  (Brute 24x32); tiles/props **16x16**; floor = 240x80 art px.
- Outline: 1 px darkest-palette outline on characters and interactables
  only; backgrounds unoutlined.
- Palette:

| Use | Hex |
|---|---|
| Near-black / outline | `#0d0f12` |
| Shadow concrete | `#1f242b` |
| Wall concrete | `#3a4048` |
| Light concrete | `#6b7178` |
| Rust brown | `#6e3b23` |
| Dried blood | `#7a1f1f` |
| Warning red (UI, attack) | `#c0392b` |
| Lamp amber | `#e0a24a` |
| Zombie skin green | `#6f7f4f` |
| Pale skin | `#c9a98a` |
| Hero jacket teal | `#2f5d62` |
| UI text off-white | `#d8d4c8` |

- Interactables get a slow amber pulse so they read as tappable.
- **App icon**: the dark tower silhouette against a sickly green-grey sky,
  one lit amber window near the middle; 512x512, readable at 48 px.

## 10. Audio
- Mood: tense, lonely, quiet. Silence is part of the design.
- Music: 2 short ambient drone loops (apartment / exploring), 1 tense loop
  for attacks. Total audio under 3 MB.
- SFX: footsteps, stair steps, door open, jammed door hit, search rustle,
  item pickup, punch, blade hit, pipe hit, weapon break, zombie moan (idle),
  zombie aggro, zombie death, hero hurt, barricade hit, barricade break,
  build/hammer, eat, drink, attack warning siren, lamp flicker buzz, UI tap.

## 11. Scope for version 1
**In**: everything in sections 1-10 for the Version 1 column of section 7.
**Milestone 1 (first playable)**: hero's apartment + floors 13-17, tap
movement, scavenging, tap combat, all 5 needs, offline catch-up, 1
survivor, 1 scripted attack plus scheduled attacks, save/load.

**Out of version 1**: ads, in-app purchases, accounts, cloud saves,
multiplayer or any online feature, push notifications, leaderboards,
multiple save slots, crafting beyond the build list, outside-the-tower
areas, day/night cycle tied to the clock, weather, vehicles, voice acting.

## 12. Open questions for the Creative Director
1. **Game title**: "Floor 15" is a working placeholder. Your preference?
2. **Hero name/identity**: unnamed "you" vs a named hero (placeholder none).
3. **Offline cap of 12 h** [ASSUMPTION]: OK, or longer (24 h) / shorter (8 h)?
4. **Offline can't kill** [ASSUMPTION]: health floors at 10 offline; deaths
   only happen while playing. OK, or should neglect be lethal?
5. **Need drain pace** [ASSUMPTION]: food empties in ~27 h, water ~20 h of
   neglect. Too harsh, too soft?
6. **Hero's floor = 15** [ASSUMPTION]: middle of the tower, so you explore
   both up and down. OK?
7. **First survivor "Mara" (nurse)** [ASSUMPTION]: fine as placeholder, or
   do you have characters in mind?
8. **Outbreak backstory / setting** (city, era, cause): not defined; do you
   want any lore beyond the intro lines?
9. **Stronghold ending**: just a celebration screen, or a story ending
   (e.g. rescue, radio contact)?
