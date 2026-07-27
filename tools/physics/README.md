# Physics harness

Measurement for the physics presenter proposed in ADR-0018. It renders nothing, ships nothing, and is not part of any package.

```bash
npm run build                                    # the harness reads dist/
npm run physics
npm run physics -- --shape=20 --dice=8 --trials=50
```

## What it answers

`packages/renderer-web/src/math/symmetry.test.ts` proves the technique on paper: for every shape, a rotation exists that carries any face onto any other without moving the solid, so a die's mesh can be remapped inside its collider to show an already-resolved face. What that cannot say is whether a simulation of real dice behaves well enough to animate. This measures that.

| Column | Means |
| --- | --- |
| settled | Trials where every die reached cannon's sleep state within 15 simulated seconds |
| settle s | How long the roll takes — the latency before playback could start |
| scatter mm | Distance from the origin at rest; what the camera has to frame |
| flatness | The up-face normal's Y at rest: 1.000 is dead flat |
| remap err | Worst error placing the recorded face where the simulation's face landed |
| trajectory | Recorded transforms for the whole roll, at float64 |

**Flatness of 0.333 on a d4 is correct, not a fault.** A tetrahedron rests on a face with a vertex uppermost, so no face is on top at all — which is exactly why the renderer views an all-d4 roll from a lower angle.

## Settings, and why

Measured rather than chosen:

- **`solver.iterations = 20`.** Cannon's default of 10 leaves a dodecahedron in a perfect limit cycle — dead flat, motionless, then kicked back into a spin of 3.3 rad/s, repeating every two seconds forever. Sixteen is the threshold where every shape settles every time; 20 leaves headroom.
- **Leave `solver.tolerance` alone.** Loosening it to 1e-3 stops *every* shape settling, whatever the iteration count.
- **Cannon's sleep, not a velocity threshold.** A convex hull on a plane gets periodic energy from the solver. A hand-rolled "is it slow yet" check never sees every die quiet at the same moment; a sleeping body ignores the kick.
- **Dice are ~16 mm under real gravity.** Simulating a 2-unit die at 9.82 m/s² produces a drifting boulder. Small dice and real gravity is what makes the motion read as dice.
- **Damping.** A real die bleeds energy into the felt; without it a spinning one outlasts anyone's patience.

## Known wrinkle in the source geometry

Five of the d10's ten kite faces list their vertices out of cyclic order. Nothing depends on it today — the renderer stopped triangulating these rings when the procedural dice were retired — and the d10 settles fine because cannon rebuilds its own normals. A presenter that hands these rings to a physics engine should normalize them first.
