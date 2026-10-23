/**
 * Builds the target entries of the iso floor (zombies, doors, objects, piles, placement spots), runs the
 * pure TargetTracker (gameplay/isoTarget.js) every frame and drives the outline. The scene reads
 * `target` (a descriptor for gameplay/isoButtons.js) and `entry`.
 *
 * Entries are created once (static things) or reused (zombies, piles, the edge cursor) so a frame allocates nothing.
 *
 * Build mode (GDD 5.19): zombies still win; objects are NOT targets; the only other target is the edge cursor,
 * the edge on the snapped side of the hero's tile (walls, doors, windows and gaps; none on shaft, void or exterior
 * edges except an exterior window). Outside build mode the stairwell fire door is a target once floor 15 can be claimed.
 */
import { TargetTracker, targetConfig, bestZombie, doorEdgeRect, mountedEdgeRect } from '../gameplay/isoTarget.js';
import { footprintOf } from '../iso/loader.js';
import { snapSide, edgeInFront, isEdgeTargetable } from '../gameplay/isoBuildMode.js';
import { isHqClaimed } from '../gameplay/isoHq.js';
import TargetOutline from './TargetOutline.js';

export default class IsoTargeting {
  /** @param {import('./IsoGameScene.js').default} scene */
  constructor(scene) {
    this.scene = scene;
    this.cfg = targetConfig(scene.balance);
    this.tracker = new TargetTracker(this.cfg);
    this.outline = new TargetOutline(scene, this.cfg.outline);
    this.entries = [];
    this.statics = [];
    this.doorEntries = new Map(); // door object -> entry (doors can be fitted and demolished: read from the floor each frame)
    this.spots = [];
    this.pileEntries = new Map();
    this.zEntries = new Map();
    this.placing = null; // { spots: entry[] } while in placement mode
    this.buildMode = false;
    this.side = null; // snapped grid side of the edge cursor
    this.cursor = { x: 0, y: 0, side: 'N' };
    this.edgeEntry = { id: 'edge', kind: 'edge', x: 0, y: 0, eid: -1, edge: { x: 0, y: 0, side: 'N' }, target: { kind: 'edge', edge: null } };
    this.edgeEntry.target.edge = this.edgeEntry.edge;
    this.edgeEid = -1;
    this.edgeRev = -1;
    this.edgeBake = -1;
    this.doorBake = -1;
    this.cursorOk = false;
    this.cursorRev = -1;
    this.locked = false;
    this.entry = null;
    this.target = null;
    this.version = 0;
    this.ctx = {
      weaponRange: 1.5,
      visible: (x, y) => scene.vision.isVisible(x, y),
      los: (ax, ay, bx, by) => scene.grid.hasLOS(ax, ay, bx, by),
    };
    this.buildStatics();
  }

  buildStatics() {
    const { world } = this.scene;
    const scene = this.scene;
    const gate = (scene.balance.hq?.gateEdges ?? []).map((k) => k.split('.').map((v) => (v === 'N' || v === 'W' ? v : +v)));
    if (gate.length && gate.every((g) => g[2] === 'N')) {
      const xs = gate.map((g) => g[0]);
      const y = gate[0][1];
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs) + 1;
      const tiles = [];
      for (let x = x0; x < x1; x++) tiles.push({ x, y: y - 1 }, { x, y });
      this.statics.push({ id: 'claim', kind: 'thing', x0, y0: y, x1, y1: y, tiles, target: { kind: 'claim' } });
    }
    for (const o of world.objects) this.addObject(o);
  }

  /** Make an object a target (also for a stash the HQ claim puts on the floor). */
  addObject(o) {
    const kind = o.stash ? 'stash' : o.fixture ? 'workbench' : 'object';
    if (o.mounted) {
      const r = mountedEdgeRect(o.tile, o.facingAngle);
      this.statics.push({ id: o.id, kind: 'thing', ...r, tiles: [{ x: o.tile[0], y: o.tile[1] }], target: { kind, obj: o }, obj: o });
      return;
    }
    const tiles = o.tiles ?? footprintOf(o.tile, o.span);
    this.statics.push({ id: o.id, kind: 'thing', x0: o.tile[0], y0: o.tile[1], x1: o.tile[0] + o.span[0], y1: o.tile[1] + o.span[1], tiles, target: { kind, obj: o }, obj: o });
  }

  /** Is this static thing still around (not dismantled)? */
  live(e) {
    const { state } = this.scene;
    if (e.target.kind === 'claim') return !isHqClaimed(state) && this.scene.world.number === this.scene.balance.hq.floor;
    if (e.target.kind === 'door') return !state.objects[e.id]?.dismantled;
    return !state.objects[e.id]?.dismantled;
  }

  /** Enter placement mode with these spots (entries {id, ...rect, tiles, spot:true, target}); null leaves it. */
  setPlacement(spots) {
    this.placing = spots ? { spots } : null;
    this.tracker.reset();
    this.entry = null;
    this.target = null;
  }

  /** Enter or leave build mode (the edge cursor replaces the objects as targets). */
  setBuildMode(on) {
    if (on === this.buildMode) return;
    this.buildMode = on;
    this.side = null;
    this.edgeEid = -1;
    this.edgeRev = -1;
    this.edgeEntry.eid = -1;
    this.cursorRev = -1;
    this.cursorOk = false;
    this.tracker.reset();
    this.entry = null;
    this.target = null;
    this.version++;
  }

  /** Follow the hero's facing: the snapped side, the edge in front, and whether it is a target. @returns {boolean} targetable */
  updateCursor() {
    const { scene } = this;
    const hero = scene.hero;
    this.side = snapSide(this.side, hero.facing, scene.balance.build.facingSnapHysteresisDegrees);
    const c = edgeInFront(Math.floor(hero.x), Math.floor(hero.y), this.side, this.cursor);
    const st = scene.world.structures;
    const ee = this.edgeEntry;
    ee.edge.x = c.x; ee.edge.y = c.y; ee.edge.side = c.side;
    const eid = scene.grid.edgeId(c.x, c.y, c.side);
    if (eid === ee.eid && st.revision === this.cursorRev) return this.cursorOk; // same edge, nothing changed: no lookups
    ee.eid = eid;
    this.cursorRev = st.revision;
    return isEdgeTargetable(st, c.x, c.y, c.side);
  }

  /** Rebuild the candidate list for this frame. */
  collect() {
    const { scene } = this;
    const out = this.entries;
    out.length = 0;
    for (const rt of scene.zombies.list) {
      if (rt.dying || !rt.visible) continue;
      let e = this.zEntries.get(rt.rec.id);
      if (!e) { e = { id: rt.rec.id, kind: 'zombie', x: 0, y: 0, rt, target: { kind: 'zombie', id: rt.rec.id, rt } }; this.zEntries.set(rt.rec.id, e); }
      e.x = rt.rec.x;
      e.y = rt.rec.y;
      e.rt = rt;
      e.target.rt = rt;
      out.push(e);
    }
    if (this.placing) { for (const s of this.placing.spots) out.push(s); return; }
    if (this.buildMode) {
      this.cursorOk = this.locked ? this.cursorOk : this.updateCursor(); // frozen while a timed action runs
      if (this.cursorOk) out.push(this.edgeEntry);
      return;
    }
    if (this.doorBake !== scene.view.bakeCount) { // a re-bake: forget the entries of doors that are gone
      this.doorBake = scene.view.bakeCount;
      for (const d of this.doorEntries.keys()) if (scene.grid.doors.get(d.edge) !== d) this.doorEntries.delete(d);
    }
    for (const door of scene.world.doors) {
      if (scene.state.objects[door.id]?.dismantled) continue;
      let e = this.doorEntries.get(door);
      if (!e) {
        e = { id: door.id, kind: 'thing', ...doorEdgeRect(door), tiles: scene.grid.doorTiles(door), target: { kind: 'door', door } };
        this.doorEntries.set(door, e);
      }
      out.push(e);
    }
    for (const e of this.statics) if (this.live(e)) out.push(e);
    for (const p of scene.state.piles) {
      let e = this.pileEntries.get(p.id);
      if (!e) { e = { id: p.id, kind: 'thing', x0: 0, y0: 0, x1: 1, y1: 1, tiles: [{ x: 0, y: 0 }], target: { kind: 'pile', pile: p } }; this.pileEntries.set(p.id, e); }
      const tx = Math.floor(p.x);
      const ty = Math.floor(p.y);
      e.x0 = tx; e.y0 = ty; e.x1 = tx + 1; e.y1 = ty + 1;
      e.tiles[0].x = tx; e.tiles[0].y = ty;
      e.target.pile = p;
      out.push(e);
    }
  }

  /**
   * One frame.
   * @param {{held:boolean, locked:boolean, suppress:boolean}} f suppress = no target at all (panel, sleep)
   */
  update(dt, f) {
    const { scene } = this;
    this.ctx.weaponRange = scene.weaponRange(scene.currentWeapon());
    if (f.suppress) {
      if (this.entry) { this.tracker.reset(); this.entry = null; this.target = null; this.outline.clear(); }
      this.outline.update(dt);
      return;
    }
    this.locked = f.locked;
    this.collect();
    const hero = scene.hero;
    const e = this.tracker.update(dt, hero, this.entries, this.ctx, f);
    if (e && e.kind === 'edge') {
      // the same entry stays the target while the cursor moves: announce a new edge, and a re-baked wall layer
      const ee = this.edgeEntry;
      const rev = scene.world.structures.revision;
      if (ee.eid !== this.edgeEid || rev !== this.edgeRev || this.edgeBake !== scene.view.bakeCount) {
        this.edgeEid = ee.eid;
        this.edgeRev = rev;
        this.edgeBake = scene.view.bakeCount;
        this.version++;
        this.outline.setTarget(scene.view.edgeSprite(ee.eid), false);
      }
    }
    if (e !== this.entry) {
      this.entry = e;
      this.target = e ? e.target : null;
      this.version++;
      this.outline.setTarget(e ? this.spriteOf(e) : null, !!e && e.kind === 'zombie');
    } else if (e && e.kind === 'edge') {
      const sp = scene.view.edgeSprite(this.edgeEntry.eid);
      if (sp !== this.outline.sprite) this.outline.setTarget(sp, false); // the wall is cut or restored as he moves
    } else if (e && e.kind === 'thing' && e.target.kind === 'door') {
      // a door's drawn sprite swaps between the full wall and the stub as the wall is cut
      const sp = this.spriteOf(e);
      if (sp && sp !== this.outline.sprite) this.outline.setTarget(sp, false);
    }
    this.outline.update(dt);
  }

  /** The best zombie candidate right now (Attack while an action locks the target). */
  zombieCandidate() {
    this.collect();
    this.ctx.weaponRange = this.scene.weaponRange(this.scene.currentWeapon());
    return bestZombie(this.scene.hero, this.entries, this.cfg, this.ctx);
  }

  /** The sprite to outline for an entry. */
  spriteOf(e) {
    const { view } = this.scene;
    const t = e.target;
    switch (t.kind) {
      case 'zombie': return t.rt.sp;
      case 'edge': return view.edgeSprite(e.eid);
      case 'claim': return null;
      case 'door': { const d = view.doors.get(t.door.id)?.rec; return d ? (d.cut && d.stub ? d.stub : d.full) : null; }
      case 'spot': { const d = t.door ? view.doors.get(t.door.id)?.rec : null; return d ? (d.cut && d.stub ? d.stub : d.full) : null; }
      case 'pile': { const ps = view.pileSprites.find((q) => q.pile?.id === t.pile.id); return ps ? ps.sp : null; }
      default: return view.propById.get(t.obj.id)?.sp ?? null;
    }
  }

  destroy() { this.outline.destroy(); }
}
