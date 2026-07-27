import type { DieRegistry } from "../dice/definition.js";
import { findDie, MAX_DIE_FACES } from "../dice/definition.js";
import { DiceForgeError, DiceNotationError } from "../errors.js";
import type {
  DiceExpression,
  DiceGroupNode,
  DiceSelection,
  ExpressionTerm,
  SelectionMode,
} from "./ast.js";
import { renderGroupNotation } from "./ast.js";

export const MAX_EXPRESSION_LENGTH = 500;
export const MAX_TERMS = 20;
export const MAX_DICE_PER_GROUP = 100;
export const MAX_MODIFIER = 1_000_000;

const SELECTION_MODES: readonly string[] = ["kh", "kl", "dh", "dl"];

export type ParseOptions = {
  /**
   * Custom dice the expression may name (ADR-0015). Without it `d{fate}` still
   * parses — the name is carried in the AST — but nothing can check that the
   * die exists, so the error surfaces at resolve time instead of here with a
   * position.
   */
  readonly dice?: DieRegistry;
};

/**
 * Parses dice notation grammar v1.1 (see API.md for the full grammar):
 *
 *   expression := [sign] term { sign term }
 *   term       := dice | integer
 *   dice       := [count] ("d" | "D") (faces | "%" | "{" name "}") [selection]
 *   selection  := ("kh" | "kl" | "dh" | "dl") [count]
 *
 * Case-insensitive; whitespace is allowed around terms and signs but not
 * inside a dice group. "d%" is shorthand for "d100". A selection without a
 * count defaults to 1 ("2d20kh" means "2d20kh1"). A face count may be any
 * number from 2 to MAX_DIE_FACES, so "d3" and "d30" need no registration;
 * braces name a custom die, "4d{fate}".
 *
 * Throws `DiceNotationError` (code "notation", with a zero-based `position`)
 * for syntax errors and limit violations.
 */
export function parseDiceNotation(expression: string, options: ParseOptions = {}): DiceExpression {
  if (typeof expression !== "string") {
    throw new DiceForgeError("invalid-argument", "expression must be a string");
  }
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new DiceNotationError(
      `expression exceeds ${MAX_EXPRESSION_LENGTH} characters`,
      MAX_EXPRESSION_LENGTH,
    );
  }
  return new Parser(expression, options).parse();
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isLetter(char: string): boolean {
  return /[a-z]/i.test(char);
}

function renderExpression(terms: readonly ExpressionTerm[]): string {
  let normalized = "";
  terms.forEach((term, index) => {
    const body = term.type === "dice" ? renderGroupNotation(term) : String(term.value);
    const operator = term.sign === -1 ? "-" : index === 0 ? "" : "+";
    normalized += `${operator}${body}`;
  });
  return normalized;
}

class Parser {
  private readonly source: string;
  private readonly options: ParseOptions;
  private pos = 0;

  constructor(source: string, options: ParseOptions) {
    this.source = source;
    this.options = options;
  }

  parse(): DiceExpression {
    const terms: ExpressionTerm[] = [];
    this.skipWhitespace();
    if (this.atEnd()) {
      throw new DiceNotationError("expression is empty", this.pos);
    }
    terms.push(this.readTerm(this.readSign(true)));
    this.skipWhitespace();
    while (!this.atEnd()) {
      terms.push(this.readTerm(this.readSign(false)));
      this.skipWhitespace();
      if (terms.length > MAX_TERMS) {
        throw new DiceNotationError(`expression exceeds ${MAX_TERMS} terms`, this.pos);
      }
    }
    if (!terms.some((term) => term.type === "dice")) {
      throw new DiceNotationError(
        'expression must include at least one die (for example "1d6")',
        0,
      );
    }
    return { source: this.source, normalized: renderExpression(terms), terms };
  }

  private atEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(): string | undefined {
    return this.source[this.pos];
  }

  private skipWhitespace(): void {
    while (!this.atEnd()) {
      const char = this.peek();
      if (char === undefined || !/\s/.test(char)) break;
      this.pos++;
    }
  }

  private readSign(optional: boolean): 1 | -1 {
    const char = this.peek();
    if (char === "+") {
      this.pos++;
      return 1;
    }
    if (char === "-") {
      this.pos++;
      return -1;
    }
    if (optional) return 1;
    throw new DiceNotationError('expected "+" or "-" before the next term', this.pos);
  }

  private readTerm(sign: 1 | -1): ExpressionTerm {
    this.skipWhitespace();
    const start = this.pos;
    const char = this.peek();
    if (char === undefined) {
      throw new DiceNotationError("expected a term after the operator", this.pos);
    }
    if (isDigit(char)) {
      const value = this.readInteger("number");
      const next = this.peek();
      if (next === "d" || next === "D") {
        return this.readDiceGroup(sign, value, start);
      }
      if (value > MAX_MODIFIER) {
        throw new DiceNotationError(`modifier exceeds ${MAX_MODIFIER}`, start);
      }
      return { type: "modifier", sign, value };
    }
    if (char === "d" || char === "D") {
      return this.readDiceGroup(sign, 1, start);
    }
    throw new DiceNotationError(`unexpected character "${char}"`, this.pos);
  }

  private readDiceGroup(sign: 1 | -1, count: number, start: number): DiceGroupNode {
    this.pos++; // consume "d"
    const die = this.readDie();
    if (count < 1) {
      throw new DiceNotationError("dice count must be at least 1", start);
    }
    if (count > MAX_DICE_PER_GROUP) {
      throw new DiceNotationError(`dice count exceeds ${MAX_DICE_PER_GROUP}`, start);
    }
    const selection = this.readSelection(count);
    return {
      type: "dice",
      sign,
      count,
      sides: die.sides,
      ...(die.id === undefined ? {} : { die: die.id }),
      ...(selection ? { selection } : {}),
    };
  }

  /** The part after "d": a face count, "%", or a braced custom die name. */
  private readDie(): { sides: number; id?: string } {
    const char = this.peek();
    if (char === "%") {
      this.pos++;
      return { sides: 100 };
    }
    if (char === "{") return this.readNamedDie();
    if (char === undefined || !isDigit(char)) {
      throw new DiceNotationError('expected a die size or {name} after "d"', this.pos);
    }
    const start = this.pos;
    const sides = this.readInteger("die size");
    if (sides < 2) {
      throw new DiceNotationError(
        `d${sides} has no faces to roll; for a constant use a modifier such as "+${sides}"`,
        start,
      );
    }
    if (sides > MAX_DIE_FACES) {
      throw new DiceNotationError(`die size exceeds ${MAX_DIE_FACES} faces`, start);
    }
    return { sides };
  }

  private readNamedDie(): { sides: number; id: string } {
    const start = this.pos;
    this.pos++; // consume "{"
    let name = "";
    while (!this.atEnd() && this.peek() !== "}") {
      name += this.source[this.pos];
      this.pos++;
    }
    if (this.atEnd()) throw new DiceNotationError('unterminated die name; expected "}"', start);
    this.pos++; // consume "}"
    if (name.length === 0) throw new DiceNotationError("die name is empty", start);

    const definition = findDie(this.options.dice, name);
    if (this.options.dice && !definition) {
      const known = [...this.options.dice.values()].map((die) => `d{${die.id}}`);
      const hint =
        known.length > 0 ? `defined dice are ${known.join(", ")}` : "no dice are defined";
      throw new DiceNotationError(`unknown die ${JSON.stringify(name)}; ${hint}`, start);
    }
    // Without a registry the name is carried through unresolved: only the
    // caller knows which dice exist, so resolution is where it is rejected.
    return { sides: definition?.faces.length ?? 0, id: definition?.id ?? name };
  }

  private readSelection(diceCount: number): DiceSelection | undefined {
    const char = this.peek();
    if (char === undefined || !isLetter(char)) return undefined;
    const start = this.pos;
    const mode = this.source.slice(this.pos, this.pos + 2).toLowerCase();
    if (!SELECTION_MODES.includes(mode)) {
      throw new DiceNotationError(
        `unknown roll modifier "${mode}"; supported modifiers are kh, kl, dh, dl`,
        start,
      );
    }
    this.pos += 2;
    let count = 1;
    const next = this.peek();
    if (next !== undefined && isDigit(next)) {
      const countStart = this.pos;
      count = this.readInteger("keep/drop count");
      if (count < 1) {
        throw new DiceNotationError("keep/drop count must be at least 1", countStart);
      }
      if (count > diceCount) {
        throw new DiceNotationError(
          `keep/drop count ${count} exceeds the ${diceCount} dice in the group`,
          countStart,
        );
      }
    }
    return { mode: mode as SelectionMode, count };
  }

  private readInteger(label: string): number {
    const start = this.pos;
    let digits = "";
    while (!this.atEnd()) {
      const char = this.peek();
      if (char === undefined || !isDigit(char)) break;
      digits += char;
      this.pos++;
    }
    if (digits.length === 0) {
      throw new DiceNotationError(`expected a ${label}`, start);
    }
    if (digits.length > 7) {
      throw new DiceNotationError(`${label} is too large`, start);
    }
    return Number.parseInt(digits, 10);
  }
}
