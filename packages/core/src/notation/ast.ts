/** Die sizes with a standard physical shape, and grammar v1's whole range. */
export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

export type DieSides = (typeof DIE_SIDES)[number];

/** kh = keep highest, kl = keep lowest, dh = drop highest, dl = drop lowest. */
export type SelectionMode = "kh" | "kl" | "dh" | "dl";

export type DiceSelection = {
  readonly mode: SelectionMode;
  readonly count: number;
};

/** Reroll rule: `r2` rerolls while a die reads 2 or less, `ro2` rerolls once. */
export type DiceReroll = {
  /** A die is rerolled while its value is at or below this. */
  readonly threshold: number;
  /** True for `ro`: each die is rerolled at most once. */
  readonly once: boolean;
};

export type DiceGroupNode = {
  readonly type: "dice";
  /** +1 when the group adds to the total, -1 when it subtracts. */
  readonly sign: 1 | -1;
  readonly count: number;
  /**
   * Number of faces. Any count from 2 to `MAX_DIE_FACES`, not only the sizes
   * with a standard shape (ADR-0015).
   */
  readonly sides: number;
  /** Custom die name, when the group rolls one: `4d{fate}` (ADR-0015). */
  readonly die?: string;
  /** `r`/`ro`: replace low rolls before anything else happens (ADR-0016). */
  readonly reroll?: DiceReroll;
  /** `!`: a die reading its highest face adds another die (ADR-0016). */
  readonly explode?: boolean;
  readonly selection?: DiceSelection;
};

export type ModifierNode = {
  readonly type: "modifier";
  readonly sign: 1 | -1;
  /** Absolute value; the sign carries the direction. */
  readonly value: number;
};

export type ExpressionTerm = DiceGroupNode | ModifierNode;

export type DiceExpression = {
  /** The input exactly as provided. */
  readonly source: string;
  /** Canonical lowercase form with explicit counts, e.g. "2d20kh1+3". */
  readonly normalized: string;
  readonly terms: readonly ExpressionTerm[];
};

/** True for the die sizes that have a standard physical shape (d4 - d100). */
export function isDieSides(value: number): value is DieSides {
  return (DIE_SIDES as readonly number[]).includes(value);
}

/**
 * Canonical unsigned notation for one dice group, e.g. "2d20kh1", "4d{fate}",
 * "4d6r1!kh3".
 *
 * Modifiers are written in the order they are applied — reroll, explode, then
 * keep/drop — whatever order they were typed in, so two expressions that mean
 * the same thing normalize to the same string.
 */
export function renderGroupNotation(node: DiceGroupNode): string {
  const die = node.die ? `{${node.die}}` : String(node.sides);
  const reroll = node.reroll ? `r${node.reroll.once ? "o" : ""}${node.reroll.threshold}` : "";
  const explode = node.explode ? "!" : "";
  const selection = node.selection ? `${node.selection.mode}${node.selection.count}` : "";
  return `${node.count}d${die}${reroll}${explode}${selection}`;
}
