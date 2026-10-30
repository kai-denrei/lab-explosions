// Transpiled from lab-creatures src/monster/limb-separation.ts (GPL-3.0); see ../../UPSTREAM.md
import { Vector3 } from 'three';
/** Small overlapping sphere chains approximate limb volume. Equal/opposite
 * contact impulses stay inside the solver's velocity path and orientation guards. */
export class LimbSeparation {
    proxies = [];
    contacts = 0;
    normal = new Vector3();
    constructor(body) {
        const count = body.cage.limbCount ?? 6;
        for (let limb = -1; limb < count; limb++)
            for (let band = 0; band < (limb < 0 ? 1 : 5); band++) {
                const ids = [];
                for (let i = 0; i < body.mass.length; i++) {
                    const x = body.rest[i * 3], z = body.rest[i * 3 + 2], r = Math.hypot(x, z);
                    if (limb < 0 ? r < .022 : r >= .035 && Math.min(4, Math.floor((r - .035) / .011)) === band && (Math.round(Math.atan2(z, x) / (2 * Math.PI / count)) + count) % count === limb)
                        ids.push(i);
                }
                if (ids.length)
                    this.proxies.push({ limb, band, ids, mass: ids.reduce((sum, i) => sum + body.mass[i], 0), radius: limb < 0 ? .023 : band < 2 ? .010 : .007, center: new Vector3(), velocity: new Vector3() });
            }
    }
    apply(body, h) {
        this.contacts = 0;
        for (const p of this.proxies) {
            p.center.set(0, 0, 0);
            p.velocity.set(0, 0, 0);
            for (const i of p.ids) {
                const j = i * 3, w = body.mass[i] / p.mass;
                p.center.x += body.x[j] * w;
                p.center.y += body.x[j + 1] * w;
                p.center.z += body.x[j + 2] * w;
                p.velocity.x += body.velocity[j] * w;
                p.velocity.y += body.velocity[j + 1] * w;
                p.velocity.z += body.velocity[j + 2] * w;
            }
        }
        for (let i = 0; i < this.proxies.length; i++)
            for (let j = i + 1; j < this.proxies.length; j++) {
                const a = this.proxies[i], b = this.proxies[j];
                // Adjacent tissue is connected, not a collision. Distal limbs still collide with the torso.
                if (a.limb === b.limb && Math.abs(a.band - b.band) <= 2 || a.limb < 0 && b.band < 2)
                    continue;
                const n = this.normal.subVectors(b.center, a.center), distance = n.length(), gap = distance - a.radius - b.radius;
                if (distance < 1e-8)
                    n.set(Math.cos(b.limb * 2 * Math.PI / (body.cage.limbCount ?? 6)), 0, Math.sin(b.limb * 2 * Math.PI / (body.cage.limbCount ?? 6)));
                else
                    n.multiplyScalar(1 / distance);
                const relative = (b.velocity.x - a.velocity.x) * n.x + (b.velocity.y - a.velocity.y) * n.y + (b.velocity.z - a.velocity.z) * n.z;
                if (gap > Math.max(0, -relative * h) + .002)
                    continue;
                const change = Math.min(.18, Math.max(0, (.002 - gap) * 35 - relative));
                if (change === 0)
                    continue;
                this.contacts++;
                const impulse = change / (1 / a.mass + 1 / b.mass);
                for (const [p, sign] of [[a, -1], [b, 1]]) {
                    const dv = sign * impulse / p.mass;
                    for (const id of p.ids) {
                        body.velocity[id * 3] += n.x * dv;
                        body.velocity[id * 3 + 1] += n.y * dv;
                        body.velocity[id * 3 + 2] += n.z * dv;
                    }
                }
            }
    }
}
