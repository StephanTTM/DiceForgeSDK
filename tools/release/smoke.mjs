/**
 * Installs the packed tarballs into a throwaway project and uses them.
 *
 *   npm run smoke
 *
 * The unit tests run against workspace source, which is not what anyone
 * installs. This packs what `npm publish` would upload, installs it the way a
 * consumer does, and exercises it — so a broken `exports` map, a file missing
 * from `files`, a dependency that should have been a peer, or type
 * declarations that do not resolve are caught here rather than by whoever
 * installs first. A first publish cannot be taken back, which is what makes
 * this worth running before one.
 */

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGES = ["core", "renderer-web", "assets-forge", "testing", "presenter-physics"];

/** Runs inside the throwaway project, resolving only the installed packages. */
const CONSUMER = `
import { createDiceEngine, createSeededRandomSource, presentationSupport } from "@diceforge-sdk/core";
import { faceDirections, simulateCoinFlip, simulateRoll, multiply, rotate } from "@diceforge-sdk/presenter-physics";
import { FORGE_COIN_ROTATIONS, FORGE_FACE_ROTATIONS, formatEventAnnouncement } from "@diceforge-sdk/renderer-web";
import { forgeAssets, FORGE_SHAPES } from "@diceforge-sdk/assets-forge";
import { assertPresenterConformance } from "@diceforge-sdk/testing";

let failures = 0;
const ok = (label, condition) => {
  console.log(\`  \${condition ? "ok  " : "FAIL"} \${label}\`);
  if (!condition) failures++;
};

const engine = createDiceEngine({ random: createSeededRandomSource("smoke") });
const record = engine.roll("2d20kh1+3");
ok("core resolves a roll", record.kind === "roll" && typeof record.total === "number");
ok("announcements format", formatEventAnnouncement(record).includes("Rolled"));
ok("assets resolve to real files", Object.keys(forgeAssets({ color: "blue" }).urls.dice).length === FORGE_SHAPES.length);
ok("conformance kit is callable", typeof assertPresenterConformance === "function");
ok("capability check is pure", presentationSupport(
  { implementation: "smoke", kinds: ["roll"], dieSides: "any", media: ["none"], cancellable: false, announces: false, honorsReducedMotion: false },
  record,
).supported === true);

// The whole point of the physics package: the numeral that was rolled is the
// numeral that ends up on top. Checked through the installed build.
let wrong = 0;
for (const shape of FORGE_SHAPES) {
  const table = FORGE_FACE_ROTATIONS[shape];
  const dirs = faceDirections(table);
  for (let face = 1; face <= shape; face++) {
    const roll = simulateRoll([{ shape, face, faceRotations: table }], { dieRadius: 1.05 });
    const die = roll.dice[0];
    const drawn = multiply(die.frames.at(-1).orientation, die.remap);
    const heights = dirs.map((d) => rotate(d, drawn)[1]);
    if (heights.indexOf(Math.max(...heights)) + 1 !== face) wrong++;
  }
}
ok(\`physics shows the rolled numeral on all \${FORGE_SHAPES.reduce((a, b) => a + b, 0)} faces\`, wrong === 0);

// And the coin: both outcomes, through the installed build.
let coinWrong = 0;
for (const outcome of ["heads", "tails"]) {
  const flip = simulateCoinFlip(
    { outcome, rotations: FORGE_COIN_ROTATIONS, radius: 1.0346, thickness: 0.231 },
    { dieRadius: 1.05 },
  );
  const drawn = multiply(flip.coin.frames.at(-1).orientation, flip.coin.remap);
  const q = FORGE_COIN_ROTATIONS[outcome === "heads" ? 0 : 1];
  const up = rotate(rotate([0, 1, 0], [-q[0], -q[1], -q[2], q[3]]), drawn)[1];
  if (up < 0.999) coinWrong++;
}
ok("physics lands the coin on the recorded outcome", coinWrong === 0);

process.exitCode = failures === 0 ? 0 : 1;
`;

/** A TypeScript consumer, to prove the published .d.ts resolve under strict. */
const CONSUMER_TYPES = `
import type { InteractionEvent, InteractionPresenter } from "@diceforge-sdk/core";
import { createDiceEngine } from "@diceforge-sdk/core";
import type { PhysicsRoll } from "@diceforge-sdk/presenter-physics";
import { simulateRoll } from "@diceforge-sdk/presenter-physics";
import type { DicePresenter, DiceTheme } from "@diceforge-sdk/renderer-web";
import { createDicePresenter, FORGE_FACE_ROTATIONS, forgeTheme } from "@diceforge-sdk/renderer-web";
import { forgeAssets } from "@diceforge-sdk/assets-forge";

const event: InteractionEvent = createDiceEngine().roll("2d20kh1");
const theme: DiceTheme = forgeTheme(forgeAssets({ color: "red" }));
const motion: PhysicsRoll = simulateRoll(
  [{ shape: 20, face: 7, faceRotations: FORGE_FACE_ROTATIONS[20] ?? [] }],
  { dieRadius: 1.05 },
);
declare const host: HTMLElement;
const web: DicePresenter = createDicePresenter({ container: host, theme });
// The portable contract is what an application should depend on.
const presenters: InteractionPresenter[] = [web];
export const check = (): boolean => motion.settled && presenters.length > 0 && event.kind === "roll";
`;

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    module: "nodenext",
    moduleResolution: "nodenext",
    target: "es2022",
    lib: ["es2022", "dom"],
    noEmit: true,
    // Skipped deliberately. Turning it off makes tsc validate the whole of
    // three's declarations, which takes minutes and is not this script's
    // business — a tool nobody runs because it is slow catches nothing. What
    // matters here still holds: the published .d.ts have to resolve, and a
    // realistic consumer has to typecheck against them under strict.
    skipLibCheck: true,
  },
  files: ["types.ts"],
};

/**
 * npm and npx are batch files on Windows, so this needs a shell. Node deprecates
 * passing an argument array alongside `shell`, so the command is assembled here
 * instead — every argument is ours, and any containing whitespace is quoted.
 */
const run = (command, args, cwd) => {
  // Quote anything that is not plainly safe in both cmd and sh. The first CI
  // run of this script proved why an allowlist beats a denylist: an argument
  // with parentheses and no whitespace went to /bin/sh unquoted, and Windows
  // had never minded.
  const line = args
    .map((arg) => (/^[\w./\\:@=-]+$/.test(arg) ? arg : JSON.stringify(arg)))
    .join(" ");
  return execSync(`${command} ${line}`, { cwd, encoding: "utf8" });
};

const work = mkdtempSync(join(tmpdir(), "diceforge-smoke-"));
let failed = false;

try {
  console.log("packing what npm publish would upload…");
  run("npm", ["pack", "--workspaces", "--silent", "--pack-destination", work], REPO);

  const tarballs = PACKAGES.map((name) => {
    const manifest = JSON.parse(readFileSync(join(REPO, "packages", name, "package.json"), "utf8"));
    return join(work, `diceforge-sdk-${name}-${manifest.version}.tgz`);
  });

  writeFileSync(
    join(work, "package.json"),
    `${JSON.stringify({ name: "smoke", private: true, type: "module", version: "0.0.0" }, null, 2)}\n`,
  );

  console.log("installing them the way a consumer does…");
  run("npm", ["install", "--no-audit", "--no-fund", "--silent", ...tarballs], work);

  console.log("using the installed packages:");
  writeFileSync(join(work, "smoke.mjs"), CONSUMER);
  process.stdout.write(run("node", ["smoke.mjs"], work));

  console.log("type-checking a consumer against the published declarations:");
  writeFileSync(join(work, "types.ts"), CONSUMER_TYPES);
  writeFileSync(join(work, "tsconfig.json"), `${JSON.stringify(TSCONFIG, null, 2)}\n`);
  // three's types come in as a peer of the physics package.
  run(
    "npm",
    ["install", "--no-audit", "--no-fund", "--no-save", "--silent", "typescript", "@types/three"],
    work,
  );
  run("npx", ["tsc", "-p", "tsconfig.json"], work);
  console.log("  ok   published .d.ts resolve and typecheck under strict");
} catch (error) {
  failed = true;
  const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
  console.error(output || error.message);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failed) {
  console.error("\nsmoke test FAILED — do not publish");
  process.exit(1);
}
console.log("\nsmoke test passed — the tarballs work as installed");
