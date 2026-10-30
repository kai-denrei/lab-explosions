// Transpiled from lab-creatures src/monster/skin.ts (GPL-3.0); see ../../UPSTREAM.md
import { Color } from 'three';
/** Shared pigmentation for the creature and the temporary wrapped-prey surface. */
export function tissueColors(positions, limbs = 6) {
    const colors = new Float32Array(positions.length);
    const pale = new Color('#b8b99a'), dark = new Color('#374237'), color = new Color();
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], z = positions[i + 2], r = Math.hypot(x, z), a = Math.atan2(z, x);
        const trunk = Math.pow(Math.max(0, Math.cos(a * limbs + Math.sin(r * 240) * .11)), 36);
        const branches = Math.pow(Math.max(0, Math.cos(a * limbs * 6 + r * 620 + Math.sin(a * limbs) * 3)), 28) * .33;
        const pigment = Math.min(.9, .42 * Math.exp(-r * 95) + trunk * .6 + branches);
        color.copy(pale).lerp(dark, pigment);
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
    }
    return colors;
}
