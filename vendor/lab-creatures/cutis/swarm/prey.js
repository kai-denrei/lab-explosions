// Transpiled from lab-creatures src/cutis/swarm/prey.ts (GPL-3.0); see ../UPSTREAM.md
/** Persistent prey velocity: plans influence steering, never teleport position. */
export class FleeingPrey {
    vx = .5;
    vz = -.5;
    step(dt, position, swarm) {
        const radius = Math.hypot(position.x, position.z), nx = position.x / Math.max(.01, radius), nz = position.z / Math.max(.01, radius);
        let dx = nz * .65 - nx * Math.max(0, radius - 7) * 2, dz = -nx * .65 - nz * Math.max(0, radius - 7) * 2, threat = 0;
        for (let i = 0; i < swarm.count; i++) {
            const body = swarm.position(i), landing = swarm.getLanding(i);
            for (const [x, z, weight] of [[body[0], body[2], 1], [landing.x, landing.z, .45]]) {
                const ex = position.x - x, ez = position.z - z, d = Math.hypot(ex, ez), fear = Math.max(0, 1 - d / 5) * weight;
                dx += ex / Math.max(.05, d) * fear * 4;
                dz += ez / Math.max(.05, d) * fear * 4;
                threat = Math.max(threat, fear);
            }
        }
        const speed = .55 + threat * 2.3, length = Math.hypot(dx, dz) || 1;
        const ax = dx / length * speed - this.vx, az = dz / length * speed - this.vz;
        const blend = Math.min(1, dt * 3, dt * 2.5 / Math.max(.001, Math.hypot(ax, az)));
        this.vx += ax * blend;
        this.vz += az * blend;
        position.x += this.vx * dt;
        position.z += this.vz * dt;
    }
}
