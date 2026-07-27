/**
 * Shapes and colours of the first-party DiceForge die set.
 *
 * These mirror `ShapedDieSides` and `ForgeColor` in `@diceforge-sdk/renderer-web`
 * rather than importing them: this package is plain data and must not depend on
 * a renderer to be installed. `index.test.ts` checks the two stay compatible.
 */

/** Die shapes the set covers — every shape the core resolves. */
export type ForgeShape = 4 | 6 | 8 | 10 | 12 | 20;

/** Colour variants the set is generated in. */
export type ForgeColor = "ivory" | "red" | "blue" | "green" | "yellow";

/** Texture URLs for one colour of the set. */
export type ForgeColorTextures = {
  readonly dice: Readonly<Record<ForgeShape, string>>;
  readonly tens: string;
  readonly coin: { readonly heads: string; readonly tails: string; readonly rim: string };
};

export const FORGE_SHAPES: readonly ForgeShape[] = [4, 6, 8, 10, 12, 20];

export const FORGE_COLORS: readonly ForgeColor[] = ["ivory", "red", "blue", "green", "yellow"];

/**
 * Every file this package ships, relative to its `forge/` directory. Useful for
 * copy steps, static-serving setups, and service-worker precache lists; the
 * bundler path does not need it.
 */
export const FORGE_ASSET_FILES: readonly string[] = [
  "coin.glb",
  "d10.glb",
  "d12.glb",
  "d20.glb",
  "d4.glb",
  "d6.glb",
  "d8.glb",
  "face-rotations.json",
  ...FORGE_COLORS.flatMap((color) => [
    `textures/${color}/coin_heads.png`,
    `textures/${color}/coin_rim.png`,
    `textures/${color}/coin_tails.png`,
    `textures/${color}/d10.png`,
    `textures/${color}/d10_tens.png`,
    `textures/${color}/d12.png`,
    `textures/${color}/d20.png`,
    `textures/${color}/d4.png`,
    `textures/${color}/d6.png`,
    `textures/${color}/d8.png`,
  ]),
];
