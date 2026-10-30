// Transpiled from lab-creatures src/monster/variants.ts (GPL-3.0); see ../../UPSTREAM.md
export const CREATURE_VARIANTS = [
    { id: 'nih-dairia', name: 'Nih-Dairia · ancestor', limbs: 6, description: 'Six limbs and a balanced abdomen. The reference body plan.' },
    { id: 'brood', name: 'Brood · heavy abdomen', limbs: 6, description: 'Six limbs, a broader abdomen and thicker tissue. A heavy-bodied relative.' },
    { id: 'reed', name: 'Reed · four limbs', limbs: 4, description: 'Four limbs and a reduced, thin abdomen. A spare, open silhouette.' },
    { id: 'crown', name: 'Crown · eight limbs', limbs: 8, description: 'Eight limbs around a wider core. More support points and a denser silhouette.' },
    { id: 'ovum', name: 'Ovum · oblong abdomen', limbs: 6, description: 'A swollen, elongated ellipsoid abdomen carried by six tentacles.' },
    { id: 'sept', name: 'Sept · seven tentacles', limbs: 7, description: 'Seven evenly spaced tentacles around a compact abdomen. An odd radial body plan.' },
    { id: 'filament', name: 'Filament · almost all tentacles', limbs: 6, description: 'A tiny central junction and six narrow tentacles, with almost no abdomen.' },
    { id: 'globulifer', name: 'Globulifer · dorsal globes', limbs: 6, description: 'Branched stalks and globular tips rise above the back, inspired by Bocydium globulare.' },
];
export function selectedVariant() {
    const params = new URLSearchParams(location.search);
    return CREATURE_VARIANTS.find(v => params.get('specimen') === 'creature-lab' && v.id === params.get('variant')) ?? CREATURE_VARIANTS[0];
}
