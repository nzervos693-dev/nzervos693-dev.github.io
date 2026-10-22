/**
 * Builds the target entries of the iso floor (zombies, doors, objects, piles, placement spots), runs the
 * pure TargetTracker (gameplay/isoTarget.js) every frame and drives the outline. The scene reads
 * `target` (a descriptor for gameplay/isoButtons.js) and `entry`.
 *
 * Entries are created once (static things) or reused (zombies, piles) so a frame allocates nothing.
 */
import { TargetTracker, targetConfig, bestZombie, doorEdgeRect, mountedEdgeRect } from '../gameplay/isoTarget.js';
import { footprintOf } from '../iso/loader.js';
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
    this.spots = [];
    this.pileEntries = new Map();
    this.zEntries = new Map();
    this.placing = null; // { spots: entry[] } while in placement mode
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
    const { world, grid } = this.scene;
    for (const door of world.doors) {
      const r = doorEdgeRect(door);
      const tiles = grid.doorTiles(door);
      this.statics.push({ id: door.id, kind: 'thing', ...r, tiles, target: { kind: 'door', door } });
    }
    for (const o of world.objects) {
      const kind = o.stash ? 'stash' : o.fixture ? 'workbench' : 'object';
      if (o.mounted) {
        const r = mountedEdgeRect(o.tile, o.facingAngle);
        this.statics.push({ id: o.id, kind: 'thing', ...r, tiles: [{ x: o.tile[0], y: o.tile[1] }], target: { kind, obj: o }, obj: o });
        continue;
      }
      const tiles = o.tiles ?? footprintOf(o.tile, o.span);
      this.statics.push({ id: o.id, kind: 'thing', x0: o.tile[0], y0: o.tile[1], x1: o.tile[0] + o.span[0], y1: o.tile[1] + o.span[1], tiles, target: { kind, obj: o }, obj: o });
    }
  }

  /** Is this static thing still around (not dismantled)? */
  live(e) {
    const { state } = this.scene;
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
    this.collect();
    const hero = scene.hero;
    const e = this.tracker.update(dt, hero, this.entries, this.ctx, f);
    if (e !== this.entry) {
      this.entry = e;
      this.target = e ? e.target : null;
      this.version++;
      this.outline.setTarget(e ? this.spriteOf(e) : null, !!e && e.kind === 'zombie');
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
      case 'door': { const d = view.doors.get(t.door.id)?.rec; return d ? (d.cut && d.stub ? d.stub : d.full) : null; }
      case 'spot': { const d = t.door ? view.doors.get(t.door.id)?.rec : null; return d ? (d.cut && d.stub ? d.stub : d.full) : null; }
      case 'pile': { const ps = view.pileSprites.find((q) => q.pile?.id === t.pile.id); return ps ? ps.sp : null; }
      default: return view.propById.get(t.obj.id)?.sp ?? null;
    }
  }

  destroy() { this.outline.destroy(); }
}
