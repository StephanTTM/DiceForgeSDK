import type { AbortSignalLike, RollResult } from "@diceforge-sdk/core";
import type { MotionMode } from "./capabilities.js";
import type { ShapedDieSides } from "./math/geometry.js";
import { percentileDisplay } from "./math/percentile.js";

/** One physical die to display: its shape, the face to land on, and all face labels. */
export type VisualDie = {
  readonly shape: ShapedDieSides;
  /** Face to orient upward, 1..shape. */
  readonly face: number;
  /** Text for every face, index i labels face i + 1. */
  readonly labels: readonly string[];
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

export function topLabel(die: VisualDie): string {
  return die.labels[die.face - 1] ?? String(die.face);
}

function standardLabels(shape: ShapedDieSides): string[] {
  return Array.from({ length: shape }, (_, index) => String(index + 1));
}

/** Tens-percentile d10: faces 1..9 read 10..90, face 10 reads 00. */
function tensLabels(): string[] {
  return Array.from({ length: 10 }, (_, index) => (index === 9 ? "00" : `${index + 1}0`));
}

/** Units-percentile d10: faces 1..9 read 1..9, face 10 reads 0. */
function unitsLabels(): string[] {
  return Array.from({ length: 10 }, (_, index) => (index === 9 ? "0" : String(index + 1)));
}

/**
 * Expands a resolved roll into physical dice. A d100 die becomes the classic
 * percentile pair (tens + units d10) — pure presentation, the record's value
 * stays authoritative.
 */
export function visualDiceForEvent(event: RollResult): VisualDie[] {
  const dice: VisualDie[] = [];
  for (const group of event.groups) {
    for (const die of group.dice) {
      if (die.sides === 100) {
        const pair = percentileDisplay(die.value);
        dice.push({
          shape: 10,
          face: pair.tens.face,
          labels: tensLabels(),
          kept: die.kept,
          role: "tens",
        });
        dice.push({
          shape: 10,
          face: pair.units.face,
          labels: unitsLabels(),
          kept: die.kept,
          role: "units",
        });
      } else {
        dice.push({
          shape: die.sides,
          face: die.value,
          labels: standardLabels(die.sides),
          kept: die.kept,
        });
      }
    }
  }
  return dice;
}
