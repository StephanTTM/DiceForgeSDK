/**
 * Exports the core's behaviour as language-agnostic test vectors.
 *
 *   node tools/conformance/export-vectors.mjs            # rewrite the committed file
 *   node tools/conformance/export-vectors.mjs --stdout   # print instead (for tests)
 *
 * An engine adapter cannot run the TypeScript core, so it ports it — and a
 * port is only trustworthy if it is held to the same numbers (ADR-0021). This
 * file freezes the reproducibility contract into data: RNG streams, parses,
 * error positions, and fully resolved records. Every port must reproduce them
 * exactly; a vitest test regenerates the file and fails if the committed copy
 * has drifted from the core.
 *
 * Error vectors carry positions but not message text — wording is not API.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDiceEngine,
  createSeededRandomSource,
  defineDie,
  parseDiceNotation,
} from "../../packages/core/dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "packages", "testing", "vectors", "core-vectors.json");

/** The demo's Fate die: repeats, zero and negative values, symbol labels. */
const FATE = {
  id: "fate",
  faces: [
    { value: -1, label: "-" },
    { value: -1, label: "-" },
    { value: 0, label: " " },
    { value: 0, label: " " },
    { value: 1, label: "+" },
    { value: 1, label: "+" },
  ],
};

const RNG_SEEDS = [
  "table-42",
  "",
  "0",
  "42",
  "The quick brown fox",
  "unicode-é→\u{1f3b2}",
  // Degenerate seeds are the same contract (they reached the TS suite as
  // adversarial probes): applications put user text straight into seeds, so
  // every port must hash these identically too. The astral pair is what
  // holds every port's UTF-16 code-unit handling to the core.
  //
  // A lone surrogate seed ("\uD800") is deliberately NOT here: JSON cannot
  // carry unpaired surrogates in interchange (RFC 8259 §8.2) — Godot's
  // parser measurably rejects the whole file, and .NET's would too — so
  // that behaviour is a JS-level guarantee, locked in the core's own suite
  // (rng/seeded.test.ts), not part of the cross-port contract.
  "💀💀",
  "NaN",
  "x".repeat(1000),
];

const PARSE_OK = [
  "1d6",
  "2d20kh1+3",
  "4d6dl1",
  "d%",
  "3d6!",
  "4d6r1kh3",
  "4d6kh3r1",
  "2D10Kh",
  " 1d6 + 2 ",
  "d{fate}",
  "4d{fate}!",
  "1d6-2+3d4dh2",
  "-2d6+10",
  "10d10ro3!kh4",
  "1d1000",
];

const PARSE_ERRORS = [
  "",
  "5",
  "d1",
  "0d6",
  "1d6kh1kh1",
  "2d6kh5",
  "d{nope}",
  "d{",
  "1d",
  "!!",
  "1d6r6",
  "1d6xx2",
  "101d6",
  "1d1001",
  // From the adversarial probes: structure, caps, and the ASCII-only rule.
  // A port whose scanner uses a locale-aware "is digit" would accept the
  // fullwidth digits, which is exactly the divergence a vector catches.
  "４d６",
  "1d6+",
  "1d6 7",
  "(1d6)",
  "2000000+1d6",
  `1d6${" ".repeat(600)}`,
];

const ROLLS = [
  { seed: "table-42", expression: "2d20kh1+3" },
  { seed: "table-42", expression: "4d6dl1" },
  { seed: "vectors", expression: "10d10ro3!kh4" },
  { seed: "zz", expression: "3d6!+2d20-5" },
  { seed: "fate-seed", expression: "4d{fate}", dice: true },
  { seed: "percentile", expression: "d%+1d4" },
];

export function buildVectors() {
  const rng = RNG_SEEDS.map((seed) => {
    const source = createSeededRandomSource(seed);
    return { seed, uint32: Array.from({ length: 16 }, () => source.nextUint32()) };
  });

  const faces = [
    { seed: "faces-6", sides: 6 },
    { seed: "faces-20", sides: 20 },
    { seed: "faces-100", sides: 100 },
    { seed: "faces-3", sides: 3 },
    { seed: "faces-1000", sides: 1000 },
  ].map(({ seed, sides }) => {
    // rollFace is not exported; a 1-die group with no modifiers consumes one
    // draw per die, which is the same contract stated from the outside.
    const engine = createDiceEngine({ random: createSeededRandomSource(seed) });
    const values = Array.from(
      { length: 12 },
      () => engine.roll(`1d${sides}`).groups[0].dice[0].value,
    );
    return { seed, sides, values };
  });

  const parse = PARSE_OK.map((expression) => {
    const parsed = parseDiceNotation(expression, { dice: new Map([["fate", defineDie(FATE)]]) });
    return { expression, normalized: parsed.normalized };
  });

  const parseErrors = PARSE_ERRORS.map((expression) => {
    try {
      parseDiceNotation(expression, { dice: new Map([["fate", defineDie(FATE)]]) });
      throw new Error(`expected ${JSON.stringify(expression)} to fail`);
    } catch (error) {
      if (typeof error.position !== "number") throw error;
      return { expression, position: error.position };
    }
  });

  const rolls = ROLLS.map(({ seed, expression, dice }) => {
    const engine = createDiceEngine({
      random: createSeededRandomSource(seed),
      ...(dice ? { dice: [FATE] } : {}),
    });
    return { seed, expression, ...(dice ? { dice: [FATE] } : {}), record: engine.roll(expression) };
  });

  const coins = ["coin-seed", "table-42"].map((seed) => {
    const engine = createDiceEngine({ random: createSeededRandomSource(seed) });
    return { seed, outcomes: Array.from({ length: 12 }, () => engine.flipCoin().outcome) };
  });

  return {
    // Bump only with a superseding ADR: these ARE the reproducibility contract.
    contract: "diceforge-core-conformance",
    version: 1,
    generator: "tools/conformance/export-vectors.mjs",
    rng,
    faces,
    parse,
    parseErrors,
    rolls,
    coins,
  };
}

const json = `${JSON.stringify(buildVectors(), null, 2)}\n`;
if (process.argv.includes("--stdout")) {
  process.stdout.write(json);
} else {
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT}`);
}
