// Transpiled from lab-creatures src/cutis/swarm/tiers.ts (GPL-3.0); see ../UPSTREAM.md
import { DEFAULT_CONFIG } from './config.js';
export const CORE_SHAPES = ['Soft interior', 'Dodecahedron', 'Inverted pyramids', 'Pearl'];
const rows = [
    ['white', 'White', 0xf2efe5, 0x90979d, .12, 1, 6, .35, 0, 0, 15],
    ['yellow', 'Yellow', 0xe6cc53, 0x8c6021, .14, 1, 5.5, .6, 0, 0, 25],
    ['orange', 'Orange', 0xeb883e, 0x853b20, .16, 2, 5, 1, 0, 0, 40],
    ['blue', 'Blue', 0x699fc7, 0x25496b, .18, 2, 4.5, 1.4, 0, 0, 60],
    ['green', 'Green', 0x76a76a, 0xc7e8a4, .21, 2, 4, 1.8, 3, 8, 100],
    ['purple', 'Purple', 0xa879c5, 0xdfa9ff, .24, 2, 3.5, 2.3, 1, 14, 160],
    ['brown', 'Brown', 0x956442, 0xf0bc70, .28, 3, 3, 3, 2, 22, 240],
    ['black', 'Black', 0x11151d, 0xff0000, .33, 3, 2.5, 4, 3, 35, 360],
];
export const CUTIS_TIERS = rows.map(([id, name, skin, core, r0, seekCount, cycleDuration, aggression, coreShape, contactDamage, health], rank) => ({
    id, name, rank: rank + 1, hard: coreShape > 0,
    description: coreShape ? `${CORE_SHAPES[coreShape]} · solid contact · ${contactDamage} damage/s` : 'Soft body · rammable · harmless contact',
    values: { ...DEFAULT_CONFIG, r0, seekCount, cycleDuration, aggression, skinTint: skin, veinTint: id === 'black' ? 0xbab6c1 : 0x45404b, pulseTint: core, coreTint: core, coreShape, coreSize: id === 'black' ? .18 : id === 'purple' ? .22 : .28, membraneOpacity: coreShape ? .32 : .65, contactDamage, health, transferAcceleration: rank < 4 ? 1.8 : 2.5, reach: rank < 4 ? 8 + rank : 12 + (rank - 4), noiseAmp: .15, veinWidth: .035 },
}));
export const PEARL_TIERS = CUTIS_TIERS.map(t => ({ ...t, values: { ...t.values, coreShape: t.hard ? 3 : 0, pearlVariant: 1 } }));
export const GOROGORO_TIERS = PEARL_TIERS.map(t => ({ ...t, values: { ...t.values, coreTint: t.id === 'black' ? 0x701d35 : t.values.coreTint, rollVariant: 1, cycleDuration: 10, rollDuration: 2.4, landingPause: .8, cubenessPeak: 0, cubenessRest: 0 } }));
export const GOROGORO_DEFAULT_CONFIG = { ...GOROGORO_TIERS[7].values };
export const PEARL_DEFAULT_CONFIG = { ...PEARL_TIERS[7].values };
export const K_DEFAULT_CONFIG = { ...CUTIS_TIERS[7].values };
export function selectedTier(config) { return (config.rollVariant ? GOROGORO_TIERS : config.pearlVariant ? PEARL_TIERS : CUTIS_TIERS).find(t => Object.keys(t.values).every(k => t.values[k] === config[k]))?.id ?? 'custom'; }
export function coreContact(config) { const hard = config.coreShape >= 1; return { rammable: !hard, radarVisible: true, radarBlipSize: hard ? 4 : 2.5, proximityWarning: hard, contactDamagePerSecond: hard ? config.contactDamage : 0, health: config.health, coreShape: CORE_SHAPES[Math.round(config.coreShape)], collisionRadius: hard ? config.r0 * config.coreSize : 0 }; }
