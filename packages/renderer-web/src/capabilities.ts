export type RenderMode = "webgl" | "dom";
export type RenderModePreference = "auto" | RenderMode;
export type MotionMode = "animate" | "reduce";
export type MotionPreference = "auto" | MotionMode;

type MatchMediaHost = {
  matchMedia?: (query: string) => { matches: boolean };
};

/** True when the environment can create a WebGL or WebGL2 context. */
export function detectWebGL(doc: Document = document): boolean {
  try {
    const canvas = doc.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Resolves the configured render mode, falling back to DOM without WebGL. */
export function resolveRenderMode(
  preference: RenderModePreference,
  doc: Document = document,
): RenderMode {
  if (preference === "webgl" || preference === "dom") return preference;
  return detectWebGL(doc) ? "webgl" : "dom";
}

/** True when the user asked the platform for reduced motion. */
export function prefersReducedMotion(host: MatchMediaHost = globalThis as MatchMediaHost): boolean {
  return host.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Resolves the configured motion preference against the platform setting. */
export function resolveMotion(
  preference: MotionPreference,
  host: MatchMediaHost = globalThis as MatchMediaHost,
): MotionMode {
  if (preference === "animate" || preference === "reduce") return preference;
  return prefersReducedMotion(host) ? "reduce" : "animate";
}
