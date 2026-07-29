/**
 * Assembles the Godot Asset Library bundle: the DiceForge addon and the forge
 * dice in one installable layout.
 *
 *   node tools/godot-bundle/build.mjs          # stage into dist-godot/
 *   node tools/godot-bundle/build.mjs --zip    # and zip it for a release
 *
 * The bundle is what "found it on the Asset Library" installs: unzipping into
 * a project yields `addons/diceforge/` with the dice *inside* it, so the
 * presenter's zero-config path finds them and the first roll needs no setup.
 * Everything is composed from the single sources of truth — addon scripts from
 * `adapters/godot`, dice from `packages/assets-forge` — so nothing in the repo
 * is duplicated to make the bundle possible.
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(REPO, "dist-godot");
const ADDON = join(OUT, "addons", "diceforge");

const version = JSON.parse(
  readFileSync(join(REPO, "packages", "core", "package.json"), "utf8"),
).version;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(ADDON, { recursive: true });

// The addon, with plugin.cfg stamped to the release it was built from.
cpSync(join(REPO, "adapters", "godot", "addons", "diceforge"), ADDON, { recursive: true });
const cfgPath = join(ADDON, "plugin.cfg");
const cfg = readFileSync(cfgPath, "utf8").replace(/version="[^"]*"/, `version="${version}"`);
writeFileSync(cfgPath, cfg);

// The dice, inside the addon where the zero-config presenter looks.
cpSync(join(REPO, "packages", "assets-forge", "forge"), join(ADDON, "assets", "forge"), {
  recursive: true,
});

cpSync(join(REPO, "LICENSE"), join(ADDON, "LICENSE"));

writeFileSync(
  join(OUT, "README.md"),
  `# DiceForge for Godot

Deterministic dice for Godot 4 — the same seeds produce the same rolls here,
in the browser, and everywhere else DiceForge runs, verified bit-for-bit
against shared conformance vectors.

This bundle is the addon **and** the first-party dice in one install: unzip it
into your project (or install from the Asset Library) and roll.

\`\`\`gdscript
const Forge := preload("res://addons/diceforge/dice_forge.gd")
const Presenter := preload("res://addons/diceforge/presenter_3d.gd")

func _ready() -> void:
    var forge := Forge.seeded("table-42")
    var presenter := Presenter.new()
    add_child(presenter)
    presenter.configure()                     # bundled dice, zero setup
    await presenter.present_animated(forge.roll("2d20kh1+3"))
\`\`\`

Full notation support: \`4d6dl1\`, \`2d20kh1+3\`, \`d%\`, exploding \`!\`,
rerolls \`r\`/\`ro\`, any face count 2-1000, custom dice via \`d{name}\`, and
coin flips. Records are schema-versioned Dictionaries readable by every other
DiceForge platform.

Version ${version}. MIT licensed, art included (first-party, also MIT).
Source, conformance vectors and the rest of the SDK:
https://github.com/StephanTTM/DiceForgeSDK
`,
);
writeFileSync(join(OUT, "VERSION"), `${version}\n`);
cpSync(join(REPO, "LICENSE"), join(OUT, "LICENSE"));

console.log(`staged dist-godot/ at version ${version}`);

if (process.argv.includes("--zip")) {
  const zipName = `diceforge-godot-${version}.zip`;
  const zipPath = join(REPO, zipName);
  rmSync(zipPath, { force: true });
  if (process.platform === "win32") {
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}'`,
    ]);
  } else {
    execFileSync("zip", ["-qr", zipPath, "."], { cwd: OUT });
  }
  console.log(`wrote ${zipName}`);
}
