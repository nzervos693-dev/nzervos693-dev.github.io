# Game Design Document

> Owned by the game-designer agent. The Creative Director has final say.
> Title: **"Floor 15"**.

## 1. Pitch
A post-apocalyptic zombie survival sandbox seen as a side cutaway of a
30-story apartment tower. You wake up in your apartment in the middle of an
outbreak. **Everything around you is a resource**: the sofa is cloth and
wood, the fridge is metal and parts, the water heater holds the last clean-ish
water on the floor, a dead houseplant is seeds. Tap to scavenge and tear
apart neighbouring apartments, fight zombies with quick taps, turn the
pieces into weapons, barricades, planters and water filters, take in a few
survivors, and reclaim the tower floor by floor. Time keeps passing while
you're away, and your barricades must hold.

**Pillars**
1. **Everything is salvage**: nearly every object can be searched, drained or
   dismantled into materials that keep you alive (section 5.6).
2. **The tower lives without you**: real-time needs, production and attacks.
3. **Reclaim floor by floor**: each secured floor is visible, permanent
   progress toward the story ending.

### Backstory
Nine days ago an infection the radio called "the grey fever" hit the city:
fever, two days of sleep, then the infected wake up hungry and wrong. The
tower's residents were evacuated by bus to a stadium shelter.

You missed it. Down with flu and sleeping pills, you slept through the
knocking, the sirens and the buses. You wake alone on floor 15: power
flickering on the backup generator, no water pressure, something scratching
at the door. Neighbours turned, apartments were left mid-meal, a few people
hid instead of leaving. Short found notes (one or two lines each) tell the
rest: the evacuation, the shelter going silent on the radio, Mara's last
clinic shift. Nobody is coming; whatever you need, you build from what the
building already holds.

### Story ending (all 30 floors Secured)
1. Securing the last floor unlocks the final recipe, **Rooftop beacon**
   (5.6): the roof antenna mast rebuilt from salvaged parts and cable.
2. Building it plays 5-6 one-line text cards over the tower: the hero
   climbs to the roof, the beacon lights, the radio hisses.
3. A reply: survivors holding the river docks, who had been broadcasting
   to nobody, saw the light. Yours is the only lit building in the city.
4. Final card: every tower window lit, a small convoy at the base, one
   epilogue line per recruited survivor (e.g. Mara runs a clinic on floor
   13), then stats (days, zombies killed, objects salvaged).
5. The sandbox continues ("The tower is a beacon now"), attacks still run;
   the ending can be replayed from the Menu.

## 2. Platform
- Android phones (PWA + PWABuilder -> Google Play); also any phone browser.
- Orientation: **portrait**, locked.
- **720x1280** base, Phaser `Scale.FIT`, centered, `pixelArt: true`. Top
  HUD and bottom bar offset by `env(safe-area-inset-*)`.
- Session **1-5 minutes** (needs, one run or attack, close); 3-6 check-ins
  per day.
- Every tappable thing has a hit area of at least **96x96 game px** (about
  48 CSS px on a 400 CSS px wide phone); small sprites get a padded hit area.
- Audio starts on the first tap ("Tap to start"). Download under 20 MB
  (expected under 5 MB).

## 3. Core loop
1. **Check in**: read the "While you were away" report (needs, production,
   attacks resolved offline).
2. **Tend**: eat, drink, sleep, collect production (rain water, filtered
   water, planter crops), repair barricades.
3. **Scavenge and salvage**: go to another floor, fight zombies by tapping
   them, search containers, drain water tanks and pipes, and dismantle
   furniture, doors and appliances into materials. Choose what to carry home
   (8 slots) and how much noise to risk.
4. **Craft**: at the home workbench turn materials into weapons and tools,
   barricades, food (planters) and water (collectors, filters). Better tools
   open up bigger objects to dismantle, feeding the next run.
5. **Grow**: recruit survivors through their quests, clear and secure
   floors, push toward the rooftop beacon.
6. **Defend**: when an attack is telegraphed, fight it at the stairwell
   barricade; or let defenses auto-resolve it while you're offline.

## 4. Touch controls
One thumb, taps and vertical drags only. No hold-to-act, no multi-touch.

| Gesture | Where | Result |
|---|---|---|
| Tap | Empty spot in a room | Hero walks there (pathing via stairwell if on another floor). |
| Tap | Object | Opens the **action menu** above the object (see below). |
| Tap | Zombie | If in weapon range: attack now. If out of range: walk toward it, attack once on arrival. |
| Vertical drag | Anywhere on the tower | Scrolls the camera between floors. A drag over 16 game px is a scroll, not a tap. Momentum scrolling, clamped to floors 1-30. |
| Tap | "Home" button (bottom bar) | Camera jumps to the hero; second tap within 1 s sends the hero home. |
| Tap | Bottom bar buttons | Inventory, Workbench, Survivors, Pause/Settings. |

**Action menu**: up to 2 buttons, each **96x96 game px** (icon + label),
side by side above the object (below it if it would leave the screen):
**Primary** (*Search* containers, *Drain* water sources, *Use* bed,
workbench, planter, collector, survivor; only if available) and
**Dismantle**. If a needed tool is missing, Dismantle is greyed with
"Needs crowbar" and does nothing. A button tap sends the hero; the action
starts on arrival. A tap elsewhere closes the menu and counts as a normal
tap. Objects with exactly one action skip the menu and act directly.

Rules: a new tap cancels the current walk/action, except a search or
dismantle past 50% completes. At most **1** attack tap is buffered during
cooldown. Taps on dark rooms walk to the room's door; taps behind an
unopened barricade show "Barricaded". The camera follows the walking hero
unless the player dragged in the last 2 s.

## 5. Mechanics
All numbers below are starting values and live in
`public/data/balance.json` (key in brackets). Programmers must not
hard-code them.

### 5.1 Time and the idle simulation
- Game time = real time, from `Date.now()` deltas, never frame counts.
  Online tick every **1 s** (`time.tickSeconds`).
- On resume/launch: elapsed = now - lastSaveTime. If elapsed < 0 (clock
  changed backward) treat as 0. Elapsed is capped at **12 h**
  (`time.offlineCapHours`); time beyond the cap is lost (the world "pauses").
- Offline catch-up runs in **10-minute steps** (`time.offlineStepMinutes`)
  so stockpile auto-use, production and attacks resolve in order.
- When the app goes to background (`visibilitychange` hidden): save
  immediately; any fight, search or dismantle in progress is abandoned (no
  progress kept), the hero and survivors are moved home, zombies keep their
  current HP and return to their rooms.
- Autosave every **10 s** (`time.autosaveSeconds`) and on every floor change,
  craft, dismantle and attack end. Save is localStorage, one slot.

### 5.2 Needs (hero and the active character)
Each need is 0-100. Drain is per real hour.

| Need | Start | Drain/h online | Drain/h offline | Restored by |
|---|---|---|---|---|
| Health | 100 | 0 (see below) | 0 | Bandage +15, Medkit +40, regen |
| Food | 80 | 3 (`needs.food.drain`) | 3 | Canned food +30, Dry snack +15, Planter crop +20 |
| Water | 80 | 4 (`needs.water.drain`) | 4 | Water bottle +35, Clean water +20, Dirty water +20 (see 5.6) |
| Energy | 100 | 6 awake (`needs.energy.drain`) | -10 (regen, asleep) | Bed: +25/h online |
| Morale | 60 | 1 (`needs.morale.drain`) | 1 | Events (see below) |

- **Regen** +2 health/h (`needs.health.regen`) while food, water > 50 and
  energy > 20. Each empty need costs **5 health/h** (`needs.emptyNeedDamage`).
- **Energy < 20**: speed and damage -30% (`needs.energy.lowPenalty`).
  **Morale < 25**: damage -20%, energy drain x1.5, survivors refuse quests;
  **> 75**: damage +10%.
- **Morale events**: survivor recruited +15, quest done +10, talk to a
  survivor +5 (once per survivor per 12 h), "comfort" item (cigarettes,
  chocolate, radio battery) +10, first harvest of each planter +5, attack
  repelled +5, barricade breached -10, survivor dies -20.
- **Auto-use offline**: below **40** food or water (`needs.autoUseThreshold`)
  the character eats/drinks the smallest fitting stockpile item (clean
  water before dirty). Online: only a one-time "You're starving: eat?".
- **Offline safety**: catch-up never kills; health floors at **10**
  (`needs.offlineHealthFloor`). Death only happens while playing.
- Fairness: 12 h offline drains at most 36 food / 48 water, so 80/80 never
  wakes to an empty need.
- **Sleep**: tap bed -> sleep (+25 energy/h); any tap wakes. Closed app =
  characters at home are asleep.

### 5.3 Movement and the tower
- 30 floors, each **720x240 game px**: stairwell (120 px wide, left) + two
  apartments (300 px each). About 5 floors are visible at once.
- Hero walk speed **120 px/s** (`hero.walkSpeed`); stairs take **1.2 s per
  floor** (`hero.stairSecondsPerFloor`).
- Hero's apartment is on **floor 15**.
- Floor states: **Infested** (zombies, dark rooms) -> **Cleared** (no
  zombies, all containers searched) -> **Secured** (Secure floor recipe).
  Unexplored rooms are dark until entered.
- Cleared-but-unsecured floors get **1-2 wandering walkers every 12 h**
  (`world.wandererIntervalHours`); otherwise killed zombies stay dead.
- Some apartment doors are jammed: **3 hits** (`world.jammedDoorHits`) to
  open, or 1 s with a crowbar.

### 5.4 Combat
- Each tap on a zombie in range = one attack (weapon damage, range,
  cooldown). Hits knock back **12 px** and flash white 80 ms.
- Zombies aggro when the hero enters their room or comes within **200 px**
  (`zombies.aggroRadius`) on the same floor, or from salvage noise (5.6);
  they never use stairs except during attacks and noise lures.

| Weapon | Damage | Range px | Cooldown s | Durability (hits) | Source |
|---|---|---|---|---|---|
| Fists | 5 | 40 | 0.4 | infinite | - |
| Kitchen knife | 10 | 45 | 0.35 | 40 | loot |
| Spiked bat | 14 | 55 | 0.5 | 50 | crafted |
| Lead pipe | 16 | 60 | 0.6 | 60 | loot, crafted (v1) |
| Pipe spear | 20 | 75 | 0.7 | 50 | crafted (v1) |
| Fire axe | 30 | 65 | 0.9 | 80 | loot |

| Zombie | HP | Speed px/s | Damage | Attack interval s | In milestone 1 |
|---|---|---|---|---|---|
| Crawler | 15 | 25 | 5 | 1.5 | yes |
| Walker | 30 | 40 | 8 | 1.5 | yes |
| Runner | 20 | 110 | 6 | 1.0 | no |
| Brute | 120 | 25 | 20 | 2.0 | no |

- Zombie attack range 30 px (`zombies.attackRange`). Each swing costs **0.5
  energy** (`combat.energyPerSwing`). Broken weapons revert to fists (toast).

### 5.5 Scavenging and inventory
- Containers have 1-3 loot rolls from per-container tables (level-designer).
  Search takes **2 s** (`scavenge.searchSeconds`) with a progress ring,
  costs **1 energy**; zombie aggro interrupts it.
- Hero carries **8 slots** (`inventory.carrySlots`). Items stack to **10**
  (`inventory.itemStack`); materials stack to **20**
  (`inventory.materialStack`).
- Home stockpile: **40 slots** (`inventory.stockpileSlots`), +20 per
  storage shelf built. Entering the home apartment offers "Store all".
- Full inventory: search loot stays in the container (dot marker);
  dismantle yield drops as a tappable **material pile** (never despawns).

### 5.6 Everything is salvage
Almost every object drawn in an apartment or corridor is usable. Walls,
floors, the stairwell, the workbench and the home barricade are not.

**Materials** (6 base + 1 special in v1):

| Material | Typical sources | Main uses | M1 |
|---|---|---|---|
| Wood | chairs, tables, doors, shelves, wardrobes | barricades, bats, planters, boiler fuel | yes |
| Metal | appliances, pipes, bed frames, hinges | barricades, tools, collectors | yes |
| Cloth | curtains, sofas, mattresses, clothes | bandages, beds, filters | yes |
| Plastic | TVs, buckets, chairs, potted plants | collectors, planters, filters | yes |
| Parts | electronics, appliances, lamps, radios | tools, filters, beacon | yes |
| Seeds | potted plants, kitchen pantries | planters | yes |
| Container | jerrycans, bottles, buckets | water tank (more water storage) | no |

Water from salvage comes as consumable items: **Dirty water** (+20 water,
**-8 health** `water.dirtyHealthCost`) and **Clean water** (+20 water).

**Dismantle rules**
- Size sets time and energy: **Small 2 s / 1**, **Medium 4 s / 2**, **Large
  8 s / 4** (`salvage.time.*`, `salvage.energy.*`); 50% slower at energy
  < 20 (`salvage.lowEnergySlow`).
- **Tools** must be carried (no weapon slot used): **Crowbar** (doors,
  wardrobes, bed frames), **Wrench** (pipes, water heater, fridge), **Saw**
  (v1: bookshelves, counters). Each tool has **20 uses** (`salvage.toolUses`).
- **Noise**, fired when dismantling starts and shown by a floating "!":
  *Quiet* none; *Noisy* aggros zombies within **400 px** on the floor
  (`salvage.noiseRadius`); *Loud* aggros the whole floor and, with **50%**
  chance (`salvage.loudLureChance`), 1 walker from the nearest Infested
  floor within 2 floors reaches the stairwell 10 s later.
- An unsearched container is searched first (+2 s). A zombie hit or aggro
  interrupts; progress is lost unless past 50%.
- Yield is fixed per object plus listed chances. The object is removed for
  good (saved) and never respawns: each floor is a finite stock.
- Crafted placeables can be dismantled for **50%** of their cost, rounded
  down (`salvage.refundRatio`), quiet, 2 s.
- **Drain** (primary action, quiet, 2 s) works once per object; it can
  still be dismantled after.

**Sample object table** (level-designer places them; M1 = first 15):

| # | Object | Size | Tool | Noise | Primary | Dismantle yield |
|---|---|---|---|---|---|---|
| 1 | Chair | S | - | Quiet | - | 2 wood |
| 2 | Table | M | - | Noisy | - | 4 wood |
| 3 | Kitchen cupboard | M | - | Noisy | Search | 3 wood |
| 4 | Wardrobe | L | Crowbar | Noisy | Search | 6 wood + 1 metal |
| 5 | Bed frame | L | Crowbar | Noisy | - | 3 wood + 2 metal + 2 cloth |
| 6 | Sofa | M | - | Quiet | - | 3 cloth + 2 wood |
| 7 | Curtains | S | - | Quiet | - | 2 cloth |
| 8 | Potted plant | S | - | Quiet | - | 1 plastic, 60% +1 seeds |
| 9 | Interior door | M | Crowbar | Loud | - | 5 wood + 1 metal |
| 10 | Fridge | L | Wrench | Loud | Search | 4 metal + 2 plastic + 1 parts |
| 11 | Microwave | S | - | Noisy | - | 1 metal + 1 plastic + 1 parts |
| 12 | TV | M | - | Noisy | - | 2 plastic + 2 parts |
| 13 | Sink pipes | M | Wrench | Noisy | - | 2 metal + 1 dirty water |
| 14 | Toilet tank | M | - | Quiet | Drain: 2 dirty water | 1 plastic |
| 15 | Water heater | L | Wrench | Loud | Drain (wrench): 6 dirty water | 4 metal + 1 parts |

v1 adds e.g. desk lamp/radio (S, quiet: 1 plastic + 1 parts), bookshelf
(L, saw: 6 wood), washing machine (L, wrench, loud: 5 metal + 2 parts),
mattress (M, quiet: 4 cloth), bucket/jerrycan (S, quiet: 1 container).

**Recipes** (workbench, instant once the hero is at it; materials are taken
from carried inventory first, then the stockpile; recipes appear when one
of their materials is first collected):

| Use | Recipe | Cost | Effect | M1 |
|---|---|---|---|---|
| Weapon | Spiked bat | 3 wood + 1 metal | Weapon (5.4) | yes |
| Weapon | Lead pipe | 3 metal + 1 cloth | Weapon (5.4) | no |
| Weapon | Pipe spear | 2 metal + 2 wood + 1 cloth | Weapon (5.4) | no |
| Tool | Crowbar | 3 metal | 20 uses; opens jammed doors in 1 s | yes |
| Tool | Wrench | 2 metal + 1 parts | 20 uses | yes |
| Tool | Saw | 1 wood + 2 metal + 1 parts | 20 uses | no |
| Medical | Bandage | 2 cloth | +15 health | no |
| Barricade | Barricade Lv1 / Lv2 / Lv3 | 5 wood + 2 metal / 10 wood + 5 metal + 2 cloth / 15 metal + 4 parts | Home stairwell, HP 100 / 250 / 500, defense +10 / +25 / +50 (Lv3 not M1) | Lv1-2 |
| Barricade | Repair | 1 wood per 20 HP | Restores HP | yes |
| Barricade | Secure floor | 8 wood + 4 metal | Cleared floor -> Secured; defense +5 each | yes |
| Food | Planter | 3 wood + 1 plastic + 1 seeds | +1 Planter crop every 6 h (max 3 stored); each crop uses 1 dirty or clean water from the stockpile, no water = no growth | yes |
| Food | Grow lamp | 2 parts + 1 plastic | Planters in the home grow 50% faster | no |
| Water | Rain collector | 3 plastic + 2 metal | +1 Clean water every 3 h (max 4 stored); window spot only | yes |
| Water | Water filter | 2 plastic + 2 cloth + 1 parts | Turns 1 dirty -> 1 clean water per hour, queue of 6 | yes |
| Water | Boiler | 3 metal + 1 parts | 1 wood boils 2 dirty -> 2 clean water instantly | no |
| Water | Water tank | 4 metal + 3 container | Stores up to 20 water items outside stockpile slots | no |
| Home | Survivor bed | 6 wood + 2 cloth | Needed for each survivor to move in | yes |
| Home | Storage shelf | 6 wood + 2 metal | +20 stockpile slots | no |
| Story | Rooftop beacon | 10 parts + 10 metal + 5 cloth | Ending (section 1); needs all 30 floors Secured | no |

Milestone 1 recipes: 11 (bat, crowbar, wrench, barricade Lv1, Lv2, repair,
secure floor, planter, rain collector, water filter, survivor bed).

**Home build spots**: placeables go in fixed, tappable spots in the home
apartment: **2 window** (rain collector or planter) and **4 floor** spots
(`home.windowSpots`, `home.floorSpots`). v1: each secured floor adds 2.

**Storage pressure**: a fully dismantled apartment rarely fits in 8 carry
slots, so the player chooses what to carry, what to leave as a pile, and
when to return. Offline production with a full stockpile is lost (reported).

### 5.7 Survivors
- Few, named, hand-written characters (dialogue, one trait, one recruitment
  quest), each on a specific floor. Recruit: talk -> quest -> free Survivor
  bed -> they move in.
- Survivors have Health and use **1 food + 1 water item every 12 h**
  (`survivors.upkeepHours`); if missing: -10 health, morale -5.
- Jobs (Survivors screen, one each):
  - **Guard**: +15 defense (`survivors.guardDefense`).
  - **Scavenger**: offline only, 1 loot roll from a cleared floor every
    2 h (`survivors.scavengeIntervalHours`); v1: 50% of rolls are a
    material stack of 2-4 instead.
  - **Tender**: rain collector, filter and planter output +50%.
- **Pass the torch**: when the active character dies, the player picks a
  living survivor to continue as; the dead character's carried items drop
  as a bag at the death spot. No survivors left = game over.

### 5.8 Attacks
- Scheduled every **8 h +/- 2 h** (`attacks.intervalHours`,
  `attacks.jitterHours`). First attack is scripted, **10 min** after the
  tutorial ends.
- Attack strength A = **30 + 3 x days survived**, capped at **150**
  (`attacks.baseStrength`, `attacks.perDay`, `attacks.cap`).
- **Online (telegraphed)**: 60 s warning (`attacks.warningSeconds`): red
  countdown banner, distant moans, flickering lights. Then ceil(A / 10)
  zombies climb to the home floor and hit the barricade; the player fights
  until all are dead. A fallen barricade lets them into the apartment.
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
  survived, floors reclaimed, zombies killed, objects salvaged; "New game"
  deletes the save.

## 6. Progression and difficulty
- **Long-term goal**: reclaim all 30 floors (all Secured), then build the
  Rooftop beacon for the story ending (section 1). The sandbox continues
  afterwards with attacks still running.
- Difficulty rises with distance from floor 15: floors 13-17 crawlers and
  walkers; 8-12 and 18-22 add runners; 1-7 and 23-30 add brutes and more
  zombies per room. Better loot (axes, medkits) and richer salvage
  (maintenance rooms, washing machines) deeper/higher.
- Tool gating: early floors are mostly hand-dismantlable; crowbar, wrench
  and saw each unlock bigger, richer objects.
- Attacks grow with days survived; defenses with barricades, secured floors
  and guards.
- Saved: world state (incl. every dismantled object and pile), timestamp,
  settings, stats.

## 7. Content
| | Milestone 1 (slice) | Version 1 (release) |
|---|---|---|
| Floors | 5 (13-17), hero on 15 | 30 + roof |
| Zombie types | Crawler, Walker | + Runner, Brute |
| Weapons | Fists, knife, spiked bat | + lead pipe, pipe spear, fire axe |
| Tools | Crowbar, wrench | + saw |
| Materials | 6: wood, metal, cloth, plastic, parts, seeds | + container |
| Dismantlable objects | 15 (table rows 1-15) | ~30 |
| Consumables | canned food, dry snack, water bottle, clean water, dirty water, planter crop, bandage, medkit, chocolate | ~15 |
| Recipes | 11 (see 5.6) | All in 5.6 (~20) |
| Survivors | 1 | 4 |
| Story | Intro lines, ~5 notes | ~25 notes, beacon ending |
| Attacks | 1 scripted + scheduled walker attacks | Full scaling |

Milestone 1 survivor: **Mara, floor 13, a nurse hiding in a bathroom;
quest: fetch her medical bag from floor 14**. Other survivors are written by
game-designer and level-designer for v1.

## 8. Screens and flow
1. **Title**: logo, "Tap to start" (unlocks audio).
2. **New game**: 3 short text lines over the dark apartment ("You wake up.
   Sirens. Something is scratching at the door."), then play.
3. **Tutorial by doing (first ~60 s)**: arrow at the fridge (Search ->
   canned food) -> at the chair, then the table (Dismantle -> 6 wood) -> at
   the kitchen drawer (Search -> 2 metal, "a tin of nails") -> at the
   workbench (craft Barricade Lv1) -> at the door (corridor) -> a crawler
   appears (tap it to hit). One-line hints only, no text walls.
4. **Returning**: "While you were away" report (one tap skips).
5. **Play**: tower view, top HUD (5 need bars, day, attack timer), bottom
   bar (Home, Inventory, Workbench, Survivors, Menu).
6. **Menu**: sound, music, notes read, replay ending (once unlocked),
   resume. Pausing does not stop real time.
7. **Pass the torch** -> pick survivor -> play.
8. **Game over** -> stats -> New game.
9. **Ending** (Rooftop beacon built) -> text cards -> stats -> continue.

## 9. Art style
- Pixel art, gritty, dark and muted; corridor lamps flicker (random
  50-150 ms dips, more during attacks). 1 art pixel = 3 game px.
- Sprites: characters **16x24** art px (48x72 game px); zombies 16x24
  (Brute 24x32); tiles/props **16x16** (large props 32x32); floor = 240x80
  art px. Material icons 8x8 art px.
- 1 px near-black outline on characters and interactables only.
  Dismantled objects leave a 3-frame dust puff and a faint floor mark.
- Palette: near-black/outline `#0d0f12`, shadow concrete `#1f242b`, wall
  concrete `#3a4048`, light concrete `#6b7178`, rust brown `#6e3b23`, dried
  blood `#7a1f1f`, warning red (UI, attack) `#c0392b`, lamp amber
  `#e0a24a`, zombie skin green `#6f7f4f`, pale skin `#c9a98a`, hero jacket
  teal `#2f5d62`, UI text off-white `#d8d4c8`.
- Interactables get a slow amber pulse so they read as tappable.
- **App icon**: the dark tower silhouette against a sickly green-grey sky,
  one lit amber window near the middle; 512x512, readable at 48 px.

## 10. Audio
- Mood: tense, lonely, quiet. Silence is part of the design.
- Music: 2 short ambient drone loops (apartment / exploring), 1 tense loop
  for attacks, 1 short hopeful cue for the ending. Total audio under 3 MB.
- SFX: footsteps, stairs, door open, jammed door hit, search rustle, pickup,
  punch, blade/pipe hit, weapon break, zombie moan/aggro/death, hero hurt,
  barricade hit/break, hammer, eat, drink, attack siren, lamp buzz, UI tap,
  wood crack, metal clang, cloth rip, water pour, noise alert sting.

## 11. Scope for version 1
**In**: everything in sections 1-10 for the Version 1 column of section 7.

**Milestone 1 (first playable)**: hero's apartment + floors 13-17, tap
movement, action menu, scavenging, salvage (15 objects, 6 materials, tools
crowbar + wrench, noise), 11 recipes covering weapons, tools, barricades,
food and water, tap combat, all 5 needs, offline catch-up with production,
1 survivor, 1 scripted attack plus scheduled attacks, save/load.

**Later in v1**: remaining floors and roof, saw and its objects, Container
material and water tank, boiler, grow lamp, bandage crafting, storage
shelf, Lv3 barricade, notes, Rooftop beacon ending.

**Out of version 1**: ads, in-app purchases, accounts, cloud saves,
multiplayer or any online feature, push notifications, leaderboards,
multiple save slots, recipes beyond the list in 5.6, free placement of
builds, outside-the-tower areas, day/night cycle tied to the clock,
weather, vehicles, voice acting.

## 12. Decisions and open questions

### Decided (Creative Director approved)
- Title: **"Floor 15"**.
- Hero: unnamed "you"; survivors take over via pass the torch.
- Offline cap **12 h**; offline simulation **cannot kill** (health floor 10).
- Need drain rates as in 5.2 (food empties in ~27 h, water ~20 h of neglect).
- Hero's apartment on **floor 15**.
- First survivor **Mara**, the nurse on floor 13.
- The game has an outbreak backstory and a real story ending when the tower
  is fully secured (section 1).
- "Everything is salvage" is a core pillar (5.6).

### Open questions
1. **Ending tone**: (a) hopeful, as written (survivors arrive, tower becomes
   a refuge); (b) bittersweet (the reply is only a recording); (c) a choice:
   leave with the convoy or stay (two short epilogues).
2. **Backstory names** ("grey fever", "river docks" group): keep, rename,
   or also name the city/tower?
3. **Dirty water**: (a) -8 health per drink as written; (b) chance of
   sickness (no regen for 6 h); (c) no penalty, only matters for planters.
4. **Loud dismantle lures** a walker from up to 2 floors away: keep, limit
   to the same floor, or remove?
