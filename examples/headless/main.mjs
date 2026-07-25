// Headless DiceForge example: resolve trustworthy results with no renderer,
// no DOM, and no network. Run from the repository root with `npm run example`.
import {
  createDiceEngine,
  createSeededRandomSource,
  deserializeEvent,
  serializeEvent,
} from "@diceforge-sdk/core";

function describeRoll(result) {
  const groups = result.groups
    .map((group) => {
      const dice = group.dice
        .map((die) => (die.kept ? `${die.value}` : `(${die.value} dropped)`))
        .join(", ");
      return `${group.notation}: [${dice}] = ${group.subtotal}`;
    })
    .join("; ");
  return `${result.expression} -> ${groups}; modifier ${result.modifier}; total ${result.total}`;
}

// 1. Seeded rolls are reproducible: the same seed always yields the same result.
const seed = "table-42";
const engine = createDiceEngine({ random: createSeededRandomSource(seed) });

console.log(`Seeded engine (seed "${seed}")`);
console.log(`  attack roll  ${describeRoll(engine.roll("2d20kh1+3"))}`);
console.log(`  ability roll ${describeRoll(engine.roll("4d6dl1"))}`);
console.log(`  coin flip    ${engine.flipCoin().outcome}`);

const replay = createDiceEngine({ random: createSeededRandomSource(seed) });
console.log(`Replayed with the same seed (identical by contract)`);
console.log(`  attack roll  ${describeRoll(replay.roll("2d20kh1+3"))}`);
console.log(`  ability roll ${describeRoll(replay.roll("4d6dl1"))}`);
console.log(`  coin flip    ${replay.flipCoin().outcome}`);

// 2. Event records serialize to JSON and back without losing meaning, so they
//    can be stored, replayed, or handed to a renderer later.
const stored = serializeEvent(engine.roll("1d100"));
const restored = deserializeEvent(stored);
console.log("Serialized event round-trip");
console.log(`  payload  ${stored}`);
console.log(`  restored total ${restored.total} (schemaVersion ${restored.schemaVersion})`);

// 3. The default engine uses the platform's own randomness when
//    reproducibility is not needed.
const casual = createDiceEngine();
console.log(`Unseeded roll (varies each run): ${casual.roll("3d6").total}`);
