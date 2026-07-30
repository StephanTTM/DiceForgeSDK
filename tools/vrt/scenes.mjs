/**
 * Scenes the visual regression suite captures.
 *
 * Each one is a fixed seed through the real presenter, so the picture is a pure
 * function of the renderer and the assets. They are chosen to cover the things
 * that have actually broken before: face orientation, per-theme texturing, the
 * dropped-die reveal, relative die sizes, the percentile pair, the coin, and
 * the DOM fallback.
 */
export const scenes = [
  {
    name: "set-every-shape",
    why: "relative die sizes and per-shape face orientation",
    query: { theme: "ivory", notation: "1d4+1d6+1d8+1d10+1d12+1d20", seed: "zz", w: 880, h: 340 },
  },
  {
    name: "d20-pair",
    why: "the most-used die, and the numeral yaw that keeps it upright",
    query: { theme: "green", notation: "2d20", seed: "table-42", w: 520, h: 340 },
  },
  {
    name: "dropped-dice",
    why: "keep/drop styling: dropped dice dim and shrink but stay opaque",
    query: { theme: "red", notation: "5d20kh2", seed: "table-42", w: 640, h: 340 },
  },
  {
    name: "percentile-pair",
    why: "the tens die must read 00-90, not repeat the units atlas",
    query: { theme: "blue", notation: "1d100", seed: "q7", w: 480, h: 340 },
  },
  {
    name: "coin-heads",
    why: "the themed coin's two independently textured faces",
    query: { theme: "yellow", flip: "1", seed: "flip", w: 420, h: 340 },
  },
  {
    name: "recovers-3d-after-tiles",
    why: "a roll the models cannot cover falls back to tiles; the next one must return to 3D",
    query: { theme: "green", first: "1d3", notation: "2d20", seed: "table-42", w: 520, h: 340 },
  },
  {
    name: "d4-angled-view",
    why: "an all-d4 roll gets the lower camera those dice are read from",
    query: { theme: "ivory", notation: "3d4", seed: "zz", w: 560, h: 340 },
  },
  {
    name: "many-dice-wrap",
    why: "layout wrapping and automatic camera framing",
    query: { theme: "blue", notation: "8d6", seed: "zz", w: 760, h: 360 },
  },
  {
    name: "physics-d20-pair",
    why: "a simulated roll lands on the recorded faces, not on whatever physics chose",
    query: {
      physics: "1",
      theme: "green",
      notation: "2d20",
      seed: "table-42",
      throw: "pair",
      w: 520,
      h: 340,
    },
  },
  {
    name: "physics-handful",
    why: "the fixed dice area holds a handful without the camera moving to fit them",
    query: {
      physics: "1",
      theme: "ivory",
      notation: "5d6",
      seed: "zz",
      throw: "handful",
      w: 760,
      h: 340,
    },
  },
  {
    name: "physics-dropped",
    why: "the dropped-die reveal survives the physics path, and stays opaque",
    query: {
      physics: "1",
      theme: "red",
      notation: "4d6dl1",
      seed: "table-42",
      throw: "dropped",
      w: 640,
      h: 340,
    },
  },
  {
    name: "physics-delegates-unmodelled",
    why: "a die physics cannot model falls to tiles rather than being faked",
    query: { physics: "1", theme: "blue", notation: "3d3", seed: "q7", w: 520, h: 340 },
  },
  {
    name: "physics-coin",
    why: "a physics coin lands flat on the recorded outcome, in the same tray as the dice",
    query: {
      physics: "1",
      theme: "yellow",
      flip: "1",
      seed: "table-42",
      throw: "coin",
      w: 520,
      h: 340,
    },
  },
  {
    name: "reroll-collapses",
    why: "a rerolled value must not linger on the settled stage as a dropped-looking die",
    query: { theme: "green", notation: "5d6r2", seed: "reroll-1", w: 640, h: 340 },
  },
  {
    name: "explosion-keeps-seats",
    why: "explosion-born dice take their own seats, so the settled stage sums to the total",
    query: { theme: "yellow", notation: "4d6!", seed: "godot", w: 760, h: 340 },
  },
  {
    name: "physics-explosion-stage",
    why: "the physics stage also ends with every earned die on the table",
    query: {
      physics: "1",
      theme: "yellow",
      notation: "4d6!",
      seed: "godot",
      // Chosen from a seed sweep: every die fully inside the frame.
      throw: "boom-2",
      w: 760,
      h: 340,
    },
  },
  {
    name: "dom-fallback",
    why: "the no-theme path: labelled tiles, including a dropped die",
    query: { notation: "4d6dl1", seed: "table-42", render: "dom", w: 520, h: 240 },
  },
];

/** Devtools URL for a scene, relative to the dev server root. */
export function sceneUrl(scene) {
  const params = new URLSearchParams({ preview: "1" });
  for (const [key, value] of Object.entries(scene.query)) params.set(key, String(value));
  return `/devtools.html?${params}`;
}
