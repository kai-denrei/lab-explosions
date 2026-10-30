// Transpiled from lab-creatures src/monster/pursuit.ts (GPL-3.0); see ../../UPSTREAM.md
import { Vector3 } from 'three';
import { DEFAULT_MOTION } from './motion-settings.js';
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
/** Repeatable, uneven reach/pull bursts; no frame-dependent random jitter. */
export class TentaclePursuit {
    lead = 0;
    secondLead = 1;
    firstDirection = new Vector3(1, 0, 0);
    secondDirection = new Vector3(1, 0, 0);
    searchScale = 1;
    reach = 0;
    secondReach = 0;
    pull = 0;
    speed = 0;
    side = 0;
    phase = 'reach';
    elapsed = 0;
    burst = 0;
    engaged = false;
    clock = 0;
    settings;
    count;
    spacing;
    constructor(settings = { ...DEFAULT_MOTION }, count = 6) { this.settings = settings; this.count = count; this.spacing = 2 * Math.PI / count; }
    reset() { this.lead = 0; this.secondLead = 1; this.reach = 0; this.secondReach = 0; this.pull = 0; this.speed = 0; this.side = 0; this.phase = 'reach'; this.elapsed = 0; this.burst = 0; this.clock = 0; this.engaged = false; }
    selectArms(direction) {
        const angle = Math.atan2(direction.z, direction.x);
        this.lead = (Math.round(angle / this.spacing) + this.count) % this.count;
        const delta = Math.atan2(Math.sin(angle - this.lead * this.spacing), Math.cos(angle - this.lead * this.spacing));
        const side = Math.abs(delta) < .08 ? (this.burst % 2 === 0 ? 1 : -1) : Math.sign(delta);
        this.secondLead = (this.lead + side + this.count) % this.count;
    }
    step(h, direction, engaged, distance = .3) {
        this.searchScale = smooth((distance - .045) / .18);
        this.clock += h;
        if (!engaged) {
            this.engaged = false;
            this.reach *= Math.exp(-h * 14);
            this.secondReach *= Math.exp(-h * 14);
            this.pull = 0;
            this.speed = 0;
            this.side = 0;
            return;
        }
        // A moving target must not restart every long reach and starve the pull phase.
        // Sensor directions follow it continuously; arm selection changes between bursts.
        if (!this.engaged) {
            this.phase = 'reach';
            this.elapsed = 0;
            this.reach = 0;
            this.secondReach = 0;
            this.pull = 0;
            this.selectArms(direction);
        }
        this.engaged = true;
        this.elapsed += h;
        const s = this.settings, variation = .5 + .5 * Math.sin(this.burst * 2.399 + 1.1) * Math.min(1, s.erratic);
        const reachDuration = (.14 + variation * .07) * s.reachTime, pullDuration = (.17 + (1 - variation) * .10) * s.pullTime, settleDuration = (.045 + variation * .08) * s.pauseTime;
        if (this.phase === 'reach') {
            const extensionPart = 1 - .5 * Math.min(1, s.sweep);
            this.reach = smooth(this.elapsed / reachDuration / extensionPart);
            this.pull = 0;
            this.secondReach = smooth((this.elapsed / reachDuration - .16) / (.84 * extensionPart));
            if (this.elapsed >= reachDuration) {
                this.phase = 'pull';
                this.elapsed = 0;
            }
        }
        else if (this.phase === 'pull') {
            const t = clamp(this.elapsed / pullDuration);
            this.reach = 1 - .5 * smooth(t);
            this.pull = Math.sin(Math.PI * t) ** .65;
            this.secondReach = 1 - .5 * smooth(clamp(t - .12) / .88);
            if (this.elapsed >= pullDuration) {
                this.phase = 'settle';
                this.elapsed = 0;
            }
        }
        else {
            this.reach = .5 * (1 - smooth(this.elapsed / settleDuration));
            this.pull = 0;
            this.secondReach = this.reach;
            if (this.elapsed >= settleDuration) {
                this.phase = 'reach';
                this.elapsed = 0;
                this.burst++;
                this.selectArms(direction);
            }
        }
        const side = (this.secondLead - this.lead + this.count) % this.count === 1 ? 1 : -1, angle = Math.atan2(direction.z, direction.x);
        // Spread moves the two complete sensor arms apart, not just their membrane edges.
        const width = (.09 + s.spread * .105) * (.25 + .75 * this.searchScale);
        // Independent, continuous arcs; repeatable variation avoids frame-rate noise.
        // Finish extending early enough to search while fully outstretched.
        const sweep = s.sweep * .17 * this.searchScale;
        const firstArc = Math.sin(this.clock * 3.6 + .35 * Math.sin(this.clock * .73));
        const secondArc = Math.sin(this.clock * 3.1 + 1.7 + .4 * Math.sin(this.clock * .91 + 2));
        const offsetA = Math.max(.06, Math.min(1.2, width + sweep * firstArc));
        const offsetB = Math.max(.06, Math.min(1.2, width + sweep * secondArc));
        const a = angle - side * offsetA, b = angle + side * offsetB;
        this.firstDirection.set(Math.cos(a), 0, Math.sin(a));
        this.secondDirection.set(Math.cos(b), 0, Math.sin(b));
        this.speed = this.pull * (.10 + variation * .055) * s.speed;
        this.side = Math.sin(this.burst * 4.13 + .7) * this.pull * .28 * s.erratic;
    }
}
