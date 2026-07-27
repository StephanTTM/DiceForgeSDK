import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ForgeAssetUrls as RendererForgeAssetUrls } from "@diceforge-sdk/renderer-web";
import { FORGE_COLORS as RENDERER_COLORS } from "@diceforge-sdk/renderer-web";
import { describe, expect, it } from "vitest";
import { type ForgeAssets, forgeAssets } from "./index.js";
import { FORGE_ASSET_FILES, FORGE_COLORS, FORGE_SHAPES } from "./types.js";
import { FORGE_COIN_URL, FORGE_MODEL_URLS, FORGE_TEXTURE_URLS } from "./urls.js";

const FORGE_DIR = fileURLToPath(new URL("../forge", import.meta.url));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

/** Every URL the package hands out, flattened. */
function everyUrl(): string[] {
  return [
    ...Object.values(FORGE_MODEL_URLS),
    FORGE_COIN_URL,
    ...FORGE_COLORS.flatMap((color) => {
      const textures = FORGE_TEXTURE_URLS[color];
      return [...Object.values(textures.dice), textures.tens, ...Object.values(textures.coin)];
    }),
  ];
}

describe("shipped files", () => {
  it("lists exactly what is on disk", () => {
    const onDisk = filesUnder(FORGE_DIR)
      .map((file) => relative(FORGE_DIR, file).split("\\").join("/"))
      .sort();
    expect(onDisk).toEqual([...FORGE_ASSET_FILES].sort());
  });

  it("resolves every URL to a file that exists", () => {
    const urls = everyUrl();
    // 6 models + coin + 5 colours x (6 dice + tens + 3 coin faces).
    expect(urls).toHaveLength(57);
    const missing = urls.filter((url) => !existsSync(fileURLToPath(url)));
    expect(missing).toEqual([]);
  });

  it("hands out a distinct URL per file", () => {
    expect(new Set(everyUrl()).size).toBe(everyUrl().length);
  });
});

describe("forgeAssets", () => {
  it("defaults to ivory", () => {
    expect(forgeAssets().color).toBe("ivory");
    expect(forgeAssets().urls.tensTexture).toContain("ivory");
  });

  it("selects the textures of the requested colour", () => {
    for (const color of FORGE_COLORS) {
      const { urls } = forgeAssets({ color });
      const paths = [
        ...Object.values(urls.diceTextures),
        urls.tensTexture,
        ...Object.values(urls.coinTextures),
      ];
      expect(paths.every((path) => path.includes(`/${color}/`))).toBe(true);
    }
  });

  it("covers every shape the core resolves, with one model per shape", () => {
    const { urls } = forgeAssets({ color: "red" });
    expect(
      Object.keys(urls.dice)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([...FORGE_SHAPES]);
    // Models are colour-independent: a theme swaps the atlas, not the mesh.
    expect(urls.dice).toEqual(forgeAssets({ color: "blue" }).urls.dice);
  });
});

describe("compatibility with @diceforge-sdk/renderer-web", () => {
  it("produces a value forgeTheme() accepts", () => {
    // A type error here means the packages have drifted apart: the renderer
    // consumes this shape structurally rather than importing it (ADR-0013).
    const assets: ForgeAssets = forgeAssets({ color: "green" });
    const urls: RendererForgeAssetUrls = assets.urls;
    expect(urls.coin).toBe(FORGE_COIN_URL);
  });

  it("offers the same colours the renderer themes", () => {
    expect([...FORGE_COLORS].sort()).toEqual([...RENDERER_COLORS].sort());
  });
});
