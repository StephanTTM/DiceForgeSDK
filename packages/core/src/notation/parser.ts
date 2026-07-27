import type { DieRegistry } from "../dice/definition.js";
import { findDie, MAX_DIE_FACES } from "../dice/definition.js";
import { DiceForgeError, DiceNotationError } from "../errors.js";
import type {
  DiceExpression,
  DiceGroupNode,
  DiceReroll,
  DiceSelection,
  ExpressionTerm,
  SelectionMode,
} from "./ast.js";
import { renderGroupNotation } from "./ast.js";

export const MAX_EXPRESSION_LENGTH = 500;
export const MAX_TERMS = 20;
export const MAX_DICE_PER_GROUP = 100;
export const MAX_MODIFIER = 1_000_000;
/** How many times one die may explode in a chain (ADR-0016). */
export const MAX_EXPLOSIONS_PER_DIE = 10;
/** How many times one die may be rerolled by `r` (ADR-0016). */
export const MAX_REROLLS_PER_DIE = 10;
/** Total dice a group's modifiers may add on top of the count that was asked for. */
export const MAX_EXTRA_DICE_PER_GROUP = 100;

const SELECTION_MODES: readonly string[] = ["kh", "kl", "dh", "dl"];

/** What "d…" resolved to: a face count, and a custom die name when named. */
type ParsedDie = { readonly sides: number; readonly id?: string };

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
 *   dice       := [count] ("d" | "D") (faces | "%" | "{" name "}") { modifier }
 *   modifier   := reroll | "!" | selection
 *   reroll     := "r" ["o"] threshold
 *   selection  := ("kh" | "kl" | "dh" | "dl") [count]
 *
 * Case-insensitive; whitespace is allowed around terms and signs but not
 * inside a dice group. "d%" is shorthand for "d100". A selection without a
 * count defaults to 1 ("2d20kh" means "2d20kh1"). A face count may be any
 * number from 2 to MAX_DIE_FACES, so "d3" and "d30" need no registration;
 * braces name a custom die, "4d{fate}". Modifiers may be written in any order
 * and always apply as reroll, then explode, then keep/drop (ADR-0016).
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

    // Modifiers may be written in any order — the reading of "4d6kh3r1" is not
    // in doubt — but each may appear only once, and they always apply in the
    // order reroll, explode, select (ADR-0016).
    let reroll: DiceReroll | undefined;
    let explode = false;
    let selection: DiceSelection | undefined;
    while (!this.atEnd()) {
      const char = this.peek();
      if (char === "!") {
        if (explode) throw new DiceNotationError("explode is already set", this.pos);
        this.assertCanExplode(die, this.pos);
        this.pos++;
        explode = true;
        continue;
      }
      if (char === "r" || char === "R") {
        if (reroll) throw new DiceNotationError("reroll is already set", this.pos);
        reroll = this.readReroll(die);
        continue;
      }
      if (char !== undefined && isLetter(char)) {
        if (selection) throw new DiceNotationError("keep/drop is already set", this.pos);
        selection = this.readSelection(count);
        continue;
      }
      break;
    }

    return {
      type: "dice",
      sign,
      count,
      sides: die.sides,
      ...(die.id === undefined ? {} : { die: die.id }),
      ...(reroll ? { reroll } : {}),
      ...(explode ? { explode } : {}),
      ...(selection ? { selection } : {}),
    };
  }

  /** Face values this die can produce, when they are knowable while parsing. */
  private faceValues(die: ParsedDie): readonly number[] | undefined {
    if (die.id === undefined) return undefined; // plain numeric: 1..sides
    const definition = findDie(this.options.dice, die.id);
    return definition?.faces.map((face) => face.value);
  }

  /**
   * A die whose every face is its highest would explode until it hit the cap,
   * which is a typo rather than an intention worth honoring.
   */
  private assertCanExplode(die: ParsedDie, position: number): void {
    const values = this.faceValues(die);
    if (!values || values.length === 0) return;
    const highest = Math.max(...values);
    if (values.every((value) => value === highest)) {
      throw new DiceNotationError(
        "every face of this die is its highest, so it would explode forever",
        position,
      );
    }
  }

  private readReroll(die: ParsedDie): DiceReroll {
    const start = this.pos;
    this.pos++; // consume "r"
    const next = this.peek();
    const once = next === "o" || next === "O";
    if (once) this.pos++;
    const threshold = this.readInteger("reroll threshold");

    const values = this.faceValues(die);
    const highest = values ? Math.max(...values) : die.sides;
    const lowest = values ? Math.min(...values) : 1;
    if (threshold >= highest) {
      throw new DiceNotationError(
        `reroll threshold ${threshold} covers every face of this die, so it would never settle`,
        start,
      );
    }
    if (threshold < lowest) {
      throw new DiceNotationError(
        `reroll threshold ${threshold} is below every face of this die, so it would do nothing`,
        start,
      );
    }
    return { threshold, once };
  }

  /** The part after "d": a face count, "%", or a braced custom die name. */
  private readDie(): ParsedDie {
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
