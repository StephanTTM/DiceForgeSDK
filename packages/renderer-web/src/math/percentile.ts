import { DiceForgeError } from "@diceforge-sdk/core";

export type PercentileDie = {
  /** Text shown on the die face: "00".."90" for tens, "0".."9" for units. */
  readonly label: string;
  /** Physical d10 face to orient upward, 1..10. */
  readonly face: number;
};

export type PercentileDisplay = {
  readonly tens: PercentileDie;
  readonly units: PercentileDie;
};

/**
 * Maps a resolved d100 value (1..100) onto the classic percentile pair: a
 * tens d10 (00–90) and a units d10 (0–9). 100 reads as "00" + "0", matching
 * tabletop convention. Pure presentation — the record's value stays the
 * authority.
 */
export function percentileDisplay(value: number): PercentileDisplay {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new DiceForgeError(
      "invalid-argument",
      `percentile value must be an integer in 1..100, got ${value}`,
    );
  }
  const tensDigit = Math.floor(value / 10) % 10;
  const unitsDigit = value % 10;
  return {
    tens: { label: `${tensDigit}0`.padStart(2, "0"), face: tensDigit === 0 ? 10 : tensDigit },
    units: { label: `${unitsDigit}`, face: unitsDigit === 0 ? 10 : unitsDigit },
  };
}
