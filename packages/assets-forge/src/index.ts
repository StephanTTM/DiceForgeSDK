/**
 * The first-party DiceForge die set, installable from npm.
 *
 * The package carries the art itself — d4 through d20, a two-faced coin, and a
 * texture atlas per colour — and hands back the URLs your bundler emitted for
 * them, so a 3D table needs no copying and no static-hosting step:
 *
 * ```ts
 * import { forgeAssets } from "@diceforge-sdk/assets-forge";
 * import { createDicePresenter, forgeTheme } from "@diceforge-sdk/renderer-web";
 *
 * const presenter = createDicePresenter({
 *   container,
 *   theme: forgeTheme(forgeAssets({ color: "red" })),
 * });
 * ```
 *
 * Nothing here decides or alters an outcome: these are file URLs. The engine
 * resolves the roll, and the renderer's animation ends on the face it chose.
 */

import type { ForgeColor, ForgeShape } from "./types.js";
import { FORGE_COIN_URL, FORGE_MODEL_URLS, FORGE_TEXTURE_URLS } from "./urls.js";

export type { ForgeColor, ForgeColorTextures, ForgeShape } from "./types.js";
export { FORGE_ASSET_FILES, FORGE_COLORS, FORGE_SHAPES } from "./types.js";
export {
  FORGE_COIN_URL,
  FORGE_FACE_ROTATIONS_URL,
  FORGE_MODEL_URLS,
  FORGE_TEXTURE_URLS,
} from "./urls.js";

/**
 * Every URL one colour of the set needs. Structurally identical to
 * `ForgeAssetUrls` in `@diceforge-sdk/renderer-web`, which consumes it.
 */
export type ForgeAssetUrls = {
  readonly dice: Readonly<Record<ForgeShape, string>>;
  readonly diceTextures: Readonly<Record<ForgeShape, string>>;
  /** Tens half of a percentile pair, which reads 00-90 rather than 0-9. */
  readonly tensTexture: string;
  readonly coin: string;
  readonly coinTextures: {
    readonly heads: string;
    readonly tails: string;
    readonly rim: string;
  };
};

/** A resolved colour of the set, ready to hand to `forgeTheme()`. */
export type ForgeAssets = {
  readonly color: ForgeColor;
  readonly urls: ForgeAssetUrls;
};

/**
 * Resolve the installed die set in one colour, defaulting to ivory.
 *
 * The result is accepted directly by `forgeTheme()` in
 * `@diceforge-sdk/renderer-web`, which reads `color` for the 2D fallback tiles
 * and `urls` for the models and textures.
 */
export function forgeAssets(options: { color?: ForgeColor } = {}): ForgeAssets {
  const color = options.color ?? "ivory";
  const textures = FORGE_TEXTURE_URLS[color];
  return {
    color,
    urls: {
      dice: FORGE_MODEL_URLS,
      diceTextures: textures.dice,
      tensTexture: textures.tens,
      coin: FORGE_COIN_URL,
      coinTextures: textures.coin,
    },
  };
}
