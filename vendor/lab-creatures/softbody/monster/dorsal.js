// Transpiled from lab-creatures src/monster/dorsal.ts (GPL-3.0); see ../../UPSTREAM.md
import * as THREE from 'three';
/** Lightweight dorsal growths follow the deformed back; they are not extra
 * rigid bodies or independently colliding limbs. */
export function createDorsalGrowth(body) {
    const root = new THREE.Group();
    root.name = 'Bocydium-inspired dorsal growth';
    const material = new THREE.MeshPhysicalMaterial({ color: '#78836a', roughness: .3, metalness: 0, clearcoat: .55, clearcoatRoughness: .18 });
    const add = (geometry) => { const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh; };
    const branch = (points, radius) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 18, radius, 7, false));
    branch([[0, -.003, 0], [0, .014, 0], [0, .033, -.002]], .0025);
    for (const side of [-1, 1])
        for (const front of [-1, 1]) {
            const tip = [side * .031, .044 + (front < 0 ? .006 : 0), front * .020];
            branch([[0, .027, 0], [side * .012, .038, front * .007], tip], .0016);
            const bulb = add(new THREE.SphereGeometry(front < 0 ? .007 : .006, 16, 12));
            bulb.position.set(...tip);
        }
    branch([[0, .028, 0], [0, .034, .020], [0, .026, .046]], .0015);
    const samples = [];
    for (let j = 0; j < body.surface.positions.length; j += 3)
        if (Math.hypot(body.surface.positions[j], body.surface.positions[j + 2]) < .009 && body.surface.restNormals[j + 1] > .5)
            samples.push(j);
    const center = new THREE.Vector3(), normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    function update() {
        center.set(0, 0, 0);
        normal.set(0, 0, 0);
        const positions = body.surface.positions, normals = body.surface.geometry.getAttribute('normal').array;
        for (const j of samples) {
            center.x += positions[j];
            center.y += positions[j + 1];
            center.z += positions[j + 2];
            normal.x += normals[j];
            normal.y += normals[j + 1];
            normal.z += normals[j + 2];
        }
        center.divideScalar(samples.length || 1);
        normal.normalize();
        if (normal.lengthSq() < .1)
            normal.copy(up);
        root.position.copy(center);
        root.quaternion.setFromUnitVectors(up, normal);
        root.updateMatrixWorld(true);
    }
    update();
    return { root, update };
}
