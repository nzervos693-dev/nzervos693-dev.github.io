/**
 * Death and game over rules (GDD 5.7, 5.9). Pure, no Phaser.
 */

/** Ids of recruited survivors that are alive (candidates for pass the torch). */
export function livingSurvivors(state) {
  return Object.entries(state.survivors || {})
    .filter(([, s]) => s && s.recruited && !s.dead)
    .map(([id]) => id);
}

const DAY_MS = 24 * 3600 * 1000;

/** Whole 24 h periods since New game. */
export const daysSurvived = (state, nowMs) => Math.max(0, Math.floor((nowMs - (state.times?.startedAt ?? nowMs)) / DAY_MS));

/**
 * Numbers for the game over screen.
 * @returns {{days:number, floors:number, zombies:number, salvaged:number}}
 */
export function gameOverStats(state, nowMs) {
  const floors = Object.values(state.floorStates || {}).filter((s) => s === 'Cleared' || s === 'Secured').length;
  return {
    days: daysSurvived(state, nowMs),
    floors,
    zombies: state.stats?.zombiesKilled || 0,
    salvaged: state.stats?.objectsSalvaged || 0,
  };
}
