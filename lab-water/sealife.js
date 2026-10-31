// Sea life around the island, in sites: the Cutis-Maku colony with a walking Nih-Dairia on
// the seabed off the lee shore, a Filament deeper along the slope, a Cutis-gorogoro pack
// rolling on the awash sand, and crawlers (slugs, a flat snake) on the dry beach. The
// creatures are lab-creatures' own runtimes (vendor/lab-creatures, GPL-3.0; see its
// UPSTREAM.md): the membranes are GPU-instanced; the walkers and crawlers are CPU soft
// bodies in WASM, so only those within `simRadius` of the camera are stepped.
import * as THREE from 'three';
import { DEFAULT_CONFIG } from '../vendor/lab-creatures/cutis/swarm/config.js';
import { CutisSwarm } from '../vendor/lab-creatures/cutis/swarm/controller.js';
import { createSwarmGeometry } from '../vendor/lab-creatures/cutis/creature/geometry.js';
import { createHardCores } from '../vendor/lab-creatures/cutis/creature/hard-core.js';
import { createWalker, createCrawler, createGorogoro, tuneAggression, swarmContacts } from './creatures.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3();

export class SeaLife {
  constructor({ patchMaterial } = {}) {
    this.params = {
      cutisCount: 6, cutisScale: 2.5, mixedTiers: true, lureRange: 2.2, lureSpeed: 0.22,
      gorogoroCount: 4, slugCount: 2, walkerScale: 24, crawlerScale: 11, simRadius: 160,
      // the scent: every creature within this range of the sphere turns toward it and comes;
      // aggression scales the Cutis lineage's hunting urgency (1 = the lab's own)
      scentRadius: 60, aggression: 1.8, crawlersApproach: true,
    };
    this.hits = [];           // the contacts found by the last collide()
    this.group = new THREE.Group();   // sits at the colony; the other sites are children with offsets
    this.group.name = 'Sea life';
    this.ready = false;
    this.patchMaterial = patchMaterial;
    this.time = 0;
    this.accumulator = 0;
    this.lure = { x: 1.3, z: 0.6 };
    this.chasing = false;
    this.cutis = null;
    this.sites = [];          // { id, label, world: Vector3, node: Group, creatures: [] }
    this.creatures = [];      // every soft-body / pack creature, with its site
    this.simulated = 0;
    this.cameraProxy = { fov: 50, position: new THREE.Vector3() };
  }

  async load() {
    const P = this.params, patch = this.patchMaterial;
    // --- the colony: Cutis-Maku swarm in its own scaled frame, plus the walking Nih-Dairia
    const config = { ...DEFAULT_CONFIG };
    const swarm = new CutisSwarm(config);
    tuneAggression(swarm, P.aggression);
    swarm.reset(P.cutisCount);
    swarm.setMixed(P.mixedTiers);
    const model = createSwarmGeometry(swarm), cores = createHardCores(swarm);
    for (const m of cores.meshes) patch?.(m.material);
    const frame = new THREE.Group();
    frame.name = 'Cutis-Maku frame';
    frame.scale.setScalar(P.cutisScale);
    frame.add(model.group, cores.group);
    this.cutis = { swarm, model, cores, frame, config };
    const colony = this._site('colony', 'Cutis-Maku colony · Nih-Dairia', new THREE.Vector3());
    colony.node.add(frame);

    const [nih, filament, slugA, slugB, snake] = await Promise.all([
      createWalker('nih-dairia', { patchMaterial: patch, scale: P.walkerScale }),
      createWalker('filament', { patchMaterial: patch, scale: P.walkerScale }),
      createCrawler('slug', { patchMaterial: patch, scale: P.crawlerScale, seed: 1 }),
      createCrawler('slug', { patchMaterial: patch, scale: P.crawlerScale, seed: 2 }),
      createCrawler('flat-snake', { patchMaterial: patch, scale: P.crawlerScale, range: 0.8, seed: 3 }),
    ]);
    this._add(colony, nih, 0, 0);
    const deep = this._site('deep', 'Filament · deep slope', new THREE.Vector3());
    this._add(deep, filament, 0, 0);
    const shallows = this._site('shallows', 'Cutis-gorogoro · awash sand', new THREE.Vector3());
    this._add(shallows, createGorogoro(P.gorogoroCount, { patchMaterial: patch, scale: P.cutisScale, aggression: P.aggression }), 0, 0);
    const beach = this._site('beach', 'Slugs and a Flat Snake · dry beach', new THREE.Vector3());
    this._add(beach, slugA, -6, 2); this._add(beach, slugB, 5, -3); this._add(beach, snake, 0, -9);
    if (P.slugCount < 2) slugB.group.visible = false;
    this.ready = true;
    this.applyParams();
  }

  _site(id, label, world) {
    const node = new THREE.Group();
    node.name = `site ${id}`;
    this.group.add(node);
    const site = { id, label, world, node, creatures: [] };
    this.sites.push(site);
    return site;
  }
  _add(site, creature, dx, dz) {
    creature.group.position.set(dx, 0, dz);
    site.node.add(creature.group);
    site.creatures.push(creature);
    this.creatures.push(Object.assign(creature, { site, offset: new THREE.Vector3(dx, 0, dz) }));
  }

  // Lay the sites out around the island from a bearing (the lee side) and a height function.
  // The colony sits where the seabed reaches -7 m; the others at their own depths and
  // bearings. Each creature then gets the ground height at its own spot, so a slug on the
  // beach stands on the sand and the Filament on its slope.
  place(islandHeight, bearing) {
    const find = (a, target, from = 100) => {
      let best = from, err = Infinity;
      for (let r = from; r < 1000; r += 1) { const h = islandHeight(Math.cos(a) * r, Math.sin(a) * r); const e = Math.abs(h - target); if (e < err) { err = e; best = r; } if (h < target - 6) break; }
      return new THREE.Vector3(Math.cos(a) * best, islandHeight(Math.cos(a) * best, Math.sin(a) * best), Math.sin(a) * best);
    };
    const colony = find(bearing, -7);
    this.group.position.copy(colony);
    this.group.position.y += 0.05;
    this.group.rotation.y = -bearing;
    this.group.updateMatrixWorld(true);
    const targets = { colony, deep: find(bearing + 0.35, -12), shallows: find(bearing - 0.45, 0.35), beach: find(bearing + 0.55, 2.6) };
    for (const site of this.sites) {
      site.world.copy(targets[site.id]);
      site.node.position.copy(this.group.worldToLocal(site.world.clone()));
      site.node.rotation.y = 0;
      site.node.updateMatrixWorld(true);
      for (const c of site.creatures) {
        if (c.kind === 'gorogoro' || c === this.cutis) continue;
        // ground under this creature's own spot
        c.group.getWorldPosition(_w);
        const y = islandHeight(_w.x, _w.z) + 0.02;
        c.group.position.y = y - site.world.y + 0.02;
      }
    }
    this.group.updateMatrixWorld(true);
  }

  siteWorld(id) { return this.sites.find((s) => s.id === id)?.world ?? this.group.position; }

  applyParams() {
    const P = this.params;
    if (this.cutis) {
      const { swarm, frame } = this.cutis;
      frame.scale.setScalar(P.cutisScale);
      if (swarm.count !== P.cutisCount) swarm.reset(P.cutisCount);
      if (swarm.mixed !== P.mixedTiers) swarm.setMixed(P.mixedTiers);
    }
    for (const c of this.creatures) {
      if (c.kind === 'walker') c.group.scale.setScalar(P.walkerScale);
      else if (c.kind === 'crawler') c.group.scale.setScalar(P.crawlerScale);
      else if (c.kind === 'gorogoro') { c.group.scale.setScalar(P.cutisScale); if (c.swarm.count !== P.gorogoroCount) c.swarm.reset(P.gorogoroCount); }
    }
    const slugs = this.creatures.filter((c) => c.variant === 'slug');
    slugs.forEach((s, i) => (s.group.visible = i < P.slugCount));
    for (const c of this.creatures) {
      if (c.kind === 'crawler') c.approach = P.crawlersApproach;
      if (c.swarm && c.swarm.aggressionScale !== P.aggression) tuneAggression(c.swarm, P.aggression);
    }
    if (this.cutis && this.cutis.swarm.aggressionScale !== P.aggression) tuneAggression(this.cutis.swarm, P.aggression);
  }

  // robotWorld: the sphere's world position, or null. cameraWorld gates the soft-body sims.
  step(dt, robotWorld, cameraWorld) {
    if (!this.ready) return;
    const P = this.params, { swarm, frame } = this.cutis;
    this.time += dt;
    // the colony's lure: the robot when it is near, otherwise a slow wander
    let target = null;
    if (robotWorld) {
      const local = frame.worldToLocal(_v.copy(robotWorld));
      if (Math.hypot(local.x, local.z) < P.scentRadius / P.cutisScale) target = { x: local.x, z: local.z };
    }
    this.chasing = !!target;
    if (!target) {
      const t = this.time * P.lureSpeed;
      this.lure.x = Math.sin(t * 0.9 + 0.9) * P.lureRange; this.lure.z = Math.cos(t * 1.3) * P.lureRange * 0.7;
      target = this.lure;
    }
    this.accumulator = Math.min(this.accumulator + dt, 0.25);
    while (this.accumulator >= 1 / 120) { swarm.step(1 / 120, target); this.accumulator -= 1 / 120; }

    // the soft bodies and the pack: stepped only near the camera, hunting or fleeing the robot when it is near
    this.simulated = 0;
    for (const c of this.creatures) {
      if (!c.group.visible) continue;
      c.group.getWorldPosition(_w);
      if (cameraWorld && _w.distanceTo(cameraWorld) > P.simRadius) continue;
      let preyLocal = null;
      if (robotWorld) {
        const local = c.group.worldToLocal(_v.copy(robotWorld));
        if (Math.hypot(local.x, local.z) < P.scentRadius / c.scale) preyLocal = local;
      }
      c.step(dt, preyLocal);
      if (preyLocal && c.kind !== 'crawler') this.chasing = true;
      this.simulated++;
    }
  }

  // The sphere against every creature near enough to matter. Returns hits in world space:
  // { point, normal (creature -> sphere), depth (m), creature, label }. Sorted deepest first.
  collide(robotWorld, radius, out = this.hits) {
    out.length = 0;
    if (!this.ready || !robotWorld) return out;
    const P = this.params, { swarm, frame } = this.cutis;
    const localR = frame.worldToLocal(_v.copy(robotWorld));
    if (Math.hypot(localR.x, localR.z) < 40 / P.cutisScale) {
      swarmContacts(swarm, localR, radius / P.cutisScale, {}, (h, i, part) => {
        _w.set(h.x, h.y, h.z); frame.localToWorld(_w); _n.set(h.nx, h.ny, h.nz).transformDirection(frame.matrixWorld);
        out.push({ point: _w.toArray(), normal: _n.toArray(), depth: h.depth * P.cutisScale, creature: this.cutis, label: `Cutis-Maku ${part}`, key: `cutis:${i}:${part}` });
      });
    }
    for (const c of this.creatures) {
      if (!c.group.visible || !c.contact) continue;
      c.group.getWorldPosition(_w);
      if (_w.distanceTo(robotWorld) > 40) continue;
      const local = c.group.worldToLocal(_v.copy(robotWorld));
      const hit = c.contact(local, radius / c.scale);
      if (hit) out.push({ ...hit, creature: c, label: c.variant + (hit.part ? ` ${hit.part}` : ''), key: c.variant + (hit.part ? `:${hit.part}` : '') });
    }
    out.sort((a, b) => b.depth - a.depth);
    return out;
  }

  update(camera, viewportHeight) {
    if (!this.ready) return;
    const { model, cores, frame } = this.cutis;
    cores.update();
    this.cameraProxy.fov = camera.fov;
    frame.worldToLocal(this.cameraProxy.position.copy(camera.position));
    model.update(this.cameraProxy, viewportHeight);
    for (const c of this.creatures) if (c.update) c.update(camera, viewportHeight);
  }

  // radar contacts in world space
  contacts() {
    const out = [];
    for (const s of this.sites) out.push({ pos: s.world.toArray(), kind: 'colony', label: s.label });
    if (!this.ready) return out;
    const { swarm, frame } = this.cutis;
    for (let i = 0; i < swarm.count; i++) {
      const p = swarm.position(i);
      frame.localToWorld(_v.set(p[0], 0, p[2]));
      out.push({ pos: _v.toArray(), kind: swarm.configFor(i).coreShape > 0 ? 'hard' : 'soft' });
    }
    for (const c of this.creatures) {
      if (!c.group.visible) continue;
      if (c.contacts) c.contacts(out);
      else out.push({ pos: c.worldPosition(_v).toArray(), kind: c.radarKind });
    }
    return out;
  }

  get visible() { return this.group.visible; }
  set visible(v) { this.group.visible = v; }

  stats() {
    if (!this.ready) return null;
    const { model, swarm } = this.cutis;
    return {
      cutis: swarm.count, batches: model.levels.filter((l) => l.count > 0).length, chasing: this.chasing,
      walkers: this.creatures.filter((c) => c.kind === 'walker').map((c) => `${c.variant}:${c.state()}`),
      crawlers: this.creatures.filter((c) => c.kind === 'crawler' && c.group.visible).map((c) => `${c.variant}:${c.state()}`),
      gorogoro: this.creatures.find((c) => c.kind === 'gorogoro')?.swarm.count ?? 0,
      softBodies: this.creatures.reduce((n, c) => n + (c.group.visible ? c.softBodies : 0), 0),
      simulated: this.simulated,
      hits: this.hits.map((h) => h.label),
      sites: this.sites.map((s) => ({ id: s.id, at: s.world.toArray().map((v) => +v.toFixed(1)) })),
    };
  }
}
