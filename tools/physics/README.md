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

## Collide the solid, draw the model

`--hull=glb` swaps the ideal solid for the shipped bevelled model, parsed straight out of the `.glb`. It was worth measuring and the answer is clear:

| Collider | Settles | Wall clock per roll | Remap |
| --- | --- | --- | --- |
| ideal sharp solid | every shape, every trial | 2–6 ms | 0.0000° |
| shipped bevelled model | every shape, every trial | 17–3295 ms | fails on every pose |

The bevelled model simulates perfectly well. It fails the remap because it is not a solid with faces — a bevelled d20 is roughly 620 facets — and no symmetry carries one bevel sliver onto another in a way that repositions a die face. It is also up to 500× more expensive; the d10's 430 facets cost over three seconds per roll.

So the collider is the idealised solid and the model is cosmetic, drawn inside an invisible container only the physics sees. Since the physics decides nothing — the core resolved the outcome before any of this began — the two need not match. Art may be bevelled, hollowed, or missing whole faces and still roll correctly, provided its face planes are scaled onto the collider's. Matching bounding radii instead rests a bevelled die 3–9% off the table, which is why the harness scales by face-plane distance.

## The tray, and why the camera needs one

`--tray=<mm>` puts eight static walls around the roll. Without them a roll scatters further the more dice it has, so a camera framing the result shrinks the dice as the roll grows and has to move for every roll:

| Tray | 5 dice | 10 dice | 20 dice |
| --- | --- | --- | --- |
| none | 124 mm scatter, 100% seated | 179 mm, 100% | 230 mm, 100% |
| 120 mm | 112 mm, 100% | 113 mm, 99% | 113 mm, 99% |
| 100 mm | 88 mm, 98% | 93 mm, 100% | 94 mm, 99% (7/8 settled) |
| 80 mm | 74 mm, 95% | 73 mm, 91% | 74 mm, 97% |
| 60 mm | 55 mm, 95% | 56 mm, 89% | 55 mm, 89% (6/8 settled) |

With a tray the scatter is capped whatever the roll does, so the dice appear at a constant size and the camera never moves. A radius of about `die × (5 + 0.8√n)` — 109 mm for five 16 mm dice, 137 mm for twenty — settles every trial in roughly a second at 96–100% seated. (The floor started at four, which this sweep supported because it began at five dice. A later sweep including a *single* die raised it: on its own, a die rattles between closer walls and finishes leaning about a fifth of the time.) Tighter than five die-widths and the roll crowds: settling stretches past four seconds, and around one die in ten ends up leaning on a wall or a neighbour. Such a die still carries an exact recorded face; it is just harder to read.

## What the simulation costs

| Dice | Wall clock | Animation | Trajectory |
| --- | --- | --- | --- |
| 1 | 4 ms | 0.64 s | 6 kB |
| 5 | 8 ms | 0.69 s | 25 kB |
| 10 | 14 ms | 0.93 s | 77 kB |
| 20 | 24 ms | 1.14 s | 162 kB |
| 40 | 44 ms | 1.52 s | 438 kB |

The wall-clock column is the wait before anything can move: under one 60 Hz frame up to about ten dice. The animation column is how long the roll takes to watch, which is not a cost.

## Known wrinkle in the source geometry

Five of the d10's ten kite faces list their vertices out of cyclic order. Nothing depends on it today — the renderer stopped triangulating these rings when the procedural dice were retired — and the d10 settles fine because cannon rebuilds its own normals. A presenter that hands these rings to a physics engine should normalize them first.
