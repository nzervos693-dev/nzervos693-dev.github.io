# Game Design Document

> Owned by the game-designer agent. The Creative Director has final say.
> Title: **"Floor 15"**.
> **Current target: Milestone 2 "The tower breathes"** (section 11). M2
> reworks atmosphere, layout and UI after the CD's M1 playtest (section
> 11.2 lists every M1 system that changes).

## 1. Pitch
A quiet, creepy zombie survival game seen as a side cutaway of a 30-story
apartment tower, in the spirit of Project Zomboid. You wake up alone in
your flat in the middle of an outbreak. The building is dark, the power is
failing, rain runs down the windows, and something shuffles in the
stairwell. **Everything around you is a resource**: the sofa is cloth and
wood, the fridge is metal and parts, the water heater holds the last
clean-ish water on the floor, a cleaning shelf is bleach for your water.
Creep through your neighbours' apartments, each one different, find what
they left behind, avoid the dead when you can, and make any flat you clear
into a place to sleep, store and build. Time keeps passing while you're
away, and your door must hold.

The game never says "survive". It lets you notice that you are hungry, that
the hall light is flickering again, that the banging below has stopped.

**Pillars**
1. **Dread, not a scoreboard**: no need bars, no numbers floating up, no
   sirens or countdowns. Danger and your condition are shown by the world
   and by small "moodle" icons that appear only when something is wrong.
2. **Everything is salvage**: nearly every object can be searched, drained
   or dismantled into materials, and it sits where it would really be
   (section 5.6, 5.15).
3. **Every door is a question**: apartments are big, varied and generated
   from templates for each new game, so scouting is worth the risk.
4. **Make a home anywhere**: any cleared apartment on any floor can be
   claimed; the tower lives on while you're away and your home must hold.

### Backstory
Nine days ago an infection the radio called "the grey fever" hit the city:
fever, two days of sleep, then the infected wake up hungry and wrong. The
tower's residents were evacuated by bus to a stadium shelter.

You missed it. Down with flu and sleeping pills, you slept through the
knocking, the sirens and the buses. You wake alone on floor 15: power
flickering on the backup generator, no water pressure, something scratching
at the door. Neighbours turned, apartments were left mid-meal, a few people
hid instead of leaving. Short found notes (one or two lines each, section
5.16) tell the rest: the evacuation, the shelter going silent on the radio,
Mara's last clinic shift. Nobody is coming; whatever you need, you build
from what the building already holds.

### Story ending (all 30 floors Secured) (M5)
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
   crate** (Search) appears in the main home (`ending.stayCrate`: 10 fuel,
   5 meds, 5 batteries, 10 canned food). The beacon gets the action
   **Signal the convoy**, which reopens the Leave confirm (then as Leave
   above).
6. Menu: **Replay ending** replays the cards of the choice made.

## 2. Platform
- Android phones (PWA + PWABuilder -> Google Play); also any phone browser.
- Orientation: **portrait**, locked.
- **720x1280** base, Phaser `Scale.FIT`, centered, `pixelArt: true`.
  Moodles and the bottom bar are offset by `env(safe-area-inset-*)`.
- Session **1-5 minutes** (check moodles, one scouting run or one attack,
  close); 3-6 check-ins per day.
- Every tappable thing has a hit area of at least **96x96 game px** (about
  48 CSS px on a 400 CSS px wide phone); small sprites get a padded hit area.
- Audio starts on the first tap ("Tap to start"). Download under 20 MB
  (expected under 5 MB).

## 3. Core loop
1. **Check in**: read the short "While you were away" note (plain sentences,
   5.1), glance at which moodles are showing.
2. **Tend**: eat, drink, sleep, collect production (rain water, filtered
   water, crops), refuel lamps, look at the door and repair it if it looks
   bad.
3. **Scout and scavenge**: cross the landing into an apartment you haven't
   seen. Rooms are dark until you step in. Listen for shuffling, avoid or
   ambush the dead, search what makes sense to search (a fridge in a
   kitchen, a cabinet in a bathroom), drain pipes and tanks, take furniture
   apart. Choose what to carry home (10 slots) and how much noise to risk.
4. **Craft**: at a workbench turn materials into tools, weapons,
   barricades, water and food production, light and medicine.
5. **Settle**: claim cleared apartments as home space, move your bed, build
   a door barricade, take in survivors.
6. **Hold**: when you hear groans and something heavy on the stairs, get to
   your door. Or don't notice, and find out how well it was built.

## 4. Touch controls
One thumb, taps and drags only. No hold-to-act, no multi-touch.

| Gesture | Where | Result |
|---|---|---|
| Tap | Empty spot in a room | Hero **walks** there (quiet). Pathing goes via the stairwell if on another floor. |
| Double tap | Empty spot (2nd tap within 0.3 s and 48 px of the 1st) | Hero **runs** there: faster, but makes noise and costs energy (5.4). |
| Tap | Object | Opens the **action menu** above the object (see below). |
| Tap | Zombie | If in weapon range: attack now. If out of range: walk toward it, attack once on arrival. |
| Drag, mostly vertical | Anywhere | Scrolls the camera between floors. Momentum, clamped to floors 13-17 in M2. |
| Drag, mostly horizontal | Anywhere | Pans the camera along the floor. Momentum, clamped to the floor's 0-3120 px plus a 48 px pad past each edge (`controls.cameraEdgePadPx`). |
| Tap | Moodle icon | Shows its plain-text card (5.2). |
| Tap | "Home" button (bottom bar) | Camera jumps to the hero; second tap within 1 s sends the hero to the main home's bed. |
| Tap | Bottom bar buttons (icons only, section 8) | Inventory, Workbench, Survivors, Menu; **Throw** (only while a throwable is carried, 5.11). Sound toggle is in Menu. |

**Drag rules**: a touch that moves more than **16 game px**
(`controls.dragThresholdPx`) is a drag, not a tap. The axis is locked when
the threshold is crossed: |dx| > |dy| = horizontal, else vertical; it stays
locked until release. One camera position (x, y) is shared by all floors,
because every floor has the same width and the stairwell is a vertical
shaft at the same x on every floor (5.3).

**Camera follow**: while the hero walks or runs, the camera follows on both
axes. Horizontally it keeps the hero inside a dead zone of **+/-160 px**
around screen centre (`controls.cameraDeadzoneXPx`) and eases toward him
with lerp **0.12** per frame (`controls.cameraLerp`). Follow pauses for
**2 s** after any player drag (`controls.cameraFollowPauseSeconds`). When
the hero changes floor, the camera follows vertically and keeps its x
relative to the stairwell shaft.

**Camera edge pad** (`controls.cameraEdgePadPx` **48**): the camera may
pan up to 48 px past the left (x < 0) and right (x > 3120) world edges, so
objects at a wing's far end can be centred away from Android's back-swipe
gesture zone at the screen edges. Drag, momentum and follow all use the
same clamp: camera view left edge >= -48, right edge <= 3120 + 48. The pad
area is drawn as plain outer wall (not walkable; taps there do nothing).

**Action menu**: a small header with the object's name (e.g. "Kitchen
cupboard") and up to 2 buttons, each **96x96 game px** (icon + label),
side by side above the object (below it if it would leave the screen):
**Primary** (*Search* containers, *Drain* water sources, *Use* workbench,
planter, collector, survivor, lamp; *Claim* / *Leave this place* on a
front door; only if available) and **Dismantle**. Exception: a
**sleepable bed** in a claimed apartment (bed or mattress) shows **Sleep**
and **Nap** (5.2) and no Dismantle while it is the main home bed. If a
needed tool is missing, the button is greyed with "Needs crowbar" and does
nothing. A button tap sends the hero; the action starts on arrival. A tap
elsewhere closes the menu and counts as a normal tap. Objects with exactly
one action skip the menu and act directly.

Rules: a new tap cancels the current walk/action, except a search or
dismantle past 50% completes. At most **1** attack tap is buffered during
cooldown. Taps on a dark (unentered) room walk to its doorway. Taps behind
a closed barricade the hero did not build show "Barricaded from the
inside."

## 5. Mechanics
All numbers below are starting values and live in
`public/data/balance.json` (key in brackets). Programmers must not
hard-code them. "M1-M5" marks the milestone a feature arrives in (section
11). Lists are keyed by stable snake_case ids: `materials.<id>`,
`objects.<id>`, `recipes.<id>` (cost, output, effect numbers, `buildSpot`),
`consumables.<id>`, `combat.weapons.<id>`, `zombies.types.<id>`,
`barricade.levels`, `survivors.roster.<id>`. **`items.<id>` is the lookup
registry**: every id usable in a cost, yield, output or loot table has an
entry there (`type` material/consumable/water/weapon/tool/throwable/quest,
`name`, `stack` material = 20, item = 10, tool = 1 per slot); the detailed
blocks above hold the stats. Recipe ids are their own namespace and may
equal their output's item id. Two-number arrays (e.g. `[1, 3]`) are
inclusive min/max ranges. A `null` durability means never breaks. Sizes
are `small`/`medium`/`large`, noise `quiet`/`noisy`/`loud`. An object or
recipe with a `milestone` field is only used from that milestone on;
without it, it is M1.

**Controls numbers**: drag threshold 16 px (`controls.dragThresholdPx`),
Home double tap 1 s (`controls.homeDoubleTapSeconds`), run double tap
0.3 s / 48 px (`controls.runDoubleTapSeconds`,
`controls.runDoubleTapMaxDistancePx`), camera follow pause 2 s
(`controls.cameraFollowPauseSeconds`), buttons and hit areas 96 px
(`controls.buttonSizePx`, `controls.minHitAreaPx`), 1 buffered attack tap
(`controls.attackBuffer`), camera edge pad 48 px
(`controls.cameraEdgePadPx`), tutorial front-door trigger 60 px
(`tutorial.doorTriggerPx`, 11.3 Stage 2 rules). M2 floors 13-17 (`world.floorMin`,
`world.floorMax`); floor geometry in `world.*`; start flat on floor 15,
left wing (`home.startFloor`, `home.startWing`).

### 5.1 Time and the idle simulation
- Game time = real time, from `Date.now()` deltas, never frame counts.
  Online tick every **1 s** (`time.tickSeconds`).
- On resume/launch: elapsed = now - lastSaveTime. If elapsed < 0 (clock
  changed backward) treat as 0. Elapsed is capped at **12 h**
  (`time.offlineCapHours`); time beyond the cap is lost (the world "pauses").
- Offline catch-up runs in **10-minute steps** (`time.offlineStepMinutes`)
  so stash auto-use, lamp fuel, production and attacks resolve in order.
- When the app goes to background (`visibilitychange` hidden): save
  immediately; any fight, search or dismantle in progress is abandoned (no
  progress kept), the hero and survivors are moved to their claimed
  apartments (hero: main home), zombies keep their current HP and return
  to their rooms; burning molotov fires end.
- Autosave every **10 s** (`time.autosaveSeconds`) and on every floor change,
  craft, dismantle, claim and attack end. Save is localStorage, one slot,
  **save version 2**. An M1 save (version 1) cannot be converted: on launch
  it is deleted and the title shows one line, "The building has changed.",
  then New game.
- **"While you were away"** (M2 rewrite): up to 6 short plain sentences,
  no numbers except item counts and clock times, no icons. Examples:
  "You slept badly.", "Around 03:10 something beat on the door for a long
  time. It held.", "They got in. Mara is hurt. Lost: 2 canned food, 6
  wood.", "The lamp in the kitchen burned out.", "The rain collector is
  full." One tap closes it.

### 5.2 Needs and moodles
Needs are still tracked 0-100 internally, but **never shown as bars or
numbers** (M2). The player reads their condition from **moodles**: small
icons that appear only when something is wrong.

| Need | Start | Drain/h online | Drain/h offline | Restored by |
|---|---|---|---|---|
| Health | 100 | 0 (see below) | 0 | Bandage +15, Medkit +40, regen |
| Food | 80 | 3 (`needs.food.drain`) | 3 | Canned food +30, Dry snack +15, Planter crop +20 |
| Water | 80 | 4 (`needs.water.drain`) | 4 | Water bottle +35, Clean water +20, Dirty water +20 (-8 health) |
| Energy | 100 | 6 awake (`needs.energy.drain`) | -10 (regen, asleep) | Bed: +25/h online; Nap +30 (every 4 h) |
| Morale | 60 | 1 (`needs.morale.drain`), less with comfort (5.10) | same | Events (see below), comfort |

**Moodles** (M2, `moodles.*`). Each moodle has 4 severity levels. Level N
shows when the stat is **below** the N-th value of its `below` array
(level 4 is the worst). Level changes are re-evaluated every tick.

| Moodle | Stat | L1 / L2 / L3 / L4 shows below | Card text (L1 / L2 / L3 / L4) | Effect |
|---|---|---|---|---|
| Hungry | food | 60 / 40 / 20 / 1 | Peckish / Hungry / Very hungry / Starving | L4: -5 health/h (empty need) |
| Thirsty | water | 60 / 40 / 20 / 1 | Thirsty / Very thirsty / Parched / Dying of thirst | L4: -5 health/h |
| Tired | energy | 50 / 35 / 20 / 5 | Tired / Very tired / Exhausted / Can barely stand | L3+: speed and damage -30% (`needs.energy.lowPenalty`) |
| Injured | health | 80 / 60 / 35 / 15 | Hurt / Injured / Badly hurt / Close to death | none (health is the effect) |
| Depressed | morale | 50 / 35 / 25 / 10 | Low / Unhappy / Depressed / Hopeless | L3+: damage -20%, energy drain x1.5, survivors refuse quests |
| Panic | aggroed zombies within 400 px, same floor | 1 / 2 / 3 / 5 zombies | Uneasy / Scared / Panicked / Terrified | damage -0 / -10 / -20 / -30% (`moodles.panic.damagePenalty`) |
| Sick (M3) | status | - | Queasy ... | see 5.10 |
| Infected (M3) | status | Bitten / Fever / Turning | ... | see 5.14 |

- The L3 thresholds of Tired and Depressed must equal
  `needs.energy.lowThreshold` (20) and `needs.morale.lowThreshold` (25);
  the effects keep their M1 keys.
- **Panic** decays one level every **5 s** (`moodles.panic.decaySecondsPerLevel`)
  once fewer aggroed zombies are near. It never rises from the attack cue
  (5.8), only from zombies that have seen the hero.
- **Display**: a column of icons at the top right, **72 game px** each
  (`moodles.iconPx`, 24x24 art px) with a 96 px hit area, max 6 (`moodles.maxShown`),
  worst level first. The icon is a simple pictogram (empty plate, drop,
  closed eye, bandage, cloud, wide eye) on a square whose colour darkens
  with severity (section 9). No numbers. When a moodle appears or changes
  level it wobbles once for **0.5 s** (`moodles.levelChangeWobbleSeconds`)
  and plays one soft cue (a stomach growl, a dry swallow, a yawn, a pained
  breath, a sigh, a fast heartbeat), never a UI blip.
- **Tap a moodle**: a small card under it with one line ("Very hungry.")
  and, if it helps, one 96 px button: Hungry/Thirsty -> "Eat: Canned food"
  / "Drink: Clean water" (the smallest fitting item, carried first, then the
  stash of the claimed apartment the hero is in; never a comfort item unless
  nothing else exists); Injured -> "Use: Bandage"; Tired -> "Find a bed."
  (no button). Tap anywhere else closes it.
- The M1 online prompt "You're starving: eat?" is **removed**; the Hungry
  and Thirsty moodles replace it.
- Start values `needs.<need>.start`; every need maxes at 100 (`needs.max`).
  Bed sleep +25 energy/h (`needs.energy.sleepRegen`); offline (asleep)
  +10/h (`needs.energy.offlineRegen`). Food/water/morale drain the same
  online and offline.
- Item restore values live in `consumables.<id>` and `water.dirty` /
  `water.clean`. **Chocolate**: +10 morale, +5 food.
- **Regen** +4 health/h (`needs.health.regen`) while food, water > 50
  (`needs.health.regenMinFoodWater`) and energy > 20
  (`needs.health.regenMinEnergy`). Each empty need costs **5 health/h**
  (`needs.emptyNeedDamage`).
- **Morale** > 75 (`needs.morale.highThreshold`): damage +10%
  (`needs.morale.highDamageBonus`); no moodle (good states are not shown).
- **Morale events** (`needs.morale.events.*`), applied silently (no
  floating text): survivor recruited +15, quest done +10, talk to a
  survivor +5 (once per survivor per 12 h, `talkCooldownHours`), comfort
  item +10 (`consumables.<id>.morale`), first planter harvest +5, first
  apartment claimed +5 (`firstClaim`), attack repelled +5, quick nap +2,
  barricade breached -10, survivor dies -20.
- **Breach penalty latch**: -10 applies when the main home barricade goes
  from above 0 HP to 0 HP, then latches; it cannot apply again until the
  barricade is repaired to full HP or a new attack begins. Offline: at most
  once per attack.
- **Auto-use offline**: below **40** food or water (`needs.autoUseThreshold`)
  the character eats/drinks the smallest fitting item from claimed stashes
  (main home stash first, then the others in claim order), clean water
  before dirty. Comfort items (chocolate) are skipped unless the need is
  below **20** (`needs.lastResortThreshold`, renamed from
  `onlinePromptThreshold`) and nothing else fits.
- **Offline safety**: catch-up never kills; health floors at **10**
  (`needs.offlineHealthFloor`). Death only happens while playing.
- Fairness: 12 h offline drains at most 36 food / 48 water, so 80/80 never
  wakes to an empty need.
- **Early water budget (QA check)**: start 80 water lasts 20 h to empty;
  the start flat's toilet tank (2 dirty) + kitchen chemicals purify to 2
  clean water (+40, ~10 h). Health regen stops below 50 water (after
  ~7.5 h), which hurts fighting, so floors **14 and 16** each guarantee
  **1 clean-water item** (water bottle 70% / clean water 30%) in a flat
  kitchen container (`generator.guarantees.cleanWaterFloors`,
  `cleanWaterItemsPerFloor`). Total before any drains: ~190 water, about
  45 h. A rain collector (3 plastic, 2 metal) yields 6.7 water/h against a
  4/h drain, so it is self-sustaining once built; its cost is reachable on
  floors 14-16 in one 5-minute session.
- **Sleep**: main home bed -> *Sleep* (+25 energy/h); any tap wakes. Closed
  app = characters in claimed apartments are asleep (offline +10/h).
- **Quick nap** (`needs.energy.nap`): bed -> *Nap*. The active character
  walks to the bed, lies down, the screen fades to black over **5 s**
  (`durationSeconds`) and back. On completion: energy **+30** (capped at
  100), food **-5** and water **-5** (floored at 0), morale **+2**, and the
  cooldown of **4 h** real time starts (`cooldownHours`).
  - Napping or sleeping in a bed in another claimed apartment makes that
    apartment the **main home** (5.3).
  - The cooldown is one timer per save (`lastNapAt`, a `Date.now()`
    timestamp), runs online and offline; pass the torch does not reset it.
  - **Button states**: ready = "Nap". Cooldown = greyed "Nap (2h 10m)",
    remaining time rounded **up** to the minute, hours dropped under 1 h
    ("Nap (45m)"). Energy at 100 = greyed "Nap (rested)". Unsafe = greyed
    "Nap (not safe)" while any zombie on the hero's floor is aggroed or an
    attack is in progress (attackers present). The **attack cue does not
    grey the button** (it must stay easy to miss, 5.8). Tapping a greyed
    button shows its reason as a toast and does nothing.
  - **Interrupts** (cancel the nap): a zombie seeing the character, a bite,
    fire, the stairwell sounds of an attack cue (8 s before the attack:
    the character jolts awake), any tap, or the app going to background.
    A cancelled nap gives nothing, costs nothing and does **not** start the
    cooldown; the fade snaps back.
  - Remaining cooldown = clamp(cooldownHours - (now - lastNapAt), 0,
    cooldownHours).

### 5.3 The tower, floors and apartments (M2 rework)
**Geometry** (`world.*`). Every floor is **3120 x 240 game px**: a **left
wing** (0-1440), the **stairwell shaft** (1440-1680, 240 px wide, with the
landing, the floor number painted on the wall and the dead elevator door)
and a **right wing** (1680-3120). The shaft is at the same x on every floor,
so the tower stays a clean rectangle. About 5 floors are visible
vertically and **720 px** (half a wing) horizontally, so most rooms are
out of sight of the stairwell.

- Each wing is **6 modules of 240 px** (`world.moduleWidthPx`,
  `world.modulesPerWing`) and holds exactly **one unit** (an apartment, an
  office or a service area) built from a template (5.15). Its **front door**
  is at the wing's stairwell edge (x 1440 left, x 1680 right). Rooms are
  laid out from the front door outward.
- A room is 1, 2 or 3 modules wide. Each module has **2 floor slots** and
  **2 wall slots** at **72 and 168 px** from the module's left edge
  (`world.slotOffsetsPx`), so every object is >= 96 px from its neighbour
  in the same layer, and >= 48 px from any doorway
  (`world.doorwayClearancePx`). At most one object per slot.
- Rooms connect by doorways at room boundaries; a doorway may hold an
  interior door object (salvage only, never blocks walking).
- Hero walk speed **100 px/s** (`hero.walkSpeed`), run **170 px/s**
  (`hero.runSpeed`); stairs **1.4 s per floor** (`hero.stairSecondsPerFloor`).
  Front door to the far end of a wing: ~14 s walking.

**Rooms and light** (M2). Each room has one light state:
- **Dark**: not yet entered. Drawn near-black with faint outlines of the
  nearest wall. Zombies inside can always be **heard** (5.4). CD decision:
  - **Object silhouettes**: while the hero stands within **240 px**
    (`light.darkSilhouetteRangePx`) of a doorway into a Dark room (from the
    neighbouring room, or from the landing for the room behind a front
    door), the room's objects are drawn as flat shapes in deep shadow
    `#16191d`, no detail, no colour. Once seen, silhouettes stay drawn
    (the hero remembers the shapes). Silhouettes are not tappable as
    objects: a tap walks to the doorway (4).
  - **Zombies** in a Dark room are drawn (same flat silhouette) only while
    within **150 px** of the hero (`light.dimVisionPx`), or while they are
    **moving** (idle wander, chase, return) and the hero is within
    silhouette range of that room's doorway. A zombie standing still out of
    the 150 px radius is invisible. Zombie silhouettes are never
    remembered.
- **Dim**: entered, no window and no burning lamp. Zombies are drawn only
  within **150 px** of the hero (`light.dimVisionPx`), and search and
  dismantle take **x1.5** time (`light.dimTimeMult`).
- **Grey**: entered, the room has a window (`hasWindow` in the room type,
  5.15). Cold daylight; everything in the room is drawn.
- **Lit**: a burning oil lamp is in the room. Everything drawn, warm.
- The stairwell landing is Dim on every floor, lit only by a weak
  emergency light that flickers. Rooms stay entered (never go back to
  Dark).

**Floor states**: **Infested** (living zombies on the floor) -> **Cleared**
(no living zombies on the floor; M2 drops the M1 "all containers searched"
condition because wings are much larger) -> **Secured** (Secure floor
recipe: defense +5 each, no more wanderers).
- Cleared-but-unsecured floors get **1-2 wandering walkers every 12 h**
  (`world.wanderersPerInterval`, `world.wandererIntervalHours`; cap and
  spawn rules in 5.4), never inside a claimed apartment. Otherwise killed
  zombies stay dead. A floor with a living wanderer is Infested again.
- Some front doors are jammed (**25%** of wings,
  `generator.frontDoorJammedChance`; never the start flat): **3 hits**
  (`world.jammedDoorHits`) to open, or 1 s with a crowbar
  (`world.jammedDoorCrowbarSeconds`, 1 crowbar use).

**Claiming home space** (M2). "Home" is no longer fixed to floor 15.
- The **start flat** (floor 15, left wing, template `your_flat`) is claimed
  from the start and is the first **main home**.
- **Claim**: when a unit has **no living zombie inside it** and its front
  door is not broken, the front door (tapped from inside or from the
  landing) offers **Claim**. The hero walks to the door and spends **2 s**
  checking the lock (`home.claimSeconds`, quiet, interruptible like a
  search). The unit becomes a **claimed apartment**. Burned units can be
  claimed. Max **3** claimed at once (`home.maxClaimed`); a 4th shows the
  greyed button "Claim (too much to hold)".
- **A claimed apartment gives**:
  - a **stash** (a pile of bags and boxes) placed on the free floor slot
    nearest the front door, or against the door if none is free: **40
    slots** in the start flat (`home.startStashSlots`), **20** in each
    other claimed apartment (`home.claimedStashSlots`). Entering any
    claimed apartment offers "Store all" into its stash.
  - **build spots**: every empty floor slot in it is a floor spot; every
    empty wall slot in a room with a window is a window spot (so removing a
    window pane or curtains frees a window spot). No other caps.
  - **beds**: every intact bed or mattress in it can be slept or napped in;
    survivor beds can be built there.
  - **safety**: wanderers never spawn inside; its rooms count as "at home"
    for every rule (comfort, Store all, regen of survivors living there).
  - a **front door barricade spot** (5.8).
- **Main home**: the claimed apartment containing the bed the active
  character last **slept or napped** in. Only one at a time. It is where
  attacks go (5.8), where "Home" sends the hero, where the hero sleeps
  offline and whose Lit state counts for comfort. Changing it is the
  natural act of sleeping somewhere else; the first time, a one-line
  thought: "I'll sleep here now."
- **Workbench**: the start flat has one. Other claimed apartments need the
  **Workbench** recipe (5.6). Crafting uses carried items first, then the
  stash of the apartment the workbench is in.
- **Leave this place**: a claimed apartment that is not the main home, has
  no survivor living in it and an empty stash can be unclaimed from its
  front door (tap twice to confirm). Its placeables stay as ordinary
  salvage; its barricade stays and still blocks zombies.

### 5.4 Combat and stealth (M2 rebalance)
The dead are slow, heavy and many. Fights are dangerous; avoiding them is
usually wiser.
- Each tap on a zombie in range = one attack (weapon damage, range,
  cooldown). Hits knock back **8 px** and flash pale for **60 ms**
  (`combat.knockbackPx`, `combat.hitFlashMs`). No damage numbers. Weapon
  rows live in `combat.weapons.<id>`, zombie rows in `zombies.types.<id>`.
- **Hit feedback** (CD request, after Stage 1 playtest; keys
  `combat.hitFx.*` and `combat.weapons.<id>.hitSound`). Cosmetic only: no
  effect on damage, noise, sight or saves.
  - **Splash**: every hit on a zombie sprays a dark blood splash (dried
    blood `#4e1c1a`, section 9) from the hit point **away from the hero**
    (direction = sign of zombie x - hero x). Fists make a smaller spatter
    than weapons.
  - **Hit sound**: one per hit, by the weapon's `hitSound`: `stab` (blades:
    kitchen knife, pipe spear, fire axe), `blunt` (spiked bat, lead pipe,
    crowbar), `punch` (fists). A weapon without `hitSound` uses `blunt`.
  - **Floor stains**: a hit leaves a blood decal on the floor under the
    zombie with chance **0.35** (`decalChance`); every kill always leaves
    one. Decals fade out linearly over **600 s** (`decalFadeSeconds`) of
    online play and are not saved (they are gone after a reload or
    background). At most **30** per floor (`decalCapPerFloor`); a new decal
    over the cap removes the oldest on that floor. Decals never block
    taps or hide objects' hit areas.
  - **Drip**: after a kill, with chance **0.5** (`dripChance`), one extra
    drop falls from the corpse **450 ms** later (`dripDelayMs`). No sound.
  - Hits on barricades and jammed doors make no blood (splinters only).
- **Sight with facing** (BUG-031 fix; keys `zombies.sight.*`, replacing
  the old `zombies.sightRadiusPx` / `dimSightRadiusPx` /
  `darkSightRadiusPx`, kept briefly as aliases, see 11.2): every zombie faces left or right. It notices the
  hero (same floor, no closed barricade or jammed door between) when the
  horizontal distance |dx| is:
  - **in front** (hero on the side it faces): within **180 px** if the
    hero stands in a Grey or Lit room (`frontPx`), **110 px** in Dim or the
    landing (`dimFrontPx`), **70 px** in Dark (`darkFrontPx`);
  - **behind**: within **24 px** while the hero walks (`behindWalkPx`,
    below fists range 40 px, so a walking hero can always strike first),
    within **60 px** while he runs (`behindRunPx`; run noise usually wakes
    it sooner anyway). Light does not change the behind values.
  - **Facing rules**: a wandering zombie faces its walk direction. A paused
    idle zombie turns around every **4-8 s** (random, `idleTurnSeconds`);
    the turn shows as a **0.4 s** head-turn frame before the facing flips
    (`turnSeconds`, sight still uses the old facing during it). An aggroed
    zombie always faces the hero. A zombie hit while unaware turns to the
    hero instantly and aggroes. Authored zombies take `facing` from level
    data; generated zombies face away from the unit's front door with
    chance **0.7** (`spawnFacingAwayChance`), else toward it.
  - Entering a zombie's room never wakes it by itself.
- **Hearing**: noise (running, noisy/loud salvage, molotovs, jammed-door
  hits) aggros zombies as in 5.6 regardless of facing; **running** is
  noise with radius **250 px**, fired once per second while running
  (`hero.runNoiseRadiusPx`). Walking is silent, and a melee hit makes no
  noise (other zombies notice only by sight).
- **Stealth target (QA)**: walking up behind an idle walker and hitting
  first succeeds in at least 4 of 5 tries when the hero starts outside its
  front sight.
- **Running** (CD decision): double tap = run (4), single tap = quiet walk.
  Running costs **0.2 energy per second** (`hero.runEnergyPerSecond`; a
  full wing at 170 px/s costs about 1.7). The Tired L3+ speed penalty
  applies to running too. At energy below **5** (Tired L4,
  `hero.runMinEnergy`) a double tap makes the hero walk and think "I can't
  run anymore." (once per 20 s, like all thoughts). A run ends on arrival;
  the next tap starts a new walk or run. Running on stairs keeps the stair
  time (1.4 s per floor) but still makes noise on the floor being left.
- **Unaware hit**: the first hit on a zombie that has not noticed the hero
  deals **x3** damage (`combat.unawareHitMult`). A walker (45 HP) dies to
  one unaware spiked bat hit plus one more. This is the main tool for
  thinning rooms. A zombie that lost track (below) and is back at its spawn
  point counts as unaware again, so the x3 hit applies again.
- **Losing track**: an aggroed zombie that has not seen the hero for **8 s**
  (`zombies.tuning.loseTrackSeconds`) while he is more than **400 px** away
  (`zombies.tuning.loseTrackDistancePx`) or on another floor gives up and
  shambles back to its spawn point. Zombies never use stairs except during
  attacks.
- **Roaming**: an aggroed zombie chases the hero anywhere on its own floor
  (both wings and the landing). It cannot pass a closed barricade; it bangs
  on it instead and damages it (x0.4, below).
- **Idle wander**: a non-aggroed zombie picks a random point within
  **60 px** of its spawn (`zombies.tuning.wanderRadiusPx`), walks there at
  **x0.4** its speed, pauses **2-5 s** (`zombies.tuning.wanderPauseSeconds`)
  and repeats. Groups wander as a loose cluster, **24-48 px** apart
  (`zombies.tuning.groupSpacingPx`).
- **Bite wind-up** **0.9 s** (`zombies.tuning.attackWindupSeconds`): the
  zombie leans in before each bite; this is the cue to step back.
- **Hit stun**: each hero hit stops the zombie for **0.35 s**
  (`zombies.tuning.hitStunSeconds`).
- **Corpse**: a killed zombie slumps and stays **1.5 s**
  (`zombies.tuning.corpseSeconds`), then fades.
- **Barricades**: zombie damage to any barricade is multiplied by **0.4**
  (`zombies.barricadeDamageMult`), both during attacks and when an aggroed
  zombie bangs on a claimed door.
- **Jammed doors**: block sight and movement and stop weapon hits. Noise
  passes: zombies on the other side aggro and bang (SFX) but cannot open
  it.
- **What interrupts actions** (search, dismantle, drain, claim): a zombie
  seeing the hero, a bite, or standing in fire. A zombie alerted only by
  noise does **not** interrupt until it sees the hero.
- **Weapon durability**: an equipped weapon stays in its carry slot. It
  loses **1 durability per hit on a zombie**; missed swings and hits on
  jammed doors cost energy only (0.5 per swing).
- **Wanderers** (5.3): at most **3** alive per floor
  (`zombies.tuning.maxWanderersPerFloor`); they spawn at least **200 px**
  from the hero, never inside a claimed apartment.

| Weapon | Damage | Range px | Cooldown s | Durability (hits) | Hit sound | Source |
|---|---|---|---|---|---|---|
| Fists | 5 | 40 | 0.4 | infinite | punch | - |
| Kitchen knife | 10 | 45 | 0.35 | 40 | stab | loot |
| Spiked bat | 14 | 55 | 0.5 | 50 | blunt | crafted (M1) |
| Lead pipe | 16 | 60 | 0.6 | 60 | blunt | loot, crafted (M3) |
| Pipe spear | 20 | 75 | 0.7 | 50 | stab | crafted (M3) |
| Fire axe | 30 | 65 | 0.9 | 80 | stab | loot (M3) |

| Zombie | HP | Speed px/s | Damage | Attack interval s | Milestone |
|---|---|---|---|---|---|
| Crawler | 20 | 15 | 8 | 2.5 | M1 (rebalanced M2) |
| Walker | 45 | 26 | 14 | 2.2 | M1 (rebalanced M2) |
| Runner | 20 | 110 | 6 | 1.0 | M3+, to be re-judged against the "shamble" direction |
| Brute | 120 | 25 | 20 | 2.0 | M4 |

- Zombie attack range 30 px (`zombies.attackRange`). Each swing costs **0.5
  energy** (`combat.energyPerSwing`). Broken weapons revert to fists (toast
  "The bat splits.").
- **Danger check** (design intent, QA test): fists vs one aware walker:
  9 hits, ~3.6 s at full speed, the hero takes 1-2 bites (14-28). Two aware
  walkers with a spiked bat: ~25-45 damage taken. Three aware walkers with
  fists: likely death. Running away at 170 px/s always outpaces a walker
  (26 px/s).
- **Encounter targets (BUG-033, placement rules for level data)**: on
  floors 13-17 the first room a hero meets in any unit holds at most **one
  walker** (crawlers extra). A walker pair (2 in one room) must be skippable
  or approachable from behind (starts facing away, at least one room-width,
  150 px, from the unit's entrance and from any jammed door the hero must
  hit). Three walkers never share a room before M3. Target win rates:
  fists + stealth vs 1 walker 5/5 survive; fists vs an aware pair may lose;
  a bat or a stealth opener vs a pair survives 4/5. Stats are unchanged;
  the fix is placement and facing. Generator: `generator.maxWalkersPerRoom`
  = 2 and distance-2 wings roll **1-3** zombies.
- Armor (M4) reduces damage taken; throwables (5.11) add area damage.

### 5.5 Scavenging and inventory
- Containers make **0-2 loot rolls** (`scavenge.lootRolls`) from
  per-container tables (level-designer, `public/data/levels/loot.json`;
  `objects.<id>.primary.lootTable`). Before rolling, a container is
  **empty** with the chance of its unit's condition: normal **30%**,
  ransacked **70%**, burned **85%**
  (`generator.conditions.<c>.emptyChance`). Empty shows the text "Nothing."
  or a flavour line ("Someone got here first.", "Just mouse droppings.").
- Any consumable rolled comes as **1** (`scavenge.consumableQtyCap`), so a
  find is "a tin of beans", not a haul. Materials keep their table ranges.
- Search takes **3 s** (`scavenge.searchSeconds`, x1.5 in Dim) with a thin
  progress ring, costs **1 energy** (`scavenge.searchEnergy`).
- **No loot highlight**: no sparkle, pulse, glow or "!" on containers, ever.
  Searched containers look slightly ajar (doors open, drawers out).
- Hero carries **10 slots** (`inventory.carrySlots`). Items stack to **10**
  (`inventory.itemStack`); materials to **20** (`inventory.materialStack`);
  weapons and tools never stack (`inventory.toolStack`).
- Stash sizes: 5.3. Full inventory: search loot stays in the container;
  dismantle yield drops as a tappable **material pile** (never despawns).

### 5.6 Everything is salvage
Almost every object drawn in an apartment is usable. Walls, floors, the
stairwell, front doors, the workbench and barricades are not (barricades
can only be repaired or replaced). Zombies are never salvage.

**Materials** (19 in v1; 10 in M1-M2). Each has a distinct 8x8 icon.

| Material | Icon | Typical sources | Main uses | MS |
|---|---|---|---|---|
| Wood | plank | chairs, tables, doors, shelves | barricades, bats, planters, workbench | M1 |
| Metal | bent plate | appliances, pipes, bed frames, cages | barricades, tools, lamps | M1 |
| Cloth | folded rag | curtains, sofas, mattresses, laundry | bandages, molotov wicks, lamps | M1 |
| Plastic | bottle | TVs, buckets, chairs, potted plants | collectors, planters, filters | M1 |
| Parts | gear | electronics, appliances, washing machines | tools, filters | M1 |
| Seeds | seed pouch | potted plants, pantries | planters | M1 |
| Glass | shard | windows, mirrors, bottles, lamps | molotovs, oil lamps | M1 |
| Duct tape | grey roll | toolboxes, utility shelves, desks | barricade Lv2, weapons | M1 |
| Chemicals | bleach jug | utility shelves, under-sink cupboards | purifying water | M1 |
| Fuel | red can | storage cages, utility shelves, oil lamps | molotovs, oil lamps | M1 |
| Paper | book | bookshelves, boxes, magazines | stove fuel, reading nook | M3 |
| Meds | pill bottle | medicine cabinets, first-aid boxes | medkits | M3 |
| Herbs | leaf | herb pots, herb boxes | herbal remedy, hot stew | M3 |
| Batteries | AA cell | clocks, smoke alarms, laptops | flashlight, noise lure, radio | M3 |
| Rope | coil | clotheslines, blinds; crafted | tripwire, elevator | M4 |
| Wire | copper coil | extension cords, electrical panels | generator, lights, radio | M4 |
| Rubber | black band | hoses, bicycles, washing machine seals | quiet shoes, fence, tank | M4 |
| Leather | brown hide | leather sofas, jackets, bags | leather armor | M4 |
| Container | jerrycan | buckets, jerrycans, cooler bottles | water tank | M4 |

Water from salvage comes as consumable items: **Dirty water** (+20 water,
**-8 health** `water.dirtyHealthCost`) and **Clean water** (+20 water).

**Dismantle rules**
- Size sets time and energy: **Small 2 s / 1**, **Medium 4 s / 2**, **Large
  8 s / 4** (`salvage.time.*`, `salvage.energy.*`); 50% slower at energy
  < 20 (`salvage.lowEnergySlow`); Dim x1.5 (5.3).
- **Tools** must be carried: **Crowbar** (doors, wardrobes, beds, filing
  cabinets, storage cage padlocks), **Wrench** (pipes, water heater, fridge,
  washing machine). Saw (M3: bookshelves, counters). Each tool has **20
  uses** (`salvage.toolUses`); every completed action that needs it uses 1.
- **Noise**, fired when dismantling starts. **No visual marker** (the M1
  floating "!" is removed): the sound itself plays (creak, crack, clang)
  and zombies that heard it turn and shamble toward it. *Quiet* none;
  *Noisy* aggros zombies within **400 px** on the same floor
  (`salvage.noiseRadius`); *Loud* aggros every zombie on the same floor.
  Noise never reaches other floors.
- An unsearched container is searched first (+3 s). Interrupts as 5.4;
  progress is lost unless past 50% (`salvage.keepProgressRatio`).
- Yield is fixed per object plus listed chances. The object is removed for
  good (saved) and never respawns.
- Crafted placeables can be dismantled for **50%** of their cost, rounded
  down (`salvage.refundRatio`), quiet, Small time and energy.
- **Drain** (quiet, Small time and energy) works once per object.

**Objects in M1-M2** (the generator places them by room type, 5.15):

| # | Object | Size | Tool | Noise | Primary | Dismantle yield | MS |
|---|---|---|---|---|---|---|---|
| 1 | Chair | S | - | Quiet | - | 2 wood | M1 |
| 2 | Table | M | - | Noisy | - | 4 wood | M1 |
| 3 | Kitchen cupboard | M | - | Noisy | Search (food, chemicals) | 3 wood | M1 |
| 4 | Wardrobe | L | Crowbar | Noisy | Search | 6 wood + 1 metal | M1 |
| 5 | Bed | L | Crowbar | Noisy | Sleep/Nap when claimed | 3 wood + 2 metal + 2 cloth | M1 |
| 6 | Sofa | M | - | Quiet | - | 3 cloth + 2 wood | M1 |
| 7 | Curtains | S | - | Quiet | - | 2 cloth | M1 |
| 8 | Potted plant | S | - | Quiet | - | 1 plastic, 60% +1 seeds | M1 |
| 9 | Interior door | M | Crowbar | Loud | - | 5 wood + 1 metal | M1 |
| 10 | Fridge | L | Wrench | Loud | Search (food) | 4 metal + 2 plastic + 1 parts | M1 |
| 11 | Microwave | S | - | Noisy | - | 1 metal + 1 plastic + 1 parts + 1 glass | M1 |
| 12 | TV | M | - | Noisy | - | 2 plastic + 2 parts + 1 glass | M1 |
| 13 | Sink pipes | M | Wrench | Noisy | - | 2 metal + 1 dirty water | M1 |
| 14 | Toilet tank | M | - | Quiet | Drain: 2 dirty water | 1 plastic | M1 |
| 15 | Water heater | L | Wrench | Loud | Drain (wrench): 6 dirty water | 4 metal + 1 parts | M1 |
| 16 | Kitchen drawer | S | - | Quiet | Search (metal, tape) | 1 wood | M1 |
| 17 | Window pane | S | - | Noisy | - | 2 glass | M1 |
| 18 | Bathroom cabinet | S | - | Quiet | Search (chemicals, bandage) | 1 glass + 1 plastic | M1 |
| 19 | Toolbox | S | - | Quiet | Search (tape, metal) | 1 metal | M1 |
| 20 | Oil lamp | S | - | Quiet | - | 1 glass + 1 metal, 50% +1 fuel | M1 |
| 21 | Mattress | M | - | Quiet | Sleep/Nap when claimed | 4 cloth | M2 |
| 22 | Medicine cabinet | S | - | Quiet | Search (bandage, medkit, chemicals) | 1 glass + 1 metal | M2 |
| 23 | Desk | M | - | Noisy | Search (tape, parts, snack, notes) | 4 wood + 1 metal | M2 |
| 24 | Filing cabinet | M | Crowbar | Noisy | Search (parts, tape, notes) | 4 metal | M2 |
| 25 | Washing machine | L | Wrench | Loud | Search (cloth) | 5 metal + 2 parts (+2 rubber from M4) | M2 |
| 26 | Laundry basket | S | - | Quiet | Search (cloth) | 1 plastic + 1 cloth | M2 |
| 27 | Storage cage | M | Crowbar | Noisy | Search needs crowbar (padlock; fuel, tape, metal, tins) | 3 metal | M2 |
| 28 | Toy box | S | - | Quiet | Search (chocolate, snack) | 2 plastic | M2 |
| 29 | Utility shelf | M | - | Quiet | Search (chemicals, tape, fuel) | 2 wood + 1 metal | M2 |
| 30 | Burned furniture | M | - | Quiet | - | 1 wood + 1 metal, 30% +1 parts | M2 |

New loot tables needed (level-designer): `medicine_cabinet`, `desk`,
`filing_cabinet`, `washing_machine`, `laundry_basket`, `storage_cage`,
`toy_box`, `utility_shelf`. Food appears only in kitchen-type containers,
storage cages (rare tins), toy boxes (chocolate) and desks (rare snack).

**Later v1 objects** (size, tool, noise, primary: yield):
- **M3**: bookshelf (L, saw, noisy: 6 wood + 3 paper); kitchen counter (L,
  saw, noisy, Search: 4 wood + 1 metal); cardboard boxes (S, quiet, Search:
  2 paper); desk lamp (S, quiet: 1 plastic + 1 parts + 1 glass); herb pot
  (S, quiet: 1 plastic + 2 herbs, 50% +1 seeds); alarm clock (S, quiet: 1
  parts + 1 batteries); smoke alarm (S, quiet: 1 plastic + 1 batteries);
  laptop (S, quiet: 1 plastic + 1 parts + 1 batteries).
- **M4**: electrical panel (M, wrench, noisy: 4 wire + 2 parts + 1 metal);
  extension cord (S, quiet: 2 wire); UPS unit (M, wrench, noisy: 4
  batteries + 2 wire); bicycle (M, noisy: 3 metal + 2 rubber + 1 parts);
  garden hose (S, quiet: 2 rubber); leather sofa (M, quiet: 3 leather + 2
  wood); coat rack (S, quiet, Search: 1 leather + 1 cloth + 1 metal);
  clothesline (S, quiet: 2 rope); window blinds (S, quiet: 1 rope + 1
  plastic); bucket (S, quiet: 1 container); jerrycan (S, quiet: 1
  container, 50% +2 fuel); water cooler (M, quiet, Drain 4 clean water: 1
  container + 1 plastic).

**Recipes** (workbench, instant once the hero is at it; materials come
from carried inventory first, then that workbench's apartment stash; all
recipes of the current milestone are listed from the start, greyed while
unaffordable; WB = workbench level):

| Use | Recipe | Cost | Effect | WB | MS |
|---|---|---|---|---|---|
| Weapon | Spiked bat | 3 wood + 1 metal | Weapon (5.4) | 1 | M1 |
| Weapon | Lead pipe | 3 metal + 1 tape | Weapon (5.4) | 1 | M3 |
| Weapon | Pipe spear | 2 metal + 2 wood + 1 tape | Weapon (5.4) | 1 | M3 |
| Throwable | Molotov | 1 glass + 1 fuel + 1 cloth | Fire patch (5.11) | 1 | M1 |
| Throwable | Noise lure | 1 parts + 1 batteries + 1 metal | Ringing alarm clock (5.11) | 1 | M3 |
| Tool | Crowbar | 3 metal | 20 uses | 1 | M1 |
| Tool | Wrench | 2 metal + 1 parts | 20 uses | 1 | M1 |
| Tool | Saw | 1 wood + 2 metal + 1 parts | 20 uses | 1 | M3 |
| Tool | Flashlight | 1 plastic + 1 glass + 1 parts | Light cone, removes Dim (5.11) | 1 | M3 |
| Tool | Tool wraps | 1 cloth + 1 rubber | Next 10 dismantles one noise step quieter | 1 | M4 |
| Material | Rope | 3 cloth | 1 rope | 1 | M4 |
| Medicine | Bandage | 2 cloth | +15 health | 1 | M1 |
| Medicine | Medkit | 1 bandage + 1 meds + 1 chemicals | +40 health | 1 | M3 |
| Medicine | Herbal remedy | 2 herbs + 1 clean water | +5 health, Sick -12 h | 1 | M3 |
| Water | Rain collector | 3 plastic + 2 metal | +1 clean water every 3 h (max 4); window spot | 1 | M1 |
| Water | Water filter | 2 plastic + 2 cloth + 1 parts | 1 dirty -> 1 clean water per hour, queue of 6 | 1 | M1 |
| Water | Purify water | 1 chemicals + 2 dirty water | 2 clean water, instant | 1 | M1 |
| Water | Water tank | 4 metal + 3 container + 1 rubber | Stores 20 water items | 1 | M4 |
| Food | Planter | 3 wood + 1 plastic + 1 seeds | +1 crop every 6 h (max 3), 1 water each | 1 | M1 |
| Food | Herb box | 2 wood + 1 plastic + 1 seeds | +1 herbs every 8 h (max 3), 1 water each | 1 | M3 |
| Food | Barrel stove | 5 metal + 1 parts | Light, warmth, cooking (5.10); floor spot | 1 | M3 |
| Food | Grow lamp | 2 parts + 1 plastic + 1 wire | 1 power; planters +50% speed | 2 | M4 |
| Cooking | Boil water / Hot stew / Jarred veg | as v1 list | stove recipes (5.10) | Stove | M3 |
| Light | **Oil lamp** | 1 glass + 1 metal + 1 cloth | Lights its room (5.10); holds 2 fuel, 1 per 12 h; floor spot | 1 | **M2** |
| Home | **Workbench** | 6 wood + 2 metal | A workbench in a claimed apartment, max 1 per apartment; floor spot | 1 | **M2** |
| Power | Generator | 6 metal + 4 parts + 2 wire | +3 power, 1 fuel per 4 h; floor spot | 2 | M4 |
| Power | Solar panel | 4 glass + 3 parts + 2 wire + 1 metal | +1 power; window spot | 2 | M4 |
| Light | String lights | 2 wire + 1 glass + 1 parts | 1 power; lights its room | 2 | M4 |
| Defense | Barricade Lv1 / Lv2 / Lv3 | 5 wood + 2 metal / 10 wood + 5 metal + 2 tape / 15 metal + 4 parts + 4 tape | A claimed front door; HP 120 / 250 / 500, defense +10 / +25 / +50 | 1 / 1 / 2 | M1 / M1 / M4 |
| Defense | Repair | 1 wood per 20 HP | Restores barricade HP | 1 | M1 |
| Defense | Secure floor | 8 wood + 4 metal | Cleared floor -> Secured; defense +5 each | 1 | M1 |
| Defense | Nail board / Tripwire chimes / Electric fence | as v1 list | Main home door (5.8) | 1-2 | M4 |
| Gear | Padded jacket / Leather armor / Quiet shoes | as v1 list | 5.11 | 1-2 | M4 |
| Comfort | Reading nook / Decorations / Music player | as v1 list | Comfort +1 each | 1 | M3 |
| Hygiene | Latrine / Wash station | as v1 list | Sickness -10 points | 1 | M3 |
| Home | Survivor bed | 6 wood + 2 cloth | One survivor can live in this apartment | 1 | M1 |
| Home | Storage shelf | 6 wood + 2 metal | +20 slots to this apartment's stash | 1 | M3 |
| Home | Workbench Lv2 | 10 wood + 6 metal + 2 parts + 2 tape | Unlocks WB 2 recipes | 1 | M3 |
| Home | Lockbox | 6 metal + 1 parts | 10 slots, never lost to breaches | 2 | M4 |
| Signal | Radio set | 3 parts + 2 wire + 1 batteries | Scans (5.10) | 2 | M5 |
| Travel | Elevator repair | 10 metal + 6 wire + 4 parts + 3 rope | Elevator (5.10) | 2 | M5 |
| Story | Rooftop beacon | 10 parts + 10 metal + 6 wire + 5 cloth | Ending (section 1) | 2 | M5 |

"As v1 list": costs unchanged from the M1 GDD; their numbers move into
`balance.json` when their milestone starts. M2 recipes (16): the 14 M1
recipes + oil lamp + workbench.

Recipe rules (numbers in `recipes.<id>` and `barricade.*`):
- **Build spots** (`recipes.<id>.buildSpot`): rain collector `window`;
  water filter, planter, survivor bed, oil lamp, workbench `floor`;
  barricades `front_door` (renamed from `stairwell`); secure floor
  `cleared_floor`; everything else `none` (goes to inventory). Spots
  come from claimed apartments (5.3).
- **Paying for placeables**: crafting a placeable enters spot-pick mode:
  free spots of its type in **all claimed apartments** are outlined with a
  thin dashed off-white line (the only outline in the game); the player can
  pan the camera to reach them. The cost is taken only when a spot is
  tapped. Cancel (tap Workbench/elsewhere) is free. No free spot anywhere =
  recipe greyed "No free spot".
- **Barricade**: one per claimed front door. Lv2 needs Lv1 on that door and
  replaces it at full Lv2 HP. At 0 HP it gives no defense and zombies pass.
  The hero and survivors pass their own barricades freely (a 0.5 s
  squeeze-through animation); zombies never.
- **Repair**: opens the list of claimed doors with a barricade (96 px rows,
  "Main home", "Floor 14, right"); each craft spends 1 wood and restores 20
  HP (`barricade.repairHpPerWood`). Rows show a small picture of the
  barricade's damage stage, never HP numbers; a full barricade is listed
  greyed "Holding".
- **Secure floor**: list of Cleared floors (96 px rows). A floor with a
  living wanderer is greyed "Something is still moving on floor N".
- **Producers**: as M1 (`effect.intervalHours`, `effect.maxStored`,
  `effect.waterPerUnit`, water from the stash of the producer's apartment).
  Output stays in the placeable until collected with *Use*.

**Storage pressure**: a wing rarely fits in 10 carry slots, and stashes are
per apartment, so where you claim matters: a second home near the floors
you scavenge saves walking.

### 5.7 Survivors
- Few, named, hand-written characters (dialogue, one trait, one recruitment
  quest), each on a specific floor. Recruit: talk -> quest -> free Survivor
  bed in any claimed apartment -> they move into that apartment.
- Survivors have Health (start 100, `survivors.startHealth`) and use **1
  food + 1 water item every 12 h** (`survivors.upkeepHours`,
  `survivors.upkeepFood`, `survivors.upkeepWater`) from the stash of the
  apartment they live in, then other claimed stashes in claim order; if
  missing: -10 health, morale -5 (`survivors.missedUpkeepHealth`,
  `survivors.missedUpkeepMorale`). Named survivors live in
  `survivors.roster.<id>`.
- **Survivor healing** (M1):
  - **Regen**: a survivor who is not the active character and is in their
    claimed apartment regains **+4 health/h**
    (`survivors.healthRegenPerHour`), online and offline, up to 100, only
    while their **last upkeep was met**. Brand-new recruits count as met
    until their first upkeep. From M3: no regen while Sick or Infected.
  - **Treat**: on the Survivors (Crew) screen, while the hero is in the
    same claimed apartment as the survivor, each survivor row whose
    Injured state shows has a 96 px **Treat** button with medicine from
    carried items and that apartment's stash (carried first). Bandage +15
    (+22 with Steady hands), medkit +40, capped at 100. Greyed "Not hurt"
    or "No medicine". The Crew screen shows a survivor's condition as the
    same moodle icons as the hero, never as numbers. Condition wording is
    identical on the Crew panel and the moodle card: Hurt / Injured /
    **Badly hurt** / Close to death ("Badly injured" is not used anywhere).
  - Offline auto-use never spends medicine on survivors.
  - When a survivor becomes the active character (pass the torch), they
    keep their health and switch to the hero's need rules (5.2) with needs
    at `needs.<need>.start`.
- **Mara's trait, Steady hands** (M1): while Mara is recruited and alive,
  every bandage used by anyone heals x1.5
  (`survivors.roster.mara.trait.bandageHealMult`): 15 -> **22** (round
  down), including offline auto-use and when Mara is the active character.
  Bandages only. Not active before recruitment. The bandage's *Use* button
  says "Use bandage" (no number); the Crew screen shows "Steady hands:
  bandages go further" under her name.
- Jobs (Survivors screen, one each):
  - **Guard** (M1): +15 defense to the main home (`survivors.guardDefense`)
    wherever the guard lives.
  - **Scavenger** (M1): offline only, 1 loot roll from a Cleared floor
    every 2 h (`survivors.scavengeIntervalHours`), delivered to their stash.
  - **Tender** (M1): producers in their apartment +50%
    (`survivors.tenderOutputMult`).
  - Medic, Cook (M3); Mechanic (M4): as in the v1 design (no change).
- **Pass the torch**: when the active character dies, the player picks a
  living survivor to continue as; the dead character's carried items and
  equipped gear drop as a bag pile at the death spot (never despawns). No
  survivors left = game over. The new character's main home is the
  apartment they live in.
- **Mara** (M1): floor 13, hiding in the **bathroom** of a flat-type unit
  (the generator forces one flat wing on floor 13 and puts her there; that
  wing's bathroom has a jammed interior door she opens when the hero
  speaks). Her quest: fetch her **medical bag** from floor 14. The
  generator places the bag in the bedroom wardrobe of a flat on
  floor 14 and a found note in her bathroom names the flat ("Left my bag at
  the Novaks', 14. Couldn't go back."); the bag container is never empty.
  Hand-over: tap Mara while carrying the bag -> *Use*. She joins only with
  a **free Survivor bed** in any claimed apartment ("I need a bed first.")
  and hero morale **25+** (`survivors.joinMinMorale`; else "You look worse
  than me. Come back when you've rested."). On success: quest done +10,
  recruited +15 morale, she moves into the apartment with the free bed
  (the main home's first, if it has one).

### 5.8 Attacks (M2: diegetic cue)
- Scheduled every **8 h +/- 2 h** (`attacks.intervalHours`,
  `attacks.jitterHours`). First attack is scripted, **10 min** after the
  tutorial ends (`attacks.firstAttackDelayMinutes`; skipping the tutorial
  counts as ending it): strength **15**, **2 crawlers**
  (`attacks.scripted`). No scheduled attack happens before it resolves; the
  first scheduled attack is 8 h +/- 2 h after it ends. Scheduled attacks
  are walkers (`attacks.scheduledZombieType`). Days survived = whole 24 h
  periods since New game.
- **Target**: always the **main home** (5.3) at the moment the cue starts.
  Attackers climb the stairwell to that floor and go for its front door.
  Other claimed apartments are never attacked in M2.
- Attack strength A = **25 + 3 x days survived**, capped at **150**
  (`attacks.baseStrength`, `attacks.perDay`, `attacks.cap`); M3+
  multipliers (generator, night) stack after the cap.
- **The cue (online)** (`attacks.cueSeconds` 15, `attacks.cue.*`). There
  is **no siren, no banner, no countdown and no HUD timer** anywhere. The
  only warning is in the world, and it is easy to miss:
  - **T-15 s** (`cue.groanAtSeconds`): a few distant groans, quiet, not
    positional, as if from far below. Indistinguishable in kind from the
    random distant groans that play every 45-120 s
    (`audio.distantGroanGapSeconds`); only their clustering gives it away.
    A second groan cluster plays at **T-12 s** (`cue.secondGroanAtSeconds`).
  - **T-8 s** (`cue.stairwellAtSeconds`): banging and shuffling in the
    stairwell, positional: loud if the camera is on the main home's floor,
    fading out beyond **2 floors** (`cue.stairwellAudibleFloors`). From
    T-8 s the emergency light on the main home's landing flickers
    (`cue.flickerFromSeconds`; dips of 0.09 s, `attacks.tuning.flickerSeconds`).
    A nap in progress is interrupted here (5.2). Stairwell bangs play at
    **T-8, T-5 and T-2.5 s** (`cue.bangBeatsSeconds` [8, 5, 2.5]); the first
    beat must equal `cue.stairwellAtSeconds` (8). If the two differ, code
    uses `cue.stairwellAtSeconds` as the first beat.
  - **Bang falloff** (`cue.bangFalloff`, Stage 2+): stairwell and door
    bangs (cue beats and fight bangs) also fade with horizontal camera
    distance from the main home's front door. d = |camera centre x - door
    x|. Volume multiplier = 1 if d <= **480 px** (`nearPx`); linear from 1
    down to **0.3** (`minVolume`) between 480 and **1500 px** (`farPx`);
    0.3 beyond 1500 px. It never reaches 0, so a bang is always faintly
    audible on the home floor. It multiplies the floor fade above
    (`cue.stairwellAudibleFloors`); beyond that floor range the bang is
    silent as before.
  - **T-0**: the first attacker shambles onto the landing of the main
    home's floor; more follow **3 s** apart (`attacks.tuning.spawnGapSeconds`),
    at a random 16-70 px from the door (`attacks.tuning.arrivalXRange`).
  - Nothing else changes: no music change, no UI change, moodles only
    react if zombies see the hero (Panic).
- Online: ceil(A / 10) (`attacks.strengthPerZombie`) attackers hit the main
  home's barricade (damage x0.4, 5.4) until all are dead. They keep hitting
  while the hero is anywhere; they only bite the active character if he is
  on that floor and they can reach him. While attackers are banging on the
  barricade, a bang sound plays every **2-3 s** (random in
  `cue.fightBangGapSeconds` [2, 3]). A fallen barricade lets them in.
  Nothing on screen says an attack ended: it is over when the banging
  stops.
- **Repelled online** (all attackers dead): +5 morale (silent) only if the
  barricade never reached 0 HP during that attack.
- **Scripted first attack check** (QA test): fists only, 1 tap per second,
  hero at the door when the first crawler arrives -> barricade ends at or
  above **100 HP** of 120 (crawlers deal 8 x 0.4 = 3.2 per 2.5 s each).
- **App hidden mid-attack**: on return, the remaining attackers are settled
  as an offline attack with A = remaining x 10, current barricade HP, no new
  multipliers; it counts toward `attacks.maxOfflineResolves`. If hidden
  during the cue, the attack is resolved offline at its scheduled time.
- **Offline (auto-resolve)**: defense D = main home barricade defense +
  guards x 15 + secured floors x 5 (`attacks.securedFloorDefense`) + 10 if
  the active character is in the main home (`attacks.characterDefense`)
  (+ M4 traps).
  - D >= A: repelled. Barricade loses A x 0.5 HP
    (`attacks.repelBarricadeLossRatio`).
  - D < A: breached. Barricade HP -> 0, shortfall S = A - D. Each resident
    of the main home takes S / 2 damage (`attacks.breachDamageRatio`,
    health floor 10), and S / 10 (`attacks.breachStackDivisor`) random
    stacks of the main home's stash are lost (rounded down).
  - At most **2** attacks resolve per catch-up (`attacks.maxOfflineResolves`).
- The report describes each attack in one sentence (5.1), never strength or
  defense numbers.
- **Barricade look**: damage is shown only by the sprite, in 5 stages by
  HP ratio (`barricade.visualStages` 0.75 / 0.5 / 0.25 / 0): intact, a
  cracked plank, boards hanging and gaps, barely held, broken. Each hit
  shakes it 2 px and drops a few splinters.

### 5.9 Death and game over
- Online death -> the screen slowly fades to black with the hero's
  breathing; then pass the torch (5.7). Game over screen shows days
  survived, floors reclaimed, zombies killed, objects salvaged; "New game"
  deletes the save.

### 5.10 Home systems
**Light** (M2)
- **Oil lamp** (placeable): *Use* -> Add fuel (holds **2 fuel**,
  `lamp.fuelSlots`), burns **1 fuel per 12 h** (`lamp.fuelHours`) online
  and offline. While burning, its room is **Lit** (5.3): a warm light pool
  of radius **220 px** (`light.lampRadiusPx`) that flickers +/-5%
  (`light.lampFlickerPct`). Out of fuel = dark (reported: "The lamp in the
  kitchen burned out.").
- **Comfort** (M2 subset): if any room of the main home is Lit, morale
  drain/h is reduced by 0.5 (`comfort.litPoints` 2 x `comfort.perPoint`
  0.25, drain clamped at `comfort.minDrain` -0.5); the full comfort table
  arrives in M3.

**Where things count**: comfort, Lit-for-comfort, hygiene and the dog's
home all count for the **main home** only. Producers, stoves and power
devices work in any claimed apartment. Each draws fuel and supplies from
the stash of the apartment it is in.

**Barrel stove** (M3, floor spot)
- *Use* -> panel: Add wood (**4 h** burn each, `stove.woodHours`), Add
  paper (**1 h**, `stove.paperHours`), stove recipes. It holds up to **24 h**
  of burn (`stove.maxBurnHours`) and burns online and offline. The panel
  shows the burn level only as a drawing of the fire (embers / low / high),
  never hours.
- While lit, its room is **Lit** (warm pool of 220 px, as a lamp; it counts
  toward the 4 light pools per floor). Warmth gives comfort +1, and sleep
  energy regen gets **+30%** (`stove.sleepBonus`) for beds in that
  apartment. Stove recipes only work while it is lit.
- Stove recipes: **Boil water** (2 dirty water -> 2 clean water); **Hot
  stew** (2 planter crops + 1 clean water, +1 herbs optional -> +45 food,
  +5 morale, or +10 morale with herbs; spoils); **Jarred veg** (3 planter
  crops + 2 glass -> 3 Jarred veg, +25 food each, never spoil). Numbers in
  `recipes.<id>` and `consumables.<id>`.
- Burned out = report line "The stove went cold."

**Spoilage** (M3)
- Planter crops and Hot stew spoil **48 h** after they are made
  (`food.spoilHours`) and vanish (report: "2 crops went bad."). Canned
  food, dry snack, jarred veg, herbs and water never spoil.
- No timer is shown. In its last **12 h** (`food.spoilWarnHours`) the
  item's icon turns grey-brown, and its tap card says "Going off."

**Comfort** (M3, full table; replaces the M2 subset)
- Comfort points in the **main home**, each source counted once however
  many there are: Lit **+2**, lit stove +1, reading nook +1, decorations
  +1, running music player +1, fed dog at home +1 (max 7).
- Morale drain/h = 1 - 0.25 x comfort, clamped to **-0.5..1**
  (`comfort.perPoint`, `comfort.minDrain`). So 4 comfort stops the drain
  and 6 slowly raises morale. It applies to the hero and to every survivor
  living in the main home.
- Comfort recipes (M3): **Reading nook** 3 wood + 2 cloth + 5 paper (floor
  spot); **Decorations** 2 cloth + 2 paper + 1 glass (no spot, wall
  dressing, max 1 counted); **Music player** 2 parts + 1 plastic + 1
  batteries (no spot). The music player runs on 1 power (M4), or on 1
  batteries per 24 h from its apartment's stash. It plays a faint, muffled
  tune only while the camera is on that floor. It never plays during an
  attack cue or an attack, so it never masks the cue.
- No comfort number is shown anywhere. Good comfort is felt as the
  Depressed moodle staying away.

**Hygiene and sickness** (M3)
- From day **3** (`hygiene.startDay`), every **12 h** (`hygiene.checkHours`),
  each resident of a claimed apartment who is not already Sick rolls a
  **20%** chance (`hygiene.sickChance`) to become Sick.
- In the main home, a **Latrine** (3 plastic + 2 wood, floor spot) cuts the
  chance by 10 points (`hygiene.latrineReduction`). A **Wash station** (2
  metal + 2 plastic + 1 cloth, floor spot) cuts it by 10 points
  (`hygiene.washReduction`), but only if it used 1 dirty or clean water
  from that stash for that check; with no water in stock it gives no
  reduction. With both built and supplied the chance is 0%. Residents of
  other claimed apartments roll at the full chance.
- **Sick** (status): no health regen, energy drain x1.5. It lasts **24 h**
  (`status.sickHours`) and does not stack. Antibiotics (loot only) cure it
  at once. Herbal remedy removes **12 h** (`status.remedyHours`). Shown as
  the **Sick** moodle with one level ("Sick."); its card offers "Use:
  Antibiotics" or "Use: Herbal remedy" if carried or in this apartment's
  stash. The report says "Mara came down with something."
- **Medic** job (M3): residents of the Medic's apartment get health regen
  x2, Sick lasts half as long, and Infection timers run at half speed
  (5.14). **Cook** job (M3): offline, keeps the stove in their apartment
  fed from that stash (wood first, then paper). Every 12 h it cooks 1 Hot
  stew if 2 crops + 1 clean water are stocked.

**Power** (M4)
- Supply = running generators (+3 each, `power.generatorOutput`) + solar
  panels (+1 each, `power.solarOutput`, constant). Demand = every built
  powered device: grow lamp 1, string lights 1, music player 1, radio 1,
  electric fence 2. The elevator needs 2 free power only while moving.
- Power is **per claimed apartment**: a device draws only from generators
  and panels in the same apartment.
- **Generator**: *Use* toggles on/off and adds fuel. It holds **6 fuel**
  (`power.generatorFuelSlots`) and burns **1 per 4 h**
  (`power.generatorFuelHours`) while on, online and offline. It hums
  while running (ambience only, not noise). While any generator is running
  in a claimed apartment, attacks are x**1.1**
  (`power.generatorAttackMult`, after the cap, 5.8). Out of fuel = off;
  the report says "The generator coughed and died."
- If demand > supply, the most recently built device switches off until
  supply returns. There is no power readout and no crossed-bolt icon: the
  device simply goes dark and silent, and its *Use* card says "No power."
  The music player and radio fall back to batteries from that stash, if
  any.
- **String lights** (WB 2, window or floor spot): their room is Lit while
  powered. **Grow lamp** (WB 2, floor spot): planters and herb boxes in
  the same apartment get +50% speed while powered.

**Radio set** (M5)
- *Use* -> Scan, once per **12 h** (`radio.scanCooldownHours`); while
  cooling down the button is greyed "Only static." Each scan does one of
  these: reveals the floor of an unrecruited survivor not yet found (a
  spoken line, e.g. "...anyone on twenty... my leg..."), or marks a
  **supply cache** (a container with 3 loot rolls, never empty) on a
  random Infested floor. The mark is a thought: "Someone mentioned a crate
  on floor 9." The floor is then listed under Menu > Notes. Some scans
  unlock a short radio note.

**Elevator** (M5)
- Built with the Elevator repair recipe. Tap the elevator door on any
  landing -> a list (96 px rows) of floors with a claimed apartment and
  Secured floors -> travel at **0.3 s per floor**
  (`elevator.secondsPerFloor`). It needs 2 free power in the main home,
  else "No power." It is noisy on arrival (noise radius 400 px on the
  arrival floor). Zombies never use it.

### 5.11 Gear and throwables
- **Throw** (M1): while a throwable is carried, a **Throw** button appears
  in the bottom bar. Tap it to arm (a faint 300 px range arc, `throw.rangePx`);
  the next tap on the hero's floor within range throws it (lands 0.5 s
  later, `throw.landSeconds`); a tap out of range, on another floor or on
  Home disarms and keeps the item.
- **Molotov** (M1): a fire patch **120 px** wide for **4 s**, **15
  damage/s** to zombies inside, **10/s** to the hero. Loud. Fire never
  spreads and never damages objects or barricades.
- **Cycling** (M3, once a second throwable type exists): while armed,
  another tap on Throw switches to the next carried throwable type; going
  past the last type disarms.
- **Noise lure** (M3): rings **3 s** after landing for **20 s**
  (`lure.delaySeconds`, `lure.ringSeconds`). Every non-aggroed zombie on
  that floor that can reach it shambles to it and waits there until it
  stops. Its ringing is the sound, with no marker. Single use.
- **Flashlight** (M3, tool, carried): while it has charge, Dim rooms count
  as **Grey** for the hero (everything drawn, normal search time). The
  light also makes him visible, so zombies use the Grey sight radius (180
  px) instead of the Dim one. Each Dim room entered uses **1 charge**. 1
  batteries = **10 charges** (`light.flashlightCharges`), auto-loaded from
  carried batteries at 0. With no charge, Dim applies. It never affects
  Dark rooms, because entering a room already turns it Dim.
- **Equipment** (M4): the Inventory screen has a **Body** and a **Feet**
  slot (not carry slots). Tap an item -> Equip / Unequip. Armor reduces
  each zombie hit by its percentage (rounded down) and loses 1 durability
  per hit taken. Broken armor disappears with a thought ("The jacket's
  done."). Condition is shown as a wear drawing, never a number.
  - **Padded jacket** (Body, 4 cloth + 2 tape, WB 1): damage taken -20%,
    40 hits. **Leather armor** (Body, 4 leather + 2 tape + 1 metal, WB 2):
    -35%, 60 hits.
  - **Quiet shoes** (Feet, 2 rubber + 1 cloth, WB 1, never wear out): all
    zombie sight radii x**0.6** (`gear.quietSightMult`: 108 / 66 / 42 px in
    Grey-Lit / Dim / Dark) and run noise radius 250 -> **150 px**
    (`gear.quietRunNoiseRadiusPx`).
- **Tool wraps** (M4): carried; each dismantle uses 1 of **10 uses**
  (`gear.toolWrapUses`) and is one noise step quieter (Loud -> Noisy ->
  Quiet).

### 5.12 Day and night (M3)
In M2 the world is a permanent overcast late afternoon and windows give
cold grey light. From M3:
- The phase follows the **device's local clock** (`new Date().getHours()`).
  **Night is 20:00-06:00** (`night.startHour`, `night.endHour`); day is
  the rest. **Dusk 19:00-20:00 and dawn 06:00-07:00**
  (`night.transitionMinutes` 60) only fade the visuals; gameplay switches
  exactly at 20:00 and 06:00.
- Changing the clock or time zone only changes the phase; elapsed time
  still follows 5.1. Days survived is unchanged (24 real hours each).
- **At night**: windows give no light, so on Infested and Cleared floors
  every entered **Grey room becomes Dim**. This includes claimed
  apartments, unless the room is Lit by a lamp, stove or string lights.
  Secured floors stay Grey (the hero has rigged their light). Dark and Lit
  rooms are unchanged. All zombie sight radii are x**1.25**
  (`night.sightMult`: 225 / 138 / 88 px; with Quiet shoes the 0.6 applies
  too). Zombie speed is x**1.15** (`night.zombieSpeedMult`). Attacks that
  start at night are x**1.2** (`night.attackMult`, after the cap, 5.8).
- **Night rewards**: each search has a **30%** chance of +1 loot roll
  (`night.bonusLootChance`). Sleep energy regen is **+20%**
  (`night.sleepBonus`, added to the stove's +30%).
- **Fairness**: nothing is locked by time of day. The flashlight and lamps
  cancel night Dim, so a night-only player pays only the zombie
  sight/speed and attack risk, and gets the loot bonus.
- **Offline**: each 10-min catch-up step uses the local hour of its own
  timestamp (offline night attacks also get x1.2). Fuel, power and
  production ignore the phase.
- **Show**: no HUD icon (there is no top HUD). The sky behind the tower
  fades to near-black navy (`#0e1118`) at night. Window panes lose their
  grey light, and unlit claimed apartments go dark. Rain sounds heavier.
  The first night, the hero thinks: "Night. They'll hear me from further
  away."

### 5.13 The dog (M3)
- A dog, **Scout**, is shut in a bathroom on **floor 18**. Faint whining
  plays (positional, through walls) while the hero is on floors 17-19.
  *Use* -> **Offer food** (1 canned food, dry snack or planter crop from
  carried items) recruits it at once, with no quest and no survivor bed.
  Zombies ignore the dog: it never takes damage, cannot be bitten and
  cannot die.
- **Action menu** on the dog: **Pet** (primary) and **Follow / Stay home**
  (a toggle that replaces Dismantle). Pet plays a wag animation and gives
  **+3 morale** (silent), once per **4 h** (`dog.petMorale`,
  `dog.petCooldownHours`); taps in between only wag. When the app goes to
  background or on pass the torch, the dog goes to the main home, keeps
  its mode and stays with the new character. "Home" for the dog is always
  the **main home**; if the main home changes, a staying dog moves there
  the next time the app resumes.
- **Following**: walks 40 px behind the hero and uses stairs with them.
  When a zombie that is not drawn (Dim out of sight, or a Dark room) and
  not aggroed comes within **300 px** on the same floor
  (`dog.growlRadiusPx`), the dog stops, stares and growls. The growl is
  panned toward the zombie, and the zombie's silhouette is drawn for **2
  s** (`dog.revealSeconds`). This happens once per zombie per **15 s**
  (`dog.growlCooldownSeconds`). There is no arrow or marker. The growl is
  not noise and never aggros.
- **Staying home** (fed): comfort +1, offline defense +5 (`dog.defense`,
  5.8). It also adds a diegetic attack cue: at **T-30 s**
  (`dog.growlCueSeconds`) the dog growls at the main home's front door.
  This is positional like the stairwell banging (audible within 2 floors
  of the main home). It interrupts a nap there.
- **Upkeep**: 1 food item + 1 water item (dirty is fine, no penalty) from
  the main home stash every **24 h** (`dog.upkeepHours`), online and
  offline. A missed meal makes it **hungry**: it lies by its bowl, gives
  no growls, comfort, cue or defense, and its tap card says "He's
  hungry." It stays hungry until fed (*Use* -> Feed). After **3** missed
  meals in a row (`dog.leaveAfterMisses`) it runs back to floor 18 (morale
  -10; report: "Scout is gone. The bowl's still full of nothing."). Offer
  food recruits it again.

### 5.14 Infection (M3)
- Each zombie bite on the active character has a **2%** chance to infect
  (`infection.biteChance`), x**0.5** with body armor
  (`infection.armorMult`). In offline breaches (5.8), each resident of the
  main home rolls **10%** (`infection.breachBiteChance`). Residents are
  never bitten in other cases (online attacks they are not in, Scavenger
  job). Already Infected = no roll.
- **Stages** (real time, online and offline; `infection.stageHours`
  [12, 24, 12]): **Bitten** (0-12 h) has no effect. **Fever** (12-36 h):
  no regen, energy drain x1.5. **Turning** (36-48 h): also -3 health/h
  (`infection.turningDamage`). At 48 h, or at health 0 while Infected, the
  character dies and **turns**.
- **Show**: the **Infected** moodle with 3 levels, Bitten / Fever /
  Turning (L2-L4 colours). Its card text: "Bitten. Antibiotics, soon." /
  "Burning up." / "Turning." There is never a timer or hours. The hero's
  thoughts escalate ("My hands won't stop shaking."). Survivors show the
  same moodle on the Crew screen.
- **Treatment**: on yourself from the moodle card or Inventory. On
  survivors from the Crew screen, while the hero is in the same claimed
  apartment, using carried items and that apartment's stash.
  - **Antibiotics** cure Bitten and Fever, or Sick: one status per pill,
    Infection first.
  - **Antiviral** (M4; rare loot on floors 1-7 and 23-30, and in M5 supply
    caches) cures any stage.
  - **Herbal remedy** sets the infection timer back **6 h**
    (`infection.remedyHours`, not below 0; it never cures).
  - Medic: timers of residents of the Medic's apartment run at half speed
    (5.10). No amputation.
- **Offline cannot kill**: catch-up stops the timer **6 h** before turning
  (`infection.offlineMinHoursLeft`). Turning damage respects the health
  floor 10. The report warns in prose, with no hours: "Mara is burning up.
  She doesn't have long."
- **Turning**: pass the torch (5.7) as usual. The body becomes a **Turned**
  zombie at that spot (in their claimed apartment if they were there):
  Walker stats with **45 HP** (`infection.turnedHp`), in the hero's or
  survivor's faded clothes, holding the dropped bag; killing it drops the
  bag. The survivor-death morale -20 applies. The turn happens off-screen
  as a fade to black, with no gore.
- Mara's medical bag quest reward includes **1 antibiotics** from M3, so a
  cure always exists.

### 5.15 Procedural apartments (M2)
Every new game builds the tower from **templates** so each run is
different to scout. The data lives in `public/data/levels/templates.json`
(level-designer; path in `generator.templatesFile`), numbers in
`balance.generator.*`.

**Seed and saving**
- New game draws `worldSeed` (random 32-bit integer) and saves it. Each
  floor is generated deterministically from hash(worldSeed, floor number)
  the first time any floor is loaded (all of floors 13-17 at New game in
  M2). The generated layout is **saved** in full (units, rooms, object
  ids, slots, zombies, notes); after that only the save is used, so future
  template edits never change a running game.
- Object instance ids are `f<floor><L|R>-<room index>-<slot>` (e.g.
  `f14R-2-wall1`), stable for the save.

**Generation steps per floor**
1. **Pick two unit templates**, one per wing, by template weight, with:
   at most 1 of each template per floor (`generator.maxSameTemplatePerFloor`);
   at least 1 flat-type template per floor
   (`generator.guarantees.minFlatWingsPerFloor`); fixed overrides: floor 15
   left = `your_flat` (`generator.startFlatTemplate`); floor 13 has one
   flat with a bathroom for Mara; floor 14 has one flat with a bedroom for
   the bag.
2. **Pick a condition** per unit by weight (`generator.conditionWeights`):
   **normal 60**, **ransacked 30**, **burned 10**. The start flat is
   always normal; offices and service units are never burned in M2.
3. **Order rooms**: the template's room list, shuffled within its rules
   (`fixedFirst`, `adjacent` pairs, `last`), laid out from the front door.
4. **Fill slots** per room type (table below): first its "always" objects,
   then each remaining slot is filled with chance **0.6**
   (`generator.slotFillChance`) by a weighted pick from that slot layer's
   pool. Pool items marked "max 1" appear once per unit. Empty slots stay
   empty (future build spots).
5. **Doors**: each internal room boundary gets an interior door with chance
   **0.5** (`generator.interiorDoorChance`); front door jammed **25%**.
6. **Apply condition**: *ransacked*: each non-"always" object removed with
   chance 0.3 (`objectRemoveChance`), containers 70% empty, drawn with
   open drawers and papers on the floor; *burned*: each object becomes
   Burned furniture with chance 0.7 (`charChance`), windows broken (rooms
   stay Grey, rain noise louder), walls soot-black, containers 85% empty.
7. **Zombies** per wing by distance from floor 15
   (`generator.zombiesPerWingByDistance`): floor 15 **0-2**, 14/16 **1-3**,
   13/17 **2-4**; never in the start flat; never in the first module
   behind a front door (`generator.zombieNoSpawnModulesFromFrontDoor`);
   max **3** per room; with chance **0.5** (`generator.groupChance`) a
   zombie joins the previous zombie's room as a group. Type by weight:
   crawler **30**, walker **70** (`generator.zombieTypeWeights`; it is a
   tunable number, so it lives in balance, not templates.json).
8. **Guarantees** per floor, fixed by swapping or editing after filling:
   at least **1 food item** in a container (a kitchen cupboard or fridge
   gets fixedLoot 1 canned food or dry snack; never empty)
   (`guarantees.minFoodItemsPerFloor`); at least **1 drainable water
   source** (`guarantees.minDrainableWaterPerFloor`; every bathroom has a
   toilet tank, so the flat guarantee covers it).
9. **Notes**: 1-2 found notes per floor (5.16) in containers that fit them.

**Unit templates (M2: 7 + the start flat)**. Widths in modules (total 6).

| Template id | Name | Rooms (modules) and order rules | Weight | Type |
|---|---|---|---|---|
| `your_flat` | Your flat | hallway 1, living 2, kitchen 1, bedroom 1, bathroom 1; fixed order; authored objects (tutorial, section 8) | - | flat |
| `family_flat` | Family flat | hallway 1 (first), living 1, kitchen 1, bedroom 1, kids_room 1, bathroom 1; kitchen adjacent to living | 25 | flat |
| `couple_flat` | Couple's flat | hallway 1 (first), living 2, kitchen 1, bedroom 1, bathroom 1; kitchen adjacent to living | 25 | flat |
| `shared_flat` | Shared flat | hallway 1 (first), kitchen 1, bedroom 1, bedroom 1, bedroom 1, bathroom 1 | 15 | flat |
| `studio_laundry` | Studio and laundry | laundry 2 (first, the building's shared laundry), studio 3, bathroom 1 (last) | 12 | flat |
| `elderly_flat` | Old couple's flat | hallway 1 (first), living 2, kitchen 1, bedroom 1, bathroom 1; bedroom adjacent to bathroom; containers favour medicine, tins, seeds | 13 | flat |
| `office` | Small office | reception 1 (first), office 2, office 1, break_room 1, bathroom 1 (last) | 6 | office |
| `storage_utility` | Storage and boiler rooms | storage 3 (first), janitor 1, utility 2 (last) | 4 | service |

**Room types** (what may appear where; "F" = floor-layer slots, "W" =
wall-layer slots; `hasWindow` rooms are Grey when entered):

| Room | Window | Always | F pool (weight) | W pool (weight) |
|---|---|---|---|---|
| hallway | no | - | chair 2, potted_plant 2, toolbox 1 (max 1) | oil_lamp 1 |
| living | yes | sofa (F) | table 3, chair 3, tv 2 (max 1), potted_plant 2 | window_pane 3, curtains 3, oil_lamp 1 |
| kitchen | yes | fridge (F), kitchen_cupboard (W) | table 2, chair 2, sink_pipes 2 (max 1) | kitchen_drawer 3, microwave 2 (max 1), kitchen_cupboard 2, window_pane 1 |
| bedroom | yes | bed_frame (F) | wardrobe 3 (max 1), chair 1, mattress 1 | curtains 3, window_pane 2, oil_lamp 1 |
| kids_room | yes | bed_frame or mattress (F, 60/40), toy_box (F) | - (both F slots of a 1-module room are taken) | curtains 3, window_pane 1 |
| bathroom | no | toilet_tank (F), bathroom_cabinet or medicine_cabinet (W, 50/50) | sink_pipes 2 (max 1), water_heater 1 (max 1), laundry_basket 2 | bathroom_cabinet 1 (max 1) |
| studio | yes | bed_frame or mattress (F), sofa (F), kitchen_cupboard (W), fridge (F) | table 2, chair 2, tv 1 (max 1), potted_plant 1 | kitchen_drawer 2, window_pane 2, curtains 2 |
| laundry | no | washing_machine x2 (F) | washing_machine 2, laundry_basket 3 | utility_shelf 2 |
| reception | yes | desk (F) | chair 3, sofa 1, potted_plant 2 | window_pane 2 |
| office | yes | desk (F) | filing_cabinet 3, chair 2, potted_plant 1 | window_pane 2, curtains 1 |
| break_room | no | kitchen_cupboard (W), table (F) | chair 3, fridge 1 (max 1) | microwave 2 (max 1), kitchen_drawer 2 |
| storage | no | storage_cage in every floor slot | - | utility_shelf 2 |
| janitor | no | utility_shelf (W) | toolbox 2 (max 1), laundry_basket 1 | utility_shelf 1 |
| utility | no | water_heater (F) | toolbox 2 (max 1), storage_cage 1 | utility_shelf 2 |

Rules: a "max 1" limit is per unit; large objects (wardrobe, fridge,
washing machine, water heater, bed) use one floor slot but are drawn up to
96 px wide; a pool weight of 0 means not placed in M2. Interior doors are
not slot objects (they sit on boundaries). Burned units replace objects
after the pick, so they keep the logical layout as charred shapes.

**Generator edge rules (M2)**
- **Max counts include "always" copies.** A pool item's `max` counts every
  copy already in the unit, including ones placed by "always". So a
  bathroom never has two bathroom cabinets (one cabinet of each kind is
  fine: an "always" medicine cabinet plus a pool bathroom cabinet).
- **Fixtures**: the start flat's **workbench** is a fixture, not a salvage
  object. It occupies its slot, has only *Use* (open crafting), cannot be
  searched, dismantled, removed, charred or emptied, and is not listed in
  `balance.objects`. Workbenches built later from the recipe (5.6) are
  crafted placeables and follow the placeable rules.
- **Condition exemptions**: these are never removed, charred or made empty
  by a condition pass: any object holding `fixedLoot` (the per-floor food
  guarantee container, Mara's note cabinet, the Novak wardrobe with the
  medical bag), the guaranteed toilet tank (water), the start flat (always
  normal) and fixtures.
- **Mara's unit** (floor 13) rolls only **normal or ransacked**, never
  burned; her bathroom has no zombies and a jammed interior door.
- **Start flat food**: exactly **1 canned food** (fridge fixedLoot), as in
  the tutorial (section 8). The start flat does not count toward the
  per-floor food guarantee; the right wing of floor 15 gets its own, so
  it never rolls `storage_utility` (no kitchen or break room to hold it).
- **Storage cages stay crowbar-only** (no slow or loud hand-opening). A
  storage unit without a crowbar is a deliberate early goal: the first
  time the hero taps Search on a padlocked cage without a crowbar, the
  thought "Padlocked. A crowbar would do it." shows (once per game); later
  taps show the same thought only, no action. Crowbar costs 3 metal (5.6),
  so it is reachable within the first few floors' scavenging. A jammed
  front door can still be bashed open by hand (`world.jammedDoorHits`).
- **Scarcity**: every consumable rolled is qty 1 (5.5); loot tables stay
  lean and most emptiness comes from `generator.conditions.*.emptyChance`
  (normal 30%, ransacked 70%, burned 85%). The guarantees (1 food item and
  1 water source per floor) are the safety net against starvation.

### 5.16 Found notes and flavour text (M2)
- ~12 notes in M2 (level-designer writes them; game-designer reviews
  tone). One or two lines, grim, ordinary, never jokey: "Gone to the
  stadium. Feed the cat if you see this.", "Don't let them in. Even if it's
  Dad." Notes are found in containers that fit (desk, bedside wardrobe,
  kitchen drawer, filing cabinet) and shown once as a paper card; the Menu
  keeps them under "Notes".
- Each unit has a **flavour line** from its template's pool, shown once
  when the hero first steps into it, as small text at the bottom of the
  screen for 4 s: "The TV is still on standby. Nobody's watched it in a
  week.", "Toys lined up by the door, as if someone was coming back."
- Hero **thoughts** replace tutorial arrows and most toasts: one short line
  in italics at the bottom ("I need to eat something.", "The door won't
  hold like this."). Max one every 20 s; never more than one line.

## 6. Progression and difficulty
- **Long-term goal**: reclaim all 30 floors (all Secured), build the Radio
  set and the Rooftop beacon, then choose to leave or stay (section 1).
- Difficulty rises with distance from floor 15 (5.15 step 7); M3 adds
  floors 8-22, M4 all 30 with brutes. Rarer loot (axes, medkits,
  antibiotics) deeper/higher.
- Tool gating: crowbar and wrench open bigger, richer objects (wardrobes,
  storage cages, fridges, washing machines).
- Attacks grow with days survived; defenses with barricades, secured floors
  and guards.
- Saved: world seed and generated layout, every removed object, pile and
  placeable with its fuel, claimed apartments and main home, timestamp,
  settings, stats, notes read, ending choice.

## 7. Content
| | Milestone 1 (done) | Milestone 2 | Version 1 (release) |
|---|---|---|---|
| Floors | 5 authored (13-17) | 5 generated (13-17), 3120 px wide | 30 + roof |
| Unit templates | - | 7 + start flat, 14 room types, 3 conditions | ~12 templates |
| Zombie types | Crawler, Walker | same, rebalanced (slow, heavy, groups) | + Runner? (M3), Brute (M4) |
| Weapons | Fists, knife, spiked bat | same | + lead pipe, pipe spear, fire axe |
| Tools | Crowbar, wrench | same | + saw, flashlight, tool wraps |
| Materials | 10 | 10 | 19 |
| Objects | 20 | 30 | ~50 |
| Recipes | 14 | 16 (+ oil lamp, workbench) | ~49 |
| UI | need bars, numbers | moodles, no numbers | moodles (+ Sick, Infected) |
| Survivors | 1 (Mara) | 1 (Mara) | 4 |
| Story | intro, ~5 notes | ~12 notes, unit flavour lines | ~25 notes + radio, ending |
| Attacks | siren + 60 s banner | 15 s diegetic cue, main home target | + traps, dog growl |

## 8. Screens and flow
1. **Title**: dark tower in rain, one window lit amber, "Tap to start"
   (unlocks audio). For a Completed (left) save: "You left the tower on
   day N", Replay ending, New game.
2. **New game**: 3 short lines on black, one at a time ("You wake up.",
   "It's quiet. Too quiet for a Tuesday.", "Something is scratching at the
   door."), then fade into the dark start flat.
3. **Tutorial by doing (first ~60 s), no arrows, no highlights**: the
   camera gently pans to each target and the hero thinks one line:
   fridge ("I need to eat something." -> Search -> 1 canned food); chair,
   then table ("This could hold the door." -> Dismantle -> 6 wood); kitchen
   drawer (Search -> 2 metal, "A tin of nails."); workbench (craft
   Barricade Lv1, placed at the front door); then scratching at the door,
   it opens onto the landing and a crawler drags itself in (tap it). After
   that: "Anything here can be taken apart." Later systems get one thought
   the first time ("Bleach. That'll make the water safe." on first
   chemicals; "Nobody lives here now. It could be mine." the first time a
   unit is clear).
4. **Returning**: "While you were away" note (5.1, one tap closes).
5. **Play**: the tower view with **no top HUD** except the moodle column
   (top right). No need bars, day counter, attack timer or power readout.
   Bottom bar: Home, Inventory, Workbench, Survivors, Menu, Throw when
   carried. Bottom bar follows the **muted UI style** below: icons only,
   no text labels, ever (CD decision, 12).

**Muted UI style (M2, BUG QA "non-gamey HUD"; keys `ui.*`)**. The UI must
read as worn objects in a dark room, not as game buttons.
- **Bottom bar**: icon buttons, no text, no outline. Plate **72 game px**
  (`ui.bottomBar.iconPlatePx`) inside a **96 px** hit area; plate
  near-black `#0b0c0e` at alpha **0.55**, pictogram UI text `#bdb8ab` at
  alpha **0.7**, pressed alpha **0.9**. Icons: house (Home), bag
  (Inventory), hammer (Workbench), two heads (Survivors), three dots
  (Menu), bottle (Throw). The equipped weapon shows as a hand / knife / bat
  pictogram on the bag-side slot (tap = Inventory weapon tab). Sound on/off
  lives in Menu as a speaker icon (crossed when muted), not in the bar.
- **Panels** (inventory, workbench, survivor, moodle cards): background
  deep shadow `#16191d` at alpha **0.9**, world behind dimmed by **0.4**.
  Buttons are flat `#23272c` with UI text `#bdb8ab`; disabled `#5d6166`
  text; the one confirm action per panel (Craft, Eat, Drink, Use) uses rust
  brown `#5a3a2a`. **No teal, orange or saturated colour anywhere in the
  UI** (teal is the hero's jacket only). Text only where an icon cannot say
  it (recipe names, item names, card lines); costs are material icons plus
  a number.
- **Workbench menu**: a bottom sheet covering at most **55%** of the screen
  height (`ui.panel.maxHeightRatio`), one recipe per 96 px row, no title
  bar, no tabs in caps; it opens with a **0.2 s** fade (`ui.panel.fadeSeconds`),
  no slide or bounce.
- **Floor numbers**: faded stencil paint on the stairwell wall only, never
  in apartments or the HUD: light concrete `#5d6166` at alpha **0.6**,
  **48 game px** tall (16 art px), with 2-3 chipped gaps and one drip.
6. **Inventory**: carry slots and the stash of the claimed apartment the
   hero is in (a tab per claimed apartment; only the current one is
   usable, others are read-only "Floor 14, right").
7. **Menu**: day N (the only place it is shown), sound, music, notes read,
   replay ending (once unlocked), resume. Pausing does not stop real time.
8. **Pass the torch** -> pick survivor -> play.
9. **Game over** -> stats -> New game.
10. **Ending** (M5) -> text cards -> Leave/Stay -> epilogue -> stats.

Toasts (short system lines such as "Needs crowbar") are off-white small
text at the bottom for 2 s, no icon, no sound.

## 9. Art direction (M2 rework)
- **Look**: muted, desaturated, dark, damp. Think a grey wet evening with
  the power almost gone. Pixel art, 1 art pixel = 3 game px.
- **Saturation rule**: nothing above ~35% saturation except lamp light,
  fire and blood.
- **Palette**: near-black `#0b0c0e`, deep shadow `#16191d`, shadow concrete
  `#23272c`, wall concrete `#3a3e42`, light concrete `#5d6166`, damp plaster
  `#6e6a5e`, faded wallpaper `#5b5547`, rust brown `#5a3a2a`, dried blood
  `#4e1c1a`, zombie skin `#5f6650`, pale skin `#a99886`, hero jacket faded
  teal `#34494b`, window daylight `#8a9399`, lamp amber `#c08a3e`, fire
  `#d07a2c`, UI text `#bdb8ab`. Moodle squares L1 `#7d7350`, L2 `#8a6a3a`,
  L3 `#7a4630`, L4 `#5e2422`. The M1 warning red `#c0392b` is removed.
- **Lighting** (drawn as a darkness overlay per visible floor, with light
  pools erased out of it; alphas in `light.*`):
  - Dark rooms **0.97** black; only a faint wall edge shows, plus object
    and moving-zombie silhouettes in deep shadow `#16191d` (5.3).
  - Dim rooms **0.72**, plus a soft circle of **150 px** around the hero
    (eyes adjusting) at half that darkness.
  - Grey rooms **0.45**, cool tint, soft light shafts from the window;
    window panes show **rain streaks** (2-3 frame loop) and the dark city
    beyond.
  - Lit rooms **0.2**, warm amber pool of 220 px around each lamp,
    flickering +/-5%.
  - Landings: Dim, one emergency light that flickers at random 50-150 ms
    dips (`light.stairwellFlickerMs`), more during the attack cue.
  - **Dust motes**: 6-10 slow grey particles per visible entered room
    (`light.dustMotesPerRoom`), drifting through light.
  - Performance: overlays only for the floors on screen; at most 4 light
    pools per floor.
- **Sprites**: characters **16x24** art px (48x72 game px); zombies 16x24,
  hunched, with a slow 4-frame shamble and a lean-in wind-up; props 16x16
  (large 32x32); a floor is 1040x80 art px. Material icons 8x8 art px.
- 1 px near-black outline on characters only (props are read by shape and
  light, not outlines). **No pulse, glow, sparkle or highlight on
  interactables** (the M1 amber pulse is removed). Searched containers are
  drawn ajar; dismantled objects leave a faint floor mark and a 3-frame
  dust puff.
- **Burned units**: soot-black walls, charred shapes, broken windows.
  **Ransacked**: open drawers, papers and clothes on the floor.
- Barricade: 5 damage stages (5.8), splinters on hits.
- Fire: 3-frame flame loop (molotov). Blood is limited to dark hit
  splashes, floor stains and drips (5.4, dried blood `#4e1c1a`); no
  dismemberment or body parts; corpses slump and fade.
- **UI art**: follows the muted UI style in section 8. Moodle pictograms
  24x24 art px (72 game px); bottom-bar pictograms 16x16 art px centred on
  the 72 px plate; floor numerals are stencil sprites 0-9, 10x16 art px.
  The bright orange wall numerals and teal buttons of stage 1 are removed.
- **App icon**: the dark tower silhouette in rain against a grey-green sky,
  one lit amber window near the middle; 512x512, readable at 48 px.

## 10. Audio direction (M2 rework)
- **Mood**: mostly silence. The building makes the sounds: wind, rain on
  glass, pipes ticking, a door creaking somewhere, a distant groan, a
  muffled thud from another floor. Silence is part of the design.
- **Ambience**: a quiet room-tone bed (wind + rain) per light state (rain
  louder near windows). Random one-shots every **20-60 s**
  (`audio.ambientGapSeconds`): creak, pipe knock, distant thud, glass
  tinkle. Distant groans every **45-120 s** (`audio.distantGroanGapSeconds`),
  which also hide the attack cue (5.8).
- **Zombies are heard before seen**: each zombie on the hero's floor within
  **600 px** (`audio.zombieHearRadiusPx`) makes occasional shuffles and low
  breaths, panned left/right by position, through walls and in Dark rooms.
- **Music**: sparse and sad (a few piano or cello notes, 20-60 s pieces),
  never during danger. Plays at most once per **8-12 min**
  (`audio.musicCooldownMinutes`) and on moments: first claim, after an
  attack ends, a survivor joins. 3 pieces in M2, plus the ending cue (M5).
  No tense attack loop. Total audio under 3 MB.
- **SFX (M2 list)**: footsteps (walk soft, run heavy), stairs, door
  open/creak, jammed door hit, cupboard open, drawer slide, rustle, pick up
  (soft cloth/handling, no chime), punch, blunt hit, blade hit (stab)
  (picked per weapon by `combat.weapons.<id>.hitSound`, 5.4), weapon
  break, zombie breath/shuffle/groan/lean-in/death slump, hero hurt breath,
  barricade hit/creak/break, hammer, wood crack, metal clang,
  cloth rip, water pour, glass shatter, fire whoosh, lamp wick hiss, rain,
  wind, pipe knock, stairwell banging (cue), moodle cues (5.2), eat, drink.
- **Removed**: attack siren, UI tap blips, noise alert sting, pickup chime,
  any "level up" or success jingles. UI buttons make a faint paper or
  cloth sound at most.

## 11. Scope
**In for version 1**: everything in sections 1-10 for the Version 1 column
of section 7, delivered in five milestones. Each milestone ends with a
CD playtest on the phone.

### 11.1 Milestones
- **M1 "First playable"** (done): 5 authored floors, tap movement,
  scavenging, salvage, 14 recipes, combat, needs, offline catch-up, Mara,
  attacks, save/load.
- **M2 "The tower breathes"** (current). Floors stay **13-17**: five
  generated floors x two 1440 px wings = 10 units, ~25-30 screens of
  apartment, already more than M1 had. More floors would multiply
  generator testing before the look and feel are proven; floors expand in
  M3.
  - **Must-haves**
    1. Wide floors (3120 px, two 6-module wings, central stairwell shaft),
       axis-locked drag, horizontal camera follow with dead zone.
    2. Generator: seed, 7 templates + start flat, 14 room types, slot
       pools, 3 conditions, zombie placement, guarantees, saved layout;
       `templates.json` by level-designer.
    3. 10 new objects (5.6 #21-30) and their loot tables; loot scarcity
       (0-2 rolls, empty chances, consumables qty 1).
    4. Home claiming: claim, stashes per apartment, build spots from empty
       slots, beds, main home by sleeping, Workbench recipe, barricade per
       claimed door, Leave this place.
    5. Attacks: 15 s diegetic cue (groans, stairwell banging, flicker), no
       siren/banner/timer, target = main home, barricade x0.4 damage.
    6. Moodles replace need bars (6 moodles, 4 levels, tap cards with one
       action); no floating numbers, no barricade HP, no damage numbers;
       barricade damage stages.
    7. Zombie rebalance: stats, sight radii by light, hearing, run noise,
       unaware x3 hit, lose track, groups.
    8. Lighting: Dark/Dim/Grey/Lit rooms, hero eye radius, landing flicker,
       oil lamp recipe and fuel.
    9. Art pass to the new palette; no interactable highlights; ajar
       containers; rain on windows.
    10. Audio pass: ambience, positional zombie sounds, moodle cues, sparse
        music; siren and UI blips removed.
    11. Thoughts, flavour lines, ~12 notes; tutorial without arrows;
        prose "While you were away".
    12. Save version 2 (M1 saves reset).
    13. Run on double tap (5.4): faster, noisy, costs energy.
  - **Nice-to-haves** (only if the must-haves are done and playtested)
    1. Dust motes and window light shafts.
    2. Ransacked/burned visual dressing beyond tint (papers, soot decals).
    3. A 4th music piece and more ambience one-shots.
    4. More templates (e.g. `dentist`, `hoarder_flat`) and notes (to 20).
  - **Delivery**: in 4 playable stages (11.3), each ending with a CD
    playtest.
- **M3 "Night and fever"**: floors 8-22; day/night on the device clock;
  the dog (growl cue); infection and sickness as moodles; paper, meds,
  herbs, batteries; flashlight, saw; stove, cooking, spoilage, full
  comfort, hygiene; medicine recipes; Workbench Lv2, storage shelf;
  survivors 2-3, Medic and Cook; runner re-evaluated; ~20 notes.
- **M4 "Power and defense"**: all 30 floors, brutes; rope, wire, rubber,
  leather, container; power, traps, Barricade Lv3, gear, tool wraps, water
  tank, lockbox; stairwell barricades between floors; antiviral; survivor
  4, Mechanic.
- **M5 "Beacon"**: roof, radio set, supply caches, elevator, Rooftop
  beacon, leave/stay ending, remaining notes, balancing pass.

### 11.2 What changes from M1 (for programmers)
| M1 system | M2 change |
|---|---|
| `public/data/levels/floors.json` authored layouts | Replaced by `public/data/levels/templates.json` (templates, room types, pools, flavour lines, notes) + a seeded generator (5.15). floors.json is kept only as the source of the start flat's authored objects and Mara's fixed data, or folded into templates.json (level-designer decides). |
| Floor 720 px: stairwell 120 left + 2 x 300 apartments | 3120 px: wing 1440 / shaft 240 / wing 1440; 240 px modules, slots at 72/168. `world.apartmentWidthPx` removed; `world.floorWidthPx`, `world.stairwellWidthPx` changed; `world.wingWidthPx`, `moduleWidthPx`, `modulesPerWing`, `slotOffsetsPx`, `doorwayClearancePx` added. |
| Vertical drag only, camera y follow | Axis-locked drag, x and y follow, dead zone (`controls.cameraDeadzoneXPx`, `cameraLerp`). |
| Home = `f15_left` (+ `f15_right` once Cleared) | Claimed apartments (max 3), main home by bed; `home.floor` renamed `home.startFloor`; `home.windowSpots`, `home.floorSpots` removed (spots = empty slots); `objects.window_pane.allowedInHome` removed; `home.maxClaimed`, `claimSeconds`, `startStashSlots`, `claimedStashSlots`, `startWing` added. One stockpile -> one stash per claimed apartment. |
| Barricade at the home stairwell | Barricade per claimed front door; `buildSpot` `stairwell` -> `front_door`; attacks hit the main home's door. |
| `attacks.warningSeconds` 60, red banner, siren, HUD attack timer | Removed. `attacks.cueSeconds` 15 and `attacks.cue.*`; no UI at all. |
| Need bars, status icons, numbers, "You're starving: eat?" prompt | Moodles (`moodles.*`); `needs.onlinePromptThreshold` renamed `needs.lastResortThreshold`; prompt removed. |
| Floating "+5 morale", damage numbers, barricade HP bar, noise "!" | Removed; barricade damage stages (`barricade.visualStages`). |
| Amber pulse on interactables | Removed. |
| Zombie aggro: room entry or `zombies.aggroRadius` 200 | Sight by light and facing (`zombies.sight.*`: `frontPx`, `dimFrontPx`, `darkFrontPx`, `behindWalkPx`, `behindRunPx`, turn timings); `aggroRadius` removed; the old `sightRadiusPx` / `dimSightRadiusPx` / `darkSightRadiusPx` stay only as deprecated aliases until code and tests read `zombies.sight.*`, then delete them. Lose track, unaware hit (`combat.unawareHitMult`), barricade damage mult (`zombies.barricadeDamageMult`). |
| Crawler 15/25/4/2.0, Walker 30/40/8/1.5, wind-up 0.6, stun 0.25, knockback 12 | Crawler 20/15/8/2.5, Walker 45/26/14/2.2, wind-up 0.9, stun 0.35, knockback 8, wander pause 2-5 s. |
| Loot 1-3 rolls, search 2 s | 0-2 rolls, empty chance by condition, consumables qty 1, search 3 s. |
| Hero 120 px/s, stairs 1.2 s | Walk 100, run 170 (noise 250 px), stairs 1.4 s. |
| Cleared = no zombies and all containers searched | Cleared = no living zombies. |
| Tutorial arrows | Camera pans + thought lines. |
| Report with numbers | Prose report. |
| Save version 1 | Save version 2; M1 saves are reset. |

### 11.3 M2 delivery stages (CD decision)
M2 ships in 4 stages. Each stage keeps `main` playable, ends with a CD
playtest, and builds only on finished stages. Numbers refer to the M2
must-haves in 11.1.

| Stage | Content | Must-haves | Done when (playtest checks) |
|---|---|---|---|
| **1. Mood on the old tower** | On the existing M1 layout (720 px floors, authored floors 13-17): new palette and art pass, moodles instead of bars, no floating/damage/HP numbers, barricade damage stages, prose "While you were away", audio pass (ambience, positional zombie sounds, moodle cues, sparse music; siren and blips removed), 15 s diegetic attack cue, zombie rebalance (stats, sight, hearing, unaware hit, lose track, groups), scarcer loot (0-2 rolls, empty chances, qty 1, search 3 s), run on double tap. | 3 (scarcity only), 5, 6, 7, 9, 10, 13 | No bar, number or siren appears anywhere; an attack can be missed if the phone is quiet; a walker in the open is dangerous with fists; running is clearly louder than walking. |
| **2. Wide floors** | Floors 13-17 at 3120 px (two 6-module wings, central stairwell shaft), axis-locked drag, horizontal camera follow with dead zone, the 10 new objects (5.6 #21-30) and their loot tables. Layouts are **authored** by level-designer for this stage (temporary, replaced in Stage 3). Save version 2. | 1, 3 (objects), 12 | Panning and following feel smooth one-thumbed; most rooms are out of sight of the stairwell; an M1 save resets with "The building has changed." |
| **3. Generator and homes** | Seeded generator (5.15) with `templates.json`, conditions, zombie placement, guarantees, saved layout; claiming (5.3): stashes per apartment, build spots from empty slots, beds, main home by sleeping, Workbench recipe, barricade per claimed door, attacks target the main home, Leave this place. Save version bumped again (older saves reset the same way). | 2, 4 | Two New games give clearly different floors; every floor has food and water; a claimed flat on floor 14 can become the main home and gets attacked. |
| **4. Darkness and story** | Lighting (Dark/Dim/Grey/Lit, Dark-room silhouettes, hero eye radius, landing flicker), oil lamp recipe and fuel, ~12 notes, unit flavour lines, thoughts, tutorial without arrows (8). | 8, 11 | Entering an unexplored room feels tense but readable from the doorway; the first 60 s teach search, dismantle, craft and fight with no arrow or highlight. |

Stage rules:
- **Before Stage 4** every room counts as **Grey** for sight (180 px) and
  no Dim time multiplier applies; the landing counts as Dim (110 px).
  Rooms are drawn fully (no Dark state) until Stage 4.
- **Before Stage 3** home is the M1 home (floor 15, left; plus right once
  Cleared) with its M1 stockpile and stairwell barricade, and attacks
  target it. The M1 tutorial (with arrows) stays until Stage 4.
  Exception from Stage 2: the home is the start flat (floor 15, left
  wing) and its bed, as below.

**Stage 2 rules (Producer approved)**:
- **Cleared** = no living zombies on the floor. Containers no longer need
  to be searched (same as 5.3; applies from Stage 2, not only Stage 3).
- **Sleep / Nap**: only the bed in the start flat (`your_flat`, floor 15
  left) shows Sleep and Nap in Stage 2. Every other bed or mattress is a
  normal object (Dismantle only). Beds elsewhere become sleepable with
  claiming in Stage 3 (5.3).
- **Start and Home**: a New game places the hero standing at the start-flat
  bed. The Home button's second tap (within `controls.homeDoubleTapSeconds`)
  walks the hero to the start-flat bed.
- **Tutorial door step** (`tutorial.doorTriggerPx` **60**): the tutorial
  step "open the door" completes when the hero's x is within **60 px** of
  the start flat's front door x on floor 15 (inclusive), whether he walked
  or ran there. Being farther away or on another floor does not count.
- **Camera edge pad** (`controls.cameraEdgePadPx` 48, section 4) and **bang
  falloff** (`attacks.cue.bangFalloff`, 5.8) apply from Stage 2.
- Any change of save format inside M2 bumps the save version; an older
  save is deleted on launch with the one line "The building has changed."
- Nice-to-haves are considered only after Stage 4 has been playtested.

**Stage 1 playtest result (CD)**: the tower feels creepier, "better"; the
attack cue works as is (no change); floors 13 and 17 are fair (encounter
placement stays); nothing was confusing without text labels; bottom-bar
icons never show text (12). Follow-up request, implemented: zombie-hit
feedback (blood splash, per-weapon hit sounds, floor stains, drips, 5.4).

**Out of version 1**: ads, in-app purchases, accounts, cloud saves,
multiplayer or any online feature, push notifications, leaderboards,
multiple save slots, free placement of builds, outside-the-tower areas,
weather beyond rain on windows, temperature, vehicles, voice acting, more
than one pet, zombie smell and disguises, amputation.

## 12. Decisions and open questions

### Decided (Creative Director approved)
- Title: **"Floor 15"**.
- Hero: unnamed "you"; survivors take over via pass the torch.
- Offline cap **12 h**; offline simulation **cannot kill** (health floor 10).
- Need drain rates as in 5.2.
- The hero starts on **floor 15**.
- First survivor **Mara**, the nurse on floor 13.
- Outbreak backstory and a story ending when the tower is fully secured.
- "Everything is salvage" is a core pillar (5.6).
- Materials and uses: any material relevant to a tower-bound zombie
  apocalypse is welcome.
- **Ending**: leave with the convoy or stay and hold the tower (section 1).
- **Dirty water** keeps the health cost.
- **Loud dismantle** aggros the same floor only.
- **Day/night** follows the real device clock (now M3).
- **Pet**: one dog, **Scout**, that growls to warn of zombies (now M3).
- **Bites can infect**; untreated infection turns the character (now M3).
- **Mara's trait**: Steady hands, bandages heal +50%.
- **Quick nap** at a bed: +30 energy, -5 food, -5 water, +2 morale, 5 s,
  4 h cooldown.
- **M2 direction (after M1 playtest)**: Project Zomboid-like atmosphere;
  creepy, not gamey survival.
- **Attack cue**: no siren, no banner, no countdown; about 15 s of
  diegetic groans, stairwell banging and flicker, easy to miss.
- **Layout**: bigger, varied apartments wider than one screen; layouts and
  contents randomized per new game from templates; items placed logically
  by room; any cleared apartment on any floor can be claimed as home.
- **UI**: moodles instead of need bars; no floating or damage numbers; no
  barricade HP numbers; tap a moodle for plain text.
- **Mood**: darker desaturated look with light pools and rain; quiet
  creepy sound; slow, heavy zombies in numbers; fewer, logically placed
  items and found notes; no loot sparkle.
- **Running**: double tap runs (fast, noisy, costs energy); single tap is a
  quiet walk (5.4).
- **Unexplored rooms**: dark, but object silhouettes are visible from the
  doorway; zombies inside are visible only when close or moving (5.3).
- **M2 delivery**: 4 playable stages (11.3): 1 mood/UI/sound/attack
  cue/zombie rebalance/scarcer loot/run on the existing layout; 2 wide
  floors and horizontal camera; 3 generator and claiming homes; 4
  lighting, silhouettes, notes, arrow-free tutorial.
- **Bottom-bar labels** (Stage 1 playtest): the bottom bar is icons only;
  no text label ever shows (not on first sessions, not on long-press).
- **Stage 1 feel** (playtest): the creepier mood, the 15 s attack cue and
  the floor 13 / 17 encounters are kept as they are.
- **Zombie-hit feedback**: dark blood splash away from the hero (smaller
  for fists), stab/blunt/punch hit sounds by weapon, fading floor stains,
  occasional drip after kills (5.4).

### Decided (Producer approved; CD may revisit at playtest)
- Scavenger job works only during offline catch-up (5.7).
- Scripted first attack 10 min after the tutorial (now with the 15 s cue).
- Attackers arrive one at a time and keep hitting while the hero is away;
  they bite only on the attacked floor (5.8).
- Online repel +5 morale only if the barricade never broke (5.8).
- Hiding the app mid-attack settles the rest offline (5.8).
- Pass the torch drops the bag at the death spot (5.7).
- Survivor healing +4 health/h while upkeep is met; Treat from the Crew
  screen (5.7).
- M2 design choices by game-designer: M2 stays on floors 13-17; main home
  = where you last slept; max 3 claimed apartments; one stash per claimed
  apartment; attacks only target the main home; day/night, dog, infection,
  sickness, stove and power move to M3+ (11.1).
- **Stage 2** (11.3): a floor is Cleared when no zombies are alive
  (containers no longer required); only the start-flat bed offers
  Sleep/Nap (other beds become sleepable with claiming in Stage 3); the
  hero starts at, and Home returns to, the start-flat bed. Stage 2 code
  constants: `tutorial.doorTriggerPx` 60, `controls.cameraEdgePadPx` 48,
  `attacks.cue.bangFalloff` {nearPx 480, farPx 1500, minVolume 0.3}.

### Open questions
1. **Backstory names** ("grey fever", "river docks" group): keep, rename,
   or also name the city/tower?
2. **Survivor healing feel** (5.7): (a) keep +4/h; (b) back to +2/h and
   rely on Treat; (c) +6/h so a breach costs about half a day.
3. **Padlocked storage cages** (5.15, low priority, check at playtest):
   (a) keep crowbar-only (current); (b) also open by hand in 8 s, Loud;
   (c) cap a storage room at 3 cages so it feels less like a wall of locks.
