/**
 * Runs the visual regression suite inside the same container CI uses.
 *
 *   npm run vrt:docker              check every scene
 *   npm run vrt:docker -- --update  redraw the baselines
 *
 * Baselines are only comparable against the browser build that drew them, so
 * this is how a contributor on any host produces or checks PNGs that CI will
 * agree with. Needs Docker; without it, push the branch and let CI report.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { image } from "./environment.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Docker wants forward slashes in a bind mount on every host, Windows included.
const mount = REPO.replaceAll("\\", "/");
const passthrough = process.argv.slice(2);

const command = [
  // The host's node_modules is built for the host's platform and its binaries
  // will not run here. An anonymous volume hides it, so the container installs
  // its own and never writes over the one outside.
  "npm ci --no-audit --no-fund",
  `node tools/vrt/run.mjs ${passthrough.join(" ")}`.trim(),
].join(" && ");

console.log(`Running in ${image}\n`);

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    // Chromium exhausts the default 64 MB of shared memory and crashes.
    "--ipc=host",
    "-v",
    `${mount}:/work`,
    "-v",
    "/work/node_modules",
    "-w",
    "/work",
    "-e",
    `VRT_IMAGE=${image}`,
    image,
    "sh",
    "-c",
    command,
  ],
  { stdio: "inherit" },
);

if (result.error?.code === "ENOENT") {
  console.error(
    "Docker is not on PATH. Install Docker to run the suite the way CI does,\n" +
      "or push the branch — the visual regression job reports the same result.",
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
