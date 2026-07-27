/**
 * Every file in this package, resolved to a URL.
 *
 * Each entry is a literal `new URL("...", import.meta.url)`, the pattern Vite,
 * webpack and Rollup recognise: they emit the file into the build output and
 * rewrite the URL to point at it. Without a bundler the expressions still
 * work — they resolve to `file:` URLs next to this module.
 *
 * The list is written out rather than looped because a bundler can only follow
 * static paths. `index.test.ts` compares it against the files on disk, so a
 * die or colour added to the pipeline cannot silently go missing here.
 */

import type { ForgeColor, ForgeColorTextures, ForgeShape } from "./types.js";

/** Die models, shared by every colour. */
export const FORGE_MODEL_URLS: Readonly<Record<ForgeShape, string>> = {
  4: new URL("../forge/d4.glb", import.meta.url).href,
  6: new URL("../forge/d6.glb", import.meta.url).href,
  8: new URL("../forge/d8.glb", import.meta.url).href,
  10: new URL("../forge/d10.glb", import.meta.url).href,
  12: new URL("../forge/d12.glb", import.meta.url).href,
  20: new URL("../forge/d20.glb", import.meta.url).href,
};

/**
 * The generator's manifest: face count, UV atlas and rotation table per shape.
 * The renderer compiles its own copy of the rotations, so this is for tooling
 * and for adapters that have to derive their own orientation tables.
 */
export const FORGE_FACE_ROTATIONS_URL = new URL("../forge/face-rotations.json", import.meta.url)
  .href;

/** The two-faced coin model. */
export const FORGE_COIN_URL = new URL("../forge/coin.glb", import.meta.url).href;

/** Texture atlases per colour. */
export const FORGE_TEXTURE_URLS: Readonly<Record<ForgeColor, ForgeColorTextures>> = {
  ivory: {
    dice: {
      4: new URL("../forge/textures/ivory/d4.png", import.meta.url).href,
      6: new URL("../forge/textures/ivory/d6.png", import.meta.url).href,
      8: new URL("../forge/textures/ivory/d8.png", import.meta.url).href,
      10: new URL("../forge/textures/ivory/d10.png", import.meta.url).href,
      12: new URL("../forge/textures/ivory/d12.png", import.meta.url).href,
      20: new URL("../forge/textures/ivory/d20.png", import.meta.url).href,
    },
    tens: new URL("../forge/textures/ivory/d10_tens.png", import.meta.url).href,
    coin: {
      heads: new URL("../forge/textures/ivory/coin_heads.png", import.meta.url).href,
      tails: new URL("../forge/textures/ivory/coin_tails.png", import.meta.url).href,
      rim: new URL("../forge/textures/ivory/coin_rim.png", import.meta.url).href,
    },
  },
  red: {
    dice: {
      4: new URL("../forge/textures/red/d4.png", import.meta.url).href,
      6: new URL("../forge/textures/red/d6.png", import.meta.url).href,
      8: new URL("../forge/textures/red/d8.png", import.meta.url).href,
      10: new URL("../forge/textures/red/d10.png", import.meta.url).href,
      12: new URL("../forge/textures/red/d12.png", import.meta.url).href,
      20: new URL("../forge/textures/red/d20.png", import.meta.url).href,
    },
    tens: new URL("../forge/textures/red/d10_tens.png", import.meta.url).href,
    coin: {
      heads: new URL("../forge/textures/red/coin_heads.png", import.meta.url).href,
      tails: new URL("../forge/textures/red/coin_tails.png", import.meta.url).href,
      rim: new URL("../forge/textures/red/coin_rim.png", import.meta.url).href,
    },
  },
  blue: {
    dice: {
      4: new URL("../forge/textures/blue/d4.png", import.meta.url).href,
      6: new URL("../forge/textures/blue/d6.png", import.meta.url).href,
      8: new URL("../forge/textures/blue/d8.png", import.meta.url).href,
      10: new URL("../forge/textures/blue/d10.png", import.meta.url).href,
      12: new URL("../forge/textures/blue/d12.png", import.meta.url).href,
      20: new URL("../forge/textures/blue/d20.png", import.meta.url).href,
    },
    tens: new URL("../forge/textures/blue/d10_tens.png", import.meta.url).href,
    coin: {
      heads: new URL("../forge/textures/blue/coin_heads.png", import.meta.url).href,
      tails: new URL("../forge/textures/blue/coin_tails.png", import.meta.url).href,
      rim: new URL("../forge/textures/blue/coin_rim.png", import.meta.url).href,
    },
  },
  green: {
    dice: {
      4: new URL("../forge/textures/green/d4.png", import.meta.url).href,
      6: new URL("../forge/textures/green/d6.png", import.meta.url).href,
      8: new URL("../forge/textures/green/d8.png", import.meta.url).href,
      10: new URL("../forge/textures/green/d10.png", import.meta.url).href,
      12: new URL("../forge/textures/green/d12.png", import.meta.url).href,
      20: new URL("../forge/textures/green/d20.png", import.meta.url).href,
    },
    tens: new URL("../forge/textures/green/d10_tens.png", import.meta.url).href,
    coin: {
      heads: new URL("../forge/textures/green/coin_heads.png", import.meta.url).href,
      tails: new URL("../forge/textures/green/coin_tails.png", import.meta.url).href,
      rim: new URL("../forge/textures/green/coin_rim.png", import.meta.url).href,
    },
  },
  yellow: {
    dice: {
      4: new URL("../forge/textures/yellow/d4.png", import.meta.url).href,
      6: new URL("../forge/textures/yellow/d6.png", import.meta.url).href,
      8: new URL("../forge/textures/yellow/d8.png", import.meta.url).href,
      10: new URL("../forge/textures/yellow/d10.png", import.meta.url).href,
      12: new URL("../forge/textures/yellow/d12.png", import.meta.url).href,
      20: new URL("../forge/textures/yellow/d20.png", import.meta.url).href,
    },
    tens: new URL("../forge/textures/yellow/d10_tens.png", import.meta.url).href,
    coin: {
      heads: new URL("../forge/textures/yellow/coin_heads.png", import.meta.url).href,
      tails: new URL("../forge/textures/yellow/coin_tails.png", import.meta.url).href,
      rim: new URL("../forge/textures/yellow/coin_rim.png", import.meta.url).href,
    },
  },
};
