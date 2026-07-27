import type { DieRegistry } from "../dice/definition.js";
import { findDie } from "../dice/definition.js";
import { DiceForgeError } from "../errors.js";
import type { DiceExpression, DiceGroupNode, DiceSelection } from "../notation/ast.js";
import { renderGroupNotation } from "../notation/ast.js";
import {
  MAX_EXPLOSIONS_PER_DIE,
  MAX_EXTRA_DICE_PER_GROUP,
  MAX_REROLLS_PER_DIE,
} from "../notation/parser.js";
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

/** One roll before selection has had its say. */
type RolledDie = {
  value: number;
  label?: string;
  source?: "reroll" | "explosion";
  /** True when a reroll modifier threw this result away. */
  rerolled?: boolean;
};

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
  const highestValue = definition ? Math.max(...definition.faces.map((face) => face.value)) : sides;

  /**
   * One RNG draw, in order, exactly as a plain numeric die: neither a custom
   * die nor a modifier changes how many numbers a die consumes, only what a
   * face is worth and how many dice there are.
   */
  const draw = (): RolledDie => {
    const index = rollFace(random, sides);
    const face = definition?.faces[index - 1];
    const label = face?.label;
    return { value: face?.value ?? index, ...(label === undefined ? {} : { label }) };
  };

  // Each die is finished before the next one starts — rerolled and exploded in
  // sequence, the way it would be at a table — so a seeded stream is easy to
  // follow and replays identically (ADR-0016).
  const rolled: RolledDie[] = [];
  let extras = 0;
  for (let index = 0; index < term.count; index++) {
    let current = draw();

    if (term.reroll) {
      let attempts = 0;
      while (
        current.value <= term.reroll.threshold &&
        attempts < MAX_REROLLS_PER_DIE &&
        extras < MAX_EXTRA_DICE_PER_GROUP
      ) {
        current.rerolled = true;
        rolled.push(current);
        extras += 1;
        current = { ...draw(), source: "reroll" };
        attempts += 1;
        if (term.reroll.once) break;
      }
    }
    rolled.push(current);

    if (term.explode) {
      let chain = 0;
      let last = current;
      while (
        last.value === highestValue &&
        chain < MAX_EXPLOSIONS_PER_DIE &&
        extras < MAX_EXTRA_DICE_PER_GROUP
      ) {
        last = { ...draw(), source: "explosion" };
        rolled.push(last);
        extras += 1;
        chain += 1;
      }
    }
  }

  // A rerolled result is history: it is recorded, but selection never sees it
  // and it can never count towards the subtotal.
  const live = rolled.filter((die) => !die.rerolled);
  const keptFlags = selectKeptFlags(
    live.map((die) => die.value),
    term.selection,
  );
  let livePosition = 0;
  const dice: DieOutcome[] = rolled.map((die) => {
    const kept = die.rerolled ? false : (keptFlags[livePosition++] ?? true);
    return {
      sides,
      value: die.value,
      kept,
      ...(definition ? { die: definition.id } : {}),
      ...(die.label === undefined ? {} : { label: die.label }),
      ...(die.source === undefined ? {} : { source: die.source }),
      ...(die.rerolled ? { rerolled: true } : {}),
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
