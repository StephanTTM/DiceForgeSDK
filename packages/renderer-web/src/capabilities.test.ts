// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createAnnouncer } from "./announce.js";
import {
  detectWebGL,
  prefersReducedMotion,
  resolveMotion,
  resolveRenderMode,
} from "./capabilities.js";

describe("render mode resolution", () => {
  it("honors explicit preferences without probing the platform", () => {
    expect(resolveRenderMode("webgl")).toBe("webgl");
    expect(resolveRenderMode("dom")).toBe("dom");
  });

  it("falls back to DOM when WebGL is unavailable (as in jsdom)", () => {
    expect(detectWebGL()).toBe(false);
    expect(resolveRenderMode("auto")).toBe("dom");
  });
});

describe("motion resolution", () => {
  it("resolves auto via the platform's reduced-motion preference", () => {
    const reducing = { matchMedia: () => ({ matches: true }) };
    const animating = { matchMedia: () => ({ matches: false }) };
    expect(resolveMotion("auto", reducing)).toBe("reduce");
    expect(resolveMotion("auto", animating)).toBe("animate");
  });

  it("lets explicit preferences override the platform", () => {
    const reducing = { matchMedia: () => ({ matches: true }) };
    const animating = { matchMedia: () => ({ matches: false }) };
    expect(resolveMotion("animate", reducing)).toBe("animate");
    expect(resolveMotion("reduce", animating)).toBe("reduce");
  });

  it("treats a missing matchMedia as no reduced-motion request", () => {
    expect(prefersReducedMotion({})).toBe(false);
    expect(resolveMotion("auto", {})).toBe("animate");
  });
});

describe("createAnnouncer", () => {
  it("creates a polite aria-live region, updates it, and cleans up", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const announcer = createAnnouncer(container);
    const region = container.querySelector('[data-diceforge="announcer"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.getAttribute("role")).toBe("status");
    announcer.announce("Total 22.");
    expect(region?.textContent).toBe("Total 22.");
    announcer.dispose();
    expect(container.querySelector('[data-diceforge="announcer"]')).toBeNull();
    container.remove();
  });
});
