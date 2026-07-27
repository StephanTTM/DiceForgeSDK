export type { DieDefinition, DieFace, DieRegistry } from "./dice/definition.js";
export {
  createDieRegistry,
  defineDie,
  findDie,
  MAX_DIE_FACES,
  MAX_DIE_ID_LENGTH,
  MAX_FACE_LABEL_LENGTH,
  MAX_FACE_VALUE,
} from "./dice/definition.js";
export type { DiceEngine, DiceEngineOptions } from "./engine.js";
export { createDiceEngine } from "./engine.js";
export type { DiceForgeErrorCode } from "./errors.js";
export { DiceForgeError, DiceNotationError } from "./errors.js";
export type {
  DiceExpression,
  DiceGroupNode,
  DiceSelection,
  DieSides,
  ExpressionTerm,
  ModifierNode,
  SelectionMode,
} from "./notation/ast.js";
export { DIE_SIDES, isDieSides, renderGroupNotation } from "./notation/ast.js";
export type { ParseOptions } from "./notation/parser.js";
export {
  MAX_DICE_PER_GROUP,
  MAX_EXPRESSION_LENGTH,
  MAX_MODIFIER,
  MAX_TERMS,
  parseDiceNotation,
} from "./notation/parser.js";
export type {
  AbortSignalLike,
  InteractionKind,
  InteractionPresenter,
  PresentationMedium,
  PresentationOptions,
  PresentationSupport,
  PresentationUnsupportedReason,
  PresenterCapabilities,
} from "./presentation.js";
export { presentationSupport } from "./presentation.js";
export type {
  CoinFlipResult,
  DieOutcome,
  InteractionEvent,
  RollGroupOutcome,
  RollResult,
} from "./records.js";
export { EVENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "./records.js";
export { resolveCoinFlip } from "./resolve/coin.js";
export type { ResolveOptions } from "./resolve/roll.js";
export { resolveRoll } from "./resolve/roll.js";
export { createSeededRandomSource } from "./rng/seeded.js";
export { createSystemRandomSource } from "./rng/system.js";
export type {
  RandomProvenance,
  RandomSource,
  SeededProvenance,
  SystemProvenance,
} from "./rng/types.js";
export { deserializeEvent, serializeEvent, validateEventRecord } from "./serialization.js";
