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
  record.groups.flatMap((group) =>
    group.dice.map((die) => ({
      shape: die.sides,
      face: die.value,
      // Where this model's numerals are. The collider is built from it, so a
      // face of the collider *is* a number (ADR-0019).
      faceRotations: theme.models.faceRotations[die.sides],
    })),
  ),
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
| `trayRadius` | `dieWidth × 3.5` | The tray's shorter half-extent; fixed, not scaled to the dice count |
| `trayAspect` | `1` | Width over depth — shape it like your viewport and the dice spread into frame |
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

## The collider is not your model, but it is built from it

The die you draw and the die that collides are deliberately different objects. The collider is the idealised sharp solid; your model is cosmetic, drawn inside an invisible container only the physics sees.

It is nevertheless **derived** from your model, via the calibrated table that says which rotation brings each numeral to the top. Intersecting the half-spaces those directions define gives a solid whose faces are the numerals, in value order. That is why `faceRotations` is required: a collider knows its geometry and nothing about its numbering, and the first version of this package built the collider from generated geometry instead — so the physics landed a *geometric* face upward and the model showed whichever numeral happened to be printed there. 57 of 60 faces displayed the wrong number (ADR-0019).

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

It draws only what it can honestly simulate. A custom die, an unusual face count, a missing theme or a browser without WebGL all go to `@diceforge-sdk/renderer-web`, which already does them well — delegating rather than reimplementing is why this package is small. The result is announced exactly once, whichever of the two drew it.

A **coin flip** is simulated for real when the theme ships a coin: a cylinder collider whose two faces *are* the outcomes, thrown into the same tray as the dice, with the same remap trick landing it on the recorded face — a half turn about a diameter is a symmetry of a cylinder, so the physics never notices. The collider's radius and thickness are measured from the loaded model rather than assumed, so a themed coin of any proportions collides as the coin it is. A flip that finishes on its rim is thrown again, exactly like a die that finishes leaning. Measured over 60 seeded flips: every one settled flat on the recorded outcome, at about 5 ms per flip including retries.

Reduced motion jumps to the final pose instead of playing the roll, and `present(event, { signal })` cancels like any other presenter.

## Framing

The dice area is a **fixed** rectangle, shaped to the stage, and the camera frames it and nothing else. It does not grow with the number of dice, so the same die is the same size on every throw and a roll that scatters wide does not zoom out — a tray is a thing on a table.

Its size is measured: `dieWidth × 3.5` on the shorter side is the tightest that still lands 30 out of 30 dice flat at one, five and ten dice. Larger is calmer but shrinks the dice; at seven die-widths a d20 spans a fourteenth of the frame and cannot be read. Override it with `trayRadius`.

## A throw that lands badly is thrown again

A die propped against a wall or a neighbour shows its recorded face at an angle, which reads as though the roll has not finished. Simulating costs about 4 ms per die, so a throw that leaves any die tilted more than about 1.8° is discarded and thrown again, up to six times. Nothing is corrected on screen and no outcome changes — the faces were decided before any of this ran. Only the motion differs.

The canvas follows its container: a window resize re-fits the camera and re-frames the dice where they lie, so a responsive layout keeps the roll it was showing. The listener is released by `dispose()`.

## Licence

MIT.
