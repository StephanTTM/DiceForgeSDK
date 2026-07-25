import type { DiceExpression, DiceGroupNode, DiceSelection } from "../notation/ast.js";
import { renderGroupNotation } from "../notation/ast.js";
import type { DieOutcome, RollGroupOutcome, RollResult } from "../records.js";
import { deepFreeze, EVENT_SCHEMA_VERSION } from "../records.js";
import { rollFace } from "../rng/sample.js";
import type { RandomSource } from "../rng/types.js";

function selectKeptFlags(values: readonly number[], selection?: DiceSelection): boolean[] {
  if (!selection) return values.map(() => true);
  const highestFirst = selection.mode === "kh" || selection.mode === "dh";
  // Rank dice by value; ties are broken by roll order, earlier dice first.
  const ranked = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) =>
      highestFirst
        ? b.value - a.value || a.index - b.index
        : a.value - b.value || a.index - b.index,
    );
  const keepMode = selection.mode === "kh" || selection.mode === "kl";
  const flags = values.map(() => !keepMode);
  for (const { index } of ranked.slice(0, selection.count)) {
    flags[index] = keepMode;
  }
  return flags;
}

function resolveGroup(term: DiceGroupNode, random: RandomSource): RollGroupOutcome {
  const values: number[] = [];
  for (let i = 0; i < term.count; i++) {
    values.push(rollFace(random, term.sides));
  }
  const keptFlags = selectKeptFlags(values, term.selection);
  const dice: DieOutcome[] = values.map((value, index) => ({
    sides: term.sides,
    value,
    kept: keptFlags[index] ?? true,
  }));
  const subtotal = dice.reduce((sum, die) => (die.kept ? sum + die.value : sum), 0);
  return {
    notation: renderGroupNotation(term),
    sign: term.sign,
    sides: term.sides,
    dice,
    subtotal,
  };
}

/**
 * Resolves a parsed expression into an immutable, serializable roll record.
 * Dice are rolled in term order, left to right, and each group's dice in
 * sequence, so a seeded source always produces the same record.
 */
export function resolveRoll(expression: DiceExpression, random: RandomSource): RollResult {
  const groups: RollGroupOutcome[] = [];
  let modifier = 0;
  let diceTotal = 0;
  for (const term of expression.terms) {
    if (term.type === "modifier") {
      modifier += term.sign * term.value;
      continue;
    }
    const group = resolveGroup(term, random);
    groups.push(group);
    diceTotal += group.sign * group.subtotal;
  }
  return deepFreeze({
    kind: "roll",
    schemaVersion: EVENT_SCHEMA_VERSION,
    expression: expression.normalized,
    groups,
    modifier,
    total: diceTotal + modifier,
    provenance: random.provenance(),
  });
}
