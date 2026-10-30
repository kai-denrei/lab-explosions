// Transpiled from lab-creatures src/monster/prey.ts (GPL-3.0); see ../../UPSTREAM.md
import * as THREE from 'three';
import { attribute, uniform, mix, positionLocal, smoothstep } from '../tsl-stub.js';
import { tissueColors } from './skin.js';
export const PREY_SHAPES = ['sphere', 'cube', 'prism', 'dodecahedron'];
export function preyGeometry(shape) {
    switch (shape) {
        case 'sphere': return new THREE.SphereGeometry(.011, 24, 16);
        case 'cube': return new THREE.BoxGeometry(.022, .022, .022);
        case 'prism': return new THREE.CylinderGeometry(.013, .013, .022, 3);
        case 'dodecahedron': return new THREE.DodecahedronGeometry(.013);
    }
}
// Convex face planes let the physical membrane follow the same outline as
// the rendered prey, including the prism corners and polyhedron facets.
const profiles = new Map();
function planes(shape) {
    if (profiles.has(shape))
        return profiles.get(shape);
    const geometry = preyGeometry(shape), p = geometry.getAttribute('position'), indices = geometry.index;
    const result = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < (indices?.count ?? p.count); i += 3) {
        a.fromBufferAttribute(p, indices ? indices.getX(i) : i);
        b.fromBufferAttribute(p, indices ? indices.getX(i + 1) : i + 1);
        c.fromBufferAttribute(p, indices ? indices.getX(i + 2) : i + 2);
        const plane = new THREE.Plane().setFromCoplanarPoints(a, b, c);
        if (plane.constant > 0)
            plane.negate();
        if (!result.some(other => other.normal.distanceToSquared(plane.normal) < 1e-8 && Math.abs(other.constant - plane.constant) < 1e-6))
            result.push(plane);
    }
    geometry.dispose();
    profiles.set(shape, result);
    return result;
}
export function preyImprint(shape, x, z) {
    if (shape === 'sphere')
        return Math.pow(Math.max(0, 1 - (Math.hypot(x, z) / .020) ** 2), 1.3);
    x /= 1.3;
    z /= 1.3;
    let lower = -Infinity, upper = Infinity;
    for (const { normal: n, constant } of planes(shape)) {
        const offset = -constant - n.x * x - n.z * z;
        if (Math.abs(n.y) < 1e-6) {
            if (offset < 0)
                return 0;
        }
        else if (n.y > 0)
            upper = Math.min(upper, offset / n.y);
        else
            lower = Math.max(lower, offset / n.y);
    }
    if (upper < lower)
        return 0;
    return .7 * Math.max(0, Math.min(1, (upper + .011) / .022));
}
/** Conservative rounded convex clearance; the outward normal drives contact. */
export function preyClearance(shape, x, y, z, normal) {
    if (shape === 'sphere') {
        const length = Math.hypot(x, y, z);
        normal.set(x, y, z).divideScalar(length || 1);
        if (length < 1e-8)
            normal.set(0, 1, 0);
        return length - .011;
    }
    let distance = -Infinity;
    for (const plane of planes(shape)) {
        const d = plane.normal.x * x + plane.normal.y * y + plane.normal.z * z + plane.constant;
        if (d > distance) {
            distance = d;
            normal.copy(plane.normal);
        }
    }
    return distance;
}
function wrappedGeometry(shape) {
    const geometry = preyGeometry(shape);
    geometry.setAttribute('skinColor', new THREE.BufferAttribute(tissueColors(geometry.getAttribute('position').array), 3));
    return geometry;
}
export function createPrey() {
    const coverage = uniform(0), viscous = uniform(0), direction = uniform(new THREE.Vector3(1, 0, 0)), red = new THREE.Color('#c94d38');
    // One precompiled material blends the original surface into opaque tissue.
    // No transparent overlay, material swap, or geometry shrink during ingestion.
    const material = new THREE.MeshPhysicalMaterial({ metalness: .45, roughness: .3, emissive: '#751e16', emissiveIntensity: .2,
        ior: 1.37, clearcoatRoughness: .16 });
    material.clearcoatNode = coverage.mul(.65);
    const contactCoordinate = positionLocal.xz.dot(direction.xz).mul(.65).add(positionLocal.y.mul(.35));
    const front = coverage.mul(.04).sub(.02);
    const coated = smoothstep(front.sub(.003), front.add(.003), contactCoordinate).oneMinus();
    material.colorNode = mix(uniform(red), attribute('skinColor', 'vec3'), mix(coverage, coated, viscous));
    const mesh = new THREE.Mesh(wrappedGeometry('sphere'), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    let shape = 'sphere';
    return { mesh, update(feeding) {
            if (shape !== feeding.shape) {
                shape = feeding.shape;
                mesh.geometry.dispose();
                mesh.geometry = wrappedGeometry(shape);
            }
            const wrap = feeding.skinCoverage;
            coverage.value = wrap;
            viscous.value = feeding.viscous ? 1 : 0;
            direction.value.copy(feeding.contactDirection);
            material.metalness = .45 * (1 - wrap);
            material.roughness = .3 - .04 * wrap;
            material.emissiveIntensity = .2 * (1 - wrap);
            mesh.position.copy(feeding.preyPosition);
            mesh.scale.setScalar(feeding.scale);
            mesh.visible = feeding.visible;
        } };
}
