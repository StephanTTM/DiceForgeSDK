export { formatEventAnnouncement } from "./announce.js";
// The pieces a second 3D presenter needs, rather than a copy of them: the die
// solids for a physics collider, the model loader and texturing, and the rule
// that turns a resolved roll into dice on a table (ADR-0018).
export type { VisualDie } from "./backend.js";
export { visualDiceForEvent } from "./backend.js";
export type {
  MotionMode,
  MotionPreference,
  RenderMode,
  RenderModePreference,
} from "./capabilities.js";
export {
  detectWebGL,
  prefersReducedMotion,
  resolveMotion,
  resolveRenderMode,
} from "./capabilities.js";
export { FORGE_COIN_ROTATIONS, FORGE_FACE_ROTATIONS } from "./forge-rotations.js";
export type { PolyhedronData, ShapedDieSides, Vec3 } from "./math/geometry.js";
export { DIE_SIZE, dieGeometry } from "./math/geometry.js";
export type { DicePresenter, DicePresenterOptions } from "./presenter.js";
export { createDicePresenter } from "./presenter.js";
export type {
  CoinModel,
  DiceTheme,
  DieModelSet,
  ForgeAssetUrls,
  ForgeColor,
  ForgeThemeOptions,
  QuaternionTuple,
} from "./theme.js";
export { FORGE_COLORS, forgeTheme, hasCalibratedModel } from "./theme.js";
export {
  applyTexture,
  instantiateDieModel,
  loadDieModel,
  loadThemeTexture,
  modelSilhouetteScale,
} from "./webgl/models.js";
