// Transpiled from lab-creatures src/monster/behavior.ts (GPL-3.0); see ../../UPSTREAM.md
import { Vector3 } from 'three';
import { PreyCradle } from './cradle.js';
import { GroundTraction } from './traction.js';
import { LimbSeparation } from './limb-separation.js';
import { SpiderGait } from './gait.js';
import { TentaclePursuit } from './pursuit.js';
import { DEFAULT_MOTION } from './motion-settings.js';
import { preyImprint } from './prey.js';
import { FeedingCycle } from './feeding.js';
/** World-space stimulus and force output stay separate from rendering and UI.
 * A future Stalheart adapter can supply targets and a local surface frame here. */
export class MonsterBehavior {
    target = new Vector3(.11, .012, .025);
    center = new Vector3();
    velocity = new Vector3();
    torsoCenter = new Vector3();
    gait;
    traction;
    separation;
    pursuit;
    settings;
    feeding = new FeedingCycle();
    cradle;
    targetHeld = false;
    state = 'listening';
    time = 0;
    stimulus = 0;
    active = true;
    restCenter = new Vector3();
    recoil = 0;
    envelope = 0;
    direction = new Vector3();
    accelerations;
    abdominalNodes = [];
    torsoNodes = [];
    body;
    constructor(body, settings = { ...DEFAULT_MOTION }) {
        this.body = body;
        this.cradle = new PreyCradle(body);
        this.traction = new GroundTraction(body);
        this.separation = new LimbSeparation(body);
        this.feeding.viscous = body.cage.variant === 'ovum';
        this.settings = settings;
        this.gait = new SpiderGait(settings, body.cage.limbCount ?? 6);
        this.pursuit = new TentaclePursuit(settings, body.cage.limbCount ?? 6);
        this.accelerations = new Float64Array(body.x.length);
        for (let i = 0; i < body.mass.length; i++)
            if (Math.hypot(body.rest[i * 3], body.rest[i * 3 + 2]) < .034)
                this.abdominalNodes.push(i);
        let torsoMass = 0;
        for (let i = 0; i < body.mass.length; i++)
            if (Math.hypot(body.rest[i * 3], body.rest[i * 3 + 2]) < .022) {
                this.torsoNodes.push({ id: i, weight: body.mass[i] });
                torsoMass += body.mass[i];
            }
        for (const node of this.torsoNodes)
            node.weight /= torsoMass;
        for (let i = 0; i < body.mass.length; i++)
            this.restCenter.addScaledVector(new Vector3().fromArray(body.rest, i * 3), body.mass[i] / body.totalMass);
    }
    disturb() { if (this.feeding.locked)
        return; this.stimulus = 1; this.recoil = .55; this.body.wake(); }
    reset() { this.body.reset(); this.cradle.reset(); this.traction.reset(); this.gait.reset(); this.pursuit.reset(); this.time = 0; this.stimulus = 0; this.recoil = 0; this.envelope = 0; this.state = 'listening'; this.targetHeld = false; this.target.set(.11, .012, .025); this.feeding.reset(this.target); }
    step(h) {
        const b = this.body;
        this.time += h;
        this.stimulus = Math.max(0, this.stimulus - h * .15);
        this.recoil = Math.max(0, this.recoil - h);
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
        this.torsoCenter.set(0, 0, 0);
        const torsoOnFloor = this.abdominalNodes.some(id => b.contact[id] > 0);
        for (const { id, weight } of this.torsoNodes) {
            this.torsoCenter.x += b.x[id * 3] * weight;
            this.torsoCenter.y += b.x[id * 3 + 1] * weight;
            this.torsoCenter.z += b.x[id * 3 + 2] * weight;
        }
        const wasFeeding = this.feeding.locked;
        this.feeding.step(h, this.target, this.torsoCenter, this.active && !this.targetHeld && this.recoil <= 0, torsoOnFloor, this.cradle.ready);
        if (!wasFeeding && this.feeding.locked) {
            this.gait.settle();
            this.cradle.begin(b, this.torsoCenter, this.target);
        }
        if (this.feeding.locked)
            this.cradle.elapsed += h;
        if (wasFeeding && !this.feeding.locked)
            this.stimulus = 1;
        const feeding = this.feeding.locked, aim = feeding ? this.torsoCenter : this.center, dx = this.target.x - aim.x, dz = this.target.z - aim.z, distance = Math.hypot(dx, dz);
        const cycle = this.time % 9;
        this.state = this.recoil > 0 ? 'recoiling' : !this.active ? 'listening' : distance < .035 ? 'enveloping' : distance < 1.2 && (cycle > 1.3 || this.stimulus > .2) ? 'stalking' : cycle > .5 ? 'probing' : 'listening';
        if (this.feeding.phase !== 'hunting')
            this.state = this.feeding.phase;
        this.envelope += ((this.state === 'enveloping' ? 1 : 0) - this.envelope) * (1 - Math.exp(-h * 4));
        b.canSleep = false;
        b.wake();
        const stalk = this.state === 'stalking';
        this.direction.set(dx / (distance || 1), 0, dz / (distance || 1));
        this.pursuit.step(h, this.direction, stalk || this.state === 'enveloping', distance);
        const cradling = this.feeding.phase === 'cradling';
        const covering = this.feeding.phase === 'covering', engulfing = this.feeding.phase === 'dropping' || this.feeding.phase === 'absorbing';
        const speed = covering || engulfing ? Math.min(.065, distance * 8) : stalk ? this.pursuit.speed * Math.min(1, Math.max(0, (distance - .028) / .045)) : 0;
        const follow = this.pursuit.phase === 'pull';
        this.gait.step(h, this.center, this.direction, stalk && follow, !feeding && this.pursuit.reach > .2 ? this.pursuit.lead : -1, !feeding && this.pursuit.secondReach > .2 ? this.pursuit.secondLead : -1);
        const grip = this.settings.grip;
        this.traction.prepare(b, this.gait, this.pursuit, !feeding && grip > 0);
        const support = feeding ? 1 : 1 - Math.min(1, grip) * (1 - Math.min(1, this.traction.supports / 2));
        const brake = 30 + (!follow ? grip * 28 : 0);
        const side = this.pursuit.side;
        // A dedicated damped centering force replaces gait/feints during capture.
        const ax = cradling ? (this.cradle.anchor.x - this.torsoCenter.x) * 300 - this.velocity.x * 45 : covering || engulfing ? Math.max(-6, Math.min(6, dx * 600 - this.velocity.x * 45)) : ((this.direction.x - this.direction.z * side) * speed * 30 * support - this.velocity.x * brake);
        const az = cradling ? (this.cradle.anchor.z - this.torsoCenter.z) * 300 - this.velocity.z * 45 : covering || engulfing ? Math.max(-6, Math.min(6, dz * 600 - this.velocity.z * 45)) : ((this.direction.z + this.direction.x * side) * speed * 30 * support - this.velocity.z * brake);
        const targetAngle = Math.atan2(dz, dx);
        let horizontalForceX = 0, verticalForce = 0, horizontalForceZ = 0;
        for (let i = 0; i < b.mass.length; i++) {
            const j = i * 3, rx = b.rest[j] - this.restCenter.x, rz = b.rest[j + 2] - this.restCenter.z;
            const radius = Math.hypot(rx, rz), angle = Math.atan2(rz, rx), limb = (Math.round(angle / this.gait.spacing) + this.gait.count) % this.gait.count;
            const tip = Math.min(1, Math.max(0, (radius - .034) / .054));
            const footWeight = tip * tip;
            const second = limb === this.pursuit.secondLead;
            const leading = feeding ? 0 : limb === this.pursuit.lead ? this.pursuit.reach : second ? this.pursuit.secondReach : 0;
            const probe = second ? this.pursuit.secondDirection : this.pursuit.firstDirection;
            const awareness = Math.max(0, Math.cos(angle - targetAngle));
            // Only the leading one or two legs threaten the lure; the others bear weight.
            const attack = feeding ? 0 : this.envelope * Math.max(0, (awareness - .65) / .35);
            const recoil = this.recoil / .55 * this.settings.recoil;
            const foot = this.gait.feet[limb], footVelocity = this.gait.velocities[limb], limbAngle = limb * this.gait.spacing;
            const footDx = foot.x - (this.center.x + Math.cos(limbAngle) * .088);
            const footDz = foot.z - (this.center.z + Math.sin(limbAngle) * .088);
            const brace = 1 - footWeight;
            const lean = this.state === 'probing' ? .0003 * brace : 0;
            // Two limbs search on opposite sides of the stimulus, slightly out of phase.
            const lateral = -rx * Math.sin(limbAngle) + rz * Math.cos(limbAngle);
            const fan = leading * tip * .8 * lateral * this.settings.spread * this.pursuit.searchScale;
            const extend = leading * tip * .034 * this.settings.stretch * this.pursuit.searchScale;
            const steer = leading * footWeight * .85 * this.pursuit.searchScale;
            const alignX = (probe.x - Math.cos(limbAngle)) * radius * steer;
            const alignZ = (probe.z - Math.sin(limbAngle)) * radius * steer;
            let tx = this.center.x + rx + footWeight * footDx * (1 - leading) - attack * tip * rx * .2 + this.direction.x * lean + probe.x * extend + alignX - Math.sin(limbAngle) * fan;
            let tz = this.center.z + rz + footWeight * footDz * (1 - leading) - attack * tip * rz * .2 + this.direction.z * lean + probe.z * extend + alignZ + Math.cos(limbAngle) * fan;
            // Keep intended reaches in separate radial sectors and outside the torso.
            // Contact impulses handle actual deformed limbs that approach each other.
            if (radius > .040) {
                const x = tx - this.center.x, z = tz - this.center.z;
                // Sensors may leave their resting sector to reach forward. Their two
                // noncrossing directions define narrow moving sectors; support feet
                // retain the original radial limits. Blend avoids a jump at probe onset.
                const probeAngle = Math.atan2(probe.z, probe.x);
                const turn = Math.atan2(Math.sin(probeAngle - limbAngle), Math.cos(probeAngle - limbAngle));
                const sector = limbAngle + turn * leading * this.pursuit.searchScale;
                const delta = Math.atan2(Math.sin(Math.atan2(z, x) - sector), Math.cos(Math.atan2(z, x) - sector));
                const angle = sector + Math.max(-this.gait.spacing * .46, Math.min(this.gait.spacing * .46, delta));
                const extent = Math.max(.035 + tip * .018, Math.hypot(x, z));
                tx = this.center.x + Math.cos(angle) * extent;
                tz = this.center.z + Math.sin(angle) * extent;
            }
            const coreWeight = 1 - Math.min(1, Math.max(0, (radius - .024) / .040));
            const bulge = this.feeding.imprint > 0 ? this.feeding.imprint * .040 * preyImprint(this.feeding.shape, b.x[j] - this.feeding.capturedPosition.x, b.x[j + 2] - this.feeding.capturedPosition.z) : 0;
            let ty = b.rest[j + 1] + tip * foot.y * (1 - leading) + attack * footWeight * .012 - brace * (recoil * .006 + this.envelope * .004)
                + leading * tip * (.012 - b.rest[j + 1]) * .7 - this.pursuit.pull * brace * .002 - this.feeding.drop * coreWeight * .048 + bulge;
            if (cradling || covering || engulfing) {
                const wrap = this.cradle.target(b, i, limb, this.torsoCenter, this.feeding.capturedPosition, this.feeding.shape, this.feeding.drop);
                tx += (this.cradle.point.x - tx) * wrap;
                ty += (this.cradle.point.y - ty) * wrap;
                tz += (this.cradle.point.z - tz) * wrap;
            }
            // Internal muscle forces transfer the body's weight into the planted legs.
            // Removing net vertical force prevents the controller levitating the torso.
            const k = 1400 + footWeight * 1000 + leading * tip * 5000, damping = leading > .2 ? 42 : 48;
            const swingWeight = footWeight * (1 - leading);
            // Long reaches need additional muscle authority: the old constant cap
            // saturated at modest stretch values, making the top of the slider inert.
            const reachForce = 32 + leading * tip * this.pursuit.searchScale * this.settings.stretch * 24;
            this.accelerations[j] = Math.max(-reachForce, Math.min(reachForce, k * (tx - b.x[j]) - damping * (b.velocity[j] - this.velocity.x * (1 - footWeight) - footVelocity.x * swingWeight)));
            this.accelerations[j + 1] = Math.max(-250, Math.min(250, (9000 + footWeight * 18000) * (ty - b.x[j + 1]) - 85 * (b.velocity[j + 1] - this.velocity.y - footVelocity.y * tip * (1 - leading))));
            this.accelerations[j + 2] = Math.max(-reachForce, Math.min(reachForce, k * (tz - b.x[j + 2]) - damping * (b.velocity[j + 2] - this.velocity.z * (1 - footWeight) - footVelocity.z * swingWeight)));
            verticalForce += this.accelerations[j + 1] * b.mass[i];
            horizontalForceX += this.accelerations[j] * b.mass[i];
            horizontalForceZ += this.accelerations[j + 2] * b.mass[i];
        }
        const verticalMean = verticalForce / b.totalMass;
        // Searching is an internal reach: its muscle forces must not tow the torso.
        const balanceHorizontal = feeding || this.pursuit.phase === 'reach';
        for (let i = 0; i < b.mass.length; i++) {
            const j = i * 3;
            const drive = 1 - this.traction.weights[i] * Math.min(1, grip);
            b.velocity[j] += (this.accelerations[j] + ax * drive - (balanceHorizontal ? horizontalForceX / b.totalMass : 0)) * h;
            b.velocity[j + 1] += (this.accelerations[j + 1] - verticalMean) * h;
            b.velocity[j + 2] += (this.accelerations[j + 2] + az * drive - (balanceHorizontal ? horizontalForceZ / b.totalMass : 0)) * h;
        }
        this.traction.apply(b, h, grip);
        this.separation.apply(b, h);
        if (cradling || covering)
            this.cradle.constrain(b, h, this.feeding.capturedPosition, this.feeding.shape);
    }
}
