// Transpiled from lab-creatures src/cutis/swarm/locomotion.ts (GPL-3.0); see ../UPSTREAM.md
/** Gorogoro preserves the original reach/transfer, then adds one reach of rolling. */
export function membranePhase(phase, rolling) { return rolling ? Math.min(.85, phase / .8) : phase; }
export function rollMotion(phase, reach, radius, recoil, launchHeight) {
    if (phase < .496)
        return { distance: 0, lift: 0, angle: 0 };
    // One trajectory spans weight transfer and rolling; no second acceleration.
    const t = Math.max(0, Math.min(1, (phase - .68) / .22));
    const carry = Math.max(0, Math.min(1, (phase - .496) / .404)), travel = carry * carry * (3 - 2 * carry);
    const turn = t * t * (3 - 2 * t);
    const landing = Math.max(0, Math.min(1, (phase - .9) / .1));
    const kick = phase >= .9 ? -radius * .12 * recoil * Math.sin(Math.PI * landing) * Math.exp(-4 * landing) : 0;
    return { distance: 2 * reach * travel + kick, lift: t < .25 ? Math.sin(t / .25 * Math.PI) * radius * launchHeight : 0, angle: Math.max(1, Math.round(reach / (Math.PI * 2 * radius))) * Math.PI * 2 * turn };
}
/** Blend the two clocks before their boundary instead of changing speed at it. */
export function momentumRate(phase, transferRate, rollRate) {
    const t = Math.max(0, Math.min(1, (phase - .58) / .20)), blend = t * t * (3 - 2 * t);
    return transferRate + (rollRate - transferRate) * blend;
}
