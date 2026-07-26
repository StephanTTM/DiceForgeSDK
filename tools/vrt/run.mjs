/**
 * Visual regression suite for the renderer.
 *
 *   npm run vrt          check every scene against its baseline
 *   npm run vrt:update   accept the current output as the new baseline
 *
 * Each scene renders a fixed seed through the real presenter and compares the
 * frame to a committed PNG. Reduced motion makes the presenter draw
 * synchronously, so the captured frame is the settled result rather than
 * whatever the animation happened to be showing.
 *
 * Baselines are tied to the renderer *and* to the browser that drew them, so
 * they are generated with the bundled headless Chromium rather than a system
 * browser. Regenerate them on the same platform when the renderer changes on
 * purpose; a diff you did not intend is a regression.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { createServer } from "vite";
import { scenes, sceneUrl } from "./scenes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const BASELINES = join(HERE, "baselines");
const OUTPUT = join(HERE, "output");

/** Fraction of pixels allowed to differ before a scene counts as changed. */
const TOLERANCE = 0.001;
/** Per-pixel colour distance below which a difference is ignored. */
const PIXEL_THRESHOLD = 0.12;

const update = process.argv.includes("--update");
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);

async function capture(page, scene) {
  await page.goto(`http://localhost:${port}${sceneUrl(scene)}`, { waitUntil: "load" });
  // The page publishes its result when the presenter has finished drawing, so
  // there is no timing guess here.
  const result = await page.waitForFunction(() => window.__diceforge, null, { timeout: 30_000 });
  const { dataUrl } = await result.jsonValue();
  if (dataUrl) {
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  }
  // The DOM fallback draws no canvas, so screenshot the element instead.
  return page.locator("#out").screenshot();
}

function compare(baseline, actual) {
  const a = PNG.sync.read(baseline);
  const b = PNG.sync.read(actual);
  if (a.width !== b.width || a.height !== b.height) {
    return { changed: true, reason: `size ${a.width}x${a.height} -> ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const differing = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: PIXEL_THRESHOLD,
  });
  const fraction = differing / (a.width * a.height);
  return {
    changed: fraction > TOLERANCE,
    reason: `${differing} px differ (${(fraction * 100).toFixed(3)}%)`,
    diff: PNG.sync.write(diff),
  };
}

const server = await createServer({
  root: join(REPO, "examples", "web-demo"),
  logLevel: "error",
  server: { port: 0 },
});
await server.listen();
const port = server.config.server.port ?? server.httpServer.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const failures = [];
const wrote = [];

await mkdir(BASELINES, { recursive: true });
await rm(OUTPUT, { recursive: true, force: true });

try {
  for (const scene of scenes) {
    if (only && !scene.name.includes(only)) continue;
    const actual = await capture(page, scene);
    const baselinePath = join(BASELINES, `${scene.name}.png`);

    const hadBaseline = existsSync(baselinePath);
    if (update || !hadBaseline) {
      await writeFile(baselinePath, actual);
      wrote.push(scene.name);
      console.log(`  ${hadBaseline ? "updated" : "created"}  ${scene.name}`);
      continue;
    }

    const result = compare(await readFile(baselinePath), actual);
    if (result.changed) {
      await mkdir(OUTPUT, { recursive: true });
      await writeFile(join(OUTPUT, `${scene.name}.actual.png`), actual);
      if (result.diff) await writeFile(join(OUTPUT, `${scene.name}.diff.png`), result.diff);
      failures.push({ ...scene, reason: result.reason });
      console.log(`  CHANGED   ${scene.name} — ${result.reason}`);
    } else {
      console.log(`  ok        ${scene.name} — ${result.reason}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

// A baseline with no scene is a leftover from a renamed or deleted scene.
const known = new Set(scenes.map((scene) => `${scene.name}.png`));
const orphans = (await readdir(BASELINES)).filter((file) => !known.has(file));
if (orphans.length) console.log(`\nUnused baselines: ${orphans.join(", ")}`);

if (failures.length) {
  console.log(`\n${failures.length} scene(s) changed. Wrote actual and diff images to:`);
  console.log(`  ${OUTPUT}`);
  for (const failure of failures) console.log(`  - ${failure.name}: ${failure.why}`);
  console.log("\nIf the change is intended, rerun with: npm run vrt:update");
  process.exit(1);
}

console.log(
  wrote.length ? `\n${wrote.length} baseline(s) written.` : "\nNo visual changes detected.",
);
