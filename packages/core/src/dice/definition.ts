import { DiceForgeError } from "../errors.js";

/** Most faces a single die may have. */
export const MAX_DIE_FACES = 1000;
/** Largest magnitude a face value may contribute to a total. */
export const MAX_FACE_VALUE = 1_000_000;
/** Longest name a custom die may be given. */
export const MAX_DIE_ID_LENGTH = 24;
/** Longest text a face may read. */
export const MAX_FACE_LABEL_LENGTH = 8;

/**
 * Names start with a letter so they can never be mistaken for a face count,
 * and stay within a conservative character set so notation remains readable
 * and safe to round-trip through JSON, URLs and log lines.
 */
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** One face of a die: what it contributes, and how it reads. */
export type DieFace = {
  /** Added to the total when this face is kept. May be negative or zero. */
  readonly value: number;
  /** How the face reads, when that differs from the value ("+", "★", "00"). */
  readonly label?: string;
};

/**
 * A die the core does not know by default: any set of faces, with any values
 * and any labels (ADR-0015).
 *
 * Definitions are plain data, so an application can store them, ship them with
 * a game system, or hand them to another platform without translation. They
 * carry no randomness and no presentation; the engine rolls them and a
 * renderer decides how they look.
 */
export type DieDefinition = {
  /** Name used in notation: `d{fate}`. Matched case-insensitively. */
  readonly id: string;
  readonly faces: readonly DieFace[];
};

function invalid(message: string): never {
  throw new DiceForgeError("invalid-argument", `invalid die definition: ${message}`);
}

function normalizeFace(face: DieFace | number, index: number): DieFace {
  const raw: DieFace = typeof face === "number" ? { value: face } : face;
  if (raw === null || typeof raw !== "object") invalid(`face ${index} must be a number or object`);
  if (!Number.isInteger(raw.value)) invalid(`face ${index} value must be an integer`);
  if (Math.abs(raw.value) > MAX_FACE_VALUE) {
    invalid(`face ${index} value exceeds ${MAX_FACE_VALUE}`);
  }
  if (raw.label === undefined) return { value: raw.value };
  if (typeof raw.label !== "string" || raw.label.length === 0) {
    invalid(`face ${index} label must be a non-empty string`);
  }
  if (raw.label.length > MAX_FACE_LABEL_LENGTH) {
    invalid(`face ${index} label exceeds ${MAX_FACE_LABEL_LENGTH} characters`);
  }
  if (/[\r\n\t]/.test(raw.label)) invalid(`face ${index} label must be a single line`);
  return { value: raw.value, label: raw.label };
}

/**
 * Validates and freezes a custom die.
 *
 * ```ts
 * const fate = defineDie({ id: "fate", faces: [-1, -1, 0, 0, 1, 1] });
 * const symbols = defineDie({
 *   id: "runes",
 *   faces: [{ value: 1, label: "☀" }, { value: 0, label: "·" }],
 * });
 * ```
 *
 * Faces may repeat: a die is a bag of faces, not a set, so weighting a value
 * is just listing it twice. Values are what the engine sums; labels are what a
 * renderer shows.
 */
export function defineDie(definition: {
  readonly id: string;
  readonly faces: readonly (DieFace | number)[];
}): DieDefinition {
  const id = definition?.id;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    invalid(
      `id ${JSON.stringify(id)} must start with a letter and use only letters, digits, - and _`,
    );
  }
  if (id.length > MAX_DIE_ID_LENGTH) invalid(`id exceeds ${MAX_DIE_ID_LENGTH} characters`);
  const faces = definition.faces;
  if (!Array.isArray(faces)) invalid("faces must be an array");
  if (faces.length < 2) invalid("a die needs at least 2 faces; use a modifier for a constant");
  if (faces.length > MAX_DIE_FACES) invalid(`a die may not have more than ${MAX_DIE_FACES} faces`);
  return Object.freeze({
    id,
    faces: Object.freeze(faces.map((face, index) => Object.freeze(normalizeFace(face, index)))),
  });
}

/** Custom dice a roll may use, keyed by lowercase id. */
export type DieRegistry = ReadonlyMap<string, DieDefinition>;

/**
 * Indexes definitions for lookup by notation. Ids are matched
 * case-insensitively, so two dice may not differ by case alone.
 */
export function createDieRegistry(definitions: readonly DieDefinition[] = []): DieRegistry {
  const registry = new Map<string, DieDefinition>();
  for (const definition of definitions) {
    const key = definition.id.toLowerCase();
    if (registry.has(key)) {
      throw new DiceForgeError(
        "invalid-argument",
        `duplicate die id ${JSON.stringify(definition.id)}; ids are matched case-insensitively`,
      );
    }
    registry.set(key, definition);
  }
  return registry;
}

/** Looks a die up by the name used in notation. */
export function findDie(registry: DieRegistry | undefined, id: string): DieDefinition | undefined {
  return registry?.get(id.toLowerCase());
}
