import { FORGE_COIN_ROTATIONS, FORGE_FACE_ROTATIONS } from "./forge-rotations.js";
import type { ShapedDieSides } from "./math/geometry.js";

/** Quaternion as [x, y, z, w]. */
export type QuaternionTuple = readonly [number, number, number, number];

/**
 * Optional 3D model set for a theme. Models are loaded lazily at presentation
 * time from URLs; no art is bundled into this package, whichever theme you use
 * (`@diceforge-sdk/assets-forge` carries the first-party set). A shape without
 * a model —
 * or without a complete face-rotation table — is not drawn in 3D at all, so a
 * model can never imply a face the core did not resolve.
 */
export type DieModelSet = {
  /** glTF URL per die shape. */
  readonly urls: Partial<Record<ShapedDieSides, string>>;
  /**
   * Optional texture atlas per shape, applied to the loaded model's materials.
   * Lets one model serve every colour variant instead of shipping a model per
   * colour. A texture that fails to load leaves the model's own material alone.
   */
  readonly textureUrls?: Partial<Record<ShapedDieSides, string>>;
  /**
   * Texture for the tens half of a percentile pair, which reads 00-90 rather
   * than 0-9. Without one, both dice of a d100 use the plain d10 atlas.
   */
  readonly tensTextureUrl?: string;
  /**
   * Calibrated orientation table per shape: `faceRotations[shape][value - 1]`
   * rotates the normalized model so that face value points up (+Y). A model
   * is used only when its shape's table has exactly `shape` entries.
   */
  readonly faceRotations: Partial<Record<ShapedDieSides, readonly QuaternionTuple[]>>;
};

/** Optional 3D coin, whose two faces are textured independently. */
export type CoinModel = {
  readonly url: string;
  readonly textures?: {
    readonly heads?: string;
    readonly tails?: string;
    readonly rim?: string;
  };
  /** Heads first, then tails. */
  readonly rotations: readonly [QuaternionTuple, QuaternionTuple];
};

export type DiceTheme = {
  readonly name: string;
  /** Colors for the DOM fallback and for demo chrome. */
  readonly colors: { readonly die: string; readonly label: string };
  readonly models?: DieModelSet;
  readonly coin?: CoinModel;
};

/** True when `shape` may be presented with a theme model (URL + full table). */
export function hasCalibratedModel(
  models: DieModelSet | undefined,
  shape: ShapedDieSides,
): models is DieModelSet {
  return Boolean(models?.urls[shape] && models.faceRotations[shape]?.length === shape);
}

/** Colour variants of the first-party DiceForge die set (`@diceforge-sdk/assets-forge`). */
export type ForgeColor = "ivory" | "red" | "blue" | "green" | "yellow";

export const FORGE_COLORS: readonly ForgeColor[] = ["ivory", "red", "blue", "green", "yellow"];

const FORGE_ACCENTS: Record<ForgeColor, { die: string; label: string }> = {
  ivory: { die: "#ece9df", label: "#20222a" },
  red: { die: "#a63c3c", label: "#f7ecec" },
  blue: { die: "#3c5aa6", label: "#ecf0f6" },
  green: { die: "#3c7a4c", label: "#ecf4ee" },
  yellow: { die: "#b9862e", label: "#faf4e8" },
};

const FORGE_SHAPES: readonly ShapedDieSides[] = [4, 6, 8, 10, 12, 20];

/**
 * Every file a forge theme needs, already resolved to URLs.
 *
 * `forgeAssets()` in `@diceforge-sdk/assets-forge` returns this shape, so an
 * application that installs the die set never spells a path out. The type is
 * matched structurally rather than imported: the renderer does not depend on
 * the asset package, and art is still never bundled into this one (ADR-0013).
 */
export type ForgeAssetUrls = {
  readonly dice: Readonly<Record<ShapedDieSides, string>>;
  readonly diceTextures: Readonly<Record<ShapedDieSides, string>>;
  /** Tens half of a percentile pair, which reads 00-90 rather than 0-9. */
  readonly tensTexture: string;
  readonly coin: string;
  readonly coinTextures: {
    readonly heads: string;
    readonly tails: string;
    readonly rim: string;
  };
};

/**
 * Where the art comes from: URLs resolved by the asset package, or a directory
 * the application serves itself. `color` selects the texture atlas in the
 * `baseUrl` form, and the 2D fallback tile colours in both.
 */
export type ForgeThemeOptions =
  | { readonly baseUrl: string; readonly color?: ForgeColor }
  | { readonly urls: ForgeAssetUrls; readonly color?: ForgeColor };

/** Lay out the published `forge/` directory under a base URL. */
function urlsFromBase(baseUrl: string, color: ForgeColor): ForgeAssetUrls {
  const base = baseUrl.replace(/\/+$/, "");
  const textures = `${base}/textures/${color}`;
  const dice = {} as Record<ShapedDieSides, string>;
  const diceTextures = {} as Record<ShapedDieSides, string>;
  for (const shape of FORGE_SHAPES) {
    dice[shape] = `${base}/d${shape}.glb`;
    diceTextures[shape] = `${textures}/d${shape}.png`;
  }
  return {
    dice,
    diceTextures,
    tensTexture: `${textures}/d10_tens.png`,
    coin: `${base}/coin.glb`,
    coinTextures: {
      heads: `${textures}/coin_heads.png`,
      tails: `${textures}/coin_tails.png`,
      rim: `${textures}/coin_rim.png`,
    },
  };
}

/**
 * The first-party die set: every shape the SDK resolves, including the d10 and
 * d12 no third-party pack here provides. Models are generated by
 * `tools/blender/build_dice.py` and their rotation tables are exact by
 * construction rather than calibrated (ADR-0011).
 *
 * ```ts
 * // Installed from npm — the bundler emits the files (ADR-0013):
 * forgeTheme(forgeAssets({ color: "red" }));
 *
 * // Or served by the application itself:
 * forgeTheme({ baseUrl: "/dice-assets", color: "red" });
 * ```
 */
export function forgeTheme(options: ForgeThemeOptions): DiceTheme {
  const color = options.color ?? "ivory";
  const urls = "urls" in options ? options.urls : urlsFromBase(options.baseUrl, color);
  return {
    name: `forge-${color}`,
    colors: FORGE_ACCENTS[color],
    models: {
      urls: urls.dice,
      textureUrls: urls.diceTextures,
      tensTextureUrl: urls.tensTexture,
      faceRotations: FORGE_FACE_ROTATIONS,
    },
    coin: {
      url: urls.coin,
      textures: urls.coinTextures,
      rotations: FORGE_COIN_ROTATIONS,
    },
  };
}
