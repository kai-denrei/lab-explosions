// Transpiled from lab-creatures src/cutis/creature/geometry.ts (GPL-3.0); see ../UPSTREAM.md
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMembraneMaterial, updateMaterial } from './material.js';
import { CUTIS_TIERS, PEARL_TIERS, GOROGORO_TIERS } from '../swarm/tiers.js';
const sizes = { iOffset: 3, iHeading: 3, iPreviousHeading: 3, iAnchor: 3, iState: 4, iParams: 4, iProbe0: 3, iProbe1: 3, iProbe2: 3 };
export function createSwarmGeometry(swarm) {
    const group = new THREE.Group();
    group.name = 'Cutis-Maku';
    const levels = [false, true].map(low => {
        // Ring-aligned caps keep cross-sections coherent even on long curved stalks.
        // A spherical convex hull joins all three patches into one closed membrane.
        const caps = [-1.2, 0, 1.2].map(a => new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
        const points = [], base = new THREE.SphereGeometry(1, low ? 16 : 40, low ? 12 : 24);
        const positions = base.getAttribute('position'), boundary = .59;
        for (let i = 0; i < positions.count; i++) {
            const n = new THREE.Vector3().fromBufferAttribute(positions, i);
            if (caps.every(axis => n.dot(axis) < Math.cos(boundary)))
                points.push(n);
        }
        base.dispose();
        const rings = low ? 20 : 48, sides = low ? 16 : 40;
        for (const axis of caps) {
            const tangent = new THREE.Vector3(axis.z, 0, -axis.x);
            points.push(axis.clone());
            for (let j = 1; j <= rings; j++) {
                const theta = boundary * Math.pow(j / rings, 1.35);
                for (let k = 0; k < sides; k++) {
                    const a = k / sides * Math.PI * 2;
                    points.push(axis.clone().multiplyScalar(Math.cos(theta)).addScaledVector(tangent, Math.sin(theta) * Math.cos(a)).add(new THREE.Vector3(0, Math.sin(theta) * Math.sin(a), 0)));
                }
            }
        }
        const hull = new ConvexGeometry(points);
        hull.deleteAttribute('normal');
        const geometry = mergeVertices(hull);
        hull.dispose();
        const coreGeometry = geometry.clone();
        const attributes = Object.fromEntries(Object.entries(sizes).map(([name, size]) => [name, new THREE.InstancedBufferAttribute(new Float32Array(swarm.capacity * size), size).setUsage(THREE.DynamicDrawUsage)]));
        for (const [name, attribute] of Object.entries(attributes)) {
            geometry.setAttribute(name, attribute);
            coreGeometry.setAttribute(name, attribute);
        }
        const material = createMembraneMaterial(swarm.config, false, low), coreMaterial = createMembraneMaterial(swarm.config, true, true);
        const membrane = new THREE.InstancedMesh(geometry, material, swarm.capacity), core = new THREE.InstancedMesh(coreGeometry, coreMaterial, swarm.capacity);
        membrane.frustumCulled = core.frustumCulled = false;
        membrane.renderOrder = 2;
        core.renderOrder = 1;
        group.add(core, membrane);
        return { geometry, coreGeometry, material, coreMaterial, membrane, core, attributes, count: 0, low, preset: null, tier: -1 };
    });
    // Batch by tier and LOD so every membrane uses its own full preset without
    // consuming more vertex attributes or issuing one draw per creature.
    const baseLevels = [...levels];
    for (const [tier, preset] of CUTIS_TIERS.entries())
        for (const base of baseLevels) {
            const geometry = base.geometry.clone(), coreGeometry = base.coreGeometry.clone();
            const attributes = Object.fromEntries(Object.entries(sizes).map(([name, size]) => [name, new THREE.InstancedBufferAttribute(new Float32Array(swarm.capacity * size), size).setUsage(THREE.DynamicDrawUsage)]));
            for (const [name, attribute] of Object.entries(attributes)) {
                geometry.setAttribute(name, attribute);
                coreGeometry.setAttribute(name, attribute);
            }
            const material = createMembraneMaterial(preset.values, false, base.low), coreMaterial = createMembraneMaterial(preset.values, true, true);
            const membrane = new THREE.InstancedMesh(geometry, material, swarm.capacity), core = new THREE.InstancedMesh(coreGeometry, coreMaterial, swarm.capacity);
            membrane.frustumCulled = core.frustumCulled = false;
            membrane.renderOrder = 2;
            core.renderOrder = 1;
            group.add(core, membrane);
            levels.push({ geometry, coreGeometry, material, coreMaterial, membrane, core, attributes, count: 0, low: base.low, preset: preset.values, tier });
        }
    const position = new THREE.Vector3(), state = new Float32Array(swarm.capacity * 4);
    function update(camera, height, debug = 0, force = false) {
        levels.forEach(l => l.count = 0);
        for (let i = 0; i < swarm.count; i++) {
            state[i * 4] = swarm.phase[i];
            state[i * 4 + 1] = swarm.seed[i];
            state[i * 4 + 2] = swarm.scale[i];
            state[i * 4 + 3] = swarm.probeCount[i] * 4 + swarm.chosenProbe[i];
        }
        const source = { iOffset: swarm.offset, iHeading: swarm.heading, iPreviousHeading: swarm.previousHeading, iAnchor: swarm.anchor, iState: state, iParams: swarm.params, iProbe0: swarm.probe0, iProbe1: swarm.probe1, iProbe2: swarm.probe2 };
        for (let i = 0; i < swarm.count; i++) {
            const config = swarm.configFor(i);
            position.set(swarm.offset[i * 3], config.r0, swarm.offset[i * 3 + 2]);
            const pixels = config.r0 * swarm.scale[i] * height / (2 * Math.tan(camera.fov * Math.PI / 360) * Math.max(.1, camera.position.distanceTo(position)));
            const batch = swarm.mixed && swarm.count > 1 ? 2 + (i % CUTIS_TIERS.length) * 2 : 0;
            const level = levels[batch + (pixels < 26 ? 1 : 0)], index = level.count++;
            for (const [name, size] of Object.entries(sizes)) {
                const array = level.attributes[name].array;
                for (let k = 0; k < size; k++)
                    array[index * size + k] = source[name][i * size + k];
            }
        }
        for (const l of levels) {
            const config = l.tier >= 0 ? (swarm.config.rollVariant ? GOROGORO_TIERS : swarm.config.pearlVariant ? PEARL_TIERS : CUTIS_TIERS)[l.tier].values : swarm.config;
            l.membrane.count = l.core.count = l.count;
            l.membrane.visible = l.count > 0;
            l.core.visible = l.count > 0 && config.coreShape < 1;
            for (const a of Object.values(l.attributes)) {
                a.clearUpdateRanges();
                a.addUpdateRange(0, l.count * a.itemSize);
                a.needsUpdate = true;
            }
            updateMaterial(l.material, config, swarm.time, debug, force);
            updateMaterial(l.coreMaterial, config, swarm.time, debug, force);
        }
    }
    return { group, levels, update, dispose: () => levels.forEach(l => { l.geometry.dispose(); l.coreGeometry.dispose(); l.material.dispose(); l.coreMaterial.dispose(); l.membrane.dispose(); l.core.dispose(); }) };
}
