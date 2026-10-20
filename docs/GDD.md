# Game Design Document

> Owned by the game-designer agent. The Creative Director has final say.
> Title: **"Floor 15"**.

## 1. Pitch
A post-apocalyptic zombie survival sandbox seen as a side cutaway of a
30-story apartment tower. You wake up in your apartment in the middle of an
outbreak. **Everything around you is a resource**: the sofa is cloth and
wood, the fridge is metal and parts, the water heater holds the last clean-ish
water on the floor, a dead houseplant is seeds, a cleaning cupboard is bleach
for your water. Tap to scavenge and tear apart neighbouring apartments, fight
zombies with quick taps, turn the pieces into weapons, barricades, stoves,
medicine, traps and a generator, take in a few survivors, and reclaim the
tower floor by floor. Time keeps passing while you're away, and your
barricades must hold.

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
1. With all 30 floors Secured and a Radio set built, the final recipe
   **Rooftop beacon** unlocks (5.6): the roof antenna mast rebuilt from
   salvaged parts and wire. Building it plays 5-6 one-line text cards: the
   hero climbs to the roof, the beacon lights, the radio hisses.
2. A reply: survivors holding the river docks, who had been broadcasting to
   nobody, saw the light; yours is the only lit building in the city. "A
   convoy stops at your door at dawn. Come with us, or hold your tower."
3. **The choice**: two 96x96 game px buttons, **"Leave with the convoy"** and
   **"Stay and hold the tower"**, no timer. The first tap asks for a
   confirming second tap; a tap elsewhere cancels. Closing the app during
   the choice reopens it on next launch.
4. **Leave epilogue** (4-5 cards): the trucks pull out toward the docks; one
   line per living recruited survivor (e.g. "Mara opens a field hospital in
   a warehouse"); last card: the tower, dark again, behind the convoy; then
   stats (days, zombies killed, objects salvaged, floors reclaimed).
   **Save**: marked **Completed (left)** and frozen (no time, attacks or
   play). Title shows "You left the tower on day N", **Replay ending** and
   **New game** (confirm; deletes the save).
5. **Stay epilogue** (4-5 cards): the convoy unloads a supply crate and
   drives on; one line per living recruited survivor (e.g. "Mara runs a
   clinic on floor 13"); last card: every window lit, "Floor 15 is a
   stronghold now"; then stats. **Save**: the sandbox continues
   (`ending = "stay"` stored), attacks keep running. A one-time **Supply
   crate** (Search) appears at home (`ending.stayCrate`: 10 fuel, 5 meds, 5
   batteries, 10 canned food). The beacon gets the action **Signal the
   convoy**, which reopens the Leave confirm (then as Leave above).
6. Menu: **Replay ending** replays the cards of the choice made.

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
   fuel burned, spoilage, sickness, attacks resolved offline).
2. **Tend**: eat, drink, sleep, collect production (rain water, filtered
   water, crops, herbs), feed the stove and generator, repair barricades.
3. **Scavenge and salvage**: go to another floor, fight zombies by tapping
   them, search containers, drain water tanks and pipes, and dismantle
   furniture, doors and appliances into materials. Choose what to carry home
   (8 slots) and how much noise to risk.
4. **Craft**: at the home workbench turn materials into weapons, tools,
   barricades, food and water production, medicine, light and power, gear
   and comfort. Better tools open up bigger objects to dismantle, feeding
   the next run.
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
| Vertical drag | Anywhere on the tower | Scrolls the camera between floors. A drag over 16 game px is a scroll, not a tap. Momentum scrolling, clamped to floors 1-30 (roof from M4). |
| Tap | "Home" button (bottom bar) | Camera jumps to the hero; second tap within 1 s sends the hero home. |
| Tap | Bottom bar buttons | Inventory, Workbench, Survivors, Pause/Settings; **Throw** (only while a throwable is carried, 5.11). |

**Action menu**: up to 2 buttons, each **96x96 game px** (icon + label),
side by side above the object (below it if it would leave the screen):
**Primary** (*Search* containers, *Drain* water sources, *Use* bed,
workbench, planter, collector, survivor, stove, generator, radio, elevator;
only if available) and **Dismantle**. If a needed tool is missing,
Dismantle is greyed with "Needs crowbar" and does nothing. A button tap
sends the hero; the action starts on arrival. A tap elsewhere closes the
menu and counts as a normal tap. Objects with exactly one action skip the
menu and act directly. *Use* on a stove, generator or radio opens a small
panel (one row per option, 96 px tall).

Rules: a new tap cancels the current walk/action, except a search or
dismantle past 50% completes. At most **1** attack tap is buffered during
cooldown. Taps on dark rooms walk to the room's door; taps behind an
unopened barricade show "Barricaded". The camera follows the walking hero
unless the player dragged in the last 2 s.

## 5. Mechanics
All numbers below are starting values and live in
`public/data/balance.json` (key in brackets). Programmers must not
hard-code them. "M1-M4" marks the milestone a feature arrives in (section 11).
Lists are keyed by stable snake_case ids: `materials.<id>`,
`objects.<id>`, `recipes.<id>` (cost, output, effect numbers, `buildSpot`),
`consumables.<id>`, `combat.weapons.<id>`, `zombies.types.<id>`,
`barricade.levels`, `survivors.roster.<id>`. **`items.<id>` is the lookup
registry**: every id usable in a cost, yield, output or loot table has an
entry there (`type` material/consumable/water/weapon/tool/throwable/quest,
`name`, `stack` material = 20, item = 10, tool = 1 per slot); the detailed
blocks above hold the stats. Recipe ids are their own namespace and may
equal their output's item id. Two-number arrays (e.g. `[1, 3]`) are
inclusive min/max ranges. A `null` durability means never breaks. Sizes are `small`/`medium`/`large`, noise
`quiet`/`noisy`/`loud`.

**Controls numbers**: drag threshold 16 px (`controls.dragThresholdPx`),
Home double tap 1 s (`controls.homeDoubleTapSeconds`), camera follow pause
2 s (`controls.cameraFollowPauseSeconds`), buttons and hit areas 96 px
(`controls.buttonSizePx`, `controls.minHitAreaPx`), 1 buffered attack tap
(`controls.attackBuffer`). M1 floors 13-17 (`world.floorMin`,
`world.floorMax`); floor layout sizes in `world.*Px`; home floor 15
(`home.floor`).

### 5.1 Time and the idle simulation
- Game time = real time, from `Date.now()` deltas, never frame counts.
  Online tick every **1 s** (`time.tickSeconds`).
- On resume/launch: elapsed = now - lastSaveTime. If elapsed < 0 (clock
  changed backward) treat as 0. Elapsed is capped at **12 h**
  (`time.offlineCapHours`); time beyond the cap is lost (the world "pauses").
- Offline catch-up runs in **10-minute steps** (`time.offlineStepMinutes`)
  so stockpile auto-use, fuel burn, production, spoilage, sickness checks
  and attacks resolve in order.
- When the app goes to background (`visibilitychange` hidden): save
  immediately; any fight, search or dismantle in progress is abandoned (no
  progress kept), the hero and survivors are moved home, zombies keep their
  current HP and return to their rooms; burning molotov fires and ringing
  lures end.
- Autosave every **10 s** (`time.autosaveSeconds`) and on every floor change,
  craft, dismantle and attack end. Save is localStorage, one slot.

### 5.2 Needs (hero and the active character)
Each need is 0-100. Drain is per real hour.

| Need | Start | Drain/h online | Drain/h offline | Restored by |
|---|---|---|---|---|
| Health | 100 | 0 (see below) | 0 | Bandage +15, Medkit +40, Herbal remedy +5, regen |
| Food | 80 | 3 (`needs.food.drain`) | 3 | Canned food +30, Dry snack +15, Planter crop +20, Jarred veg +25, Hot stew +45 |
| Water | 80 | 4 (`needs.water.drain`) | 4 | Water bottle +35, Clean water +20, Dirty water +20 (-8 health) |
| Energy | 100 | 6 awake (`needs.energy.drain`) | -10 (regen, asleep) | Bed: +25/h online (+30% with a lit stove, 5.10) |
| Morale | 60 | 1 (`needs.morale.drain`), less with comfort (5.10) | same | Events (see below), comfort |

- Start values `needs.<need>.start`; every need maxes at 100 (`needs.max`).
  Bed sleep +25 energy/h (`needs.energy.sleepRegen`); offline (asleep)
  +10/h (`needs.energy.offlineRegen`). Food/water/morale drain the same
  online and offline.
- Item restore values live in `consumables.<id>` (food/water/health/morale)
  and `water.dirty` / `water.clean`. **Chocolate**: +10 morale, +5 food.
- **Regen** +2 health/h (`needs.health.regen`) while food, water > 50
  (`needs.health.regenMinFoodWater`), energy > 20
  (`needs.health.regenMinEnergy`) and not Sick. Each empty need costs
  **5 health/h** (`needs.emptyNeedDamage`).
- **Energy < 20** (`needs.energy.lowThreshold`): speed and damage -30%
  (`needs.energy.lowPenalty`).
  **Morale < 25** (`needs.morale.lowThreshold`): damage -20%
  (`needs.morale.lowDamagePenalty`), energy drain x1.5
  (`needs.morale.lowEnergyDrainMult`), survivors refuse quests;
  **> 75** (`needs.morale.highThreshold`): damage +10%
  (`needs.morale.highDamageBonus`).
- **Morale events** (`needs.morale.events.*`): survivor recruited +15, quest
  done +10, talk to a survivor +5 (once per survivor per 12 h,
  `talkCooldownHours`), "comfort" item (cigarettes, chocolate) +10 (stored
on the item, `consumables.<id>.morale`), Hot stew
  +5 (M2), first harvest of each planter +5, attack repelled +5, barricade
  breached -10, survivor dies -20.
- **Sick** (status, M2): no regen, energy drain x1.5; lasts **24 h**
  (`status.sickHours`). Antibiotics (loot only) cure it at once; Herbal
  remedy removes **12 h** (`status.remedyHours`). Not stackable. Causes:
  hygiene checks (5.10). Shown as a green icon next to the health bar.
- **Auto-use offline**: below **40** food or water (`needs.autoUseThreshold`)
  the character eats/drinks the smallest fitting stockpile item, spoiling
  items first, clean water before dirty. Online: only a one-time "You're
  starving: eat?" when food or water first drops below **20**
  (`needs.onlinePromptThreshold`); it re-arms once the need is back above 20.
- **Offline safety**: catch-up never kills; health floors at **10**
  (`needs.offlineHealthFloor`). Death only happens while playing.
- Fairness: 12 h offline drains at most 36 food / 48 water, so 80/80 never
  wakes to an empty need.
- **Sleep**: tap bed -> sleep (+25 energy/h); any tap wakes. Closed app =
  characters at home are asleep.

### 5.3 Movement and the tower
- 30 floors, each **720x240 game px**: stairwell (120 px wide, left, with
  the elevator door) + two apartments (300 px each). About 5 floors are
  visible at once.
- Hero walk speed **120 px/s** (`hero.walkSpeed`); stairs take **1.2 s per
  floor** (`hero.stairSecondsPerFloor`).
- Hero's apartment is on **floor 15**.
- Floor states: **Infested** (zombies, dark rooms) -> **Cleared** (no
  zombies, all containers searched) -> **Secured** (Secure floor recipe).
  Unexplored rooms are dark (contents hidden) until entered.
- **Dim** (M2): rooms on Infested floors stay dim after entering. In a dim
  room zombies are drawn only within **150 px** of the hero
  (`light.dimVisionPx`), and search and dismantle take **+50%** time
  (`light.dimTimeMult`). A carried Flashlight with charge removes both (5.11).
  At night more rooms are Dim (5.12).
- Cleared-but-unsecured floors get **1-2 wandering walkers every 12 h**
  (`world.wanderersPerInterval`, `world.wandererIntervalHours`); otherwise
  killed zombies stay dead.
- Some apartment doors are jammed: **3 hits** (`world.jammedDoorHits`) to
  open, or 1 s with a crowbar (`world.jammedDoorCrowbarSeconds`, uses 1
  crowbar use).

### 5.4 Combat
- Each tap on a zombie in range = one attack (weapon damage, range,
  cooldown). Hits knock back **12 px** and flash white 80 ms
  (`combat.knockbackPx`, `combat.hitFlashMs`). Weapon rows live in
  `combat.weapons.<id>`, zombie rows in `zombies.types.<id>`.
- Zombies aggro when the hero enters their room or comes within **200 px**
  (`zombies.aggroRadius`, 120 px with Quiet shoes) on the same floor, or
  from noise (salvage, molotovs, noise lures) on the same floor. They never
  use stairs except during attacks.

| Weapon | Damage | Range px | Cooldown s | Durability (hits) | Source |
|---|---|---|---|---|---|
| Fists | 5 | 40 | 0.4 | infinite | - |
| Kitchen knife | 10 | 45 | 0.35 | 40 | loot |
| Spiked bat | 14 | 55 | 0.5 | 50 | crafted (M1) |
| Lead pipe | 16 | 60 | 0.6 | 60 | loot, crafted (M2) |
| Pipe spear | 20 | 75 | 0.7 | 50 | crafted (M2) |
| Fire axe | 30 | 65 | 0.9 | 80 | loot (M2) |

| Zombie | HP | Speed px/s | Damage | Attack interval s | Milestone |
|---|---|---|---|---|---|
| Crawler | 15 | 25 | 5 | 1.5 | M1 |
| Walker | 30 | 40 | 8 | 1.5 | M1 |
| Runner | 20 | 110 | 6 | 1.0 | M2 |
| Brute | 120 | 25 | 20 | 2.0 | M3 |

- Zombie attack range 30 px (`zombies.attackRange`). Each swing costs **0.5
  energy** (`combat.energyPerSwing`). Broken weapons revert to fists (toast).
- Armor (5.11) reduces damage taken; throwables (5.11) add area damage.

### 5.5 Scavenging and inventory
- Containers have 1-3 loot rolls (`scavenge.lootRolls`) from per-container
  tables (level-designer; `objects.<id>.primary.lootTable` names the table,
  `lootTags` are design hints). Search takes **2 s**
  (`scavenge.searchSeconds`) with a progress ring, costs **1 energy**
  (`scavenge.searchEnergy`); zombie aggro interrupts it.
- Hero carries **8 slots** (`inventory.carrySlots`). Items stack to **10**
  (`inventory.itemStack`); materials stack to **20**
  (`inventory.materialStack`); weapons and tools never stack (1 per slot,
  `inventory.toolStack`). Tools, throwables and the flashlight use carry
  slots; equipped armor and shoes do not (5.11).
- Home stockpile: **40 slots** (`inventory.stockpileSlots`), +20 per
  storage shelf built. Entering the home apartment offers "Store all".
- Full inventory: search loot stays in the container (dot marker);
  dismantle yield drops as a tappable **material pile** (never despawns).

### 5.6 Everything is salvage
Almost every object drawn in an apartment or corridor is usable. Walls,
floors, the stairwell, the workbench and the home barricade are not.
Zombies are never salvage (no bones or body parts).

**Materials** (19 in v1; 10 in M1). Each has a distinct 8x8 icon.

| Material | Icon | Typical sources | Main uses | MS |
|---|---|---|---|---|
| Wood | plank | chairs, tables, doors, shelves | barricades, bats, planters, stove fuel | M1 |
| Metal | bent plate | appliances, pipes, bed frames | barricades, tools, stove, generator | M1 |
| Cloth | folded rag | curtains, sofas, mattresses, clothes | bandages, molotov wicks, beds, rope | M1 |
| Plastic | bottle | TVs, buckets, chairs, potted plants | collectors, planters, filters, latrine | M1 |
| Parts | gear | electronics, appliances, lamps | tools, filters, radio, generator | M1 |
| Seeds | seed pouch | potted plants, pantries | planters, herb boxes | M1 |
| Glass | shard | windows, mirrors, bottles, lamps | molotovs, jars, oil lamps, solar panels | M1 |
| Duct tape | grey roll | toolboxes, kitchen drawers | weapons, barricade Lv2-3, armor | M1 |
| Chemicals | bleach jug | cleaning closets, under-sink cupboards | water purifying, medkits | M1 |
| Fuel | red can | oil lamps, lighter fluid, jerrycans | molotovs, oil lamps, generator | M1 |
| Paper | book | bookshelves, boxes, magazines | stove fuel, reading nook, decorations | M2 |
| Meds | pill bottle | medicine cabinets, first-aid boxes | medkits | M2 |
| Herbs | leaf | herb pots, herb boxes | herbal remedy, hot stew | M2 |
| Batteries | AA cell | clocks, smoke alarms, laptops, UPS units | flashlight, noise lure, music player, radio | M2 |
| Rope | coil | clotheslines, blinds; crafted from cloth | tripwire, elevator | M3 |
| Wire | copper coil | extension cords, electrical panels | generator, lights, radio, elevator, beacon | M3 |
| Rubber | black band | hoses, bicycles, washing machine seals | quiet shoes, tool wraps, fence, water tank | M3 |
| Leather | brown hide | leather sofas, jackets, bags | leather armor | M3 |
| Container | jerrycan | buckets, jerrycans, cooler bottles | water tank | M3 |

Water from salvage comes as consumable items: **Dirty water** (+20 water,
**-8 health** `water.dirtyHealthCost`) and **Clean water** (+20 water).

**Dismantle rules**
- Size sets time and energy: **Small 2 s / 1**, **Medium 4 s / 2**, **Large
  8 s / 4** (`salvage.time.*`, `salvage.energy.*`); 50% slower at energy
  < 20 (`salvage.lowEnergySlow`); Dim adds +50% (5.3).
- **Tools** must be carried (no weapon slot used): **Crowbar** (doors,
  wardrobes, bed frames), **Wrench** (pipes, water heater, fridge, washing
  machine, electrical panel), **Saw** (M2: bookshelves, counters). Each tool
  has **20 uses** (`salvage.toolUses`). Every action that needs a tool
  (dismantle, wrench Drain, crowbar on a jammed door) uses 1 use when it
  completes; at 0 uses the tool breaks (toast).
- **Noise**, fired when dismantling starts and shown by a floating "!":
  *Quiet* none; *Noisy* aggros zombies within **400 px** on the same floor
  (`salvage.noiseRadius`); *Loud* aggros every zombie on the same floor.
  Noise never reaches other floors. Tool wraps make a dismantle one step
  quieter (5.11).
- An unsearched container is searched first (+2 s). A zombie hit or aggro
  interrupts; progress is lost unless past 50% (`salvage.keepProgressRatio`).
- Yield is fixed per object plus listed chances. The object is removed for
  good (saved) and never respawns: each floor is a finite stock.
- Crafted placeables can be dismantled for **50%** of their cost, rounded
  down (`salvage.refundRatio`), quiet, Small time and energy (2 s / 1).
- **Drain** (primary action, quiet, Small time and energy: 2 s / 1) works
  once per object; it can still be dismantled after.

**Milestone 1 objects** (level-designer places them):

| # | Object | Size | Tool | Noise | Primary | Dismantle yield |
|---|---|---|---|---|---|---|
| 1 | Chair | S | - | Quiet | - | 2 wood |
| 2 | Table | M | - | Noisy | - | 4 wood |
| 3 | Kitchen cupboard | M | - | Noisy | Search (food, chemicals) | 3 wood |
| 4 | Wardrobe | L | Crowbar | Noisy | Search | 6 wood + 1 metal |
| 5 | Bed frame | L | Crowbar | Noisy | - | 3 wood + 2 metal + 2 cloth |
| 6 | Sofa | M | - | Quiet | - | 3 cloth + 2 wood |
| 7 | Curtains | S | - | Quiet | - | 2 cloth |
| 8 | Potted plant | S | - | Quiet | - | 1 plastic, 60% +1 seeds |
| 9 | Interior door | M | Crowbar | Loud | - | 5 wood + 1 metal |
| 10 | Fridge | L | Wrench | Loud | Search | 4 metal + 2 plastic + 1 parts |
| 11 | Microwave | S | - | Noisy | - | 1 metal + 1 plastic + 1 parts + 1 glass |
| 12 | TV | M | - | Noisy | - | 2 plastic + 2 parts + 1 glass |
| 13 | Sink pipes | M | Wrench | Noisy | - | 2 metal + 1 dirty water |
| 14 | Toilet tank | M | - | Quiet | Drain: 2 dirty water | 1 plastic |
| 15 | Water heater | L | Wrench | Loud | Drain (wrench): 6 dirty water | 4 metal + 1 parts |
| 16 | Kitchen drawer | S | - | Quiet | Search (metal, tape) | 1 wood |
| 17 | Window pane | S | - | Noisy | - | 2 glass |
| 18 | Bathroom cabinet | S | - | Quiet | Search (chemicals, bandage) | 1 glass + 1 plastic |
| 19 | Toolbox | S | - | Quiet | Search (tape, metal) | 1 metal |
| 20 | Oil lamp | S | - | Quiet | - | 1 glass + 1 metal, 50% +1 fuel |

Window panes exist only outside the home apartment (home windows hold the
window build spots; `objects.window_pane.allowedInHome` false).

**Later v1 objects** (size, tool, noise, primary: yield; "-" = none):
- **M2**: bookshelf (L, saw, noisy: 6 wood + 3 paper); kitchen counter (L,
  saw, noisy, Search: 4 wood + 1 metal); cardboard boxes (S, quiet, Search:
  2 paper); mattress (M, quiet: 4 cloth); desk lamp (S, quiet: 1 plastic +
  1 parts + 1 glass); medicine cabinet (S, quiet, Search for meds and
  antibiotics: 1 glass + 1 metal); herb pot (S, quiet: 1 plastic + 2 herbs,
  50% +1 seeds); alarm clock (S, quiet: 1 parts + 1 batteries); smoke alarm
  (S, quiet: 1 plastic + 1 batteries); laptop (S, quiet: 1 plastic + 1
  parts + 1 batteries).
- **M3**: washing machine (L, wrench, loud: 5 metal + 2 parts + 2 rubber);
  electrical panel (M, wrench, noisy: 4 wire + 2 parts + 1 metal);
  extension cord (S, quiet: 2 wire); UPS unit in maintenance rooms (M,
  wrench, noisy: 4 batteries + 2 wire); bicycle (M, noisy: 3 metal + 2
  rubber + 1 parts); garden hose (S, quiet: 2 rubber); leather sofa (M,
  quiet: 3 leather + 2 wood); coat rack (S, quiet, Search: 1 leather + 1
  cloth + 1 metal); clothesline (S, quiet: 2 rope); window blinds (S,
  quiet: 1 rope + 1 plastic); bucket (S, quiet: 1 container); jerrycan (S,
  quiet: 1 container, 50% +2 fuel); water cooler (M, quiet, Drain 4 clean
  water: 1 container + 1 plastic).

**Recipes** (workbench, instant once the hero is at it; materials are taken
from carried inventory first, then the stockpile; a recipe appears when one
of its materials is first collected; WB = workbench level needed):

| Use | Recipe | Cost | Effect | WB | MS |
|---|---|---|---|---|---|
| Weapon | Spiked bat | 3 wood + 1 metal | Weapon (5.4) | 1 | M1 |
| Weapon | Lead pipe | 3 metal + 1 tape | Weapon (5.4) | 1 | M2 |
| Weapon | Pipe spear | 2 metal + 2 wood + 1 tape | Weapon (5.4) | 1 | M2 |
| Throwable | Molotov | 1 glass + 1 fuel + 1 cloth | Fire patch (5.11) | 1 | M1 |
| Throwable | Noise lure | 1 parts + 1 batteries + 1 metal | Ringing alarm clock (5.11) | 1 | M2 |
| Tool | Crowbar | 3 metal | 20 uses; opens jammed doors in 1 s | 1 | M1 |
| Tool | Wrench | 2 metal + 1 parts | 20 uses | 1 | M1 |
| Tool | Saw | 1 wood + 2 metal + 1 parts | 20 uses | 1 | M2 |
| Tool | Flashlight | 1 plastic + 1 glass + 1 parts | Removes Dim (5.11) | 1 | M2 |
| Tool | Tool wraps | 1 cloth + 1 rubber | Next 10 dismantles one noise step quieter | 1 | M3 |
| Material | Rope | 3 cloth | 1 rope | 1 | M3 |
| Medicine | Bandage | 2 cloth | +15 health | 1 | M1 |
| Medicine | Medkit | 1 bandage + 1 meds + 1 chemicals | +40 health | 1 | M2 |
| Medicine | Herbal remedy | 2 herbs + 1 clean water | +5 health, Sick -12 h | 1 | M2 |
| Water | Rain collector | 3 plastic + 2 metal | +1 clean water every 3 h (max 4 stored); window spot | 1 | M1 |
| Water | Water filter | 2 plastic + 2 cloth + 1 parts | 1 dirty -> 1 clean water per hour, queue of 6 | 1 | M1 |
| Water | Purify water | 1 chemicals + 2 dirty water | 2 clean water, instant | 1 | M1 |
| Water | Water tank | 4 metal + 3 container + 1 rubber | Stores up to 20 water items outside stockpile slots | 1 | M3 |
| Food | Planter | 3 wood + 1 plastic + 1 seeds | +1 planter crop every 6 h (max 3 stored); each crop uses 1 dirty or clean water from the stockpile, no water = no growth | 1 | M1 |
| Food | Herb box | 2 wood + 1 plastic + 1 seeds | +1 herbs every 8 h (max 3), 1 water each, same rule | 1 | M2 |
| Food | Barrel stove | 5 metal + 1 parts | Light, warmth, cooking (5.10); floor spot | 1 | M2 |
| Food | Grow lamp | 2 parts + 1 plastic + 1 wire | 1 power; planters and herb boxes in its apartment grow 50% faster | 2 | M3 |
| Cooking | Boil water | 2 dirty water | 2 clean water (no extra fuel) | Stove | M2 |
| Cooking | Hot stew | 2 planter crops + 1 clean water (+1 herbs optional) | +45 food, +5 morale (+10 with herbs); spoils | Stove | M2 |
| Cooking | Jarred veg | 3 planter crops + 2 glass | 3 Jarred veg, +25 food each, never spoil | Stove | M2 |
| Light | Oil lamp | 1 glass + 1 metal + 1 cloth | Lights the apartment, 1 fuel per 12 h; floor spot | 1 | M2 |
| Power | Generator | 6 metal + 4 parts + 2 wire | +3 power, 1 fuel per 4 h (5.10); floor spot | 2 | M3 |
| Power | Solar panel | 4 glass + 3 parts + 2 wire + 1 metal | +1 power; window spot | 2 | M3 |
| Light | String lights | 2 wire + 1 glass + 1 parts | 1 power; lights the apartment; wall (no spot) | 2 | M3 |
| Defense | Barricade Lv1 / Lv2 / Lv3 | 5 wood + 2 metal / 10 wood + 5 metal + 2 tape / 15 metal + 4 parts + 4 tape | Home stairwell, HP 100 / 250 / 500, defense +10 / +25 / +50 | 1 / 1 / 2 | M1 / M1 / M3 |
| Defense | Repair | 1 wood per 20 HP | Restores barricade HP | 1 | M1 |
| Defense | Secure floor | 8 wood + 4 metal | Cleared floor -> Secured; defense +5 each | 1 | M1 |
| Defense | Nail board | 3 wood + 2 metal | In front of the home barricade (5.8) | 1 | M3 |
| Defense | Tripwire chimes | 2 rope + 2 metal | Home stairwell; earlier warning (5.8) | 1 | M3 |
| Defense | Electric fence | 4 wire + 2 metal + 2 rubber | 2 power; on the barricade (5.8) | 2 | M3 |
| Gear | Padded jacket | 4 cloth + 2 tape | Body: damage taken -20%, 40 hits | 1 | M3 |
| Gear | Leather armor | 4 leather + 2 tape + 1 metal | Body: damage taken -35%, 60 hits | 2 | M3 |
| Gear | Quiet shoes | 2 rubber + 1 cloth | Feet: aggro radius 120 px; never wear out | 1 | M3 |
| Comfort | Reading nook | 3 wood + 2 cloth + 5 paper | Comfort +1; floor spot | 1 | M2 |
| Comfort | Decorations | 2 cloth + 2 paper + 1 glass | Comfort +1; wall (no spot) | 1 | M2 |
| Comfort | Music player | 2 parts + 1 plastic + 1 batteries | Comfort +1 while running: 1 power, or 1 batteries per 24 h | 1 | M2 |
| Hygiene | Latrine | 3 plastic + 2 wood | Sickness chance -10 points (5.10); floor spot | 1 | M2 |
| Hygiene | Wash station | 2 metal + 2 plastic + 1 cloth | Sickness chance -10 points, uses 1 water per check; floor spot | 1 | M2 |
| Home | Survivor bed | 6 wood + 2 cloth | Needed for each survivor to move in | 1 | M1 |
| Home | Storage shelf | 6 wood + 2 metal | +20 stockpile slots | 1 | M2 |
| Home | Workbench Lv2 | 10 wood + 6 metal + 2 parts + 2 tape | Unlocks WB 2 recipes; +2 home floor spots | 1 | M2 |
| Home | Lockbox | 6 metal + 1 parts | 10 slots, never lost to breaches (5.8) | 2 | M3 |
| Signal | Radio set | 3 parts + 2 wire + 1 batteries | Scans (5.10); 1 power, or 1 batteries per 24 h | 2 | M4 |
| Travel | Elevator repair | 10 metal + 6 wire + 4 parts + 3 rope | Elevator (5.10); built at the home floor's shaft | 2 | M4 |
| Story | Rooftop beacon | 10 parts + 10 metal + 6 wire + 5 cloth | Ending (section 1); needs all 30 floors Secured and a Radio set | 2 | M4 |

WB "Stove" = made via *Use* on a lit Barrel stove instead of the workbench.
Milestone 1 recipes (14): spiked bat, molotov, crowbar, wrench, bandage,
rain collector, water filter, purify water, planter, barricade Lv1, Lv2,
repair, secure floor, survivor bed.

M1 recipe rules (numbers in `recipes.<id>` and `barricade.*`):
- **Build spots** (`recipes.<id>.buildSpot`): rain collector `window`;
  water filter, planter and survivor bed `floor`; barricades `stairwell`;
  secure floor `cleared_floor`; everything else `none` (goes to inventory).
- **Barricade**: Lv2 needs Lv1 built (`barricade.levels[].requiresLevel`)
  and replaces it at full Lv2 HP. At 0 HP the barricade gives no defense
  and zombies pass; Repair still works on it.
- **Repair**: each craft spends 1 wood and restores 20 HP
  (`barricade.repairHpPerWood`), capped at max HP; greyed at full HP.
- **Secure floor**: crafting opens a list of Cleared floors (96 px rows);
  the tapped floor becomes Secured. Greyed if no floor is Cleared.
- **Producers**: `effect.intervalHours`, `effect.maxStored`,
  `effect.waterPerUnit` (planter: 1 water per crop, taken from
  `effect.waterItems`, dirty first); the water filter uses
  `effect.queueMax` (dirty water loaded via *Use*). Output always stays in
  the placeable (up to `effect.maxStored`; filter 6) until collected with
  *Use*; when full, production pauses.

**Build spots**: placeables go in fixed, tappable spots. Home apartment:
**2 window** and **4 floor** spots (`home.windowSpots`, `home.floorSpots`),
+2 floor spots with Workbench Lv2 (`home.workbenchLv2FloorSpots`). Wall items
(string lights, decorations) need no spot, max 1 of each per apartment.
Defense items (barricade, nail board, tripwire, electric fence) sit at the
home stairwell, max 1 each. From M2, each Secured floor adds **2 window + 2
floor** spots (`home.securedFloorSpots`); placeables there work like home
ones, but comfort and light count only in the home apartment.

**Storage pressure**: a fully dismantled apartment rarely fits in 8 carry
slots, so the player chooses what to carry, what to leave as a pile, and
when to return. Offline production with a full stockpile is lost (reported).

### 5.7 Survivors
- Few, named, hand-written characters (dialogue, one trait, one recruitment
  quest), each on a specific floor. Recruit: talk -> quest -> free Survivor
  bed -> they move in.
- Survivors have Health (start 100, `survivors.startHealth`) and use **1
  food + 1 water item every 12 h** (`survivors.upkeepHours`,
  `survivors.upkeepFood`, `survivors.upkeepWater`); if missing: -10 health,
  morale -5 (`survivors.missedUpkeepHealth`, `survivors.missedUpkeepMorale`).
  Named survivors live in `survivors.roster.<id>`.
- Jobs (Survivors screen, one each):
  - **Guard** (M1): +15 defense (`survivors.guardDefense`).
  - **Scavenger** (M1): offline only, 1 loot roll from a cleared floor every
    2 h (`survivors.scavengeIntervalHours`); from M2, 50% of rolls are a
    material stack of 2-4 instead.
  - **Tender** (M1): rain collector, filter, planter and herb box output
    +50% (`survivors.tenderOutputMult` 1.5: their `intervalHours` are
    divided by 1.5).
  - **Medic** (M2): residents' health regen x2, Sick lasts half as long and
    Infection timers of residents at home run at half speed (5.14).
  - **Cook** (M2): offline, keeps the stove fed from stockpile wood/paper
    and cooks 1 Hot stew every 12 h if 2 crops + 1 clean water are stocked.
  - **Mechanic** (M3): generator fuel use -50%; offline, repairs the
    barricade by 20 HP per hour using 1 stockpile wood each.
- **Pass the torch**: when the active character dies, the player picks a
  living survivor to continue as; the dead character's carried items and
  equipped gear drop as a bag at the death spot. No survivors left = game
  over.

### 5.8 Attacks
- Scheduled every **8 h +/- 2 h** (`attacks.intervalHours`,
  `attacks.jitterHours`). First attack is scripted, **10 min** after the
  tutorial ends (`attacks.firstAttackDelayMinutes`): fixed strength **20**,
  1 crawler + 1 walker (`attacks.scripted`), so a Lv1 barricade plus the
  active character (D = 20) repels it even offline. No scheduled attack
  can happen before the scripted one is resolved; the first scheduled
  attack is set 8 h +/- 2 h after it ends. In M1 scheduled attacks are all walkers
  (`attacks.scheduledZombieType`). Days survived = whole 24 h periods since
  New game.
- Attack strength A = **25 + 3 x days survived**, capped at **150**
  (`attacks.baseStrength`, `attacks.perDay`, `attacks.cap`); x**1.1** while
  a generator is running (`power.generatorAttackMult`); x**1.2** if it
  starts at night (`night.attackMult`, 5.12). Multipliers stack after the cap.
  First-night fairness: on day 0, Lv1 barricade + active character + one
  Secured floor (D = 25) holds A = 25. The intended next steps are
  Barricade Lv2 or Mara as Guard, which keep pace for several days.
- **Online (telegraphed)**: 60 s warning (`attacks.warningSeconds`; 90 s with
  Tripwire chimes, `traps.chimeWarningSeconds`; +30 s if the dog is home,
  `dog.warningSeconds`, 5.13): red countdown banner,
  distant moans, flickering lights. Then ceil(A / 10)
  (`attacks.strengthPerZombie`) zombies climb to the
  home floor and hit the barricade; the player fights until all are dead. A
  fallen barricade lets them into the apartment.
- **Traps online**: Nail board deals **10** damage to each zombie when it
  first reaches the barricade (`traps.nailDamage`), breaks after **10**
  zombies (`traps.nailUses`). A powered Electric fence deals **5** damage to
  a zombie each time it hits the barricade (`traps.fenceDamage`).
- **Offline (auto-resolve)**: defense D = barricade defense + guards x 15 +
  secured floors x 5 (`attacks.securedFloorDefense`) + 10 (the active
  character, `attacks.characterDefense`) + Nail board **10**
  (`traps.nailDefense`; it breaks after the attack) + Tripwire chimes **5**
  (`traps.chimeDefense`) + powered Electric fence **20**
  (`traps.fenceDefense`) + dog at home and fed **5** (`dog.defense`).
  - D >= A: repelled. Barricade loses A x 0.5 HP
    (`attacks.repelBarricadeLossRatio`).
  - D < A: breached. Barricade HP -> 0, shortfall S = A - D. Each resident
    takes S / 2 damage (`attacks.breachDamageRatio`, health floor 10) and
    rolls a bite (5.14, M2), and S / 10 (`attacks.breachStackDivisor`)
    random stockpile stacks are lost (rounded down); lockbox contents are
    never lost.
  - At most **2** attacks resolve per catch-up (`attacks.maxOfflineResolves`).
- Report lists each attack: time, strength vs defense, damage, losses.

### 5.9 Death and game over
- Online death -> pass the torch screen (5.7). Game over screen shows days
  survived, floors reclaimed, zombies killed, objects salvaged; "New game"
  deletes the save.

### 5.10 Home systems (M2-M4)
**Fire and light**
- **Barrel stove**: *Use* -> panel: Add wood (**4 h** burn each,
  `stove.woodHours`), Add paper (**1 h**, `stove.paperHours`), stove
  recipes. Holds up to **24 h** of burn (`stove.maxBurnHours`); burns online
  and offline. While lit: the apartment is Lit, warmth gives comfort +1 and
  sleep energy regen **+30%** (`stove.sleepBonus`), stove recipes work.
- **Oil lamp**: holds **2 fuel**, burns **1 per 12 h** (`lamp.fuelHours`);
  Lit while burning. **String lights**: Lit while powered.
- A **Lit** home apartment gives comfort +2 (once, however many sources).

**Power** (M3)
- Supply = running generators (+3 each, `power.generatorOutput`) + solar
  panels (+1 each, `power.solarOutput`, constant). Demand = every built
  powered device (grow lamp 1, string lights 1, music player 1, radio 1,
  electric fence 2). The elevator needs 2 free power only while moving.
- Generator: *Use* toggles on/off and adds fuel; holds **6 fuel**
  (`power.generatorFuelSlots`), burns **1 per 4 h** (`power.generatorFuelHours`)
  while on, online and offline. Out of fuel = off (reported).
- If demand > supply, the most recently built device switches off until
  supply returns (crossed bolt icon). Music player and radio fall back to
  batteries if any are in the stockpile.

**Comfort** (morale): comfort points counted over the home apartment: Lit
+2, lit stove +1, reading nook +1, decorations +1, running music player +1,
fed dog at home +1 (max 7). Morale drain/h = 1 - 0.25 x comfort, clamped to **-0.5..1**
(`comfort.perPoint`, `comfort.minDrain`), so 4 comfort stops the drain and
6 slowly raises morale. Applies to everyone at home.

**Hygiene and sickness**: from day **3** (`hygiene.startDay`), every **12 h**
(`hygiene.checkHours`) each resident not already Sick rolls a **20%**
chance (`hygiene.sickChance`) to become Sick. Latrine -10 points, Wash
station -10 points (`hygiene.latrineReduction`, `hygiene.washReduction`) if
it consumed 1 dirty or clean water for that check (none in stock = no
reduction). Both built and supplied = 0%. Results appear in the report.

**Spoilage**: planter crops and Hot stew spoil **48 h** after they are made
(`food.spoilHours`) and vanish (reported). Timer shown on the item. Canned
food, dry snack, jarred veg, herbs and water never spoil.

**Radio set** (M4): *Use* -> Scan, once per **12 h**
(`radio.scanCooldownHours`): reveals the floor of an unrecruited survivor
not yet found, else marks a **supply cache** (container, 3 loot rolls) on a
random Infested floor. Some scans unlock a short radio note.

**Elevator** (M4): tap its stairwell door -> list of home and Secured floors
-> **0.3 s per floor** (`elevator.secondsPerFloor`). Needs 2 free power, else
"No power". Zombies never use it.

### 5.11 Gear and throwables
- **Equipment**: the Inventory screen has a **Body** and a **Feet** slot
  (not carry slots). Tap an item -> Equip / Unequip. Armor reduces each
  zombie hit by its percentage (rounded down) and loses 1 durability per
  hit taken; broken armor disappears (toast).
- **Quiet shoes** (Feet): zombie aggro radius 200 -> **120 px**
  (`gear.quietAggroRadius`).
- **Throw**: while a throwable is carried, a **Throw** button appears in the
  bottom bar. Tap it to arm the first throwable type (a 300 px range circle
  appears, `throw.rangePx`); tap again to cycle to the next type, past the
  last type disarms. While armed, the next tap on the hero's floor within
  range throws it (lands 0.5 s later, `throw.landSeconds`);
  a tap out of range, on another floor
  or on Home disarms and keeps the item.
- **Molotov**: a fire patch **120 px** wide for **4 s** (`molotov.widthPx`,
  `molotov.seconds`), **15 damage/s** to zombies inside
  (`molotov.zombieDps`), **10/s** to the hero (`molotov.heroDps`). Counts
  as Loud. Fire never spreads and never damages objects or barricades.
- **Noise lure**: rings **3 s** after landing for **20 s** (`lure.delaySeconds`,
  `lure.ringSeconds`); every non-fighting zombie on that floor walks to it
  and waits there until it stops. Single use.
- **Flashlight** (carried): each Dim room entered uses **1 charge**; 1
  batteries = **10 charges** (`light.flashlightCharges`), auto-loaded from
  carried batteries at 0. No charge = Dim applies.
- **Tool wraps**: carried; each dismantle uses 1 of **10 uses**
  (`gear.toolWrapUses`) and is one noise step quieter (Loud -> Noisy ->
  Quiet).

### 5.12 Day and night (M2)
- Phase follows the **device's local clock** (`new Date().getHours()`).
  **Night 20:00-06:00** (`night.startHour`, `night.endHour`), day otherwise.
  **Dusk 19:00-20:00 / dawn 06:00-07:00** (`night.transitionMinutes` 60)
  only fade the visuals; gameplay switches exactly at 20:00 and 06:00.
- Changing the clock or time zone only changes the phase; elapsed time still
  follows 5.1. Days survived is unchanged (24 real hours each).
- **At night**: every room on Infested **and Cleared** floors is Dim (5.3),
  and the home apartment is Dim unless Lit (5.10). Secured floors never are.
  Zombie aggro radius x**1.25** (`night.aggroMult`; 250 px, 150 with Quiet
  shoes) and speed x**1.15** (`night.zombieSpeedMult`). Attacks starting at
  night are x**1.2** (5.8).
- **Night rewards**: each search has a **30%** chance of +1 loot roll
  (`night.bonusLootChance`); sleep energy regen **+20%**
  (`night.sleepBonus`, adds to the stove's +30%).
- **Fairness**: nothing is locked by time of day. The flashlight (cheap, M2)
  and Lit home cancel all night Dim; a night-only player pays only the
  zombie speed/aggro and attack risk and gets the loot bonus.
- **Offline**: each 10-min catch-up step uses the local hour of its own
  timestamp (night attacks offline also get x1.2). Fuel, power and
  production are not affected by the phase.
- **Show**: sky behind the tower fades navy at night; unlit apartment
  windows go dark; HUD sun/moon icon next to the day counter. One-line hint
  the first night: "Night. They hear you from further away."

### 5.13 The dog (M2)
- A dog (working name **Scout**) is shut in a bathroom on **floor 18**;
  whining plays while the hero is on floors 17-19. *Use* -> **Offer food**
  (1 canned food, dry snack or planter crop from carried items) recruits it
  at once; no quest, no survivor bed. Zombies ignore the dog: it never takes
  damage, cannot be bitten and cannot die.
- **Action menu** on the dog: **Pet** (primary) and **Follow / Stay home**
  (toggle, replaces Dismantle). Pet: wag animation, **+3 morale** once per
  **4 h** (`dog.petMorale`, `dog.petCooldownHours`); taps in between only
  wag. On background or pass the torch, the dog goes home, mode kept, and
  stays with the new character.
- **Following**: walks 40 px behind the hero, uses stairs with them. When a
  zombie that is not drawn (Dim, dark unentered room) and not aggroed comes
  within **300 px** on the same floor (`dog.barkRadiusPx`), the dog growls:
  bark SFX, a red arrow on that screen edge and the zombie's silhouette
  drawn for **2 s** (`dog.revealSeconds`); once per zombie per **15 s**
  (`dog.barkCooldownSeconds`). The growl is not noise and never aggroes.
- **Staying home**: comfort +1, attack warning +30 s, offline defense +5
  (5.8, 5.10).
- **Upkeep**: 1 food item + 1 water item (dirty is fine, no penalty) from the
  stockpile every **24 h** (`dog.upkeepHours`), online and offline. A missed
  meal makes it **Hungry** (no growls, comfort, warning or defense) until
  fed. After **3** missed meals in a row (`dog.leaveAfterMisses`) it runs
  back to floor 18 (morale -10, reported); Offer food recruits it again.

### 5.14 Infection (M2)
- Each zombie hit on the active character has a **2%** chance to infect
  (`infection.biteChance`), x**0.5** with body armor
  (`infection.armorMult`). Offline breaches (5.8): each resident rolls
  **10%** (`infection.breachBiteChance`). Residents are never bitten in other
  cases (online attacks, Scavenger job). Already Infected = no roll.
- **Stages** (real time, online and offline; `infection.stageHours`
  [12, 24, 12]): **Bitten** (0-12 h) no effect; **Fever** (12-36 h) no
  regen, energy drain x1.5; **Turning** (36-48 h) also -3 health/h
  (`infection.turningDamage`). At 48 h, or health 0 while Infected, the
  character dies and **turns**.
- **Treatment** (on yourself from Inventory; on survivors from the
  Survivors screen while the hero is home, using stockpile items):
  Antibiotics cure Bitten and Fever (and Sick, one status per pill,
  Infection first); **Antiviral** (rare loot, floors 1-7 and 23-30 and supply
  caches, M3) cures any stage; Herbal remedy sets the timer back **6 h**
  (`infection.remedyHours`, not below 0, never cures). Medic: half speed at
  home (5.7). No amputation.
- **Offline cannot kill**: catch-up stops the timer **6 h** before turning
  (`infection.offlineMinHoursLeft`); Turning damage respects the health
  floor 10. The report warns "Mara is turning: 6 h left".
- **Turning**: pass the torch (5.7) as usual. The body becomes a **Turned**
  zombie at that spot (home apartment if at home): Walker stats with **45
  HP** (`infection.turnedHp`), tinted green, holding the dropped bag; killing
  it drops the bag. Survivor death morale -20 applies. Shown off-screen as a
  fade to black, no gore.
- **Show**: grey bite icon with hours left next to the health bar. First
  bite hint: "Bitten. Antibiotics, within 36 hours." Mara's medical bag
  quest reward includes **1 antibiotics** from M2 so a cure always exists.

## 6. Progression and difficulty
- **Long-term goal**: reclaim all 30 floors (all Secured), build the Radio
  set and the Rooftop beacon, then choose to leave or stay (section 1).
- Difficulty rises with distance from floor 15: floors 13-17 crawlers and
  walkers; 8-12 and 18-22 add runners; 1-7 and 23-30 add brutes and more
  zombies per room. Better loot (axes, medkits, antibiotics) and richer
  salvage (maintenance rooms with UPS units and electrical panels, washing
  machines, leather furniture) deeper/higher.
- Tool gating: early floors are mostly hand-dismantlable; crowbar, wrench
  and saw each unlock bigger, richer objects. Workbench Lv2 gates power,
  advanced defense, leather armor and the endgame.
- Attacks grow with days survived; defenses with barricades, secured floors,
  traps and guards.
- Saved: world state (incl. every dismantled object, pile and placeable with
  its fuel), timestamp, settings, stats, ending choice.

## 7. Content
| | Milestone 1 (slice) | Version 1 (release) |
|---|---|---|
| Floors | 5 (13-17), hero on 15 | 30 + roof |
| Zombie types | Crawler, Walker | + Runner (M2), Brute (M3) |
| Weapons | Fists, knife, spiked bat | + lead pipe, pipe spear, fire axe |
| Tools | Crowbar, wrench | + saw, flashlight, tool wraps |
| Materials | 10: wood, metal, cloth, plastic, parts, seeds, glass, duct tape, chemicals, fuel | 19: + paper, meds, herbs, batteries (M2); rope, wire, rubber, leather, container (M3) |
| Dismantlable objects | 20 (M1 table) | ~43 (+ later table) |
| Consumables | canned food, dry snack, water bottle, clean water, dirty water, planter crop, bandage, medkit (loot), chocolate, molotov | + hot stew, jarred veg, herbal remedy, antibiotics, noise lure (M2); antiviral (M3) |
| Statuses | - (bites only do damage) | Sick, Infected (M2) |
| Day/night | - | real local clock (M2) |
| Pet | - | the dog, floor 18 (M2) |
| Recipes | 14 (see 5.6) | ~47 workbench + 3 stove |
| Gear | - | padded jacket, leather armor, quiet shoes |
| Survivors | 1 | 4 |
| Survivor jobs | Guard, Scavenger, Tender | + Medic, Cook, Mechanic |
| Story | Intro lines, ~5 notes | ~25 notes + radio notes, beacon ending with leave/stay choice |
| Attacks | 1 scripted + scheduled walker attacks | Full scaling, traps |

Milestone 1 survivor: **Mara, floor 13, a nurse hiding in a bathroom;
quest: fetch her medical bag from floor 14** (`items.medical_bag`, quest
item: takes 1 carry slot, never stacks, cannot be stored in the stockpile
or dropped; handed over by *Use* on Mara). Other survivors are written by
game-designer and level-designer for v1.

## 8. Screens and flow
1. **Title**: logo, "Tap to start" (unlocks audio). For a Completed (left)
   save: "You left the tower on day N", Replay ending, New game.
2. **New game**: 3 short text lines over the dark apartment ("You wake up.
   Sirens. Something is scratching at the door."), then play.
3. **Tutorial by doing (first ~60 s)**: arrow at the fridge (Search ->
   canned food) -> at the chair, then the table (Dismantle -> 6 wood) -> at
   the kitchen drawer (Search -> 2 metal, "a tin of nails") -> at the
   workbench (craft Barricade Lv1) -> at the door (corridor) -> a crawler
   appears (tap it to hit). One-line hints only, no text walls. Later
   systems get a one-line hint the first time they unlock (e.g. "Bleach
   makes dirty water safe" on first chemicals pickup).
4. **Returning**: "While you were away" report (one tap skips).
5. **Play**: tower view, top HUD (5 need bars, status icons, day, attack
   timer, power x/y from M3), bottom bar (Home, Inventory, Workbench,
   Survivors, Menu, Throw when carried).
6. **Inventory**: carry slots, Body and Feet slots, stockpile tab.
7. **Menu**: sound, music, notes read, replay ending (once unlocked),
   resume. Pausing does not stop real time.
8. **Pass the torch** -> pick survivor -> play.
9. **Game over** -> stats -> New game.
10. **Ending** (Rooftop beacon built) -> text cards -> Leave/Stay choice ->
    epilogue -> stats -> title (Leave) or continue (Stay).

## 9. Art style
- Pixel art, gritty, dark and muted; corridor lamps flicker (random
  50-150 ms dips, more during attacks). 1 art pixel = 3 game px.
- Sprites: characters **16x24** art px (48x72 game px); zombies 16x24
  (Brute 24x32); tiles/props **16x16** (large props 32x32); floor = 240x80
  art px. Material icons 8x8 art px, each a distinct silhouette (5.6).
- 1 px near-black outline on characters and interactables only.
  Dismantled objects leave a 3-frame dust puff and a faint floor mark.
- Lit apartments get a warm amber overlay; Dim rooms a dark vignette; the
  flashlight a cone. Fire: 3-frame flame loop (molotov, stove). Night: navy
  sky tint behind the tower. Dog 16x16 art px (idle, walk, wag).
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
  for attacks, 1 short hopeful cue for the ending (used by both epilogues).
  Total audio under 3 MB.
- SFX: footsteps, stairs, door open, jammed door hit, search rustle, pickup,
  punch, blade/pipe hit, weapon break, zombie moan/aggro/death, hero hurt,
  barricade hit/break, hammer, eat, drink, attack siren, lamp buzz, UI tap,
  wood crack, metal clang, cloth rip, water pour, noise alert sting, glass
  shatter, fire whoosh, stove crackle, generator hum, alarm clock ring,
  chimes, electric zap, radio static, elevator motor, dog whine/growl/bark,
  night wind ambience, bite sting.

## 11. Scope for version 1
**In**: everything in sections 1-10 for the Version 1 column of section 7,
delivered in four milestones. Each milestone ends with a playtest.

**Milestone 1 (first playable)**: hero's apartment + floors 13-17, tap
movement, action menu, scavenging, salvage (20 objects, 10 materials, tools
crowbar + wrench, same-floor noise), 14 recipes (weapon, molotov + Throw
button, tools, bandage, water x3, planter, barricades, secure floor,
survivor bed), tap combat, all 5 needs, offline catch-up with production,
1 survivor, 1 scripted attack plus scheduled attacks, save/load.

Later milestones deliver everything tagged with their number in sections
5-7:
- **M2 "Fire and medicine"**: floors 8-22, runners; paper, meds, herbs,
  batteries; Dim rooms, flashlight, saw; stove, cooking, spoilage, light,
  comfort, hygiene and sickness, medicine; day/night on the device clock;
  the dog; infection (antibiotics, Turned zombie); Workbench Lv2; survivors
  2-3, Medic and Cook; ~12 notes.
- **M3 "Power and defense"**: all 30 floors, brutes; rope, wire, rubber,
  leather, container; power, traps, Barricade Lv3, gear, tool wraps, water
  tank, lockbox; antiviral loot; survivor 4, Mechanic.
- **M4 "Beacon"**: roof, radio set, supply caches, elevator, Rooftop beacon,
  leave/stay ending, remaining notes, balancing pass.

**Out of version 1**: ads, in-app purchases, accounts, cloud saves,
multiplayer or any online feature, push notifications, leaderboards,
multiple save slots, recipes beyond the lists in 5.6, free placement of
builds, outside-the-tower areas (zip-lines, other buildings), weather and
temperature, vehicles, voice acting, more than one pet, zombie smell and
disguises, amputation.

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
- **Materials and uses**: not limited to food, water, barricade and
  crafting; any material and use relevant to a tower-bound zombie
  apocalypse is welcome (19 materials and the uses in 5.6, 5.10, 5.11).
- **Ending**: a choice at the beacon: leave with the convoy (save completed
  and frozen) or stay and hold the tower (sandbox continues) (section 1).
- **Dirty water**: keeps the health cost (-8 health per drink).
- **Loud dismantle**: aggros the same floor only; no pull from other floors.
- **Day/night** follows the real device clock; night raises risk and
  reward but never blocks progress (5.12).
- **Pet**: one dog that barks (growls) to warn of zombies (5.13).
- **Bites can infect**; untreated infection turns the character (5.14).
  Zombies sense by sight and noise only (no smell, no disguises).
- **Dog's name**: **Scout**, fixed (no player naming, no text entry).

### Open questions
1. **Backstory names** ("grey fever", "river docks" group): keep, rename,
   or also name the city/tower?
2. **Mara's trait**: section 5.7 gives each survivor one trait, but Mara's
   is not defined. Default until answered: no trait in M1. Options: (a) *Steady hands*: bandages heal +50% when she
   is the active character or at home; (b) *Light sleeper*: +15 s attack
   warning while she is home; (c) no trait in M1, decide for M2.
