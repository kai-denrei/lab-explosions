// Transpiled from lab-creatures src/monster/feeding.ts (GPL-3.0); see ../../UPSTREAM.md
import { Vector3 } from 'three';
import { PREY_SHAPES } from './prey.js';
import { ARENA } from './arena.js';
const smooth = (value) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
/** Visual phagocytosis: stand over fixed prey, descend, mold around it, resolve.
 * Deformation remains the body's force-driven response, not a mesh transform. */
export class FeedingCycle {
    enabled = true;
    phase = 'hunting';
    preyPosition = new Vector3(.11, ARENA.lureHeight, .025);
    capturedPosition = new Vector3();
    scale = 1;
    drop = 0;
    imprint = 0;
    meals = 0;
    skinCoverage = 0;
    /** Ovum accumulates tissue at contact before the covering can finish. */
    viscous = false;
    biomass = 0;
    contactDirection = new Vector3(1, 0, 0);
    /** Optional game-owned clock; reuses the lab's physical cradle/drop/imprint poses. */
    scriptedProgress = null;
    concealed = false;
    elapsed = 0;
    dwell = 0;
    get locked() { return this.phase !== 'hunting'; }
    get shape() { return PREY_SHAPES[(this.phase === 'recovering' ? Math.max(0, this.meals - 1) : this.meals) % PREY_SHAPES.length]; }
    get visible() { return this.scale > .001 && !this.concealed; }
    reset(target) { this.scriptedProgress = null; this.phase = 'hunting'; this.elapsed = 0; this.dwell = 0; this.drop = 0; this.imprint = 0; this.scale = 1; this.meals = 0; this.skinCoverage = 0; this.biomass = 0; this.concealed = false; this.preyPosition.copy(target); }
    step(h, target, center, canCapture, bodyOnFloor = true, wrapReady = true) {
        if (this.scriptedProgress !== null) {
            const p = Math.max(0, Math.min(1, this.scriptedProgress));
            if (!this.locked)
                this.capturedPosition.copy(target);
            target.copy(this.capturedPosition);
            this.preyPosition.copy(target);
            this.phase = p < .24 ? 'cradling' : p < .36 ? 'covering' : p < .58 ? 'dropping' : p < .9 ? 'absorbing' : 'recovering';
            this.drop = smooth((p - .36) / .22) * (1 - smooth((p - .9) / .1));
            this.imprint = smooth((p - .42) / .16) * (1 - smooth((p - .7) / .2));
            this.skinCoverage = smooth((p - .24) / .12);
            this.scale = 1 - smooth((p - .5) / .4);
            this.concealed = p >= .58;
            this.biomass = this.viscous ? smooth((p - .14) / .4) * (1 - smooth((p - .75) / .25)) : 0;
            return;
        }
        this.elapsed += h;
        if (this.phase === 'hunting') {
            this.preyPosition.copy(target);
            this.scale = 1;
            this.drop = 0;
            this.imprint = 0;
            const close = Math.hypot(target.x - center.x, target.z - center.z) < .075;
            this.dwell = this.enabled && canCapture && close ? this.dwell + h : 0;
            if (this.dwell >= .10) {
                this.capturedPosition.copy(target);
                this.contactDirection.subVectors(target, center).setY(0);
                if (this.contactDirection.lengthSq() < 1e-8)
                    this.contactDirection.set(1, 0, 0);
                this.contactDirection.normalize();
                this.phase = 'cradling';
                this.elapsed = 0;
                this.dwell = 0;
            }
            return;
        }
        // Keep the sensory target fixed until the new prey is spawned.
        if (this.phase !== 'spawning') {
            target.copy(this.capturedPosition);
            this.preyPosition.copy(this.capturedPosition);
        }
        if (this.phase === 'cradling') {
            this.drop = 0;
            this.imprint = 0;
            this.dwell = wrapReady ? this.dwell + h : 0;
            if (this.viscous && wrapReady)
                this.biomass = Math.min(.22, this.biomass + h * .18);
            if (this.elapsed >= 1.4 && this.dwell >= .12) {
                this.phase = 'covering';
                this.elapsed = 0;
                this.dwell = 0;
            }
        }
        else if (this.phase === 'covering') {
            // Finish getting on top before lowering; the ball never travels to the body.
            this.drop = 0;
            this.imprint = 0;
            const error = Math.hypot(center.x - target.x, center.z - target.z);
            // A little elastic recoil must not restart alignment forever. The inner
            // band fits the ball beneath the torso; the outer band rejects a real miss.
            this.dwell = error < .008 ? this.dwell + h : error > .014 ? 0 : Math.max(0, this.dwell - h * .5);
            // Wrap while the torso finishes settling, before it can intersect the prey.
            // Both appearance and concealment are one-way until a new prey spawns.
            if (this.viscous) {
                this.biomass = Math.min(1, this.biomass + h * .38);
                this.skinCoverage = Math.max(this.skinCoverage, smooth((this.biomass - .12) / .88));
            }
            else
                this.skinCoverage = Math.max(this.skinCoverage, smooth(this.dwell / .16));
            if (this.dwell >= .16 && error < .010 && (!this.viscous || this.biomass >= 1)) {
                this.phase = 'dropping';
                this.elapsed = 0;
                this.dwell = 0;
            }
        }
        else if (this.phase === 'dropping') {
            this.skinCoverage = 1;
            this.drop = smooth(this.elapsed / .75);
            if (this.drop >= .45)
                this.concealed = true;
            this.imprint = smooth((this.drop - .25) / .75);
            if (this.elapsed >= .85 && bodyOnFloor) {
                this.phase = 'absorbing';
                this.elapsed = 0;
                this.scale = 0;
            }
        }
        else if (this.phase === 'absorbing') {
            // Hold the recognizable round outline before relaxing it into flat tissue.
            this.drop = 1;
            this.scale = 0;
            this.imprint = 1 - smooth((this.elapsed - .7) / 1.1);
            if (this.viscous)
                this.biomass = 1 - smooth((this.elapsed - .5) / 1.45);
            if (this.elapsed >= 1.95) {
                this.imprint = 0;
                this.meals++;
                this.phase = 'recovering';
                this.elapsed = 0;
            }
        }
        else if (this.phase === 'recovering') {
            this.drop = 1 - smooth(this.elapsed / .8);
            this.imprint = 0;
            this.scale = 0;
            this.biomass = 0;
            if (this.elapsed >= .95) {
                this.spawn(target, center);
                this.preyPosition.copy(target);
                this.skinCoverage = 0;
                this.concealed = false;
                this.phase = 'spawning';
                this.elapsed = 0;
            }
        }
        else {
            this.drop = 0;
            this.imprint = 0;
            this.preyPosition.copy(target);
            this.scale = smooth(this.elapsed / .25);
            if (this.elapsed >= .25) {
                this.phase = 'hunting';
                this.elapsed = 0;
                this.scale = 1;
            }
        }
    }
    spawn(target, center) {
        // Deterministic alternatives give a genuinely new chase without random tests.
        for (let attempt = 0; attempt < 24; attempt++) {
            const angle = this.meals * 2.3999632297 + attempt * 1.618;
            const radius = ARENA.lureRadius * (.6 + .28 * (.5 + .5 * Math.sin(this.meals * 1.7 + attempt)));
            const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
            if (Math.hypot(x - center.x, z - center.z) < .2 || Math.hypot(x - this.capturedPosition.x, z - this.capturedPosition.z) < .2)
                continue;
            target.set(x, ARENA.lureHeight, z);
            return;
        }
        const angle = Math.atan2(center.z, center.x) + Math.PI;
        target.set(Math.cos(angle) * ARENA.lureRadius * .85, ARENA.lureHeight, Math.sin(angle) * ARENA.lureRadius * .85);
    }
}
