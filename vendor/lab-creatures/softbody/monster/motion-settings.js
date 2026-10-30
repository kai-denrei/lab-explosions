// Transpiled from lab-creatures src/monster/motion-settings.ts (GPL-3.0); see ../../UPSTREAM.md
export const DEFAULT_MOTION = {
    speed: 1.8, reachTime: 2.4, pullTime: 2, pauseTime: 1.25, erratic: 2,
    stretch: 2.2, spread: 1.6, stepHeight: .032, stepDuration: .12, stepSpacing: .035, stride: .022, recoil: 1, grip: 1.5, sweep: 1,
};
export const MOTION_CONTROLS = [
    { key: 'speed', label: 'Chase speed', group: 'Pursuit', min: .1, max: 6, step: .05, unit: '×', hint: 'How hard the body surges after the reach.' },
    { key: 'reachTime', label: 'Reach duration', group: 'Pursuit', min: .3, max: 10, step: .05, unit: '×', hint: 'Higher gives both arms more time before the body follows.' },
    { key: 'pullTime', label: 'Surge duration', group: 'Pursuit', min: .3, max: 8, step: .05, unit: '×', hint: 'How long each forward burst lasts.' },
    { key: 'pauseTime', label: 'Pause between bursts', group: 'Pursuit', min: .1, max: 12, step: .05, unit: '×', hint: 'Higher adds longer threatening pauses.' },
    { key: 'erratic', label: 'Erratic motion', group: 'Pursuit', min: 0, max: 6, step: .05, unit: '×', hint: 'Timing variation, uneven strides and sideways feints.' },
    { key: 'stretch', label: 'Probing arm stretch', group: 'Probing arms', min: 0, max: 5, step: .05, unit: '×', hint: 'How far both sensor arms extend ahead. Reaches shorten near prey.' },
    { key: 'spread', label: 'Probing arm spread', group: 'Probing arms', min: 0, max: 6, step: .05, unit: '×', hint: 'How widely the two sensor arms separate and sweep while searching.' },
    { key: 'sweep', label: 'Reach sweep', group: 'Probing arms', min: 0, max: 5, step: .05, unit: '×', hint: 'Side-to-side ground-search arcs of both extended sensors. Zero holds their directions steady.' },
    { key: 'stepHeight', label: 'Foot lift', group: 'Footwork', min: .004, max: 0.1, step: .001, unit: 'mm', hint: 'Height of each supporting foot above its planted target.' },
    { key: 'stepDuration', label: 'Step duration', group: 'Footwork', min: .08, max: 1, step: .005, unit: 'ms', hint: 'Lower produces faster lift, swing and landing.' },
    { key: 'stepSpacing', label: 'Leg stagger', group: 'Footwork', min: .015, max: 0.6, step: .005, unit: 'ms', hint: 'Minimum delay before the next leg lifts. At most two supporting legs swing.' },
    { key: 'stride', label: 'Stride length', group: 'Footwork', min: .004, max: 0.1, step: .001, unit: 'mm', hint: 'How far a supporting foot reaches ahead of its neutral position.' },
    { key: 'grip', label: 'Foot grip', group: 'Footwork', min: 0, max: 5, step: .05, unit: '×', hint: 'Holds contacting feet in place and brakes drift between pulls. Zero restores loose traction.' },
    { key: 'recoil', label: 'Recoil depth', group: 'Reaction', min: 0, max: 5, step: .05, unit: '×', hint: 'How deeply it crouches when touched.' },
];
export function normalizeMotion(value) {
    const result = { ...DEFAULT_MOTION };
    if (!value || typeof value !== 'object')
        return result;
    const input = value;
    for (const control of MOTION_CONTROLS) {
        const v = input[control.key];
        if (typeof v === 'number' && Number.isFinite(v))
            result[control.key] = Math.max(control.min, Math.min(control.max, v));
    }
    return result;
}
export function formatMotion(key, value) {
    const unit = MOTION_CONTROLS.find(control => control.key === key).unit;
    return unit === '×' ? `${value.toFixed(2)}×` : `${Math.round(value * 1000)} ${unit}`;
}
