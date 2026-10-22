# Game Design Document

> Owned by the game-designer agent. The Creative Director has final say.
> Title: **"Floor 15"**.
> **Current target: Milestone 2 "The tower breathes", rebuilt as an
> isometric 2.5D game** (CD direction change, after Stage 1). M2 now ships
> in stages A-D (11.3). Section 11.2 lists what carries over from the side
> view, what changes and what is dropped.
> **CD direction "Floor 15 sandbox"** (added after Stage C was planned):
> floor 15 becomes a headquarters you can break and rebuild (5.19),
> reinforce against growing waves (5.20), plus rare, loud firearms and new
> melee tools (5.21). Delivered as Stages C2 and C3 (11.3); CD build
> order A -> C2 -> B -> C -> C3 -> D (the HQ comes next).

## 1. Pitch
A quiet, creepy zombie survival game in a 30-story apartment tower, seen
from above at an **isometric angle**, in the spirit of Project Zomboid.
You only see what the hero sees: a cone of sight in front of him, a little
circle around him, and walls and closed doors cast hard shadows. The rest
of the floor is black, or a dim memory of what you saw before. You wake up
alone in your flat in the middle of an outbreak. The building is dark, the
power is failing, rain runs down the windows, and something shuffles
behind a door you haven't opened yet. **Everything around you is a
resource**: the sofa is cloth and wood, the fridge is metal and parts, the
water heater holds the last clean-ish water on the floor, a cleaning shelf
is bleach for your water. Creep through your neighbours' apartments, each
one different, find what they left behind, avoid the dead when you can,
and make any flat you clear into a place to sleep, store and build. Time
keeps passing while you're away, and your door must hold.

The game never says "survive". It lets you notice that you are hungry, that
the hall light is flickering again, that the banging below has stopped.

**Pillars**
1. **Dread, not a scoreboard**: no need bars, no numbers floating up, no
   sirens or countdowns. Danger and your condition are shown by the world
   and by small "moodle" icons that appear only when something is wrong.
2. **You only see what you see** (iso rebuild): a vision cone, shadows
   behind walls and closed doors, tight rooms and no minimap. What you
   can't see you can only hear (5.17, 5.18).
3. **Everything is salvage**: nearly every object can be searched, drained
   or dismantled into materials, and it sits where it would really be
   (5.6, 5.15).
4. **Every door is a question**: apartments are varied and generated from
   hand-drawn floor plans and templates for each new game, so scouting is
   worth the risk.
5. **Make a home anywhere**: any cleared apartment on any floor can be
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

## 2. Platform and view
- Android phones (PWA + PWABuilder -> Google Play); also any phone browser.
- Orientation: **portrait**, locked.
- **720x1280** base, Phaser `Scale.FIT`, centered, `pixelArt: true`,
  `roundPixels: true`. Moodles, the top bar and the action buttons are offset by
  `env(safe-area-inset-*)`.
- Session **1-5 minutes** (check moodles, one scouting run or one attack,
  close); 3-6 check-ins per day.
- Every tappable thing (buttons, top bar, moodles, panel rows) has a hit
  area of at least **96x96 game px** (about 48 CSS px on a 400 CSS px wide
  phone). The world itself is not tappable (section 4).
- Audio starts on the first tap ("Tap to start"). Download under 20 MB
  (expected under 6 MB).

**Isometric projection** (`iso.*`)
- 2:1 isometric ("dimetric") view. The world is a grid of square **tiles**;
  each tile is drawn as a diamond **96 x 48 game px**
  (`iso.tileWidthPx`, `iso.tileHeightPx`), i.e. **32 x 16 art px** at
  **1 art px = 3 game px** (`iso.artScale`, same scale as the rest of the
  game's art).
- Grid axes: **+x** runs toward the screen's lower right, **+y** toward the
  screen's lower left. Tile (x, y) covers the grid area
  **[x, x+1) x [y, y+1)**; grid point (gx, gy) maps to screen
  `sx = (gx - gy) * 48`, `sy = (gx + gy) * 24` (before the camera offset),
  so grid point (0, 0) is the top corner of tile (0, 0). A tile **centre**
  (gx = x + 0.5, gy = y + 0.5) is therefore at
  **`sx = (x - y) * 48`, `sy = (x + y + 1) * 24`** (not `(x + y) * 24`).
  Inverse (screen to grid): `gx = (sx / 48 + sy / 24) / 2`,
  `gy = (sy / 24 - sx / 48) / 2`, then tile = (floor(gx), floor(gy)).
  Art, level tools and code all use these formulas.
- **"North/west"** edges of a room are its far edges (top of the screen,
  always visible); **"south/east"** edges (+y and +x sides) face the camera.
- **Walls** stand on tile **edges** (they take no tile). Full wall height
  **120 game px** (40 art px, `iso.wallHeightPx`, about 2.5 tile heights);
  a **cut** wall is a **36 game px** stub (12 art px, `iso.wallStubHeightPx`).
- **Characters**: 16x32 art px (48x96 game px, `iso.characterSpritePx`),
  standing on their tile's centre; about one tile wide and two tall.
- **One floor is visible at a time.** Floors above and below are not drawn
  at all; changing floor is only possible on the stairs (5.3), with a
  **0.3 s** fade to black and back (`controls.floorFadeSeconds`).
- **Readability on a small screen**: a visible zombie must be readable at a
  glance: pale face/hands vs. dark back (facing), slow shamble, and a
  lean-in wind-up. Interactables are read by shape and light, never by
  highlights (9); the one exception is the thin dark outline on the
  hero's current target (section 4). Text is never drawn in the world except the stencil floor
  number on the landing.

**Wall cutaway** (so you can see inside rooms)
- A wall edge on the **south or east side of its room** (camera-facing) is
  drawn **cut** (stub) when it belongs to the room the hero stands in, or to
  any room (corridor and landing count as rooms) that has at least one
  tile currently **Visible** (5.17). All other camera-facing walls, and all
  north/west walls, are full height.
- **Occluder fade**: any full-height wall or tall object (wardrobe, fridge,
  storage cage, water heater, washing machine) whose sprite overlaps the
  sprite of the hero, a Visible zombie or the hero's current target
  (section 4) fades to alpha **0.3** (`iso.occluderFadeAlpha`).
- Cut and fade changes animate over **0.2 s** (`iso.cutawayFadeSeconds`).
- Doors in cut walls are drawn as a stub frame with the door leaf shown on
  the floor line (closed = a low filled panel across the gap, open = the
  leaf swung against the wall); they stay targetable (section 4).
- Windows in cut walls show as a low sill with a glass edge.
- **Draw order**: per tile, by (x + y) ascending, then: floor, floor decals,
  north/west walls of that tile, objects and characters on that tile,
  south/east walls of that tile. Multi-tile objects sort by their
  front-most tile.

**Camera** (`controls.*`)
- Zoom fixed at **1.0** (`controls.zoom`; no pinch zoom, no zoom toggle:
  CD decision, 12). At zoom 1 the screen shows about 7 tiles across and 13 tiles down
  the screen's axes, roughly 400 tiles of floor.
- **Hero anchor above the control band** (CD decision, open question 9):
  the hero's resting screen point is not the screen centre but the
  **anchor** at the horizontal centre and **40%** of the visible height
  from the top (`camera.heroScreenYFrac` 0.40; on the 1280 px base that
  is y = 512, 128 px above centre and 368 px above the top of the
  400 px control band). Visible height = the safe-area height in game px.
  In camera terms: the camera centre is offset **down** from the hero by
  (0.5 - `heroScreenYFrac`) x visible height (128 px at 1280).
- **Follow**: every frame the camera centre eases toward a target point =
  the hero's screen position + the anchor offset above + a
  **look-ahead** of **120 game px** in the screen direction the hero
  faces (`controls.cameraLookAheadPx`), with lerp **0.12** per frame
  (`controls.cameraLerp`), so more of the cone is on screen. The ease is
  not limited by a dead zone; the **160 x 240 game px** rect
  (`controls.cameraDeadzonePx`, centred on the **anchor**, not the
  screen centre) is only a **hard clamp**: after easing, if the hero's
  screen position is outside that rect, the camera is moved the minimum
  amount to put him back on its edge. So at rest the hero sits up to
  120 px from the anchor, away from the way he faces: between about
  y 392 and y 632 on the base screen, always above the control band
  (top at y 880) and the HUD text line (y 840).
- **Edge case**: the floor clamp below wins over the anchor; near the
  floor's lower edge the hero may sit lower than the anchor (the
  `cameraIsoEdgePadPx` pad keeps him at least partly clear of the band).
- **No manual panning** (CD joystick decision, Stage A playtest): the view
  always follows the hero with the look-ahead above. Drags on the world
  do nothing (section 4); no two-finger pan.
  While the joystick moves the hero, the look-ahead uses his facing, which
  equals his movement direction.
- **Clamp**: the view centre stays inside the current floor's iso bounding
  box plus a **96 game px** pad (`controls.cameraIsoEdgePadPx`), so edge
  objects can be centred away from Android's back-swipe zone.
- After a floor change the camera snaps (hero at the anchor) during the
  fade.

## 3. Core loop
1. **Check in**: read the short "While you were away" note (plain sentences,
   5.1), glance at which moodles are showing.
2. **Tend**: eat, drink, sleep, collect production (rain water, filtered
   water, crops), refuel lamps, look at the door and repair it if it looks
   bad.
3. **Scout and scavenge**: cross the corridor to an apartment you haven't
   seen. Open the front door; you see only what is in front of you. Listen
   for shuffling behind closed doors, avoid or ambush the dead, close doors
   behind you, search what makes sense to search (a fridge in a kitchen, a
   cabinet in a bathroom), drain pipes and tanks, take furniture apart.
   Choose what to carry home (10 slots) and how much noise to risk.
4. **Craft**: at a workbench turn materials into tools, weapons,
   barricades, water and food production, light and medicine.
5. **Settle**: claim cleared apartments as home space, move your bed, build
   a door barricade, take in survivors. Once floor 15 is cleared, claim the
   whole floor as your **HQ** and knock it into shape: break walls, build
   new walls, doors and windows, reinforce them tier by tier (5.19, 5.20).
6. **Hold**: when you hear groans and something heavy on the stairs, get to
   your door. Or don't notice, and find out how well it was built.

## 4. Touch controls
**Floating virtual joystick to move, context buttons to act** (CD
decisions: joystick after the Stage A playtest; context buttons after the
joystick playtest, "keep all interaction in a joystick and buttons"). The
left thumb moves; the right thumb presses the buttons in the lower-right
arc (a Menu setting mirrors both for left-handed play, below). **The world
is not touch-interactive**: tapping or dragging on objects, doors,
zombies, stairs, the floor or the hero does nothing. Only the stick, the
action buttons, the top bar, moodles and open panels take touches. No
keyboard or hover, no pinch zoom (CD decision, 12), no camera panning
(section 2). At most **2 pointers** are tracked (Phaser
`input.addPointer(1)`): the stick plus one button.

**The joystick** (`controls.joystick.*`)
- **Zone**: a touch that starts in the **lower-left** area of the screen,
  **55%** of the screen width from the left edge (`zoneWidthFrac`) by
  **55%** of the screen height from the bottom edge (`zoneHeightFrac`),
  measured inside the safe area, and that does not start on UI (action
  button or top bar hit areas, moodles, an open menu, panel or card),
  becomes the stick. UI always wins over the stick zone. Touches starting
  anywhere else on the world do nothing.
- **Stick side setting** (CD decision, open question 4): Menu (section 8)
  has a toggle **"Stick: Left / Right"**, default **Left**
  (`controls.joystick.sideSettingDefault`, `"left"` or `"right"`). On
  Right, the zone is mirrored to the **lower-right** (55% of the width
  from the right edge, same 55% height) and the action button arc is
  mirrored to the **lower-left** (HUD layout below); everything else (UI
  exclusion, thresholds, top bar, moodles) is unchanged. The
  choice is saved with the other settings (sound, music) as
  `settings.joystickSide`, survives restarts and New game, and applies
  the next time a finger touches down (a stick already held keeps its
  side until release). A save without the key uses the default.
- **Appears where the thumb lands**: the stick's centre is the touch-down
  point. Ring radius **120 game px** (`radiusPx`) = full deflection; the
  knob follows the finger, clamped to the ring. If the touch is closer
  than `radiusPx` to a screen edge, only the drawing is shifted inward to
  stay on screen; the logic still uses the touch-down point.
- **Deflection** d = finger distance from centre / `radiusPx` (0-1).
  - d below **0.15** (`deadZone`, 18 px): no movement.
  - d **0.15 to below 0.25** (`turnOnlyThreshold`, CD decision, open
    question 7): **turn in place**. The hero does not step; he turns on
    the spot toward the stick direction (converted to grid space as
    below) at `controls.walkTurnDegreesPerSecond` (540 deg/s) and the
    vision cone follows. Silent: no footsteps, no noise, sight as when
    standing still (5.4). It never opens doors (no door push) and never
    climbs stairs. Knob alpha as creep (`knobCreepAlpha`). While the stick
    stays in this band the target can change as usual (stick held).
    Edge cases: during a **timed action** the turn band is ignored (he
    keeps facing the target; the action is **not** cancelled; only creep
    or faster cancels, 50% rule below). It **does** wake a sleeping or
    napping hero and cancels a Home auto-walk (any push out of the dead
    zone does).
  - d **0.25 to below 0.40** (`creepThreshold`, CD decision, open
    question 6): **creep** at `hero.walkTilesPerSecond` x **0.5**
    (`hero.creepSpeedMult`) = 1.0 tiles/s. Silent and harder to notice
    (5.4, "Creeping"). Knob alpha **0.2** (`knobCreepAlpha`).
  - d **0.40 to below 0.70**: **walk** at `hero.walkTilesPerSecond` (2.0,
    constant, not analog). Quiet.
  - d **0.70 or more** (`runThreshold`): **run** at
    `hero.runTilesPerSecond` (3.4): noisy and costs energy (5.4).
  - The four bands (turn, creep, walk, run) are discrete (no speed
    blending). The band is re-read every frame from the current
    deflection, so sliding the thumb in or out changes gait at once; the
    band edges (0.15, 0.25, 0.40, 0.70) have no hysteresis. Moving from
    the turn band into creep: he steps as soon as d reaches 0.25, turning
    while moving as usual (no wait for the turn to finish).
  - Release: the hero stops at once (no glide); he keeps his facing.
- **Tap in the zone**: a touch released within **0.25 s**
  (`tapMaxSeconds`) that never left the dead zone does nothing, except:
- **Double tap in the zone = turn around**: a second such tap whose
  touch-down is within **0.3 s** (`doubleTapSeconds`) of the first tap's
  release and within **48 game px** (`doubleTapMaxDistancePx`) of the
  first touch-down turns the hero **180 degrees** in **0.2 s**
  (`controls.turnAroundSeconds`). Silent. It does not cancel an action in
  progress (he keeps working; the target stays locked, below). This
  replaces the old tap-on-hero turn.
- **Direction is screen-correct**: pushing the knob up moves the hero up
  the screen, right moves him right, and so on. The stick vector (sx, sy)
  is converted to a grid vector with the inverse projection (section 2)
  `gx = sx/48 + sy/24`, `gy = sy/24 - sx/48` (the section 2 formula; its
  1/2 factor drops out), then normalised. Movement is
  **free-angle** (not snapped to 8 directions) in grid space.
- **Collision and sliding**: the hero is a circle of radius **0.3 tiles**
  (`hero.collisionRadiusTiles`) against wall edges, closed jammed doors,
  object footprints, void, and zombie circles of the same radius (one
  zombie per tile still holds for zombies). When blocked, the movement
  component along the blocking surface is kept (he **slides along walls**);
  when both components are blocked he stands still with his facing set.
- **Doorway assist**: if the hero pushes into a wall edge within **0.35
  tiles** (`doorwayAssistTiles`) of the centre line of a doorway (open
  door or empty gap) and the stick points at least half into it (angle to
  the doorway normal under 60 degrees), he is nudged sideways toward the
  doorway centre at walk speed, so 1-tile doorways are easy to pass.
- **Closed doors**: pushing into a closed, unjammed door for **0.2 s**
  (`doorPushSeconds`) opens it (`doors.openSeconds`, quiet); running into it
  bursts it open at once with the 4-tile noise (5.18). Jammed doors and
  barricades not built by the hero block like walls; the first bump shows
  the thought "It's stuck." / "Barricaded from the inside." (normal thought
  cooldown).
- **Stairs**: walking onto a flight's landing-end tile and pushing further
  into the flight climbs or descends (5.3); rubble flights block like walls
  and show their thought on the first bump.
- **Facing**: while moving, the hero faces his movement direction (turning
  at `controls.walkTurnDegreesPerSecond`, 540 deg/s) and the vision cone
  follows. On release he keeps his last facing.
- **Visuals**: a **dark translucent ring** (fill `#0b0c0e` at alpha
  **0.25**, 3 px stroke `#bdb8ab` at alpha **0.2**) and a **knob** of radius
  **44 game px** (`knobRadiusPx`, fill `#bdb8ab` at alpha **0.3**). Past the
  run threshold the knob alpha rises to **0.45** (`knobRunAlpha`); in the
  creep band it drops to **0.2** (`knobCreepAlpha`); these are the only
  gait feedback besides the footsteps. No text, no arrows. It fades in over
  **0.1 s** on touch-down and fades out over **0.3 s** on release
  (`fadeSeconds`); when idle nothing is drawn. Colours and alphas are in
  `controls.joystick.visual`.
- **Interrupts**: moving the stick out of the dead zone cancels a Home
  auto-walk (below) and wakes a sleeping or napping hero. Moving it into
  the **creep band or beyond** (d 0.25 or more) cancels any timed action
  in progress (search, dismantle, drain, claim, force with a crowbar,
  door open/close), except a search or dismantle past 50% (it completes
  first; then, if the stick is still held, he starts moving). The turn
  band never cancels a timed action.
- **Looking around** (CD decision, open question 7; Look drag removed
  with world touches): a very light push (turn band, d 0.15 to below
  0.25) turns him on the spot to face the stick direction without
  stepping; a firmer push moves him and he faces where he moves; the
  double tap above turns him 180 degrees. Acting on a target turns him
  to it.

**The target** (keys `controls.target.*`)

The hero always has **at most one target**: the interactable he would act
on. The action buttons (below) show what he can do to it. Walking up to a
thing targets it; there is no other way to pick one.
- **Candidates** (re-checked every frame):
  - **Zombies**: Visible (5.17), alive, with a **clear line** (5.4), within
    the equipped weapon's range (`combat.weapons.<id>.rangeTiles`,
    centre to centre) and within **+-90 degrees** of the hero's facing
    (`zombieConeDegrees` 180 total).
  - **Objects, doors and the rest** (containers, drainables, beds,
    workbench, stash, placeables, survivors, the dog, material and bag
    piles, the elevator door): within **1.2 tiles**
    (`objectReachTiles`) and within **+-60 degrees** of his facing
    (`objectConeDegrees` 120 total), with at least one main or secondary
    action (greyed counts). Distance is from the hero's centre to the
    **nearest point** of the thing's footprint rectangle; **edge things**
    (doors, window panes, curtains, mounted cabinets) use their wall-edge
    segment. The angle is to the footprint's centre (edge things: the
    segment's midpoint). At least one footprint tile (edge things: one of
    the two tiles beside the edge) must be **Visible**, and the straight
    segment from the hero's centre to the nearest point must not cross a
    wall or a closed/jammed door other than the target itself.
  - Never candidates: stairs (walk into them, 5.3), floor tiles, the
    hero himself, corpses, decals, Remembered-only or Unknown things.
- **Choosing**: if any zombie is a candidate, only zombies compete
  (zombies always beat objects). Among the competitors, sort by the
  absolute angle from his facing in **15-degree buckets**
  (`angleBucketDegrees`; floor(angle / 15)), then by distance; the first
  is the **best candidate**.
- **Hysteresis (no flicker)**: the current target is **kept** while it is
  still valid under loosened limits: reach **+0.3 tiles**
  (`keepReachExtraTiles`) and the cone **+15 degrees per side**
  (`keepConeExtraDegrees` 30 total). A different best candidate replaces
  it only after being best for **0.15 s** without a break
  (`switchHoldSeconds`). Exceptions, which switch at once: a zombie
  candidate appears while the target is not a zombie; the current target
  stops being valid (gone, dismantled, out of the loosened limits) - then
  the best candidate (or none) is taken immediately.
- **Standing still keeps the target**: while the stick is not held, the
  target only changes through the two exceptions above (a new object
  coming into reach never steals it; a zombie always does).
- **Locked during actions**: from the start of a timed action until it
  ends or is cancelled, the target does not change (not even for a
  zombie; the Attack button still swings at the zombie candidate, below).
- **Target outline**: the target gets a thin **dark outline** around its
  sprite silhouette (doors: the leaf; edge things: their sprite; zombies:
  the body): **3 game px** (1 art px, `outline.widthPx`), colour
  `#0b0c0e` at alpha **0.6** (`outline.color`, `outline.alpha`). On a
  **zombie** target it is slightly stronger (CD decision, open question
  10): **4 game px** at alpha **0.75** (`outline.zombieWidthPx`,
  `outline.zombieAlpha`), same colour. Survivors and the dog use the
  object values. No glow, no pulse, no colour, no text. It fades in/out over **0.1 s**
  (`outline.fadeSeconds`) on change. It is not drawn while a panel or menu
  is open, during sleep/nap, or when there is no target. This is the only
  world outline besides the placement spots (5.6).

**Action buttons** (lower-right arc, sizes and positions under HUD layout
below; muted UI style, section 8; icons only, never text)

| Button | Size | What it does |
|---|---|---|
| **Main** | 120 px | The target's main action (table below); its icon is that action's pictogram. |
| **Secondary** | 88 px | The target's alternative action (table below). |
| **Attack** | 96 px | Swing the equipped weapon; its icon is that weapon (fist / knife / bat ...). Always shown. |
| **Quick-use** | 80 px | Use the chosen carried item; long-press to choose (below). |

- **Tap, not hold**: every action starts on a tap (finger down and up on
  the same button within its hit area; the action fires on release). A
  finger that slides off the button before release does nothing.
  Exception: **holding Attack** (or Main while it shows Attack) repeats
  the swing every weapon cooldown while held.
- **Empty and greyed**: the four plates are always drawn, so the arc never
  jumps. A button with no action shows an empty plate at alpha **0.3**
  (`controls.buttons.emptyPlateAlpha`) and ignores taps. A button whose
  action is **unavailable** (missing tool, cooldown, unsafe, full, empty)
  shows the action's icon at alpha **0.3** (`disabledIconAlpha`); a tap
  shows the reason as a toast or thought ("Needs crowbar", "Not safe.",
  "Nothing left.") and does nothing.
- **Icon change**: when the target or its state changes, the icon
  cross-fades over **0.1 s** (`iconSwapFadeSeconds`). A tap during the
  fade acts on the **new** target.
- **No main action -> secondary moves up**: if a target has no main
  action at all (objects whose `primary` is `null`, e.g. chair, table,
  sofa, curtains, sink pipes, window pane), its secondary action
  (Dismantle) is shown on **Main** and Secondary is empty. Things that
  have a main action that is merely used up (searched, drained) keep it
  greyed on Main and Dismantle stays on Secondary, so a repeated tap on
  Main never starts a noisy dismantle by surprise.
- **Confirm taps**: actions marked "confirm" below need a second tap on
  the same button within **2 s** (`confirmSeconds`); the first tap shows
  the pressed plate and the toast "Tap again to leave this place." Any
  other input or target change cancels the confirm.
- **Timed actions** (search, dismantle, drain, claim, force with a
  crowbar, door open/close, nap): a tap starts them; the hero stays where
  he stands (there is no walking to an access tile: being in reach is
  enough), turns to face the target at 540 deg/s while the timer already
  runs, and the thin progress ring shows. **Moving the stick out of the
  dead zone cancels** (50% rule above). Main and Secondary taps during a
  timed action do nothing. Attack during a timed action cancels it (same
  50% rule: past 50% the swing is dropped) and swings. Quick-use during a
  timed action works and does not cancel it. A zombie seeing him, a bite
  or fire also cancels (5.4).
- **Instant actions** (pick up, take, talk, open a panel, place, drink
  from a collector) happen on the tap.

**Main and secondary action by target** (Main first; "->" = state)

| Target | Main | Secondary |
|---|---|---|
| Zombie | **Attack** (same as the Attack button) | **Shove** (5.4); greyed while on cooldown or beyond 1.5 tiles |
| Door, closed, unjammed (interior) | **Open** (0.4 s) | **Dismantle** (crowbar; greyed "Needs crowbar") |
| Door, open (interior) | **Close** (0.4 s; greyed "Something's in the way." while anyone's centre is on one of its two tiles) | **Dismantle** |
| Door, broken (interior) | - (Dismantle moves up: 2 wood) | - |
| Front door, unclaimed, closed / open | **Open** / **Close** | **Claim** (2 s) when the unit has no living zombie and the door is not broken; greyed "Too much to hold." at 3 claimed; else empty |
| Front door, claimed (no barricade), closed / open | **Open** / **Close** | **Leave this place** (confirm) when allowed (5.3); else empty |
| Front door, claimed, with the hero's barricade | **Inspect**: a thought by stage ("It'll hold." / "It's taken a beating." / "One more push and it's gone." / "There's nothing left of it.") | **Leave this place** (confirm) when allowed; else empty |
| Jammed door (front, or Mara's bathroom) | **Open**: tries the handle, thought "It's stuck." (Mara's door: she answers, 5.7) | **Force**: one Noisy hit (3 hits open it), or **1 s** with a crowbar (`world.jammedDoorCrowbarSeconds`) |
| Door barricaded from the other side (not the hero's) | **Open**: thought "Barricaded from the inside." | - |
| Container, unsearched | **Search** (3 s, x light; greyed "Needs crowbar" on padlocked cages) | **Dismantle** |
| Container, searched, loot left (bag was full) | **Take** (instant, what fits) | **Dismantle** |
| Container, searched, empty | **Search** greyed ("Nothing left.") | **Dismantle** |
| Drainable (toilet tank, water heater) | **Drain** (greyed "Needs wrench" / "Empty.") | **Dismantle** |
| Bed or mattress in a claimed apartment | **Sleep** (5.2) | **Nap** (5.2; greyed with its reason) |
| Bed or mattress elsewhere | **Sleep** greyed ("Not here. Not yet.") | **Dismantle** |
| Workbench (fixture / built) | **Craft** (opens the workbench panel) | - / **Dismantle** |
| Stash | **Open** (Bag on this stash's tab) | **Store all** |
| Rain collector, water filter | **Collect** (all stored units into the bag); if the Thirsty moodle shows and it holds clean water: **Drink** (one unit now, +20 water) | **Dismantle**; while Main shows Drink: **Collect** |
| Planter | **Collect** (crops); with none ready: **Water** (from the stash, 5.6) | **Dismantle** |
| Oil lamp (placed) | **Add fuel** (greyed "Full." / "No fuel.") | **Dismantle** |
| Survivor not recruited | **Talk** (dialogue); carrying their quest item: **Give** | - |
| Recruited survivor | **Talk** (+5 morale, 12 h cooldown; greyed after) | - |
| Material or bag pile | **Pick up** (what fits) | - |
| Dog (M3) | **Offer food** / **Pet** / **Feed** (when hungry) | **Follow** / **Stay home** toggle |
| Elevator door (M5) | **Use** (floor list) | - |
| Placement spot (placement mode, 5.6) | **Place** | **Cancel** |
| Stairwell fire door, floor 15 Cleared, HQ not claimed (C2) | **Claim the floor** (5 s, 5.19); greyed "Something is still moving here." while floor 15 is not Cleared | - |
| Spike strip (C3) | - (Dismantle moves up) | - |
| Alarm lure (C3) | **Wind** (2 s; greyed "Already wound." / "It's done.") | **Dismantle** |
| Edge cursor (build mode only, 5.19) | **Build / Upgrade / Fit / Add overlay / Repair** (rule order in 5.19) | **Demolish** |

Placeables not listed (survivor bed, M3+ devices) use **Use** on Main and
**Dismantle** on Secondary. Objects with only Dismantle show it on Main.
Main home bed and beds in claimed apartments cannot be dismantled (leave
the place first).

**Attack button** (`controls.attackBuffer`). **Both stay** (CD decision,
open question 8): Main shows Attack whenever the target is a zombie (one
thumb play), and the dedicated Attack button is always present (to swing
while an object is the target or an action locks it).
- Shows the **equipped weapon** as its icon (fist, knife, bat; a weapon
  that breaks switches it to the fist). Always shown, never greyed except
  while asleep.
- **Tap**: if there is a zombie candidate (the target, or while an action
  locks the target, the best zombie candidate), the hero turns to it and
  swings; the hit resolves against that zombie if it is still in weapon
  range with a clear line at the swing. With no zombie candidate he
  **swings at the air** in his facing: a whoosh, **0.5 energy**, no
  durability, no noise, hits nothing. If the target is a jammed door,
  Attack does the same as **Force** (one hit).
- **Cooldown**: the weapon's cooldown; at most **1** tap is buffered
  during it. **Holding** repeats a swing every cooldown.
- **While moving**: the stick keeps moving him; for the swing he turns to
  the zombie, then back to his movement direction (movement continues).
- **Firearms** (C3) change Attack: one shot per tap (holding does **not**
  repeat), only at a zombie candidate in the gun's cone and range (no shot
  and no ammo spent without one), and an empty gun with no ammo carried is
  swung as a club. Full rules in 5.21.

**Quick-use slot** (`quickUse.*`)
- Holds one **item type**, used from **carried** items only (not the
  stash). Eligible types: consumables (food, water bottle, chocolate,
  bandage, medkit), dirty and clean water, throwables (5.11).
- **Default**: empty at New game. The first time the hero carries an
  eligible item, the slot takes the first type he carries from
  `quickUse.defaultOrder` (water bottle, clean water, canned food, dry
  snack, chocolate, bandage). Once the player has chosen a type, it is
  never changed automatically.
- **Display**: the item's icon plus the carried count as small UI text in
  the plate's corner. Count 0: the icon stays, greyed (alpha 0.3); a tap
  shows "None left." The chosen type is game state (saved, not a
  setting) and carries over to the next character on pass the torch.
- **Tap**: uses one at once (same effect as Use in the Bag). If every stat
  the item restores is already at 100, nothing is used and the thought
  "Not now." shows. Then a **1 s** cooldown (`cooldownSeconds`): the
  plate darkens and taps are ignored. Dirty water applies its health cost
  as usual.
- **Throwables**: the first tap **arms** (a faint iso ellipse of the
  landing area at the aim point); a second tap within **3 s**
  (`throwArmSeconds`) throws; otherwise, or on any Main/Secondary tap, it
  disarms and keeps the item. **Aim point**: the nearest Visible zombie
  within `throw.rangeTiles` (6), within **+-30 degrees** of his facing
  (`throwAimConeDegrees` 60 total) and in line of sight; if none, the
  last walkable tile in line of sight straight along his facing, at most
  **4 tiles** away (`throwDefaultTiles`). Re-computed every frame while
  armed, so walking or turning re-aims.
- **Long-press** the slot for **0.5 s** (`longPressSeconds`): a picker
  opens just above the button arc: one row of **96 px** cells, one per
  eligible type he carries (icon + count) plus an **empty** cell to clear
  the slot. Tap a cell to choose and close; tap anywhere else to close.
  The world keeps running (real time; it is not a pause). With no
  eligible item carried the picker does not open; the toast "Nothing to
  keep at hand." shows.

**Other inputs**

| Input | Result |
|---|---|
| Tap a moodle icon | Shows its plain-text card (5.2). |
| "Home" (top bar) | First tap shows the pressed state for **1 s**; a second tap within **1 s** sends the hero (**auto-walk**) to the main home's bed, pathing via the stairs if needed. |
| Top bar icons | Bag (Inventory), Workbench, Survivors (Crew), Menu. Panels and menus opened from them stay tap-based (section 8). |

- **Auto-walk** now exists only for **Home**: A* path (5.3), always a
  quiet walk, never a run or creep. Using the stick cancels it at once.
- **Menus and panels** (Bag, workbench/craft panel, Crew, Menu, moodle
  cards, the quick-use picker, dialogue, notes) are tapped as before.
  While a full panel (Bag, workbench, Crew, Menu, dialogue, a note) is
  open, the stick and action buttons are hidden and ignored; moodle cards
  and the quick-use picker leave them working.

**Facing**: the hero has a continuous facing angle that drives the vision
cone (5.17) and an 8-direction sprite. While walking or running (stick or
Home auto-walk) he faces his movement direction, turning at **540 deg/s**
(`controls.walkTurnDegreesPerSecond`). Idle, he keeps his last facing.
Acting on a target (object, door or zombie), he turns to face it.
- The facing angle is stored in **grid space** (angle of the direction
  vector in grid x/y). The **vision cone** (5.17) and zombie cones (5.4)
  use grid angles.
- The **sprite** (one of 8) is chosen by **screen direction**: convert the
  grid facing vector to screen space (`dsx = (dx - dy) * 48`,
  `dsy = (dx + dy) * 24`), take its screen angle and pick the nearest of 8
  **45-degree sectors** (screen right, down-right, down, ... each sector
  centred on its direction, +-22.5 degrees). Zombies use the same rule.

**Removed with the context buttons** (CD decision): iso hit-testing of the
world, the forgiveness snap (`controls.tapSnapRadiusPx`), the action menu
over objects, auto-walk to objects/doors/zombies/stairs, tap on the hero
to turn (`controls.heroTapTurnSeconds`, now the stick double tap,
`controls.turnAroundSeconds`), the Look drag
(`controls.lookTurnDegreesPerSecond`) and the Throw tap-to-aim. Keys are
listed in `_deprecatedWorldTapKeys` in balance.json. Access tiles (5.15)
stay as a placement rule (the hero must be able to stand in reach), not a
walk target.

**HUD layout** (portrait 720x1280 base, game px, inside the safe area;
keys `controls.buttons.*`, `ui.topBar.*`)
- **Control band**: the bottom **400 px** (`controls.buttons.bandHeightPx`)
  holds the stick zone (left) and the button arc (right). Thoughts, toasts
  and flavour lines sit centred just above it: their bottom edge **440
  px** above the safe-area bottom (`ui.hudTextBottomPx`).
- **Button arc** (default Stick: Left, so buttons on the right). Centres
  are given as (dx from the right edge, dy up from the bottom edge):

  | Button | Plate diameter | Hit circle diameter | Centre (dx, dy) |
  |---|---|---|---|
  | Main | 120 | 128 | (130, 170) |
  | Attack | 96 | 104 | (270, 170), left of Main |
  | Secondary | 88 | 96 | (229, 269), up-left of Main |
  | Quick-use | 80 | 96 | (130, 310), above Main |

  The three small buttons sit on an arc of radius **140 px** around Main
  (left, up-left, up), so the right thumb rests on Main and rolls to the
  others. Hit circles never overlap (closest gap 7 px, Attack-Secondary);
  every hit area is at least **96 px**. Main stays **66 px** from the
  screen edge, clear of Android's back-swipe zone. The arc's left edge
  (dx 322) stays right of the stick zone's 55% edge (dx 324 on 720 px);
  UI wins anyway where they meet.
- **Stick: Right** mirrors the arc horizontally (dx measured from the
  **left** edge) and the stick zone to the lower-right. Nothing else
  moves.
- **Top bar** (was the bottom bar): one row along the **top-left**, icons
  only, same plate style (72 px plate in a 96 px hit area,
  `ui.topBar.*`): **Home, Bag, Workbench, Survivors, Menu** (5 x 96 =
  480 px), plus from Stage C2 a 6th **Build** icon (trowel) shown only
  when build mode is possible (5.19); then 6 x 96 = 576 px, still clear of
  the 96 px moodle column on a 720 px screen. The moodle column stays top-right (max 6 icons, 72 px), so the
  two never meet. The Throw button and the weapon pictogram are gone from
  the bar (throwables: quick-use slot; weapon: Attack button icon).
- The progress ring of timed actions stays on the hero in the world.

## 5. Mechanics
All numbers below are starting values and live in
`public/data/balance.json` (key in brackets). Programmers must not
hard-code them. "M1-M5" marks the milestone a feature arrives in (section
11). Lists are keyed by stable snake_case ids: `materials.<id>`,
`objects.<id>`, `recipes.<id>` (cost, output, effect numbers, `buildSpot`),
`consumables.<id>`, `combat.weapons.<id>`, `zombies.types.<id>`,
`barricade.levels`, `survivors.roster.<id>`. **`items.<id>` is the lookup
registry**: every id usable in a cost, yield, output or loot table has an
entry there (`type` material/consumable/water/weapon/tool/throwable/quest/
ammo, `name`, `stack` material = 20, item = 10, tool = 1, ammo = 30
(`inventory.ammoStack`), heavy = 5 (`inventory.heavyStack`, concrete
blocks) per slot); the detailed
blocks above hold the stats. Recipe ids are their own namespace and may
equal their output's item id. Two-number arrays (e.g. `[1, 3]`) are
inclusive min/max ranges. A `null` durability means never breaks. Sizes
are `small`/`medium`/`large`, noise `quiet`/`noisy`/`loud`. An object or
recipe with a `milestone` field is only used from that milestone on;
without it, it is M1.

**Units of distance (iso rebuild)**: all world distances are in **tiles**,
measured centre to centre in straight lines (a diagonal step is 1.414
tiles). Speeds are tiles per second. Keys end in `Tiles` or
`TilesPerSecond`. Screen-space numbers (UI, hit areas, camera) stay in game
px. The old side-view px keys stay in balance.json only until the code
reading them is replaced; they are listed in `_deprecatedSideViewKeys` and
in 11.2.

**Controls numbers**: joystick (`controls.joystick.*`): radius 120 px,
dead zone 0.15, turn in place below 0.25 (`turnOnlyThreshold`), creep
below 0.40, run at 0.70, zone 55% x 55% lower-left, tap in zone under
0.25 s, fade 0.3 s, knob 44 px, door push 0.2 s, doorway assist 0.35
tiles, double tap to turn 0.3 s / 48 px, turn around 0.2 s
(`controls.turnAroundSeconds`); hero collision radius 0.3 tiles
(`hero.collisionRadiusTiles`); target (`controls.target.*`): object reach
1.2 tiles, object cone 120 degrees, zombie cone 180 degrees (reach =
weapon range), keep +0.3 tiles / +30 degrees, switch hold 0.15 s, angle
buckets 15 degrees, outline 3 px `#0b0c0e` alpha 0.6 (zombies 4 px
alpha 0.75), placement reach 1.5
tiles; action buttons (`controls.buttons.*`): Main 120 / Attack 96 /
Secondary 88 / Quick-use 80 px, confirm 2 s; quick-use (`quickUse.*`):
long-press 0.5 s, cooldown 1 s, throw arm 3 s; shove (`combat.shove.*`);
Home double tap 1 s (`controls.homeDoubleTapSeconds`), camera lerp 0.12,
hero clamp rect 160x240 px, look-ahead 120 px, edge pad 96 px, minimum
hero anchor 40% from the top (`camera.heroScreenYFrac`), minimum
hit area 96 px (`controls.buttonSizePx`, `controls.minHitAreaPx`), 1
buffered attack tap (`controls.attackBuffer`). Removed with the context
buttons: see `_deprecatedWorldTapKeys`. Removed with tap-to-move
(listed in `_deprecatedTapToMoveKeys`): `controls.lookHoldSeconds`,
`runDoubleTapSeconds`, `runDoubleTapMaxDistancePx`,
`cameraFollowPauseSeconds`, `cameraDragFrictionPerSecond`,
`tapSnapWalkTiles`. Tutorial
front-door trigger 1.5 tiles (`tutorial.doorTriggerTiles`). M2 floors
13-17 (`world.floorMin`, `world.floorMax`); floor grid in `grid.*`; start
flat on floor 15, unit slot NW (`home.startFloor`, `home.startUnit`).

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
  to their spawn tiles; burning molotov fires end. Doors keep their state
  (a door the hero left open stays open). Tile memory (5.17) is kept.
- Autosave every **10 s** (`time.autosaveSeconds`) and on every floor change,
  craft, dismantle, claim, door open/close and attack end. Save is
  localStorage, one slot, **save version 2** (the iso world). Any older
  save (the side-view version 1) cannot be converted: on launch it is
  deleted and the title shows one line, "The building has changed.", then
  New game.
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
| Tired | energy | 50 / 35 / 20 / 5 | Tired / Very tired / Exhausted / Can barely stand | L3+: speed and damage -30% (`needs.energy.lowPenalty`); vision range -1 tile (5.17) |
| Injured | health | 80 / 60 / 35 / 15 | Hurt / Injured / Badly hurt / Close to death | none (health is the effect) |
| Depressed | morale | 50 / 35 / 25 / 10 | Low / Unhappy / Depressed / Hopeless | L3+: damage -20%, energy drain x1.5, survivors refuse quests |
| Panic | aggroed zombies that are **Visible** to the hero within **8 tiles**, same floor | 1 / 2 / 3 / 5 zombies | Uneasy / Scared / Panicked / Terrified | damage -0 / -10 / -20 / -30% (`moodles.panic.damagePenalty`); **tunnel vision**: cone -0 / -10 / -20 / -30 degrees (`moodles.panic.coneDegreesPenalty`, 5.17) |
| Sick (M3) | status | - | Queasy ... | see 5.10 |
| Infected (M3) | status | Bitten / Fever / Turning | ... | see 5.14 |

- The L3 thresholds of Tired and Depressed must equal
  `needs.energy.lowThreshold` (20) and `needs.morale.lowThreshold` (25);
  the effects keep their M1 keys.
- **Panic** counts zombies within **8 tiles**
  (`moodles.panic.aggroedWithinTiles`) that are aggroed **and** Visible
  (5.17). It decays one level every **5 s**
  (`moodles.panic.decaySecondsPerLevel`) once fewer are counted. It never
  rises from sounds, the attack cue (5.8) or zombies the hero cannot see.
- **Display**: a column of icons at the top right, **72 game px** each
  (`moodles.iconPx`, 24x24 art px) with a 96 px hit area, max 6
  (`moodles.maxShown`), worst level first. The icon is a simple pictogram
  (empty plate, drop, closed eye, bandage, cloud, wide eye) on a square
  whose colour darkens with severity (section 9). No numbers. When a
  moodle appears or changes level it wobbles once for **0.5 s**
  (`moodles.levelChangeWobbleSeconds`) and plays one soft cue (a stomach
  growl, a dry swallow, a yawn, a pained breath, a sigh, a fast
  heartbeat), never a UI blip.
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
  below **20** (`needs.lastResortThreshold`) and nothing else fits.
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
  `cleanWaterItemsPerFloor`). A rain collector (3 plastic, 2 metal) yields
  6.7 water/h against a 4/h drain, so it is self-sustaining once built; its
  cost is reachable on floors 14-16 in one 5-minute session.
- **Sleep**: a bed in a claimed apartment -> Main button *Sleep* (+25
  energy/h); any button tap or stick push wakes. Closed
  app = characters in claimed apartments are asleep (offline +10/h).
- **Quick nap** (`needs.energy.nap`): bed -> Secondary button *Nap*. The
  active character lies down on the targeted bed, the screen fades to black over **5 s**
  (`durationSeconds`) and back. On completion: energy **+30** (capped at
  100), food **-5** and water **-5** (floored at 0), morale **+2**, and the
  cooldown of **4 h** real time starts (`cooldownHours`).
  - Napping or sleeping in a bed in another claimed apartment makes that
    apartment the **main home** (5.3).
  - The cooldown is one timer per save (`lastNapAt`, a `Date.now()`
    timestamp), runs online and offline; pass the torch does not reset it.
  - **Button states** (icon only, section 4): ready = Nap icon. Greyed
    with a toast on tap: cooldown "Not yet (2h 10m)", remaining time
    rounded **up** to the minute, hours dropped under 1 h ("Not yet
    (45m)"); energy at 100 "Rested."; unsafe "Not safe." while any zombie
    on the hero's floor is aggroed or an attack is in progress (attackers
    present). The **attack cue does not grey the button** (it must stay
    easy to miss, 5.8). Tapping a greyed button shows its reason and does
    nothing.
  - **Interrupts** (cancel the nap): a zombie seeing the character, a bite,
    fire, a zombie banging on a door of that apartment, the stairwell
    sounds of an attack cue (8 s before the attack: the character jolts
    awake), any button tap or stick push, or the app going to background. A cancelled nap gives
    nothing, costs nothing and does **not** start the cooldown; the fade
    snaps back.
  - Remaining cooldown = clamp(cooldownHours - (now - lastNapAt), 0,
    cooldownHours).

### 5.3 The tower, floors and apartments (iso rebuild)
**Floor plan** (`grid.*`). Every floor is a grid of **30 x 22 tiles**
(`grid.floorWidthTiles`, `grid.floorDepthTiles`), the same shell on every
floor. Coordinates are (x, y), x = 0-29 along the corridor, y = 0-21 across.

| Area | Tiles (x, y, w x h) | What it is |
|---|---|---|
| Corridor | 0-29, 10-11 (30 x 2) | The common hallway. **2 tiles wide**. A window at each end (on the x = 0 and x = 30 edges). |
| Unit slot NW | 0, 0, 12 x 10 | Apartment, front door on its south edge (onto the corridor) |
| Stairwell core | 12, 0, 6 x 10 | Landing, stairs, dead elevator (below) |
| Unit slot NE | 18, 0, 12 x 10 | Apartment, front door on its south edge |
| Unit slot SW | 0, 12, 12 x 10 | Apartment, front door on its north edge |
| Unit slot S | 12, 12, 6 x 10 | **Small unit** (studio, laundry room or storage/boiler room), front door on its north edge |
| Unit slot SE | 18, 12, 12 x 10 | Apartment, front door on its north edge |

- So each floor has **4 apartments + 1 small unit**. Unit slots are walled
  off from each other (no doors between units); each unit has exactly one
  **front door** onto the corridor, at the x its floor plan sets (5.15).
- **Stairwell core** (6 x 10): **landing** x 12-17, y 6-9 (6 x 4); **stairs
  down** flight x 12-13, y 1-5 (2 x 5); **elevator shaft** x 14-15, y 0-5
  (void, not walkable) with the dead **elevator door** on the landing's
  north edge at x 14-15; **stairs up** flight x 16-17, y 1-5; tiles x 12-13
  and 16-17 at y 0 are void. The core opens onto the corridor through a
  **2-tile doorway** at x 14-15 on its south edge, with a **fire door
  propped open** (a wedge; it cannot be closed in M2; stairwell barricades
  are M4). The **floor number** is painted on the landing's north wall
  (always visible, never cut).
- **Exterior edges** (floor boundary) are walls; rooms touching them may
  have **windows** (5.15). The corridor's two end windows make the 3 tiles
  nearest each end Grey (`grid.corridorWindowGreyTiles`); the rest of the
  corridor and the landing are Dim.
- **Walls** are on tile edges between different rooms or units and on the
  floor boundary. A **doorway** is a 1-tile gap in a wall edge; it may hold
  a door (5.18).

**Movement and pathfinding**
- **Hero with the joystick**: free-angle movement with collision and wall
  sliding (section 4). The **Home auto-walk** (the only hero auto-walk),
  zombies and survivors move on the grid in **8
  directions** using A* (orthogonal cost 1, diagonal 1.414). A diagonal step is allowed only if
  both orthogonal neighbours it passes are walkable and no wall edge
  touches the corner being cut (no corner-cutting through walls, doors or
  objects).
- **Hero path cost of closed doors**: a closed, unjammed door on the way
  adds **+1 tile** of path cost (`doors.heroPathDoorCost`), so an equally
  short open route is preferred. Jammed doors are not passable.
- **Search cap**: A* stops after **4000 node expansions**
  (`path.maxExpansions`) and treats the target as unreachable (Home: the
  hero thinks "I can't get there from here." and stays).
- Movement is continuous between tile centres; a character "is on" the tile
  containing its centre.
- **Occupancy**: objects block their footprint tiles (5.15); **one zombie
  per tile** (`zombies.tuning.maxPerTile`); the hero cannot walk through
  zombies and zombies cannot walk through the hero. Survivors, the dog and
  corpses never block anyone. Pickup piles (material piles, bag piles)
  don't block.
- Closed (not jammed) doors are passable for the hero: he opens them on the
  way (5.18). Jammed doors, barricades not built by the hero, void and
  objects are not passable.
- Hero walk **2.0 tiles/s** (`hero.walkTilesPerSecond`), run **3.4
  tiles/s** (`hero.runTilesPerSecond`). Corridor end to end (30 tiles):
  15 s walking. Zombie speeds: 5.4.
- **Stairs**: the hero walks onto a flight's landing-end tile with the
  stick and keeps pushing into the flight for **0.2 s**
  (`controls.joystick.doorPushSeconds`; the Home auto-walk does the same
  on its own), then he climbs (up flight) or descends (down flight):
  **1.4 s per floor** (`hero.stairSecondsPerFloor`), shown as the 0.3 s
  fade; he arrives on the landing-end tile of the **opposite** flight one
  floor up or down (you come up the down-flight of the floor above). In M2,
  floor 13's down flight and floor 17's up flight are blocked by rubble:
  first bump -> thought "Rubble. No way down." / "Rubble. No way up." Path
  requests to another floor (Home double tap) chain: walk to the right
  flight, climb, repeat.

**Light per tile** (M2; drawing in section 9, effects in 5.17). Every tile
has one light level, used for the hero's vision, zombie sight and search
time:
- **Lit**: within **4 tiles** (`light.lampRadiusTiles`) of a burning oil
  lamp (or a lit stove, string lights later) **and** in line of sight of it
  (5.17 LOS rules). Warm.
- **Grey**: a tile in a room whose type has a window (`light: "grey"` in the
  room type, 5.15), and the corridor ends. Cold daylight.
- **Dim**: windowless rooms of flats (hallway, bathroom, break room), the
  corridor middle and the landing (`light: "dim"`).
- **Dark**: service rooms with no window (laundry, storage, janitor,
  utility, `light: "dark"`).
- Search, dismantle and drain take **x1.5** time on Dim tiles
  (`light.dimTimeMult`) and **x2.0** on Dark tiles (`light.darkTimeMult`),
  using the light of the hero's tile while acting.
- The landing's emergency light flickers at random 50-150 ms dips
  (`light.stairwellFlickerMs`); during a dip the landing counts as Dark.
- The old "Dark until entered" room state and dark-room silhouettes are
  **dropped**: the vision system (5.17) replaces them.

**Floor states**: **Infested** (living zombies on the floor) -> **Cleared**
(no living zombies on the floor) -> **Secured** (Secure floor recipe:
defense +5 each, no more wanderers).
- Cleared-but-unsecured floors get **1-2 wandering walkers every 12 h**
  (`world.wanderersPerInterval`, `world.wandererIntervalHours`). They spawn
  on a corridor or landing tile at least **10 tiles** from the hero
  (`zombies.tuning.wanderSpawnMinHeroDistanceTiles`) that is not Visible,
  never inside a claimed apartment; at most **3** alive per floor
  (`zombies.tuning.maxWanderersPerFloor`). Otherwise killed zombies stay
  dead. A floor with a living wanderer is Infested again.
- Some front doors are **jammed** (**25%** of units,
  `generator.frontDoorJammedChance`; never the start flat): **3 hits**
  (`world.jammedDoorHits`) to open, or 1 s with a crowbar
  (`world.jammedDoorCrowbarSeconds`, 1 crowbar use). Opening it this way
  breaks the lock: it then works as a normal door. Each hit is Noisy.

**Claiming home space** (M2). "Home" is not fixed to floor 15.
- The **start flat** (floor 15, slot NW, template `your_flat`) is claimed
  from the start and is the first **main home**. Its tiles start
  Remembered (5.17).
- **Claim**: when a unit has **no living zombie inside it** and its front
  door is not broken, the front door (targeted from inside or from the
  corridor) shows **Claim** on the Secondary button. The hero spends
  **2 s** checking the lock (`home.claimSeconds`, quiet, interruptible
  like a search). The unit becomes a **claimed apartment**. Burned units
  can be claimed. Max **3** claimed at once (`home.maxClaimed`); a 4th
  shows Claim greyed, toast "Too much to hold.". All tiles of a claimed unit
  become Remembered.
- **A claimed apartment gives**:
  - a **stash** (a pile of bags and boxes, 1 tile) placed on the free tile
    nearest the front door inside the unit that keeps every doorway and
    access tile reachable (5.15 placement rules): **40 slots** in the start
    flat (`home.startStashSlots`), **20** in each other claimed apartment
    (`home.claimedStashSlots`). Entering any claimed apartment offers
    "Store all" into its stash.
  - **build spots**: every empty floor tile in it that passes the placement
    rules is a **floor spot**; every **window edge** in it without a window
    pane (removed or broken) is a **window spot**. No other caps.
  - **beds**: every intact bed or mattress in it can be slept or napped in;
    survivor beds can be built there.
  - **safety**: wanderers never spawn inside; its tiles count as "at home"
    for every rule (comfort, Store all, regen of survivors living there).
  - a **front door barricade spot** (5.8).
- **Main home**: the claimed apartment containing the bed the active
  character last **slept or napped** in. Only one at a time. It is where
  attacks go (5.8), where "Home" sends the hero, where the hero sleeps
  offline and whose lamps count for comfort. Changing it is the natural act
  of sleeping somewhere else; the first time, a one-line thought: "I'll
  sleep here now."
- **Workbench**: the start flat has one (a fixture). Other claimed
  apartments need the **Workbench** recipe (5.6). Crafting uses carried
  items first, then the stash of the apartment the workbench is in.
- **Leave this place**: a claimed apartment that is not the main home, has
  no survivor living in it and an empty stash can be unclaimed from its
  front door (Secondary button, tap twice within 2 s to confirm,
  section 4). Its placeables stay as ordinary
  salvage; its barricade stays and still blocks zombies.

### 5.4 Combat and stealth (M2, in tiles)
The dead are slow, heavy and many. Fights are dangerous; avoiding them is
usually wiser.
- Each tap on **Attack** (or on Main while it shows Attack) with a zombie
  targeted = one attack (weapon damage, range, cooldown; section 4).
  Holding repeats it every cooldown. An attack needs a **clear line**: attacker and target tiles
  have no wall or closed door between them, and for a diagonal neighbour
  neither orthogonal corner is a wall (no hitting round corners). Hits
  shove the sprite **8 game px** (visual only, no tile change) and flash
  pale for **60 ms** (`combat.knockbackPx`, `combat.hitFlashMs`). No damage
  numbers. Weapon rows live in `combat.weapons.<id>`, zombie rows in
  `zombies.types.<id>`.
- **Hit feedback** (CD request; keys `combat.hitFx.*` and
  `combat.weapons.<id>.hitSound`). Cosmetic only: no effect on damage,
  noise, sight or saves.
  - **Splash**: every hit on a zombie sprays a dark blood splash (dried
    blood `#4e1c1a`, section 9) from the hit point **away from the hero**,
    along the screen-space direction hero -> zombie. Fists make a smaller
    spatter than weapons.
  - **Hit sound**: one per hit, by the weapon's `hitSound`: `stab` (blades:
    kitchen knife, pipe spear, fire axe), `blunt` (spiked bat, lead pipe,
    crowbar), `punch` (fists). A weapon without `hitSound` uses `blunt`.
  - **Floor stains**: a hit leaves a blood decal on the zombie's tile with
    chance **0.35** (`decalChance`); every kill always leaves one. Decals
    fade out linearly over **600 s** (`decalFadeSeconds`) of online play
    and are not saved and not remembered (they are drawn only on Visible
    tiles). At most **30** per floor (`decalCapPerFloor`); a new decal over
    the cap removes the oldest on that floor. Decals are never targets.
  - **Drip**: after a kill, with chance **0.5** (`dripChance`), one extra
    drop falls from the corpse **450 ms** later (`dripDelayMs`). No sound.
  - Hits on barricades, doors and jammed doors make no blood (splinters
    only).
- **Zombie sight** (keys `zombies.sight.*`). Every zombie has one of **8
  facings**. It notices the hero (same floor) when it has **line of sight**
  to him (same LOS rules as the hero, 5.17: walls, closed doors and jammed
  doors block; objects and barricades don't) and he is:
  - **in its cone** (**120 degrees** total, `coneDegrees`, centred on its
    facing) within a range set by the light of the **hero's** tile:
    **5 tiles** Lit, **4** Grey, **2.5** Dim, **1.5** Dark
    (`frontTiles.lit/grey/dim/dark`). A carried light makes you visible:
    see the flashlight (5.11).
  - **outside its cone** (beside or behind): within **0.9 tiles** while the
    hero walks or stands (`behindWalkTiles`; less than one tile, so a
    walking hero is never noticed by sight from behind or beside, and
    fists reach 1.5 tiles: he can always strike first), within **1.5
    tiles** while he runs (`behindRunTiles`; run noise usually wakes it
    sooner anyway), within **0.5 tiles** while he creeps
    (`behindCreepTiles`). Light does not change these.
  - **Creeping** also shortens the in-cone range: x**0.75**
    (`creepFrontMult`; Lit 5 -> 3.75, Grey 4 -> 3, Dim 2.5 -> 1.9, Dark
    1.5 -> 1.1 tiles). The gait used is the hero's gait on the frame the
    check runs; standing still counts as walking (no bonus).
  - **Facing rules**: a walking zombie faces its step direction. A paused
    idle zombie turns every **4-8 s** (random, `idleTurnSeconds`): 90
    degrees left (40%), 90 degrees right (40%) or 180 degrees (20%)
    (`idleTurnChances`); the turn shows as a **0.4 s** head-turn frame
    before the facing changes (`turnSeconds`; sight uses the old facing
    during it). An aggroed zombie always faces the hero (or his last known
    tile). A zombie hit while unaware turns to the hero instantly and
    aggroes. Authored zombies take `facing` (N, NE, E, SE, S, SW, W, NW)
    from level data; generated zombies face away from their unit's front
    door with chance **0.7** (`spawnFacingAwayChance`), else toward it.
  - Entering a zombie's room never wakes it by itself.
- **Hearing**: noise aggros zombies regardless of facing and walls (sound
  goes through walls and closed doors). Radii are straight-line tiles on
  the same floor: **running** fires a noise of **5 tiles** once per second
  (`hero.runNoiseRadiusTiles`); Noisy salvage **8 tiles**
  (`salvage.noiseRadiusTiles`); Loud = the whole floor; a door burst open
  while running **4 tiles** (`doors.runOpenNoiseTiles`); jammed-door hits
  Noisy. Walking, opening and closing doors normally, and melee hits are
  silent. A zombie that heard a noise walks to the noise tile (pathing,
  bashing closed doors in the way for up to 10 s, 5.18) and looks around;
  it aggroes only if it then sees the hero.
- **Creeping** (CD decision, joystick light push, section 4): from
  **0.25** (`controls.joystick.turnOnlyThreshold`; below it he only turns
  in place) to below **0.40** deflection
  (`controls.joystick.creepThreshold`) the hero moves
  at **0.5x** walk speed (`hero.creepSpeedMult`, 1.0 tiles/s).
  - **Hearing**: creeping makes **no** hearing noise
    (`hero.creepNoiseRadiusTiles` 0, same as walking,
    `hero.walkNoiseRadiusTiles` 0). Creeping into a closed door opens it
    quietly as when walking (never a burst).
  - **Sight**: behind/beside radius **0.5 tiles** instead of 0.9, and
    in-cone range x**0.75** (zombie sight above).
  - **Footstep sound** (audio only, the player's feedback): volume x**0.4**
    (`audio.footstepCreepVolumeMult`) of the walk footstep, one step every
    **0.6 s** (`audio.footstepCreepIntervalSeconds`; walk 0.4 s,
    `audio.footstepWalkIntervalSeconds`).
  - Costs no energy. Tired L3+ speed penalty applies on top. Auto-walks
    never creep (they walk). Stairs take the normal stair time.
- **Stealth target (QA)**: walking up behind an idle walker and hitting
  first succeeds in at least 4 of 5 tries when the hero starts outside its
  cone. Creeping: a creeping hero can pass a Grey-lit idle walker's cone
  edge at 3.5 tiles without being noticed in 5 of 5 tries (walking at 3.5
  tiles is noticed).
- **Running** (CD decision, joystick version): pushing the stick past
  **70%** of its radius runs (section 4); 40-70% is a quiet walk, below
  40% a creep (above). Auto-walks
  never run. Running costs **0.2 energy per second** of running
  (`hero.runEnergyPerSecond`; the full corridor costs about 1.8). The
  Tired L3+ speed penalty applies to running too. At energy below **5**
  (Tired L4, `hero.runMinEnergy`) a push past the run threshold makes the
  hero walk and think "I can't run anymore." (once per 20 s, like all
  thoughts). Running noise fires once per second only while actually
  moving at run speed (blocked against a wall = no noise). Running on stairs keeps the stair time but still makes
  noise on the floor being left.
- **Unaware hit**: the first hit on a zombie that has not noticed the hero
  deals **x3** damage (`combat.unawareHitMult`). A walker (45 HP) dies to
  one unaware spiked bat hit plus one more. This is the main tool for
  thinning rooms. A zombie that lost track (below) and is back at its spawn
  tile counts as unaware again.
- **Losing track**: an aggroed zombie that has not seen the hero for **8 s**
  (`zombies.tuning.loseTrackSeconds`) while he is more than **8 tiles** away
  (`zombies.tuning.loseTrackDistanceTiles`) or on another floor gives up and
  shambles back to its spawn tile. Until then it walks to the hero's
  **last seen tile** and turns there. Zombies never use stairs except
  during attacks.
- **Roaming**: an aggroed zombie chases the hero anywhere on its own floor
  (all units, corridor, landing), re-pathing every **0.5 s**
  (`zombies.tuning.repathSeconds`). It cannot pass a closed barricade or a
  closed door; it bangs on it instead (barricades: x0.4 damage, below;
  doors: 5.18).
- **Idle wander**: a non-aggroed zombie picks a random walkable tile within
  **2 tiles** of its spawn tile in the same room
  (`zombies.tuning.wanderRadiusTiles`), walks there at **x0.4** its speed
  (`zombies.tuning.wanderSpeedMult`), pauses **2-5 s**
  (`zombies.tuning.wanderPauseSeconds`) and repeats. Groups spawn on
  neighbouring tiles and wander as a loose cluster.
- **Bite wind-up** **0.9 s** (`zombies.tuning.attackWindupSeconds`): the
  zombie leans in before each bite; this is the cue to step back. A bite
  lands only if the hero is still within **1.5 tiles**
  (`zombies.attackRangeTiles`) with a clear line when the wind-up ends.
- **Hit stun**: each hero hit stops the zombie for **0.35 s**
  (`zombies.tuning.hitStunSeconds`).
- **Shove** (Secondary button on a zombie target; keys `combat.shove.*`):
  works on a targeted zombie within **1.5 tiles** (`rangeTiles`, any
  weapon) with a clear line. It pushes the zombie **0.5 tiles**
  (`pushTiles`) straight away from the hero (stopping early at walls,
  doors, objects, other zombies or the floor edge), stuns it for **0.8 s**
  (`stunSeconds`) and **cancels its bite wind-up** (the wind-up restarts
  from zero after the stun). No damage, no durability, silent (a grunt and
  scuff, not noise). Costs **1 energy** (`energy`). Cooldown **2.5 s**
  (`cooldownSeconds`, separate from the weapon cooldown); the button is
  greyed while it runs. A shoved unaware zombie becomes aware (no x3 hit
  after a shove). Design check: stun 0.8 + wind-up 0.9 = 1.7 s < 2.5 s
  cooldown, so shoving alone can never lock a zombie; it buys a step back
  or a door close, not a free kill.
- **Corpse**: a killed zombie slumps and stays **1.5 s**
  (`zombies.tuning.corpseSeconds`), then fades.
- **Barricades**: zombie damage to any barricade is multiplied by **0.4**
  (`zombies.barricadeDamageMult`), both during attacks and when an aggroed
  zombie bangs on a claimed door.
- **Jammed doors**: block sight and movement and stop weapon hits. Noise
  passes: zombies on the other side aggro and bang (SFX) but cannot open
  them.
- **What interrupts actions** (search, dismantle, drain, claim, door
  open/close): a zombie seeing the hero, a bite, or standing in fire. A
  zombie alerted only by noise does **not** interrupt until it sees him.
- **Weapon durability**: an equipped weapon stays in its carry slot. It
  loses **1 durability per hit on a zombie**; missed swings and hits on
  doors cost energy only (0.5 per swing).

| Weapon | Damage | Range tiles | Cooldown s | Durability (hits) | Hit sound | Source |
|---|---|---|---|---|---|---|
| Fists | 5 | 1.5 | 0.4 | infinite | punch | - |
| Kitchen knife | 10 | 1.5 | 0.35 | 40 | stab | loot |
| Spiked bat | 14 | 1.6 | 0.5 | 50 | blunt | crafted (M1) |
| Lead pipe | 16 | 1.7 | 0.6 | 60 | blunt | loot, crafted (M3) |
| Pipe spear | 20 | 2.2 | 0.7 | 50 | stab | crafted (M3) |
| Fire axe | 30 | 1.8 | 0.9 | 80 | stab | loot (**C3**, was M3; also demolishes light pieces, 5.19) |
| Hammer | 8 | 1.5 (was 1.4, which missed diagonal neighbours at 1.41) | 0.4 | 40 | blunt | loot, crafted (C2; building tool, 5.19) |
| Crowbar | 12 | 1.5 | 0.5 | 40 | blunt | the existing tool, now equippable (C3) |
| Sledgehammer | 24 | 1.6 | 1.3 | 60 | blunt | loot, crafted (C2; demolition tool, 5.19) |
| Pistol / Shotgun / Hunting rifle | 5.21 | | | | gunshot | rare loot (C3 / C3 / M3) |

Range 1.5 reaches all 8 neighbouring tiles; 2.2 (spear) also reaches 2
tiles straight ahead. (`combat.weapons.<id>.rangeTiles`)
- **Range units (rule for every weapon row)**: `rangeTiles` is the only
  range the iso game reads (`IsoGameScene.weaponRange`; tile distance in
  grid units, not screen px). Every `combat.weapons` row, melee and
  firearm, also keeps a legacy `rangePx` for the side-view code
  (`combat.js` `heroWeapon`) and its tests, listed in
  `_deprecatedSideViewKeys` (this both-keys rule covers `combat.weapons`
  rows only; `firearms.emptyGunMelee` has `rangeTiles` alone). For new
  rows `rangePx = rangeTiles x 50` (50 px per tile, from 11.2: walk
  100 px/s = 2 tiles/s, throw 300 px = 6 tiles): hammer 75, crowbar 75,
  sledgehammer 80, fire axe 90, pistol 350, shotgun 250, hunting rifle
  450. Fists 40, knife 45 and spiked bat 55 keep their M1 px values. Every
  melee weapon must have `rangeTiles` >= `zombies.attackRangeTiles` (1.5)
  and `rangePx` > `zombies.attackRange` (30), so the hero can always hit
  any zombie that can hit him. Firearms add their own keys (5.21); the
  empty-gun club uses `firearms.emptyGunMelee.rangeTiles` 1.5.
- **Tools as weapons** (C3): crowbar, hammer and sledgehammer keep their
  tool uses (`salvage.toolUses` 20; sledgehammer `build.sledgehammerUses`
  30; hammer never wears from building) and also have a separate weapon
  durability (hits). The item breaks when **either** counter reaches 0
  (thought "The crowbar's bent for good."). The sledgehammer swing costs
  **1.5 energy** (`combat.weapons.sledgehammer.energyPerSwing`) instead of
  0.5.

| Zombie | HP | Speed tiles/s | Damage | Attack interval s | Milestone |
|---|---|---|---|---|---|
| Crawler | 20 | 0.30 | 8 | 2.5 | M1 (rebalanced M2) |
| Walker | 45 | 0.52 | 14 | 2.2 | M1 (rebalanced M2) |
| Runner | 20 | 2.2 | 6 | 1.0 | M3+, to be re-judged against the "shamble" direction |
| Brute | 120 | 0.5 | 20 | 2.0 | M4 |

(`zombies.types.<id>.speedTilesPerSecond`)

- Each swing costs **0.5 energy** (`combat.energyPerSwing`). Broken weapons
  revert to fists (toast "The bat splits.").
- **Danger check** (design intent, QA test): fists vs one aware walker:
  9 hits, ~3.6 s at full speed, the hero takes 1-2 bites (14-28). Two aware
  walkers with a spiked bat: ~25-45 damage taken. Three aware walkers with
  fists: likely death. Running away at 3.4 tiles/s always outpaces a walker
  (0.52 tiles/s); walking (2.0) does too. Closing a door between you and a
  walker buys about 24 s (5.18).
- **Encounter targets (placement rules for level data)**: on floors 13-17
  the first room a hero meets in any unit (the room behind the front door)
  holds at most **one walker** (crawlers extra). A walker pair (2 in one
  room) must be skippable or approachable from behind: it starts facing
  away from the unit's front door, at least **3 tiles** from the room's
  entrance doorway and from any jammed door the hero must hit
  (`generator.pairMinDistanceFromEntranceTiles`). Three walkers never share
  a room before M3. Target win rates: fists + stealth vs 1 walker 5/5
  survive; fists vs an aware pair may lose; a bat or a stealth opener vs a
  pair survives 4/5. `generator.maxWalkersPerRoom` = 2.
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
- Search takes **3 s** (`scavenge.searchSeconds`, x1.5 on Dim, x2 on Dark
  tiles) with a thin progress ring, costs **1 energy**
  (`scavenge.searchEnergy`). The hero stands on the object's access tile
  facing it, so his cone points at the object and his back is exposed.
- **No loot highlight**: no sparkle, pulse, glow or "!" on containers, ever.
  Searched containers look slightly ajar (doors open, drawers out), and are
  remembered that way (5.17).
- Hero carries **10 slots** (`inventory.carrySlots`). Items stack to **10**
  (`inventory.itemStack`); materials to **20** (`inventory.materialStack`);
  weapons and tools never stack (`inventory.toolStack`).
- Stash sizes: 5.3. Full inventory: search loot stays in the container;
  dismantle yield drops as a **material pile** on the object's access tile
  (never despawns, does not block; targeted like an object, Main = Pick
  up).

### 5.6 Everything is salvage
Almost every object drawn in an apartment is usable. Floors, the
stairwell, the workbench fixture and barricades are not (barricades can
only be repaired or replaced). From Stage C2, walls and front doors can be
**demolished** with a sledgehammer (5.19), except exterior walls, the
stairwell shaft and the landing walls. Zombies are never salvage.

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
| Sheet metal | flat sheet with rivets | recipe 3 metal -> 1; chance on fridges, washing machines, water heaters, filing cabinets, storage cages | sheet-metal walls, reinforced/metal doors, plating | C2 |
| Concrete block | grey block | demolishing block walls (between units, unit-corridor) on any floor; heavy, 5 per slot | block walls | C2 |
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
  < 20 (`salvage.lowEnergySlow`); Dim x1.5, Dark x2 (5.3).
- **Tools** must be carried: **Crowbar** (doors, wardrobes, beds, filing
  cabinets, storage cage padlocks), **Wrench** (pipes, water heater, fridge,
  washing machine). Saw (M3: bookshelves, counters). Each tool has **20
  uses** (`salvage.toolUses`); every completed action that needs it uses 1.
- **Noise**, fired when dismantling starts. **No visual marker**: the sound
  itself plays (creak, crack, clang) and zombies that heard it turn and
  shamble toward it. *Quiet* none; *Noisy* aggros zombies within **8
  tiles** on the same floor (`salvage.noiseRadiusTiles`), through walls;
  *Loud* aggros every zombie on the same floor. Noise never reaches other
  floors.
- An unsearched container is searched first (+3 s). Interrupts as 5.4;
  progress is lost unless past 50% (`salvage.keepProgressRatio`).
- Yield is fixed per object plus listed chances. The object is removed for
  good (saved) and never respawns; its tiles become walkable floor.
- Crafted placeables can be dismantled for **50%** of their cost, rounded
  down (`salvage.refundRatio`), quiet, Small time and energy.
- **Drain** (quiet, Small time and energy) works once per object.

**Objects in M1-M2** (the generator places them by room type, 5.15;
footprints and mounting in `iso.footprints` / `iso.mountedObjects`):

| # | Object | Size | Footprint | Tool | Noise | Primary | Dismantle yield | MS |
|---|---|---|---|---|---|---|---|---|
| 1 | Chair | S | 1x1 | - | Quiet | - | 2 wood | M1 |
| 2 | Table | M | 1x2 | - | Noisy | - | 4 wood | M1 |
| 3 | Kitchen cupboard | M | 1x1 | - | Noisy | Search (food, chemicals) | 3 wood | M1 |
| 4 | Wardrobe | L | 1x1 (tall) | Crowbar | Noisy | Search | 6 wood + 1 metal | M1 |
| 5 | Bed | L | 2x2 | Crowbar | Noisy | Sleep/Nap when claimed | 3 wood + 2 metal + 2 cloth | M1 |
| 6 | Sofa | M | 1x2 | - | Quiet | - | 3 cloth + 2 wood | M1 |
| 7 | Curtains | S | window edge | - | Quiet | - | 2 cloth | M1 |
| 8 | Potted plant | S | 1x1 | - | Quiet | - | 1 plastic, 60% +1 seeds | M1 |
| 9 | Interior door | M | doorway edge | Crowbar | Loud | Open/Close (5.18) | 5 wood + 1 metal | M1 |
| 10 | Fridge | L | 1x1 (tall) | Wrench | Loud | Search (food) | 4 metal + 2 plastic + 1 parts | M1 |
| 11 | Microwave | S | 1x1 | - | Noisy | - | 1 metal + 1 plastic + 1 parts + 1 glass | M1 |
| 12 | TV | M | 1x1 | - | Noisy | - | 2 plastic + 2 parts + 1 glass | M1 |
| 13 | Sink pipes | M | 1x1 | Wrench | Noisy | - | 2 metal + 1 dirty water | M1 |
| 14 | Toilet tank | M | 1x1 | - | Quiet | Drain: 2 dirty water | 1 plastic | M1 |
| 15 | Water heater | L | 1x1 (tall) | Wrench | Loud | Drain (wrench): 6 dirty water | 4 metal + 1 parts | M1 |
| 16 | Kitchen drawer | S | 1x1 | - | Quiet | Search (metal, tape) | 1 wood | M1 |
| 17 | Window pane | S | window edge | - | Noisy | - | 2 glass | M1 |
| 18 | Bathroom cabinet | S | wall edge (mounted) | - | Quiet | Search (chemicals, bandage) | 1 glass + 1 plastic | M1 |
| 19 | Toolbox | S | 1x1 | - | Quiet | Search (tape, metal) | 1 metal | M1 |
| 20 | Oil lamp | S | 1x1 | - | Quiet | - | 1 glass + 1 metal, 50% +1 fuel | M1 |
| 21 | Mattress | M | 1x2 | - | Quiet | Sleep/Nap when claimed | 4 cloth | M2 |
| 22 | Medicine cabinet | S | wall edge (mounted) | - | Quiet | Search (bandage, medkit, chemicals) | 1 glass + 1 metal | M2 |
| 23 | Desk | M | 1x2 | - | Noisy | Search (tape, parts, snack, notes) | 4 wood + 1 metal | M2 |
| 24 | Filing cabinet | M | 1x1 | Crowbar | Noisy | Search (parts, tape, notes) | 4 metal | M2 |
| 25 | Washing machine | L | 1x1 | Wrench | Loud | Search (cloth) | 5 metal + 2 parts (+2 rubber from M4) | M2 |
| 26 | Laundry basket | S | 1x1 | - | Quiet | Search (cloth) | 1 plastic + 1 cloth | M2 |
| 27 | Storage cage | M | 1x2 (tall) | Crowbar | Noisy | Search needs crowbar (padlock; fuel, tape, metal, tins) | 3 metal | M2 |
| 28 | Toy box | S | 1x1 | - | Quiet | Search (chocolate, snack) | 2 plastic | M2 |
| 29 | Utility shelf | M | 1x1 (tall) | - | Quiet | Search (chemicals, tape, fuel) | 2 wood + 1 metal | M2 |
| 30 | Burned furniture | M | as the object it replaced | - | Quiet | - | 1 wood + 1 metal, 30% +1 parts | M2 |

- "Window edge" and "wall edge (mounted)" objects take no tile: they hang
  on a wall edge and are used from the tile in front of it. Mounted
  objects only go on **north- or west-side** walls of their room (the
  never-cut walls) so they are always seen; window panes and curtains sit on
  window edges on any side. Dismantling a door or a mounted object never
  changes walkability, except that a door edge becomes an open doorway.
- "Tall" objects can occlude and fade (section 2).

New loot tables needed (level-designer): `medicine_cabinet`, `desk`,
`filing_cabinet`, `washing_machine`, `laundry_basket`, `storage_cage`,
`toy_box`, `utility_shelf` (done). Food appears only in kitchen-type
containers, storage cages (rare tins), toy boxes (chocolate) and desks
(rare snack).

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
unaffordable; WB = workbench level). The panel groups recipes under a
heading per use, in this order (`craftingPanel.useOrder` / `useNames`):
**Weapons, Throwables, Tools, Materials, Medicine, Water, Food, Light,
Defense, Home**, then any later group (Power, Gear, Comfort, Cooking) in
table order. "Material" is an intended group (from C2: sheet metal; M4:
rope): intermediate materials sit next to the tools that use them. An
unknown use is never hidden; it goes at the end. Within a group, recipes
keep their balance.json order:

| Use | Recipe | Cost | Effect | WB | MS |
|---|---|---|---|---|---|
| Weapon | Spiked bat | 3 wood + 1 metal | Weapon (5.4) | 1 | M1 |
| Weapon | Lead pipe | 3 metal + 1 tape | Weapon (5.4) | 1 | M3 |
| Weapon | Pipe spear | 2 metal + 2 wood + 1 tape | Weapon (5.4) | 1 | M3 |
| Throwable | Molotov | 1 glass + 1 fuel + 1 cloth | Fire patch (5.11) | 1 | M1 |
| Throwable | Noise lure | 1 parts + 1 batteries + 1 metal | Ringing alarm clock (5.11) | 1 | M3 |
| Tool | Crowbar | 3 metal | 20 uses | 1 | M1 |
| Tool | Hammer | 2 metal + 1 wood | Needed to build, upgrade, repair (5.19) | 1 | C2 |
| Tool | Sledgehammer | 4 metal + 2 wood + 1 tape | 30 demolitions (5.19) | 1 | C2 |
| Material | Sheet metal | 3 metal | 1 sheet metal | 1 | C2 |
| Defense | Spike strip | 4 wood + 2 metal | Trap, HQ floor or landing (5.20) | 1 | C3 |
| Defense | Alarm lure | 2 metal + 1 parts + 1 tape | Trap that lures attackers (5.20) | 1 | C3 |
| Tool | Wrench | 2 metal + 1 parts | 20 uses | 1 | M1 |
| Tool | Saw | 1 wood + 2 metal + 1 parts | 20 uses | 1 | M3 |
| Tool | Flashlight | 1 plastic + 1 glass + 1 parts | Light beam in the cone (5.11) | 1 | M3 |
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
| Light | **Oil lamp** | 1 glass + 1 metal + 1 cloth | Lights tiles within 4 (5.3, 5.10); holds 2 fuel, 1 per 12 h; floor spot | 1 | **M2** |
| Home | **Workbench** | 6 wood + 2 metal | A workbench in a claimed apartment, max 1 per apartment; floor spot (1x2) | 1 | **M2** |
| Power | Generator | 6 metal + 4 parts + 2 wire | +3 power, 1 fuel per 4 h; floor spot | 2 | M4 |
| Power | Solar panel | 4 glass + 3 parts + 2 wire + 1 metal | +1 power; window spot | 2 | M4 |
| Light | String lights | 2 wire + 1 glass + 1 parts | 1 power; lights tiles like a lamp | 2 | M4 |
| Defense | Barricade Lv1 / Lv2 / Lv3 | 5 wood + 2 metal / 10 wood + 5 metal + 2 tape / 15 metal + 4 parts + 4 tape | A claimed front door; HP 120 / 250 / 500, defense +10 / +25 / +50 | 1 / 1 / 2 | M1 / M1 / M4 |
| Defense | Repair | 1 wood per 20 HP | Restores barricade HP | 1 | M1 |
| Defense | Secure floor | 8 wood + 4 metal | Cleared floor -> Secured; defense +5 each | 1 | M1 |
| Defense | Nail board / Tripwire chimes / Electric fence | as v1 list | Main home door (5.8) | 1-2 | M4 |
| Gear | Padded jacket / Leather armor / Quiet shoes | as v1 list | 5.11 | 1-2 | M4 |
| Comfort | Reading nook / Decorations / Music player | as v1 list | Comfort +1 each | 1 | M3 |
| Hygiene | Latrine / Wash station | as v1 list | Sickness -10 points | 1 | M3 |
| Home | Survivor bed | 6 wood + 2 cloth | One survivor can live in this apartment; floor spot (1x2) | 1 | M1 |
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
  barricades `front_door`; secure floor `cleared_floor`; spike strip and
  alarm lure `hq_floor` (any free floor tile in HQ or on floor 15's
  landing, `buildSpots.hq_floor`, 5.20); everything else `none` (goes to
  inventory). Spots come from claimed apartments (5.3).
  Placeable footprints are in `iso.footprints` (workbench and survivor bed
  1x2, others 1x1).
- **Paying for placeables**: crafting a placeable enters spot-pick mode:
  free spots of its type in the **claimed apartments on the hero's floor**
  are outlined with a thin dashed off-white diamond (with the dark target
  outline of section 4, the only outlines in the game); the panel closes
  and the player walks the hero to a spot with the joystick (the camera
  follows; no manual pan). **Placement targeting**: in this mode only
  spots are object candidates (zombies still beat them): a spot whose
  first tile (window spots: the window edge) is within **1.5 tiles**
  (`controls.target.placeReachTiles`) and in the 120-degree cone, same
  sorting and hysteresis as section 4. The targeted spot shows a ghost of
  the placeable at alpha **0.5** (`controls.target.ghostAlpha`) in the
  orientation it will take. **Main = Place** (the cost is taken now),
  **Secondary = Cancel** (free; also cancelled by opening any panel). A
  1x2 placeable takes the targeted tile as its first tile and whichever
  orientation fits, preferring its long side against a wall; tiles where
  neither orientation passes the placement rules (5.15) are not outlined.
  A barricade (`front_door` spot) targets the claimed front door itself.
  No free spot on this floor = recipe greyed "No free spot here".
- **Barricade**: one per claimed front door, built on the door's inside.
  Lv2 needs Lv1 on that door and replaces it at full Lv2 HP. At 0 HP it
  gives no defense and zombies pass. The hero and survivors pass their own
  barricades freely (a **0.5 s** squeeze-through animation,
  `doors.barricadeSqueezeSeconds`); zombies never. A
  barricaded front door stands open behind the planks: the barricade
  blocks movement but **not sight** (you see through the gaps, and so do
  they).
- **Repair**: opens the list of claimed doors with a barricade (96 px rows,
  "Main home", "Floor 14, north-east"); each craft spends 1 wood and
  restores 20 HP (`barricade.repairHpPerWood`). Rows show a small picture
  of the barricade's damage stage, never HP numbers; a full barricade is
  listed greyed "Holding".
- **Secure floor**: list of Cleared floors (96 px rows). A floor with a
  living wanderer is greyed "Something is still moving on floor N".
- **Producers**: as M1 (`effect.intervalHours`, `effect.maxStored`,
  `effect.waterPerUnit`, water from the stash of the producer's apartment).
  Output stays in the placeable until collected (Main *Collect*, or
  *Drink* from a water producer while Thirsty; section 4).

**Storage pressure**: an apartment rarely fits in 10 carry slots, and
stashes are per apartment, so where you claim matters: a second home near
the floors you scavenge saves walking.

### 5.7 Survivors
- Few, named, hand-written characters (dialogue, one trait, one recruitment
  quest), each on a specific floor. Recruit: talk -> quest -> free Survivor
  bed in any claimed apartment -> they move into that apartment. Survivors
  are drawn only on Visible tiles, like zombies, but are remembered where
  last seen once recruited (they live at home).
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
    **Badly hurt** / Close to death.
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
  equipped gear drop as a bag pile on the death tile (never despawns). No
  survivors left = game over. The new character's main home is the
  apartment they live in.
- **Mara** (M1): floor 13, hiding in the **bathroom** of a flat-type unit
  (the generator forces one flat on floor 13 and puts her there; that
  bathroom's door is jammed and she opens it when the hero presses Open
  or Force on it (no hit, no noise): "Who's there?" -> dialogue). You hear her before you see her: a faint sob
  through the door when the hero is within 6 tiles
  (`survivors.roster.mara.hearTiles`). Her quest: fetch her **medical bag**
  from floor 14. The generator places the bag in the bedroom wardrobe of a
  flat on floor 14, and a found note in her bathroom names the flat ("Left
  my bag at the Novaks', 14. Couldn't go back."); the bag container is
  never empty. Hand-over: target Mara while carrying the bag -> Main
  *Give*. She
  joins only with a **free Survivor bed** in any claimed apartment ("I
  need a bed first.") and hero morale **25+** (`survivors.joinMinMorale`;
  else "You look worse than me. Come back when you've rested."). On
  success: quest done +10, recruited +15 morale, she moves into the
  apartment with the free bed (the main home's first, if it has one).

### 5.8 Attacks (M2: diegetic cue)
> When the main home is in the **HQ** (Stage C2+), the cue, schedule and
> strength below still apply, but **where** attackers go, how they break
> structures and how offline attacks resolve follow 5.20 instead of the
> front-door rules here.

- Scheduled every **8 h +/- 2 h** (`attacks.intervalHours`,
  `attacks.jitterHours`). First attack is scripted, **10 min** after the
  tutorial ends (C2: after New game, 11.3) (`attacks.firstAttackDelayMinutes`; skipping the tutorial
  counts as ending it): strength **15**, **2 crawlers**
  (`attacks.scripted`). No scheduled attack happens before it resolves; the
  first scheduled attack is 8 h +/- 2 h after it ends. Scheduled attacks
  are walkers (`attacks.scheduledZombieType`). Days survived = whole 24 h
  periods since New game.
- **Target**: always the **main home** (5.3) at the moment the cue starts.
  Attackers **come up the stairwell** to that floor, cross the landing and
  the corridor and go for its front door. Other claimed apartments are
  never attacked in M2.
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
    stairwell, positional at the landing of the main home's floor: loud if
    the hero is on that floor, fading out beyond **2 floors**
    (`cue.stairwellAudibleFloors`). From T-8 s the emergency light on the
    main home's landing flickers (`cue.flickerFromSeconds`; dips of 0.09 s,
    `attacks.tuning.flickerSeconds`). A nap in progress is interrupted here
    (5.2). Stairwell bangs play at **T-8, T-5 and T-2.5 s**
    (`cue.bangBeatsSeconds` [8, 5, 2.5]); the first beat must equal
    `cue.stairwellAtSeconds` (8). If the two differ, code uses
    `cue.stairwellAtSeconds` as the first beat.
  - **Bang falloff** (`cue.bangFalloff`): stairwell and door bangs (cue
    beats and fight bangs) fade with the straight-line distance d in tiles
    from the **hero** to the main home's front door (or to the landing for
    cue beats). Volume multiplier = 1 if d <= **10 tiles** (`nearTiles`);
    linear down to **0.3** (`minVolume`) at **30 tiles** (`farTiles`); 0.3
    beyond. It never reaches 0 on the home floor. It multiplies the floor
    fade above; beyond that floor range the bang is silent. Panning follows
    the audio rules (section 10).
  - **T-0**: the first attacker shambles up onto the **landing-end tile of
    the down flight** of the main home's floor (the stairs from below);
    more follow **3 s** apart (`attacks.tuning.spawnGapSeconds`), each on
    that tile or the nearest free landing tile. They are drawn only when
    Visible, like any zombie.
  - Nothing else changes: no music change, no UI change, moodles only
    react if Visible zombies see the hero (Panic).
- Online: ceil(A / 10) (`attacks.strengthPerZombie`) attackers path to the
  main home's front door. At most **3** hit the barricade at once
  (`attacks.maxAttackersAtDoor`): from the corridor tile in front of the
  door and the two corridor tiles diagonally beside it; the rest wait in
  the corridor behind them. Damage x0.4 (5.4). They keep hitting while the
  hero is anywhere; they only bite the active character if he is on that
  floor and they can reach him. An attacker that sees the hero aggroes and
  chases like any zombie, then returns to the door if it loses track.
  While attackers are banging on the barricade, a bang sound plays every
  **2-3 s** (random in `cue.fightBangGapSeconds` [2, 3]). A fallen
  barricade lets them in (the door behind it counts as broken open).
  Nothing on screen says an attack ended: it is over when the banging
  stops. A main home without a barricade: attackers bash its front door
  (door HP, 5.18), then come in.
- **Repelled online** (all attackers dead): +5 morale (silent) only if the
  barricade never reached 0 HP during that attack.
- **Scripted first attack check** (QA test): fists only, 1 tap per second,
  hero at the door when the first crawler arrives -> barricade ends at or
  above **100 HP** of 120 (crawlers deal 8 x 0.4 = 3.2 per 2.5 s each).
  The hero fights from inside: he opens nothing; he sees and hits
  crawlers through the barricade (a barricade blocks movement, not sight or
  weapon hits; zombies can bite through it too if he stands within 1.5
  tiles).
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
  shakes it 2 px and drops a few splinters. It is drawn on the door's
  inside; from the corridor the closed door shows splintering instead.

### 5.9 Death and game over
- Online death -> the screen slowly fades to black with the hero's
  breathing; then pass the torch (5.7). Game over screen shows days
  survived, floors reclaimed, zombies killed, objects salvaged; "New game"
  deletes the save.

### 5.10 Home systems
**Light** (M2)
- **Oil lamp** (placeable): *Use* -> Add fuel (holds **2 fuel**,
  `lamp.fuelSlots`), burns **1 fuel per 12 h** (`lamp.fuelHours`) online
  and offline. While burning, the tiles within **4 tiles**
  (`light.lampRadiusTiles`) that it has line of sight to are **Lit** (5.3):
  a warm pool that flickers +/-5% (`light.lampFlickerPct`). A closed door
  stops its light. Out of fuel = its tiles fall back to the room's light
  (reported: "The lamp in the kitchen burned out."). A lit lamp is seen
  from up to 9 tiles away (5.17), and it also makes the hero easier to see
  for zombies (Lit sight range, 5.4).
- **Comfort** (M2 subset): if any oil lamp burns in the main home, morale
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
- While lit, it lights tiles like a lamp (4 tiles; it counts toward the 4
  light pools per floor). Warmth gives comfort +1, and sleep energy regen
  gets **+30%** (`stove.sleepBonus`) for beds in that apartment. Stove
  recipes only work while it is lit.
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
  tune only while the hero is on that floor. It never plays during an
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
  (`power.generatorFuelHours`) while on, online and offline. It makes a
  recorded, uneven engine chug while running, audible only within 4 tiles
  (ambience only, not noise; never a tonal hum, section 10). While any generator is running
  in a claimed apartment, attacks are x**1.1**
  (`power.generatorAttackMult`, after the cap, 5.8). Out of fuel = off;
  the report says "The generator coughed and died."
- If demand > supply, the most recently built device switches off until
  supply returns. There is no power readout and no crossed-bolt icon: the
  device simply goes dark and silent, and its *Use* card says "No power."
  The music player and radio fall back to batteries from that stash, if
  any.
- **String lights** (WB 2, window or floor spot): light tiles like a lamp
  while powered. **Grow lamp** (WB 2, floor spot): planters and herb boxes
  in the same apartment get +50% speed while powered.

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
- Built with the Elevator repair recipe. Target the elevator door on any
  landing -> Main *Use* -> a list (96 px rows) of floors with a claimed apartment and
  Secured floors -> travel at **0.3 s per floor**
  (`elevator.secondsPerFloor`). It needs 2 free power in the main home,
  else "No power." It is noisy on arrival (noise radius 8 tiles on the
  arrival floor). Zombies never use it.

### 5.11 Gear and throwables
- **Throw** (M1, via the **quick-use slot**, section 4): put the
  throwable in the slot (long-press to pick). First tap arms: a faint iso
  ellipse shows the landing area at the auto-aimed point (nearest Visible
  zombie within **6 tiles**, `throw.rangeTiles`, +-30 degrees of facing,
  in line of sight; else up to 4 tiles straight ahead). A second tap
  within 3 s throws it (lands **0.5 s** later, `throw.landSeconds`);
  timing out, or tapping Main/Secondary, disarms and keeps the item. The
  old Throw bar button is removed.
- **Molotov** (M1): a fire patch on the target tile and its 8 neighbours
  (radius **1 tile**, `molotov.radiusTiles`) for **4 s**, **15 damage/s**
  to zombies inside, **10/s** to the hero. Loud. It lights its tiles (Lit)
  while burning. Fire never spreads and never damages objects, doors or
  barricades.
- **Switching type** (M3, once a second throwable type exists): pick it
  in the quick-use picker (long-press).
- **Noise lure** (M3): rings **3 s** after landing for **20 s**
  (`lure.delaySeconds`, `lure.ringSeconds`). Every non-aggroed zombie on
  that floor that can reach it shambles to it and waits there until it
  stops. Its ringing is the sound, with no marker. Single use. It can be
  thrown at a remembered tile within range (an exception to Visible: its
  default aim point may be a Remembered walkable tile straight ahead).
- **Flashlight** (M3, tool, carried): while it has charge, every tile in
  the hero's cone (not the close circle) up to **7 tiles** counts at least
  as **Grey** for the hero's vision (range and search time), and the cone
  angle uses the Grey value. The light also makes him visible: zombies use
  the Lit sight range (5 tiles) against him. It drains **1 charge per 30 s
  on** (`light.flashlightSecondsPerCharge`); a tap on its inventory icon
  toggles it. 1 batteries = **10 charges** (`light.flashlightCharges`),
  auto-loaded from carried batteries at 0.
- **Equipment** (M4): the Inventory screen has a **Body** and a **Feet**
  slot (not carry slots). Tap an item -> Equip / Unequip. Armor reduces
  each zombie hit by its percentage (rounded down) and loses 1 durability
  per hit taken. Broken armor disappears with a thought ("The jacket's
  done."). Condition is shown as a wear drawing, never a number.
  - **Padded jacket** (Body, 4 cloth + 2 tape, WB 1): damage taken -20%,
    40 hits. **Leather armor** (Body, 4 leather + 2 tape + 1 metal, WB 2):
    -35%, 60 hits.
  - **Quiet shoes** (Feet, 2 rubber + 1 cloth, WB 1, never wear out): all
    zombie sight ranges x**0.6** (`gear.quietSightMult`) and run noise
    radius 5 -> **3 tiles** (`gear.quietRunNoiseRadiusTiles`).
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
  every **Grey** tile becomes **Dim**, including in claimed apartments,
  unless Lit. Secured floors stay Grey (the hero has rigged their light).
  Dim and Dark tiles are unchanged. All zombie sight ranges are x**1.25**
  (`night.sightMult`; with Quiet shoes the 0.6 applies too). Zombie speed
  is x**1.15** (`night.zombieSpeedMult`). Attacks that start at night are
  x**1.2** (`night.attackMult`, after the cap, 5.8).
- **Night rewards**: each search has a **30%** chance of +1 loot roll
  (`night.bonusLootChance`). Sleep energy regen is **+20%**
  (`night.sleepBonus`, added to the stove's +30%).
- **Fairness**: nothing is locked by time of day. The flashlight and lamps
  cancel night Dim, so a night-only player pays only the zombie
  sight/speed and attack risk, and gets the loot bonus.
- **Offline**: each 10-min catch-up step uses the local hour of its own
  timestamp (offline night attacks also get x1.2). Fuel, power and
  production ignore the phase.
- **Show**: no HUD icon. Window light shafts vanish and windows show a
  near-black navy city (`#0e1118`) at night; unlit claimed apartments go
  dark. Rain sounds heavier. The first night, the hero thinks: "Night.
  They'll hear me from further away."

### 5.13 The dog (M3)
- A dog, **Scout**, is shut in a bathroom on **floor 18**. Faint whining
  plays (positional, through walls) while the hero is on floors 17-19.
  *Use* -> **Offer food** (1 canned food, dry snack or planter crop from
  carried items) recruits it at once, with no quest and no survivor bed.
  Zombies ignore the dog: it never takes damage, cannot be bitten and
  cannot die.
- **Buttons** on the targeted dog: Main **Pet**, Secondary **Follow /
  Stay home** (a toggle). Pet plays a wag animation and gives
  **+3 morale** (silent), once per **4 h** (`dog.petMorale`,
  `dog.petCooldownHours`); Pet taps in between only wag. When the app goes to
  background or on pass the torch, the dog goes to the main home, keeps
  its mode and stays with the new character. "Home" for the dog is always
  the **main home**; if the main home changes, a staying dog moves there
  the next time the app resumes.
- **Following**: walks 1-2 tiles behind the hero and uses stairs with
  them. When a zombie that is not Visible and not aggroed comes within **6
  tiles** on the same floor (`dog.growlRadiusTiles`), the dog stops,
  stares and growls. The growl is panned toward the zombie, and the
  zombie's silhouette is drawn for **2 s** (`dog.revealSeconds`), even
  through walls. This happens once per zombie per **15 s**
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
  no growls, comfort, cue or defense, and targeting it shows the thought
  "He's hungry." It stays hungry until fed (Main *Feed*). After **3** missed
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
  zombie at that tile (in their claimed apartment if they were there):
  Walker stats with **45 HP** (`infection.turnedHp`), in the hero's or
  survivor's faded clothes, holding the dropped bag; killing it drops the
  bag. The survivor-death morale -20 applies. The turn happens off-screen
  as a fade to black, with no gore.
- Mara's medical bag quest reward includes **1 antibiotics** from M3, so a
  cure always exists.

### 5.15 Floor plans and procedural apartments (iso rebuild)
Every new game builds floors 13-17 from **hand-drawn unit floor plans
("blueprints")** and **templates**, so each run is different to scout
while every room still looks designed. Data: `public/data/levels/
blueprints.json` (new, level-designer; path in `generator.blueprintsFile`)
and `public/data/levels/templates.json` (templates, room types, pools,
flavour lines, notes; level-designer). Numbers in `balance.generator.*`.

**Blueprint format** (level-designer, exact schema theirs; rules here)
- A blueprint belongs to one template and fits one slot size: apartment
  **12 x 10** tiles or small **6 x 10**. It is drawn for the **NW** slot
  (apartment, front door on its south edge, y = 10) or the **S** slot
  (small, front door on its north edge, y = 0), as 10 strings of 12 (or 6)
  characters: each character is the **room ref** of that tile (`a`-`z`),
  `#` = void (structure, not walkable, rare). Every room is one
  4-connected area.
- **Doorways**: listed edges between two rooms, each 1 tile wide; every
  room is reachable from the front door through doorways; at most **3
  interior doorways** per room (`generator.maxInteriorDoorwaysPerRoom`;
  the front door does not count, so a hallway may have 3 interior
  doorways plus the front door). The **front door** is one listed edge on
  the corridor side, into the template's `first` room (usually the
  hallway).
- **Windows** are not drawn: every room of a `light: "grey"` type must touch
  the unit's exterior edge (north edge for NW/NE, south for SW/SE, and the
  x = 0 / x = 30 floor ends where a slot touches them; small units only have
  their far edge). The generator puts **1 window per 3 exterior edge tiles**
  of that room, at least 1, centred (`generator.windowEveryTiles`).
  Counted **per exterior edge run**: each straight run of the room's
  exterior wall (e.g. its north run and its west run in a corner room) gets
  max(1, floor(run length / 3)) windows, spread evenly and centred on that
  run; runs are never summed across a corner. Example: a 5x5 NW corner
  bedroom has a 5-tile north run (1 window) and a 5-tile west run
  (1 window) = 2 windows. Blueprints that list windows by hand must follow
  the same count.
- **Room sizes** (tiles, inclusive, `generator.roomSizeTiles`; written
  short side x long side, min - max; a room fits if its short side and
  its long side are each inside their range): hallway 1x2 - 2x10; living
  4x4 - 6x7; kitchen 3x3 - 5x6; bedroom 3x3 - 5x6; kids_room 3x3 - 5x5;
  bathroom 2x2 - 4x5; studio 4x5 - 6x7; laundry 3x4 - 6x10; reception
  3x3 - 4x5; office 3x4 - 5x6; break_room 3x3 - 4x5; storage 3x4 - 6x9;
  janitor 2x2 - 4x5; utility 2x3 - 4x10. These ranges were widened to fit
  the hand-drawn blueprints, which fill the 12x10 / 6x10 slots with no
  dead space; they are a validation range for blueprints, not random
  sizes. **The hard rule is the area cap**: no room larger than **36
  tiles** (`generator.maxRoomTiles`), even where the ranges would allow
  it (e.g. a 6x7 studio = 42 is not allowed; 6x6 or 5x7 is). A blueprint
  failing the cap is invalid; one outside a range by a row is a warning
  to review. Claustrophobia rule: the 36-tile cap, hallways 1-2
  tiles wide, at least one 1-wide pinch (a 1-tile corridor or a doorway
  between two rooms with a door) on the way from the front door to the
  farthest room of every apartment.
- **At least 2 blueprints per template** (`your_flat` has exactly 1), so
  the same template doesn't always look the same.
- **Mirroring by slot side**: apartment blueprints are drawn for NW with
  the service riser (void column x = 11) against the stairwell core and
  windows on the W and N edges, so they can't mirror freely. Apartments
  are **x-mirrored in the east slots (NE, SE) and never in the west slots
  (NW, SW)**, so the riser always meets the core and the W windows land
  on the floor's exterior end. **Small units** (slot S, windows only on
  their far edge) mirror in x freely with chance **0.5**
  (`generator.mirrorXChance`, small units only). Every south slot (SW,
  SE) is also mirrored in y so the front door faces the corridor.
  Mirroring keeps the tile chars, doorways and the "mounted only on
  north/west walls" rule (recomputed after mirroring).

**Seed and saving**
- New game draws `worldSeed` (random 32-bit integer) and saves it. Each
  floor is generated deterministically from hash(worldSeed, floor number)
  at New game (all of floors 13-17 in M2). The generated layout is
  **saved** in full (unit slots, blueprint ids and mirroring, rooms,
  doors and their states, windows, objects with tiles and facing, zombies,
  notes); after that only the save is used, so data edits never change a
  running game. Per-floor **tile memory** (5.17) is saved as a bitset.
- Ids: objects `f<floor><slot>-<x>.<y>` with x, y the unit-local tile of
  the object's first footprint tile after mirroring (e.g. `f14NE-5.3`);
  doors and window edges `f<floor><slot>-<x>.<y>.<N|W|S|E>`.
- **Stage B data** (11.3) uses the same saved-layout format, authored by
  the level-designer (by hand or with a script following these rules) in
  `public/data/levels/floors_iso.json`, so Stage C swaps authored data for
  generated data without changing the game code.

**Generation steps per floor**
1. **Pick a template per slot**: apartment slots (NW, NE, SW, SE) from
   apartment templates, slot S from small templates, by weight, with: at
   most 1 of each apartment template per floor
   (`generator.maxSameTemplatePerFloor`); at least **2 flat-type units**
   per floor not counting the start flat (`generator.guarantees.
   minFlatUnitsPerFloor`); fixed overrides: floor 15 NW = `your_flat`
   (`generator.startFlatTemplate`); floor 13 has one flat with a bathroom
   for Mara; floor 14 has one flat with a bedroom for the bag.
2. **Pick a blueprint** of that template (uniform) and its mirroring.
3. **Pick a condition** per unit by weight (`generator.conditionWeights`):
   **normal 60**, **ransacked 30**, **burned 10**. The start flat is
   always normal; offices and service units are never burned in M2.
4. **Window dressing**: every window edge gets a **window pane** (always,
   except burned units: broken, no pane) and **curtains** with chance
   **0.5** (`generator.curtainChance`). Window panes and curtains in old
   pools are ignored.
5. **Fill objects** per room (room type table below): first its "always"
   objects, then **wall picks** = floor(wall tiles / 3)
   (`generator.wallTilesPerPick`) and **floor picks** = floor(room area /
   6) (`generator.floorTilesPerPick`), each placed with chance **0.6**
   (`generator.slotFillChance`) by a weighted pick from that layer's pool.
   Pool items marked "max 1" appear once per unit.
   - **Wall layer**: a tile with a wall edge on the room's perimeter (not a
     doorway or window edge); the object backs onto that wall and faces
     into the room. Mounted objects (`iso.mountedObjects`) take a north/west
     wall edge instead and leave the tile free.
   - **Floor layer**: any free tile; prefer tiles with no wall edge.
   - **Placement rules** (a candidate tile failing any rule is skipped and
     the next random candidate tried; after 10 failures the pick is
     dropped, `generator.placementTriesPerPick`): (a) the whole footprint lies inside the room on free tiles;
     (b) both tiles touching any doorway, front door or window edge stay
     free (`generator.doorwayClearanceTiles` 1; windows: only the tile in
     front of a window spot); (c) every object has an **access tile**: a
     free walkable tile orthogonally adjacent to its front (wall objects:
     the tile in front of its face; floor objects: any side); (d) after
     placing, all doorways of the room and all access tiles stay connected
     by walkable tiles (flood fill); (e) at most one object per tile.
   - Facing: wall objects face away from their wall; beds and sofas are
     wall-layer with the short side (head/arm) or long side against the
     wall as the footprint allows; floor objects face the room's centre.
6. **Doors**: each internal doorway gets an interior door with chance
   **0.5** (`generator.interiorDoorChance`); a door starts **closed** with
   chance **0.6** (`generator.doorClosedChance`). Front doors always exist
   and start closed; **25%** are jammed (`generator.frontDoorJammedChance`).
7. **Apply condition**: *ransacked*: each non-"always" object removed with
   chance 0.3 (`objectRemoveChance`), containers 70% empty, drawn with
   open drawers and papers on the floor, interior doors start open;
   *burned*: each object becomes Burned furniture with chance 0.7
   (`charChance`), windows broken (rain noise louder), walls soot-black,
   containers 85% empty.
8. **Zombies** per unit by distance from floor 15
   (`generator.zombiesPerUnitByDistance`): floor 15 **0-1**, 14/16 **0-2**,
   13/17 **1-2**; at most **6** per floor (`generator.zombiesPerFloorCap`);
   never in the start flat; never within **2 tiles** of a unit's front
   door (`generator.zombieNoSpawnTilesFromFrontDoor`); max **3** per room
   (`generator.maxZombiesPerRoom`); with chance **0.5**
   (`generator.groupChance`) a zombie joins the previous zombie's room on a
   neighbouring tile. Type by weight: crawler **30**, walker **70**
   (`generator.zombieTypeWeights`). Room choice weighted by the room type's
   `zombieWeight`. Encounter targets (5.4) are enforced; a failed rule
   re-rolls the room.
9. **Guarantees** per floor, fixed by swapping or editing after filling:
   at least **1 food item** in a container (a kitchen cupboard or fridge
   gets fixedLoot 1 canned food or dry snack; never empty)
   (`guarantees.minFoodItemsPerFloor`), not in the start flat; at least
   **1 drainable water source** (`guarantees.minDrainableWaterPerFloor`;
   every bathroom has a toilet tank, so the flat guarantee covers it).
10. **Notes**: 1-2 found notes per floor (5.16) in containers that fit them.

**Unit templates (M2: 6 apartment + 3 small + the start flat)**

| Template id | Slot | Name | Rooms (refs, types) | Weight | Type |
|---|---|---|---|---|---|
| `your_flat` | apartment | Your flat | hallway, living, kitchen, bedroom, bathroom; one authored blueprint and authored objects (tutorial, section 8) | - | flat |
| `family_flat` | apartment | Family flat | hallway (first), living, kitchen, bedroom, kids_room, bathroom; kitchen next to living | 25 | flat |
| `couple_flat` | apartment | Couple's flat | hallway (first), living, kitchen, bedroom, bathroom | 25 | flat |
| `shared_flat` | apartment | Shared flat | hallway (first), kitchen, bedroom x3, bathroom | 15 | flat |
| `elderly_flat` | apartment | Old couple's flat | hallway (first), living, kitchen, bedroom, bathroom; bedroom next to bathroom; containers favour medicine, tins, seeds | 13 | flat |
| `office` | apartment | Small office | reception (first), office x2, break_room, bathroom | 6 | office |
| `studio` | small | Studio | hallway (first), studio, bathroom | 40 | flat |
| `laundry_room` | small | The building's laundry | laundry (first), janitor | 30 | service |
| `storage_utility` | small | Storage and boiler rooms | storage (first), utility | 30 | service |

(The side-view `studio_laundry` template is split into `studio` and
`laundry_room`. "Next to" means sharing a doorway; the blueprint must
respect it.)

**Room types** (`light`: grey = has windows, dim, dark; "F" = floor layer,
"W" = wall layer; mounted objects marked m):

| Room | Light | Always | F pool (weight) | W pool (weight) |
|---|---|---|---|---|
| hallway | dim | - | potted_plant 2 | chair 2, toolbox 1 (max 1), oil_lamp 1 |
| living | grey | sofa (W) | table 3, chair 3, potted_plant 2 | tv 2 (max 1), oil_lamp 1 |
| kitchen | grey | fridge (W), kitchen_cupboard (W) | table 2, chair 2 | kitchen_drawer 3, microwave 2 (max 1), kitchen_cupboard 2, sink_pipes 2 (max 1) |
| bedroom | grey | bed_frame (W) | chair 1 | wardrobe 3 (max 1), mattress 1, oil_lamp 1 |
| kids_room | grey | bed_frame or mattress (W, 60/40), toy_box (W) | - | toy_box 1 (max 2) |
| bathroom | dim | toilet_tank (W), bathroom_cabinet or medicine_cabinet (m, 50/50) | laundry_basket 2 | sink_pipes 2 (max 1), water_heater 1 (max 1), bathroom_cabinet m 1 (max 1) |
| studio | grey | bed_frame or mattress (W), sofa (W), kitchen_cupboard (W), fridge (W) | table 2, chair 2, potted_plant 1 | kitchen_drawer 2, tv 1 (max 1) |
| laundry | dark | washing_machine x2 (W) | laundry_basket 3 | washing_machine 2, utility_shelf 2 |
| reception | grey | desk (W) | chair 3, potted_plant 2 | sofa 1 |
| office | grey | desk (W) | chair 2, potted_plant 1 | filing_cabinet 3 |
| break_room | dim | kitchen_cupboard (W), table (F) | chair 3 | fridge 1 (max 1), microwave 2 (max 1), kitchen_drawer 2 |
| storage | dark | storage_cage on every second wall tile | - | utility_shelf 2 |
| janitor | dark | utility_shelf (W) | laundry_basket 1 | toolbox 2 (max 1), utility_shelf 1 |
| utility | dark | water_heater (W) | - | toolbox 2 (max 1), storage_cage 1, utility_shelf 2 |

Rules: a "max N" limit is per unit and counts "always" copies; a pool
weight of 0 means not placed in M2. Doors and windows are not pool
objects. Burned units replace objects after the pick, keeping footprints
and tiles as charred shapes.

**Generator edge rules (M2)**
- **Fixtures**: the start flat's **workbench** (1x2) is a fixture, not a
  salvage object. It occupies its tiles, has only *Use* (open crafting),
  cannot be searched, dismantled, removed, charred or emptied, and is not
  listed in `balance.objects`. Workbenches built later from the recipe
  (5.6) are crafted placeables and follow the placeable rules.
- **Condition exemptions**: these are never removed, charred or made empty
  by a condition pass: any object holding `fixedLoot` (the per-floor food
  guarantee container, Mara's note cabinet, the Novak wardrobe with the
  medical bag), the guaranteed toilet tank (water), the start flat (always
  normal) and fixtures.
- **Mara's unit** (floor 13) rolls only **normal or ransacked**, never
  burned; her bathroom has no zombies and a jammed interior door.
- **Start flat food**: exactly **1 canned food** (fridge fixedLoot), as in
  the tutorial (section 8). The start flat does not count toward the
  per-floor food guarantee; another floor 15 unit holds it.
- **Storage cages stay crowbar-only** (no slow or loud hand-opening). The
  first time the hero presses the greyed Search on a padlocked cage
  without a crowbar, the thought "Padlocked. A crowbar would do it." shows
  (once per game); later presses show the toast "Needs crowbar", no
  action. A jammed front door can
  still be bashed open by hand (`world.jammedDoorHits`).
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
  when the hero first steps through its front door, as small text at the
  bottom of the screen for 4 s: "The TV is still on standby. Nobody's
  watched it in a week.", "Toys lined up by the door, as if someone was
  coming back."
- Hero **thoughts** replace tutorial arrows and most toasts: one short line
  in italics at the bottom ("I need to eat something.", "The door won't
  hold like this."). Max one every 20 s; never more than one line.

### 5.17 Vision: field of view, shadows and memory (new, iso rebuild)
The hero sees only what his eyes reach. Keys `vision.*`.

**Tile vision states** (per floor, per tile):
- **Visible**: seen right now. Drawn in full with its light (section 9);
  zombies, survivors, decals, fire and moving things on it are drawn.
- **Remembered**: was Visible before, not now. Drawn darkened and
  desaturated: floor, walls, doors (in the state last seen), windows and
  objects (in the state last seen: searched = ajar, dismantled = gone).
  **Zombies, corpses, decals and fire are never drawn on Remembered
  tiles.** Remembered things are not targets until they are Visible
  again (in reach they always are, through the close circle). Memory is
  saved and never fades in M2.
- **Unknown**: never seen. Drawn near-black `#0b0c0e` (alpha 1). Nothing on
  it is drawn or targetable.
- A wall edge or door is drawn in the best state of its two neighbouring
  tiles. At New game, the start flat's tiles are Remembered; claiming a
  unit makes its tiles Remembered.

**What is Visible**. A tile T is Visible if there is **line of sight** from
the hero's tile to T and either:
- **close circle**: T is within **1.5 tiles** (`vision.closeRadiusTiles`;
  all 8 neighbours, in every direction, any light), or
- **cone**: the angle between the hero's facing and the direction to T is
  within half the **cone angle**, and T is within the **view range**.
  - Cone angle, by the light of the **hero's own tile**: Lit **120**, Grey
    **110**, Dim **90**, Dark **70** degrees (`vision.coneDegrees.*`),
    minus the Panic tunnel-vision penalty (5.2), never below 40.
  - View range, by the light of the **target tile** T: Lit **9**, Grey
    **7**, Dim **4**, Dark **2.5** tiles (`vision.rangeTiles.*`), minus **1**
    while Tired is L3+ (`vision.tiredRangePenaltyTiles`). So a lamp-lit
    room is seen from far down a dark corridor, but a dark corner a few
    steps away stays black.
  - Hard cap **9 tiles** (`vision.maxRangeTiles`) for performance.
- **Soft edges**: tiles in the outer **1 tile** of their range
  (`vision.edgeFadeTiles`) or within **10 degrees** of the cone edge
  (`vision.edgeFadeDegrees`) are Visible but drawn with the "edge" overlay
  (section 9). Zombies on edge tiles are drawn (they are Visible).

**Line of sight (shadow casting)**. Only **walls, closed doors and jammed
doors** block sight (chosen for performance: furniture, barricades and
characters never block; tall objects only fade, section 2).
- Test: the exact straight segment (in grid space) from the centre of the
  viewer's tile (x + 0.5, y + 0.5) to the centre of T. LOS is blocked if
  the segment crosses a blocking edge. If it passes exactly through a grid
  corner, it is blocked when **ANY** of the 4 edges meeting at that corner
  blocks: walls have thickness, so there is no peeking diagonally past a
  wall end or a door jamb, and no seeing through diagonal gaps.
  The blocking edges of T itself (its own far walls) don't hide T: walls
  are seen from inside.
- Windows are wall edges and block sight (the outside is not part of the
  game); open doorways and open doors don't.
- The same LOS test is used for zombie sight (5.4), attacks (5.4), lamp
  light (5.3), throws (5.11).
- **Recompute** when the hero changes tile, when his facing changes by
  15 degrees or more (`vision.recomputeTurnDegrees`), when a door, barricade
  or lamp changes state, at most **10 times per second**
  (`vision.recomputeMaxHz`). Zombie visibility (on a Visible tile or not)
  is re-checked every frame against the latest result.
- Edge cases: standing in a doorway tile, the hero sees into both rooms
  (normal LOS). Closing a door makes the tiles beyond it Remembered at the
  next recompute. A zombie stepping from an Unknown tile onto a Visible one
  pops in with a 0.15 s fade, never instantly.

**Hearing what you can't see** (audio in section 10; the only visual hint
is the sound ripple below, no icons or markers):
- Every zombie within **12 tiles** (`audio.zombieHearRadiusTiles`) on the
  hero's floor makes occasional shuffles and low breaths every **4-9 s**
  (`audio.zombieSoundGapSeconds`), panned by its screen position and
  **muffled** (low-pass, x0.5 volume, `audio.occludedVolumeMult`) when the
  hero has no line of sight to it. Zombies banging on doors are heard
  within **15 tiles** (`audio.doorBangHearTiles`). At most **3** zombie
  voices play at once, nearest first (`audio.maxZombieVoices`).
- A door that a zombie pushes or bangs **rattles visibly** if the door is
  Visible or Remembered (it is the door that moves, not a marker).
- Unseen zombies never raise Panic and never interrupt actions until they
  see the hero.

**Sound ripple** (for players with the sound off; always on, not a
setting; CD decision, 12) (`vision.soundRipple.*`):
- **Triggers**: a sound event whose noise level is **Noisy or Loud**
  (`minNoise: "noisy"`), whose source is on the hero's floor, inside that
  sound's own hearing range (door bangs 15 tiles, `audio.doorBangHearTiles`;
  everything else 12 tiles, `audio.zombieHearRadiusTiles`), and whose
  source tile is **not Visible** (Remembered and Unknown both count). The
  hero's own sounds (running, salvage, door breaking, throws) never ripple.
- **Sounds that count** in M2: a zombie banging or pushing a door (Loud);
  a zombie's aggro groan (Noisy); attack-cue bangs on the home front door
  and the attack groans (Loud), only while the hero is on the home floor;
  a molotov burst or a door breaking caused by something other than the
  hero (Loud). Zombie shuffles and breaths are Quiet and **never** ripple.
- **Look**: a soft dark arc (overlay colour, no icon, no text) drawn just
  outside the edge of the vision area in the direction of the source from
  the hero. Arc width **40 degrees** (`arcDegrees`), thickness **0.4
  tiles** (`thicknessTiles`). If the direction is inside the cone, the arc
  sits at the cone's range edge for the current light; if it is outside
  the cone (behind or to the side), it sits on the close circle's edge
  (1.5 tiles). The arc drifts **0.5 tiles** outward (`driftTiles`) while it
  plays.
- **Timing**: fade in **0.15 s**, hold, fade out; total **0.9 s**
  (`fadeInSeconds`, `durationSeconds`). Peak alpha **0.25** for Noisy and
  **0.4** for Loud (`alpha.noisy`, `alpha.loud`), times x0.6 when the
  source is more than 8 tiles away (`farTiles`, `farAlphaMult`).
- **Limits**: at most **2** ripples on screen (`maxActive`, newest replaces
  oldest); the same source can ripple at most once every **1.5 s**
  (`sameSourceCooldownSeconds`), so a door being banged pulses with the
  bangs, not continuously. A ripple stops early if its source becomes
  Visible.
- **Edge cases**: ripples show during actions and panels with the
  world dimmed, but not during a full-screen menu or while the game is
  paused. They never raise Panic, never interrupt actions, and never show
  sounds from other floors.

**Interplay**
- **Stealth**: you see zombies' facing only when they are Visible; a
  zombie facing away inside your cone is the opening for an unaware x3
  hit. Zombies use the same walls and doors to block their own sight, so
  closing a door hides you both ways.
- **Moodles**: Panic narrows the cone (5.2); Tired L3+ shortens the range.
- **Light**: lamps and (M3) the flashlight extend what you see but make you
  easier to see (5.4, 5.11). Night (M3) turns Grey to Dim.
- **Actions**: while searching or dismantling the hero faces the object,
  so his back is exposed. The only way to look without cancelling is the
  stick **double tap** (turn around, section 4): he keeps working facing
  the other way and the progress ring stays. Moving the stick cancels the
  action (50% rule, section 4).

### 5.18 Doors and claustrophobia (new, iso rebuild)
**Doors** (keys `doors.*`)
- **Kinds**: interior doors (salvage, 5.6 #9), front doors (one per unit;
  not salvage; barricade spot when claimed), the propped stairwell fire
  door (always open in M2), the dead elevator door (not usable in M2).
- **States**: open, closed, jammed (front doors 25%, Mara's bathroom),
  broken (permanently open, cannot be closed; a broken interior door can
  still be dismantled for **2 wood**, `doors.brokenYield`).
- **Hero**: a targeted closed door -> Main **Open** in **0.4 s**
  (`doors.openSeconds`, quiet: a creak, not noise), or just push into it
  with the stick (section 4). A targeted open door -> Main **Close** (0.4 s,
  `doors.closeSeconds`, quiet); Secondary Dismantle / Claim / Leave (table
  in section 4). A door cannot close while anyone (hero, zombie, survivor)
  has their centre on one of the two tiles it touches (Close is greyed;
  toast "Something's in the way."), so he closes it from one step back
  (reach 1.2 tiles to the door edge). Walking or running paths go through
  closed, unjammed doors: the hero opens them on the way (0.4 s each) and
  **does not close them behind him**. A door opened by running bursts
  open: Noisy, radius **4 tiles** (`doors.runOpenNoiseTiles`).
- **Sight**: closed and jammed doors block sight (5.17); open, broken and
  barricaded doors don't.
- **Zombies cannot open doors.** A zombie whose path to the hero, his last
  seen tile or a noise crosses a closed door may path around it: a closed
  door costs **+10 tiles** in zombie pathing (`doors.zombiePathDoorCost`).
  If the door is still the best way, it stands at the door and **bangs**:
  each attack interval deals its damage x**0.4** (`doors.zombieDamageMult`)
  to the door. Door HP: interior **60** (`doors.interiorHp`), front door
  **120** (`doors.frontHp`). At 0 the door bursts (state broken). One
  walker breaks an interior door in about 24 s. A zombie bangs only while
  aggroed (until it loses track, 5.4) or for **10 s** after it reached a
  noise (`doors.noiseBangSeconds`); then it gives up and returns. Door
  damage is not repaired in M2 and is shown in 3 stages by HP ratio
  (intact above 0.66, splintered above 0.33, hanging above 0;
  `doors.visualStages`), never as numbers. **From Stage C2** doors use the
  4 structure damage stages instead (`structures.damageStages`, 5.20) and
  HQ doors can be repaired.
- **Front doors**: closed at New game; a targeted jammed one shows Main
  **Open** ("It's stuck.") and Secondary **Force** (3 hits, or 1 s with a
  crowbar, 5.3; Attack also hits it). A claimed unit's
  barricade sits on the inside of its front door (5.8).
- **Saved**: every door's state and damage.

**Claustrophobia rules** (design checks for level data, art and code)
- **Tight spaces**: corridor 2 tiles wide; apartment hallways 1-2 wide; no
  room over 36 tiles; a 1-wide pinch on the way into every apartment
  (5.15).
- **Doors you must open**: front doors start closed; 60% of interior doors
  start closed; you don't see what's behind a closed door until you open
  it, and opening it is a commitment (0.4 s, facing the doorway).
- **Darkness at the edges**: a screen-space **vignette** from 55% of the
  half-diagonal to the screen edge, up to alpha **0.65** at the corners
  (`vision.vignette.innerRadiusRatio`, `outerAlpha`), always on in the
  world view (not on panels).
- **Limited view distance**: at most 9 tiles, usually 4-7 (5.17).
- **No minimap, no map screen, no floor overview.** The only map is your
  memory of seen tiles; the camera can be panned over it.
- **One floor at a time**: nothing of other floors is drawn; you hear them
  only (attack cue, distant thuds).
- **Sound over sight**: zombies are heard through walls before they are
  seen.

### 5.19 Headquarters and building (Stage C2; CD direction "Floor 15 sandbox")
Floor 15, once cleared, becomes your **HQ**: you can knock down interior
walls, merge flats and build new walls, doors and windows anywhere on its
grid. Outer walls and the stairwell stay solid. Keys `hq.*`, `build.*`,
`structures.*`.

**Claiming the HQ**
- **Trigger**: floor 15 is **Cleared** (no living zombie anywhere on floor
  15: units, corridor, landing; wanderers count). The first time this
  happens the hero thinks "This whole floor could be mine." From then on
  the propped **stairwell fire door** (the core doorway, x 14-15), targeted
  from the corridor or the landing, shows Main **Claim the floor** (key
  icon, **5 s**, `hq.claimSeconds`, quiet, interrupted like Claim). While
  floor 15 is not Cleared it is greyed: "Something is still moving here."
  Claiming once is permanent; a later breach or wanderer does not undo it.
- **What becomes HQ**: every unit of floor 15 plus the corridor (all
  floor 15 tiles except the stairwell core: landing, flights, shaft). HQ
  counts as **1** claimed apartment (`hq.countsAsClaims`); the start flat
  and any floor 15 unit claimed before merge into it, freeing their claim
  slots (so the hero can then hold HQ + 2 apartments elsewhere). Floor 15
  counts as **Secured** (+5 defense) without the recipe
  (`hq.countsAsSecured`). All HQ tiles become Remembered. Wanderers never
  spawn inside HQ; they may still spawn on the floor 15 landing.
- **Stashes**: existing stashes stay where they are; every merged unit
  without one gets a **20-slot** stash (`hq.newUnitStashSlots`) by the 5.3
  placement rule. Inside HQ, crafting, building and Store all treat **all
  HQ stashes as one pool** (carried items first, then stashes nearest by
  path). The Bag shows one "HQ" tab listing each stash as a section.
- **Beds and the heart**: any bed or mattress in HQ can be slept in. When
  the bed last slept or napped in is in HQ, **the main home is the HQ** and
  that bed is the **heart** (the attack target, 5.20).
- HQ can't be unclaimed (no Leave this place). Floor 15 front doors become
  ordinary HQ doors (keep their HP and any barricade).
- Thought on claim: "Floor 15. Mine."

**Edges** (data model; every wall, door and window sits on a tile edge, 2)
- Every edge has a **kind**, fixed at generation from the floor plan:
  `exterior` (floor boundary, incl. its windows), `shaft` (walls of the
  stair flights and elevator shaft, edges touching void), `perimeter` (the
  14 landing edges below), `block` (generated walls between two units and
  between a unit and the corridor), `partition` (generated walls between
  rooms of one unit), or `open`.
- Each edge holds at most one **piece** (wall, door, window, or nothing =
  **gap**) and at most one **overlay** (boards, plating, barricade; 5.20).
  A piece has a type, a **tier** and HP.
- **HQ perimeter** (`hq.perimeterEdges`): every edge between a stairwell
  tile and a **walkable** non-stairwell tile of floor 15. On the authored
  floor 15 (`floors_iso.json`) that is **10 edges**: landing/corridor
  x 12-17 at y = 10 (6 edges, incl. the 2-edge **gate** at x 14-15,
  `hq.gateEdges`) and landing/NW unit at x = 12, y 6-9 (4 edges). The
  landing's east side (x = 18, y 6-9) faces a **void** column (x = 18,
  y 0-9; the NE unit starts at x = 19), so those edges are **void edges**,
  not perimeter: treated like shaft edges (no target, never built on,
  never broken; nothing can stand on the far side). Stage C's generator
  derives the list with the same rule. The **8 non-gate** perimeter edges
  start as block walls; the gate starts as a gap with the propped fire
  door frame (cosmetic, never closes).

| Edge kind | Player demolishes | Player builds / upgrades / overlays | Zombies can break |
|---|---|---|---|
| exterior | never | overlays on exterior windows only | never before M4 (climbers) |
| shaft, void (edge onto a void tile) | never | never | never |
| perimeter, non-gate (8) | never: "Load-bearing. Leave it." | repair, plating; if broken to a gap: **rebuild** a wood wall, then upgrade it back up to block. Never a door or window. | yes |
| gate (2) | yes | anything | yes |
| block, partition, built pieces, doors, gaps | yes (sledgehammer) | **inside HQ only** | yes |

Outside HQ (any floor) the player may **only demolish** (that is how
concrete blocks are gathered); nothing is built outside HQ except the
existing workbench placeables and front-door barricades (5.6).

**Build mode** (joystick and context buttons only; the world is still not
touch-interactive)
- **Toggle**: the **Build** icon (trowel) in the top bar (6th icon,
  section 4) shows while the hero is inside HQ or carries a hammer,
  sledgehammer or fire axe. Tap toggles build mode (plate shows pressed
  alpha while on). It turns off on a floor change, sleep/nap, death or a
  second tap. Opening a panel does not end it.
- **Targets in build mode**: zombies still beat everything (Main shows
  Attack, section 4). Objects are **not** targets; the only other target
  is the **edge cursor**. Placeables still use the workbench placement mode
  (5.6), which turns build mode off while it runs.
- **Edge cursor**: the hero's grid facing is snapped to the nearest of the
  4 grid directions (N = -y, E = +x, S = +y, W = -x); the snapped side is
  kept until the facing is more than **55 degrees** from it (45 + **10**
  hysteresis, `build.facingSnapHysteresisDegrees`). The target edge is the
  edge **on that side of the hero's current tile** (always within 1 tile,
  so always in reach). The turn-in-place band (section 4) is the aiming
  tool: turn without stepping to pick another side. Feedback: an existing
  piece gets the dark target outline; a gap shows a ghost of the selected
  piece at alpha **0.5** (`controls.target.ghostAlpha`) only if Main would
  build it. Shaft edges and exterior walls without a window give no target
  (both buttons empty).
- **Piece selector**: in build mode the **Quick-use** button shows the
  selected piece; a tap opens a picker row (as the quick-use picker, 96 px
  cells): **wall, door, window, boards, plating, barricade**
  (`build.pieces`; default wall). Tap a cell to choose. Saved as
  `build.selectedPiece` in game state. Quick-use items can't be used in
  build mode (leave it to eat or throw).
- **Main** (first rule that applies, icon = the action; greyed reasons as
  toasts):
  1. Piece or overlay below full HP -> **Repair** (overlay first).
  2. Gap + selected **wall** -> **Build** wood wall. This includes a
     **broken perimeter edge** (a zombie breach, online or offline, leaves
     a gap): rebuilding it counts as reinforcing, so the CD's
     reinforce-only rule (H3) allows it; normal wood wall cost, time and
     tools, then Upgrade (rule 3) to sheet metal and block. The edge stays
     a perimeter edge (no demolish, no fit). Gap + door/window ->
     greyed "Needs a wall first." Gap + overlay -> greyed "Nothing to
     cover."
  3. Wall + selected **wall** -> **Upgrade** to the next wall tier (5.20);
     at top tier greyed "Can't go higher."
  4. Wall + selected **door** or **window** -> **Fit door / Fit window**:
     replaces the wall with a wood door / glass window; returns **50%** of
     the wall tier's build cost rounded down (`build.fitRefundRatio`;
     generated walls: partition nothing, block 2 concrete blocks). Needs
     hammer **and** sledgehammer; uses **1 sledgehammer use**
     (`build.sledgehammerUsesPerFit`; cutting the opening is part
     demolition) and never wears the hammer. Not on perimeter walls ("Load-bearing.
     Leave it.").
  5. Door + selected **door** -> **Upgrade** the door tier.
  6. Piece + selected overlay that fits it (5.20) and no overlay yet ->
     **Add boards / plating / barricade**; an existing overlay -> greyed
     "Already covered." (Barricade Lv1 -> Lv2 counts as Upgrade.)
  7. Anything else -> greyed "That won't go there."
  Doors and windows only ever exist **on wall edges** (fitted into a wall);
  a door or window demolished leaves a gap.
- **Secondary**: **Demolish** (overlay first, then the piece). Greyed
  "Needs sledgehammer" / "Load-bearing. Leave it." / "Nothing here."
- **Costs and tools**: building, upgrading, fitting and repairing need a
  carried **hammer** (`build.requiresTool`); materials come from carried
  items then the HQ stash pool and are taken **at completion** (a cancelled
  action costs nothing). Missing materials: greyed "Needs 6 wood" (one
  missing material named). These are **timed actions** under the section
  4 rules (stick creep+ cancels, 50% rule, Attack cancels, a zombie seeing
  him interrupts). Light multiplies the time (Dim x1.5, Dark x2).
- **Energy and noise**: build/upgrade/fit/repair **2 energy**, **Noisy** (8
  tiles); demolish **3 energy** (block walls **5**), **Loud** (whole
  floor). Noise never reaches other floors (guns are the exception, 5.21).
- **Blocked**: greyed "Something's in the way." when any character's
  centre is within **0.4 tiles** of the edge (`build.edgeClearTiles`), the
  edge runs **inside** a multi-tile object's footprint (bed, table...), or
  a mounted object, curtains or window pane hangs on it (dismantle it
  first).
- **Sealing yourself in** (warn only): if a build or upgrade would leave
  no hero-passable route from the heart (or, with no heart in HQ, from the
  hero's tile) to the landing (doors and own barricades count as passable;
  windows and walls do not), the first tap shows "That seals you in." and a
  second tap within **2 s** confirms (`controls.buttons.confirmSeconds`).
  It is allowed: he can always demolish his way out.

**Demolition**
- **Tools**: the **sledgehammer** demolishes anything demolishable, 1 use
  each of **30** (`build.sledgehammerUses`, `sledgehammerUsesPerDemolish`
  1); fitting a door or window also costs 1 use (rule 4 above). Build,
  upgrade and repair cost no uses. The use is spent at completion. The **fire axe** demolishes
  partition walls, wood walls, doors, windows and boards only, at **x1.5**
  time and **5** weapon durability each (`build.fireAxe*`). The crowbar
  still dismantles interior doors (5.6) but not walls.
- Times, yields and HP per piece: 5.20 tier tables
  (`structures.*.demolishSeconds`, `yield`). Overlays come off as a
  separate demolish with their own time and yield. Yield goes to the bag;
  what doesn't fit drops as a material pile on the hero's tile.
- **Result**: the edge becomes a gap at once. Built pieces broken by
  zombies (HP 0) also become gaps (a broken stub sprite) and yield
  nothing.
- Demolition works on **any floor** (including front doors of unclaimed
  units, which then stay open for good). Claimed units on other floors:
  only their interior edges.

**Grid, rooms, vision and pathing after a change**
- **Rooms are recomputed** on the changed floor after every edge change: a
  room is a 4-connected set of tiles not separated by a wall, door or
  window piece (gaps don't separate). Cutaway (2), "the room the hero
  stands in" and comfort checks use the recomputed rooms.
- **Light and footstep surface stay per tile**, fixed at generation from
  the tile's original room type (5.3, 10). Knocking out a wall doesn't
  change a tile's light; lamps light through the new gap by LOS.
- **Vision** recomputes (5.17 already recomputes on door changes): walls,
  closed doors and **plated or boarded windows** block sight; glass
  windows (built, interior) do **not** block sight or sound but block
  movement; gaps block nothing.
- **Pathing**: the A* graph updates at once for the hero's Home auto-walk,
  survivors and zombies; zombie structure costs in 5.20.
- **Rendering**: the floor's static wall layer is re-baked (section 9
  already re-bakes on object changes); new art: wall tiers, door tiers,
  glass window, boards, plating, broken stub (section 9 style).

**Save** (**no reset at Stage C2**: the floor 15 layout is unchanged and
the new fields are additive, so Stage A saves keep working. A save without
them loads with `edges` empty for every floor, `hq` `{ claimed: false }`,
`build.selectedPiece` "wall"; if floor 15 is already Cleared on load the
"This whole floor could be mine." thought fires once and Claim the floor
is offered. Only a change to the authored layout or an incompatible
field forces the "The building has changed." reset.)
- Per floor `edges`: an override map holding **only edges that differ from
  the generated layout**, keyed canonically as the **N or W edge of a
  tile**: `"<x>.<y>.N"` (between (x, y-1) and (x, y)) or `"<x>.<y>.W"`
  (between (x-1, y) and (x, y)). Value: `{ piece: "wall"|"door"|"window"|
  "gap", tier, hp, overlay: { kind, level?, hp } | null, door: { state } |
  null }`. Edge kind is never saved (derived from the plan).
- `hq: { claimed, claimedAt }`, `build.selectedPiece`, per-weapon
  `magazine` counts and the gunshot attack bonus (5.21).

### 5.20 Reinforcement, traps and HQ attacks (Stages C2-C3)
**Wall tiers** (`structures.walls.<tier>`; upgrades go up one tier, never
refund; build on a gap always makes a wood wall)

| Tier | HP | Defense | Cost (build / upgrade) | Build s | Demolish s | Demolish yield | Repair (per unit) |
|---|---|---|---|---|---|---|---|
| Partition (generated only) | 80 | 4 | - | - | 6 | 1 wood + 1 metal | 1 wood / 20 HP |
| Wood | 150 | 10 | 6 wood + 1 metal | 6 | 4 | 3 wood | 1 wood / 20 HP |
| Sheet metal | 320 | 20 | 3 sheet metal + 1 metal | 8 | 8 | 3 wood + 1 sheet metal | 1 sheet metal / 60 HP |
| Block | 600 | 35 | 6 concrete blocks + 1 metal | 12 | 14 | 4 concrete blocks | 1 concrete block / 100 HP |

Partition upgrades straight to sheet metal. Generated block walls
(between units, unit-corridor, landing) are full-HP block walls.

**Door tiers** (`structures.doors.<tier>`; a fitted door starts as wood;
generated interior and front doors upgrade as if wood)

| Tier | HP | Defense | Cost | Build s | Demolish s | Demolish yield | Repair |
|---|---|---|---|---|---|---|---|
| Interior (generated) | 60 | 5 | - | - | 4 | 5 wood + 1 metal | wood / 20 |
| Front (generated) | 120 | 8 | - | - | 6 | 4 wood + 2 metal | wood / 20 |
| Wood (fitted) | 100 | 8 | 5 wood + 1 metal + 1 parts | 6 | 4 | 3 wood + 1 metal | wood / 20 |
| Reinforced | 250 | 18 | 2 sheet metal + 1 metal | 8 | 8 | 3 wood + 1 sheet metal | sheet metal / 60 |
| Metal | 450 | 30 | 3 sheet metal + 2 parts | 10 | 12 | 2 sheet metal + 1 parts | sheet metal / 60 |

Built doors are ordinary doors (5.18: open/close 0.4 s, block sight,
zombies can't open them). Door damage **can** now be repaired.

**Windows** (`structures.windows.*`): a fitted **glass window** costs 2
glass + 2 wood, 5 s, **30 HP**, defense 2; it blocks movement only. At 0
HP it shatters (Loud, glass sound) into a **broken window**: zombies climb
through in **1.5 s**, the hero in **1.0 s** (push into it,
`structures.brokenWindowVaultSeconds`). Glass can't be repaired: demolish
(2 s, yields 1 wood) and fit again. **Exterior windows** can take overlays
but are never attacked before M4 (H1, CD decided): attackers only come up
the stairs. In **M4**, **climber** zombies (a new zombie type, numbers set
in M4) break in through floor 15's outer windows, so outer window boards
and plating then matter. Until M4 no code path targets exterior edges.

**Overlays** (one per edge, `structures.overlays.*`; zombies destroy the
overlay before the piece; both HPs count in path cost)

| Overlay | Fits on | HP | Defense | Cost | Build s | Demolish s / yield | Other |
|---|---|---|---|---|---|---|---|
| Boards | windows | 80 | 6 | 3 wood | 3 | 2 / 1 wood | blocks sight |
| Plating | walls (any tier), doors, windows | 200 | 15 | 2 sheet metal + 1 parts | 6 | 6 / 1 sheet metal | blocks sight on windows; a plated door still opens |
| Barricade Lv1 / Lv2 | doors | 120 / 250 | 10 / 25 | `recipes.barricade_lv1/2` costs | 6 / 8 | 4 / none | as 5.6: hero and survivors squeeze through (0.5 s), the door stands open behind it, sight passes |

- In HQ, barricades are built in build mode on **any door**, not via the
  workbench; outside HQ the workbench front-door barricade (5.6) is
  unchanged. Barricade repair in HQ uses build-mode Repair (1 wood per 20
  HP, `barricade.repairHpPerWood`).
- **Repair** (build mode Main, rule 1): **2 s**, Noisy, restores the HP of
  one unit of the repair material (table), up to full; each tap is one
  unit. Damage is shown only by sprite stages, never numbers.
- **Damage stages** (from C2; `structures.damageStages` 0.75 / 0.5 /
  0.25): every edge piece and overlay with a structures tier (walls of
  all tiers, **all doors** incl. generated interior/front doors, glass
  windows, boards, plating, HQ barricades) uses 4 stages by HP ratio:
  **0** undamaged above 0.75; **1** at or below 0.75; **2** at or below
  0.5; **3** at or below 0.25 (art `dmg_*_1..3`). At **0 HP** it is not a
  stage: the piece becomes a gap with the broken stub (window: broken
  window). This replaces `doors.visualStages` (2 damaged stages, Stage A)
  for doors; the workbench front-door barricade outside HQ keeps
  `barricade.visualStages` (5.10).

**Traps** (Stage C3; workbench recipes with build spot `hq_floor`: any
free floor tile inside HQ **or on floor 15's landing**, normal placement
rules; keys `traps.*`)
- **Spike strip** (4 wood + 2 metal, 1x1, does not block movement): a
  zombie entering its tile takes **12 damage** once per entry and moves at
  **x0.5** speed on it; **12** hits then it is broken (dismantle for 1 wood
  + 1 metal). The hero, survivors and the dog are never hurt. Zombies
  don't avoid it and never attack it. Main: Dismantle (moves up).
- **Alarm lure** (2 metal + 1 parts + 1 tape, 1x1): an alarm clock wired to
  a pan. Main **Wind** (2 s, quiet) arms it. At **T-0** of an attack on
  HQ, every wound lure on floor 15 rings for **30 s**, **Loud**. While it
  rings, attackers path to the **nearest ringing lure** (by structure-cost
  path) instead of the heart, breaking what is in the way; at the lure they
  stand and bang until it stops, then go for the heart. Wanderers that hear
  it go too. One wind = one ring; **5** rings then "It's done." (dismantle
  only). Use: put it behind spike strips in a dead-end room = a kill zone.
- Nail board, tripwire chimes and electric fence stay M4 (5.6).

**How zombies attack structures** (online; HQ and everywhere)
- **Structure path cost**: in zombie A*, an edge with a piece costs
  (piece HP + overlay HP) / **10** tiles (`hq.attacks.pathHpPerTile`),
  at least the old closed-door cost of 10 for doors
  (`doors.zombiePathDoorCost`); open doors and gaps cost 0; broken windows
  cost +3 (the climb). Immutable edges (exterior, shaft) are impassable.
  So zombies go round a strong wall if a weaker way exists, and damage
  carried over from earlier attacks makes a spot cheaper (weak spots are
  remembered by HP, not by AI memory).
- **Banging**: a zombie whose path crosses a structure stands at it and
  hits it each attack interval for damage x**0.4**
  (`structures.damageMult`, same as doors and barricades); overlay first.
  At 0 the piece becomes a gap (broken stub). At most **3** zombies hit one
  edge (`hq.attacks.slotsPerEdge`): from the tile across the edge and the
  2 tiles diagonally beside it, only if walkable and no wall touches the
  corner between (no hitting round corners). A **1-wide chokepoint**
  therefore gets 1 attacker at a time. Others wait behind.
- Throughput check: one walker = 14 x 0.4 / 2.2 s = **2.5 HP/s**; 3 walkers
  break a wood wall in ~20 s, sheet metal ~42 s, a block wall ~80 s, a
  metal door + Lv2 barricade (700) ~92 s.

**HQ attacks** (main home = HQ; cue, schedule and strength A as 5.8)
- **Arrival**: attackers come up the stairs onto floor 15's landing as in
  5.8 (3 s apart). At most **12** attackers on the floor at once
  (`hq.attacks.maxAttackersOnFloor`); the rest arrive as others die.
- **Entries (they try weak spots)**: when the first attacker arrives, the
  game finds the cheapest structure-cost path from the landing to the
  heart; its first structure crossed is **entry 1**. That edge's cost is
  then raised by **1000** (`entryExclusionCost`) and the search repeated
  for entry 2, then 3. The number of entries grows with days survived
  (`hq.attacks.entriesByDay`): **1** (days 0-2), **2** (days 3-5), **3**
  (day 6+). Attackers are dealt to entries in turn (1, 2, 3, 1, ...). When
  any entry breaks, every attacker re-paths normally (usually through the
  breach). A ringing alarm lure overrides the target while it rings.
- **Inside**: attackers that enter HQ chase the hero if they see him (5.4),
  else path to the heart breaking inner structures on the way. The heart
  room (the recomputed room holding the heart) is the goal.
- **Online breach**: when the first attacker crosses the HQ perimeter:
  morale -10 (`needs.morale.events.barricadeBreached`, same latch as 5.2).
  Each attacker standing in the heart room loses one random stack from the
  HQ stash nearest the heart every **10 s** (`heartLootSecondsPerStack`),
  at most **5** stacks per attack (`heartMaxStacksLost`). Attackers only
  bite the active character (5.8 rule kept). Repelled online (all
  attackers dead, perimeter never crossed) = +5 morale.
- **Wave growth** (no new numbers for strength): count ceil(A / 10), A = 25
  + 3 x days survived, cap 150 (5.8), + the gunshot bonus (5.21). Type
  walkers; brutes join in M4 (structure damage x2,
  `zombies.types.brute.structureDamageMult` when M4 starts). Waves grow in
  size **and** in how many weak spots they probe.

**Offline resolution with HQ** (replaces the barricade-only D of 5.8 when
the main home is HQ)
- Find the cheapest structure-cost path from the landing to the heart
  (same A*, lures ignored). **Path defense** = sum over every structure
  crossed of (piece defense + overlay defense) x its HP / max HP
  (`hq.attacks.offline.defenseScalesWithHp`) + **8** per intact spike
  strip on or next to the path (max **3** counted,
  `traps.spike_strip.offlineDefense`, `trapMaxCounted`; each counted strip
  loses 2 hits) + **10** if a wound alarm lure exists on floor 15 (it is
  spent). D = path defense + guards x 15 + secured floors x 5 + 10 if the
  active character is in HQ (5.8 terms; floor 15 counts as secured).
- **D >= A, repelled**: the path's structures lose **A x 0.5** HP in total
  (`attacks.repelBarricadeLossRatio`), applied outermost first, each
  floored at **1 HP** (never broken by a repel).
- **D < A, breached**: every structure on the path goes to 0 (gaps; front
  overlays first); shortfall S = A - D; residents of HQ take S / 2 damage
  (floor 10) and S / 10 random stacks of HQ stashes are lost (5.8 terms).
- **Offline still can't kill** (health floor 10, 5.2); max 2 offline
  attacks per catch-up (5.8). The report stays prose: "Around 03:10 they
  went for the east wall. It held." / "They came through the kitchen
  window."
- **Fairness check** (QA): day 3, A = 34. HQ with the gate walled in wood
  (10) and the start flat's front door + Lv1 barricade (8 + 10) on the
  path, character home (10), floor 15 secured (5): D = 43 >= 34, repelled.
  Day 20, A = 85 needs roughly a metal-plated gate and one reinforced
  inner door (e.g. sheet-metal gate wall 20 + plating 15 + reinforced
  door 18 + Lv2 barricade 25 + 15 = 93).

**Progression pacing** (what the player can build when)
- **Early (first HQ days, Stage C2)**: wood walls, fitted wood doors,
  glass windows, boards, Barricade Lv1 everywhere, demolishing partitions
  for wood and metal. Hammer from toolboxes (15%) and janitor-closet
  utility shelves (10%), sledgehammer from storage cages and utility
  shelves in storage/utility rooms (5%) (`firearms.loot.meleeExtra`,
  level-designer adds them to loot.json), or both crafted.
- **Mid**: **sheet metal** from the recipe (3 metal each) and chance
  yields on big appliances (fridge, washing machine, water heater 50%;
  filing cabinet 40%; storage cage 30%): sheet-metal walls, reinforced
  doors, plating, Barricade Lv2. **Alarm lure and spike strips** (C3).
- **Late**: **concrete blocks** only from demolishing block walls (4
  each), mostly on floors 13, 14, 16 and 17: Loud work on infested floors,
  hauled home 5 per slot. Block walls and metal doors. M4 adds Barricade
  Lv3, brutes and the remaining traps.

### 5.21 Firearms and new melee (Stage C3; CD: "rare and loud", Zomboid-like)
Guns are a last resort: rare, scarce ammo, and every shot is heard across
the floor **and the floors next to it**. Keys `combat.weapons.<gun>`,
`firearms.*`.

| Gun | Damage | Range tiles | Aim cone | Cooldown s | Magazine | Reload | Ammo | Hit chance near / far | Durability (shots) | MS |
|---|---|---|---|---|---|---|---|---|---|---|
| Pistol | 25 | 7 | +-45 deg | 0.45 | 8 | 2.0 s, whole magazine | pistol ammo | 0.90 (<= 3 tiles) / 0.55 (at range) | 300 | C3 |
| Shotgun (double barrel) | 40 to the target + 20 to up to 2 more zombies within its **25-degree** spread and range; x0.5 beyond 3 tiles | 5 | +-45 deg | 1.0 | 2 | 1.0 s per shell | shotgun shells | 1.0 / 0.70 | 150 | C3 |
| Hunting rifle | 80; passes on to 1 zombie behind at x0.5 | 9 | +-30 deg | 1.5 (bolt) | 5 | 0.8 s per round | rifle rounds | 0.95 / 0.85 | 200 | M3 (deeper floors) |

- **Aiming with Attack**: the candidate is the best **Visible** zombie with
  a clear line (5.4) within the gun's range and aim cone, chosen by the
  section 4 sorting (angle buckets, then distance). One tap = one shot
  after the cooldown; holding does **not** repeat
  (`firearms.holdRepeats` false); at most 1 buffered tap. No candidate =
  no shot, no ammo spent, a dry click (not noise).
- **Hit roll**: hit chance falls linearly from "near" at 3 tiles
  (`hitChanceNearTiles`) to "far" at max range, x**0.8** if the target's
  tile is Dim and x**0.6** if Dark (`firearms.lightHitMult`). A miss
  spends the round and makes the full noise. Guns **never** get the
  unaware x3 bonus (`firearms.noUnawareBonus`): stealth stays a melee
  thing. Moodle damage penalties (Panic, Tired, Depressed) apply.
- **Reload** (automatic, no button): starts when the magazine is empty and
  matching ammo is carried, or after **3 s** with no zombie candidate
  while the magazine isn't full (`autoReloadIdleSeconds`). Pistol loads
  all at once; shotgun and rifle one round per step. Walking and creeping
  keep reloading; **running** or an Attack tap pauses it (rounds already
  loaded stay). Taps during a reload are buffered. The magazine count is
  saved per gun.
- **Empty and no ammo carried**: Attack swings the gun as a club (damage
  **6**, range 1.5, cooldown 0.6, no noise, no durability;
  `firearms.emptyGunMelee`). The Attack icon shows the gun with an empty
  chamber.
- **Durability**: 1 per shot fired; at 0 the gun is gone ("The pistol's
  done."), the hero switches to fists.
- **Noise: "Gunshot"** (a new level above Loud, `firearms.gunshotNoise`):
  every zombie on the same floor aggroes to the shot tile (as Loud), and
  zombies on the floors **directly above and below** within **12 tiles**
  (grid distance, same x/y) of the shot tile hear it: up to **4** of them
  (nearest first, `adjacentMaxResponders`) walk to their stairs and
  **climb to the shot's floor** (the one exception to "zombies never use
  stairs", 5.4), then walk to the shot tile and look around for 10 s. If
  they don't find the hero they stay on that floor as wanderers (it
  becomes Infested; the wanderer cap doesn't stop them). Floors 12 and 18
  don't exist in M2, so shots on 13 or 17 reach only one neighbour.
  Shots on floor 15 send responders up and down onto the landing, where
  they bang on the HQ perimeter like noise-bangers (10 s, 5.18).
- **Draws the next attack**: every shot fired adds **+2** to the next
  attack's strength A, at most **+20** (`attackStrengthPerShot`,
  `attackStrengthShotCap`), applied after the cap and reset when that
  attack resolves. Not shown anywhere.
- **Feedback**: a recorded gunshot (CC0, section 10), a muzzle flash that
  makes the hero's tile and the 8 around it Lit for **0.1 s**
  (`muzzleFlashSeconds`), the usual hit FX. The hero's own shots never
  ripple (5.17). The first shot ever: thought "Everyone heard that."
- **Quick-use for weapons**: the quick-use slot also accepts a **weapon**
  (`quickUse.eligibleTypes`); a tap swaps it with the equipped weapon in
  **0.5 s** (`quickUse.drawSeconds`), and the swapped-out weapon becomes
  the slot's item, so one tap draws the pistol and the next puts it away.
  Weapons are never picked by the auto-default.
- **Ammo and loot** (`firearms.loot`; level-designer adds the entries to
  loot.json under these rules):
  - Guns and ammo are **extra rolls** after a container's normal loot,
    only in listed containers: pistol in wardrobe, desk, storage cage
    (2% per search); shotgun in storage cage, wardrobe (1%); rifle in
    storage cage (0.5%, M3+). Ammo: pistol ammo in wardrobe, desk, storage
    cage, utility shelf (4%, **2-5** rounds); shotgun shells in storage
    cage, wardrobe, utility shelf (3%, **1-3**); rifle rounds in storage
    cage (2%, 1-3, M3+). Ammo ignores the qty-1 consumable cap.
  - By distance from floor 15 (`floorMultByDistance`): **x0** on floor 15,
    x1 at distance 1, x1.5 at distance 2 (deeper floors in M3+ keep x1.5).
    Containers emptied by the unit condition roll nothing.
  - A found gun holds **0-3** rounds (`magazineOnFind`).
  - **Guarantee**: exactly **1 pistol** per game on floor 13 or 17 (50/50)
    in a wardrobe or storage cage that is never empty, with **4** rounds
    loaded (`firearms.guarantees`), so every run has one gun to find.
  - Expected M2 total (floors 13-17): about 1-2 pistols, ~15 pistol
    rounds, ~0-1 shotgun and ~5 shells per game. No ammo recipes.
- **New melee** (5.4 table): **crowbar** becomes equippable, **hammer** and
  **sledgehammer** are tools first and weapons second, **fire axe** moves
  to loot from C3 (utility rooms and janitor closets, 3%, floors 13 and
  17 only in M2). Kitchen knife and spiked bat unchanged.

## 6. Progression and difficulty
- **Long-term goal**: reclaim all 30 floors (all Secured), build the Radio
  set and the Rooftop beacon, then choose to leave or stay (section 1).
- Difficulty rises with distance from floor 15 (5.15 step 8); M3 adds
  floors 8-22, M4 all 30 with brutes. Rarer loot (axes, medkits,
  antibiotics) deeper/higher.
- Tool gating: crowbar and wrench open bigger, richer objects (wardrobes,
  storage cages, fridges, washing machines) and jammed doors.
- Attacks grow with days survived; defenses with barricades, secured floors
  and guards. From Stage C2 the HQ on floor 15 is the long build project:
  wood -> sheet metal -> concrete block walls, wood -> reinforced -> metal
  doors, boards and plating, traps; waves probe 1, 2, then 3 weak spots
  (5.20). Concrete blocks pull the player back to the infested floors.
- Guns are rare and loud (5.21): a pistol is guaranteed once per game, the
  rest is luck, and every shot brings zombies from neighbouring floors.
- Saved: world seed and generated layout, door states and damage, tile
  memory per floor, every removed object, pile and placeable with its
  fuel, claimed apartments and main home, timestamp, settings, stats, notes
  read, ending choice.

## 7. Content
| | Milestone 1 (done) | Milestone 2 (iso) | Version 1 (release) |
|---|---|---|---|
| View | Side cutaway | Isometric 2.5D, vision cone, one floor visible | same |
| Floors | 5 authored (13-17) | 5 generated (13-17), 30 x 22 tiles, 4 apartments + 1 small unit each | 30 + roof |
| Unit templates | - | 6 apartment + 3 small + start flat, 2+ blueprints each, 14 room types, 3 conditions | ~12 templates |
| Zombie types | Crawler, Walker | same, rebalanced (slow, heavy, groups, 8 facings) | + Runner? (M3), Brute, Climber (M4) |
| Weapons | Fists, knife, spiked bat | + crowbar, hammer, sledgehammer, fire axe; pistol, shotgun (C3) | + lead pipe, pipe spear, hunting rifle |
| Tools | Crowbar, wrench | + hammer, sledgehammer (C2) | + saw, flashlight, tool wraps |
| Materials | 10 | 12 (+ sheet metal, concrete block) | 21 |
| Objects | 20 | 30 + doors you open and close + spike strip, alarm lure | ~52 |
| Recipes | 14 | 21 (+ oil lamp, workbench, hammer, sledgehammer, sheet metal, spike strip, alarm lure) | ~54 |
| Building | front-door barricade | HQ on floor 15: walls, doors, windows on any edge, 3-4 tiers, overlays (C2) | same + Barricade Lv3 |
| UI | need bars, numbers | moodles, no numbers | moodles (+ Sick, Infected) |
| Survivors | 1 (Mara) | 1 (Mara) | 4 |
| Story | intro, ~5 notes | ~12 notes, unit flavour lines | ~25 notes + radio, ending |
| Attacks | siren + 60 s banner | 15 s diegetic cue, up the stairwell to the main home | + traps, dog growl |

## 8. Screens and flow
1. **Title**: dark tower in rain, one window lit amber, "Tap to start"
   (unlocks audio). For a Completed (left) save: "You left the tower on
   day N", Replay ending, New game.
2. **New game**: 3 short lines on black, one at a time ("You wake up.",
   "It's quiet. Too quiet for a Tuesday.", "Something is scratching at the
   door."), then fade into the start flat's bedroom: the hero stands by
   the bed facing the closed bedroom door.
3. **Tutorial by doing (first ~60-90 s), no arrows, no highlights**: the
   camera gently pans to each target and the hero thinks one line. Each
   step is done by walking up to the thing (it gets the dark target
   outline and its icon appears on the Main button) and pressing Main or
   Secondary (section 4); the button arc is the only "teacher":
   - Bedroom door (closed): "Dark in here." -> walk to the door, press
     Main (Open) or push into it -> it opens (teaches the stick, the
     target outline and the Main button; the hallway beyond becomes
     Visible).
   - Fridge ("I need to eat something." -> Search -> 1 canned food).
   - Chair, then table ("This could hold the door." -> Dismantle on Main,
     since they have no other action -> 6 wood).
   - Kitchen drawer (Search -> 2 metal, "A tin of nails.").
   - Workbench (Main Craft -> Barricade Lv1 -> placement mode -> walk to
     the front door -> Main Place).
   - Scratching from behind the hero, panned and muffled: "Behind me?" ->
     the step completes when the hero faces the sound (double tap the
     stick zone to turn round, or walk toward it with the stick). Teaches
     turning without text.
   - Front door: the step completes when the hero is within **1.5 tiles**
     of the start flat's front door on floor 15 (`tutorial.doorTriggerTiles`,
     inclusive, walking or running); the door opens onto the corridor and
     a crawler drags itself in (Attack it; Main shows Attack once it is
     in reach). The crawler spawns on a
     **corridor tile**, not the landing: the walkable corridor tile
     **3 tiles** (path distance, `tutorial.crawlerSpawnCorridorTiles`)
     from the corridor tile just outside the start flat's front door,
     on the side away from the stairwell; if that tile is blocked, the
     nearest free corridor tile at path distance 2-4. It spawns facing
     the door and is drawn only once the door is open.
   - After that: "Anything here can be taken apart." Later systems get one
     thought the first time ("Bleach. That'll make the water safe." on
     first chemicals; "Nobody lives here now. It could be mine." the first
     time a unit is clear; "Close it. Close it." the first time a zombie
     bangs a door the hero is behind).
4. **Returning**: "While you were away" note (5.1, one tap closes).
5. **Play**: the iso floor view. HUD (exact layout in section 4, "HUD
   layout"): **top-left** icon bar (Home, Bag, Workbench, Survivors,
   Menu); **top-right** moodle column; **lower-left** stick zone (the
   stick is drawn only while held); **lower-right** button arc (Main 120,
   Attack 96, Secondary 88, Quick-use 80 px); everything mirrored
   left/right by the Stick: Right setting except the top bar and moodles.
   No need bars, day counter, attack timer, power readout, minimap or
   compass. All of it follows the **muted UI style** below: icons only,
   no text labels, ever (CD decision, 12); the only text on a button is
   the quick-use count.

**Muted UI style (M2; keys `ui.*`)**. The UI must read as worn objects in a
dark room, not as game buttons.
- **Top bar** (was the bottom bar): icon buttons, no text, no outline.
  Plate **72 game px** (`ui.topBar.iconPlatePx`) inside a **96 px** hit
  area; plate near-black `#0b0c0e` at alpha **0.55**, pictogram UI text
  `#bdb8ab` at alpha **0.7**, pressed alpha **0.9**. Icons: house (Home),
  bag (Inventory), hammer (Workbench), two heads (Survivors), three dots
  (Menu). Sound on/off lives in Menu as a speaker icon (crossed when
  muted), not in the bar.
- **Action buttons** (section 4): round plates in the same near-black at
  alpha **0.55**, pictograms in UI text colour at alpha **0.7**, pressed
  **0.9**, unavailable **0.3**, empty plate **0.3** (`controls.buttons.*`).
  No rings, glows or colour coding; Attack differs only by its weapon
  icon. Pictograms (art-generator): open door, closed door, hand in box
  (Search), hand taking (Take/Pick up), drop (Drain), cup (Drink), jar
  (Collect), watering can (Water), flame (Add fuel), crowbar-and-plank
  (Dismantle), shoulder (Force), open palm (Shove), speech mark (Talk),
  hand giving (Give), bed (Sleep), half-moon (Nap), hammer (Craft), box
  (stash Open), arrow-into-box (Store all), key (Claim), door with arrow
  out (Leave this place), eye (Inspect), paw (Pet), lead (Follow / Stay),
  diamond-with-tick (Place), cross (Cancel), fist / knife / bat (Attack).
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
- **Floor numbers**: faded stencil paint on the landing's north wall only,
  never in apartments or the HUD: light concrete `#5d6166` at alpha
  **0.6**, **48 game px** tall (16 art px), with 2-3 chipped gaps and one
  drip.
6. **Inventory**: carry slots and the stash of the claimed apartment the
   hero is in (a tab per claimed apartment; only the current one is
   usable, others are read-only "Floor 14, north-east").
7. **Menu**: day N (the only place it is shown), sound, music, stick
   Left/Right (section 4, default Left), notes read,
   replay ending (once unlocked), resume. Pausing does not stop real time.
8. **Pass the torch** -> pick survivor -> play.
9. **Game over** -> stats -> New game.
10. **Ending** (M5) -> text cards -> Leave/Stay -> epilogue -> stats.

Toasts (short system lines such as "Needs crowbar") are off-white small
text just above the control band (`ui.hudTextBottomPx`) for 2 s, no
icon, no sound. Thoughts and flavour lines use the same position.

## 9. Art direction (M2, isometric)
- **Look**: muted, desaturated, dark, damp. Think a grey wet evening with
  the power almost gone, seen from above through a cone of torchless
  sight. Pixel art, **1 art px = 3 game px**, 2:1 isometric.
- **Saturation rule**: nothing above ~35% saturation except lamp light,
  fire and blood.
- **Palette**: near-black `#0b0c0e`, deep shadow `#16191d`, shadow concrete
  `#23272c`, wall concrete `#3a3e42`, light concrete `#5d6166`, damp plaster
  `#6e6a5e`, faded wallpaper `#5b5547`, rust brown `#5a3a2a`, dried blood
  `#4e1c1a`, zombie skin `#5f6650`, pale skin `#a99886`, hero jacket faded
  teal `#34494b`, window daylight `#8a9399`, lamp amber `#c08a3e`, fire
  `#d07a2c`, UI text `#bdb8ab`. Moodle squares L1 `#7d7350`, L2 `#8a6a3a`,
  L3 `#7a4630`, L4 `#5e2422`.
- **Tiles**: floor diamonds **32x16 art px** (96x48 game px): concrete
  (corridor, landing, service rooms), worn lino (kitchen, bathroom), wood
  boards (living, bedroom), carpet (office), each with 2-3 variants. Stair
  flights as 2-tile-wide step tiles.
- **Walls**: one sprite per tile edge, full height **40 art px** (120 game
  px) plus the 16x8 art px edge footprint; cut stub **12 art px**. Two
  faces (NW-facing and NE-facing edges), plain concrete, wallpaper,
  bathroom tiles; a top cap line on every wall so cut and full walls read
  clearly. Doorway frames, door leaves (closed, open, splintered,
  hanging, broken), window frames with glass, rain streaks (2-3 frame
  loop) and a dark city beyond; broken window variant.
- **Characters**: **16x32 art px** (48x96 game px), **8 facings** from 5
  drawn directions (S, SE, E, NE, N) mirrored for SW, W, NW. Frames: idle
  1, walk 4, run 4 (hero), attack 2, wind-up 1 (zombie lean-in), hurt 1,
  slump 3. Facing must read at a glance: pale face and hands on the front,
  dark hair and coat on the back. 1 px near-black outline on characters
  only.
- **Props**: iso, 1x1 props within **32x40 art px**, 1x2 props within
  **48x48 art px**, 2x2 (bed) within **64x48 art px**; tall props up to 48
  art px high. Each wall-layer prop drawn in 2 orientations (backed to an
  NW-facing or NE-facing wall) and mirrored for the other two. Material
  icons 8x8 art px. Searched containers drawn ajar; dismantled objects
  leave a faint floor mark and a 3-frame dust puff.
- **Lighting and vision** (one darkness overlay per tile, alphas in
  `vision.overlayAlpha.*`; light pools erased out of it):
  - Visible tiles: Lit **0.1** (warm amber pool around each lamp,
    flickering +/-5%), Grey **0.3** (cool tint, soft window light shafts
    on the floor), Dim **0.5**, Dark **0.7**. Close-circle tiles use half
    their light's alpha (eyes adjusting).
  - Edge tiles (5.17 soft edges): **0.8**.
  - Remembered tiles: **0.82**, desaturated **80%**
    (`vision.memoryDesaturate`), no animation (no rain streaks, no
    flicker).
  - Unknown tiles: **1.0** (`#0b0c0e`).
  - Screen vignette: 5.18.
  - Landing: Dim, one emergency light that flickers at random 50-150 ms
    dips (`light.stairwellFlickerMs`), more during the attack cue.
  - **Dust motes**: 6-10 slow grey particles per Visible room
    (`light.dustMotesPerRoom`), drifting through light (nice-to-have).
  - Performance: only the current floor is drawn; static floor tiles and
    walls are baked per floor into a render texture on load (re-baked when
    an object is removed or placed); the vision overlay is redrawn only on
    recompute (<= 10 Hz) with a 0.15 s cross-fade; at most 4 light pools
    per floor. Target 60 fps, never below 30 on a mid-range phone.
- **Burned units**: soot-black walls, charred shapes, broken windows.
  **Ransacked**: open drawers, papers and clothes on the floor.
- Barricade and doors: 5 / 3 damage stages, splinters on hits. From C2
  all structure pieces incl. doors: undamaged + 3 damage stages
  (`dmg_*_1..3`, 5.20).
- Fire: 3-frame flame loop (molotov). Blood is limited to dark hit
  splashes, floor stains and drips (5.4); no dismemberment or body parts;
  corpses slump and fade.
- **No pulse, glow, sparkle or highlight on interactables.** The only
  outlines in the game are the dashed spot-pick diamond (5.6) and the
  **dark target outline** (section 4, CD decision): 1 art px (3 game px)
  of `#0b0c0e` at alpha 0.6 drawn just **outside** the target sprite's
  silhouette (outside a character's own 1 px outline, so a targeted zombie
  reads as a 2 px dark edge). Never coloured, never animated beyond its
  0.1 s fade.
- **Action button pictograms**: 16x16 art px centred on the plate (Main:
  20x20 art px), same line style as the top bar; list in section 8.
- **UI art**: follows the muted UI style in section 8. Moodle pictograms
  24x24 art px (72 game px); top-bar pictograms 16x16 art px centred on
  the 72 px plate; floor numerals are stencil sprites 0-9, 10x16 art px,
  painted on the landing's back wall in iso perspective.
- **App icon**: the dark tower silhouette in rain against a grey-green sky,
  one lit amber window near the middle; 512x512, readable at 48 px
  (unchanged).

## 10. Audio direction (M2)
- **Mood**: mostly silence. The building makes the sounds: wind, rain on
  glass, pipes ticking, a door creaking somewhere, a distant groan, a
  muffled thud from another floor. Silence is part of the design.
- **Listener = the hero.** Positional sounds are panned by the source's
  screen x relative to the hero's (full left/right at **360 game px**,
  `audio.panWidthPx`) and attenuated by straight-line tile distance: full
  volume within **2 tiles** (`audio.fullVolumeTiles`), linear to 0 at the
  sound's hear radius. Sounds without line of sight are muffled (low-pass,
  x0.5). Sounds from other floors are not positional.
**Rule zero (CD, Stage A playtest)**: everything you hear sounds like a
real place. "I don't like this constant buzzing when nothing is around, I
want natural sounds, nothing that reminds of an arcade game."
- **No continuous tonal sound anywhere**: no room-tone hum, drone, buzz,
  electrical whine, lamp hiss loop or synth pad as a constant bed. The
  M2 room-tone and lamp-hiss loops are **removed**.
- **No synthesized sounds**: no synth tones, chimes, blips, beeps, whooshes
  made in code, or musical stingers in UI or gameplay. Procedurally
  generated audio (WebAudio oscillators, noise generators) is not used for
  any sound in the shipped game.
- **Everything is a real recording** (field recording or foley), from
  **CC0 or public-domain** sources only (CD approved). Every file is listed
  in **`public/assets/audio/CREDITS.md`** with: file name, what it is,
  source URL, author, license (CC0 1.0 / public domain), and any edit made
  (trim, fade, loudness, mono, format). A file without a CREDITS line does
  not ship. No CC-BY, no "free for games" licences without an explicit
  CC0/PD statement.
- **Ambience = silence plus irregular natural sounds.** With nothing
  around, the hero hears **nothing at all for stretches**; there is no
  ambient loop. Ambient one-shots fire with a random gap of **25-70 s**
  (`audio.ambientGapSeconds`), never the same file twice in a row, each at
  a random volume **0.35-0.7** (`audio.ambientVolumeRange`) and random pan.
  The pool (each 2-15 s, with natural fade in/out):
  - **Weather**: wind gust against the building, rain on a window (a
    burst that swells and fades, not a loop), a gutter dripping, thunder
    far away (rare, weight 1).
  - **Building**: concrete/wood settling creak, pipe knock or tick, a
    radiator ticking as it cools, a door somewhere drifting shut, a
    distant muffled thud from another floor, a loose window rattling in
    a gust.
  - **Outside, far**: a dog barking far away, crows, a car alarm far off
    that stops by itself (rare, weight 1), a dead city's quiet (no
    traffic). **Birds at dawn** arrive with day/night (M3).
  - Weights: weather 3, building 4, outside 2 (`audio.ambientWeights`).
- **Rain near windows**: within **3 tiles** of a window
  (`audio.windowRainTiles`) the rain-on-window one-shot gets weight x3 and
  plays from the window's direction; a broken window adds a soft wind
  gust weight x2. Still one-shots, never a loop.
- Distant groans every **45-120 s** (`audio.distantGroanGapSeconds`),
  which also hide the attack cue (5.8). Groans are recorded human voice
  (CC0 vocal recordings, pitched/filtered), never synthesized.
- **Zombies are heard before seen**: 5.17 (12 tiles, 4-9 s gaps, max 3
  voices, muffled through walls; door banging 15 tiles).
- **Music**: sparse, sad and **acoustic**: real-instrument recordings only
  (solo piano, cello, acoustic guitar, CC0/PD), **20-60 s** pieces, never
  during danger, never looping. Plays at most once per **15-25 min**
  (`audio.musicCooldownMinutes`, rarer than before; CD confirmed, open
  question 5) and only on quiet moments: first claim, after an attack
  ends, a survivor joins. A moment is quiet only if no zombie on the
  hero's floor is aggroed and no attack cue is running; otherwise the
  moment is skipped (not queued) and the cooldown is not spent. **3 pieces** in M2,
  plus the ending cue (M5). Volume **0.5** (`audio.musicVolume`). No tense
  attack loop, no stingers. If no suitable CC0/PD acoustic piece is found
  for a moment, that moment gets silence (not a substitute synth piece).
- Total audio under **3 MB** (`audio.maxTotalMB`): mono OGG (with an M4A
  fallback only if the engine programmer requires it), 44.1 kHz,
  ~64-96 kbps; ambience and SFX files trimmed to their sound.
- **SFX (M2 list)**, all recorded: footsteps by floor surface (walk soft,
  run heavy; **surfaces** `wood`, `tile`, `carpet`, `concrete`, chosen by
  the hero's room type via `audio.footstepSurfaceByRoom`, e.g. hallway/living/bedroom wood, kitchen
  and bathroom tile, kids room carpet, corridor/landing/service rooms
  concrete; 3+ variations each, picked at random with pitch x0.95-1.05,
  `audio.footstepPitchRange`), searching sounds by container (cupboard
  door, drawer slide, wardrobe creak, fridge seal, cabinet click, cloth
  rummage, metal shelf), furniture dragging and breaking, glass, wet hits
  for blades and blunt weapons, stairs, door
  open/close/creak, door burst (run), door bang (zombie), door splinter,
  jammed door hit, cupboard open, drawer slide, rustle, pick up (soft
  cloth/handling, no chime), punch, blunt hit, blade hit (stab) (picked
  per weapon by `combat.weapons.<id>.hitSound`, 5.4), weapon break, zombie
  breath/shuffle/groan/lean-in/death slump, hero hurt breath, barricade
  hit/creak/break, hammer, wood crack, metal clang, cloth rip, water pour,
  glass shatter, fire catching (recorded flame), lamp wick being lit (a
  one-shot match strike, no loop), pipe knock, stairwell banging (cue),
  moodle cues (5.2, recorded body sounds), eat, drink, Mara's sob.
- **UI sounds**: menus and bottom-bar buttons are **silent** by default;
  at most a very quiet recorded paper/cloth touch (volume **0.2**,
  `audio.uiVolume`) on opening a panel. Crafting completes with the real
  sound of the work (hammering, tape tearing), never a jingle.
- **Removed**: attack siren, UI tap blips, noise alert sting, pickup chime,
  any "level up" or success jingles, room-tone hum, lamp hiss loop, every
  generated/synth sound.

## 11. Scope
**In for version 1**: everything in sections 1-10 for the Version 1 column
of section 7, delivered in five milestones. Each milestone ends with a
CD playtest on the phone.

### 11.1 Milestones
- **M1 "First playable"** (done): 5 authored floors, tap movement,
  scavenging, salvage, 14 recipes, combat, needs, offline catch-up, Mara,
  attacks, save/load.
- **M2 "The tower breathes"** (current, rebuilt as isometric). Floors stay
  **13-17**: 5 floors x (4 apartments + 1 small unit) = 25 units, already
  much more than M1 had. Stage 1 (mood, moodles, cue, audio, rebalance,
  scarcity, run) is done on the side view and its systems carry over.
  - **Must-haves**
    1. Iso renderer: 96x48 tiles, walls with height, cutaway and occluder
       fade, draw order, one floor visible, camera follow with look-ahead,
       clamp (no manual pan).
    2. Movement: floating virtual joystick (walk, run past 70%, wall
       sliding, doorway assist, door push, double tap to turn), **context
       buttons** (target selection with hysteresis and dark outline, Main /
       Secondary / Attack / Quick-use, shove, quick-use picker and throw
       aim, placement by walking), top bar, Home auto-walk (A*, 8
       directions, no corner cutting). World taps, drag to look and the
       action menu are removed (CD decision after the joystick playtest).
    3. Vision: cone + close circle + LOS shadows (walls, doors), tile
       memory, zombies only on Visible tiles, soft edges, vignette,
       muffled positional zombie sounds.
    4. Doors: open/close, block sight and zombies, zombie banging and door
       HP, jammed front doors.
    5. Floor plans: 30x22 floors 13-17 with core stairwell and stairs;
       blueprints; objects on tiles with footprints, facing and access
       tiles.
    6. Generator: seed, templates + blueprints, mirroring, conditions,
       object fill rules, zombie placement, guarantees, saved layout.
    7. The 30 objects (5.6) and their loot tables; loot scarcity (carried
       from Stage 1).
    8. Home claiming: claim, stashes per apartment, build spots from tiles
       and window edges, beds, main home by sleeping, Workbench recipe,
       barricade per claimed door, Leave this place.
    9. Attacks up the stairwell to the main home's door (cue from Stage 1),
       max 3 at the door.
    10. Zombie rules in tiles: 8 facings, sight cones with LOS, hearing
        through walls, unaware x3 hit, lose track, groups, door banging.
    11. Tile light: base room light, lamp pools, landing flicker, oil lamp
        recipe and fuel.
    12. Iso art: tiles, walls (full + stub), doors, windows, 8-facing
        characters, all props in iso, palette and UI as Stage 1.
    13. Audio: hero as listener, panning and muffling (Stage 1 sounds
        carried).
    14. Thoughts, flavour lines, ~12 notes, tutorial without arrows
        (section 8), prose "While you were away" (carried).
    15. Save version 2 (side-view saves reset).
    16. Carried from Stage 1, must keep working: moodles, no numbers,
        barricade stages, diegetic cue, run, hit feedback, muted UI.
    17. HQ (5.19): claim floor 15 when Cleared, HQ stash pool, heart, edge
        model with kinds, build mode (edge cursor, piece selector, Main
        rule order, Demolish), hammer/sledgehammer/fire axe, rooms,
        vision, pathing and render updating on edge changes, edge
        overrides in the save.
    18. Reinforcement (5.20): wall, door and window tiers, overlays
        (boards, plating, barricades on any HQ door), repair, sheet metal
        and concrete block materials.
    19. HQ attacks (5.20): structure path costs, 3 slots per edge, entries
        by day, heart room stash loss, offline path defense.
    20. Traps (5.20): spike strip, alarm lure.
    21. Firearms and melee (5.21): pistol, shotgun, ammo loot rules and
        guarantee, gunshot noise on adjacent floors and attack bonus,
        auto reload, weapon quick-use swap, crowbar/hammer/sledgehammer/
        fire axe as weapons.
  - **Nice-to-haves** (only if the must-haves are done and playtested)
    1. Dust motes and window light shafts.
    2. Ransacked/burned visual dressing beyond tint (papers, soot decals).
    3. A 4th music piece and more ambience one-shots.
    4. More templates and blueprints (e.g. `dentist`, `hoarder_flat`) and
       notes (to 20).
  - **Delivery**: in 6 playable stages A, B, C, **C2, C3**, D (11.3), each
    ending with a CD playtest.
- **M3 "Night and fever"**: floors 8-22; day/night on the device clock;
  the dog (growl cue); infection and sickness as moodles; paper, meds,
  herbs, batteries; flashlight, saw; stove, cooking, spoilage, full
  comfort, hygiene; medicine recipes; Workbench Lv2, storage shelf;
  survivors 2-3, Medic and Cook; runner re-evaluated; ~20 notes.
- **M4 "Power and defense"**: all 30 floors, brutes (x2 structure
  damage); **climbers** (CD, H1: break in through floor 15's outer
  windows, so outer window covers matter; stats and schedule designed at
  M4 start); rope, wire, rubber, leather, container; power, the remaining
  traps (nail board, tripwire chimes, electric fence), Barricade Lv3,
  gear, tool wraps, water
  tank, lockbox; stairwell fire-door barricades between floors; antiviral;
  survivor 4, Mechanic.
- **M5 "Beacon"**: roof, radio set, supply caches, elevator, Rooftop
  beacon, leave/stay ending, remaining notes, balancing pass.

### 11.2 Side view -> isometric: what carries over, changes, is dropped
**Carries over unchanged** (code and data keep working; only callers that
pass positions change):
- Time, offline catch-up, autosave, background handling (5.1).
- Needs, moodles and their cards, nap, auto-use, morale events (5.2),
  except Panic's distance rule and tunnel vision.
- Scavenging rules, loot tables, scarcity, inventory and stacks (5.5).
- Materials, object stats (size, tool, noise, primary, yields), recipes and
  costs, producers, refunds (5.6).
- Survivors, Mara's trait, jobs, pass the torch (5.7).
- Attack strength math, cue timeline (groans, bang beats, flicker), offline
  resolve, barricade levels, HP and visual stages (5.8).
- Combat stats (damage, cooldown, durability, hit sounds, unaware x3,
  stun, wind-up, corpse time), zombie HP/damage/intervals, hit FX numbers.
- Lamp fuel, comfort, all M3-M5 systems (with distances converted).
- Notes, flavour lines, thoughts, prose report, muted UI style, icon bar
  (moved to the top),
  panels, moodle column, palette, audio direction and SFX list, the
  "Tap to start" flow, save/lifecycle core (`src/core/`).
- `templates.json` room types, pools, flavour lines, notes and loot.json
  (extended, not replaced).

**Changes** (new rules in the listed section; new keys in balance.json):
| Side-view system | Iso rule | Keys |
|---|---|---|
| Positions in px on a 3120 x 240 strip | Tiles on a 30 x 22 grid, iso projection | `iso.*`, `grid.*` |
| Walk 100 / run 170 px/s, run noise 250 px | 2.0 / 3.4 tiles/s, noise 5 tiles | `hero.walkTilesPerSecond`, `runTilesPerSecond`, `runNoiseRadiusTiles` |
| Walking along x | A* 8-direction pathfinding, occupancy, doors on the way | 5.3 |
| Camera: axis-locked drag, x dead zone, vertical floor scroll | Follow with look-ahead, 2D hero clamp rect, one floor; no manual pan (after Stage A) | `controls.cameraDeadzonePx`, `cameraLookAheadPx`, `cameraIsoEdgePadPx`, `floorFadeSeconds`, `zoom` |
| Tap tests on side sprites | ~~Iso hit-testing, snap 96 px~~ -> no world taps; target selection by reach and cone (context buttons) | `controls.target.*` (old `tapSnapRadiusPx`, `tapSnapWalkTiles` deprecated) |
| Hold: none | ~~Drag to look, tap hero to turn~~ -> facing follows movement; double tap in the stick zone turns around | `controls.turnAroundSeconds`, `controls.joystick.doubleTap*`, `walkTurnDegreesPerSecond` |
| Tap to walk, double tap to run | Floating virtual joystick (run past 70%) to move; context buttons to act | `controls.joystick.*`, `controls.buttons.*`, `quickUse.*`, `combat.shove.*`, `hero.collisionRadiusTiles` |
| Room light Dark/Dim/Grey/Lit, Dark until entered | Tile light Lit/Grey/Dim/Dark by room type and lamp LOS; vision states Visible/Remembered/Unknown | `light.lampRadiusTiles`, `light.darkTimeMult`, `vision.*` |
| Zombie facing left/right, sight by \|dx\| | 8 facings, 120-degree cone with LOS, ranges in tiles | `zombies.sight.coneDegrees`, `frontTiles`, `behindWalkTiles`, `behindRunTiles`, `idleTurnChances` |
| Zombie speeds px/s, ranges px | tiles/s, tiles | `zombies.types.<id>.speedTilesPerSecond`, `zombies.attackRangeTiles`, `zombies.tuning.*Tiles`, `combat.weapons.<id>.rangeTiles` |
| Noise radii px | tiles, through walls | `salvage.noiseRadiusTiles` |
| Interior doors: salvage only, never block | Open/close, block sight and zombies, door HP, banging | `doors.*`, `generator.doorClosedChance` |
| Wings of 6 modules, 2 slots per module | Blueprints (12x10 / 6x10), wall/floor/mounted layers, footprints, access tiles, per-room pick counts | `generator.blueprintsFile`, `roomSizeTiles`, `wallTilesPerPick`, `floorTilesPerPick`, `doorwayClearanceTiles`, `curtainChance`, `windowEveryTiles`, `mirrorXChance`, `iso.footprints`, `iso.mountedObjects` |
| 2 units per floor (left/right wing) | 4 apartments + 1 small unit; `home.startWing` -> `home.startUnit` "NW" | `grid.slots`, `home.startUnit` |
| Zombies per wing by distance | Per unit, with a floor cap | `generator.zombiesPerUnitByDistance`, `zombiesPerFloorCap`, `zombieNoSpawnTilesFromFrontDoor`, `pairMinDistanceFromEntranceTiles` |
| Attackers arrive at 16-70 px from the door | Come up the stairs, walk to the door, max 3 hit at once | `attacks.maxAttackersAtDoor` |
| Bang falloff by camera x distance (px) | By hero tile distance | `attacks.cue.bangFalloff.nearTiles`, `farTiles` |
| Zombie sounds panned by x within 600 px | Hero listener, 12 tiles, muffled without LOS | `audio.*Tiles`, `panWidthPx`, `occludedVolumeMult`, `zombieSoundGapSeconds`, `maxZombieVoices` |
| Throw 300 px arc, molotov 120 px wide | 6 tiles, Visible target; molotov radius 1 tile | `throw.rangeTiles`, `molotov.radiusTiles` |
| Panic within 400 px | Within 8 tiles and Visible; tunnel vision | `moodles.panic.aggroedWithinTiles`, `coneDegreesPenalty` |
| Tutorial door trigger 60 px | 1.5 tiles; new door and turn steps | `tutorial.doorTriggerTiles` |
| Build spots = empty slots, spot pick across floors | Empty floor tiles / pane-less window edges, hero's floor only | 5.3, 5.6 |
| Art: side sprites 16x24, 1040x80 floor strips | Iso tiles, wall edges, 8-facing 16x32 characters, iso props | section 9 |
| Save version 1 | Save version 2 (side-view saves reset) | 5.1 |

**Dropped** (delete the code paths and keys once the iso code no longer
reads them; the keys are listed in `_deprecatedSideViewKeys` in
balance.json):
- The side cutaway renderer: floor strips, several floors on screen,
  vertical drag between floors, axis-locked drag, horizontal dead zone,
  camera edge pad in px, the 1040x80 floor art and side-view wall modules.
- `world.floorWidthPx`, `floorHeightPx`, `wingWidthPx`,
  `stairwellWidthPx`, `moduleWidthPx`, `modulesPerWing`, `slotOffsetsPx`,
  `doorwayClearancePx`; `controls.cameraDeadzoneXPx`, `cameraEdgePadPx`;
  `hero.walkSpeed`, `runSpeed`, `runNoiseRadiusPx`; `zombies.sightRadiusPx`,
  `dimSightRadiusPx`, `darkSightRadiusPx`, `zombies.sight.frontPx`,
  `dimFrontPx`, `darkFrontPx`, `behindWalkPx`, `behindRunPx`,
  `zombies.attackRange`, `zombies.tuning.wanderRadiusPx`,
  `loseTrackDistancePx`, `groupSpacingPx`, `wanderSpawnMinHeroDistancePx`,
  `zombies.types.<id>.speed`; `combat.weapons.<id>.rangePx`;
  `light.dimVisionPx`, `darkSilhouetteRangePx`, `lampRadiusPx`, the four
  room overlay alphas; `salvage.noiseRadius`; `throw.rangePx`;
  `molotov.widthPx`; `audio.zombieHearRadiusPx`; `moodles.panic.
  aggroedWithinPx`; `attacks.cue.bangFalloff.nearPx/farPx`;
  `attacks.tuning.arrivalXRange`; `tutorial.doorTriggerPx`;
  `generator.zombiesPerWingByDistance`, `zombieNoSpawnModulesFromFrontDoor`,
  `pairMinDistanceFromEntrancePx`, `guarantees.minFlatWingsPerFloor`;
  `home.startWing`; `inventory.stockpileSlots`, `shelfSlots` (M1 leftovers).
- Dark-until-entered rooms and dark-room object silhouettes (replaced by
  vision and memory).
- Room-order rules (`fixedFirst`, shuffle, `adjacent` as ordering) in
  templates: geometry now comes from blueprints; `adjacent` becomes a
  blueprint check.
- The old M2 Stage 2 ("wide floors") and Stage 3 / 4 plans (replaced by
  Stages A-D). Stage 2 work in progress for 3120 px floors
  (`public/data/levels/tower_m2.json`, wide-floor camera) is not merged.
- Pathing "via the stairwell" by tapping another floor (other floors are
  not visible); only the Home double tap paths across floors.

### 11.3 M2 delivery stages (iso rebuild)
M2 continues in 6 stages after the finished Stage 1. **Build order (CD
decision): A (done) -> C2 -> B -> C -> C3 -> D.** The HQ (C2) comes
right after Stage A, before the other floors, stairs, Mara and the
tutorial (B), before the generator (C) and before traps and guns (C3).
The letters are kept as names, not order. Each stage keeps `main`
playable, ends with a CD playtest, and builds only on finished stages.
**The side-view Stage 1 build stays on `main` until Stage A passes review
and QA**; Stage A work happens on a branch. Numbers refer to the
must-haves in 11.1.

**What C2 needs that was planned for B or C** (C2 builds these minimal
versions itself, all on floor 15 only; B and C later extend them):
- **Claim the floor** works on floor 15 alone: the trigger is "floor 15
  Cleared" (its own 3-5 Stage A zombies; no wanderers exist yet), the
  fire door action and the HQ claim need no other floor, no generator and
  no apartment claiming. Before the HQ claim, home = the start flat
  (Stage rules below); after it, main home = HQ, heart = the bed last
  slept in.
- **Attacks** come up the stairs as designed (5.8 / 5.20): attackers
  appear on floor 15's landing-end tile of the down flight, 3 s apart;
  no other floor needs to exist. C2 ports the Stage 1 attack schedule,
  strength A, cue timeline (groans, bangs, flicker) and the start flat's
  front-door barricade to iso (B's "attacks up the stairwell" item moves
  into C2). Before the HQ claim they target the start flat's door (max 3
  at the door, 5.8); after it, HQ rules (5.20). The scripted first attack
  starts **10 min after a New game** (no tutorial yet).
- **Stairs** stay blocked for the hero ("The stairs are blocked.").
- **Offline**: catch-up and the attack resolve run for floor 15 only
  (offline path defense, 5.20); the prose report is ported here (moved
  from B).
- **Loot and demolition** only on floor 15: hammer and sledgehammer come
  from floor 15 loot and the workbench recipes; sheet metal and concrete
  blocks from floor 15 demolition. "Demolition on any floor" applies once
  B adds floors.
- **Not in C2**: Mara, wanderers, the tutorial, other floors, the
  generator, apartment claiming elsewhere, traps, guns, lamps.

| Stage | Content | Must-haves | Done when (CD playtest checks) |
|---|---|---|---|
| **A. Iso engine, one floor** | Iso renderer with cutaway and fade; camera; grid movement and all touch gestures; vision (cone, close circle, LOS, memory, vignette, soft edges); base room light (grey/dim/dark, no lamps yet); doors (open/close, sight, zombie banging); **floor 15 only**, authored by level-designer from blueprints (start flat + 3 apartments + small unit), with ~25 of the existing objects, search/dismantle/drain and crafting working; 3-5 zombies with 8 facings, sight cones, hearing, door banging; combat with tile ranges and hit FX; muffled positional zombie sounds; save v2. Stairs show "The stairs are blocked." Attacks, tutorial and Mara are off. | 1, 2, 3, 4, 10, 15 (+ parts of 5, 7, 12, 13) | Moving, looking and tapping objects work one-thumbed (the right menu opens on 9 of 10 taps on any Visible object); it feels **claustrophobic but readable**: you can't see round corners, a closed door hides what's behind it, a zombie heard behind a door is scary; walls never hide the hero or a zombie in his view; 30+ fps on the CD's phone. |
| **C2. Headquarters (next, 2nd)** | Minimal attacks and offline resolve on floor 15 (above); HQ claim of floor 15 (5.19); edge model and save overrides; build mode (Build top-bar icon, edge cursor, piece selector, Main/Secondary rules, seal warning); hammer, sledgehammer recipes and loot; demolition on floor 15 with yields (any floor once B lands); wall tiers wood / sheet metal / block, door tiers, glass windows, boards, plating, barricades on any HQ door, repair; sheet metal recipe and chance yields; concrete blocks; rooms/vision/pathing/re-bake on change; HQ attacks: structure path costs, slots, entries by day, heart, online breach, offline path defense (5.20). New art: tier sprites, overlays, broken stub, Build icon, piece icons. Save fields added with defaults; Stage A saves keep working (no reset, 5.19). | 17, 18, 19 | Merge the start flat with the neighbour by knocking out the wall; wall off the corridor and fit a door; the first attacks hit the weakest spot you left, and by day 3 two places at once; nothing on screen needs text to understand; 30+ fps after 20 edge changes. |
| **B. The five floors (3rd)** | Floors 13-17 as authored data (`floors_iso.json`, 5.15) with all 30 objects; stairs between floors with the fade; attackers now physically come up from floor 14 (C2's landing spawn stays the arrival tile); Mara and her quest; wanderers (they can un-Clear floor 15 before the HQ claim, never undo it after); throwables in tiles; tutorial ported (door step, turn step, no arrows), placed before the HQ claim is offered; offline catch-up and report extended to all five floors; demolition on all floors; iso art for all props. Home = start flat, or the HQ once claimed. | 5, 7, 9, 12, 13, (14 tutorial) | A full session: wake, tutorial, scout two floors, fight, come home for the first attack; floors 13 and 17 feel fair (5.4 encounter targets); attackers are heard on the stairs before they are seen. |
| **C. Generator and homes (4th)** | Seeded generator on blueprints and templates (mirroring, conditions, fill rules, doors, zombies, guarantees, saved layout), keeping floor 15's HQ edge overrides; `blueprints.json` with 2+ per template; claiming, stashes, build spots, beds, main home by sleeping, Workbench recipe, barricade per claimed door, attacks target the main home (HQ or another claim), Leave this place. Save version bumped (older saves reset). | 6, 8 | Two New games give clearly different floors that still look designed; every floor has food and water; a claimed flat on floor 14 becomes the main home and gets attacked. |
| **C3. Traps and guns (5th)** | Spike strip and alarm lure (5.20); pistol and shotgun, ammo items and loot rules, pistol guarantee, gunshot noise with adjacent-floor responders, attack bonus, auto reload, empty-gun club, weapon quick-use swap; crowbar, hammer, sledgehammer, fire axe as weapons; gunshot SFX (CC0). | 20, 21 | A lure behind spike strips kills walkers without a fight; finding the pistol feels like a big moment and firing it feels like a mistake you sometimes have to make (zombies come up from the next floor). |
| **D. Light and story (6th)** | Tile light from lamps (pools with LOS), landing flicker outside the cue, oil lamp recipe and fuel, light changing vision and zombie sight; ~12 notes, flavour lines, thoughts; final tutorial polish; nice-to-haves only after the D playtest. | 11, 14 | A lamp-lit room glows from down a dark corridor and makes you feel seen; the first 90 s teach search, dismantle, craft, doors, turning and fighting without arrows or highlights. |

Stage rules:
- **Before Stage D** no lamps exist; tiles use only their room's base light
  (5.3), and oil lamp objects are plain salvage.
- **Before the HQ claim (or Stage C)** home is the start flat (floor 15,
  NW) with its 40-slot stash, its front-door barricade and its bed (the
  only bed with Sleep and Nap); attacks target it; the hero starts at, and
  Home returns to, that bed. **After the C2 HQ claim, main home = HQ**
  (5.19/5.20). Cleared = no living zombies on the floor.
- **Stage A** has no attacks, no tutorial (New game starts in the start
  flat's bedroom with one thought, "Dark in here."), no Mara; needs and
  moodles run normally; the start flat has its food and water.
- **Before Stage C2** walls can't be demolished, there is no build mode,
  and floor 15 has no claimable units yet. **Before Stage C3**
  there are no traps, no guns or ammo in loot, and crowbar/hammer/
  sledgehammer/fire axe can't be equipped (the fire axe arrives in C3,
  5.4). **Before Stage B** only floor 15 exists (C2 rules above).
- **Exterior windows** of floor 15 are never attacked until the M4
  climbers (5.20, H1 decided).
- Any incompatible change of save format inside M2 bumps the save
  version; an older save is deleted on launch with the one line "The
  building has changed." Additive fields with defaults (as in C2, 5.19)
  are not a format change: old saves keep working.

**Stage 1 playtest result (CD)**: the tower feels creepier, "better"; the
attack cue works as is (no change); floors 13 and 17 are fair (encounter
placement stays); nothing was confusing without text labels; bottom-bar
icons never show text (12). Follow-up request, implemented: zombie-hit
feedback (blood splash, per-weapon hit sounds, floor stains, drips, 5.4).

**Out of version 1**: ads, in-app purchases, accounts, cloud saves,
multiplayer or any online feature, push notifications, leaderboards,
multiple save slots, free placement of builds, outside-the-tower areas,
weather beyond rain on windows, temperature, vehicles, voice acting, more
than one pet, zombie smell and disguises, amputation, a minimap or map
screen, seeing more than one floor at a time.

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
- **Layout**: bigger, varied apartments; layouts and contents randomized
  per new game; items placed logically by room; any cleared apartment on
  any floor can be claimed as home.
- **UI**: moodles instead of need bars; no floating or damage numbers; no
  barricade HP numbers; tap a moodle for plain text.
- **Mood**: darker desaturated look with light pools and rain; quiet
  creepy sound; slow, heavy zombies in numbers; fewer, logically placed
  items and found notes; no loot sparkle.
- **Running**: running is fast, noisy and costs energy; walking is quiet
  (5.4). Since the Stage A playtest it is triggered by pushing the
  joystick past 70% (below), no longer by double tap.
- **Bottom-bar labels** (Stage 1 playtest): the bottom bar is icons only;
  no text label ever shows (not on first sessions, not on long-press).
- **Stage 1 feel** (playtest): the creepier mood, the 15 s attack cue and
  the floor 13 / 17 encounters are kept as they are.
- **Zombie-hit feedback**: dark blood splash away from the hero (smaller
  for fists), stab/blunt/punch hit sounds by weapon, fading floor stains,
  occasional drip after kills (5.4).
- **Isometric rebuild (CD direction change after Stage 1)**: switch now
  from the side cutaway to a Project Zomboid-like **isometric 2.5D view**
  with diamond floor tiles and walls with height that cut away near the
  hero; a feeling of **claustrophobia**. Side-view Stage 2 is stopped;
  everything that carries over is kept (11.2).
- **Field of view**: a **vision cone plus a small circle** around the hero;
  walls and doors block sight and cast shadows; zombies and items outside
  view are hidden but can be heard (5.17).
- ~~Controls: tap to move, double tap to run, tap-and-hold to look~~
  (replaced after the Stage A playtest, below).
- **Stage A playtest**: brightness fine, runs smoothly. Tap-to-move was
  hard ("hard to see target").
- **Controls (Stage A playtest)**: **floating virtual joystick** in the
  lower-left 55% of the screen, where the thumb lands; push to walk in
  the screen direction, past 70% to run, release to stop; the hero faces
  his movement and the cone follows; ~~tap objects, doors and zombies
  to auto-walk and act; drag outside the stick to look; tap the hero to
  turn~~ (replaced by context buttons, below); camera always follows, no
  manual pan (section 4).
- **Context buttons (joystick playtest)**: "The new joystick is much
  better than tapping on the screen. Keep all interaction in a joystick
  and buttons." The world is not touch-interactive. One big **Main**
  button that changes with what is in front of the hero (Open / Close /
  Search / Drain / Drink / Talk / Sleep / Craft / Attack when a zombie is
  close), a smaller **Secondary** button for the alternative (Dismantle /
  Close / Force / Shove ...), an always-present **Attack** button with the
  weapon icon, and a **Quick-use** slot for a chosen item (long-press to
  pick). The target gets a **subtle dark outline** (not glowing, not
  coloured) and the Main button shows its **icon, no text**. Menus (Bag,
  craft panel, Crew) stay tap-based (section 4).
- **Audio (Stage A playtest)**: no constant hum/buzz/drone; natural,
  irregular recorded sounds only; nothing arcade-like (no synth tones,
  chimes, blips or stingers); music stays sparse and acoustic. Sources are
  **CC0/public-domain field recordings only**, each logged with source
  URL, author and license in `public/assets/audio/CREDITS.md` (section 10).

- **Floor 15 sandbox** (CD direction): the **whole floor 15**, once
  cleared, becomes the HQ; interior walls (between rooms and between
  flats) can be knocked down with a sledgehammer and new walls, doors and
  windows built anywhere on the grid; outer walls and the stairwell shaft
  stay solid (5.19).
- **Guns are rare and loud** (CD): pistol, shotgun, maybe a hunting rifle;
  rare finds, scarce ammo, every shot heard across the floor and adjacent
  floors and draws zombies; a last resort (5.21).
- **Reinforcement, all of it** (CD): wall and door tiers (wood -> sheet
  metal -> block; reinforced/metal doors) with HP, boarded and
  metal-plated windows, inner defences (barricaded inner doors,
  chokepoints, spike traps, noise traps that lure attackers), waves that
  grow and try weak spots (5.20).

### Decided by the Creative Director for the HQ direction
- **Build order**: HQ (Stage C2) next, right after Stage A, before Stage B
  (other floors, stairs, Mara, tutorial), C and C3 (guns, traps). Order
  A -> C2 -> B -> C -> C3 -> D; what C2 borrows from B/C is listed in 11.3.
- **H1 Exterior windows**: yes, later. **Climber** zombies arrive in
  **M4** and break in through floor 15's outer windows, so outer window
  boards/plating matter then. Until M4 outer windows are never attacked
  (5.20).
- **H2 Guns**: pistol + shotgun in M2 (Stage C3), hunting rifle in M3 on
  deeper floors (5.21).
- **H3 Landing walls**: reinforce-only, as written: the player can't
  demolish or fit doors/windows in the 8 non-gate landing edges (corrected
  from 12: the landing's east side faces a void column, 5.19), only upgrade and
  plate them; zombies can break them; the 2-edge gate is free to build on.

### Decided by game-designer for the HQ direction (CD may revisit at playtest)
- HQ trigger: floor 15 Cleared, then Claim the floor at the stairwell fire
  door (5 s); HQ = all floor 15 units + corridor, counts as 1 claim and as
  Secured; one stash pool; heart = the bed last slept in.
- Landing walls (8 non-gate perimeter edges) can't be demolished or fitted by the
  player, only upgraded/plated; the 2-edge gate is free to build on.
  Zombies can break any perimeter edge (H3, CD confirmed above).
- Build mode via a 6th top-bar icon; the edge cursor is the side of the
  hero's own tile he faces (snapped to 4 directions); Quick-use becomes the
  piece picker; doors and windows only fitted into walls; materials taken
  at completion; sealing yourself in is warned, not blocked.
- Tiers: walls 150 / 320 / 600 HP, doors 100 / 250 / 450 HP, glass window
  30 HP, boards +80, plating +200; zombie damage x0.4 to all structures.
- Zombie pathing costs structures by HP (10 HP = 1 tile); 3 attackers per
  edge; waves split over 1/2/3 cheapest entries (days 0/3/6); offline
  defense = defense along the cheapest path, scaled by HP.
- Guns: pistol and shotgun in C3, rifle M3; tap-per-shot, auto reload,
  no unaware bonus, light affects hit chance; gunshots pull up to 4
  zombies from each adjacent floor up/down the stairs and add +2 (max +20)
  to the next attack; one pistol guaranteed per game on floor 13 or 17.

### Decided (Producer approved; CD may revisit at playtest)
- Scavenger job works only during offline catch-up (5.7).
- Scripted first attack 10 min after the tutorial (with the 15 s cue;
  C2: after New game, 11.3).
- Attackers keep hitting while the hero is away; they bite only on the
  attacked floor (5.8).
- Online repel +5 morale only if the barricade never broke (5.8).
- Hiding the app mid-attack settles the rest offline (5.8).
- Pass the torch drops the bag at the death spot (5.7).
- Survivor healing +4 health/h while upkeep is met; Treat from the Crew
  screen (5.7).
- M2 design choices by game-designer: M2 stays on floors 13-17; main home
  = where you last slept; max 3 claimed apartments; one stash per claimed
  apartment; attacks only target the main home; day/night, dog, infection,
  sickness, stove and power move to M3+ (11.1).

### Decided by game-designer for the iso rebuild (CD may revisit at playtest)
- Tile **96x48 game px** (32x16 art px at the existing 3x scale), wall
  height 120 px, characters 16x32 art px with 8 facings.
- Floor **30 x 22 tiles**: 2-wide corridor, central stairwell core, 4
  apartments (12x10) + 1 small unit (6x10) per floor.
- **Shadows from walls and closed/jammed doors only** (not furniture or
  barricades), for performance on mid-range phones.
- **Memory**: seen tiles stay as a dim, desaturated map with objects as
  last seen; zombies are never remembered.
- **Doors**: zombies can't open doors but bang them down (interior 60 HP,
  front 120 HP, x0.4 damage); the hero opens doors on his path but never
  closes them automatically.
- ~~Tap on the hero turns him around; a drag outside the stick zone
  looks~~ (removed with world touches). Context-button details (CD may
  revisit at playtest): target reach 1.2 tiles / +-60 degrees for things,
  weapon range / +-90 degrees for zombies, zombies always win, 15-degree
  angle buckets then distance, keep +0.3 tiles / +15 degrees, 0.15 s to
  switch, standing still keeps the target; actions are tap-to-start and
  done from where he stands (no walk to access tiles), the stick cancels
  (50% rule); objects with only Dismantle show it on Main, used-up main
  actions stay greyed so Main never dismantles by surprise; Attack swings
  at the air when nothing is in reach and repeats while held; Shove
  (0.5 tiles, 0.8 s stun, cancels wind-up, 2.5 s cooldown, 1 energy);
  quick-use: auto-default water/food/bandage, 1 s cooldown, "Not now."
  when nothing to restore, also throws (two taps, auto-aim); Look drag
  dropped, double tap in the stick zone turns around; buttons lower-right
  arc (Main 120 / Attack 96 / Secondary 88 / Quick-use 80 px), icon bar
  moved to the top-left; placement by walking to a spot and pressing
  Place; Home keeps its auto-walk.
- Joystick details (CD may revisit): three discrete gaits, creep / walk
  / run (not analog; creep added by CD decision below),
  free-angle movement with wall sliding and a doorway assist, pushing into
  a closed door for 0.2 s opens it; ~~a second finger can only attack an
  in-range zombie while moving, empty-floor taps show no marker~~ (world
  taps removed; the second finger now presses the action buttons).
- Camera-facing walls are cut for the hero's room and any room he can see
  into; other walls stay full height.
- Attackers: max 3 at the door at once (the corridor is narrow).
- Unseen zombies are **audio only**, plus doors that visibly rattle and the
  sound ripple (5.17).
- New stages A-D (11.3).

### Decided by the Creative Director for the iso rebuild
- **Zoom**: no zoom. Camera fixed at 1.0, no pinch zoom, no zoom toggle;
  one thumb only (`controls.zoom`).
- **Playing with the sound off**: a faint dark **sound ripple** at the edge
  of the vision area toward Noisy/Loud unseen sounds within hearing range,
  always on (not a setting), no icons (5.17, `vision.soundRipple.*`).
- **Left-handed players** (was open question 4): the stick zone is
  lower-left by default; a Menu setting "Stick: Left / Right" mirrors it
  to the lower-right, saved with the other settings (section 4,
  `controls.joystick.sideSettingDefault`).
- **Music** (was open question 5): keep the **3 rare, short acoustic
  pieces**, at most once per 15-25 min, only at quiet moments (section 10).
- **Creep** (was open question 6): a light push (below 40% of the stick
  radius, `controls.joystick.creepThreshold`) creeps at 0.5x walk speed,
  silently and harder to see (behind/beside sight 0.5 tiles, cone range
  x0.75); 40-70% walks; 70%+ runs (sections 4 and 5.4).
- **Looking around** (was open question 7): **turn in place**. A very
  light push (15% to below 25% of the stick radius,
  `controls.joystick.turnOnlyThreshold` 0.25) turns the hero to face that
  way without stepping; creep starts at 25%; the stick double tap still
  turns him 180 degrees (section 4).
- **Two attack buttons** (was open question 8): keep both. Main attacks
  when a zombie is the target; the dedicated Attack button stays
  (section 4).
- **Hero high on screen** (was open question 9): the camera keeps the
  hero above the control band, anchored at 40% of the visible height
  from the top (`camera.heroScreenYFrac` 0.40), look-ahead and clamp
  rect measured from that anchor (section 2).
- **Target outline on zombies** (was open question 10): slightly
  stronger than on objects, 4 px at alpha 0.75
  (`controls.target.outline.zombieWidthPx`, `zombieAlpha`), same dark
  colour, no colour or glow (section 4).

### Open questions
**HQ direction**: H1, H2, H3 and the build order are Decided (above).
- H4. **Tutorial after the HQ exists** (low priority, for when Stage B
   starts): C2 ships with no tutorial and the first attack 10 min after a
   New game. When B ports the tutorial: (a) tutorial first, the HQ claim
   only offered after it (current plan); (b) tutorial also teaches one
   build action (knock out one wall); (c) no change to the tutorial, the
   HQ is learned by doing.

**Older:**
1. **Backstory names** ("grey fever", "river docks" group): keep, rename,
   or also name the city/tower? (older, still open)
2. **Survivor healing feel** (5.7): (a) keep +4/h; (b) back to +2/h and
   rely on Treat; (c) +6/h so a breach costs about half a day. (older)
3. **Padlocked storage cages** (5.15, low priority, check at playtest):
   (a) keep crowbar-only (current); (b) also open by hand in 8 s, Loud;
   (c) cap a storage room at 3 cages so it feels less like a wall of locks.
   (older)
4. ~~Left-handed players~~: Decided (above).
5. ~~Music after the audio change~~: Decided (above).
6. ~~Walk speed with the stick~~: Decided, creep band (above). Check at
   playtest whether the 0.40 creep band feels too wide or too narrow.
7. ~~Looking around without walking~~: Decided, turn in place (above).
   Check at playtest whether the 0.15-0.25 turn band is easy to hit and
   whether the creep band (now 0.25-0.40) still feels wide enough.
8. ~~Two attack buttons~~: Decided, keep both (above).
9. ~~Hero high on screen~~: Decided, hero anchor at 40% from the top
   (above). Check at playtest; tune `camera.heroScreenYFrac` within
   0.38-0.42.
10. ~~Target outline on zombies~~: Decided, 4 px / alpha 0.75 (above).
    Check at playtest that it still reads as subtle next to the zombie's
    own 1 art px edge.
