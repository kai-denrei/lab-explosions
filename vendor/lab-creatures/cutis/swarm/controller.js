// Transpiled from lab-creatures src/cutis/swarm/controller.ts (GPL-3.0); see ../UPSTREAM.md
import { coreContact, CUTIS_TIERS, PEARL_TIERS, GOROGORO_TIERS } from './tiers.js';
import { membranePhase, rollMotion, momentumRate } from './locomotion.js';
import { cycleTiming, phaseState, transferProgress } from './config.js';
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export class CutisSwarm {
    capacity = 300;
    count = 1;
    time = 0;
    frozen = false;
    mixed = false;
    suspended = new Uint8Array(300);
    configFor(i) { return this.mixed && this.count > 1 ? (this.config.rollVariant ? GOROGORO_TIERS : this.config.pearlVariant ? PEARL_TIERS : CUTIS_TIERS)[i % CUTIS_TIERS.length].values : this.config; }
    setMixed(on) { if (this.mixed !== on) {
        this.mixed = on;
        this.reset();
    } }
    speedFor(i) { return this.mixed && this.count > 1 ? .92 + hash(i + 411) * .16 : 1; }
    previousHeading = new Float32Array(900);
    offset = new Float32Array(900);
    heading = new Float32Array(900);
    anchor = new Float32Array(900);
    phase = new Float32Array(300);
    seed = new Float32Array(300);
    scale = new Float32Array(300);
    params = new Float32Array(1200);
    probe0 = new Float32Array(900);
    probe1 = new Float32Array(900);
    probe2 = new Float32Array(900);
    probeCount = new Float32Array(300);
    chosenProbe = new Float32Array(300);
    duration = new Float32Array(300);
    idle = new Uint8Array(300);
    cycles = new Uint32Array(300);
    occupied = new Float32Array(900);
    config;
    constructor(config) { this.config = config; for (let i = 0; i < 300; i++) {
        this.seed[i] = hash(i + 17) * 100;
        this.scale[i] = .85 + hash(i + 93) * .3;
    } this.reset(1); }
    reset(count = this.count) {
        this.count = Math.max(1, Math.min(300, Math.round(count)));
        this.time = 0;
        this.suspended.fill(0);
        for (let i = 0; i < this.count; i++) {
            const k = i * 3, angle = i * 2.399963, r = this.count === 1 ? 0 : Math.sqrt((i + .5) / this.count) * Math.max(2.5, Math.sqrt(this.count) * .39);
            this.offset[k] = Math.cos(angle) * r;
            this.offset[k + 1] = 0;
            this.offset[k + 2] = Math.sin(angle) * r;
            this.heading[k] = Math.cos(angle + .8);
            this.heading[k + 1] = 0;
            this.heading[k + 2] = Math.sin(angle + .8);
            this.phase[i] = this.count === 1 ? 0 : hash(i + 71);
            this.cycles[i] = 0;
            this.idle[i] = 0;
            this.plan(i, 1.3, .6, false);
            this.previousHeading.set(this.heading.subarray(k, k + 3), k);
            this.duration[i] = this.configFor(i).cycleDuration * (.8 + hash(i + 31) * .4) / this.speedFor(i);
        }
    }
    plan(i, tx, tz, neighbors = true) {
        const config = this.configFor(i);
        const k = i * 3, x = this.offset[k], z = this.offset[k + 2], dx = tx - x, dz = tz - z, distance = Math.hypot(dx, dz), radius = config.r0 * this.scale[i];
        let hx = dx / Math.max(.0001, distance), hz = dz / Math.max(.0001, distance), sx = 0, sz = 0, ax = 0, az = 0, cx = 0, cz = 0, n = 0;
        if (neighbors && this.count > 1)
            for (let j = 0; j < this.count; j++)
                if (i !== j) {
                    const q = j * 3, ex = x - this.occupied[q], ez = z - this.occupied[q + 2], d2 = ex * ex + ez * ez;
                    if (d2 < 2.25 && d2 > 1e-5) {
                        const w = Math.max(0, 1 - Math.sqrt(d2) / (radius * 3));
                        sx += ex / d2 * w;
                        sz += ez / d2 * w;
                        ax += this.heading[q];
                        az += this.heading[q + 2];
                        cx -= ex;
                        cz -= ez;
                        n++;
                    }
                }
        hx += sx * config.separation * .35;
        hz += sz * config.separation * .35;
        if (n) {
            hx += ax / n * config.alignment * .3 + cx / n * config.cohesion;
            hz += az / n * config.alignment * .3 + cz / n * config.cohesion;
        }
        const erratic = (hash(i * 19 + this.cycles[i] * 7) - .5) * .65, cos = Math.cos(erratic), sin = Math.sin(erratic), length = Math.hypot(hx, hz) || 1;
        this.heading[k] = (hx * cos - hz * sin) / length;
        this.heading[k + 2] = (hx * sin + hz * cos) / length;
        const hunt = distance < radius * 9 ? config.aggression / (1 + config.aggression) : 0;
        const reach = Math.min(config.reach * radius * (1 + .18 * hunt), Math.max(0, distance - radius * .55));
        const count = Math.max(1, Math.min(3, Math.round(config.seekCount)));
        this.probeCount[i] = count;
        for (let j = 0; j < 3; j++) {
            const probe = j === 0 ? this.probe0 : j === 1 ? this.probe1 : this.probe2;
            probe[k] = count === 1 ? 0 : (j - (count - 1) / 2) * (count === 2 ? 2.4 : 1.2);
            probe[k + 1] = reach * (count === 1 ? 1 : .58 + .42 * hash(i * 29 + this.cycles[i] * 13 + j * 41 + 5));
            probe[k + 2] = j * 2.17 + hash(i * 7 + j * 19) * 1.4;
        }
        this.selectProbe(i, tx, tz);
        /* Selected reach is written by selectProbe. */ this.params[i * 4 + 1] = config.cubenessPeak;
        this.params[i * 4 + 2] = config.pulseSpeed;
        this.params[i * 4 + 3] = config.wobble;
        // Telegraph stays >=120ms even at maximum urgency. Candidate directions lock now; multiple probes choose the anchor after seeking.
        const jitter = .8 + hash(i * 43 + this.cycles[i] * 17) * .4;
        const base = config.cycleDuration * (1 - .3 * hunt), duration = base * (jitter * (1 - .35 * hunt) + .35 * hunt);
        const beat = Math.ceil((this.time + duration) / base) * base - this.time;
        this.duration[i] = (duration + (beat - duration) * .18 * hunt) / this.speedFor(i);
        this.idle[i] = distance < radius * .7 ? 1 : 0;
    }
    getSeekingAnchors(i) {
        const k = i * 3;
        return [this.probe0, this.probe1, this.probe2].slice(0, this.probeCount[i]).map((probe, index) => {
            const a = probe[k], d = probe[k + 1], c = Math.cos(a), s = Math.sin(a);
            return { index, x: this.offset[k] + (this.heading[k] * c + this.heading[k + 2] * s) * d, y: .018, z: this.offset[k + 2] + (this.heading[k + 2] * c - this.heading[k] * s) * d, reach: d };
        });
    }
    selectProbe(i, tx, tz) {
        const k = i * 3;
        let nearest = Infinity;
        for (let j = 0; j < this.probeCount[i]; j++) {
            const probe = j === 0 ? this.probe0 : j === 1 ? this.probe1 : this.probe2, a = probe[k], d = probe[k + 1], c = Math.cos(a), s = Math.sin(a);
            const x = this.offset[k] + (this.heading[k] * c + this.heading[k + 2] * s) * d, z = this.offset[k + 2] + (this.heading[k + 2] * c - this.heading[k] * s) * d;
            const distance = (tx - x) ** 2 + (tz - z) ** 2;
            if (distance < nearest) {
                nearest = distance;
                this.chosenProbe[i] = j;
                this.anchor[k] = x;
                this.anchor[k + 1] = .018;
                this.anchor[k + 2] = z;
                this.params[i * 4] = d;
            }
        }
    }
    step(dt, target) {
        for (let i = 0; i < this.count; i++)
            if (this.probeCount[i] !== Math.max(1, Math.min(3, Math.round(this.configFor(i).seekCount)))) {
                this.plan(i, target.x, target.z);
                if (!this.frozen)
                    this.phase[i] = 0;
            }
        if (this.frozen)
            return;
        this.time += dt;
        for (let i = 0; i < this.count; i++) {
            const k = i * 3, p = this.position(i);
            this.occupied[k] = p[0];
            this.occupied[k + 2] = p[2];
        }
        for (let i = 0; i < this.count; i++) {
            if (this.suspended[i])
                continue;
            if (this.idle[i]) {
                if (Math.hypot(target.x - this.offset[i * 3], target.z - this.offset[i * 3 + 2]) > this.configFor(i).r0 * this.scale[i]) {
                    this.cycles[i]++;
                    this.plan(i, target.x, target.z);
                    this.phase[i] = 0;
                }
                continue;
            }
            if (this.phase[i] === 0)
                this.plan(i, target.x, target.z);
            const config = this.configFor(i), rolling = config.rollVariant > 0, timing = cycleTiming(this.duration[i]), raw = this.phase[i], phase = membranePhase(raw, config.rollVariant);
            const rate = phase < .1 ? .1 / timing.coil : phase < .55 ? .45 / timing.extend : phase < .62 ? .07 / timing.anchor : phase < .85 ? .23 / timing.transfer : .15 / timing.settle;
            this.phase[i] += dt * (rolling ? (raw < .496 ? rate * .8 : raw < .9 ? momentumRate(raw, .184 / timing.transfer, .22 * this.speedFor(i) / config.rollDuration) : .1 * this.speedFor(i) / config.landingPause) : rate);
            if (phase < .55 && membranePhase(this.phase[i], config.rollVariant) >= .55 && this.probeCount[i] > 1)
                this.selectProbe(i, target.x, target.z);
            if (this.phase[i] >= 1) {
                const k = i * 3;
                this.previousHeading.set(this.heading.subarray(k, k + 3), k);
                const landing = this.getLanding(i);
                this.offset[k] = landing.x;
                this.offset[k + 2] = landing.z;
                this.cycles[i]++;
                this.plan(i, target.x, target.z);
                this.phase[i] = 0;
            }
            this.params[i * 4 + 1] = config.cubenessPeak;
            this.params[i * 4 + 2] = config.pulseSpeed;
            this.params[i * 4 + 3] = config.wobble;
        }
    }
    position(i) { if (this.configFor(i).rollVariant) {
        const c = this.getCoreContact(i).center;
        return [c.x, 0, c.z];
    } if (this.configFor(i).coreShape > 0) {
        const { center } = this.getCoreContact(i);
        return [center.x, 0, center.z];
    } const k = i * 3, t = this.phase[i] < .62 ? 0 : transferProgress((membranePhase(this.phase[i], this.configFor(i).rollVariant) - .62) / .23, this.configFor(i).transferAcceleration); return [this.offset[k] + (this.anchor[k] - this.offset[k]) * t, 0, this.offset[k + 2] + (this.anchor[k + 2] - this.offset[k + 2]) * t]; }
    getCoreContact(i) {
        const config = this.configFor(i), spec = coreContact(config), k = i * 3, r = config.r0 * this.scale[i], phase = membranePhase(this.phase[i], config.rollVariant);
        const transfer = transferProgress((phase - .62) / .23, config.transferAcceleration);
        const u = Math.max(0, Math.min(1, (transfer - config.delaySpread * .5) / Math.max(.02, 1 - config.delaySpread)));
        const travel = 2 * u - u * u, height = r * .78 * ((1 - u) ** 2 + u * u) + 2 * (1 - u) * u * .014;
        const center = { x: this.offset[k] + (this.anchor[k] - this.offset[k]) * travel, y: height, z: this.offset[k + 2] + (this.anchor[k + 2] - this.offset[k + 2]) * travel };
        if (phase >= .85) {
            const settle = (phase - .85) / .15, recoil = Math.exp(-6 * settle) * Math.sin(settle * 22) * r * .12 * config.wobble;
            center.x = this.anchor[k] + this.heading[k] * recoil;
            center.z = this.anchor[k + 2] + this.heading[k + 2] * recoil;
            center.y = r * .78;
        }
        const radius = spec.collisionRadius * this.scale[i];
        if (radius > 0)
            center.y = Math.max(center.y, radius * 1.3 + .018);
        if (config.rollVariant) {
            const motion = rollMotion(this.phase[i], this.params[i * 4], r, config.wobble, config.launchHeight), dx = this.anchor[k] - this.offset[k], dz = this.anchor[k + 2] - this.offset[k + 2], length = Math.hypot(dx, dz) || 1;
            if (this.phase[i] >= .496) {
                center.x = this.offset[k] + dx / length * motion.distance;
                center.z = this.offset[k + 2] + dz / length * motion.distance;
            }
            center.y += motion.lift;
        }
        center.y += this.offset[k + 1];
        return { ...spec, center, radius };
    }
    contactDamageAt(i, point, unitRadius, dt) { const c = this.getCoreContact(i); return !c.rammable && Math.hypot(point.x - c.center.x, point.y - c.center.y, point.z - c.center.z) <= c.radius + Math.max(0, unitRadius) ? c.contactDamagePerSecond * Math.max(0, dt) : 0; }
    getState(i) { const c = this.configFor(i), p = this.phase[i]; return this.idle[i] ? 'REST' : c.rollVariant && p >= .68 ? (p < .735 ? 'LAUNCH' : p < .9 ? 'ROLL' : 'RECOVER') : phaseState(membranePhase(p, c.rollVariant)); }
    getLanding(i) { const k = i * 3, m = this.configFor(i).rollVariant ? 1 : 0; return { x: this.anchor[k] + (this.anchor[k] - this.offset[k]) * m, y: 0, z: this.anchor[k + 2] + (this.anchor[k + 2] - this.offset[k + 2]) * m }; }
    getAnchor(i) { return { x: this.anchor[i * 3], y: this.anchor[i * 3 + 1], z: this.anchor[i * 3 + 2] }; }
    getStretchSegment(i) { const k = i * 3, p = membranePhase(this.phase[i], this.configFor(i).rollVariant); return { from: { x: this.offset[k], y: this.configFor(i).r0 * this.scale[i], z: this.offset[k + 2] }, to: this.getAnchor(i), vulnerable: p >= .1 && p < .62, intangible: p >= .62 && p < .85 }; }
    scrub(phase) { this.frozen = true; this.idle[0] = 0; this.phase[0] = Math.max(0, Math.min(.9999, phase)); }
}
