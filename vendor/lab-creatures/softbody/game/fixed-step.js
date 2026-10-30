// Transpiled from lab-creatures src/game/fixed-step.ts (GPL-3.0); see ../../UPSTREAM.md
/** Fixed 240 Hz stepping without deliberate time dilation. */
export class FixedStepper {
    accumulator = 0;
    step;
    constructor(step) { this.step = step; }
    advance(dt, simulate) {
        // Runtime already clamps dt to 50 ms. 12 x 1/240 s covers that entire
        // interval, so a hitch cannot turn into slow-motion catch-up.
        this.accumulator += Math.min(.05, Math.max(0, dt));
        let steps = 0;
        while (this.accumulator + 1e-12 >= this.step && steps < 12) {
            simulate();
            this.accumulator -= this.step;
            steps++;
        }
        // Only numerical residue should remain because 12 steps cover the full
        // accepted dt. If an external caller exceeds that contract, drop excess
        // rather than creating an unbounded spiral.
        if (this.accumulator >= this.step)
            this.accumulator %= this.step;
        if (this.accumulator < 0)
            this.accumulator = 0;
        return steps;
    }
    reset() { this.accumulator = 0; }
}
