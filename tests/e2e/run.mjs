/** Runs every e2e script (each has its own port), even if one fails, and exits non-zero if any did. */
import { spawnSync } from 'node:child_process';

// combat.mjs, craft.mjs and story.mjs drove the retired side-view GameScene (scene key "Game") and are no longer run
const scripts = ['smoke', 'iso', 'iso-qa', 'iso-hq', 'iso-build', 'iso-build-qa', 'iso-attack', 'iso-attack-qa', 'update', 'update-migrate'];
const results = scripts.map((n) => {
  console.log(`\n=== e2e: ${n} ===`);
  const r = spawnSync('node', [`tests/e2e/${n}.mjs`], { stdio: 'inherit' });
  return [n, r.status];
});
console.log('\n' + results.map(([n, c]) => `${c === 0 ? 'OK  ' : 'FAIL'} ${n}`).join('\n'));
process.exit(results.some(([, c]) => c !== 0) ? 1 : 0);
