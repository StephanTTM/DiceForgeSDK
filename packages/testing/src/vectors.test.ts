import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The conformance vectors are the reproducibility contract as data: every
 * engine-adapter port is held to them bit for bit (ADR-0021). A vector file
 * that drifted from the core would hold ports to the wrong numbers, so the
 * committed copy must always match what the generator produces today.
 *
 * A mismatch here means one of two things. The core's behaviour changed — a
 * breaking change under ADR-0005, needing a superseding ADR, a version bump in
 * the vectors, and every port re-verified. Or the generator changed — rerun
 * `node tools/conformance/export-vectors.mjs` and commit the file it writes.
 */
describe("conformance vectors", () => {
  it("match what the core produces today", () => {
    const generator = fileURLToPath(
      new URL("../../../tools/conformance/export-vectors.mjs", import.meta.url),
    );
    const fresh = execFileSync(process.execPath, [generator, "--stdout"], { encoding: "utf8" });
    const committed = readFileSync(
      fileURLToPath(new URL("../vectors/core-vectors.json", import.meta.url)),
      "utf8",
    );
    expect(JSON.parse(committed)).toEqual(JSON.parse(fresh));
  });
});
