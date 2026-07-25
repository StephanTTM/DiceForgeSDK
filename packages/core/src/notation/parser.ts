import { DiceForgeError, DiceNotationError } from "../errors.js";
import type {
  DiceExpression,
  DiceGroupNode,
  DiceSelection,
  DieSides,
  ExpressionTerm,
  SelectionMode,
} from "./ast.js";
import { isDieSides, renderGroupNotation } from "./ast.js";

export const MAX_EXPRESSION_LENGTH = 500;
export const MAX_TERMS = 20;
export const MAX_DICE_PER_GROUP = 100;
export const MAX_MODIFIER = 1_000_000;

const SELECTION_MODES: readonly string[] = ["kh", "kl", "dh", "dl"];

/**
 * Parses dice notation grammar v1 (see API.md for the full grammar):
 *
 *   expression := [sign] term { sign term }
 *   term       := dice | integer
 *   dice       := [count] ("d" | "D") (sides | "%") [selection]
 *   selection  := ("kh" | "kl" | "dh" | "dl") [count]
 *
 * Case-insensitive; whitespace is allowed around terms and signs but not
 * inside a dice group. "d%" is shorthand for "d100". A selection without a
 * count defaults to 1 ("2d20kh" means "2d20kh1").
 *
 * Throws `DiceNotationError` (code "notation", with a zero-based `position`)
 * for syntax errors and limit violations.
 */
export function parseDiceNotation(expression: string): DiceExpression {
  if (typeof expression !== "string") {
    throw new DiceForgeError("invalid-argument", "expression must be a string");
  }
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new DiceNotationError(
      `expression exceeds ${MAX_EXPRESSION_LENGTH} characters`,
      MAX_EXPRESSION_LENGTH,
    );
  }
  return new Parser(expression).parse();
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
  private pos = 0;

  constructor(source: string) {
    this.source = source;
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
    const sides = this.readSides();
    if (count < 1) {
      throw new DiceNotationError("dice count must be at least 1", start);
    }
    if (count > MAX_DICE_PER_GROUP) {
      throw new DiceNotationError(`dice count exceeds ${MAX_DICE_PER_GROUP}`, start);
    }
    const selection = this.readSelection(count);
    return selection
      ? { type: "dice", sign, count, sides, selection }
      : { type: "dice", sign, count, sides };
  }

  private readSides(): DieSides {
    const char = this.peek();
    if (char === "%") {
      this.pos++;
      return 100;
    }
    if (char === undefined || !isDigit(char)) {
      throw new DiceNotationError('expected a die size after "d"', this.pos);
    }
    const start = this.pos;
    const value = this.readInteger("die size");
    if (!isDieSides(value)) {
      throw new DiceNotationError(
        `unsupported die size d${value}; supported dice are d4, d6, d8, d10, d12, d20, d100, and d%`,
        start,
      );
    }
    return value;
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
