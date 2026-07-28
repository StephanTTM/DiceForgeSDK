/**
 * Physics motion for DiceForge dice.
 *
 * The engine resolves a roll before any of this runs. A simulation cannot be
 * allowed to choose the face, and an animation that corrected itself at the
 * end would be visible, so instead each die's mesh is rotated *inside* its
 * collider by a symmetry of the solid — placing the recorded face wherever the
 * simulation happened to land. The collider is unchanged by a symmetry, so the
 * physics never notices and nothing is corrected on screen (ADR-0018).
 *
 * ```ts
 * const roll = engine.roll("4d6");
 * const motion = simulateRoll(
 *   roll.groups.flatMap((g) => g.dice.map((d) => ({ shape: d.sides, face: d.value }))),
 *   { dieRadius: 1.05 },
 * );
 * // Apply motion.dice[i].remap to each die's mesh once, then play the frames.
 * ```
 *
 * The whole trajectory is computed up front — a few milliseconds — so playback
 * is ordinary animation with no physics running on screen.
 */

export type { Knock, KnockPlayback, KnockPlayer } from "./audio.js";
export { createKnockPlayer, impactSchedule } from "./audio.js";
export type { PhysicsPresenter, PhysicsPresenterOptions } from "./playback.js";
export { createPhysicsPresenter } from "./playback.js";
export type {
  PhysicsCoin,
  PhysicsCoinRequest,
  PhysicsDie,
  PhysicsDieRequest,
  PhysicsFlip,
  PhysicsFrame,
  PhysicsImpact,
  PhysicsRoll,
  SimulateOptions,
} from "./simulate.js";
export { simulateCoinFlip, simulateRoll } from "./simulate.js";
export { faceDirections, solidFromFaceDirections } from "./solid.js";
export type { QuaternionTuple } from "./symmetry.js";
export { faceNormals, multiply, rotate, symmetryTable } from "./symmetry.js";
