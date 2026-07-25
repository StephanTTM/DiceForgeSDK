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
};

export type VisualCoin = { readonly outcome: "heads" | "tails" };

export type PresentContext = {
  readonly motion: MotionMode;
  readonly signal?: AbortSignalLike | undefined;
};

/** Internal rendering strategy behind `createDicePresenter`. */
export interface PresenterBackend {
  presentDice(dice: readonly VisualDie[], context: PresentContext): Promise<void>;
  presentCoin(coin: VisualCoin, context: PresentContext): Promise<void>;
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
        dice.push({ shape: 10, face: pair.tens.face, labels: tensLabels(), kept: die.kept });
        dice.push({ shape: 10, face: pair.units.face, labels: unitsLabels(), kept: die.kept });
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
