// Transpiled from lab-creatures src/monster/cradle.ts (GPL-3.0); see ../../UPSTREAM.md
import { Vector3 } from 'three';
import { preyClearance } from './prey.js';
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
/** Two guided half-wraps, with contact on the actual barycentric skin embedding. */
export class PreyCradle {
    anchor = new Vector3();
    heading = new Vector3(1, 0, 0);
    point = new Vector3();
    arms = [0, 1];
    sides = [-1, 1];
    elapsed = 0;
    ready = false;
    minimumGap = Infinity;
    starts;
    samples;
    normal = new Vector3();
    count;
    constructor(body) {
        this.count = body.cage.limbCount ?? 6;
        this.starts = body.x.slice();
        this.samples = Array.from({ length: this.count }, () => []);
        const p = body.surface.positions;
        // About 150–300 samples per selected limb, including thin distal membrane.
        for (let vertex = 0; vertex < p.length / 3; vertex += 2) {
            const j = vertex * 3, r = Math.hypot(p[j], p[j + 2]);
            if (r < .042)
                continue;
            const leg = (Math.round(Math.atan2(p[j + 2], p[j]) / (2 * Math.PI / this.count)) + this.count) % this.count;
            this.samples[leg].push(vertex);
        }
    }
    reset() { this.elapsed = 0; this.ready = false; this.minimumGap = Infinity; }
    begin(body, center, target) {
        this.reset();
        this.starts.set(body.x);
        this.anchor.copy(center);
        this.heading.subVectors(target, center).setY(0);
        if (this.heading.lengthSq() < 1e-8)
            this.heading.set(1, 0, 0);
        this.heading.normalize();
        const angle = Math.atan2(this.heading.z, this.heading.x), spacing = 2 * Math.PI / this.count;
        const first = (Math.round(angle / spacing) + this.count) % this.count;
        const delta = Math.atan2(Math.sin(angle - first * spacing), Math.cos(angle - first * spacing));
        const side = delta >= 0 ? 1 : -1;
        this.arms = [first, (first + side + this.count) % this.count];
        this.sides = [-side, side];
    }
    target(body, id, limb, center, prey, shape, release) {
        const arm = this.arms.indexOf(limb);
        if (arm < 0)
            return 0;
        const j = id * 3, r = Math.hypot(body.rest[j], body.rest[j + 2]);
        if (r < .036)
            return 0;
        const t = Math.max(0, Math.min(1, (r - .036) / .052)), side = this.sides[arm];
        const radius = (shape === 'sphere' ? .011 : shape === 'cube' ? .016 : .013) + .014;
        // Distal half traces the near flank toward the far side, never closes a ring.
        const arc = Math.PI - (.68 * Math.PI) * Math.max(0, (t - .25) / .75);
        const forward = Math.cos(arc) * radius, lateral = Math.sin(arc) * radius * side;
        const x = prey.x + this.heading.x * forward - this.heading.z * lateral;
        const z = prey.z + this.heading.z * forward + this.heading.x * lateral;
        const rootX = center.x + body.rest[j], rootZ = center.z + body.rest[j + 2];
        const along = smooth(t / .4);
        this.point.set(rootX + (x - rootX) * along, .010 + (1 - t) * .027, rootZ + (z - rootZ) * along);
        const progress = smooth((this.elapsed - arm * .18) / .95) * (1 - release);
        this.point.x = this.starts[j] + (this.point.x - this.starts[j]) * progress;
        this.point.y = this.starts[j + 1] + (this.point.y - this.starts[j + 1]) * progress;
        this.point.z = this.starts[j + 2] + (this.point.z - this.starts[j + 2]) * progress;
        return smooth((r - .036) / .014) * (1 - release);
    }
    constrain(body, h, prey, shape) {
        const ids = body.surface.bindingIds, weights = body.surface.bindingWeights, n = this.normal;
        this.minimumGap = Infinity;
        const nearest = new Map(this.arms.map(arm => [arm, Infinity]));
        for (const arm of this.arms)
            for (const vertex of this.samples[arm]) {
                const offset = vertex * 4;
                let x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0, denominator = 0;
                for (let k = 0; k < 4; k++) {
                    const id = ids[offset + k], w = weights[offset + k], j = id * 3;
                    x += body.x[j] * w;
                    y += body.x[j + 1] * w;
                    z += body.x[j + 2] * w;
                    vx += body.velocity[j] * w;
                    vy += body.velocity[j + 1] * w;
                    vz += body.velocity[j + 2] * w;
                    denominator += body.inverseMass[id] * w * w;
                }
                x -= prey.x;
                y -= prey.y;
                z -= prey.z;
                if (x * x + y * y + z * z > .06 ** 2)
                    continue;
                const gap = preyClearance(shape, x, y, z, n);
                this.minimumGap = Math.min(this.minimumGap, gap);
                nearest.set(arm, Math.min(nearest.get(arm), gap));
                const speed = vx * n.x + vy * n.y + vz * n.z;
                if (gap > .004 + Math.max(0, -speed * h))
                    continue;
                const impulse = Math.min(.10, Math.max(0, (.004 - gap) * 35 - speed)) / denominator;
                for (let k = 0; k < 4; k++) {
                    const id = ids[offset + k], scale = impulse * body.inverseMass[id] * weights[offset + k], j = id * 3;
                    body.velocity[j] += n.x * scale;
                    body.velocity[j + 1] += n.y * scale;
                    body.velocity[j + 2] += n.z * scale;
                }
            }
        this.ready = this.minimumGap >= -.0005 && this.arms.every(arm => nearest.get(arm) < .020);
    }
}
