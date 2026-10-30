// Transpiled from lab-creatures src/monster/auto-lure.ts (GPL-3.0); see ../../UPSTREAM.md
import { Vector3 } from 'three';
import { ARENA } from './arena.js';
/** Bounded, smooth figure-eight stimulus. The host pauses stepping during manual grabs and feeding. */
export class AutoLure {
    enabled = false;
    time = 0;
    destination = new Vector3();
    reset() { this.time = 0; }
    step(h, target, creature) {
        if (!this.enabled || h <= 0)
            return;
        const distance = Math.hypot(target.x - creature.x, target.z - creature.z);
        this.time += h * (distance > .22 ? .35 : 1);
        const phase = this.time * .45;
        this.destination.set(Math.sin(phase) * .34, ARENA.lureHeight, Math.sin(phase * 2 + .6) * .18);
        const radius = Math.hypot(this.destination.x, this.destination.z);
        if (radius > ARENA.lureRadius)
            this.destination.multiplyScalar(ARENA.lureRadius / radius);
        this.destination.y = ARENA.lureHeight;
        const delta = this.destination.sub(target), length = delta.length();
        const speed = distance > .22 ? .025 : .105;
        if (length > 0)
            target.addScaledVector(delta, Math.min(1, speed * h / length));
    }
}
