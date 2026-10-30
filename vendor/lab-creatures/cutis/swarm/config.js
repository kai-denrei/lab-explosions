// Transpiled from lab-creatures src/cutis/swarm/config.ts (GPL-3.0); see ../UPSTREAM.md
export const DEFAULT_CONFIG = { "cycleDuration": 4, "aggression": 2, "reach": 15, "capAngle": 10, "seekSweep": 0.85, "seekCount": 3, "seekRate": 1, "transferAcceleration": 1, "neckThin": 0.5, "delaySpread": 0.25, "cubenessPeak": 0.9, "wobble": 0.5, "r0": 0.2, "noiseAmp": 0.2, "breathRate": 1.5, "cubenessRest": 0.25, "pulseSpeed": 2, "veinWidth": 0.1, "skinTint": 12165524, "veinTint": 3679278, "pulseTint": 15497546, "separation": 2, "alignment": 0.35, "cohesion": 0.15, membraneOpacity: 1, coreShape: 0, coreSize: .28, pearlVariant: 0, rollVariant: 0, rollDuration: .9, landingPause: .45, launchHeight: .5, coreTint: 0xff242c, contactDamage: 0, health: 60 };
export const CUTIS_CONTROLS = [
    { key: 'cycleDuration', label: 'Cycle duration', group: 'Hunt', min: .5, max: 10, step: .05, unit: 's' },
    { key: 'aggression', label: 'Hunting urgency', group: 'Hunt', min: 0, max: 4, step: .05, unit: '×' },
    { key: 'reach', label: 'Reach distance', group: 'Hunt', min: 1.5, max: 20, step: .1, unit: '× radius' },
    { key: 'capAngle', label: 'Reaching cap', group: 'Hunt', min: 10, max: 85, step: 1, unit: '°' },
    { key: 'seekSweep', optional: true, label: 'Seeking sweep', group: 'Hunt', min: 0, max: 4, step: .05, unit: '× radius' },
    { key: 'seekCount', optional: true, label: 'Seeking appendages', group: 'Hunt', min: 1, max: 3, step: 1, unit: 'appendages' },
    { key: 'seekRate', optional: true, label: 'Seeking frequency', group: 'Hunt', min: .2, max: 5, step: .1, unit: 'cycles' },
    { key: 'transferAcceleration', optional: true, label: 'Transfer acceleration', group: 'Transfer', min: 1, max: 6, step: .1, unit: 'power' },
    { key: 'neckThin', label: 'Neck thickness', group: 'Transfer', min: .05, max: 1, step: .01, unit: '×' },
    { key: 'delaySpread', label: 'Rear-body delay', group: 'Transfer', min: 0, max: .98, step: .01, unit: '×' },
    { key: 'cubenessPeak', label: 'Fold structure', group: 'Transfer', min: 0, max: 1, step: .01, unit: '×' },
    { key: 'wobble', label: 'Settling recoil', group: 'Transfer', min: 0, max: 4, step: .05, unit: '×' },
    { key: 'r0', label: 'Body radius', group: 'Body', min: .05, max: 1, step: .01, unit: 'm' },
    { key: 'noiseAmp', label: 'Asymmetry', group: 'Body', min: 0, max: .8, step: .01, unit: '×' },
    { key: 'breathRate', label: 'Breathing', group: 'Body', min: .1, max: 6, step: .05, unit: 'Hz' },
    { key: 'cubenessRest', label: 'Latent structure', group: 'Body', min: 0, max: .6, step: .01, unit: '×' },
    { key: 'pulseSpeed', label: 'Vein pulse speed', group: 'Surface', min: .5, max: 30, step: .1, unit: '×' },
    { key: 'veinWidth', label: 'Vein width', group: 'Surface', min: .005, max: .24, step: .005, unit: '×' },
    { key: 'skinTint', label: 'Membrane tint', group: 'Surface', min: 0, max: 16777215, step: 1, unit: 'hex', kind: 'color' },
    { key: 'veinTint', label: 'Vein tint', group: 'Surface', min: 0, max: 16777215, step: 1, unit: 'hex', kind: 'color' },
    { key: 'pulseTint', label: 'Pulse tint', group: 'Surface', min: 0, max: 16777215, step: 1, unit: 'hex', kind: 'color' },
    { key: 'membraneOpacity', optional: true, label: 'Membrane opacity', group: 'Core', min: .08, max: 1, step: .01, unit: '×' },
    { key: 'coreShape', optional: true, label: 'Core shape', group: 'Core', min: 0, max: 3, step: 1, unit: 'shape' },
    { key: 'rollVariant', optional: true, label: 'Rolling locomotion', group: 'Locomotion', min: 0, max: 1, step: 1, unit: 'on' },
    { key: 'rollDuration', optional: true, label: 'Roll duration', group: 'Locomotion', min: .3, max: 3, step: .05, unit: 's' },
    { key: 'landingPause', optional: true, label: 'Landing recovery', group: 'Locomotion', min: .15, max: 2, step: .05, unit: 's' },
    { key: 'launchHeight', optional: true, label: 'Launch lift', group: 'Locomotion', min: 0, max: 1, step: .05, unit: '× radius' },
    { key: 'pearlVariant', optional: true, label: 'All-pearl lineage', group: 'Core', min: 0, max: 1, step: 1, unit: 'on' },
    { key: 'coreSize', optional: true, label: 'Core radius', group: 'Core', min: .1, max: .75, step: .01, unit: '× body' },
    { key: 'coreTint', optional: true, label: 'Core color', group: 'Core', min: 0, max: 16777215, step: 1, unit: 'hex', kind: 'color' },
    { key: 'contactDamage', optional: true, label: 'Hard contact damage', group: 'Core', min: 0, max: 100, step: 1, unit: 'HP/s' },
    { key: 'health', optional: true, label: 'Health', group: 'Core', min: 1, max: 1000, step: 1, unit: 'HP' },
    { key: 'separation', label: 'Keep distance', group: 'Swarm', min: 0, max: 6, step: .05, unit: '×' },
    { key: 'alignment', label: 'Heading alignment', group: 'Swarm', min: 0, max: 2, step: .05, unit: '×' },
    { key: 'cohesion', label: 'Weak cohesion', group: 'Swarm', min: 0, max: .5, step: .01, unit: '×' },
];
export const CUTIS_PRESETS = { patient: { cycleDuration: 2.5, aggression: .35, reach: 4.2, delaySpread: .78, neckThin: .25 }, feral: { cycleDuration: .85, aggression: 1.8, reach: 4.7, delaySpread: .82, neckThin: .2 }, drifting: { cycleDuration: 2.1, aggression: 0, reach: 2, delaySpread: .4, neckThin: .5 } };
export function sanitizeConfig(value) {
    const result = { ...DEFAULT_CONFIG };
    if (value && typeof value === 'object')
        for (const c of CUTIS_CONTROLS) {
            const n = value[c.key];
            if (typeof n === 'number' && Number.isFinite(n))
                result[c.key] = Math.min(c.max, Math.max(c.min, n));
        }
    result.seekCount = Math.round(result.seekCount);
    result.coreShape = Math.round(result.coreShape);
    result.pearlVariant = Math.round(result.pearlVariant);
    result.rollVariant = Math.round(result.rollVariant);
    return result;
}
export function loadConfig(key = 'cutis-maku-v4', defaults = DEFAULT_CONFIG) { try {
    return sanitizeConfig({ ...defaults, ...JSON.parse(localStorage.getItem(key) || 'null') });
}
catch {
    return { ...defaults };
} }
export function saveConfig(config, key = 'cutis-maku-v4') { try {
    localStorage.setItem(key, JSON.stringify(config));
}
catch { /* Session tuning remains available. */ } }
export function cycleTiming(duration) { const coil = Math.max(.12, duration * .1), remaining = Math.max(.09, duration - coil); return { coil, extend: remaining * .5, anchor: remaining * 7 / 90, transfer: remaining * 23 / 90, settle: remaining / 6 }; }
export const PHASES = [{ name: 'COIL', end: .1 }, { name: 'EXTEND', end: .55 }, { name: 'ANCHOR', end: .62 }, { name: 'TRANSFER', end: .85 }, { name: 'SETTLE', end: 1 }];
export function phaseState(phase) { return PHASES.find(p => phase < p.end)?.name ?? 'SETTLE'; }
export const CUTIS_PALETTES = {
    original: { name: 'Original membrane', skinTint: 0xb9a194, veinTint: 0x38242e, pulseTint: 0xec794a },
    green: { name: 'Green · moss', skinTint: 0x809e63, veinTint: 0x182e24, pulseTint: 0xd0ed7c },
    yellow: { name: 'Yellow · amber', skinTint: 0xd6b456, veinTint: 0x59371d, pulseTint: 0xffeaa0 },
    blue: { name: 'Blue · glacial', skinTint: 0x739caf, veinTint: 0x162845, pulseTint: 0xa5f5ff },
    purple: { name: 'Purple · dusk', skinTint: 0x9b78b5, veinTint: 0x352048, pulseTint: 0xf3abe9 },
    white: { name: 'White · porcelain', skinTint: 0xe6e8df, veinTint: 0x747b88, pulseTint: 0xcaf6ff },
    black: { name: 'Black · white veins', skinTint: 0x090c12, veinTint: 0xffffff, pulseTint: 0xddeeff },
};
export function applyPalette(config, key) { const { skinTint, veinTint, pulseTint } = CUTIS_PALETTES[key]; Object.assign(config, { skinTint, veinTint, pulseTint }); }
export function selectedPalette(config) { return Object.entries(CUTIS_PALETTES).find(([, p]) => p.skinTint === config.skinTint && p.veinTint === config.veinTint && p.pulseTint === config.pulseTint)?.[0] ?? 'custom'; }
export function transferProgress(t, acceleration) { return Math.pow(Math.max(0, Math.min(1, t)), acceleration); }
