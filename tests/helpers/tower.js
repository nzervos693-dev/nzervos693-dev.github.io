/** Shared test setup: the authored stage 2 tower (tower_m2.json) indexed with the real balance. */
import towerData from '../../public/data/levels/tower_m2.json';
import templates from '../../public/data/levels/templates.json';
import { buildTower } from '../../src/gameplay/layout.js';

export { towerData, templates };

/** Fresh tower index for a balance object. */
export const makeTower = (balance) => buildTower(towerData, balance, templates);
