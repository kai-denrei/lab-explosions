// Transpiled from lab-creatures src/crawlers/locomotion.ts (GPL-3.0); see ../../UPSTREAM.md
import { Vector3 } from 'three';
/** Elastic shape forces, grounded drive and alternating underside anchors. */
export class CrawlerLocomotion {
    move = new Vector3();
    onContact = () => { };
    body;
    kind;
    phase = 0;
    yaw = 0;
    activity = 0;
    anchored = 0;
    brace = 0;
    halfLength;
    restCenter = new Vector3();
    center = new Vector3();
    velocity = new Vector3();
    anchors;
    forces;
    grip;
    constructor(body, kind) {
        this.body = body;
        this.kind = kind;
        this.halfLength = kind === 'slug' ? .085 : .15;
        this.anchors = new Float64Array(body.x.length).fill(NaN);
        this.forces = new Float64Array(body.x.length);
        this.grip = new Float64Array(body.mass.length);
        for (let i = 0; i < body.mass.length; i++)
            this.restCenter.addScaledVector(new Vector3().fromArray(body.rest, i * 3), body.mass[i] / body.totalMass);
    }
    jump() { this.brace = .65; }
    reset() { this.move.set(0, 0, 0); this.phase = 0; this.yaw = 0; this.activity = 0; this.brace = 0; this.anchors.fill(NaN); this.anchored = 0; }
    step(h) {
        const b = this.body;
        if (b.grab) {
            this.anchors.fill(NaN);
            this.activity = 0;
            return;
        }
        this.brace = Math.max(0, this.brace - h);
        const moving = this.move.lengthSq() > .001 && this.brace === 0;
        this.activity += (Number(moving) - this.activity) * (1 - Math.exp(-h * 9));
        if (moving) {
            const desired = Math.atan2(this.move.x, this.move.z), turn = Math.atan2(Math.sin(desired - this.yaw), Math.cos(desired - this.yaw));
            this.yaw += turn * (1 - Math.exp(-h * 2.5));
            this.phase += h * Math.PI * 2 * (this.kind === 'slug' ? .85 : 1.15);
        }
        this.center.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        for (let i = 0; i < b.mass.length; i++) {
            const j = i * 3, w = b.mass[i] / b.totalMass;
            this.center.x += b.x[j] * w;
            this.center.y += b.x[j + 1] * w;
            this.center.z += b.x[j + 2] * w;
            this.velocity.x += b.velocity[j] * w;
            this.velocity.y += b.velocity[j + 1] * w;
            this.velocity.z += b.velocity[j + 2] * w;
        }
        b.canSleep = false;
        b.wake();
        const co = Math.cos(this.yaw), si = Math.sin(this.yaw), slug = this.kind === 'slug';
        const length = 1 + (slug ? .28 * Math.sin(this.phase) * this.activity : 0) - this.brace * .12;
        let fx = 0, fy = 0, fz = 0;
        this.anchored = 0;
        for (let i = 0; i < b.mass.length; i++) {
            const j = i * 3, u = Math.max(0, Math.min(1, (b.rest[j + 2] / this.halfLength + 1) / 2));
            const wave = this.phase - u * Math.PI * 2;
            const bend = (slug ? .006 : .025) * Math.sin(wave) * Math.sin(Math.PI * u) * this.activity;
            const x = (b.rest[j] - this.restCenter.x) / Math.sqrt(length) + bend;
            const z = (b.rest[j + 2] - this.restCenter.z) * length;
            const y = this.center.y + (b.rest[j + 1] - this.restCenter.y) / Math.sqrt(length) + (slug ? .004 * Math.sin(Math.PI * u) * Math.max(0, -Math.sin(this.phase)) * this.activity : 0);
            const tx = this.center.x + x * co + z * si, tz = this.center.z + z * co - x * si;
            const k = slug ? 2200 : 2700, damping = 38;
            this.forces[j] = Math.max(-70, Math.min(70, k * (tx - b.x[j]) - damping * (b.velocity[j] - this.velocity.x)));
            this.forces[j + 1] = Math.max(-120, Math.min(120, 4000 * (y - b.x[j + 1]) - 55 * (b.velocity[j + 1] - this.velocity.y)));
            this.forces[j + 2] = Math.max(-70, Math.min(70, k * (tz - b.x[j + 2]) - damping * (b.velocity[j + 2] - this.velocity.z)));
            fx += this.forces[j] * b.mass[i];
            fy += this.forces[j + 1] * b.mass[i];
            fz += this.forces[j + 2] * b.mass[i];
            const planted = !moving || (slug ? (Math.cos(this.phase) > 0 ? u < .35 : u > .65) : Math.abs(Math.sin(wave)) > .65);
            const contact = b.contact[i] > 0;
            this.grip[i] = Number(planted && contact);
            if (this.grip[i]) {
                this.anchored++;
                if (!Number.isFinite(this.anchors[j])) {
                    this.anchors[j] = b.x[j];
                    this.anchors[j + 2] = b.x[j + 2];
                }
            }
            else {
                this.anchors[j] = NaN;
                this.anchors[j + 2] = NaN;
            }
        }
        // Drive only when supported; anchors resist motion while free body regions pull.
        const speed = this.activity * (slug ? .09 * Math.max(0, -Math.cos(this.phase)) : .075);
        const support = this.anchored > 0 ? 1 : 0, brake = moving ? 22 : 65;
        const forward = this.velocity.x * si + this.velocity.z * co, lateral = this.velocity.x * co - this.velocity.z * si;
        const drive = (speed * support - forward) * (slug ? brake : 65), sideBrake = slug ? brake : 240;
        const ax = si * drive - co * lateral * sideBrake, az = co * drive + si * lateral * sideBrake;
        for (let i = 0; i < b.mass.length; i++) {
            const j = i * 3, g = this.grip[i];
            b.velocity[j] += (this.forces[j] - fx / b.totalMass + ax * (1 - g)) * h;
            b.velocity[j + 1] += (this.forces[j + 1] - fy / b.totalMass) * h;
            b.velocity[j + 2] += (this.forces[j + 2] - fz / b.totalMass + az * (1 - g)) * h;
            if (g) {
                const keep = Math.exp(-110 * h);
                b.velocity[j] = b.velocity[j] * keep + Math.max(-.16, Math.min(.16, (this.anchors[j] - b.x[j]) * 35)) * (1 - keep);
                b.velocity[j + 2] = b.velocity[j + 2] * keep + Math.max(-.16, Math.min(.16, (this.anchors[j + 2] - b.x[j + 2]) * 35)) * (1 - keep);
            }
        }
    }
    afterStep() { }
}
