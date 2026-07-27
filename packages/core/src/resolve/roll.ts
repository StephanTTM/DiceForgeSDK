import type { DieRegistry } from "../dice/definition.js";
import { findDie } from "../dice/definition.js";
import { DiceForgeError } from "../errors.js";
import type { DiceExpression, DiceGroupNode, DiceSelection } from "../notation/ast.js";
import { renderGroupNotation } from "../notation/ast.js";
import type { DieOutcome, RollGroupOutcome, RollResult } from "../records.js";
import { deepFreeze, EVENT_SCHEMA_VERSION } from "../records.js";
import { rollFace } from "../rng/sample.js";
import type { RandomSource } from "../rng/types.js";

export type ResolveOptions = {
  /** Custom dice the expression may name (ADR-0015). */
  readonly dice?: DieRegistry;
};

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

function resolveGroup(
  term: DiceGroupNode,
  random: RandomSource,
  registry: DieRegistry | undefined,
): RollGroupOutcome {
  const definition = term.die === undefined ? undefined : findDie(registry, term.die);
  if (term.die !== undefined && !definition) {
    throw new DiceForgeError(
      "invalid-argument",
      `unknown die ${JSON.stringify(term.die)}; pass it to createDiceEngine({ dice }) before rolling it`,
    );
  }
  const sides = definition?.faces.length ?? term.sides;

  // One RNG draw per die, in order, exactly as a plain numeric die: a custom
  // die changes what a face is worth, never how many numbers are consumed.
  const rolled: number[] = [];
  for (let i = 0; i < term.count; i++) {
    rolled.push(rollFace(random, sides));
  }
  const faces = rolled.map((index) => definition?.faces[index - 1]);
  const values = rolled.map((index, position) => faces[position]?.value ?? index);
  const keptFlags = selectKeptFlags(values, term.selection);
  const dice: DieOutcome[] = values.map((value, index) => {
    const label = faces[index]?.label;
    return {
      sides,
      value,
      kept: keptFlags[index] ?? true,
      ...(definition ? { die: definition.id } : {}),
      ...(label === undefined ? {} : { label }),
    };
  });
  const subtotal = dice.reduce((sum, die) => (die.kept ? sum + die.value : sum), 0);
  return {
    notation: renderGroupNotation(definition ? { ...term, die: definition.id, sides } : term),
    sign: term.sign,
    sides,
    ...(definition ? { die: definition.id } : {}),
    dice,
    subtotal,
  };
}

/**
 * Resolves a parsed expression into an immutable, serializable roll record.
 * Dice are rolled in term order, left to right, and each group's dice in
 * sequence, so a seeded source always produces the same record.
 */
export function resolveRoll(
  expression: DiceExpression,
  random: RandomSource,
  options: ResolveOptions = {},
): RollResult {
  const groups: RollGroupOutcome[] = [];
  let modifier = 0;
  let diceTotal = 0;
  for (const term of expression.terms) {
    if (term.type === "modifier") {
      modifier += term.sign * term.value;
      continue;
    }
    const group = resolveGroup(term, random, options.dice);
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
