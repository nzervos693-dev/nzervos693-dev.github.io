# Audio credits

GDD section 10: every audio file shipped in the game is listed here. A file without a line does not ship.
Only CC0 / public-domain sources are allowed (no CC-BY, no "free for games" licences).

Status: the files in the first table are an interim set generated in code (no recordings could be downloaded yet).
They are being replaced by real CC0 recordings via `node scripts/fetch-audio.mjs` (sources in scripts/audio-sources.json).
Replaced files move to the second table automatically.

## Generated in-house (interim)

<!-- GENERATED:START -->
| File | What | Source | Author | License | Edits |
|---|---|---|---|---|---|
| ui_tap.ogg | Panel open / button tap: a faint paper rustle (GDD 10: very quiet, uiVolume 0.2) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_wood_1.ogg | Hero footstep on wood (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_wood_2.ogg | Hero footstep on wood (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_wood_3.ogg | Hero footstep on wood (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_tile_1.ogg | Hero footstep on tile (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_tile_2.ogg | Hero footstep on tile (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_tile_3.ogg | Hero footstep on tile (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_carpet_1.ogg | Hero footstep on carpet (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_carpet_2.ogg | Hero footstep on carpet (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_carpet_3.ogg | Hero footstep on carpet (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_concrete_1.ogg | Hero footstep on concrete (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_concrete_2.ogg | Hero footstep on concrete (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| footstep_concrete_3.ogg | Hero footstep on concrete (3 variations, pick at random, pitch x0.95-1.05) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| step_1.ogg | Legacy hero step (wood); use footstep_<surface>_N | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| step_2.ogg | Legacy hero step (wood); use footstep_<surface>_N | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| stairs.ogg | Hero changes floor via stairs (five steps, concrete stairwell) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| door_open.ogg | Door opens (floor door or apartment): latch, hinge creak, soft stop | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| door_close.ogg | Door closes: short hinge creak, wooden clack and latch | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| door_creak.ogg | Door hinge creaking on its own or while held ajar (slow, long) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| door_hit.ogg | Jammed or locked door hit / zombie pounds a door | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| door_bang.ogg | Zombie bangs on a door from outside: heavy wood hit, frame rattle, small bounce | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| search_cupboard.ogg | Search a cupboard/cabinet: door scrape, wood knock, things shifted | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| search_drawer.ogg | Search a drawer: wood slide, contents rattle and shift | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| search_cloth.ogg | Search clothes / bedding: cloth rummage | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| search.ogg | Search / scavenge rummage (generic, start of search): shifting cloth, small objects | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| dismantle_wood.ogg | Dismantle a wooden object: nail squeal, wood crack, drop | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| dismantle_metal.ogg | Dismantle a metal object: scrape of bent metal, two dull clanks | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| drain.ogg | Drain / collect water: pouring and glugging bubbles | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| pickup.ogg | Item added to inventory: soft cloth/handling, no chime | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| eat.ogg | Use food item (eat): crunchy bites and chewing | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| drink.ogg | Use drink item (drink): lip slosh and three swallows | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| craft.ogg | Craft / build completes: cloth/tape rustle then two wooden taps | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| swing.ogg | Melee swing starts: air moving past a held object | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| hit_flesh.ogg | Player melee or thrown hit lands on a zombie | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| hit_stab_1.ogg | Stab weapon hits a zombie: puncture + wet squelch (1..3) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| hit_stab_2.ogg | Stab weapon hit (variation, deeper squelch) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| hit_stab_3.ogg | Stab weapon hit (variation, shorter and brighter) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| hit_blunt_1.ogg | Blunt weapon hits a zombie: heavy wet thud + dull crack (1..3) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| hit_blunt_2.ogg | Blunt weapon hit (variation, deeper) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| hit_blunt_3.ogg | Blunt weapon hit (variation, sharper crack) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| hit_punch_1.ogg | Fists hit a zombie: dull fleshy punch (1..2) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| hit_punch_2.ogg | Fists hit (variation) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| weapon_break.ogg | Weapon durability hits zero: snap, splinters, pieces dropping | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| glass_shatter.ogg | Glass breaks (molotov lands, window smash): crack + shower of shards | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| glass_tinkle.ogg | Ambient one-shot: small glass pieces settling somewhere | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| fire_whoosh.ogg | Molotov ignites / fire bursts: gas catching with a roar and crackle | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| zombie_groan_1.ogg | Zombie idle / spotted you (groan) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| zombie_groan_2.ogg | Zombie idle / aggro (lower, longer groan) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| zombie_hit.ogg | Zombie attacks / bites the hero: rasping lunge | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| zombie_death.ogg | Zombie killed: a last rattling breath, then the body slumps | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| hero_hurt.ogg | Hero takes damage: a short pained grunt | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| zombie_breath_1.ogg | Near zombie: wet exhale through a damaged throat | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| zombie_breath_2.ogg | Near zombie: slower rattling breath in, then out | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| zombie_shuffle.ogg | Near zombie: dragging shuffle, 2 steps | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| distant_groan_1.ogg | Far-away groan, 45-120 s apart; hides the attack cue. Pick randomly of 1..4 | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| distant_groan_2.ogg | Far-away groan (lower, long) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| distant_groan_3.ogg | Far-away groan (higher, shorter) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| distant_groan_4.ogg | Far-away groan (two-part moan) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| barricade_hit.ogg | Zombies hit a barricade: boards thump and shift | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| barricade_break.ogg | A barricade is destroyed: planks crack, splinter and fall | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| amb_wind.ogg | Wind gusting past the building: broadband filtered noise, irregular non-periodic swells. Loop; quiet | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| amb_rain.ogg | Rain on a window: dense droplets + soft roof patter. Loop; louder near windows | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| stair_bang_1.ogg | Attack cue (T-8 s): single heavy muffled bang from the stairwell below | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| stair_bang_2.ogg | Attack cue: two bangs, slightly uneven | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| stair_bang_3.ogg | Attack cue: three bangs, building | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| stair_shuffle.ogg | Loop: many feet shuffling in the stairwell, muffled. Fade in with the attack cue, out when it ends | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| creak_1.ogg | Ambient one-shot: floorboard creak (long gaps) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| creak_2.ogg | Ambient one-shot: slow door hinge creak somewhere | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| creak_3.ogg | Ambient one-shot: short wood settling | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| muffled_thud_1.ogg | Ambient one-shot: distant thud from another floor | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| muffled_thud_2.ogg | Ambient one-shot: double thump far off | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| pipe_knock_1.ogg | Ambient one-shot: pipe knocks twice | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| pipe_knock_2.ogg | Ambient one-shot: pipe tick-tick-knock (cooling metal) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| heartbeat_soft.ogg | Low-health loop: soft heartbeat felt more than heard | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| moodle_stomach.ogg | Hungry moodle: stomach growl (gurgling, no pitch) | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| moodle_swallow.ogg | Thirsty moodle: dry swallow | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| moodle_yawn.ogg | Tired moodle: a yawn | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| moodle_pain.ogg | Injured moodle: pained breath in through the teeth | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| moodle_sigh.ogg | Low-spirits moodle: a long sigh | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| moodle_panic.ogg | Panic moodle: quiet fast heartbeat, ~2 s one-shot | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| blood_drip.ogg | Quiet one-shot: a few drips on the floor after a hit/kill | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| music_sad_1.ogg | Sparse sad piece, one-shot (not looped); on quiet moments only (first claim, after attack ends, survivor joins). Never in danger. Piano model, A minor, ~55 s | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| music_sad_2.ogg | Sparse sad piece, one-shot (not looped); on quiet moments only (first claim, after attack ends, survivor joins). Never in danger. Low plucked strings (harp/kantele-like Karplus-Strong), D minor, ~42 s | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
| music_sad_3.ogg | Sparse sad piece, one-shot (not looped); on quiet moments only (first claim, after attack ends, survivor joins). Never in danger. Fingerpicked nylon guitar model (Karplus-Strong + body), E minor, ~32 s | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono 22050 Hz, peak-normalized, OGG Vorbis |
<!-- GENERATED:END -->

## Recorded CC0 / public domain

<!-- RECORDED:START -->
| File | What | Source URL | Author | License | Edits |
|---|---|---|---|---|---|
| (none yet) | | | | | |
<!-- RECORDED:END -->
