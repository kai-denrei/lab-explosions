// Transpiled from lab-creatures src/cutis/creature/hard-core.ts (GPL-3.0); see ../UPSTREAM.md
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/** Rigid geometry never inherits membrane vertex stretching. */
export function createHardCores(swarm) {
    // Two opposed, interpenetrating triangular pyramids, as in the reference:
    // a raised triangular base points down through the lower upward-pointing one.
    const a = new THREE.ConeGeometry(Math.sqrt(8 / 9), 4 / 3, 3);
    a.translate(0, 1 / 3, 0);
    const b = a.clone();
    b.rotateX(Math.PI);
    const tint = (g, value) => { const colors = new Float32Array(g.getAttribute('position').count * 3); colors.fill(value); g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); };
    tint(a, 1);
    tint(b, .32);
    const pyramids = mergeGeometries([a, b]);
    a.dispose();
    b.dispose();
    const geometries = [new THREE.DodecahedronGeometry(1), pyramids, new THREE.SphereGeometry(1, 24, 16)];
    for (const geometry of geometries)
        if (!geometry.hasAttribute('color'))
            tint(geometry, 1);
    const meshes = geometries.map((geometry, i) => { const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, metalness: i === 2 ? 0 : .45, roughness: i === 2 ? .17 : .27, clearcoat: 1, clearcoatRoughness: .12, flatShading: i !== 2, emissive: 0x000000 }); const mesh = new THREE.InstancedMesh(geometry, material, swarm.capacity); mesh.frustumCulled = false; mesh.renderOrder = 1; return mesh; });
    const group = new THREE.Group();
    group.name = 'Rigid hard cores';
    group.add(...meshes);
    const pose = new THREE.Object3D(), color = new THREE.Color();
    function update() {
        for (let j = 0; j < meshes.length; j++) {
            const mesh = meshes[j];
            let count = 0;
            for (let i = 0; i < swarm.count; i++) {
                const config = swarm.configFor(i);
                if (Math.round(config.coreShape) !== j + 1)
                    continue;
                const p = swarm.getCoreContact(i);
                pose.position.set(p.center.x, p.center.y, p.center.z);
                pose.scale.setScalar(p.radius);
                pose.rotation.set(.2, swarm.seed[i] + swarm.time * .18, .16);
                pose.updateMatrix();
                mesh.setMatrixAt(count, pose.matrix);
                mesh.setColorAt(count, color.setHex(config.coreTint));
                count++;
            }
            mesh.count = count;
            mesh.visible = count > 0;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor)
                mesh.instanceColor.needsUpdate = true;
        }
    }
    return { group, meshes, update, dispose: () => meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); m.dispose(); }) };
}
