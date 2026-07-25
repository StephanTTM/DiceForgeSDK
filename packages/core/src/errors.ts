export type DiceForgeErrorCode =
  | "notation"
  | "invalid-event"
  | "unsupported-schema-version"
  | "invalid-argument";

/**
 * Base class for every error thrown by the DiceForge core. The `code` field is
 * a stable, machine-readable discriminator; messages may change between versions.
 */
export class DiceForgeError extends Error {
  readonly code: DiceForgeErrorCode;

  constructor(code: DiceForgeErrorCode, message: string) {
    super(message);
    this.name = "DiceForgeError";
    this.code = code;
  }
}

/** Thrown when a dice notation expression cannot be parsed or violates a limit. */
export class DiceNotationError extends DiceForgeError {
  /** Zero-based character index into the original expression where the problem was found. */
  readonly position: number;

  constructor(message: string, position: number) {
    super("notation", `${message} (at position ${position})`);
    this.name = "DiceNotationError";
    this.position = position;
  }
}
