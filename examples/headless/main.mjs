// Headless DiceForge example: resolve trustworthy results with no renderer,
// no DOM, and no network. Run from the repository root with `npm run example`.
import {
  createDiceEngine,
  createSeededRandomSource,
  createSession,
  deserializeEvent,
  deserializeSession,
  replaySession,
  serializeEvent,
  serializeSession,
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

// Re-resolution: the same seed and the same expressions produce the same
// records again. This rolls — it is the RNG's guarantee (ADR-0005), and it is
// not the same thing as a replay.
const rerun = createDiceEngine({ random: createSeededRandomSource(seed) });
console.log(`Re-resolved with the same seed (identical by contract)`);
console.log(`  attack roll  ${describeRoll(rerun.roll("2d20kh1+3"))}`);
console.log(`  ability roll ${describeRoll(rerun.roll("4d6dl1"))}`);
console.log(`  coin flip    ${rerun.flipCoin().outcome}`);

// 2. Event records serialize to JSON and back without losing meaning, so they
//    can be stored, replayed, or handed to a renderer later.
const stored = serializeEvent(engine.roll("1d100"));
const restored = deserializeEvent(stored);
console.log("Serialized event round-trip");
console.log(`  payload  ${stored}`);
console.log(`  restored total ${restored.total} (schemaVersion ${restored.schemaVersion})`);

// 3. A session is a table's history. Replaying it re-presents stored outcomes
//    and rolls nothing at all, so the engine's next roll is untouched
//    (ADR-0017). A presenter that prints is still a presenter.
const consolePresenter = {
  capabilities: {
    implementation: "example/headless-console",
    kinds: ["roll", "coin-flip"],
    dieSides: "any",
    media: ["none"],
    cancellable: false,
    announces: false,
    honorsReducedMotion: false,
  },
  async present(event) {
    console.log(
      `    ${event.kind === "roll" ? describeRoll(event) : `coin flip -> ${event.outcome}`}`,
    );
  },
};

const log = [engine.roll("1d20"), engine.flipCoin()];
const savedSession = serializeSession(createSession(log));
console.log(`Session of ${log.length} events (${savedSession.length} bytes), replayed:`);
await replaySession(deserializeSession(savedSession), consolePresenter);

const beforeReplay = createDiceEngine({ random: createSeededRandomSource("continuity") });
const first = beforeReplay.roll("1d20").total;
await replaySession(log, consolePresenter, { onEvent: () => {} });
const afterReplay = beforeReplay.roll("1d20").total;
const control = createDiceEngine({ random: createSeededRandomSource("continuity") });
control.roll("1d20");
console.log(
  `  replay consumed no randomness: next roll ${afterReplay} matches ${control.roll("1d20").total} from an untouched engine (first was ${first})`,
);

// 4. The default engine uses the platform's own randomness when
//    reproducibility is not needed.
const casual = createDiceEngine();
console.log(`Unseeded roll (varies each run): ${casual.roll("3d6").total}`);
