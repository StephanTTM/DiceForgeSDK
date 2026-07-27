# @diceforge-sdk/presenter-physics

Physics motion for DiceForge dice. Simulates a roll, then places the already-resolved face where the simulation put whichever face came up — so the dice tumble for real and still land on the outcome the engine decided.

```bash
npm install @diceforge-sdk/presenter-physics @diceforge-sdk/renderer-web
```

## The problem it solves

A simulation lands a die wherever it lands. The core resolved the roll before any of this began, and [architecture rule 5](../../ARCHITECTURE.md) says presentation may never decide an outcome. Steering the simulation is a corrected animation, which ADR-0007 rules out; rotating the die once it rests is a visible snap at exactly the moment the player is watching.

So the die's **mesh is rotated inside its collider** by a rotation from the solid's own symmetry group, chosen so the recorded face occupies the place the simulation's face landed in. A symmetry leaves the collider identical, so the physics never notices and nothing is corrected on screen (ADR-0018).

## Use

```ts
import { simulateRoll } from "@diceforge-sdk/presenter-physics";

const record = engine.roll("4d6");           // resolved first, as always
const motion = simulateRoll(
  record.groups.flatMap((group) => group.dice.map((die) => ({ shape: die.sides, face: die.value }))),
  { dieRadius: 1.05 },
);

for (const die of motion.dice) {
  mesh.quaternion.set(...die.remap);          // once, before the first frame
}
// then play die.frames at motion.frameRate
```

Each `PhysicsDie` carries the `remap` to apply to its mesh, the recorded `frames`, and `seated` — how squarely it finished, where 1 is flat on a face.

| Option | Default | Meaning |
| --- | --- | --- |
| `dieRadius` | `1` | Circumradius in your units; every distance is scaled to match |
| `trayRadius` | `dieWidth × (5 + 0.8√n)` | The dice cannot leave it, so a camera framed on it never moves |
| `random` | `Math.random` | Pass a seeded source and the same throw reproduces exactly |
| `frameRate` | `60` | Recording rate |
| `maxDuration` | `8` s | Longest roll to record |

## Why the trajectory is recorded, not simulated live

The whole roll is computed before anything is drawn, and playback is ordinary animation. That means no physics runs while the roll is on screen, the result is frame-rate independent, reduced motion is a matter of jumping to the last frame, and the engine never needs to be deterministic across runs.

It is also cheap enough to do in the frame that starts the roll:

| Dice | Simulation | Roll length | Trajectory |
| --- | --- | --- | --- |
| 1 | 4 ms | 0.64 s | 6 kB |
| 10 | 14 ms | 0.93 s | 77 kB |
| 40 | 44 ms | 1.52 s | 438 kB |

## The collider is not your model

The die you draw and the die that collides are deliberately different objects. The collider is the idealised sharp solid; your model is cosmetic, drawn inside an invisible container only the physics sees.

That is not only for speed, though it is 500× faster than colliding a bevelled model. The symmetry remap needs a solid whose faces are all equivalent, and a bevelled d20 is not twenty faces but roughly 620 facets — no symmetry carries one bevel sliver onto another in a way that repositions a die face.

Because the physics decides nothing, the two need not match. A themed die may be bevelled, hollowed, or missing whole faces for effect and still roll correctly. The one constraint is scale: line the model's face planes up with the collider's, or it will hover or sink.

## The presenter

`createPhysicsPresenter` plays that motion, so most applications never touch `simulateRoll` directly:

```ts
import { createPhysicsPresenter } from "@diceforge-sdk/presenter-physics";

const presenter = createPhysicsPresenter({
  container: document.querySelector("#stage")!,
  theme: forgeTheme(forgeAssets({ color: "red" })),
});

await presenter.present(engine.roll("4d6"));
```

It draws only what it can honestly simulate. A coin flip, a custom die, an unusual face count, a missing theme or a browser without WebGL all go to `@diceforge-sdk/renderer-web`, which already does them well — delegating rather than reimplementing is why this package is small. The result is announced exactly once, whichever of the two drew it.

Reduced motion jumps to the final pose instead of playing the roll, and `present(event, { signal })` cancels like any other presenter.

## Known rough edge

The camera frames the whole tray so it never has to move between rolls, and a circular tray has to fit the shorter axis of the canvas. On a wide, short stage that leaves most of the width empty and the dice looking distant. A tray shaped to the viewport would fill the frame better; since it changes what is simulated, it is worth measuring rather than guessing.

## Licence

MIT.
