/**
 * Where a baseline is allowed to come from.
 *
 * Rendering is deterministic for a given browser build and driver, not across
 * them: the same scene drawn by another Chromium differs in a few pixels of
 * anti-aliasing. A committed PNG therefore only means something next to the
 * environment that drew it, and that environment is the pinned Playwright
 * container — CI runs inside it, and `npm run vrt:docker` puts contributors in
 * the same one.
 *
 * The image tag is derived from the installed Playwright rather than written
 * down twice, because the image ships the browser build that version expects.
 * The one place it *is* written down twice is the workflow file, which cannot
 * run JavaScript to work it out; `assertImage` closes that loop.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** The Playwright actually installed. Pinned exactly in package.json. */
export const playwrightVersion = require("playwright/package.json").version;

/** Ubuntu 24.04 LTS, matched to the installed Playwright. */
export const image = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;

/**
 * What is drawing right now.
 *
 * `VRT_IMAGE` is set by the container — by `vrt:docker` and by the CI job — so
 * an unset value means this is a bare host, however Linux-shaped it looks.
 */
export function currentEnvironment() {
  return {
    image: process.env.VRT_IMAGE ?? null,
    playwright: playwrightVersion,
    platform: process.platform,
  };
}

export function sameEnvironment(a, b) {
  return a.image === b.image && a.playwright === b.playwright && a.platform === b.platform;
}

export function describeEnvironment(env) {
  return `${env.image ?? `${env.platform} (no container)`}, playwright ${env.playwright}`;
}

/**
 * Fails when the workflow's hard-coded image no longer matches the installed
 * Playwright — which is what a version bump that forgot the workflow looks
 * like, and would otherwise show up as every scene mysteriously differing.
 */
export function assertImage() {
  const declared = process.env.VRT_IMAGE;
  if (declared && declared !== image) {
    console.error(
      `The container is ${declared} but the installed Playwright is ${playwrightVersion}, which wants ${image}.\n` +
        "Update the image in .github/workflows/ so the browser matches the driver.",
    );
    process.exit(1);
  }
}
