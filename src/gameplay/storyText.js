/**
 * Story text (GDD sections 1, 5.7, 8). Plain strings, no numbers: tunables stay in balance.json.
 */

/** Intro cards over the dark apartment (GDD 1 backstory, GDD 8.2). */
export const INTRO_CARDS = [
  'Nine days ago the grey fever hit the city.\nThe tower was evacuated by bus.',
  'You had the flu and sleeping pills.\nYou slept through the sirens.',
  'You wake up alone on floor 15.\nSomething is scratching at the door.',
];

/** Tutorial hints (one line each, GDD 8.3). */
export const TUTORIAL_TEXT = {
  walk: 'You wake up. Tap the floor to walk.',
  fridge: 'Tap the fridge, then Search.',
  chair: 'Tap the chair to take it apart.',
  table: 'Now the table: tap it too.',
  drawer: 'Tap the kitchen drawer, then Search.',
  workbench: 'Tap the workbench. Craft Barricade Lv1.',
  door: 'Open the door: walk out.',
  fight: 'A crawler! Tap it to hit.',
};

/** Dialogue lines per survivor (short, GDD 5.7). */
export const DIALOGUE = {
  mara: {
    name: 'Mara',
    intro: [
      'Shh. Keep your voice down.',
      "I'm Mara. I was a nurse at the clinic.",
      'My medical bag is on floor 14, in the left flat. I dropped it running.',
      "Bring it back and I'll help you.",
    ],
    reminder: ['My bag is on floor 14, in the left flat.', 'Watch out for the crawler.'],
    refuse: ["You look worse than me.", "Come back when you've rested."],
    thanks: ["That's my bag! Thank you."],
    needBed: ['I need a bed first.', 'Build a Survivor bed at the workbench, then come back with my bag.'],
    join: ['Lead the way.', "I'll hold the home floor. Open Crew to give me a job."],
  },
};

/** Pass the torch card. */
export const torchLine = (name) => `You carry on as ${name}.`;
