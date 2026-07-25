/** Die sizes supported by notation grammar v1 (ADR-0006). */
export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

export type DieSides = (typeof DIE_SIDES)[number];

/** kh = keep highest, kl = keep lowest, dh = drop highest, dl = drop lowest. */
export type SelectionMode = "kh" | "kl" | "dh" | "dl";

export type DiceSelection = {
  readonly mode: SelectionMode;
  readonly count: number;
};

export type DiceGroupNode = {
  readonly type: "dice";
  /** +1 when the group adds to the total, -1 when it subtracts. */
  readonly sign: 1 | -1;
  readonly count: number;
  readonly sides: DieSides;
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

export function isDieSides(value: number): value is DieSides {
  return (DIE_SIDES as readonly number[]).includes(value);
}

/** Canonical unsigned notation for one dice group, e.g. "2d20kh1". */
export function renderGroupNotation(node: DiceGroupNode): string {
  const selection = node.selection ? `${node.selection.mode}${node.selection.count}` : "";
  return `${node.count}d${node.sides}${selection}`;
}
