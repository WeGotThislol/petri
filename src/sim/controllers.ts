/**
 * Hand-written (scripted) controllers. In Stage 2 these get replaced by
 * evolved neural networks, but they are useful as a baseline and as
 * sparring partners: evolution has to beat them.
 */
import { Controller, S } from './match';

const clamp = (x: number) => (x < -1 ? -1 : x > 1 ? 1 : x);

/**
 * "Pusher" for the CRAB body: beat the tail rhythmically to swim, bend the
 * tail to steer towards the opponent, close the claws on contact.
 * Muscle order (see CRAB): 0 tail-left, 1 tail-right, 2 tail-curl, 3/4 claws.
 */
export class PusherController implements Controller {
  constructor(private steerGain = 0.3) {}
  act(inp: Float64Array, out: Float64Array): void {
    const beat = inp[S.CLOCK_A];
    // Opponent behind me? Steer hard. Otherwise steer proportionally.
    const side = inp[S.OPP_FWD] < 0 ? (inp[S.OPP_SIDE] >= 0 ? 1 : -1) : inp[S.OPP_SIDE];
    const bias = this.steerGain * side;
    out[0] = clamp(-beat + bias);
    out[1] = clamp(beat - bias);
    out[2] = 0;
    const grip = inp[S.TOUCH] > 0.05 ? -1 : 0.6;
    out[3] = grip; out[4] = grip;
  }
}

/**
 * The dummy (Globby): a sleepy target that just sits there. (It looks alive
 * because the renderer makes it breathe and blink.) Early on, the only
 * honest way to beat it is to swim over and push it out.
 */
export class DummyController implements Controller {
  act(_inp: Float64Array, out: Float64Array): void { out.fill(0); }
}

/** Does nothing at all: all muscles relaxed. */
export class IdleController implements Controller {
  act(_inp: Float64Array, out: Float64Array): void { out.fill(0); }
}
