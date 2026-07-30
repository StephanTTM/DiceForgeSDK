import type { AbortSignalLike, DieOutcome, RollResult } from "@diceforge-sdk/core";
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
  /**
   * Faces this seat showed and lost to rerolls before settling on `face`,
   * oldest first (ADR-0016). Only meaningful together with `shape`, like
   * `face`. A story-capable backend lands on each in turn and re-tosses to
   * the next; a settled presentation shows only `face`, and either way the
   * value that counts is the record's.
   */
  readonly rerolledFaces?: readonly number[];
  /** True when this die rolled its highest face and earned the die after it. */
  readonly exploded?: boolean;
  /**
   * Index in this array of the die whose explosion earned this one. Such a
   * die is not part of the original throw: a story-capable backend keeps it
   * off the table until its parent's celebration births it.
   */
  readonly bornOf?: number;
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

/** One seat on the settled stage: a surviving record die, plus its history. */
type StageSeat = {
  readonly die: DieOutcome;
  /** Values this seat showed and lost to rerolls, oldest first. */
  readonly steps: readonly number[];
  exploded: boolean;
  /** Stage index of the die whose explosion earned this one, or -1. */
  readonly parent: number;
};

/**
 * The dice that exist when the story ends, reconstructed from rolled order
 * (ADR-0016): every record entry except the values lost to rerolls, which
 * collapse into the die that replaced them. A die that exploded keeps its
 * seat, and the bonus die it earned takes its own — so the stage always sums
 * to the record's total. The same reconstruction the Godot presenter's
 * `roll_stage` performs, so every DiceForge stage tells the same story.
 */
function stageSeats(event: RollResult): StageSeat[] {
  const seats: StageSeat[] = [];
  for (const group of event.groups) {
    let pending: number[] = [];
    // Whatever arrives by explosion was earned by the die rolled before it.
    let chainParent = -1;
    for (const die of group.dice) {
      if (die.rerolled) {
        // Shown, then lost: a step in the story of the die that follows.
        pending.push(die.value);
        continue;
      }
      const fromExplosion = die.source === "explosion" && chainParent >= 0;
      seats.push({
        die,
        steps: pending,
        exploded: false,
        parent: fromExplosion ? chainParent : -1,
      });
      pending = [];
      if (fromExplosion) (seats[chainParent] as StageSeat).exploded = true;
      chainParent = seats.length - 1;
    }
  }
  return seats;
}

/**
 * Expands a resolved roll into the physical dice on the settled stage. A d100
 * die becomes the classic percentile pair (tens + units d10) — pure
 * presentation, the record's value stays authoritative.
 *
 * Rerolled values do not get dice of their own: they collapse into the die
 * that replaced them, carried as that die's `rerolledFaces` so a backend with
 * motion can land on each before re-tossing. A die added by an explosion is
 * its own entry, `bornOf` pointing back at the die that earned it. The stage
 * therefore always sums to the record's total.
 *
 * A custom die gets no `shape`: its faces carry values and labels a numbered
 * model cannot show, so drawing it as a d6 would put a numeral on screen that
 * the die does not have. The presenter falls back to tiles instead, which read
 * whatever the face says (ADR-0015).
 */
export function visualDiceForEvent(event: RollResult): VisualDie[] {
  const dice: VisualDie[] = [];
  // Seat index -> its first physical die, for `bornOf` across percentile pairs.
  const firstVisual: number[] = [];
  const seats = stageSeats(event);
  for (const seat of seats) {
    const die = seat.die;
    firstVisual.push(dice.length);
    const name = die.die ? `d{${die.die}}` : `d${die.sides}`;
    const lineage = {
      ...(seat.exploded ? { exploded: true } : {}),
      ...(seat.parent >= 0 ? { bornOf: firstVisual[seat.parent] as number } : {}),
    };
    if (die.die === undefined && die.sides === 100) {
      const pair = percentileDisplay(die.value);
      const stepPairs = seat.steps.map((value) => percentileDisplay(value));
      dice.push({
        shape: 10,
        face: pair.tens.face,
        text: pair.tens.face === 10 ? "00" : `${pair.tens.face}0`,
        name,
        kept: die.kept,
        role: "tens",
        ...(seat.steps.length > 0
          ? { rerolledFaces: stepPairs.map((step) => step.tens.face) }
          : {}),
        ...lineage,
      });
      dice.push({
        shape: 10,
        face: pair.units.face,
        text: pair.units.face === 10 ? "0" : String(pair.units.face),
        name,
        kept: die.kept,
        role: "units",
        ...(seat.steps.length > 0
          ? { rerolledFaces: stepPairs.map((step) => step.units.face) }
          : {}),
        ...lineage,
      });
    } else {
      const shaped = die.die === undefined && isShapedDieSides(die.sides);
      dice.push({
        ...(shaped ? { shape: die.sides as ShapedDieSides } : {}),
        face: die.value,
        text: die.label ?? String(die.value),
        name,
        kept: die.kept,
        // Steps are faces of this same die, so they mean nothing without a
        // shape to land them on — a custom die's stage shows only the end.
        ...(shaped && seat.steps.length > 0 ? { rerolledFaces: seat.steps } : {}),
        ...lineage,
      });
    }
  }
  return dice;
}
