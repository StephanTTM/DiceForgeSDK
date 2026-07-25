import { DiceForgeError } from "./errors.js";
import { isDieSides } from "./notation/ast.js";
import type {
  CoinFlipResult,
  DieOutcome,
  InteractionEvent,
  RollGroupOutcome,
  RollResult,
} from "./records.js";
import { deepFreeze, EVENT_SCHEMA_VERSION } from "./records.js";
import type { RandomProvenance } from "./rng/types.js";

function fail(message: string): never {
  throw new DiceForgeError("invalid-event", `invalid event record: ${message}`);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function asInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) fail(`${label} must be an integer`);
  return value;
}

function asSign(value: unknown, label: string): 1 | -1 {
  if (value !== 1 && value !== -1) fail(`${label} must be 1 or -1`);
  return value;
}

function validateProvenance(value: unknown): RandomProvenance {
  const record = asObject(value, "provenance");
  if (record.source === "seeded") {
    const seed = record.seed;
    if (typeof seed !== "string") fail("seeded provenance requires a string seed");
    if (record.algorithm !== "xoshiro128**") {
      fail(`unknown seeded algorithm ${JSON.stringify(record.algorithm)}`);
    }
    return { source: "seeded", seed, algorithm: "xoshiro128**" };
  }
  if (record.source === "system") {
    if (record.algorithm !== "crypto-get-random-values" && record.algorithm !== "math-random") {
      fail(`unknown system algorithm ${JSON.stringify(record.algorithm)}`);
    }
    return { source: "system", algorithm: record.algorithm };
  }
  fail('provenance.source must be "seeded" or "system"');
}

function validateGroup(value: unknown, position: number): RollGroupOutcome {
  const record = asObject(value, `groups[${position}]`);
  const label = `groups[${position}]`;
  const notation = asString(record.notation, `${label}.notation`);
  const sign = asSign(record.sign, `${label}.sign`);
  const sides = asInteger(record.sides, `${label}.sides`);
  if (!isDieSides(sides)) fail(`${label}.sides has unsupported die size ${sides}`);
  if (!Array.isArray(record.dice) || record.dice.length === 0) {
    fail(`${label}.dice must be a non-empty array`);
  }
  const dice: DieOutcome[] = record.dice.map((die, dieIndex) => {
    const dieRecord = asObject(die, `${label}.dice[${dieIndex}]`);
    const dieSides = asInteger(dieRecord.sides, `${label}.dice[${dieIndex}].sides`);
    if (dieSides !== sides) {
      fail(`${label}.dice[${dieIndex}].sides ${dieSides} does not match the group's d${sides}`);
    }
    const dieValue = asInteger(dieRecord.value, `${label}.dice[${dieIndex}].value`);
    if (dieValue < 1 || dieValue > sides) {
      fail(`${label}.dice[${dieIndex}].value ${dieValue} is outside 1..${sides}`);
    }
    if (typeof dieRecord.kept !== "boolean") {
      fail(`${label}.dice[${dieIndex}].kept must be a boolean`);
    }
    return { sides, value: dieValue, kept: dieRecord.kept };
  });
  const subtotal = asInteger(record.subtotal, `${label}.subtotal`);
  const keptSum = dice.reduce((sum, die) => (die.kept ? sum + die.value : sum), 0);
  if (subtotal !== keptSum) {
    fail(`${label}.subtotal ${subtotal} does not equal the sum of kept dice (${keptSum})`);
  }
  return { notation, sign, sides, dice, subtotal };
}

function validateRoll(record: Record<string, unknown>): RollResult {
  const expression = asString(record.expression, "expression");
  if (!Array.isArray(record.groups) || record.groups.length === 0) {
    fail("groups must be a non-empty array");
  }
  const groups = record.groups.map((group, index) => validateGroup(group, index));
  const modifier = asInteger(record.modifier, "modifier");
  const total = asInteger(record.total, "total");
  const expectedTotal =
    groups.reduce((sum, group) => sum + group.sign * group.subtotal, 0) + modifier;
  if (total !== expectedTotal) {
    fail(`total ${total} does not equal the groups plus modifier (${expectedTotal})`);
  }
  return {
    kind: "roll",
    schemaVersion: EVENT_SCHEMA_VERSION,
    expression,
    groups,
    modifier,
    total,
    provenance: validateProvenance(record.provenance),
  };
}

function validateCoinFlip(record: Record<string, unknown>): CoinFlipResult {
  if (record.outcome !== "heads" && record.outcome !== "tails") {
    fail('outcome must be "heads" or "tails"');
  }
  return {
    kind: "coin-flip",
    schemaVersion: EVENT_SCHEMA_VERSION,
    outcome: record.outcome,
    provenance: validateProvenance(record.provenance),
  };
}

/**
 * Structurally validates an unknown value as an event record and returns a
 * frozen canonical copy. Unknown extra fields are dropped; internal
 * inconsistencies (totals that do not match dice) are rejected so consumers
 * can trust deserialized records. Throws `DiceForgeError` with code
 * "invalid-event", or "unsupported-schema-version" when the payload comes
 * from an incompatible core version.
 */
export function validateEventRecord(value: unknown): InteractionEvent {
  const record = asObject(value, "event");
  const schemaVersion = record.schemaVersion;
  if (typeof schemaVersion !== "number") fail("schemaVersion must be a number");
  if (schemaVersion !== EVENT_SCHEMA_VERSION) {
    throw new DiceForgeError(
      "unsupported-schema-version",
      `unsupported event schemaVersion ${schemaVersion}; this core supports version ${EVENT_SCHEMA_VERSION}`,
    );
  }
  if (record.kind === "roll") return deepFreeze(validateRoll(record));
  if (record.kind === "coin-flip") return deepFreeze(validateCoinFlip(record));
  fail('kind must be "roll" or "coin-flip"');
}

/** Serializes an event record to a canonical JSON string, validating it first. */
export function serializeEvent(event: InteractionEvent): string {
  return JSON.stringify(validateEventRecord(event));
}

/**
 * Parses and validates a JSON payload produced by `serializeEvent` (or a
 * compatible producer), returning a frozen canonical event record.
 */
export function deserializeEvent(json: string): InteractionEvent {
  if (typeof json !== "string") {
    throw new DiceForgeError("invalid-argument", "event payload must be a string");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new DiceForgeError(
      "invalid-event",
      `event payload is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return validateEventRecord(raw);
}
