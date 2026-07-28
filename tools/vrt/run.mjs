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
 * they are generated inside a pinned Playwright container and the environment
 * that drew them is recorded alongside. A run from anywhere else is advisory:
 * it still reports what changed, but it cannot tell a regression from a
 * different Chromium's anti-aliasing, so it does not fail the build.
 * `npm run vrt:docker` puts you in the same container CI uses.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { createServer } from "vite";
import {
  assertImage,
  currentEnvironment,
  describeEnvironment,
  sameEnvironment,
} from "./environment.mjs";
import { scenes, sceneUrl } from "./scenes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const BASELINES = join(HERE, "baselines");
const OUTPUT = join(HERE, "output");
const ENVIRONMENT = join(BASELINES, "environment.json");

/** Fraction of pixels allowed to differ before a scene counts as changed. */
const TOLERANCE = 0.001;
/** Per-pixel colour distance below which a difference is ignored. */
const PIXEL_THRESHOLD = 0.12;

const update = process.argv.includes("--update");
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);

assertImage();

const environment = currentEnvironment();
const recorded = existsSync(ENVIRONMENT)
  ? JSON.parse(await readFile(ENVIRONMENT, "utf8"))
  : undefined;
/**
 * Whether this run can be trusted to fail the build. Only a run from the same
 * environment the baselines came from is comparing like with like.
 */
const authoritative = update || !recorded || sameEnvironment(recorded, environment);

if (!authoritative) {
  console.log(`Baselines were drawn in ${describeEnvironment(recorded)}.`);
  console.log(`This run is ${describeEnvironment(environment)}, so differences below may be`);
  console.log("anti-aliasing rather than regressions, and will not fail the build.");
  console.log("Compare in the environment CI uses with: npm run vrt:docker\n");
}

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
    if (update) {
      await writeFile(baselinePath, actual);
      wrote.push(scene.name);
      console.log(`  ${hadBaseline ? "updated" : "created"}  ${scene.name}`);
      continue;
    }
    // A missing baseline used to be created on any run, which left two holes:
    // CI silently passed a scene nobody had drawn yet, and a bare local run
    // minted a host-drawn PNG that CI would then reject. Creation now requires
    // --update, so a new scene fails until its baseline is drawn deliberately.
    if (!hadBaseline) {
      failures.push({ ...scene, reason: "no baseline" });
      console.log(`  MISSING   ${scene.name} — no baseline committed`);
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

// Record what drew these, so a later run from somewhere else can say so rather
// than reporting a browser difference as a regression.
if (update) {
  await writeFile(ENVIRONMENT, `${JSON.stringify(environment, null, 2)}\n`);
  if (!environment.image) {
    console.log(`\nThese baselines were drawn on ${environment.platform}, not in the container.`);
    console.log("CI compares in the container and will reject them — regenerate with:");
    console.log("  npm run vrt:docker -- --update");
  }
}

// A baseline with no scene is a leftover from a renamed or deleted scene.
const known = new Set(scenes.map((scene) => `${scene.name}.png`));
known.add("environment.json");
const orphans = (await readdir(BASELINES)).filter((file) => !known.has(file));
if (orphans.length) console.log(`\nUnused baselines: ${orphans.join(", ")}`);

if (failures.length) {
  console.log(`\n${failures.length} scene(s) changed. Wrote actual and diff images to:`);
  console.log(`  ${OUTPUT}`);
  for (const failure of failures) console.log(`  - ${failure.name}: ${failure.why}`);
  if (authoritative) {
    console.log("\nIf the change is intended, rerun with: npm run vrt:docker -- --update");
    process.exit(1);
  }
  // Comparing against baselines from a different browser build. Say what was
  // seen, but do not claim it means anything — see the banner above.
  console.log("\nNot failing: this run cannot tell a regression from a browser difference.");
} else {
  console.log(
    wrote.length ? `\n${wrote.length} baseline(s) written.` : "\nNo visual changes detected.",
  );
}
