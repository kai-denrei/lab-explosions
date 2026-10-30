// Transpiled from lab-creatures src/monster/gait.ts (GPL-3.0); see ../../UPSTREAM.md
import { Vector3 } from 'three';
import { DEFAULT_MOTION } from './motion-settings.js';
const smooth = (v) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
/** A traveling footfall sequence continues after the body's short pull impulse.
 * Each foot lifts first, advances while clear of the floor, then plants. */
export class SpiderGait {
    feet;
    velocities;
    planted;
    starts;
    goals;
    elapsed;
    durations;
    heights;
    count;
    spacing;
    pending = [];
    cooldown = 0;
    steps = 0;
    settings;
    constructor(settings = { ...DEFAULT_MOTION }, count = 6) {
        this.count = count;
        this.spacing = 2 * Math.PI / count;
        this.settings = settings;
        this.feet = Array.from({ length: count }, () => new Vector3());
        this.velocities = this.feet.map(() => new Vector3());
        this.starts = this.feet.map(() => new Vector3());
        this.goals = this.feet.map(() => new Vector3());
        this.planted = this.feet.map(() => true);
        this.elapsed = new Float64Array(count);
        this.durations = new Float64Array(count);
        this.heights = new Float64Array(count);
        this.reset();
    }
    reset() {
        this.feet.forEach((foot, i) => foot.set(Math.cos(i * this.spacing) * .088, 0, Math.sin(i * this.spacing) * .088));
        this.velocities.forEach(v => v.set(0, 0, 0));
        this.planted.fill(true);
        this.elapsed.fill(-1);
        this.pending = [];
        this.cooldown = 0;
        this.steps = 0;
    }
    settle() {
        this.pending = [];
        this.elapsed.fill(-1);
        this.planted.fill(true);
        this.feet.forEach(foot => { foot.y = 0; });
        this.velocities.forEach(v => v.set(0, 0, 0));
    }
    step(h, center, direction, walking, reservedLeg = -1, secondReservedLeg = -1) {
        this.cooldown -= h;
        const airborne = this.planted.filter(p => !p).length;
        if (!this.pending.length && airborne === 0 && walking && this.cooldown <= 0) {
            const lead = reservedLeg >= 0 ? reservedLeg : (Math.round(Math.atan2(direction.z, direction.x) / this.spacing) + this.count) % this.count;
            // Left/right pairs are offset in time, progressing from front to rear.
            const order = [];
            for (let k = 1; k <= this.count / 2; k++) {
                order.push(k);
                if (this.count - k !== k)
                    order.push(this.count - k);
            }
            order.push(0);
            this.pending = order.map(offset => (lead + offset) % this.count).filter(i => i !== reservedLeg && i !== secondReservedLeg);
        }
        this.pending = this.pending.filter(i => i !== reservedLeg && i !== secondReservedLeg);
        // With two exploratory arms lifted, only one supporting leg steps at a time.
        const maxSwing = reservedLeg >= 0 && secondReservedLeg >= 0 ? 1 : 2;
        if (this.pending.length && airborne < maxSwing && this.cooldown <= 0) {
            const i = this.pending.shift();
            this.planted[i] = false;
            this.elapsed[i] = 0;
            this.starts[i].copy(this.feet[i]);
            const s = this.settings;
            this.durations[i] = (.18 + .025 * (.5 + .5 * Math.sin(++this.steps * 2.4) * Math.min(1, s.erratic))) * s.stepDuration / .19;
            this.heights[i] = s.stepHeight;
            const stride = s.stride + .003 * Math.sin(this.steps * 1.7 + i * .8) * s.erratic;
            this.goals[i].set(center.x + Math.cos(i * this.spacing) * .088 + direction.x * stride, 0, center.z + Math.sin(i * this.spacing) * .088 + direction.z * stride);
            this.cooldown = s.stepSpacing;
        }
        for (let i = 0; i < this.count; i++) {
            const foot = this.feet[i], velocity = this.velocities[i];
            velocity.copy(foot);
            if (this.elapsed[i] >= 0) {
                this.elapsed[i] += h;
                const t = Math.min(1, this.elapsed[i] / this.durations[i]);
                // The first/last 22% is purely vertical: no ground-level forward sweep.
                const advance = smooth((t - .22) / .56);
                foot.lerpVectors(this.starts[i], this.goals[i], advance);
                const height = this.heights[i];
                foot.y = t < .22 ? smooth(t / .22) * height : t > .78 ? (1 - smooth((t - .78) / .22)) * height : height + height / .021 * .002 * Math.sin(Math.PI * (t - .22) / .56);
                if (t === 1) {
                    foot.copy(this.goals[i]);
                    this.elapsed[i] = -1;
                    this.planted[i] = true;
                }
            }
            velocity.subVectors(foot, velocity).multiplyScalar(h > 0 ? 1 / h : 0);
        }
    }
}
