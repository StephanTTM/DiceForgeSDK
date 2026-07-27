import type { AbortSignalLike, RollResult } from "@diceforge-sdk/core";
import type { MotionMode } from "./capabilities.js";
import type { ShapedDieSides } from "./math/geometry.js";
import { percentileDisplay } from "./math/percentile.js";

/** One physical die to display: what it reads, and the solid to draw it as. */
export type VisualDie = {
  /**
   * Solid to draw in 3D. Absent when no model can honestly show this die: an
   * unusual face count, or a custom die whose faces are not 1..N — a d6 model
   * would show a numeral the die does not have (ADR-0015).
   */
  readonly shape?: ShapedDieSides;
  /** Face to orient upward, 1..shape. Only meaningful together with `shape`. */
  readonly face: number;
  /** What this die reads: "19", "00", "+". */
  readonly text: string;
  /** What to call the die, e.g. "d20", "d{fate}". */
  readonly name: string;
  readonly kept: boolean;
  /**
   * Which half of a percentile pair this die is, when a d100 is shown as two
   * d10s. The tens die reads 00-90 and so needs its own texture.
   */
  readonly role?: "tens" | "units";
};

export type VisualCoin = { readonly outcome: "heads" | "tails" };

export type PresentContext = {
  readonly motion: MotionMode;
  readonly signal?: AbortSignalLike | undefined;
};

/**
 * Internal rendering strategy behind `createDicePresenter`.
 *
 * `presentDice` and `presentCoin` resolve to false when this backend cannot
 * draw the event — a theme that does not cover one of the shapes, or an asset
 * that failed to load — so the presenter can fall back rather than leave a
 * resolved die off the table.
 */
export interface PresenterBackend {
  presentDice(dice: readonly VisualDie[], context: PresentContext): Promise<boolean>;
  presentCoin(coin: VisualCoin, context: PresentContext): Promise<boolean>;
  /** Hides this backend's output while another one is showing. */
  setVisible(visible: boolean): void;
  dispose(): void;
}

const SHAPED_SIDES: readonly number[] = [4, 6, 8, 10, 12, 20];

/** True for face counts the theme models cover. */
function isShapedDieSides(sides: number): sides is ShapedDieSides {
  return SHAPED_SIDES.includes(sides);
}

/**
 * Expands a resolved roll into physical dice. A d100 die becomes the classic
 * percentile pair (tens + units d10) — pure presentation, the record's value
 * stays authoritative.
 *
 * A custom die gets no `shape`: its faces carry values and labels a numbered
 * model cannot show, so drawing it as a d6 would put a numeral on screen that
 * the die does not have. The presenter falls back to tiles instead, which read
 * whatever the face says (ADR-0015).
 */
export function visualDiceForEvent(event: RollResult): VisualDie[] {
  const dice: VisualDie[] = [];
  for (const group of event.groups) {
    for (const die of group.dice) {
      const name = die.die ? `d{${die.die}}` : `d${die.sides}`;
      if (die.die === undefined && die.sides === 100) {
        const pair = percentileDisplay(die.value);
        dice.push({
          shape: 10,
          face: pair.tens.face,
          text: pair.tens.face === 10 ? "00" : `${pair.tens.face}0`,
          name,
          kept: die.kept,
          role: "tens",
        });
        dice.push({
          shape: 10,
          face: pair.units.face,
          text: pair.units.face === 10 ? "0" : String(pair.units.face),
          name,
          kept: die.kept,
          role: "units",
        });
      } else {
        const shaped = die.die === undefined && isShapedDieSides(die.sides);
        dice.push({
          ...(shaped ? { shape: die.sides as ShapedDieSides } : {}),
          face: die.value,
          text: die.label ?? String(die.value),
          name,
          kept: die.kept,
        });
      }
    }
  }
  return dice;
}
