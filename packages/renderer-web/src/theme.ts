import type { ShapedDieSides } from "./math/geometry.js";

/** Quaternion as [x, y, z, w]. */
export type QuaternionTuple = readonly [number, number, number, number];

/**
 * Optional 3D model set for a theme. Models are loaded lazily at presentation
 * time and are never bundled with the npm package; shapes without a model —
 * or without a complete face-rotation table — always fall back to the
 * built-in procedural dice so resolved outcomes stay trustworthy.
 */
export type DieModelSet = {
  /** glTF URL per die shape. */
  readonly urls: Partial<Record<ShapedDieSides, string>>;
  /**
   * Calibrated orientation table per shape: `faceRotations[shape][value - 1]`
   * rotates the normalized model so that face value points up (+Y). A model
   * is used only when its shape's table has exactly `shape` entries.
   */
  readonly faceRotations: Partial<Record<ShapedDieSides, readonly QuaternionTuple[]>>;
};

export type DiceTheme = {
  readonly name: string;
  /** Colors for procedural dice, the DOM fallback, and demo chrome. */
  readonly colors: { readonly die: string; readonly label: string };
  readonly models?: DieModelSet;
};

/** True when `shape` may be presented with a theme model (URL + full table). */
export function hasCalibratedModel(
  models: DieModelSet | undefined,
  shape: ShapedDieSides,
): models is DieModelSet {
  return Boolean(models?.urls[shape] && models.faceRotations[shape]?.length === shape);
}

export type KayKitColor = "red" | "blue" | "green" | "yellow";

export const KAYKIT_COLORS: readonly KayKitColor[] = ["red", "blue", "green", "yellow"];

const KAYKIT_ACCENTS: Record<KayKitColor, { die: string; label: string }> = {
  red: { die: "#a63c3c", label: "#f6ecec" },
  blue: { die: "#3c5aa6", label: "#ecf0f6" },
  green: { die: "#3c7a4c", label: "#ecf4ee" },
  yellow: { die: "#b9862e", label: "#f9f3e6" },
};

/** Quarter-turn quaternion component. */
const Q = Math.SQRT1_2;

/**
 * Face-up rotation tables for the KayKit Board Game Bits dice (CC0, Kay
 * Lousberg), calibrated against the normalized models: entry `value - 1`
 * orients the die so that value reads upward. All colors share geometry, so
 * one table serves every color. See assets/LICENSES.md.
 *
 * Regenerate with the maintainer tool at examples/web-demo/calibrate.html
 * (`?shape=20&verify=1` re-renders straight from this table to prove it).
 */
export const KAYKIT_FACE_ROTATIONS: Partial<Record<ShapedDieSides, readonly QuaternionTuple[]>> = {
  4: [
    [0, 1, 0, 0],
    [0.816497, 0, 0, -0.57735],
    [0.816497, -0.5, 0, 0.288675],
    [0.816497, 0.5, 0, 0.288675],
  ],
  // The cube's rotations are exact quarter and half turns, so its components are
  // ±1/√2 rather than captured decimals. Faces 2-4 carry an extra half turn
  // about Y so their numerals read upright.
  6: [
    [-Q, 0, 0, Q],
    [-1, 0, 0, 0],
    [-Q, Q, 0, 0],
    [Q, Q, 0, 0],
    [0, 0, 0, 1],
    [Q, 0, 0, Q],
  ],
  8: [
    [-0.325058, 0, -0.325058, 0.888074],
    [-0.627963, 0, 0.627963, 0.459701],
    [-0.325058, 0, 0.325058, 0.888074],
    [-0.627963, 0, -0.627963, 0.459701],
    [0.325058, 0, 0.325058, 0.888074],
    [0.627963, 0, -0.627963, 0.459701],
    [0.325058, 0, -0.325058, 0.888074],
    [0.627963, 0, 0.627963, 0.459701],
  ],
  20: [
    [-0.770582, 0, 0, 0.637341],
    [0.623414, 0, -0.452937, 0.637341],
    [-0.25923, 0, 0.188342, 0.947274],
    [0.76636, 0, 0.556793, 0.320426],
    [-0.292724, 0, -0.900911, 0.320426],
    [0.196949, 0, 0.606147, 0.770582],
    [-0.51562, 0, -0.37462, 0.770582],
    [0.320426, 0, 0, 0.947274],
    [-0.238123, 0, 0.732867, 0.637341],
    [0.099017, 0, -0.304743, 0.947274],
    [-0.292724, 0, 0.900911, 0.320426],
    [0.196949, 0, -0.606147, 0.770582],
    [-0.947274, 0, 0, 0.320426],
    [0.623414, 0, 0.452937, 0.637341],
    [-0.238123, 0, -0.732867, 0.637341],
    [0.099017, 0, 0.304743, 0.947274],
    [-0.25923, 0, -0.188342, 0.947274],
    [0.76636, 0, -0.556794, 0.320426],
    [-0.51562, 0, 0.37462, 0.770582],
    [0.637341, 0, 0, 0.770582],
  ],
};

/**
 * Built-in theme for the KayKit dice models (d4, d6, d8, d20; other shapes
 * render procedurally in the theme's colors). `baseUrl` is wherever the
 * assets directory is served from, e.g. "/": the files themselves stay out
 * of the npm package.
 */
export function kayKitTheme(options: { baseUrl: string; color?: KayKitColor }): DiceTheme {
  const color = options.color ?? "red";
  const base = options.baseUrl.replace(/\/+$/, "");
  return {
    name: `kaykit-${color}`,
    colors: KAYKIT_ACCENTS[color],
    models: {
      urls: {
        4: `${base}/D4_${color}.gltf`,
        6: `${base}/D6_C_${color}.gltf`,
        8: `${base}/D8_${color}.gltf`,
        20: `${base}/D20_${color}.gltf`,
      },
      faceRotations: KAYKIT_FACE_ROTATIONS,
    },
  };
}
