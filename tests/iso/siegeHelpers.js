import { Grid } from '../../src/iso/grid.js';
import { Structures } from '../../src/gameplay/isoStructures.js';
import { Siege } from '../../src/gameplay/isoSiege.js';
import { isoZombieConfig, makeIsoEnv, makeIsoAi, fillOccupancy, stepIsoZombie, STEP_STRUCT } from '../../src/gameplay/isoZombies.js';
import { makeZombie } from '../../src/gameplay/zombies.js';
import { balance } from './hqHelpers.js';

/**
 * A small floor for path tests. `rows` are tile rows ('.' floor, '#' void); `walls` lists vertical (x, y between x-1 and x) and
 * horizontal edges as strings "x,y,W" / "x,y,N". Every wall is a block wall (600 HP) unless `tiers` names another tier.
 */
export function miniWorld(rows, walls = [], tiers = {}) {
  const w = rows[0].length;
  const h = rows.length;
  const grid = new Grid(w, h, { interiorHp: balance.doors.interiorHp, frontHp: balance.doors.frontHp });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid.kind[y * w + x] = rows[y][x] === '#' ? 0 : 1;
  for (let x = 0; x <= w; x++) for (let y = 0; y < h; y++) if (x === 0 || x === w || rows[y][x - 1] === '#' || rows[y][x] === '#') grid.setEdge(x, y, 'W', 1);
  for (let y = 0; y <= h; y++) for (let x = 0; x < w; x++) if (y === 0 || y === h || rows[y - 1][x] === '#' || rows[y][x] === '#') grid.setEdge(x, y, 'N', 1);
  const floor = { number: 99, grid, doors: [], objects: [], units: [], width: w, height: h };
  const st = new Structures(floor, balance);
  floor.structures = st;
  for (const k of walls) {
    const [x, y, s] = k.split(',');
    st.place({ x: +x, y: +y, side: s }, { piece: 'wall', tier: tiers[k] ?? 'block' });
  }
  return { floor, grid, st };
}

/**
 * Drive attackers through the real zombie AI against structures, as the scene does: hits go through structures.damageEid.
 * @returns {{zs:object[], ais:object[], env:object, siege:Siege, step:(dt:number)=>void, hits:Map<number,number>, log:object[]}}
 */
export function runSiege(floor, { spawn, goal, types = ['walker'], entries = 1, hero = null }) {
  const st = floor.structures;
  const siege = new Siege(st, balance);
  siege.begin(spawn, goal, entries);
  const cfg = isoZombieConfig(balance);
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const env = makeIsoEnv(floor.grid, cfg, rng);
  env.siege = siege;
  env.heroActive = !!hero;
  if (hero) { env.heroX = hero.x; env.heroY = hero.y; }
  const zs = [];
  const ais = [];
  const hits = new Map();
  const log = [];
  st.onChange((s, ev) => siege.onStructures(ev.structural));
  const add = (i) => {
    const z = makeZombie(`a${i}`, types[i], floor.number, spawn.x + 0.5, balance, { y: spawn.y + 0.5, siege: true, rsv: -1, facing: 90 });
    const ai = makeIsoAi(z, rng, cfg);
    ai.mode = 'siege';
    siege.assign(ai);
    zs.push(z); ais.push(ai);
  };
  let t = 0;
  const step = (dt) => {
    t += dt;
    siege.update(dt);
    fillOccupancy(env, zs);
    for (let i = 0; i < zs.length; i++) {
      const f = stepIsoZombie(zs[i], ais[i], env, dt);
      if (f & STEP_STRUCT) {
        const eid = env.structHit.eid;
        hits.set(eid, (hits.get(eid) ?? 0) + 1);
        const r = st.damageEid(eid, env.structHit.damage);
        log.push({ t, i, eid, ...r });
      }
    }
  };
  // arrivals 3 s apart, as the director does
  let spawned = 0;
  const arrive = (dt) => { if (spawned < types.length && (t >= spawned * 3)) add(spawned++); step(dt); };
  return { zs, ais, env, siege, step: arrive, hits, log, time: () => t };
}
