// Transpiled from lab-creatures src/monster/model.ts (GPL-3.0); see ../../UPSTREAM.md
import { parseCage } from '../physics/cage-model.js';
const models = {
    'nih-dairia': [new URL('../../../../assets/creatures/nih-dairia.bin', import.meta.url), new URL('../../../../assets/creatures/nih-dairia.json', import.meta.url)],
    brood: [new URL('../../../../assets/creatures/brood.bin', import.meta.url), new URL('../../../../assets/creatures/brood.json', import.meta.url)],
    reed: [new URL('../../../../assets/creatures/reed.bin', import.meta.url), new URL('../../../../assets/creatures/reed.json', import.meta.url)],
    crown: [new URL('../../../../assets/creatures/crown.bin', import.meta.url), new URL('../../../../assets/creatures/crown.json', import.meta.url)],
    ovum: [new URL('../../../../assets/creatures/ovum.bin', import.meta.url), new URL('../../../../assets/creatures/ovum.json', import.meta.url)],
    sept: [new URL('../../../../assets/creatures/sept.bin', import.meta.url), new URL('../../../../assets/creatures/sept.json', import.meta.url)],
    filament: [new URL('../../../../assets/creatures/filament.bin', import.meta.url), new URL('../../../../assets/creatures/filament.json', import.meta.url)],
    globulifer: [new URL('../../../../assets/creatures/globulifer.bin', import.meta.url), new URL('../../../../assets/creatures/globulifer.json', import.meta.url)],
};
export async function loadMonsterCage(variant = 'nih-dairia') {
    const [binary, metadata] = await Promise.all([
        fetch(models[variant][0]),
        fetch(models[variant][1]),
    ]);
    if (!binary.ok || !metadata.ok)
        throw new Error('Could not load Nih-Dairia geometry');
    return { ...parseCage(await binary.arrayBuffer(), await metadata.json()), variant };
}
