export { formatEventAnnouncement } from "./announce.js";
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
// The die solids, for presenters that need the shape itself rather than a
// picture of it — a physics collider, for one (ADR-0018).
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
