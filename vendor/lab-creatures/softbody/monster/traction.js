// Transpiled from lab-creatures src/monster/traction.ts (GPL-3.0); see ../../UPSTREAM.md
/** World-space adhesion belongs to actual planted contacts, never airborne feet. */
export class GroundTraction {
    weights;
    supports = 0;
    anchors;
    held;
    limbs;
    grounded;
    constructor(body) {
        const count = body.cage.limbCount ?? 6;
        this.grounded = new Uint8Array(count);
        this.weights = new Float64Array(body.mass.length);
        this.anchors = new Float64Array(body.x.length);
        this.held = new Uint8Array(body.mass.length);
        this.limbs = new Int8Array(body.mass.length).fill(-1);
        for (let i = 0; i < body.mass.length; i++)
            if (Math.hypot(body.rest[i * 3], body.rest[i * 3 + 2]) > .071)
                this.limbs[i] = (Math.round(Math.atan2(body.rest[i * 3 + 2], body.rest[i * 3]) / (2 * Math.PI / count)) + count) % count;
    }
    reset() { this.held.fill(0); this.weights.fill(0); this.supports = 0; }
    prepare(body, gait, pursuit, enabled) {
        this.grounded.fill(0);
        this.weights.fill(0);
        this.supports = 0;
        for (let i = 0; i < this.limbs.length; i++)
            if (this.limbs[i] >= 0 && body.contact[i] > 0)
                this.grounded[this.limbs[i]] = 1;
        for (let leg = 0; leg < this.grounded.length; leg++) {
            const probe = leg === pursuit.lead ? pursuit.reach : leg === pursuit.secondLead ? pursuit.secondReach : 0;
            if (enabled && this.grounded[leg] && gait.planted[leg] && probe < .2)
                this.supports++;
        }
        for (let i = 0; i < this.limbs.length; i++) {
            const leg = this.limbs[i], probe = leg === pursuit.lead ? pursuit.reach : leg === pursuit.secondLead ? pursuit.secondReach : 0;
            const hold = enabled && leg >= 0 && this.grounded[leg] && gait.planted[leg] && probe < .2;
            if (!hold) {
                this.held[i] = 0;
                continue;
            }
            const j = i * 3;
            if (!this.held[i]) {
                this.anchors[j] = body.x[j];
                this.anchors[j + 2] = body.x[j + 2];
                this.held[i] = 1;
            }
            this.weights[i] = 1;
        }
    }
    apply(body, h, grip) {
        const damping = Math.exp(-80 * grip * h);
        for (let i = 0; i < this.weights.length; i++)
            if (this.weights[i]) {
                for (const axis of [0, 2]) {
                    const j = i * 3 + axis, error = this.anchors[j] - body.x[j];
                    body.velocity[j] = body.velocity[j] * damping + Math.max(-.12, Math.min(.12, error * 24)) * (1 - damping);
                }
            }
    }
}
